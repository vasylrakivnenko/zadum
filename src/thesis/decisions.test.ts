import { describe, it, expect } from "vitest";
import type { LLM } from "../llm/client.js";
import { saltCoin, judgeDesign, decisionTable, type DecisionTrial } from "./run_decisions.js";
import { INVOICING_PERTURBED_DECISION_PROBES, DECISION_PROBE_SETS } from "./decision_probes.js";

const probe = INVOICING_PERTURBED_DECISION_PROBES.find((p) => p.id === "p_delivery")!;

/** stub judge LLM that always answers `match` regardless of prompt */
function stubJudge(match: "first" | "second" | "both" | "asks" | "neither"): LLM {
  return {
    name: "stub",
    models: { strong: "s", fast: "f" },
    structured: async () => ({ data: { match, evidence: "stub" }, model: "s", latency_ms: 0, usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }, cached: false }),
  } as unknown as LLM;
}

describe("decision probes", () => {
  it("tasks never leak the decision or that alternatives exist", () => {
    for (const probes of Object.values(DECISION_PROBE_SETS))
      for (const p of probes) {
        expect(p.task).not.toMatch(/option|instead of|rather than|decide between|which way|default/i);
        expect(p.task.length).toBeLessThan(220);
      }
  });
  it("covers all three probe kinds", () => {
    const kinds = new Set(INVOICING_PERTURBED_DECISION_PROBES.map((p) => p.kind));
    expect(kinds).toEqual(new Set(["flip", "natural", "control"]));
    expect(INVOICING_PERTURBED_DECISION_PROBES.filter((p) => p.kind === "control").length).toBeGreaterThanOrEqual(2);
  });
});

describe("blind ordering", () => {
  it("saltCoin is deterministic and roughly balanced over salts", () => {
    expect(saltCoin("abc")).toBe(saltCoin("abc"));
    const heads = Array.from({ length: 200 }, (_, i) => saltCoin(`salt-${i}`)).filter(Boolean).length;
    expect(heads).toBeGreaterThan(60);
    expect(heads).toBeLessThan(140);
  });

  it("maps first/second back through the salt-determined order, so 'first' carries no signal", async () => {
    // find salts with opposite coin values
    let saltA = "x0";
    let saltB = "x1";
    for (let i = 0; saltCoin(saltA) === saltCoin(saltB) && i < 100; i++) saltB = `x${i + 2}`;
    expect(saltCoin(saltA)).not.toBe(saltCoin(saltB));
    const out = { reply: "r", plan: [] };
    // a judge that always says "first" must map to DIFFERENT picks under the two salts
    const a = await judgeDesign(stubJudge("first"), probe, out, saltA);
    const b = await judgeDesign(stubJudge("first"), probe, out, saltB);
    expect(new Set([a.picked, b.picked])).toEqual(new Set(["true", "default"]));
    // non-positional answers pass through unchanged
    expect((await judgeDesign(stubJudge("asks"), probe, out, saltA)).picked).toBe("asks");
    expect((await judgeDesign(stubJudge("both"), probe, out, saltB)).picked).toBe("both");
  });
});

describe("decisionTable", () => {
  it("reports each probe kind separately and excludes errored trials", () => {
    const mk = (arm: string, kind: DecisionTrial["kind"], picked: DecisionTrial["picked"], error?: string): DecisionTrial => ({
      gold: "g", agent_model: "m", arm, probe: "p", node: "n", kind, repeat: 0, node_resolved_in_bundle: false,
      agent: { reply: "", plan: [] }, judge: { match: "first", evidence: "" }, picked, ...(error ? { error } : {}),
    });
    const table = decisionTable([mk("c0", "flip", "default"), mk("c12", "flip", "true"), mk("c0", "control", "default"), mk("c12", "control", "default"), mk("c12", "flip", "true", "boom")], ["c0", "c12"]);
    expect(table).toContain("FLIP");
    expect(table).toContain("CONTROL");
    const flipC12 = table.split("CONTROL")[0]!.split("\n").find((l) => l.trim().startsWith("c12"))!;
    expect(flipC12).toContain("100%"); // 1/1 non-errored c12 flip trial followed the truth
  });
});
