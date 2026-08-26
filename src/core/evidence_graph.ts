/**
 * Evidence layer, part 7 — the design graph as a **likelihood over sampled worlds**.
 *
 * `src/learning/design_graph.ts` decides what the decision matrix is allowed to *claim*. This file decides
 * what a claim is allowed to *do* to the belief, and the answer is deliberately small: a soft edge nudges the
 * weight of worlds that already exist. It never creates a world, never deletes one, never settles a decision
 * and never enforces anything.
 *
 * ═══ THE FOUR LINES THIS FILE DEFENDS ═══
 *
 * 1. **A soft edge is evidence about the population, not a rule.** Hard catalog rules are enforced where they
 *    have always been enforced — `resolveAssignment` / `propagateHard`, at sampling time, by construction.
 *    A `hard_implies` / `hard_excludes` / `equivalent` edge handed to `graphLikelihood` contributes exactly
 *    nothing (factor 1). Two enforcement paths for one truth is how the two get to disagree.
 *
 * 2. **Silence is not a negative.** For a `soft_positive` edge A→B, a world that does not hold A is
 *    UNAFFECTED — `graphLikelihood` returns exactly `1`, not "approximately 1". The edge says something about
 *    worlds with A and nothing whatsoever about the rest. Likewise a world where B's decision does not arise
 *    at all (`resolveAssignment` can legitimately leave a node unassigned) is unaffected rather than counted
 *    as a violation: that is `design_graph.ts`'s "never count an unobserved cell as a negative", carried
 *    through to the runtime.
 *
 * 3. **The evidence is applied ONCE.** Reweighting the same worlds with the same graph after every answer
 *    multiplies one observation in repeatedly until the belief is a monument to a 40-row correlation. Every
 *    world this file touches is stamped with the graph version that touched it (`graph_weighted`), and a
 *    stamped world is never touched again — `applyGraphWeights` called twice returns its input unchanged.
 *    The stamp lives on the world object rather than in a caller-held `Set` because worlds are persisted as
 *    JSON in the session and come back as fresh objects: a `Set` or `WeakSet` forgets exactly across the
 *    save/load boundary where a resample would re-apply the same edges.
 *
 * 4. **The user always wins.** The whole graph can move a single world's weight by at most `maxTotalOdds`
 *    (default 4), so the widest odds it can open between two worlds is 4² = 16. A user answer multiplies
 *    every disagreeing world by ε (0.05 shipped) — an odds shift of 20. 16 < 20, so an answer strictly
 *    dominates the graph as arithmetic rather than as a hope. Raising `maxTotalOdds` above 1/√ε silently
 *    breaks that; `graphNeverOutvotesAnswer()` is the check, and a test asserts it at the shipped defaults.
 *
 * Off by default everywhere: `applyGraphWeights(worlds, undefined)` returns the very array it was given.
 */
import { normalizeWeights, type World } from "./worlds.js";
import { SOFT_RELATIONS, parseElementKey, softEdgesFor, type DesignGraph, type GraphEdge } from "../learning/design_graph.js";

// ---------------------------------------------------------------------------
// Constants — each one is an argument, not a magic number
// ---------------------------------------------------------------------------

/**
 * Widest multiplier ONE edge may contribute, as an odds band [1/3, 3].
 *
 * Without it, a thin stratum writes the belief: `p(B|A) = 1, p(B) = 0.001` is a perfectly ordinary output of
 * a 40-row corpus and its raw likelihood ratio is 1000×, which would pin every world holding A onto B and
 * make the decision underivable-by-asking rather than merely likely. 3 is chosen because it is roughly the
 * strength of a single confidently-answered card in this system's own units and because it composes: a world
 * needs several independent edges pointing the same way before the graph moves it far, which is the shape of
 * evidence we actually believe in.
 */
export const DEFAULT_MAX_ODDS = 3;

/**
 * Widest multiplier the WHOLE graph may contribute to one world, as an odds band [1/4, 4].
 *
 * Two jobs. (a) The edges are treated naive-Bayes — multiplied as if independent — and they are emphatically
 * not: three edges out of `payments_in_app=collect_online` are three views of one fact, and multiplying them
 * counts that fact three times. The total band is the honest bound on how wrong that approximation is allowed
 * to make us. (b) It is what makes rule 5 ("the user answer dominates the graph") true: see
 * `graphNeverOutvotesAnswer`.
 */
export const DEFAULT_MAX_TOTAL_ODDS = 4;

/**
 * Shrinkage half-weight: an edge's influence is scaled by `n / (n + n0)`, so a 30-row edge moves belief half
 * as far as an infinitely-supported one and a 300-row edge moves it 91% as far. `30` matches
 * `DEFAULT_THRESHOLDS.softMinN` — the count at which `design_graph.ts` is first willing to call a pair a soft
 * edge at all — so "just barely admissible" and "moves belief half as much as a solid edge" are the same
 * number rather than two independently-tuned ones.
 */
export const DEFAULT_SUPPORT_N0 = 30;

/** Strictly positive floor on a world's pre-normalization weight. A soft edge may shrink a world; it may never delete one. */
export const MIN_WORLD_WEIGHT = 1e-9;

/** Probabilities are clamped off 0 and 1 before dividing — a smoothed estimate of exactly 0 is still a finite likelihood ratio, not an infinity. */
const PROB_EPS = 1e-6;

/**
 * Does the graph provably lose to a user answer at this configuration? The widest odds the graph can open
 * between two worlds is `maxTotalOdds²`; an answer shifts a disagreeing world's odds by `1/epsilon`. True iff
 * the answer wins from any starting point.
 */
export function graphNeverOutvotesAnswer(maxTotalOdds: number, epsilon: number): boolean {
  return epsilon > 0 && maxTotalOdds * maxTotalOdds < 1 / epsilon;
}

// ---------------------------------------------------------------------------
// The already-weighted marker (double-counting guard)
// ---------------------------------------------------------------------------

/**
 * A `World` that has had graph evidence applied to it, stamped with the graph version that applied it.
 * Structural, not a change to `World`: `worlds.ts` owns that type and nothing outside this file needs to know
 * the field exists. It survives JSON persistence and every `{...w, weight}` spread in the codebase
 * (`normalizeWeights`, `conditionSoft`, `reweightOnVerify`), which is the whole point — a world that comes
 * back from the store still remembers it has been weighted.
 */
export interface GraphWeightedWorld extends World {
  graph_weighted?: string;
}

/** The graph version that weighted this world, or null if none has. */
export function graphWeightedVersion(w: World): string | null {
  const v = (w as GraphWeightedWorld).graph_weighted;
  return typeof v === "string" && v.length > 0 ? v : null;
}

export function isGraphWeighted(w: World): boolean {
  return graphWeightedVersion(w) !== null;
}

function stamped(w: World, version: string): World {
  return { ...w, graph_weighted: version } as GraphWeightedWorld;
}

// ---------------------------------------------------------------------------
// The likelihood
// ---------------------------------------------------------------------------

export interface GraphLikelihoodOptions {
  /** widest odds ONE edge may contribute (default `DEFAULT_MAX_ODDS`) */
  maxOdds?: number;
  /** widest odds the WHOLE edge set may contribute to one world (default `DEFAULT_MAX_TOTAL_ODDS`) */
  maxTotalOdds?: number;
  /** shrinkage half-weight for edge support (default `DEFAULT_SUPPORT_N0`; 0 disables shrinkage) */
  supportN0?: number;
}

const clampProb = (p: number): number => Math.min(1 - PROB_EPS, Math.max(PROB_EPS, p));

/**
 * The log-multiplier one soft edge contributes to one world. Returns 0 (factor 1, exact) whenever the edge
 * has nothing to say about this world.
 *
 * The ratio is the edge's own estimate, not a constant:
 *
 *     satisfied (world holds A and B)      p(B|A) / p(B)
 *     violated  (world holds A, not B)     (1 − p(B|A)) / (1 − p(B))
 *
 * i.e. exactly the Bayes factor that turns a prior carrying the marginal p(B) into one carrying the
 * conditional p(B|A). `soft_negative` needs no separate branch and gets none: a negative edge simply has
 * p(B|A) < p(B), so the first ratio is < 1 and the second > 1 and the mirroring is automatic. The relation
 * label and the probabilities are the same estimate — `classifyPair` sets the label from
 * `difference = p(B|A) − p(B)` — so using the numbers for direction cannot disagree with the label.
 */
function edgeLogFactor(assignment: Record<string, string>, e: GraphEdge, logBand: number, n0: number): number {
  // Rule 9: the graph never enforces. A hard or `unknown` edge is not evidence here, whatever its numbers say.
  if (!SOFT_RELATIONS.has(e.relation)) return 0;
  const from = parseElementKey(e.from);
  const to = parseElementKey(e.to);
  if (!from || !to) return 0;
  // The antecedent is absent: the edge says NOTHING about this world (not "the opposite of what it says").
  if (assignment[from.node_id] !== from.option_id) return 0;
  const held = assignment[to.node_id];
  // The consequent's decision does not arise in this world at all (`resolveAssignment` leaves such nodes
  // unassigned). Unobserved is not a negative — the same rule the pair statistics were built under.
  if (held === undefined) return 0;
  if (e.p_to === null || e.p_to_given_from === null) return 0; // an edge without numbers is not evidence
  const base = clampProb(e.p_to);
  const cond = clampProb(e.p_to_given_from);
  const ratio = held === to.option_id ? cond / base : (1 - cond) / (1 - base);
  if (!Number.isFinite(ratio) || ratio <= 0) return 0;
  const bounded = Math.min(logBand, Math.max(-logBand, Math.log(ratio)));
  // Support shrinkage in log space, so the clamp band still holds afterwards (|bounded·s| ≤ |bounded| for s ≤ 1).
  const n = Math.max(0, e.eligible_n);
  const shrink = n0 <= 0 ? 1 : n / (n + n0);
  return bounded * shrink;
}

/**
 * The multiplier a world's assignment earns from a set of soft edges. Exactly `1` when no edge applies —
 * callers and tests rely on that being identity, not a float near it.
 */
export function graphLikelihood(assignment: Record<string, string>, edges: readonly GraphEdge[], opts: GraphLikelihoodOptions = {}): number {
  const maxOdds = Math.max(1, opts.maxOdds ?? DEFAULT_MAX_ODDS);
  const maxTotalOdds = Math.max(1, opts.maxTotalOdds ?? DEFAULT_MAX_TOTAL_ODDS);
  const n0 = Math.max(0, opts.supportN0 ?? DEFAULT_SUPPORT_N0);
  const logBand = Math.log(maxOdds);
  // Accumulated in log space: 200 hostile edges at 1/3 each would underflow a running product to a literal
  // zero, and a zeroed world is a deleted world (rule 8).
  let logTotal = 0;
  for (const e of edges) logTotal += edgeLogFactor(assignment, e, logBand, n0);
  if (logTotal === 0) return 1;
  const logTotalBand = Math.log(maxTotalOdds);
  const clamped = Math.min(logTotalBand, Math.max(-logTotalBand, logTotal));
  return Math.exp(clamped);
}

// ---------------------------------------------------------------------------
// Applying it to a particle set
// ---------------------------------------------------------------------------

export interface GraphWeightOptions extends GraphLikelihoodOptions {
  /** the session's archetypes — `softEdgesFor` prefers an archetype-scoped edge over a pooled one */
  archetypes?: string[];
  sourceKind?: string | null;
  /**
   * Include `candidate` (statistics-produced, not yet human-reviewed) soft edges. Default true, matching
   * `softEdgesFor`'s own default: every edge the mining pipeline emits today is a candidate, so approved-only
   * would make this a silent no-op rather than a conservative setting. The conservatism lives one level up —
   * the whole feature is off unless a graph is explicitly passed — and `softEdgesFor` already drops pooled
   * edges carrying a Simpson's warning.
   */
  includeCandidates?: boolean;
  /** strictly positive floor on a pre-normalization weight (default `MIN_WORLD_WEIGHT`) */
  minWeight?: number;
  /** stamp written onto weighted worlds; defaults to `graph.version` */
  version?: string;
}

/**
 * Reweight NEWLY sampled worlds by the graph's soft edges, once, and renormalize.
 *
 * Identity — the same array object back, byte for byte — in three cases, each deliberate:
 *   - no graph (the shipped default: a graph-off run must be indistinguishable from one before this file existed)
 *   - no applicable soft edges for this session's archetypes
 *   - every world already carries a `graph_weighted` stamp (the double-counting guard)
 *
 * A mixed set is handled the way rule 7 asks: stamped worlds keep their weight untouched and only the fresh
 * ones are reweighted, then the whole set is renormalized together (renormalization is not double counting —
 * it is a common factor).
 */
export function applyGraphWeights(worlds: World[], graph: DesignGraph | null | undefined, opts: GraphWeightOptions = {}): World[] {
  if (!graph) return worlds;
  const edges = softEdgesFor(graph, {
    archetypes: opts.archetypes ?? [],
    sourceKind: opts.sourceKind ?? null,
    ...(opts.includeCandidates !== undefined ? { includeCandidates: opts.includeCandidates } : {}),
  });
  if (!edges.length) return worlds;
  if (worlds.every(isGraphWeighted)) return worlds;
  const floor = Math.max(Number.MIN_VALUE, opts.minWeight ?? MIN_WORLD_WEIGHT);
  const version = opts.version ?? graph.version;
  // Captured before normalization so the stamp is re-applied explicitly rather than depending on
  // `normalizeWeights` happening to spread unknown fields.
  const stamps = worlds.map((w) => graphWeightedVersion(w) ?? version);
  const reweighted = worlds.map((w) => (isGraphWeighted(w) ? w : { ...w, weight: Math.max(floor, w.weight * graphLikelihood(w.assignment, edges, opts)) }));
  return normalizeWeights(reweighted).map((w, i) => stamped(w, stamps[i]!));
}

// ---------------------------------------------------------------------------
// Saying it in words
// ---------------------------------------------------------------------------

export interface ExplainEdgeOptions {
  /** human label for an element key (`node=option`); defaults to the key itself */
  label?: (key: string) => string;
  /** below this many eligible rows the wording hedges (default `DEFAULT_SUPPORT_N0`, the soft-edge floor) */
  minConfidentN?: number;
  /**
   * A 95% interval wider than this hedges however large the sample. Default 0.30: wide enough to state the
   * spec's own exemplar (0.61–0.87, span 0.26) plainly, narrow enough that an interval which cannot separate
   * "usually" from "sometimes" refuses to be quoted as a fact.
   */
  maxConfidentWidth?: number;
}

const p2 = (x: number): string => x.toFixed(2);

/**
 * The data-backed rationale for one soft edge, in a sentence a non-technical owner can check.
 *
 * The rule the wording enforces: **a number is only stated plainly when the number is worth stating plainly.**
 * An edge below the support floor, or one whose 95% interval is too wide to distinguish 0.5 from 0.9, or one
 * with no interval at all, is described as a hint and says so in the same breath as the estimate. A missing
 * interval is never rendered as a range — no `0.76–0.76`, no `–`, no silently dropped clause that leaves a
 * bare point estimate looking certain. This is the "verbalised confidence" failure mode from
 * `design_graph.ts` showing up one layer later: there, a model must not say how sure it is; here, a sentence
 * must not sound surer than its own sample.
 */
export function explainEdge(edge: GraphEdge, opts: ExplainEdgeOptions = {}): string {
  const label = opts.label ?? ((k: string) => k);
  const from = label(edge.from);
  const to = label(edge.to);

  if (!SOFT_RELATIONS.has(edge.relation)) {
    if (edge.relation === "unknown") return `No statistical claim can be made about ${to} given ${from}${edge.note ? `: ${edge.note}.` : "."}`;
    return `${from} → ${to} is a "${edge.relation}" rule authored in the catalog: it is enforced directly when a world is built, never by likelihood, and carries no population statistic.`;
  }

  const minN = opts.minConfidentN ?? DEFAULT_SUPPORT_N0;
  const maxWidth = opts.maxConfidentWidth ?? 0.3;
  const n = Math.max(0, Math.round(edge.eligible_n));
  const width = edge.ci95 ? edge.ci95.high - edge.ci95.low : null;
  const scope = edge.archetype !== null ? `comparable, observable ${edge.archetype} projects` : `comparable, observable projects (pooled across archetypes)`;

  // "31 of 41": the denominator is rows where A was observed (p_from · eligible_n), the numerator is those
  // that also had B (p(B|A) · denominator). Reconstructed from the edge's own estimates, and only stated when
  // both are available — otherwise the sentence talks about the eligible pool instead of inventing a count.
  const pool = edge.p_from !== null && edge.p_from > 0 ? Math.round(edge.p_from * n) : null;
  const both = pool !== null && edge.p_to_given_from !== null ? Math.round(edge.p_to_given_from * pool) : null;
  const counts =
    pool !== null && both !== null && pool > 0
      ? `${both} of ${pool} ${scope} with ${from} also had ${to}`
      : `${n} ${scope} could have shown ${to} alongside ${from}`;
  const baseline = edge.p_to !== null ? `, against a baseline of ${p2(edge.p_to)} across ${scope}` : "";
  const estimate = edge.p_to_given_from !== null ? `Estimated probability: ${p2(edge.p_to_given_from)}` : `No probability could be estimated`;

  const reasons: string[] = [];
  if (n < minN) reasons.push(`only ${n} ${scope} were observable, below the floor of ${minN} for a usable estimate`);
  if (!edge.ci95) reasons.push(`no 95% interval was computed for this edge`);
  else if (width !== null && width > maxWidth) reasons.push(`the 95% interval ${p2(edge.ci95.low)} to ${p2(edge.ci95.high)} spans ${p2(width)}, too wide to read the point estimate on its own`);

  const warning = edge.simpsons_warning ? `Warning: ${edge.simpsons_warning}. ` : "";

  if (reasons.length) {
    return `${warning}${to} may go with ${from}, but the evidence is thin: ${counts}${baseline}. ${estimate}, and ${reasons.join("; ")} — treat this as a hint, not a finding.`;
  }
  const interval = `95% interval: ${p2(edge.ci95!.low)}–${p2(edge.ci95!.high)}`;
  if (edge.relation === "soft_negative") return `${warning}${to} is left out because only ${counts}${baseline}. ${estimate}, ${interval}.`;
  return `${warning}${to} is included because ${counts}. ${estimate}, ${interval}.`;
}
