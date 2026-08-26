/**
 * Evidence layer, phase 6 — **design-element TF-IDF and rarity**: prevalence, entropy, IDF and rarity over
 * the elements of the decision matrix (`node=option`), computed per archetype and per source kind.
 *
 * The input is `DecisionRow[]` from `matrix.ts` — what each artifact was found to have DECIDED. The output is
 * `ElementStat` from `learning/design_graph.ts` — the per-element numbers the graph carries and the selector
 * experiment at the bottom of this file consumes. Nothing here calls an LLM, touches the network, or edits a
 * catalog; every number is a count ratio you can re-derive by hand from the rows.
 *
 * ═══ WHY THIS IS NOT `ngrams.ts` ═══
 *
 * `ngrams.ts` computes DF/TF, PMI and class-based TF-IDF over the WORDS of a corpus. This file computes IDF
 * over the ELEMENTS of the decision matrix. The arithmetic rhymes; the thing being measured does not:
 *
 *   words    measure how a document TALKS.  "partial payment" occurring in 40% of invoicing specs tells you
 *            what the prose is about — including the specs that mention it only to rule it out.
 *   elements measure what a product DECIDED. `payments_in_app=collect_online` at 40% means 40% of the products
 *            that made this decision at all made it this way.
 *
 * Two consequences that make sharing the n-gram code the wrong move:
 *
 *   1. The denominators differ in KIND. A term's DF runs over every document, because every document could
 *      have contained the word. An element's denominator runs only over rows where the NODE WAS OBSERVED: a
 *      row that said nothing about payments is not a payments-decision row, and putting it in the denominator
 *      would turn silence into evidence of absence — the single mistake `matrix.ts` exists to prevent.
 *   2. None of the n-gram hygiene applies. Element keys are already canonical (`node=option`), so tokenizing,
 *      stemming, boundary stopwords, phraseness (PMI) and subsumption pruning are all noise here.
 *
 * The one thing genuinely shared is the binary-entropy formula, which is imported from `ngrams.ts` rather than
 * reimplemented — same math, one implementation, no drift.
 *
 * ═══ THE RULE THE WHOLE FILE TURNS ON ═══
 *
 *   An `unobserved` cell is NEVER a negative. It is not in the numerator and it is not in the denominator.
 *   A `conflict` cell is likewise in neither (see `tallyStratum`). Only `observed` rows are eligible, and a
 *   row is eligible for `node=option` exactly when the NODE was observed with SOME option — that row could
 *   have shown this option and demonstrably showed a value, so its verdict is informative either way.
 *
 * Because of that definition the prevalences of one node's options sum to 1 within a stratum. `unobserved_rate`
 * carries the silence separately, as a DATA-QUALITY signal that a reader must weigh before trusting the
 * prevalence — never as evidence that anybody chose anything.
 *
 * ═══ STRATIFICATION (spec rules 9/10) ═══
 *
 * A stratum is the CROSS of archetype and source kind: `crud-saas/repo` is not `crud-saas/session`. Nothing is
 * pooled unless the caller asks for it, and a pooled row is always labelled `archetype: null, source_kind:
 * null`. The pooled figures are computed internally in every case because `archetype_lift` is defined against
 * them, and a lift whose denominator is invisible is unauditable — so the report prints the denominator.
 *
 * CLI:
 *   npm run mine:elements -- --matrix <decision-rows.jsonl> [--out <dir>] [--min-eligible N] [--pooled]
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { helpRequested, parseFlags, UsageError } from "../cli/flags.js";
import {
  DEFAULT_THRESHOLDS,
  ElementStatSchema,
  elementKey,
  parseElementKey,
  type ElementStat,
} from "../learning/design_graph.js";
import { DecisionRowSchema, parseJsonl, type DecisionRow } from "./matrix.js";
import { binaryEntropy } from "./ngrams.js";

/**
 * Re-exported, not reimplemented: `-p·log2(p) - (1-p)·log2(1-p)` in BITS, with the standard 0·log0 = 0
 * convention at both ends (p = 0 and p = 1 are both exactly 0 — a decision nobody makes and a decision
 * everybody makes are equally unsurprising).
 */
export { binaryEntropy } from "./ngrams.js";

// ---------------------------------------------------------------------------
// Keys and labels
// ---------------------------------------------------------------------------

/** Scope-qualified identity of one stat row. `key` alone repeats across strata, so it is not a map key. */
export function statKey(s: { key: string; archetype: string | null; source_kind: string | null }): string {
  return `${s.archetype ?? "*"}|${s.source_kind ?? "*"}|${s.key}`;
}

/** Scope-qualified identity of one (stratum, node) group — the unit `catalogGapSignals` reasons about. */
export function stratumNodeKey(archetype: string | null, source_kind: string | null, node_id: string): string {
  return `${archetype ?? "*"}|${source_kind ?? "*"}|${node_id}`;
}

/** Inverse of `stratumNodeKey`. `*` is the pooled scope. Returns null for anything that is not one. */
export function parseStratumNodeKey(key: string): { archetype: string | null; source_kind: string | null; node_id: string } | null {
  const a = key.indexOf("|");
  if (a < 0) return null;
  const b = key.indexOf("|", a + 1);
  if (b < 0 || b === key.length - 1) return null;
  const archetype = key.slice(0, a);
  const source_kind = key.slice(a + 1, b);
  return { archetype: archetype === "*" ? null : archetype, source_kind: source_kind === "*" ? null : source_kind, node_id: key.slice(b + 1) };
}

/** How a scope is printed. `POOLED` is spelled out everywhere a pooled number appears — never a blank. */
export function stratumLabel(archetype: string | null, source_kind: string | null): string {
  return `${archetype ?? "POOLED"}/${source_kind ?? "POOLED"}`;
}

/** Invariants every emitted stat must satisfy. Empty means sound. */
export function elementStatIssues(s: ElementStat): string[] {
  const issues: string[] = [];
  const el = parseElementKey(s.key);
  if (!el) issues.push(`"${s.key}" is not a node=option element key`);
  else if (el.node_id !== s.node_id || el.option_id !== s.option_id) {
    issues.push(`key "${s.key}" disagrees with node_id="${s.node_id}" option_id="${s.option_id}"`);
  }
  if (s.observed_documents > s.eligible_documents) issues.push(`observed ${s.observed_documents} > eligible ${s.eligible_documents}`);
  if (!Number.isFinite(s.idf)) issues.push(`idf is ${s.idf}`);
  if (!Number.isFinite(s.prevalence) || s.prevalence < 0 || s.prevalence > 1) issues.push(`prevalence ${s.prevalence} is not a proportion`);
  return issues;
}

// ---------------------------------------------------------------------------
// Counting
// ---------------------------------------------------------------------------

interface NodeCounts {
  /** rows in this stratum that had a cell for this node at all (a `not_applicable` node has none) */
  rows: number;
  /** rows where the labeller was even ELIGIBLE to say something (`cell.observable`) — data quality only */
  observable_rows: number;
  /** rows where the node was observed with SOME option — the denominator of every prevalence below */
  eligible: number;
  conflict: number;
  unobserved: number;
  /** option → rows observed AS that option. Sums to `eligible`. */
  byOption: Map<string, number>;
}

function emptyCounts(): NodeCounts {
  return { rows: 0, observable_rows: 0, eligible: 0, conflict: 0, unobserved: 0, byOption: new Map() };
}

/**
 * One pass over a stratum's rows.
 *
 * The three statuses are handled in three different places on purpose:
 *   observed  → `eligible` +1, and `byOption[option]` +1. The only path that touches a numerator.
 *   unobserved→ `unobserved` +1 and NOTHING else. Not a negative, not a denominator. This is the rule.
 *   conflict  → `conflict` +1 and nothing else. Two options had positive evidence; the row therefore
 *               demonstrates a lexicon/labelling failure, not a decision. Putting it in the denominator would
 *               make it an implicit negative for every option of the node — including both options it is
 *               conflicted between, which is exactly backwards.
 */
function tallyStratum(rows: DecisionRow[]): { nodes: Map<string, NodeCounts>; rows: number } {
  const nodes = new Map<string, NodeCounts>();
  for (const row of rows) {
    for (const [nodeId, cell] of Object.entries(row.cells)) {
      let c = nodes.get(nodeId);
      if (!c) {
        c = emptyCounts();
        nodes.set(nodeId, c);
      }
      c.rows += 1;
      if (cell.observable) c.observable_rows += 1;
      if (cell.status === "observed" && cell.option) {
        c.eligible += 1;
        c.byOption.set(cell.option, (c.byOption.get(cell.option) ?? 0) + 1);
      } else if (cell.status === "conflict") {
        c.conflict += 1;
      } else {
        c.unobserved += 1;
      }
    }
  }
  return { nodes, rows: rows.length };
}

/**
 * The option universe: node → every option that was OBSERVED anywhere in the corpus, plus any option the
 * caller seeds from the catalog. It is global rather than per-stratum so that every stratum reports the same
 * element set — an option seen in `crud-saas` and never in `booking` produces an explicit zero row in
 * `booking` rather than a silent absence, which is what makes `archetype_lift` readable.
 *
 * Conflict candidates deliberately do NOT mint elements: an option that only ever appears inside a conflict
 * has never been observed as a decision, and letting a measurement failure create an element would put a
 * number on something nobody chose. Seed it from the catalog if you want a zero row for it.
 */
export function optionUniverse(rows: DecisionRow[], seeded?: ReadonlyMap<string, Iterable<string>> | Record<string, readonly string[]>): Map<string, Set<string>> {
  const universe = new Map<string, Set<string>>();
  const add = (nodeId: string, option: string) => {
    const set = universe.get(nodeId) ?? universe.set(nodeId, new Set()).get(nodeId)!;
    set.add(option);
  };
  for (const row of rows) {
    for (const [nodeId, cell] of Object.entries(row.cells)) {
      if (cell.status === "observed" && cell.option) add(nodeId, cell.option);
    }
  }
  if (seeded) {
    const entries = seeded instanceof Map ? [...seeded.entries()] : Object.entries(seeded as Record<string, readonly string[]>);
    for (const [nodeId, options] of entries) for (const o of options) add(nodeId, o);
  }
  return universe;
}

// ---------------------------------------------------------------------------
// The formulas
// ---------------------------------------------------------------------------

/**
 * `log((eligible + 1) / (observed + 1)) + 1` — natural log, add-one smoothing on BOTH terms, plus one.
 *
 * The formula is pinned by the spec and is not negotiable here: it is scikit-learn's smoothed IDF, which keeps
 * a never-observed element finite (rather than log of a division by zero) and keeps a universal element at
 * exactly 1 (rather than 0, which would multiply an entire downstream score away). Since `observed <= eligible`
 * always, the range is `[1, log(eligible + 1) + 1]`.
 */
export function elementIdf(eligible_documents: number, observed_documents: number): number {
  return Math.log((eligible_documents + 1) / (observed_documents + 1)) + 1;
}

/**
 * Null-safe prevalence. Zero eligible documents means we have no estimate at all — not a prevalence of zero
 * that happens to be true. It returns 0 (the schema demands a number in [0,1]) and the fact is MARKED by
 * `eligible_documents === 0`, which `classifyRarity` turns into `not_estimable` and the report prints as `n/a`.
 * There is no second boolean flag, because a flag can drift out of agreement with the count it describes.
 */
export function prevalenceOf(eligible_documents: number, observed_documents: number): number {
  return eligible_documents > 0 ? observed_documents / eligible_documents : 0;
}

// ---------------------------------------------------------------------------
// Rarity
// ---------------------------------------------------------------------------

export const RARITIES = ["rare", "uncommon", "common", "universal", "not_estimable"] as const;
export type Rarity = (typeof RARITIES)[number];

export interface RarityCutPoints {
  /**
   * Below this many eligible documents there is no rarity label, only `not_estimable`. Default 10, which is
   * `design_graph.DEFAULT_THRESHOLDS.reportMinN` — deliberately the same floor the graph uses to decide a pair
   * is worth reporting, so the two artifacts never disagree about what "too thin to say" means. A rarity label
   * derived from 3 documents is noise with a name on it, and the type must be able to say so.
   */
  minEligible: number;
  /** p < this → `rare`. 0.05 ≈ 1 in 20: real, but the long tail of the option set. */
  rareBelow: number;
  /** p < this (and >= rareBelow) → `uncommon`. 0.20 ≈ 1 in 5: a mainstream branch starts here. */
  uncommonBelow: number;
  /** p >= this → `universal`. 0.95: the exceptions are within labelling-noise distance of zero. */
  universalAtOrAbove: number;
}

/**
 * Cut-points are prevalences WITHIN a node (the options of one node sum to 1), so they read as "share of the
 * products that made this decision":
 *
 *   rare       < 5%    — a long-tail choice. Worth a card only if the consequence is large.
 *   uncommon   5–20%   — a real minority branch.
 *   common     20–95%  — a mainstream branch; the band where a decision actually discriminates.
 *   universal  >= 95%  — effectively the default; asking about it spends a card to confirm what is known.
 *
 * They are configurable because the right boundary depends on how many options a node has; they are documented
 * because an undocumented cut-point silently becomes policy.
 */
export const DEFAULT_RARITY: RarityCutPoints = {
  minEligible: DEFAULT_THRESHOLDS.reportMinN,
  rareBelow: 0.05,
  uncommonBelow: 0.2,
  universalAtOrAbove: 0.95,
};

export function classifyRarity(stat: Pick<ElementStat, "eligible_documents" | "prevalence">, opts: Partial<RarityCutPoints> = {}): Rarity {
  const c = { ...DEFAULT_RARITY, ...opts };
  if (stat.eligible_documents < c.minEligible) return "not_estimable";
  const p = stat.prevalence;
  if (p >= c.universalAtOrAbove) return "universal";
  if (p < c.rareBelow) return "rare";
  if (p < c.uncommonBelow) return "uncommon";
  return "common";
}

export interface RarityLabel {
  stat_key: string;
  key: string;
  node_id: string;
  option_id: string;
  archetype: string | null;
  source_kind: string | null;
  eligible_documents: number;
  observed_documents: number;
  prevalence: number;
  rarity: Rarity;
}

export function rarityLabels(stats: readonly ElementStat[], opts: Partial<RarityCutPoints> = {}): RarityLabel[] {
  return stats.map((s) => ({
    stat_key: statKey(s),
    key: s.key,
    node_id: s.node_id,
    option_id: s.option_id,
    archetype: s.archetype,
    source_kind: s.source_kind,
    eligible_documents: s.eligible_documents,
    observed_documents: s.observed_documents,
    prevalence: s.prevalence,
    rarity: classifyRarity(s, opts),
  }));
}

// ---------------------------------------------------------------------------
// Normalized IDF (input to the selector experiment)
// ---------------------------------------------------------------------------

/**
 * Min-max normalisation of IDF into [0,1] across the element set handed in, keyed by `statKey` so strata do
 * not collide.
 *
 * Degenerate case — every IDF equal (including a single element, and an empty set): **every element gets 0**,
 * not 0.5. When no element is rarer than any other, rarity carries no information, and the only behaviour that
 * cannot mislead is the one that changes nothing: `adjustValueByRarity` with a normalized IDF of 0 is the
 * identity. Returning 0.5 would apply a uniform-looking boost that is not uniform in effect (it is scaled by
 * each element's uncertainty) and would silently reorder cards on the strength of no evidence at all.
 *
 * Non-finite IDFs are excluded from the min/max and mapped to 0 for the same reason.
 */
export function normalizedIdf(stats: readonly ElementStat[]): Map<string, number> {
  const out = new Map<string, number>();
  const finite = stats.filter((s) => Number.isFinite(s.idf));
  if (!finite.length) {
    for (const s of stats) out.set(statKey(s), 0);
    return out;
  }
  let min = Infinity;
  let max = -Infinity;
  for (const s of finite) {
    if (s.idf < min) min = s.idf;
    if (s.idf > max) max = s.idf;
  }
  const span = max - min;
  for (const s of stats) out.set(statKey(s), span > 0 && Number.isFinite(s.idf) ? (s.idf - min) / span : 0);
  return out;
}

// ---------------------------------------------------------------------------
// The selector rarity experiment — SHIPPED INERT
// ---------------------------------------------------------------------------

/**
 * The optional selector parameter `rarityWeight`, as a pure function, living here rather than in
 * `src/core/selector.ts` so that the selector keeps exactly one scoring path until the harness says otherwise:
 *
 *     adjusted_value = current_value * (1 + rarityWeight * normalized_idf * uncertainty)
 *
 * **The default is 0, and 0 is an exact identity** (`adjusted === value`, bit for bit — the early return is
 * the guarantee, not an optimisation: `value * (1 + 0 * x * y)` is NaN when x or y is not finite). The feature
 * therefore ships inert, and `element_stats.test.ts` regression-tests that fact over a spread of inputs. It
 * stays 0 until `npm run harness -- --sweep` produces evidence for a different number; per CLAUDE.md, selector
 * parameters are decided by the harness and never by argument.
 *
 * Note the shape of the arithmetic: rarity only SCALES a value that already reflects uncertainty and
 * consequence. It cannot raise a value from zero, and it is multiplied by `uncertainty`, so a decision we are
 * already confident about gets no boost from being unusual. Rarity must never decide a question alone — an
 * exotic choice nobody is unsure about is trivia, not a card.
 */
export function adjustValueByRarity(value: number, normalizedIdf: number, uncertainty: number, rarityWeight = 0): number {
  if (rarityWeight === 0) return value;
  return value * (1 + rarityWeight * normalizedIdf * uncertainty);
}

// ---------------------------------------------------------------------------
// Catalog gap signals — a REVIEW artifact
// ---------------------------------------------------------------------------

export const GAP_KINDS = ["unobservable_node", "fragmented_options", "dead_option", "no_real_choice"] as const;
export type GapKind = (typeof GAP_KINDS)[number];

export interface CatalogGapSignal {
  kind: GapKind;
  node_id: string;
  /** the element the signal is about, when it is about one option rather than the whole node */
  option_id: string | null;
  archetype: string | null;
  source_kind: string | null;
  rows: number;
  eligible_documents: number;
  unobserved_rate: number;
  /** review ORDERING in [0,1] — not a probability of anything */
  score: number;
  why: string;
}

export interface GapOptions {
  /** below this many rows in the (stratum, node) group nothing is reported. Default 10 (the reporting floor). */
  minRows?: number;
  /** `unobservable_node` fires at or above this unobserved rate. Default 0.8. */
  highUnobserved?: number;
  /** `fragmented_options` fires when the node's LARGEST prevalence is below this. Default 0.4. */
  fragmentedMax?: number;
  /** a node needs at least this many options before fragmentation means anything. Default 3. */
  minOptionsForFragmentation?: number;
  rarity?: Partial<RarityCutPoints>;
  /**
   * rows per (stratum, node), keyed by `stratumNodeKey`. `elementStatsReport` supplies it. Without it, rows
   * are recovered as `eligible / (1 - unobserved_rate)` — exact by construction, except when the unobserved
   * rate is 1, where the row count is unrecoverable from `ElementStat` alone and the group is skipped.
   */
  rowsByNode?: ReadonlyMap<string, number>;
}

interface NodeGroup {
  archetype: string | null;
  source_kind: string | null;
  node_id: string;
  stats: ElementStat[];
  eligible: number;
  unobserved_rate: number;
  rows: number;
}

function groupByNode(stats: readonly ElementStat[], rowsByNode?: ReadonlyMap<string, number>): NodeGroup[] {
  const groups = new Map<string, NodeGroup>();
  for (const s of stats) {
    const el = parseElementKey(s.key);
    const nodeId = el?.node_id ?? s.node_id;
    const k = stratumNodeKey(s.archetype, s.source_kind, nodeId);
    let g = groups.get(k);
    if (!g) {
      g = { archetype: s.archetype, source_kind: s.source_kind, node_id: nodeId, stats: [], eligible: 0, unobserved_rate: 0, rows: 0 };
      groups.set(k, g);
    }
    g.stats.push(s);
    // every option of a node shares the node's eligible count and unobserved rate; max is defensive
    g.eligible = Math.max(g.eligible, s.eligible_documents);
    g.unobserved_rate = Math.max(g.unobserved_rate, s.unobserved_rate);
  }
  for (const [k, g] of groups) {
    const given = rowsByNode?.get(k);
    g.rows = given ?? (g.unobserved_rate < 1 ? Math.round(g.eligible / (1 - g.unobserved_rate)) : 0);
  }
  return [...groups.values()];
}

/**
 * Patterns that suggest the CATALOG is wrong, not that the population is interesting. This is a review list a
 * human reads before editing `catalogs/*.json`; nothing here edits anything, and nothing downstream consumes
 * it. (The same discipline as `hardCandidates` in `design_graph.ts`: statistics may propose, only a person
 * disposes.)
 *
 *   unobservable_node   the node applied to plenty of rows and was observed in almost none. Either the real
 *                       decision is not in the option set, or the lexicon cannot see it. Both are catalog work.
 *                       Its extreme — a node observed with NO option anywhere — has no element rows to group,
 *                       so it is recovered from `rowsByNode`. It is also the most important signal in the
 *                       list, which is exactly why it must not be able to vanish by having nothing to say.
 *   fragmented_options  no option reaches 40% across three or more options — the node may be splitting one
 *                       real decision into near-synonyms, or missing the umbrella option people actually pick.
 *   dead_option         an option the catalog offers that nobody chose, in a stratum big enough to have shown
 *                       it. In a stratum this can be honest specialisation; in the POOLED row it means nobody,
 *                       anywhere, ever picked it.
 *   no_real_choice      one option at >= 95%: the node is asking a settled question. Spending a card on it
 *                       costs one of the twelve — unless the alternatives are simply undetectable, which is a
 *                       lexicon bug wearing the same clothes. Check before deleting.
 */
export function catalogGapSignals(stats: readonly ElementStat[], opts: GapOptions = {}): CatalogGapSignal[] {
  const minRows = opts.minRows ?? DEFAULT_THRESHOLDS.reportMinN;
  const highUnobserved = opts.highUnobserved ?? 0.8;
  const fragmentedMax = opts.fragmentedMax ?? 0.4;
  const minOptions = opts.minOptionsForFragmentation ?? 3;
  const cuts = { ...DEFAULT_RARITY, ...(opts.rarity ?? {}) };
  const out: CatalogGapSignal[] = [];
  // confidence in a signal grows with the sample behind it and saturates — a review ordering, not an estimate
  const conf = (n: number) => n / (n + minRows);

  const groups = groupByNode(stats, opts.rowsByNode);
  const seen = new Set(groups.map((g) => stratumNodeKey(g.archetype, g.source_kind, g.node_id)));
  // A node with no element rows at all was never observed with ANY option — total blindness, which is the
  // strongest form of `unobservable_node` and the one a stats-only grouping cannot see.
  for (const [k, rows] of opts.rowsByNode ?? []) {
    if (seen.has(k) || rows < minRows) continue;
    const parsed = parseStratumNodeKey(k);
    if (!parsed) continue;
    groups.push({ ...parsed, stats: [], eligible: 0, unobserved_rate: 1, rows });
  }

  for (const g of groups) {
    if (g.rows < minRows) continue;
    const scope = stratumLabel(g.archetype, g.source_kind);
    const base = {
      node_id: g.node_id,
      archetype: g.archetype,
      source_kind: g.source_kind,
      rows: g.rows,
      eligible_documents: g.eligible,
      unobserved_rate: g.unobserved_rate,
    };

    if (g.unobserved_rate >= highUnobserved) {
      out.push({
        ...base,
        kind: "unobservable_node",
        option_id: null,
        score: g.unobserved_rate * conf(g.rows),
        why: `[${scope}] ${g.node_id} applied to ${g.rows} rows but was observed in only ${g.eligible} (${(g.unobserved_rate * 100).toFixed(0)}% unobserved). Either the choice these products actually make is not among the options, or no lexicon feature can see it — never read this as evidence of absence.`,
      });
    }

    if (g.eligible >= cuts.minEligible) {
      const ranked = [...g.stats].sort((a, b) => b.prevalence - a.prevalence || a.option_id.localeCompare(b.option_id));
      const top = ranked[0]!;
      if (ranked.length >= minOptions && top.prevalence < fragmentedMax) {
        out.push({
          ...base,
          kind: "fragmented_options",
          option_id: null,
          score: (1 - top.prevalence) * conf(g.eligible) * 0.8,
          why: `[${scope}] no option of ${g.node_id} reaches ${(fragmentedMax * 100).toFixed(0)}% across ${ranked.length} options (top: ${top.option_id} at ${(top.prevalence * 100).toFixed(0)}% of ${g.eligible} eligible rows). The option set may be splitting one decision, or missing the choice people actually make.`,
        });
      }
      if (top.prevalence >= cuts.universalAtOrAbove) {
        out.push({
          ...base,
          kind: "no_real_choice",
          option_id: top.option_id,
          score: top.prevalence * conf(g.eligible) * 0.4,
          why: `[${scope}] ${top.observed_documents}/${g.eligible} of the rows that decided ${g.node_id} chose ${top.option_id}. Either the node is asking a settled question, or the alternatives are undetectable — check the lexicon before touching the catalog.`,
        });
      }
      for (const s of ranked) {
        if (s.observed_documents !== 0) continue;
        out.push({
          ...base,
          kind: "dead_option",
          option_id: s.option_id,
          score: conf(g.eligible) * 0.6 * (g.archetype === null && g.source_kind === null ? 1 : 0.5),
          why: `[${scope}] ${s.key} was never observed in ${g.eligible} rows that decided ${g.node_id}.${g.archetype === null && g.source_kind === null ? " Pooled across every stratum: nobody chose it anywhere." : " Within one stratum this can be honest specialisation — read the pooled row before concluding anything."}`,
        });
      }
    }
  }

  return out.sort(
    (a, b) => b.score - a.score || a.node_id.localeCompare(b.node_id) || (a.option_id ?? "").localeCompare(b.option_id ?? "") || stratumLabel(a.archetype, a.source_kind).localeCompare(stratumLabel(b.archetype, b.source_kind)),
  );
}

// ---------------------------------------------------------------------------
// Computing the stats
// ---------------------------------------------------------------------------

export interface ElementStatsOptions {
  /** rarity floor + cut-points (`minEligible` also gates `classifyRarity`) */
  rarity?: Partial<RarityCutPoints>;
  /** emit the pooled view (always labelled `archetype: null, source_kind: null`). Default false. */
  pooled?: boolean;
  /** node → catalog options, so an option nobody chose still gets an explicit zero row */
  seedOptions?: ReadonlyMap<string, Iterable<string>> | Record<string, readonly string[]>;
  gaps?: GapOptions;
}

export interface StratumSummary {
  archetype: string | null;
  source_kind: string | null;
  rows: number;
  nodes: number;
  elements: number;
}

export interface ElementStatsMeta {
  rows: number;
  strata: StratumSummary[];
  pooled_included: boolean;
  cut_points: RarityCutPoints;
  /** structural problems found in the produced stats — surfaced, never swallowed */
  issues: string[];
}

export interface ElementStatsResult {
  byStratum: ElementStat[];
  /** always COMPUTED (`archetype_lift` is defined against it); emitted only when `opts.pooled` */
  pooled: ElementStat[];
  meta: ElementStatsMeta;
}

function statsForStratum(
  archetype: string | null,
  source_kind: string | null,
  tallied: { nodes: Map<string, NodeCounts>; rows: number },
  universe: Map<string, Set<string>>,
  pooledPrevalence: Map<string, number> | null,
): ElementStat[] {
  const out: ElementStat[] = [];
  for (const nodeId of [...universe.keys()].sort()) {
    const counts = tallied.nodes.get(nodeId);
    if (!counts || counts.rows === 0) continue; // the node never applied in this stratum — say nothing at all
    const unobserved_rate = counts.rows > 0 ? (counts.unobserved + counts.conflict) / counts.rows : 0;
    for (const option of [...universe.get(nodeId)!].sort()) {
      const observed = counts.byOption.get(option) ?? 0;
      const prevalence = prevalenceOf(counts.eligible, observed);
      const key = elementKey(nodeId, option);
      const pooledP = pooledPrevalence?.get(key);
      out.push(
        ElementStatSchema.parse({
          key,
          node_id: nodeId,
          option_id: option,
          archetype,
          source_kind,
          eligible_documents: counts.eligible,
          observed_documents: observed,
          prevalence,
          entropy: binaryEntropy(prevalence),
          idf: elementIdf(counts.eligible, observed),
          unobserved_rate: Math.min(1, Math.max(0, unobserved_rate)),
          // A lift needs both a numerator we believe and a denominator that exists. No eligible rows in this
          // stratum means we have no numerator (prevalence 0 is a placeholder, not a measurement), and a
          // pooled prevalence of 0 would divide by zero — both are `null`, never a fabricated ratio.
          archetype_lift: archetype === null || counts.eligible === 0 || pooledP === undefined || pooledP === 0 ? null : prevalence / pooledP,
        }),
      );
    }
  }
  return out;
}

/**
 * Decision rows → per-stratum (and pooled) element statistics.
 *
 * Order of operations matters: the POOLED figures are computed first, because `archetype_lift` is a ratio
 * against them. That is the only thing pooled numbers are used for unless the caller opts in to seeing them.
 */
export function elementStats(rows: readonly DecisionRow[], opts: ElementStatsOptions = {}): ElementStatsResult {
  const all = [...rows];
  const universe = optionUniverse(all, opts.seedOptions);
  const cut_points = { ...DEFAULT_RARITY, ...(opts.rarity ?? {}) };

  const pooledTally = tallyStratum(all);
  const pooled = statsForStratum(null, null, pooledTally, universe, null);
  const pooledPrevalence = new Map(pooled.map((s) => [s.key, s.prevalence]));

  const byStratumRows = new Map<string, DecisionRow[]>();
  for (const r of all) {
    const k = `${r.archetype}|${r.source_kind}`;
    (byStratumRows.get(k) ?? byStratumRows.set(k, []).get(k)!).push(r);
  }

  const byStratum: ElementStat[] = [];
  const strata: StratumSummary[] = [];
  for (const k of [...byStratumRows.keys()].sort()) {
    const group = byStratumRows.get(k)!;
    const archetype = group[0]!.archetype;
    const source_kind = group[0]!.source_kind;
    const tallied = tallyStratum(group);
    const stats = statsForStratum(archetype, source_kind, tallied, universe, pooledPrevalence);
    byStratum.push(...stats);
    strata.push({ archetype, source_kind, rows: group.length, nodes: tallied.nodes.size, elements: stats.length });
  }

  const issues: string[] = [];
  for (const s of [...byStratum, ...pooled]) for (const i of elementStatIssues(s)) issues.push(`${statKey(s)}: ${i}`);

  return {
    byStratum,
    pooled,
    meta: { rows: all.length, strata, pooled_included: opts.pooled === true, cut_points, issues: [...new Set(issues)].sort() },
  };
}

/** rows per (stratum, node) — what `catalogGapSignals` needs and cannot recover from `ElementStat` alone. */
function rowsByNodeIndex(rows: readonly DecisionRow[]): Map<string, number> {
  const out = new Map<string, number>();
  const bump = (archetype: string | null, source_kind: string | null, nodeId: string) => {
    const k = stratumNodeKey(archetype, source_kind, nodeId);
    out.set(k, (out.get(k) ?? 0) + 1);
  };
  for (const r of rows) {
    for (const nodeId of Object.keys(r.cells)) {
      bump(r.archetype, r.source_kind, nodeId);
      bump(null, null, nodeId);
    }
  }
  return out;
}

export interface ElementStatsReport {
  byStratum: ElementStat[];
  /** empty unless `opts.pooled` — the pooled view is opt-in (spec rules 9/10) */
  pooled: ElementStat[];
  gaps: CatalogGapSignal[];
  rarity: RarityLabel[];
  meta: ElementStatsMeta;
}

/**
 * The whole artifact: stratified stats, the opt-in pooled view, rarity labels and the catalog-gap review list.
 *
 * Gap signals are computed against the strata AND the pooled figures even when the pooled view is not emitted,
 * because "nobody anywhere chose this option" is a fact only the pooled row can state. Every such signal
 * carries `archetype: null, source_kind: null` and prints as `POOLED/POOLED`, so the pooling is labelled
 * rather than silent — which is the actual rule.
 */
export function elementStatsReport(rows: readonly DecisionRow[], opts: ElementStatsOptions = {}): ElementStatsReport {
  const { byStratum, pooled, meta } = elementStats(rows, opts);
  const gaps = catalogGapSignals([...byStratum, ...pooled], {
    ...(opts.gaps ?? {}),
    rarity: { ...(opts.rarity ?? {}), ...(opts.gaps?.rarity ?? {}) },
    rowsByNode: opts.gaps?.rowsByNode ?? rowsByNodeIndex(rows),
  });
  const emittedPooled = opts.pooled ? pooled : [];
  return {
    byStratum,
    pooled: emittedPooled,
    gaps,
    rarity: rarityLabels([...byStratum, ...emittedPooled], opts.rarity ?? {}),
    meta,
  };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export function renderElementStatsReport(report: ElementStatsReport): string {
  const L: string[] = [];
  const c = report.meta.cut_points;
  L.push(`# design-element statistics`);
  L.push("");
  L.push(`${report.meta.rows} decision rows · ${report.meta.strata.length} strata · ${report.byStratum.length} stratified element rows`);
  L.push(`rarity floor: ${c.minEligible} eligible documents · rare <${pct(c.rareBelow)} · uncommon <${pct(c.uncommonBelow)} · universal ≥${pct(c.universalAtOrAbove)}`);
  L.push(`idf = log((eligible + 1) / (observed + 1)) + 1 · entropy = binary, in bits`);
  L.push("");
  L.push("Denominators contain ONLY rows where the node was observed with some option. An unobserved or");
  L.push("conflicting cell is in no numerator and no denominator; the silence is reported separately as");
  L.push("`unobserved` below and is never evidence that a decision was not made.");
  L.push("");

  L.push("## strata (never pooled unless labelled POOLED)");
  L.push("");
  L.push(`  ${"scope".padEnd(30)} ${"rows".padStart(6)} ${"nodes".padStart(6)} ${"elements".padStart(9)}`);
  for (const s of report.meta.strata) {
    L.push(`  ${stratumLabel(s.archetype, s.source_kind).padEnd(30)} ${String(s.rows).padStart(6)} ${String(s.nodes).padStart(6)} ${String(s.elements).padStart(9)}`);
  }
  L.push("");

  const counts: Record<string, number> = {};
  for (const r of report.rarity) counts[r.rarity] = (counts[r.rarity] ?? 0) + 1;
  L.push("## rarity");
  L.push("");
  for (const k of RARITIES) L.push(`  ${k.padEnd(16)} ${String(counts[k] ?? 0).padStart(5)}`);
  L.push(`  (\`not_estimable\` = fewer than ${c.minEligible} eligible documents. It is a real answer, not a missing one.)`);
  L.push("");

  const estimable = report.byStratum.filter((s) => s.eligible_documents >= c.minEligible);
  const rarest = [...estimable].sort((a, b) => b.idf - a.idf || a.key.localeCompare(b.key)).slice(0, 20);
  L.push(`## rarest estimable elements (highest idf, ≥ ${c.minEligible} eligible)`);
  L.push("");
  L.push(`  ${"scope".padEnd(26)} ${"element".padEnd(46)} ${"obs/elig".padStart(10)} ${"prev".padStart(7)} ${"idf".padStart(6)} ${"bits".padStart(6)} ${"lift".padStart(6)} ${"unobs".padStart(7)}`);
  for (const s of rarest) {
    L.push(
      `  ${stratumLabel(s.archetype, s.source_kind).padEnd(26)} ${s.key.slice(0, 46).padEnd(46)} ${`${s.observed_documents}/${s.eligible_documents}`.padStart(10)} ${pct(s.prevalence).padStart(7)} ${s.idf.toFixed(3).padStart(6)} ${s.entropy.toFixed(3).padStart(6)} ${(s.archetype_lift === null ? "n/a" : s.archetype_lift.toFixed(2)).padStart(6)} ${pct(s.unobserved_rate).padStart(7)}`,
    );
  }
  if (!rarest.length) L.push("  (nothing clears the eligibility floor)");
  L.push("");
  L.push(`  lift = this stratum's prevalence ÷ the POOLED prevalence of the same element; n/a when the pooled`);
  L.push(`  figure is zero or this stratum has no eligible rows.`);
  L.push("");

  L.push(`## catalog gap signals — review only, nothing here edits a catalog: ${report.gaps.length}`);
  L.push("");
  if (!report.gaps.length) L.push("  (no pattern clears the floor)");
  for (const g of report.gaps.slice(0, 25)) {
    L.push(`  ${g.kind.padEnd(20)} ${g.option_id ? g.node_id + "=" + g.option_id : g.node_id}   score ${g.score.toFixed(3)}`);
    L.push(`      ${g.why}`);
  }
  if (report.gaps.length > 25) L.push(`  … ${report.gaps.length - 25} more`);
  L.push("");
  L.push("  To act on one, a human edits catalogs/*.json or the lexicon. Nothing in this file does it.");
  L.push("");

  if (report.meta.pooled_included) {
    L.push(`## POOLED across every archetype and source kind: ${report.pooled.length} elements`);
    L.push("");
    L.push("  Read the strata first. A pooled prevalence mixes populations with different compositions and can");
    L.push("  disagree in sign with every stratum it is made of (see `detectSimpsons` in design_graph.ts).");
    L.push("");
    L.push(`  ${"element".padEnd(50)} ${"obs/elig".padStart(10)} ${"prev".padStart(7)} ${"idf".padStart(6)} ${"unobs".padStart(7)}`);
    for (const s of [...report.pooled].sort((a, b) => b.observed_documents - a.observed_documents || a.key.localeCompare(b.key)).slice(0, 40)) {
      L.push(`  ${s.key.slice(0, 50).padEnd(50)} ${`${s.observed_documents}/${s.eligible_documents}`.padStart(10)} ${pct(s.prevalence).padStart(7)} ${s.idf.toFixed(3).padStart(6)} ${pct(s.unobserved_rate).padStart(7)}`);
    }
    if (report.pooled.length > 40) L.push(`  … ${report.pooled.length - 40} more`);
    L.push("");
  }

  if (report.meta.issues.length) {
    L.push(`## structural issues in the produced stats: ${report.meta.issues.length}`);
    for (const i of report.meta.issues) L.push(`  - ${i}`);
    L.push("");
  }
  return L.join("\n");
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export const ELEMENT_STATS_USAGE = `mine:elements — decision matrix → design-element prevalence, rarity and IDF

  npm run mine:elements -- --matrix <decision-rows.jsonl> [--out <dir>] [--min-eligible N] [--pooled]

  --matrix        JSONL written by \`npm run mine:matrix\` (one decision row per line)
  --out           output directory (default mining-results)
  --min-eligible  eligible-document floor below which rarity is \`not_estimable\` (default ${DEFAULT_RARITY.minEligible})
  --pooled        also emit the POOLED view (labelled archetype: null, source_kind: null)

  Writes elements.json and elements-report.md. No LLM calls, no network, no catalog edits.`;

const ELEMENT_STATS_FLAGS = { value: ["--matrix", "--out", "--min-eligible"], boolean: ["--pooled"] } as const;

export interface ElementStatsArgs {
  matrix: string;
  out: string;
  minEligible: number;
  pooled: boolean;
}

export function parseElementStatsArgs(argv: string[]): ElementStatsArgs {
  const flags = parseFlags(argv, ELEMENT_STATS_FLAGS);
  const matrix = flags.value("--matrix");
  if (!matrix) throw new UsageError("pass --matrix <decision-rows.jsonl>");
  const minEligible = Number(flags.value("--min-eligible", String(DEFAULT_RARITY.minEligible)));
  if (!Number.isFinite(minEligible) || minEligible < 0) throw new UsageError("--min-eligible must be a non-negative number");
  return { matrix, out: flags.value("--out", "mining-results"), minEligible, pooled: flags.has("--pooled") };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  if (helpRequested(argv)) {
    console.log(ELEMENT_STATS_USAGE);
    process.exit(0);
  }
  let args: ElementStatsArgs;
  try {
    args = parseElementStatsArgs(argv);
  } catch (e) {
    console.error(`${(e as Error).message}\n\n${ELEMENT_STATS_USAGE}`);
    process.exit(2);
  }

  const text = await fs.readFile(args.matrix, "utf8");
  const { rows, errors } = parseJsonl<DecisionRow>(text, (v) => DecisionRowSchema.parse(v));
  for (const e of errors) console.error(`  parse: ${e}`);
  if (!rows.length) {
    console.error(`no decision rows in ${args.matrix}`);
    process.exit(1);
  }

  const report = elementStatsReport(rows, { rarity: { minEligible: args.minEligible }, pooled: args.pooled });
  console.log(`\n${renderElementStatsReport(report)}\n`);

  await fs.mkdir(args.out, { recursive: true });
  const elementsFile = path.join(args.out, "elements.json");
  const reportFile = path.join(args.out, "elements-report.md");
  await fs.writeFile(
    elementsFile,
    `${JSON.stringify(
      {
        schema: "zadum.element-stats.v1",
        source: path.resolve(args.matrix),
        rows: report.meta.rows,
        cut_points: report.meta.cut_points,
        pooled_included: report.meta.pooled_included,
        strata: report.meta.strata,
        elements: report.byStratum,
        pooled: report.pooled,
        rarity: report.rarity,
        gaps: report.gaps,
        issues: report.meta.issues,
      },
      null,
      2,
    )}\n`,
  );
  await fs.writeFile(reportFile, `${renderElementStatsReport(report)}\n`);
  console.log(`written ${elementsFile} and ${reportFile}`);
}
