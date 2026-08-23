/**
 * Thoroughness — one user-facing dial across the several knobs that trade "fewer taps, faster answer" against
 * "settle more before compiling". Considered alongside the rule bank and multi-option cards during the
 * 2026-08-23 autonomous improvement pass; built as the smaller, lower-urgency third item (see docs/STATUS.md
 * "Autonomous overnight pass").
 *
 * Deliberately a data table + a pure resolver, not a new concept baked into `SelectorConfig`/`CompileOptions`
 * themselves — those stay presentation-agnostic; a caller (CLI, web API) picks a level and asks this module for
 * the concrete overrides, the same way `resolveConfig` lets an explicit value win over a computed default.
 */
import type { Scoring } from "./selector.js";
import { DEFAULT_THETA } from "./selector.js";

export const THOROUGHNESS_LEVELS = ["quick", "standard", "thorough"] as const;
export type Thoroughness = (typeof THOROUGHNESS_LEVELS)[number];

export interface ThoroughnessPreset {
  /** multiplies the scoring's calibrated DEFAULT_THETA — >1 stops sooner (higher bar per question), <1 keeps asking longer */
  thetaMultiplier: number;
  maxCards: number;
  /** best-of-N candidates per compiled section */
  compileCandidates: number;
  /** critic repair passes after a failing verdict */
  criticLoops: number;
}

/**
 * quick: a rough draft fast — fewer, higher-bar questions, single-pass compile.
 * standard: today's shipped defaults (θ×1, maxCards 12, single-candidate compile) — unchanged behavior.
 * thorough: settle more before compiling, and let the compiler try harder — for higher-stakes projects.
 */
export const THOROUGHNESS_PRESETS: Record<Thoroughness, ThoroughnessPreset> = {
  quick: { thetaMultiplier: 1.4, maxCards: 6, compileCandidates: 1, criticLoops: 1 },
  standard: { thetaMultiplier: 1, maxCards: 12, compileCandidates: 1, criticLoops: 1 },
  thorough: { thetaMultiplier: 0.55, maxCards: 20, compileCandidates: 3, criticLoops: 2 },
};

/**
 * Calibration status (be honest, matching DEFAULT_THETA's own comment): these multipliers are a first-pass
 * heuristic, NOT live-calibrated. A mock smoke test on `demo` showed "quick" can legitimately stop at 0 extra
 * cards after a decisive correction-moment edit already left the belief >80% settled — verified via a direct
 * probe that "quick" DOES ask several real cards on a less-resolved belief (top value1 ~94 vs quick's ~34
 * threshold pre-edit), so this is working as intended rather than degenerate, but the exact multipliers should
 * get the same harness-replay treatment `DEFAULT_THETA` got (docs/EVALS.md "Calibrating θ") before trusting
 * their precise behavior across archetypes.
 */

export function isThoroughness(v: string): v is Thoroughness {
  return (THOROUGHNESS_LEVELS as readonly string[]).includes(v);
}

/**
 * Selector-side overrides for one thoroughness level. `explicitTheta`, if given (e.g. the user also passed
 * `--theta`), wins outright — thoroughness only fills in a default, exactly like `resolveConfig`'s own rule
 * that an explicit theta beats a computed one.
 */
export function thoroughnessSelectorOverrides(level: Thoroughness, scoring: Scoring, explicitTheta?: number): { theta: number; maxCards: number } {
  const preset = THOROUGHNESS_PRESETS[level];
  return { theta: explicitTheta ?? DEFAULT_THETA[scoring] * preset.thetaMultiplier, maxCards: preset.maxCards };
}

/** Compile-side overrides for one thoroughness level. Explicit `--candidates`/criticLoops passed by the caller should still win — same pattern. */
export function thoroughnessCompileOverrides(level: Thoroughness): { candidates: number; criticLoops: number } {
  const preset = THOROUGHNESS_PRESETS[level];
  return { candidates: preset.compileCandidates, criticLoops: preset.criticLoops };
}
