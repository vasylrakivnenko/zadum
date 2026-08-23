/**
 * Loop B — card phrasing bandit (docs/LEARNING.md: "arms per node (`phrasing_arm` on Card), Thompson sampling;
 * reward = answered without undo/other/skip, think_ms under threshold").
 *
 * Beta–Bernoulli posterior per (node, arm). Rewards are derived from logged events; the arm of a card is not in
 * the event payload (it lives on `Card.phrasing_arm` in the session), so `rewardFromEvents` takes an `armOf`
 * lookup and assumes "default" when absent. Reward rules:
 *   1 — answered with kind=option, never undone, think_ms under the threshold (missing think_ms counts as fast:
 *       the CLI may not measure it, and a missing value is not evidence of confusion);
 *   0 — kind=other/skip (the phrasing did not let the user pick), or the card was undone (any later re-answer is
 *       ignored: the confusion already happened), or the answer was slow;
 *   no sample — you_decide (the user delegated; says nothing about phrasing) or a card never answered.
 * Everything is pure; `choose` takes an injectable uniform rng so tests are deterministic.
 */
import type { ZEvent } from "../core/session.js";

export interface ArmPosterior {
  alpha: number;
  beta: number;
}
export type BanditState = Record<string, Record<string, ArmPosterior>>;

export const DEFAULT_ARM = "default";
export const DEFAULT_THINK_THRESHOLD_MS = 15000;

export interface RewardSample {
  node: string;
  arm: string;
  card_id: string;
  reward: 0 | 1;
}

export function rewardFromEvents(events: ZEvent[], opts: { armOf?: (cardId: string, node: string) => string | undefined; thinkThresholdMs?: number } = {}): RewardSample[] {
  const threshold = opts.thinkThresholdMs ?? DEFAULT_THINK_THRESHOLD_MS;
  const cards = new Map<string, { node: string; reward?: 0 | 1; undone: boolean }>();
  const order: string[] = [];
  for (const e of events) {
    const cardId = typeof e.payload.card_id === "string" ? e.payload.card_id : undefined;
    if (!cardId) continue;
    if (e.type === "card_shown") {
      const node = typeof e.payload.node === "string" ? e.payload.node : undefined;
      if (!node || cards.has(cardId)) continue;
      cards.set(cardId, { node, undone: false });
      order.push(cardId);
    } else if (e.type === "card_answered") {
      const c = cards.get(cardId);
      if (!c) continue;
      const kind = e.payload.kind;
      if (kind === "undo") {
        c.undone = true;
        c.reward = 0;
      } else if (c.undone) {
        continue; // re-answer after undo: the 0 stands
      } else if (kind === "option") {
        const think = typeof e.payload.think_ms === "number" ? e.payload.think_ms : undefined;
        c.reward = think === undefined || think < threshold ? 1 : 0;
      } else if (kind === "other" || kind === "skip") {
        c.reward = 0;
      } // you_decide: no sample
    }
  }
  const out: RewardSample[] = [];
  for (const id of order) {
    const c = cards.get(id)!;
    if (c.reward === undefined) continue;
    out.push({ node: c.node, arm: opts.armOf?.(id, c.node) ?? DEFAULT_ARM, card_id: id, reward: c.reward });
  }
  return out;
}

/** Posterior update, returning a new state (the input is not mutated). Beta(1,1) prior on first sight. */
export function update(state: BanditState, nodeId: string, armId: string, reward: 0 | 1): BanditState {
  const prev = state[nodeId]?.[armId] ?? { alpha: 1, beta: 1 };
  return { ...state, [nodeId]: { ...(state[nodeId] ?? {}), [armId]: { alpha: prev.alpha + reward, beta: prev.beta + (1 - reward) } } };
}

export function updateAll(state: BanditState, samples: RewardSample[]): BanditState {
  return samples.reduce((s, r) => update(s, r.node, r.arm, r.reward), state);
}

/** Thompson sampling: draw θ_arm ~ Beta(α,β) for each arm and pick the max; unseen arms use Beta(1,1). */
export function choose(state: BanditState, nodeId: string, arms: string[], rng: () => number): string {
  if (!arms.length) return DEFAULT_ARM;
  let best = { arm: arms[0]!, draw: -1 };
  for (const arm of arms) {
    const p = state[nodeId]?.[arm] ?? { alpha: 1, beta: 1 };
    const draw = sampleBeta(p.alpha, p.beta, rng);
    if (draw > best.draw) best = { arm, draw };
  }
  return best.arm;
}

/** Posterior mean per arm, for reports and for a greedy fallback. */
export function armMeans(state: BanditState, nodeId: string): Record<string, { mean: number; n: number }> {
  const out: Record<string, { mean: number; n: number }> = {};
  for (const [arm, p] of Object.entries(state[nodeId] ?? {})) out[arm] = { mean: p.alpha / (p.alpha + p.beta), n: p.alpha + p.beta - 2 };
  return out;
}

// ---------- sampling from an injectable uniform rng ----------

/** Beta(a,b) via two Gamma draws (Marsaglia–Tsang), using only `rng()` uniforms so results are reproducible. */
export function sampleBeta(a: number, b: number, rng: () => number): number {
  const x = sampleGamma(a, rng);
  const y = sampleGamma(b, rng);
  return x + y > 0 ? x / (x + y) : 0.5;
}

function sampleGamma(shape: number, rng: () => number): number {
  if (shape < 1) {
    // boost: Gamma(a) = Gamma(a+1) · U^(1/a)
    const u = Math.max(rng(), Number.EPSILON);
    return sampleGamma(shape + 1, rng) * Math.pow(u, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = normal(rng);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.max(rng(), Number.EPSILON);
    if (u < 1 - 0.0331 * x ** 4) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

function normal(rng: () => number): number {
  const u1 = Math.max(rng(), Number.EPSILON);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Small seeded PRNG (mulberry32) for deterministic tests and replays. */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function formatBandit(state: BanditState, limit = 15): string {
  const L: string[] = [];
  const nodes = Object.keys(state).sort();
  L.push(`PHRASING BANDIT (${nodes.length} node(s) with samples)`);
  L.push(`  ${"node".padEnd(28)} ${"arm".padEnd(12)} ${"n".padStart(4)} ${"mean".padStart(6)}`);
  let shown = 0;
  for (const node of nodes) {
    for (const [arm, m] of Object.entries(armMeans(state, node)).sort((a, b) => b[1].n - a[1].n)) {
      if (shown++ >= limit) break;
      L.push(`  ${node.padEnd(28)} ${arm.padEnd(12)} ${String(m.n).padStart(4)} ${m.mean.toFixed(2).padStart(6)}`);
    }
  }
  if (!nodes.length) L.push("  (no samples)");
  return L.join("\n");
}
