import { describe, it, expect } from "vitest";
import type { NodeDef } from "../core/catalog.js";
import { type Belief, makeWorld } from "../core/worlds.js";
import { dpBound, defaultCandidates } from "./dp_bound.js";

const def = (id: string, c: number, opts: string[]): NodeDef => ({
  id,
  topic: id,
  question: `${id}?`,
  options: opts.map((o) => ({ id: o, label: o })),
  consequence: c,
  prior: Object.fromEntries(opts.map((o) => [o, 1 / opts.length])),
  implies: Object.fromEntries(opts.map((o) => [o, []])),
  sections: [],
  bespoke: false,
  archetype: "core",
});

/** 4 equal particles = the full product of two independent binary nodes (adaptive-submodular-friendly). */
function productBelief(): Belief {
  const nodes = [def("a", 2, ["x", "y"]), def("b", 3, ["p", "q"])];
  const rows = [
    ["x", "p"],
    ["x", "q"],
    ["y", "p"],
    ["y", "q"],
  ];
  return { nodes, worlds: rows.map((r, i) => makeWorld(`w${i}`, { a: r[0]!, b: r[1]! }, 0.25, "sampled")), alpha: 0 };
}

describe("dpBound — hand-verified optima on tiny beliefs", () => {
  it("independent product belief, H=1: optimum is the single highest-risk question (verified by hand)", () => {
    // base risk = 2·(1−0.5) + 3·(1−0.5) = 2.5. Asking b resolves 3·0.5 = 1.5; asking a resolves 1.0.
    const r = dpBound(productBelief(), ["a", "b"], { horizon: 1 });
    expect(r.baseRisk).toBeCloseTo(2.5, 9);
    expect(r.optimal).toBeCloseTo(1.5, 9);
    expect(r.greedy).toBeCloseTo(1.5, 9); // greedy picks b too
    expect(r.ratio).toBeCloseTo(1, 9);
  });

  it("independent product belief, H=2: both questions fit, everything resolves — greedy == optimal", () => {
    const r = dpBound(productBelief(), ["a", "b"], { horizon: 2 });
    expect(r.optimal).toBeCloseTo(2.5, 9);
    expect(r.greedy).toBeCloseTo(2.5, 9);
    expect(r.ratio).toBeCloseTo(1, 9);
  });

  it("3 particles / identify-vs-split, H=1: optimum is the fully identifying question (verified by hand)", () => {
    // g (c=3, 3 options) identifies the particle exactly; h (c=2) splits 2/1.
    // base risk = 3·(1−1/3) + 2·(1−2/3) = 8/3. Asking g → final risk 0 → reduction 8/3.
    // Asking h → expected final risk = (2/3)·(3·0.5) = 1 → reduction 5/3. Optimal = 8/3, greedy agrees.
    const nodes = [def("g", 3, ["g1", "g2", "g3"]), def("h", 2, ["p", "q"])];
    const worlds = [
      makeWorld("w1", { g: "g1", h: "p" }, 1 / 3, "sampled"),
      makeWorld("w2", { g: "g2", h: "p" }, 1 / 3, "sampled"),
      makeWorld("w3", { g: "g3", h: "q" }, 1 / 3, "sampled"),
    ];
    const b: Belief = { nodes, worlds, alpha: 0 };
    const r = dpBound(b, ["g", "h"], { horizon: 1 });
    expect(r.baseRisk).toBeCloseTo(8 / 3, 9);
    expect(r.optimal).toBeCloseTo(8 / 3, 9);
    expect(r.greedy).toBeCloseTo(8 / 3, 9);
  });
});

describe("dpBound — greedy is bounded by the optimum", () => {
  /** the selector.test lookahead trap: m has the best one-step value but the follow-up structure favors others */
  function trapBelief(): Belief {
    const nodes = [def("x", 1, ["a", "b"]), def("z", 2, ["a", "b"]), def("m", 5, ["p", "q"]), def("n", 2, ["p", "q"])];
    const rows = [
      ["a", "a", "p", "p"],
      ["a", "a", "p", "p"],
      ["a", "b", "p", "q"],
      ["a", "b", "p", "q"],
      ["b", "a", "p", "p"],
      ["b", "a", "p", "p"],
      ["b", "b", "q", "q"],
      ["b", "b", "q", "q"],
    ];
    return { nodes, worlds: rows.map((r, i) => makeWorld(`w${i}`, { x: r[0]!, z: r[1]!, m: r[2]!, n: r[3]! }, 1 / rows.length, "sampled")), alpha: 0 };
  }

  it("greedy ≤ optimal on every belief and horizon (the defining property of the bound)", () => {
    for (const b of [productBelief(), trapBelief()]) {
      const open = b.nodes.map((n) => n.id);
      for (const horizon of [1, 2, 3, 4]) {
        const r = dpBound(b, open, { horizon });
        expect(r.greedy).toBeLessThanOrEqual(r.optimal + 1e-9);
        expect(r.optimal).toBeLessThanOrEqual(r.baseRisk + 1e-9); // can't reduce more risk than exists
      }
    }
  });

  it("is deterministic (same belief → identical numbers and state counts)", () => {
    const b = trapBelief();
    const open = b.nodes.map((n) => n.id);
    const r1 = dpBound(b, open, { horizon: 3 });
    const r2 = dpBound(b, open, { horizon: 3 });
    expect(r2).toEqual(r1);
  });

  it("builds the default shortlist by consequence × entropy, deterministically", () => {
    const b = trapBelief();
    const ids = defaultCandidates(b, b.nodes.map((n) => n.id), 2);
    expect(ids).toEqual(["m", "n"]); // m: 5·H(.75)≈4.06; z and n tie at 2·1 bit → consequence ties → id asc picks n
    expect(defaultCandidates(b, b.nodes.map((n) => n.id), 2)).toEqual(ids);
  });
});

describe("dpBound — mock engine belief (the real diagnostic)", () => {
  it("completes the full-budget DP on the mock invoicing belief within the time/state budget", async () => {
    const { buildEngine } = await import("../engine/bootstrap.js");
    const { MemoryStore } = await import("../store/file_store.js");
    const { engine } = await buildEngine({ mock: true, store: new MemoryStore(), engine: { precompute: false } });
    const created = await engine.createProject("An invoicing and bookkeeping app for my small firm", { id: "dpb_test" });
    expect(created.sheet).toBeTruthy();
    const st = await engine.getState("dpb_test");
    const openIds = st.sheet.decisions.filter((d) => d.status === "open").map((d) => d.id);
    const t0 = Date.now();
    const r = dpBound(st.session.belief, openIds, { horizon: 12, shortlistSize: 16, consequenceOverride: st.session.consequence_override });
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThan(20_000); // observed ~120ms; generous CI budget
    expect(r.statesVisited).toBeGreaterThan(0);
    expect(r.statesVisited).toBeLessThan(500_000); // observed ~39k — bounded, not exploding
    expect(r.baseRisk).toBeGreaterThan(0);
    expect(r.optimal).toBeGreaterThan(0);
    expect(r.greedy).toBeLessThanOrEqual(r.optimal + 1e-9);
    // with 12 questions over 12 particles the DP saturates (full identification); greedy should land close —
    // the survey's prediction. Keep the bound loose so mock-fixture drift doesn't break the suite.
    expect(r.greedy / r.optimal).toBeGreaterThan(0.8);
  }, 60_000);
});
