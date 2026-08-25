/**
 * CI guard for the ruler itself.
 *
 * The live runs measure specs. This measures the INSTRUMENTS: deterministic mock specs whose every metric is
 * known in advance are pushed through the real CLI (`run.ts --mock`, real file IO, real JSON output, real
 * summarization) and every number is asserted. If someone changes a prompt's rendering, the label alignment,
 * the entropy arithmetic, the spread computation or the taxonomy roll-up, this fails in seconds with no
 * credentials and no network.
 *
 * The load-bearing assertion is the one the raw builder-question count got wrong in the first live run:
 *   the MOCK_LEDGER spec asks MORE raw questions than the vague spec (4 > 3) and has FEWER genuine gaps (1 < 3).
 * A spec that declares its assumptions must not be punished for it.
 *
 * Usage: npx tsx src/quality/ci_check.ts     (exit 0 = the ruler still works)
 */
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { MockLLM } from "../llm/client.js";
import { qualityMockHandlers } from "./mock_fixtures.js";
import { runQuality, type SpecSummary } from "./run.js";

const exec = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");

const failures: string[] = [];
let checks = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  checks += 1;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) console.log(`  ✓ ${label} = ${a}`);
  else {
    console.log(`  ✗ ${label} = ${a}  (expected ${e})`);
    failures.push(`${label}: got ${a}, want ${e}`);
  }
}

function checkTrue(label: string, ok: boolean, detail = ""): void {
  checks += 1;
  if (ok) console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ""}`);
  else {
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
    failures.push(label);
  }
}

const MOCK_SPECS = {
  precise: "MOCK_PRECISE — every decision pinned; nothing left to ask.",
  ledger: "MOCK_LEDGER — decisions pinned, and an appendix declares which of them are assumptions.",
  vague: "MOCK_VAGUE — an invoicing app. Users manage invoices.",
};

async function main(): Promise<void> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "zadum-quality-ci-"));
  const specArgs: string[] = [];
  for (const [name, text] of Object.entries(MOCK_SPECS)) {
    const file = path.join(dir, `${name}.md`);
    await fs.writeFile(file, `${text}\n`);
    specArgs.push(`${name}=${file}`);
  }

  console.log("RULER SELF-CHECK (mock, no credentials)\n\n1. full CLI run\n");
  const t0 = Date.now();
  const { stdout } = await exec(
    "npx",
    [
      "tsx",
      path.join("src", "quality", "run.ts"),
      "--mock",
      "--specs",
      specArgs.join(","),
      "--repeats",
      "2",
      "--reader-models",
      "mock-reader-a,mock-reader-b",
      "--seed",
      "ci",
      "--out",
      dir,
    ],
    { cwd: repoRoot, maxBuffer: 32 * 1024 * 1024 },
  );
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json"));
  if (files.length !== 1) throw new Error(`expected exactly one results JSON, found ${files.length}`);
  const results = JSON.parse(await fs.readFile(path.join(dir, files[0]!), "utf8")) as {
    repeats: number;
    seed: string;
    reader_models: string[];
    summaries: SpecSummary[];
    standings: { name: string; win_rate: number }[];
    errors: number;
    classify_errors: number;
  };
  const by = (n: string) => results.summaries.find((s) => s.name === n)!;

  check("errors", results.errors, 0);
  check("classify_errors", results.classify_errors, 0);
  check("repeats recorded", results.repeats, 2);
  check("reader models recorded", results.reader_models, ["mock-reader-a", "mock-reader-b"]);
  check("seed recorded", results.seed, "ci");
  checkTrue("CLI printed both tables", /genuine gap = the spec neither answers/.test(stdout) && /entropy = Σ consequence/.test(stdout));

  console.log("\n2. ambiguity instrument\n");
  check("precise entropy", by("precise").spec_entropy, 0);
  check("ledger entropy", by("ledger").spec_entropy, 0);
  check("vague entropy", Number(by("vague").spec_entropy.toFixed(4)), 0.8); // material 4+4 over matched 4+2+4
  check("vague material divergences / trial", by("vague").material_divergences, 2);
  check("precise forced rate", by("precise").forced_rate, 1);
  check("ranking by entropy", results.summaries.map((s) => s.name)[2], "vague");

  console.log("\n3. per-repeat spread (FIX 2c)\n");
  const sp = by("vague").spec_entropy_spread;
  check("spread n", sp.n, 2);
  check("spread values", sp.values.map((v) => Number(v.toFixed(4))), [0.8, 0.8]);
  check("spread sd (deterministic mock)", sp.sd, 0);
  checkTrue("spread min/max present", sp.min === sp.max && sp.max === sp.mean);

  console.log("\n4. builder-question taxonomy (FIX 1 — the load-bearing one)\n");
  check("ledger raw questions", by("ledger").builder_questions, 4);
  check("vague raw questions", by("vague").builder_questions, 3);
  checkTrue(
    "the RAW count would rank the honest spec BELOW the vague one",
    by("ledger").builder_questions > by("vague").builder_questions,
    `${by("ledger").builder_questions} > ${by("vague").builder_questions}`,
  );
  check("ledger genuine gaps", by("ledger").genuine_gap, 1);
  check("ledger flagged assumptions", by("ledger").flagged_assumption, 2);
  check("ledger answered-in-spec", by("ledger").answered_in_spec, 1);
  check("ledger unclassified", by("ledger").unclassified, 0);
  check("vague genuine gaps", by("vague").genuine_gap, 3);
  check("precise genuine gaps", by("precise").genuine_gap, 0);
  checkTrue(
    "the TAXONOMY ranks the honest spec ABOVE the vague one",
    by("ledger").genuine_gap < by("vague").genuine_gap,
    `${by("ledger").genuine_gap} < ${by("vague").genuine_gap}`,
  );
  check("ledger blocking genuine gaps", by("ledger").genuine_gap_blocking, 1);
  check("classified trials per spec", by("ledger").n_classified, 2);

  console.log("\n5. pairwise standings\n");
  check("standings order", results.standings.map((s) => s.name).slice(-1), ["vague"]);
  check("vague win rate", by("vague").pairwise_win_rate, 0);
  check("precise win rate", by("precise").pairwise_win_rate, 0.75); // 4 wins vs vague, 4 ties vs ledger
  check("ledger win rate", by("ledger").pairwise_win_rate, 0.75);

  console.log("\n6. --seed reproducibility (FIX 2d)\n");
  const specs = Object.entries(MOCK_SPECS).map(([name, text]) => ({ name, text }));
  const withSeed = async (seed: string) => {
    const llm = new MockLLM(qualityMockHandlers);
    const res = await runQuality({
      specs,
      readers: [
        { id: "r1", llm },
        { id: "r2", llm },
      ],
      judge: { id: "j", llm },
      repeats: 2,
      seed,
    });
    return res.ambiguity
      .slice()
      .sort((x, y) => x.spec.localeCompare(y.spec) || x.repeat - y.repeat)
      .map((r) => `${r.spec}:${r.repeat}:${r.trial!.swapped}`);
  };
  const seedA1 = await withSeed("alpha");
  const seedA2 = await withSeed("alpha");
  const seedB = await withSeed("bravo");
  check("same seed → identical presentation coins", seedA1, seedA2);
  checkTrue("different seed → different coins", JSON.stringify(seedA1) !== JSON.stringify(seedB), `${seedA1.join(",")} vs ${seedB.join(",")}`);

  console.log("\n7. reader identity recorded\n");
  const first = results.summaries.length ? JSON.parse(await fs.readFile(path.join(dir, files[0]!), "utf8")) : null;
  const trial = first.ambiguity.find((r: { trial?: unknown }) => r.trial).trial as { reader_a_model: string; reader_b_model: string };
  check("reader A model", trial.reader_a_model, "mock-reader-a");
  check("reader B model", trial.reader_b_model, "mock-reader-b");
  const askers = new Set(first.builder.map((b: { reader_model?: string }) => b.reader_model));
  check("both readers asked questions across repeats", [...askers].sort(), ["mock-reader-a", "mock-reader-b"]);

  await fs.rm(dir, { recursive: true, force: true });
  console.log(`\n${checks - failures.length}/${checks} checks passed in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (failures.length) {
    console.error(`\nRULER SELF-CHECK FAILED (${failures.length}):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("ruler self-check OK");
}

await main();
