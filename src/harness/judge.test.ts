import { describe, it, expect } from "vitest";
import { MockLLM } from "../llm/client.js";
import { semanticListRecall, semanticRecall, renderJudgePrompt, type JudgeRecallOut } from "./judge.js";

function llmReturning(matches: JudgeRecallOut["matches"]): MockLLM {
  return new MockLLM({ judge_recall: () => ({ matches }) });
}

describe("renderJudgePrompt", () => {
  it("numbers both lists from 0 and labels an empty produced list", () => {
    const text = renderJudgePrompt("rules", ["a", "b"], []);
    expect(text).toContain("KIND: rules");
    expect(text).toContain("0. a");
    expect(text).toContain("1. b");
    expect(text).toContain("(nothing produced)");
  });
});

describe("semanticListRecall", () => {
  it("returns recall 1 for empty gold (nothing to miss) without calling the model", async () => {
    const llm = llmReturning([{ gold_index: 0, produced_index: 0, confidence: 1 }]);
    const r = await semanticListRecall(llm, "rules", [], ["anything"]);
    expect(r.recall).toBe(1);
    expect(llm.calls).toHaveLength(0);
  });

  it("returns recall 0 for non-empty gold with nothing produced, without calling the model", async () => {
    const llm = llmReturning([]);
    const r = await semanticListRecall(llm, "rules", ["a rule"], []);
    expect(r.recall).toBe(0);
    expect(llm.calls).toHaveLength(0);
    expect(r.detail[0]).toMatchObject({ matched_produced_index: null, confidence: 0 });
  });

  it("counts a confident match and computes fractional recall correctly", async () => {
    const llm = llmReturning([{ gold_index: 0, produced_index: 2, confidence: 0.9 }]);
    const r = await semanticListRecall(llm, "rules", ["gold A", "gold B", "gold C", "gold D"], ["p0", "p1", "matches gold A", "p3"]);
    expect(r.recall).toBe(0.25); // 1 of 4
    expect(r.detail[0]).toMatchObject({ matched_produced_index: 2, matched_item: "matches gold A", confidence: 0.9 });
    expect(r.detail[1]).toMatchObject({ matched_produced_index: null });
  });

  it("drops matches below confidence 0.5 rather than forcing a weak match", async () => {
    const llm = llmReturning([{ gold_index: 0, produced_index: 0, confidence: 0.4 }]);
    const r = await semanticListRecall(llm, "rules", ["gold A"], ["weakly related"]);
    expect(r.recall).toBe(0);
  });

  it("ignores out-of-range indices instead of crashing (defensive against a misbehaving model)", async () => {
    const llm = llmReturning([
      { gold_index: 99, produced_index: 0, confidence: 0.9 },
      { gold_index: 0, produced_index: 99, confidence: 0.9 },
      { gold_index: -1, produced_index: 0, confidence: 0.9 },
    ]);
    const r = await semanticListRecall(llm, "rules", ["gold A"], ["p0"]);
    expect(r.recall).toBe(0);
  });

  it("keeps the highest-confidence match when the model reports more than one candidate for the same gold item", async () => {
    const llm = llmReturning([
      { gold_index: 0, produced_index: 0, confidence: 0.6 },
      { gold_index: 0, produced_index: 1, confidence: 0.95 },
    ]);
    const r = await semanticListRecall(llm, "rules", ["gold A"], ["p0", "p1"]);
    expect(r.detail[0]).toMatchObject({ matched_produced_index: 1, confidence: 0.95 });
  });
});

describe("semanticRecall", () => {
  it("returns all-1 without calling the model when the gold has no sheet", async () => {
    const llm = llmReturning([]);
    const r = await semanticRecall(llm, { actors: ["x"], nouns: [], rules: [], non_goals: [] }, undefined);
    expect(r).toEqual({ actors: 1, nouns: 1, rules: 1, non_goals: 1 });
    expect(llm.calls).toHaveLength(0);
  });

  it("computes all four lists independently in parallel", async () => {
    const llm = new MockLLM({
      judge_recall: (req) => {
        const kind = /KIND: (.+)/.exec(req.user as string)?.[1] ?? "";
        if (kind.includes("actor")) return { matches: [{ gold_index: 0, produced_index: 0, confidence: 1 }] };
        return { matches: [] };
      },
    });
    // signature is (llm, produced, gold): produced has an actor but nothing else; gold expects one of each
    const r = await semanticRecall(
      llm,
      { actors: ["Founder"], nouns: [], rules: [], non_goals: [] },
      { actors: ["Owner"], nouns: ["Thing"], rules: ["Rule"], non_goals: ["Excluded"] },
    );
    expect(r.actors).toBe(1); // matched
    expect(r.nouns).toBe(0); // gold has 1, nothing produced
    expect(r.rules).toBe(0);
    expect(r.non_goals).toBe(0);
    // nouns/rules/non_goals short-circuit on empty `produced` without calling the model (see semanticListRecall);
    // only actors (non-empty on both sides) actually invokes the judge
    expect(llm.calls).toHaveLength(1);
  });
});
