/**
 * Rule-bank types/schema only — no logic, no CLI, no top-level await. Split out from `rule_bank.ts` so that
 * `engine/rule_bank.ts` (the runtime loader) can import the schema without creating a circular ESM dependency:
 * `mining/rule_bank.ts`'s CLI dynamically imports `engine/bootstrap.js`, which imports `engine/orchestrator.js`,
 * which imports `engine/rule_bank.js` — if that file imported back into `mining/rule_bank.ts`, the cycle
 * deadlocks Node's module evaluation (a top-level await never settles; observed as "unsettled top-level
 * await" and a silent non-zero exit). Same class of bug `src/mining/concepts.ts`/`concepts_mock.ts` hit and
 * documented; the fix there was avoiding a value import back into the cyclic module, which is what this file is for.
 */
import { z } from "zod";

export const RulePatternSchema = z.object({
  id: z.string(),
  pattern: z.string(),
  kind: z.enum(["access", "state", "integrity", "scope", "other"]),
  /** 1 = seen once, 5 = nearly universal across the archetype's docs — an estimate, not a precise count */
  frequency_estimate: z.number().min(1).max(5),
  example_phrasing: z.string(),
});
export type RulePattern = z.infer<typeof RulePatternSchema>;

export const RuleBankSchema = z.object({
  archetype: z.string(),
  version: z.string(),
  source_docs: z.number(),
  patterns: z.array(RulePatternSchema),
});
export type RuleBank = z.infer<typeof RuleBankSchema>;
