/**
 * Instrument 2 — builder questions, in two passes.
 *
 * PASS 1 (collection, unchanged): a single "implementer" call reads the spec and lists every question it would
 * need to ask the product owner before building confidently.
 *
 * PASS 2 (classification, new): a second, independent call labels each collected question AGAINST THE SPEC
 * TEXT — did the spec answer it, did the spec itself flag the matter as an assumption to confirm, or is it
 * truly unsaid? This exists because the raw count is not a quality metric: our compiled specs carry a complete
 * deterministic decision-ledger appendix (every decision, its answer, how it was settled, a confidence) plus a
 * confirm-first protocol, and readers dutifully ask about the low-confidence assumptions the ledger makes
 * VISIBLE. The first live run therefore scored our specs WORSE (15-16 questions vs a baseline's 9.5) for doing
 * exactly what the product is designed to do. A spec that hides its assumptions collects fewer questions and is
 * a worse spec.
 *
 *   answered_in_spec   — the answer is stated plainly; asking was a reading failure (counts against the spec's
 *                        findability, not its completeness)
 *   flagged_assumption — the spec marks this as an assumption / default / low-confidence / confirm-before-
 *                        building; asking is the CORRECT behaviour the spec invited
 *   genuine_gap        — the spec neither answers nor flags it; the implementer must invent the answer
 *
 * HEADLINE = genuine_gap. It cannot be gamed by hiding assumptions (hiding one converts a flagged_assumption
 * into a genuine_gap) nor by padding prose (padding answers nothing).
 *
 * Raw questions AND raw labels are stored per trial, so old runs (no labels) stay valid and every rubric here
 * can be re-scored offline without new LLM calls.
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

// ---------- pass 2: blind classification against the spec ----------

export const QUESTION_LABELS = ["answered_in_spec", "flagged_assumption", "genuine_gap"] as const;
export type QuestionLabel = (typeof QUESTION_LABELS)[number];

/**
 * Deliberately generic about HOW a spec flags an assumption (a ledger column, an inline "assumed", a
 * confirm-before-building note) so no wording identifies the system that produced the spec, and every spec is
 * given the same chance to have its flagged assumptions recognized.
 */
export const CLASSIFIER_SYSTEM = `You audit questions that an implementer asked after reading a specification. You do not know who wrote the specification or who asked the questions, and you must not guess.

For EACH numbered question, decide what it says about the SPECIFICATION — not whether the question is a good one. Search the WHOLE document, including appendices, tables, examples and notes.

Labels:
- "flagged_assumption": the spec itself marks this matter as an assumption, a provisional or default choice, a low-confidence decision, or something to confirm with the owner before building (e.g. a row in a decisions table whose provenance is "assumed" or whose confidence is below certainty, an inline "assumed"/"default"/"we assume", a note telling the implementer to confirm). The spec INVITED this question, so asking it is correct behaviour.
- "answered_in_spec": the spec states the answer plainly and does NOT present it as an assumption to confirm. Asking it was a reading failure.
- "genuine_gap": the spec neither answers this nor flags it anywhere. The implementer would have to invent the answer.

Precedence, applied strictly: if the matter is flagged as an assumption or as needing confirmation, label it "flagged_assumption" EVEN IF the spec also states a provisional answer. Otherwise, if the answer is stated anywhere, label it "answered_in_spec". Use "genuine_gap" only when you have looked and the document is silent.

Return exactly one entry per question, with:
- index: the question's number, exactly as given
- label: one of flagged_assumption | answered_in_spec | genuine_gap
- evidence: for flagged_assumption and answered_in_spec, a short quote (at most 20 words) from the specification that settles it; for genuine_gap, "".

Return JSON only.`;

export const QuestionLabelsSchema = z.object({
  labels: z.array(
    z.object({
      // plain z.number() (clamped in code) keeps the schema in the strict-mode subset every provider accepts
      index: z.number(),
      label: z.enum(QUESTION_LABELS),
      evidence: z.string(),
    }),
  ),
});
export type QuestionLabelsOut = z.infer<typeof QuestionLabelsSchema>;

/** Labels aligned 1:1 with the questions they classify, plus the raw model output for offline re-scoring. */
export interface QuestionClassification {
  labels: QuestionLabel[];
  evidence: string[];
  /** questions the classifier returned no usable entry for — defaulted to genuine_gap (the conservative side) */
  unclassified: number;
  raw: QuestionLabelsOut;
}

export function renderQuestions(out: BuilderOut): string {
  return out.questions.map((q, i) => `${i + 1}. ${q.q}`).join("\n");
}

/**
 * Align the classifier's (index, label) entries back onto the question list. Missing or out-of-range entries
 * fall back to "genuine_gap": the label that counts AGAINST the spec, so a lazy classifier can never flatter it.
 */
export function alignLabels(out: BuilderOut, raw: QuestionLabelsOut): QuestionClassification {
  const labels: QuestionLabel[] = out.questions.map(() => "genuine_gap");
  const evidence: string[] = out.questions.map(() => "");
  const seen = new Set<number>();
  for (const e of raw.labels) {
    const i = Math.round(e.index) - 1; // 1-based in the prompt
    if (!Number.isFinite(i) || i < 0 || i >= labels.length || seen.has(i)) continue;
    seen.add(i);
    labels[i] = e.label;
    evidence[i] = e.evidence;
  }
  return { labels, evidence, unclassified: labels.length - seen.size, raw };
}

export async function classifyBuilderQuestions(
  llm: LLM,
  specText: string,
  out: BuilderOut,
  salt: string,
): Promise<QuestionClassification> {
  if (out.questions.length === 0) {
    return { labels: [], evidence: [], unclassified: 0, raw: { labels: [] } };
  }
  const res = await llm.structured({
    fn: "quality_question_classifier",
    tier: "strong",
    system: CLASSIFIER_SYSTEM,
    user: `THE SPECIFICATION:\n\n${specText}\n\n=====\n\nTHE QUESTIONS:\n\n${renderQuestions(out)}`,
    schema: QuestionLabelsSchema,
    effort: "medium",
    maxTokens: 4000,
    cacheSalt: salt,
  });
  return alignLabels(out, res.data);
}

// ---------- metrics (pure code over stored questions + labels) ----------

export interface QuestionTaxonomy {
  answered_in_spec: number;
  flagged_assumption: number;
  /** the headline: questions the spec neither answers nor flags */
  genuine_gap: number;
  /** genuine gaps the asker could not start building without */
  genuine_gap_blocking: number;
  unclassified: number;
}

export interface BuilderMetrics {
  /** raw question count — kept for continuity with pre-classification runs; NOT the headline any more */
  total: number;
  blocking: number;
  by_category: Record<string, number>;
  /** present only when pass 2 ran; absent on re-scored old runs */
  taxonomy?: QuestionTaxonomy;
}

export function builderMetrics(out: BuilderOut, classification?: QuestionClassification): BuilderMetrics {
  const by_category: Record<string, number> = {};
  for (const q of out.questions) by_category[q.category] = (by_category[q.category] ?? 0) + 1;
  const base: BuilderMetrics = {
    total: out.questions.length,
    blocking: out.questions.filter((q) => q.blocking).length,
    by_category,
  };
  if (!classification) return base;
  const count = (l: QuestionLabel) => classification.labels.filter((x) => x === l).length;
  return {
    ...base,
    taxonomy: {
      answered_in_spec: count("answered_in_spec"),
      flagged_assumption: count("flagged_assumption"),
      genuine_gap: count("genuine_gap"),
      genuine_gap_blocking: out.questions.filter((q, i) => q.blocking && classification.labels[i] === "genuine_gap").length,
      unclassified: classification.unclassified,
    },
  };
}
