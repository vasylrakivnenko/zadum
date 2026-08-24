import { describe, it, expect } from "vitest";
import type { CalSample } from "./calibration.js";
import { pav, fitRecalibration, mapFromSerialized, MIN_RECAL_SAMPLES } from "./recalibrate.js";

function mk(confidence: number, correct: boolean, n = 1): CalSample[] {
  return Array.from({ length: n }, (_, i) => ({ project_id: "p", node: `n${confidence}_${correct}_${i}`, confidence, correct }));
}

describe("pav (pool-adjacent-violators)", () => {
  it("leaves an already-monotone sequence unchanged", () => {
    expect(pav([0.1, 0.3, 0.5, 0.9], [1, 1, 1, 1])).toEqual([0.1, 0.3, 0.5, 0.9]);
  });

  it("pools a violating adjacent pair to its weighted mean", () => {
    // 0.8 (w2) followed by 0.2 (w1) violates → both become (0.8·2 + 0.2·1)/3 = 0.6
    const out = pav([0.8, 0.2], [2, 1]);
    expect(out[0]).toBeCloseTo(0.6, 10);
    expect(out[1]).toBeCloseTo(0.6, 10);
  });

  it("cascades pooling left through earlier blocks (hand-checked)", () => {
    // classic: [0.5, 0.4, 0.3] equal weights → all pooled to 0.4
    const out = pav([0.5, 0.4, 0.3], [1, 1, 1]);
    for (const v of out) expect(v).toBeCloseTo(0.4, 10);
    // mixed: [0.2, 0.6, 0.5, 0.9] → middle pair pools to 0.55, ends untouched
    const out2 = pav([0.2, 0.6, 0.5, 0.9], [1, 1, 1, 1]);
    expect(out2[0]).toBeCloseTo(0.2, 10);
    expect(out2[1]).toBeCloseTo(0.55, 10);
    expect(out2[2]).toBeCloseTo(0.55, 10);
    expect(out2[3]).toBeCloseTo(0.9, 10);
  });

  it("output is always non-decreasing", () => {
    const y = [0.9, 0.1, 0.8, 0.2, 0.7, 0.3];
    const w = [1, 5, 2, 1, 3, 1];
    const out = pav(y, w);
    for (let i = 1; i < out.length; i++) expect(out[i]!).toBeGreaterThanOrEqual(out[i - 1]! - 1e-12);
    // weighted mean is preserved (isotonic regression is a projection)
    const mean = (v: number[]) => v.reduce((a, x, i) => a + x * w[i]!, 0) / w.reduce((a, b) => a + b, 0);
    expect(mean(out)).toBeCloseTo(mean(y), 10);
  });
});

describe("fitRecalibration", () => {
  // an overconcentrated belief like the harness observes: high confidence, mediocre accuracy
  const samples: CalSample[] = [
    ...mk(0.55, true, 10), ...mk(0.55, false, 10), // 0.5–0.6: 50%
    ...mk(0.65, true, 6), ...mk(0.65, false, 14), // 0.6–0.7: 30% ← violates
    ...mk(0.85, true, 12), ...mk(0.85, false, 8), // 0.8–0.9: 60%
    ...mk(0.95, true, 18), ...mk(0.95, false, 2), // 0.9–1.0: 90%
  ];

  it("pools the violating bin with its neighbour and produces a monotone map", () => {
    const r = fitRecalibration(samples);
    expect(r.serialized.identity).toBe(false);
    // 50% then 30% (equal weight 20 each) pool to 40%
    const b = (lo: number) => r.bins.find((x) => x.lo === lo)!;
    expect(b(0.5).calibrated).toBeCloseTo(0.4, 10);
    expect(b(0.6).calibrated).toBeCloseTo(0.4, 10);
    expect(b(0.8).calibrated).toBeCloseTo(0.6, 10);
    expect(b(0.9).calibrated).toBeCloseTo(0.9, 10);
    // raw stays what was observed
    expect(b(0.6).raw).toBeCloseTo(0.3, 10);
    // map is monotone over a fine grid
    let prev = -1;
    for (let p = 0; p <= 1.0001; p += 0.01) {
      const v = r.map(p);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = v;
    }
  });

  it("interpolates linearly and continuously between bin midpoints, clamping outside", () => {
    const r = fitRecalibration(samples);
    // knots at midpoints: 0.55→0.4, 0.65→0.4, 0.85→0.6, 0.95→0.9
    expect(r.map(0.55)).toBeCloseTo(0.4, 10);
    expect(r.map(0.75)).toBeCloseTo(0.5, 10); // halfway between 0.65 and 0.85 knots
    expect(r.map(0.9)).toBeCloseTo(0.75, 10); // halfway between 0.85 and 0.95 knots
    // clamped flat outside the fitted range
    expect(r.map(0.1)).toBeCloseTo(0.4, 10);
    expect(r.map(1)).toBeCloseTo(0.9, 10);
    // continuity across every knot
    for (const k of r.serialized.knots) {
      expect(r.map(k.x - 1e-9)).toBeCloseTo(r.map(k.x + 1e-9), 6);
      expect(r.map(k.x)).toBeCloseTo(k.y, 10);
    }
  });

  it("falls back to identity when total n is below the threshold", () => {
    const few = [...mk(0.55, false, 5), ...mk(0.95, true, 5)];
    expect(few.length).toBeLessThan(MIN_RECAL_SAMPLES);
    const r = fitRecalibration(few);
    expect(r.serialized.identity).toBe(true);
    for (const p of [0, 0.3, 0.62, 0.95, 1]) expect(r.map(p)).toBe(p);
    // raw is still reported for inspection
    expect(r.bins.find((b) => b.lo === 0.5)!.raw).toBe(0);
  });

  it("falls back to identity with fewer than two non-empty bins, regardless of n", () => {
    const r = fitRecalibration(mk(0.95, true, 100));
    expect(r.serialized.identity).toBe(true);
    expect(r.map(0.4)).toBe(0.4);
  });

  it("serialized form rebuilds the identical map", () => {
    const r = fitRecalibration(samples);
    const rebuilt = mapFromSerialized(JSON.parse(JSON.stringify(r.serialized)));
    for (let p = 0; p <= 1.0001; p += 0.005) expect(rebuilt(p)).toBeCloseTo(r.map(p), 12);
    const id = fitRecalibration(mk(0.95, true, 100));
    const rebuiltId = mapFromSerialized(JSON.parse(JSON.stringify(id.serialized)));
    expect(rebuiltId(0.37)).toBe(0.37);
  });
});
