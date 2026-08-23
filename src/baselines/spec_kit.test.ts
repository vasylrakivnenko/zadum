import { describe, expect, it } from "vitest";
import { MockLLM } from "../llm/client.js";
import type { MockHandler } from "../llm/client.js";
import { specKitBaseline } from "./spec_kit.js";
import type { BaselineInput, BaselineQuestion, BaselineSimUser } from "./types.js";

/**
 * Deterministic stand-in for `makeBaselineSimUser` — no LLM call, no gold truth needed. Picks the first
 * option for MC questions and a fixed short phrase otherwise, and records every question it was asked so
 * tests can assert on call count and sequencing.
 */
function makeStubSimUser(): { simUser: BaselineSimUser; asked: BaselineQuestion[] } {
  const asked: BaselineQuestion[] = [];
  const simUser: BaselineSimUser = async (q: BaselineQuestion) => {
    asked.push(q);
    return { question: q, answer: q.kind === "mc" ? q.options[0]! : "a short answer" };
  };
  return { simUser, asked };
}

function baseInput(overrides: Partial<BaselineInput> = {}): Omit<BaselineInput, "simUser"> {
  return {
    one_liner: "An app for booking dog walks",
    maxQuestions: 10,
    ...overrides,
  };
}

describe("specKitBaseline", () => {
  it("(a) 0 specify-clarifications, 2 clarify-loop questions ending in done:true", async () => {
    const { simUser, asked } = makeStubSimUser();
    const askHandler: MockHandler = (_req, idx) => {
      if (idx === 0) return { done: false, question: "Do walkers need a background check?", kind: "mc", option_a: "Yes", option_b: "No", option_c: "", option_d: "" };
      if (idx === 1) return { done: false, question: "How are walkers paid?", kind: "short", option_a: "", option_b: "", option_c: "", option_d: "" };
      return { done: true, question: "", kind: "short", option_a: "", option_b: "", option_c: "", option_d: "" };
    };
    const applyHandler: MockHandler = (_req, idx) => ({ updated_spec_markdown: idx === 0 ? "SPEC v1" : "SPEC v2" });

    const llm = new MockLLM({
      speckit_specify_draft: () => ({ spec_markdown: "SPEC v0", clarification_count: 0, clarifications: [] }),
      speckit_clarify_ask: askHandler,
      speckit_clarify_apply: applyHandler,
      // speckit_specify_finalize deliberately has NO handler: if the driver called it despite
      // clarification_count being 0, MockLLM would throw "no handler for fn" and fail this test.
    });

    const result = await specKitBaseline.run(llm, { ...baseInput(), simUser });

    expect(asked.length).toBe(2);
    expect(result.questions.length).toBe(2);
    expect(result.questions[0]!.question.question).toBe("Do walkers need a background check?");
    expect(result.questions[1]!.answer).toBe("a short answer");
    expect(result.spec_text).toBe("SPEC v2");
    expect(result.files).toEqual([{ name: "spec.md", content: "SPEC v2" }]);
    expect(llm.calls.filter((c) => c.fn === "speckit_specify_finalize").length).toBe(0);
    expect(llm.calls.filter((c) => c.fn === "speckit_clarify_ask").length).toBe(3);
    expect(llm.calls.filter((c) => c.fn === "speckit_clarify_apply").length).toBe(2);
  });

  it("(b) 2 specify-clarifications AND clarify-loop questions; finalize gets resolved Q&A; ask calls are sequenced", async () => {
    const { simUser } = makeStubSimUser();

    const llm = new MockLLM({
      speckit_specify_draft: () => ({
        spec_markdown: "DRAFT [NEEDS CLARIFICATION: color] [NEEDS CLARIFICATION: lang]",
        clarification_count: 2,
        clarifications: [
          { id: "c1", question: "Which color scheme?", option_a: "Light", option_b: "Dark", option_c: "" },
          { id: "c2", question: "Does it need multi-language support?", option_a: "Yes", option_b: "No", option_c: "" },
        ],
      }),
      speckit_specify_finalize: () => ({ spec_markdown: "FINAL SPEC v1" }),
      speckit_clarify_ask: ((_req, idx) => {
        if (idx === 0) return { done: false, question: "Any additional login options?", kind: "mc", option_a: "Google", option_b: "Email", option_c: "", option_d: "" };
        if (idx === 1) return { done: false, question: "Should invites expire?", kind: "mc", option_a: "Yes", option_b: "No", option_c: "", option_d: "" };
        return { done: true, question: "", kind: "short", option_a: "", option_b: "", option_c: "", option_d: "" };
      }) satisfies MockHandler,
      speckit_clarify_apply: ((_req, idx) => ({ updated_spec_markdown: idx === 0 ? "FINAL SPEC v2" : "FINAL SPEC v3" })) satisfies MockHandler,
    });

    const result = await specKitBaseline.run(llm, { ...baseInput(), simUser });

    // 2 specify Q&A + 2 clarify-loop Q&A, in order
    expect(result.questions.length).toBe(4);
    expect(result.questions[0]!.question.id).toBe("c1");
    expect(result.questions[0]!.answer).toBe("Light");
    expect(result.questions[1]!.answer).toBe("Yes");

    // finalize receives the resolved specify-phase Q&A
    const finalizeCall = llm.calls.find((c) => c.fn === "speckit_specify_finalize")!;
    expect(finalizeCall.user).toContain("Which color scheme?");
    expect(finalizeCall.user).toContain("Light");
    expect(finalizeCall.user).toContain("Does it need multi-language support?");
    expect(finalizeCall.user).toContain("Yes");

    // sequencing: the SECOND clarify_ask call's prompt must contain the FIRST round's question + answer
    const askCalls = llm.calls.filter((c) => c.fn === "speckit_clarify_ask");
    expect(askCalls.length).toBe(3);
    expect(askCalls[1]!.user).toContain("Any additional login options?");
    expect(askCalls[1]!.user).toContain("Google");
    // and clarify_apply's output feeds the next "current spec" — final result reflects the last apply
    expect(result.spec_text).toBe("FINAL SPEC v3");
  });

  it("(c) maxQuestions caps total simUser calls across BOTH phases even when the model always asks for more", async () => {
    const { simUser, asked } = makeStubSimUser();

    const llm = new MockLLM({
      // always tries to ask for 3, regardless of the cap
      speckit_specify_draft: () => ({
        spec_markdown: "DRAFT",
        clarification_count: 3,
        clarifications: [
          { id: "c1", question: "Q1?", option_a: "A", option_b: "B", option_c: "" },
          { id: "c2", question: "Q2?", option_a: "A", option_b: "B", option_c: "" },
          { id: "c3", question: "Q3?", option_a: "A", option_b: "B", option_c: "" },
        ],
      }),
      speckit_specify_finalize: () => ({ spec_markdown: "FINAL" }),
      // always claims not-done, trying to keep the clarify loop going forever
      speckit_clarify_ask: () => ({ done: false, question: "Another one?", kind: "mc", option_a: "A", option_b: "B", option_c: "", option_d: "" }),
      speckit_clarify_apply: () => ({ updated_spec_markdown: "FINAL v2" }),
    });

    const result = await specKitBaseline.run(llm, { ...baseInput({ maxQuestions: 2 }), simUser });

    expect(asked.length).toBe(2); // hard cap, not the model's "3" or infinite "not done"
    expect(result.questions.length).toBe(2);
    expect(result.questions.map((q) => q.question.id)).toEqual(["c1", "c2"]);
    // the clarify loop must never even be entered — no budget left after the specify phase spent it
    expect(llm.calls.filter((c) => c.fn === "speckit_clarify_ask").length).toBe(0);
  });

  it("(d) clarification_count/array length mismatch clamps to the array's actual length", async () => {
    const { simUser, asked } = makeStubSimUser();

    const llm = new MockLLM({
      // model claims 5 clarifications but only provides 2 — must not crash or fabricate the missing 3
      speckit_specify_draft: () => ({
        spec_markdown: "DRAFT",
        clarification_count: 5,
        clarifications: [
          { id: "c1", question: "Q1?", option_a: "A", option_b: "B", option_c: "" },
          { id: "c2", question: "Q2?", option_a: "A", option_b: "B", option_c: "" },
        ],
      }),
      speckit_specify_finalize: () => ({ spec_markdown: "FINAL" }),
      speckit_clarify_ask: () => ({ done: true, question: "", kind: "short", option_a: "", option_b: "", option_c: "", option_d: "" }),
    });

    const result = await specKitBaseline.run(llm, { ...baseInput({ maxQuestions: 10 }), simUser });

    expect(asked.length).toBe(2); // clamped to clarifications.length, not the declared count of 5
    expect(result.questions.map((q) => q.question.id)).toEqual(["c1", "c2"]);
  });

  it("(e) usage and latency_ms are aggregated (additive) across every call made", async () => {
    const { simUser } = makeStubSimUser();
    const PER_CALL_LATENCY = 5;

    const llm = new MockLLM(
      {
        speckit_specify_draft: () => ({ spec_markdown: "SPEC v0", clarification_count: 0, clarifications: [] }),
        speckit_clarify_ask: ((_req, idx) =>
          idx === 0
            ? { done: false, question: "One question?", kind: "short", option_a: "", option_b: "", option_c: "", option_d: "" }
            : { done: true, question: "", kind: "short", option_a: "", option_b: "", option_c: "", option_d: "" }) satisfies MockHandler,
        speckit_clarify_apply: () => ({ updated_spec_markdown: "SPEC v1" }),
      },
      { strong: "mock-strong", fast: "mock-fast" },
      PER_CALL_LATENCY,
    );

    const result = await specKitBaseline.run(llm, { ...baseInput(), simUser });

    // draft(1) + ask(idx0, not done)(1) + apply(1) + ask(idx1, done)(1) = 4 driver LLM calls
    const expectedCalls = 4;
    expect(llm.calls.length).toBe(expectedCalls);
    expect(result.usage.calls).toBe(expectedCalls);
    expect(result.usage.calls).toBeGreaterThan(0);
    expect(result.latency_ms).toBe(expectedCalls * PER_CALL_LATENCY);
    expect(result.latency_ms).toBeGreaterThan(0);
  });

  it("(f) the real vendored command text drives the simulation, not a paraphrase", async () => {
    const { simUser } = makeStubSimUser();

    const llm = new MockLLM({
      speckit_specify_draft: () => ({ spec_markdown: "SPEC", clarification_count: 0, clarifications: [] }),
      speckit_clarify_ask: () => ({ done: true, question: "", kind: "short", option_a: "", option_b: "", option_c: "", option_d: "" }),
    });

    await specKitBaseline.run(llm, { ...baseInput(), simUser });

    const draftCall = llm.calls.find((c) => c.fn === "speckit_specify_draft")!;
    const askCall = llm.calls.find((c) => c.fn === "speckit_clarify_ask")!;
    // distinctive lines lifted verbatim from the vendored specify.md / clarify.md files
    expect(draftCall.system).toContain("LIMIT: Maximum 3 [NEEDS CLARIFICATION] markers total");
    expect(askCall.system).toContain("Maximum of 5 total questions across the whole session.");
  });
});
