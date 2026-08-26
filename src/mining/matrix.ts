/**
 * Evidence layer, part 5 — the **matrix**: two representations, deliberately kept apart.
 *
 *   A. EVIDENCE ROW  (`zadum.evidence-row.v1`)  — what an artifact visibly CONTAINS.
 *      One row per (document × labelling run). Columns are lexicon features. Cells are the labeller's
 *      verdicts, already passed through `label.ts`'s rules. This layer is close to the bytes: it can be
 *      re-derived from a digest and a model id, and it is the only thing a labelling run is allowed to write.
 *
 *   B. DECISION ROW  (`zadum.decision-row.v1`)  — what product DECISION the artifact appears to represent.
 *      One row per document. Columns are catalog nodes. Cells are `observed` (with an option), `unobserved`,
 *      or `conflict`. This is the layer the design graph is learned from — never raw words, never raw
 *      repository features.
 *
 * The separation is the whole architectural point of the phase. `stripe_checkout` appearing in a manifest is
 * an *observation*; `payments_in_app = collect_online` is a *decision*. Collapsing the two would make the
 * graph learn the extractor's vocabulary (which libraries people import) instead of the population's choices,
 * and would make every later probability un-auditable: you could no longer say which quote produced which
 * belief.
 *
 * ═══ THE RULES THIS FILE ENFORCES IN CODE (not in a prompt) ═══
 *
 *  1. `unobserved` is NOT `absent`. A cell with no observation never counts as a negative — anywhere, ever.
 *     `unobserved` propagates upward: a node whose mapped features were never askable is `unobserved`, and
 *     `observable: false` records that the row was not even *eligible* to say anything about it. Phase 5
 *     reads `observable` to build honest denominators; without it n00 would silently absorb every silence.
 *
 *  2. A licensed negative NEVER selects another option (spec rule 5). `absent` for
 *     `no_login_at_all → user_accounts=none` is evidence against `none`; it is NOT evidence for `multi_user`,
 *     even when `multi_user` is the only other option. Negatives are preserved in `negative_feature_ids` so a
 *     later, explicitly-justified estimator can use them — but the status stays `unobserved`.
 *
 *  3. Conflicts are never silently resolved. Two options of one node with positive evidence produce
 *     `status: "conflict"`, both candidate options with their quotes, and an entry in `row.conflicts`.
 *     No tie-break, no "first wins", no averaging. A conflict is a fact about the corpus and a signal about
 *     the lexicon; hiding it would launder a lexicon bug into a probability.
 *
 *  4. Repeated runs are reconciled by CONSENSUS, never by averaging. Agreeing runs are accepted; disagreeing
 *     runs collapse to `unobserved` with reason `run_disagreement`, unless the configured rule (unanimous /
 *     majority-with-threshold) is satisfied. Averaging two contradictory labels into 0.5 would manufacture a
 *     probability out of a measurement failure.
 *
 *  5. Versions are load-bearing. A row labelled against a different catalog or lexicon version is REJECTED
 *     unless an explicit migration map says the two are compatible. Silently pooling across versions is how a
 *     renamed option becomes a fake trend.
 *
 *  6. Source kind and archetype travel on every row, and statistics are computed per stratum before any
 *     pooled view (spec rules 9/10). Nothing in this file pools.
 *
 * Storage is JSONL — one row per line — so a corpus larger than memory streams.
 *
 * CLI:
 *   npm run mine:matrix -- --labels <file.jsonl> --out <dir>
 *   npm run mine:matrix -- --labels <file.jsonl> --mock
 *   npm run mine:matrix -- --sessions <data-dir> --out <dir>
 */
import { z } from "zod";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { helpRequested, parseFlags, UsageError } from "../cli/flags.js";
import type { Catalog } from "../core/catalog.js";
import { catalogNodeIndex, type Lexicon, type LexiconEntry } from "./lexicon.js";
import { VERDICTS, type Cell, type DocumentLabels, type DowngradeReason, type Verdict } from "./label.js";

// ---------------------------------------------------------------------------
// Source kinds
// ---------------------------------------------------------------------------

/**
 * Repo / spec doc / session rows stay distinguishable forever (spec: "Keep repo/spec/session rows
 * distinguishable. Produce separate statistics by source type before any optional combined view.").
 * `session` rows are the strongest evidence we have — a real owner answered a real card — and also the
 * scarcest, which is exactly why they must never be pooled into a repo-dominated aggregate by accident.
 */
export const SOURCE_KINDS = ["repo", "spec_doc", "session"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

// ---------------------------------------------------------------------------
// A. Evidence rows
// ---------------------------------------------------------------------------

export const EVIDENCE_ROW_SCHEMA = "zadum.evidence-row.v1";

export const EvidenceSourceSchema = z.object({
  kind: z.enum(SOURCE_KINDS),
  /** stable identity of the artifact WITHOUT the pin: "owner/name", or a manifest doc id */
  id: z.string().min(1),
  url: z.string().nullable().default(null),
  commit: z.string().nullable().default(null),
  license: z.string().nullable().default(null),
});
export type EvidenceSource = z.infer<typeof EvidenceSourceSchema>;

export const FeatureCellSchema = z.object({
  verdict: z.enum(VERDICTS),
  /** verbatim quotes (present) or inspected paths/headings; empty for unobserved */
  evidence: z.array(z.string()).default([]),
  loci_checked: z.array(z.string()).default([]),
  /** why the raw model answer was downgraded, when it was — preserved, never discarded (spec rule 7) */
  downgrade_reason: z.string().nullable().default(null),
});
export type FeatureCell = z.infer<typeof FeatureCellSchema>;

export const EvidenceRowSchema = z.object({
  schema: z.literal(EVIDENCE_ROW_SCHEMA),
  /** "repo:owner/name@commit" | "spec_doc:<id>" | "session:<project id>" */
  row_id: z.string().min(1),
  source: EvidenceSourceSchema,
  archetype: z.string().min(1),
  catalog_version: z.string(),
  lexicon_version: z.string(),
  model: z.string(),
  /** sha256 of the exact digest the labeller saw — proves which bytes produced these cells */
  digest_hash: z.string(),
  /** labelling run number; >1 rows with the same row_id are repeats, reconciled by `mergeRuns` */
  run: z.number().int().min(1).default(1),
  label_prompt_version: z.string().default(""),
  /** failed batches surface here; they must never silently disappear */
  errors: z.array(z.string()).default([]),
  feature_cells: z.record(z.string(), FeatureCellSchema),
});
export type EvidenceRow = z.infer<typeof EvidenceRowSchema>;

/** `DocumentLabels` (what a labelling run produces) → an evidence row (what the matrix stores). */
export function evidenceRowFromLabels(
  labels: DocumentLabels,
  meta: {
    row_id?: string;
    source?: Partial<EvidenceSource>;
    digest_hash?: string;
    label_prompt_version?: string;
  } = {},
): EvidenceRow {
  const kind: SourceKind = labels.doc_type === "repo" ? "repo" : "spec_doc";
  const source: EvidenceSource = {
    kind,
    id: meta.source?.id ?? labels.doc_id,
    url: meta.source?.url ?? null,
    commit: meta.source?.commit ?? null,
    license: meta.source?.license ?? null,
  };
  const feature_cells: Record<string, FeatureCell> = {};
  for (const c of labels.cells) {
    feature_cells[c.feature_id] = {
      verdict: c.verdict,
      evidence: c.evidence ? [c.evidence] : [],
      loci_checked: [...c.loci_checked],
      downgrade_reason: c.downgrade_reason,
    };
  }
  return {
    schema: EVIDENCE_ROW_SCHEMA,
    row_id: meta.row_id ?? `${kind}:${source.id}${source.commit ? `@${source.commit}` : ""}`,
    source,
    archetype: labels.archetype,
    catalog_version: labels.catalog_version,
    lexicon_version: labels.lexicon_version,
    model: labels.model,
    digest_hash: meta.digest_hash ?? "",
    run: labels.run,
    label_prompt_version: meta.label_prompt_version ?? "",
    errors: [...labels.errors],
    feature_cells,
  };
}

// ---------------------------------------------------------------------------
// Consensus across repeated labelling runs
// ---------------------------------------------------------------------------

export type ConsensusRule = { kind: "unanimous" } | { kind: "majority"; min: number };

export const DEFAULT_CONSENSUS: ConsensusRule = { kind: "unanimous" };

export interface ConsensusOutcome {
  verdict: Verdict;
  /** the per-run tally, always preserved — a disagreement is data, not noise */
  tally: Record<string, number>;
  agreed: boolean;
  reason: "agreed" | "run_disagreement" | "majority" | "single_run";
}

/**
 * Reconcile the same cell across N labelling runs.
 *
 * Agreement → the agreed verdict. Disagreement → `unobserved` with reason `run_disagreement`, unless a
 * `majority` rule is configured AND the leading verdict clears `min` (as a share of runs). Nothing here
 * averages: two runs saying `present` and `absent` do not make a half-present cell, they make a cell we do
 * not know the value of. That is rule 4 of this file, and rule "never average conflicting labels into a false
 * probability" of the spec.
 */
export function consensusVerdict(verdicts: Verdict[], rule: ConsensusRule = DEFAULT_CONSENSUS): ConsensusOutcome {
  const tally: Record<string, number> = {};
  for (const v of verdicts) tally[v] = (tally[v] ?? 0) + 1;
  if (verdicts.length === 0) return { verdict: "unobserved", tally, agreed: false, reason: "run_disagreement" };
  if (verdicts.length === 1) return { verdict: verdicts[0]!, tally, agreed: true, reason: "single_run" };
  const distinct = Object.keys(tally);
  if (distinct.length === 1) return { verdict: verdicts[0]!, tally, agreed: true, reason: "agreed" };
  if (rule.kind === "majority") {
    const ranked = Object.entries(tally).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const [top, n] = ranked[0]!;
    const share = n / verdicts.length;
    // a strict majority AND clearing the configured threshold; a tie can never be a majority
    if (share >= rule.min && (ranked[1]?.[1] ?? 0) < n) return { verdict: top as Verdict, tally, agreed: false, reason: "majority" };
  }
  return { verdict: "unobserved", tally, agreed: false, reason: "run_disagreement" };
}

export interface MergedRow {
  row: EvidenceRow;
  runs: number;
  /** feature ids whose runs disagreed and were therefore downgraded */
  disagreements: string[];
  /** feature ids resolved by a majority rule rather than unanimity */
  majority_resolved: string[];
}

/**
 * Collapse repeated runs of the SAME artifact into one evidence row. Rows with different `row_id`s are
 * different artifacts and are returned untouched (one merged row each).
 */
export function mergeRuns(rows: EvidenceRow[], rule: ConsensusRule = DEFAULT_CONSENSUS): MergedRow[] {
  const byRow = new Map<string, EvidenceRow[]>();
  for (const r of rows) (byRow.get(r.row_id) ?? byRow.set(r.row_id, []).get(r.row_id)!).push(r);
  const out: MergedRow[] = [];
  for (const rowId of [...byRow.keys()].sort()) {
    const group = byRow.get(rowId)!.slice().sort((a, b) => a.run - b.run);
    const first = group[0]!;
    const featureIds = [...new Set(group.flatMap((r) => Object.keys(r.feature_cells)))].sort();
    const feature_cells: Record<string, FeatureCell> = {};
    const disagreements: string[] = [];
    const majority_resolved: string[] = [];
    for (const fid of featureIds) {
      const cells = group.map((r) => r.feature_cells[fid]).filter((c): c is FeatureCell => !!c);
      const outcome = consensusVerdict(cells.map((c) => c.verdict), rule);
      if (outcome.reason === "run_disagreement" && group.length > 1) disagreements.push(fid);
      if (outcome.reason === "majority") majority_resolved.push(fid);
      // keep the evidence of the runs that actually SUPPORT the surviving verdict
      const supporting = cells.filter((c) => c.verdict === outcome.verdict);
      feature_cells[fid] = {
        verdict: outcome.verdict,
        evidence: [...new Set(supporting.flatMap((c) => c.evidence))],
        loci_checked: [...new Set(supporting.flatMap((c) => c.loci_checked))].sort(),
        downgrade_reason:
          outcome.reason === "run_disagreement" && group.length > 1 ? "run_disagreement" : (supporting[0]?.downgrade_reason ?? null),
      };
    }
    out.push({
      row: { ...first, run: 1, errors: [...new Set(group.flatMap((r) => r.errors))], feature_cells },
      runs: group.length,
      disagreements,
      majority_resolved,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Version compatibility
// ---------------------------------------------------------------------------

/**
 * Explicit statement that two versions may be pooled. There is no automatic compatibility rule — semver-ish
 * string comparison would be a guess about whether an option was renamed, and a wrong guess silently produces
 * a trend that never happened.
 */
export interface MigrationMap {
  /** row version → accepted-as version */
  catalog?: Record<string, string>;
  lexicon?: Record<string, string>;
}

export interface VersionIssue {
  row_id: string;
  field: "catalog_version" | "lexicon_version";
  got: string;
  expected: string;
}

/**
 * An UNVERSIONED row (empty string) is rejected too, whenever we know what version we expect.
 *
 * This is the case worth spelling out, because it is the one that hides. `labelDocument` writes
 * `catalog_version: opts.versions?.catalog ?? ""`, so a labelling run started without version metadata
 * produces rows that say nothing about which catalog they were labelled against. Treating "" as "matches
 * anything" would pool exactly the rows whose provenance we cannot check — the silent cross-version pooling
 * this whole section exists to prevent, arriving through the one door left open. If the expected version is
 * itself empty (nothing to compare against, e.g. a self-consistent legacy batch) the check is vacuous and
 * passes; that is a deliberate, narrow exemption.
 */
const UNVERSIONED = "(unversioned)";

export function checkVersion(
  row: { row_id: string; catalog_version: string; lexicon_version: string },
  expected: { catalog: string; lexicon: string },
  migrations: MigrationMap = {},
): VersionIssue | null {
  const catalog = migrations.catalog?.[row.catalog_version] ?? row.catalog_version;
  if (expected.catalog && catalog !== expected.catalog)
    return { row_id: row.row_id, field: "catalog_version", got: row.catalog_version || UNVERSIONED, expected: expected.catalog };
  const lexicon = migrations.lexicon?.[row.lexicon_version] ?? row.lexicon_version;
  if (expected.lexicon && lexicon !== expected.lexicon)
    return { row_id: row.row_id, field: "lexicon_version", got: row.lexicon_version || UNVERSIONED, expected: expected.lexicon };
  return null;
}

/** Split rows into the ones that may be pooled and the ones that must not be. Rejected rows are RETURNED,
 *  never dropped on the floor — an operator has to see that half a corpus was excluded. */
export function partitionByVersion(
  rows: EvidenceRow[],
  expected: { catalog: string; lexicon: string },
  migrations: MigrationMap = {},
): { accepted: EvidenceRow[]; rejected: { row: EvidenceRow; issue: VersionIssue }[] } {
  const accepted: EvidenceRow[] = [];
  const rejected: { row: EvidenceRow; issue: VersionIssue }[] = [];
  for (const r of rows) {
    const issue = checkVersion(r, expected, migrations);
    if (issue) rejected.push({ row: r, issue });
    else accepted.push(r);
  }
  return { accepted, rejected };
}

// ---------------------------------------------------------------------------
// B. Decision rows
// ---------------------------------------------------------------------------

export const DECISION_ROW_SCHEMA = "zadum.decision-row.v1";

export const DECISION_STATUSES = ["observed", "unobserved", "conflict"] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];

/**
 * Why a cell is `unobserved`. Deliberately richer than a boolean, because Phase 5 needs to distinguish
 * "we could not have seen it" (not eligible) from "we looked and the artifact was silent" (eligible, silent)
 * from "the runs contradicted each other" (a measurement failure, not a property of the artifact).
 */
export type UnobservedReason =
  | "no_mapped_feature"
  | "not_askable_in_source"
  | "silent"
  | "negative_only"
  | "run_disagreement";

export const DecisionCandidateSchema = z.object({
  option: z.string(),
  feature_ids: z.array(z.string()),
  quotes: z.array(z.string()),
});
export type DecisionCandidate = z.infer<typeof DecisionCandidateSchema>;

export const DecisionCellSchema = z.object({
  status: z.enum(DECISION_STATUSES),
  /** present only when status === "observed" */
  option: z.string().optional(),
  /**
   * Was this row ELIGIBLE to say anything about this node — i.e. was at least one mapped feature actually
   * put to the labeller? Phase 5's denominators are built from this flag and from nothing else. A row that
   * could not have observed a node contributes to NO count for that node, positive or negative.
   */
  observable: z.boolean(),
  evidence_feature_ids: z.array(z.string()).default([]),
  evidence_quotes: z.array(z.string()).default([]),
  /** licensed negatives. Recorded, and deliberately NOT used to select an option (spec rule 5). */
  negative_feature_ids: z.array(z.string()).default([]),
  /** every option with positive evidence — length > 1 exactly when status === "conflict" */
  candidates: z.array(DecisionCandidateSchema).default([]),
  unobserved_reason: z.string().nullable().default(null),
  /** preserved downgrade reasons from the evidence layer, counted (spec rule 7) */
  downgrade_reasons: z.record(z.string(), z.number()).default({}),
});
export type DecisionCell = z.infer<typeof DecisionCellSchema>;

export const DecisionRowSchema = z.object({
  schema: z.literal(DECISION_ROW_SCHEMA),
  row_id: z.string().min(1),
  source_kind: z.enum(SOURCE_KINDS),
  source_id: z.string().default(""),
  archetype: z.string().min(1),
  catalog_version: z.string(),
  lexicon_version: z.string().default(""),
  /**
   * Which labeller(s) produced the evidence underneath this row, and under which prompt version. Carried on
   * the DECISION row (not just the evidence row) because the design graph is built from decision rows alone:
   * without this the graph could not state whose judgement its probabilities rest on, and provenance that
   * stops one layer short of the artifact is not provenance. Empty for session rows — a person answered.
   *
   * `optional()` rather than `default([])` so that a decision row written before this field existed still
   * parses, and so hand-built fixtures stay valid: absent and `[]` mean the same thing ("no model is named"),
   * and every reader must therefore say `r.label_models ?? []`.
   */
  label_models: z.array(z.string()).optional(),
  label_prompt_versions: z.array(z.string()).optional(),
  cells: z.record(z.string(), DecisionCellSchema),
  /** node ids whose evidence pointed at two different options — never silently resolved */
  conflicts: z.array(z.object({ node_id: z.string(), options: z.array(z.string()) })).default([]),
  /** nodes excluded because they do not apply to this row's archetype */
  not_applicable: z.array(z.string()).default([]),
});
export type DecisionRow = z.infer<typeof DecisionRowSchema>;

// ---------------------------------------------------------------------------
// Aggregation: evidence row → decision row
// ---------------------------------------------------------------------------

/** node id → the lexicon features that map to it, with the option each one is evidence for. */
export function featuresByNode(lex: Lexicon): Map<string, LexiconEntry[]> {
  const out = new Map<string, LexiconEntry[]>();
  for (const f of lex.features) {
    if (!f.maps_to) continue; // catalog-gap candidate: a real decision the catalog has no home for
    (out.get(f.maps_to.node) ?? out.set(f.maps_to.node, []).get(f.maps_to.node)!).push(f);
  }
  return out;
}

/** A node applies to a row when the catalog says it applies to every archetype, or to this one. */
export function nodeAppliesTo(applies_to: string[], archetype: string): boolean {
  return applies_to.length === 0 || applies_to.includes(archetype);
}

/** Downgrade reasons that mean "the labeller was never in a position to answer" — i.e. NOT eligible. */
const NOT_ASKABLE: ReadonlySet<string> = new Set<DowngradeReason>(["undetectable_in_doc_type", "feature_not_asked"]);

export interface AggregateOptions {
  /** node id → applies_to, from the loaded catalogs */
  appliesTo?: Map<string, string[]>;
  /** node id → its valid option ids; an option outside this set is a lexicon bug and is reported */
  nodeIndex?: Map<string, Set<string>>;
}

export interface AggregateResult {
  row: DecisionRow;
  /** lexicon/catalog inconsistencies found while aggregating — surfaced, never swallowed */
  issues: string[];
}

/**
 * One evidence row → one decision row.
 *
 * The five aggregation rules, in the order the spec states them:
 *   1. group feature cells by catalog node;
 *   2. exactly one option with valid positive evidence  → `observed`;
 *   3. two or more options with positive evidence       → `conflict`;
 *   4. no option with reliable evidence                 → `unobserved`;
 *   5. a licensed negative NEVER selects another option.
 * Plus: preserve every supporting feature id, quote and downgrade reason (6, 7), and never silently resolve
 * a conflict (8).
 */
export function aggregateRow(evidence: EvidenceRow, lex: Lexicon, opts: AggregateOptions = {}): AggregateResult {
  const byNode = featuresByNode(lex);
  const issues: string[] = [];
  const cells: Record<string, DecisionCell> = {};
  const conflicts: DecisionRow["conflicts"] = [];
  const not_applicable: string[] = [];

  for (const nodeId of [...byNode.keys()].sort()) {
    const applies = opts.appliesTo?.get(nodeId);
    if (applies && !nodeAppliesTo(applies, evidence.archetype)) {
      not_applicable.push(nodeId);
      continue;
    }
    const features = byNode.get(nodeId)!;
    const positives = new Map<string, { feature_ids: string[]; quotes: string[] }>();
    const negatives: string[] = [];
    const downgrade_reasons: Record<string, number> = {};
    let observable = false;
    let sawDisagreement = false;

    for (const f of features) {
      const cell = evidence.feature_cells[f.id];
      const option = f.maps_to!.option;
      const valid = opts.nodeIndex?.get(nodeId);
      if (valid && !valid.has(option)) {
        issues.push(`feature ${f.id} maps to unknown option ${nodeId}.${option}`);
        continue;
      }
      if (!cell) {
        // a row missing a column entirely — the labeller's row had a hole. Not eligible, and worth saying.
        downgrade_reasons.missing_cell = (downgrade_reasons.missing_cell ?? 0) + 1;
        continue;
      }
      if (cell.downgrade_reason) downgrade_reasons[cell.downgrade_reason] = (downgrade_reasons[cell.downgrade_reason] ?? 0) + 1;
      if (cell.downgrade_reason === "run_disagreement") sawDisagreement = true;
      // ELIGIBILITY: the feature was really put to the labeller for this artifact.
      if (!cell.downgrade_reason || !NOT_ASKABLE.has(cell.downgrade_reason)) observable = true;

      if (cell.verdict === "present") {
        const bucket = positives.get(option) ?? { feature_ids: [], quotes: [] };
        bucket.feature_ids.push(f.id);
        for (const q of cell.evidence) if (q) bucket.quotes.push(q);
        positives.set(option, bucket);
      } else if (cell.verdict === "absent") {
        // Rule 5: recorded as evidence AGAINST this option, and used for nothing else.
        negatives.push(f.id);
      }
    }

    const base = {
      observable,
      negative_feature_ids: negatives.sort(),
      downgrade_reasons,
    };

    if (positives.size === 1) {
      const [option, bucket] = [...positives.entries()][0]!;
      cells[nodeId] = {
        ...base,
        status: "observed",
        option,
        evidence_feature_ids: bucket.feature_ids.sort(),
        evidence_quotes: [...new Set(bucket.quotes)],
        candidates: [{ option, feature_ids: bucket.feature_ids.sort(), quotes: [...new Set(bucket.quotes)] }],
        unobserved_reason: null,
      };
      continue;
    }

    if (positives.size > 1) {
      const candidates = [...positives.entries()]
        .map(([option, b]) => ({ option, feature_ids: b.feature_ids.sort(), quotes: [...new Set(b.quotes)] }))
        .sort((a, b) => a.option.localeCompare(b.option));
      cells[nodeId] = {
        ...base,
        status: "conflict",
        evidence_feature_ids: candidates.flatMap((c) => c.feature_ids).sort(),
        evidence_quotes: [...new Set(candidates.flatMap((c) => c.quotes))],
        candidates,
        unobserved_reason: null,
      };
      conflicts.push({ node_id: nodeId, options: candidates.map((c) => c.option) });
      continue;
    }

    // No positive evidence. Which flavour of "we do not know" is this?
    const reason: UnobservedReason = sawDisagreement
      ? "run_disagreement"
      : !observable
        ? "not_askable_in_source"
        : negatives.length
          ? "negative_only"
          : "silent";
    cells[nodeId] = { ...base, status: "unobserved", evidence_feature_ids: [], evidence_quotes: [], candidates: [], unobserved_reason: reason };
  }

  return {
    row: {
      schema: DECISION_ROW_SCHEMA,
      row_id: evidence.row_id,
      source_kind: evidence.source.kind,
      source_id: evidence.source.id,
      archetype: evidence.archetype,
      catalog_version: evidence.catalog_version,
      lexicon_version: evidence.lexicon_version,
      label_models: evidence.model ? [evidence.model] : [],
      label_prompt_versions: evidence.label_prompt_version ? [evidence.label_prompt_version] : [],
      cells,
      conflicts,
      not_applicable: not_applicable.sort(),
    },
    issues,
  };
}

/** Catalog nodes no lexicon feature maps to — the matrix is blind to these, and that must be visible. */
export function uncoveredNodes(lex: Lexicon, nodeIndex: Map<string, Set<string>>): string[] {
  const covered = new Set([...featuresByNode(lex).keys()]);
  return [...nodeIndex.keys()].filter((n) => !covered.has(n)).sort();
}

// ---------------------------------------------------------------------------
// Session rows — the strongest evidence, and the scarcest
// ---------------------------------------------------------------------------

/**
 * A completed user session is a decision row too, and a much better one: nobody inferred anything, the owner
 * said it. What counts (and what does not) is already settled by `learning/population_priors.ts`, which reads
 * the same event log for the same reason, so this adapter reuses it rather than re-deriving the rules:
 *
 *   counted   — `card_answered` (kind=option, not undone), `default_overridden` → the corrected value,
 *               `spec_refined` corrections.
 *   NOT counted — untouched defaults. They are the engine's own guess; counting them would let the priors
 *               confirm themselves, and would let the design graph learn its own output. This is the single
 *               most important line in this section.
 */
export interface SessionObservation {
  project_id: string;
  archetypes: string[];
  node: string;
  option: string;
  source: string;
}

export function decisionRowFromSession(
  obs: SessionObservation[],
  meta: { project_id: string; archetype: string; catalog_version: string; lexicon_version?: string },
): DecisionRow {
  const cells: Record<string, DecisionCell> = {};
  const conflicts: DecisionRow["conflicts"] = [];
  const byNode = new Map<string, Set<string>>();
  const sources = new Map<string, string[]>();
  for (const o of obs) {
    (byNode.get(o.node) ?? byNode.set(o.node, new Set()).get(o.node)!).add(o.option);
    (sources.get(o.node) ?? sources.set(o.node, []).get(o.node)!).push(o.source);
  }
  for (const nodeId of [...byNode.keys()].sort()) {
    const options = [...byNode.get(nodeId)!].sort();
    const why = [...new Set(sources.get(nodeId) ?? [])].sort();
    if (options.length === 1) {
      cells[nodeId] = {
        status: "observed",
        option: options[0]!,
        observable: true,
        evidence_feature_ids: why.map((s) => `session:${s}`),
        evidence_quotes: [],
        negative_feature_ids: [],
        candidates: [{ option: options[0]!, feature_ids: why.map((s) => `session:${s}`), quotes: [] }],
        unobserved_reason: null,
        downgrade_reasons: {},
      };
      continue;
    }
    // The owner answered the same node two different ways across the session (an answer then a correction).
    // That is a conflict at THIS layer by construction — the same rule as the evidence layer, and for the
    // same reason: resolving it here would hide a real signal about which surface catches wrong answers.
    cells[nodeId] = {
      status: "conflict",
      observable: true,
      evidence_feature_ids: why.map((s) => `session:${s}`),
      evidence_quotes: [],
      negative_feature_ids: [],
      candidates: options.map((o) => ({ option: o, feature_ids: why.map((s) => `session:${s}`), quotes: [] })),
      unobserved_reason: null,
      downgrade_reasons: {},
    };
    conflicts.push({ node_id: nodeId, options });
  }
  return {
    schema: DECISION_ROW_SCHEMA,
    row_id: `session:${meta.project_id}`,
    source_kind: "session",
    source_id: meta.project_id,
    archetype: meta.archetype,
    catalog_version: meta.catalog_version,
    lexicon_version: meta.lexicon_version ?? "",
    label_models: [], // a person answered; no model stands behind a session row
    label_prompt_versions: [],
    cells,
    conflicts,
    not_applicable: [],
  };
}

// ---------------------------------------------------------------------------
// The matrix, its report, and its flattened view
// ---------------------------------------------------------------------------

export const MATRIX_SCHEMA = "zadum.decision-matrix.v1";

export interface DecisionMatrix {
  schema: typeof MATRIX_SCHEMA;
  version: string;
  catalog_version: string;
  lexicon_version: string;
  created_at: string;
  rows: DecisionRow[];
}

export interface MatrixValidation {
  rows_in: number;
  rows_out: number;
  rejected_versions: VersionIssue[];
  merged_runs: { row_id: string; runs: number; disagreements: number; majority_resolved: number }[];
  issues: string[];
  uncovered_nodes: string[];
  errors_by_row: { row_id: string; errors: string[] }[];
}

export interface BuildMatrixOptions extends AggregateOptions {
  expected?: { catalog: string; lexicon: string };
  migrations?: MigrationMap;
  consensus?: ConsensusRule;
  version?: string;
  now?: () => string;
  uncovered?: string[];
}

/** Evidence rows (possibly several runs each) → a versioned decision matrix + a validation report. */
export function buildMatrix(rows: EvidenceRow[], lex: Lexicon, opts: BuildMatrixOptions = {}): { matrix: DecisionMatrix; validation: MatrixValidation } {
  const now = opts.now ?? (() => new Date().toISOString());
  const expected = opts.expected ?? { catalog: rows[0]?.catalog_version ?? "", lexicon: lex.version };
  const { accepted, rejected } = partitionByVersion(rows, expected, opts.migrations ?? {});
  const merged = mergeRuns(accepted, opts.consensus ?? DEFAULT_CONSENSUS);
  const issues: string[] = [];
  const decisionRows: DecisionRow[] = [];
  for (const m of merged) {
    const { row, issues: rowIssues } = aggregateRow(m.row, lex, opts);
    decisionRows.push(row);
    issues.push(...rowIssues);
  }
  return {
    matrix: {
      schema: MATRIX_SCHEMA,
      version: opts.version ?? now().slice(0, 10).replace(/-/g, "."),
      catalog_version: expected.catalog,
      lexicon_version: expected.lexicon,
      created_at: now(),
      rows: decisionRows,
    },
    validation: {
      rows_in: rows.length,
      rows_out: decisionRows.length,
      rejected_versions: rejected.map((r) => r.issue),
      merged_runs: merged.map((m) => ({ row_id: m.row.row_id, runs: m.runs, disagreements: m.disagreements.length, majority_resolved: m.majority_resolved.length })),
      issues: [...new Set(issues)].sort(),
      uncovered_nodes: opts.uncovered ?? [],
      errors_by_row: merged.filter((m) => m.row.errors.length).map((m) => ({ row_id: m.row.row_id, errors: m.row.errors })),
    },
  };
}

export interface MatrixStats {
  rows: number;
  by_source_kind: Record<string, number>;
  by_archetype: Record<string, number>;
  cells_total: number;
  observed: number;
  unobserved: number;
  conflict: number;
  observable: number;
  /** observed / observable — the honest fill rate, denominator = rows that COULD have observed the node */
  fill_rate: number | null;
  unobserved_reasons: Record<string, number>;
}

export function matrixStats(matrix: DecisionMatrix): MatrixStats {
  const by_source_kind: Record<string, number> = {};
  const by_archetype: Record<string, number> = {};
  const unobserved_reasons: Record<string, number> = {};
  let cells = 0;
  let observed = 0;
  let unobserved = 0;
  let conflict = 0;
  let observable = 0;
  for (const r of matrix.rows) {
    by_source_kind[r.source_kind] = (by_source_kind[r.source_kind] ?? 0) + 1;
    by_archetype[r.archetype] = (by_archetype[r.archetype] ?? 0) + 1;
    for (const c of Object.values(r.cells)) {
      cells += 1;
      if (c.observable) observable += 1;
      if (c.status === "observed") observed += 1;
      else if (c.status === "conflict") conflict += 1;
      else {
        unobserved += 1;
        const k = c.unobserved_reason ?? "unknown";
        unobserved_reasons[k] = (unobserved_reasons[k] ?? 0) + 1;
      }
    }
  }
  return {
    rows: matrix.rows.length,
    by_source_kind,
    by_archetype,
    cells_total: cells,
    observed,
    unobserved,
    conflict,
    observable,
    fill_rate: observable ? observed / observable : null,
    unobserved_reasons,
  };
}

/**
 * Flattened long-form view: one line per (row, node) cell. Long rather than wide on purpose — a wide table
 * over 135 nodes is unreadable and, worse, forces a value into every cell, which is exactly the `unobserved`
 * -becomes-a-negative mistake this whole file exists to prevent.
 */
export function flattenMatrix(matrix: DecisionMatrix): Record<string, string | number | boolean>[] {
  const out: Record<string, string | number | boolean>[] = [];
  for (const r of matrix.rows) {
    for (const [nodeId, c] of Object.entries(r.cells).sort(([a], [b]) => a.localeCompare(b))) {
      out.push({
        row_id: r.row_id,
        source_kind: r.source_kind,
        archetype: r.archetype,
        node_id: nodeId,
        status: c.status,
        option: c.option ?? "",
        observable: c.observable,
        evidence_features: c.evidence_feature_ids.join(" "),
        negative_features: c.negative_feature_ids.join(" "),
        candidates: c.candidates.map((x) => x.option).join(" "),
        unobserved_reason: c.unobserved_reason ?? "",
      });
    }
  }
  return out;
}

export function toCsv(rows: Record<string, string | number | boolean>[]): string {
  if (!rows.length) return "";
  const header = Object.keys(rows[0]!);
  const esc = (v: string | number | boolean) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [header.join(","), ...rows.map((r) => header.map((h) => esc(r[h] ?? "")).join(","))].join("\n");
}

export function renderMatrixReport(matrix: DecisionMatrix, validation: MatrixValidation): string {
  const s = matrixStats(matrix);
  const lines: string[] = [];
  const pct = (x: number | null) => (x === null ? "n/a" : `${(x * 100).toFixed(1)}%`);
  lines.push(`# decision matrix ${matrix.version}`);
  lines.push("");
  lines.push(`catalog ${matrix.catalog_version} · lexicon ${matrix.lexicon_version} · built ${matrix.created_at}`);
  lines.push("");
  lines.push(`rows: ${s.rows} in (${validation.rows_in} evidence rows, ${validation.rejected_versions.length} rejected on version)`);
  lines.push(`by source kind: ${Object.entries(s.by_source_kind).map(([k, v]) => `${k}=${v}`).join(" · ") || "none"}`);
  lines.push(`by archetype:   ${Object.entries(s.by_archetype).map(([k, v]) => `${k}=${v}`).join(" · ") || "none"}`);
  lines.push("");
  lines.push(`cells: ${s.cells_total} · observable ${s.observable} · observed ${s.observed} · conflict ${s.conflict} · unobserved ${s.unobserved}`);
  lines.push(`fill rate (observed / observable): ${pct(s.fill_rate)}`);
  lines.push("");
  lines.push("why unobserved:");
  for (const [k, v] of Object.entries(s.unobserved_reasons).sort((a, b) => b[1] - a[1])) lines.push(`  ${k.padEnd(24)} ${v}`);
  const conflicted = matrix.rows.flatMap((r) => r.conflicts.map((c) => `${r.row_id}  ${c.node_id}: ${c.options.join(" vs ")}`));
  lines.push("");
  lines.push(`conflicts (never auto-resolved): ${conflicted.length}`);
  for (const c of conflicted.slice(0, 20)) lines.push(`  ${c}`);
  if (conflicted.length > 20) lines.push(`  … ${conflicted.length - 20} more`);
  if (validation.uncovered_nodes.length) {
    lines.push("");
    lines.push(`catalog nodes with NO lexicon feature (the matrix is blind to these): ${validation.uncovered_nodes.length}`);
    lines.push(`  ${validation.uncovered_nodes.join(", ")}`);
  }
  if (validation.errors_by_row.length) {
    lines.push("");
    lines.push(`rows with labelling errors (failed batches, NOT silently dropped): ${validation.errors_by_row.length}`);
    for (const e of validation.errors_by_row.slice(0, 10)) lines.push(`  ${e.row_id}: ${e.errors.join("; ")}`);
  }
  if (validation.issues.length) {
    lines.push("");
    lines.push("lexicon/catalog issues:");
    for (const i of validation.issues) lines.push(`  - ${i}`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// JSONL IO
// ---------------------------------------------------------------------------

export function parseJsonl<T>(text: string, parse: (v: unknown) => T): { rows: T[]; errors: string[] } {
  const rows: T[] = [];
  const errors: string[] = [];
  const trimmed = text.trim();
  if (!trimmed) return { rows, errors };
  // tolerate a JSON array as well: `detectability.ts` writes one, `label.ts` writes JSONL
  if (trimmed.startsWith("[")) {
    try {
      for (const [i, v] of (JSON.parse(trimmed) as unknown[]).entries()) {
        try {
          rows.push(parse(v));
        } catch (e) {
          errors.push(`item ${i}: ${(e as Error).message}`);
        }
      }
    } catch (e) {
      errors.push(`array parse: ${(e as Error).message}`);
    }
    return { rows, errors };
  }
  for (const [i, line] of trimmed.split("\n").entries()) {
    if (!line.trim()) continue;
    try {
      rows.push(parse(JSON.parse(line)));
    } catch (e) {
      errors.push(`line ${i + 1}: ${(e as Error).message}`);
    }
  }
  return { rows, errors };
}

export const toJsonl = (rows: unknown[]): string => `${rows.map((r) => JSON.stringify(r)).join("\n")}\n`;

/** `DocumentLabels` JSONL (what `npm run label` writes) → evidence rows. */
export function evidenceRowsFromLabelFile(text: string): { rows: EvidenceRow[]; errors: string[] } {
  const { rows, errors } = parseJsonl<DocumentLabels>(text, (v) => v as DocumentLabels);
  return { rows: rows.map((r) => evidenceRowFromLabels(r)), errors };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const here = path.dirname(fileURLToPath(import.meta.url));

export const MATRIX_USAGE = `mine:matrix — evidence rows → normalized decision matrix

  npm run mine:matrix -- --labels <file.jsonl> [--out <dir>] [--consensus unanimous|majority] [--min-agree 0.6]
  npm run mine:matrix -- --labels <file.jsonl> --mock
  npm run mine:matrix -- --sessions <data-dir> [--out <dir>]

  --labels     JSONL written by \`npm run label\` (one DocumentLabels row per line)
  --sessions   a FileStore data directory; completed sessions become decision rows directly
  --mock       use the bundled mock label fixture instead of a file (no credentials, no cost)
  --out        output directory (default mining-results)`;

const MATRIX_FLAGS = {
  value: ["--labels", "--sessions", "--out", "--consensus", "--min-agree", "--version"],
  boolean: ["--mock"],
} as const;

interface MatrixArgs {
  labels?: string;
  sessions?: string;
  out: string;
  consensus: ConsensusRule;
  mock: boolean;
  version?: string;
}

export function parseMatrixArgs(argv: string[]): MatrixArgs {
  const flags = parseFlags(argv, MATRIX_FLAGS);
  const labels = flags.value("--labels");
  const sessions = flags.value("--sessions");
  const mock = flags.has("--mock");
  if (!labels && !sessions && !mock) throw new UsageError("pass --labels <file>, --sessions <dir>, or --mock");
  if (labels && sessions) throw new UsageError("use either --labels or --sessions, not both");
  const kind = flags.value("--consensus", "unanimous");
  if (kind !== "unanimous" && kind !== "majority") throw new UsageError(`--consensus must be unanimous|majority (got "${kind}")`);
  const min = Number(flags.value("--min-agree", "0.6"));
  if (kind === "majority" && !(min > 0.5 && min <= 1)) throw new UsageError("--min-agree must be > 0.5 and <= 1");
  const args: MatrixArgs = {
    out: flags.value("--out", "mining-results"),
    consensus: kind === "majority" ? { kind: "majority", min } : { kind: "unanimous" },
    mock,
  };
  if (labels) args.labels = labels;
  if (sessions) args.sessions = sessions;
  const version = flags.value("--version");
  if (version) args.version = version;
  return args;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  if (helpRequested(argv)) {
    console.log(MATRIX_USAGE);
    process.exit(0);
  }
  let args: MatrixArgs;
  try {
    args = parseMatrixArgs(argv);
  } catch (e) {
    console.error(`${(e as Error).message}\n\n${MATRIX_USAGE}`);
    process.exit(2);
  }

  const { loadValidatedLexicon } = await import("./lexicon.js");
  const { loadCatalogs } = await import("../engine/catalogs.js");
  const { lexicon, catalogVersion } = await loadValidatedLexicon();
  const loaded = await loadCatalogs();
  const appliesTo = new Map<string, string[]>();
  for (const c of loaded.catalogs as Catalog[]) for (const n of c.nodes) appliesTo.set(n.id, n.applies_to ?? []);
  const nodeIndex = catalogNodeIndex(loaded.catalogs as Catalog[]);

  let evidence: EvidenceRow[] = [];
  let sessionRows: DecisionRow[] = [];

  if (args.sessions) {
    const { FileStore } = await import("../store/file_store.js");
    const { collectObservations } = await import("../learning/population_priors.js");
    const store = new FileStore(path.resolve(args.sessions));
    const observations = await collectObservations(store);
    const byProject = new Map<string, SessionObservation[]>();
    for (const o of observations) {
      (byProject.get(o.project_id) ?? byProject.set(o.project_id, []).get(o.project_id)!).push({
        project_id: o.project_id,
        archetypes: o.archetypes,
        node: o.node,
        option: o.option,
        source: o.source,
      });
    }
    for (const [pid, obs] of [...byProject.entries()].sort()) {
      sessionRows.push(decisionRowFromSession(obs, { project_id: pid, archetype: obs[0]?.archetypes[0] ?? "other", catalog_version: catalogVersion, lexicon_version: lexicon.version }));
    }
    console.log(`${sessionRows.length} session rows from ${observations.length} observations`);
  } else {
    let text: string;
    if (args.labels) text = await fs.readFile(args.labels, "utf8");
    else {
      // --mock: run the mock labeller over the smallest real corpus slice, end to end
      const { MockLLM } = await import("../llm/client.js");
      const { labelMockHandlers } = await import("./label_mock.js");
      const { labelDocument, loadManifest, CORPUS_DIR } = await import("./label.js");
      const { condenseSpecDoc } = await import("./condense.js");
      const manifest = (await loadManifest()).slice(0, 4);
      const llm = new MockLLM(labelMockHandlers);
      const rows: DocumentLabels[] = [];
      for (const e of manifest) {
        const body = await fs.readFile(path.join(CORPUS_DIR, e.file), "utf8");
        const digest = condenseSpecDoc(e.id, body, { archetype: e.archetype, maxTokens: 20000 });
        rows.push(await labelDocument(llm, digest, lexicon, { versions: { lexicon: lexicon.version, catalog: catalogVersion } }));
      }
      text = toJsonl(rows);
      console.log(`--mock: labelled ${rows.length} corpus documents with the mock labeller`);
    }
    const parsed = evidenceRowsFromLabelFile(text);
    for (const e of parsed.errors) console.error(`  parse: ${e}`);
    evidence = parsed.rows;
  }

  const built = buildMatrix(evidence, lexicon, {
    appliesTo,
    nodeIndex,
    expected: { catalog: catalogVersion, lexicon: lexicon.version },
    consensus: args.consensus,
    uncovered: uncoveredNodes(lexicon, nodeIndex),
    ...(args.version ? { version: args.version } : {}),
  });
  built.matrix.rows.push(...sessionRows);

  console.log(`\n${renderMatrixReport(built.matrix, built.validation)}\n`);

  await fs.mkdir(args.out, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const base = path.join(args.out, `${stamp}-matrix`);
  await fs.writeFile(`${base}-decisions.jsonl`, toJsonl(built.matrix.rows));
  await fs.writeFile(`${base}-evidence.jsonl`, toJsonl(evidence));
  await fs.writeFile(`${base}-flat.csv`, `${toCsv(flattenMatrix(built.matrix))}\n`);
  await fs.writeFile(`${base}-validation.json`, `${JSON.stringify(built.validation, null, 2)}\n`);
  await fs.writeFile(`${base}-report.md`, `${renderMatrixReport(built.matrix, built.validation)}\n`);
  console.log(`written ${base}-{decisions.jsonl,evidence.jsonl,flat.csv,validation.json,report.md}`);
  void here;
}
