/**
 * Evidence layer, part 3 — the **labeller**: one row of the evidence matrix per document.
 *
 * A cell records WHAT THE LABELLER SAW, not what is true about the app:
 *   present     — positive evidence, with a quoted snippet from the document.
 *   absent      — a declared place where this feature WOULD have shown up was inspected and was empty.
 *   unobserved  — neither. The artifact is silent, and silence carries no signal here.
 *
 * The whole design exists to keep `absent` mechanical rather than a judgement call, because `absent` is the
 * expensive claim: it is the cell that would later become a prior saying "apps like this don't do X". Three
 * rules, all enforced in CODE after the model answers, never merely asked for in the prompt:
 *
 *   0. Undetectable by construction. If the feature declares no witness locus for this document type, it is
 *      never sent to the model at all and its cell is `unobserved` with reason `undetectable_in_doc_type`.
 *   1. Witness loci. `absent` survives only if the model names at least one locus that is BOTH declared by
 *      the lexicon entry for this document type AND actually present in the digest. Anything else is a claim
 *      about a place the labeller could not have looked → downgraded to `unobserved`.
 *   2. Parent context. `absent` survives only if the feature's category was discussed at all — one of the
 *      category's `context_loci` is present in the digest. A spec with a Payments section that never mentions
 *      refunds is meaningful absence; a spec with no payments section is `unobserved` for refunds.
 *
 * And one rule on the cheap claim: `present` without a quote is not evidence, so it is downgraded too.
 *
 * **No verbalised confidence numbers.** The model returns discrete verdicts, quotes, and which loci it
 * checked. Probabilities are computed later from counts across documents — never asked for from the model.
 * (This repo already measured its own verbalised-confidence pipeline as not yet epistemically usable; see
 * docs/STATUS.md on recalibration.json.)
 *
 * CLI: npm run label -- --doc-type spec_doc [--limit 10] [--all] [--mock] [--dry-run]
 *                       [--yes-spend] [--out mining-results]
 */
import "../env.js";
import { z } from "zod";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { helpRequested, parseFlags, UsageError } from "../cli/flags.js";
import { parallelMap, type LLM, type LLMUsage } from "../llm/client.js";
import {
  categoriesById,
  detectableIn,
  loadValidatedLexicon,
  type DocType,
  type Lexicon,
  type LexiconEntry,
} from "./lexicon.js";
import type { Digest } from "./condense.js";
import { OUTPUT_TOKENS_PER_CALL } from "./corpus.js";

// ---------- output schema (ADR-011 conservative subset: flat objects, every field present, no optional/records) ----------

export const VERDICTS = ["present", "absent", "unobserved"] as const;
export type Verdict = (typeof VERDICTS)[number];

export const LabelBatchSchema = z.object({
  labels: z.array(
    z.object({
      feature_id: z.string(),
      verdict: z.enum(VERDICTS),
      /** verbatim quote ≤200 chars; required for `present`, "" otherwise */
      evidence: z.string(),
      /** locus ids from the closed vocabulary that were actually inspected for this feature */
      loci_checked: z.array(z.string()),
    }),
  ),
});
export type LabelBatch = z.infer<typeof LabelBatchSchema>;

export const MAX_EVIDENCE_CHARS = 200;

// ---------- prompt ----------

export const LABEL_SYSTEM = `You inspect ONE software artifact and record, for each listed feature, WHAT YOU SAW — not what you believe about the app.

Three verdicts, and only three:
- "present": you found positive evidence in the artifact. You MUST quote it verbatim in "evidence" (≤200 characters, copied exactly from the ARTIFACT text below).
- "absent": you inspected the declared places where this feature would have shown up, those places ARE in this artifact, and they were empty. This is a claim about the artifact, not about the app: only record it when you actually looked somewhere real. List the loci you inspected in "loci_checked".
- "unobserved": neither. The artifact is silent, or the places that would reveal this feature are not in this artifact at all. Silence is not a negative — it is a missing observation. When in doubt, "unobserved".

Rules:
- Judge EVERY feature in the FEATURES list exactly once, using the exact feature_id given. Never invent feature ids and never add features.
- "loci_checked" must contain ONLY locus ids that appear in the AVAILABLE LOCI list of this artifact, and only ones listed for that feature. An empty list is honest and fine when the verdict is "unobserved".
- Evidence must be a verbatim substring of the artifact — a line of code, a dependency name, a schema column, a sentence of prose. Never paraphrase, never invent, never quote your own reasoning. For "absent" and "unobserved", leave evidence as "".
- Do NOT infer from what is typical for this kind of app, from framework defaults, or from what a library "usually" implies. A payment library in a manifest is evidence that payments exist; it is NOT evidence for refunds, deposits, or tax rules.
- Do NOT output confidence numbers, probabilities, or hedging language anywhere. The verdict and the quote are the whole answer.

Be conservative. A wrong "present" pollutes the matrix; a wrong "absent" poisons it.`;

export function renderFeatureList(features: LexiconEntry[], docType: DocType): string {
  return features
    .map((f) => `- ${f.id} [${f.category}] ${f.label}\n    loci that would reveal it: ${f.loci[docType].join(", ")}`)
    .join("\n");
}

export const ARTIFACT_MARKER = "===== ARTIFACT =====\n";
/** Opening bytes of the per-batch question block — the seam between the cacheable prefix and the varying ask. */
export const FEATURES_MARKER = "FEATURES TO JUDGE (";

/**
 * The STABLE half of the user turn: everything that depends only on the document. Identical bytes for every
 * batch of the same digest, which is precisely what makes it cacheable (`LLMRequest.userPrefix`) — one 20k
 * artifact is billed at full price once and read back at ~0.1x for the remaining 4-5 batches.
 *
 * Do not interpolate anything batch-dependent, a clock, or a counter in here. `label.test.ts` asserts
 * byte-identity across two different batches of one digest, because a single differing byte turns the whole
 * scheme into a series of cache WRITES (1.25x) and would cost more than not caching at all.
 */
export function renderLabelPrefix(digest: Digest): string {
  return [
    `DOCUMENT TYPE: ${digest.doc_type}`,
    `DOCUMENT ID: ${digest.doc_id}`,
    `ARCHETYPE: ${digest.archetype}`,
    `AVAILABLE LOCI (these parts of the artifact are included below and were inspected):\n${digest.available_loci.map((l) => `  - ${l}`).join("\n")}`,
    `${ARTIFACT_MARKER}${digest.text}`,
  ].join("\n\n");
}

/** The VARYING half: which features this batch asks about. Changes every call, so it must come last. */
export function renderLabelQuestion(features: LexiconEntry[], docType: DocType): string {
  return `${FEATURES_MARKER}${features.length}):\n${renderFeatureList(features, docType)}`;
}

/**
 * The whole user turn, prefix then question.
 *
 * ORDER CHANGED 2026-08-26, deliberately: the artifact used to come LAST, after the per-batch feature list.
 * That made prompt caching impossible — caching is a prefix match, so a feature list that varies per batch
 * sitting in front of the constant artifact invalidated the prefix on every one of the 5-6 calls a document
 * costs. Artifact first, question last also happens to be the better prompt shape (the ask is adjacent to
 * the answer). CAVEAT: prompt position can shift model behaviour, so label quality — the `present` rate and
 * especially the quote-verbatim rate — should be spot-checked against a pre-change run rather than assumed
 * unchanged. This function stays the concatenation so the mock and the tests have one format to pin.
 */
export function renderLabelPrompt(digest: Digest, features: LexiconEntry[]): string {
  return `${renderLabelPrefix(digest)}\n\n${renderLabelQuestion(features, digest.doc_type)}`;
}

// ---------- what to ask about ----------

/**
 * Features worth spending prompt on: detectable in this document type AND with at least one declared witness
 * locus actually present in the digest. Everything else is `unobserved` before the model is consulted —
 * which is both cheaper and more honest than asking and discarding.
 */
export function askableFeatures(lex: Lexicon, digest: Digest): LexiconEntry[] {
  const available = new Set(digest.available_loci);
  return detectableIn(lex, digest.doc_type).filter((f) => f.loci[digest.doc_type].some((l) => available.has(l)));
}

export const DEFAULT_BATCH_SIZE = 45;

/**
 * Batch by category, never splitting one: rule 2 is a category-level judgement, so a category should be
 * weighed as a whole. Categories are added to a batch until it would exceed `maxPerBatch`; a category larger
 * than the cap becomes its own batch. Deterministic (lexicon order).
 */
export function batchFeatures(features: LexiconEntry[], maxPerBatch: number = DEFAULT_BATCH_SIZE): LexiconEntry[][] {
  const byCategory = new Map<string, LexiconEntry[]>();
  for (const f of features) (byCategory.get(f.category) ?? byCategory.set(f.category, []).get(f.category)!).push(f);
  const batches: LexiconEntry[][] = [];
  let current: LexiconEntry[] = [];
  for (const group of byCategory.values()) {
    if (current.length && current.length + group.length > maxPerBatch) {
      batches.push(current);
      current = [];
    }
    current.push(...group);
  }
  if (current.length) batches.push(current);
  return batches;
}

// ---------- the rules, enforced in code ----------

export type DowngradeReason =
  | "undetectable_in_doc_type"
  | "feature_not_asked"
  | "no_answer_from_model"
  | "present_without_evidence"
  | "evidence_not_in_artifact"
  | "no_declared_locus_inspected"
  | "category_not_discussed";

export interface Cell {
  feature_id: string;
  category: string;
  verdict: Verdict;
  /** what the model said before the rules were applied ("" when it was never asked) */
  raw_verdict: Verdict | "";
  evidence: string;
  loci_checked: string[];
  downgrade_reason: DowngradeReason | null;
}

/** Rule 2, as a set test: was this feature's category discussed at all in this artifact? */
export function categoryDiscussed(lex: Lexicon, category: string, digest: Digest): boolean {
  const cat = categoriesById(lex).get(category);
  if (!cat) return false;
  const available = new Set(digest.available_loci);
  return cat.context_loci[digest.doc_type].some((l) => available.has(l));
}

export interface ApplyRulesOptions {
  /** verify a `present` quote really occurs in the artifact text (default true) */
  checkEvidenceSubstring?: boolean;
}

/**
 * Turn one raw model label into a cell, applying rules 0-2 and the evidence rule. `raw` is null when the
 * feature was never asked (rule 0, or the model omitted it).
 */
export function applyEvidenceRules(
  entry: LexiconEntry,
  raw: LabelBatch["labels"][number] | null,
  digest: Digest,
  lex: Lexicon,
  opts: ApplyRulesOptions = {},
): Cell {
  const base = { feature_id: entry.id, category: entry.category };
  const unobserved = (reason: DowngradeReason, rawVerdict: Verdict | "" = "", loci: string[] = []): Cell => ({
    ...base,
    verdict: "unobserved",
    raw_verdict: rawVerdict,
    evidence: "",
    loci_checked: loci,
    downgrade_reason: reason,
  });

  // rule 0 — no declarable locus in this document type: the labeller is never even asked
  if (!entry.detectable_in.includes(digest.doc_type)) return unobserved("undetectable_in_doc_type");
  if (!raw) return unobserved(askableFeatures(lex, digest).some((f) => f.id === entry.id) ? "no_answer_from_model" : "feature_not_asked");

  const declared = new Set(entry.loci[digest.doc_type]);
  const available = new Set(digest.available_loci);
  // only loci that are declared for this feature AND physically in the digest count as "inspected"
  const inspected = [...new Set(raw.loci_checked)].filter((l) => declared.has(l) && available.has(l)).sort();

  if (raw.verdict === "unobserved") return { ...base, verdict: "unobserved", raw_verdict: "unobserved", evidence: "", loci_checked: inspected, downgrade_reason: null };

  if (raw.verdict === "present") {
    const quote = raw.evidence.trim().slice(0, MAX_EVIDENCE_CHARS);
    if (!quote) return unobserved("present_without_evidence", "present", inspected);
    if ((opts.checkEvidenceSubstring ?? true) && !quoteOccurs(quote, digest.text)) return unobserved("evidence_not_in_artifact", "present", inspected);
    return { ...base, verdict: "present", raw_verdict: "present", evidence: quote, loci_checked: inspected, downgrade_reason: null };
  }

  // rule 1 — a negative needs a declared locus that was really there
  if (inspected.length === 0) return unobserved("no_declared_locus_inspected", "absent", []);
  // rule 2 — a negative needs its parent context
  if (!categoryDiscussed(lex, entry.category, digest)) return unobserved("category_not_discussed", "absent", inspected);
  return { ...base, verdict: "absent", raw_verdict: "absent", evidence: "", loci_checked: inspected, downgrade_reason: null };
}

/**
 * Lenient substring check: models normalise whitespace when quoting, and a digest joins files with newlines.
 * Collapse whitespace on both sides, then require containment. Not a similarity score — either the words are
 * there in order, or the quote is not from the artifact.
 */
export function quoteOccurs(quote: string, artifact: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const q = norm(quote);
  if (q.length < 8) return false;
  return norm(artifact).includes(q);
}

// ---------- labelling one document ----------

export interface DocumentLabels {
  doc_id: string;
  doc_type: DocType;
  archetype: string;
  run: number;
  model: string;
  lexicon_version: string;
  catalog_version: string;
  cells: Cell[];
  asked: number;
  calls: number;
  errors: string[];
  usage: LLMUsage;
  latency_ms: number;
  digest_tokens: number;
  available_loci: string[];
}

const NO_USAGE: LLMUsage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
const addUsage = (a: LLMUsage, b: LLMUsage): LLMUsage => ({
  input_tokens: a.input_tokens + b.input_tokens,
  output_tokens: a.output_tokens + b.output_tokens,
  cache_read_input_tokens: a.cache_read_input_tokens + b.cache_read_input_tokens,
  cache_creation_input_tokens: a.cache_creation_input_tokens + b.cache_creation_input_tokens,
});

export interface LabelOptions {
  run?: number;
  batchSize?: number;
  maxTokens?: number;
  /** distinguishes otherwise identical prompts, so a CachedLLM cannot fake run-to-run agreement */
  cacheSalt?: string;
  versions?: { lexicon: string; catalog: string };
  checkEvidenceSubstring?: boolean;
  log?: (s: string) => void;
}

/**
 * One document → one complete matrix row. Every lexicon feature gets a cell, including the ones never asked
 * about: a row with holes in it would silently change the denominator of every rate computed downstream.
 */
export async function labelDocument(llm: LLM, digest: Digest, lex: Lexicon, opts: LabelOptions = {}): Promise<DocumentLabels> {
  const log = opts.log ?? (() => {});
  const asked = askableFeatures(lex, digest);
  const batches = batchFeatures(asked, opts.batchSize ?? DEFAULT_BATCH_SIZE);
  const answers = new Map<string, LabelBatch["labels"][number]>();
  const errors: string[] = [];
  // Rendered ONCE, outside the loop: every batch must send the same bytes or the provider's prefix cache
  // never hits. Hoisting it is the cheapest possible guarantee of that.
  const userPrefix = renderLabelPrefix(digest);
  let usage = NO_USAGE;
  let latency = 0;
  let model = llm.models.strong;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]!;
    try {
      const res = await llm.structured({
        fn: "evidence_label",
        tier: "strong",
        system: LABEL_SYSTEM,
        userPrefix,
        user: renderLabelQuestion(batch, digest.doc_type),
        schema: LabelBatchSchema,
        effort: "medium",
        maxTokens: opts.maxTokens ?? 8000,
        ...(opts.cacheSalt ? { cacheSalt: opts.cacheSalt } : {}),
      });
      usage = addUsage(usage, res.usage);
      latency += res.latency_ms;
      model = res.model;
      const ids = new Set(batch.map((f) => f.id));
      for (const l of res.data.labels) if (ids.has(l.feature_id) && !answers.has(l.feature_id)) answers.set(l.feature_id, l);
      // Cache columns are logged per batch, not just totalled: the expected signature is "batch 1 writes,
      // batches 2+ read". A run where every batch shows `cache_r 0` means caching is NOT engaging (a prefix
      // that is not byte-identical, or a prefix below the model's minimum cacheable size) and the run is
      // paying the 1.25x write premium for nothing — which is invisible in a total.
      log(
        `  batch ${i + 1}/${batches.length} (${batch.length} features): ${res.data.labels.length} labels, ${res.usage.input_tokens}+${res.usage.output_tokens} tok, ` +
          `cache_w ${res.usage.cache_creation_input_tokens} cache_r ${res.usage.cache_read_input_tokens}`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`batch ${i + 1}: ${msg}`);
      log(`  batch ${i + 1}/${batches.length}: FAILED ${msg}`);
    }
  }

  const cells = lex.features.map((f) => applyEvidenceRules(f, answers.get(f.id) ?? null, digest, lex, { checkEvidenceSubstring: opts.checkEvidenceSubstring ?? true }));
  return {
    doc_id: digest.doc_id,
    doc_type: digest.doc_type,
    archetype: digest.archetype,
    run: opts.run ?? 1,
    model,
    lexicon_version: opts.versions?.lexicon ?? lex.version,
    catalog_version: opts.versions?.catalog ?? "",
    cells,
    asked: asked.length,
    calls: batches.length,
    errors,
    usage,
    latency_ms: latency,
    digest_tokens: digest.approx_tokens,
    available_loci: digest.available_loci,
  };
}

// ---------- per-row summary + cost ----------

export interface RowSummary {
  present: number;
  absent: number;
  unobserved: number;
  /** cells not `unobserved`, over all lexicon features */
  fill_rate: number;
  /** raw `absent` answers that survived rules 1 and 2 */
  absent_licensed: number;
  absent_raw: number;
  absent_licensing_rate: number;
  downgrades: Record<string, number>;
  /**
   * Share of this row's prompt tokens that were served from the provider's prompt cache — the number that
   * decides whether the artifact-first prompt order is actually paying for itself. `null`, never 0, when no
   * prompt tokens were counted at all (a mock run, an all-batches-failed row): a fabricated 0 would read as
   * "caching is broken" when the truth is "nothing was measured".
   */
  cache_hit_rate: number | null;
}

/**
 * cache_read / (cache_read + input + cache_creation) — i.e. over TOTAL prompt tokens, since `input_tokens` is
 * only the uncached remainder. Steady state for a 5-batch document is ~0.8 (one write, four reads).
 */
export function cacheHitRate(usage: LLMUsage): number | null {
  const total = usage.cache_read_input_tokens + usage.input_tokens + usage.cache_creation_input_tokens;
  return total === 0 ? null : usage.cache_read_input_tokens / total;
}

export function summarizeRow(row: DocumentLabels): RowSummary {
  const count = (v: Verdict) => row.cells.filter((c) => c.verdict === v).length;
  const absentRaw = row.cells.filter((c) => c.raw_verdict === "absent").length;
  const absentKept = count("absent");
  const downgrades: Record<string, number> = {};
  for (const c of row.cells) if (c.downgrade_reason) downgrades[c.downgrade_reason] = (downgrades[c.downgrade_reason] ?? 0) + 1;
  return {
    present: count("present"),
    absent: absentKept,
    unobserved: count("unobserved"),
    fill_rate: row.cells.length ? (count("present") + absentKept) / row.cells.length : 0,
    absent_licensed: absentKept,
    absent_raw: absentRaw,
    absent_licensing_rate: absentRaw ? absentKept / absentRaw : 0,
    downgrades,
    cache_hit_rate: cacheHitRate(row.usage),
  };
}

/**
 * Estimated list prices, USD per million tokens. Estimates for budgeting only — the run also reports raw
 * token counts, which are the ground truth. Override with ZADUM_PRICE_IN / ZADUM_PRICE_OUT.
 *
 * CORRECTED 2026-08-25. This table said $15/$75 for the Opus family, which was the pre-Opus-4.6 rate and is
 * **3x the current price** — it made every mining budget in this repo three times too pessimistic (a 110-repo
 * labelling run quoted at $256 actually costs ~$85). The Opus tier is $5/$25 and Sonnet 5 is $2/$10. These
 * are Anthropic first-party rates, which per Anthropic's pricing docs ALSO apply to Claude on Microsoft
 * Foundry (billed through the Microsoft Marketplace at standard API rates) — so the same numbers are correct
 * for this repo's `foundry-anthropic` provider, which is what the live runs actually use. Bedrock and Vertex
 * are partner-operated with their own pricing and are NOT covered by this table.
 *
 * Re-check these against the pricing page before quoting a figure to anyone; a stale price here is invisible
 * until someone makes a spending decision on it, which is exactly what happened.
 */
export const PRICE_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-opus-4-7": { input: 5, output: 25 },
  "claude-opus-4-6": { input: 5, output: 25 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-fable-5": { input: 10, output: 50 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

/**
 * Cache write and read multipliers on the input rate. Anthropic prices a 5-minute ephemeral cache write at
 * 1.25x the input rate and a read at 0.1x. Both are needed or the estimate is wrong in BOTH directions:
 * ignoring writes understates the first call, ignoring reads overstates every later one.
 */
export const CACHE_WRITE_MULTIPLIER = 1.25;
export const CACHE_READ_MULTIPLIER = 0.1;

/**
 * Cost from real token counts, INCLUDING the cache columns.
 *
 * This function was cache-blind until 2026-08-26, which stopped being harmless the moment the labeller
 * started caching its artifact prefix: a measured run printed $0.59 against a true $0.70, because 12,887
 * written and 64,435 read tokens were simply not counted. Under-reporting spend is the one direction an
 * estimator must never fail in — a budget is a promise to someone.
 */
export function estimateCost(model: string, usage: LLMUsage, env: NodeJS.ProcessEnv = process.env): number {
  const fallback = PRICE_PER_MTOK[model] ?? { input: 0, output: 0 };
  const input = env.ZADUM_PRICE_IN ? Number(env.ZADUM_PRICE_IN) : fallback.input;
  const output = env.ZADUM_PRICE_OUT ? Number(env.ZADUM_PRICE_OUT) : fallback.output;
  const cacheWrite = (usage.cache_creation_input_tokens / 1e6) * input * CACHE_WRITE_MULTIPLIER;
  const cacheRead = (usage.cache_read_input_tokens / 1e6) * input * CACHE_READ_MULTIPLIER;
  return (usage.input_tokens / 1e6) * input + (usage.output_tokens / 1e6) * output + cacheWrite + cacheRead;
}

export function totalUsage(rows: DocumentLabels[]): LLMUsage {
  return rows.reduce((u, r) => addUsage(u, r.usage), { ...NO_USAGE });
}

export { NO_USAGE, addUsage };

// ---------- corpus loading (shared with detectability.ts) ----------

const here = path.dirname(fileURLToPath(import.meta.url));
export const CORPUS_DIR = path.resolve(here, "../../corpus");

export interface ManifestEntry {
  file: string;
  archetype: string;
  id: string;
  source_url?: string;
  license?: string;
  notes?: string;
}

export async function loadManifest(corpusDir: string = CORPUS_DIR): Promise<ManifestEntry[]> {
  const raw = JSON.parse(await fs.readFile(path.join(corpusDir, "manifest.json"), "utf8")) as ManifestEntry[];
  return raw.map((e) => ({ ...e, id: e.id ?? path.basename(e.file) }));
}

/** owner/name from any of the shapes the manifest actually uses (bare URL, /tree/<ref>/<path>, "url (subdir)"). */
export function parseGithubRepo(sourceUrl: string | undefined): { owner: string; name: string } | null {
  if (!sourceUrl) return null;
  const m = /github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:[/#?)\s]|$)/.exec(sourceUrl.trim());
  if (!m) return null;
  return { owner: m[1]!, name: m[2]! };
}

// ---------- CLI ----------

interface Args {
  docType: DocType;
  limit: number;
  all: boolean;
  mock: boolean;
  dryRun: boolean;
  out: string;
  maxTokens: number;
  batchSize: number;
  concurrency: number;
  repoCache: string;
  model: string;
  yesSpend: boolean;
}

export const LABEL_USAGE = `label — turn condensed artifacts into evidence-backed feature rows

  npm run label -- [--doc-type repo|spec_doc] [--limit N | --all] [--mock] [--dry-run]
                    [--out <dir>] [--model <id>] [--max-digest-tokens N]
                    [--batch-size N] [--concurrency N] [--repo-cache <dir>] [--yes-spend]

  --mock       scripted labels, no credentials and no cost
  --dry-run    print document/call/token/cost estimates without calling a model
  --yes-spend  required for every non-mock, non-dry live run`;

const LABEL_FLAGS = {
  value: ["--doc-type", "--limit", "--out", "--max-digest-tokens", "--batch-size", "--concurrency", "--repo-cache", "--model"],
  boolean: ["--all", "--mock", "--dry-run", "--yes-spend"],
} as const;

export function parseArgs(argv: string[]): Args {
  const flags = parseFlags(argv, LABEL_FLAGS);
  if (flags.has("--all") && flags.has("--limit")) throw new UsageError("use either --limit or --all, not both");
  const dt = flags.value("--doc-type", "spec_doc");
  if (dt !== "repo" && dt !== "spec_doc") throw new UsageError(`--doc-type must be repo|spec_doc (got "${dt}")`);
  const parsed: Args = {
    docType: dt,
    limit: Number(flags.value("--limit", "10")),
    all: flags.has("--all"),
    mock: flags.has("--mock"),
    dryRun: flags.has("--dry-run"),
    out: flags.value("--out", "mining-results"),
    maxTokens: Number(flags.value("--max-digest-tokens", "38000")),
    batchSize: Number(flags.value("--batch-size", String(DEFAULT_BATCH_SIZE))),
    concurrency: Number(flags.value("--concurrency", "2")),
    repoCache: flags.value("--repo-cache", path.resolve(here, "../../.cache/repos")),
    model: flags.value("--model", "claude-opus-4-8"),
    yesSpend: flags.has("--yes-spend"),
  };
  for (const [name, value, min] of [
    ["--limit", parsed.limit, 1],
    ["--max-digest-tokens", parsed.maxTokens, 1],
    ["--batch-size", parsed.batchSize, 1],
    ["--concurrency", parsed.concurrency, 1],
  ] as const) {
    if (!Number.isInteger(value) || value < min) throw new UsageError(`${name} must be a whole number >= ${min}`);
  }
  return parsed;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  if (helpRequested(argv)) {
    console.log(LABEL_USAGE);
    process.exit(0);
  }
  let args: Args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    console.error(`${(e as Error).message}\n\n${LABEL_USAGE}`);
    process.exit(2);
  }
  if (!args.mock && !args.dryRun && !args.yesSpend) {
    console.error(`live labeling is blocked without --yes-spend\n\n${LABEL_USAGE}`);
    process.exit(2);
  }
  const { lexicon, catalogVersion } = await loadValidatedLexicon();
  const manifest = await loadManifest();
  const { condenseRepo, condenseSpecDoc, readRepoDir } = await import("./condense.js");

  let selected = manifest;
  if (args.docType === "repo") selected = manifest.filter((e) => parseGithubRepo(e.source_url));
  if (!args.all) selected = selected.slice(0, Math.max(1, args.limit));
  console.log(`lexicon ${lexicon.version} (${lexicon.features.length} features) · catalogs ${catalogVersion}`);
  console.log(`${selected.length} ${args.docType} documents${args.all ? " (--all)" : ` (--limit ${args.limit}; pass --all for the whole corpus)`}`);

  const digests: Digest[] = [];
  for (const e of selected) {
    if (args.docType === "spec_doc") {
      const text = await fs.readFile(path.join(CORPUS_DIR, e.file), "utf8");
      digests.push(condenseSpecDoc(e.id, text, { archetype: e.archetype, maxTokens: args.maxTokens }));
    } else {
      const repo = parseGithubRepo(e.source_url)!;
      const dir = path.join(args.repoCache, `${repo.owner}__${repo.name}`);
      const exists = await fs.stat(dir).then(() => true).catch(() => false);
      if (!exists) {
        console.log(`  skip ${e.id}: no local clone at ${dir} (clone it, or use \`npm run detectability\` which fetches)`);
        continue;
      }
      digests.push(condenseRepo(`${repo.owner}/${repo.name}`, await readRepoDir(dir), { archetype: e.archetype, maxTokens: args.maxTokens }));
    }
  }

  if (args.dryRun) {
    console.log(`\n${"document".padEnd(38)} ${"tok".padStart(6)} ${"asked".padStart(6)}  loci`);
    let asked = 0;
    for (const d of digests) {
      const a = askableFeatures(lexicon, d).length;
      asked += a;
      console.log(`${d.doc_id.slice(0, 38).padEnd(38)} ${String(d.approx_tokens).padStart(6)} ${String(a).padStart(6)}  ${d.available_loci.join(",")}`);
    }
    const calls = digests.reduce((n, d) => n + batchFeatures(askableFeatures(lexicon, d), args.batchSize).length, 0);
    const inTok = digests.reduce((n, d) => n + d.approx_tokens * batchFeatures(askableFeatures(lexicon, d), args.batchSize).length, 0);
    console.log(`\ndry run: ${digests.length} documents · ${asked} feature-questions · ${calls} LLM calls · ~${inTok} input tokens`);
    console.log(`estimated cost: $${estimateCost(args.model, { ...NO_USAGE, input_tokens: inTok, output_tokens: calls * OUTPUT_TOKENS_PER_CALL }).toFixed(2)} (list-price estimate)`);
    process.exit(0);
  }

  let llm: LLM;
  if (args.mock) {
    const { MockLLM } = await import("../llm/client.js");
    const { labelMockHandlers } = await import("./label_mock.js");
    llm = new MockLLM(labelMockHandlers);
  } else {
    const { makeModel } = await import("../llm/registry.js");
    llm = makeModel(args.model);
  }
  console.log(`llm: ${llm.name} (${llm.models.strong}) · concurrency ${args.concurrency}\n`);

  const rows = await parallelMap(digests, Math.max(1, args.concurrency), async (d, i) => {
    console.log(`[${i + 1}/${digests.length}] ${d.doc_id} (${d.approx_tokens} tok, ${d.available_loci.length} loci)`);
    const row = await labelDocument(llm, d, lexicon, { versions: { lexicon: lexicon.version, catalog: catalogVersion }, batchSize: args.batchSize, log: (s) => console.log(s) });
    const s = summarizeRow(row);
    const hit = s.cache_hit_rate === null ? "n/a" : `${(s.cache_hit_rate * 100).toFixed(0)}%`;
    console.log(`     present ${s.present} · absent ${s.absent} · unobserved ${s.unobserved} · fill ${(s.fill_rate * 100).toFixed(0)}% · cache hit ${hit}`);
    return row;
  });

  const usage = totalUsage(rows);
  const hitRate = cacheHitRate(usage);
  console.log(`\n${rows.length} rows · ${usage.input_tokens} in / ${usage.output_tokens} out tokens · est. $${estimateCost(llm.models.strong, usage).toFixed(2)}`);
  // NOTE: `estimateCost` prices `input_tokens` + `output_tokens` only, so with caching on it UNDERSTATES the
  // bill (cache writes are 1.25x, reads 0.1x, and neither is in `input_tokens`). The raw counts below are the
  // ground truth; do the cache arithmetic before quoting a figure to anyone.
  console.log(
    `cache: ${usage.cache_creation_input_tokens} written / ${usage.cache_read_input_tokens} read · hit rate ${hitRate === null ? "n/a (no prompt tokens counted)" : `${(hitRate * 100).toFixed(1)}%`}`,
  );

  await fs.mkdir(args.out, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(args.out, `${stamp}-labels-${args.docType}.json`);
  await fs.writeFile(file, `${rows.map((r) => JSON.stringify(r)).join("\n")}\n`);
  console.log(`written ${file} (one JSON row per document)`);
}
