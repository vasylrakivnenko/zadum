/**
 * Evidence layer, part 5 (statistics half) — **co-occurrence**: decision rows → 2×2 tables → `PairStat`s.
 *
 * `matrix.ts` produced rows that say, per catalog node, `observed(option)` / `unobserved` / `conflict`.
 * `design_graph.ts` turns `PairStat`s into edges and refuses to turn any of them into a law. This file is the
 * arithmetic in between, and it has exactly one job: count honestly.
 *
 * ═══ THE ONE RULE ═══
 *
 * A row is ELIGIBLE for a pair only when BOTH nodes are `status === "observed"`. A row where either node is
 * `unobserved` or `conflict` contributes to NOTHING — not to n00, not to eligible_n, not to a coverage
 * numerator. `unobserved` is not `absent`; a silence is not a "no". Every other line here follows from that:
 * the denominators, the invariant `n11 + n10 + n01 + n00 === eligible_n`, and the reason coverage is reported
 * as its own number instead of being quietly folded into the counts.
 *
 * The failure this prevents is specific and easy to ship: over 135 catalog nodes and a corpus where most cells
 * are unobserved, letting silence into n00 would make every element look rare, every baseline p(B) look tiny,
 * and therefore every lift look enormous. The graph would then confidently report associations that are
 * artifacts of what the labeller could not see.
 *
 * ═══ WHAT IS COMPUTED, AND WITH WHICH DENOMINATOR ═══
 *
 *   p(B|A) = smoothed(n11, n11 + n10)      over rows where A was observed as the named option
 *   p(A|B) = smoothed(n11, n11 + n01)
 *   p(B)   = smoothed(n11 + n01, eligible_n)   the BASELINE — over eligible rows, not over all rows
 *   p(A)   = smoothed(n11 + n10, eligible_n)
 *   lift       = p(B|A) / p(B)
 *   difference = p(B|A) − p(B)
 *   ci95       = wilsonInterval(n11, n11 + n10)   the interval for p(B|A), which is what `classifyPair`
 *                compares against the baseline
 *
 * Smoothing is Jeffreys (`a = b = 0.5`) by default, shared with the rest of the system through
 * `design_graph.ts` so no two files ever disagree about what a probability is. It exists so a zero-count cell
 * says "we saw none of these, out of few" rather than "this is impossible": `smoothedRate(0, 4)` is 0.1, not 0.
 *
 * Stratification comes FIRST (spec rules 9/10): statistics are computed per archetype and per source kind, and
 * a pooled aggregate is produced only when a caller explicitly asks for one — labelled `archetype: null,
 * source_kind: null` so it can never be mistaken for a stratum. `buildDesignGraph` then runs `detectSimpsons`
 * over the two and hangs the warning on the pooled edge, never on the strata.
 *
 * There is no LLM in this file, and no clock outside the CLI. Same rows in → byte-identical stats out.
 *
 * CLI:
 *   tsx src/mining/cooccurrence.ts --matrix <decisions.jsonl> --out <dir> [--pooled]
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { helpRequested, parseFlags, UsageError } from "../cli/flags.js";
import {
  buildDesignGraph,
  DEFAULT_THRESHOLDS,
  elementKey,
  JEFFREYS,
  parseElementKey,
  smoothedRate,
  wilsonInterval,
  type ElementStat,
  type GraphThresholds,
  type PairStat,
  type Smoothing,
} from "../learning/design_graph.js";
import { DecisionRowSchema, parseJsonl, type DecisionCell, type DecisionRow } from "./matrix.js";
import { elementStats as elementStatsOverMatrix } from "./element_stats.js";

// ---------------------------------------------------------------------------
// Scope and stratification
// ---------------------------------------------------------------------------

/** Where a statistic is valid. `null` on a dimension means POOLED across it, and must be rendered as such. */
export interface Scope {
  archetype: string | null;
  source_kind: string | null;
}

export const POOLED_SCOPE: Scope = { archetype: null, source_kind: null };

/** The token a stratum key uses for a pooled dimension. Not a legal archetype id or source kind. */
export const POOLED_TOKEN = "*";

export function stratumKey(scope: Scope): string {
  return `${scope.archetype ?? POOLED_TOKEN}|${scope.source_kind ?? POOLED_TOKEN}`;
}

export function parseStratumKey(key: string): Scope {
  const i = key.indexOf("|");
  const a = i < 0 ? key : key.slice(0, i);
  const s = i < 0 ? POOLED_TOKEN : key.slice(i + 1);
  return { archetype: a === POOLED_TOKEN ? null : a, source_kind: s === POOLED_TOKEN ? null : s };
}

/**
 * Split rows into strata. `by.archetype` / `by.sourceKind` say which dimensions are kept SEPARATE; a dimension
 * that is not kept separate is pooled across and reported as `null`.
 *
 * `stratify(rows, { archetype: false, sourceKind: false })` therefore returns exactly one group — the pooled
 * aggregate — which is why producing it is always an explicit act by the caller and never a default. Keys are
 * inserted in sorted order so iteration is deterministic.
 */
export function stratify(rows: DecisionRow[], by: { archetype: boolean; sourceKind: boolean }): Map<string, DecisionRow[]> {
  const buckets = new Map<string, DecisionRow[]>();
  for (const r of rows) {
    const key = stratumKey({ archetype: by.archetype ? r.archetype : null, source_kind: by.sourceKind ? r.source_kind : null });
    (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(r);
  }
  const sorted = new Map<string, DecisionRow[]>();
  for (const k of [...buckets.keys()].sort()) sorted.set(k, buckets.get(k)!);
  return sorted;
}

// ---------------------------------------------------------------------------
// The 2×2 table
// ---------------------------------------------------------------------------

export interface PairCounts {
  n11: number;
  n10: number;
  n01: number;
  n00: number;
  eligible_n: number;
  /** the rows that produced n11 — the audit trail from a probability back to the artifacts */
  support_row_ids: string[];
}

/** A cell counts as an observation only when it is `observed` AND actually names an option. */
function observedOption(cell: DecisionCell | undefined): string | null {
  if (!cell || cell.status !== "observed") return null;
  return cell.option ?? null;
}

function requireElement(key: string, which: "from" | "to"): { node_id: string; option_id: string } {
  const el = parseElementKey(key);
  if (!el) throw new UsageError(`${which} element "${key}" is not a node=option key`);
  return el;
}

/**
 * The 2×2 table for one ordered element pair over one set of rows.
 *
 *   n11  A observed as the named option, B observed as the named option
 *   n10  A as named, B's node observed with a DIFFERENT option
 *   n01  B as named, A's node observed with a DIFFERENT option
 *   n00  both nodes observed, neither as the named option
 *
 * ═══ A row is ELIGIBLE only when BOTH nodes are `status === "observed"`. A row where either node is ═══
 * ═══ `unobserved` or `conflict` contributes to NOTHING — not to n00, and not to eligible_n.        ═══
 *
 * That is the single most important rule in this file. `unobserved` means "we did not see", never "it is not
 * there" (matrix.ts rule 1), and `conflict` means "our evidence contradicted itself" (rule 3) — neither is a
 * negative observation, so neither may sit in a denominator. `n11 + n10 + n01 + n00 === eligible_n` holds by
 * construction: every eligible row increments exactly one cell.
 */
export function pairCounts(rows: DecisionRow[], fromKey: string, toKey: string): PairCounts {
  const from = requireElement(fromKey, "from");
  const to = requireElement(toKey, "to");
  let n11 = 0;
  let n10 = 0;
  let n01 = 0;
  let n00 = 0;
  const support_row_ids: string[] = [];
  for (const row of rows) {
    const a = observedOption(row.cells[from.node_id]);
    const b = observedOption(row.cells[to.node_id]);
    if (a === null || b === null) continue; // NOT eligible — and therefore not an n00 either
    const aIs = a === from.option_id;
    const bIs = b === to.option_id;
    if (aIs && bIs) {
      n11 += 1;
      support_row_ids.push(row.row_id);
    } else if (aIs) n10 += 1;
    else if (bIs) n01 += 1;
    else n00 += 1;
  }
  return { n11, n10, n01, n00, eligible_n: n11 + n10 + n01 + n00, support_row_ids };
}

/**
 * Why rows were excluded from a pair's table. Reported rather than inferred: "n = 12" reads very differently
 * once you know 400 rows were dropped because one of the two nodes was never askable in their source kind.
 * This is where `cell.observable` earns its place — it separates "we could not have seen it" from "we looked
 * and the artifact was silent".
 */
export interface PairEligibility {
  rows: number;
  eligible: number;
  /** at least one side was never askable for this row (`observable: false` or the column was missing) */
  not_observable: number;
  /** observable, looked at, and silent */
  silent: number;
  /** at least one side had contradictory evidence */
  conflict: number;
}

export function pairEligibility(rows: DecisionRow[], fromKey: string, toKey: string): PairEligibility {
  const from = requireElement(fromKey, "from");
  const to = requireElement(toKey, "to");
  const out: PairEligibility = { rows: rows.length, eligible: 0, not_observable: 0, silent: 0, conflict: 0 };
  for (const row of rows) {
    const cells = [row.cells[from.node_id], row.cells[to.node_id]];
    if (cells.every((c) => observedOption(c) !== null)) {
      out.eligible += 1;
      continue;
    }
    if (cells.some((c) => c?.status === "conflict")) out.conflict += 1;
    else if (cells.some((c) => !c || !c.observable)) out.not_observable += 1;
    else out.silent += 1;
  }
  return out;
}

// ---------------------------------------------------------------------------
// One pair statistic
// ---------------------------------------------------------------------------

/** Rows in which a node was observed with SOME option — the numerator of `coverage_from` / `coverage_to`. */
export function nodeObservedCounts(rows: DecisionRow[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const row of rows) {
    for (const [nodeId, cell] of Object.entries(row.cells)) {
      if (observedOption(cell) !== null) out.set(nodeId, (out.get(nodeId) ?? 0) + 1);
    }
  }
  return out;
}

/**
 * The full statistic for one ordered pair within one scope. Formulas are in the file header; the two
 * non-obvious guards:
 *
 *  - **lift when p(B) = 0.** With Jeffreys smoothing p(B) can never be 0, but a caller may pass `{a: 0, b: 0}`
 *    to get raw rates, and then a baseline of zero is reachable. `p(B|A) / 0` is `Infinity` or `NaN`, neither
 *    of which is a number `validatePairStat` will accept, and neither of which means "infinitely strong
 *    association" — it means the baseline is unestimable from this stratum. We report `lift: 0`, i.e. "no
 *    information", and the interval and counts remain there to say why.
 *  - **empty stratum.** With no rows the coverage denominators are 0; the coverages are reported as 0 rather
 *    than NaN, and `eligible_n` of 0 will keep `classifyPair` at `unknown` regardless.
 */
export function pairStat(
  rows: DecisionRow[],
  from: string,
  to: string,
  scope: Scope,
  smoothing: Smoothing = JEFFREYS,
  observedByNode?: Map<string, number>,
): PairStat {
  const fromEl = requireElement(from, "from");
  const toEl = requireElement(to, "to");
  const c = pairCounts(rows, from, to);
  const observed = observedByNode ?? nodeObservedCounts(rows);

  const p_to_given_from = smoothedRate(c.n11, c.n11 + c.n10, smoothing);
  const p_from_given_to = smoothedRate(c.n11, c.n11 + c.n01, smoothing);
  const p_to = smoothedRate(c.n11 + c.n01, c.eligible_n, smoothing);
  const p_from = smoothedRate(c.n11 + c.n10, c.eligible_n, smoothing);

  const denom = rows.length;
  const share = (n: number) => (denom > 0 ? n / denom : 0);

  return {
    from,
    to,
    archetype: scope.archetype,
    source_kind: scope.source_kind,
    n11: c.n11,
    n10: c.n10,
    n01: c.n01,
    n00: c.n00,
    eligible_n: c.eligible_n,
    coverage_from: share(observed.get(fromEl.node_id) ?? 0),
    coverage_to: share(observed.get(toEl.node_id) ?? 0),
    joint_coverage: share(c.eligible_n),
    p_from,
    p_to,
    p_to_given_from,
    p_from_given_to,
    lift: p_to > 0 ? p_to_given_from / p_to : 0,
    difference: p_to_given_from - p_to,
    ci95: wilsonInterval(c.n11, c.n11 + c.n10),
    support_row_ids: c.support_row_ids,
  };
}

// ---------------------------------------------------------------------------
// Enumerating the pairs worth computing
// ---------------------------------------------------------------------------

export interface PairEnumerationOptions {
  /** floor on `eligible_n`; a pair below it is not returned at all. The CLI ties this to `reportMinN`. */
  minEligible?: number;
  /**
   * Cap on the number of ORDERED pairs enumerated. 135 catalog nodes × ~4 options is ~500 elements, i.e.
   * ~250k ordered pairs × every row — minutes of work and a report nobody can read. The cap is applied by
   * keeping only the most-observed elements (ties broken by key, so it is deterministic), because a rare
   * element cannot clear `softMinN` anyway.
   */
  maxPairs?: number;
  /** ignore elements observed in fewer than this many rows of the stratum */
  minElementSupport?: number;
  smoothing?: Smoothing;
}

const DEFAULT_MAX_PAIRS = 20000;

/** element key → number of rows in which it was observed. */
export function elementSupport(rows: DecisionRow[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const row of rows) {
    for (const [nodeId, cell] of Object.entries(row.cells)) {
      const option = observedOption(cell);
      if (option === null) continue;
      const key = elementKey(nodeId, option);
      out.set(key, (out.get(key) ?? 0) + 1);
    }
  }
  return out;
}

/**
 * The elements this stratum can say anything about, most-observed first and capped so the pair enumeration
 * stays bounded. Returned sorted by key: the enumeration order — and therefore the output order — must not
 * depend on which rows happened to arrive first.
 */
export function candidateElements(rows: DecisionRow[], opts: PairEnumerationOptions = {}): string[] {
  const minSupport = opts.minElementSupport ?? 1;
  const maxPairs = opts.maxPairs ?? DEFAULT_MAX_PAIRS;
  const support = [...elementSupport(rows).entries()].filter(([, n]) => n >= minSupport);
  // K elements yield K·(K−1) ordered pairs; keep the largest K that fits under the cap.
  const k = Math.max(0, Math.floor((1 + Math.sqrt(1 + 4 * Math.max(0, maxPairs))) / 2));
  const ranked = support.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, k);
  return ranked.map(([key]) => key).sort();
}

/**
 * Every ordered element pair worth computing in this stratum, as `PairStat`s sorted by (from, to).
 *
 * **Pairs from the SAME node are skipped.** `user_accounts=none → user_accounts=multi_user` is not an
 * association, it is the definition of a categorical variable: the options of one node are mutually exclusive
 * by construction, so p(B|A) is 0 and p(A|B) is 0 for every such pair in every corpus, forever. Emitting them
 * would fill the graph with tautologies that look like extremely strong `soft_negative` findings, and would
 * bury the real edges under one entry per option pair per node.
 *
 * Both directions of a cross-node pair ARE emitted: p(B|A) ≠ p(A|B) whenever the elements differ in
 * prevalence, and `classifyPair` reads the directed conditional.
 */
export function allPairs(rows: DecisionRow[], scope: Scope, opts: PairEnumerationOptions = {}): PairStat[] {
  const minEligible = opts.minEligible ?? 1;
  const smoothing = opts.smoothing ?? JEFFREYS;
  const keys = candidateElements(rows, opts);
  const parsed = keys.map((k) => ({ key: k, el: requireElement(k, "from") }));
  const observed = nodeObservedCounts(rows);
  const out: PairStat[] = [];
  for (const a of parsed) {
    for (const b of parsed) {
      if (a.key === b.key) continue;
      if (a.el.node_id === b.el.node_id) continue; // same node — a tautology, not an association
      const s = pairStat(rows, a.key, b.key, scope, smoothing, observed);
      if (s.eligible_n < minEligible) continue;
      out.push(s);
    }
  }
  return out.sort((x, y) => x.from.localeCompare(y.from) || x.to.localeCompare(y.to));
}

// ---------------------------------------------------------------------------
// Element prevalence
// ---------------------------------------------------------------------------

/**
 * Element statistics are NOT computed here — `element_stats.ts` owns them, and this module delegates.
 *
 * There was briefly a second implementation in this file, and the two disagreed in two ways that both
 * mattered: it used `ln((1+eligible)/(1+observed))` (missing the `+ 1` the spec pins, so a universal element
 * scored 0 instead of 1), and it counted rows where a node was merely OBSERVABLE in the prevalence
 * denominator. The second is the serious one — an observable-but-unobserved row in the denominator is an
 * `unobserved` cell acting as a negative, which is the single rule this whole layer exists to enforce. With
 * the correct denominator (rows where the node was observed with SOME option) an element's prevalence is the
 * share of products that made that choice, and a node's option prevalences sum to 1, which is what a prior
 * needs. One implementation, in the module named after it.
 */

// ---------------------------------------------------------------------------
// The report: everything `buildDesignGraph` needs
// ---------------------------------------------------------------------------

export interface CooccurrenceOptions extends PairEnumerationOptions {
  /** which dimensions to keep separate. Default: both — statistics are stratified FIRST, always. */
  by?: { archetype: boolean; sourceKind: boolean };
  /** opt IN to the pooled aggregate. Off by default; a pooled number is a claim that needs a reason. */
  pooled?: boolean;
}

export interface StratumReport {
  key: string;
  archetype: string | null;
  source_kind: string | null;
  rows: number;
  elements: number;
  pairs: number;
  stats: PairStat[];
}

export interface CooccurrenceResult {
  rows: number;
  strata: StratumReport[];
  /** every stratified statistic, flattened — this is `buildDesignGraph`'s first argument */
  stats: PairStat[];
  /** pooled statistics, empty unless `opts.pooled` — always labelled `archetype: null, source_kind: null` */
  pooled: PairStat[];
  elements: ElementStat[];
  pooled_elements: ElementStat[];
}

/**
 * Stratified co-occurrence over a whole matrix, ready to hand to `buildDesignGraph(res.stats, { pooled:
 * res.pooled, elements: [...res.elements, ...res.pooled_elements] })`.
 *
 * Strata come first and always; the pooled aggregate is computed only on request, and only after the strata
 * exist — which is what makes `detectSimpsons` able to say anything at all. Pooling without strata to compare
 * against is not a shortcut, it is an unfalsifiable number.
 */
export function cooccurrenceReport(rows: DecisionRow[], opts: CooccurrenceOptions = {}): CooccurrenceResult {
  const by = opts.by ?? { archetype: true, sourceKind: true };
  const strata: StratumReport[] = [];
  const stats: PairStat[] = [];
  const elements: ElementStat[] = [];

  // Element statistics come from `element_stats.ts`, computed once over the whole matrix: it stratifies by
  // archetype x source kind exactly as `stratify` does here, and derives `archetype_lift` against its own
  // pooled baseline — which is why the baseline is not threaded through the loop below any more.
  const es = elementStatsOverMatrix(rows, { pooled: true });

  for (const [key, group] of stratify(rows, by)) {
    const scope = parseStratumKey(key);
    const s = allPairs(group, scope, opts);
    strata.push({
      key,
      archetype: scope.archetype,
      source_kind: scope.source_kind,
      rows: group.length,
      elements: candidateElements(group, opts).length,
      pairs: s.length,
      stats: s,
    });
    stats.push(...s);
  }
  elements.push(...es.byStratum);

  const pooled = opts.pooled ? allPairs(rows, POOLED_SCOPE, opts) : [];
  const pooled_elements = opts.pooled ? es.pooled : [];

  return { rows: rows.length, strata, stats, pooled, elements, pooled_elements };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

export function renderCooccurrenceReport(res: CooccurrenceResult): string {
  const L: string[] = [];
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  L.push(`# co-occurrence statistics`);
  L.push("");
  L.push(`${res.rows} decision rows · ${res.strata.length} strata · ${res.stats.length} stratified pair statistics`);
  L.push("");
  L.push(`  ${"archetype".padEnd(22)} ${"source".padEnd(10)} ${"rows".padStart(6)} ${"elements".padStart(9)} ${"pairs".padStart(7)}  median eligible n`);
  for (const s of res.strata) {
    const ns = s.stats.map((x) => x.eligible_n).sort((a, b) => a - b);
    const median = ns.length ? ns[Math.floor(ns.length / 2)]! : 0;
    L.push(
      `  ${(s.archetype ?? "POOLED").padEnd(22)} ${(s.source_kind ?? "POOLED").padEnd(10)} ${String(s.rows).padStart(6)} ${String(s.elements).padStart(9)} ${String(s.pairs).padStart(7)}  ${median}`,
    );
  }
  L.push("");
  if (res.pooled.length) {
    L.push(`POOLED aggregate requested: ${res.pooled.length} pair statistics across every archetype and source kind.`);
    L.push("Pooled numbers are composition-sensitive; read any Simpson's warning in the graph report FIRST.");
  } else {
    L.push("No pooled aggregate was computed (pass --pooled to opt in).");
  }
  const total = res.stats.length;
  if (total) {
    const cov = res.stats.reduce((a, s) => a + s.joint_coverage, 0) / total;
    L.push("");
    L.push(`mean joint coverage (rows where BOTH nodes were observed): ${pct(cov)}`);
    L.push(`— the remaining rows are unobserved or conflicting and were counted nowhere, by design.`);
  }
  return L.join("\n");
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export const COOCCURRENCE_USAGE = `graph:build — decision rows → co-occurrence statistics → design graph

  tsx src/mining/cooccurrence.ts --matrix <decisions.jsonl> [--out <dir>] [--pooled]
                                 [--min-n 10] [--soft-min-n 30] [--hard-min-n 100] [--max-pairs 20000]

  --matrix      JSONL of decision rows, as written by \`mine:matrix\` (*-decisions.jsonl)
  --out         output directory (default mining-results)
  --min-n       eligible-row floor for reporting a pair at all (default 10)
  --soft-min-n  eligible-row floor for a soft edge (default 30)
  --hard-min-n  eligible-row floor for PROPOSING a hard rule — never auto-promoted (default 100)
  --max-pairs   cap on ordered pairs enumerated per stratum (default ${DEFAULT_MAX_PAIRS})
  --pooled      also compute the pooled aggregate across archetypes/source kinds (off by default)

  Writes graph.json, graph-candidates.json, graph-report.md, graph-report.json into --out.`;

const COOCCURRENCE_FLAGS = {
  value: ["--matrix", "--out", "--min-n", "--soft-min-n", "--hard-min-n", "--max-pairs"],
  boolean: ["--pooled"],
} as const;

export interface CooccurrenceArgs {
  matrix: string;
  out: string;
  thresholds: GraphThresholds;
  pooled: boolean;
  maxPairs: number;
}

function positiveInt(flag: string, raw: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw new UsageError(`${flag} must be a positive integer (got "${raw}")`);
  return n;
}

export function parseCooccurrenceArgs(argv: string[]): CooccurrenceArgs {
  const flags = parseFlags(argv, COOCCURRENCE_FLAGS);
  const matrix = flags.value("--matrix");
  if (!matrix) throw new UsageError("pass --matrix <decisions.jsonl>");
  const reportMinN = positiveInt("--min-n", flags.value("--min-n", String(DEFAULT_THRESHOLDS.reportMinN)));
  const softMinN = positiveInt("--soft-min-n", flags.value("--soft-min-n", String(DEFAULT_THRESHOLDS.softMinN)));
  const hardMinN = positiveInt("--hard-min-n", flags.value("--hard-min-n", String(DEFAULT_THRESHOLDS.hardMinN)));
  // An ordering violation is not a preference, it is incoherent: a soft edge below the reporting floor could
  // never be reported, and a hard proposal below the soft floor would be a law with less support than an
  // association.
  if (softMinN < reportMinN) throw new UsageError(`--soft-min-n (${softMinN}) must be >= --min-n (${reportMinN})`);
  if (hardMinN < softMinN) throw new UsageError(`--hard-min-n (${hardMinN}) must be >= --soft-min-n (${softMinN})`);
  return {
    matrix,
    out: flags.value("--out", "mining-results"),
    thresholds: { ...DEFAULT_THRESHOLDS, reportMinN, softMinN, hardMinN },
    pooled: flags.has("--pooled"),
    maxPairs: positiveInt("--max-pairs", flags.value("--max-pairs", String(DEFAULT_MAX_PAIRS))),
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  if (helpRequested(argv)) {
    console.log(COOCCURRENCE_USAGE);
    process.exit(0);
  }
  let args: CooccurrenceArgs;
  try {
    args = parseCooccurrenceArgs(argv);
  } catch (e) {
    console.error(`${(e as Error).message}\n\n${COOCCURRENCE_USAGE}`);
    process.exit(2);
  }

  const text = await fs.readFile(args.matrix, "utf8");
  const parsed = parseJsonl<DecisionRow>(text, (v) => DecisionRowSchema.parse(v));
  for (const e of parsed.errors) console.error(`  parse: ${e}`);
  if (!parsed.rows.length) {
    console.error(`no decision rows in ${args.matrix}`);
    process.exit(1);
  }

  // Real catalogs: the AUTHORED hard edges travel alongside the learned ones (read-only — enforcement stays
  // in `propagateHard`), and the node index lets `validateGraph` catch an element key the catalog disowns.
  const { loadCatalogs } = await import("../engine/catalogs.js");
  const { catalogNodeIndex } = await import("./lexicon.js");
  const { toNodeDef } = await import("../core/catalog.js");
  const { hardEdgesFromCatalog, renderGraphReport, validateGraph } = await import("../learning/design_graph.js");
  const loaded = await loadCatalogs();
  const nodeIndex = catalogNodeIndex(loaded.catalogs);
  const hardEdges = hardEdgesFromCatalog(loaded.catalogs.flatMap((c) => c.nodes.map((n) => toNodeDef(n, c.archetype))));

  const res = cooccurrenceReport(parsed.rows, {
    by: { archetype: true, sourceKind: true },
    pooled: args.pooled,
    minEligible: args.thresholds.reportMinN,
    maxPairs: args.maxPairs,
    smoothing: args.thresholds.smoothing,
  });

  const built = buildDesignGraph(res.stats, {
    thresholds: args.thresholds,
    pooled: res.pooled,
    hardEdges,
    elements: [...res.elements, ...res.pooled_elements],
    catalog_version: loaded.version,
    matrix_version: path.basename(args.matrix),
    lexicon_version: parsed.rows[0]?.lexicon_version ?? "",
    provenance: {
      // Read off the decision rows themselves (`DecisionRowSchema.label_models`), so a graph can always name
      // whose judgement its probabilities rest on — even though this CLI never sees the evidence rows. Absent
      // on a row means "no model is named" (a session row, or a row written before the field existed).
      label_models: [...new Set(parsed.rows.flatMap((r) => r.label_models ?? []))].sort(),
      label_prompt_versions: [...new Set(parsed.rows.flatMap((r) => r.label_prompt_versions ?? []))].sort(),
      source_kinds: [...new Set(parsed.rows.map((r) => r.source_kind))].sort(),
      archetypes: [...new Set(parsed.rows.map((r) => r.archetype))].sort(),
      rows: parsed.rows.length,
    },
  });

  const issues = validateGraph(built.graph, nodeIndex);

  console.log(`\n${renderCooccurrenceReport(res)}\n`);
  console.log(`${renderGraphReport(built)}\n`);
  if (issues.length) {
    console.error(`graph validation: ${issues.length} issue${issues.length === 1 ? "" : "s"}`);
    for (const i of issues.slice(0, 20)) console.error(`  - ${i.where}: ${i.problem}`);
  }

  await fs.mkdir(args.out, { recursive: true });
  const md = `${renderCooccurrenceReport(res)}\n\n${renderGraphReport(built)}\n`;
  await fs.writeFile(path.join(args.out, "graph.json"), `${JSON.stringify(built.graph, null, 2)}\n`);
  await fs.writeFile(path.join(args.out, "graph-candidates.json"), `${JSON.stringify(built.candidates, null, 2)}\n`);
  await fs.writeFile(path.join(args.out, "graph-report.md"), md);
  await fs.writeFile(
    path.join(args.out, "graph-report.json"),
    `${JSON.stringify(
      {
        matrix: args.matrix,
        rows: res.rows,
        thresholds: args.thresholds,
        pooled_requested: args.pooled,
        strata: res.strata.map((s) => ({ archetype: s.archetype, source_kind: s.source_kind, rows: s.rows, elements: s.elements, pairs: s.pairs })),
        simpsons: built.simpsons,
        candidates: built.candidates,
        validation_issues: issues,
        stats: res.stats,
        pooled_stats: res.pooled,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`written ${path.join(args.out, "graph.{json,-candidates.json,-report.md,-report.json}")}`);
}
