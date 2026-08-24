import { describe, expect, it } from "vitest";
import type { NodeDef } from "./catalog.js";
import type { Belief, World } from "./worlds.js";
import { composeVerifyProbes, reweightOnVerify, VERIFY_FILLER_TAU } from "./verify.js";

function mkNode(id: string, optIds: string[], consequence = 3, prior?: Record<string, number>): NodeDef {
  const uniform = Object.fromEntries(optIds.map((o) => [o, 1 / optIds.length]));
  return {
    id,
    topic: id,
    question: `${id}?`,
    options: optIds.map((o) => ({ id: o, label: o })),
    consequence,
    prior: prior ?? uniform,
    implies: {},
    sections: [],
    bespoke: false,
    archetype: "core",
    requires: [],
  };
}

let wSeq = 0;
function mkWorld(assignment: Record<string, string>, weight: number): World {
  return { id: `w${++wSeq}`, assignment, weight, origin: "sampled" };
}

function mkBelief(nodes: NodeDef[], worlds: World[], alpha = 0): Belief {
  return { nodes, worlds, alpha };
}

/** N independent binary nodes at P(first option)=p, as the full product distribution over 2^N worlds. */
function productBelief(n: number, p: number, consequence = 3): { belief: Belief; ids: string[] } {
  const ids = Array.from({ length: n }, (_, i) => `n${i}`);
  const nodes = ids.map((id) => mkNode(id, [`${id}_a`, `${id}_b`], consequence));
  const worlds: World[] = [];
  for (let mask = 0; mask < 1 << n; mask++) {
    const assignment: Record<string, string> = {};
    let weight = 1;
    for (let i = 0; i < n; i++) {
      const first = (mask & (1 << i)) === 0;
      assignment[ids[i]!] = first ? `${ids[i]}_a` : `${ids[i]}_b`;
      weight *= first ? p : 1 - p;
    }
    worlds.push(mkWorld(assignment, weight));
  }
  return { belief: mkBelief(nodes, worlds), ids };
}

describe("composeVerifyProbes", () => {
  // Two nodes, marginals A=a1 0.8 / B=b1 0.7, joint(a1∧b1)=0.5 — verifiable entirely by hand.
  function handBelief() {
    const nodes = [mkNode("A", ["a1", "a2"]), mkNode("B", ["b1", "b2"])];
    const worlds = [
      mkWorld({ A: "a1", B: "b1" }, 0.4),
      mkWorld({ A: "a1", B: "b2" }, 0.3),
      mkWorld({ A: "a2", B: "b1" }, 0.2),
      mkWorld({ A: "a1", B: "b1" }, 0.1),
    ];
    return mkBelief(nodes, worlds);
  }

  it("computes the joint p over particles exactly (hand-checked), with the documented expected_bits formula", () => {
    const probes = composeVerifyProbes(handBelief(), ["A", "B"]);
    expect(probes).toHaveLength(1);
    const p = probes[0]!;
    expect(p.id).toBe("v1");
    expect(new Set(p.nodes.map((n) => n.id))).toEqual(new Set(["A", "B"]));
    expect(p.nodes.find((n) => n.id === "A")!.option).toBe("a1");
    expect(p.nodes.find((n) => n.id === "B")!.option).toBe("b1");
    expect(p.p_all_correct).toBeCloseTo(0.5, 10);
    expect(p.consequence).toBe(6);
    // H(0.5) + 0.5·log2(2) = 1 + 0.5
    expect(p.expected_bits).toBeCloseTo(1.5, 10);
  });

  it("respects consequenceOverride for ordering and the consequence sum", () => {
    const probes = composeVerifyProbes(handBelief(), ["A", "B"], { consequenceOverride: { A: 5, B: 0 } });
    expect(probes).toHaveLength(1);
    expect(probes[0]!.nodes[0]!.id).toBe("A"); // A now leads the greedy order (5·0.2 > 0·0.3)
    expect(probes[0]!.consequence).toBe(5);
  });

  it("returns only in-band probes when any exist, and stays within the band", () => {
    const { belief, ids } = productBelief(6, 0.9);
    const probes = composeVerifyProbes(belief, ids);
    expect(probes.length).toBeGreaterThan(0);
    for (const p of probes) {
      expect(p.p_all_correct).toBeGreaterThanOrEqual(0.35);
      expect(p.p_all_correct).toBeLessThanOrEqual(0.65);
    }
  });

  it("targets 0.5: bundles six independent 0.9-nodes down to joint ≈ 0.53 rather than probing near-certainties singly", () => {
    const { belief, ids } = productBelief(6, 0.9);
    const probes = composeVerifyProbes(belief, ids);
    expect(probes).toHaveLength(1);
    expect(probes[0]!.nodes).toHaveLength(6);
    expect(probes[0]!.p_all_correct).toBeCloseTo(0.9 ** 6, 10);
  });

  it("prefers a mid-probability bundle over a near-certain node, which is dropped when out of band", () => {
    // H,I at 0.7 (joint 0.49), G at 0.9 with consequence 5 — G scores lower and its probe is out of band.
    const ids = ["H", "I", "G"];
    const nodes = [mkNode("H", ["h1", "h2"]), mkNode("I", ["i1", "i2"]), mkNode("G", ["g1", "g2"], 5)];
    const worlds: World[] = [];
    for (const h of [0, 1])
      for (const i of [0, 1])
        for (const g of [0, 1])
          worlds.push(
            mkWorld({ H: h ? "h2" : "h1", I: i ? "i2" : "i1", G: g ? "g2" : "g1" }, (h ? 0.3 : 0.7) * (i ? 0.3 : 0.7) * (g ? 0.1 : 0.9)),
          );
    const probes = composeVerifyProbes(mkBelief(nodes, worlds), ids);
    expect(probes).toHaveLength(1);
    expect(new Set(probes[0]!.nodes.map((n) => n.id))).toEqual(new Set(["H", "I"]));
    expect(probes[0]!.p_all_correct).toBeCloseTo(0.49, 10);
    expect(probes.some((p) => p.nodes.some((n) => n.id === "G"))).toBe(false);
  });

  it("produces disjoint probes and honors maxProbes", () => {
    // Two fully correlated worlds: every node alone sits at p=0.5 (in band), so each becomes its own probe.
    const ids = ["A", "B", "C", "D"];
    const nodes = ids.map((id) => mkNode(id, [`${id}1`, `${id}2`]));
    const worlds = [
      mkWorld(Object.fromEntries(ids.map((id) => [id, `${id}1`])), 0.5),
      mkWorld(Object.fromEntries(ids.map((id) => [id, `${id}2`])), 0.5),
    ];
    const belief = mkBelief(nodes, worlds);
    const probes = composeVerifyProbes(belief, ids);
    expect(probes).toHaveLength(4);
    const seen = new Set<string>();
    for (const p of probes)
      for (const n of p.nodes) {
        expect(seen.has(n.id)).toBe(false);
        seen.add(n.id);
      }
    expect(composeVerifyProbes(belief, ids, { maxProbes: 2 })).toHaveLength(2);
  });

  it("is deterministic", () => {
    const { belief, ids } = productBelief(5, 0.85);
    const a = composeVerifyProbes(belief, ids);
    const b = composeVerifyProbes(belief, ids);
    expect(b).toEqual(a);
  });

  it("honors maxSize (falling back to the closest single probe when the cap keeps every bundle out of band)", () => {
    const { belief, ids } = productBelief(6, 0.9);
    const probes = composeVerifyProbes(belief, ids, { maxSize: 3 });
    for (const p of probes) expect(p.nodes.length).toBeLessThanOrEqual(3);
    // 0.9³ = 0.729 > 0.65 for every disjoint triple → nothing in band → single fallback probe
    expect(probes).toHaveLength(1);
    expect(probes[0]!.p_all_correct).toBeCloseTo(0.9 ** 3, 10);
  });

  it("degenerate case: no bundle can reach the band → the single best sub-band probe, never none", () => {
    // Two 4-option nodes whose argmax sits at 0.3 — below band[0]; adding can only lower p.
    const nodes = [mkNode("J", ["j1", "j2", "j3", "j4"]), mkNode("K", ["k1", "k2", "k3", "k4"])];
    const worlds = [
      mkWorld({ J: "j1", K: "k1" }, 0.3),
      mkWorld({ J: "j2", K: "k2" }, 0.25),
      mkWorld({ J: "j3", K: "k3" }, 0.25),
      mkWorld({ J: "j4", K: "k4" }, 0.2),
    ];
    const probes = composeVerifyProbes(mkBelief(nodes, worlds), ["J", "K"]);
    expect(probes).toHaveLength(1);
    expect(probes[0]!.nodes).toHaveLength(1);
    expect(probes[0]!.p_all_correct).toBeCloseTo(0.3, 10);
  });

  it("skips candidates whose argmax has zero particle support (prior-only nodes)", () => {
    // alpha-mixed argmax is q3 (prior-only) while the particles split q1/q2: unverifiable against worlds.
    const nodes = [mkNode("Q", ["q1", "q2", "q3"], 3, { q1: 0, q2: 0, q3: 1 }), mkNode("A", ["a1", "a2"])];
    const worlds = [mkWorld({ Q: "q1", A: "a1" }, 0.5), mkWorld({ Q: "q2", A: "a2" }, 0.5)];
    const belief = mkBelief(nodes, worlds, 2);
    expect(composeVerifyProbes(belief, ["Q"])).toHaveLength(0);
    const probes = composeVerifyProbes(belief, ["Q", "A"]);
    expect(probes.length).toBeGreaterThan(0);
    for (const p of probes) expect(p.nodes.some((n) => n.id === "Q")).toBe(false);
  });

  it("uses near-certain nodes as filler riding along a mid bundle, but never emits an all-filler probe", () => {
    const nodes = [mkNode("S", ["s1", "s2"]), mkNode("R", ["r1", "r2"])];
    const worlds = [mkWorld({ S: "s1", R: "r1" }, 0.49), mkWorld({ S: "s1", R: "r2" }, 0.01), mkWorld({ S: "s2", R: "r1" }, 0.5)];
    const belief = mkBelief(nodes, worlds);
    // sanity: R is filler-grade
    expect(0.99).toBeGreaterThanOrEqual(VERIFY_FILLER_TAU);
    const probes = composeVerifyProbes(belief, ["S", "R"]);
    expect(probes).toHaveLength(1);
    expect(new Set(probes[0]!.nodes.map((n) => n.id))).toEqual(new Set(["S", "R"])); // filler rides along (Δp = 0.01)
    expect(probes[0]!.p_all_correct).toBeCloseTo(0.49, 10);
    // filler alone can seed nothing: the particle joint would call it certain (see verify.ts header)
    expect(composeVerifyProbes(belief, ["R"])).toHaveLength(0);
  });
});

describe("reweightOnVerify", () => {
  const worlds = [
    mkWorld({ A: "a1", B: "b1" }, 0.4),
    mkWorld({ A: "a1", B: "b2" }, 0.3),
    mkWorld({ A: "a2", B: "b1" }, 0.2),
    mkWorld({ A: "a1", B: "b1" }, 0.1),
  ];
  const bundle = [
    { id: "A", option: "a1" },
    { id: "B", option: "b1" },
  ];

  it("acceptance downweights every world disagreeing with ANY bundled assignment; mass renormalized to 1", () => {
    const out = reweightOnVerify(worlds, bundle, true, 0.1);
    expect(out.reduce((s, w) => s + w.weight, 0)).toBeCloseTo(1, 10);
    // pre-norm: 0.4, 0.03, 0.02, 0.1 → total 0.55
    expect(out[0]!.weight).toBeCloseTo(0.4 / 0.55, 10);
    expect(out[1]!.weight).toBeCloseTo(0.03 / 0.55, 10);
    expect(out[2]!.weight).toBeCloseTo(0.02 / 0.55, 10);
    expect(out[3]!.weight).toBeCloseTo(0.1 / 0.55, 10);
    // input untouched (pure)
    expect(worlds[1]!.weight).toBe(0.3);
  });

  it("rejection downweights every world agreeing with ALL bundled assignments; mass renormalized to 1", () => {
    const out = reweightOnVerify(worlds, bundle, false, 0.1);
    expect(out.reduce((s, w) => s + w.weight, 0)).toBeCloseTo(1, 10);
    // pre-norm: 0.04, 0.3, 0.2, 0.01 → total 0.55
    expect(out[0]!.weight).toBeCloseTo(0.04 / 0.55, 10);
    expect(out[1]!.weight).toBeCloseTo(0.3 / 0.55, 10);
    expect(out[2]!.weight).toBeCloseTo(0.2 / 0.55, 10);
    expect(out[3]!.weight).toBeCloseTo(0.01 / 0.55, 10);
  });

  it("never zeroes support (epsilon keeps disagreeing worlds alive) and treats undefined assignments as agreeing", () => {
    const ws = [mkWorld({ A: "a1" }, 0.5), mkWorld({}, 0.5)];
    const out = reweightOnVerify(ws, [{ id: "A", option: "a2" }], true, 0.05);
    // w1 disagrees (×0.05); w2 has no assignment → agrees (conditionSoft convention)
    expect(out[0]!.weight).toBeGreaterThan(0);
    expect(out[0]!.weight).toBeCloseTo(0.025 / 0.525, 10);
    expect(out[1]!.weight).toBeCloseTo(0.5 / 0.525, 10);
  });
});
