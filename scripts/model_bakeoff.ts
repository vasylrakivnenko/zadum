/**
 * Which model should label the corpus? Decide it by measurement against the gold set, not by reputation.
 *
 * The evidence layer's whole value rests on label quality: a wrong `present` pollutes the matrix and a wrong
 * `absent` poisons it. But labelling is also the single largest line item in the mining budget, and the
 * models available on this Foundry resource differ ~5x in price:
 *
 *     claude-opus-4-8    $5 / $25 per Mtok
 *     claude-sonnet-4-6  $3 / $15
 *     Kimi-K2.5          cheapest, different family entirely
 *
 * So the question "is the cheap model good enough here?" is worth exactly one careful experiment, and
 * `catalogs/gold/label-gold.json` exists to answer it: 4 artifacts a human adjudicated cell by cell.
 *
 * What is compared, and why these metrics:
 *   - `present` precision — of the cells a model called `present`, how many the human agrees are. A false
 *     `present` invents evidence.
 *   - `absent` precision — the expensive claim. A false `absent` becomes a prior saying "apps like this do
 *     not do X", which is worse than silence.
 *   - agreement on informative cells, and the confusion counts, so WHERE a model differs is visible rather
 *     than averaged away.
 *   - cost and latency per document, from real token counts.
 *
 * Cells the gold set never adjudicated are excluded from every denominator — never scored as an agreed
 * `unobserved`, which would flatter every model equally and hide the differences.
 *
 *   npx tsx scripts/model_bakeoff.ts --models claude-opus-4-8,claude-sonnet-4-6,Kimi-K2.5 --yes-spend
 */
import "../src/env.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { helpRequested, parseFlags, UsageError } from "../src/cli/flags.js";
import { loadValidatedLexicon } from "../src/mining/lexicon.js";
import { condenseSpecDoc } from "../src/mining/condense.js";
import { CORPUS_DIR, estimateCost, labelDocument, loadManifest, summarizeRow, type DocumentLabels } from "../src/mining/label.js";
import { loadGold, goldIndex, goldCellCount, presentPrecision, absentPrecision, presentRecall, absentRecall, confusionCounts, noAnswerRate, evidenceQuoteValidity, DEFAULT_GOLD_FILE } from "../src/mining/label_eval.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..");

const USAGE = `model_bakeoff — which model labels the corpus best per dollar?

  npx tsx scripts/model_bakeoff.ts [--models a,b,c] [--gold <file>] [--out <dir>] [--yes-spend] [--dry-run]`;

const FLAGS = { value: ["--models", "--gold", "--out"], boolean: ["--yes-spend", "--dry-run"] } as const;

const argv = process.argv.slice(2);
if (helpRequested(argv)) {
  console.log(USAGE);
  process.exit(0);
}
let flags;
try {
  flags = parseFlags(argv, FLAGS);
} catch (e) {
  console.error(`${(e as Error).message}\n\n${USAGE}`);
  process.exit(2);
}
const models = flags.value("--models", "claude-opus-4-8,claude-sonnet-4-6,Kimi-K2.5").split(",").map((s) => s.trim()).filter(Boolean);
const dryRun = flags.has("--dry-run");
const out = flags.value("--out", path.join(ROOT, "mining-results", "bakeoff"));
if (!dryRun && !flags.has("--yes-spend")) {
  console.error(`a live bake-off is blocked without --yes-spend\n\n${USAGE}`);
  process.exit(2);
}
if (!models.length) throw new UsageError("--models must name at least one model");

const { lexicon, catalogVersion } = await loadValidatedLexicon();
const gold = await loadGold(flags.value("--gold", DEFAULT_GOLD_FILE));
// `goldPairs` and everything built on it take the INDEX (doc_id -> feature_id -> cell), not the raw file.
const gidx = goldIndex(gold);
const manifest = await loadManifest();

// Condense exactly the gold artifacts, nothing else — the comparison is only meaningful where a human ruled.
const digests = [];
for (const a of gold.artifacts) {
  const entry = manifest.find((m) => m.id === a.doc_id);
  if (!entry) {
    console.error(`gold artifact ${a.doc_id} is not in the corpus manifest — skipping`);
    continue;
  }
  const text = await fs.readFile(path.join(CORPUS_DIR, entry.file), "utf8");
  digests.push(condenseSpecDoc(a.doc_id, text, { archetype: a.archetype }));
}
console.log(`lexicon ${lexicon.version} (${lexicon.features.length} features) · ${digests.length} gold artifacts · ${goldCellCount(gold)} adjudicated cells`);
console.log(`models: ${models.join(", ")}\n`);

if (dryRun) {
  for (const d of digests) console.log(`  ${d.doc_id.padEnd(38)} ${d.approx_tokens} tok · ${d.available_loci.length} loci`);
  console.log(`\ndry run: ${digests.length} documents × ${models.length} models = ${digests.length * models.length} label runs`);
  process.exit(0);
}

await fs.mkdir(out, { recursive: true });
const { makeModel } = await import("../src/llm/registry.js");

interface Result {
  model: string;
  rows: DocumentLabels[];
  present_precision: number | null;
  absent_precision: number | null;
  no_answer_rate: number | null;
  present_recall: number | null;
  absent_recall: number | null;
  quote_validity: number | null;
  confusion: { gold: string; predicted: string; n: number }[];
  cost_usd: number;
  latency_ms: number;
  errors: number;
}
const results: Result[] = [];

for (const id of models) {
  console.log(`── ${id} ──`);
  let llm;
  try {
    llm = makeModel(id);
  } catch (e) {
    console.error(`  cannot construct ${id}: ${(e as Error).message} — skipping`);
    continue;
  }
  const rows: DocumentLabels[] = [];
  for (const d of digests) {
    try {
      const row = await labelDocument(llm, d, lexicon, { versions: { lexicon: lexicon.version, catalog: catalogVersion }, cacheSalt: id });
      const s = summarizeRow(row);
      rows.push(row);
      console.log(`  ${d.doc_id.padEnd(36)} present ${String(s.present).padStart(3)} absent ${String(s.absent).padStart(3)} unobs ${String(s.unobserved).padStart(3)} · ${row.calls} calls · ${row.errors.length} err`);
    } catch (e) {
      console.error(`  ${d.doc_id}: FAILED ${(e as Error).message}`);
    }
  }
  if (!rows.length) continue;
  const usage = rows.reduce(
    (u, r) => ({
      input_tokens: u.input_tokens + r.usage.input_tokens,
      output_tokens: u.output_tokens + r.usage.output_tokens,
      cache_read_input_tokens: u.cache_read_input_tokens + r.usage.cache_read_input_tokens,
      cache_creation_input_tokens: u.cache_creation_input_tokens + r.usage.cache_creation_input_tokens,
    }),
    { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  );
  const res: Result = {
    model: rows[0]!.model,
    rows,
    present_precision: presentPrecision(rows, gidx),
    absent_precision: absentPrecision(rows, gidx),
    no_answer_rate: noAnswerRate(rows),
    present_recall: presentRecall(rows, gidx),
    absent_recall: absentRecall(rows, gidx),
    // Every `present` quote must really occur in the artifact. A model that fabricates quotes is disqualified
    // regardless of precision, so this is checked against the digests the labeller actually saw.
    quote_validity: evidenceQuoteValidity(rows, new Map(digests.map((d) => [d.doc_id, d.text]))),
    confusion: confusionCounts(rows, gidx),
    cost_usd: estimateCost(id, usage),
    latency_ms: rows.reduce((n, r) => n + r.latency_ms, 0),
    errors: rows.reduce((n, r) => n + r.errors.length, 0),
  };
  results.push(res);
  console.log(`  → present precision ${fmt(res.present_precision)} · absent precision ${fmt(res.absent_precision)} · $${res.cost_usd.toFixed(3)} · ${(res.latency_ms / 1000).toFixed(0)}s\n`);
}

function fmt(x: number | null): string {
  return x === null ? " n/a" : `${(x * 100).toFixed(1)}%`;
}

// ---------------------------------------------------------------------------

console.log(`\n${"model".padEnd(22)} present-P  present-R  absent-P   quote-ok  no-answer  cost   $/doc  latency errors`);
for (const r of results) {
  console.log(
    `${r.model.slice(0, 22).padEnd(22)} ${fmt(r.present_precision).padStart(9)} ${fmt(r.present_recall).padStart(10)} ${fmt(r.absent_precision).padStart(9)} ${fmt(r.quote_validity).padStart(10)} ${fmt(r.no_answer_rate).padStart(10)}  $${r.cost_usd.toFixed(2)}  $${(r.cost_usd / Math.max(1, r.rows.length)).toFixed(3)} ${(r.latency_ms / 1000).toFixed(0).padStart(5)}s ${String(r.errors).padStart(6)}`,
  );
}

const best = [...results].sort((a, b) => (b.present_precision ?? 0) - (a.present_precision ?? 0))[0];
const cheapest = [...results].sort((a, b) => a.cost_usd - b.cost_usd)[0];
if (best && cheapest) {
  console.log(`\nhighest present-precision: ${best.model} (${fmt(best.present_precision)}, $${best.cost_usd.toFixed(2)})`);
  console.log(`cheapest:                  ${cheapest.model} (${fmt(cheapest.present_precision)}, $${cheapest.cost_usd.toFixed(2)})`);
  const gap = (best.present_precision ?? 0) - (cheapest.present_precision ?? 0);
  const saving = 1 - cheapest.cost_usd / Math.max(1e-9, best.cost_usd);
  console.log(
    `\nthe trade: ${(gap * 100).toFixed(1)} precision points for ${(saving * 100).toFixed(0)}% of the cost.` +
      `\nn is small (${goldCellCount(gold)} adjudicated cells) — treat a gap under ~10 points as unresolved, not as parity.`,
  );
}

for (const r of results) {
  console.log(`\n${r.model} confusion (gold → predicted):`);
  for (const c of r.confusion.filter((x) => x.n > 0).sort((a, b) => b.n - a.n)) console.log(`  ${c.gold.padEnd(11)} → ${c.predicted.padEnd(11)} ${c.n}`);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
await fs.writeFile(
  path.join(out, `${stamp}-bakeoff.json`),
  `${JSON.stringify(
    {
      lexicon_version: lexicon.version,
      catalog_version: catalogVersion,
      gold_cells: goldCellCount(gold),
      results: results.map(({ rows, ...r }) => ({ ...r, documents: rows.length })),
    },
    null,
    2,
  )}\n`,
);
for (const r of results) {
  await fs.writeFile(path.join(out, `${stamp}-labels-${r.model.replace(/[^\w.-]/g, "_")}.jsonl`), `${r.rows.map((x) => JSON.stringify(x)).join("\n")}\n`);
}
console.log(`\nwritten ${out}/${stamp}-bakeoff.json + per-model label rows`);
