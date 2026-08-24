import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildEngine } from "../engine/bootstrap.js";
import { MemoryStore } from "../store/file_store.js";
import type { NodeDef } from "../core/catalog.js";
import type { Belief, World } from "../core/worlds.js";
import { loadGolds, type Gold } from "./run.js";
import { simulateVerification, verifyEvalOnGold, verifyEvalTable, type CardsRegime, type VerifyEvalMetrics } from "./verify_eval.js";

const goldFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "gold/invoicing-bookkeeping.json");

async function invoicingGold(): Promise<Gold> {
  const [g] = await loadGolds(goldFile);
  return g!;
}

async function freshEngine() {
  const { engine } = await buildEngine({ mock: true, cache: false, store: new MemoryStore(), engine: { precompute: false } });
  return engine;
}

async function run(regime: CardsRegime, budget = 4): Promise<VerifyEvalMetrics> {
  return verifyEvalOnGold(await freshEngine(), await invoicingGold(), { regime, budget });
}

function checkInvariants(m: VerifyEvalMetrics, budget: number) {
  expect(m.interactions).toBeLessThanOrEqual(budget);
  expect(m.trace).toHaveLength(m.interactions);
  expect(m.accepts + m.rejections).toBe(m.interactions);
  expect(m.wrong_after).toBeLessThanOrEqual(m.wrong_before);
  expect(m.wrong_after).toBeGreaterThanOrEqual(0);
  expect(m.catches).toBe(m.wrong_before - m.wrong_after);
  expect(m.verifiable).toBeGreaterThanOrEqual(m.wrong_before);
  for (const t of m.trace) {
    expect(t.p_all_correct).toBeGreaterThanOrEqual(0);
    expect(t.p_all_correct).toBeLessThanOrEqual(1);
    expect(t.size).toBeGreaterThanOrEqual(1);
    expect(t.expected_bits).toBeGreaterThanOrEqual(0);
    if (!t.ok) expect(t.corrected).toBeTruthy();
    else expect(t.corrected).toBeUndefined();
  }
  if (m.wrong_before > 0) expect(m.catch_rate).toBeCloseTo(m.catches / m.wrong_before, 10);
}

describe("verifyEvalOnGold (mock invoicing)", () => {
  it("0-cards regime: pure-defaults endpoint has verifiable defaults and obeys the interaction budget", async () => {
    const m = await run("0");
    expect(m.regime).toBe("0");
    expect(m.cards).toBe(0);
    expect(m.verifiable).toBeGreaterThan(0);
    // the mock belief is known-miscalibrated: the pure-defaults regime must contain wrong defaults to catch
    expect(m.wrong_before).toBeGreaterThan(0);
    checkInvariants(m, 4);
  });

  it("normal regime: runs the card loop first, then verifies what remained defaulted", async () => {
    const m = await run("normal");
    expect(m.regime).toBe("normal");
    expect(m.cards).toBeGreaterThan(0);
    checkInvariants(m, 4);
  });

  it("is deterministic across fresh engines/stores", async () => {
    const a = await run("0");
    const b = await run("0");
    expect(b).toEqual(a);
  });

  it("respects a budget of 1 and never un-fixes: wrong_after(budget 4) ≤ wrong_after(budget 1)", async () => {
    const one = await run("0", 1);
    checkInvariants(one, 1);
    const four = await run("0", 4);
    expect(four.wrong_after).toBeLessThanOrEqual(one.wrong_after);
  });

  it("renders a table row per metric set", async () => {
    const m = await run("0", 2);
    const table = verifyEvalTable([m]);
    expect(table).toContain(m.gold_id);
    expect(table.split("\n")).toHaveLength(2); // header + one row
  });
});

describe("simulateVerification (pure, hand-built)", () => {
  function mkNode(id: string, optIds: string[], consequence = 3): NodeDef {
    return {
      id,
      topic: id,
      question: `${id}?`,
      options: optIds.map((o) => ({ id: o, label: o })),
      consequence,
      prior: Object.fromEntries(optIds.map((o) => [o, 1 / optIds.length])),
      implies: {},
      sections: [],
      bespoke: false,
      archetype: "core",
      requires: [],
    };
  }
  const mkWorld = (id: string, assignment: Record<string, string>, weight: number): World => ({ id, assignment, weight, origin: "sampled" });

  it("a rejection corrects exactly the highest-consequence wrong node and reweights the worlds copy", () => {
    // A (c=5) and B (c=3): belief argmax a1/b1 with joint 0.5; gold says a2/b1 → probe rejected, A corrected.
    const nodes = [mkNode("A", ["a1", "a2"], 5), mkNode("B", ["b1", "b2"], 3)];
    const belief: Belief = {
      nodes,
      alpha: 0,
      worlds: [mkWorld("w1", { A: "a1", B: "b1" }, 0.5), mkWorld("w2", { A: "a1", B: "b2" }, 0.3), mkWorld("w3", { A: "a2", B: "b1" }, 0.2)],
    };
    const ledger = new Map([
      ["A", "a1"],
      ["B", "b1"],
    ]);
    const out = simulateVerification({ belief, ledger, goldDecisions: { A: "a2", B: "b1" }, candidateIds: ["A", "B"], budget: 1, epsilon: 0.05 });
    expect(out.trace).toHaveLength(1);
    expect(out.trace[0]!.ok).toBe(false);
    expect(out.trace[0]!.corrected).toBe("A");
    expect(out.ledger.get("A")).toBe("a2"); // corrected to gold
    expect(out.ledger.get("B")).toBe("b1"); // untouched
    // rejection: worlds agreeing with ALL of {A=a1, B=b1} (w1) got ×ε; the input belief was NOT mutated
    expect(out.worlds.reduce((s, w) => s + w.weight, 0)).toBeCloseTo(1, 10);
    expect(out.worlds.find((w) => w.id === "w1")!.weight).toBeLessThan(belief.worlds.find((w) => w.id === "w1")!.weight);
    expect(belief.worlds.find((w) => w.id === "w1")!.weight).toBe(0.5);
  });

  it("an acceptance settles every bundled node and later probes exclude them (adaptive recomposition)", () => {
    const nodes = [mkNode("A", ["a1", "a2"]), mkNode("B", ["b1", "b2"])];
    const belief: Belief = {
      nodes,
      alpha: 0,
      worlds: [mkWorld("w1", { A: "a1", B: "b1" }, 0.5), mkWorld("w2", { A: "a2", B: "b2" }, 0.5)],
    };
    const ledger = new Map([
      ["A", "a1"],
      ["B", "b1"],
    ]);
    // Both nodes sit at p=0.5, fully correlated → one probe per node. Gold agrees with the argmaxes.
    const out = simulateVerification({ belief, ledger, goldDecisions: { A: "a1", B: "b1" }, candidateIds: ["A", "B"], budget: 4, epsilon: 0.05 });
    // fully-correlated worlds keep the bundles single-node (bundling adds no information), so two
    // interactions settle both candidates; a settled node is never probed again — total probed = 2, not more
    expect(out.trace).toHaveLength(2);
    expect(out.trace.every((t) => t.ok)).toBe(true);
    expect(out.trace.reduce((s, t) => s + t.size, 0)).toBe(2);
    expect(out.ledger.get("A")).toBe("a1");
    expect(out.ledger.get("B")).toBe("b1");
  });

  it("stops early when nothing verifiable remains", () => {
    const nodes = [mkNode("A", ["a1", "a2"])];
    const belief: Belief = { nodes, alpha: 0, worlds: [mkWorld("w1", { A: "a1" }, 1)] };
    // A's particles fully agree → filler-grade → no non-filler seed → zero probes, zero interactions
    const out = simulateVerification({ belief, ledger: new Map([["A", "a1"]]), goldDecisions: { A: "a1" }, candidateIds: ["A"], budget: 4, epsilon: 0.05 });
    expect(out.trace).toHaveLength(0);
  });
});
