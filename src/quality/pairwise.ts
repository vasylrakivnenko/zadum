/**
 * Instrument 3 — blind pairwise tournament.
 *
 * One judge call per matchup compares two full spec texts on four dimensions at once. The judge never learns
 * which system produced which spec, and presentation order (FIRST/SECOND) is salt-randomized per matchup and
 * mapped back in code — so "first" carries no information across a run. The prompt explicitly de-rewards
 * length: a shorter spec that pins behaviour down beats a longer one that hedges.
 */
import { z } from "zod";
import type { LLM } from "../llm/client.js";
import { saltCoin } from "./ambiguity.js";

export const PAIRWISE_DIMENSIONS = ["completeness_edge_cases", "unambiguity", "implementability", "internal_consistency"] as const;
export type PairwiseDimension = (typeof PAIRWISE_DIMENSIONS)[number];

export const PAIRWISE_SYSTEM = `You compare two specifications for the same application, labeled FIRST and SECOND. You do not know who or what produced either one, and you must not guess. Judge them on four dimensions:

- completeness_edge_cases: which spec covers more of the states, failure modes and boundary conditions an implementation will actually hit?
- unambiguity: from which spec would two independent engineers more likely build the SAME thing? Pinned-down decisions win; hedges, options and silence lose.
- implementability: from which spec could a competent engineer start building sooner with fewer questions to the owner?
- internal_consistency: which spec contradicts itself less (rules vs examples vs data model)?

For each dimension answer "first", "second", or "tie", plus ONE sentence of evidence citing something concrete (a decision one spec pins down and the other leaves open, a contradiction, a missing edge case).

Length itself is not a merit: judge ambiguity resolved, not words written. A short spec that decides beats a long spec that hedges. Return JSON only, as FLAT fields: for each dimension, "<dimension>_winner" ("first" | "second" | "tie") and "<dimension>_evidence" (one sentence).`;

// Flat record, not nested objects: on the first live tournament Opus 4.8 returned non-objects for nested
// dimension fields deterministically (3 of 4 zadum-new/dlai-sdd calls failed all retries), silently shrinking
// the sample. Flat scalars are the house pattern for strict structured outputs (ADR-011's PatchOut).
const Winner = z.enum(["first", "second", "tie"]);
export const PairwiseOutSchema = z.object({
  completeness_edge_cases_winner: Winner,
  completeness_edge_cases_evidence: z.string(),
  unambiguity_winner: Winner,
  unambiguity_evidence: z.string(),
  implementability_winner: Winner,
  implementability_evidence: z.string(),
  internal_consistency_winner: Winner,
  internal_consistency_evidence: z.string(),
});
export type PairwiseOut = z.infer<typeof PairwiseOutSchema>;

/** Verdicts mapped back to spec identity: "a"/"b" always mean the caller's first/second argument. */
export interface PairwiseResult {
  swapped: boolean;
  raw: PairwiseOut;
  dimensions: Record<PairwiseDimension, { winner: "a" | "b" | "tie"; evidence: string }>;
}

export async function runPairwise(judge: LLM, specA: string, specB: string, salt: string): Promise<PairwiseResult> {
  const swapped = saltCoin(salt);
  const first = swapped ? specB : specA;
  const second = swapped ? specA : specB;
  const res = await judge.structured({
    fn: "quality_pairwise",
    tier: "strong",
    system: PAIRWISE_SYSTEM,
    user: `SPECIFICATION FIRST:\n\n${first}\n\n=====\n\nSPECIFICATION SECOND:\n\n${second}`,
    schema: PairwiseOutSchema,
    effort: "medium",
    maxTokens: 1500,
    cacheSalt: salt,
  });
  const mapBack = (w: "first" | "second" | "tie"): "a" | "b" | "tie" =>
    w === "tie" ? "tie" : (w === "first") !== swapped ? "a" : "b";
  const dimensions = Object.fromEntries(
    PAIRWISE_DIMENSIONS.map((d) => [d, { winner: mapBack(res.data[`${d}_winner`]), evidence: res.data[`${d}_evidence`] }]),
  ) as PairwiseResult["dimensions"];
  return { swapped, raw: res.data, dimensions };
}

// ---------- aggregation (pure code over stored verdicts) ----------

export interface PairwiseStanding {
  name: string;
  /** dimension-level counts across every clean matchup involving this spec */
  wins: number;
  losses: number;
  ties: number;
  comparisons: number;
  /** (wins + ties/2) / comparisons — 0.5 = even */
  win_rate: number;
}

export interface NamedMatchup {
  a: string;
  b: string;
  dimensions: PairwiseResult["dimensions"];
}

/**
 * Verbosity-bias diagnostic. The first live tournament's win rate was perfectly monotone in spec length
 * (58k > 47k > 6k > 4k chars) — the classic length-bias signature pairwise LLM judging is known for, and it
 * DISAGREED with entropy on the one comparison where length and quality diverged. Until a length-matched
 * tournament design exists, every standings table must carry this number: the share of decided dimension
 * verdicts won by the longer spec. Near 1.0 means the tournament is measuring word count, not quality.
 */
export interface LengthBias {
  /** decided (non-tie) dimension verdicts between specs of different length */
  decided: number;
  longer_won: number;
  /** longer_won / decided; NaN-free: 0 when nothing decided */
  longer_won_rate: number;
}

export function lengthBias(matchups: NamedMatchup[], charsByName: Record<string, number>): LengthBias {
  let decided = 0;
  let longerWon = 0;
  for (const m of matchups) {
    const ca = charsByName[m.a];
    const cb = charsByName[m.b];
    if (ca === undefined || cb === undefined || ca === cb) continue;
    for (const d of PAIRWISE_DIMENSIONS) {
      const w = m.dimensions[d].winner;
      if (w === "tie") continue;
      decided += 1;
      if ((w === "a" && ca > cb) || (w === "b" && cb > ca)) longerWon += 1;
    }
  }
  return { decided, longer_won: longerWon, longer_won_rate: decided ? longerWon / decided : 0 };
}

export function pairwiseStandings(matchups: NamedMatchup[]): PairwiseStanding[] {
  const table = new Map<string, { wins: number; losses: number; ties: number }>();
  const row = (name: string) => {
    let r = table.get(name);
    if (!r) {
      r = { wins: 0, losses: 0, ties: 0 };
      table.set(name, r);
    }
    return r;
  };
  for (const m of matchups) {
    for (const d of PAIRWISE_DIMENSIONS) {
      const w = m.dimensions[d].winner;
      if (w === "tie") {
        row(m.a).ties += 1;
        row(m.b).ties += 1;
      } else {
        row(w === "a" ? m.a : m.b).wins += 1;
        row(w === "a" ? m.b : m.a).losses += 1;
      }
    }
  }
  return [...table.entries()]
    .map(([name, r]) => {
      const comparisons = r.wins + r.losses + r.ties;
      return { name, ...r, comparisons, win_rate: comparisons ? (r.wins + r.ties / 2) / comparisons : 0 };
    })
    .sort((x, y) => y.win_rate - x.win_rate);
}
