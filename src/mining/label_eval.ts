/**
 * Evidence layer, part 5 — **label quality, consensus and calibration**.
 *
 * `label.ts` produces rows of the evidence matrix. Nothing there says whether those rows are any good, and
 * the pipeline downstream turns them into priors — so an unmeasured labeller becomes a confidently wrong
 * prior. This file is the measurement, and it is deliberately made of counts:
 *
 *   - **Against a human gold set.** `catalogs/gold/label-gold.json` holds cells a person actually adjudicated
 *     from real corpus documents. Precision is computed ONLY over cells that exist in the gold row. A cell
 *     nobody adjudicated is not evidence of agreement and is excluded from every denominator — treating it as
 *     an agreed `unobserved` would manufacture a near-perfect score out of a mostly-empty matrix, which is the
 *     single easiest way to lie with this file.
 *   - **Against itself.** Run-to-run agreement, over *informative* cells (at least one run said something
 *     other than `unobserved`), using `computeAgreement` from detectability.ts — that is the one definition of
 *     agreement in this repo and it is reused, never re-derived here.
 *   - **Against the artifact.** Every `present` quote is checked back against the document text with
 *     `quoteOccurs`. When no digests are supplied the metric is `null`, never a comfortable 1.0.
 *
 * Three rules the numbers obey:
 *
 *  1. **Every rate is `null` when its denominator is zero.** Not 0, not 1. A rate with no support is not a
 *     small number, it is the absence of a measurement, and 0 would read as "the labeller got nothing right".
 *  2. **Populations are never silently pooled.** Agreement and precision are reported per category, per
 *     source type (`doc_type`) and per archetype. A pooled figure is allowed, but it is spelled `pooled` in
 *     the report and in the rendering, because a single number over repos + specs answers no question anyone
 *     asked.
 *  3. **Disagreement is preserved, never averaged.** `consensusCell` accepts an agreed verdict, or a verdict
 *     that satisfies an explicit consensus rule; otherwise the cell becomes `unobserved` with the reason
 *     `run_disagreement`. Two runs saying `present` and `absent` do NOT become a 0.5 — there is no
 *     probability anywhere in this file, and every result carries the per-run tally so the split stays visible.
 *
 * `absent_precision` is the expensive metric. A wrong `present` costs one bad column in one row; a wrong
 * `absent` becomes a population prior saying "apps like this don't do X", which then suppresses a decision
 * card and silently removes the question from a user's Sheet. It is the number to watch, and it is the number
 * with the smallest denominator — hence the confusion counts, so a reader can see WHERE the disagreement is
 * rather than just how much of it there is.
 *
 * Pure functions over already-loaded rows. No LLM is called from this file, ever — it grades a run that
 * already happened.
 *
 * CLI: npm run label:eval -- --labels <file.jsonl> [--gold <file>] [--digests <file.jsonl>] [--out <dir>]
 */
import { z } from "zod";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { helpRequested, parseFlags, UsageError } from "../cli/flags.js";
import { DOC_TYPES, type DocType } from "./lexicon.js";
import { computeAgreement, groupByDoc } from "./detectability.js";
import { VERDICTS, quoteOccurs, type Cell, type DocumentLabels, type DowngradeReason, type Verdict } from "./label.js";

// ---------- the shape the metrics need ----------

/**
 * The minimum a row must carry to be graded. `DocumentLabels` satisfies this structurally, and so does the
 * `ConsensusRow` produced below — which is the point: consensus collapses repeated runs into one row per
 * document, and the same precision code must grade either without a second implementation.
 */
export interface EvalCell {
  feature_id: string;
  category: string;
  verdict: Verdict;
  evidence: string;
  downgrade_reason: string | null;
}

export interface EvalRow {
  doc_id: string;
  doc_type: DocType;
  archetype: string;
  run?: number;
  model?: string;
  lexicon_version?: string;
  catalog_version?: string;
  /** carried when the producing run recorded it; the report reports `null` rather than inventing one */
  prompt_version?: string;
  digest_hash?: string;
  errors?: readonly string[];
  cells: readonly EvalCell[];
}

/** A rate and the counts it came from. `rate` is `null` exactly when `total === 0`. */
export interface Counted {
  matched: number;
  total: number;
  rate: number | null;
}

export const counted = (matched: number, total: number): Counted => ({ matched, total, rate: total ? matched / total : null });

// ---------- gold set ----------

export const GOLD_SCHEMA_ID = "zadum.label-gold.v1";

export const GoldCellSchema = z.object({
  feature_id: z.string().min(1),
  verdict: z.enum(VERDICTS),
  /** why a human decided this, in their own words. Prose, not a score. */
  note: z.string().default(""),
});
export type GoldCell = z.infer<typeof GoldCellSchema>;

export const GoldArtifactSchema = z.object({
  doc_id: z.string().min(1),
  doc_type: z.enum(DOC_TYPES),
  archetype: z.string().min(1),
  cells: z.array(GoldCellSchema).min(1),
});
export type GoldArtifact = z.infer<typeof GoldArtifactSchema>;

export const LabelGoldSchema = z.object({
  schema: z.literal(GOLD_SCHEMA_ID),
  version: z.string().min(1),
  lexicon_version: z.string().min(1),
  catalog_version: z.string().default(""),
  note: z.string().default(""),
  todo: z.string().default(""),
  artifacts: z.array(GoldArtifactSchema).min(1),
});
export type LabelGold = z.infer<typeof LabelGoldSchema>;

const here = path.dirname(fileURLToPath(import.meta.url));
/**
 * Under `catalogs/gold/`, never top-level `catalogs/*.json`: `loadCatalogs()` parses EVERY top-level JSON
 * there with `CatalogSchema`, so a non-catalog file at that level would break catalog loading for the whole
 * engine. Sub-directories are the established escape hatch (`catalogs/lexicon`, `catalogs/exemplars`).
 */
export const DEFAULT_GOLD_FILE = path.resolve(here, "../../catalogs/gold/label-gold.json");

export async function loadGold(file: string = DEFAULT_GOLD_FILE): Promise<LabelGold> {
  return LabelGoldSchema.parse(JSON.parse(await fs.readFile(file, "utf8")));
}

/** doc_id → feature_id → the human's verdict. Only adjudicated cells are in here, by construction. */
export type GoldIndex = Map<string, Map<string, GoldCell>>;

export function goldIndex(gold: LabelGold): GoldIndex {
  const idx: GoldIndex = new Map();
  for (const a of gold.artifacts) {
    const byFeature = idx.get(a.doc_id) ?? idx.set(a.doc_id, new Map()).get(a.doc_id)!;
    for (const c of a.cells) byFeature.set(c.feature_id, c);
  }
  return idx;
}

export function goldCellCount(gold: LabelGold): number {
  return gold.artifacts.reduce((n, a) => n + a.cells.length, 0);
}

/**
 * Every (row cell, gold cell) pair that a human actually adjudicated.
 *
 * The exclusion is the whole point: a row cell whose feature is missing from the gold row yields nothing —
 * no numerator, no denominator, no "they both said unobserved so that's agreement". With ~136 lexicon columns
 * and ~10 adjudicated cells per document, counting the rest as agreement would report ~93% accuracy for a
 * labeller that answered nothing at all.
 *
 * Note that N repeated runs of a document produce N pairs per gold cell. That is deliberate — it grades the
 * labeller as it actually behaves — but it also means a document run more often weighs more. Collapse runs
 * with `consensusRows` first when you want one vote per document.
 */
export function goldPairs(rows: readonly EvalRow[], gold: GoldIndex): { doc_id: string; feature_id: string; predicted: Verdict; expected: Verdict; row: EvalRow; cell: EvalCell }[] {
  const out: { doc_id: string; feature_id: string; predicted: Verdict; expected: Verdict; row: EvalRow; cell: EvalCell }[] = [];
  for (const row of rows) {
    const byFeature = gold.get(row.doc_id);
    if (!byFeature) continue;
    for (const cell of row.cells) {
      const g = byFeature.get(cell.feature_id);
      if (!g) continue; // never adjudicated → not evidence either way
      out.push({ doc_id: row.doc_id, feature_id: cell.feature_id, predicted: cell.verdict, expected: g.verdict, row, cell });
    }
  }
  return out;
}

// ---------- precision / recall against gold ----------

/** Of cells the labeller called `verdict`, the share the human agrees are `verdict`. */
export function verdictPrecisionCounts(rows: readonly EvalRow[], gold: GoldIndex, verdict: Verdict): Counted {
  const pairs = goldPairs(rows, gold).filter((p) => p.predicted === verdict);
  return counted(pairs.filter((p) => p.expected === verdict).length, pairs.length);
}

/** Of cells the human called `verdict`, the share the labeller also called `verdict` (adjudicated cells only). */
export function verdictRecallCounts(rows: readonly EvalRow[], gold: GoldIndex, verdict: Verdict): Counted {
  const pairs = goldPairs(rows, gold).filter((p) => p.expected === verdict);
  return counted(pairs.filter((p) => p.predicted === verdict).length, pairs.length);
}

export function presentPrecision(rows: readonly EvalRow[], gold: GoldIndex): number | null {
  return verdictPrecisionCounts(rows, gold, "present").rate;
}

/**
 * The expensive metric. A wrong `absent` does not stay in the matrix: it becomes a population prior of the
 * form "apps like this don't do X", which suppresses the decision card that would have asked. A wrong
 * `present` is one noisy column; a wrong `absent` deletes a question from a user's Sheet. It also has the
 * smallest denominator of anything here, because rules 1 and 2 in label.ts throw most negatives away — so
 * read it next to `absent_precision.total`, never on its own.
 */
export function absentPrecision(rows: readonly EvalRow[], gold: GoldIndex): number | null {
  return verdictPrecisionCounts(rows, gold, "absent").rate;
}

export function presentRecall(rows: readonly EvalRow[], gold: GoldIndex): number | null {
  return verdictRecallCounts(rows, gold, "present").rate;
}

export function absentRecall(rows: readonly EvalRow[], gold: GoldIndex): number | null {
  return verdictRecallCounts(rows, gold, "absent").rate;
}

/** `{gold, predicted, n}` triples: not how much disagreement there is, but where it lives. */
export interface ConfusionCount {
  gold: Verdict;
  predicted: Verdict;
  n: number;
}

export function confusionCounts(rows: readonly EvalRow[], gold: GoldIndex): ConfusionCount[] {
  const acc = new Map<string, number>();
  for (const p of goldPairs(rows, gold)) {
    const key = `${p.expected} ${p.predicted}`;
    acc.set(key, (acc.get(key) ?? 0) + 1);
  }
  const out: ConfusionCount[] = [];
  for (const g of VERDICTS) {
    for (const pr of VERDICTS) {
      const n = acc.get(`${g} ${pr}`) ?? 0;
      if (n) out.push({ gold: g, predicted: pr, n });
    }
  }
  return out;
}

// ---------- agreement (run-to-run) ----------

/**
 * Run-to-run agreement over *informative* cells — cells where at least one of the two runs said something
 * other than `unobserved`. `computeAgreement` (detectability.ts) is the single definition of this in the
 * repo and is reused verbatim: raw agreement is inflated by a sea of agreed-upon `unobserved`, and the
 * informative figure is the one that means anything.
 */
export function informativeAgreementCounts(runs: readonly DocumentLabels[]): Counted {
  const { overall } = computeAgreement([...runs]);
  return counted(overall.informativeAgree, overall.informative);
}

export function informativeAgreement(runs: readonly DocumentLabels[]): number | null {
  return informativeAgreementCounts(runs).rate;
}

/** Raw agreement over every compared cell. Kept only so the report can show how much the informative cut moves it. */
export function rawAgreementCounts(runs: readonly DocumentLabels[]): Counted {
  const { overall } = computeAgreement([...runs]);
  return counted(overall.agree, overall.pairs);
}

export interface AgreementBreakdown {
  key: string;
  documents: number;
  pairs: number;
  informative_pairs: number;
  agreement: number | null;
  agreement_informative: number | null;
}

const breakdown = (key: string, documents: number, raw: Counted, informative: Counted): AgreementBreakdown => ({
  key,
  documents,
  pairs: raw.total,
  informative_pairs: informative.total,
  agreement: raw.rate,
  agreement_informative: informative.rate,
});

/**
 * Agreement per **category**, computed from the per-feature counts `computeAgreement` already returns.
 * Categories are kept apart on purpose: "the labeller agrees with itself 81% of the time" over payments +
 * scheduling + compliance is a number about the mix of the corpus, not about the labeller.
 */
export function agreementByCategory(runs: readonly DocumentLabels[]): AgreementBreakdown[] {
  const { byFeature } = computeAgreement([...runs]);
  const categoryOf = new Map<string, string>();
  const docsPerCategory = new Map<string, Set<string>>();
  for (const r of runs) {
    for (const c of r.cells) {
      if (!categoryOf.has(c.feature_id)) categoryOf.set(c.feature_id, c.category);
      (docsPerCategory.get(c.category) ?? docsPerCategory.set(c.category, new Set()).get(c.category)!).add(r.doc_id);
    }
  }
  const acc = new Map<string, { agree: number; pairs: number; infAgree: number; inf: number }>();
  for (const [featureId, p] of byFeature) {
    const category = categoryOf.get(featureId) ?? "unknown";
    const e = acc.get(category) ?? acc.set(category, { agree: 0, pairs: 0, infAgree: 0, inf: 0 }).get(category)!;
    e.agree += p.agree;
    e.pairs += p.pairs;
    e.infAgree += p.informativeAgree;
    e.inf += p.informative;
  }
  return [...acc.entries()]
    .map(([category, e]) => breakdown(category, docsPerCategory.get(category)?.size ?? 0, counted(e.agree, e.pairs), counted(e.infAgree, e.inf)))
    .sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Agreement per group, with each group's rows fed to `computeAgreement` separately. Never a pooled number
 * split afterwards: a repo row and a spec row are different populations and comparing runs across them would
 * be meaningless anyway (they are different documents), but grouping first also keeps the denominators honest.
 */
function agreementByGroup(runs: readonly DocumentLabels[], keyOf: (r: DocumentLabels) => string): AgreementBreakdown[] {
  const groups = new Map<string, DocumentLabels[]>();
  for (const r of runs) (groups.get(keyOf(r)) ?? groups.set(keyOf(r), []).get(keyOf(r))!).push(r);
  return [...groups.entries()]
    .map(([key, rs]) => breakdown(key, groupByDoc(rs).size, rawAgreementCounts(rs), informativeAgreementCounts(rs)))
    .sort((a, b) => a.key.localeCompare(b.key));
}

export function agreementBySourceType(runs: readonly DocumentLabels[]): AgreementBreakdown[] {
  return agreementByGroup(runs, (r) => r.doc_type);
}

export function agreementByArchetype(runs: readonly DocumentLabels[]): AgreementBreakdown[] {
  return agreementByGroup(runs, (r) => r.archetype || "unknown");
}

// ---------- no-answer rate ----------

/**
 * A cell counts as ASKED when it was not excluded before the model saw it: rule 0
 * (`undetectable_in_doc_type`) and "this batch never contained the feature" (`feature_not_asked`) are the two
 * ways a cell exists without a question having been put. Everything else was asked.
 */
export function wasAsked(cell: EvalCell): boolean {
  return cell.downgrade_reason !== "undetectable_in_doc_type" && cell.downgrade_reason !== "feature_not_asked";
}

/**
 * Share of asked features the model returned no answer for. This is where a **failed batch** shows up as a
 * number: when a call throws, `labelDocument` still emits a cell for every feature in that batch with
 * `no_answer_from_model`, so a silently-dropped batch cannot hide inside a healthy-looking fill rate — it
 * pushes this rate up. Read it next to `errors` in the report.
 */
export function noAnswerCounts(rows: readonly EvalRow[]): Counted {
  const asked = rows.flatMap((r) => r.cells.filter(wasAsked));
  return counted(asked.filter((c) => c.downgrade_reason === "no_answer_from_model").length, asked.length);
}

export function noAnswerRate(rows: readonly EvalRow[]): number | null {
  return noAnswerCounts(rows).rate;
}

// ---------- evidence quote validity ----------

export interface QuoteValidity extends Counted {
  /** `present` cells whose document text was not supplied — excluded, never counted as valid */
  unchecked: number;
}

/**
 * Share of `present` cells whose quote really occurs in the artifact, using the same lenient
 * whitespace-normalised containment test the labeller's own rule uses (`quoteOccurs`).
 *
 * `digests` maps doc_id → artifact text. A `present` cell for a document with no supplied text is
 * **unchecked**: it leaves both the numerator and the denominator, and when nothing at all can be checked the
 * rate is `null`. Reporting 1.0 for "we did not look" is exactly the failure this whole file exists to catch.
 */
export function evidenceQuoteValidityCounts(rows: readonly EvalRow[], digests: ReadonlyMap<string, string> | undefined): QuoteValidity {
  let valid = 0;
  let checked = 0;
  let unchecked = 0;
  for (const row of rows) {
    const text = digests?.get(row.doc_id);
    for (const cell of row.cells) {
      if (cell.verdict !== "present") continue;
      if (text === undefined) {
        unchecked += 1;
        continue;
      }
      checked += 1;
      if (quoteOccurs(cell.evidence, text)) valid += 1;
    }
  }
  return { ...counted(valid, checked), unchecked };
}

export function evidenceQuoteValidity(rows: readonly EvalRow[], digests: ReadonlyMap<string, string> | undefined): number | null {
  return evidenceQuoteValidityCounts(rows, digests).rate;
}

// ---------- precision breakdowns (never pooled silently) ----------

export interface PrecisionBreakdown {
  key: string;
  adjudicated_cells: number;
  present_precision: Counted;
  absent_precision: Counted;
  present_recall: Counted;
  absent_recall: Counted;
}

function precisionByGroup(rows: readonly EvalRow[], gold: GoldIndex, keyOf: (r: EvalRow, c: EvalCell) => string): PrecisionBreakdown[] {
  const groups = new Map<string, { rows: EvalRow[] }>();
  // Group whole rows where the key is a row property; where the key is a cell property (category) the row is
  // narrowed to the cells of that group, so the denominators stay inside one population.
  for (const row of rows) {
    const byKey = new Map<string, EvalCell[]>();
    for (const cell of row.cells) {
      const k = keyOf(row, cell);
      (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(cell);
    }
    for (const [k, cells] of byKey) {
      const g = groups.get(k) ?? groups.set(k, { rows: [] }).get(k)!;
      g.rows.push({ ...row, cells });
    }
  }
  return [...groups.entries()]
    .map(([key, g]) => ({
      key,
      adjudicated_cells: goldPairs(g.rows, gold).length,
      present_precision: verdictPrecisionCounts(g.rows, gold, "present"),
      absent_precision: verdictPrecisionCounts(g.rows, gold, "absent"),
      present_recall: verdictRecallCounts(g.rows, gold, "present"),
      absent_recall: verdictRecallCounts(g.rows, gold, "absent"),
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

export function precisionByCategory(rows: readonly EvalRow[], gold: GoldIndex): PrecisionBreakdown[] {
  return precisionByGroup(rows, gold, (_r, c) => c.category);
}

export function precisionBySourceType(rows: readonly EvalRow[], gold: GoldIndex): PrecisionBreakdown[] {
  return precisionByGroup(rows, gold, (r) => r.doc_type);
}

export function precisionByArchetype(rows: readonly EvalRow[], gold: GoldIndex): PrecisionBreakdown[] {
  return precisionByGroup(rows, gold, (r) => r.archetype || "unknown");
}

// ---------- consensus across repeated runs ----------

export const RUN_DISAGREEMENT = "run_disagreement";
export type ConsensusReason = DowngradeReason | typeof RUN_DISAGREEMENT;

/**
 * `unanimous` — every run must have said the same thing.
 * `majority`  — the modal verdict wins if it is unique AND at least `min` runs voted for it. `min` is an
 *               absolute run count, not a share: for a strict majority of n runs pass `Math.floor(n/2) + 1`.
 *               A tie is never broken; it is a disagreement.
 */
export type ConsensusRule = { kind: "unanimous" } | { kind: "majority"; min: number };

export const UNANIMOUS: ConsensusRule = { kind: "unanimous" };

export type VerdictTally = Record<Verdict, number>;

export interface ConsensusCell extends Omit<Cell, "downgrade_reason"> {
  downgrade_reason: ConsensusReason | null;
}

export interface ConsensusResult {
  cell: ConsensusCell;
  verdict: Verdict;
  /** true when every run said the same thing */
  unanimous: boolean;
  /** true when the verdict was accepted (unanimous, or the rule was satisfied) */
  accepted: boolean;
  /** the per-run verdicts, in input order — the disagreement is preserved, not resolved away */
  runs: Verdict[];
  tally: VerdictTally;
  reason: ConsensusReason | null;
}

const emptyTally = (): VerdictTally => ({ present: 0, absent: 0, unobserved: 0 });

/**
 * Fold N runs of the same cell into one.
 *
 * Conflicting labels are NEVER averaged into a probability. `present` and `absent` from two runs is not
 * "0.5 present" — it is a cell the labeller could not reproduce, which is exactly what `unobserved` means
 * here, and the reason is recorded as `run_disagreement`. The full tally rides along on the result so a
 * reader (or a later calibration step counting across documents) can still see the split.
 */
export function consensusCell(cells: readonly Cell[], rule: ConsensusRule = UNANIMOUS): ConsensusResult {
  if (cells.length === 0) throw new Error("consensusCell: no cells to fold (a cell must exist in at least one run)");
  const runs = cells.map((c) => c.verdict);
  const tally = emptyTally();
  for (const v of runs) tally[v] += 1;

  const first = cells[0]!;
  const base = { feature_id: first.feature_id, category: first.category };
  const unanimous = runs.every((v) => v === runs[0]);

  let chosen: Verdict | null = null;
  if (unanimous) chosen = runs[0]!;
  else if (rule.kind === "majority") {
    const ranked = VERDICTS.map((v) => ({ v, n: tally[v] })).sort((a, b) => b.n - a.n);
    const top = ranked[0]!;
    const tied = ranked.filter((r) => r.n === top.n).length > 1;
    if (!tied && top.n >= rule.min) chosen = top.v;
  }

  if (chosen === null) {
    return {
      cell: { ...base, verdict: "unobserved", raw_verdict: "", evidence: "", loci_checked: [], downgrade_reason: RUN_DISAGREEMENT },
      verdict: "unobserved",
      unanimous: false,
      accepted: false,
      runs,
      tally,
      reason: RUN_DISAGREEMENT,
    };
  }

  const winners = cells.filter((c) => c.verdict === chosen);
  const rep = winners.find((c) => c.evidence.trim().length > 0) ?? winners[0]!;
  const loci = [...new Set(winners.flatMap((c) => c.loci_checked))].sort();
  // A downgrade reason only carries over when every winning run gave the same one; otherwise it is not a
  // property of the consensus cell.
  const reasons = new Set(winners.map((c) => c.downgrade_reason));
  const reason: ConsensusReason | null = reasons.size === 1 ? (winners[0]!.downgrade_reason ?? null) : null;
  return {
    cell: { ...base, verdict: chosen, raw_verdict: rep.raw_verdict, evidence: rep.evidence, loci_checked: loci, downgrade_reason: reason },
    verdict: chosen,
    unanimous,
    accepted: true,
    runs,
    tally,
    reason,
  };
}

export interface ConsensusRow extends EvalRow {
  cells: ConsensusCell[];
  runs_folded: number;
  disagreements: number;
  /** feature ids where the runs did not agree — kept so the split is auditable, not just counted */
  disagreed_features: string[];
  errors: string[];
}

export interface ConsensusSummary {
  rule: ConsensusRule;
  documents: number;
  cells: number;
  disagreements: number;
  /** share of folded cells that ended as `run_disagreement`; null when nothing was folded */
  disagreement_rate: number | null;
  /** documents that had only one run — nothing to fold, so nothing measured about stability */
  single_run_documents: number;
}

/** One row per document, folding its runs with `rule`. Rows for documents with a single run pass through. */
export function consensusRows(rows: readonly DocumentLabels[], rule: ConsensusRule = UNANIMOUS): ConsensusRow[] {
  const out: ConsensusRow[] = [];
  for (const [doc_id, runs] of groupByDoc([...rows])) {
    const byFeature = new Map<string, Cell[]>();
    const order: string[] = [];
    for (const r of runs) {
      for (const c of r.cells) {
        if (!byFeature.has(c.feature_id)) order.push(c.feature_id);
        (byFeature.get(c.feature_id) ?? byFeature.set(c.feature_id, []).get(c.feature_id)!).push(c);
      }
    }
    const cells: ConsensusCell[] = [];
    const disagreed: string[] = [];
    for (const featureId of order) {
      const res = consensusCell(byFeature.get(featureId)!, rule);
      cells.push(res.cell);
      if (!res.accepted) disagreed.push(featureId);
    }
    const head = runs[0]!;
    out.push({
      doc_id,
      doc_type: head.doc_type,
      archetype: head.archetype,
      model: head.model,
      lexicon_version: head.lexicon_version,
      catalog_version: head.catalog_version,
      cells,
      runs_folded: runs.length,
      disagreements: disagreed.length,
      disagreed_features: disagreed,
      errors: runs.flatMap((r) => r.errors),
    });
  }
  return out.sort((a, b) => a.doc_id.localeCompare(b.doc_id));
}

export function summarizeConsensus(consensus: readonly ConsensusRow[], rule: ConsensusRule): ConsensusSummary {
  const cells = consensus.reduce((n, r) => n + r.cells.length, 0);
  const disagreements = consensus.reduce((n, r) => n + r.disagreements, 0);
  return {
    rule,
    documents: consensus.length,
    cells,
    disagreements,
    disagreement_rate: cells ? disagreements / cells : null,
    single_run_documents: consensus.filter((r) => r.runs_folded < 2).length,
  };
}

// ---------- failed batches ----------

export interface ErrorReport {
  /** total error strings across every row — a failed batch is never allowed to vanish */
  errors: number;
  rows_with_errors: number;
  documents_affected: string[];
  messages: { doc_id: string; run: number | null; message: string }[];
  /** cells those failures left unanswered (see `noAnswerCounts`) */
  no_answer_cells: number;
  no_answer_rate: number | null;
}

/**
 * Fold `DocumentLabels.errors` into the report.
 *
 * A batch that threw is not a missing row, it is a row full of holes: `labelDocument` catches the error, notes
 * it, and every feature in that batch comes back `no_answer_from_model`. Those cells look like ordinary
 * `unobserved` cells downstream, so without this the run would report a slightly lower fill rate and nothing
 * else. The count and the affected document ids are surfaced explicitly, and `no_answer_rate` moves with them.
 */
export function foldErrors(rows: readonly EvalRow[]): ErrorReport {
  const messages: ErrorReport["messages"] = [];
  const docs = new Set<string>();
  let rowsWithErrors = 0;
  for (const r of rows) {
    const errs = r.errors ?? [];
    if (!errs.length) continue;
    rowsWithErrors += 1;
    docs.add(r.doc_id);
    for (const message of errs) messages.push({ doc_id: r.doc_id, run: r.run ?? null, message });
  }
  const noAnswer = noAnswerCounts(rows);
  return {
    errors: messages.length,
    rows_with_errors: rowsWithErrors,
    documents_affected: [...docs].sort(),
    messages,
    no_answer_cells: noAnswer.matched,
    no_answer_rate: noAnswer.rate,
  };
}

// ---------- the report ----------

export const EVAL_SCHEMA_ID = "zadum.label-eval.v1";

export interface GoldSummary {
  version: string;
  lexicon_version: string;
  artifacts: number;
  cells: number;
  /** gold cells that were matched by at least one labelled row */
  matched_cells: number;
  /** gold documents that were never labelled in this run — they contribute to nothing */
  unmatched_documents: string[];
}

export interface LabelEvalReport {
  schema: typeof EVAL_SCHEMA_ID;
  generated_at: string;
  rows: number;
  documents: number;
  max_runs: number;
  lexicon_versions: string[];
  catalog_versions: string[];
  models: string[];
  /** null when the rows do not record it — never invented */
  label_prompt_version: string | null;
  digest_hash: string | null;
  /**
   * POOLED over every document type and archetype. Present because a headline is useful, labelled `pooled`
   * because a single figure over mixed populations is not an answer — read `by_source_type`, `by_archetype`
   * and `by_category` beside it.
   */
  pooled: {
    present_precision: Counted;
    absent_precision: Counted;
    present_recall: Counted;
    absent_recall: Counted;
    raw_agreement: Counted;
    informative_agreement: Counted;
    no_answer_rate: Counted;
    evidence_quote_validity: QuoteValidity;
  };
  gold: GoldSummary | null;
  confusion: ConfusionCount[];
  agreement_by_category: AgreementBreakdown[];
  agreement_by_source_type: AgreementBreakdown[];
  agreement_by_archetype: AgreementBreakdown[];
  precision_by_category: PrecisionBreakdown[];
  precision_by_source_type: PrecisionBreakdown[];
  precision_by_archetype: PrecisionBreakdown[];
  consensus: ConsensusSummary | null;
  errors: ErrorReport;
}

export interface BuildReportOptions {
  gold?: LabelGold;
  /** doc_id → artifact text, for the quote check. Omitted ⇒ `evidence_quote_validity.rate` is null. */
  digests?: ReadonlyMap<string, string>;
  consensusRule?: ConsensusRule;
  now?: string;
}

const uniqueSorted = (values: readonly (string | undefined)[]): string[] => [...new Set(values.filter((v): v is string => !!v))].sort();

/** Pure: same rows + same gold in, same report out (the only impurity is `now`, which is injected). */
export function buildLabelEvalReport(rows: readonly DocumentLabels[], opts: BuildReportOptions = {}): LabelEvalReport {
  const gold = opts.gold;
  const idx = gold ? goldIndex(gold) : new Map<string, Map<string, GoldCell>>();
  const byDoc = groupByDoc([...rows]);
  const rule = opts.consensusRule ?? UNANIMOUS;
  const folded = consensusRows(rows, rule);

  let goldSummary: GoldSummary | null = null;
  if (gold) {
    const labelled = new Set(rows.map((r) => r.doc_id));
    const matched = new Set(goldPairs(rows, idx).map((p) => `${p.doc_id} ${p.feature_id}`));
    goldSummary = {
      version: gold.version,
      lexicon_version: gold.lexicon_version,
      artifacts: gold.artifacts.length,
      cells: goldCellCount(gold),
      matched_cells: matched.size,
      unmatched_documents: gold.artifacts.map((a) => a.doc_id).filter((id) => !labelled.has(id)).sort(),
    };
  }

  return {
    schema: EVAL_SCHEMA_ID,
    generated_at: opts.now ?? new Date().toISOString(),
    rows: rows.length,
    documents: byDoc.size,
    max_runs: [...byDoc.values()].reduce((n, rs) => Math.max(n, rs.length), 0),
    lexicon_versions: uniqueSorted(rows.map((r) => r.lexicon_version)),
    catalog_versions: uniqueSorted(rows.map((r) => r.catalog_version)),
    models: uniqueSorted(rows.map((r) => r.model)),
    label_prompt_version: uniqueSorted(rows.map((r) => (r as EvalRow).prompt_version)).join(",") || null,
    digest_hash: uniqueSorted(rows.map((r) => (r as EvalRow).digest_hash)).join(",") || null,
    pooled: {
      present_precision: verdictPrecisionCounts(rows, idx, "present"),
      absent_precision: verdictPrecisionCounts(rows, idx, "absent"),
      present_recall: verdictRecallCounts(rows, idx, "present"),
      absent_recall: verdictRecallCounts(rows, idx, "absent"),
      raw_agreement: rawAgreementCounts(rows),
      informative_agreement: informativeAgreementCounts(rows),
      no_answer_rate: noAnswerCounts(rows),
      evidence_quote_validity: evidenceQuoteValidityCounts(rows, opts.digests),
    },
    gold: goldSummary,
    confusion: confusionCounts(rows, idx),
    agreement_by_category: agreementByCategory(rows),
    agreement_by_source_type: agreementBySourceType(rows),
    agreement_by_archetype: agreementByArchetype(rows),
    precision_by_category: precisionByCategory(rows, idx),
    precision_by_source_type: precisionBySourceType(rows, idx),
    precision_by_archetype: precisionByArchetype(rows, idx),
    consensus: folded.length ? summarizeConsensus(folded, rule) : null,
    errors: foldErrors(rows),
  };
}

// ---------- rendering ----------

const pct = (x: number | null): string => (x === null ? "   n/a" : `${(x * 100).toFixed(1)}%`.padStart(6));
const support = (c: Counted): string => `${pct(c.rate)} (${c.matched}/${c.total})`;

export function renderLabelEvalReport(report: LabelEvalReport): string {
  const out: string[] = [];
  const p = report.pooled;
  out.push(`\n══ label quality ══`);
  out.push(`${report.rows} rows · ${report.documents} documents · up to ${report.max_runs} run(s) each`);
  out.push(`lexicon ${report.lexicon_versions.join(",") || "?"} · catalogs ${report.catalog_versions.join(",") || "?"} · model ${report.models.join(",") || "?"}`);
  out.push(`prompt version ${report.label_prompt_version ?? "not recorded"} · digest hash ${report.digest_hash ?? "not recorded"}`);

  out.push(`\n── against gold (POOLED over all source types and archetypes)`);
  if (!report.gold) out.push(`   no gold set supplied — precision and recall are not computable, and are reported as n/a rather than as 0.`);
  else {
    out.push(`   gold ${report.gold.version} · ${report.gold.artifacts} artifacts · ${report.gold.cells} adjudicated cells · ${report.gold.matched_cells} matched by these rows`);
    if (report.gold.unmatched_documents.length) out.push(`   gold documents not labelled in this run: ${report.gold.unmatched_documents.join(", ")}`);
  }
  out.push(`   present precision  ${support(p.present_precision)}`);
  out.push(`   absent  precision  ${support(p.absent_precision)}   ← the expensive one: a wrong "absent" becomes a prior that deletes a question`);
  out.push(`   present recall     ${support(p.present_recall)}`);
  out.push(`   absent  recall     ${support(p.absent_recall)}`);
  out.push(`   (denominators count ONLY cells a human adjudicated; unadjudicated cells are excluded, never scored as agreement)`);

  if (report.confusion.length) {
    out.push(`\n── where the disagreement lives (gold → predicted)`);
    for (const c of report.confusion) out.push(`   ${c.gold.padEnd(10)} → ${c.predicted.padEnd(10)} ${String(c.n).padStart(5)}${c.gold === c.predicted ? "  (agreed)" : ""}`);
  }

  out.push(`\n── run-to-run agreement (POOLED)`);
  out.push(`   raw          ${support(p.raw_agreement)}`);
  out.push(`   informative  ${support(p.informative_agreement)}   (cells where at least one run was not "unobserved")`);

  const table = (title: string, rowsIn: AgreementBreakdown[]) => {
    if (!rowsIn.length) return;
    out.push(`\n── agreement ${title} (separate populations — NOT pooled)`);
    out.push(`   ${"key".padEnd(26)} ${"docs".padStart(5)} ${"pairs".padStart(6)} ${"inf".padStart(6)} ${"agree".padStart(6)} ${"agree(inf)".padStart(11)}`);
    for (const b of rowsIn) {
      out.push(`   ${b.key.slice(0, 26).padEnd(26)} ${String(b.documents).padStart(5)} ${String(b.pairs).padStart(6)} ${String(b.informative_pairs).padStart(6)} ${pct(b.agreement)} ${pct(b.agreement_informative).padStart(11)}`);
    }
  };
  table("by source type", report.agreement_by_source_type);
  table("by archetype", report.agreement_by_archetype);
  table("by category", report.agreement_by_category);

  const precisionTable = (title: string, rowsIn: PrecisionBreakdown[]) => {
    const shown = rowsIn.filter((b) => b.adjudicated_cells > 0);
    if (!shown.length) return;
    out.push(`\n── precision ${title} (separate populations — NOT pooled)`);
    out.push(`   ${"key".padEnd(26)} ${"cells".padStart(6)}   ${"present".padStart(14)}   ${"absent".padStart(14)}`);
    for (const b of shown) {
      out.push(`   ${b.key.slice(0, 26).padEnd(26)} ${String(b.adjudicated_cells).padStart(6)}   ${support(b.present_precision).padStart(14)}   ${support(b.absent_precision).padStart(14)}`);
    }
  };
  precisionTable("by source type", report.precision_by_source_type);
  precisionTable("by archetype", report.precision_by_archetype);
  precisionTable("by category", report.precision_by_category);

  out.push(`\n── answer completeness and evidence`);
  out.push(`   no-answer rate            ${support(p.no_answer_rate)}   (of ASKED features)`);
  const q = p.evidence_quote_validity;
  out.push(`   evidence quote validity   ${q.rate === null ? "   n/a  (no artifact text supplied — NOT scored as 1.0)" : support(q)}${q.unchecked ? `  · ${q.unchecked} present cells unchecked` : ""}`);

  const c = report.consensus;
  if (c) {
    out.push(`\n── consensus across runs (rule: ${c.rule.kind}${c.rule.kind === "majority" ? ` min ${c.rule.min}` : ""})`);
    out.push(`   ${c.documents} documents · ${c.cells} folded cells · ${c.disagreements} became "unobserved/${RUN_DISAGREEMENT}" (${pct(c.disagreement_rate)})`);
    if (c.single_run_documents) out.push(`   ${c.single_run_documents} document(s) had a single run: nothing folded, so nothing measured about their stability.`);
    out.push(`   conflicting labels are never averaged into a probability; the per-run tally is kept on every folded cell.`);
  }

  out.push(`\n── failed batches`);
  if (!report.errors.errors) out.push(`   none`);
  else {
    out.push(`   ${report.errors.errors} batch error(s) across ${report.errors.rows_with_errors} row(s), ${report.errors.documents_affected.length} document(s): ${report.errors.documents_affected.join(", ")}`);
    for (const m of report.errors.messages.slice(0, 20)) out.push(`     ${m.doc_id}${m.run === null ? "" : ` run ${m.run}`}: ${m.message}`);
    if (report.errors.messages.length > 20) out.push(`     … ${report.errors.messages.length - 20} more`);
    out.push(`   those failures left ${report.errors.no_answer_cells} asked cell(s) unanswered — they are counted in the no-answer rate above, not silently dropped.`);
  }
  return out.join("\n");
}

// ---------- loading rows ----------

const RowCellSchema = z.object({
  feature_id: z.string(),
  category: z.string().default(""),
  verdict: z.enum(VERDICTS),
  raw_verdict: z.union([z.enum(VERDICTS), z.literal("")]).default(""),
  evidence: z.string().default(""),
  loci_checked: z.array(z.string()).default([]),
  downgrade_reason: z.string().nullable().default(null),
});

/** The row format `label.ts` and `detectability.ts` write: one JSON object per line. Loose on purpose — this
 *  file grades whatever a past run produced, so unknown extra fields must not be a parse failure. */
export const LabelRowSchema = z.object({
  doc_id: z.string(),
  doc_type: z.enum(DOC_TYPES),
  archetype: z.string().default(""),
  run: z.number().default(1),
  model: z.string().default(""),
  lexicon_version: z.string().default(""),
  catalog_version: z.string().default(""),
  cells: z.array(RowCellSchema),
  asked: z.number().default(0),
  errors: z.array(z.string()).default([]),
});

export function parseLabelJsonl(text: string): DocumentLabels[] {
  const rows: DocumentLabels[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch (e) {
      throw new UsageError(`line ${i + 1} is not JSON: ${(e as Error).message}`);
    }
    const parsed = LabelRowSchema.safeParse(raw);
    if (!parsed.success) throw new UsageError(`line ${i + 1} is not a label row: ${parsed.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ")}`);
    rows.push(parsed.data as unknown as DocumentLabels);
  }
  if (!rows.length) throw new UsageError("no label rows found (expected one JSON row per line)");
  return rows;
}

/** Optional digest side-file for the quote check: one `{"doc_id":…,"text":…}` per line. */
export function parseDigestJsonl(text: string): Map<string, string> {
  const schema = z.object({ doc_id: z.string(), text: z.string() });
  const map = new Map<string, string>();
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    const parsed = schema.safeParse(JSON.parse(t));
    if (parsed.success) map.set(parsed.data.doc_id, parsed.data.text);
  }
  return map;
}

// ---------- CLI ----------

export interface EvalArgs {
  labels: string;
  gold: string | null;
  digests: string | null;
  out: string;
  rule: ConsensusRule;
}

export const EVAL_USAGE = `label:eval — grade an existing labelling run. Reads rows off disk; calls no model.

  npm run label:eval -- --labels <file.jsonl> [--gold <file>] [--digests <file.jsonl>]
                        [--out <dir>] [--consensus unanimous|majority:N]

  --labels     rows written by \`npm run label\` / \`npm run detectability\` (one JSON row per line)
  --gold       hand-adjudicated cells (default: catalogs/gold/label-gold.json; pass "none" to skip)
  --digests    optional {"doc_id","text"} per line, so "present" quotes can be checked against the artifact
  --consensus  how repeated runs of one document are folded (default: unanimous)`;

const EVAL_FLAGS = { value: ["--labels", "--gold", "--digests", "--out", "--consensus"], boolean: [] } as const;

export function parseConsensusRule(spec: string): ConsensusRule {
  if (spec === "unanimous") return UNANIMOUS;
  const m = /^majority:(\d+)$/.exec(spec);
  if (!m) throw new UsageError(`--consensus must be "unanimous" or "majority:N" (got "${spec}")`);
  const min = Number(m[1]);
  if (min < 1) throw new UsageError("--consensus majority:N needs N >= 1");
  return { kind: "majority", min };
}

export function parseEvalArgs(argv: string[]): EvalArgs {
  const flags = parseFlags(argv, EVAL_FLAGS);
  const labels = flags.value("--labels");
  if (!labels) throw new UsageError("--labels <file.jsonl> is required");
  const gold = flags.value("--gold", DEFAULT_GOLD_FILE);
  return {
    labels,
    gold: gold === "none" ? null : gold,
    digests: flags.value("--digests") ?? null,
    out: flags.value("--out", "mining-results"),
    rule: parseConsensusRule(flags.value("--consensus", "unanimous")),
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  if (helpRequested(argv)) {
    console.log(EVAL_USAGE);
    process.exit(0);
  }
  let args: EvalArgs;
  try {
    args = parseEvalArgs(argv);
  } catch (e) {
    console.error(`${(e as Error).message}\n\n${EVAL_USAGE}`);
    process.exit(2);
  }

  let rows: DocumentLabels[];
  let gold: LabelGold | undefined;
  let digests: Map<string, string> | undefined;
  try {
    rows = parseLabelJsonl(await fs.readFile(args.labels, "utf8"));
    if (args.gold) gold = await loadGold(args.gold);
    if (args.digests) digests = parseDigestJsonl(await fs.readFile(args.digests, "utf8"));
  } catch (e) {
    console.error(`${(e as Error).message}\n\n${EVAL_USAGE}`);
    process.exit(2);
  }

  const report = buildLabelEvalReport(rows, { ...(gold ? { gold } : {}), ...(digests ? { digests } : {}), consensusRule: args.rule });
  console.log(renderLabelEvalReport(report));

  await fs.mkdir(args.out, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(args.out, `${stamp}-label-eval.json`);
  await fs.writeFile(file, JSON.stringify(report, null, 2));
  console.log(`\nwritten ${file}`);
}
