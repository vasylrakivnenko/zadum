/**
 * The live evidence run: `corpus/repos.json` → pinned shallow clones → digests → Opus labels → evidence rows.
 *
 * This is the one script in the repo that spends real money at scale (~110 repositories × ~4 Opus calls), so
 * every design choice here is about not spending it twice:
 *
 *   RESUMABLE BY CONSTRUCTION. Every labelled row is appended to `labels.jsonl` the moment it comes back, and
 *   a re-run reads that file first and skips any `row_id` already in it. A crash at repo 90 costs the 20
 *   remaining repos, never the 90 done. This is also why rows are appended rather than collected and written
 *   at the end: a process killed before the final write would otherwise lose everything it paid for.
 *
 *   CLONE FIRST, LABEL SECOND, IN TWO SEPARATE PHASES. Cloning is free and fails often (dead repos, renamed
 *   defaults, network). Labelling is expensive and should only ever see artifacts that already condensed
 *   successfully. Interleaving them would mean discovering a bad repo after paying to think about it.
 *
 *   ONE REPO'S FAILURE COSTS ONLY THAT REPO. `fetchRepoPinned` never throws; a labelling exception is caught,
 *   recorded in `failures.json`, and the run continues. A batch that fails inside `labelDocument` already
 *   comes back as `errors` on the row and its cells become `unobserved` with a reason — never silently absent.
 *
 * Provenance: each row is pinned to the exact commit and to a sha256 of the exact digest bytes the labeller
 * saw (`digestHash`), so any probability derived downstream can be traced back to a specific artifact state.
 *
 *   npx tsx scripts/scrape_and_label.ts --mock                          # whole pipeline, no credentials, free
 *   npx tsx scripts/scrape_and_label.ts --clone-only                    # just fill the clone cache
 *   npx tsx scripts/scrape_and_label.ts --dry-run                       # measured cost, no calls
 *   npx tsx scripts/scrape_and_label.ts --yes-spend --out <dir>         # the live run
 *   npx tsx scripts/scrape_and_label.ts --yes-spend --resume <same dir> # continue an interrupted one
 */
import "../src/env.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { helpRequested, parseFlags, UsageError } from "../src/cli/flags.js";
import { parallelMap, type LLM } from "../src/llm/client.js";
import { loadValidatedLexicon } from "../src/mining/lexicon.js";
import { condenseRepo, pruneFiles, readRepoDir, type Digest } from "../src/mining/condense.js";
import { digestHash, documentationHeuristic, fetchRepoPinned, mirrorHeuristic, OUTPUT_TOKENS_PER_CALL, proseMix, REPO_CACHE_DIR } from "../src/mining/corpus.js";
import {
  askableFeatures,
  batchFeatures,
  estimateCost,
  labelDocument,
  summarizeRow,
  totalUsage,
  NO_USAGE,
  type DocumentLabels,
} from "../src/mining/label.js";
import { evidenceRowFromLabels, toJsonl, type EvidenceRow } from "../src/mining/matrix.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..");

// ---------------------------------------------------------------------------

interface RepoEntry {
  id: string;
  archetype: string;
  source_url: string;
  owner: string;
  name: string;
  commit: string;
  default_branch?: string;
  license: string | null;
  stars?: number;
  primary_language?: string;
  notes?: string;
}

interface Prepared {
  entry: RepoEntry;
  digest: Digest;
  hash: string;
  row_id: string;
}

const USAGE = `scrape_and_label — corpus/repos.json → clones → digests → Opus evidence rows

  npx tsx scripts/scrape_and_label.ts [--repos <file>] [--out <dir>] [--limit N | --all]
        [--archetype a,b] [--runs N] [--clone-concurrency N] [--label-concurrency N]
        [--max-digest-tokens N] [--model <id>] [--clone-only] [--dry-run] [--mock] [--yes-spend]
        [--resume <dir>] [--no-fetch]

  --clone-only  fill the clone cache and stop (free)
  --dry-run     measured cost from real digests, no model calls (free)
  --mock        scripted labels end to end, no credentials (free)
  --yes-spend   REQUIRED for a live run
  --resume      continue into an existing output directory, skipping rows already in labels.jsonl`;

const FLAGS = {
  value: ["--repos", "--out", "--limit", "--archetype", "--runs", "--clone-concurrency", "--label-concurrency", "--max-digest-tokens", "--max-repo-tokens", "--min-repo-tokens", "--model", "--resume"],
  boolean: ["--all", "--clone-only", "--dry-run", "--mock", "--yes-spend", "--no-fetch"],
} as const;

interface Args {
  repos: string;
  out: string;
  limit: number;
  all: boolean;
  archetypes: string[];
  runs: number;
  cloneConcurrency: number;
  labelConcurrency: number;
  maxDigestTokens: number;
  maxRepoTokens: number;
  minRepoTokens: number;
  model: string;
  cloneOnly: boolean;
  dryRun: boolean;
  mock: boolean;
  yesSpend: boolean;
  fetch: boolean;
}

function parseArgs(argv: string[]): Args {
  const f = parseFlags(argv, FLAGS);
  if (f.has("--all") && f.value("--limit")) throw new UsageError("use either --limit or --all, not both");
  const resume = f.value("--resume");
  const int = (name: string, fallback: string, min: number) => {
    const v = Number(f.value(name, fallback));
    if (!Number.isInteger(v) || v < min) throw new UsageError(`${name} must be a whole number >= ${min}`);
    return v;
  };
  return {
    repos: f.value("--repos", path.join(ROOT, "corpus/repos.json")),
    out: resume ?? f.value("--out", path.join(ROOT, "mining-results", `${new Date().toISOString().replace(/[:.]/g, "-")}-live-repos`)),
    limit: int("--limit", "10000", 1),
    all: f.has("--all"),
    archetypes: (f.value("--archetype", "") || "").split(",").map((s) => s.trim()).filter(Boolean),
    runs: int("--runs", "1", 1),
    cloneConcurrency: int("--clone-concurrency", "6", 1),
    labelConcurrency: int("--label-concurrency", "4", 1),
    maxDigestTokens: int("--max-digest-tokens", "38000", 1),
    maxRepoTokens: int("--max-repo-tokens", String(Number.MAX_SAFE_INTEGER), 1),
    minRepoTokens: int("--min-repo-tokens", "0", 0),
    model: f.value("--model", "claude-opus-4-8"),
    cloneOnly: f.has("--clone-only"),
    dryRun: f.has("--dry-run"),
    mock: f.has("--mock"),
    yesSpend: f.has("--yes-spend"),
    fetch: !f.has("--no-fetch"),
  };
}

/** Row ids already paid for, read back from an interrupted run's output. */
async function alreadyDone(file: string): Promise<Set<string>> {
  const done = new Set<string>();
  const text = await fs.readFile(file, "utf8").catch(() => "");
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line) as { row_id?: string; run?: number };
      if (row.row_id) done.add(`${row.row_id}#${row.run ?? 1}`);
    } catch {
      // a torn last line from a killed process: ignore it, the row will simply be relabelled
    }
  }
  return done;
}

const bytes = (n: number) => (n > 1e9 ? `${(n / 1e9).toFixed(1)}GB` : `${Math.round(n / 1e6)}MB`);

// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
if (helpRequested(argv)) {
  console.log(USAGE);
  process.exit(0);
}
let args: Args;
try {
  args = parseArgs(argv);
} catch (e) {
  console.error(`${(e as Error).message}\n\n${USAGE}`);
  process.exit(2);
}
const live = !args.mock && !args.dryRun && !args.cloneOnly;
if (live && !args.yesSpend) {
  console.error(`a live labelling run is blocked without --yes-spend\n\n${USAGE}`);
  process.exit(2);
}

const { lexicon, catalogVersion } = await loadValidatedLexicon();
const raw = JSON.parse(await fs.readFile(args.repos, "utf8")) as RepoEntry[];
let entries = raw.filter((e) => e.owner && e.name);
if (args.archetypes.length) entries = entries.filter((e) => args.archetypes.includes(e.archetype));
if (!args.all) entries = entries.slice(0, args.limit);

console.log(`lexicon ${lexicon.version} (${lexicon.features.length} features) · catalogs ${catalogVersion}`);
console.log(`${entries.length} repositories from ${path.relative(ROOT, args.repos)}${args.archetypes.length ? ` (archetypes: ${args.archetypes.join(",")})` : ""}`);
console.log(`out: ${args.out}`);

await fs.mkdir(args.out, { recursive: true });
const labelsFile = path.join(args.out, "labels.jsonl");
const evidenceFile = path.join(args.out, "evidence.jsonl");
const done = await alreadyDone(labelsFile);
if (done.size) console.log(`resuming: ${done.size} row(s) already labelled in ${path.basename(labelsFile)} — those will be skipped\n`);

// ---------------------------------------------------------------------------
// Phase 1 — clone (free, and it fails often, so it happens before any spend)
// ---------------------------------------------------------------------------

console.log(`\n── phase 1: pinned shallow clones (concurrency ${args.cloneConcurrency}) ──`);
const blocked: { id: string; reason: string }[] = [];
const cloned: { entry: RepoEntry; dir: string; commit: string }[] = [];
let cloneN = 0;

await parallelMap(entries, args.cloneConcurrency, async (e) => {
  const res = await fetchRepoPinned(e.owner, e.name, REPO_CACHE_DIR, { ref: e.commit || null, fetch: args.fetch });
  cloneN += 1;
  const tag = `[${cloneN}/${entries.length}]`;
  if (!res.dir) {
    blocked.push({ id: e.id, reason: res.blocked_reason ?? "unknown" });
    console.log(`${tag} ✗ ${e.owner}/${e.name}: ${res.blocked_reason}`);
    return;
  }
  cloned.push({ entry: e, dir: res.dir, commit: res.commit ?? e.commit });
  console.log(`${tag} ${res.cached ? "·" : "✓"} ${e.owner}/${e.name}${res.cached ? " (cached)" : ""}`);
});

console.log(`\ncloned ${cloned.length}/${entries.length} · blocked ${blocked.length}`);
if (blocked.length) for (const b of blocked.slice(0, 15)) console.log(`  ✗ ${b.id}: ${b.reason}`);
await fs.writeFile(path.join(args.out, "blocked.json"), `${JSON.stringify(blocked, null, 2)}\n`);
if (args.cloneOnly) {
  console.log(`\n--clone-only: stopping before condensing. Re-run without it to label.`);
  process.exit(blocked.length && !cloned.length ? 1 : 0);
}

// ---------------------------------------------------------------------------
// Phase 2 — condense (free; this is where a repo proves it has anything to say)
// ---------------------------------------------------------------------------

console.log(`\n── phase 2: condense to bounded digests (${args.maxDigestTokens} tok cap) ──`);
const prepared: Prepared[] = [];
let condenseN = 0;
for (const c of cloned.sort((a, b) => a.entry.id.localeCompare(b.entry.id))) {
  condenseN += 1;
  try {
    const files = await readRepoDir(c.dir);

    /**
     * DOCUMENTATION GATE — the most valuable free check in this script.
     *
     * `condense.ts` classifies files into loci by PATH, so a documentation repository about an e-commerce
     * platform is indistinguishable from an e-commerce application by locus count: measured on the real
     * cache, `shopware/docs` yields all fourteen loci including `db_schema`, `routes` and `payment_code`.
     * Labelling it produces `present` verdicts quoting prose about how to BUILD a payment plugin, filed as
     * evidence that this product HAS payments — a true quote making a false claim, which nothing downstream
     * can detect. The file mix separates the two cleanly (docs 79-100 % prose, apps 14-42 %).
     *
     * Skipped repos are RECORDED with their numbers, never silently dropped: if this gate is wrong about a
     * repository, that has to be visible in `blocked.json` rather than inferred from a missing row.
     */
    /**
     * SIZE GATE — a product decision, not a cost one.
     *
     * `docs/MINING.md` has always carried the warning that this corpus "over-represents mature, feature-rich
     * products, so priors mined from them skew toward over-asking for small businesses". The measurement makes
     * it concrete: 186 of 329 scraped repositories are over 2M tokens, and those are ERPs and platforms with
     * hundreds of engineer-years in them. A graph learned from `magento2` and `odoo` describes what a mature
     * commerce platform contains — the opposite of the three-person firm this product is for. Filtering by size
     * is the cheapest available correction for the single worst bias in the pipeline, and it removes truncation
     * (and therefore sampling luck) at the same time.
     *
     * Measured size distribution over 329 clones, for calibration:
     *   <= 100k tok    6 repos    0 % truncate
     *   <= 250k       29 repos   45 %
     *   <= 500k       49 repos   59 %
     *   <= 1M         86 repos   71 %
     *   >  2M        186 repos   96 %
     *
     * `--min-repo-tokens` exists for the opposite arm of the same experiment: labelling only the giants, to
     * measure how much the population actually differs rather than assuming it.
     */
    const repoTokens = Math.round(pruneFiles(files).kept.reduce((n, f) => n + (f.text?.length ?? 0), 0) / 4);
    if (repoTokens > args.maxRepoTokens || repoTokens < args.minRepoTokens) {
      blocked.push({ id: c.entry.id, reason: `size gate: ${repoTokens} repo tokens outside [${args.minRepoTokens}, ${args.maxRepoTokens}]` });
      console.log(`[${condenseN}/${cloned.length}] ⊘ ${c.entry.id}: ${(repoTokens / 1000).toFixed(0)}k tokens — outside the size window`);
      continue;
    }

    const docs = documentationHeuristic(files);
    if (docs) {
      const mix = proseMix(files);
      blocked.push({ id: c.entry.id, reason: `documentation gate: ${docs}` });
      console.log(`[${condenseN}/${cloned.length}] ⊘ ${c.entry.id}: ${(mix.prose_share * 100).toFixed(0)}% prose — skipped as documentation`);
      continue;
    }
    const named = mirrorHeuristic(c.entry.name);
    if (named) {
      blocked.push({ id: c.entry.id, reason: `name heuristic: ${named}` });
      console.log(`[${condenseN}/${cloned.length}] ⊘ ${c.entry.id}: ${named}`);
      continue;
    }

    const digest = condenseRepo(`${c.entry.owner}/${c.entry.name}`, files, { archetype: c.entry.archetype, maxTokens: args.maxDigestTokens });
    const hash = digestHash(digest);
    // A digest with no available loci cannot license a single verdict — asking about it would be pure cost.
    if (!digest.available_loci.length) {
      blocked.push({ id: c.entry.id, reason: "digest has no available loci (nothing to inspect)" });
      console.log(`[${condenseN}/${cloned.length}] ✗ ${c.entry.id}: no loci`);
      continue;
    }
    prepared.push({ entry: c.entry, digest, hash, row_id: `repo:${c.entry.owner}/${c.entry.name}@${c.commit}` });
    if (condenseN % 10 === 0 || condenseN === cloned.length) console.log(`[${condenseN}/${cloned.length}] ${digest.approx_tokens} tok · ${digest.available_loci.length} loci · ${c.entry.id}`);
  } catch (err) {
    blocked.push({ id: c.entry.id, reason: `condense failed: ${(err as Error).message}` });
  }
}
console.log(`\nprepared ${prepared.length} digests`);

// ---------------------------------------------------------------------------
// Cost, from the REAL digests rather than an assumption
// ---------------------------------------------------------------------------

const todo: { p: Prepared; run: number }[] = [];
for (let run = 1; run <= args.runs; run++) for (const p of prepared) if (!done.has(`${p.row_id}#${run}`)) todo.push({ p, run });

const calls = todo.reduce((n, { p }) => n + batchFeatures(askableFeatures(lexicon, p.digest)).length, 0);
const inTok = todo.reduce((n, { p }) => n + p.digest.approx_tokens * batchFeatures(askableFeatures(lexicon, p.digest)).length, 0);
const estimate = estimateCost(args.model, { ...NO_USAGE, input_tokens: inTok, output_tokens: calls * OUTPUT_TOKENS_PER_CALL });
const askedTotal = todo.reduce((n, { p }) => n + askableFeatures(lexicon, p.digest).length, 0);

console.log(`\n── cost, measured from the real digests ──`);
console.log(`  ${todo.length} document-runs (${prepared.length} repos × ${args.runs} run(s)${done.size ? `, ${done.size} already done` : ""})`);
console.log(`  ${askedTotal} feature-questions · ${calls} LLM calls · ~${inTok.toLocaleString()} input tokens`);
console.log(`  estimated: $${estimate.toFixed(2)} on ${args.model} (list price; the run reports real token counts)`);

if (args.dryRun) {
  await fs.writeFile(path.join(args.out, "dry-run.json"), `${JSON.stringify({ repos: prepared.length, document_runs: todo.length, calls, input_tokens: inTok, estimate_usd: estimate, model: args.model, blocked }, null, 2)}\n`);
  console.log(`\n--dry-run: no model was called. Estimate written to ${path.join(args.out, "dry-run.json")}`);
  process.exit(0);
}
if (!todo.length) {
  console.log(`\nnothing left to label — every row is already in ${path.basename(labelsFile)}`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Phase 3 — label (the money)
// ---------------------------------------------------------------------------

let llm: LLM;
if (args.mock) {
  const { MockLLM } = await import("../src/llm/client.js");
  const { labelMockHandlers } = await import("../src/mining/label_mock.js");
  llm = new MockLLM(labelMockHandlers);
} else {
  const { makeModel } = await import("../src/llm/registry.js");
  llm = makeModel(args.model);
}
console.log(`\n── phase 3: labelling · ${llm.name} (${llm.models.strong}) · concurrency ${args.labelConcurrency} ──`);

const rows: DocumentLabels[] = [];
const failures: { row_id: string; run: number; error: string }[] = [];
let labelledN = 0;
const started = Date.now();

await parallelMap(todo, args.labelConcurrency, async ({ p, run }) => {
  try {
    const row = await labelDocument(llm, p.digest, lexicon, {
      run,
      versions: { lexicon: lexicon.version, catalog: catalogVersion },
      // Distinct salt per run so a CachedLLM can never manufacture run-to-run agreement from a cache hit.
      ...(args.runs > 1 ? { cacheSalt: `run${run}` } : {}),
    });
    const evidence: EvidenceRow = evidenceRowFromLabels(row, {
      row_id: p.row_id,
      source: { id: `${p.entry.owner}/${p.entry.name}`, url: p.entry.source_url, commit: p.row_id.split("@")[1] ?? null, license: p.entry.license },
      digest_hash: p.hash,
      label_prompt_version: "label-v1",
    });
    // Appended the instant it returns: a killed process must never lose a row it already paid for.
    await fs.appendFile(labelsFile, `${JSON.stringify({ ...row, row_id: p.row_id })}\n`);
    await fs.appendFile(evidenceFile, `${JSON.stringify(evidence)}\n`);
    rows.push(row);
    labelledN += 1;
    const s = summarizeRow(row);
    const elapsed = (Date.now() - started) / 1000;
    const eta = labelledN ? ((elapsed / labelledN) * (todo.length - labelledN)) / 60 : 0;
    console.log(
      `[${labelledN}/${todo.length}] ${p.entry.id.padEnd(34).slice(0, 34)} present ${String(s.present).padStart(3)} · absent ${String(s.absent).padStart(3)} · unobs ${String(s.unobserved).padStart(3)} · fill ${(s.fill_rate * 100).toFixed(0)}%${row.errors.length ? ` · ${row.errors.length} BATCH ERROR(S)` : ""} · eta ${eta.toFixed(0)}m`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    failures.push({ row_id: p.row_id, run, error: msg });
    console.log(`[!] ${p.entry.id}: ${msg}`);
  }
});

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const usage = totalUsage(rows);
const spent = estimateCost(llm.models.strong, usage);
const withErrors = rows.filter((r) => r.errors.length);
const byArchetype: Record<string, number> = {};
for (const r of rows) byArchetype[r.archetype] = (byArchetype[r.archetype] ?? 0) + 1;

console.log(`\n── done in ${((Date.now() - started) / 60000).toFixed(1)} min ──`);
console.log(`  ${rows.length} rows labelled · ${failures.length} failed · ${withErrors.length} row(s) with a failed batch`);
console.log(`  by archetype: ${Object.entries(byArchetype).sort().map(([k, v]) => `${k}=${v}`).join(" · ")}`);
console.log(`  tokens: ${usage.input_tokens.toLocaleString()} in / ${usage.output_tokens.toLocaleString()} out · est. $${spent.toFixed(2)} (estimated $${estimate.toFixed(2)})`);
if (failures.length) for (const f of failures.slice(0, 10)) console.log(`  ✗ ${f.row_id}: ${f.error}`);

await fs.writeFile(path.join(args.out, "failures.json"), `${JSON.stringify(failures, null, 2)}\n`);
await fs.writeFile(
  path.join(args.out, "run-report.json"),
  `${JSON.stringify(
    {
      model: llm.models.strong,
      lexicon_version: lexicon.version,
      catalog_version: catalogVersion,
      repos_requested: entries.length,
      repos_cloned: cloned.length,
      repos_prepared: prepared.length,
      rows_labelled: rows.length,
      runs: args.runs,
      by_archetype: byArchetype,
      blocked,
      failures,
      rows_with_batch_errors: withErrors.map((r) => ({ doc_id: r.doc_id, errors: r.errors })),
      usage,
      estimated_usd: estimate,
      spent_usd: spent,
      finished_at: new Date().toISOString(),
    },
    null,
    2,
  )}\n`,
);
console.log(`\nwritten ${args.out}/{labels.jsonl,evidence.jsonl,run-report.json,blocked.json,failures.json}`);
console.log(`next: npm run mine:matrix -- --labels ${labelsFile} --out <dir>`);
void toJsonl;
void bytes;
