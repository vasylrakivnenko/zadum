/**
 * The RULER for spec quality: three instruments that measure whether a spec is BETTER (more precise, more
 * implementable) without rewarding length. See the module docs of each instrument:
 *
 *   1. ambiguity.ts          — two blind implementer readers (optionally two DIFFERENT model families) + a
 *                              blind aligner → spec_entropy (0 = the spec fully determined every consequential
 *                              choice); each material divergence is a located imprecision, kept verbatim.
 *   2. builder_questions.ts  — questions a builder must ask, then blind-classified against the spec into
 *                              answered_in_spec / flagged_assumption / genuine_gap. HEADLINE = genuine_gap:
 *                              the raw count punishes a spec for making its assumptions visible.
 *   3. pairwise.ts           — blind pairwise tournament on 4 dimensions, position salt-randomized.
 *
 * Thesis-harness discipline throughout (src/thesis/run.ts is the house style): judges never learn which
 * system produced a spec, presentation order is a deterministic function of the trial salt, every raw
 * observation (derivations, pairs, questions, labels, verdicts) is stored in the results JSON so rubrics can
 * be re-scored offline, and per-trial errors are contained (recorded, excluded from summaries, counted).
 *
 * Every headline is reported with its per-repeat spread (min/max/sd), because a mean over few repeats hides
 * exactly the variance that decides whether a difference is real.
 *
 * CLI:
 *   npx tsx src/quality/run.ts [--mock] --specs name1=path1,name2=path2[,...]
 *     [--repeats N] [--judge-model id] [--reader-models a[,b]] [--seed s] [--out dir]
 *     [--concurrency N] [--provider-concurrency N]
 *
 *   --repeats defaults to 4 (was 1). COST: per repeat, each spec costs 3 ambiguity calls + 2 builder calls
 *   (collect + classify), plus one call per spec pair. Four specs at 4 repeats = 4*(4*5+6) = 104 calls, of
 *   which the pairwise ones carry two full spec texts. Drop to --repeats 2 for a cheap smoke run; n=4 is the
 *   minimum at which the reported sd means anything at all, and it is still far too small for a t-test.
 *   --seed s prefixes every trial salt, so the presentation coin and the cache keys are reproducible: the same
 *   --seed replays the same order assignments, a different --seed reshuffles them.
 *
 * Results land in quality-results/<stamp>.json (git-ignore the directory).
 */
import "../env.js"; // load .env before the model registry reads credentials (entry point, like thesis/run.ts)
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parallelMap, type LLM } from "../llm/client.js";
import { runAmbiguity, type AmbiguityTrial, type MaterialDivergence } from "./ambiguity.js";
import {
  builderMetrics,
  classifyBuilderQuestions,
  runBuilderQuestions,
  type BuilderMetrics,
  type BuilderOut,
  type QuestionClassification,
} from "./builder_questions.js";
import { lengthBias, pairwiseStandings, runPairwise, type LengthBias, type PairwiseResult, type PairwiseStanding } from "./pairwise.js";
import { formatSpread, spread, type Spread } from "./stats.js";

// ---------- concurrency ----------

/**
 * Per-provider concurrency gate — a local copy of src/thesis/run.ts's keyedLimiter (duplicated deliberately:
 * src/quality must stay self-contained while other work edits src/thesis in parallel; see that file for the
 * rationale — a single global limit idles every provider behind the tightest one's TPM window).
 */
export function keyedLimiter(maxPerKey: number): <T>(key: string, fn: () => Promise<T>) => Promise<T> {
  const state = new Map<string, { active: number; queue: (() => void)[] }>();
  return async (key, fn) => {
    let sl = state.get(key);
    if (!sl) {
      sl = { active: 0, queue: [] };
      state.set(key, sl);
    }
    if (sl.active >= maxPerKey) await new Promise<void>((res) => sl!.queue.push(res));
    sl.active += 1;
    try {
      return await fn();
    } finally {
      sl.active -= 1;
      sl.queue.shift()?.();
    }
  };
}

/** Wrap an LLM so every call passes through the per-provider gate (instruments fire calls internally). */
export function gatedLLM(inner: LLM, key: string, limit: <T>(key: string, fn: () => Promise<T>) => Promise<T>): LLM {
  return {
    name: inner.name,
    models: inner.models,
    structured: (req) => limit(key, () => inner.structured(req)),
  };
}

// ---------- trial records (raw observations stored; errors contained) ----------

export interface AmbiguityRecord {
  spec: string;
  repeat: number;
  error?: string;
  trial?: AmbiguityTrial;
}

export interface BuilderRecord {
  spec: string;
  repeat: number;
  /** which reader model asked the questions (readers alternate across repeats when two are configured) */
  reader_model?: string;
  error?: string;
  /** pass 2 failed but the questions stand: the raw metric survives, the taxonomy is absent for this trial */
  classify_error?: string;
  out?: BuilderOut;
  classification?: QuestionClassification;
  metrics?: BuilderMetrics;
}

export interface PairwiseRecord {
  a: string;
  b: string;
  repeat: number;
  error?: string;
  result?: PairwiseResult;
}

export interface SpecSummary {
  name: string;
  chars: number;
  /** clean ambiguity trials the means below are over */
  n: number;
  spec_entropy: number;
  /** per-repeat spread of spec_entropy — never quote the mean without it */
  spec_entropy_spread: Spread;
  divergence_rate: number;
  forced_rate: number;
  /** mean count of material divergences per trial */
  material_divergences: number;
  /** raw question count (pass 1) — kept for continuity, no longer the headline */
  builder_questions: number;
  builder_blocking: number;
  /** builder trials that carry a classification; the taxonomy means are over these */
  n_classified: number;
  /** HEADLINE: mean questions the spec neither answers nor flags as an assumption */
  genuine_gap: number;
  genuine_gap_spread: Spread;
  genuine_gap_blocking: number;
  /** asking these is the product working as designed: the spec flagged the assumption */
  flagged_assumption: number;
  /** the spec answered it and the reader missed it — a findability signal, not an incompleteness one */
  answered_in_spec: number;
  unclassified: number;
  pairwise_win_rate: number;
  pairwise_wins: number;
  errors: number;
}

export interface QualityResults {
  ambiguity: AmbiguityRecord[];
  builder: BuilderRecord[];
  pairwise: PairwiseRecord[];
  standings: PairwiseStanding[];
  /** share of decided pairwise verdicts won by the LONGER spec — near 1.0 = the tournament measured word count */
  length_bias: LengthBias;
  summaries: SpecSummary[];
  errors: number;
  /** pass-2 classification failures — the trial survives with raw questions only */
  classify_errors: number;
}

// ---------- summarization (pure code over stored records) ----------

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function summarize(
  specs: { name: string; text: string }[],
  ambiguity: AmbiguityRecord[],
  builder: BuilderRecord[],
  pairwise: PairwiseRecord[],
): SpecSummary[] {
  const standings = pairwiseStandings(
    pairwise.filter((p) => !p.error && p.result).map((p) => ({ a: p.a, b: p.b, dimensions: p.result!.dimensions })),
  );
  const summaries = specs.map((s) => {
    const amb = ambiguity.filter((r) => r.spec === s.name && !r.error && r.trial).sort((x, y) => x.repeat - y.repeat);
    const bld = builder.filter((r) => r.spec === s.name && !r.error && r.metrics).sort((x, y) => x.repeat - y.repeat);
    const tax = bld.filter((r) => r.metrics!.taxonomy).map((r) => r.metrics!.taxonomy!);
    const standing = standings.find((x) => x.name === s.name);
    const errors =
      ambiguity.filter((r) => r.spec === s.name && r.error).length +
      builder.filter((r) => r.spec === s.name && r.error).length +
      pairwise.filter((r) => (r.a === s.name || r.b === s.name) && r.error).length;
    const entropies = amb.map((r) => r.trial!.metrics.spec_entropy);
    const gaps = tax.map((t) => t.genuine_gap);
    return {
      name: s.name,
      chars: s.text.length,
      n: amb.length,
      spec_entropy: mean(entropies),
      spec_entropy_spread: spread(entropies),
      divergence_rate: mean(amb.map((r) => r.trial!.metrics.divergence_rate)),
      forced_rate: mean(amb.map((r) => r.trial!.metrics.forced_rate)),
      material_divergences: mean(amb.map((r) => r.trial!.material_divergences.length)),
      builder_questions: mean(bld.map((r) => r.metrics!.total)),
      builder_blocking: mean(bld.map((r) => r.metrics!.blocking)),
      n_classified: tax.length,
      genuine_gap: mean(gaps),
      genuine_gap_spread: spread(gaps),
      genuine_gap_blocking: mean(tax.map((t) => t.genuine_gap_blocking)),
      flagged_assumption: mean(tax.map((t) => t.flagged_assumption)),
      answered_in_spec: mean(tax.map((t) => t.answered_in_spec)),
      unclassified: mean(tax.map((t) => t.unclassified)),
      pairwise_win_rate: standing?.win_rate ?? 0,
      pairwise_wins: standing?.wins ?? 0,
      errors,
    };
  });
  // Rank: lowest spec_entropy first (the headline "precision" metric), pairwise win rate breaks ties.
  return summaries.sort((x, y) => x.spec_entropy - y.spec_entropy || y.pairwise_win_rate - x.pairwise_win_rate);
}

export function rankedTable(summaries: SpecSummary[]): string {
  const pc = (x: number) => `${(100 * x).toFixed(0)}%`;
  const L: string[] = [];
  L.push(
    `  ${"spec".padEnd(14)} ${"chars".padStart(6)} ${"n".padStart(2)} ${"entropy (spread)".padStart(24)} ${"diverg.".padStart(8)} ${"material".padStart(9)} ${"forced".padStart(7)} ${"pw-win".padStart(7)} ${"errs".padStart(5)}`,
  );
  for (const s of summaries) {
    L.push(
      `  ${s.name.padEnd(14)} ${String(s.chars).padStart(6)} ${String(s.n).padStart(2)} ${formatSpread(s.spec_entropy_spread).padStart(24)} ${pc(s.divergence_rate).padStart(8)} ${s.material_divergences.toFixed(1).padStart(9)} ${pc(s.forced_rate).padStart(7)} ${pc(s.pairwise_win_rate).padStart(7)} ${String(s.errors).padStart(5)}`,
    );
  }
  L.push("");
  L.push("  entropy = Σ consequence over material divergences ÷ Σ consequence over matched aspects (lower = more determined spec)");
  L.push("  spread  = mean [min–max] ±sample-sd over the per-repeat trials; a mean whose spread covers a rival's is not a result");
  L.push("  forced  = share of derived aspects the readers say the spec forced (higher = more prescriptive)");
  L.push("  pw-win  = blind pairwise win rate across 4 dimensions (ties count half)");
  return L.join("\n");
}

/**
 * The question taxonomy — the metric that cannot be gamed by hiding assumptions. A spec that omits an
 * assumption does not lose a question, it converts a flagged_assumption into a genuine_gap.
 */
export function questionTable(summaries: SpecSummary[]): string {
  const rows = [...summaries].sort((x, y) => x.genuine_gap - y.genuine_gap);
  const L: string[] = [];
  L.push(
    `  ${"spec".padEnd(14)} ${"n".padStart(2)} ${"raw Q".padStart(6)} ${"genuine gap (spread)".padStart(24)} ${"(blk)".padStart(6)} ${"flagged".padStart(8)} ${"answered".padStart(9)} ${"unclass".padStart(8)}`,
  );
  for (const s of rows) {
    L.push(
      `  ${s.name.padEnd(14)} ${String(s.n_classified).padStart(2)} ${s.builder_questions.toFixed(1).padStart(6)} ${formatSpread(s.genuine_gap_spread, 1).padStart(24)} ${s.genuine_gap_blocking.toFixed(1).padStart(6)} ${s.flagged_assumption.toFixed(1).padStart(8)} ${s.answered_in_spec.toFixed(1).padStart(9)} ${s.unclassified.toFixed(1).padStart(8)}`,
    );
  }
  L.push("");
  L.push("  genuine gap = the spec neither answers this nor flags it as an assumption — THE HEADLINE (lower = better)");
  L.push("  flagged     = the spec marked it an assumption / confirm-before-building; asking it is correct behaviour");
  L.push("  answered    = the answer is in the spec and the reader missed it (findability, not incompleteness)");
  L.push("  raw Q       = the old headline: genuine + flagged + answered. It punishes a spec for being honest.");
  return L.join("\n");
}

/** Every located imprecision across the run, most consequential first — the product's next questions. */
export function topDivergences(ambiguity: AmbiguityRecord[]): (MaterialDivergence & { spec: string; repeat: number })[] {
  return ambiguity
    .filter((r) => !r.error && r.trial)
    .flatMap((r) => r.trial!.material_divergences.map((d) => ({ ...d, spec: r.spec, repeat: r.repeat })))
    .sort((x, y) => y.consequence - x.consequence);
}

// ---------- runner ----------

export interface NamedModel {
  id: string;
  llm: LLM;
}

export interface RunOptions {
  specs: { name: string; text: string }[];
  /**
   * One or two models. With two, reader A and reader B of the ambiguity instrument are DIFFERENT families
   * (the point: independent blind spots), and the builder alternates models across repeats so both families
   * ask questions. With one, both readers are that model at different salts (a shared blind spot — the
   * agreement it measures is an upper bound on the spec's true determinacy).
   */
  readers: NamedModel[];
  /** plays the aligner, the question classifier and the pairwise judge — ideally not a reader family */
  judge: NamedModel;
  repeats?: number;
  /** prefixes every trial salt: same seed = same presentation coins and cache keys */
  seed?: string;
  concurrency?: number;
  providerConcurrency?: number;
  providerOf?: (modelId: string) => string;
  log?: (s: string) => void;
}

type Job =
  | { kind: "ambiguity"; spec: string; repeat: number }
  | { kind: "builder"; spec: string; repeat: number }
  | { kind: "pairwise"; a: string; b: string; repeat: number };

export async function runQuality(opts: RunOptions): Promise<QualityResults> {
  const repeats = opts.repeats ?? 4;
  const log = opts.log ?? (() => {});
  const providerOf = opts.providerOf ?? ((id: string) => id);
  const limit = keyedLimiter(opts.providerConcurrency ?? 3);
  if (opts.readers.length === 0) throw new Error("runQuality needs at least one reader model");
  const readers = opts.readers.map((r) => ({ id: r.id, llm: gatedLLM(r.llm, providerOf(r.id), limit) }));
  const readerA = readers[0]!;
  const readerB = readers[1] ?? readers[0]!;
  const judge = gatedLLM(opts.judge.llm, providerOf(opts.judge.id), limit);
  const textOf = new Map(opts.specs.map((s) => [s.name, s.text]));
  const salt = (s: string) => (opts.seed ? `${opts.seed}:${s}` : s);

  const jobs: Job[] = [];
  for (let r = 0; r < repeats; r++) {
    for (const s of opts.specs) {
      jobs.push({ kind: "ambiguity", spec: s.name, repeat: r });
      jobs.push({ kind: "builder", spec: s.name, repeat: r });
    }
    for (let i = 0; i < opts.specs.length; i++)
      for (let j = i + 1; j < opts.specs.length; j++)
        jobs.push({ kind: "pairwise", a: opts.specs[i]!.name, b: opts.specs[j]!.name, repeat: r });
  }

  const ambiguity: AmbiguityRecord[] = [];
  const builder: BuilderRecord[] = [];
  const pairwise: PairwiseRecord[] = [];
  let done = 0;
  let failed = 0;
  let classifyFailed = 0;
  await parallelMap(jobs, opts.concurrency ?? 8, async (job) => {
    // One provider hiccup must not destroy a run: the trial is recorded as errored, excluded from every
    // summary, and counted, so a degraded run can never be mistaken for a clean one (thesis/run.ts pattern).
    try {
      if (job.kind === "ambiguity") {
        const trial = await runAmbiguity(readerA, readerB, judge, textOf.get(job.spec)!, salt(`amb:${job.spec}:${job.repeat}`));
        ambiguity.push({ spec: job.spec, repeat: job.repeat, trial });
        done += 1;
        log(
          `  [${done}/${jobs.length}] ambiguity ${job.spec.padEnd(14)} r${job.repeat}  entropy ${trial.metrics.spec_entropy.toFixed(2)}  material ${trial.metrics.material}/${trial.metrics.matched}`,
        );
      } else if (job.kind === "builder") {
        // readers alternate across repeats so, with two families configured, both do the asking
        const asker = readers[job.repeat % readers.length]!;
        const text = textOf.get(job.spec)!;
        const out = await runBuilderQuestions(asker.llm, text, salt(`bq:${job.spec}:${job.repeat}`));
        // Pass 2 is a separate failure domain: if classification dies the raw questions still count.
        let classification: QuestionClassification | undefined;
        let classifyError: string | undefined;
        try {
          classification = await classifyBuilderQuestions(judge, text, out, salt(`bqc:${job.spec}:${job.repeat}`));
        } catch (e) {
          classifyError = (e as Error).message.slice(0, 200);
          classifyFailed += 1;
        }
        const metrics = builderMetrics(out, classification);
        builder.push({
          spec: job.spec,
          repeat: job.repeat,
          reader_model: asker.id,
          out,
          ...(classification ? { classification } : {}),
          ...(classifyError ? { classify_error: classifyError } : {}),
          metrics,
        });
        done += 1;
        const t = metrics.taxonomy;
        log(
          `  [${done}/${jobs.length}] builder   ${job.spec.padEnd(14)} r${job.repeat}  raw ${metrics.total} (${metrics.blocking} blk)  ` +
            (t ? `gap ${t.genuine_gap} · flagged ${t.flagged_assumption} · answered ${t.answered_in_spec}` : `UNCLASSIFIED (${classifyError?.slice(0, 60)})`),
        );
      } else {
        const result = await runPairwise(judge, textOf.get(job.a)!, textOf.get(job.b)!, salt(`pw:${job.a}:${job.b}:${job.repeat}`));
        pairwise.push({ a: job.a, b: job.b, repeat: job.repeat, result });
        done += 1;
        const wins = Object.values(result.dimensions).map((d) => d.winner);
        log(`  [${done}/${jobs.length}] pairwise  ${`${job.a} vs ${job.b}`.padEnd(28)} r${job.repeat}  ${wins.join(" ")}`);
      }
    } catch (e) {
      done += 1;
      failed += 1;
      const error = (e as Error).message.slice(0, 200);
      if (job.kind === "pairwise") pairwise.push({ a: job.a, b: job.b, repeat: job.repeat, error });
      else if (job.kind === "ambiguity") ambiguity.push({ spec: job.spec, repeat: job.repeat, error });
      else builder.push({ spec: job.spec, repeat: job.repeat, error });
      log(`  [${done}/${jobs.length}] ${job.kind.padEnd(9)} ERROR ${error.slice(0, 90)}`);
    }
  });
  if (failed) log(`\n  ⚠ ${failed}/${jobs.length} trials failed and are excluded from the summaries below.`);
  if (classifyFailed) log(`  ⚠ ${classifyFailed} builder trials kept their raw questions but have NO taxonomy (classification failed).`);

  const cleanMatchups = pairwise.filter((p) => !p.error && p.result).map((p) => ({ a: p.a, b: p.b, dimensions: p.result!.dimensions }));
  const standings = pairwiseStandings(cleanMatchups);
  const length_bias = lengthBias(cleanMatchups, Object.fromEntries(opts.specs.map((s) => [s.name, s.text.length])));
  if (length_bias.decided >= 8 && length_bias.longer_won_rate >= 0.8)
    log(
      `\n  ⚠ pairwise length bias: the LONGER spec won ${length_bias.longer_won}/${length_bias.decided} decided verdicts (${Math.round(length_bias.longer_won_rate * 100)}%). Treat pw-win as measuring word count, not quality, until a length-matched design exists; entropy and genuine-gaps are the quotable metrics.`,
    );
  return {
    ambiguity,
    builder,
    pairwise,
    standings,
    length_bias,
    summaries: summarize(opts.specs, ambiguity, builder, pairwise),
    errors: failed,
    classify_errors: classifyFailed,
  };
}

// ---------- CLI ----------

export interface QualityArgs {
  mock: boolean;
  specs: { name: string; path: string }[];
  repeats: number;
  judgeModel: string;
  /** one or two ids; two = independent reader families */
  readerModels: string[];
  seed: string;
  outDir: string;
  concurrency: number;
  providerConcurrency: number;
}

export function parseArgs(argv: string[]): QualityArgs {
  const flag = (n: string) => {
    const i = argv.indexOf(n);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const specsRaw = flag("--specs");
  if (!specsRaw) throw new Error("--specs name1=path1,name2=path2[,...] is required");
  const specs = specsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const i = s.indexOf("=");
      if (i <= 0 || i === s.length - 1) throw new Error(`--specs entry "${s}" must be name=path`);
      return { name: s.slice(0, i).trim(), path: s.slice(i + 1).trim() };
    });
  const names = new Set(specs.map((s) => s.name));
  if (names.size !== specs.length) throw new Error("--specs names must be unique");
  if (specs.length < 1) throw new Error("--specs needs at least one name=path entry");
  // --reader-model (singular) stays accepted so older invocations and docs keep working.
  const readersRaw = flag("--reader-models") ?? flag("--reader-model") ?? "gpt-4.1";
  const readerModels = readersRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (readerModels.length < 1 || readerModels.length > 2)
    throw new Error("--reader-models takes one or two model ids (the ambiguity instrument has exactly two readers)");
  const repeats = Number(flag("--repeats") ?? 4);
  if (!Number.isInteger(repeats) || repeats < 1) throw new Error("--repeats must be a positive integer");
  return {
    mock: argv.includes("--mock"),
    specs,
    repeats,
    judgeModel: flag("--judge-model") ?? "claude-sonnet-4-6",
    readerModels,
    seed: flag("--seed") ?? "",
    outDir: flag("--out") ?? "quality-results",
    concurrency: Number(flag("--concurrency") ?? 8),
    providerConcurrency: Number(flag("--provider-concurrency") ?? 3),
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  const specs: { name: string; text: string; path: string }[] = [];
  for (const s of args.specs) {
    const text = await fs.readFile(s.path, "utf8").catch(() => {
      throw new Error(`cannot read spec "${s.name}" at ${s.path}`);
    });
    if (!text.trim()) throw new Error(`spec "${s.name}" at ${s.path} is empty`);
    specs.push({ name: s.name, text, path: s.path });
  }

  const { MockLLM } = await import("../llm/client.js");
  const { qualityMockHandlers } = await import("./mock_fixtures.js");
  let readers: NamedModel[];
  let judge: NamedModel;
  let providerOf: ((id: string) => string) | undefined;
  let familyOf: (id: string) => string = (id) => id;
  if (args.mock) {
    const mockLlm = new MockLLM(qualityMockHandlers);
    readers = args.readerModels.map((id) => ({ id, llm: mockLlm }));
    judge = { id: args.judgeModel, llm: mockLlm };
  } else {
    const { makeModel, availability, availabilityTable, routeFor } = await import("../llm/registry.js");
    providerOf = (id: string) => routeFor(id)?.provider ?? id;
    familyOf = (id: string) => routeFor(id)?.family ?? id;
    try {
      readers = args.readerModels.map((id) => ({ id, llm: makeModel(id) }));
      judge = { id: args.judgeModel, llm: makeModel(args.judgeModel) };
    } catch (e) {
      console.error(`\n${(e as Error).message}\n\nConfigured models:\n${availabilityTable(availability())}\n\nRun \`npm run models\` to test what is set up.`);
      process.exit(1);
    }
  }

  const nPairs = (specs.length * (specs.length - 1)) / 2;
  // 3 per ambiguity trial + 2 builder (collect + classify) + 1 per matchup
  const calls = args.repeats * (specs.length * 5 + nPairs);
  console.log(`SPEC QUALITY RULER · ${specs.length} specs × ${args.repeats} repeat(s) — ambiguity + builder questions (classified) + ${nPairs}-pair tournament (~${calls} LLM calls)`);
  const readerLine = readers.map((r) => `${r.id} [${familyOf(r.id)}]`).join(" + ");
  console.log(
    `readers: ${readerLine}${readers.length > 1 ? "" : "  ⚠ ONE reader model at two salts — shared blind spot, entropy is an underestimate"}`,
  );
  if (readers.length > 1 && familyOf(readers[0]!.id) === familyOf(readers[1]!.id))
    console.log(`  ⚠ both readers are family "${familyOf(readers[0]!.id)}" — independence is partial`);
  const judgeClash = readers.filter((r) => familyOf(r.id) === familyOf(judge.id)).map((r) => r.id);
  console.log(
    `judge:   ${judge.id} [${familyOf(judge.id)}] (aligner + question classifier + pairwise)` +
      (judgeClash.length ? `  ⚠ shares a family with reader(s) ${judgeClash.join(", ")}` : "  (independent of both readers)"),
  );
  if (args.seed) console.log(`seed:    ${args.seed}`);
  for (const s of specs) console.log(`  ${s.name.padEnd(14)} ${String(s.text.length).padStart(6)} chars  ${s.path}`);
  console.log("");

  const t0 = Date.now();
  const results = await runQuality({
    specs,
    readers,
    judge,
    repeats: args.repeats,
    ...(args.seed ? { seed: args.seed } : {}),
    concurrency: args.concurrency,
    providerConcurrency: args.providerConcurrency,
    ...(providerOf ? { providerOf } : {}),
    log: (s) => console.log(s),
  });

  console.log(`\nRESULTS (${((Date.now() - t0) / 1000).toFixed(0)}s) — ranked by spec_entropy (lower = more precise)\n`);
  console.log(rankedTable(results.summaries));
  console.log(`\nBUILDER QUESTIONS — blind classification against the spec text (headline: genuine gaps)\n`);
  console.log(questionTable(results.summaries));

  const divergences = topDivergences(results.ambiguity);
  if (divergences.length) {
    console.log(`\nLOCATED IMPRECISIONS — material divergences, most consequential first (top 8 of ${divergences.length}):\n`);
    for (const d of divergences.slice(0, 8)) {
      console.log(`  [${d.spec} · ${d.aspect} · consequence ${d.consequence}]`);
      console.log(`    reader A: ${d.reading_a}`);
      console.log(`    reader B: ${d.reading_b}`);
      if (d.note) console.log(`    → ${d.note}`);
    }
  }

  await fs.mkdir(args.outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(args.outDir, `${stamp}${args.mock ? "-mock" : ""}.json`);
  await fs.writeFile(
    file,
    JSON.stringify(
      {
        mock: args.mock,
        repeats: args.repeats,
        seed: args.seed,
        reader_models: readers.map((r) => r.id),
        judge_model: judge.id,
        specs: specs.map((s) => ({ name: s.name, path: s.path, chars: s.text.length })),
        summaries: results.summaries,
        standings: results.standings,
        length_bias: results.length_bias,
        material_divergences: divergences,
        ambiguity: results.ambiguity,
        builder: results.builder,
        pairwise: results.pairwise,
        errors: results.errors,
        classify_errors: results.classify_errors,
      },
      null,
      2,
    ),
  );
  console.log(`\nwritten ${file}`);
}
