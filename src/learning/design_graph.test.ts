import { describe, expect, it } from "vitest";
import {
  buildDesignGraph,
  classifyPair,
  DEFAULT_THRESHOLDS,
  DesignGraphSchema,
  detectSimpsons,
  elementKey,
  hardCandidates,
  hardEdgesFromCatalog,
  isHard,
  JEFFREYS,
  makeElement,
  parseElementKey,
  PairStatSchema,
  smoothedRate,
  softEdgesFor,
  validateGraph,
  validatePairStat,
  wilsonInterval,
  type GraphEdge,
  type GraphThresholds,
  type PairStat,
} from "./design_graph.js";

// ---------------------------------------------------------------------------

/** A pair statistic built from raw counts, with every derived number computed the way `pairStat` does. */
function stat(
  counts: { n11: number; n10: number; n01: number; n00: number },
  over: Partial<PairStat> = {},
): PairStat {
  const { n11, n10, n01, n00 } = counts;
  const eligible_n = n11 + n10 + n01 + n00;
  const p_to_given_from = smoothedRate(n11, n11 + n10, JEFFREYS);
  const p_to = smoothedRate(n11 + n01, eligible_n, JEFFREYS);
  return PairStatSchema.parse({
    from: "payments_in_app=collect_online",
    to: "webhooks=yes",
    archetype: "b2b-invoicing",
    source_kind: "repo",
    n11,
    n10,
    n01,
    n00,
    eligible_n,
    coverage_from: 1,
    coverage_to: 1,
    joint_coverage: 1,
    p_from: smoothedRate(n11 + n10, eligible_n, JEFFREYS),
    p_to,
    p_to_given_from,
    p_from_given_to: smoothedRate(n11, n11 + n01, JEFFREYS),
    lift: p_to > 0 ? p_to_given_from / p_to : 0,
    difference: p_to_given_from - p_to,
    ci95: wilsonInterval(n11, n11 + n10),
    support_row_ids: [],
    ...over,
  });
}

// ---------------------------------------------------------------------------

describe("element keys", () => {
  it("round-trips", () => {
    const el = makeElement("payments_in_app", "collect_online");
    expect(el.key).toBe("payments_in_app=collect_online");
    expect(parseElementKey(el.key)).toEqual(el);
  });

  it("handles an option id that itself contains an '=' by splitting on the FIRST one", () => {
    const parsed = parseElementKey("node=a=b");
    expect(parsed).toEqual({ node_id: "node", option_id: "a=b", key: "node=a=b" });
  });

  it("returns null for a malformed key rather than guessing", () => {
    expect(parseElementKey("no-separator")).toBeNull();
    expect(parseElementKey("=leading")).toBeNull();
    expect(parseElementKey("trailing=")).toBeNull();
    expect(parseElementKey("")).toBeNull();
  });

  it("elementKey is the canonical serialization", () => {
    expect(elementKey("a", "b")).toBe("a=b");
  });
});

describe("estimators", () => {
  it("Wilson interval matches a hand-computed value", () => {
    // 8 of 10, z = 1.96 — the textbook Wilson figures
    const ci = wilsonInterval(8, 10);
    expect(ci.low).toBeCloseTo(0.4902, 4);
    expect(ci.high).toBeCloseTo(0.9433, 4);
  });

  it("never produces a degenerate interval at the boundaries — the reason it is used at all", () => {
    const zero = wilsonInterval(0, 8);
    expect(zero.low).toBe(0);
    expect(zero.high).toBeGreaterThan(0.1); // NOT [0,0]: 0-of-8 is not proof of impossibility
    const all = wilsonInterval(8, 8);
    expect(all.high).toBe(1);
    expect(all.low).toBeLessThan(0.9); // NOT [1,1]
  });

  it("stays inside [0,1] and is total on n = 0", () => {
    expect(wilsonInterval(0, 0)).toEqual({ low: 0, high: 1 });
    for (const [k, n] of [[0, 1], [1, 1], [3, 7], [100, 100]] as const) {
      const ci = wilsonInterval(k, n);
      expect(ci.low).toBeGreaterThanOrEqual(0);
      expect(ci.high).toBeLessThanOrEqual(1);
      expect(ci.low).toBeLessThanOrEqual(ci.high);
    }
  });

  it("Jeffreys smoothing keeps a zero count from asserting p = 0", () => {
    expect(smoothedRate(0, 10)).toBeCloseTo(0.5 / 11, 10);
    expect(smoothedRate(0, 10)).toBeGreaterThan(0);
    expect(smoothedRate(10, 10)).toBeLessThan(1);
    expect(smoothedRate(0, 0)).toBeCloseTo(0.5, 10);
  });
});

describe("pair statistic invariants", () => {
  it("accepts a sound table", () => {
    expect(validatePairStat(stat({ n11: 30, n10: 10, n01: 5, n00: 5 }))).toEqual([]);
  });

  it("rejects a table whose cells do not sum to eligible_n — the unobserved-as-negative tripwire", () => {
    const bad = stat({ n11: 30, n10: 10, n01: 5, n00: 5 }, { eligible_n: 100 });
    const errors = validatePairStat(bad);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("unobserved row must not be counted");
  });

  it("rejects an inverted interval and a non-probability", () => {
    // Built WITHOUT the zod schema on purpose: `validatePairStat` is the second line of defence, for objects
    // assembled in code rather than parsed from a file. Going through `PairStatSchema` here would test zod.
    const raw = { ...stat({ n11: 5, n10: 5, n01: 5, n00: 5 }) };
    expect(validatePairStat({ ...raw, ci95: { low: 0.9, high: 0.1 } })).toContain(
      "payments_in_app=collect_online→webhooks=yes: interval is inverted",
    );
    expect(validatePairStat({ ...raw, p_to: 1.5 }).some((e) => e.includes("not a probability"))).toBe(true);
    expect(validatePairStat({ ...raw, p_to: Number.NaN }).some((e) => e.includes("not a probability"))).toBe(true);
  });

  it("rejects more support rows than n11 could justify", () => {
    const bad = { ...stat({ n11: 1, n10: 1, n01: 1, n00: 1 }), support_row_ids: ["a", "b", "c"] };
    expect(validatePairStat(bad).some((e) => e.includes("support rows"))).toBe(true);
  });
});

describe("classifyPair — the only statistic→relation function", () => {
  it("cannot emit a hard relation, however overwhelming the association", () => {
    // 500 rows, A always with B, not one counterexample. This is as strong as evidence gets.
    const overwhelming = stat({ n11: 500, n10: 0, n01: 0, n00: 500 });
    const c = classifyPair(overwhelming);
    expect(c.relation).toBe("soft_positive");
    expect(isHard(c.relation)).toBe(false);
  });

  it("returns soft_negative for a genuine anti-association", () => {
    const anti = stat({ n11: 2, n10: 200, n01: 200, n00: 2 });
    expect(classifyPair(anti).relation).toBe("soft_negative");
  });

  it("is `unknown` below the reporting floor, and says how far below", () => {
    const c = classifyPair(stat({ n11: 3, n10: 1, n01: 1, n00: 1 }));
    expect(c.relation).toBe("unknown");
    expect(c.note).toContain("insufficient evidence");
    expect(c.note).toContain("6 eligible rows");
  });

  it("is `unknown` between the reporting floor and the soft floor — reportable, not usable", () => {
    const c = classifyPair(stat({ n11: 8, n10: 2, n01: 2, n00: 8 }));
    expect(c.relation).toBe("unknown");
    expect(c.note).toContain("low support");
  });

  it("is `unknown` when the interval straddles the baseline, however large the point estimate", () => {
    // enough rows to clear softMinN, but p(B|A)'s interval still contains p(B)
    const s = stat({ n11: 16, n10: 14, n01: 15, n00: 15 });
    const c = classifyPair(s);
    expect(c.relation).toBe("unknown");
    expect(c.note).toContain("not distinguishable from the baseline");
    expect(s.ci95.low).toBeLessThanOrEqual(s.p_to);
    expect(s.ci95.high).toBeGreaterThanOrEqual(s.p_to);
  });

  it("honours configured thresholds", () => {
    const t: GraphThresholds = { ...DEFAULT_THRESHOLDS, reportMinN: 2, softMinN: 4 };
    expect(classifyPair(stat({ n11: 8, n10: 0, n01: 0, n00: 8 }), t).relation).toBe("soft_positive");
  });
});

describe("hardCandidates — proposals, never edges", () => {
  /**
   * 800, not 150. With `hardMinLowerBound = 0.995` and a perfect record (p = 1), the Wilson lower bound is
   * `n / (n + z²)`, so clearing 0.995 needs n ≥ 765 REGARDLESS of `hardMinN`. That is the threshold doing its
   * job — a "law" proposed from 150 observations is not a law — and it is why `hardMinN = 100` is a floor
   * rather than the binding constraint.
   */
  const big = { n11: 800, n10: 0, n01: 40, n00: 60 };

  it("proposes an implication on a large, violation-free sample", () => {
    const [c] = hardCandidates([stat(big)]);
    expect(c).toBeDefined();
    expect(c!.proposed).toBe("hard_implies");
    expect(c!.violations).toBe(0);
    expect(c!.ci95.low).toBeGreaterThanOrEqual(DEFAULT_THRESHOLDS.hardMinLowerBound);
  });

  it("a SINGLE counterexample kills the proposal", () => {
    expect(hardCandidates([stat({ ...big, n10: 1 })])).toEqual([]);
  });

  it("refuses below the hard support floor, however clean the pattern", () => {
    expect(hardCandidates([stat({ n11: 50, n10: 0, n01: 20, n00: 20 })])).toEqual([]);
    // and refuses a clean pattern that clears hardMinN but not the interval — 150 spotless rows is not a law
    expect(hardCandidates([stat({ n11: 150, n10: 0, n01: 40, n00: 60 })])).toEqual([]);
  });

  it("proposes an exclusion only when both sides were observed apart in a large sample", () => {
    const [c] = hardCandidates([stat({ n11: 0, n10: 800, n01: 50, n00: 20 })]);
    expect(c!.proposed).toBe("hard_excludes");
    // never co-occurred, but each occurred alone — a zero that means something
    expect(c!.why).toContain("never co-occurred");
  });

  it("does NOT propose an exclusion from a zero that could not have been observed", () => {
    // n11 = 0 but B never appeared at all (n01 = 0): the zero is uninformative
    expect(hardCandidates([stat({ n11: 0, n10: 800, n01: 0, n00: 30 })])).toEqual([]);
  });
});

describe("Simpson's paradox", () => {
  /**
   * The classic composition trap, with realistic numbers.
   *
   * Within EACH archetype, `payments_in_app=collect_online` makes webhooks LESS likely. But invoicing rows
   * are mostly payment-collecting and mostly webhook-using, while booking rows are neither — so pooling the
   * two makes the association look positive. The strata are right; the pooled number is an artifact of which
   * archetype contributed which rows.
   */
  const invoicing = stat({ n11: 312, n10: 168, n01: 114, n00: 6 }, { archetype: "b2b-invoicing", source_kind: "repo" });
  const booking = stat({ n11: 3, n10: 57, n01: 54, n00: 186 }, { archetype: "content-site", source_kind: "repo" });
  const pooled = stat({ n11: 315, n10: 225, n01: 168, n00: 192 }, { archetype: null, source_kind: null });

  it("the strata really do disagree with the pooled sign (the fixture is honest)", () => {
    expect(invoicing.difference).toBeLessThan(0);
    expect(booking.difference).toBeLessThan(0);
    expect(pooled.difference).toBeGreaterThan(0);
  });

  it("flags the pooled pair and names the strata", () => {
    const found = detectSimpsons([pooled], [invoicing, booking]);
    expect(found).toHaveLength(1);
    expect(found[0]!.strata.map((s) => s.archetype).sort()).toEqual(["b2b-invoicing", "content-site"]);
    expect(found[0]!.why).toContain("composition artifact");
  });

  it("does not flag when the strata agree with the pooled sign", () => {
    const agreeing = stat({ n11: 40, n10: 5, n01: 10, n00: 45 }, { archetype: "booking", source_kind: "repo" });
    const pooledPositive = stat({ n11: 70, n10: 15, n01: 50, n00: 50 }, { archetype: null, source_kind: null });
    expect(agreeing.difference).toBeGreaterThan(0);
    expect(pooledPositive.difference).toBeGreaterThan(0);
    // the specific claim: a stratum that agrees is never reported as disagreeing
    expect(detectSimpsons([pooledPositive], [agreeing, agreeing])).toEqual([]);
  });

  it("puts the warning on the POOLED edge and leaves the strata clean", () => {
    const built = buildDesignGraph([invoicing, booking], { pooled: [pooled], now: () => "t" });
    const pooledEdge = built.graph.edges.find((e) => e.archetype === null);
    const stratumEdges = built.graph.edges.filter((e) => e.archetype !== null);
    expect(pooledEdge!.simpsons_warning).toBeTruthy();
    expect(stratumEdges.length).toBeGreaterThan(0);
    for (const e of stratumEdges) expect(e.simpsons_warning).toBeNull();
    expect(built.simpsons).toHaveLength(1);
  });
});

describe("hardEdgesFromCatalog", () => {
  const nodes = [
    {
      id: "payments_in_app",
      options: [{ id: "collect_online" }, { id: "none" }],
      implies: { collect_online: [{ node: "payment_provider", option: "stripe" }], none: [] },
      excludes: { none: [{ node: "refunds", option: "yes" }], collect_online: [] },
    },
  ];

  it("reads implications and exclusions as AUTHORED edges", () => {
    const edges = hardEdgesFromCatalog(nodes);
    expect(edges).toHaveLength(2);
    for (const e of edges) {
      expect(e.status).toBe("authored");
      expect(isHard(e.relation)).toBe(true);
      expect(e.eligible_n).toBe(0); // logic has no sample size
      expect(e.ci95).toBeNull();
    }
    expect(edges.find((e) => e.relation === "hard_implies")).toMatchObject({
      from: "payments_in_app=collect_online",
      to: "payment_provider=stripe",
    });
    expect(edges.find((e) => e.relation === "hard_excludes")).toMatchObject({
      from: "payments_in_app=none",
      to: "refunds=yes",
    });
  });

  it("tolerates a node with no `excludes` at all (the field is optional on NodeDef)", () => {
    const edges = hardEdgesFromCatalog([{ id: "a", options: [{ id: "x" }], implies: { x: [{ node: "b", option: "y" }] } }]);
    expect(edges).toHaveLength(1);
    expect(edges[0]!.relation).toBe("hard_implies");
  });
});

describe("validateGraph", () => {
  const soundEdge: GraphEdge = {
    from: "a=x",
    to: "b=y",
    relation: "soft_positive",
    status: "candidate",
    archetype: "booking",
    source_kind: "repo",
    p_from: 0.5,
    p_to: 0.5,
    p_to_given_from: 0.8,
    lift: 1.6,
    difference: 0.3,
    ci95: { low: 0.6, high: 0.9 },
    eligible_n: 40,
    support_row_ids: [],
    simpsons_warning: null,
    note: null,
  };
  /**
   * Edges are injected WITHOUT `DesignGraphSchema.parse` for the malformed cases: zod already rejects a NaN
   * probability at the door, so parsing here would test zod rather than `validateGraph`. `validateGraph` is
   * the check that survives an object assembled in code — which is exactly how `buildDesignGraph` produces
   * one before anything parses it.
   */
  const graph = (edges: GraphEdge[]) =>
    ({ ...DesignGraphSchema.parse({ schema: "zadum.design-graph.v1", version: "t", edges: [], elements: [] }), edges });

  it("passes a sound graph", () => {
    expect(validateGraph(graph([soundEdge]))).toEqual([]);
  });

  it("REFUSES a hard relation that is not authored (spec rule 11)", () => {
    const issues = validateGraph(graph([{ ...soundEdge, relation: "hard_implies", status: "candidate" }]));
    expect(issues).toHaveLength(1);
    expect(issues[0]!.problem).toContain("hard edges may only be authored");
  });

  it("refuses a soft relation marked authored", () => {
    expect(validateGraph(graph([{ ...soundEdge, status: "authored" }]))[0]!.problem).toContain("marked authored");
  });

  it("refuses a non-numeric probability (spec rule 5)", () => {
    const issues = validateGraph(graph([{ ...soundEdge, p_to_given_from: Number.NaN }]));
    expect(issues.some((i) => i.problem.includes("not a probability"))).toBe(true);
  });

  it("refuses an inverted interval, a negative lift and a self edge", () => {
    expect(validateGraph(graph([{ ...soundEdge, ci95: { low: 0.9, high: 0.1 } }]))[0]!.problem).toContain("inverted");
    expect(validateGraph(graph([{ ...soundEdge, lift: -1 }]))[0]!.problem).toContain("lift");
    expect(validateGraph(graph([{ ...soundEdge, to: "a=x" }]))[0]!.problem).toBe("self edge");
  });

  it("checks element keys against the catalog when an index is given", () => {
    const index = new Map([["a", new Set(["x"])], ["b", new Set(["y"])]]);
    expect(validateGraph(graph([soundEdge]), index)).toEqual([]);
    const issues = validateGraph(graph([{ ...soundEdge, to: "b=nope" }]), index);
    expect(issues[0]!.problem).toContain('"nope" is not an option of "b"');
    expect(validateGraph(graph([{ ...soundEdge, to: "ghost=y" }]), index)[0]!.problem).toContain("unknown catalog node");
  });

  it("catches an element whose observed count exceeds its eligible count", () => {
    const g = DesignGraphSchema.parse({
      schema: "zadum.design-graph.v1",
      version: "t",
      edges: [],
      elements: [{ key: "a=x", node_id: "a", option_id: "x", eligible_documents: 3, observed_documents: 5, prevalence: 1, entropy: 0, idf: 1, unobserved_rate: 0 }],
    });
    expect(validateGraph(g)[0]!.problem).toContain("observed 5 > eligible 3");
  });
});

describe("softEdgesFor — runtime precedence", () => {
  const base: GraphEdge = {
    from: "a=x",
    to: "b=y",
    relation: "soft_positive",
    status: "candidate",
    archetype: null,
    source_kind: null,
    p_from: 0.5,
    p_to: 0.5,
    p_to_given_from: 0.8,
    lift: 1.6,
    difference: 0.3,
    ci95: { low: 0.6, high: 0.9 },
    eligible_n: 40,
    support_row_ids: [],
    simpsons_warning: null,
    note: null,
  };
  const graph = (edges: GraphEdge[]) => DesignGraphSchema.parse({ schema: "zadum.design-graph.v1", version: "t", edges, elements: [] });

  it("prefers an archetype-scoped edge over a pooled one", () => {
    const scoped = { ...base, archetype: "booking", eligible_n: 12, p_to_given_from: 0.4 };
    const picked = softEdgesFor(graph([base, scoped]), { archetypes: ["booking"] });
    expect(picked).toHaveLength(1);
    expect(picked[0]!.archetype).toBe("booking");
    expect(picked[0]!.p_to_given_from).toBe(0.4); // the specific number won, despite less support
  });

  it("drops a Simpson-flagged pooled edge entirely", () => {
    const flagged = { ...base, simpsons_warning: "pooled difference disagrees with 2 strata" };
    expect(softEdgesFor(graph([flagged]), { archetypes: ["booking"] })).toEqual([]);
  });

  it("prefers an edge scoped to BOTH archetype and source kind over an archetype-only one", () => {
    const archetypeOnly = { ...base, archetype: "booking", source_kind: null, eligible_n: 400, p_to_given_from: 0.4 };
    const both = { ...base, archetype: "booking", source_kind: "session", eligible_n: 12, p_to_given_from: 0.9 };
    const picked = softEdgesFor(graph([archetypeOnly, both]), { archetypes: ["booking"], sourceKind: "session" });
    expect(picked).toHaveLength(1);
    // 12 close rows beat 400 distant ones: scope outranks support, and only ties are broken by support
    expect(picked[0]!.source_kind).toBe("session");
    expect(picked[0]!.eligible_n).toBe(12);
  });

  it("DROPS an edge scoped to a different source kind rather than down-ranking it", () => {
    const sessionEdge = { ...base, archetype: "booking", source_kind: "session" };
    expect(softEdgesFor(graph([sessionEdge]), { archetypes: ["booking"], sourceKind: "repo" })).toEqual([]);
    // …and a repo-scoped edge never reaches a caller asking what real owners answered
    const repoEdge = { ...base, archetype: "booking", source_kind: "repo" };
    expect(softEdgesFor(graph([repoEdge]), { archetypes: ["booking"], sourceKind: "session" })).toEqual([]);
  });

  it("filters nothing when the caller states no source-kind preference", () => {
    const sessionEdge = { ...base, archetype: "booking", source_kind: "session" };
    expect(softEdgesFor(graph([sessionEdge]), { archetypes: ["booking"] })).toHaveLength(1);
  });

  it("breaks a within-tier tie by support", () => {
    const small = { ...base, archetype: "booking", source_kind: "repo", eligible_n: 30 };
    const large = { ...base, archetype: "booking", source_kind: "repo", eligible_n: 300 };
    const picked = softEdgesFor(graph([small, large]), { archetypes: ["booking"], sourceKind: "repo" });
    expect(picked[0]!.eligible_n).toBe(300);
  });

  it("ignores an edge scoped to a different archetype", () => {
    expect(softEdgesFor(graph([{ ...base, archetype: "e-commerce" }]), { archetypes: ["booking"] })).toEqual([]);
  });

  it("never returns hard or unknown relations", () => {
    const mixed = graph([
      { ...base, relation: "hard_implies", status: "authored" },
      { ...base, from: "c=x", relation: "unknown" },
      base,
    ]);
    const picked = softEdgesFor(mixed, { archetypes: ["booking"] });
    expect(picked).toHaveLength(1);
    expect(picked[0]!.relation).toBe("soft_positive");
  });

  it("can be restricted to human-approved edges only", () => {
    const approved = { ...base, from: "d=x", status: "approved" as const };
    const picked = softEdgesFor(graph([base, approved]), { archetypes: [], includeCandidates: false });
    expect(picked).toHaveLength(1);
    expect(picked[0]!.status).toBe("approved");
  });
});

describe("buildDesignGraph", () => {
  const strata = [stat({ n11: 40, n10: 5, n01: 10, n00: 45 }), stat({ n11: 4, n10: 1, n01: 1, n00: 4 }, { archetype: "booking" })];

  it("produces a schema-valid, structurally-sound graph", () => {
    const built = buildDesignGraph(strata, { now: () => "2026-08-25T00:00:00.000Z" });
    expect(() => DesignGraphSchema.parse(built.graph)).not.toThrow();
    expect(validateGraph(built.graph)).toEqual([]);
  });

  it("marks every learned edge `candidate` and every authored edge `authored`", () => {
    const authored = hardEdgesFromCatalog([{ id: "n", options: [{ id: "o" }], implies: { o: [{ node: "m", option: "p" }] } }]);
    const built = buildDesignGraph(strata, { hardEdges: authored, now: () => "t" });
    for (const e of built.graph.edges) expect(e.status).toBe(isHard(e.relation) ? "authored" : "candidate");
  });

  it("drops pairs below the reporting floor rather than emitting a meaningless edge", () => {
    const built = buildDesignGraph(strata, { now: () => "t" });
    // the 10-row booking stratum is below reportMinN = 10? it is exactly 10 — use an explicitly tiny one
    const tiny = buildDesignGraph([stat({ n11: 1, n10: 1, n01: 1, n00: 1 })], { now: () => "t" });
    expect(tiny.graph.edges).toEqual([]);
    expect(built.graph.edges.length).toBeGreaterThan(0);
  });

  it("carries thresholds and provenance onto the artifact", () => {
    const built = buildDesignGraph(strata, {
      catalog_version: "cat-1",
      matrix_version: "mx-1",
      provenance: { label_models: ["claude-opus-4-8"], label_prompt_versions: ["p1"], source_kinds: ["repo"], archetypes: ["booking"], rows: 90 },
      now: () => "t",
    });
    expect(built.graph.catalog_version).toBe("cat-1");
    expect(built.graph.matrix_version).toBe("mx-1");
    expect(built.graph.provenance.rows).toBe(90);
    expect(built.graph.thresholds.hardMinLowerBound).toBe(0.995);
  });

  it("is deterministic", () => {
    const a = buildDesignGraph(strata, { now: () => "t" });
    const b = buildDesignGraph(strata, { now: () => "t" });
    expect(JSON.stringify(a.graph)).toBe(JSON.stringify(b.graph));
  });
});
