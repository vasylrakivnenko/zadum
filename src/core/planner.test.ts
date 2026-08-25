import { describe, it, expect } from "vitest";
import { planInteractions, residualUncertainty, DEFAULT_REVIEW_ATTENTION } from "./planner.js";
import { DEFAULT_SELECTOR_CONFIG } from "./selector.js";
import type { Belief, World } from "./worlds.js";
import type { NodeDef } from "./catalog.js";

const node = (id: string, consequence: number, options = ["a", "b"]): NodeDef => ({
  id,
  topic: id,
  question: `${id}?`,
  options: options.map((o) => ({ id: o, label: o.toUpperCase() })),
  consequence,
  prior: Object.fromEntries(options.map((o) => [o, 1 / options.length])),
  implies: Object.fromEntries(options.map((o) => [o, []])),
  sections: [],
  bespoke: false,
  archetype: "core",
});

const world = (id: string, assignment: Record<string, string>, weight: number): World => ({ id, assignment, weight, origin: "sampled" });

/** split: worlds disagree 50/50 on `open1`; `def1` is near-unanimous; `def2` is genuinely uncertain. */
function belief(): Belief {
  const nodes = [node("open1", 5), node("def1", 4), node("def2", 3)];
  const worlds = [
    world("w1", { open1: "a", def1: "a", def2: "a" }, 0.25),
    world("w2", { open1: "a", def1: "a", def2: "b" }, 0.25),
    world("w3", { open1: "b", def1: "a", def2: "a" }, 0.25),
    world("w4", { open1: "b", def1: "a", def2: "b" }, 0.25),
  ];
  return { nodes, worlds, alpha: 0.08 };
}

describe("unified interaction planner", () => {
  it("ranks a card, a story check and a review tap on one comparable scale", () => {
    const plan = planInteractions(belief(), DEFAULT_SELECTOR_CONFIG, { openIds: ["open1"], defaultedIds: ["def1", "def2"], cardsRemaining: 12 });
    expect(plan.map((p) => p.kind).sort()).toEqual(["card", "review", "verify"]);
    expect(plan.every((p) => Number.isFinite(p.value) && p.value >= 0)).toBe(true);
    // best-first
    for (let i = 1; i < plan.length; i++) expect(plan[i - 1]!.value).toBeGreaterThanOrEqual(plan[i]!.value);
    for (const p of plan) expect(p.why.length).toBeGreaterThan(10); // every option explains itself
  });

  it("offers no card when the round's budget is spent, but still offers the other two", () => {
    const plan = planInteractions(belief(), DEFAULT_SELECTOR_CONFIG, { openIds: ["open1"], defaultedIds: ["def1", "def2"], cardsRemaining: 0 });
    expect(plan.map((p) => p.kind)).not.toContain("card");
    expect(plan.map((p) => p.kind)).toContain("verify");
  });

  it("a story check covering several assumptions outranks a single review tap on the same belief", () => {
    const plan = planInteractions(belief(), DEFAULT_SELECTOR_CONFIG, { openIds: [], defaultedIds: ["def1", "def2"], cardsRemaining: 0 });
    const verify = plan.find((p) => p.kind === "verify")!;
    const review = plan.find((p) => p.kind === "review")!;
    expect(verify.value).toBeGreaterThan(review.value);
    expect(verify.nodes.length).toBeGreaterThanOrEqual(1);
  });

  it("review value scales with attention — a skim is worth less than an answer", () => {
    const base = planInteractions(belief(), DEFAULT_SELECTOR_CONFIG, { openIds: [], defaultedIds: ["def2"], cardsRemaining: 0, reviewAttention: DEFAULT_REVIEW_ATTENTION });
    const attentive = planInteractions(belief(), DEFAULT_SELECTOR_CONFIG, { openIds: [], defaultedIds: ["def2"], cardsRemaining: 0, reviewAttention: 1 });
    const v = (ps: ReturnType<typeof planInteractions>) => ps.find((p) => p.kind === "review")!.value;
    expect(v(attentive)).toBeGreaterThan(v(base));
    expect(v(attentive) / v(base)).toBeCloseTo(1 / DEFAULT_REVIEW_ATTENTION, 5);
  });

  it("is deterministic and empty-safe", () => {
    const b = belief();
    expect(planInteractions(b, DEFAULT_SELECTOR_CONFIG, { openIds: [], defaultedIds: [], cardsRemaining: 12 })).toEqual([]);
    const a1 = planInteractions(b, DEFAULT_SELECTOR_CONFIG, { openIds: ["open1"], defaultedIds: ["def2"], cardsRemaining: 3 });
    const a2 = planInteractions(b, DEFAULT_SELECTOR_CONFIG, { openIds: ["open1"], defaultedIds: ["def2"], cardsRemaining: 3 });
    expect(JSON.stringify(a1)).toBe(JSON.stringify(a2));
  });

  it("residualUncertainty ranks the genuinely-open assumption above the near-settled one", () => {
    const r = residualUncertainty(belief(), ["def1", "def2"]);
    expect(r[0]!.node).toBe("def2");
    expect(r[0]!.bits).toBeGreaterThan(r[1]!.bits);
    expect(r[1]!.maxP).toBeGreaterThan(0.9); // def1 is unanimous across worlds
  });
});
