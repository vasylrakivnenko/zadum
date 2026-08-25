/**
 * Spread, not just means.
 *
 * At n=2 the ruler reported a bare mean, and a mean of 0.10 and 0.35 reads exactly like two runs of 0.225.
 * Every headline number now travels with the min/max/sample-stdev of the per-repeat values that produced it,
 * in the table AND in the results JSON, so nobody can quote a mean whose spread swamps the effect it claims.
 *
 * Pure arithmetic over stored per-trial values — re-computable offline from any results file.
 */

export interface Spread {
  /** number of clean trials the summary is over */
  n: number;
  mean: number;
  min: number;
  max: number;
  /** sample standard deviation (n-1); 0 when n < 2, where spread is undefined rather than zero */
  sd: number;
  /** the per-repeat values themselves, in trial order — small, and the only honest audit trail */
  values: number[];
}

export function spread(xs: number[]): Spread {
  if (xs.length === 0) return { n: 0, mean: 0, min: 0, max: 0, sd: 0, values: [] };
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = xs.length < 2 ? 0 : Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / (xs.length - 1));
  return { n: xs.length, mean, min: Math.min(...xs), max: Math.max(...xs), sd, values: [...xs] };
}

/** "0.08 [0.05–0.12] ±0.03" — mean, observed range, sample stdev. "—" when there is nothing to report. */
export function formatSpread(s: Spread, digits = 2): string {
  if (s.n === 0) return "—";
  if (s.n === 1) return `${s.mean.toFixed(digits)} (n=1)`;
  return `${s.mean.toFixed(digits)} [${s.min.toFixed(digits)}–${s.max.toFixed(digits)}] ±${s.sd.toFixed(digits)}`;
}
