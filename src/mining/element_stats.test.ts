import { describe, expect, it } from "vitest";
import {
  DEFAULT_RARITY,
  adjustValueByRarity,
  binaryEntropy,
  catalogGapSignals,
  classifyRarity,
  elementIdf,
  elementStatIssues,
  elementStats,
  elementStatsReport,
  normalizedIdf,
  optionUniverse,
  parseElementStatsArgs,
  parseStratumNodeKey,
  prevalenceOf,
  renderElementStatsReport,
  statKey,
  stratumLabel,
  stratumNodeKey,
} from "./element_stats.js";
import { DecisionCellSchema, DecisionRowSchema, type DecisionCell, type DecisionRow } from "./matrix.js";
import { ElementStatSchema, elementKey, type ElementStat } from "../learning/design_graph.js";
import { UsageError } from "../cli/flags.js";

// ---------------------------------------------------------------------------
// Fixtures: hand-built decision rows. Every number asserted below is computed by hand in a comment.
// ---------------------------------------------------------------------------

const observedCell = (option: string): DecisionCell =>
  DecisionCellSchema.parse({ status: "observed", option, observable: true, evidence_feature_ids: [`f_${option}`] });

/** The labeller looked (or could have) and the artifact said nothing. NOT a negative — the point of this file. */
const unobservedCell = (reason = "silent", observable = true): DecisionCell =>
  DecisionCellSchema.parse({ status: "unobserved", observable, unobserved_reason: reason });

const conflictCell = (options: string[]): DecisionCell =>
  DecisionCellSchema.parse({
    status: "conflict",
    observable: true,
    candidates: options.map((o) => ({ option: o, feature_ids: [`f_${o}`], quotes: [] })),
  });

const row = (row_id: string, cells: Record<string, DecisionCell>, over: Partial<DecisionRow> = {}): DecisionRow =>
  DecisionRowSchema.parse({
    schema: "zadum.decision-row.v1",
    row_id,
    source_kind: "repo",
    source_id: row_id,
    archetype: "crud-saas",
    catalog_version: "cat-1",
    lexicon_version: "lex-1",
    cells,
    ...over,
  });

/** n rows of one stratum, all observing `node` as `option`. */
const rowsObserving = (n: number, node: string, option: string, over: Partial<DecisionRow> = {}, prefix = "r"): DecisionRow[] =>
  Array.from({ length: n }, (_, i) => row(`${prefix}-${option}-${i}`, { [node]: observedCell(option) }, over));

const find = (stats: ElementStat[], key: string, archetype: string | null = "crud-saas"): ElementStat => {
  const hit = stats.find((s) => s.key === key && s.archetype === archetype);
  if (!hit) throw new Error(`no stat for ${key} in ${archetype ?? "POOLED"} (have: ${stats.map((s) => statKey(s)).join(", ")})`);
  return hit;
};

// The five-row corpus used by the counting tests:
//   r1 user_accounts=none · r2,r3 user_accounts=multi_user · r4 unobserved · r5 conflict(none, multi_user)
// eligible(user_accounts) = 3 (only the three `observed` rows)
// observed(multi_user)    = 2   → prevalence 2/3
// unobserved_rate         = (1 unobserved + 1 conflict) / 5 rows = 0.4
const FIVE: DecisionRow[] = [
  row("r1", { user_accounts: observedCell("none") }),
  row("r2", { user_accounts: observedCell("multi_user") }),
  row("r3", { user_accounts: observedCell("multi_user") }),
  row("r4", { user_accounts: unobservedCell() }),
  row("r5", { user_accounts: conflictCell(["none", "multi_user"]) }),
];

const MULTI = elementKey("user_accounts", "multi_user");
const NONE = elementKey("user_accounts", "none");

// ---------------------------------------------------------------------------

describe("eligible / observed counting", () => {
  it("counts eligible documents as the rows where the NODE was observed, whatever option it took", () => {
    const { byStratum } = elementStats(FIVE);
    const multi = find(byStratum, MULTI);
    const none = find(byStratum, NONE);

    expect(multi.eligible_documents).toBe(3);
    expect(multi.observed_documents).toBe(2);
    expect(multi.prevalence).toBe(2 / 3);
    expect(none.eligible_documents).toBe(3);
    expect(none.observed_documents).toBe(1);
    expect(none.prevalence).toBe(1 / 3);
    // the options of one node partition the eligible rows
    expect(multi.observed_documents + none.observed_documents).toBe(multi.eligible_documents);
    expect(multi.prevalence + none.prevalence).toBeCloseTo(1, 12);
  });

  it("reports the silence separately as unobserved_rate, over rows where the node applied", () => {
    const multi = find(elementStats(FIVE).byStratum, MULTI);
    // (1 unobserved + 1 conflict) / 5 rows
    expect(multi.unobserved_rate).toBe(0.4);
  });

  it("says nothing at all about a node that never applied to a row", () => {
    const { byStratum } = elementStats(FIVE);
    expect(byStratum.every((s) => s.node_id === "user_accounts")).toBe(true);
  });

  it("mints elements only from OBSERVED options — a conflict candidate is not a decision", () => {
    const conflictOnly = [row("c1", { payments_in_app: conflictCell(["collect_online", "none"]) })];
    expect([...optionUniverse(conflictOnly).keys()]).toEqual([]);
    // …unless the caller seeds the catalog's own option list, which produces an explicit zero row
    expect([...optionUniverse(conflictOnly, { payments_in_app: ["collect_online", "none"] }).get("payments_in_app")!].sort()).toEqual(["collect_online", "none"]);
  });
});

describe("an unobserved cell is never a negative", () => {
  it("is excluded from BOTH the numerator and the denominator", () => {
    const observedOnly = FIVE.filter((r) => r.cells.user_accounts!.status === "observed");
    const plusSilence = [...observedOnly, ...Array.from({ length: 7 }, (_, i) => row(`s${i}`, { user_accounts: unobservedCell() }))];

    const before = find(elementStats(observedOnly).byStratum, MULTI);
    const after = find(elementStats(plusSilence).byStratum, MULTI);

    // seven silent rows arrive and NOTHING about the estimate moves
    expect(after.eligible_documents).toBe(before.eligible_documents); // 3, not 10
    expect(after.observed_documents).toBe(before.observed_documents); // 2
    expect(after.prevalence).toBe(before.prevalence); // 2/3, not 2/10
    expect(after.idf).toBe(before.idf);
    expect(after.entropy).toBe(before.entropy);
    // only the data-quality signal moves
    expect(before.unobserved_rate).toBe(0);
    expect(after.unobserved_rate).toBe(7 / 10);
  });

  it("does not push the OTHER option's prevalence down either (silence is not evidence for anyone)", () => {
    const noneOnly = find(elementStats([...rowsObserving(4, "user_accounts", "none")]).byStratum, NONE);
    const withSilence = find(elementStats([...rowsObserving(4, "user_accounts", "none"), row("s", { user_accounts: unobservedCell() })]).byStratum, NONE);
    expect(noneOnly.prevalence).toBe(1);
    expect(withSilence.prevalence).toBe(1);
  });

  it("treats a not-even-eligible cell the same way — it is in no count at all", () => {
    const rows = [...rowsObserving(3, "user_accounts", "none"), row("x", { user_accounts: unobservedCell("not_askable_in_source", false) })];
    const none = find(elementStats(rows).byStratum, NONE);
    expect(none.eligible_documents).toBe(3);
    expect(none.observed_documents).toBe(3);
    expect(none.unobserved_rate).toBe(1 / 4);
  });
});

describe("a conflict cell", () => {
  // Documented behaviour: a conflict is excluded from the numerator AND from the denominator. Two options had
  // positive evidence, so the row records a measurement failure, not a decision; counting it in the
  // denominator would make it an implicit negative for every option — including both it is conflicted between.
  it("is excluded from the numerator and from the denominator", () => {
    const base = [...rowsObserving(2, "user_accounts", "multi_user"), ...rowsObserving(1, "user_accounts", "none")];
    const before = find(elementStats(base).byStratum, MULTI);
    const after = find(elementStats([...base, row("k", { user_accounts: conflictCell(["none", "multi_user"]) })]).byStratum, MULTI);

    expect(after.eligible_documents).toBe(before.eligible_documents); // 3, not 4
    expect(after.observed_documents).toBe(before.observed_documents); // 2
    expect(after.prevalence).toBe(before.prevalence);
    // it is visible in the data-quality column, and only there
    expect(after.unobserved_rate).toBe(1 / 4);
  });
});

describe("the formulas", () => {
  it("uses exactly log((eligible + 1) / (observed + 1)) + 1", () => {
    // hand-computed: eligible 9, observed 3 → ln(10/4) + 1 = 0.9162907318741551 + 1
    expect(elementIdf(9, 3)).toBe(Math.log(10 / 4) + 1);
    expect(elementIdf(9, 3)).toBeCloseTo(1.9162907318741551, 12);
    // and through the pipeline: 3 of 9 eligible rows chose `none`
    const rows = [...rowsObserving(3, "user_accounts", "none"), ...rowsObserving(6, "user_accounts", "multi_user")];
    expect(find(elementStats(rows).byStratum, NONE).idf).toBe(Math.log(10 / 4) + 1);
    // a universal element sits at exactly 1, never at 0
    expect(elementIdf(50, 50)).toBe(1);
    // and a never-observed element stays finite instead of dividing by zero
    expect(elementIdf(0, 0)).toBe(1);
  });

  it("computes binary entropy in bits with the 0·log0 = 0 convention", () => {
    expect(binaryEntropy(0)).toBe(0);
    expect(binaryEntropy(1)).toBe(0);
    expect(binaryEntropy(0.5)).toBe(1);
    expect(binaryEntropy(2 / 3)).toBeCloseTo(0.9182958340544896, 12);
  });

  it("carries the entropy of the prevalence onto the stat", () => {
    const half = elementStats([...rowsObserving(5, "n", "a"), ...rowsObserving(5, "n", "b")]).byStratum;
    expect(find(half, elementKey("n", "a")).entropy).toBe(1); // p = 0.5 → 1 bit
    const all = elementStats(rowsObserving(5, "n", "a")).byStratum;
    expect(find(all, elementKey("n", "a")).prevalence).toBe(1);
    expect(find(all, elementKey("n", "a")).entropy).toBe(0); // p = 1 → 0 bits
  });

  it("is null-safe when nothing was observed: prevalence 0, marked by eligible_documents = 0", () => {
    expect(prevalenceOf(0, 0)).toBe(0);
    const rows = [
      ...rowsObserving(3, "user_accounts", "multi_user"),
      ...Array.from({ length: 12 }, (_, i) => row(`b${i}`, { user_accounts: unobservedCell() }, { archetype: "booking" })),
    ];
    const blind = find(elementStats(rows).byStratum, MULTI, "booking");
    expect(blind.eligible_documents).toBe(0);
    expect(blind.observed_documents).toBe(0);
    expect(blind.prevalence).toBe(0); // a placeholder, never a measured zero…
    expect(Number.isFinite(blind.idf)).toBe(true);
    expect(blind.idf).toBe(1);
    expect(blind.unobserved_rate).toBe(1);
    expect(blind.archetype_lift).toBeNull(); // …which is why no lift is computed from it
    expect(classifyRarity(blind)).toBe("not_estimable"); // and this is how the type says so
  });
});

describe("rarity", () => {
  const stat = (eligible: number, observed: number): Pick<ElementStat, "eligible_documents" | "prevalence"> => ({
    eligible_documents: eligible,
    prevalence: prevalenceOf(eligible, observed),
  });

  it("classifies rare / uncommon / common / universal at the documented cut-points", () => {
    expect(classifyRarity(stat(40, 1))).toBe("rare"); // 0.025 < 0.05
    expect(classifyRarity(stat(20, 1))).toBe("uncommon"); // 0.05 is the boundary and belongs to uncommon
    expect(classifyRarity(stat(20, 3))).toBe("uncommon"); // 0.15
    expect(classifyRarity(stat(20, 4))).toBe("common"); // 0.20 is the boundary and belongs to common
    expect(classifyRarity(stat(20, 18))).toBe("common"); // 0.90
    expect(classifyRarity(stat(20, 19))).toBe("universal"); // 0.95 boundary
    expect(classifyRarity(stat(20, 20))).toBe("universal");
  });

  it("refuses to label anything below the minimum-eligible floor", () => {
    expect(DEFAULT_RARITY.minEligible).toBe(10);
    expect(classifyRarity(stat(3, 3))).toBe("not_estimable"); // a label from 3 documents is noise
    expect(classifyRarity(stat(9, 9))).toBe("not_estimable");
    expect(classifyRarity(stat(10, 10))).toBe("universal");
    // the floor is configurable, and raising it un-labels a previously labelled element
    expect(classifyRarity(stat(10, 10), { minEligible: 25 })).toBe("not_estimable");
    expect(classifyRarity(stat(40, 1), { rareBelow: 0.01 })).toBe("uncommon");
  });

  it("labels every emitted element end to end", () => {
    const rows = [...rowsObserving(19, "n", "a"), ...rowsObserving(1, "n", "b")];
    const report = elementStatsReport(rows);
    const labels = Object.fromEntries(report.rarity.map((r) => [r.key, r.rarity]));
    expect(labels[elementKey("n", "a")]).toBe("universal"); // 19/20 = 0.95
    expect(labels[elementKey("n", "b")]).toBe("uncommon"); // 1/20 = 0.05
  });
});

describe("stratification", () => {
  // crud-saas: 9 of 10 collect online · booking: 1 of 10 · pooled: 10 of 20 = 0.5
  const STRATIFIED: DecisionRow[] = [
    ...rowsObserving(9, "payments_in_app", "collect_online", { archetype: "crud-saas" }, "c"),
    ...rowsObserving(1, "payments_in_app", "none", { archetype: "crud-saas" }, "c"),
    ...rowsObserving(1, "payments_in_app", "collect_online", { archetype: "booking" }, "b"),
    ...rowsObserving(9, "payments_in_app", "none", { archetype: "booking" }, "b"),
  ];
  const ONLINE = elementKey("payments_in_app", "collect_online");

  it("keeps the populations separate and never pools them silently", () => {
    const { byStratum, pooled, meta } = elementStats(STRATIFIED);
    expect(find(byStratum, ONLINE, "crud-saas").prevalence).toBe(0.9);
    expect(find(byStratum, ONLINE, "booking").prevalence).toBe(0.1);
    expect(byStratum.every((s) => s.archetype !== null && s.source_kind !== null)).toBe(true);
    expect(meta.strata.map((s) => stratumLabel(s.archetype, s.source_kind)).sort()).toEqual(["booking/repo", "crud-saas/repo"]);
    // the pooled figure exists (archetype_lift needs it) and is always labelled as pooled
    expect(pooled.every((s) => s.archetype === null && s.source_kind === null)).toBe(true);
    expect(find(pooled, ONLINE, null).prevalence).toBe(0.5);
  });

  it("splits the same archetype by source kind too", () => {
    const mixed = [
      ...rowsObserving(4, "n", "a", { archetype: "crud-saas", source_kind: "repo" }, "r"),
      ...rowsObserving(4, "n", "b", { archetype: "crud-saas", source_kind: "session" }, "s"),
    ];
    const { byStratum } = elementStats(mixed);
    expect(find(byStratum.filter((s) => s.source_kind === "repo"), elementKey("n", "a")).prevalence).toBe(1);
    expect(find(byStratum.filter((s) => s.source_kind === "session"), elementKey("n", "a")).prevalence).toBe(0);
  });

  it("computes archetype_lift against the pooled figure", () => {
    const { byStratum, pooled } = elementStats(STRATIFIED);
    expect(find(pooled, ONLINE, null).prevalence).toBe(0.5);
    expect(find(byStratum, ONLINE, "crud-saas").archetype_lift).toBeCloseTo(0.9 / 0.5, 12); // 1.8
    expect(find(byStratum, ONLINE, "booking").archetype_lift).toBeCloseTo(0.1 / 0.5, 12); // 0.2
    // a pooled row has no archetype to lift, and a zero pooled prevalence is never divided by
    expect(pooled.every((s) => s.archetype_lift === null)).toBe(true);
  });

  it("emits an explicit zero row rather than a silent absence when an archetype never picks an option", () => {
    const rows = [...rowsObserving(4, "n", "a", { archetype: "crud-saas" }, "c"), ...rowsObserving(4, "n", "b", { archetype: "booking" }, "b")];
    const { byStratum } = elementStats(rows);
    const zero = find(byStratum, elementKey("n", "b"), "crud-saas");
    expect(zero.observed_documents).toBe(0);
    expect(zero.eligible_documents).toBe(4);
    expect(zero.prevalence).toBe(0);
    expect(zero.idf).toBe(Math.log(5 / 1) + 1);
  });

  it("emits the pooled view only when it is asked for", () => {
    expect(elementStatsReport(STRATIFIED).pooled).toEqual([]);
    expect(elementStatsReport(STRATIFIED, { pooled: true }).pooled.length).toBeGreaterThan(0);
    expect(elementStatsReport(STRATIFIED, { pooled: true }).pooled.every((s) => s.archetype === null && s.source_kind === null)).toBe(true);
  });
});

describe("normalizedIdf", () => {
  const withIdf = (key: string, idf: number): ElementStat =>
    ElementStatSchema.parse({
      key,
      node_id: key.split("=")[0],
      option_id: key.split("=")[1],
      archetype: "crud-saas",
      source_kind: "repo",
      eligible_documents: 20,
      observed_documents: 10,
      prevalence: 0.5,
      entropy: 1,
      idf,
      unobserved_rate: 0,
    });

  it("min-max normalises into [0,1]", () => {
    const n = normalizedIdf([withIdf("n=a", 1), withIdf("n=b", 2), withIdf("n=c", 3)]);
    expect(n.get("crud-saas|repo|n=a")).toBe(0);
    expect(n.get("crud-saas|repo|n=b")).toBe(0.5);
    expect(n.get("crud-saas|repo|n=c")).toBe(1);
  });

  it("returns 0 for every element when they are all equally rare (documented degenerate case)", () => {
    const all = normalizedIdf([withIdf("n=a", 2), withIdf("n=b", 2), withIdf("n=c", 2)]);
    expect([...all.values()]).toEqual([0, 0, 0]);
    // …so the selector adjustment below is the identity: no element is rarer, nothing may be reordered
    expect(adjustValueByRarity(0.7, all.get("crud-saas|repo|n=a")!, 1, 0.5)).toBe(0.7);
    expect([...normalizedIdf([withIdf("n=a", 2)]).values()]).toEqual([0]);
    expect(normalizedIdf([]).size).toBe(0);
  });
});

describe("adjustValueByRarity — the selector experiment ships inert", () => {
  const SPREAD: [number, number, number][] = [
    [0, 0, 0],
    [1, 1, 1],
    [0.5, 0.25, 0.75],
    [1e-9, 1, 1],
    [1234.5678, 0.3333333333333333, 0.6666666666666666],
    [-0.25, 0.9, 0.1],
    [Number.MAX_SAFE_INTEGER, 1, 1],
    [-0, 1, 1],
    [Number.POSITIVE_INFINITY, 1, 1],
    [Number.NaN, Number.NaN, Number.NaN],
  ];

  it("is an EXACT identity at the default rarityWeight of 0", () => {
    for (const [value, nidf, uncertainty] of SPREAD) {
      expect(Object.is(adjustValueByRarity(value, nidf, uncertainty), value)).toBe(true);
      expect(Object.is(adjustValueByRarity(value, nidf, uncertainty, 0), value)).toBe(true);
    }
  });

  it("applies exactly value * (1 + rarityWeight * normalized_idf * uncertainty) when switched on", () => {
    expect(adjustValueByRarity(2, 0.5, 0.4, 1)).toBeCloseTo(2 * (1 + 1 * 0.5 * 0.4), 12); // 2.4
    expect(adjustValueByRarity(0.6, 1, 1, 0.25)).toBeCloseTo(0.75, 12);
    // rarity only SCALES an existing value: it can never lift a worthless question…
    expect(adjustValueByRarity(0, 1, 1, 10)).toBe(0);
    // …and a decision we are certain about gets no boost from being unusual
    expect(adjustValueByRarity(0.9, 1, 0, 10)).toBe(0.9);
  });
});

describe("catalog gap signals", () => {
  it("flags a node that applied to many rows and was almost never observed", () => {
    const rows = [
      ...rowsObserving(2, "data_residency", "eu", {}, "o"),
      ...Array.from({ length: 18 }, (_, i) => row(`u${i}`, { data_residency: unobservedCell() })),
    ];
    const gaps = elementStatsReport(rows).gaps;
    const hit = gaps.find((g) => g.kind === "unobservable_node" && g.node_id === "data_residency");
    expect(hit).toBeDefined();
    expect(hit!.rows).toBe(20);
    expect(hit!.eligible_documents).toBe(2);
    expect(hit!.unobserved_rate).toBe(0.9);
    expect(hit!.why).toContain("not among the options");
  });

  it("still flags a node that was never observed with ANY option — it has no element rows to hide behind", () => {
    const rows = Array.from({ length: 20 }, (_, i) => row(`u${i}`, { payments_in_app: observedCell("none"), data_residency: unobservedCell() }));
    const report = elementStatsReport(rows);
    // total blindness: the node produced no element rows at all…
    expect(report.byStratum.some((s) => s.node_id === "data_residency")).toBe(false);
    // …and the signal survives anyway, which is the point
    const hit = report.gaps.find((g) => g.kind === "unobservable_node" && g.node_id === "data_residency" && g.archetype === "crud-saas");
    expect(hit).toBeDefined();
    expect(hit!.rows).toBe(20);
    expect(hit!.eligible_documents).toBe(0);
    expect(hit!.unobserved_rate).toBe(1);
  });

  it("round-trips a stratum-node key, pooled scope included", () => {
    expect(parseStratumNodeKey(stratumNodeKey("crud-saas", "repo", "user_accounts"))).toEqual({ archetype: "crud-saas", source_kind: "repo", node_id: "user_accounts" });
    expect(parseStratumNodeKey(stratumNodeKey(null, null, "user_accounts"))).toEqual({ archetype: null, source_kind: null, node_id: "user_accounts" });
    expect(parseStratumNodeKey("nonsense")).toBeNull();
  });

  it("flags a fragmented option set with no dominant choice", () => {
    const rows = [...rowsObserving(7, "n", "a"), ...rowsObserving(7, "n", "b"), ...rowsObserving(7, "n", "c")];
    const gaps = elementStatsReport(rows).gaps;
    expect(gaps.some((g) => g.kind === "fragmented_options" && g.node_id === "n")).toBe(true);
  });

  it("flags an option the catalog offers that nobody ever chose, and says so louder when pooled", () => {
    const rows = rowsObserving(20, "n", "a");
    const gaps = elementStatsReport(rows, { seedOptions: { n: ["a", "b"] } }).gaps;
    const dead = gaps.filter((g) => g.kind === "dead_option" && g.option_id === "b");
    expect(dead.length).toBe(2); // once per stratum, once pooled
    const pooledSignal = dead.find((g) => g.archetype === null)!;
    expect(pooledSignal.why).toContain("nobody chose it anywhere");
    expect(pooledSignal.score).toBeGreaterThan(dead.find((g) => g.archetype !== null)!.score);
  });

  it("flags a node whose answer is already settled", () => {
    const gaps = elementStatsReport(rowsObserving(20, "n", "a")).gaps;
    const settled = gaps.find((g) => g.kind === "no_real_choice");
    expect(settled).toBeDefined();
    expect(settled!.option_id).toBe("a");
    expect(settled!.why).toContain("check the lexicon");
  });

  it("stays silent below the reporting floor and ranks what it does emit", () => {
    expect(catalogGapSignals(elementStats(rowsObserving(4, "n", "a")).byStratum)).toEqual([]);
    const gaps = elementStatsReport([...rowsObserving(20, "n", "a"), ...Array.from({ length: 30 }, (_, i) => row(`u${i}`, { m: unobservedCell() }))]).gaps;
    expect(gaps.length).toBeGreaterThan(1);
    for (let i = 1; i < gaps.length; i++) expect(gaps[i - 1]!.score).toBeGreaterThanOrEqual(gaps[i]!.score);
  });
});

describe("the produced stats are well formed", () => {
  const rows = [
    ...rowsObserving(9, "payments_in_app", "collect_online", { archetype: "crud-saas" }, "c"),
    ...rowsObserving(1, "payments_in_app", "none", { archetype: "crud-saas" }, "c"),
    ...rowsObserving(4, "payments_in_app", "none", { archetype: "booking", source_kind: "session" }, "b"),
    row("x", { payments_in_app: conflictCell(["none", "collect_online"]) }),
    row("y", { payments_in_app: unobservedCell() }),
  ];

  it("satisfies ElementStatSchema and the observed <= eligible invariant", () => {
    const report = elementStatsReport(rows, { pooled: true });
    const all = [...report.byStratum, ...report.pooled];
    expect(all.length).toBeGreaterThan(0);
    for (const s of all) {
      expect(() => ElementStatSchema.parse(s)).not.toThrow();
      expect(s.observed_documents).toBeLessThanOrEqual(s.eligible_documents);
      expect(s.prevalence).toBeGreaterThanOrEqual(0);
      expect(s.prevalence).toBeLessThanOrEqual(1);
      expect(s.entropy).toBeGreaterThanOrEqual(0);
      expect(s.entropy).toBeLessThanOrEqual(1);
      expect(s.idf).toBeGreaterThanOrEqual(1);
      expect(Number.isFinite(s.idf)).toBe(true);
      expect(s.unobserved_rate).toBeGreaterThanOrEqual(0);
      expect(s.unobserved_rate).toBeLessThanOrEqual(1);
      expect(elementStatIssues(s)).toEqual([]);
    }
    expect(report.meta.issues).toEqual([]);
  });

  it("catches a hand-mangled stat", () => {
    const sound = find(elementStats(rows).byStratum, elementKey("payments_in_app", "none"));
    expect(elementStatIssues({ ...sound, key: "not-an-element" })).toEqual(['"not-an-element" is not a node=option element key']);
    expect(elementStatIssues({ ...sound, option_id: "collect_online" })).toEqual([
      'key "payments_in_app=none" disagrees with node_id="payments_in_app" option_id="collect_online"',
    ]);
    expect(elementStatIssues({ ...sound, observed_documents: 99 })).toEqual(["observed 99 > eligible 10"]);
    expect(elementStatIssues({ ...sound, idf: Number.NaN })).toEqual(["idf is NaN"]);
  });

  it("renders a report that names the pooled view and the review-only status of gaps", () => {
    const text = renderElementStatsReport(elementStatsReport(rows, { pooled: true }));
    expect(text).toContain("# design-element statistics");
    expect(text).toContain("idf = log((eligible + 1) / (observed + 1)) + 1");
    expect(text).toContain("POOLED");
    expect(text).toContain("review only, nothing here edits a catalog");
    expect(text).toContain("crud-saas/repo");
    expect(text).toContain("booking/session");
  });
});

describe("CLI arguments", () => {
  it("requires a matrix and defaults the rest", () => {
    expect(() => parseElementStatsArgs([])).toThrow(UsageError);
    expect(parseElementStatsArgs(["--matrix", "rows.jsonl"])).toEqual({ matrix: "rows.jsonl", out: "mining-results", minEligible: 10, pooled: false });
    expect(parseElementStatsArgs(["--matrix", "rows.jsonl", "--out", "o", "--min-eligible", "25", "--pooled"])).toEqual({
      matrix: "rows.jsonl",
      out: "o",
      minEligible: 25,
      pooled: true,
    });
  });

  it("rejects a nonsense floor and unknown flags", () => {
    expect(() => parseElementStatsArgs(["--matrix", "r.jsonl", "--min-eligible", "nope"])).toThrow(UsageError);
    expect(() => parseElementStatsArgs(["--matrix", "r.jsonl", "--nope", "1"])).toThrow(UsageError);
  });
});
