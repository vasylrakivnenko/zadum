/**
 * Evidence layer, part 6 — the **design graph**: what the decision matrix says about how choices go together.
 *
 * An *element* is one settled decision: `payments_in_app=collect_online`. An *edge* relates two elements.
 * There are exactly six relations, and the split between them is the file's reason to exist:
 *
 *   hard_implies    A logically FORCES B.            Authored in `catalogs/*.json` (`implies`/`requires`).
 *   hard_excludes   A and B cannot both hold.        Authored in `catalogs/*.json` (`excludes`).
 *   equivalent      both sides are the same decision. Authored (`same_as`).
 *   soft_positive   A and B are statistically associated.        LEARNED from the decision matrix.
 *   soft_negative   A and B are statistically anti-associated.   LEARNED from the decision matrix.
 *   unknown         not estimable: too little data, or too much of it unobserved.
 *
 * ═══ THE LINE THIS FILE DEFENDS ═══
 *
 * A hard edge is a claim about LOGIC; a soft edge is a claim about a POPULATION. They are produced by
 * different processes, they fail in different ways, and they must never be produced by the same code path:
 *
 *   - Hard edges are read from the catalog and are AUTHORITATIVE. The runtime enforces them by repair
 *     (`propagateHard`), a soft edge can never overturn one, and this builder never writes one.
 *   - Soft edges are estimates with a support count, a confidence interval, and a scope (archetype +
 *     source kind). They reweight a prior; they never delete a world and never settle a decision.
 *   - Statistics may PROPOSE a hard edge. `hardCandidates()` emits those into a separate file
 *     (`graph-candidates.json`), with `status: "candidate"`, and `buildDesignGraph` refuses to emit a hard
 *     relation no matter how strong the association is. Promotion requires a human editing the catalog.
 *     A 100%-in-140-repos association is still not a law: it is a fact about GitHub in 2026.
 *
 * Three specific failure modes are designed against, because each one has a name and each one is easy to ship:
 *
 *   1. **Zero is not impossibility.** n11 = 0 is only evidence of exclusion when the pair was *observable* in
 *      rows that could have shown it. Every count in `PairStat` is built from eligible rows only, and a
 *      `hard_excludes` candidate additionally requires `eligible_n >= hardMinN` — otherwise the verdict is
 *      `unknown`, not `hard_excludes`.
 *   2. **Simpson's paradox.** Statistics are computed per archetype and per source kind FIRST. A pooled
 *      aggregate is optional, is always labelled `archetype: null, source_kind: null`, and any pooled edge
 *      whose sign disagrees with a stratum is flagged `simpsons_warning`. See `detectSimpsons`.
 *      `npm run graph:report` prints the warning above the pooled numbers, never below them.
 *   3. **Verbalised confidence.** No number in this file ever came from a model saying how sure it was.
 *      Every probability is a smoothed count ratio; every interval is Wilson.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Elements
// ---------------------------------------------------------------------------

export interface Element {
  node_id: string;
  option_id: string;
  /** canonical serialization: "node=option". The graph's join key everywhere. */
  key: string;
}

export function elementKey(nodeId: string, optionId: string): string {
  return `${nodeId}=${optionId}`;
}

export function makeElement(nodeId: string, optionId: string): Element {
  return { node_id: nodeId, option_id: optionId, key: elementKey(nodeId, optionId) };
}

/** Inverse of `elementKey`. Returns null for anything that is not one — never guesses. */
export function parseElementKey(key: string): Element | null {
  const i = key.indexOf("=");
  if (i <= 0 || i === key.length - 1) return null;
  return { node_id: key.slice(0, i), option_id: key.slice(i + 1), key };
}

// ---------------------------------------------------------------------------
// Numeric machinery — shared so every edge in the system uses the SAME estimator
// ---------------------------------------------------------------------------

export interface Interval {
  low: number;
  high: number;
}

/**
 * Wilson score interval for a binomial proportion. Chosen over the normal approximation because the
 * interesting cells here are exactly the ones it breaks on: k = 0 or k = n with small n. Wilson never
 * produces an interval outside [0,1] and never collapses to a point at the boundary — which matters because
 * "0 out of 8" collapsing to [0,0] is precisely how a small sample becomes a fake impossibility.
 */
export function wilsonInterval(successes: number, n: number, z = 1.96): Interval {
  if (n <= 0) return { low: 0, high: 1 };
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { low: clamp01(centre - half), high: clamp01(centre + half) };
}

export const clamp01 = (x: number): number => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);

/**
 * Beta-prior smoothing: `(k + a) / (n + a + b)`. Documented rather than clever — the default
 * `a = b = 0.5` is Jeffreys, which is the least opinionated proper prior for a proportion and keeps a
 * zero-count cell from asserting p = 0. Configurable, because the right pseudo-count depends on how much a
 * caller is willing to let the prior speak for a thin stratum.
 */
export interface Smoothing {
  a: number;
  b: number;
}

export const JEFFREYS: Smoothing = { a: 0.5, b: 0.5 };

export function smoothedRate(successes: number, n: number, s: Smoothing = JEFFREYS): number {
  const denom = n + s.a + s.b;
  return denom > 0 ? (successes + s.a) / denom : 0;
}

// ---------------------------------------------------------------------------
// Pair statistics — the input `cooccurrence.ts` produces and this file turns into edges
// ---------------------------------------------------------------------------

/**
 * The 2×2 table for one ordered pair of elements, within ONE stratum.
 *
 * The four counts are defined over ELIGIBLE rows only — rows where BOTH nodes were observed with some option.
 * That is the load-bearing definition:
 *
 *   n11  A observed, B observed, both as the named options
 *   n10  A as named, B's node observed with a DIFFERENT option
 *   n01  B as named, A's node observed with a DIFFERENT option
 *   n00  both nodes observed, neither as the named option
 *
 * A row where either node is `unobserved` or `conflict` contributes to NOTHING. It is not an n00. This is
 * spec rule 2 ("never count an unobserved cell as a negative") expressed as an arithmetic invariant:
 * `n11 + n10 + n01 + n00 === eligible_n`, which `validatePairStat` checks.
 */
export const PairStatSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  /** null = pooled across archetypes (must be labelled as such everywhere it is shown) */
  archetype: z.string().nullable(),
  /** null = pooled across source kinds */
  source_kind: z.string().nullable(),
  n11: z.number().min(0),
  n10: z.number().min(0),
  n01: z.number().min(0),
  n00: z.number().min(0),
  eligible_n: z.number().min(0),
  /** rows in the stratum where A's node was observed at all, over rows in the stratum */
  coverage_from: z.number().min(0).max(1),
  coverage_to: z.number().min(0).max(1),
  joint_coverage: z.number().min(0).max(1),
  p_from: z.number().min(0).max(1),
  p_to: z.number().min(0).max(1),
  p_to_given_from: z.number().min(0).max(1),
  p_from_given_to: z.number().min(0).max(1),
  lift: z.number().min(0),
  /** p(B|A) − p(B): the absolute change in belief the edge would justify */
  difference: z.number(),
  ci95: z.object({ low: z.number().min(0).max(1), high: z.number().min(0).max(1) }),
  /** row ids that produced n11 — the audit trail from a probability back to the artifacts */
  support_row_ids: z.array(z.string()).default([]),
});
export type PairStat = z.infer<typeof PairStatSchema>;

/** Arithmetic invariants a pair statistic must satisfy. An empty result means the table is internally sound. */
export function validatePairStat(s: PairStat): string[] {
  const errors: string[] = [];
  const sum = s.n11 + s.n10 + s.n01 + s.n00;
  if (Math.abs(sum - s.eligible_n) > 1e-9) errors.push(`${s.from}→${s.to}: cells sum to ${sum} but eligible_n is ${s.eligible_n} (an unobserved row must not be counted anywhere)`);
  for (const [k, v] of Object.entries({ p_from: s.p_from, p_to: s.p_to, p_to_given_from: s.p_to_given_from, p_from_given_to: s.p_from_given_to, ci_low: s.ci95.low, ci_high: s.ci95.high })) {
    if (!Number.isFinite(v) || v < 0 || v > 1) errors.push(`${s.from}→${s.to}: ${k} is ${v}, not a probability`);
  }
  if (s.ci95.low > s.ci95.high) errors.push(`${s.from}→${s.to}: interval is inverted`);
  if (!Number.isFinite(s.lift) || s.lift < 0) errors.push(`${s.from}→${s.to}: lift is ${s.lift}`);
  if (s.support_row_ids.length > s.n11) errors.push(`${s.from}→${s.to}: ${s.support_row_ids.length} support rows for n11=${s.n11}`);
  return errors;
}

// ---------------------------------------------------------------------------
// Edges
// ---------------------------------------------------------------------------

export const RELATIONS = ["hard_implies", "hard_excludes", "equivalent", "soft_positive", "soft_negative", "unknown"] as const;
export type Relation = (typeof RELATIONS)[number];

export const HARD_RELATIONS: ReadonlySet<Relation> = new Set<Relation>(["hard_implies", "hard_excludes", "equivalent"]);
export const SOFT_RELATIONS: ReadonlySet<Relation> = new Set<Relation>(["soft_positive", "soft_negative"]);

export function isHard(r: Relation): boolean {
  return HARD_RELATIONS.has(r);
}

/**
 * `authored` — read from the catalog, authoritative, enforced by world repair.
 * `candidate` — proposed by statistics, inert until a human promotes it by editing the catalog.
 * `approved`  — a soft edge a human has reviewed and blessed for runtime use.
 * A hard relation may ONLY carry `authored`; `assertGraphSound` enforces that.
 */
export const EDGE_STATUSES = ["authored", "candidate", "approved"] as const;
export type EdgeStatus = (typeof EDGE_STATUSES)[number];

export const GraphEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  relation: z.enum(RELATIONS),
  status: z.enum(EDGE_STATUSES),
  /** scope. null means POOLED — always rendered with that word next to it. */
  archetype: z.string().nullable().default(null),
  source_kind: z.string().nullable().default(null),
  p_from: z.number().min(0).max(1).nullable().default(null),
  p_to: z.number().min(0).max(1).nullable().default(null),
  p_to_given_from: z.number().min(0).max(1).nullable().default(null),
  lift: z.number().min(0).nullable().default(null),
  difference: z.number().nullable().default(null),
  ci95: z.object({ low: z.number().min(0).max(1), high: z.number().min(0).max(1) }).nullable().default(null),
  eligible_n: z.number().min(0).default(0),
  support_row_ids: z.array(z.string()).default([]),
  /** set when a pooled edge disagrees in sign with one of its strata — read this BEFORE the numbers */
  simpsons_warning: z.string().nullable().default(null),
  /** why an edge is `unknown`, in words a report can print */
  note: z.string().nullable().default(null),
});
export type GraphEdge = z.infer<typeof GraphEdgeSchema>;

// ---------------------------------------------------------------------------
// Element prevalence / rarity, carried on the graph
// ---------------------------------------------------------------------------

export const ElementStatSchema = z.object({
  key: z.string().min(1),
  node_id: z.string().min(1),
  option_id: z.string().min(1),
  archetype: z.string().nullable().default(null),
  source_kind: z.string().nullable().default(null),
  eligible_documents: z.number().min(0),
  observed_documents: z.number().min(0),
  prevalence: z.number().min(0).max(1),
  /** binary entropy of the prevalence, in bits — how uncertain this element is across the population */
  entropy: z.number().min(0),
  idf: z.number(),
  /** share of rows where the node was NOT observable/observed — reported, never used as a negative */
  unobserved_rate: z.number().min(0).max(1),
  archetype_lift: z.number().nullable().default(null),
});
export type ElementStat = z.infer<typeof ElementStatSchema>;

// ---------------------------------------------------------------------------
// The graph document
// ---------------------------------------------------------------------------

export const DESIGN_GRAPH_SCHEMA = "zadum.design-graph.v1";

export const DesignGraphSchema = z.object({
  schema: z.literal(DESIGN_GRAPH_SCHEMA),
  version: z.string().min(1),
  catalog_version: z.string().default(""),
  matrix_version: z.string().default(""),
  lexicon_version: z.string().default(""),
  created_at: z.string().default(""),
  /** the models/prompts that produced the LABELS underneath these numbers — provenance, not decoration */
  provenance: z
    .object({
      label_models: z.array(z.string()).default([]),
      label_prompt_versions: z.array(z.string()).default([]),
      source_kinds: z.array(z.string()).default([]),
      archetypes: z.array(z.string()).default([]),
      rows: z.number().min(0).default(0),
    })
    .default({ label_models: [], label_prompt_versions: [], source_kinds: [], archetypes: [], rows: 0 }),
  thresholds: z
    .object({
      reportMinN: z.number().default(10),
      softMinN: z.number().default(30),
      hardMinN: z.number().default(100),
      hardMinLowerBound: z.number().default(0.995),
      smoothing: z.object({ a: z.number(), b: z.number() }).default(JEFFREYS),
    })
    .default({ reportMinN: 10, softMinN: 30, hardMinN: 100, hardMinLowerBound: 0.995, smoothing: JEFFREYS }),
  edges: z.array(GraphEdgeSchema).default([]),
  elements: z.array(ElementStatSchema).default([]),
});
export type DesignGraph = z.infer<typeof DesignGraphSchema>;

export interface GraphThresholds {
  /** a pair is worth REPORTING at all */
  reportMinN: number;
  /**
   * A pair may become a soft edge. Applied to BOTH `eligible_n` and to `n11 + n10` — the rows where the
   * antecedent actually holds, which is the denominator `p(B|A)` is computed from. Checking only the former
   * once let a lift of 4.70 through on a single observation; see `classifyPair`.
   */
  softMinN: number;
  /** a pair may be PROPOSED as a hard edge (never auto-promoted) */
  hardMinN: number;
  /** lower confidence bound a hard-edge proposal must clear */
  hardMinLowerBound: number;
  smoothing: Smoothing;
}

export const DEFAULT_THRESHOLDS: GraphThresholds = {
  reportMinN: 10,
  softMinN: 30,
  hardMinN: 100,
  hardMinLowerBound: 0.995,
  smoothing: JEFFREYS,
};

// ---------------------------------------------------------------------------
// Classification: pair statistic → relation
// ---------------------------------------------------------------------------

export interface Classification {
  relation: Relation;
  note: string | null;
}

/**
 * The ONLY place a statistic becomes a relation, and it can return exactly three of the six:
 * `soft_positive`, `soft_negative`, `unknown`. There is no code path from a number to `hard_implies`,
 * `hard_excludes` or `equivalent` — that is spec rule 11 ("do not automatically promote learned edges into
 * hard catalog rules") implemented as a type-level impossibility rather than a policy.
 *
 * A pair is soft only when BOTH hold:
 *   - `eligible_n >= softMinN` (enough rows that could have shown the pair), and
 *   - the 95% interval for p(B|A) EXCLUDES the baseline p(B) — i.e. the association survives its own
 *     uncertainty. An interval that straddles the baseline is `unknown`, however large the point estimate.
 */
export function classifyPair(s: PairStat, t: GraphThresholds = DEFAULT_THRESHOLDS): Classification {
  // THE DENOMINATOR THAT MATTERS is n11 + n10 — the rows where the ANTECEDENT holds — because that is the
  // sample `p(B|A) = smoothed(n11, n11 + n10)` is computed from. `eligible_n` counts rows where both nodes
  // were observed at all, which is a much larger and much weaker number.
  //
  // Guarding the wrong one shipped a real edge on the first 150-row corpus:
  //
  //   identity_provider=magic_link → invite_flow=invite_by_admin
  //   lift 4.70 · p(B|A) 0.750 · eligible_n 46  ...  n11 = 1, n10 = 0
  //
  // One row. It cleared `softMinN = 30` on `eligible_n = 46`, and its Wilson interval [0.207, 1.000] — the
  // honest signal, an interval spanning 79 points — still excluded the baseline 0.160, so it passed the
  // distinguishability test too. An association asserted from a single observation, wearing a confident lift.
  // That is precisely the failure this layer exists to prevent, so the floor now applies to the antecedent
  // count and `eligible_n` is kept only as the weaker outer gate it always was.
  const antecedent_n = s.n11 + s.n10;
  if (s.eligible_n < t.reportMinN) return { relation: "unknown", note: `insufficient evidence: ${s.eligible_n} eligible rows (< ${t.reportMinN})` };
  if (antecedent_n < t.reportMinN) return { relation: "unknown", note: `insufficient evidence: the antecedent holds in only ${antecedent_n} row(s) (< ${t.reportMinN})` };
  if (s.eligible_n < t.softMinN) return { relation: "unknown", note: `low support: ${s.eligible_n} eligible rows (< ${t.softMinN} needed for a soft edge)` };
  if (antecedent_n < t.softMinN) return { relation: "unknown", note: `low support: p(B|A) rests on ${antecedent_n} row(s) where the antecedent holds (< ${t.softMinN}); eligible_n ${s.eligible_n} is the wrong denominator for this estimate` };
  const excludesBaseline = s.ci95.low > s.p_to || s.ci95.high < s.p_to;
  if (!excludesBaseline) return { relation: "unknown", note: `not distinguishable from the baseline: p(B|A) interval [${round3(s.ci95.low)}, ${round3(s.ci95.high)}] contains p(B)=${round3(s.p_to)}` };
  if (s.difference > 0) return { relation: "soft_positive", note: null };
  if (s.difference < 0) return { relation: "soft_negative", note: null };
  return { relation: "unknown", note: "interval excludes the baseline but the point difference is zero" };
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;

/**
 * Pairs a human might want to consider promoting to a hard catalog rule. Emitted to a SEPARATE file, with
 * `status: "candidate"` and `relation` left as the soft relation the statistics actually support — the
 * candidate says "look at this", never "this is a law".
 *
 * Requirements (all three, per spec): `eligible_n >= hardMinN`, ZERO observed violations, and a lower
 * confidence bound at or above `hardMinLowerBound`. The zero-violations test is on the raw counts, not on a
 * smoothed rate: a single counterexample kills the proposal, which is the correct behaviour for a claim of
 * logical necessity.
 *
 * Worth knowing before tuning these: at the default bound of 0.995 the INTERVAL is the binding constraint,
 * not `hardMinN`. For a spotless record (p = 1) the Wilson lower bound is `n / (n + z²)`, so clearing 0.995
 * requires n >= 765 whatever `hardMinN` says. That is intentional — 150 consecutive confirmations is a strong
 * association, not a law — but it means lowering `hardMinN` alone changes nothing.
 */
export interface HardCandidate {
  from: string;
  to: string;
  proposed: "hard_implies" | "hard_excludes";
  eligible_n: number;
  violations: number;
  ci95: Interval;
  archetype: string | null;
  source_kind: string | null;
  why: string;
}

export function hardCandidates(stats: PairStat[], t: GraphThresholds = DEFAULT_THRESHOLDS): HardCandidate[] {
  const out: HardCandidate[] = [];
  for (const s of stats) {
    if (s.eligible_n < t.hardMinN) continue;
    // implication candidate: A always came with B
    if (s.n10 === 0 && s.n11 > 0) {
      const ci = wilsonInterval(s.n11, s.n11 + s.n10);
      if (ci.low >= t.hardMinLowerBound) {
        out.push({
          from: s.from,
          to: s.to,
          proposed: "hard_implies",
          eligible_n: s.eligible_n,
          violations: 0,
          ci95: ci,
          archetype: s.archetype,
          source_kind: s.source_kind,
          why: `${s.n11}/${s.n11 + s.n10} observable rows with ${s.from} also had ${s.to}, none contradicted it; lower bound ${round3(ci.low)}`,
        });
      }
    }
    // exclusion candidate: A and B never co-occurred, in a sample large enough that they could have
    if (s.n11 === 0 && s.n10 > 0 && s.n01 > 0) {
      const ci = wilsonInterval(s.n10, s.n11 + s.n10);
      if (ci.low >= t.hardMinLowerBound) {
        out.push({
          from: s.from,
          to: s.to,
          proposed: "hard_excludes",
          eligible_n: s.eligible_n,
          violations: 0,
          ci95: ci,
          archetype: s.archetype,
          source_kind: s.source_kind,
          why: `${s.from} and ${s.to} never co-occurred in ${s.eligible_n} rows where both were observed (${s.n10} with A only, ${s.n01} with B only)`,
        });
      }
    }
  }
  return out.sort((a, b) => b.eligible_n - a.eligible_n || a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
}

// ---------------------------------------------------------------------------
// Simpson's paradox
// ---------------------------------------------------------------------------

export interface SimpsonsFinding {
  from: string;
  to: string;
  pooled_difference: number;
  strata: { archetype: string | null; source_kind: string | null; difference: number; eligible_n: number }[];
  why: string;
}

/**
 * A pooled pair whose sign disagrees with one or more of its own strata. This is not a corner case: it is the
 * expected outcome whenever archetype composition differs, which it always does in a stratified corpus.
 * Finding one does NOT invalidate the strata — it invalidates the pooled number, which is why the pooled
 * edge carries the warning and the strata carry none.
 */
export function detectSimpsons(pooled: PairStat[], strata: PairStat[], minN = 10): SimpsonsFinding[] {
  const byPair = new Map<string, PairStat[]>();
  for (const s of strata) {
    if (s.eligible_n < minN) continue;
    const k = `${s.from} ${s.to}`;
    (byPair.get(k) ?? byPair.set(k, []).get(k)!).push(s);
  }
  const out: SimpsonsFinding[] = [];
  for (const p of pooled) {
    if (p.eligible_n < minN) continue;
    const group = byPair.get(`${p.from} ${p.to}`) ?? [];
    if (group.length < 2) continue;
    const sign = (x: number) => (x > 0 ? 1 : x < 0 ? -1 : 0);
    const disagreeing = group.filter((g) => sign(g.difference) !== 0 && sign(g.difference) !== sign(p.difference));
    if (!disagreeing.length) continue;
    out.push({
      from: p.from,
      to: p.to,
      pooled_difference: p.difference,
      strata: group.map((g) => ({ archetype: g.archetype, source_kind: g.source_kind, difference: g.difference, eligible_n: g.eligible_n })),
      why: `pooled difference ${round3(p.difference)} disagrees in sign with ${disagreeing.length} of ${group.length} strata — the pooled number is a composition artifact, read the strata`,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Hard edges from the catalog (authored, authoritative)
// ---------------------------------------------------------------------------

/** The minimal node shape this file needs — structurally satisfied by `NodeDef`, without importing it. */
export interface HardEdgeSource {
  id: string;
  options: { id: string }[];
  implies: Record<string, { node: string; option: string }[]>;
  excludes?: Record<string, { node: string; option: string }[]>;
}

/**
 * Read the AUTHORED hard edges out of the catalog. These are copied into the graph so a report can show logic
 * and statistics side by side, and so a soft edge that merely restates a hard one can be recognised and
 * dropped — but the graph is not where they are enforced. Enforcement stays in `propagateHard`, on the
 * catalog, in the runtime. Two representations of one truth is a bug waiting to happen; this one is
 * explicitly the read-only copy.
 */
export function hardEdgesFromCatalog(nodes: HardEdgeSource[]): GraphEdge[] {
  const out: GraphEdge[] = [];
  const base = {
    status: "authored" as const,
    archetype: null,
    source_kind: null,
    p_from: null,
    p_to: null,
    p_to_given_from: null,
    lift: null,
    difference: null,
    ci95: null,
    eligible_n: 0,
    support_row_ids: [],
    simpsons_warning: null,
  };
  for (const n of [...nodes].sort((a, b) => a.id.localeCompare(b.id))) {
    for (const o of n.options) {
      for (const e of n.implies[o.id] ?? []) {
        out.push({ ...base, from: elementKey(n.id, o.id), to: elementKey(e.node, e.option), relation: "hard_implies", note: "authored in the catalog" });
      }
      for (const e of n.excludes?.[o.id] ?? []) {
        out.push({ ...base, from: elementKey(n.id, o.id), to: elementKey(e.node, e.option), relation: "hard_excludes", note: "authored in the catalog" });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Building the graph
// ---------------------------------------------------------------------------

export interface BuildGraphOptions {
  thresholds?: GraphThresholds;
  version?: string;
  catalog_version?: string;
  matrix_version?: string;
  lexicon_version?: string;
  now?: () => string;
  /** authored hard edges to carry alongside the learned ones */
  hardEdges?: GraphEdge[];
  elements?: ElementStat[];
  provenance?: DesignGraph["provenance"];
  /** pooled statistics, if the caller computed any — they are labelled and Simpson-checked */
  pooled?: PairStat[];
}

export interface BuiltGraph {
  graph: DesignGraph;
  candidates: HardCandidate[];
  simpsons: SimpsonsFinding[];
}

/**
 * Stratified pair statistics → a design graph. Every learned edge comes out `status: "candidate"` and with a
 * soft or `unknown` relation; hard proposals are returned SEPARATELY and are never edges.
 */
export function buildDesignGraph(strata: PairStat[], opts: BuildGraphOptions = {}): BuiltGraph {
  const t = opts.thresholds ?? DEFAULT_THRESHOLDS;
  const now = opts.now ?? (() => new Date().toISOString());
  const pooled = opts.pooled ?? [];
  const simpsons = detectSimpsons(pooled, strata, t.reportMinN);
  const warnFor = new Map(simpsons.map((s) => [`${s.from} ${s.to}`, s.why]));

  const learned: GraphEdge[] = [];
  for (const s of [...strata, ...pooled]) {
    if (s.eligible_n < t.reportMinN) continue; // not worth reporting at all
    const { relation, note } = classifyPair(s, t);
    const isPooled = s.archetype === null && s.source_kind === null;
    learned.push({
      from: s.from,
      to: s.to,
      relation,
      status: "candidate",
      archetype: s.archetype,
      source_kind: s.source_kind,
      p_from: s.p_from,
      p_to: s.p_to,
      p_to_given_from: s.p_to_given_from,
      lift: s.lift,
      difference: s.difference,
      ci95: s.ci95,
      eligible_n: s.eligible_n,
      support_row_ids: s.support_row_ids,
      simpsons_warning: isPooled ? (warnFor.get(`${s.from} ${s.to}`) ?? null) : null,
      note,
    });
  }

  const edges = [...(opts.hardEdges ?? []), ...learned].sort(
    (a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || String(a.archetype).localeCompare(String(b.archetype)) || String(a.source_kind).localeCompare(String(b.source_kind)),
  );

  return {
    graph: DesignGraphSchema.parse({
      schema: DESIGN_GRAPH_SCHEMA,
      version: opts.version ?? now().slice(0, 10),
      catalog_version: opts.catalog_version ?? "",
      matrix_version: opts.matrix_version ?? "",
      lexicon_version: opts.lexicon_version ?? "",
      created_at: now(),
      provenance: opts.provenance ?? { label_models: [], label_prompt_versions: [], source_kinds: [], archetypes: [], rows: 0 },
      thresholds: t,
      edges,
      elements: opts.elements ?? [],
    }),
    candidates: hardCandidates(strata, t),
    simpsons,
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface GraphIssue {
  where: string;
  problem: string;
}

/**
 * Structural checks. The first two are the ones that matter: every probability must be a NUMBER in [0,1]
 * (spec rule 5), and no hard relation may carry a status other than `authored` (spec rule 11). The rest catch
 * malformed element keys and edges pointing at options the catalog does not have.
 */
export function validateGraph(graph: DesignGraph, nodeIndex?: Map<string, Set<string>>): GraphIssue[] {
  const issues: GraphIssue[] = [];
  const checkKey = (key: string, where: string) => {
    const el = parseElementKey(key);
    if (!el) {
      issues.push({ where, problem: `"${key}" is not a node=option element key` });
      return;
    }
    if (!nodeIndex) return;
    const options = nodeIndex.get(el.node_id);
    if (!options) issues.push({ where, problem: `unknown catalog node "${el.node_id}"` });
    else if (!options.has(el.option_id)) issues.push({ where, problem: `"${el.option_id}" is not an option of "${el.node_id}"` });
  };
  for (const [i, e] of graph.edges.entries()) {
    const where = `edge ${i} (${e.from} → ${e.to})`;
    checkKey(e.from, where);
    checkKey(e.to, where);
    if (isHard(e.relation) && e.status !== "authored") {
      issues.push({ where, problem: `hard relation "${e.relation}" with status "${e.status}" — hard edges may only be authored in the catalog, never learned` });
    }
    if (!isHard(e.relation) && e.status === "authored") issues.push({ where, problem: `soft relation "${e.relation}" marked authored` });
    for (const [k, v] of Object.entries({ p_from: e.p_from, p_to: e.p_to, p_to_given_from: e.p_to_given_from })) {
      if (v === null) continue;
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1) issues.push({ where, problem: `${k} = ${v} is not a probability` });
    }
    if (e.ci95 && (e.ci95.low > e.ci95.high || !Number.isFinite(e.ci95.low) || !Number.isFinite(e.ci95.high))) issues.push({ where, problem: "confidence interval is inverted or non-numeric" });
    if (e.lift !== null && (!Number.isFinite(e.lift) || e.lift < 0)) issues.push({ where, problem: `lift = ${e.lift}` });
    if (e.from === e.to) issues.push({ where, problem: "self edge" });
  }
  for (const [i, el] of graph.elements.entries()) {
    const where = `element ${i} (${el.key})`;
    checkKey(el.key, where);
    if (el.observed_documents > el.eligible_documents) issues.push({ where, problem: `observed ${el.observed_documents} > eligible ${el.eligible_documents}` });
    if (!Number.isFinite(el.idf)) issues.push({ where, problem: "idf is not a number" });
  }
  return issues;
}

export function assertGraphSound(graph: DesignGraph, nodeIndex?: Map<string, Set<string>>): void {
  const issues = validateGraph(graph, nodeIndex);
  if (issues.length) throw new Error(`design graph invalid (${issues.length} problem${issues.length === 1 ? "" : "s"}):\n${issues.map((i) => `  - ${i.where}: ${i.problem}`).join("\n")}`);
}

// ---------------------------------------------------------------------------
// Accessors used by the runtime and the reports
// ---------------------------------------------------------------------------

/**
 * The soft edges that apply to a session, most specific scope first.
 *
 * Precedence is by SCOPE, and only then by support — deliberately, and this is the part that is easy to get
 * backwards. A narrow edge measured on 12 comparable rows beats a broad one measured on 400 unlike ones,
 * because those 400 include archetypes and source kinds whose behaviour we have no reason to think transfers.
 * Support breaks ties only WITHIN a scope tier:
 *
 *   tier 0  this archetype AND this source kind   — the closest population we have
 *   tier 1  this archetype, any source kind
 *   tier 2  pooled (archetype null)               — used only when nothing more specific exists
 *
 * Two hard filters apply before ranking:
 *   - an edge scoped to a source kind other than the caller's is DROPPED, not down-ranked. A `session`-scoped
 *     edge is a statement about what real owners answered; a `repo` query must not silently receive it, and
 *     the reverse matters more — repo statistics must never reach a caller asking what owners chose.
 *     `sourceKind: undefined` means "no preference" and filters nothing.
 *   - a pooled edge carrying a Simpson's warning is dropped entirely: a known-confounded number is worse than
 *     no number, because it will be believed.
 */
export function softEdgesFor(graph: DesignGraph, opts: { archetypes?: string[]; sourceKind?: string | null; includeCandidates?: boolean } = {}): GraphEdge[] {
  const archetypes = new Set(opts.archetypes ?? []);
  const wantStatus = (s: EdgeStatus) => s === "approved" || (opts.includeCandidates !== false && s === "candidate");
  const sourceKindOk = (e: GraphEdge) => opts.sourceKind === undefined || e.source_kind === null || e.source_kind === opts.sourceKind;
  const applicable = graph.edges.filter(
    (e) =>
      SOFT_RELATIONS.has(e.relation) &&
      wantStatus(e.status) &&
      (e.archetype === null || archetypes.has(e.archetype)) &&
      sourceKindOk(e) &&
      !(e.archetype === null && e.simpsons_warning),
  );
  const rank = (e: GraphEdge) => (e.archetype === null ? 2 : e.source_kind === null ? 1 : 0);
  const best = new Map<string, GraphEdge>();
  for (const e of applicable) {
    const k = `${e.from}\u0000${e.to}`;
    const cur = best.get(k);
    if (!cur || rank(e) < rank(cur) || (rank(e) === rank(cur) && e.eligible_n > cur.eligible_n)) best.set(k, e);
  }
  return [...best.values()].sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
}

export function elementStat(graph: DesignGraph, key: string, archetype?: string): ElementStat | null {
  return (
    graph.elements.find((e) => e.key === key && archetype !== undefined && e.archetype === archetype) ??
    graph.elements.find((e) => e.key === key && e.archetype === null) ??
    null
  );
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

/**
 * The report's job is to make six states impossible to confuse — the Definition-of-Done list:
 * observed · not observed but estimable · unobserved · conflicting · logically impossible ·
 * statistically associated · insufficient evidence. Each gets its own section and its own words.
 */
export function renderGraphReport(built: BuiltGraph): string {
  const { graph, candidates, simpsons } = built;
  const L: string[] = [];
  const n = (x: number | null) => (x === null ? "  n/a" : x.toFixed(3));
  const scope = (e: GraphEdge) => `${e.archetype ?? "POOLED"}/${e.source_kind ?? "POOLED"}`;

  L.push(`# design graph ${graph.version}`);
  L.push("");
  L.push(`catalog ${graph.catalog_version || "?"} · matrix ${graph.matrix_version || "?"} · built ${graph.created_at}`);
  L.push(`labels from: ${graph.provenance.label_models.join(", ") || "?"} (prompt ${graph.provenance.label_prompt_versions.join(", ") || "?"}) over ${graph.provenance.rows} rows`);
  L.push(`thresholds: report n≥${graph.thresholds.reportMinN} · soft n≥${graph.thresholds.softMinN} · hard-proposal n≥${graph.thresholds.hardMinN}, lower bound ≥${graph.thresholds.hardMinLowerBound}`);
  L.push("");

  if (simpsons.length) {
    L.push(`## ⚠ pooled statistics are confounded (${simpsons.length})`);
    L.push("");
    L.push("Read the per-archetype rows below; the pooled numbers for these pairs are composition artifacts.");
    for (const s of simpsons) {
      L.push(`  ${s.from} → ${s.to}: ${s.why}`);
      for (const st of s.strata) L.push(`      ${st.archetype ?? "POOLED"}/${st.source_kind ?? "POOLED"}: difference ${n(st.difference)} over ${st.eligible_n} rows`);
    }
    L.push("");
  }

  const hard = graph.edges.filter((e) => isHard(e.relation));
  L.push(`## logical rules (authored in the catalog, enforced by world repair): ${hard.length}`);
  for (const e of hard.slice(0, 40)) L.push(`  ${e.relation.padEnd(14)} ${e.from} → ${e.to}`);
  if (hard.length > 40) L.push(`  … ${hard.length - 40} more`);
  L.push("");

  const soft = graph.edges.filter((e) => SOFT_RELATIONS.has(e.relation));
  L.push(`## statistically associated (learned, never enforced): ${soft.length}`);
  L.push("");
  L.push(`  ${"scope".padEnd(26)} ${"pair".padEnd(58)} ${"p(B|A)"}  ${"p(B)"}   ${"lift"}   ${"n"}   95% interval`);
  for (const e of soft.sort((a, b) => Math.abs(b.difference ?? 0) - Math.abs(a.difference ?? 0)).slice(0, 50)) {
    L.push(
      `  ${scope(e).padEnd(26)} ${`${e.from} → ${e.to}`.slice(0, 58).padEnd(58)} ${n(e.p_to_given_from)}  ${n(e.p_to)}  ${e.lift === null ? " n/a" : e.lift.toFixed(2)}  ${String(e.eligible_n).padStart(4)}  [${n(e.ci95?.low ?? null)}, ${n(e.ci95?.high ?? null)}]`,
    );
  }
  if (soft.length > 50) L.push(`  … ${soft.length - 50} more`);
  L.push("");

  const lowSupport = graph.edges.filter((e) => e.relation === "unknown" && (e.note ?? "").startsWith("low support"));
  const insufficient = graph.edges.filter((e) => e.relation === "unknown" && (e.note ?? "").startsWith("insufficient"));
  const indistinct = graph.edges.filter((e) => e.relation === "unknown" && (e.note ?? "").startsWith("not distinguishable"));
  L.push(`## not estimable`);
  L.push(`  insufficient evidence (below the reporting floor): ${insufficient.length}`);
  L.push(`  low support (reportable, but below the soft-edge floor): ${lowSupport.length}`);
  L.push(`  observed but not distinguishable from the baseline: ${indistinct.length}`);
  L.push("");

  L.push(`## statistically suggested HARD rules — proposals only, never enabled: ${candidates.length}`);
  if (!candidates.length) L.push("  (none clear the bar)");
  for (const c of candidates.slice(0, 25)) {
    L.push(`  ${c.proposed.padEnd(14)} ${c.from} → ${c.to}   [${c.archetype ?? "POOLED"}/${c.source_kind ?? "POOLED"}]`);
    L.push(`      ${c.why}`);
  }
  L.push("");
  L.push("  To adopt one, a human edits catalogs/*.json (implies / excludes / same_as). Nothing here does it.");
  return L.join("\n");
}

// ---------------------------------------------------------------------------
// IO
// ---------------------------------------------------------------------------

/**
 * `node:fs` is imported LAZILY, inside the two functions that need it, rather than at module top level.
 *
 * The reason is a real constraint rather than style: `src/core/evidence_graph.ts` imports this module for the
 * graph TYPES and the pure accessors, and CLAUDE.md requires `src/core/**` to be pure — no IO. A top-level
 * `import { promises as fs } from "node:fs"` here would drag `node:fs` into core's import graph even though
 * nothing in core ever calls it. Deferring the import keeps the type/pure-function half of this file free of
 * IO entirely, which is what lets core depend on it at all.
 */
export async function loadDesignGraph(file: string): Promise<DesignGraph> {
  const { promises: fs } = await import("node:fs");
  return DesignGraphSchema.parse(JSON.parse(await fs.readFile(file, "utf8")));
}

export async function saveDesignGraph(file: string, graph: DesignGraph): Promise<void> {
  const { promises: fs } = await import("node:fs");
  await fs.writeFile(file, `${JSON.stringify(graph, null, 2)}\n`);
}
