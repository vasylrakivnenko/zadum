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
};

function req(body?: unknown): Request {
  return new Request("http://test.local/api", { method: "POST", ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }) });
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
