/**
 * The RULER for spec quality: three instruments that measure whether a spec is BETTER (more precise, more
 * implementable) without rewarding length. See the module docs of each instrument:
 *
 *   1. ambiguity.ts          — two blind implementer readers + a blind aligner → spec_entropy (0 = the spec
 *                              fully determined every consequential choice); each material divergence is a
 *                              located imprecision, kept verbatim.
 *   2. builder_questions.ts  — questions a builder must ask the owner before building; fewer = better.
 *   3. pairwise.ts           — blind pairwise tournament on 4 dimensions, position salt-randomized.
 *
 * Thesis-harness discipline throughout (src/thesis/run.ts is the house style): judges never learn which
 * system produced a spec, presentation order is a deterministic function of the trial salt, every raw
 * observation (derivations, pairs, questions, verdicts) is stored in the results JSON so rubrics can be
 * re-scored offline, and per-trial errors are contained (recorded, excluded from summaries, counted).
 *
 * CLI:
 *   npx tsx src/quality/run.ts [--mock] --specs name1=path1,name2=path2[,...]
 *     [--repeats N] [--judge-model id] [--reader-model id] [--out dir]
 *     [--concurrency N] [--provider-concurrency N]
 *
 * Results land in quality-results/<stamp>.json (git-ignore the directory).
 */
import "../env.js"; // load .env before the model registry reads credentials (entry point, like thesis/run.ts)
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parallelMap, type LLM } from "../llm/client.js";
import { runAmbiguity, type AmbiguityTrial, type MaterialDivergence } from "./ambiguity.js";
import { builderMetrics, runBuilderQuestions, type BuilderMetrics, type BuilderOut } from "./builder_questions.js";
import { pairwiseStandings, runPairwise, type PairwiseResult, type PairwiseStanding } from "./pairwise.js";

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
  error?: string;
  out?: BuilderOut;
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
  divergence_rate: number;
  forced_rate: number;
  /** mean count of material divergences per trial */
  material_divergences: number;
  builder_questions: number;
  builder_blocking: number;
  pairwise_win_rate: number;
  pairwise_wins: number;
  errors: number;
}

export interface QualityResults {
  ambiguity: AmbiguityRecord[];
  builder: BuilderRecord[];
  pairwise: PairwiseRecord[];
  standings: PairwiseStanding[];
  summaries: SpecSummary[];
  errors: number;
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
    const amb = ambiguity.filter((r) => r.spec === s.name && !r.error && r.trial);
    const bld = builder.filter((r) => r.spec === s.name && !r.error && r.metrics);
    const standing = standings.find((x) => x.name === s.name);
    const errors =
      ambiguity.filter((r) => r.spec === s.name && r.error).length +
      builder.filter((r) => r.spec === s.name && r.error).length +
      pairwise.filter((r) => (r.a === s.name || r.b === s.name) && r.error).length;
    return {
      name: s.name,
      chars: s.text.length,
      n: amb.length,
      spec_entropy: mean(amb.map((r) => r.trial!.metrics.spec_entropy)),
      divergence_rate: mean(amb.map((r) => r.trial!.metrics.divergence_rate)),
      forced_rate: mean(amb.map((r) => r.trial!.metrics.forced_rate)),
      material_divergences: mean(amb.map((r) => r.trial!.material_divergences.length)),
      builder_questions: mean(bld.map((r) => r.metrics!.total)),
      builder_blocking: mean(bld.map((r) => r.metrics!.blocking)),
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
    `  ${"spec".padEnd(14)} ${"chars".padStart(6)} ${"entropy".padStart(8)} ${"diverg.".padStart(8)} ${"material".padStart(9)} ${"forced".padStart(7)} ${"builderQ".padStart(9)} ${"(blk)".padStart(6)} ${"pw-win".padStart(7)} ${"errs".padStart(5)}`,
  );
  for (const s of summaries) {
    L.push(
      `  ${s.name.padEnd(14)} ${String(s.chars).padStart(6)} ${s.spec_entropy.toFixed(2).padStart(8)} ${pc(s.divergence_rate).padStart(8)} ${s.material_divergences.toFixed(1).padStart(9)} ${pc(s.forced_rate).padStart(7)} ${s.builder_questions.toFixed(1).padStart(9)} ${s.builder_blocking.toFixed(1).padStart(6)} ${pc(s.pairwise_win_rate).padStart(7)} ${String(s.errors).padStart(5)}`,
    );
  }
  L.push("");
  L.push("  entropy = Σ consequence over material divergences ÷ Σ consequence over matched aspects (lower = more determined spec)");
  L.push("  forced  = share of derived aspects the readers say the spec forced (higher = more prescriptive)");
  L.push("  pw-win  = blind pairwise win rate across 4 dimensions (ties count half)");
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
  /** plays the two independent implementers and the question-asking builder */
  reader: NamedModel;
  /** plays the aligner and the pairwise judge — ideally a different family than the reader */
  judge: NamedModel;
  repeats?: number;
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
  const repeats = opts.repeats ?? 1;
  const log = opts.log ?? (() => {});
  const providerOf = opts.providerOf ?? ((id: string) => id);
  const limit = keyedLimiter(opts.providerConcurrency ?? 3);
  const reader = gatedLLM(opts.reader.llm, providerOf(opts.reader.id), limit);
  const judge = gatedLLM(opts.judge.llm, providerOf(opts.judge.id), limit);
  const textOf = new Map(opts.specs.map((s) => [s.name, s.text]));

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
  await parallelMap(jobs, opts.concurrency ?? 8, async (job) => {
    // One provider hiccup must not destroy a run: the trial is recorded as errored, excluded from every
    // summary, and counted, so a degraded run can never be mistaken for a clean one (thesis/run.ts pattern).
    try {
      if (job.kind === "ambiguity") {
        const trial = await runAmbiguity(reader, judge, textOf.get(job.spec)!, `amb:${job.spec}:${job.repeat}`);
        ambiguity.push({ spec: job.spec, repeat: job.repeat, trial });
        done += 1;
        log(
          `  [${done}/${jobs.length}] ambiguity ${job.spec.padEnd(14)} r${job.repeat}  entropy ${trial.metrics.spec_entropy.toFixed(2)}  material ${trial.metrics.material}/${trial.metrics.matched}`,
        );
      } else if (job.kind === "builder") {
        const out = await runBuilderQuestions(reader, textOf.get(job.spec)!, `bq:${job.spec}:${job.repeat}`);
        const metrics = builderMetrics(out);
        builder.push({ spec: job.spec, repeat: job.repeat, out, metrics });
        done += 1;
        log(`  [${done}/${jobs.length}] builder   ${job.spec.padEnd(14)} r${job.repeat}  questions ${metrics.total} (${metrics.blocking} blocking)`);
      } else {
        const result = await runPairwise(judge, textOf.get(job.a)!, textOf.get(job.b)!, `pw:${job.a}:${job.b}:${job.repeat}`);
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

  const standings = pairwiseStandings(
    pairwise.filter((p) => !p.error && p.result).map((p) => ({ a: p.a, b: p.b, dimensions: p.result!.dimensions })),
  );
  return { ambiguity, builder, pairwise, standings, summaries: summarize(opts.specs, ambiguity, builder, pairwise), errors: failed };
}

// ---------- CLI ----------

export interface QualityArgs {
  mock: boolean;
  specs: { name: string; path: string }[];
  repeats: number;
  judgeModel: string;
  readerModel: string;
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
  return {
    mock: argv.includes("--mock"),
    specs,
    repeats: Number(flag("--repeats") ?? 1),
    judgeModel: flag("--judge-model") ?? "claude-sonnet-4-6",
    readerModel: flag("--reader-model") ?? "gpt-4.1",
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
  let reader: NamedModel;
  let judge: NamedModel;
  let providerOf: ((id: string) => string) | undefined;
  if (args.mock) {
    const mockLlm = new MockLLM(qualityMockHandlers);
    reader = { id: args.readerModel, llm: mockLlm };
    judge = { id: args.judgeModel, llm: mockLlm };
  } else {
    const { makeModel, availability, availabilityTable, routeFor } = await import("../llm/registry.js");
    providerOf = (id: string) => routeFor(id)?.provider ?? id;
    try {
      reader = { id: args.readerModel, llm: makeModel(args.readerModel) };
      judge = { id: args.judgeModel, llm: makeModel(args.judgeModel) };
    } catch (e) {
      console.error(`\n${(e as Error).message}\n\nConfigured models:\n${availabilityTable(availability())}\n\nRun \`npm run models\` to test what is set up.`);
      process.exit(1);
    }
  }

  const nPairs = (specs.length * (specs.length - 1)) / 2;
  const calls = args.repeats * (specs.length * 4 + nPairs); // 3 per ambiguity trial + 1 builder + 1 per matchup
  console.log(`SPEC QUALITY RULER · ${specs.length} specs × ${args.repeats} repeat(s) — ambiguity + builder questions + ${nPairs}-pair tournament (~${calls} LLM calls)`);
  console.log(`reader: ${reader.id} (implementers + builder)   judge: ${judge.id} (aligner + pairwise)${reader.id === judge.id ? "  ⚠ same model reading and judging" : "  (independent families)"}`);
  for (const s of specs) console.log(`  ${s.name.padEnd(14)} ${String(s.text.length).padStart(6)} chars  ${s.path}`);
  console.log("");

  const t0 = Date.now();
  const results = await runQuality({
    specs,
    reader,
    judge,
    repeats: args.repeats,
    concurrency: args.concurrency,
    providerConcurrency: args.providerConcurrency,
    ...(providerOf ? { providerOf } : {}),
    log: (s) => console.log(s),
  });

  console.log(`\nRESULTS (${((Date.now() - t0) / 1000).toFixed(0)}s) — ranked by spec_entropy (lower = more precise)\n`);
  console.log(rankedTable(results.summaries));

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
        reader_model: reader.id,
        judge_model: judge.id,
        specs: specs.map((s) => ({ name: s.name, path: s.path, chars: s.text.length })),
        summaries: results.summaries,
        standings: results.standings,
        material_divergences: divergences,
        ambiguity: results.ambiguity,
        builder: results.builder,
        pairwise: results.pairwise,
        errors: results.errors,
      },
      null,
      2,
    ),
  );
  console.log(`\nwritten ${file}`);
}
