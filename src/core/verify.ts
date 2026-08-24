/**
 * VERIFICATION-MODE elicitation: adaptive group testing over the belief's defaulted decisions.
 *
 * When the belief is concentrated and mostly right, verification beats elicitation: instead of asking
 * "which option?" per node, show one concrete scenario that BUNDLES several defaulted decisions at their
 * belief-argmax values and ask "does anything here read wrong?". An acceptance confirms the whole bundle;
 * a rejection localizes an error (the UI then elicits which). This is the batched generalization of binary
 * search: the maximally informative probe is the one whose accept/reject outcome is a fair coin, so bundles
 * are composed so that the JOINT probability that all bundled argmaxes are correct ≈ 0.5
 * (maximum-information Bernoulli).
 *
 * Pure per house rules: no IO, no LLM, no clocks, no randomness. Everything is computed from the particle
 * belief (src/core/worlds.ts). The engine wiring elsewhere depends on the exact exported names/shapes here.
 *
 * Approximations, stated honestly:
 *  - The per-node argmax is taken from `distribution` (which α-mixes the catalog prior into the particle
 *    counts), but the JOINT agreement probability is computed over the PARTICLES ONLY — the α-prior has no
 *    joint structure to mix in (it is a product of independent per-node priors over a virtual world), so
 *    mixing it into a joint would fabricate correlations the belief does not hold. Consequence: for a node
 *    whose particles all agree, the particle-joint contribution is 1.0 even though the α-mixed marginal is
 *    ~0.97 — near-certain nodes look CERTAIN to the joint. That is exactly why all-"filler" probes are
 *    forbidden (below): the particle set cannot represent their residual uncertainty, so a probe made only
 *    of them would be scored as a guaranteed acceptance (0 bits).
 *  - Candidates whose argmax has ZERO explicit particle support are skipped entirely: their probability mass
 *    is pure α-prior, so no world-reweighting can respond to a verification outcome on them — prior-only
 *    nodes can't be verified against worlds.
 *  - `expected_bits` is a heuristic upper-bound-ish score, not an exact mutual information (see VerifyProbe).
 */
import type { NodeDef } from "./catalog.js";
import { type Belief, type World, distribution, maxOption, nodeById, normalizeWeights } from "./worlds.js";

export interface VerifyProbe {
  /** "v1", "v2", ... — deterministic, assigned in the returned (informativeness) order */
  id: string;
  /** the bundled decisions at their belief-argmax values */
  nodes: { id: string; option: string }[];
  /** joint probability, under the particle belief, that every bundled argmax is right (see header note) */
  p_all_correct: number;
  /** Σ effective consequence of bundled nodes (consequenceOverride ?? catalog consequence) */
  consequence: number;
  /**
   * H(p_all_correct) + (1 − p_all_correct) × log2(nodes.length).
   * The first term is the exact information of the accept/reject bit; the localization bonus credits a
   * rejection with up to log2(k) additional bits for identifying WHICH of the k bundled nodes is wrong.
   * That bonus is an upper-boundish heuristic: it assumes the follow-up localization is a uniform choice
   * over the bundle and free of its own noise, so real information gained is ≤ this. Used for ranking and
   * reporting only — never as a calibrated quantity.
   */
  expected_bits: number;
}

export interface ComposeOptions {
  /** ideal joint p (maximum-information Bernoulli); default 0.5 */
  target?: number;
  /** acceptable joint-p band [lo, hi]; default [0.35, 0.65] */
  band?: [number, number];
  /** max decisions bundled into one probe; default 6 */
  maxSize?: number;
  /** max probes returned (over disjoint node sets); default 4 */
  maxProbes?: number;
  consequenceOverride?: Record<string, number>;
}

const DEFAULT_TARGET = 0.5;
const DEFAULT_BAND: [number, number] = [0.35, 0.65];
const DEFAULT_MAX_SIZE = 6;
const DEFAULT_MAX_PROBES = 4;

/** Nodes at/above this α-mixed max P are "filler": near-certain, usable only where they barely move joint p. */
export const VERIFY_FILLER_TAU = 0.97;
/** A filler node may join a bundle only if it lowers joint p by at most this much (it must not move p meaningfully). */
export const VERIFY_FILLER_MAX_DELTA = 0.02;

/** Same agreement convention as `conditionHard`/`conditionSoft`: an undefined assignment agrees. */
function agrees(w: World, id: string, option: string): boolean {
  const a = w.assignment[id];
  return a === undefined || a === option;
}

/** Joint P(all bundled argmaxes hold) over the particles (weights renormalized defensively). */
function jointP(worlds: World[], nodes: { id: string; option: string }[]): number {
  let total = 0;
  let match = 0;
  for (const w of worlds) {
    total += w.weight;
    if (nodes.every((n) => agrees(w, n.id, n.option))) match += w.weight;
  }
  return total > 0 ? match / total : 0;
}

/** Explicit particle support for node=option (undefined does NOT count — that's the prior-only test). */
function explicitSupport(worlds: World[], id: string, option: string): number {
  let s = 0;
  for (const w of worlds) if (w.assignment[id] === option) s += w.weight;
  return s;
}

function binaryEntropy(p: number): number {
  if (p <= 0 || p >= 1) return 0;
  return -p * Math.log2(p) - (1 - p) * Math.log2(1 - p);
}

function expectedBits(p: number, k: number): number {
  return binaryEntropy(p) + (1 - p) * (k > 0 ? Math.log2(k) : 0);
}

interface Candidate {
  id: string;
  option: string; // belief argmax
  maxP: number; // α-mixed marginal of the argmax
  consequence: number; // effective
  score: number; // consequence × (1 − maxP) — greedy priority
  filler: boolean;
}

/**
 * Compose up to `maxProbes` verification probes over DISJOINT subsets of `candidateIds`.
 *
 * Greedy composition: candidates are ordered by effective consequence × (1 − maxP) descending (riskiest
 * mass first — the same priority as the defaults review). A bundle is seeded with the first unused
 * non-filler candidate and grown by the next candidate whose inclusion keeps joint p ≥ band[0]; once inside
 * the band, growth continues only while it moves p strictly CLOSER to the target. A bundle closes when
 * inside the band, when no candidate can join without dropping below band[0], or at the size cap. Filler
 * nodes (maxP ≥ VERIFY_FILLER_TAU) are then appended while they move p by ≤ VERIFY_FILLER_MAX_DELTA — they
 * ride along for consequence coverage but may never make up a whole probe (see header note on why).
 *
 * Returned probes: those inside the band, sorted by |p − target| ascending (most informative first) with
 * deterministic tie-breaks. Degenerate fallback (documented behaviour): if NO composed bundle lands inside
 * the band — e.g. every candidate alone is already below band[0], or size-capped bundles are still above
 * band[1] — the single composed probe closest to the target is returned rather than none, so verification
 * mode degrades to "test the best available scenario" instead of going silent.
 */
export function composeVerifyProbes(belief: Belief, candidateIds: string[], opts: ComposeOptions = {}): VerifyProbe[] {
  const target = opts.target ?? DEFAULT_TARGET;
  const band = opts.band ?? DEFAULT_BAND;
  const maxSize = opts.maxSize ?? DEFAULT_MAX_SIZE;
  const maxProbes = opts.maxProbes ?? DEFAULT_MAX_PROBES;
  const worlds = belief.worlds;

  // ---- candidate table ----
  const seen = new Set<string>();
  const candidates: Candidate[] = [];
  for (const id of candidateIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const node: NodeDef | undefined = nodeById(belief, id);
    if (!node) continue;
    const { option, p } = maxOption(distribution(belief, id));
    if (!option) continue;
    // prior-only nodes can't be verified against worlds (see header): skip zero explicit particle support
    if (explicitSupport(worlds, id, option) <= 0) continue;
    const c = opts.consequenceOverride?.[id] ?? node.consequence;
    candidates.push({ id, option, maxP: p, consequence: c, score: c * (1 - p), filler: p >= VERIFY_FILLER_TAU });
  }
  candidates.sort((a, b) => b.score - a.score || b.consequence - a.consequence || a.id.localeCompare(b.id));

  const inBand = (p: number) => p >= band[0] && p <= band[1];
  const used = new Set<string>();
  type Built = { nodes: { id: string; option: string }[]; p: number; consequence: number; order: number };
  const built: Built[] = [];

  while (built.length < maxProbes) {
    const seed = candidates.find((c) => !c.filler && !used.has(c.id));
    if (!seed) break; // no non-filler candidate left: a probe may never be all-filler
    const bundle: Candidate[] = [seed];
    let p = jointP(worlds, bundle);
    // grow with non-filler candidates
    while (bundle.length < maxSize && p >= band[0]) {
      let added = false;
      for (const cand of candidates) {
        if (cand.filler || used.has(cand.id) || bundle.includes(cand)) continue;
        const pNew = jointP(
          worlds,
          [...bundle, cand].map((x) => ({ id: x.id, option: x.option })),
        );
        if (pNew < band[0]) continue; // this one would overshoot; try the next candidate
        if (inBand(p) && Math.abs(pNew - target) >= Math.abs(p - target)) continue; // no closer to target
        bundle.push(cand);
        p = pNew;
        added = true;
        break;
      }
      if (!added) break;
    }
    // filler pass: near-certain nodes ride along only where they barely move p
    for (const cand of candidates) {
      if (bundle.length >= maxSize) break;
      if (!cand.filler || used.has(cand.id) || bundle.includes(cand)) continue;
      const pNew = jointP(
        worlds,
        [...bundle, cand].map((x) => ({ id: x.id, option: x.option })),
      );
      if (pNew < band[0] || p - pNew > VERIFY_FILLER_MAX_DELTA) continue;
      bundle.push(cand);
      p = pNew;
    }
    for (const c of bundle) used.add(c.id);
    built.push({
      nodes: bundle.map((c) => ({ id: c.id, option: c.option })),
      p,
      consequence: bundle.reduce((s, c) => s + c.consequence, 0),
      order: built.length,
    });
  }

  // Most informative first: in-band probes by distance to target; deterministic ties by composition order.
  const byInformativeness = (a: Built, b: Built) => Math.abs(a.p - target) - Math.abs(b.p - target) || a.order - b.order;
  const banded = built.filter((x) => inBand(x.p)).sort(byInformativeness);
  // Degenerate fallback: nothing in band → the single probe closest to target, never an empty answer.
  const chosen = banded.length ? banded : built.length ? [built.slice().sort(byInformativeness)[0]!] : [];
  return chosen.map((x, i) => ({
    id: `v${i + 1}`,
    nodes: x.nodes,
    p_all_correct: x.p,
    consequence: x.consequence,
    expected_bits: expectedBits(x.p, x.nodes.length),
  }));
}

/**
 * Bayesian-ish soft update of the particle weights after one verification outcome.
 *
 *  - ok=true (the scenario was accepted): every world that DISAGREES with ANY bundled assignment
 *    contradicts an accepted scenario → its weight is multiplied by `epsilon`.
 *  - ok=false (something read wrong): at least one bundled assignment is wrong, so every world that AGREES
 *    with ALL bundled assignments is inconsistent with the rejection → ×epsilon.
 *
 * Same structure and conventions as `conditionSoft` (undefined assignment agrees; support is never zeroed
 * as long as epsilon > 0; `normalizeWeights` restores Σw = 1, falling back to uniform on total 0).
 */
export function reweightOnVerify(worlds: World[], nodes: { id: string; option: string }[], ok: boolean, epsilon: number): World[] {
  return normalizeWeights(
    worlds.map((w) => {
      const agreesAll = nodes.every((n) => agrees(w, n.id, n.option));
      const keep = ok ? agreesAll : !agreesAll;
      return { ...w, weight: w.weight * (keep ? 1 : epsilon) };
    }),
  );
}
