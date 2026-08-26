/**
 * Evidence layer, part 4 — the **detectability experiment** from REVIEW-2026-08-23 §3.
 *
 * The founder's proposal was to build the decision matrix from public *repos*. The review's counter-claim was
 * that repo-derived cells would be Missing-Not-At-Random — behaviour ("invoice numbers have no gaps") is
 * often absent from a repo or delegated to Stripe — so the model would learn the extractor's blindness rather
 * than the population. §3 records the one-day test that settles it instead of arguing it, and the prediction
 * it makes:
 *
 *     "fill the invoicing catalog's 49 columns from 50 repos and 50 spec documents; compare fill-rate and
 *      inter-run extraction agreement. Prediction: repos fill ~20-30% of behavioural columns with low
 *      agreement, specs 2-3x that with high agreement. If that's wrong, the repo scrape earns its place."
 *
 * This file runs exactly that, on the pairs the corpus already has: of 106 manifest documents, 67 carry a
 * GitHub `source_url`, so each is a (spec document, repo) pair about the same product. Nothing new is scraped.
 *
 * Three numbers per document type, all computed from counts, never verbalised by the model:
 *   fill rate               — share of cells that are not `unobserved`.
 *   absent-licensing rate   — share of raw `absent` answers that survived rules 1 and 2 (label.ts). This is
 *                             the interesting one: it measures how often the model's negatives were about a
 *                             place it could actually have looked.
 *   run-to-run agreement    — the same documents labelled twice with the same prompt. Reported twice: over
 *                             all cells, and over *informative* cells (where at least one run said something
 *                             other than `unobserved`). Raw agreement is inflated by a sea of agreed-upon
 *                             `unobserved`; the informative figure is the one that means anything.
 *
 * On determinism: `claude-opus-4-8` rejects sampling parameters, so "same settings" cannot mean temperature 0.
 * Run-to-run variation here is the model's own, which is precisely the quantity the experiment is about. The
 * two runs never share a cache (distinct `cacheSalt`), so agreement can never be manufactured by a cache hit.
 *
 * CLI: npm run detectability -- [--limit 8] [--runs 2] [--doc-type both|repo|spec_doc] [--mock] [--no-fetch]
 */
import "../env.js";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parallelMap, type LLM, type LLMUsage } from "../llm/client.js";
import { loadValidatedLexicon, type DocType, type Lexicon } from "./lexicon.js";
import { condenseRepo, condenseSpecDoc, readRepoDir, type Digest } from "./condense.js";
import {
  CORPUS_DIR,
  estimateCost,
  labelDocument,
  loadManifest,
  parseGithubRepo,
  totalUsage,
  type DocumentLabels,
  type Cell,
  type ManifestEntry,
  type Verdict,
} from "./label.js";

// ---------- report shaping (pure) ----------

export interface FeatureStat {
  feature_id: string;
  category: string;
  maps_to: string | null;
  cells: number;
  present: number;
  absent: number;
  unobserved: number;
  fill_rate: number;
  absent_raw: number;
  absent_licensed: number;
  absent_licensing_rate: number;
  /** null when no document was labelled twice */
  agreement: number | null;
  agreement_informative: number | null;
  pairs: number;
  informative_pairs: number;
}

export interface DocStat {
  doc_id: string;
  archetype: string;
  runs: number;
  digest_tokens: number;
  loci: number;
  asked: number;
  present: number;
  absent: number;
  fill_rate: number;
  agreement: number | null;
  errors: number;
}

export interface DocTypeReport {
  doc_type: DocType;
  documents: number;
  runs: number;
  cells: number;
  present: number;
  absent: number;
  unobserved: number;
  /** over every lexicon feature — the "share of behavioural columns filled" the prediction talks about */
  fill_rate: number;
  /** over features this document type can witness at all (rule 0 removed from the denominator) */
  fill_rate_detectable: number;
  absent_raw: number;
  absent_licensed: number;
  absent_licensing_rate: number;
  agreement: number | null;
  agreement_informative: number | null;
  pairs: number;
  informative_pairs: number;
  downgrades: Record<string, number>;
  usage: LLMUsage;
  est_cost_usd: number;
  per_doc: DocStat[];
  per_feature: FeatureStat[];
}

export interface DetectabilityReport {
  generated_at: string;
  lexicon_version: string;
  catalog_version: string;
  model: string;
  features: number;
  by_doc_type: DocTypeReport[];
  /** fill rate per category per document type — the cut the aggregate hides (see categoryBreakdown) */
  by_category: CategoryComparison[];
  verdict: Verdicts | null;
  blocked: { doc_type: DocType; doc_id: string; reason: string }[];
}

export interface Verdicts {
  prediction: string;
  repo_fill_rate: number;
  spec_fill_rate: number;
  fill_ratio_spec_over_repo: number;
  repo_agreement_informative: number | null;
  spec_agreement_informative: number | null;
  repo_fill_in_predicted_band: boolean;
  spec_fill_at_least_2x_repo: boolean;
  spec_agreement_higher: boolean | null;
  supported: boolean;
}

const NO_USAGE: LLMUsage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };

/** rows grouped by document, each group sorted by run index. */
export function groupByDoc(rows: DocumentLabels[]): Map<string, DocumentLabels[]> {
  const byDoc = new Map<string, DocumentLabels[]>();
  for (const r of rows) (byDoc.get(r.doc_id) ?? byDoc.set(r.doc_id, []).get(r.doc_id)!).push(r);
  for (const v of byDoc.values()) v.sort((a, b) => a.run - b.run);
  return byDoc;
}

interface PairCounts {
  pairs: number;
  agree: number;
  informative: number;
  informativeAgree: number;
}

const emptyPairs = (): PairCounts => ({ pairs: 0, agree: 0, informative: 0, informativeAgree: 0 });

/**
 * Agreement over consecutive run pairs of the same document: (run1,run2), (run2,run3), … A cell counts as
 * *informative* when at least one of the two runs said something other than `unobserved` — agreeing that a
 * column is silent is not evidence that the extractor is stable.
 */
export function computeAgreement(rows: DocumentLabels[]): { overall: PairCounts; byFeature: Map<string, PairCounts> } {
  const overall = emptyPairs();
  const byFeature = new Map<string, PairCounts>();
  for (const runs of groupByDoc(rows).values()) {
    for (let i = 0; i + 1 < runs.length; i++) {
      const a = new Map(runs[i]!.cells.map((c) => [c.feature_id, c.verdict as Verdict]));
      for (const cell of runs[i + 1]!.cells) {
        const before = a.get(cell.feature_id);
        if (before === undefined) continue;
        const stat = byFeature.get(cell.feature_id) ?? byFeature.set(cell.feature_id, emptyPairs()).get(cell.feature_id)!;
        const agree = before === cell.verdict;
        const informative = before !== "unobserved" || cell.verdict !== "unobserved";
        stat.pairs += 1;
        overall.pairs += 1;
        if (agree) {
          stat.agree += 1;
          overall.agree += 1;
        }
        if (informative) {
          stat.informative += 1;
          overall.informative += 1;
          if (agree) {
            stat.informativeAgree += 1;
            overall.informativeAgree += 1;
          }
        }
      }
    }
  }
  return { overall, byFeature };
}

const ratio = (num: number, den: number) => (den ? num / den : 0);
const ratioOrNull = (num: number, den: number) => (den ? num / den : null);

/** One document type's rows → its section of the report. Pure: same rows in, same report out. */
export function buildDocTypeReport(docType: DocType, rows: DocumentLabels[], lex: Lexicon, model: string): DocTypeReport {
  const byDoc = groupByDoc(rows);
  const { overall, byFeature } = computeAgreement(rows);
  const detectable = new Set(lex.features.filter((f) => f.detectable_in.includes(docType)).map((f) => f.id));

  let present = 0;
  let absent = 0;
  let unobserved = 0;
  let absentRaw = 0;
  let detectableCells = 0;
  let detectableFilled = 0;
  const downgrades: Record<string, number> = {};
  const perFeature = new Map<string, FeatureStat>();
  for (const f of lex.features) {
    perFeature.set(f.id, {
      feature_id: f.id,
      category: f.category,
      maps_to: f.maps_to ? `${f.maps_to.node}.${f.maps_to.option}` : null,
      cells: 0,
      present: 0,
      absent: 0,
      unobserved: 0,
      fill_rate: 0,
      absent_raw: 0,
      absent_licensed: 0,
      absent_licensing_rate: 0,
      agreement: null,
      agreement_informative: null,
      pairs: 0,
      informative_pairs: 0,
    });
  }

  for (const row of rows) {
    for (const c of row.cells) {
      const fs_ = perFeature.get(c.feature_id);
      if (!fs_) continue;
      fs_.cells += 1;
      if (c.verdict === "present") {
        present += 1;
        fs_.present += 1;
      } else if (c.verdict === "absent") {
        absent += 1;
        fs_.absent += 1;
      } else {
        unobserved += 1;
        fs_.unobserved += 1;
      }
      if (c.raw_verdict === "absent") {
        absentRaw += 1;
        fs_.absent_raw += 1;
      }
      if (c.downgrade_reason) downgrades[c.downgrade_reason] = (downgrades[c.downgrade_reason] ?? 0) + 1;
      if (detectable.has(c.feature_id)) {
        detectableCells += 1;
        if (c.verdict !== "unobserved") detectableFilled += 1;
      }
    }
  }

  for (const stat of perFeature.values()) {
    stat.absent_licensed = stat.absent;
    stat.fill_rate = ratio(stat.present + stat.absent, stat.cells);
    stat.absent_licensing_rate = ratio(stat.absent, stat.absent_raw);
    const p = byFeature.get(stat.feature_id);
    if (p) {
      stat.pairs = p.pairs;
      stat.informative_pairs = p.informative;
      stat.agreement = ratioOrNull(p.agree, p.pairs);
      stat.agreement_informative = ratioOrNull(p.informativeAgree, p.informative);
    }
  }

  const perDoc: DocStat[] = [...byDoc.entries()]
    .map(([doc_id, runs]) => {
      const cells = runs.flatMap((r) => r.cells);
      const pres = cells.filter((c) => c.verdict === "present").length;
      const abs = cells.filter((c) => c.verdict === "absent").length;
      const agreement = computeAgreement(runs).overall;
      return {
        doc_id,
        archetype: runs[0]!.archetype,
        runs: runs.length,
        digest_tokens: runs[0]!.digest_tokens,
        loci: runs[0]!.available_loci.length,
        asked: runs[0]!.asked,
        present: pres,
        absent: abs,
        fill_rate: ratio(pres + abs, cells.length),
        agreement: ratioOrNull(agreement.agree, agreement.pairs),
        errors: runs.reduce((n, r) => n + r.errors.length, 0),
      };
    })
    .sort((a, b) => a.doc_id.localeCompare(b.doc_id));

  const usage = totalUsage(rows);
  const cells = present + absent + unobserved;
  return {
    doc_type: docType,
    documents: byDoc.size,
    runs: rows.length,
    cells,
    present,
    absent,
    unobserved,
    fill_rate: ratio(present + absent, cells),
    fill_rate_detectable: ratio(detectableFilled, detectableCells),
    absent_raw: absentRaw,
    absent_licensed: absent,
    absent_licensing_rate: ratio(absent, absentRaw),
    agreement: ratioOrNull(overall.agree, overall.pairs),
    agreement_informative: ratioOrNull(overall.informativeAgree, overall.informative),
    pairs: overall.pairs,
    informative_pairs: overall.informative,
    downgrades,
    usage,
    est_cost_usd: estimateCost(model, usage),
    per_doc: perDoc,
    per_feature: [...perFeature.values()].sort((a, b) => b.fill_rate - a.fill_rate || a.feature_id.localeCompare(b.feature_id)),
  };
}

/**
 * Fill rate per category per document type, over the cells that were actually ASKED — the denominator that
 * makes the two document types comparable, since a feature whose declared loci are absent is never put to
 * the model and would otherwise count as a miss against whichever type happens to carry fewer loci.
 *
 * This is the cut the headline number hides. The aggregate says repos extract better; per category it splits
 * cleanly by WHAT is being asked, which is the distinction the prediction was really about.
 */
export interface CategoryComparison {
  category: string;
  repo_present: number;
  repo_asked: number;
  repo_fill: number | null;
  spec_present: number;
  spec_asked: number;
  spec_fill: number | null;
  /** which document type is the better evidence here; "tie" inside a 3-point band */
  better: "repo" | "spec_doc" | "tie";
}

export function categoryBreakdown(rows: DocumentLabels[]): CategoryComparison[] {
  const asked = (c: Cell) => c.downgrade_reason !== "undetectable_in_doc_type" && c.downgrade_reason !== "feature_not_asked";
  const acc = new Map<string, { repo: [number, number]; spec_doc: [number, number] }>();
  for (const r of rows) {
    for (const c of r.cells) {
      const e = acc.get(c.category) ?? acc.set(c.category, { repo: [0, 0], spec_doc: [0, 0] }).get(c.category)!;
      const slot = r.doc_type === "repo" ? e.repo : e.spec_doc;
      if (asked(c)) slot[1] += 1;
      if (c.verdict === "present") slot[0] += 1;
    }
  }
  return [...acc.entries()]
    .map(([category, e]) => {
      const rf = e.repo[1] ? e.repo[0] / e.repo[1] : null;
      const sf = e.spec_doc[1] ? e.spec_doc[0] / e.spec_doc[1] : null;
      const better: CategoryComparison["better"] = rf === null || sf === null ? "tie" : rf > sf + 0.03 ? "repo" : sf > rf + 0.03 ? "spec_doc" : "tie";
      return { category, repo_present: e.repo[0], repo_asked: e.repo[1], repo_fill: rf, spec_present: e.spec_doc[0], spec_asked: e.spec_doc[1], spec_fill: sf, better };
    })
    .sort((a, b) => a.category.localeCompare(b.category));
}

export const PREDICTION = "REVIEW §3: repos fill ~20-30% of behavioural columns with low agreement; spec docs 2-3x that with high agreement.";

/** Scores the recorded prediction against the measured report. No hedging: each clause is a boolean. */
export function scorePrediction(byDocType: DocTypeReport[]): Verdicts | null {
  const repo = byDocType.find((r) => r.doc_type === "repo");
  const spec = byDocType.find((r) => r.doc_type === "spec_doc");
  if (!repo || !spec || !repo.documents || !spec.documents) return null;
  const inBand = repo.fill_rate >= 0.2 && repo.fill_rate <= 0.3;
  const twoX = spec.fill_rate >= 2 * repo.fill_rate;
  const agreementHigher =
    repo.agreement_informative !== null && spec.agreement_informative !== null ? spec.agreement_informative > repo.agreement_informative : null;
  return {
    prediction: PREDICTION,
    repo_fill_rate: repo.fill_rate,
    spec_fill_rate: spec.fill_rate,
    fill_ratio_spec_over_repo: repo.fill_rate ? spec.fill_rate / repo.fill_rate : Infinity,
    repo_agreement_informative: repo.agreement_informative,
    spec_agreement_informative: spec.agreement_informative,
    repo_fill_in_predicted_band: inBand,
    spec_fill_at_least_2x_repo: twoX,
    spec_agreement_higher: agreementHigher,
    supported: twoX && agreementHigher !== false,
  };
}

const pct = (x: number | null) => (x === null ? "  n/a" : `${(x * 100).toFixed(1)}%`.padStart(6));

/** The human-readable verdict table. Kept separate from the JSON so both are trivially testable. */
export function renderReport(report: DetectabilityReport): string {
  const out: string[] = [];
  out.push(`\n══ detectability: repos vs spec documents ══`);
  out.push(`lexicon ${report.lexicon_version} · ${report.features} features · model ${report.model}`);
  out.push("");
  out.push(`${"doc type".padEnd(10)} ${"docs".padStart(5)} ${"runs".padStart(5)} ${"fill".padStart(6)} ${"fill*".padStart(6)} ${"absent lic".padStart(11)} ${"agree".padStart(6)} ${"agree(inf)".padStart(11)}`);
  for (const r of report.by_doc_type) {
    out.push(
      `${r.doc_type.padEnd(10)} ${String(r.documents).padStart(5)} ${String(r.runs).padStart(5)} ${pct(r.fill_rate)} ${pct(r.fill_rate_detectable)} ${`${pct(r.absent_licensing_rate)} (${r.absent_raw})`.padStart(11)} ${pct(r.agreement)} ${pct(r.agreement_informative).padStart(11)}`,
    );
  }
  out.push(`  fill  = cells not "unobserved", over all ${report.features} lexicon features`);
  out.push(`  fill* = same, over features this document type can witness at all (rule 0 removed)`);
  out.push(`  absent lic = share of raw "absent" answers that survived rules 1+2 (raw count in brackets)`);
  out.push(`  agree(inf) = run-to-run agreement over cells where at least one run was not "unobserved"`);

  if (report.by_category.length && report.by_doc_type.length > 1) {
    // The aggregate answers "which document type extracts more"; this answers "more of WHAT", which is the
    // question the prediction was actually about.
    out.push(`\n── by category (present / asked — only cells the model was really shown)`);
    out.push(`   ${"category".padEnd(26)} ${"repo".padStart(14)} ${"spec_doc".padStart(14)}   better`);
    for (const c of report.by_category) {
      const r = `${c.repo_present}/${c.repo_asked}`.padStart(8) + " " + pct(c.repo_fill);
      const sp = `${c.spec_present}/${c.spec_asked}`.padStart(8) + " " + pct(c.spec_fill);
      out.push(`   ${c.category.padEnd(26)} ${r} ${sp}   ${c.better}`);
    }
  }

  for (const r of report.by_doc_type) {
    if (!r.documents) continue;
    out.push(`\n── ${r.doc_type}: ${r.documents} documents, ${r.cells} cells, ${r.present} present / ${r.absent} absent / ${r.unobserved} unobserved`);
    const dg = Object.entries(r.downgrades).sort((a, b) => b[1] - a[1]);
    if (dg.length) out.push(`   downgrades: ${dg.map(([k, v]) => `${k}=${v}`).join(" ")}`);
    out.push(`   ${"document".padEnd(34)} ${"tok".padStart(6)} ${"loci".padStart(4)} ${"asked".padStart(5)} ${"fill".padStart(6)} ${"agree".padStart(6)}`);
    for (const d of r.per_doc) {
      out.push(`   ${d.doc_id.slice(0, 34).padEnd(34)} ${String(d.digest_tokens).padStart(6)} ${String(d.loci).padStart(4)} ${String(d.asked).padStart(5)} ${pct(d.fill_rate)} ${pct(d.agreement)}${d.errors ? `  (${d.errors} errors)` : ""}`);
    }
    const top = r.per_feature.filter((f) => f.fill_rate > 0).slice(0, 12);
    if (top.length) {
      out.push(`   most-filled columns:`);
      for (const f of top) out.push(`     ${f.feature_id.padEnd(34)} fill ${pct(f.fill_rate)}  agree(inf) ${pct(f.agreement_informative)}  ${f.present}P/${f.absent}A`);
    }
    const never = r.per_feature.filter((f) => f.fill_rate === 0).length;
    out.push(`   columns never filled in any document: ${never}/${report.features}`);
  }

  if (report.blocked.length) {
    out.push(`\n── blocked (${report.blocked.length}):`);
    for (const b of report.blocked.slice(0, 20)) out.push(`   ${b.doc_type} ${b.doc_id}: ${b.reason}`);
  }

  const v = report.verdict;
  out.push(`\n── verdict`);
  if (!v) out.push(`   not computable: both document types must have labelled documents (run with --doc-type both).`);
  else {
    out.push(`   prediction: ${v.prediction}`);
    out.push(`   repo fill ${pct(v.repo_fill_rate)} — in the predicted 20-30% band: ${v.repo_fill_in_predicted_band ? "yes" : "no"}`);
    out.push(`   spec fill ${pct(v.spec_fill_rate)} — ${v.fill_ratio_spec_over_repo.toFixed(2)}x repos; predicted ≥2x: ${v.spec_fill_at_least_2x_repo ? "yes" : "no"}`);
    out.push(`   agreement (informative): repo ${pct(v.repo_agreement_informative)} vs spec ${pct(v.spec_agreement_informative)} — specs higher: ${v.spec_agreement_higher === null ? "n/a" : v.spec_agreement_higher ? "yes" : "no"}`);
    out.push(`   → the recorded prediction is ${v.supported ? "SUPPORTED" : "NOT supported"}; on this evidence the repo scrape ${v.supported ? "does not earn its place" : "may earn a second look"}.`);
  }
  return out.join("\n");
}

// ---------- fetching repos (the only network IO; everything above is pure) ----------

export interface FetchResult {
  dir: string | null;
  reason: string | null;
  cached: boolean;
}

function run(cmd: string, args: string[], timeoutMs: number): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { timeout: timeoutMs, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr?.on("data", (d) => {
      stderr += String(d).slice(0, 500);
    });
    child.on("error", (e) => resolve({ code: -1, stderr: e.message }));
    child.on("close", (code) => resolve({ code: code ?? -1, stderr }));
  });
}

/** Shallow, single-branch clone into a content-addressed cache dir. Never re-clones what is already there. */
export async function fetchRepo(owner: string, name: string, cacheDir: string, opts: { fetch?: boolean; timeoutMs?: number } = {}): Promise<FetchResult> {
  const dir = path.join(cacheDir, `${owner}__${name}`);
  if (await fs.stat(dir).then((s) => s.isDirectory()).catch(() => false)) return { dir, reason: null, cached: true };
  if (opts.fetch === false) return { dir: null, reason: `no local clone at ${dir} and --no-fetch was passed`, cached: false };
  await fs.mkdir(cacheDir, { recursive: true });
  const res = await run("git", ["clone", "--depth", "1", "--single-branch", "--quiet", `https://github.com/${owner}/${name}.git`, dir], opts.timeoutMs ?? 180_000);
  if (res.code !== 0) {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    return { dir: null, reason: `git clone failed (${res.code}): ${res.stderr.trim().split("\n").pop() ?? ""}`, cached: false };
  }
  return { dir, reason: null, cached: false };
}

// ---------- runner ----------

export interface RunOptions {
  docTypes: DocType[];
  limit: number;
  runs: number;
  maxTokens: number;
  batchSize: number;
  concurrency: number;
  repoCache: string;
  fetch: boolean;
  corpusDir: string;
  /** explicit corpus document ids; overrides `limit` (see `pairedEntries`) */
  docIds?: string[];
  log?: (s: string) => void;
}

export interface RunResult {
  rows: DocumentLabels[];
  blocked: { doc_type: DocType; doc_id: string; reason: string }[];
}

/**
 * Documents that have BOTH sides available: the pairing is the whole point of the comparison.
 *
 * `docIds` exists because manifest order is not a neutral sample. Many of the corpus's GitHub URLs point at a
 * product's **documentation** repository (odoo/documentation, invoiceninja.github.io, sharetribe/flex-docs …),
 * where the "repo" side is the same prose as the spec side. Running on those would measure prose twice and
 * flatter the repo arm. Naming the documents explicitly keeps the sample auditable.
 */
export function pairedEntries(manifest: ManifestEntry[], limit: number, docIds?: string[]): ManifestEntry[] {
  const paired = manifest.filter((e) => parseGithubRepo(e.source_url));
  if (docIds?.length) {
    const wanted = new Set(docIds);
    const picked = paired.filter((e) => wanted.has(e.id));
    const missing = docIds.filter((id) => !picked.some((e) => e.id === id));
    if (missing.length) throw new Error(`--docs: no GitHub-paired corpus document with id(s): ${missing.join(", ")}`);
    return picked;
  }
  return paired.slice(0, Math.max(1, limit));
}

export async function runExperiment(llm: LLM, lex: Lexicon, catalogVersion: string, opts: RunOptions): Promise<RunResult> {
  const log = opts.log ?? (() => {});
  const manifest = await loadManifest(opts.corpusDir);
  const entries = pairedEntries(manifest, opts.limit, opts.docIds);
  const blocked: RunResult["blocked"] = [];
  const digests: Digest[] = [];

  for (const e of entries) {
    if (opts.docTypes.includes("spec_doc")) {
      const text = await fs.readFile(path.join(opts.corpusDir, e.file), "utf8").catch(() => null);
      if (text === null) blocked.push({ doc_type: "spec_doc", doc_id: e.id, reason: `corpus file missing: ${e.file}` });
      else digests.push(condenseSpecDoc(e.id, text, { archetype: e.archetype, maxTokens: opts.maxTokens }));
    }
    if (opts.docTypes.includes("repo")) {
      const repo = parseGithubRepo(e.source_url)!;
      const got = await fetchRepo(repo.owner, repo.name, opts.repoCache, { fetch: opts.fetch });
      if (!got.dir) blocked.push({ doc_type: "repo", doc_id: `${repo.owner}/${repo.name}`, reason: got.reason ?? "unavailable" });
      else {
        const files = await readRepoDir(got.dir);
        const digest = condenseRepo(`${repo.owner}/${repo.name}`, files, { archetype: e.archetype, maxTokens: opts.maxTokens });
        log(`  repo ${repo.owner}/${repo.name}: ${files.length} files → ${digest.approx_tokens} tok, loci [${digest.available_loci.join(",")}]${got.cached ? " (cached clone)" : ""}`);
        digests.push(digest);
      }
    }
  }

  const jobs: { digest: Digest; run: number }[] = [];
  for (let r = 1; r <= opts.runs; r++) for (const d of digests) jobs.push({ digest: d, run: r });

  const rows = await parallelMap(jobs, Math.max(1, opts.concurrency), async (job, i) => {
    log(`[${i + 1}/${jobs.length}] run ${job.run} · ${job.digest.doc_type} · ${job.digest.doc_id} (${job.digest.approx_tokens} tok)`);
    return labelDocument(llm, job.digest, lex, {
      run: job.run,
      batchSize: opts.batchSize,
      cacheSalt: `detectability-run-${job.run}`,
      versions: { lexicon: lex.version, catalog: catalogVersion },
    });
  });
  return { rows, blocked };
}

export function buildReport(rows: DocumentLabels[], lex: Lexicon, meta: { model: string; catalogVersion: string; blocked: RunResult["blocked"]; now: string }): DetectabilityReport {
  const byDocType = (["repo", "spec_doc"] as DocType[])
    .map((dt) => buildDocTypeReport(dt, rows.filter((r) => r.doc_type === dt), lex, meta.model))
    .filter((r) => r.documents > 0 || rows.length === 0);
  return {
    generated_at: meta.now,
    lexicon_version: lex.version,
    catalog_version: meta.catalogVersion,
    model: meta.model,
    features: lex.features.length,
    by_doc_type: byDocType,
    by_category: categoryBreakdown(rows),
    verdict: scorePrediction(byDocType),
    blocked: meta.blocked,
  };
}

// ---------- CLI ----------

const here = path.dirname(fileURLToPath(import.meta.url));

const USAGE = `detectability — labels paired repos and spec documents and reports which document type is
actually extractable, per category. A live run SPENDS MONEY (measured: ~$29 for 8+8 documents at 2 runs
with Opus), so every flag is checked before anything is called.

  npm run detectability -- [--mock] [--doc-type both|repo|spec_doc] [--limit N | --all] [--runs N]
                           [--docs id,id] [--model <id>] [--out <dir>] [--corpus <dir>]
                           [--max-digest-tokens N] [--batch-size N] [--concurrency N]
                           [--repo-cache <dir>] [--no-fetch]

  --mock   runs the whole pipeline on scripted handlers: no credentials, no cost. Start here.
  --all    lifts the small default limit. Only with --mock unless you mean to spend.`;

const KNOWN_FLAGS = new Set(["--mock", "--all", "--no-fetch", "--doc-type", "--limit", "--runs", "--docs", "--model", "--out", "--corpus", "--max-digest-tokens", "--batch-size", "--concurrency", "--repo-cache"]);

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  // Unknown or help flags must never fall through into a live run. `--help` once started a full paid
  // experiment because nothing validated the arguments — the cheapest possible bug to prevent, and an
  // expensive one to hit.
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(USAGE);
    process.exit(0);
  }
  const takesValue = new Set(["--doc-type", "--limit", "--runs", "--docs", "--model", "--out", "--corpus", "--max-digest-tokens", "--batch-size", "--concurrency", "--repo-cache"]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith("--")) continue;
    if (!KNOWN_FLAGS.has(a)) {
      console.error(`unknown flag ${a}\n\n${USAGE}`);
      process.exit(2);
    }
    if (takesValue.has(a) && (argv[i + 1] === undefined || argv[i + 1]!.startsWith("--"))) {
      console.error(`${a} needs a value\n\n${USAGE}`);
      process.exit(2);
    }
  }
  const flag = (name: string, dflt: string) => {
    const i = argv.indexOf(name);
    return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1]! : dflt;
  };
  const dtArg = flag("--doc-type", "both");
  const docTypes: DocType[] = dtArg === "both" ? ["spec_doc", "repo"] : dtArg === "repo" ? ["repo"] : ["spec_doc"];
  const all = argv.includes("--all");
  const opts: RunOptions = {
    docTypes,
    limit: all ? 1000 : Number(flag("--limit", "8")),
    runs: Number(flag("--runs", "2")),
    maxTokens: Number(flag("--max-digest-tokens", "30000")),
    batchSize: Number(flag("--batch-size", "45")),
    concurrency: Number(flag("--concurrency", "3")),
    repoCache: flag("--repo-cache", path.resolve(here, "../../.cache/repos")),
    fetch: !argv.includes("--no-fetch"),
    corpusDir: flag("--corpus", CORPUS_DIR),
    ...(argv.includes("--docs") ? { docIds: flag("--docs", "").split(",").map((s) => s.trim()).filter(Boolean) } : {}),
    log: (s) => console.log(s),
  };
  const outDir = flag("--out", "mining-results");
  const modelId = flag("--model", "claude-opus-4-8");
  const mock = argv.includes("--mock");

  const { lexicon, catalogVersion } = await loadValidatedLexicon();
  let llm: LLM;
  if (mock) {
    const { MockLLM } = await import("../llm/client.js");
    const { labelMockHandlers } = await import("./label_mock.js");
    llm = new MockLLM(labelMockHandlers);
  } else {
    const { makeModel } = await import("../llm/registry.js");
    llm = makeModel(modelId);
  }

  console.log(`detectability · lexicon ${lexicon.version} (${lexicon.features.length} features) · catalogs ${catalogVersion}`);
  console.log(`llm ${llm.name} (${llm.models.strong}) · doc types [${docTypes.join(",")}] · ${opts.docIds ? `docs [${opts.docIds.join(",")}]` : `limit ${all ? "ALL" : opts.limit}`} · runs ${opts.runs} · digest cap ${opts.maxTokens} tok`);
  if (!all) console.log(`(default limit keeps a live run cheap; pass --all to label the whole paired corpus)`);

  const { rows, blocked } = await runExperiment(llm, lexicon, catalogVersion, opts);
  const report = buildReport(rows, lexicon, { model: llm.models.strong, catalogVersion, blocked, now: new Date().toISOString() });
  console.log(renderReport(report));

  const usage = totalUsage(rows);
  console.log(`\ntokens: ${usage.input_tokens} in / ${usage.output_tokens} out · estimated cost $${estimateCost(llm.models.strong, usage).toFixed(2)} (list-price estimate)`);
  const failed = rows.reduce((n, r) => n + r.errors.length, 0);
  if (failed) console.log(`${failed} batch failures (see the rows file)`);

  await fs.mkdir(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportFile = path.join(outDir, `${stamp}-detectability.json`);
  const rowsFile = path.join(outDir, `${stamp}-detectability-rows.json`);
  await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
  await fs.writeFile(rowsFile, `${rows.map((r) => JSON.stringify(r)).join("\n")}\n`);
  console.log(`written ${reportFile} and ${rowsFile}`);
}
