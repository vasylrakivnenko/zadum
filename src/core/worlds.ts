/**
 * Belief state: K sampled "worlds" (complete candidate decision assignments) with weights.
 * Everything numeric about uncertainty is computed here — the LLM only ever proposes worlds.
 */
import { type NodeDef, propagateHard } from "./catalog.js";

export interface World {
  id: string;
  assignment: Record<string, string>; // nodeId -> optionId
  weight: number;
  origin: "sampled" | "resampled" | "repaired" | "prior";
}

export interface Belief {
  nodes: NodeDef[];
  worlds: World[];
  /** pseudo-weight of the prior when mixing with worlds (≈ one virtual world) */
  alpha: number;
}

export function normalizeWeights(worlds: World[]): World[] {
  const total = worlds.reduce((s, w) => s + w.weight, 0);
  if (total <= 0) return worlds.map((w) => ({ ...w, weight: worlds.length ? 1 / worlds.length : 0 }));
  return worlds.map((w) => ({ ...w, weight: w.weight / total }));
}

/**
 * Node lookup index, memoized on the nodes array identity. Belief objects are cheaply re-created
 * (`{...b, worlds}`) during value-of-information search while `nodes` stays identical, so this turns the
 * hot path from O(N) scans into O(1) lookups — it matters once lookahead multiplies the number of calls.
 */
const NODE_INDEX = new WeakMap<NodeDef[], Map<string, NodeDef>>();
export function nodeIndex(nodes: NodeDef[]): Map<string, NodeDef> {
  let idx = NODE_INDEX.get(nodes);
  if (!idx) {
    idx = new Map(nodes.map((n) => [n.id, n]));
    NODE_INDEX.set(nodes, idx);
  }
  return idx;
}

export function nodeById(b: Belief, id: string): NodeDef | undefined {
  return nodeIndex(b.nodes).get(id);
}

/** P(node = option) mixing weighted worlds with the node prior (alpha pseudo-weight). */
export function distribution(b: Belief, nodeId: string): Record<string, number> {
  const node = nodeById(b, nodeId);
  if (!node) return {};
  const counts: Record<string, number> = {};
  for (const o of node.options) counts[o.id] = 0;
  let W = 0;
  for (const w of b.worlds) {
    const a = w.assignment[nodeId];
    if (a === undefined || counts[a] === undefined) continue;
    counts[a] += w.weight;
    W += w.weight;
  }
  const out: Record<string, number> = {};
  const denom = W + b.alpha;
  for (const o of node.options) out[o.id] = denom > 0 ? (counts[o.id]! + b.alpha * (node.prior[o.id] ?? 0)) / denom : node.prior[o.id] ?? 1 / node.options.length;
  // guard: if denom is 0 (no worlds, alpha 0) fall back to prior
  return out;
}

export function maxOption(dist: Record<string, number>): { option: string; p: number } {
  let best = { option: "", p: -1 };
  for (const [k, v] of Object.entries(dist)) if (v > best.p) best = { option: k, p: v };
  return best;
}

export function topOptions(dist: Record<string, number>, n = 2): { option: string; p: number }[] {
  return Object.entries(dist)
    .map(([option, p]) => ({ option, p }))
    .sort((a, b) => b.p - a.p)
    .slice(0, n);
}

/** Observed answer: soft reweight (worlds disagreeing keep epsilon of their weight — samples are noisy). */
export function conditionSoft(worlds: World[], nodeId: string, optionId: string, epsilon: number): World[] {
  return normalizeWeights(
    worlds.map((w) => {
      const a = w.assignment[nodeId];
      const agree = a === undefined ? true : a === optionId;
      return { ...w, weight: w.weight * (agree ? 1 : epsilon) };
    }),
  );
}

/** Hypothetical conditioning for value-of-information: keep only agreeing worlds. */
export function conditionHard(worlds: World[], nodeId: string, optionId: string): World[] {
  const kept = worlds.filter((w) => w.assignment[nodeId] === undefined || w.assignment[nodeId] === optionId);
  return normalizeWeights(kept);
}

/** Effective sample size (1 / Σ w²) — when low, resample worlds. */
export function ess(worlds: World[]): number {
  const s = worlds.reduce((acc, w) => acc + w.weight * w.weight, 0);
  return s > 0 ? 1 / s : 0;
}

/** Make an LLM-proposed assignment complete and consistent: fill gaps with prior argmax, apply hard edges. */
export function repairAssignment(
  assignment: Record<string, string>,
  nodes: NodeDef[],
): { assignment: Record<string, string>; repaired: string[]; conflicts: string[] } {
  const repaired: string[] = [];
  const cleaned: Record<string, string> = {};
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const [k, v] of Object.entries(assignment)) {
    const n = byId.get(k);
    if (!n) continue; // unknown node: drop
    const opt = n.options.find((o) => o.id === v) ?? n.options.find((o) => o.label.toLowerCase() === String(v).toLowerCase());
    if (opt) cleaned[k] = opt.id;
    else repaired.push(`${k}: unknown option ${v}`);
  }
  const prop = propagateHard(cleaned, nodes);
  const conflicts = prop.conflicts.map((c) => `${c.node}: have ${c.have}, ${c.because} wants ${c.want}`);
  const out = { ...prop.assignment };
  for (const n of nodes) {
    if (out[n.id] === undefined) {
      const best = Object.entries(n.prior).sort((a, b) => b[1] - a[1])[0];
      out[n.id] = best ? best[0] : n.options[0]!.id;
      repaired.push(`${n.id}: filled from prior`);
    }
  }
  return { assignment: out, repaired, conflicts };
}

export function makeWorld(id: string, assignment: Record<string, string>, weight: number, origin: World["origin"]): World {
  return { id, assignment, weight, origin };
}
