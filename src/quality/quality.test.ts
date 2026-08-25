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
import {
  alignLabels,
  builderMetrics,
  classifyBuilderQuestions,
  renderQuestions,
  type BuilderOut,
} from "./builder_questions.js";
import { lengthBias, pairwiseStandings, runPairwise } from "./pairwise.js";
import { qualityMockHandlers } from "./mock_fixtures.js";
import { parseArgs, questionTable, runQuality, summarize, topDivergences } from "./run.js";
import { formatSpread, spread } from "./stats.js";

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
    // roughly balanced, not merely "both values appear"
    const heads = coins.filter(Boolean).length;
    expect(heads).toBeGreaterThan(70);
    expect(heads).toBeLessThan(130);
  });

  it("saltCoin avalanches: it is NOT the parity of the character sum", () => {
    // The old h*31+c hash reduced mod 2 to exactly that parity, so these three salts — same characters,
    // different arrangement — all fell the same way, and a seed prefix flipped a whole run in lockstep.
    const anagrams = ["amb:zadum-new:0", "amb:zadum-new:0".split("").reverse().join(""), "0:amb:zadum-new"];
    expect(new Set(anagrams.map(saltCoin)).size).toBe(2);
    // consecutive repeats of one spec must not alternate mechanically
    const perRepeat = [0, 1, 2, 3].map((r) => saltCoin(`amb:zadum-new:${r}:align`));
    expect(perRepeat).not.toEqual([true, false, true, false]);
    expect(perRepeat).not.toEqual([false, true, false, true]);
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
  const out: BuilderOut = {
    questions: [
      { q: "a?", category: "data_model", blocking: true },
      { q: "b?", category: "data_model", blocking: false },
      { q: "c?", category: "edge_case", blocking: true },
    ],
  };

  it("counts total, blocking, and the per-category histogram", () => {
    const m = builderMetrics(out);
    expect(m.total).toBe(3);
    expect(m.blocking).toBe(2);
    expect(m.by_category).toEqual({ data_model: 2, edge_case: 1 });
    // no classification supplied → no taxonomy, so old (pre-classification) runs re-score without inventing labels
    expect(m.taxonomy).toBeUndefined();
  });

  it("splits classified questions into answered / flagged / genuine, and counts blocking gaps", () => {
    const m = builderMetrics(
      out,
      alignLabels(out, {
        labels: [
          { index: 1, label: "answered_in_spec", evidence: "the spec says X" },
          { index: 2, label: "flagged_assumption", evidence: "assumed · 60%" },
          { index: 3, label: "genuine_gap", evidence: "" },
        ],
      }),
    );
    expect(m.total).toBe(3); // raw count unchanged — stored, just no longer the headline
    expect(m.taxonomy).toEqual({
      answered_in_spec: 1,
      flagged_assumption: 1,
      genuine_gap: 1,
      genuine_gap_blocking: 1, // question c is both blocking and a genuine gap; question a is blocking but answered
      unclassified: 0,
    });
  });

  it("alignLabels maps by index, ignores junk, and defaults missing entries to genuine_gap", () => {
    const c = alignLabels(out, {
      labels: [
        { index: 3, label: "flagged_assumption", evidence: "e3" }, // out of order — index, not position, decides
        { index: 9, label: "answered_in_spec", evidence: "out of range" },
        { index: 3, label: "answered_in_spec", evidence: "duplicate, ignored" },
      ],
    });
    expect(c.labels).toEqual(["genuine_gap", "genuine_gap", "flagged_assumption"]);
    expect(c.evidence[2]).toBe("e3");
    // the two unlabelled questions default to the label that counts AGAINST the spec, and are flagged as such
    expect(c.unclassified).toBe(2);
  });

  it("classification is skipped (no LLM call) when there are no questions", async () => {
    const llm = mockLlm();
    const c = await classifyBuilderQuestions(llm, "MOCK_PRECISE", { questions: [] }, "s");
    expect(c.labels).toEqual([]);
    expect(llm.calls.length).toBe(0);
  });

  it("the mock classifier labels the SAME question differently against different specs", async () => {
    const q: BuilderOut = { questions: [{ q: "How should invoices be numbered?", category: "data_model", blocking: true }] };
    expect(renderQuestions(q)).toBe("1. How should invoices be numbered?");
    const ledger = await classifyBuilderQuestions(mockLlm(), "MOCK_LEDGER spec", q, "s");
    const vague = await classifyBuilderQuestions(mockLlm(), "MOCK_VAGUE spec", q, "s");
    expect(ledger.labels).toEqual(["answered_in_spec"]);
    expect(vague.labels).toEqual(["genuine_gap"]);
  });
});

describe("per-repeat spread", () => {
  it("reports mean, min, max and sample stdev over the per-trial values", () => {
    const s = spread([0.1, 0.35]);
    expect(s.n).toBe(2);
    expect(s.mean).toBeCloseTo(0.225, 10);
    expect(s.min).toBe(0.1);
    expect(s.max).toBe(0.35);
    expect(s.sd).toBeCloseTo(Math.sqrt((0.125 ** 2 + 0.125 ** 2) / 1), 10);
    expect(s.values).toEqual([0.1, 0.35]);
    expect(formatSpread(s)).toBe("0.22 [0.10–0.35] ±0.18");
  });

  it("degenerates safely: n=1 has no spread, n=0 has nothing to report", () => {
    expect(spread([0.2])).toEqual({ n: 1, mean: 0.2, min: 0.2, max: 0.2, sd: 0, values: [0.2] });
    expect(formatSpread(spread([0.2]))).toBe("0.20 (n=1)");
    expect(spread([])).toEqual({ n: 0, mean: 0, min: 0, max: 0, sd: 0, values: [] });
    expect(formatSpread(spread([]))).toBe("—");
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

describe("length bias diagnostic", () => {
  const dims = (winner: "a" | "b" | "tie") =>
    Object.fromEntries(["completeness_edge_cases", "unambiguity", "implementability", "internal_consistency"].map((d) => [d, { winner, evidence: "e" }])) as never;

  it("counts decided verdicts won by the longer spec; ties and equal lengths excluded", () => {
    const bias = lengthBias(
      [
        { a: "long", b: "short", dimensions: dims("a") }, // 4 decided, longer (a) wins all
        { a: "long", b: "short", dimensions: dims("tie") }, // ties excluded
        { a: "same1", b: "same2", dimensions: dims("a") }, // equal length excluded
      ],
      { long: 50000, short: 4000, same1: 100, same2: 100 },
    );
    expect(bias).toEqual({ decided: 4, longer_won: 4, longer_won_rate: 1 });
  });

  it("is 0 when the shorter spec wins, and NaN-free on empty input", () => {
    const b1 = lengthBias([{ a: "long", b: "short", dimensions: dims("b") }], { long: 50000, short: 4000 });
    expect(b1.longer_won_rate).toBe(0);
    expect(b1.decided).toBe(4);
    expect(lengthBias([], {})).toEqual({ decided: 0, longer_won: 0, longer_won_rate: 0 });
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
    // repeats defaults to 4: at n=1..2 the spread of spec_entropy swamps the differences being claimed
    expect(a.repeats).toBe(4);
    expect(a.readerModels).toEqual(["gpt-4.1"]);
    expect(a.judgeModel).toBe("claude-sonnet-4-6");
    expect(a.seed).toBe("");
    expect(a.outDir).toBe("quality-results");
  });

  it("parses overrides and --mock", () => {
    const a = parseArgs(["--mock", "--specs", "a=1.md", "--repeats", "3", "--judge-model", "gpt-4o", "--reader-model", "gpt-4.1", "--out", "tmp"]);
    expect(a.mock).toBe(true);
    expect(a.repeats).toBe(3);
    expect(a.judgeModel).toBe("gpt-4o");
    expect(a.outDir).toBe("tmp");
  });

  it("takes two reader families via --reader-models, and a --seed", () => {
    const a = parseArgs(["--specs", "a=1.md", "--reader-models", "gpt-4.1,claude-sonnet-4-6", "--seed", "s7"]);
    expect(a.readerModels).toEqual(["gpt-4.1", "claude-sonnet-4-6"]);
    expect(a.seed).toBe("s7");
    // the singular flag still works for older invocations
    expect(parseArgs(["--specs", "a=1.md", "--reader-model", "gpt-4o"]).readerModels).toEqual(["gpt-4o"]);
  });

  it("rejects missing --specs, malformed entries, duplicate names, >2 readers and bad repeats", () => {
    expect(() => parseArgs([])).toThrow(/--specs/);
    expect(() => parseArgs(["--specs", "no-equals"])).toThrow(/name=path/);
    expect(() => parseArgs(["--specs", "a=1.md,a=2.md"])).toThrow(/unique/);
    expect(() => parseArgs(["--specs", "a=1.md", "--reader-models", "x,y,z"])).toThrow(/one or two/);
    expect(() => parseArgs(["--specs", "a=1.md", "--repeats", "0"])).toThrow(/positive integer/);
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
      readers: [{ id: "r", llm }],
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

  it("a classification failure keeps the raw questions: the trial survives without a taxonomy", async () => {
    const llm = mockLlm();
    const res = await runQuality({
      specs: [{ name: "unclassifiable", text: "MOCK_VAGUE MOCK_ERROR_CLASSIFIER spec" }],
      readers: [{ id: "r", llm }],
      judge: { id: "j", llm },
      repeats: 1,
    });
    expect(res.errors).toBe(0); // pass 1 succeeded, so the trial is NOT excluded
    expect(res.classify_errors).toBe(1);
    const rec = res.builder[0]!;
    expect(rec.out!.questions.length).toBe(3);
    expect(rec.classify_error).toMatch(/mock classifier failure/);
    expect(rec.metrics!.taxonomy).toBeUndefined();
    const s = res.summaries[0]!;
    expect(s.builder_questions).toBe(3); // the raw metric still reports
    expect(s.n_classified).toBe(0); // and the taxonomy honestly reports zero classified trials
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
      readers: [{ id: "r", llm }],
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

describe("the taxonomy fixes what the raw question count got wrong", () => {
  const specs = [
    { name: "ledger", text: "MOCK_LEDGER invoicing app — assumptions declared in an appendix" },
    { name: "vague", text: "MOCK_VAGUE invoicing app" },
  ];

  it("the honest spec asks MORE raw questions but has FEWER genuine gaps", async () => {
    const llm = mockLlm();
    const res = await runQuality({
      specs,
      readers: [{ id: "r", llm }],
      judge: { id: "j", llm },
      repeats: 2,
    });
    const ledger = res.summaries.find((s) => s.name === "ledger")!;
    const vague = res.summaries.find((s) => s.name === "vague")!;
    // the OLD headline: the spec that declares its assumptions looks worse
    expect(ledger.builder_questions).toBe(4);
    expect(vague.builder_questions).toBe(3);
    expect(ledger.builder_questions).toBeGreaterThan(vague.builder_questions);
    // the NEW headline reverses it, because 3 of the 4 questions are answered or invited by the spec itself
    expect(ledger.genuine_gap).toBe(1);
    expect(ledger.flagged_assumption).toBe(2);
    expect(ledger.answered_in_spec).toBe(1);
    expect(vague.genuine_gap).toBe(3);
    expect(vague.flagged_assumption).toBe(0);
    expect(ledger.genuine_gap).toBeLessThan(vague.genuine_gap);
    // and the gap spread travels with it
    expect(ledger.genuine_gap_spread.values).toEqual([1, 1]);
    expect(ledger.n_classified).toBe(2);
    // the question table ranks by genuine gaps, not by raw count
    const table = questionTable(res.summaries);
    expect(table.indexOf("ledger")).toBeLessThan(table.indexOf("vague"));
    expect(table).toMatch(/genuine gap/);
  });

  it("records which model played each reader and which asked the questions", async () => {
    const llm = mockLlm();
    const res = await runQuality({
      specs,
      readers: [
        { id: "model-x", llm },
        { id: "model-y", llm },
      ],
      judge: { id: "j", llm },
      repeats: 2,
    });
    for (const r of res.ambiguity) {
      expect(r.trial!.reader_a_model).toBe("model-x");
      expect(r.trial!.reader_b_model).toBe("model-y");
    }
    // the builder alternates across repeats, so both families do the asking
    expect(new Set(res.builder.map((b) => b.reader_model))).toEqual(new Set(["model-x", "model-y"]));
    expect(res.builder.filter((b) => b.repeat === 0).every((b) => b.reader_model === "model-x")).toBe(true);
    expect(res.builder.filter((b) => b.repeat === 1).every((b) => b.reader_model === "model-y")).toBe(true);
  });

  it("--seed makes the presentation coins reproducible, and a different seed reshuffles them", async () => {
    const coins = async (seed?: string) => {
      const llm = mockLlm();
      const res = await runQuality({
        specs,
        readers: [{ id: "r", llm }],
        judge: { id: "j", llm },
        repeats: 3,
        ...(seed ? { seed } : {}),
      });
      return res.ambiguity
        .slice()
        .sort((x, y) => x.spec.localeCompare(y.spec) || x.repeat - y.repeat)
        .map((r) => r.trial!.swapped);
    };
    expect(await coins("alpha")).toEqual(await coins("alpha"));
    expect(await coins()).toEqual(await coins());
    // seeds that actually move the coin (the salt hash is deterministic, so this is a fixed fact, not a flake)
    expect(await coins("alpha")).not.toEqual(await coins("bravo"));
  });
});
