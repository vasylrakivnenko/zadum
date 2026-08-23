import { describe, it, expect } from "vitest";
import { recoveryFromExtraction, draftRecallFromLists, scoreBaseline, compareOne, comparisonTable, mockBaselineHandlers, type ComparisonRow } from "./run.js";
import type { ConceptExtraction } from "../mining/concepts.js";
import type { NodeDef } from "../core/catalog.js";
import type { Gold } from "../harness/run.js";
import type { BaselineResult } from "./types.js";
import { MockLLM } from "../llm/client.js";
import { loadCatalogs } from "../engine/catalogs.js";
import { Engine } from "../engine/orchestrator.js";
import { MemoryStore } from "../store/file_store.js";
import { invoicingMockHandlers } from "../llm/mock_fixtures.js";
import { conceptMockHandlers } from "../mining/concepts_mock.js";
import { specKitBaseline } from "./spec_kit.js";
import { dlaiSdd } from "./dlai_sdd.js";

const nodes: NodeDef[] = [
  {
    id: "external_access",
    topic: "outside parties",
    question: "Do outside parties use the app directly?",
    options: [
      { id: "none", label: "No" },
      { id: "portal", label: "They log in" },
    ],
    consequence: 5,
    prior: { none: 0.6, portal: 0.4 },
    implies: { none: [], portal: [] },
    sections: [],
    bespoke: false,
    archetype: "core",
  },
  {
    id: "late_fees",
    topic: "late invoices",
    question: "Late fees?",
    options: [
      { id: "none", label: "No" },
      { id: "automatic", label: "Automatic" },
    ],
    consequence: 2,
    prior: { none: 0.7, automatic: 0.3 },
    implies: { none: [], automatic: [] },
    sections: [],
    bespoke: false,
    archetype: "b2b-invoicing",
  },
  {
    id: "zero_consequence",
    topic: "cosmetic",
    question: "Theme?",
    options: [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
    ],
    consequence: 0,
    prior: { a: 0.5, b: 0.5 },
    implies: { a: [], b: [] },
    sections: [],
    bespoke: false,
    archetype: "core",
  },
];

const gold: Gold = {
  id: "g1",
  one_liner: "an invoicing app",
  archetypes: ["b2b-invoicing"],
  persona: "an owner",
  truth: "clients log in; no late fees",
  decisions: { external_access: "portal", late_fees: "none", zero_consequence: "a" },
};

function extraction(decisions: ConceptExtraction["decisions"], extra: Partial<ConceptExtraction> = {}): ConceptExtraction {
  return { decisions, new_concepts: [], actors: [], nouns: [], rules: [], non_goals: [], ...extra };
}

describe("recoveryFromExtraction", () => {
  it("credits a stated decision that matches the gold and falls back to the catalog prior when silent", () => {
    // external_access stated correctly (portal, consequence 5); late_fees never mentioned → falls back to
    // the prior argmax "none", which happens to match gold → also credited; zero-consequence node contributes
    // nothing to either side of the ratio.
    const ex = extraction([{ node_id: "external_access", option_id: "portal", confidence: 0.9, evidence: "e" }]);
    expect(recoveryFromExtraction(ex, nodes, gold)).toBeCloseTo(1, 6);
  });

  it("penalizes a stated decision that contradicts the gold, and a wrong prior fallback", () => {
    const wrongGold: Gold = { ...gold, decisions: { ...gold.decisions, late_fees: "automatic" } };
    const ex = extraction([{ node_id: "external_access", option_id: "none", confidence: 0.9, evidence: "e" }]);
    // external_access wrong (c=5), late_fees silent → prior argmax "none" but gold now wants "automatic" (c=2) → also wrong
    expect(recoveryFromExtraction(ex, nodes, wrongGold)).toBeCloseTo(0, 6);
  });

  it("ignores decisions below MIN_CONFIDENCE and keeps only the highest-confidence vote per node", () => {
    const lowConf = extraction([{ node_id: "external_access", option_id: "portal", confidence: 0.4, evidence: "e" }]);
    // below threshold → treated as silent → falls back to prior argmax "none" ≠ gold "portal" → 0 for that node;
    // late_fees silent → prior "none" matches gold → credited. Weighted: (5*0 + 2*1) / (5+2)
    expect(recoveryFromExtraction(lowConf, nodes, gold)).toBeCloseTo(2 / 7, 6);

    const twoVotes = extraction([
      { node_id: "external_access", option_id: "none", confidence: 0.6, evidence: "low" },
      { node_id: "external_access", option_id: "portal", confidence: 0.95, evidence: "high" },
    ]);
    expect(recoveryFromExtraction(twoVotes, nodes, gold)).toBeCloseTo(1, 6);
  });

  it("ignores gold decisions and extraction votes for unknown node ids", () => {
    // the vote on an unknown node contributes nothing, so external_access is effectively silent → falls back
    // to the prior argmax "none", which does NOT match this gold's "portal" → correctly scored as a miss;
    // "ghost_node" has no catalog node at all and must be skipped rather than crash.
    const ex = extraction([{ node_id: "does_not_exist", option_id: "x", confidence: 0.9, evidence: "e" }]);
    const g: Gold = { ...gold, decisions: { external_access: "portal", ghost_node: "whatever" } };
    expect(recoveryFromExtraction(ex, nodes, g)).toBeCloseTo(0, 6);

    // same setup, but the gold's prior-favored default happens to be correct → recovery should be 1
    const g2: Gold = { ...gold, decisions: { external_access: "none", ghost_node: "whatever" } };
    expect(recoveryFromExtraction(ex, nodes, g2)).toBeCloseTo(1, 6);
  });
});

describe("draftRecallFromLists", () => {
  const g: Gold = { ...gold, sheet: { actors: ["Bookkeeper", "Client"], nouns: ["Invoice"], rules: ["A client never sees another client's invoice"], non_goals: ["Payroll"] } };

  it("matches actors/nouns by normalized name and rules/non_goals fuzzily", () => {
    const r = draftRecallFromLists({ actors: ["bookkeeper", "clients"], nouns: ["invoices"], rules: ["A client can never see another client's invoice"], non_goals: ["No payroll support"] }, g);
    expect(r.actors).toBe(1);
    expect(r.nouns).toBe(1);
    expect(r.rules).toBe(1);
    expect(r.non_goals).toBe(1);
  });

  it("scores partial and missing recall, and defaults to 1 when the gold has no sheet", () => {
    const r = draftRecallFromLists({ actors: ["Bookkeeper"], nouns: [], rules: [], non_goals: [] }, g);
    expect(r.actors).toBeCloseTo(0.5, 6);
    expect(r.nouns).toBe(0);
    expect(draftRecallFromLists({ actors: [], nouns: [], rules: [], non_goals: [] }, gold)).toEqual({ actors: 1, nouns: 1, rules: 1, non_goals: 1 });
  });
});

describe("scoreBaseline (mock LLM)", () => {
  it("extracts concepts from the baseline's spec text and scores it, without throwing on extraction failure", async () => {
    const llm = new MockLLM({
      concept_extract: () => ({
        decisions: [{ node_id: "external_access", option_id: "portal", confidence: 0.9, evidence: "clients log in" }],
        new_concepts: [],
        actors: ["Owner"],
        nouns: ["Invoice"],
        rules: [],
        non_goals: [],
      }),
    });
    const result: BaselineResult = { baseline: "spec-kit", questions: [], files: [{ name: "spec.md", content: "clients log in" }], spec_text: "clients log in", usage: { input_tokens: 1, output_tokens: 1, calls: 1 }, latency_ms: 5 };
    const scored = await scoreBaseline(llm, result, gold, nodes);
    expect(scored.extraction_failed).toBe(false);
    expect(scored.recovery).toBeCloseTo(1, 6);
    expect(scored.draft_recall.nouns).toBe(1);

    const failingLlm = new MockLLM({}); // no handler registered → throws
    const failed = await scoreBaseline(failingLlm, result, gold, nodes);
    expect(failed.extraction_failed).toBe(true);
    expect(failed.recovery).toBe(0);
  });
});

describe("compareOne + comparisonTable (mock end to end)", () => {
  it("runs our engine and both real baselines against the same gold through the same simulated user", async () => {
    const catalogs = await loadCatalogs();
    const store = new MemoryStore();
    const engine = new Engine(store, new MockLLM(invoicingMockHandlers), catalogs, { precompute: false });
    const invoicingGold: Gold = {
      id: "invoicing-mini",
      one_liner: "an invoicing app for small bookkeeping firms",
      archetypes: ["b2b-invoicing"],
      persona: "a bookkeeping firm owner",
      truth: "clients log into a portal to pay their invoices",
      decisions: { external_access: "portal" },
    };
    // one LLM serving the engine's own fixtures, concept extraction, and both baseline drivers
    const llm = new MockLLM({ ...invoicingMockHandlers, ...conceptMockHandlers, ...mockBaselineHandlers() });
    const row: ComparisonRow = await compareOne(llm, engine, invoicingGold, [specKitBaseline, dlaiSdd], 6);
    expect(row.gold_id).toBe("invoicing-mini");
    expect(row.own.cards).toBeGreaterThan(0);
    expect(row.baselines.map((b) => b.baseline).sort()).toEqual(["dlai-sdd", "spec-kit"]);
    for (const b of row.baselines) {
      expect(b.questions).toBeGreaterThanOrEqual(0);
      expect(b.questions).toBeLessThanOrEqual(6);
      expect(b.recovery).toBeGreaterThanOrEqual(0);
      expect(b.recovery).toBeLessThanOrEqual(1);
    }
    const table = comparisonTable([row]);
    expect(table).toContain("our engine");
    expect(table).toContain("spec-kit");
    expect(table).toContain("dlai-sdd");
  });
});
