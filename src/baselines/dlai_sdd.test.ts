import { describe, it, expect } from "vitest";
import { MockLLM } from "../llm/client.js";
import type { LLM, LLMRequest, LLMResponse } from "../llm/client.js";
import type { BaselineQuestion, BaselineAnswer, BaselineSimUser } from "./types.js";
import { dlaiSdd, DLAI_INTERVIEW_SYSTEM, DLAI_WRITE_SPEC_SYSTEM, type DlaiInterview, type DlaiWriteSpec } from "./dlai_sdd.js";

const ONE_LINER = "An app for dog walkers to schedule and bill their walks.";

// ---------- deterministic mock LLM responses (parse req.user back out, established mock_fixtures.ts pattern
// isn't needed here since the driver's own schema is small and fixed, but the shape follows the same idea:
// return plausible data that exercises real mc/short handling) ----------

function mockInterview(): DlaiInterview {
  return {
    scope_question: "What does the app need to track about each walk?",
    scope_kind: "mc",
    scope_option_a: "Dog, owner, and time",
    scope_option_b: "Just the time",
    scope_option_c: "", // only 2 of 3 slots filled — the driver must filter the empty one out
    decisions_question: "How should a walker record that they were paid?",
    decisions_kind: "short",
    decisions_option_a: "",
    decisions_option_b: "",
    decisions_option_c: "",
    context_question: "What tone should the app's copy use?",
    context_kind: "mc",
    context_option_a: "Friendly and casual",
    context_option_b: "Formal and professional",
    context_option_c: "Playful",
  };
}

function mockWriteSpec(): DlaiWriteSpec {
  return {
    requirements_markdown: "# Requirements\nScope, decisions, and context as answered.",
    plan_markdown: "# Plan\n1. Build it\n   1.1 Sub-task",
    validation_markdown: "# Validation\n- Automated checks\n- Manual walkthrough",
  };
}

function makeMockLLM(latencyMs = 1): MockLLM {
  return new MockLLM(
    {
      dlai_interview: () => mockInterview(),
      dlai_write_spec: () => mockWriteSpec(),
    },
    undefined,
    latencyMs,
  );
}

/**
 * MockLLM (src/llm/client.ts) always reports zero token usage and a fixed configured latency, so this wraps it
 * to inject deterministic non-zero per-call usage and to record every request (fn/tier/effort) — lets the tests
 * assert usage/latency aggregation precisely and confirm tier/effort without touching client.ts.
 */
class UsageTrackingLLM implements LLM {
  readonly name = "usage-tracking";
  readonly models: LLM["models"];
  readonly requests: LLMRequest<unknown>[] = [];
  constructor(
    private inner: LLM,
    private perCall = { input_tokens: 10, output_tokens: 20 },
  ) {
    this.models = inner.models;
  }
  async structured<T>(req: LLMRequest<T>): Promise<LLMResponse<T>> {
    this.requests.push(req as LLMRequest<unknown>);
    const res = await this.inner.structured(req);
    return { ...res, usage: { input_tokens: this.perCall.input_tokens, output_tokens: this.perCall.output_tokens, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } };
  }
}

/** Recordable BaselineSimUser stub (per task: not the real LLM-backed makeBaselineSimUser) — records every
 * question it's asked, in call order, so tests can assert ordering/content, and answers deterministically. */
function makeStubSimUser(): { simUser: BaselineSimUser; calls: BaselineQuestion[] } {
  const calls: BaselineQuestion[] = [];
  const simUser: BaselineSimUser = async (q: BaselineQuestion): Promise<BaselineAnswer> => {
    calls.push(q);
    return { question: q, answer: q.kind === "mc" ? q.options[0]! : "a short answer" };
  };
  return { simUser, calls };
}

describe("dlai_sdd baseline", () => {
  it("(a) asks exactly 3 questions, in Scope → Decisions → Context order, when maxQuestions >= 3", async () => {
    const llm = new UsageTrackingLLM(makeMockLLM());
    const { simUser, calls } = makeStubSimUser();
    const result = await dlaiSdd.run(llm, { one_liner: ONE_LINER, simUser, maxQuestions: 5 });

    expect(calls).toHaveLength(3);
    expect(calls.map((q) => q.id)).toEqual(["scope", "decisions", "context"]);
    expect(result.questions).toHaveLength(3);
    expect(result.questions.map((a) => a.question.id)).toEqual(["scope", "decisions", "context"]);
  });

  it("(b) maxQuestions=2 drops Context; write_spec's prompt notes it skipped instead of fabricating an answer", async () => {
    const mock = makeMockLLM();
    const llm = new UsageTrackingLLM(mock);
    const { simUser, calls } = makeStubSimUser();
    const result = await dlaiSdd.run(llm, { one_liner: ONE_LINER, simUser, maxQuestions: 2 });

    expect(calls).toHaveLength(2);
    expect(calls.map((q) => q.id)).toEqual(["scope", "decisions"]);
    expect(result.questions).toHaveLength(2);

    const writeCall = mock.calls.find((c) => c.fn === "dlai_write_spec")!;
    expect(writeCall.user).toMatch(/CONTEXT: \(skipped/);
    expect(writeCall.user).not.toContain(mockInterview().context_question);
    // Scope and Decisions, having been asked, appear with their actual answers, not a skip marker
    expect(writeCall.user).not.toMatch(/SCOPE: \(skipped/);
    expect(writeCall.user).not.toMatch(/DECISIONS: \(skipped/);
  });

  it("(c) maxQuestions=1 drops Context and Decisions; only Scope is asked", async () => {
    const mock = makeMockLLM();
    const llm = new UsageTrackingLLM(mock);
    const { simUser, calls } = makeStubSimUser();
    const result = await dlaiSdd.run(llm, { one_liner: ONE_LINER, simUser, maxQuestions: 1 });

    expect(calls).toHaveLength(1);
    expect(calls.map((q) => q.id)).toEqual(["scope"]);
    expect(result.questions).toHaveLength(1);

    const writeCall = mock.calls.find((c) => c.fn === "dlai_write_spec")!;
    expect(writeCall.user).toMatch(/DECISIONS: \(skipped/);
    expect(writeCall.user).toMatch(/CONTEXT: \(skipped/);
  });

  it("(d) maxQuestions=0 asks nothing, but dlai_write_spec is still called with all three noted as skipped", async () => {
    const mock = makeMockLLM();
    const llm = new UsageTrackingLLM(mock);
    const { simUser, calls } = makeStubSimUser();
    const result = await dlaiSdd.run(llm, { one_liner: ONE_LINER, simUser, maxQuestions: 0 });

    expect(calls).toHaveLength(0);
    expect(result.questions).toHaveLength(0);
    expect(mock.calls.map((c) => c.fn)).toEqual(["dlai_interview", "dlai_write_spec"]);

    const writeCall = mock.calls.find((c) => c.fn === "dlai_write_spec")!;
    expect(writeCall.user).toMatch(/SCOPE: \(skipped/);
    expect(writeCall.user).toMatch(/DECISIONS: \(skipped/);
    expect(writeCall.user).toMatch(/CONTEXT: \(skipped/);
    // still produces a well-formed result even with zero questions asked
    expect(result.files).toHaveLength(3);
    expect(result.spec_text.length).toBeGreaterThan(0);
  });

  it("(e) maps mc kind to filtered non-empty options, and short kind to an empty options array", async () => {
    const llm = new UsageTrackingLLM(makeMockLLM());
    const { simUser, calls } = makeStubSimUser();
    await dlaiSdd.run(llm, { one_liner: ONE_LINER, simUser, maxQuestions: 3 });

    const scope = calls.find((q) => q.id === "scope")!;
    const decisions = calls.find((q) => q.id === "decisions")!;
    const context = calls.find((q) => q.id === "context")!;

    expect(scope.kind).toBe("mc");
    expect(scope.options).toEqual(["Dog, owner, and time", "Just the time"]); // empty scope_option_c filtered out

    expect(decisions.kind).toBe("short");
    expect(decisions.options).toEqual([]); // short kind never carries options, even though the schema always has the fields

    expect(context.kind).toBe("mc");
    expect(context.options).toEqual(["Friendly and casual", "Formal and professional", "Playful"]);
  });

  it("(f) assembles files and spec_text with requirements.md first", async () => {
    const llm = new UsageTrackingLLM(makeMockLLM());
    const { simUser } = makeStubSimUser();
    const result = await dlaiSdd.run(llm, { one_liner: ONE_LINER, simUser, maxQuestions: 3 });

    expect(result.baseline).toBe("dlai-sdd");
    expect(result.files.map((f) => f.name)).toEqual(["requirements.md", "plan.md", "validation.md"]);
    const spec = mockWriteSpec();
    expect(result.files[0]).toEqual({ name: "requirements.md", content: spec.requirements_markdown });
    expect(result.files[1]).toEqual({ name: "plan.md", content: spec.plan_markdown });
    expect(result.files[2]).toEqual({ name: "validation.md", content: spec.validation_markdown });
    expect(result.spec_text).toBe([spec.requirements_markdown, spec.plan_markdown, spec.validation_markdown].join("\n\n"));
  });

  it("(g) aggregates usage/latency across exactly the driver's 2 LLM calls, not simUser calls", async () => {
    const mock = makeMockLLM(1);
    const llm = new UsageTrackingLLM(mock, { input_tokens: 10, output_tokens: 20 });
    const { simUser } = makeStubSimUser();
    const result = await dlaiSdd.run(llm, { one_liner: ONE_LINER, simUser, maxQuestions: 3 });

    expect(result.usage.calls).toBe(2); // dlai_interview + dlai_write_spec only
    expect(result.usage.input_tokens).toBe(20); // 10 * 2, additive
    expect(result.usage.output_tokens).toBe(40); // 20 * 2, additive
    expect(result.latency_ms).toBeGreaterThan(0);
    expect(result.latency_ms).toBe(2); // 1ms * 2 calls, additive

    // simUser (the plain stub above) never touches the LLM at all, so this MockLLM instance only ever
    // recorded the driver's own 2 calls — the same reasoning applies to the real makeBaselineSimUser, whose
    // calls are tracked separately (its own `calls` array), never folded into a driver's BaselineUsage.
    expect(mock.calls).toHaveLength(2);
    expect(mock.calls.map((c) => c.fn)).toEqual(["dlai_interview", "dlai_write_spec"]);
  });

  it("uses tier 'strong' and effort 'medium' for both dlai_interview and dlai_write_spec", async () => {
    const llm = new UsageTrackingLLM(makeMockLLM());
    const { simUser } = makeStubSimUser();
    await dlaiSdd.run(llm, { one_liner: ONE_LINER, simUser, maxQuestions: 3 });

    expect(llm.requests.map((r) => r.fn)).toEqual(["dlai_interview", "dlai_write_spec"]);
    for (const r of llm.requests) {
      expect(r.tier).toBe("strong");
      expect(r.effort).toBe("medium");
    }
  });

  it("includes extra_context in both prompts when provided", async () => {
    const mock = makeMockLLM();
    const llm = new UsageTrackingLLM(mock);
    const { simUser } = makeStubSimUser();
    await dlaiSdd.run(llm, { one_liner: ONE_LINER, extra_context: "Walkers are all solo, no employees.", simUser, maxQuestions: 3 });

    const interviewCall = mock.calls.find((c) => c.fn === "dlai_interview")!;
    const writeCall = mock.calls.find((c) => c.fn === "dlai_write_spec")!;
    expect(interviewCall.user).toContain("Walkers are all solo, no employees.");
    expect(writeCall.user).toContain("Walkers are all solo, no employees.");
  });
});

// ---------- (h) verbatim system prompt check ----------
// These expected strings are typed here from docs/BASELINES.md's "dlai_sdd.ts — exact wording and wire format"
// section (the two blockquoted system prompts), NOT from the source course repo — see the licensing rationale
// in that doc. Any accidental edit/rephrase of the constants in dlai_sdd.ts will fail this test.

describe("system prompts match docs/BASELINES.md verbatim", () => {
  it("DLAI_INTERVIEW_SYSTEM matches character-for-character", () => {
    const expected = [
      "You are helping someone plan a new software feature using a lightweight, three-question spec-driven interview method (inspired by, but not copied from, a published course workflow: DeepLearning.AI's 'Spec-Driven Development with Coding Agents', built with JetBrains). The method always asks exactly three questions in a single batch, one from each of these fixed categories, before writing anything:",
      "1. Scope — what the feature collects, exposes, or does: fields, behaviour, data shape.",
      "2. Decisions — key choices that shape the build: what gets stored, who can see what, how input is checked, the overall interaction pattern.",
      "3. Context — tone, constraints, or anything else that shapes the spec: writing style, technical limits, open questions.",
      "Each question must be answerable with EITHER 2-4 short multiple-choice options OR a short free-text phrase. Write exactly three questions, one per category, given the one-line app description below. Return JSON only.",
    ].join("\n");
    expect(DLAI_INTERVIEW_SYSTEM).toBe(expected);
  });

  it("DLAI_WRITE_SPEC_SYSTEM matches character-for-character", () => {
    const expected =
      "Given the app description and the three answers below (Scope, Decisions, Context — some may be missing if skipped), write the app's specification as three short documents, following this lightweight spec-driven method: a requirements.md (Scope: what is and is not included; Decisions: choices made and why; Context: tone and constraints), a plan.md (numbered task groups appropriate to building this, each with numbered sub-tasks), and a validation.md (automated checks expected to pass; a manual walkthrough of behaviour and edge cases; a tone check if there is user-facing copy; a definition of done). Return JSON only.";
    expect(DLAI_WRITE_SPEC_SYSTEM).toBe(expected);
  });
});
