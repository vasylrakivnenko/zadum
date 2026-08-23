/**
 * Shared contract for external "spec-driven development" baselines — tools that also turn a one-liner into
 * a specification, so the harness's recovery metric (src/harness/run.ts) can be compared against something
 * other than ourselves. See docs/BASELINES.md for the design and the licensing decisions behind each driver.
 *
 * A Baseline knows nothing about our Sheet/catalog/decision model — it only produces prose files. The bridge
 * back to a comparable recovery number is generic: `src/mining/concepts.ts`'s `extractConcepts` (already built
 * for corpus mining) reads ANY spec text against our catalog nodes, and `src/llm/functions.ts`'s `reverse()`
 * (already built for the round-trip check) reads ANY spec text into actors/nouns/rules/non_goals. Both are
 * reused as-is in `src/baselines/run.ts` — a baseline driver never needs to know about them.
 */
import type { LLM } from "../llm/client.js";

export type QuestionKind = "mc" | "short";

/** One clarifying question as the target tool would present it — free-form, not our catalog's node/option shape. */
export interface BaselineQuestion {
  id: string;
  question: string;
  kind: QuestionKind;
  /** multiple-choice options (2-4) when kind === "mc"; empty for "short" (short free-text answer expected) */
  options: string[];
}

export interface BaselineAnswer {
  question: BaselineQuestion;
  /** the option text chosen (for "mc") or the free-text reply (for "short") */
  answer: string;
}

/**
 * Answers one question against the SAME hidden gold truth our own harness sessions use, so a baseline run and
 * one of our sessions are answering from identical knowledge. Built once in src/baselines/sim_user.ts and
 * threaded into every driver — drivers must not build their own simulated-user prompt.
 */
export type BaselineSimUser = (q: BaselineQuestion) => Promise<BaselineAnswer>;

export interface BaselineUsage {
  input_tokens: number;
  output_tokens: number;
  calls: number;
}

export interface BaselineFile {
  name: string;
  content: string;
}

export interface BaselineResult {
  baseline: string;
  /** every clarifying question actually asked, in order, with the answer received — the baseline's "card count" */
  questions: BaselineAnswer[];
  /** the artifact(s) the tool produces, e.g. spec.md, or requirements.md + plan.md + validation.md */
  files: BaselineFile[];
  /** files concatenated into one string — what gets fed to reverse()/extractConcepts() for scoring */
  spec_text: string;
  usage: BaselineUsage;
  latency_ms: number;
}

export interface BaselineInput {
  one_liner: string;
  /** optional free-text context, mirrors Engine.createProject's extra_context */
  extra_context?: string;
  simUser: BaselineSimUser;
  /** hard cap on clarifying questions a driver may ask; drivers must enforce this themselves, not rely on the model */
  maxQuestions: number;
}

export interface Baseline {
  /** short id used in reports and file names, e.g. "spec-kit", "dlai-sdd" */
  readonly id: string;
  /** one line for reports: what it is and where it's from */
  readonly description: string;
  run(llm: LLM, input: BaselineInput): Promise<BaselineResult>;
}

export function sumUsage(a: BaselineUsage, b: BaselineUsage): BaselineUsage {
  return { input_tokens: a.input_tokens + b.input_tokens, output_tokens: a.output_tokens + b.output_tokens, calls: a.calls + b.calls };
}
export function zeroUsage(): BaselineUsage {
  return { input_tokens: 0, output_tokens: 0, calls: 0 };
}
