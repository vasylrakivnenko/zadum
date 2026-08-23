/**
 * Spec Kit baseline driver — runs the actual vendored `/specify` and `/clarify` command text
 * (src/baselines/vendor/spec-kit/{specify,clarify}.md, MIT, verbatim from github/spec-kit v1.0.1)
 * through our LLM as a simulation, with the simulated user standing in for a real developer.
 * See docs/BASELINES.md's "src/baselines/spec_kit.ts — exact wire format" section — this file follows
 * that contract literally; do not improvise schema shapes or flow order without updating the doc first.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { LLM } from "../llm/client.js";
import { sumUsage, zeroUsage } from "./types.js";
import type { Baseline, BaselineAnswer, BaselineInput, BaselineQuestion, BaselineResult, BaselineUsage, QuestionKind } from "./types.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const VENDOR_DIR = path.resolve(here, "vendor/spec-kit");

const SPECIFY_MD = readFileSync(path.join(VENDOR_DIR, "specify.md"), "utf8");
const CLARIFY_MD = readFileSync(path.join(VENDOR_DIR, "clarify.md"), "utf8");

/**
 * Driver-authored framing prepended to each vendored command's text. Not part of the vendored file —
 * this is us, telling the model it's in a simulation: no real filesystem or git exists, so the parts of
 * the command about directories/branches/hooks/checklist files don't apply, and the only valid output is
 * the JSON shape given in this call's schema.
 */
const FRAMING = `You are simulating a real developer's AI coding agent running one Spec Kit slash command, in a test harness with no real filesystem or git repository behind it. There is no ".specify/" directory, no feature branch, no extension hooks, no scripts to run, and no checklist files to write. Ignore every instruction below about creating directories, running scripts, checking for or executing hooks, branch naming, or writing/reading files on disk — none of that exists here. Do not describe or narrate any of those steps in your answer. Do the substantive reasoning the command describes (drafting the specification content, asking clarification questions, tightening ambiguous text) and respond ONLY in the JSON shape given by this call's schema — no markdown fences, no commentary outside the JSON fields.

The command text you are simulating follows below, verbatim, for reference:`;

const SPECIFY_SYSTEM = `${FRAMING}\n\n---\n\n${SPECIFY_MD}`;
const CLARIFY_SYSTEM = `${FRAMING}\n\n---\n\n${CLARIFY_MD}`;

// ---------- schemas (ADR-011 conservative subset: flat objects, all fields present, enums, arrays, strings, numbers) ----------

const SpecifyDraftSchema = z.object({
  spec_markdown: z.string(),
  clarification_count: z.number(),
  clarifications: z.array(
    z.object({
      id: z.string(),
      question: z.string(),
      option_a: z.string(),
      option_b: z.string(),
      option_c: z.string(),
    }),
  ),
});
type SpecifyDraft = z.infer<typeof SpecifyDraftSchema>;

const SpecifyFinalizeSchema = z.object({ spec_markdown: z.string() });

const ClarifyAskSchema = z.object({
  done: z.boolean(),
  question: z.string(),
  kind: z.enum(["mc", "short"]),
  option_a: z.string(),
  option_b: z.string(),
  option_c: z.string(),
  option_d: z.string(),
});
type ClarifyAsk = z.infer<typeof ClarifyAskSchema>;

const ClarifyApplySchema = z.object({ updated_spec_markdown: z.string() });

// ---------- helpers ----------

function nonEmptyOptions(opts: (string | undefined)[]): string[] {
  return opts.filter((o): o is string => !!o && o.trim().length > 0);
}

function renderOneLiner(input: BaselineInput): string {
  return input.extra_context && input.extra_context.trim().length
    ? `${input.one_liner}\n\nAdditional context:\n${input.extra_context}`
    : input.one_liner;
}

function renderQA(qa: BaselineAnswer[]): string {
  if (!qa.length) return "(none)";
  return qa.map((a, i) => `${i + 1}. Q: ${a.question.question}\n   A: ${a.answer}`).join("\n");
}

export const specKitBaseline: Baseline = {
  id: "spec-kit",
  description: "github/spec-kit's /specify + /clarify slash commands (MIT, vendored verbatim, tag v1.0.1), run as a simulation",

  async run(llm: LLM, input: BaselineInput): Promise<BaselineResult> {
    let usage: BaselineUsage = zeroUsage();
    let latency_ms = 0;
    const questions: BaselineAnswer[] = [];
    let questionsSoFar = 0;

    // ---------- phase 1: /specify ----------
    const draftRes = await llm.structured({
      fn: "speckit_specify_draft",
      tier: "strong",
      system: SPECIFY_SYSTEM,
      user: `FEATURE DESCRIPTION (this is the entire feature — treat the whole app as the one thing being spec'd):\n\n${renderOneLiner(input)}`,
      schema: SpecifyDraftSchema,
      effort: "medium",
    });
    usage = sumUsage(usage, { input_tokens: draftRes.usage.input_tokens, output_tokens: draftRes.usage.output_tokens, calls: 1 });
    latency_ms += draftRes.latency_ms;
    const draft: SpecifyDraft = draftRes.data;

    // Defensive: clarification_count is supposed to equal clarifications.length, but never trust it blindly —
    // clamp to whichever is smaller so we never index past the array the model actually returned.
    const declaredCount = Math.max(0, Math.floor(draft.clarification_count));
    const rawCount = Math.min(declaredCount, draft.clarifications.length);
    // Spec Kit's own documented /specify limit is 3, and the driver enforces the caller's hard cap in code —
    // never rely on the model to have honored either.
    const specifyCap = Math.min(3, Math.max(0, input.maxQuestions - questionsSoFar));
    const numSpecifyQuestions = Math.min(rawCount, specifyCap);

    const specifyQA: BaselineAnswer[] = [];
    for (let i = 0; i < numSpecifyQuestions; i++) {
      const c = draft.clarifications[i]!;
      const options = nonEmptyOptions([c.option_a, c.option_b, c.option_c]);
      const q: BaselineQuestion = { id: c.id, question: c.question, kind: "mc", options };
      const answer = await input.simUser(q);
      specifyQA.push(answer);
      questions.push(answer);
      questionsSoFar++;
    }

    let currentSpec = draft.spec_markdown;
    if (numSpecifyQuestions > 0) {
      const finalizeRes = await llm.structured({
        fn: "speckit_specify_finalize",
        tier: "strong",
        system: SPECIFY_SYSTEM,
        user: [
          `FEATURE DESCRIPTION:\n\n${renderOneLiner(input)}`,
          `DRAFT SPEC (with [NEEDS CLARIFICATION] markers):\n\n${draft.spec_markdown}`,
          `RESOLVED CLARIFICATIONS:\n${renderQA(specifyQA)}`,
        ].join("\n\n"),
        schema: SpecifyFinalizeSchema,
        effort: "medium",
      });
      usage = sumUsage(usage, { input_tokens: finalizeRes.usage.input_tokens, output_tokens: finalizeRes.usage.output_tokens, calls: 1 });
      latency_ms += finalizeRes.latency_ms;
      currentSpec = finalizeRes.data.spec_markdown;
    }

    // ---------- phase 2: /clarify loop ----------
    const clarifyLoopCap = Math.min(5, Math.max(0, input.maxQuestions - questionsSoFar));
    const clarifyQA: BaselineAnswer[] = [];
    for (let i = 0; i < clarifyLoopCap; i++) {
      const askRes = await llm.structured({
        fn: "speckit_clarify_ask",
        tier: "strong",
        system: CLARIFY_SYSTEM,
        user: [`CURRENT SPEC:\n\n${currentSpec}`, `CLARIFICATIONS ASKED SO FAR THIS SESSION:\n${renderQA(clarifyQA)}`].join("\n\n"),
        schema: ClarifyAskSchema,
        effort: "low",
      });
      usage = sumUsage(usage, { input_tokens: askRes.usage.input_tokens, output_tokens: askRes.usage.output_tokens, calls: 1 });
      latency_ms += askRes.latency_ms;
      const ask: ClarifyAsk = askRes.data;
      if (ask.done) break;

      const kind: QuestionKind = ask.kind;
      const options = kind === "mc" ? nonEmptyOptions([ask.option_a, ask.option_b, ask.option_c, ask.option_d]) : [];
      const q: BaselineQuestion = { id: `clarify-${i + 1}`, question: ask.question, kind, options };
      const answer = await input.simUser(q);
      clarifyQA.push(answer);
      questions.push(answer);
      questionsSoFar++;

      const applyRes = await llm.structured({
        fn: "speckit_clarify_apply",
        tier: "strong",
        system: CLARIFY_SYSTEM,
        user: [`CURRENT SPEC:\n\n${currentSpec}`, `NEW CLARIFICATION JUST RECEIVED:\n${renderQA([answer])}`].join("\n\n"),
        schema: ClarifyApplySchema,
        effort: "low",
      });
      usage = sumUsage(usage, { input_tokens: applyRes.usage.input_tokens, output_tokens: applyRes.usage.output_tokens, calls: 1 });
      latency_ms += applyRes.latency_ms;
      currentSpec = applyRes.data.updated_spec_markdown;
    }

    return {
      baseline: "spec-kit",
      questions,
      files: [{ name: "spec.md", content: currentSpec }],
      spec_text: currentSpec,
      usage,
      latency_ms,
    };
  },
};
