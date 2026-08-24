/**
 * Instrument 2 — builder questions.
 *
 * A single "implementer" call reads the spec and lists every question it would need to ask the product owner
 * before building confidently — ONLY questions the spec leaves open, never generic process questions. At fixed
 * correctness, fewer open questions = a more implementable spec, and the metric cannot be gamed by length:
 * padding a spec with prose that answers nothing removes no questions.
 *
 * Raw questions are stored per trial so the categorization/blocking rubric can be re-scored offline.
 */
import { z } from "zod";
import type { LLM } from "../llm/client.js";

export const BUILDER_CATEGORIES = ["data_model", "lifecycle", "permissions", "integrations", "edge_case", "scope", "other"] as const;
export type BuilderCategory = (typeof BUILDER_CATEGORIES)[number];

export const BUILDER_SYSTEM = `You are about to implement this application from the specification below. List every question you would need to ask the product owner before you could build confidently.

Only questions the SPEC leaves open:
- NOT generic process questions (deadline, budget, tech stack, hosting, team).
- NOT questions the spec already answers.
- Each question should name the concrete open decision, specific enough that the owner's answer would settle it.

For each question report:
- q: the question, one sentence
- category: one of data_model | lifecycle | permissions | integrations | edge_case | scope | other
- blocking: true if you could not start building that area of the app without the answer; false if you could proceed on a reasonable assumption and adjust later.

If the spec genuinely leaves nothing open, return an empty list. Return JSON only.`;

export const BuilderOutSchema = z.object({
  questions: z.array(
    z.object({
      q: z.string(),
      category: z.enum(BUILDER_CATEGORIES),
      blocking: z.boolean(),
    }),
  ),
});
export type BuilderOut = z.infer<typeof BuilderOutSchema>;

export async function runBuilderQuestions(llm: LLM, specText: string, salt: string): Promise<BuilderOut> {
  const res = await llm.structured({
    fn: "quality_builder",
    tier: "strong",
    system: BUILDER_SYSTEM,
    user: `THE SPECIFICATION:\n\n${specText}`,
    schema: BuilderOutSchema,
    effort: "medium",
    maxTokens: 3000,
    temperature: 1,
    cacheSalt: salt,
  });
  return res.data;
}

// ---------- metrics (pure code over stored questions) ----------

export interface BuilderMetrics {
  total: number;
  blocking: number;
  by_category: Record<string, number>;
}

export function builderMetrics(out: BuilderOut): BuilderMetrics {
  const by_category: Record<string, number> = {};
  for (const q of out.questions) by_category[q.category] = (by_category[q.category] ?? 0) + 1;
  return {
    total: out.questions.length,
    blocking: out.questions.filter((q) => q.blocking).length,
    by_category,
  };
}
