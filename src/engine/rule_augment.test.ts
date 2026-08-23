import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { MockLLM, type MockHandler } from "../llm/client.js";
import { invoicingMockHandlers } from "../llm/mock_fixtures.js";
import { loadCatalogs } from "./catalogs.js";
import { Engine } from "./orchestrator.js";
import { MemoryStore } from "../store/file_store.js";
import { augmentRulesFromBank } from "./rule_augment.js";
import type { RuleBank } from "../mining/rule_bank.js";
import { emptySheet } from "../core/sheet.js";
import type { Fns } from "../llm/functions.js";

async function tempBankDir(banks: Record<string, RuleBank>): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "rule-bank-test-"));
  for (const [archetype, bank] of Object.entries(banks)) await fs.writeFile(path.join(dir, `${archetype}.json`), JSON.stringify(bank));
  return dir;
}

const bank = (archetype: string, patterns: { id: string; pattern: string; freq?: number; example?: string; kind?: "access" | "state" | "integrity" | "scope" | "other" }[]): RuleBank => ({
  archetype,
  version: "test-1",
  source_docs: 5,
  patterns: patterns.map((p) => ({ id: p.id, pattern: p.pattern, kind: p.kind ?? "other", frequency_estimate: p.freq ?? 4, example_phrasing: p.example ?? p.pattern })),
});

describe("augmentRulesFromBank", () => {
  const fakeFns = (additions: { text: string; kind: "access" | "state" | "integrity" | "scope" | "other"; rationale: string; based_on_pattern_id: string }[]): Pick<Fns, "augmentRules"> => ({
    augmentRules: async () =>
      ({ data: { additions }, model: "mock", latency_ms: 1, usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }, cached: false }) as never,
  });

  it("is a no-op when there is no bank for the archetype", async () => {
    const sheet = emptySheet("p1", "x");
    const { result, res } = await augmentRulesFromBank(fakeFns([{ text: "should never be called", kind: "other", rationale: "r", based_on_pattern_id: "p1" }]), sheet, null);
    expect(result).toEqual({ ops: [], suggested: 0, added: 0, deduped: 0, patterns_considered: 0 });
    expect(res).toBeNull();
  });

  it("is a no-op when the bank has zero patterns", async () => {
    const sheet = emptySheet("p1", "x");
    const { result } = await augmentRulesFromBank(fakeFns([]), sheet, bank("b2b-invoicing", []));
    expect(result.patterns_considered).toBe(0);
  });

  it("turns additions into add_rule ops and dedups against existing rules (exact and near-literal)", async () => {
    // "near-literal" is the honest scope here (see the jaccard docstring): same significant words, minor
    // rewording — real paraphrase-level duplicates rely on the model's own prompted judgment, not this check.
    const sheet = { ...emptySheet("p1", "x"), rules: [{ id: "r1", text: "Invoice numbers are sequential with no gaps", kind: "integrity" as const, source: "draft" }] };
    const fns = fakeFns([
      { text: "Invoice numbers are sequential without any gaps", kind: "integrity", rationale: "near-literal dup of r1", based_on_pattern_id: "p1" },
      { text: "A client never sees another client's invoice", kind: "access", rationale: "isolation", based_on_pattern_id: "p2" }, // genuinely new
      { text: "", kind: "other", rationale: "blank, must be dropped", based_on_pattern_id: "p3" },
    ]);
    const { result } = await augmentRulesFromBank(fns, sheet, bank("b2b-invoicing", [{ id: "p1", pattern: "x" }]));
    expect(result.suggested).toBe(3);
    expect(result.added).toBe(1);
    expect(result.deduped).toBe(1); // near-literal dup counted; blank silently dropped (not counted as deduped or added)
    expect(result.ops).toEqual([{ op: "add_rule", text: "A client never sees another client's invoice", kind: "access" }]);
  });

  it("dedups against other suggestions in the same batch, not just existing rules", async () => {
    const sheet = emptySheet("p1", "x");
    const fns = fakeFns([
      { text: "An invoice cannot be sent twice", kind: "state", rationale: "r1", based_on_pattern_id: "p1" },
      { text: "An invoice can never be sent twice", kind: "state", rationale: "r2 (near-literal duplicate of the first)", based_on_pattern_id: "p1" },
    ]);
    const { result } = await augmentRulesFromBank(fns, sheet, bank("b2b-invoicing", [{ id: "p1", pattern: "x" }]));
    expect(result.added).toBe(1);
    expect(result.deduped).toBe(1);
  });

  it("caps additions at 6 even if the model returns more", async () => {
    const sheet = emptySheet("p1", "x");
    const many = Array.from({ length: 10 }, (_, i) => ({ text: `Rule number ${i} about something totally unrelated to the others`, kind: "other" as const, rationale: "r", based_on_pattern_id: "p1" }));
    const { result } = await augmentRulesFromBank(fakeFns(many), sheet, bank("b2b-invoicing", [{ id: "p1", pattern: "x" }]));
    expect(result.ops.length).toBeLessThanOrEqual(6);
  });
});

describe("Engine.createProject wired to the rule bank (mock LLM, temp bank dir)", () => {
  // distinct real sentences, not templated text — a templated "Mined rule N for pattern X" string loses its
  // only distinguishing tokens (N, X) to the tokenizer's short-token filter and would look like a duplicate
  // of itself, which is a lesson from this file's own first draft, not a hypothetical.
  const DISTINCT_SUGGESTIONS = ["Every invoice references exactly one client record", "Client data from one company is never visible to another company"];
  const augmentRulesMock: MockHandler = (req) => {
    const patterns = [...(req.user as string).matchAll(/^- \[([a-z0-9_]+)\]/gm)].map((m) => m[1]!);
    return {
      additions: patterns.slice(0, 2).map((id, i) => ({ text: DISTINCT_SUGGESTIONS[i]!, kind: "other" as const, rationale: "from the bank", based_on_pattern_id: id })),
    };
  };

  it("adds bank-derived rules as a separate rule_bank commit when a bank exists for the drafted archetype", async () => {
    const dir = await tempBankDir({ "b2b-invoicing": bank("b2b-invoicing", [{ id: "inv_1", pattern: "sequential numbering" }, { id: "inv_2", pattern: "client isolation" }]) });
    const engine = new Engine(new MemoryStore(), new MockLLM({ ...invoicingMockHandlers, augment_rules: augmentRulesMock }), await loadCatalogs(), { precompute: false, ruleBankDir: dir });
    const r = await engine.createProject("an invoicing app for small bookkeeping firms", { id: "p_bank" });
    expect(r.sheet.rules.some((x) => x.text === DISTINCT_SUGGESTIONS[0])).toBe(true);
    expect(r.sheet.rules.filter((x) => x.source === "rule_bank")).toHaveLength(2);
    const commits = await engine.store.listCommits("p_bank");
    expect(commits.map((c) => c.source.kind)).toContain("rule_bank");
    const events = await engine.store.listEvents("p_bank");
    const ev = events.find((e) => e.type === "rules_augmented");
    expect(ev?.payload).toMatchObject({ archetype: "b2b-invoicing", added: 2, patterns_considered: 2 });
  });

  it("is silently a no-op when no bank exists for the drafted archetype (default behavior today)", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "rule-bank-empty-"));
    const engine = new Engine(new MemoryStore(), new MockLLM(invoicingMockHandlers), await loadCatalogs(), { precompute: false, ruleBankDir: dir });
    const r = await engine.createProject("an invoicing app for small bookkeeping firms", { id: "p_nobank" });
    expect(r.sheet.rules.some((x) => x.source === "rule_bank")).toBe(false);
    const events = await engine.store.listEvents("p_nobank");
    expect(events.some((e) => e.type === "rules_augmented")).toBe(false);
    const commits = await engine.store.listCommits("p_nobank");
    expect(commits.map((c) => c.source.kind)).not.toContain("rule_bank");
  });

  it("does not add anything the drafter already covers (end-to-end dedup)", async () => {
    // the invoicing mock draft already includes "An invoice cannot be sent twice" — a bank pattern phrased
    // as a near-duplicate must be dropped, not doubled.
    const dir = await tempBankDir({
      "b2b-invoicing": bank("b2b-invoicing", [{ id: "inv_1", pattern: "no double sending" }]),
    });
    const dupHandler: MockHandler = () => ({ additions: [{ text: "An invoice can never be sent twice", kind: "state", rationale: "matches drafted rule", based_on_pattern_id: "inv_1" }] });
    const engine = new Engine(new MemoryStore(), new MockLLM({ ...invoicingMockHandlers, augment_rules: dupHandler }), await loadCatalogs(), { precompute: false, ruleBankDir: dir });
    const r = await engine.createProject("an invoicing app for small bookkeeping firms", { id: "p_dedup" });
    expect(r.sheet.rules.filter((x) => x.source === "rule_bank")).toHaveLength(0);
    const events = await engine.store.listEvents("p_dedup");
    expect(events.find((e) => e.type === "rules_augmented")?.payload).toMatchObject({ added: 0, deduped: 1 });
  });
});
