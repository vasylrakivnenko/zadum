import { describe, it, expect } from "vitest";
import { mergeCatalogs, propagateHard, CatalogSchema } from "./catalog.js";
import { distribution, conditionSoft, ess, repairAssignment, type Belief, makeWorld } from "./worlds.js";
import {
  decideNext,
  rankOpen,
  impliedByUpdate,
  settledness,
  resolveConfig,
  mergeConfig,
  valueOfAsking,
  valueWithLookahead,
  DEFAULT_SELECTOR_CONFIG,
  DEFAULT_THETA,
} from "./selector.js";
import { makeWorld as mkWorld } from "./worlds.js";
import type { NodeDef } from "./catalog.js";

const catalog = CatalogSchema.parse({
  id: "test",
  version: "1",
  archetype: "core",
  nodes: [
    {
      id: "client_login",
      topic: "client access",
      question: "Do clients log in?",
      options: [
        { id: "no", label: "no login", implies: [{ node: "client_portal", option: "none" }] },
        { id: "yes", label: "clients log in" },
      ],
      consequence: 5,
      sections: ["permissions", "data_model"],
      applies_to: [],
      tags: [],
    },
    {
      id: "client_portal",
      topic: "client access",
      question: "Is there a client portal?",
      options: [
        { id: "none", label: "no portal" },
        { id: "portal", label: "portal" },
      ],
      consequence: 4,
      sections: ["journeys"],
      applies_to: [],
      tags: [],
    },
    {
      id: "currency",
      topic: "money",
      question: "Multi-currency?",
      options: [
        { id: "single", label: "one currency" },
        { id: "multi", label: "many" },
      ],
      consequence: 2,
      prior: { single: 0.9, multi: 0.1 },
      sections: ["data_model"],
      applies_to: [],
      tags: [],
    },
    {
      id: "theme",
      topic: "looks",
      question: "Dark mode?",
      options: [
        { id: "no", label: "no" },
        { id: "yes", label: "yes" },
      ],
      consequence: 1,
      sections: [],
      applies_to: [],
      tags: [],
    },
  ],
});

function belief(): Belief {
  const { nodes, errors } = mergeCatalogs([catalog], []);
  expect(errors).toEqual([]);
  // 4 worlds: login & portal perfectly correlated; currency mostly single; theme split
  const worlds = [
    makeWorld("w1", { client_login: "yes", client_portal: "portal", currency: "single", theme: "yes" }, 0.25, "sampled"),
    makeWorld("w2", { client_login: "yes", client_portal: "portal", currency: "single", theme: "no" }, 0.25, "sampled"),
    makeWorld("w3", { client_login: "no", client_portal: "none", currency: "single", theme: "yes" }, 0.25, "sampled"),
    makeWorld("w4", { client_login: "no", client_portal: "none", currency: "multi", theme: "no" }, 0.25, "sampled"),
  ];
  return { nodes, worlds, alpha: 0.08 };
}

describe("belief + selector", () => {
  it("computes distributions mixed with the prior", () => {
    const b = belief();
    const d = distribution(b, "currency");
    expect(d.single).toBeGreaterThan(0.7);
    expect(d.single! + d.multi!).toBeCloseTo(1, 6);
  });

  it("ranks the high-consequence, high-disagreement, high-blast-radius node first", () => {
    const b = belief();
    const open = ["client_login", "client_portal", "currency", "theme"];
    const ranked = rankOpen(b, open, undefined, "risk");
    expect(ranked[0]!.nodeId).toBe("client_login");
    // share = fraction of all remaining uncertainty this one card would remove
    for (const r of ranked) expect(r.share).toBeGreaterThanOrEqual(0), expect(r.share).toBeLessThanOrEqual(1);
    expect(ranked[0]!.share).toBeGreaterThan(ranked.at(-1)!.share);
    // asking login also resolves portal (correlated) so its value exceeds its direct error alone
    const loginDirect = 5 * (1 - ranked[0]!.maxP);
    expect(ranked[0]!.value).toBeGreaterThan(loginDirect + 0.5);
    // theme: low consequence → low value
    expect(ranked.at(-1)!.nodeId).toBe("theme");
    expect(valueOfAsking(b, "theme", open, undefined, "risk")).toBeLessThan(1);
  });

  it("answering one card implies correlated decisions and converges", () => {
    const b0 = belief();
    const open = ["client_login", "client_portal", "currency", "theme"];
    // theta is an ABSOLUTE price per question, so it must match the scale of the decision set: the shipped
    // default is calibrated for a ~45-node catalog and would (correctly) stop immediately on this 4-node toy.
    // Smaller apps asking fewer cards is the intended behaviour, not a bug — see DEFAULT_THETA.
    const cfg = resolveConfig({ theta: 1.5 });
    const first = decideNext(b0, open, cfg, 0);
    expect(first.action).toBe("ask");
    expect(decideNext(b0, open, DEFAULT_SELECTOR_CONFIG, 0).action).toBe("stop");
    const b1: Belief = { ...b0, worlds: conditionSoft(b0.worlds, "client_login", "yes", 0.05) };
    const implied = impliedByUpdate(b0, b1, ["client_portal", "currency", "theme"], 0.9);
    // portal is perfectly correlated (hard-edge-like); currency crosses tau softly because the only
    // multi-currency world was a no-login world — with 4 worlds that correlation is strong. Both stop being askable.
    expect(implied.map((i) => i.nodeId)).toEqual(["client_portal", "currency"]);
    expect(implied[0]!.option).toBe("portal");
    const openAfter = ["theme"];
    const next = decideNext(b1, openAfter, cfg, 1);
    // theme alone (c=1, 50/50) → exactly 1 bit of consequence-weighted entropy, below θ=1.5 → converged
    expect(next.action).toBe("stop");
    if (next.action === "stop") expect(next.reason).toBe("converged");
    expect(settledness(b1, open)).toBeGreaterThan(settledness(b0, open));
    expect(ess(b1.worlds)).toBeLessThan(ess(b0.worlds));
  });

  it("supports information-theoretic scorings (weighted entropy, joint world entropy)", () => {
    const b = belief();
    const open = ["client_login", "client_portal", "currency", "theme"];
    const byEntropy = rankOpen(b, open, undefined, "weighted_entropy");
    expect(byEntropy[0]!.nodeId).toBe("client_login");
    const byJoint = rankOpen(b, open, undefined, "joint_entropy");
    // login splits the 4 worlds 2/2 and is perfectly informative about portal → ~1 bit; theme also splits 2/2 → 1 bit;
    // joint entropy is consequence-blind, so both are top candidates; ties break by consequence desc.
    expect(byJoint[0]!.nodeId).toBe("client_login");
    expect(byJoint[0]!.value).toBeGreaterThan(0.9);
    expect(byJoint.find((r) => r.nodeId === "theme")!.value).toBeGreaterThan(0.9);
    // currency is mostly single → little information
    expect(byJoint.find((r) => r.nodeId === "currency")!.value).toBeLessThan(byJoint[0]!.value);
  });

  it("stops at the hard cap", () => {
    const b = belief();
    const r = decideNext(b, ["client_login"], resolveConfig({ theta: 1.5 }), 12);
    expect(r.action).toBe("stop");
    if (r.action === "stop") expect(r.reason).toBe("max_cards");
  });
});

describe("catalog hard edges", () => {
  it("propagates implications to a fixpoint and reports conflicts", () => {
    const { nodes } = mergeCatalogs([catalog], []);
    const p = propagateHard({ client_login: "no" }, nodes);
    expect(p.assignment.client_portal).toBe("none");
    expect(p.derived.client_portal?.because).toBe("client_login=no");
    const c = propagateHard({ client_login: "no", client_portal: "portal" }, nodes);
    expect(c.conflicts).toHaveLength(1);
  });

  it("repairs LLM-proposed assignments (labels → ids, fill gaps, hard edges)", () => {
    const { nodes } = mergeCatalogs([catalog], []);
    const r = repairAssignment({ client_login: "no login", bogus: "x" }, nodes);
    expect(r.assignment.client_login).toBe("no");
    expect(r.assignment.client_portal).toBe("none");
    expect(r.assignment.currency).toBe("single");
    expect(Object.keys(r.assignment).sort()).toEqual(["client_login", "client_portal", "currency", "theme"]);
  });

  it("filters archetype-specific nodes and validates edges on merge", () => {
    const extra = CatalogSchema.parse({
      id: "inv",
      version: "1",
      archetype: "invoicing",
      nodes: [
        {
          id: "late_fees",
          topic: "money",
          question: "Late fees?",
          options: [
            { id: "no", label: "no", implies: [] },
            { id: "yes", label: "yes", implies: [{ node: "missing", option: "x" }] },
          ],
          consequence: 2,
          sections: [],
          applies_to: [],
          tags: [],
        },
      ],
    });
    expect(mergeCatalogs([catalog, extra], []).nodes.map((n) => n.id)).not.toContain("late_fees");
    const m = mergeCatalogs([catalog, extra], ["invoicing"]);
    expect(m.nodes.map((n) => n.id)).toContain("late_fees");
    expect(m.errors[0]).toMatch(/unknown node missing/);
  });
});

// ---------- config, lookahead, and the ranking/stopping split ----------

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

/**
 * Eight equally likely worlds, built so greedy and two-ply disagree about the FIRST question:
 *  - `m` (c=5) has the highest immediate value, but answering it leaves little behind;
 *  - `x`/`z`/`n` are individually weaker, yet each opens a branch in which `m` becomes a wide-open,
 *    high-consequence question — so the two-question total is higher if you ask one of them first.
 */
function lookaheadBelief() {
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
  const worlds = rows.map((r, i) => mkWorld(`w${i}`, { x: r[0]!, z: r[1]!, m: r[2]!, n: r[3]! }, 1 / rows.length, "sampled"));
  return { nodes, worlds, alpha: 0 };
}

describe("selector config", () => {
  it("defaults to consequence-weighted information gain, with theta following the scoring", () => {
    expect(DEFAULT_SELECTOR_CONFIG.scoring).toBe("weighted_entropy");
    expect(DEFAULT_SELECTOR_CONFIG.theta).toBe(DEFAULT_THETA.weighted_entropy);
    expect(resolveConfig({ scoring: "joint_entropy" }).theta).toBe(DEFAULT_THETA.joint_entropy);
    expect(resolveConfig({ scoring: "risk" }).theta).toBe(DEFAULT_THETA.risk);
    // an explicit theta always wins
    expect(resolveConfig({ scoring: "risk", theta: 0.1 }).theta).toBe(0.1);
    // partial/legacy configs are filled in
    expect(resolveConfig({ theta: 2 }).lookahead).toBe(1);
    expect(resolveConfig().maxCards).toBe(12);
  });

  it("ignores explicitly-undefined keys instead of erasing the computed default", () => {
    // Regression: `{...partial}` re-applied `theta: undefined` OVER the computed default, and `value1 <
    // undefined` is false forever — the card loop could then only ever stop at the 12-card cap.
    const cfg = resolveConfig({ scoring: "risk", theta: undefined, maxCards: undefined });
    expect(cfg.theta).toBe(DEFAULT_THETA.risk);
    expect(cfg.maxCards).toBe(12);
    const b = belief();
    expect(decideNext(b, ["theme"], cfg, 0).action).toBe("stop");
  });
});

describe("mergeConfig (stored session + this run's overrides)", () => {
  const stored = resolveConfig({ scoring: "risk" }); // a project created with --scoring risk: theta 7

  it("keeps theta in the units of whichever scoring ends up in force", () => {
    // Regression: resuming a `risk` project with no flags used to compare risk-scale values (θ≈7) against
    // weighted_entropy's θ=24, stopping the session after a single card.
    expect(mergeConfig(stored, {}).scoring).toBe("risk");
    expect(mergeConfig(stored, {}).theta).toBe(DEFAULT_THETA.risk);
    // switching scoring mid-project re-bases theta rather than carrying the old scoring's number over
    const switched = mergeConfig(stored, { scoring: "weighted_entropy" });
    expect(switched.theta).toBe(DEFAULT_THETA.weighted_entropy);
  });

  it("lets an explicit theta win over both the stored value and the thoroughness dial", () => {
    expect(mergeConfig(stored, { theta: 3 }).theta).toBe(3);
    expect(mergeConfig(stored, { theta: 3 }, { thetaMultiplier: 1.4 }).theta).toBe(3);
  });

  it("scales the effective scoring's calibrated theta with the thoroughness multiplier", () => {
    expect(mergeConfig(stored, {}, { thetaMultiplier: 1.4 }).theta).toBeCloseTo(DEFAULT_THETA.risk * 1.4, 9);
    expect(mergeConfig({}, {}, { thetaMultiplier: 0.55 }).theta).toBeCloseTo(DEFAULT_THETA.weighted_entropy * 0.55, 9);
  });

  it("carries other stored fields forward and lets overrides win", () => {
    expect(mergeConfig({ ...stored, lookahead: 2 }, {}).lookahead).toBe(2);
    expect(mergeConfig({ ...stored, lookahead: 2 }, { lookahead: 1 }).lookahead).toBe(1);
    expect(mergeConfig(stored, { scoring: undefined, theta: undefined }).theta).toBe(DEFAULT_THETA.risk);
  });
});

describe("options no particle holds", () => {
  it("does not credit an unsupported option with perfect certainty", () => {
    // Regression: hard-conditioning on an option no world holds empties the particle set, and an empty set has
    // zero world-entropy — which read as "answering this way makes everything certain" and inflated the score
    // of exactly those nodes whose options the sampler never produced. `hypothetical()` now falls back to the
    // unchanged belief, which is also what soft ε-conditioning really does at answer time.
    const { nodes } = mergeCatalogs([catalog], []);
    // every world says currency=single, so "multi" survives only through the alpha-prior mix
    const worlds = [
      makeWorld("w1", { client_login: "yes", client_portal: "portal", currency: "single", theme: "yes" }, 0.5, "sampled"),
      makeWorld("w2", { client_login: "no", client_portal: "none", currency: "single", theme: "no" }, 0.5, "sampled"),
    ];
    const b: Belief = { nodes, worlds, alpha: 0.08 };
    const open = ["client_login", "client_portal", "currency", "theme"];
    expect(distribution(b, "currency").multi).toBeGreaterThan(0);
    for (const scoring of ["joint_entropy", "weighted_entropy", "risk"] as const) {
      const currency = valueOfAsking(b, "currency", open, undefined, scoring);
      const login = valueOfAsking(b, "client_login", open, undefined, scoring);
      // asking about a decision every world agrees on must be worth less than the genuinely contested one
      expect(currency).toBeLessThan(login);
    }
    // and specifically: joint_entropy gain stays bounded by the belief's own world-entropy (1 bit here)
    expect(valueOfAsking(b, "currency", open, undefined, "joint_entropy")).toBeLessThan(0.5);
  });
});

describe("lookahead (two plies of the optimal decision tree)", () => {
  it("two-ply value is never below one-step value", () => {
    const b = lookaheadBelief();
    const open = ["x", "z", "m", "n"];
    for (const s of ["risk", "weighted_entropy", "joint_entropy"] as const)
      for (const id of open)
        expect(valueWithLookahead(b, id, open, undefined, s, 1)).toBeGreaterThanOrEqual(valueOfAsking(b, id, open, undefined, s) - 1e-9);
  });

  it("reorders the first question when the greedy pick leaves nothing behind", () => {
    const b = lookaheadBelief();
    const open = ["x", "z", "m", "n"];
    for (const s of ["risk", "weighted_entropy"] as const) {
      const greedy = rankOpen(b, open, undefined, { scoring: s });
      const twoPly = rankOpen(b, open, undefined, { scoring: s, lookahead: 2 });
      expect(greedy[0]!.nodeId).toBe("m");
      expect(twoPly[0]!.nodeId).not.toBe("m");
      expect(twoPly[0]!.value).toBeGreaterThan(greedy[0]!.value);
    }
  });

  it("deepens only the top candidates and keeps ranking deterministic", () => {
    const b = lookaheadBelief();
    const open = ["x", "z", "m", "n"];
    const r = rankOpen(b, open, undefined, { scoring: "weighted_entropy", lookahead: 2, lookaheadTop: 2 });
    expect(r.filter((x) => x.deepened).length).toBe(2);
    for (const x of r) if (!x.deepened) expect(x.value).toBe(x.value1);
    const again = rankOpen(b, open, undefined, { scoring: "weighted_entropy", lookahead: 2, lookaheadTop: 2 });
    expect(again.map((x) => x.nodeId)).toEqual(r.map((x) => x.nodeId));
  });

  it("stopping uses the one-step value, so theta means the same thing at either depth", () => {
    const b = lookaheadBelief();
    const open = ["x", "z", "m", "n"];
    // theta above every one-step value but below the two-ply values → must still stop
    const theta = 6;
    const greedyStop = decideNext(b, open, resolveConfig({ scoring: "weighted_entropy", theta, lookahead: 1 }), 0);
    const deepStop = decideNext(b, open, resolveConfig({ scoring: "weighted_entropy", theta, lookahead: 2 }), 0);
    expect(greedyStop.action).toBe("stop");
    expect(deepStop.action).toBe("stop");
    if (deepStop.action === "stop") expect(deepStop.reason).toBe("converged");
    // and both ask when theta is low
    expect(decideNext(b, open, resolveConfig({ scoring: "weighted_entropy", theta: 0.1, lookahead: 2 }), 0).action).toBe("ask");
  });
});
