/**
 * Loop B — calibration monitor (docs/LEARNING.md: "when `confidence` says 90%, is the eventual answer/override
 * consistent 90% of the time?").
 *
 * Two kinds of predictions are scored:
 *   - cards: every `card_shown` logs the belief `dist`/`maxP` for the node; the subsequent `card_answered`
 *     (same card_id, kind=option, not undone) reveals whether the argmax was right. Confidence = maxP.
 *   - defaults: a decision the engine defaulted at some `confidence` that the user then corrected
 *     (`default_overridden.before.confidence`) was wrong (outcome 0). Defaults that survived an explicit
 *     `defaults_accepted` review are scored as right (outcome 1) — optimistic, since "accepted" may mean
 *     "not looked at"; the `overrides` table isolates the wrong ones so the reader can see both views.
 * Reliability bins on the confidence axis; Brier is the binary score on the argmax, (confidence − outcome)².
 * ECE = Σ_b (n_b/N)·|acc_b − conf_b|. Only `calibrationReport` does IO.
 */
import type { Store } from "../store/store.js";
import type { ZEvent } from "../core/session.js";
import type { Sheet } from "../core/sheet.js";

export interface CalSample {
  project_id: string;
  node: string;
  confidence: number; // predicted P(argmax)
  correct: boolean; // outcome
}

export interface CalBin {
  bin: string;
  lo: number;
  hi: number;
  n: number;
  mean_confidence: number;
  accuracy: number;
  brier: number;
}

export interface CalTable {
  n: number;
  bins: CalBin[];
  ece: number;
  brier: number;
}

export interface CalibrationReport {
  projects: number;
  cards: CalTable;
  overrides: CalTable;
  defaults: CalTable;
}

/** Bin edges: a catch-all below 0.5 (possible with ≥3 options) and five 0.1-wide bins up to 1.0 inclusive. */
export const BIN_EDGES: [number, number][] = [
  [0, 0.5],
  [0.5, 0.6],
  [0.6, 0.7],
  [0.7, 0.8],
  [0.8, 0.9],
  [0.9, 1.0],
];

function binIndex(c: number): number {
  if (c >= 1) return BIN_EDGES.length - 1;
  const i = BIN_EDGES.findIndex(([lo, hi]) => c >= lo && c < hi);
  return i < 0 ? 0 : i;
}

function argmax(dist: Record<string, number>): string | undefined {
  let best: { k: string; p: number } | undefined;
  for (const [k, p] of Object.entries(dist)) if (!best || p > best.p) best = { k, p };
  return best?.k;
}

function num(x: unknown): number | undefined {
  return typeof x === "number" && Number.isFinite(x) ? x : undefined;
}

/** Card predictions vs. effective answers for one project. Pure. */
export function cardSamples(projectId: string, events: ZEvent[]): CalSample[] {
  const shown = new Map<string, { node: string; confidence: number; argmax: string | undefined }>();
  const answer = new Map<string, string | undefined>(); // card_id → effective option (undefined after undo)
  const order: string[] = [];
  for (const e of events) {
    const cardId = typeof e.payload.card_id === "string" ? e.payload.card_id : undefined;
    if (!cardId) continue;
    if (e.type === "card_shown") {
      const node = typeof e.payload.node === "string" ? e.payload.node : undefined;
      const dist = (e.payload.dist ?? {}) as Record<string, number>;
      const maxP = num(e.payload.maxP) ?? Math.max(0, ...Object.values(dist));
      if (!node) continue;
      if (!shown.has(cardId)) order.push(cardId);
      shown.set(cardId, { node, confidence: maxP, argmax: argmax(dist) });
    } else if (e.type === "card_answered") {
      if (e.payload.kind === "undo") answer.set(cardId, undefined);
      else if (e.payload.kind === "option" && typeof e.payload.option === "string") answer.set(cardId, e.payload.option);
      else answer.set(cardId, undefined); // you_decide / skip / other reveal no ground truth
    }
  }
  const out: CalSample[] = [];
  for (const cardId of order) {
    const s = shown.get(cardId)!;
    const a = answer.get(cardId);
    if (a === undefined || s.argmax === undefined) continue;
    out.push({ project_id: projectId, node: s.node, confidence: s.confidence, correct: a === s.argmax });
  }
  return out;
}

/** Overridden defaults (outcome: wrong) for one project. Pure. */
export function overrideSamples(projectId: string, events: ZEvent[]): CalSample[] {
  const out: CalSample[] = [];
  for (const e of events) {
    if (e.type !== "default_overridden") continue;
    const node = typeof e.payload.node === "string" ? e.payload.node : undefined;
    const before = (e.payload.before ?? {}) as { confidence?: unknown };
    const c = num(before.confidence);
    if (!node || c === undefined) continue;
    out.push({ project_id: projectId, node, confidence: c, correct: false });
  }
  return out;
}

/**
 * Overridden (wrong) + kept (right, only if the user completed the defaults review) defaults for one project.
 * Without a `defaults_accepted` event the kept ones are unknown and only the overrides are returned.
 */
export function defaultSamples(projectId: string, events: ZEvent[], finalSheet: Sheet | null): CalSample[] {
  const wrong = overrideSamples(projectId, events);
  const reviewed = events.some((e) => e.type === "defaults_accepted");
  if (!reviewed || !finalSheet) return wrong;
  const overridden = new Set(wrong.map((s) => s.node));
  const kept: CalSample[] = [];
  for (const d of finalSheet.decisions) {
    if (d.status !== "defaulted" || overridden.has(d.id) || d.confidence === undefined) continue;
    kept.push({ project_id: projectId, node: d.id, confidence: d.confidence, correct: true });
  }
  return [...wrong, ...kept];
}

/** Reliability bins + ECE + Brier over samples. Pure. */
export function calTable(samples: CalSample[]): CalTable {
  const acc: { n: number; conf: number; hits: number; brier: number }[] = BIN_EDGES.map(() => ({ n: 0, conf: 0, hits: 0, brier: 0 }));
  let brierTotal = 0;
  for (const s of samples) {
    const b = acc[binIndex(s.confidence)]!;
    const y = s.correct ? 1 : 0;
    b.n += 1;
    b.conf += s.confidence;
    b.hits += y;
    const sq = (s.confidence - y) ** 2;
    b.brier += sq;
    brierTotal += sq;
  }
  const N = samples.length;
  let ece = 0;
  const bins: CalBin[] = BIN_EDGES.map(([lo, hi], i) => {
    const b = acc[i]!;
    const mean_confidence = b.n ? b.conf / b.n : 0;
    const accuracy = b.n ? b.hits / b.n : 0;
    if (b.n) ece += (b.n / N) * Math.abs(accuracy - mean_confidence);
    return { bin: `${lo.toFixed(1)}–${hi.toFixed(1)}`, lo, hi, n: b.n, mean_confidence, accuracy, brier: b.n ? b.brier / b.n : 0 };
  });
  return { n: N, bins, ece, brier: N ? brierTotal / N : 0 };
}

/** IO: the report over every project in the store. */
export async function calibrationReport(store: Store, projectIds?: string[]): Promise<CalibrationReport> {
  const ids = projectIds ?? (await store.listProjects()).map((p) => p.id).sort();
  const cards: CalSample[] = [];
  const overrides: CalSample[] = [];
  const defaults: CalSample[] = [];
  for (const id of ids) {
    const [events, sheet] = await Promise.all([store.listEvents(id), store.getLatestSheet(id)]);
    cards.push(...cardSamples(id, events));
    overrides.push(...overrideSamples(id, events));
    defaults.push(...defaultSamples(id, events, sheet));
  }
  return { projects: ids.length, cards: calTable(cards), overrides: calTable(overrides), defaults: calTable(defaults) };
}

function pc(x: number): string {
  return `${(x * 100).toFixed(0)}%`;
}

export function formatCalTable(title: string, t: CalTable): string {
  const L: string[] = [];
  L.push(`${title} (n=${t.n} · ECE ${t.ece.toFixed(3)} · Brier ${t.brier.toFixed(3)})`);
  L.push(`  ${"confidence".padEnd(12)} ${"n".padStart(5)} ${"pred".padStart(6)} ${"observed".padStart(9)} ${"brier".padStart(6)}`);
  for (const b of t.bins) {
    if (!b.n) continue;
    L.push(`  ${b.bin.padEnd(12)} ${String(b.n).padStart(5)} ${pc(b.mean_confidence).padStart(6)} ${pc(b.accuracy).padStart(9)} ${b.brier.toFixed(3).padStart(6)}`);
  }
  if (!t.n) L.push("  (no samples)");
  return L.join("\n");
}

export function formatCalibration(r: CalibrationReport): string {
  return [
    `CALIBRATION over ${r.projects} project(s)`,
    formatCalTable("cards: belief argmax vs. user's answer", r.cards),
    formatCalTable("overrides: defaults the user corrected (observed is 0 by construction; read the confidence spread)", r.overrides),
    formatCalTable("defaults: corrected (wrong) + kept after review (right)", r.defaults),
  ].join("\n");
}
