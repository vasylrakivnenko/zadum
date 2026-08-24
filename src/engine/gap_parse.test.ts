import { describe, it, expect } from "vitest";
import { MockLLM } from "../llm/client.js";
import { SheetSchema, type Sheet } from "../core/sheet.js";
import {
  parseSpecGaps,
  proposeGapDecisions,
  gapMockHandlers,
  mockGapDecisions,
  renderGapsForPrompt,
  GAPS_MARKER,
  GapDecisionsOutSchema,
  type SpecGap,
} from "./gap_parse.js";

// ---------- fixtures ----------

const SPEC = [
  "# Specification — invoicing for a bookkeeping firm",
  "",
  "Intro line with a guess before any heading. ⟨src: default⟩",
  "",
  "## Overview",
  "",
  "An invoicing app for a bookkeeping firm. ⟨src: d:client_portal⟩",
  "Invoices are sent by email (default). ⟨src: default⟩",
  "",
  "## Data model",
  "",
  "### Invoice ⟨src: n:n1⟩",
  "- Soft delete only (default). ⟨src:default⟩",
  "- Number format INV-YYYY-#### (default). Numbers never repeat. ⟨src: default⟩",
  "| status | draft (default) | ⟨src: default⟩",
  "",
  "## Lifecycles (state machines)",
  "",
  "- Soft delete only (default). ⟨src:default⟩",
  "",
  "<!-- sheet-echo data_model",
  "RULES:",
  "- [r1] echoed rule that mentions ⟨src: default⟩ inside a comment",
  "-->",
  "<!-- inline comment with marker ⟨src: default⟩ --> after-comment guess here. ⟨src: default⟩",
  "",
  "Plain paragraph without markers.",
].join("\n");

function sheet(decisions: Sheet["decisions"] = []): Sheet {
  return SheetSchema.parse({
    project_id: "p1",
    version: 3,
    one_liner: "An invoicing app for a bookkeeping firm",
    archetypes: ["b2b-invoicing"],
    actors: [{ id: "p1", name: "Bookkeeper", source: "draft" }],
    nouns: [{ id: "n1", name: "Invoice", description: "a bill", fields_hint: ["amount"], example: "INV-1", source: "draft" }],
    actions: [{ id: "a1", actor: "p1", verb: "sends", object: "n1", source: "draft" }],
    rules: [{ id: "r1", text: "Clients only ever see their own invoices", kind: "access", source: "draft" }],
    non_goals: [{ id: "g1", text: "No online payments in v1", source: "draft" }],
    decisions,
  });
}

const decision = (id: string): Sheet["decisions"][number] => ({
  id,
  topic: "existing",
  question: "already tracked?",
  options: [
    { id: "yes", label: "Yes" },
    { id: "no", label: "No" },
  ],
  status: "open",
  consequence: 3,
  source: "draft",
});

// ---------- parseSpecGaps ----------

describe("parseSpecGaps", () => {
  const gaps = parseSpecGaps(SPEC);

  it("captures both marker spellings and tags each gap with the nearest ## heading", () => {
    const bySection = new Map(gaps.map((g) => [g.context, g.section]));
    expect(bySection.get("Invoices are sent by email (default).")).toBe("Overview");
    expect(bySection.get("Soft delete only (default).")).toBe("Data model"); // ⟨src:default⟩ spelling, first occurrence wins
    expect(bySection.get("Number format INV-YYYY-#### (default). Numbers never repeat.")).toBe("Data model");
  });

  it("uses section '' before the first ## heading, and ### is not a section", () => {
    expect(gaps.find((g) => g.context.startsWith("Intro line"))?.section).toBe("");
    // the gap under "### Invoice" still belongs to "## Data model"
    expect(gaps.find((g) => g.context === "Soft delete only (default).")?.section).toBe("Data model");
  });

  it("context is the containing sentence/bullet with trace markers stripped", () => {
    // a bullet is one item: multi-sentence bullets keep their whole body
    expect(gaps.some((g) => g.context === "Number format INV-YYYY-#### (default). Numbers never repeat.")).toBe(true);
    // prose: the marker follows the closing period, so the preceding sentence is the context
    expect(gaps.some((g) => g.context === "Invoices are sent by email (default).")).toBe(true);
    // table row: pipes stripped
    expect(gaps.some((g) => g.context === "status | draft (default)")).toBe(true);
    for (const g of gaps) expect(g.context).not.toMatch(/⟨src:/);
  });

  it("dedupes identical contexts across sections", () => {
    expect(gaps.filter((g) => g.context === "Soft delete only (default).")).toHaveLength(1);
  });

  it("ignores markers inside sheet-echo / HTML comments but not text after an inline comment", () => {
    expect(gaps.some((g) => g.context.includes("echoed rule"))).toBe(false);
    expect(gaps.some((g) => g.context === "after-comment guess here.")).toBe(true);
  });

  it("returns nothing for a spec without markers", () => {
    expect(parseSpecGaps("## A\n\nAll derived. ⟨src: r:r1⟩\n")).toEqual([]);
  });
});

// ---------- proposeGapDecisions (mock round-trip) ----------

const GAPS: SpecGap[] = [
  { section: "Overview", line: "x", context: "Invoices are sent by email (default)." },
  { section: "Data model", line: "y", context: "Soft delete only (default)." },
  { section: "", line: "z", context: "Intro line with a guess before any heading." },
];

describe("proposeGapDecisions", () => {
  it("round-trips through MockLLM: candidates parse, ids are xg_-prefixed, options 2–4, consequence 1–5", async () => {
    const llm = new MockLLM(gapMockHandlers);
    const res = await proposeGapDecisions(llm, sheet(), GAPS);
    expect(res.model).toBe("mock-strong");
    expect(res.candidates.length).toBe(3);
    for (const c of res.candidates) {
      expect(c.id).toMatch(/^xg_[a-z0-9_]+$/);
      expect(c.options.length).toBeGreaterThanOrEqual(2);
      expect(c.options.length).toBeLessThanOrEqual(4);
      expect(c.consequence).toBeGreaterThanOrEqual(1);
      expect(c.consequence).toBeLessThanOrEqual(5);
      expect(c.rationale.length).toBeGreaterThan(0);
    }
    expect(res.candidates.map((c) => c.section)).toContain("Overview");
    // the mock read the gaps from the same rendered prompt the real model would see
    expect(llm.calls[0]!.user).toContain(GAPS_MARKER + renderGapsForPrompt(GAPS));
  });

  it("filters candidates whose id collides with an existing sheet decision id", async () => {
    const llm = new MockLLM(gapMockHandlers);
    const probe = await proposeGapDecisions(llm, sheet(), GAPS);
    const collidingId = probe.candidates[0]!.id;
    const res = await proposeGapDecisions(new MockLLM(gapMockHandlers), sheet([decision(collidingId)]), GAPS);
    expect(res.candidates.map((c) => c.id)).not.toContain(collidingId);
    expect(res.candidates.length).toBe(probe.candidates.length - 1);
  });

  it("clamps to opts.max and drops duplicate candidate ids", async () => {
    const names = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta"];
    const many: SpecGap[] = names.map((n) => ({ section: "S", line: "l", context: `Widget guess ${n} differs.` }));
    const res = await proposeGapDecisions(new MockLLM(gapMockHandlers), sheet(), many, { max: 2 });
    expect(res.candidates).toHaveLength(2);
    // identical contexts → identical mock ids → deduped
    const dup: SpecGap[] = [
      { section: "A", line: "l", context: "Same guess text here." },
      { section: "B", line: "l", context: "Same guess text here." },
    ];
    const res2 = await proposeGapDecisions(new MockLLM(gapMockHandlers), sheet(), dup);
    expect(res2.candidates).toHaveLength(1);
  });

  it("forces the xg_ prefix, drops <2-option and unsalvageable candidates", async () => {
    const llm = new MockLLM({
      gap_decisions: () => ({
        candidates: [
          { id: "Email Cadence", topic: "t", question: "q", options: [{ id: "A", label: "a" }, { id: "b", label: "b" }, { id: "a", label: "dup of A" }], consequence: 9, rationale: "r", section: "s" },
          { id: "xg_one_option", topic: "t", question: "q", options: [{ id: "only", label: "one" }], consequence: 0, rationale: "r", section: "s" },
          { id: "  ", topic: "t", question: "q", options: [{ id: "a", label: "a" }, { id: "b", label: "b" }], consequence: 3, rationale: "r", section: "s" },
        ],
      }),
    });
    const res = await proposeGapDecisions(llm, sheet(), GAPS);
    expect(res.candidates).toHaveLength(1);
    const c = res.candidates[0]!;
    expect(c.id).toBe("xg_email_cadence");
    expect(c.options.map((o) => o.id)).toEqual(["a", "b"]); // snake_cased + deduped
    expect(c.consequence).toBe(5); // clamped
  });

  it("makes no LLM call and reports zero usage when there are no gaps", async () => {
    const llm = new MockLLM(gapMockHandlers);
    const res = await proposeGapDecisions(llm, sheet(), []);
    expect(res.candidates).toEqual([]);
    expect(res.usage.input_tokens).toBe(0);
    expect(llm.calls).toHaveLength(0);
    expect(res.model).toBe("mock-strong");
  });
});

describe("mockGapDecisions", () => {
  it("output always satisfies the schema", () => {
    const user = `DESIGN SHEET:\nwhatever\n\n${GAPS_MARKER}${renderGapsForPrompt(GAPS)}\n\nPropose at most 8 candidates.`;
    const out = mockGapDecisions({ fn: "gap_decisions", tier: "strong", system: "", user, schema: GapDecisionsOutSchema });
    expect(GapDecisionsOutSchema.safeParse(out).success).toBe(true);
    expect(out.candidates[2]!.section).toBe(""); // "(top)" round-trips back to ""
  });
});
