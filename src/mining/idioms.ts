/**
 * Precision-idiom miner — mines STRUCTURE and PHRASING patterns (never product content) from the strong specs
 * in `corpus/`, per archetype:
 *   - section_patterns: what a precise spec of this kind of app covers (name + one-line purpose);
 *   - precision_idioms: reusable phrasing templates that make requirements testable ("X must never Y;
 *     verified by Z", error/edge tables, exactly-once language), each with a generic template plus a concrete
 *     example quoted from the source document (≤ 25 words);
 *   - edge_case_patterns: recurring edge-case classes with how the spec resolved them.
 * One structured LLM call per document; deterministic aggregation keeps only patterns seen in ≥ 2 documents
 * (topped up by frequency when the threshold leaves the list too thin) and writes
 * `catalogs/exemplars/<archetype>.json`.
 *
 * Licence handling: documents the corpus manifest flags as licence-uncertain ("unknown …, flagged" /
 * "provisionally") are SKIPPED entirely — they are neither read nor quoted. For the rest, the committed
 * exemplars carry only generic pattern names/templates plus one short verbatim quote (≤ 25 words) per idiom,
 * i.e. brief excerpts for analysis, with the source doc ids recorded in `docs`.
 *
 * Offline tooling in the spirit of ADR-010: reviewable JSON the compile/draft prompts may later read; the
 * engine runtime never imports this module.
 *
 * CLI: npx tsx src/mining/idioms.ts [--archetypes a,b] [--per-archetype N] [--mock] [--corpus dir] [--out dir]
 */
import { z } from "zod";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parallelMap, type LLM, type LLMRequest, type LLMResponse, type LLMUsage, type MockHandler } from "../llm/client.js";
import { boundDocText, DOC_MARKER } from "./concepts.js";
import type { Doc } from "./ngrams.js";

// ---------- output schema (ADR-011: conservative subset — flat objects, every field present) ----------

export const IdiomExtractionSchema = z.object({
  /** what a precise spec of this kind covers: canonical snake_case name + one-line purpose */
  section_patterns: z.array(z.object({ name: z.string(), purpose: z.string() })),
  /** phrasing templates that make requirements testable: generic template + a verbatim ≤25-word quote */
  precision_idioms: z.array(z.object({ name: z.string(), template: z.string(), example: z.string() })),
  /** recurring edge-case classes and how THIS document resolves them (phrased generically) */
  edge_case_patterns: z.array(z.object({ name: z.string(), resolution: z.string() })),
});
export type IdiomExtraction = z.infer<typeof IdiomExtractionSchema>;

// ---------- prompt ----------

export const IDIOM_EXTRACT_SYSTEM = `You read ONE real software specification/documentation file and mine its STRUCTURE and PHRASING — the reusable craft of how a precise spec of this kind of app is written. Never its product content: no feature lists, no app-specific requirements. Every pattern you output must be reusable, as written, for a completely different app of the same kind.
Output three lists:
1. section_patterns: the kinds of ground a precise spec of this kind of app covers, judged from what this document covers well. Each: name (canonical snake_case, e.g. cancellation_policy, permission_matrix, error_handling, data_retention) and purpose (one line: what having this section prevents or settles). Only sections this document actually covers.
2. precision_idioms: reusable phrasing templates that make a requirement TESTABLE — invariant phrasing ("X must never Y; verified by Z"), error/edge tables (case → expected behaviour), exactly-once/at-most-once language, bounded windows ("within N days"), explicit state transitions ("from A to B only when C"), explicit defaults ("unless configured, X is Y"). Each: name (canonical snake_case), template (generic, with X/Y/Z or N placeholders), example (a VERBATIM quote from this document of AT MOST 25 words that instantiates the template — quote, do not paraphrase).
3. edge_case_patterns: recurring CLASSES of edge case this document explicitly handles (e.g. concurrent_edit, timezone_boundary, partial_payment, no_show, expiry, duplicate_submission). Each: name (canonical snake_case class) and resolution (one line, phrased generically: HOW the document resolves it, not what the product is).
Naming matters: the same pattern found in another document must get the same snake_case name — prefer short established names (must_never_invariant, error_table, state_transition_rule, exactly_once, bounded_window, explicit_default, permission_matrix, cancellation_window, notification_trigger) over inventive ones.
3–10 items per list; fewer is fine if the document is imprecise or repetitive. Empty lists are fine. Return JSON only.`;

export function renderIdiomPrompt(doc: Doc): { user: string; truncated: boolean } {
  const bounded = boundDocText(doc.text);
  return { user: [`ARCHETYPE: ${doc.archetype}`, `DOCUMENT ID: ${doc.id}`, `${DOC_MARKER}${bounded.text}`].join("\n\n"), truncated: bounded.truncated };
}

export async function extractIdioms(llm: LLM, doc: Doc): Promise<LLMResponse<IdiomExtraction>> {
  return llm.structured({
    fn: "idiom_extract",
    tier: "strong",
    system: IDIOM_EXTRACT_SYSTEM,
    user: renderIdiomPrompt(doc).user,
    schema: IdiomExtractionSchema,
    effort: "medium",
    maxTokens: 4000,
  });
}

// ---------- corpus selection (manifest-aware, licence-filtered) ----------

export interface ManifestEntry {
  file: string;
  archetype: string;
  id?: string;
  license?: string;
  [k: string]: unknown;
}

/** Manifest licence strings that mean "do not use": unknown / explicitly flagged / provisional copies. */
export function licenceUncertain(license: string | undefined): boolean {
  const l = (license ?? "").toLowerCase();
  return l === "" || l.includes("unknown") || l.includes("flagged") || l.includes("uncertain") || l.includes("unclear") || l.includes("provisional");
}

/** Longest-first pick of up to `n` licence-clear docs of one archetype (length ≈ the richest specs). */
export function pickDocs(docs: Doc[], archetype: string, n: number): Doc[] {
  return docs
    .filter((d) => d.archetype === archetype)
    .sort((a, b) => b.text.length - a.text.length || a.id.localeCompare(b.id))
    .slice(0, n);
}

/** Load corpus docs via manifest.json, skipping licence-uncertain entries. The manifest is required here —
 *  unlike stage 1's loadCorpus, this miner must not run on a corpus whose licences are untracked. */
export async function loadLicensedCorpus(corpusDir: string): Promise<{ docs: Doc[]; skipped: { id: string; license: string }[] }> {
  const entries = JSON.parse(await fs.readFile(path.join(corpusDir, "manifest.json"), "utf8")) as ManifestEntry[];
  const docs: Doc[] = [];
  const skipped: { id: string; license: string }[] = [];
  for (const e of entries) {
    const id = e.id ?? path.basename(e.file);
    if (licenceUncertain(e.license)) {
      skipped.push({ id, license: e.license ?? "(none)" });
      continue;
    }
    docs.push({ id, archetype: e.archetype, text: await fs.readFile(path.resolve(corpusDir, e.file), "utf8") });
  }
  return { docs, skipped };
}

// ---------- deterministic aggregation ----------

export const snake = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

/** First `n` whitespace-separated words (the ≤25-word quote bound, enforced even if the model overruns). */
export function clampWords(s: string, n: number): string {
  const words = s.trim().split(/\s+/);
  return words.length <= n ? s.trim() : `${words.slice(0, n).join(" ")} …`;
}

export interface ExtractionRecord {
  doc_id: string;
  archetype: string;
  data: IdiomExtraction | null;
  error: string | null;
  model: string;
  latency_ms: number;
  usage: LLMUsage;
}

interface AggItem<T> {
  name: string;
  count: number;
  docs: string[];
  first: T; // representative instance: first doc (doc order), first mention within it
}

/**
 * One vote per document per pattern name (names snake_case-normalized); keep patterns seen in ≥ `minDocs`
 * documents, and when fewer than `topN` clear that bar, top up with the most frequent remainder so a small or
 * heterogeneous corpus still yields a usable list. Ordering: count desc, then name — fully deterministic.
 */
export function aggregatePatterns<T extends { name: string }>(perDoc: { doc_id: string; items: T[] }[], opts: { minDocs?: number; topN?: number } = {}): AggItem<T>[] {
  const minDocs = opts.minDocs ?? 2;
  const topN = opts.topN ?? 8;
  const byName = new Map<string, AggItem<T>>();
  for (const d of perDoc) {
    const seen = new Set<string>();
    for (const item of d.items) {
      const name = snake(item.name);
      if (!name || seen.has(name)) continue;
      seen.add(name);
      const agg = byName.get(name) ?? { name, count: 0, docs: [], first: item };
      agg.count += 1;
      agg.docs.push(d.doc_id);
      byName.set(name, agg);
    }
  }
  const all = [...byName.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const kept = all.filter((a) => a.count >= minDocs);
  for (const a of all) {
    if (kept.length >= topN) break;
    if (!kept.includes(a)) kept.push(a);
  }
  return kept.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export interface Exemplar {
  version: string;
  archetype: string;
  mined_from: number;
  docs: string[];
  section_patterns: { name: string; purpose: string; count: number }[];
  precision_idioms: { name: string; template: string; example: string; example_doc: string; count: number }[];
  edge_case_patterns: { name: string; resolution: string; count: number }[];
}

export function buildExemplar(archetype: string, records: ExtractionRecord[], opts: { version: string; minDocs?: number; topN?: number }): Exemplar {
  const ok = records.filter((r) => r.data);
  const lift = <K extends keyof IdiomExtraction>(key: K) => ok.map((r) => ({ doc_id: r.doc_id, items: r.data![key] }));
  const aggOpts = { minDocs: opts.minDocs, topN: opts.topN };
  return {
    version: opts.version,
    archetype,
    mined_from: ok.length,
    docs: ok.map((r) => r.doc_id),
    section_patterns: aggregatePatterns(lift("section_patterns"), aggOpts).map((a) => ({ name: a.name, purpose: a.first.purpose, count: a.count })),
    precision_idioms: aggregatePatterns(lift("precision_idioms"), aggOpts).map((a) => ({
      name: a.name,
      template: a.first.template,
      example: clampWords(a.first.example, 25),
      example_doc: a.docs[0]!,
      count: a.count,
    })),
    edge_case_patterns: aggregatePatterns(lift("edge_case_patterns"), aggOpts).map((a) => ({ name: a.name, resolution: a.first.resolution, count: a.count })),
  };
}

// ---------- runner ----------

export interface MineResult {
  exemplars: Record<string, Exemplar>;
  records: ExtractionRecord[];
  skippedLicence: { id: string; license: string }[];
}

const NO_USAGE: LLMUsage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };

/** Extract every selected doc (bounded parallelism); a failed doc is logged and skipped, never fatal. */
export async function mineIdioms(
  llm: LLM,
  docs: Doc[],
  archetypes: string[],
  opts: { perArchetype?: number; concurrency?: number; version?: string; minDocs?: number; topN?: number; log?: (s: string) => void } = {},
): Promise<Omit<MineResult, "skippedLicence">> {
  const log = opts.log ?? (() => {});
  const version = opts.version ?? `${new Date().toISOString().slice(0, 10)}-1`;
  const selected = archetypes.flatMap((a) => pickDocs(docs, a, Math.max(1, opts.perArchetype ?? 8)));
  const records = await parallelMap(selected, Math.max(1, opts.concurrency ?? 3), async (doc, i): Promise<ExtractionRecord> => {
    try {
      const res = await extractIdioms(llm, doc);
      log(`[${i + 1}/${selected.length}] ${doc.id}: ${res.data.section_patterns.length} sections, ${res.data.precision_idioms.length} idioms, ${res.data.edge_case_patterns.length} edge classes (${res.model}${res.cached ? ", cached" : ""}, ${res.latency_ms}ms)`);
      return { doc_id: doc.id, archetype: doc.archetype, data: res.data, error: null, model: res.model, latency_ms: res.latency_ms, usage: res.usage };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log(`[${i + 1}/${selected.length}] ${doc.id}: FAILED ${msg}`);
      return { doc_id: doc.id, archetype: doc.archetype, data: null, error: msg, model: "", latency_ms: 0, usage: NO_USAGE };
    }
  });
  const exemplars: Record<string, Exemplar> = {};
  for (const a of archetypes) {
    exemplars[a] = buildExemplar(a, records.filter((r) => r.archetype === a), { version, minDocs: opts.minDocs, topN: opts.topN });
  }
  return { exemplars, records };
}

// ---------- mock ----------

/**
 * Scripted handler for fn "idiom_extract": lexical cues over the same rendered prompt the real model sees.
 * Canonical names come from fixed cue tables, so documents sharing phrasing agree on names and the ≥2-doc
 * aggregation threshold is exercised realistically. Plumbing only — no claim about real archetypes.
 */
export function mockIdiomExtract(req: LLMRequest<unknown>): IdiomExtraction {
  const at = req.user.indexOf(DOC_MARKER);
  const text = at >= 0 ? req.user.slice(at + DOC_MARKER.length) : req.user;
  const sentence = (re: RegExp): string => {
    const s = text.split(/(?<=[.!?])\s+|\n+/).find((x) => re.test(x));
    return (s ?? "").trim();
  };

  const section_patterns = [...text.matchAll(/^##\s+(.+)$/gm)]
    .map((m) => snake(m[1]!))
    .filter((n, i, a) => n && a.indexOf(n) === i)
    .slice(0, 6)
    .map((name) => ({ name, purpose: `covers ${name.replace(/_/g, " ")}` }));

  const IDIOM_CUES: { re: RegExp; name: string; template: string }[] = [
    { re: /must never|must not/i, name: "must_never_invariant", template: "X must never Y; verified by Z" },
    { re: /exactly one|exactly once/i, name: "exactly_once", template: "exactly one X per Y" },
    { re: /within \d+/i, name: "bounded_window", template: "X happens within N units" },
    { re: /by default|unless configured/i, name: "explicit_default", template: "unless configured, X is Y" },
  ];
  const precision_idioms = IDIOM_CUES.flatMap((c) => {
    const s = sentence(c.re);
    return s ? [{ name: c.name, template: c.template, example: clampWords(s, 25) }] : [];
  });

  const EDGE_CUES: { re: RegExp; name: string; resolution: string }[] = [
    { re: /cancel/i, name: "cancellation_window", resolution: "cancellation allowed until a stated cutoff" },
    { re: /refund/i, name: "refund_policy", resolution: "refunds follow an explicit policy per case" },
    { re: /timezone|time zone/i, name: "timezone_boundary", resolution: "times are stored and compared in one canonical zone" },
    { re: /double.?book|conflict/i, name: "double_booking", resolution: "conflicting requests are rejected at write time" },
  ];
  const edge_case_patterns = EDGE_CUES.flatMap((c) => (c.re.test(text) ? [{ name: c.name, resolution: c.resolution }] : []));

  return { section_patterns, precision_idioms, edge_case_patterns };
}

export const idiomMockHandlers: Record<string, MockHandler> = {
  idiom_extract: (req) => mockIdiomExtract(req),
};

// ---------- CLI ----------

export const DEFAULT_ARCHETYPES = ["b2b-invoicing", "booking", "crud-saas"];

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const flag = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const corpusDir = flag("--corpus") ?? "corpus";
  const outDir = flag("--out") ?? "catalogs/exemplars";
  const archetypes = (flag("--archetypes") ?? DEFAULT_ARCHETYPES.join(",")).split(",").map((s) => s.trim()).filter(Boolean);
  const perArchetype = Number(flag("--per-archetype") ?? 8);
  const mock = args.includes("--mock");

  let llm: LLM;
  if (mock) {
    const { MockLLM } = await import("../llm/client.js");
    llm = new MockLLM(idiomMockHandlers);
  } else {
    // Same pattern as mine:concepts / mine:rules: the engine bootstrap builds the env-selected provider
    // (Azure/OpenAI/Anthropic) with the disk cache on, and we borrow its strong tier.
    const { buildEngine } = await import("../engine/bootstrap.js");
    const { MemoryStore } = await import("../store/file_store.js");
    llm = (await buildEngine({ mock: false, cache: true, store: new MemoryStore() })).llm;
  }

  const { docs, skipped } = await loadLicensedCorpus(corpusDir);
  for (const s of skipped) console.log(`skipping (licence-uncertain): ${s.id} — ${s.license}`);
  console.log(`corpus: ${docs.length} licence-clear docs · llm: ${llm.name} (${llm.models.strong}) · archetypes: ${archetypes.join(", ")} · ≤${perArchetype}/archetype`);

  const result = await mineIdioms(llm, docs, archetypes, { perArchetype, log: (s) => console.log(`  ${s}`) });

  await fs.mkdir(outDir, { recursive: true });
  for (const [archetype, ex] of Object.entries(result.exemplars)) {
    const file = path.join(outDir, `${archetype}.json`);
    await fs.writeFile(file, JSON.stringify(ex, null, 2) + "\n");
    console.log(`\n══ ${archetype} (${ex.mined_from} docs) → ${file} ══`);
    console.log(`  section_patterns: ${ex.section_patterns.length} · precision_idioms: ${ex.precision_idioms.length} · edge_case_patterns: ${ex.edge_case_patterns.length}`);
    for (const i of ex.precision_idioms.slice(0, 3)) console.log(`  idiom ${i.name} (${i.count} docs): ${i.template}\n    e.g. "${i.example}" (${i.example_doc})`);
  }
  const failed = result.records.filter((r) => r.error);
  if (failed.length) console.log(`\n${failed.length} doc(s) failed: ${failed.map((r) => r.doc_id).join(", ")}`);
  const usage = result.records.reduce((u, r) => ({ input_tokens: u.input_tokens + r.usage.input_tokens, output_tokens: u.output_tokens + r.usage.output_tokens, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }), { ...NO_USAGE });
  console.log(`\n${result.records.length} LLM calls · ${usage.input_tokens} in / ${usage.output_tokens} out tokens`);
}
