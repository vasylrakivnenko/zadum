/**
 * DLAI SDD baseline — a fixed, always-exactly-three-question interview (Scope / Decisions / Context) that
 * produces requirements.md, plan.md, validation.md. Reimplemented from the DOCUMENTED PROCEDURE of
 * DeepLearning.AI's "Spec-Driven Development with Coding Agents" course (built with JetBrains) —
 * https://github.com/https-deeplearning-ai/sc-spec-driven-development-files — not copied from it: that repo
 * publishes no LICENSE, so its actual prompt/skill text (`skills/feature-spec/SKILL.md`) is not ours to
 * redistribute. Only the *procedure* it documents is reused here (a workflow's steps are facts, not the
 * copyrightable expression of them). The two system prompts below are our own wording, specified verbatim in
 * docs/BASELINES.md ("dlai_sdd.ts — exact wording and wire format") — see that section, and the licensing
 * rationale above it, before changing anything in this file.
 */
import { z } from "zod";
import type { LLM, LLMResponse } from "../llm/client.js";
import type { Baseline, BaselineInput, BaselineResult, BaselineQuestion, BaselineAnswer } from "./types.js";
import { sumUsage, zeroUsage } from "./types.js";

// ---------- system prompts (verbatim from docs/BASELINES.md — do not rephrase) ----------

export const DLAI_INTERVIEW_SYSTEM = `You are helping someone plan a new software feature using a lightweight, three-question spec-driven interview method (inspired by, but not copied from, a published course workflow: DeepLearning.AI's 'Spec-Driven Development with Coding Agents', built with JetBrains). The method always asks exactly three questions in a single batch, one from each of these fixed categories, before writing anything:
1. Scope — what the feature collects, exposes, or does: fields, behaviour, data shape.
2. Decisions — key choices that shape the build: what gets stored, who can see what, how input is checked, the overall interaction pattern.
3. Context — tone, constraints, or anything else that shapes the spec: writing style, technical limits, open questions.
Each question must be answerable with EITHER 2-4 short multiple-choice options OR a short free-text phrase. Write exactly three questions, one per category, given the one-line app description below. Return JSON only.`;

export const DLAI_WRITE_SPEC_SYSTEM = `Given the app description and the three answers below (Scope, Decisions, Context — some may be missing if skipped), write the app's specification as three short documents, following this lightweight spec-driven method: a requirements.md (Scope: what is and is not included; Decisions: choices made and why; Context: tone and constraints), a plan.md (numbered task groups appropriate to building this, each with numbered sub-tasks), and a validation.md (automated checks expected to pass; a manual walkthrough of behaviour and edge cases; a tone check if there is user-facing copy; a definition of done). Return JSON only.`;

// ---------- schemas (ADR-011 conservative subset: flat, all fields required, no optional/records/min-max) ----------

const QuestionKindSchema = z.enum(["mc", "short"]);

/**
 * Three fixed named questions, not an array — the method is always exactly three, so this is more robust
 * than an array a model might miscount (per docs/BASELINES.md).
 */
export const DlaiInterviewSchema = z.object({
  scope_question: z.string(),
  scope_kind: QuestionKindSchema,
  scope_option_a: z.string(),
  scope_option_b: z.string(),
  scope_option_c: z.string(),
  decisions_question: z.string(),
  decisions_kind: QuestionKindSchema,
  decisions_option_a: z.string(),
  decisions_option_b: z.string(),
  decisions_option_c: z.string(),
  context_question: z.string(),
  context_kind: QuestionKindSchema,
  context_option_a: z.string(),
  context_option_b: z.string(),
  context_option_c: z.string(),
});
export type DlaiInterview = z.infer<typeof DlaiInterviewSchema>;

export const DlaiWriteSpecSchema = z.object({
  requirements_markdown: z.string(),
  plan_markdown: z.string(),
  validation_markdown: z.string(),
});
export type DlaiWriteSpec = z.infer<typeof DlaiWriteSpecSchema>;

// ---------- driver ----------

type Category = "scope" | "decisions" | "context";

/** Fixed order: Scope → Decisions → Context. When maxQuestions < 3, the first N of THIS order are kept —
 * i.e. Context is dropped first, then Decisions — per docs/BASELINES.md. */
const CATEGORIES: { id: Category; label: string }[] = [
  { id: "scope", label: "Scope" },
  { id: "decisions", label: "Decisions" },
  { id: "context", label: "Context" },
];

function renderInterviewUser(input: BaselineInput): string {
  return [`ONE-LINER: ${input.one_liner}`, input.extra_context ? `ADDITIONAL CONTEXT FROM THE USER:\n${input.extra_context}` : ""].filter(Boolean).join("\n\n");
}

/** Build the BaselineQuestion for one category out of the flat interview schema, filtering empty option strings. */
function questionFor(data: DlaiInterview, id: Category): BaselineQuestion {
  const parts =
    id === "scope"
      ? { question: data.scope_question, kind: data.scope_kind, options: [data.scope_option_a, data.scope_option_b, data.scope_option_c] }
      : id === "decisions"
        ? { question: data.decisions_question, kind: data.decisions_kind, options: [data.decisions_option_a, data.decisions_option_b, data.decisions_option_c] }
        : { question: data.context_question, kind: data.context_kind, options: [data.context_option_a, data.context_option_b, data.context_option_c] };
  const options = parts.kind === "mc" ? parts.options.filter((o) => o.trim().length > 0) : [];
  return { id, question: parts.question, kind: parts.kind, options };
}

/** requirements.md / plan.md / validation.md's user prompt: skipped categories say so explicitly rather than
 * fabricating an answer (per docs/BASELINES.md: "some may be missing if skipped"). */
function renderWriteSpecUser(input: BaselineInput, asked: Partial<Record<Category, BaselineAnswer>>): string {
  const lines: string[] = [`ONE-LINER: ${input.one_liner}`];
  if (input.extra_context) lines.push(`ADDITIONAL CONTEXT FROM THE USER:\n${input.extra_context}`);
  for (const cat of CATEGORIES) {
    const a = asked[cat.id];
    lines.push(a ? `${cat.label.toUpperCase()} — Q: ${a.question.question}\nA: ${a.answer}` : `${cat.label.toUpperCase()}: (skipped — question cap reached, no answer collected)`);
  }
  return lines.join("\n\n");
}

export const dlaiSdd: Baseline = {
  id: "dlai-sdd",
  description:
    "Reimplementation (not a copy) of the fixed 3-question Scope/Decisions/Context interview from DeepLearning.AI's 'Spec-Driven Development with Coding Agents' course, producing requirements.md/plan.md/validation.md — see docs/BASELINES.md.",

  async run(llm: LLM, input: BaselineInput): Promise<BaselineResult> {
    let usage = zeroUsage();
    let latency_ms = 0;

    const interviewRes: LLMResponse<DlaiInterview> = await llm.structured({
      fn: "dlai_interview",
      tier: "strong",
      system: DLAI_INTERVIEW_SYSTEM,
      user: renderInterviewUser(input),
      schema: DlaiInterviewSchema,
      effort: "medium",
      maxTokens: 2000,
    });
    usage = sumUsage(usage, { input_tokens: interviewRes.usage.input_tokens, output_tokens: interviewRes.usage.output_tokens, calls: 1 });
    latency_ms += interviewRes.latency_ms;

    // Hard cap enforced in code (never rely on the model to self-limit — same reasoning as our own selector's
    // maxCards). Keep the first askCount categories in Scope → Decisions → Context order: Context is dropped
    // first, then Decisions. A dropped category is never sent to the model / simUser at all.
    const askCount = Math.max(0, Math.min(3, input.maxQuestions));
    const askedCategories = CATEGORIES.slice(0, askCount);

    const asked: Partial<Record<Category, BaselineAnswer>> = {};
    const questions: BaselineAnswer[] = [];
    for (const cat of askedCategories) {
      const q = questionFor(interviewRes.data, cat.id);
      const ans = await input.simUser(q);
      asked[cat.id] = ans;
      questions.push(ans);
    }

    const writeRes: LLMResponse<DlaiWriteSpec> = await llm.structured({
      fn: "dlai_write_spec",
      tier: "strong",
      system: DLAI_WRITE_SPEC_SYSTEM,
      user: renderWriteSpecUser(input, asked),
      schema: DlaiWriteSpecSchema,
      effort: "medium",
      maxTokens: 6000,
    });
    usage = sumUsage(usage, { input_tokens: writeRes.usage.input_tokens, output_tokens: writeRes.usage.output_tokens, calls: 1 });
    latency_ms += writeRes.latency_ms;

    const files = [
      { name: "requirements.md", content: writeRes.data.requirements_markdown },
      { name: "plan.md", content: writeRes.data.plan_markdown },
      { name: "validation.md", content: writeRes.data.validation_markdown },
    ];
    const spec_text = files.map((f) => f.content).join("\n\n");

    return {
      baseline: "dlai-sdd",
      questions,
      files,
      spec_text,
      usage,
      latency_ms,
    };
  },
};
