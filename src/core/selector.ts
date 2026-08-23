/**
 * Deterministic card selection: value-of-information over the belief (the sampled worlds).
 *
 * Two knobs, both experiments rather than opinions (see docs/DECISIONS.md ADR-002 / ADR-014 / ADR-015):
 *   scoring   — what "uncertainty about the final spec" means (see `Scoring`)
 *   lookahead — 1 = greedy (ask the argmax now), 2 = one-step lookahead over the follow-up question,
 *               i.e. the first two plies of the optimal decision tree.
 *
 * Ranking and stopping are deliberately separated: cards are ordered by `value` (which includes the
 * lookahead term when enabled) but the loop stops on `value1`, the value of asking *this* card *now*.
 * That keeps θ in fixed, interpretable units no matter how deep the search goes.
 */
import { type Belief, distribution, maxOption, topOptions, conditionHard, nodeById } from "./worlds.js";

/**
 * Scoring functional for value-of-asking. All three are computed over the same particle belief:
 *  - `weighted_entropy` (default): expected reduction in Σ cₙ·H(Pₙ) — consequence-weighted information gain.
 *    Information-theoretic, but measures uncertainty about the *spec* (each decision weighted by how much
 *    of the spec depends on it) rather than about decision ids.
 *  - `joint_entropy`: mutual information between the answer and world identity, H(w) − Σₐ P(a)H(w|a).
 *    The textbook optimal-decision-tree split criterion: "halve the possibility space". Consequence-blind,
 *    and capped at log2(K) bits, so it degrades once the particle set is depleted.
 *  - `risk`: expected reduction in consequence-weighted Bayes risk Σ cₙ(1 − max Pₙ) — decision-theoretic;
 *    units are "expected rework if we default now".
 */
export type Scoring = "risk" | "weighted_entropy" | "joint_entropy";

export interface SelectorConfig {
  scoring: Scoring;
  /** stop when the one-step value of the best card < theta (units follow `scoring`; see DEFAULT_THETA) */
  theta: number;
  /** a decision is "derivable"/implied when max P >= tau */
  tau: number;
  /** soft-conditioning weight for disagreeing worlds after an answer */
  epsilon: number;
  /** hard cap on cards per session (Rule 7) */
  maxCards: number;
  /** prior pseudo-weight when mixing with worlds */
  alpha: number;
  /** resample worlds when effective sample size drops below this */
  minEss: number;
  /** 1 = greedy, 2 = rank by (this card + best follow-up) */
  lookahead: 1 | 2;
  /** with lookahead 2, deepen only the top-M candidates by one-step value (cost control) */
  lookaheadTop: number;
  /**
   * Cards show the top `min(node.options.length, maxCardOptions)` options by belief, not always exactly 2.
   * A binary card wastes information when a node genuinely has 3-4 live possibilities: the user is forced
   * toward the nearest-of-2, which either mis-elicits or gets "corrected" later at higher cost (a card and a
   * Spec Kit/DLAI question are already counted as one interaction step each in every comparison in
   * docs/EVALS.md — richer cards get more bits per step at the SAME step cost, not extra steps).
   */
  maxCardOptions: number;
  /** weight on the follow-up term under lookahead 2 */
  discount: number;
  /** soft implications need max P ≥ softImplyTau (stricter than tau: a soft implication removes a node from the
   *  askable set, so with K≈12 particles a single answer must not cascade into "deciding" a dozen nodes) */
  softImplyTau: number;
  /** minimum rise in max P for a crossing to count as a soft implication of the answer */
  minImplyDelta: number;
  /** consequence multiplier for nodes from secondary archetypes (not core, not the primary archetype) */
  secondaryArchetypeWeight: number;
}

/**
 * θ is the price of one user tap, denominated in the same units as `value1` — ask only while the next card
 * buys more than it costs. Those units are scoring-dependent and scale with how much is still open (the
 * indirect term sums over every remaining decision), so θ is CALIBRATED, never guessed:
 *
 *   npm run harness -- --sweep --variants 3      → "STOPPING RULE CALIBRATION" table
 *
 * One equal-budget run replays the whole θ → cards → recovery curve (see `thetaCurve`), so recalibration is
 * arithmetic, not more sessions.
 *
 * Calibration status (keep this honest) — both live sweeps: Azure OpenAI gpt-4.1, catalogs @2026.08.22-1/
 * @2026.08.23-1, `invoicing-bookkeeping` gold + 2 counterfactual variants (`npm run harness -- --sweep`):
 *  - Sweep 1 (n=1 live session, weighted_entropy only): first estimate, 10. Sweep 2 (below) supersedes it.
 *  - Sweep 2 (n=3, all four arms): replayed θ→cards→recovery curves for every arm. ALL THREE mock-derived
 *    defaults were wrong on live beliefs, not just weighted_entropy's: real beliefs are far more concentrated
 *    than the mock's, so mock-tuned θ chronically over- or under-stops depending on the arm. Best θ inside the
 *    3–9 card band, this run: risk 6.6 (8.3 cards, 69% recovered) — LOWER than the mock's 14; weighted_entropy
 *    24.4 (4.3 cards, 68%) — HIGHER than sweep 1's 10 (which still ran to the 12-card cap on this sample,
 *    buying only 8 more recovery points for 8 more cards past card 4 — not worth it); joint_entropy 1.25
 *    (7.7 cards, 68%) — LOWER than the mock's 1.5. Shipped values below are these, rounded.
 *  - Lookahead 2 needs its OWN calibration when enabled: this run's `weighted_entropy+2ply` arm, run at
 *    weighted_entropy's θ (its ranking includes a lookahead bonus term absent from `value1`, the quantity θ is
 *    compared against — see the ranking/stopping split above), under-stopped to the 12-card cap; its own
 *    best-band θ this run was ~32. `lookahead` defaults to 1 (ADR-015) so this isn't wired as a separate
 *    shipped default; recalibrate explicitly before using `--lookahead 2` in anything but experiments.
 *  - ORDERING finding (equal-budget arms, same sweep): all four criteria land within ~1pp AUC of each other
 *    (66–67%) on this gold set (n=3) — no criterion is demonstrably better yet. See docs/EVALS.md for the
 *    full table. This is not yet evidence either the founder's information-theoretic hypothesis or the
 *    risk-based alternative is right; it needs more archetypes and more gold sessions to separate them.
 *  - Recalibrate whenever the catalog changes materially, and re-run with more gold diversity before trusting
 *    the ORDERING result either way: `npm run harness -- --sweep --variants N` reads off both.
 */
export const DEFAULT_THETA: Record<Scoring, number> = { risk: 7, weighted_entropy: 24, joint_entropy: 1.25 };

export const DEFAULT_SELECTOR_CONFIG: SelectorConfig = {
  scoring: "weighted_entropy",
  theta: DEFAULT_THETA.weighted_entropy,
  tau: 0.9,
  epsilon: 0.05,
  maxCards: 12,
  alpha: 0.08,
  minEss: 4,
  lookahead: 1,
  lookaheadTop: 8,
  discount: 1,
  softImplyTau: 0.95,
  minImplyDelta: 0.1,
  secondaryArchetypeWeight: 0.5,
  maxCardOptions: 4,
};

/** Fill in a partial config, keeping θ consistent with the chosen scoring unless θ was given explicitly. */
export function resolveConfig(partial: Partial<SelectorConfig> = {}): SelectorConfig {
  const scoring = partial.scoring ?? DEFAULT_SELECTOR_CONFIG.scoring;
  return { ...DEFAULT_SELECTOR_CONFIG, scoring, theta: partial.theta ?? DEFAULT_THETA[scoring], ...partial };
}

export function entropyBits(dist: Record<string, number>): number {
  let h = 0;
  for (const p of Object.values(dist)) if (p > 0) h -= p * Math.log2(p);
  return h;
}

/** Σ_n c_n H(P_n) over the given nodes. */
export function expectedEntropy(b: Belief, nodeIds: string[], consequenceOverride?: Record<string, number>): number {
  let total = 0;
  for (const id of nodeIds) {
    const node = nodeById(b, id);
    if (!node) continue;
    const c = consequenceOverride?.[id] ?? node.consequence;
    if (c <= 0) continue;
    total += c * entropyBits(distribution(b, id));
  }
  return total;
}

/** Σ_n c_n (1 − max_a P_n(a)) over the given nodes. */
export function expectedError(b: Belief, nodeIds: string[], consequenceOverride?: Record<string, number>): number {
  let total = 0;
  for (const id of nodeIds) {
    const node = nodeById(b, id);
    if (!node) continue;
    const c = consequenceOverride?.[id] ?? node.consequence;
    if (c <= 0) continue;
    const { p } = maxOption(distribution(b, id));
    total += c * (1 - p);
  }
  return total;
}

/** Entropy (bits) of the world-identity distribution (the particle weights). */
export function worldEntropy(b: Belief): number {
  const dist: Record<string, number> = {};
  b.worlds.forEach((w, i) => (dist[String(i)] = w.weight));
  return entropyBits(dist);
}

export interface Ranked {
  nodeId: string;
  /** ranking score: one-step value, plus the best-follow-up term when lookahead = 2 */
  value: number;
  /** one-step value of asking this card now — the quantity θ is compared against */
  value1: number;
  maxP: number;
  top: { option: string; p: number }[];
  dist: Record<string, number>;
  consequence: number;
  /**
   * value1 as a fraction of all the uncertainty still open (0..1). Diagnostic only — stopping uses the
   * absolute value because θ prices a question, but this is the scale-free number to watch across
   * archetypes and catalog versions, and it is what the learning loops should regress on.
   */
  share: number;
  /** true when the lookahead term was actually computed for this node */
  deepened: boolean;
}

/** Total remaining uncertainty under a scoring — the denominator for `Ranked.share`. */
export function totalUncertainty(b: Belief, openIds: string[], consequenceOverride?: Record<string, number>, scoring: Scoring = DEFAULT_SELECTOR_CONFIG.scoring): number {
  if (scoring === "joint_entropy") return worldEntropy(b);
  return scoring === "risk" ? expectedError(b, openIds, consequenceOverride) : expectedEntropy(b, openIds, consequenceOverride);
}

/** Value of asking `nodeId` under the given scoring (exact one-step computation over the particle approximation). */
export function valueOfAsking(
  b: Belief,
  nodeId: string,
  openIds: string[],
  consequenceOverride?: Record<string, number>,
  scoring: Scoring = DEFAULT_SELECTOR_CONFIG.scoring,
): number {
  const node = nodeById(b, nodeId);
  if (!node) return 0;
  const others = openIds.filter((id) => id !== nodeId);
  const dist = distribution(b, nodeId);
  const c = consequenceOverride?.[nodeId] ?? node.consequence;

  if (scoring === "joint_entropy") {
    // I(answer; world) = H(w) − Σ_a P(a) H(w | a)
    const h0 = worldEntropy(b);
    let exp = 0;
    for (const [opt, p] of Object.entries(dist)) {
      if (p <= 0) continue;
      exp += p * worldEntropy({ ...b, worlds: conditionHard(b.worlds, nodeId, opt) });
    }
    return Math.max(0, h0 - exp);
  }

  const measure = scoring === "risk" ? expectedError : expectedEntropy;
  const direct = scoring === "risk" ? c * (1 - maxOption(dist).p) : c * entropyBits(dist);
  const base = measure(b, others, consequenceOverride);
  let exp = 0;
  for (const [opt, p] of Object.entries(dist)) {
    if (p <= 0) continue;
    const conditioned: Belief = { ...b, worlds: conditionHard(b.worlds, nodeId, opt) };
    exp += p * measure(conditioned, others, consequenceOverride);
  }
  const indirect = Math.max(0, base - exp);
  return direct + indirect;
}

/**
 * Two-ply value: asking `nodeId` now, plus the expected value of the best follow-up question.
 *   V₂(n) = V₁(n) + γ · Σ_a P(a) · max_{m ≠ n} V₁(m | n = a)
 * This is the first two levels of the optimal decision tree. It needs no LLM call — only the particle
 * belief — so it costs milliseconds, not latency budget.
 */
export function valueWithLookahead(
  b: Belief,
  nodeId: string,
  openIds: string[],
  consequenceOverride: Record<string, number> | undefined,
  scoring: Scoring,
  discount = 1,
): number {
  const v1 = valueOfAsking(b, nodeId, openIds, consequenceOverride, scoring);
  const others = openIds.filter((id) => id !== nodeId);
  if (others.length === 0 || discount === 0) return v1;
  const dist = distribution(b, nodeId);
  let future = 0;
  for (const [opt, p] of Object.entries(dist)) {
    if (p <= 0) continue;
    const conditioned: Belief = { ...b, worlds: conditionHard(b.worlds, nodeId, opt) };
    let best = 0;
    for (const m of others) {
      const v = valueOfAsking(conditioned, m, others, consequenceOverride, scoring);
      if (v > best) best = v;
    }
    future += p * best;
  }
  return v1 + discount * future;
}

export interface RankOptions {
  scoring?: Scoring;
  lookahead?: 1 | 2;
  lookaheadTop?: number;
  discount?: number;
}

function asOptions(o: Scoring | RankOptions | undefined): Required<RankOptions> {
  const base = { scoring: DEFAULT_SELECTOR_CONFIG.scoring, lookahead: 1 as 1 | 2, lookaheadTop: 8, discount: 1 };
  if (o === undefined) return base;
  if (typeof o === "string") return { ...base, scoring: o };
  return { ...base, ...o };
}

export function rankOpen(
  b: Belief,
  openIds: string[],
  consequenceOverride?: Record<string, number>,
  opts?: Scoring | RankOptions,
): Ranked[] {
  const { scoring, lookahead, lookaheadTop, discount } = asOptions(opts);
  const total = totalUncertainty(b, openIds, consequenceOverride, scoring);
  const out: Ranked[] = [];
  for (const id of openIds) {
    const node = nodeById(b, id);
    if (!node) continue;
    const dist = distribution(b, id);
    const v1 = valueOfAsking(b, id, openIds, consequenceOverride, scoring);
    out.push({
      nodeId: id,
      value: v1,
      value1: v1,
      maxP: maxOption(dist).p,
      top: topOptions(dist, 3),
      dist,
      consequence: consequenceOverride?.[id] ?? node.consequence,
      share: total > 0 ? Math.min(1, v1 / total) : 0,
      deepened: false,
    });
  }
  const bySortKey = (x: Ranked, y: Ranked) => y.value - x.value || y.consequence - x.consequence || x.nodeId.localeCompare(y.nodeId);
  out.sort(bySortKey);
  if (lookahead === 2 && out.length > 1) {
    // Heuristic: deepen only the strongest one-step candidates — a node far down the one-step ranking is
    // very unlikely to win once every candidate gets a comparable follow-up bonus.
    for (const r of out.slice(0, Math.max(2, lookaheadTop))) {
      r.value = valueWithLookahead(b, r.nodeId, openIds, consequenceOverride, scoring, discount);
      r.deepened = true;
    }
    out.sort(bySortKey);
  }
  return out;
}

export type NextDecision =
  | { action: "ask"; node: Ranked; ranked: Ranked[] }
  | { action: "stop"; reason: "max_cards" | "no_open" | "converged"; ranked: Ranked[] };

export function decideNext(
  b: Belief,
  openIds: string[],
  cfg: SelectorConfig,
  cardsShown: number,
  consequenceOverride?: Record<string, number>,
): NextDecision {
  const ranked = rankOpen(b, openIds, consequenceOverride, { scoring: cfg.scoring, lookahead: cfg.lookahead, lookaheadTop: cfg.lookaheadTop, discount: cfg.discount });
  if (cardsShown >= cfg.maxCards) return { action: "stop", reason: "max_cards", ranked };
  if (ranked.length === 0) return { action: "stop", reason: "no_open", ranked };
  const top = ranked[0]!;
  // Stop on the one-step value: "is this next card worth the user's tap right now?"
  if (top.value1 < cfg.theta) return { action: "stop", reason: "converged", ranked };
  return { action: "ask", node: top, ranked };
}

/**
 * Nodes (among candidates) whose max P crossed tau because of the last update AND moved by at least `minDelta`.
 * The delta guard matters on concentrated real beliefs: an unrelated answer can nudge a node sitting at 0.89
 * to 0.905 — that is pre-existing near-certainty, not an implication of the answer, and without the guard one
 * card "decided" 23 things in a live session. Such nodes simply stay open, are never worth asking, and become
 * defaults at the end.
 */
export function impliedByUpdate(before: Belief, after: Belief, candidateIds: string[], tau: number, minDelta = 0.05): { nodeId: string; option: string; p: number }[] {
  const out: { nodeId: string; option: string; p: number }[] = [];
  for (const id of candidateIds) {
    const b0 = maxOption(distribution(before, id));
    const b1 = maxOption(distribution(after, id));
    if (b0.p < tau && b1.p >= tau && b1.p - b0.p >= minDelta) out.push({ nodeId: id, option: b1.option, p: b1.p });
  }
  return out;
}

/** 0..1 — share of consequence-weighted uncertainty already removed. */
export function settledness(b: Belief, nodeIds: string[], consequenceOverride?: Record<string, number>): number {
  let totalC = 0;
  for (const id of nodeIds) {
    const n = nodeById(b, id);
    if (n) totalC += consequenceOverride?.[id] ?? n.consequence;
  }
  if (totalC <= 0) return 1;
  return 1 - expectedError(b, nodeIds, consequenceOverride) / totalC;
}
