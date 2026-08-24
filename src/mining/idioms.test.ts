import { describe, it, expect } from "vitest";
import { MockLLM } from "../llm/client.js";
import type { Doc } from "./ngrams.js";
import {
  aggregatePatterns,
  buildExemplar,
  clampWords,
  snake,
  licenceUncertain,
  pickDocs,
  mineIdioms,
  mockIdiomExtract,
  idiomMockHandlers,
  renderIdiomPrompt,
  IdiomExtractionSchema,
  type ExtractionRecord,
} from "./idioms.js";

// ---------- helpers ----------

describe("snake / clampWords", () => {
  it("snake normalizes to canonical names", () => {
    expect(snake("Must-Never Invariant!")).toBe("must_never_invariant");
    expect(snake("  error  table ")).toBe("error_table");
  });
  it("clampWords enforces the 25-word quote bound", () => {
    const long = Array.from({ length: 30 }, (_, i) => `w${i}`).join(" ");
    expect(clampWords(long, 25).split(/\s+/)).toHaveLength(26); // 25 words + ellipsis
    expect(clampWords("short quote", 25)).toBe("short quote");
  });
});

describe("licenceUncertain", () => {
  it("flags unknown / flagged / provisional / missing licences", () => {
    expect(licenceUncertain("unknown — no LICENSE file in docs repo")).toBe(true);
    expect(licenceUncertain("Elastic License 2.0 … — flagged, not OSI")).toBe(true);
    expect(licenceUncertain("text copied provisionally")).toBe(true);
    expect(licenceUncertain(undefined)).toBe(true);
    expect(licenceUncertain("")).toBe(true);
  });
  it("passes ordinary licences", () => {
    for (const l of ["MIT", "Apache-2.0", "GPL-3.0", "AGPL-3.0 (with exceptions)", "CC-BY-SA-4.0"]) expect(licenceUncertain(l)).toBe(false);
  });
});

describe("pickDocs", () => {
  it("takes the longest N of the archetype, deterministically", () => {
    const docs: Doc[] = [
      { id: "a", archetype: "x", text: "aaa" },
      { id: "b", archetype: "x", text: "aaaaaaa" },
      { id: "c", archetype: "x", text: "aaaaa" },
      { id: "other", archetype: "y", text: "aaaaaaaaaaaa" },
      { id: "tie2", archetype: "x", text: "bbb" },
    ];
    expect(pickDocs(docs, "x", 3).map((d) => d.id)).toEqual(["b", "c", "a"]); // ties broken by id: a before tie2
    expect(pickDocs(docs, "x", 99)).toHaveLength(4);
  });
});

// ---------- aggregation ----------

describe("aggregatePatterns", () => {
  const perDoc = [
    { doc_id: "d1", items: [{ name: "error_table", v: 1 }, { name: "Error Table", v: 2 }, { name: "exactly_once", v: 3 }] },
    { doc_id: "d2", items: [{ name: "error_table", v: 4 }, { name: "bounded_window", v: 5 }] },
    { doc_id: "d3", items: [{ name: "error_table", v: 6 }, { name: "exactly_once", v: 7 }] },
  ];

  it("counts one vote per doc per normalized name and keeps the ≥2-doc patterns", () => {
    const out = aggregatePatterns(perDoc, { minDocs: 2, topN: 2 });
    expect(out.map((a) => [a.name, a.count])).toEqual([
      ["error_table", 3], // "Error Table" in d1 did NOT double-count
      ["exactly_once", 2],
    ]);
    expect(out[0]!.docs).toEqual(["d1", "d2", "d3"]);
    expect(out[0]!.first).toEqual({ name: "error_table", v: 1 }); // representative = first doc, first mention
  });

  it("drops singletons when the threshold list is already big enough", () => {
    const out = aggregatePatterns(perDoc, { minDocs: 2, topN: 2 });
    expect(out.some((a) => a.name === "bounded_window")).toBe(false);
  });

  it("tops up with most-frequent singletons when fewer than topN patterns clear the threshold", () => {
    const out = aggregatePatterns(perDoc, { minDocs: 2, topN: 3 });
    expect(out.map((a) => a.name)).toEqual(["error_table", "exactly_once", "bounded_window"]);
  });

  it("threshold above every count still yields topN by frequency", () => {
    const out = aggregatePatterns(perDoc, { minDocs: 5, topN: 2 });
    expect(out.map((a) => a.name)).toEqual(["error_table", "exactly_once"]);
  });
});

// ---------- buildExemplar ----------

const record = (doc_id: string, data: ExtractionRecord["data"]): ExtractionRecord => ({
  doc_id,
  archetype: "booking",
  data,
  error: data ? null : "boom",
  model: "mock-strong",
  latency_ms: 0,
  usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
});

describe("buildExemplar", () => {
  it("produces the versioned per-archetype shape, ignoring failed docs", () => {
    const data = (i: number) => ({
      section_patterns: [{ name: "cancellation_policy", purpose: `p${i}` }],
      precision_idioms: [{ name: "must_never_invariant", template: "X must never Y", example: `quote ${i}` }],
      edge_case_patterns: [{ name: "no_show", resolution: `r${i}` }],
    });
    const ex = buildExemplar("booking", [record("d1", data(1)), record("d2", data(2)), record("bad", null)], { version: "2026-08-24-1" });
    expect(ex).toMatchObject({ version: "2026-08-24-1", archetype: "booking", mined_from: 2, docs: ["d1", "d2"] });
    expect(ex.section_patterns).toEqual([{ name: "cancellation_policy", purpose: "p1", count: 2 }]);
    expect(ex.precision_idioms).toEqual([{ name: "must_never_invariant", template: "X must never Y", example: "quote 1", example_doc: "d1", count: 2 }]);
    expect(ex.edge_case_patterns).toEqual([{ name: "no_show", resolution: "r1", count: 2 }]);
  });

  it("clamps over-long examples to 25 words", () => {
    const long = Array.from({ length: 40 }, (_, i) => `w${i}`).join(" ");
    const ex = buildExemplar(
      "booking",
      [record("d1", { section_patterns: [], precision_idioms: [{ name: "x", template: "t", example: long }], edge_case_patterns: [] })],
      { version: "v", minDocs: 1 },
    );
    expect(ex.precision_idioms[0]!.example.split(/\s+/)).toHaveLength(26);
  });
});

// ---------- mock handler + end-to-end mock mining ----------

const DOC_A: Doc = {
  id: "spec-a",
  archetype: "booking",
  text: [
    "## Cancellation Policy",
    "A booking must never be deleted; verified by the audit log. Customers may cancel within 24 hours.",
    "Refunds are issued for cancellations. Exactly one confirmation email is sent per booking.",
  ].join("\n"),
};
const DOC_B: Doc = {
  id: "spec-b",
  archetype: "booking",
  text: [
    "## Cancellation Policy",
    "## Notifications",
    "Slots must never overlap. If a customer wants to cancel, the slot reopens. Double-booking conflicts are rejected.",
  ].join("\n"),
};
const DOC_C: Doc = { id: "spec-c", archetype: "booking", text: "## Notifications\nReminders go out within 48 hours. No cancellations here." };

describe("mockIdiomExtract", () => {
  it("reads the same rendered prompt the model would and satisfies the schema", () => {
    const { user } = renderIdiomPrompt(DOC_A);
    const out = mockIdiomExtract({ fn: "idiom_extract", tier: "strong", system: "", user, schema: IdiomExtractionSchema });
    expect(IdiomExtractionSchema.safeParse(out).success).toBe(true);
    expect(out.section_patterns.map((s) => s.name)).toEqual(["cancellation_policy"]);
    expect(out.precision_idioms.map((i) => i.name)).toContain("must_never_invariant");
    expect(out.precision_idioms.map((i) => i.name)).toContain("exactly_once");
    expect(out.edge_case_patterns.map((e) => e.name)).toContain("cancellation_window");
    const quote = out.precision_idioms.find((i) => i.name === "must_never_invariant")!.example;
    expect(DOC_A.text).toContain(quote); // verbatim, from the doc
  });
});

describe("mineIdioms (mock, end to end)", () => {
  it("mines per archetype, aggregates across docs, honors perArchetype selection", async () => {
    const llm = new MockLLM(idiomMockHandlers);
    const { exemplars, records } = await mineIdioms(llm, [DOC_A, DOC_B, DOC_C], ["booking"], { perArchetype: 3, version: "test-1", minDocs: 2, topN: 2 });
    expect(records).toHaveLength(3);
    const ex = exemplars["booking"]!;
    expect(ex.mined_from).toBe(3);
    // cancellation_policy heading in A+B; the cancel cue fires in all three docs
    expect(ex.section_patterns.find((s) => s.name === "cancellation_policy")?.count).toBe(2);
    expect(ex.edge_case_patterns.find((e) => e.name === "cancellation_window")?.count).toBe(3);
    // must_never appears in A+B
    expect(ex.precision_idioms.find((i) => i.name === "must_never_invariant")?.count).toBe(2);
  });

  it("a failing doc is recorded and skipped, not fatal", async () => {
    let calls = 0;
    const llm = new MockLLM({
      idiom_extract: (req) => {
        calls += 1;
        if (req.user.includes("spec-b")) throw new Error("simulated refusal");
        return mockIdiomExtract(req);
      },
    });
    const { exemplars, records } = await mineIdioms(llm, [DOC_A, DOC_B, DOC_C], ["booking"], { version: "v", perArchetype: 3 });
    expect(calls).toBe(3);
    expect(records.filter((r) => r.error)).toHaveLength(1);
    expect(exemplars["booking"]!.mined_from).toBe(2);
    expect(exemplars["booking"]!.docs).not.toContain("spec-b");
  });

  it("selects only the longest perArchetype docs and only the named archetypes", async () => {
    const llm = new MockLLM(idiomMockHandlers);
    const other: Doc = { id: "spec-x", archetype: "e-commerce", text: "## Refund policy\nRefunds within 30 days." };
    const { records } = await mineIdioms(llm, [DOC_A, DOC_B, DOC_C, other], ["booking"], { perArchetype: 2, version: "v" });
    expect(records.map((r) => r.doc_id).sort()).toEqual(["spec-a", "spec-b"]); // the two longest booking docs
  });
});
