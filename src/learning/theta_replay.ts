/**
 * Loop B — θ replay (docs/LEARNING.md: "replay logged sessions counterfactually ... choose the setting minimizing
 * cards + λ·overrides").
 *
 * Every `card_shown` logs `value1` (the one-step value θ is compared against, ADR-016) in dealing order. Under a
 * counterfactual θ the session would have stopped before the first card with value1 < θ, so the asked set is a
 * prefix of what was logged. From that prefix we estimate two costs per θ:
 *   - mean_cards: questions the user would have been asked;
 *   - overrides_avoided_rate: share of the session's `default_overridden` events whose node lies in the
 *     asked prefix (the user would have answered instead of correcting). This is only informative when the
 *     logged session asked *more* than θ would (harness runs at budget, or a lower production θ); a real session
 *     at θ* logs only its own prefix, so for θ ≥ θ* the rate is 0 by construction;
 *   - mean_wrong_defaults: cards that WERE asked but θ would have cut, where the user's answer differed from the
 *     belief argmax logged in `card_shown.dist` — i.e. decisions that would have been defaulted wrong (and likely
 *     overridden). This is the cost of raising θ and is informative on real sessions.
 * Deliberately independent of `src/harness` (which has its own `cardsUnderTheta` over harness metrics).
 * Only `replayTheta` does IO.
 */
import type { Store } from "../store/store.js";
import type { ZEvent } from "../core/session.js";

export interface SessionTrace {
  project_id: string;
  /** value1 per shown card, in dealing order */
  card_value1: number[];
  /** node per shown card, in dealing order */
  card_nodes: string[];
  /** per shown card: did the user's effective answer differ from the belief argmax? (undefined if no option answer) */
  card_wrong: (boolean | undefined)[];
  /** nodes the user corrected in the defaults review */
  overridden_nodes: string[];
}

export interface ThetaPoint {
  theta: number;
  sessions: number;
  mean_cards: number;
  overrides_avoided_rate: number;
  mean_wrong_defaults: number;
}

function argmax(dist: Record<string, number>): string | undefined {
  let best: { k: string; p: number } | undefined;
  for (const [k, p] of Object.entries(dist)) if (!best || p > best.p) best = { k, p };
  return best?.k;
}

/** Build the replay trace of one project from its events. Pure. Returns null when no card was shown. */
export function traceFromEvents(projectId: string, events: ZEvent[]): SessionTrace | null {
  const cards: { id: string; node: string; value1: number; argmax: string | undefined }[] = [];
  const answer = new Map<string, string | undefined>();
  const overridden: string[] = [];
  for (const e of events) {
    if (e.type === "card_shown") {
      const id = typeof e.payload.card_id === "string" ? e.payload.card_id : `#${cards.length}`;
      const node = typeof e.payload.node === "string" ? e.payload.node : "";
      const value1 = typeof e.payload.value1 === "number" ? e.payload.value1 : 0;
      if (!node) continue;
      cards.push({ id, node, value1, argmax: argmax((e.payload.dist ?? {}) as Record<string, number>) });
    } else if (e.type === "card_answered") {
      const id = typeof e.payload.card_id === "string" ? e.payload.card_id : undefined;
      if (!id) continue;
      if (e.payload.kind === "option" && typeof e.payload.option === "string") answer.set(id, e.payload.option);
      else answer.set(id, undefined); // undo / you_decide / skip / other
    } else if (e.type === "default_overridden") {
      if (typeof e.payload.node === "string") overridden.push(e.payload.node);
    }
  }
  if (!cards.length) return null;
  return {
    project_id: projectId,
    card_value1: cards.map((c) => c.value1),
    card_nodes: cards.map((c) => c.node),
    card_wrong: cards.map((c) => {
      const a = answer.get(c.id);
      return a === undefined || c.argmax === undefined ? undefined : a !== c.argmax;
    }),
    overridden_nodes: overridden,
  };
}

/** Cards a session would have asked under θ: stop before the first card whose value1 < θ. */
export function cardsUnderTheta(value1: number[], theta: number): number {
  const i = value1.findIndex((v) => v < theta);
  return i < 0 ? value1.length : i;
}

/** The replay table over traces. Pure. */
export function thetaTable(traces: SessionTrace[], thetas: number[]): ThetaPoint[] {
  const totalOverrides = traces.reduce((s, t) => s + t.overridden_nodes.length, 0);
  return thetas.map((theta) => {
    let cards = 0;
    let avoided = 0;
    let wrong = 0;
    for (const t of traces) {
      const k = cardsUnderTheta(t.card_value1, theta);
      cards += k;
      const asked = new Set(t.card_nodes.slice(0, k));
      avoided += t.overridden_nodes.filter((n) => asked.has(n)).length;
      for (let i = k; i < t.card_wrong.length; i++) if (t.card_wrong[i]) wrong += 1;
    }
    const n = traces.length || 1;
    return { theta, sessions: traces.length, mean_cards: cards / n, overrides_avoided_rate: totalOverrides ? avoided / totalOverrides : 0, mean_wrong_defaults: wrong / n };
  });
}

/** A θ grid spanning the observed value1 range (plus 0 = "ask everything logged"). */
export function thetaGrid(traces: SessionTrace[], steps = 10): number[] {
  const vals = traces.flatMap((t) => t.card_value1).filter((v) => v > 0);
  if (!vals.length) return [0];
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const out = new Set<number>([0]);
  for (let i = 0; i <= steps; i++) out.add(Math.round((lo + ((hi - lo) * i) / steps) * 1000) / 1000);
  return [...out].sort((a, b) => a - b);
}

/** IO: replay every project that showed at least one card. */
export async function replayTheta(store: Store, thetas: number[], projectIds?: string[]): Promise<ThetaPoint[]> {
  const traces = await collectTraces(store, projectIds);
  return thetaTable(traces, thetas);
}

export async function collectTraces(store: Store, projectIds?: string[]): Promise<SessionTrace[]> {
  const ids = projectIds ?? (await store.listProjects()).map((p) => p.id).sort();
  const traces: SessionTrace[] = [];
  for (const id of ids) {
    const t = traceFromEvents(id, await store.listEvents(id));
    if (t) traces.push(t);
  }
  return traces;
}

export function formatThetaTable(points: ThetaPoint[]): string {
  const L: string[] = [];
  L.push(`THETA REPLAY over ${points[0]?.sessions ?? 0} session(s) with cards`);
  L.push(`  ${"θ".padStart(8)} ${"cards".padStart(6)} ${"ovr avoided".padStart(12)} ${"wrong dflts".padStart(12)}`);
  for (const p of points) L.push(`  ${p.theta.toFixed(3).padStart(8)} ${p.mean_cards.toFixed(1).padStart(6)} ${`${(p.overrides_avoided_rate * 100).toFixed(0)}%`.padStart(12)} ${p.mean_wrong_defaults.toFixed(2).padStart(12)}`);
  return L.join("\n");
}
