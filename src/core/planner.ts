/**
 * The unified interaction planner — the discriminative-question principle taken to its end.
 *
 * The product has three elicitation instruments now, and `decideNext` only ever chose among one of them
 * (cards). But a card, a story check, and a defaults-review tap all cost the user the same thing — one
 * interaction — and all three have a computable information yield over the same belief. So the honest
 * question is not "which card is most discriminative?" but "which INTERACTION is most discriminative per unit
 * of the user's effort?", with θ generalized from the price of a card to the price of a tap.
 *
 * Units. Everything is converted to consequence-weighted bits-equivalent so the instruments are comparable:
 *   - card:   `value1` from the selector, in the scoring's own units (weighted_entropy ≈ consequence-bits).
 *   - verify: `expected_bits` × the bundle's consequence — a probe that confirms/refutes k assumptions at
 *             joint p≈0.5 yields ~1 bit about a bundle worth Σc.
 *   - review: a tap on one defaulted decision reveals its true value: c × H(P) bits about that decision,
 *             discounted by `reviewAttention` because a review tap is a skim, not an answer (measured: even a
 *             PERFECT reviewer nets ~31% at depth 8, and wrong defaults hide below the fold).
 * The scale factors are explicit, documented, and harness-tunable — never silently baked in.
 *
 * This module is PURE: it ranks; it never generates or applies anything. `Engine.planNext` renders the
 * winner. Selection changes are decided by the harness (`--mix`), never by argument.
 */
import type { Belief } from "./worlds.js";
import { distribution, maxOption } from "./worlds.js";
import { entropyBits, rankOpen, type Ranked, type Scoring, type SelectorConfig } from "./selector.js";
import { composeVerifyProbes, type VerifyProbe } from "./verify.js";

export type InteractionKind = "card" | "verify" | "review";

export interface PlannedInteraction {
  kind: InteractionKind;
  /** consequence-weighted bits-equivalent expected from ONE such interaction */
  value: number;
  /** the decisions this interaction touches */
  nodes: string[];
  /** the card candidate, when kind === "card" */
  card?: Ranked;
  /** the probe, when kind === "verify" */
  probe?: VerifyProbe;
  /** one-line explanation for the UI/logs ("one story check covering 4 assumptions") */
  why: string;
}

export interface PlanOptions {
  /** open decisions the card loop may ask (already gated/filtered by the caller) */
  openIds: string[];
  /** defaulted decisions a story check or a review tap may target */
  defaultedIds: string[];
  consequenceOverride?: Record<string, number> | undefined;
  scoring?: Scoring;
  /** cards already spent this round (Rule 7's cap belongs to the caller, not here) */
  cardsRemaining: number;
  /** a review tap is a skim, not an answer — see the header. 0..1 */
  reviewAttention?: number;
  /** verify's bits→consequence-bits bridge; 1 = one bit about the whole bundle's consequence */
  verifyScale?: number;
  /** the ledger's chosen option per defaulted decision, for probe composition (see ComposeOptions.chosen) */
  chosen?: Record<string, string>;
}

export const DEFAULT_REVIEW_ATTENTION = 0.35;
export const DEFAULT_VERIFY_SCALE = 1;

/**
 * Rank one candidate interaction of each kind. Returns them best-first; the caller applies θ (the price of a
 * tap) and any per-kind availability rules. Deterministic given the belief.
 */
export function planInteractions(b: Belief, cfg: SelectorConfig, opts: PlanOptions): PlannedInteraction[] {
  const out: PlannedInteraction[] = [];
  const co = opts.consequenceOverride;
  const scoring = opts.scoring ?? cfg.scoring;

  if (opts.cardsRemaining > 0 && opts.openIds.length) {
    const ranked = rankOpen(b, opts.openIds, co, { scoring, lookahead: cfg.lookahead, lookaheadTop: cfg.lookaheadTop, discount: cfg.discount });
    const top = ranked[0];
    if (top) out.push({ kind: "card", value: top.value1, nodes: [top.nodeId], card: top, why: `one question that settles the single most uncertain decision (${top.nodeId})` });
  }

  if (opts.defaultedIds.length) {
    const probes = composeVerifyProbes(b, opts.defaultedIds, { consequenceOverride: co, maxProbes: 1, ...(opts.chosen ? { chosen: opts.chosen } : {}) });
    const p = probes[0];
    if (p) {
      out.push({
        kind: "verify",
        value: p.expected_bits * p.consequence * (opts.verifyScale ?? DEFAULT_VERIFY_SCALE),
        nodes: p.nodes.map((n) => n.id),
        probe: p,
        why: `one story check covering ${p.nodes.length} assumption${p.nodes.length > 1 ? "s" : ""} at once`,
      });
    }

    // The best single review tap: the defaulted decision with the most consequence-weighted uncertainty left.
    let best: { id: string; value: number } | undefined;
    for (const id of opts.defaultedIds) {
      const dist = distribution(b, id);
      const c = co?.[id] ?? 0;
      const consequence = c || nodeConsequence(b, id);
      const v = consequence * entropyBits(dist) * (opts.reviewAttention ?? DEFAULT_REVIEW_ATTENTION);
      if (!best || v > best.value) best = { id, value: v };
    }
    if (best) out.push({ kind: "review", value: best.value, nodes: [best.id], why: `a direct look at the single riskiest assumption (${best.id})` });
  }

  return out.sort((x, y) => y.value - x.value || x.kind.localeCompare(y.kind));
}

function nodeConsequence(b: Belief, id: string): number {
  return b.nodes.find((n) => n.id === id)?.consequence ?? 0;
}

/** Diagnostic: how much of each defaulted decision's uncertainty the belief still holds (for logs/UI). */
export function residualUncertainty(b: Belief, ids: string[], co?: Record<string, number>): { node: string; bits: number; maxP: number }[] {
  return ids
    .map((id) => {
      const dist = distribution(b, id);
      const c = co?.[id] ?? nodeConsequence(b, id);
      return { node: id, bits: c * entropyBits(dist), maxP: maxOption(dist).p };
    })
    .sort((a, z) => z.bits - a.bits);
}
