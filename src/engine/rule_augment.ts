/**
 * Applies the rule bank: turns `augmentRules`' suggestions into `add_rule` patch ops, and only those — the
 * LLM proposes text, this module (and ultimately `applyPatch`) disposes. Deterministic dedup against the
 * Sheet's existing rules so a pattern the drafter already covered (in different words) is never doubled.
 * See docs/MINING.md "Rule bank" and ADR (2026-08-23, "the highest-leverage gap the evals surfaced").
 */
import { normName } from "../core/ids.js";
import type { Sheet } from "../core/sheet.js";
import type { UserPatchOp } from "../core/patch.js";
import type { RuleBank } from "../mining/rule_bank.js";
import type { Fns, AugmentRulesOut } from "../llm/functions.js";
import type { LLMResponse } from "../llm/client.js";

export interface AugmentRulesResult {
  /** add_rule ops only, already deduped against the Sheet's existing rules */
  ops: UserPatchOp[];
  suggested: number;
  added: number;
  deduped: number;
  patterns_considered: number;
}

const NOOP: AugmentRulesResult = { ops: [], suggested: 0, added: 0, deduped: 0, patterns_considered: 0 };

/**
 * Same threshold and token-overlap approach as `harness/run.ts`'s rule matching (no stemming beyond dropping
 * short tokens) — deliberately the SAME limitation flagged in ADR-024: this catches near-literal duplicates
 * ("Invoice numbers are sequential with no gaps" / "...sequential without any gaps"), not deep paraphrase
 * ("cannot be sent twice" / "can never be sent a second time" share almost no tokens and will NOT be caught).
 * It is a deterministic backstop, not the primary defense — `AUGMENT_RULES_SYSTEM` already instructs the model
 * to skip anything the Sheet covers "even worded differently", which is where paraphrase-level dedup actually
 * has to happen until the harness's planned LLM-judge matching (docs/EVALS.md) is reused here too.
 */
const JACCARD_DUP_THRESHOLD = 0.5;
function jaccard(a: string, b: string): number {
  const tok = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((t) => t.length > 2));
  const A = tok(a);
  const B = tok(b);
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return A.size + B.size - inter ? inter / (A.size + B.size - inter) : 1;
}

/** No-op (not an error) when no bank exists for this archetype yet, or the bank has no patterns. */
export async function augmentRulesFromBank(fns: Pick<Fns, "augmentRules">, sheet: Sheet, bank: RuleBank | null): Promise<{ result: AugmentRulesResult; res: LLMResponse<AugmentRulesOut> | null }> {
  if (!bank || bank.patterns.length === 0) return { result: NOOP, res: null };
  const res = await fns.augmentRules({ sheet, patterns: bank.patterns.map((p) => ({ id: p.id, pattern: p.pattern, frequency_estimate: p.frequency_estimate, example_phrasing: p.example_phrasing })) });
  const ops: UserPatchOp[] = [];
  let deduped = 0;
  const seenThisBatch: string[] = [];
  for (const a of res.data.additions.slice(0, 6)) {
    const text = a.text.trim();
    if (!text) continue;
    const isDup = sheet.rules.some((r) => normName(r.text) === normName(text) || jaccard(r.text, text) >= JACCARD_DUP_THRESHOLD) || seenThisBatch.some((t) => jaccard(t, text) >= JACCARD_DUP_THRESHOLD);
    if (isDup) {
      deduped++;
      continue;
    }
    seenThisBatch.push(text);
    ops.push({ op: "add_rule", text, kind: a.kind });
  }
  return { result: { ops, suggested: res.data.additions.length, added: ops.length, deduped, patterns_considered: bank.patterns.length }, res };
}
