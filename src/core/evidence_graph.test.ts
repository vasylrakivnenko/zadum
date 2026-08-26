import { describe, expect, it } from "vitest";
import type { NodeDef } from "./catalog.js";
import { conditionSoft, distribution, type Belief, type World } from "./worlds.js";
import { DESIGN_GRAPH_SCHEMA, type DesignGraph, type GraphEdge } from "../learning/design_graph.js";
import {
  applyGraphWeights,
  explainEdge,
  graphLikelihood,
  graphNeverOutvotesAnswer,
  isGraphWeighted,
  DEFAULT_MAX_ODDS,
  DEFAULT_MAX_TOTAL_ODDS,
  DEFAULT_SUPPORT_N0,
} from "./evidence_graph.js";

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

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

let wSeq = 0;
function mkWorld(assignment: Record<string, string>, weight: number): World {
  return { id: `w${++wSeq}`, assignment, weight, origin: "sampled" };
}

/** A confident soft_positive edge: n=300, p(B)=0.40, p(B|A)=0.80, a narrow interval. */
function mkEdge(over: Partial<GraphEdge> & Pick<GraphEdge, "from" | "to">): GraphEdge {
  return {
    relation: "soft_positive",
    status: "candidate",
    archetype: null,
    source_kind: null,
    p_from: 0.5,
    p_to: 0.4,
    p_to_given_from: 0.8,
    lift: 2,
    difference: 0.4,
    ci95: { low: 0.72, high: 0.86 },
    eligible_n: 300,
    support_row_ids: [],
    simpsons_warning: null,
    note: null,
    ...over,
  };
}

function mkGraph(edges: GraphEdge[], version = "graph-test-1"): DesignGraph {
  return {
    schema: DESIGN_GRAPH_SCHEMA,
    version,
    catalog_version: "",
    matrix_version: "",
    lexicon_version: "",
    created_at: "",
    provenance: { label_models: [], label_prompt_versions: [], source_kinds: [], archetypes: [], rows: 0 },
    thresholds: { reportMinN: 10, softMinN: 30, hardMinN: 100, hardMinLowerBound: 0.995, smoothing: { a: 0.5, b: 0.5 } },
    edges,
    elements: [],
  };
}

const byId = (ws: World[]) => Object.fromEntries(ws.map((w) => [w.id, w.weight]));

// ---------------------------------------------------------------------------

describe("graphLikelihood", () => {
  it("up-weights a world satisfying a soft_positive edge and down-weights one violating it", () => {
    const edges = [mkEdge({ from: "pay=online", to: "hooks=yes" })];
    const satisfied = graphLikelihood({ pay: "online", hooks: "yes" }, edges);
    const violated = graphLikelihood({ pay: "online", hooks: "no" }, edges);
    expect(satisfied).toBeGreaterThan(1);
    expect(violated).toBeLessThan(1);
    expect(satisfied).toBeGreaterThan(violated);
  });

  it("leaves a world without the antecedent EXACTLY unaffected (identity, not approximately)", () => {
    const edges = [mkEdge({ from: "pay=online", to: "hooks=yes" })];
    // no `pay` at all, `pay` set to another option, and `pay` present but `hooks` not arising in this world
    expect(graphLikelihood({ hooks: "yes" }, edges)).toBe(1);
    expect(graphLikelihood({ pay: "none", hooks: "yes" }, edges)).toBe(1);
    expect(graphLikelihood({ pay: "none", hooks: "no" }, edges)).toBe(1);
    // the consequent's decision does not arise here: unobserved is not a negative
    expect(graphLikelihood({ pay: "online" }, edges)).toBe(1);
  });

  it("mirrors for soft_negative: A-and-B loses, A-and-not-B gains", () => {
    const edges = [mkEdge({ from: "scale=tiny", to: "sso=required", relation: "soft_negative", p_to: 0.5, p_to_given_from: 0.1, difference: -0.4, lift: 0.2, ci95: { low: 0.05, high: 0.18 } })];
    const withB = graphLikelihood({ scale: "tiny", sso: "required" }, edges);
    const withoutB = graphLikelihood({ scale: "tiny", sso: "optional" }, edges);
    expect(withB).toBeLessThan(1);
    expect(withoutB).toBeGreaterThan(1);
    expect(graphLikelihood({ scale: "large", sso: "required" }, edges)).toBe(1);
  });

  it("never enforces a hard rule: hard and unknown edges contribute nothing", () => {
    for (const relation of ["hard_implies", "hard_excludes", "equivalent", "unknown"] as const) {
      const edges = [mkEdge({ from: "pay=online", to: "hooks=yes", relation, status: relation === "unknown" ? "candidate" : "authored" })];
      expect(graphLikelihood({ pay: "online", hooks: "no" }, edges)).toBe(1);
      expect(graphLikelihood({ pay: "online", hooks: "yes" }, edges)).toBe(1);
    }
  });

  it("scales influence by support: a 30-row edge moves belief less than the same edge at 300 rows", () => {
    const at = (n: number) => graphLikelihood({ pay: "online", hooks: "yes" }, [mkEdge({ from: "pay=online", to: "hooks=yes", eligible_n: n })]);
    const tiny = at(30);
    const large = at(300);
    expect(tiny).toBeGreaterThan(1);
    expect(large).toBeGreaterThan(tiny);
    // n/(n+n0) with n0 = 30: half weight at n = 30, ~0.91 at n = 300
    expect(Math.log(tiny) / Math.log(large)).toBeCloseTo(0.5 / (300 / (300 + DEFAULT_SUPPORT_N0)), 6);
    expect(at(0)).toBe(1); // no support, no evidence
  });

  it("clamps an absurd edge (p(B|A)=1, p(B)=0.001) into the documented odds band instead of pinning the world", () => {
    const edges = [mkEdge({ from: "pay=online", to: "hooks=yes", p_to: 0.001, p_to_given_from: 1, lift: 1000, difference: 0.999, eligible_n: 1e6 })];
    // raw ratios would be 1000× and 0×; the band is [1/3, 3] before shrinkage
    const satisfied = graphLikelihood({ pay: "online", hooks: "yes" }, edges, { supportN0: 0 });
    const violated = graphLikelihood({ pay: "online", hooks: "no" }, edges, { supportN0: 0 });
    expect(satisfied).toBeCloseTo(DEFAULT_MAX_ODDS, 10);
    expect(violated).toBeCloseTo(1 / DEFAULT_MAX_ODDS, 10);
    expect(violated).toBeGreaterThan(0); // a raw 0 would have deleted the world
    // with shrinkage on (the default) it is strictly inside the band
    expect(graphLikelihood({ pay: "online", hooks: "yes" }, edges)).toBeLessThanOrEqual(DEFAULT_MAX_ODDS);
    expect(graphLikelihood({ pay: "online", hooks: "no" }, edges)).toBeGreaterThanOrEqual(1 / DEFAULT_MAX_ODDS);
  });

  it("bounds the WHOLE edge set, so naive-Bayes stacking cannot run away", () => {
    const hostile = Array.from({ length: 60 }, (_, i) => mkEdge({ from: "pay=online", to: `f${i}=yes`, p_to: 0.001, p_to_given_from: 1 }));
    const asg: Record<string, string> = { pay: "online" };
    for (let i = 0; i < 60; i++) asg[`f${i}`] = "yes";
    const all = graphLikelihood(asg, hostile);
    expect(all).toBeCloseTo(DEFAULT_MAX_TOTAL_ODDS, 10);
    const none: Record<string, string> = { pay: "online" };
    for (let i = 0; i < 60; i++) none[`f${i}`] = "no";
    const opposite = graphLikelihood(none, hostile);
    expect(opposite).toBeCloseTo(1 / DEFAULT_MAX_TOTAL_ODDS, 10);
    expect(opposite).toBeGreaterThan(0);
  });
});

describe("applyGraphWeights", () => {
  const edges = [mkEdge({ from: "pay=online", to: "hooks=yes" })];
  const graph = mkGraph(edges);

  it("a satisfying world gains weight relative to a violating one", () => {
    const worlds = [mkWorld({ pay: "online", hooks: "yes" }, 0.5), mkWorld({ pay: "online", hooks: "no" }, 0.5)];
    const out = applyGraphWeights(worlds, graph);
    expect(out[0]!.weight).toBeGreaterThan(out[1]!.weight);
    expect(out.every(isGraphWeighted)).toBe(true);
  });

  it("worlds without the antecedent keep their relative weights exactly", () => {
    const neutralA = mkWorld({ pay: "none", hooks: "yes" }, 0.2);
    const neutralB = mkWorld({ pay: "none", hooks: "no" }, 0.3);
    const touched = mkWorld({ pay: "online", hooks: "yes" }, 0.5);
    const out = applyGraphWeights([neutralA, neutralB, touched], graph);
    expect(out[0]!.weight / out[1]!.weight).toBeCloseTo(0.2 / 0.3, 12);
    expect(out[2]!.weight).toBeGreaterThan(0.5); // the only world the edge speaks about moved up
  });

  it("normalizes to a total of 1", () => {
    const worlds = [mkWorld({ pay: "online", hooks: "yes" }, 3), mkWorld({ pay: "online", hooks: "no" }, 1), mkWorld({ pay: "none", hooks: "no" }, 6)];
    const out = applyGraphWeights(worlds, graph);
    expect(out.reduce((s, w) => s + w.weight, 0)).toBeCloseTo(1, 12);
  });

  it("never deletes a world or drives one to zero, even under many hostile edges", () => {
    const hostile = Array.from({ length: 80 }, (_, i) => mkEdge({ from: "pay=online", to: `f${i}=yes`, p_to: 0.001, p_to_given_from: 1, eligible_n: 5000 }));
    const bad: Record<string, string> = { pay: "online" };
    const good: Record<string, string> = { pay: "online" };
    for (let i = 0; i < 80; i++) {
      bad[`f${i}`] = "no";
      good[`f${i}`] = "yes";
    }
    const worlds = [mkWorld(bad, 0.5), mkWorld(good, 0.5)];
    const out = applyGraphWeights(worlds, mkGraph(hostile));
    expect(out).toHaveLength(2);
    for (const w of out) {
      expect(w.weight).toBeGreaterThan(0);
      expect(Number.isFinite(w.weight)).toBe(true);
    }
    // shrunken, but still a live particle the selector can revive
    expect(out[0]!.weight).toBeLessThan(out[1]!.weight);
  });

  it("applying twice is a NO-OP: the second call returns the first result byte-identically", () => {
    const worlds = [mkWorld({ pay: "online", hooks: "yes" }, 0.5), mkWorld({ pay: "online", hooks: "no" }, 0.3), mkWorld({ pay: "none", hooks: "no" }, 0.2)];
    const once = applyGraphWeights(worlds, graph);
    const twice = applyGraphWeights(once, graph);
    expect(twice).toBe(once); // same array object
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
    expect(byId(twice)).toEqual(byId(once));
    // and a THIRD application, with a different graph version, still does not double-count
    const thrice = applyGraphWeights(twice, mkGraph(edges, "graph-test-2"));
    expect(JSON.stringify(thrice)).toBe(JSON.stringify(once));
  });

  it("re-weights only the NEWLY sampled worlds when survivors are mixed in (resample path)", () => {
    const fresh = [mkWorld({ pay: "online", hooks: "yes" }, 0.5), mkWorld({ pay: "online", hooks: "no" }, 0.5)];
    const weighted = applyGraphWeights(fresh, graph);
    const survivorRatio = weighted[0]!.weight / weighted[1]!.weight;
    const newcomers = [mkWorld({ pay: "online", hooks: "yes" }, 0.5), mkWorld({ pay: "online", hooks: "no" }, 0.5)];
    const mixed = applyGraphWeights([...weighted, ...newcomers], graph);
    // survivors keep their odds against each other (a common normalization factor is not double counting)
    expect(mixed[0]!.weight / mixed[1]!.weight).toBeCloseTo(survivorRatio, 12);
    // the newcomers now carry the same odds — they were weighted once, exactly as the survivors were
    expect(mixed[2]!.weight / mixed[3]!.weight).toBeCloseTo(survivorRatio, 12);
    expect(mixed.reduce((s, w) => s + w.weight, 0)).toBeCloseTo(1, 12);
  });

  it("GRAPH-DISABLED REGRESSION: with the graph absent, the input worlds come back byte-identically", () => {
    const worlds = [mkWorld({ pay: "online", hooks: "yes" }, 0.5), mkWorld({ pay: "online", hooks: "no" }, 0.5)];
    const before = JSON.stringify(worlds);
    for (const off of [undefined, null] as const) {
      const out = applyGraphWeights(worlds, off);
      expect(out).toBe(worlds); // same array object: a graph-off run is indistinguishable from one before this file existed
      expect(JSON.stringify(out)).toBe(before);
      expect(out.some(isGraphWeighted)).toBe(false);
    }
    // a graph with no edge applicable to this session's archetypes is the same non-event
    const scoped = mkGraph([mkEdge({ from: "pay=online", to: "hooks=yes", archetype: "b2b-invoicing" })]);
    const out = applyGraphWeights(worlds, scoped, { archetypes: ["booking"] });
    expect(out).toBe(worlds);
    expect(JSON.stringify(out)).toBe(before);
  });
});

describe("the user answer dominates the graph", () => {
  const nodes = [mkNode("ctx", ["on", "off"]), mkNode("q", ["x", "y"])];
  const belief = (worlds: World[]): Belief => ({ nodes, worlds, alpha: 0 });

  it("after conditionSoft on an answer, the answered option beats what the graph preferred", () => {
    // the graph favours q=x, hard: p(x|ctx=on) = 0.95 against a baseline of 0.20, on 300 rows
    const graph = mkGraph([mkEdge({ from: "ctx=on", to: "q=x", p_to: 0.2, p_to_given_from: 0.95, lift: 4.75, difference: 0.75, ci95: { low: 0.91, high: 0.97 } })]);
    const worlds = applyGraphWeights([mkWorld({ ctx: "on", q: "x" }, 0.5), mkWorld({ ctx: "on", q: "y" }, 0.5)], graph, { archetypes: ["crud-saas"] });

    const graphOnly = distribution(belief(worlds), "q");
    expect(graphOnly.x!).toBeGreaterThan(0.8); // the graph got its way, decisively, before the user spoke

    // ...and then the user says y
    const answered = conditionSoft(worlds, "q", "y", 0.05);
    const after = distribution(belief(answered), "q");
    expect(after.y!).toBeGreaterThan(after.x!);
    expect(after.y!).toBeGreaterThan(0.7);
  });

  it("holds even when the graph is saturated at both ends of its band (the worst case it can construct)", () => {
    const many = Array.from({ length: 40 }, (_, i) => mkEdge({ from: "ctx=on", to: `q=x`, p_to: 0.001, p_to_given_from: 1, eligible_n: 10_000 + i }));
    // 40 copies collapse to one edge in softEdgesFor (same pair), so stack distinct antecedents instead
    const stacked = Array.from({ length: 40 }, (_, i) => mkEdge({ from: `c${i}=on`, to: "q=x", p_to: 0.001, p_to_given_from: 1, eligible_n: 10_000 }));
    const asg = (q: string) => {
      const a: Record<string, string> = { ctx: "on", q };
      for (let i = 0; i < 40; i++) a[`c${i}`] = "on";
      return a;
    };
    const worlds = applyGraphWeights([mkWorld(asg("x"), 0.5), mkWorld(asg("y"), 0.5)], mkGraph([...many, ...stacked]));
    // saturated: the widest odds the graph can open between two worlds is maxTotalOdds²
    expect(worlds[0]!.weight / worlds[1]!.weight).toBeCloseTo(DEFAULT_MAX_TOTAL_ODDS * DEFAULT_MAX_TOTAL_ODDS, 6);
    const after = distribution(belief(conditionSoft(worlds, "q", "y", 0.05)), "q");
    expect(after.y!).toBeGreaterThan(after.x!);
  });

  it("the guarantee is arithmetic: maxTotalOdds² < 1/epsilon at the shipped defaults", () => {
    expect(graphNeverOutvotesAnswer(DEFAULT_MAX_TOTAL_ODDS, 0.05)).toBe(true);
    expect(graphNeverOutvotesAnswer(8, 0.05)).toBe(false); // a wider band would let the graph win — do not raise it
  });
});

describe("explainEdge", () => {
  it("states a well-supported edge plainly, with its own counts and interval", () => {
    const e = mkEdge({ from: "payments_in_app=collect_online", to: "webhooks=yes", archetype: "crud-saas", eligible_n: 82, p_from: 0.5, p_to: 0.42, p_to_given_from: 0.76, ci95: { low: 0.61, high: 0.87 }, difference: 0.34, lift: 1.81 });
    const s = explainEdge(e, { label: (k) => (k === "webhooks=yes" ? "Webhooks" : "online payments") });
    expect(s).toBe("Webhooks is included because 31 of 41 comparable, observable crud-saas projects with online payments also had Webhooks. Estimated probability: 0.76, 95% interval: 0.61–0.87.");
    expect(s).not.toMatch(/hint|thin|provisional/);
  });

  it("hedges explicitly when support is below the floor", () => {
    const e = mkEdge({ from: "pay=online", to: "hooks=yes", eligible_n: 12, p_from: 0.5, ci95: { low: 0.55, high: 0.75 } });
    const s = explainEdge(e);
    expect(s).toMatch(/the evidence is thin/);
    expect(s).toMatch(/only 12 .*were observable, below the floor of 30/);
    expect(s).toMatch(/treat this as a hint, not a finding/);
    expect(s).not.toMatch(/is included because/);
  });

  it("hedges when the interval is too wide to read the point estimate", () => {
    const e = mkEdge({ from: "pay=online", to: "hooks=yes", eligible_n: 400, ci95: { low: 0.31, high: 0.95 } });
    const s = explainEdge(e);
    expect(s).toMatch(/the evidence is thin/);
    expect(s).toMatch(/spans 0\.64, too wide/);
    expect(s).toMatch(/hint, not a finding/);
  });

  it("never renders a null interval as a range", () => {
    const e = mkEdge({ from: "pay=online", to: "hooks=yes", eligible_n: 400, ci95: null });
    const s = explainEdge(e);
    expect(s).toMatch(/no 95% interval was computed for this edge/);
    expect(s).toMatch(/hint, not a finding/);
    expect(s).not.toMatch(/–/); // no en-dash range anywhere
    expect(s).not.toMatch(/\d\s*[–—-]\s*\d/); // and no fabricated numeric range in any dash form
  });

  it("mirrors the wording for a soft_negative edge and leads with a Simpson's warning", () => {
    const e = mkEdge({
      from: "scale=tiny",
      to: "sso=required",
      relation: "soft_negative",
      p_from: 0.5,
      p_to: 0.55,
      p_to_given_from: 0.1,
      difference: -0.45,
      lift: 0.18,
      ci95: { low: 0.05, high: 0.18 },
      eligible_n: 200,
      simpsons_warning: "pooled difference disagrees in sign with 2 of 3 strata",
    });
    const s = explainEdge(e);
    expect(s.startsWith("Warning: pooled difference disagrees")).toBe(true);
    expect(s).toMatch(/is left out because only 10 of 100/);
    expect(s).toMatch(/against a baseline of 0\.55/);
    expect(s).toMatch(/95% interval: 0\.05–0\.18/);
  });

  it("refuses to make a statistical claim for a hard or unknown edge", () => {
    const hard = explainEdge(mkEdge({ from: "a=x", to: "b=y", relation: "hard_implies", status: "authored" }));
    expect(hard).toMatch(/authored in the catalog/);
    expect(hard).toMatch(/never by likelihood/);
    const unknown = explainEdge(mkEdge({ from: "a=x", to: "b=y", relation: "unknown", note: "low support: 14 eligible rows" }));
    expect(unknown).toMatch(/^No statistical claim can be made/);
    expect(unknown).toMatch(/low support: 14 eligible rows/);
  });
});
