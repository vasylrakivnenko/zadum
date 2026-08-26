import { describe, expect, it } from "vitest";
import {
  allPairs,
  candidateElements,
  cooccurrenceReport,
  elementSupport,
  nodeObservedCounts,
  pairCounts,
  pairEligibility,
  pairStat,
  parseCooccurrenceArgs,
  parseStratumKey,
  POOLED_SCOPE,
  renderCooccurrenceReport,
  stratify,
  stratumKey,
  type Scope,
} from "./cooccurrence.js";
import { DecisionRowSchema, type DecisionCell, type DecisionRow } from "./matrix.js";
import {
  buildDesignGraph,
  detectSimpsons,
  DEFAULT_THRESHOLDS,
  softEdgesFor,
  validateGraph,
  validatePairStat,
  wilsonInterval,
} from "../learning/design_graph.js";
import { UsageError } from "../cli/flags.js";

// ---------------------------------------------------------------------------
// Fixture builders — real catalog node and option ids (core: user_accounts, payments_in_app)
// ---------------------------------------------------------------------------

const NODE_INDEX = new Map<string, Set<string>>([
  ["user_accounts", new Set(["none", "single_user", "multi_user"])],
  ["payments_in_app", new Set(["none", "record_only", "collect_online", "payouts_too"])],
]);

const observed = (option: string): DecisionCell => ({
  status: "observed",
  option,
  observable: true,
  evidence_feature_ids: [`f_${option}`],
  evidence_quotes: [],
  negative_feature_ids: [],
  candidates: [{ option, feature_ids: [`f_${option}`], quotes: [] }],
  unobserved_reason: null,
  downgrade_reasons: {},
});

/** Looked at, nothing said. `observable: true` — the row COULD have shown it. */
const silent = (): DecisionCell => ({
  status: "unobserved",
  observable: true,
  evidence_feature_ids: [],
  evidence_quotes: [],
  negative_feature_ids: [],
  candidates: [],
  unobserved_reason: "silent",
  downgrade_reasons: {},
});

/** Never askable in this source kind — the row was not even eligible to say anything about the node. */
const blind = (): DecisionCell => ({
  status: "unobserved",
  observable: false,
  evidence_feature_ids: [],
  evidence_quotes: [],
  negative_feature_ids: [],
  candidates: [],
  unobserved_reason: "not_askable_in_source",
  downgrade_reasons: { undetectable_in_doc_type: 1 },
});

/** Two options with positive evidence — never silently resolved, and never counted. */
const conflicted = (options: string[]): DecisionCell => ({
  status: "conflict",
  observable: true,
  evidence_feature_ids: options.map((o) => `f_${o}`),
  evidence_quotes: [],
  negative_feature_ids: [],
  candidates: options.map((o) => ({ option: o, feature_ids: [`f_${o}`], quotes: [] })),
  unobserved_reason: null,
  downgrade_reasons: {},
});

const mkRow = (row_id: string, cells: Record<string, DecisionCell>, over: Partial<DecisionRow> = {}): DecisionRow => ({
  schema: "zadum.decision-row.v1",
  row_id,
  source_kind: "repo",
  source_id: row_id,
  archetype: "crud-saas",
  catalog_version: "test@1",
  lexicon_version: "test-lex@1",
  cells,
  conflicts: [],
  not_applicable: [],
  ...over,
});

const A = "payments_in_app=collect_online";
const B = "user_accounts=multi_user";

/**
 * The small fixture, hand-counted.
 *
 *   eligible (both nodes observed), 8 rows:  n11 = 3 · n10 = 1 · n01 = 1 · n00 = 3
 *   NOT eligible, 4 rows, each of which a naive implementation would miscount:
 *     u-both   both nodes unobserved          → naive n00 = 4
 *     u-from   A unobserved, B named          → naive n01 = 2
 *     c-to     A named, B conflicting         → naive n10 = 2
 *     u-blind  A named, B never askable       → naive n10 = 3
 *
 * 12 rows in total. A honest table sees 8.
 */
function smallFixture(): DecisionRow[] {
  const rows: DecisionRow[] = [];
  for (let i = 0; i < 3; i++) rows.push(mkRow(`n11-${i}`, { payments_in_app: observed("collect_online"), user_accounts: observed("multi_user") }));
  rows.push(mkRow("n10-0", { payments_in_app: observed("collect_online"), user_accounts: observed("none") }));
  rows.push(mkRow("n01-0", { payments_in_app: observed("record_only"), user_accounts: observed("multi_user") }));
  for (let i = 0; i < 3; i++) rows.push(mkRow(`n00-${i}`, { payments_in_app: observed("record_only"), user_accounts: observed("none") }));
  rows.push(mkRow("u-both", { payments_in_app: silent(), user_accounts: silent() }));
  rows.push(mkRow("u-from", { payments_in_app: silent(), user_accounts: observed("multi_user") }));
  rows.push(mkRow("c-to", { payments_in_app: observed("collect_online"), user_accounts: conflicted(["none", "multi_user"]) }));
  rows.push(mkRow("u-blind", { payments_in_app: observed("collect_online"), user_accounts: blind() }));
  return rows;
}

const SCOPE: Scope = { archetype: "crud-saas", source_kind: "repo" };

// ---------------------------------------------------------------------------

describe("pairCounts — the 2×2 table", () => {
  it("counts a hand-built fixture exactly", () => {
    const c = pairCounts(smallFixture(), A, B);
    expect(c).toEqual({
      n11: 3,
      n10: 1,
      n01: 1,
      n00: 3,
      eligible_n: 8,
      support_row_ids: ["n11-0", "n11-1", "n11-2"],
    });
  });

  it("mirrors when the pair is reversed", () => {
    const c = pairCounts(smallFixture(), B, A);
    expect([c.n11, c.n10, c.n01, c.n00]).toEqual([3, 1, 1, 3]); // symmetric in THIS fixture by construction
    const asym = pairCounts(smallFixture(), A, "user_accounts=none");
    expect([asym.n11, asym.n10, asym.n01, asym.n00]).toEqual([1, 3, 3, 1]);
  });

  it("NEVER counts an unobserved row as n00 — not in n00, not in eligible_n", () => {
    const rows = smallFixture();
    const c = pairCounts(rows, A, B);
    // "u-both" has neither node observed. A naive `option !== named ⇒ negative` implementation would put it
    // in n00 (giving 4) and in eligible_n (giving 12). Silence is not a "no".
    expect(c.n00).toBe(3);
    expect(c.eligible_n).toBe(8);
    expect(rows.length).toBe(12);
    expect(c.support_row_ids).not.toContain("u-both");

    // and the same for the two one-sided silences
    expect(c.n01).toBe(1); // NOT 2 — "u-from" has B named but A unobserved
    expect(c.n10).toBe(1); // NOT 3 — "c-to" and "u-blind" have A named but B unusable
  });

  it("excludes a conflicting row", () => {
    const rows = [
      mkRow("ok", { payments_in_app: observed("collect_online"), user_accounts: observed("multi_user") }),
      mkRow("clash", { payments_in_app: observed("collect_online"), user_accounts: conflicted(["none", "multi_user"]) }),
    ];
    const c = pairCounts(rows, A, B);
    expect(c.eligible_n).toBe(1);
    expect(c.n10).toBe(0);
    expect(c.support_row_ids).toEqual(["ok"]);
  });

  it("ignores a row whose column is missing entirely", () => {
    const rows = [mkRow("no-column", { payments_in_app: observed("collect_online") })];
    expect(pairCounts(rows, A, B).eligible_n).toBe(0);
  });

  it("holds the invariant n11 + n10 + n01 + n00 === eligible_n", () => {
    const rows = smallFixture();
    for (const [from, to] of [
      [A, B],
      [B, A],
      [A, "user_accounts=none"],
      ["payments_in_app=record_only", B],
      [A, "user_accounts=single_user"], // an element observed in zero rows
    ] as const) {
      const c = pairCounts(rows, from, to);
      expect(c.n11 + c.n10 + c.n01 + c.n00).toBe(c.eligible_n);
    }
  });

  it("rejects a malformed element key rather than guessing", () => {
    expect(() => pairCounts(smallFixture(), "not-an-element", B)).toThrow(UsageError);
    expect(() => pairCounts(smallFixture(), A, "=orphan")).toThrow(UsageError);
  });
});

describe("pairEligibility — why rows were dropped", () => {
  it("accounts for every row exactly once", () => {
    const e = pairEligibility(smallFixture(), A, B);
    expect(e).toEqual({ rows: 12, eligible: 8, not_observable: 1, silent: 2, conflict: 1 });
    expect(e.eligible + e.not_observable + e.silent + e.conflict).toBe(e.rows);
  });
});

describe("pairStat", () => {
  it("computes the documented formulas on hand-computed numbers", () => {
    const s = pairStat(smallFixture(), A, B, SCOPE);
    // n11 = 3, n10 = 1, n01 = 1, n00 = 3, eligible_n = 8; Jeffreys a = b = 0.5
    expect(s.p_to_given_from).toBeCloseTo(3.5 / 5, 12); // (3 + .5) / (4 + 1) = 0.7
    expect(s.p_from_given_to).toBeCloseTo(3.5 / 5, 12); // (3 + .5) / (4 + 1) = 0.7
    expect(s.p_to).toBeCloseTo(4.5 / 9, 12); // (3 + 1 + .5) / (8 + 1) = 0.5
    expect(s.p_from).toBeCloseTo(4.5 / 9, 12); // (3 + 1 + .5) / (8 + 1) = 0.5
    expect(s.lift).toBeCloseTo(1.4, 12); // 0.7 / 0.5
    expect(s.difference).toBeCloseTo(0.2, 12); // 0.7 − 0.5
    expect(s.archetype).toBe("crud-saas");
    expect(s.source_kind).toBe("repo");
  });

  it("reports coverage over ALL rows in the stratum, not over eligible rows", () => {
    const s = pairStat(smallFixture(), A, B, SCOPE);
    // 12 rows · payments observed in 10 (8 eligible + c-to + u-blind) · accounts observed in 9 (8 + u-from)
    expect(s.coverage_from).toBeCloseTo(10 / 12, 12);
    expect(s.coverage_to).toBeCloseTo(9 / 12, 12);
    expect(s.joint_coverage).toBeCloseTo(8 / 12, 12);
  });

  it("passes validatePairStat on its own output", () => {
    const rows = smallFixture();
    for (const [from, to] of [
      [A, B],
      [B, A],
      [A, "user_accounts=single_user"],
      ["payments_in_app=payouts_too", B],
    ] as const) {
      expect(validatePairStat(pairStat(rows, from, to, SCOPE))).toEqual([]);
    }
  });

  it("smoothing keeps a zero-count cell from asserting p = 0", () => {
    // `user_accounts=single_user` is observed in NO row: n11 = 0, n10 = 4, n01 = 0, n00 = 4.
    const s = pairStat(smallFixture(), A, "user_accounts=single_user", SCOPE);
    expect([s.n11, s.n10, s.n01, s.n00, s.eligible_n]).toEqual([0, 4, 0, 4, 8]);
    expect(s.p_to_given_from).toBeCloseTo(0.5 / 5, 12); // 0.1, not 0 — "none of few", not "impossible"
    expect(s.p_to).toBeCloseTo(0.5 / 9, 12);
    expect(s.p_to_given_from).toBeGreaterThan(0);
    expect(s.p_to).toBeGreaterThan(0);
    // and the interval never collapses to a point at the boundary
    expect(s.ci95.low).toBe(0);
    expect(s.ci95.high).toBeGreaterThan(0.1);
  });

  it("guards lift when the baseline p(B) is exactly 0", () => {
    // Raw (unsmoothed) rates are reachable by passing a degenerate prior; then p(B) can be 0 and the ratio
    // would be NaN/Infinity — neither is a number, and neither means "infinitely strong".
    const s = pairStat(smallFixture(), A, "user_accounts=single_user", SCOPE, { a: 0, b: 0 });
    expect(s.p_to).toBe(0);
    expect(s.lift).toBe(0);
    expect(Number.isFinite(s.lift)).toBe(true);
    expect(validatePairStat(s)).toEqual([]);
  });

  it("uses Wilson intervals, hand-checked, and keeps 0-of-n / n-of-n non-degenerate", () => {
    const s = pairStat(smallFixture(), A, B, SCOPE);
    // wilsonInterval(3, 4) with z = 1.96
    expect(s.ci95.low).toBeCloseTo(0.3006360524, 8);
    expect(s.ci95.high).toBeCloseTo(0.9544139374, 8);

    const none = wilsonInterval(0, 8);
    expect(none.low).toBe(0);
    expect(none.high).toBeCloseTo(0.324416, 5); // NOT [0, 0]: 0-of-8 is not an impossibility
    expect(none.high - none.low).toBeGreaterThan(0.3);

    const all = wilsonInterval(8, 8);
    expect(all.high).toBe(1);
    expect(all.low).toBeCloseTo(0.675584, 5); // NOT [1, 1]: 8-of-8 is not a law
    expect(all.high - all.low).toBeGreaterThan(0.3);
  });

  it("survives an empty stratum without producing NaN", () => {
    const s = pairStat([], A, B, POOLED_SCOPE);
    expect(validatePairStat(s)).toEqual([]);
    expect(s.eligible_n).toBe(0);
    expect(s.coverage_from).toBe(0);
    expect(s.joint_coverage).toBe(0);
    expect(Number.isFinite(s.lift)).toBe(true);
  });
});

describe("stratification", () => {
  const mixed = (): DecisionRow[] => [
    mkRow("r1", { payments_in_app: observed("collect_online"), user_accounts: observed("multi_user") }, { archetype: "crud-saas", source_kind: "repo" }),
    mkRow("r2", { payments_in_app: observed("collect_online"), user_accounts: observed("none") }, { archetype: "crud-saas", source_kind: "spec_doc" }),
    mkRow("r3", { payments_in_app: observed("record_only"), user_accounts: observed("multi_user") }, { archetype: "content-site", source_kind: "repo" }),
    mkRow("r4", { payments_in_app: observed("record_only"), user_accounts: observed("none") }, { archetype: "content-site", source_kind: "repo" }),
  ];

  it("splits by archetype AND source kind, deterministically ordered", () => {
    const by = stratify(mixed(), { archetype: true, sourceKind: true });
    expect([...by.keys()]).toEqual(["content-site|repo", "crud-saas|repo", "crud-saas|spec_doc"]);
    expect(by.get("content-site|repo")!.map((r) => r.row_id)).toEqual(["r3", "r4"]);
  });

  it("keeps archetypes apart and never pools by accident", () => {
    const res = cooccurrenceReport(mixed(), { by: { archetype: true, sourceKind: false }, minEligible: 1 });
    expect(res.strata.map((s) => s.archetype)).toEqual(["content-site", "crud-saas"]);
    // every stratified statistic is LABELLED with its archetype; none is pooled
    expect(res.stats.every((s) => s.archetype !== null)).toBe(true);
    // and the two archetypes really do disagree: crud-saas has collect_online, content-site does not
    const crud = res.stats.filter((s) => s.archetype === "crud-saas");
    const content = res.stats.filter((s) => s.archetype === "content-site");
    expect(crud.some((s) => s.from === A)).toBe(true);
    expect(content.some((s) => s.from === A)).toBe(false);
  });

  it("produces a pooled aggregate ONLY when explicitly asked", () => {
    const rows = mixed();
    expect(cooccurrenceReport(rows, { minEligible: 1 }).pooled).toEqual([]);
    const withPooled = cooccurrenceReport(rows, { minEligible: 1, pooled: true });
    expect(withPooled.pooled.length).toBeGreaterThan(0);
    // labelled as pooled on BOTH dimensions, everywhere
    expect(withPooled.pooled.every((s) => s.archetype === null && s.source_kind === null)).toBe(true);
  });

  it("round-trips a stratum key", () => {
    expect(parseStratumKey(stratumKey({ archetype: "crud-saas", source_kind: "repo" }))).toEqual({ archetype: "crud-saas", source_kind: "repo" });
    expect(parseStratumKey(stratumKey(POOLED_SCOPE))).toEqual({ archetype: null, source_kind: null });
  });
});

describe("allPairs", () => {
  it("skips pairs drawn from the SAME node — a tautology, not an association", () => {
    const stats = allPairs(smallFixture(), SCOPE, { minEligible: 1 });
    expect(stats.length).toBeGreaterThan(0);
    for (const s of stats) {
      const fromNode = s.from.slice(0, s.from.indexOf("="));
      const toNode = s.to.slice(0, s.to.indexOf("="));
      expect(fromNode).not.toBe(toNode);
    }
    // `user_accounts=none` and `user_accounts=multi_user` are both observed, and would otherwise pair up
    expect(elementSupport(smallFixture()).get("user_accounts=none")).toBe(4);
    expect(stats.some((s) => s.from === "user_accounts=none" && s.to === B)).toBe(false);
  });

  it("emits BOTH directions of a cross-node pair", () => {
    const stats = allPairs(smallFixture(), SCOPE, { minEligible: 1 });
    expect(stats.some((s) => s.from === A && s.to === B)).toBe(true);
    expect(stats.some((s) => s.from === B && s.to === A)).toBe(true);
  });

  it("honours the minEligible floor", () => {
    expect(allPairs(smallFixture(), SCOPE, { minEligible: 1 }).length).toBeGreaterThan(0);
    expect(allPairs(smallFixture(), SCOPE, { minEligible: 9 })).toEqual([]); // eligible_n is 8 at most here
  });

  it("caps the enumeration so a large catalog cannot explode", () => {
    // maxPairs = 2 leaves room for 2 elements (2 ordered pairs); both come from the most-observed elements.
    expect(candidateElements(smallFixture(), { maxPairs: 2 }).length).toBe(2);
    expect(candidateElements(smallFixture(), { maxPairs: 20000 }).length).toBe(4);
    expect(allPairs(smallFixture(), SCOPE, { minEligible: 1, maxPairs: 2 }).length).toBeLessThanOrEqual(2);
  });

  it("drops elements below minElementSupport", () => {
    // support in the small fixture: collect_online 6 · multi_user 5 · record_only 4 · none 4
    expect(candidateElements(smallFixture(), { minElementSupport: 7 })).toEqual([]);
    expect(candidateElements(smallFixture(), { minElementSupport: 5 })).toEqual(["payments_in_app=collect_online", "user_accounts=multi_user"]);
    expect(candidateElements(smallFixture(), { minElementSupport: 4 })).toEqual([
      "payments_in_app=collect_online",
      "payments_in_app=record_only",
      "user_accounts=multi_user",
      "user_accounts=none",
    ]);
  });

  it("is deterministic: identical input yields byte-identical output", () => {
    const a = JSON.stringify(allPairs(smallFixture(), SCOPE, { minEligible: 1 }));
    const b = JSON.stringify(allPairs(smallFixture(), SCOPE, { minEligible: 1 }));
    expect(a).toBe(b);
  });

  it("orders pairs by (from, to) regardless of the order the rows arrived in", () => {
    const rows = smallFixture();
    const shuffled = [...rows].reverse();
    const order = (rs: DecisionRow[]) => allPairs(rs, SCOPE, { minEligible: 1 }).map((s) => `${s.from} ${s.to}`);
    expect(order(shuffled)).toEqual(order(rows));
    expect(order(rows)).toEqual([...order(rows)].sort());
  });
});

describe("element statistics come from element_stats.ts, not from a second copy here", () => {
  it("uses the OBSERVED denominator, so an observable-but-unobserved row is never a negative", () => {
    const stats = cooccurrenceReport(smallFixture(), { minEligible: 1, pooled: true }).elements;
    const multi = stats.find((e) => e.key === B && e.archetype === "crud-saas")!;
    // user_accounts is observed with SOME option in 9 of the 12 rows; 5 of those chose multi_user.
    // The 2 rows that were askable but stayed silent are in NEITHER the numerator nor the denominator —
    // putting them in the denominator would make `unobserved` act as a vote against multi_user.
    expect(multi.observed_documents).toBe(5);
    expect(multi.eligible_documents).toBe(9);
    expect(multi.prevalence).toBeCloseTo(5 / 9, 12);
  });

  it("uses the pinned IDF formula, `ln((eligible+1)/(observed+1)) + 1`", () => {
    const stats = cooccurrenceReport(smallFixture(), { minEligible: 1, pooled: true }).elements;
    const multi = stats.find((e) => e.key === B && e.archetype === "crud-saas")!;
    expect(multi.idf).toBeCloseTo(Math.log((9 + 1) / (5 + 1)) + 1, 12);
  });

  it("keeps observed <= eligible on every emitted element", () => {
    const res = cooccurrenceReport(smallFixture(), { minEligible: 1, pooled: true });
    for (const e of [...res.elements, ...res.pooled_elements]) {
      expect(e.observed_documents).toBeLessThanOrEqual(e.eligible_documents);
    }
  });

  it("emits pooled elements only on opt-in", () => {
    expect(cooccurrenceReport(smallFixture(), { minEligible: 1 }).pooled_elements).toEqual([]);
    expect(cooccurrenceReport(smallFixture(), { minEligible: 1, pooled: true }).pooled_elements.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Simpson's paradox — a named Definition-of-Done item
// ---------------------------------------------------------------------------

/**
 * TWO ARCHETYPES, OPPOSITE CONCLUSIONS.
 *
 * A = `payments_in_app=collect_online`, B = `user_accounts=multi_user`.
 *
 *   content-site   300 rows   n11=3    n10=57   n01=54   n00=186
 *                  p(B|A) = 3/60  = 0.05   p(B) = 57/300  = 0.19     → NEGATIVE (−0.134 smoothed)
 *   b2b-invoicing  600 rows   n11=312  n10=168  n01=114  n00=6
 *                  p(B|A) = 312/480 = 0.65 p(B) = 426/600 = 0.71     → NEGATIVE (−0.060 smoothed)
 *   POOLED         900 rows   n11=315  n10=225  n01=168  n00=192
 *                  p(B|A) = 315/540 = 0.583 p(B) = 483/900 = 0.537   → POSITIVE (+0.047 smoothed)
 *
 * The composition effect, in words: b2b-invoicing rows are BOTH payment-heavy (80% collect online) and
 * account-heavy (71% multi-user); content-site rows are neither (20% and 19%). Pooling lets the archetype's
 * own base rates masquerade as an association between the two decisions — the pooled number measures which
 * archetype a row came from, not what taking payments implies about accounts. Within each archetype the true
 * relation is the opposite: the apps that collect online are the self-serve, single-operator ones.
 */
function simpsonsFixture(): DecisionRow[] {
  const rows: DecisionRow[] = [];
  const add = (archetype: string, tag: string, count: number, payments: string, accounts: string) => {
    for (let i = 0; i < count; i++) {
      rows.push(mkRow(`${archetype}:${tag}:${i}`, { payments_in_app: observed(payments), user_accounts: observed(accounts) }, { archetype }));
    }
  };
  add("content-site", "n11", 3, "collect_online", "multi_user");
  add("content-site", "n10", 57, "collect_online", "none");
  add("content-site", "n01", 54, "record_only", "multi_user");
  add("content-site", "n00", 186, "record_only", "none");
  add("b2b-invoicing", "n11", 312, "collect_online", "multi_user");
  add("b2b-invoicing", "n10", 168, "collect_online", "single_user");
  add("b2b-invoicing", "n01", 114, "record_only", "multi_user");
  add("b2b-invoicing", "n00", 6, "record_only", "single_user");
  return rows;
}

describe("Simpson's paradox", () => {
  const rows = simpsonsFixture();
  const res = cooccurrenceReport(rows, { pooled: true, minEligible: DEFAULT_THRESHOLDS.reportMinN });
  const pick = (stats: typeof res.stats, archetype: string | null) => stats.find((s) => s.from === A && s.to === B && s.archetype === archetype)!;

  it("builds the fixture the comment describes", () => {
    expect(rows.length).toBe(900);
    const content = pick(res.stats, "content-site");
    const b2b = pick(res.stats, "b2b-invoicing");
    const pooled = pick(res.pooled, null);
    expect([content.n11, content.n10, content.n01, content.n00, content.eligible_n]).toEqual([3, 57, 54, 186, 300]);
    expect([b2b.n11, b2b.n10, b2b.n01, b2b.n00, b2b.eligible_n]).toEqual([312, 168, 114, 6, 600]);
    expect([pooled.n11, pooled.n10, pooled.n01, pooled.n00, pooled.eligible_n]).toEqual([315, 225, 168, 192, 900]);
    for (const s of [content, b2b, pooled]) expect(validatePairStat(s)).toEqual([]);
  });

  it("runs one way within each archetype and the OTHER way pooled", () => {
    expect(pick(res.stats, "content-site").difference).toBeCloseTo(-0.133653, 5);
    expect(pick(res.stats, "b2b-invoicing").difference).toBeCloseTo(-0.059962, 5);
    expect(pick(res.pooled, null).difference).toBeCloseTo(0.046553, 5);
  });

  it("detectSimpsons flags the pair", () => {
    const findings = detectSimpsons(res.pooled, res.stats, DEFAULT_THRESHOLDS.reportMinN);
    const f = findings.find((x) => x.from === A && x.to === B);
    expect(f).toBeDefined();
    expect(f!.pooled_difference).toBeGreaterThan(0);
    expect(f!.strata.map((s) => s.archetype).sort()).toEqual(["b2b-invoicing", "content-site"]);
    expect(f!.strata.every((s) => s.difference < 0)).toBe(true);
    expect(f!.why).toContain("composition artifact");
  });

  it("the pooled edge carries the warning and the per-archetype edges carry NONE", () => {
    const built = buildDesignGraph(res.stats, { pooled: res.pooled, elements: [...res.elements, ...res.pooled_elements], version: "test" });
    const edges = built.graph.edges.filter((e) => e.from === A && e.to === B);
    const pooledEdge = edges.find((e) => e.archetype === null)!;
    const strata = edges.filter((e) => e.archetype !== null);

    expect(pooledEdge.simpsons_warning).toBeTruthy();
    expect(pooledEdge.relation).toBe("soft_positive");
    expect(strata.length).toBe(2);
    for (const e of strata) {
      expect(e.simpsons_warning).toBeNull();
      expect(e.relation).toBe("soft_negative");
    }
    // and no learned edge is ever hard, however clean the association
    expect(built.graph.edges.filter((e) => e.status === "candidate").every((e) => !e.relation.startsWith("hard"))).toBe(true);
  });

  it("softEdgesFor drops the confounded pooled edge and keeps the stratum edge", () => {
    const built = buildDesignGraph(res.stats, { pooled: res.pooled, version: "test" });
    const forContent = softEdgesFor(built.graph, { archetypes: ["content-site"] }).filter((e) => e.from === A && e.to === B);
    expect(forContent.length).toBe(1);
    expect(forContent[0]!.archetype).toBe("content-site");
    expect(forContent[0]!.relation).toBe("soft_negative");
    // an archetype with no stratum of its own gets nothing rather than the confounded pooled number
    expect(softEdgesFor(built.graph, { archetypes: ["marketplace"] }).filter((e) => e.from === A && e.to === B)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// End to end
// ---------------------------------------------------------------------------

describe("cooccurrenceReport → buildDesignGraph", () => {
  it("produces a graph that validates against a node index", () => {
    const res = cooccurrenceReport(simpsonsFixture(), { pooled: true, minEligible: DEFAULT_THRESHOLDS.reportMinN });
    const built = buildDesignGraph(res.stats, { pooled: res.pooled, elements: [...res.elements, ...res.pooled_elements], version: "test" });
    expect(validateGraph(built.graph, NODE_INDEX)).toEqual([]);
    expect(built.candidates).toEqual([]); // nothing here has zero violations at n ≥ 100
  });

  it("every emitted statistic satisfies validatePairStat", () => {
    const res = cooccurrenceReport(simpsonsFixture(), { pooled: true, minEligible: 1 });
    for (const s of [...res.stats, ...res.pooled]) expect(validatePairStat(s)).toEqual([]);
  });

  it("renders a report that names the pooled aggregate as pooled", () => {
    const res = cooccurrenceReport(simpsonsFixture(), { pooled: true, minEligible: DEFAULT_THRESHOLDS.reportMinN });
    const md = renderCooccurrenceReport(res);
    expect(md).toContain("content-site");
    expect(md).toContain("POOLED aggregate requested");
    expect(renderCooccurrenceReport(cooccurrenceReport(simpsonsFixture(), { minEligible: 10 }))).toContain("No pooled aggregate");
  });

  it("accepts rows that round-trip through DecisionRowSchema", () => {
    for (const r of smallFixture()) expect(() => DecisionRowSchema.parse(r)).not.toThrow();
  });

  it("nodeObservedCounts counts observed cells only", () => {
    const counts = nodeObservedCounts(smallFixture());
    expect(counts.get("payments_in_app")).toBe(10);
    expect(counts.get("user_accounts")).toBe(9);
  });
});

describe("parseCooccurrenceArgs", () => {
  it("requires a matrix and defaults the rest", () => {
    expect(() => parseCooccurrenceArgs([])).toThrow(UsageError);
    const a = parseCooccurrenceArgs(["--matrix", "m.jsonl"]);
    expect(a.matrix).toBe("m.jsonl");
    expect(a.out).toBe("mining-results");
    expect(a.pooled).toBe(false);
    expect(a.thresholds).toEqual(DEFAULT_THRESHOLDS);
  });

  it("reads the thresholds and the pooled opt-in", () => {
    const a = parseCooccurrenceArgs(["--matrix", "m.jsonl", "--out", "o", "--min-n", "5", "--soft-min-n", "20", "--hard-min-n", "50", "--pooled", "--max-pairs", "100"]);
    expect(a.thresholds.reportMinN).toBe(5);
    expect(a.thresholds.softMinN).toBe(20);
    expect(a.thresholds.hardMinN).toBe(50);
    expect(a.pooled).toBe(true);
    expect(a.maxPairs).toBe(100);
  });

  it("rejects incoherent thresholds and non-numbers", () => {
    expect(() => parseCooccurrenceArgs(["--matrix", "m", "--soft-min-n", "5"])).toThrow(/--soft-min-n/);
    expect(() => parseCooccurrenceArgs(["--matrix", "m", "--hard-min-n", "20"])).toThrow(/--hard-min-n/);
    expect(() => parseCooccurrenceArgs(["--matrix", "m", "--min-n", "0"])).toThrow(UsageError);
    expect(() => parseCooccurrenceArgs(["--matrix", "m", "--max-pairs", "x"])).toThrow(UsageError);
  });
});
