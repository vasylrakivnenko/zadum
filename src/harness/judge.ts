/**
 * LLM-judge semantic recall — the fix for ADR-024's confirmed limitation (2026-08-23): `normName`/Jaccard
 * token-overlap matching cannot see synonyms or verbose-vs-terse paraphrase ("Homeowner"/"Customer",
 * "Invoice numbers are sequential with no gaps" / "Invoice numbers must be unique and assigned in a
 * sequential manner..."). Confirmed again the same night: a live A/B of the rule-bank feature (src/mining/
 * rule_bank.ts) showed identical 0% lexical rules-recall with and without it, even though manual inspection
 * showed the rule bank added a rule that IS the gold's intended invariant, just phrased differently. Lexical
 * recall cannot be trusted to detect this — this module is the harness's second opinion.
 *
 * One LLM call does bipartite semantic matching: for each gold item, is there a produced item that means the
 * same thing (even if worded completely differently)? This is a proxy (Loop A / docs/LEARNING.md's "LLM-as-
 * judge" role), not ground truth — pairwise, and re-validated informally below rather than against a human
 * anchor set (that's the honest limitation of doing this in one engineering session; see docs/EVALS.md).
 */
import { z } from "zod";
import type { LLM, LLMResponse } from "../llm/client.js";

export const JUDGE_RECALL_SYSTEM = `You compare two lists of short phrases describing the same kind of thing (e.g. both are "rules a software app must follow", or both are "actors/roles", or both are "things the app tracks"). List GOLD is the reference; list PRODUCED is what a system actually generated.
For EACH item in GOLD, decide: does ANY item in PRODUCED mean essentially the same thing, even if phrased completely differently, more or less formally, more specifically, or more generally (as long as the core intent/invariant matches)? A rule about "the same number never repeats" matches "numbers are sequential with no gaps" (both express uniqueness/sequencing) — but does NOT match a rule about who can delete records (different invariant entirely).
For each GOLD item with a match, report the PRODUCED item's index (0-based) and a confidence 0-1 (1.0 = obviously the same idea, 0.6 = plausible but partial overlap, below 0.5 = do not report). For a GOLD item with no real match, omit it from matches entirely — do not force a weak match.
Be a strict but fair judge: paraphrase and reasonable generalization/specialization count as a match; a genuinely different topic does not, even if some words overlap. Return JSON only.`;

export const JudgeRecallOutSchema = z.object({
  matches: z.array(z.object({ gold_index: z.number(), produced_index: z.number(), confidence: z.number() })),
});
export type JudgeRecallOut = z.infer<typeof JudgeRecallOutSchema>;

export function renderJudgePrompt(kind: string, gold: string[], produced: string[]): string {
  return [`KIND: ${kind}`, `GOLD:\n${gold.map((g, i) => `${i}. ${g}`).join("\n")}`, `PRODUCED:\n${produced.length ? produced.map((p, i) => `${i}. ${p}`).join("\n") : "(nothing produced)"}`].join("\n\n");
}

export async function judgeMatch(llm: LLM, kind: string, gold: string[], produced: string[]): Promise<LLMResponse<JudgeRecallOut>> {
  return llm.structured({
    fn: "judge_recall",
    tier: "strong",
    system: JUDGE_RECALL_SYSTEM,
    user: renderJudgePrompt(kind, gold, produced),
    schema: JudgeRecallOutSchema,
    effort: "medium",
    maxTokens: 2000,
  });
}

export interface JudgeRecallResult {
  /** matched fraction of gold items, min confidence 0.5 (one gold item matched at most once, best confidence wins) */
  recall: number;
  /** per gold item: whether/what matched, for inspection */
  detail: { gold_index: number; gold_item: string; matched_produced_index: number | null; matched_item: string | null; confidence: number }[];
}

/** Judge-based recall for one list (e.g. rules, or actors, or nouns). Empty gold → recall 1 (nothing to miss). */
export async function semanticListRecall(llm: LLM, kind: string, gold: string[], produced: string[]): Promise<JudgeRecallResult> {
  if (gold.length === 0) return { recall: 1, detail: [] };
  if (produced.length === 0) return { recall: 0, detail: gold.map((g, i) => ({ gold_index: i, gold_item: g, matched_produced_index: null, matched_item: null, confidence: 0 })) };
  const res = await judgeMatch(llm, kind, gold, produced);
  const bestByGold = new Map<number, { produced_index: number; confidence: number }>();
  for (const m of res.data.matches) {
    if (m.confidence < 0.5) continue;
    if (m.gold_index < 0 || m.gold_index >= gold.length) continue;
    if (m.produced_index < 0 || m.produced_index >= produced.length) continue;
    const cur = bestByGold.get(m.gold_index);
    if (!cur || m.confidence > cur.confidence) bestByGold.set(m.gold_index, { produced_index: m.produced_index, confidence: m.confidence });
  }
  const detail = gold.map((g, i) => {
    const m = bestByGold.get(i);
    return { gold_index: i, gold_item: g, matched_produced_index: m?.produced_index ?? null, matched_item: m ? produced[m.produced_index]! : null, confidence: m?.confidence ?? 0 };
  });
  return { recall: bestByGold.size / gold.length, detail };
}

export interface SemanticRecall {
  actors: number;
  nouns: number;
  rules: number;
  non_goals: number;
}

/** Same shape as `draftRecall`/`draftRecallFromLists`, computed by the judge instead of lexical matching. Four LLM calls (one per list). */
export async function semanticRecall(llm: LLM, produced: { actors: string[]; nouns: string[]; rules: string[]; non_goals: string[] }, gold: { actors: string[]; nouns: string[]; rules: string[]; non_goals: string[] } | undefined): Promise<SemanticRecall> {
  if (!gold) return { actors: 1, nouns: 1, rules: 1, non_goals: 1 };
  const [actors, nouns, rules, non_goals] = await Promise.all([
    semanticListRecall(llm, "actors/roles of an app", gold.actors, produced.actors),
    semanticListRecall(llm, "things (nouns) an app keeps track of", gold.nouns, produced.nouns),
    semanticListRecall(llm, "rules/invariants an app must follow", gold.rules, produced.rules),
    semanticListRecall(llm, "non-goals (explicitly out of scope) of an app", gold.non_goals, produced.non_goals),
  ]);
  return { actors: actors.recall, nouns: nouns.recall, rules: rules.recall, non_goals: non_goals.recall };
}
