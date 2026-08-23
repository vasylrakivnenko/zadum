/**
 * The simulated user for baseline comparisons — answers a free-form clarifying question (multiple-choice or
 * short-answer) from the SAME hidden gold truth `src/harness/run.ts` uses for our own sessions, so a baseline
 * run and one of our sessions are informationally identical: neither knows more than the other going in.
 *
 * Deliberately separate from `src/llm/functions.ts`'s `simUser` (which is shaped for our Card type: a node id
 * and up to `maxCardOptions` options). Baseline tools ask arbitrary MC (2-4 options) or open short-answer
 * questions, so this takes a plain question/options pair instead.
 */
import { z } from "zod";
import type { LLM, LLMResponse } from "../llm/client.js";
import type { BaselineQuestion, BaselineAnswer, BaselineSimUser } from "./types.js";

export const BASELINE_SIM_USER_SYSTEM = `You simulate a business owner being interviewed by a spec-writing tool about the app they want. You know the persona you are playing and the hidden truth about the app (the full requirements). Answer the question the way that busy owner would, using ONLY the hidden truth — never invent details the truth does not support.
For a multiple-choice question: pick the option whose wording is closest to what the hidden truth says, even if the match is inexact (real users pick the nearest available answer, they do not refuse). Reply with the option's exact text, copied verbatim from the list given.
For a short-answer question: reply in one short sentence or phrase (under 15 words), in the owner's own words, grounded in the hidden truth. If the hidden truth is silent on this specific point, say what a sensible owner would default to rather than refusing to answer.
Never mention that you are simulated, an AI, or that there is a "hidden truth" — just answer as the owner would. Return JSON only.`;

export const BaselineSimAnswerSchema = z.object({ answer: z.string(), reasoning: z.string() });
export type BaselineSimAnswer = z.infer<typeof BaselineSimAnswerSchema>;

export function renderBaselineSimUserPrompt(q: BaselineQuestion, persona: string, truth: string): { system: string; user: string } {
  const optionsBlock = q.kind === "mc" ? `OPTIONS (reply with one of these, verbatim):\n${q.options.map((o, i) => `${i + 1}. ${o}`).join("\n")}` : "This is a short-answer question — reply in your own words, not a list choice.";
  return {
    system: BASELINE_SIM_USER_SYSTEM,
    user: [`YOUR PERSONA: ${persona}`, `HIDDEN TRUTH ABOUT THE APP:\n${truth}`, `QUESTION: ${q.question}`, optionsBlock].join("\n\n"),
  };
}

/** Snap a free-form model reply back onto one of the offered options (exact → casefold → substring → first). */
export function reconcileMcAnswer(raw: string, options: string[]): string {
  const t = raw.trim();
  const exact = options.find((o) => o === t);
  if (exact) return exact;
  const ci = options.find((o) => o.toLowerCase() === t.toLowerCase());
  if (ci) return ci;
  const sub = options.find((o) => t.toLowerCase().includes(o.toLowerCase()) || o.toLowerCase().includes(t.toLowerCase()));
  if (sub) return sub;
  return options[0] ?? t;
}

export interface MakeSimUserOptions {
  persona: string;
  truth: string;
  effort?: "low" | "medium";
}

/** Build a `BaselineSimUser` bound to one gold's persona/truth — the same object every driver call reuses. */
export function makeBaselineSimUser(llm: LLM, opts: MakeSimUserOptions): { simUser: BaselineSimUser; calls: { input_tokens: number; output_tokens: number }[] } {
  const calls: { input_tokens: number; output_tokens: number }[] = [];
  const simUser: BaselineSimUser = async (q: BaselineQuestion): Promise<BaselineAnswer> => {
    const { system, user } = renderBaselineSimUserPrompt(q, opts.persona, opts.truth);
    const res: LLMResponse<BaselineSimAnswer> = await llm.structured({
      fn: "baseline_sim_user",
      tier: "strong",
      system,
      user,
      schema: BaselineSimAnswerSchema,
      effort: opts.effort ?? "low",
      maxTokens: 400,
    });
    calls.push({ input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens });
    const answer = q.kind === "mc" ? reconcileMcAnswer(res.data.answer, q.options) : res.data.answer.trim();
    return { question: q, answer };
  };
  return { simUser, calls };
}
