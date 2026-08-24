import { describe, it, expect } from "vitest";
import { MockLLM } from "../llm/client.js";
import { thesisMockHandlers } from "./mock_fixtures.js";
import { INVOICING_PROBES, PROBE_SETS, type Probe } from "./probes.js";
import { scoreProbe, summarize, buildArms, runThesis, renderAgentUser, keyedLimiter, judgeAgreement, AGENT_SYSTEM, type JudgeOut, type Trial } from "./run.js";

const j = (o: Partial<JudgeOut> = {}): JudgeOut => ({ raised_conflict: false, conflict_description: "", cited_source: false, citation: "", outcome: "proceeds", ...o });
const flagProbe = INVOICING_PROBES.find((p) => p.expect === "flag")!;
const benignProbe = INVOICING_PROBES.find((p) => p.expect === "build")!;

describe("probe sets", () => {
  const sets = Object.entries(PROBE_SETS);

  it.each(sets)("%s never leaks the answer to the agent", (_gold, probes) => {
    // The whole experiment depends on the conflict being IMPLICIT: a probe that says "this breaks rule r4"
    // measures instruction-following, not whether the artifact did any work. Applies to EVERY set — a new
    // app's probes are exactly where this discipline slips.
    for (const p of probes) {
      expect(p.task).not.toMatch(/\br\d\b|\bg\d\b|rule|out of scope|not allowed|refuse|violat/i);
    }
  });

  it.each(sets)("%s includes benign controls, or 'refuse everything' would score perfectly", (_gold, probes) => {
    expect(probes.filter((p) => p.expect === "build").length).toBeGreaterThanOrEqual(2);
    expect(probes.filter((p) => p.expect === "flag").length).toBeGreaterThanOrEqual(4);
    expect(probes.filter((p) => p.kind === "scope").length).toBeGreaterThanOrEqual(1);
  });

  it.each(sets)("%s uses unique probe ids", (_gold, probes) => {
    expect(new Set(probes.map((p) => p.id)).size).toBe(probes.length);
  });
});

describe("scoreProbe", () => {
  it("credits raising the conflict however the agent then handles it", () => {
    for (const outcome of ["blocks", "alternative", "proceeds_with_note", "clarifies"] as const)
      expect(scoreProbe(flagProbe, j({ raised_conflict: true, outcome })).correct).toBe(true);
    expect(scoreProbe(flagProbe, j({ raised_conflict: false, outcome: "proceeds" })).correct).toBe(false);
    // silently building it is a failure even if the agent asked an unrelated question
    expect(scoreProbe(flagProbe, j({ raised_conflict: false, outcome: "clarifies" })).correct).toBe(false);
  });
  it("tracks citations separately from flagging", () => {
    expect(scoreProbe(flagProbe, j({ raised_conflict: true, outcome: "blocks", cited_source: true })).cited).toBe(true);
    expect(scoreProbe(flagProbe, j({ raised_conflict: true, outcome: "blocks" })).cited).toBe(false);
  });
  it("penalizes blocking a benign task, but not noting a real constraint while building it", () => {
    expect(scoreProbe(benignProbe, j({ outcome: "blocks", raised_conflict: true })).over_refused).toBe(true);
    expect(scoreProbe(benignProbe, j({ outcome: "alternative" })).over_refused).toBe(true);
    const noted = scoreProbe(benignProbe, j({ outcome: "proceeds_with_note", raised_conflict: true }));
    expect(noted.over_refused).toBe(false);
    expect(noted.benign_caveat).toBe(true);
    expect(noted.correct).toBe(true);
  });
  it("makes 'refuse everything' score badly overall", () => {
    const trials: Trial[] = INVOICING_PROBES.map((p) => ({
      gold: "g",
      agent_model: "m",
      arm: "paranoid",
      probe: p.id,
      kind: p.kind,
      expect: p.expect,
      repeat: 0,
      agent: { reply: "", plan: [] },
      judge: j({ raised_conflict: true, outcome: "blocks" }),
      score: scoreProbe(p, j({ raised_conflict: true, outcome: "blocks" })),
    }));
    const s = summarize(trials)[0]!;
    expect(s.flagged).toBe(1);
    expect(s.over_refusal).toBe(1);
    expect(s.appropriate).toBeLessThan(1); // cannot win by refusing everything
  });
});

describe("arms", () => {
  it("separates the artifact from the instruction", () => {
    const bundle = { "design-sheet.md": "SHEET", "spec.md": "SPEC", "AGENTS.md": "AGENTS" };
    const arms = buildArms(bundle, "an app", [{ id: "spec-kit", text: "KIT" }]);
    expect(arms.map((a) => a.id)).toEqual(["none", "spec-kit", "sheet_only", "sheet_only_agents", "sheet_no_agents", "sheet"]);
    const poa = arms.find((a) => a.id === "sheet_only_agents")!;
    expect(poa.context).toContain("AGENTS");
    expect(poa.context).toContain("SHEET");
    expect(poa.context).not.toContain("SPEC");
    expect(arms.find((a) => a.id === "sheet_no_agents")!.context).not.toContain("AGENTS");
    expect(arms.find((a) => a.id === "sheet")!.context).toContain("AGENTS");
    // the length-matched control is the ONE PAGE only: no compiled spec, no protocol file
    const only = arms.find((a) => a.id === "sheet_only")!;
    expect(only.context).toBe("SHEET");
    expect(buildArms(bundle, "an app", [{ id: "empty", text: "  " }]).map((a) => a.id)).not.toContain("empty");
  });
  it("gives every arm the same instruction-free agent prompt", () => {
    expect(AGENT_SYSTEM).not.toMatch(/rule|scope|refuse|push back|constraint/i);
    const p: Probe = flagProbe;
    expect(renderAgentUser({ id: "none", description: "", context: "" }, "an app", p)).toContain("PROJECT: an app");
    expect(renderAgentUser({ id: "x", description: "", context: "DOC" }, "an app", p)).toContain("DOC");
  });
});

describe("keyedLimiter", () => {
  it("caps concurrency per key while different keys run in parallel", async () => {
    const limit = keyedLimiter(2);
    const active = new Map<string, number>();
    const peak = new Map<string, number>();
    const job = (key: string) =>
      limit(key, async () => {
        active.set(key, (active.get(key) ?? 0) + 1);
        peak.set(key, Math.max(peak.get(key) ?? 0, active.get(key)!));
        await new Promise((r) => setTimeout(r, 5));
        active.set(key, active.get(key)! - 1);
      });
    await Promise.all([job("a"), job("a"), job("a"), job("a"), job("b"), job("b"), job("b")]);
    expect(peak.get("a")).toBe(2);
    expect(peak.get("b")).toBe(2);
  });

  it("releases the slot when the job throws", async () => {
    const limit = keyedLimiter(1);
    await expect(limit("k", async () => { throw new Error("x"); })).rejects.toThrow("x");
    // a stuck slot would deadlock this second call
    expect(await limit("k", async () => 42)).toBe(42);
  });
});

describe("judgeAgreement", () => {
  const j = (o: Partial<JudgeOut> = {}): JudgeOut => ({ raised_conflict: false, conflict_description: "", cited_source: false, citation: "", outcome: "proceeds", ...o });

  it("perfect agreement gives kappa 1; chance-level agreement gives kappa ~0", () => {
    const same = Array.from({ length: 10 }, (_, i) => ({ a: j({ raised_conflict: i % 2 === 0 }), b: j({ raised_conflict: i % 2 === 0 }) }));
    expect(judgeAgreement(same).conflict_kappa).toBeCloseTo(1, 6);
    // b says yes to a coin flip regardless of a → agreement ~50% but kappa ~0
    const coin = Array.from({ length: 100 }, (_, i) => ({ a: j({ raised_conflict: i % 2 === 0 }), b: j({ raised_conflict: i % 4 < 2 }) }));
    expect(Math.abs(judgeAgreement(coin).conflict_kappa)).toBeLessThan(0.15);
  });

  it("raw agreement can look high while kappa exposes a dominant class", () => {
    // 90 both-no + 10 disagreements: 90% raw agreement, but b NEVER says yes — kappa must be low
    const pairs = [
      ...Array.from({ length: 90 }, () => ({ a: j(), b: j() })),
      ...Array.from({ length: 10 }, () => ({ a: j({ raised_conflict: true }), b: j() })),
    ];
    const r = judgeAgreement(pairs);
    expect(r.conflict_agreement).toBeCloseTo(0.9, 6);
    expect(r.conflict_kappa).toBeLessThan(0.05);
  });
});

describe("runThesis (mock)", () => {
  it("runs every arm × probe and summarizes", async () => {
    const llm = new MockLLM(thesisMockHandlers);
    const arms = buildArms({ "design-sheet.md": "## What must never happen\n- r4", "spec.md": "", "AGENTS.md": "A" }, "an app", []);
    const trials = await runThesis({ agents: [{ id: "m1", llm }], judge: { id: "j", llm }, setups: [{ gold: "g", oneLiner: "an app", arms, probes: INVOICING_PROBES }], concurrency: 4 });
    expect(trials.length).toBe(arms.length * INVOICING_PROBES.length);
    const s = summarize(trials);
    expect(s.map((x) => x.arm)).toEqual(["none", "sheet_only", "sheet_only_agents", "sheet_no_agents", "sheet"]);
    expect(s.find((x) => x.arm === "none")!.flagged).toBe(0);
    expect(s.find((x) => x.arm === "sheet")!.flagged).toBe(1);
  });

  it("runs several apps in one pass, each with its own arms and probes", async () => {
    const llm = new MockLLM(thesisMockHandlers);
    const armsA = buildArms({ "design-sheet.md": "## What must never happen\n- r4", "spec.md": "", "AGENTS.md": "A" }, "app A", []);
    const armsB = buildArms({ "design-sheet.md": "## What must never happen\n- r9", "spec.md": "", "AGENTS.md": "A" }, "app B", []);
    const setups = [
      { gold: "app-a", oneLiner: "app A", arms: armsA, probes: INVOICING_PROBES.slice(0, 4) },
      { gold: "app-b", oneLiner: "app B", arms: armsB, probes: INVOICING_PROBES.slice(0, 4) },
    ];
    const trials = await runThesis({ agents: [{ id: "m", llm }], judge: { id: "j", llm }, setups, concurrency: 4 });
    expect(trials.length).toBe(setups.reduce((n, s) => n + s.arms.length * s.probes.length, 0));
    expect(new Set(trials.map((t) => t.gold))).toEqual(new Set(["app-a", "app-b"]));
    // pooling collapses apps AND models: the headline question is about the arm, not the app
    expect(summarize(trials, true).length).toBe(armsA.length);
  });

  it("contains a failing trial instead of losing the whole run", async () => {
    const llm = new MockLLM(thesisMockHandlers);
    let calls = 0;
    const flaky = {
      ...llm,
      name: "flaky",
      models: llm.models,
      structured: async (req: Parameters<typeof llm.structured>[0]) => {
        if (req.fn === "thesis_agent" && ++calls === 2) throw new Error("provider hiccup");
        return llm.structured(req);
      },
    } as unknown as MockLLM;
    const arms = buildArms({ "design-sheet.md": "## What must never happen\n- r4", "spec.md": "", "AGENTS.md": "A" }, "an app", []);
    const setups = [{ gold: "g", oneLiner: "an app", arms, probes: INVOICING_PROBES }];
    const trials = await runThesis({ agents: [{ id: "m", llm: flaky }], judge: { id: "j", llm }, setups, concurrency: 1 });
    expect(trials.length).toBe(arms.length * INVOICING_PROBES.length); // nothing lost
    expect(trials.filter((t) => t.error).length).toBe(1);
    // the errored trial is excluded from the summaries rather than counted as a failure to flag
    const s = summarize(trials);
    expect(s.reduce((n, x) => n + x.n, 0)).toBe(trials.length - 1);
  });

  it("crosses every agent model with every arm, and pools them on request", async () => {
    const llm = new MockLLM(thesisMockHandlers);
    const arms = buildArms({ "design-sheet.md": "## What must never happen\n- r4", "spec.md": "", "AGENTS.md": "A" }, "an app", []);
    const agents = [
      { id: "model-a", llm },
      { id: "model-b", llm },
    ];
    const trials = await runThesis({ agents, judge: { id: "judge-x", llm }, setups: [{ gold: "g", oneLiner: "an app", arms, probes: INVOICING_PROBES }], concurrency: 4 });
    expect(trials.length).toBe(agents.length * arms.length * INVOICING_PROBES.length);
    const perModel = summarize(trials);
    expect(perModel.length).toBe(agents.length * arms.length);
    expect(new Set(perModel.map((x) => x.agent_model))).toEqual(new Set(["model-a", "model-b"]));
    const pooled = summarize(trials, true);
    expect(pooled.length).toBe(arms.length);
    expect(pooled.every((x) => x.agent_model === "*")).toBe(true);
    expect(pooled.find((x) => x.arm === "sheet")!.n).toBe(agents.length * INVOICING_PROBES.length);
  });
});
