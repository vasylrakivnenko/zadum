import { describe, expect, it } from "vitest";
import { MockLLM } from "../llm/client.js";
import {
  alignDerivations,
  ambiguityMetrics,
  clampConsequence,
  saltCoin,
  type AlignedPair,
  type Derivation,
} from "./ambiguity.js";
import { builderMetrics } from "./builder_questions.js";
import { pairwiseStandings, runPairwise } from "./pairwise.js";
import { qualityMockHandlers } from "./mock_fixtures.js";
import { parseArgs, runQuality, summarize, topDivergences } from "./run.js";

const mockLlm = () => new MockLLM(qualityMockHandlers);

/** Find a salt with the wanted coin value so both presentation orders are exercised deterministically. */
function saltWhere(want: boolean): string {
  for (let i = 0; i < 10_000; i++) {
    const s = `salt-${i}`;
    if (saltCoin(s) === want) return s;
  }
  throw new Error("unreachable");
}

const derivationA: Derivation = {
  aspects: [
    { aspect: "invoice numbering", decision: "sequential integers per year", forced: false },
    { aspect: "auth", decision: "email plus password", forced: true },
  ],
};
const derivationB: Derivation = {
  aspects: [
    { aspect: "invoice numbering", decision: "random UUID identifiers", forced: false },
    { aspect: "auth", decision: "email plus password", forced: true },
  ],
};

describe("salt-randomized order", () => {
  it("saltCoin is deterministic and takes both values", () => {
    const coins = Array.from({ length: 200 }, (_, i) => saltCoin(`s${i}`));
    expect(coins).toEqual(Array.from({ length: 200 }, (_, i) => saltCoin(`s${i}`)));
    expect(coins).toContain(true);
    expect(coins).toContain(false);
  });

  it("alignDerivations maps FIRST/SECOND back to reader A/B under BOTH coin outcomes", async () => {
    for (const want of [true, false]) {
      const salt = saltWhere(want);
      const { swapped, pairs } = await alignDerivations(mockLlm(), derivationA, derivationB, salt);
      expect(swapped).toBe(want);
      const numbering = pairs.find((p) => p.aspect === "invoice numbering")!;
      // whichever order the judge saw, reading_a must be reader A's decision
      expect(numbering.reading_a).toBe("sequential integers per year");
      expect(numbering.reading_b).toBe("random UUID identifiers");
      expect(numbering.verdict).toBe("diverge_material");
    }
  });

  it("runPairwise maps first/second verdicts back to a/b under BOTH coin outcomes", async () => {
    const precise = "MOCK_PRECISE spec";
    const vague = "MOCK_VAGUE spec";
    for (const want of [true, false]) {
      const salt = saltWhere(want);
      const res = await runPairwise(mockLlm(), precise, vague, salt);
      expect(res.swapped).toBe(want);
      for (const d of Object.values(res.dimensions)) expect(d.winner).toBe("a");
      // and with the arguments reversed the same spec still wins, now as "b"
      const rev = await runPairwise(mockLlm(), vague, precise, salt);
      for (const d of Object.values(rev.dimensions)) expect(d.winner).toBe("b");
    }
  });
});

describe("spec_entropy arithmetic", () => {
  const pair = (verdict: AlignedPair["verdict"], consequence: number): AlignedPair => ({
    aspect: "x",
    reading_a: "a",
    reading_b: "b",
    verdict,
    consequence,
    note: "",
  });

  it("zero divergence → entropy 0", () => {
    const m = ambiguityMetrics(derivationA, derivationB, [pair("agree", 5), pair("agree", 3)]);
    expect(m.spec_entropy).toBe(0);
    expect(m.divergence_rate).toBe(0);
    expect(m.material).toBe(0);
  });

  it("all-material divergence → entropy 1", () => {
    const m = ambiguityMetrics(derivationA, derivationB, [pair("diverge_material", 4), pair("diverge_material", 2)]);
    expect(m.spec_entropy).toBe(1);
    expect(m.divergence_rate).toBe(1);
  });

  it("mixed case: consequence-weighted, cosmetic counts in the denominator only", () => {
    const m = ambiguityMetrics(derivationA, derivationB, [
      pair("diverge_material", 4),
      pair("agree", 2),
      pair("diverge_cosmetic", 2),
    ]);
    expect(m.spec_entropy).toBeCloseTo(4 / 8, 10);
    expect(m.divergence_rate).toBeCloseTo(1 / 3, 10);
    expect(m.cosmetic).toBe(1);
  });

  it("no matched aspects → 0, never NaN", () => {
    const m = ambiguityMetrics(derivationA, derivationB, [pair("unmatched", 3)]);
    expect(m.spec_entropy).toBe(0);
    expect(m.divergence_rate).toBe(0);
    expect(m.matched).toBe(0);
    expect(m.unmatched).toBe(1);
  });

  it("forced_rate pools both readers; consequence is clamped to 1..5", () => {
    const m = ambiguityMetrics(derivationA, derivationB, [pair("diverge_material", 99), pair("agree", -3)]);
    // 1 forced of 2 in each derivation → 2/4
    expect(m.forced_rate).toBeCloseTo(0.5, 10);
    // clamped: 5 / (5 + 1)
    expect(m.spec_entropy).toBeCloseTo(5 / 6, 10);
    expect(clampConsequence(0)).toBe(1);
    expect(clampConsequence(7)).toBe(5);
    expect(clampConsequence(3.4)).toBe(3);
    expect(clampConsequence(Number.NaN)).toBe(1);
  });
});

describe("builder questions metrics", () => {
  it("counts total, blocking, and the per-category histogram", () => {
    const m = builderMetrics({
      questions: [
        { q: "a?", category: "data_model", blocking: true },
        { q: "b?", category: "data_model", blocking: false },
        { q: "c?", category: "edge_case", blocking: true },
      ],
    });
    expect(m.total).toBe(3);
    expect(m.blocking).toBe(2);
    expect(m.by_category).toEqual({ data_model: 2, edge_case: 1 });
  });
});

describe("pairwise standings", () => {
  it("aggregates dimension-level wins with ties counting half", () => {
    const dims = (winner: "a" | "b" | "tie") =>
      Object.fromEntries(
        ["completeness_edge_cases", "unambiguity", "implementability", "internal_consistency"].map((d) => [d, { winner, evidence: "" }]),
      ) as never;
    const standings = pairwiseStandings([
      { a: "x", b: "y", dimensions: dims("a") },
      { a: "x", b: "y", dimensions: dims("tie") },
    ]);
    const x = standings.find((s) => s.name === "x")!;
    const y = standings.find((s) => s.name === "y")!;
    expect(x.wins).toBe(4);
    expect(x.ties).toBe(4);
    expect(x.comparisons).toBe(8);
    expect(x.win_rate).toBeCloseTo(6 / 8, 10);
    expect(y.win_rate).toBeCloseTo(2 / 8, 10);
  });
});

describe("CLI arg parsing", () => {
  it("parses --specs name=path lists with the documented defaults", () => {
    const a = parseArgs(["--specs", "spec-kit=x.md,zadum=out/spec.md"]);
    expect(a.specs).toEqual([
      { name: "spec-kit", path: "x.md" },
      { name: "zadum", path: "out/spec.md" },
    ]);
    expect(a.mock).toBe(false);
    expect(a.repeats).toBe(1);
    expect(a.readerModel).toBe("gpt-4.1");
    expect(a.judgeModel).toBe("claude-sonnet-4-6");
    expect(a.outDir).toBe("quality-results");
  });

  it("parses overrides and --mock", () => {
    const a = parseArgs(["--mock", "--specs", "a=1.md", "--repeats", "3", "--judge-model", "gpt-4o", "--reader-model", "gpt-4.1", "--out", "tmp"]);
    expect(a.mock).toBe(true);
    expect(a.repeats).toBe(3);
    expect(a.judgeModel).toBe("gpt-4o");
    expect(a.outDir).toBe("tmp");
  });

  it("rejects missing --specs, malformed entries, and duplicate names", () => {
    expect(() => parseArgs([])).toThrow(/--specs/);
    expect(() => parseArgs(["--specs", "no-equals"])).toThrow(/name=path/);
    expect(() => parseArgs(["--specs", "a=1.md,a=2.md"])).toThrow(/unique/);
  });
});

describe("error containment", () => {
  it("records failed trials, excludes them from summaries, and counts them", async () => {
    const llm = mockLlm();
    const res = await runQuality({
      specs: [
        { name: "good", text: "MOCK_PRECISE spec" },
        { name: "bad", text: "MOCK_ERROR_IMPLEMENTER MOCK_ERROR_BUILDER MOCK_ERROR_PAIRWISE" },
      ],
      reader: { id: "r", llm },
      judge: { id: "j", llm },
      repeats: 1,
    });
    // bad's ambiguity + builder trials fail; the good↔bad matchup fails because the bad text carries the marker
    expect(res.errors).toBe(3);
    expect(res.ambiguity.find((r) => r.spec === "bad")?.error).toMatch(/mock implementer failure/);
    expect(res.builder.find((r) => r.spec === "bad")?.error).toMatch(/mock builder failure/);
    expect(res.pairwise[0]?.error).toMatch(/mock pairwise failure/);
    const bad = res.summaries.find((s) => s.name === "bad")!;
    expect(bad.n).toBe(0); // no clean ambiguity trials contribute
    expect(bad.errors).toBe(3);
    const good = res.summaries.find((s) => s.name === "good")!;
    expect(good.n).toBe(1);
    expect(good.spec_entropy).toBe(0);
  });
});

describe("end-to-end (mock)", () => {
  it("ranks the precise spec above the vague one on every instrument", async () => {
    const llm = mockLlm();
    const res = await runQuality({
      specs: [
        { name: "vague", text: "MOCK_VAGUE invoicing app" },
        { name: "precise", text: "MOCK_PRECISE invoicing app" },
      ],
      reader: { id: "r", llm },
      judge: { id: "j", llm },
      repeats: 2,
    });
    expect(res.errors).toBe(0);
    expect(res.summaries.map((s) => s.name)).toEqual(["precise", "vague"]);
    const precise = res.summaries[0]!;
    const vague = res.summaries[1]!;
    expect(precise.n).toBe(2);
    expect(precise.spec_entropy).toBe(0);
    expect(precise.builder_questions).toBe(0);
    expect(precise.forced_rate).toBe(1);
    // mock vague: material numbering(4) + deletion(4) over matched {4,2,4} → 0.8
    expect(vague.spec_entropy).toBeCloseTo(0.8, 10);
    expect(vague.material_divergences).toBe(2);
    expect(vague.builder_questions).toBe(3);
    expect(vague.builder_blocking).toBe(2);
    // pairwise: precise sweeps all 4 dimensions × 2 repeats
    expect(precise.pairwise_win_rate).toBe(1);
    expect(vague.pairwise_win_rate).toBe(0);
    // the located imprecisions carry both readings verbatim
    const top = topDivergences(res.ambiguity);
    expect(top.length).toBe(4); // 2 divergences × 2 repeats
    expect(top[0]!.reading_a).not.toBe(top[0]!.reading_b);
    // stored raw observations allow offline re-scoring
    expect(summarize(
      [
        { name: "vague", text: "MOCK_VAGUE invoicing app" },
        { name: "precise", text: "MOCK_PRECISE invoicing app" },
      ],
      res.ambiguity,
      res.builder,
      res.pairwise,
    )).toEqual(res.summaries);
  });
});
