/**
 * Loop B — belief recalibration (docs/LEARNING.md; EVALS "Decision-sensitive probes" punchline).
 *
 * The calibration monitor shows the belief is overconcentrated (e.g. the 0.6–0.7 confidence band observed at
 * ~29–40% accuracy on mock harness runs). This module fits a monotone reliability map
 * confidence → observed accuracy from logged CalSamples:
 *
 *   1. pool samples into the existing BIN_EDGES reliability bins (observed accuracy per bin),
 *   2. enforce monotonicity with PAV (pool-adjacent-violators, the standard isotonic regression) weighted by
 *      bin counts — a lower-confidence bin is never mapped ABOVE a higher-confidence one,
 *   3. interpolate linearly between the midpoints of non-empty bins (clamped flat outside the fitted range,
 *      so the map is continuous everywhere).
 *
 * Identity fallback (documented threshold): with fewer than MIN_RECAL_SAMPLES total samples, or fewer than two
 * non-empty bins, there is not enough signal to trust a fitted map over the raw confidence — `map` is the
 * identity and `serialized.identity` is true. MIN_RECAL_SAMPLES = 30 ≈ 5 per bin over the 6 bins; below that a
 * single session's defaults would dominate the fit.
 *
 * The serialized form (plain JSON, `SerializedRecalibration`) is what the engine will later load behind a flag
 * (harness-gated, per CLAUDE.md); `mapFromSerialized` rebuilds the exact map from it. Everything here is pure.
 */
import path from "node:path";
import fs from "node:fs/promises";
import { BIN_EDGES, type CalSample } from "./calibration.js";

/** Below this many total samples the fitted map is not trusted and identity is returned. */
export const MIN_RECAL_SAMPLES = 30;

export interface RecalBin {
  lo: number;
  hi: number;
  /** observed accuracy in the bin (0 when the bin is empty) */
  raw: number;
  /** what the final map returns at the bin midpoint (= the PAV fit for non-empty bins) */
  calibrated: number;
  n: number;
}

export interface SerializedRecalibration {
  version: 1;
  total_n: number;
  min_n: number;
  identity: boolean;
  bins: RecalBin[];
  /** interpolation knots: x = midpoint of a non-empty bin, y = its PAV-calibrated accuracy (empty when identity) */
  knots: { x: number; y: number }[];
}

export interface Recalibration {
  bins: RecalBin[];
  map: (p: number) => number;
  serialized: SerializedRecalibration;
}

/**
 * Pool-adjacent-violators: weighted isotonic (non-decreasing) regression on a sequence.
 * Whenever a value is smaller than its predecessor, the two blocks are pooled to their weighted mean, cascading
 * left until the sequence is monotone. Returns the fitted value at each input position.
 */
export function pav(y: number[], w: number[]): number[] {
  if (y.length !== w.length) throw new Error("pav: y and w must have equal length");
  const blocks: { y: number; w: number; count: number }[] = [];
  for (let i = 0; i < y.length; i++) {
    blocks.push({ y: y[i]!, w: w[i]!, count: 1 });
    while (blocks.length > 1 && blocks[blocks.length - 2]!.y > blocks[blocks.length - 1]!.y + 1e-12) {
      const b = blocks.pop()!;
      const a = blocks.pop()!;
      const W = a.w + b.w;
      // zero-weight blocks pool by position count so the merge is still well-defined
      const mean = W > 0 ? (a.y * a.w + b.y * b.w) / W : (a.y * a.count + b.y * b.count) / (a.count + b.count);
      blocks.push({ y: mean, w: W, count: a.count + b.count });
    }
  }
  const out: number[] = [];
  for (const b of blocks) for (let i = 0; i < b.count; i++) out.push(b.y);
  return out;
}

function interpolator(knots: { x: number; y: number }[]): (p: number) => number {
  if (knots.length === 0) return (p) => p;
  if (knots.length === 1) return () => knots[0]!.y;
  return (p: number) => {
    if (p <= knots[0]!.x) return knots[0]!.y;
    if (p >= knots[knots.length - 1]!.x) return knots[knots.length - 1]!.y;
    for (let i = 1; i < knots.length; i++) {
      const a = knots[i - 1]!;
      const b = knots[i]!;
      if (p <= b.x) return b.x === a.x ? b.y : a.y + ((p - a.x) / (b.x - a.x)) * (b.y - a.y);
    }
    return knots[knots.length - 1]!.y; // unreachable
  };
}

/** Rebuild the reliability map from its serialized form (what the engine will load). */
export function mapFromSerialized(s: SerializedRecalibration): (p: number) => number {
  return s.identity ? (p) => p : interpolator(s.knots);
}

export function fitRecalibration(samples: CalSample[], opts: { minN?: number } = {}): Recalibration {
  const minN = opts.minN ?? MIN_RECAL_SAMPLES;
  const acc = BIN_EDGES.map(() => ({ n: 0, hits: 0 }));
  for (const s of samples) {
    const i = s.confidence >= 1 ? BIN_EDGES.length - 1 : Math.max(0, BIN_EDGES.findIndex(([lo, hi]) => s.confidence >= lo && s.confidence < hi));
    const b = acc[i]!;
    b.n += 1;
    if (s.correct) b.hits += 1;
  }
  const raw = acc.map((b) => (b.n ? b.hits / b.n : 0));
  const nonEmpty = acc.map((b, i) => i).filter((i) => acc[i]!.n > 0);
  const identity = samples.length < minN || nonEmpty.length < 2;
  let knots: { x: number; y: number }[] = [];
  if (!identity) {
    const fitted = pav(nonEmpty.map((i) => raw[i]!), nonEmpty.map((i) => acc[i]!.n));
    knots = nonEmpty.map((i, k) => ({ x: (BIN_EDGES[i]![0] + BIN_EDGES[i]![1]) / 2, y: fitted[k]! }));
  }
  const map = identity ? (p: number) => p : interpolator(knots);
  const bins: RecalBin[] = BIN_EDGES.map(([lo, hi], i) => ({ lo, hi, raw: raw[i]!, calibrated: map((lo + hi) / 2), n: acc[i]!.n }));
  const serialized: SerializedRecalibration = { version: 1, total_n: samples.length, min_n: minN, identity, bins, knots };
  return { bins, map, serialized };
}

function pc(x: number): string {
  return `${(x * 100).toFixed(0)}%`;
}

export function formatRecalibration(r: Recalibration): string {
  const s = r.serialized;
  const L: string[] = [];
  L.push(`RECALIBRATION — isotonic reliability map, confidence → observed accuracy (n=${s.total_n}${s.identity ? ` · IDENTITY: ${s.total_n < s.min_n ? `fewer than ${s.min_n} samples` : "fewer than 2 non-empty bins"}` : ""})`);
  L.push(`  ${"confidence".padEnd(12)} ${"n".padStart(5)} ${"raw".padStart(6)} ${"calibrated".padStart(11)}`);
  for (const b of s.bins) {
    if (!b.n) continue;
    L.push(`  ${`${b.lo.toFixed(1)}–${b.hi.toFixed(1)}`.padEnd(12)} ${String(b.n).padStart(5)} ${pc(b.raw).padStart(6)} ${pc(b.calibrated).padStart(11)}`);
  }
  if (!s.total_n) L.push("  (no samples)");
  return L.join("\n");
}

/** Write the serialized map where the engine can later load it (`<dir>/recalibration.json`). Returns the path. */
export async function writeRecalibration(r: Recalibration, dir: string): Promise<string> {
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, "recalibration.json");
  await fs.writeFile(file, JSON.stringify(r.serialized, null, 2));
  return file;
}
