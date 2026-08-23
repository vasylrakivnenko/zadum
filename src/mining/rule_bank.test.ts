import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { MockLLM } from "../llm/client.js";
import { clusterRulesMockHandlers } from "./rule_bank_mock.js";
import { rulesByArchetype, buildRuleBank, RuleBankSchema, renderRulesForClustering, type ExtractionLike } from "./rule_bank.js";
import { loadRuleBank } from "../engine/rule_bank.js";

const extractions: ExtractionLike[] = [
  { archetype: "b2b-invoicing", data: { rules: ["Every invoice belongs to one client.", "Invoices are numbered sequentially."] } },
  { archetype: "b2b-invoicing", data: { rules: ["An invoice must reference exactly one client.", "Invoice numbers never repeat."] } },
  { archetype: "b2b-invoicing", data: { rules: [] } }, // a doc that stated no rules still counts as a doc
  { archetype: "booking", data: { rules: ["A booking cannot double-book a resource."] } },
  { archetype: "empty-archetype", data: null }, // failed extraction — must not crash or count as a doc
];

describe("rulesByArchetype", () => {
  it("groups rules by archetype and counts only successful extractions as docs", () => {
    const groups = rulesByArchetype(extractions);
    const inv = groups.find((g) => g.archetype === "b2b-invoicing")!;
    expect(inv.docs).toBe(3);
    expect(inv.rules).toHaveLength(4);
    const booking = groups.find((g) => g.archetype === "booking")!;
    expect(booking.docs).toBe(1);
    expect(groups.find((g) => g.archetype === "empty-archetype")).toBeUndefined();
  });

  it("drops blank rule strings", () => {
    const groups = rulesByArchetype([{ archetype: "x", data: { rules: ["real rule", "  ", ""] } }]);
    expect(groups[0]!.rules).toEqual(["real rule"]);
  });
});

describe("renderRulesForClustering", () => {
  it("includes the archetype and every rule as a bullet", () => {
    const text = renderRulesForClustering("booking", ["a", "b"]);
    expect(text).toContain("ARCHETYPE: booking");
    expect(text).toContain("- a");
    expect(text).toContain("- b");
  });
});

describe("buildRuleBank (mock LLM)", () => {
  it("clusters raw rules into patterns with ids, clamped frequency, and a stable version", async () => {
    const llm = new MockLLM(clusterRulesMockHandlers);
    const group = rulesByArchetype(extractions).find((g) => g.archetype === "b2b-invoicing")!;
    const bank = await buildRuleBank(llm, "b2b-invoicing", group.rules, group.docs);
    expect(bank.archetype).toBe("b2b-invoicing");
    expect(bank.source_docs).toBe(3);
    expect(bank.patterns.length).toBeGreaterThan(0);
    for (const p of bank.patterns) {
      expect(p.id).toMatch(/^b2b_invoicing_\d+$/);
      expect(p.frequency_estimate).toBeGreaterThanOrEqual(1);
      expect(p.frequency_estimate).toBeLessThanOrEqual(5);
      expect(["access", "state", "integrity", "scope", "other"]).toContain(p.kind);
    }
    expect(RuleBankSchema.safeParse(bank).success).toBe(true);
  });

  it("caps patterns at 20 even if the model returns more", async () => {
    const llm = new MockLLM({
      cluster_rules: () => ({ patterns: Array.from({ length: 30 }, (_, i) => ({ pattern: `p${i}`, kind: "other" as const, frequency_estimate: 1, example_phrasing: "e" })) }),
    });
    const bank = await buildRuleBank(llm, "x", ["r"], 1);
    expect(bank.patterns).toHaveLength(20);
  });
});

describe("loadRuleBank", () => {
  it("returns null (not an error) for an archetype with no mined bank", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rule-bank-"));
    expect(await loadRuleBank("no-such-archetype", tmp)).toBeNull();
  });

  it("loads and validates a written bank file", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "rule-bank-"));
    const llm = new MockLLM(clusterRulesMockHandlers);
    const bank = await buildRuleBank(llm, "booking", ["A booking cannot double-book a resource.", "No double booking allowed."], 2);
    await fs.writeFile(path.join(tmp, "booking.json"), JSON.stringify(bank));
    const loaded = await loadRuleBank("booking", tmp);
    expect(loaded).toEqual(bank);
  });
});
