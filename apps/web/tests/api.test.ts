/**
 * Smoke tests for the API route handlers, hermetic: the routes' own engine construction (lib/engine.ts)
 * is pointed at mock mode + a temp data dir via env BEFORE any route module is imported, so the whole
 * stack runs on MockLLM and a throwaway FileStore. One project flows through create → cards → answer →
 * continue → story-correct, mirroring a real session.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dataDir = mkdtempSync(path.join(tmpdir(), "zadum-web-test-"));
process.env.ZADUM_MOCK = "1";
process.env.ZADUM_DATA_DIR = dataDir;
delete process.env.DATABASE_URL; // never let a configured Postgres leak into the test store

// Import routes only after env is pinned (lib/engine reads env lazily, but keep the order airtight).
const routes = {
  projects: () => import("@/app/api/projects/route"),
  project: () => import("@/app/api/projects/[id]/route"),
  start: () => import("@/app/api/projects/[id]/cards/start/route"),
  answer: () => import("@/app/api/projects/[id]/cards/answer/route"),
  cont: () => import("@/app/api/projects/[id]/cards/continue/route"),
  story: () => import("@/app/api/projects/[id]/story/route"),
  storyCorrect: () => import("@/app/api/projects/[id]/story/correct/route"),
  finish: () => import("@/app/api/projects/[id]/cards/finish/route"),
  compile: () => import("@/app/api/projects/[id]/compile/route"),
  verification: () => import("@/app/api/projects/[id]/verification/route"),
  verificationAnswer: () => import("@/app/api/projects/[id]/verification/answer/route"),
  gaps: () => import("@/app/api/projects/[id]/gaps/route"),
  evidence: () => import("@/app/api/projects/[id]/evidence/route"),
  acceptDefaults: () => import("@/app/api/projects/[id]/defaults/accept/route"),
  spec: () => import("@/app/api/projects/[id]/spec/route"),
  specRefine: () => import("@/app/api/projects/[id]/spec/refine/route"),
  specDownload: () => import("@/app/api/projects/[id]/spec/download/route"),
};

function req(body?: unknown): Request {
  return new Request("http://test.local/api", { method: "POST", ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }) });
}

/** A GET whose query string the handler reads (`?max=…`). */
function getReq(query = ""): Request {
  return new Request(`http://test.local/api${query}`);
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function json(res: Response): Promise<any> {
  return (await res.json()) as any;
}

let id = "";

beforeAll(async () => {
  const { POST } = await routes.projects();
  const res = await POST(req({ one_liner: "an invoicing app for small bookkeeping firms" }));
  expect(res.status).toBe(201);
  const body = await json(res);
  id = body.project.id;
  expect(body.sheet.decisions.length).toBeGreaterThan(0);
}, 60_000);

afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

describe("project state", () => {
  it("GET /api/projects/[id] returns the wire state with a curve array", async () => {
    const { GET } = await routes.project();
    const res = await GET(req(), params(id));
    expect(res.status).toBe(200);
    const s = await json(res);
    expect(s.project.id).toBe(id);
    expect(Array.isArray(s.curve)).toBe(true);
    expect(typeof s.session.settledness).toBe("number");
  });

  it("create rejects a missing one_liner", async () => {
    const { POST } = await routes.projects();
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });
});

describe("card loop", () => {
  it("start deals a card with settledness and top values", async () => {
    const { POST } = await routes.start();
    const res = await POST(req(), params(id));
    expect(res.status).toBe(200);
    const { deal, state } = await json(res);
    expect(["card", "stop"]).toContain(deal.kind);
    expect(typeof deal.settledness).toBe("number");
    if (deal.kind === "card") {
      expect(deal.card.options.length).toBeGreaterThan(0);
      expect(Array.isArray(deal.top)).toBe(true);
    }
    expect(state.session.phase).toBe("cards");
  });

  it("answering the pending card returns implications, the next deal, and a grown curve", async () => {
    const { GET } = await routes.project();
    const s = await json(await GET(req(), params(id)));
    expect(s.card?.kind).toBe("card");
    const optionId = s.card.card.options[0].option_id;
    const { POST } = await routes.answer();
    const res = await POST(req({ kind: "option", option_id: optionId, think_ms: 500 }), params(id));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(["card", "stop"]).toContain(body.next.kind);
    expect(body.state.curve.length).toBeGreaterThan(0);
    const answered = body.state.curve.filter((p: any) => p.answered);
    expect(answered.length).toBeGreaterThan(0);
    expect(typeof answered[0].share).toBe("number");
    expect(typeof answered[0].topic).toBe("string");
  });

  it("POST /cards/continue responds with a deal (pending card or a fresh one past θ)", async () => {
    const { POST } = await routes.cont();
    const res = await POST(req(), params(id));
    expect(res.status).toBe(200);
    const { deal, state } = await json(res);
    expect(["card", "stop"]).toContain(deal.kind);
    expect(state.project.id).toBe(id);
  });

  it("answer validates its body", async () => {
    const { POST } = await routes.answer();
    expect((await POST(req({ kind: "nonsense" }), params(id))).status).toBe(400);
    expect((await POST(req({ kind: "option" }), params(id))).status).toBe(400);
  });
});

describe("story walkthrough", () => {
  it("GET /story is 404 before the spec compiles", async () => {
    const { GET } = await routes.story();
    const res = await GET(req(), params(id));
    expect(res.status).toBe(404);
  });

  it("POST /story/correct applies a plain-English correction like an edit", async () => {
    const { POST } = await routes.storyCorrect();
    const res = await POST(req({ text: "Clients also get a reminder email three days before an invoice is due." }), params(id));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(typeof body.version).toBe("number");
    expect(typeof body.applied).toBe("number");
    expect(typeof body.notes).toBe("string");
    expect(body.implied).toHaveProperty("hard");
    expect(body.state.project.id).toBe(id);
  });

  it("POST /story/correct requires text", async () => {
    const { POST } = await routes.storyCorrect();
    const res = await POST(req({}), params(id));
    expect(res.status).toBe(400);
  });
});

/**
 * The three engine capabilities the web app gained: story checks over the assumptions, spec-gap mining, and
 * evidence absorption. Run against their own project so the card-loop tests above are not disturbed: it goes
 * straight from the draft to `finish` (a 0-card session — every decision assumed), which is exactly the state
 * the story-check panel is built for.
 */
describe("story checks, spec gaps, evidence", () => {
  let vid = "";
  let probeId = "";

  beforeAll(async () => {
    const { POST } = await routes.projects();
    const body = await json(await POST(req({ one_liner: "an invoicing app for small bookkeeping firms" })));
    vid = body.project.id;
    const finish = await routes.finish();
    const res = await finish.POST(req(), params(vid));
    expect(res.status).toBe(200);
    expect((await json(res)).defaults.length).toBeGreaterThan(0);
  }, 60_000);

  it("project state reports how many assumptions a story check could cover", async () => {
    const { GET } = await routes.project();
    const s = await json(await GET(req(), params(vid)));
    expect(s.verification.checkable).toBeGreaterThan(0);
    expect(typeof s.verification.pending).toBe("number");
  });

  it("GET /verification composes scenarios over the assumed decisions", async () => {
    const { GET } = await routes.verification();
    const res = await GET(getReq("?max=3"), params(vid));
    expect(res.status).toBe(200);
    const { probes } = await json(res);
    expect(probes.length).toBeGreaterThan(0);
    const p = probes[0];
    expect(typeof p.scenario).toBe("string");
    expect(p.scenario.length).toBeGreaterThan(0);
    expect(p.p_all_correct).toBeGreaterThan(0);
    expect(p.nodes.length).toBeGreaterThan(0);
    expect(typeof p.nodes[0].question).toBe("string");
    expect(typeof p.nodes[0].answer_label).toBe("string");
    probeId = p.id;
  });

  it("answering \"that's right\" confirms the bundled assumptions", async () => {
    const { POST } = await routes.verificationAnswer();
    const res = await POST(req({ probe_id: probeId, ok: true }), params(vid));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(typeof body.sheet_version).toBe("number");
    expect(Array.isArray(body.confirmed)).toBe(true);
    expect(body.confirmed.length).toBeGreaterThan(0);
    expect(typeof body.confirmed[0].topic).toBe("string");
    expect(body.defaults.length).toBeGreaterThan(0);
  });

  it("pointing at the wrong part resolves that decision to the user's option", async () => {
    const verification = await routes.verification();
    const { probes } = await json(await verification.GET(getReq(), params(vid)));
    expect(probes.length).toBeGreaterThan(0);
    const probe = probes[0];
    const wrong = probe.nodes[0];

    const project = await routes.project();
    const state = await json(await project.GET(req(), params(vid)));
    const decision = state.sheet.decisions.find((d: any) => d.id === wrong.node_id);
    const other = decision.options.find((o: any) => o.id !== decision.chosen) ?? decision.options[0];

    const answer = await routes.verificationAnswer();
    const res = await answer.POST(req({ probe_id: probe.id, ok: false, correction: { node_id: wrong.node_id, option_id: other.id } }), params(vid));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.implied).toHaveProperty("hard");
    const after = await json(await project.GET(req(), params(vid)));
    const corrected = after.sheet.decisions.find((d: any) => d.id === wrong.node_id);
    expect(corrected.status).toBe("resolved");
    expect(corrected.chosen).toBe(other.id);
  });

  it("verification answers validate their body", async () => {
    const { POST } = await routes.verificationAnswer();
    expect((await POST(req({ ok: true }), params(vid))).status).toBe(400); // no probe_id
    expect((await POST(req({ probe_id: probeId }), params(vid))).status).toBe(400); // no verdict
    expect((await POST(req({ probe_id: "no_such_probe", ok: true }), params(vid))).status).toBe(400);
    expect((await POST(req({ probe_id: probeId, ok: true, correction: { node_id: "x", option_id: "y" } }), params(vid))).status).toBe(400);
  });

  it("POST /evidence reports what moved, labelled through the Sheet", async () => {
    const { POST } = await routes.evidence();
    const res = await POST(req({ text: "Attached: INVOICE #1043 — Net 30, late fee 1.5%/mo, paid by bank transfer." }), params(vid));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(Array.isArray(body.shifts)).toBe(true);
    expect(typeof body.ess_before).toBe("number");
    expect(typeof body.ess_after).toBe("number");
    expect(body.state.project.id).toBe(vid);
    for (const s of body.shifts) {
      expect(typeof s.topic).toBe("string");
      expect(typeof s.to).toBe("string");
    }
  });

  it("POST /evidence requires text", async () => {
    const { POST } = await routes.evidence();
    expect((await POST(req({}), params(vid))).status).toBe(400);
  });

  it("GET /gaps is 400 before the spec compiles, then lists candidate questions", async () => {
    const gaps = await routes.gaps();
    expect((await gaps.GET(getReq(), params(vid))).status).toBe(400);

    // The story-check tests above resolved decisions, which can reopen a stale gated child (ADR-037), and
    // compile refuses an unfinished ledger (ADR-036). Accepting the review is the real flow's next step and
    // re-defaults anything reopened, so this mirrors the product rather than working around the gate.
    const accept = await routes.acceptDefaults();
    expect((await accept.POST(req({}), params(vid))).status).toBe(200);
    const compile = await routes.compile();
    const compiled = await compile.POST(req({}), params(vid));
    expect(compiled.status, await compiled.clone().text()).toBe(200);

    const res = await gaps.GET(getReq("?max=4"), params(vid));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.gaps.length).toBeGreaterThan(0);
    expect(body.candidates.length).toBeGreaterThan(0);
    expect(body.applied).toEqual([]);
    const c = body.candidates[0];
    expect(typeof c.question).toBe("string");
    expect(c.options.length).toBeGreaterThanOrEqual(2);
    expect(typeof c.rationale).toBe("string");
  }, 120_000);

  it("POST /gaps adds the top N as open decisions and reopens the card loop", async () => {
    const gaps = await routes.gaps();
    const res = await gaps.POST(req({ apply: 1 }), params(vid));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.applied.length).toBe(1);
    const project = await routes.project();
    const state = await json(await project.GET(req(), params(vid)));
    expect(state.session.phase).toBe("cards");
    expect(state.sheet.decisions.some((d: any) => d.id === body.applied[0] && d.status === "open")).toBe(true);
  }, 120_000);

  it("POST /gaps validates apply", async () => {
    const gaps = await routes.gaps();
    expect((await gaps.POST(req({}), params(vid))).status).toBe(400);
    expect((await gaps.POST(req({ apply: 0 }), params(vid))).status).toBe(400);
    expect((await gaps.POST(req({ apply: "two" }), params(vid))).status).toBe(400);
  });
});

/**
 * The mock's `world_likelihoods` handler is deliberately neutral, so a mocked evidence call can never produce
 * a non-empty shift list — the labelling the evidence box reads is covered directly instead.
 */
describe("evidence shift labels", () => {
  it("maps node/option ids to topics and option labels, falling back to the raw id", async () => {
    const { labelShifts } = await import("@/lib/state");
    const sheet = { decisions: [{ id: "reminders", topic: "payment reminders", options: [{ id: "auto", label: "Sent automatically" }, { id: "manual", label: "Sent by hand" }] }] } as any;
    const out = labelShifts(sheet, [
      { node: "reminders", from: "manual", to: "auto", p_from: 0.4, p_to: 0.7 },
      { node: "unknown_node", from: "a", to: "b", p_from: 0.3, p_to: 0.6 },
    ]);
    expect(out[0]).toMatchObject({ topic: "payment reminders", from: "Sent by hand", to: "Sent automatically" });
    expect(out[1]).toMatchObject({ topic: "unknown_node", from: "a", to: "b" });
  });
});

/**
 * The spec workspace (/p/[id]/spec): read the compiled spec, download it, and push feedback back through the
 * Sheet. Its own project, taken straight from the draft to `finish` and compiled, so the routes are exercised
 * on a real bundle rather than a fixture.
 */
describe("spec workspace", () => {
  let sid = "";

  beforeAll(async () => {
    const { POST } = await routes.projects();
    const body = await json(await POST(req({ one_liner: "a booking app for a hair salon" })));
    sid = body.project.id;
  }, 60_000);

  it("GET /spec before a compile is an ordinary empty state, not an error", async () => {
    const { GET } = await routes.spec();
    const res = await GET(req(), params(sid));
    expect(res.status).toBe(200);
    const b = await json(res);
    expect(b.has_spec).toBe(false);
    expect(b.markdown).toBe("");
    expect(b.critic).toBeNull();
    expect(b.compiled_version).toBeNull();
    expect(b.stale).toBe(false);
    expect(typeof b.sheet_version).toBe("number");
  });

  it("after a compile it returns the markdown, the bundle, the critic verdict, and no staleness", async () => {
    const finish = await routes.finish();
    expect((await finish.POST(req(), params(sid))).status).toBe(200);
    const compile = await routes.compile();
    expect((await compile.POST(req({}), params(sid))).status).toBe(200);

    const { GET } = await routes.spec();
    const b = await json(await GET(req(), params(sid)));
    expect(b.has_spec).toBe(true);
    expect(b.markdown).toContain("# Specification");
    expect(b.artifacts).toContain("spec.md");
    expect(b.artifacts).toContain("compile-report.json");
    expect(typeof b.critic.verdict).toBe("string");
    expect(typeof b.critic.score).toBe("number");
    expect(b.compiled_version).toBe(b.sheet_version);
    expect(b.stale).toBe(false);
  }, 120_000);

  it("GET /spec/download hands over the artifact as a named file, and 404s an unknown name", async () => {
    const { GET } = await routes.specDownload();
    const res = await GET(getReq("?name=spec.md"), params(sid));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");
    const cd = res.headers.get("content-disposition") ?? "";
    expect(cd.startsWith("attachment;")).toBe(true);
    expect(cd).toContain("-spec.md");
    expect(await res.text()).toContain("# Specification");

    expect((await GET(getReq(), params(sid))).status).toBe(200); // spec.md is the default
    expect((await GET(getReq("?name=nope.md"), params(sid))).status).toBe(404);
    expect((await GET(getReq("?name=../../etc/passwd"), params(sid))).status).toBe(404);
  });

  it("POST /spec/refine validates its body", async () => {
    const { POST } = await routes.specRefine();
    expect((await POST(req({}), params(sid))).status).toBe(400); // nothing to act on
    expect((await POST(req({ comments: [{}] }), params(sid))).status).toBe(400); // a comment needs text
    expect((await POST(req({ comments: "later" }), params(sid))).status).toBe(400);
  });

  it("POST /spec/refine returns what it understood plus either a new spec or a reason it is blocked", async () => {
    const { POST } = await routes.specRefine();
    const res = await POST(req({ comments: [{ quote: "A client never sees another client's booking", text: "stylists should see every booking, not just their own" }] }), params(sid));
    expect(res.status).toBe(200);
    const b = await json(res);
    for (const k of ["wrong_assumptions", "missing_elements", "confirmed_elements", "new_questions"]) expect(Array.isArray(b.extraction[k])).toBe(true);
    expect(typeof b.version).toBe("number");
    expect(Array.isArray(b.reopened)).toBe(true);
    expect(Array.isArray(b.added_decisions)).toBe(true);
    expect(Array.isArray(b.rejected)).toBe(true);
    // either it recompiled, or the ledger gate refused and said why — never a lost edit
    if (b.recompiled) expect(b.recompiled.markdown).toContain("# Specification");
    else expect(typeof b.blocked).toBe("string");
  }, 180_000);
});

/**
 * The in-repo markdown renderer the spec workspace reads through. Rendered to static markup here rather than
 * mounted: what matters is the tree it produces from what our compiler actually emits — sheet-echo comments
 * stripped, GFM tables (including the trailing ⟨src: …⟩ our rows carry past the last pipe), compile banners
 * toned, trace markers as chips, and no route from LLM text to executable markup.
 */
describe("markdown renderer", () => {
  async function render(md: string, showTraces = true): Promise<string> {
    const [{ renderToStaticMarkup }, { createElement }, { Markdown }] = await Promise.all([import("react-dom/server"), import("react"), import("@/components/Markdown")]);
    return renderToStaticMarkup(createElement(Markdown, { text: md, showTraces }));
  }

  it("renders headings with stable anchors, tables, banners and trace chips", async () => {
    const html = await render(
      [
        "> ⚠️ **DRAFT — THIS SPEC DID NOT PASS REVIEW.** 1 violation.",
        "",
        "# Specification — an invoicing app",
        "<!-- sheet-echo overview",
        "ACTORS: secret bookkeeping",
        "-->",
        "## Overview",
        "",
        "| Actor | Action | Object |",
        "|---|---|---|",
        "| Bookkeeper | creates | Invoice | ⟨src: a:a1⟩",
        "",
        "## Overview",
        "- top",
        "  - nested",
        "",
        "See `spec.md` and [the sheet](https://example.com/s).",
      ].join("\n"),
    );
    expect(html).toContain('<h1 id="specification-an-invoicing-app">');
    expect(html).toContain('<h2 id="overview">');
    expect(html).toContain('<h2 id="overview-1">'); // duplicate titles still get distinct anchors
    expect(html).toContain('<blockquote data-tone="danger">');
    expect(html).toContain("<th>Actor</th>");
    expect(html).toContain("<td>Invoice"); // the trailing trace joins the last cell instead of breaking the row
    expect(html).toContain("data-trace");
    expect(html).toContain("<ul><li>top<ul><li>nested</li></ul></li></ul>");
    expect(html).toContain("<code>spec.md</code>");
    expect(html).toContain('<a href="https://example.com/s"');
    expect(html).not.toContain("sheet-echo"); // machine bookkeeping never reaches the reader
    expect(html).not.toContain("secret bookkeeping");
  });

  it("hides trace markers when asked, and never emits an unsafe href", async () => {
    expect(await render("A rule. ⟨src: r:r1⟩", false)).not.toContain("data-trace");
    const html = await render("[click](javascript:alert(1))");
    expect(html).not.toContain("<a "); // no anchor at all — the markdown is left standing as literal text
    expect(html).not.toContain("href=");
    expect(html).toContain("[click](javascript:alert(1))");
  });

  it("lists the headings a table of contents is built from", async () => {
    const { headings } = await import("@/components/Markdown");
    const h = headings(["# Spec", "## Rules & invariants", "### Detail", "```", "## not a heading",  "```"].join("\n"));
    expect(h.map((x) => x.level)).toEqual([1, 2, 3]);
    expect(h[1]).toMatchObject({ text: "Rules & invariants", id: "rules-invariants" });
  });
});

describe("story.md parsing", () => {
  it("parses title, steps, and confirm checks from the artifact format", async () => {
    const { parseStory } = await import("@/lib/story");
    const md = ["# A Tuesday at the firm", "", "1. Dana opens the app.", "2. She drafts an invoice.", "", "## Please confirm", "- Only the owner can void an invoice.", "- Clients see only their own invoices.", ""].join("\n");
    const s = parseStory(md);
    expect(s.title).toBe("A Tuesday at the firm");
    expect(s.steps).toEqual(["Dana opens the app.", "She drafts an invoice."]);
    expect(s.checks).toHaveLength(2);
  });
});
