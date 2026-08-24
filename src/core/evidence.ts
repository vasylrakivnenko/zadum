/**
 * Evidence absorption: one user utterance (or pasted artifact) updates the WHOLE belief, not just the
 * decisions a patcher explicitly matches. The LLM acts as a likelihood function — it scores how well each
 * particle world fits the evidence — and the update is classic likelihood weighting on the existing particle
 * filter. Pure math lives here; the LLM call lives in `llm/functions.ts` (`worldLikelihoods`).
 */
import type { Belief, World } from "./worlds.js";
import { normalizeWeights, distribution, maxOption } from "./worlds.js";

/** LLM fit verdict → likelihood. Quantized buckets because verbalized probabilities are poorly calibrated. */
export const FIT_LIKELIHOOD: Record<string, number> = {
  very_unlikely: 0.1,
  unlikely: 0.3,
  neutral: 0.5,
  likely: 0.7,
  very_likely: 0.9,
};

/**
 * w' ∝ w × (floor + (1 − floor) · L). The floor keeps support: a single utterance judged by a fallible LLM
 * must never annihilate a world (mirrors ε-soft conditioning on answers, which are far stronger evidence).
 */
export function reweightByLikelihood(worlds: World[], likelihoodByWorldId: Record<string, number>, floor = 0.25): World[] {
  return normalizeWeights(
    worlds.map((w) => {
      const like = likelihoodByWorldId[w.id];
      if (like === undefined) return { ...w };
      const l = Math.max(0, Math.min(1, like));
      return { ...w, weight: w.weight * (floor + (1 - floor) * l) };
    }),
  );
}

/**
 * What makes each world DISTINCTIVE: the nodes where it deviates from the belief's global argmax, ranked by
 * consequence, capped. This is what the likelihood judge reads — scoring worlds by their full assignments
 * would drown the signal in ~50 shared choices.
 */
export function worldSummaries(b: Belief, cap = 8): { world_id: string; summary: string }[] {
  const argmax = new Map(b.nodes.map((n) => [n.id, maxOption(distribution(b, n.id)).option]));
  const nodeById = new Map(b.nodes.map((n) => [n.id, n]));
  return b.worlds.map((w) => {
    const deviations = Object.entries(w.assignment)
      .filter(([nodeId, opt]) => argmax.get(nodeId) !== undefined && argmax.get(nodeId) !== opt && nodeById.has(nodeId))
      .map(([nodeId, opt]) => ({ node: nodeById.get(nodeId)!, opt }))
      .sort((a, b2) => b2.node.consequence - a.node.consequence)
      .slice(0, cap)
      .map(({ node, opt }) => `${node.topic}: ${node.options.find((o) => o.id === opt)?.label ?? opt}`);
    return { world_id: w.id, summary: deviations.length ? deviations.join("; ") : "(matches the most likely configuration on every notable point)" };
  });
}

/** Nodes whose argmax changed or whose max P moved by ≥ minDelta between two beliefs — the user-visible shift. */
export function beliefShift(before: Belief, after: Belief, minDelta = 0.1): { node: string; from: string; to: string; p_from: number; p_to: number }[] {
  const out: { node: string; from: string; to: string; p_from: number; p_to: number }[] = [];
  for (const n of before.nodes) {
    const a = maxOption(distribution(before, n.id));
    const b = maxOption(distribution(after, n.id));
    if (a.option !== b.option || Math.abs(b.p - a.p) >= minDelta) out.push({ node: n.id, from: a.option, to: b.option, p_from: a.p, p_to: b.p });
  }
  return out;
}
