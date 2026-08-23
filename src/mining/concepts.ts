/**
 * Catalog mining, stage 2 — polarity-aware concept extraction.
 *
 * Stage 1 (`ngrams.ts` / `mine.ts`) counts words, and a bag of words has no polarity: "no multi-currency" and
 * "full multi-currency" are the same tokens. Word DF can therefore say *that* a decision exists in an
 * archetype, never *which option* is common. Stage 2 closes that gap:
 *   1. per spec document, one LLM call maps the text onto the catalog's decision nodes (node → option, with
 *      confidence + quoted evidence) and lists decisions the catalog has no node for (new concepts);
 *   2. deterministic code then computes, per archetype, the fraction of specs choosing each option — document
 *      frequency over normalized *concepts with values* — which drops straight into the catalog `prior` field
 *      the selector already mixes at pseudo-weight α (docs/MINING.md), plus a ranked list of catalog gaps.
 *
 * Like stage 1 this is offline tooling in the spirit of ADR-010: it writes reviewable JSON a human folds into
 * `catalogs/*.json`; the runtime never imports it.
 *
 * CLI: npm run mine:concepts -- --corpus <dir> [--out dir] [--mock] [--concurrency 3]
 */
import { z } from "zod";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parallelMap, type LLM, type LLMResponse, type LLMUsage } from "../llm/client.js";
import type { NodeDef } from "../core/catalog.js";
import type { Doc } from "./ngrams.js";

// ---------- output schema (ADR-011: conservative subset — flat objects, every field present, no optional/records) ----------

export const ConceptExtractionSchema = z.object({
  /** decisions the document states or clearly implies, keyed by catalog node/option ids from the prompt */
  decisions: z.array(z.object({ node_id: z.string(), option_id: z.string(), confidence: z.number(), evidence: z.string() })),
  /** decisions the catalog has no node for: snake_case concept + value (e.g. purchase_order_reference = yes) */
  new_concepts: z.array(z.object({ concept: z.string(), value: z.string(), evidence: z.string(), why_it_matters: z.string() })),
  actors: z.array(z.string()),
  nouns: z.array(z.string()),
  rules: z.array(z.string()),
  non_goals: z.array(z.string()),
});
export type ConceptExtraction = z.infer<typeof ConceptExtractionSchema>;

// ---------- prompt ----------

export const CONCEPT_EXTRACT_SYSTEM = `You read one software specification and map it onto a fixed catalog of product decisions.

You are given CATALOG NODES — each a decision with an id, a question and a closed set of options (option ids in quotes-free snake_case) — and one DOCUMENT. Output strict JSON.

Rules for "decisions" (the important part — be polarity-aware):
- Record a decision ONLY if the document states it or clearly implies it. If the document is silent about a node, OMIT that node entirely. Never guess from what is "typical".
- Polarity matters. "Not supported", "out of scope", "no X", "without X", "we will not …" mean the document CHOSE the negative option ("none", "no", "not_allowed", "nothing" …) for that node — record that option, do not skip it and do not record the positive option.
- node_id and option_id MUST be copied exactly from the CATALOG NODES list. Never invent ids. If none of a node's options fits what the document says, omit the node and, if it is a real decision, describe it under new_concepts instead.
- At most one decision per node_id (the best-supported option).
- confidence: 0.9–1.0 = stated explicitly; 0.7–0.85 = clearly implied; 0.5–0.65 = weakly implied. Do not record anything below 0.5.
- evidence: a short verbatim quote (≤ 200 characters) from the document that supports the choice.

Rules for "new_concepts": product decisions the document settles that NO catalog node covers (e.g. "purchase order reference on invoices: yes"). concept is snake_case and generic (reusable across apps of this kind), value is short and normalized ("yes"/"no"/"manual"/"automatic"/"per_item" …), evidence is a verbatim quote, why_it_matters says what would be built wrongly if it were defaulted the other way. Do not restate catalog decisions here. Skip implementation trivia.

Also list, briefly and without commentary: actors (roles of people/systems), nouns (the main domain objects), rules (invariants/policies stated in the document, one sentence each), non_goals (things explicitly excluded).

Be conservative and exact. Empty arrays are fine.`;

/** Keeps a prompt bounded for very long specs; the note tells the model the cut was deliberate. */
export const MAX_DOC_CHARS = 40_000;

export function boundDocText(text: string, max: number = MAX_DOC_CHARS): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  const dropped = text.length - max;
  return { text: `${text.slice(0, max)}\n\n[... document truncated: ${dropped} more characters omitted ...]`, truncated: true };
}

/** Rendered node list (id, question, options with ids). Shared by the real prompt and the mock parser. */
export function renderNodesForExtraction(nodes: NodeDef[]): string {
  return nodes.map((n) => `- ${n.id}: ${n.question}\n  options: ${n.options.map((o) => `${o.id}="${o.label}"`).join(" | ")}`).join("\n");
}

/** Inverse of `renderNodesForExtraction` (the mock reads the prompt the same way the model does). */
export function parseRenderedNodes(user: string): { id: string; question: string; options: { id: string; label: string }[] }[] {
  const out: { id: string; question: string; options: { id: string; label: string }[] }[] = [];
  const lines = user.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = /^- ([a-z0-9_]+): (.*)$/.exec(lines[i]!);
    const optLine = lines[i + 1] ?? "";
    if (!m || !optLine.startsWith("  options: ")) continue;
    const options = [...optLine.matchAll(/([a-z0-9_]+)="([^"]*)"/g)].map((x) => ({ id: x[1]!, label: x[2]! }));
    out.push({ id: m[1]!, question: m[2]!, options });
  }
  return out;
}

export const DOC_MARKER = "DOCUMENT:\n";

export function renderExtractionPrompt(doc: Doc, nodes: NodeDef[]): { user: string; truncated: boolean } {
  const bounded = boundDocText(doc.text);
  const user = [`ARCHETYPE: ${doc.archetype}`, `DOCUMENT ID: ${doc.id}`, `CATALOG NODES:\n${renderNodesForExtraction(nodes)}`, `${DOC_MARKER}${bounded.text}`].join("\n\n");
  return { user, truncated: bounded.truncated };
}

export async function extractConcepts(llm: LLM, input: { doc: Doc; nodes: NodeDef[] }): Promise<LLMResponse<ConceptExtraction>> {
  const { user } = renderExtractionPrompt(input.doc, input.nodes);
  return llm.structured({
    fn: "concept_extract",
    tier: "strong",
    system: CONCEPT_EXTRACT_SYSTEM,
    user,
    schema: ConceptExtractionSchema,
    effort: "medium",
    maxTokens: 6000,
  });
}

// ---------- deterministic aggregation ----------

export interface NodePrior {
  /** docs choosing each option (catalog option order; zero-filled so the shape is stable) */
  counts: Record<string, number>;
  /** docs that stated this decision at all */
  n: number;
  /** counts / n (all zero when n = 0) */
  fraction: Record<string, number>;
  /** n / docs in the archetype — how often specs bother to settle this decision */
  coverage: number;
}

export interface NewConceptAgg {
  concept: string;
  /** docs per normalized value */
  values: Record<string, number>;
  /** docs mentioning the concept */
  n: number;
  /** a few evidence quotes (≤ 3) */
  examples: string[];
}

export interface ConceptAggregate {
  docs_by_archetype: Record<string, number>;
  priors: Record<string, Record<string, NodePrior>>;
  new_concepts: Record<string, NewConceptAgg[]>;
}

/** Decisions below this confidence are treated as "the document is silent". */
export const MIN_CONFIDENCE = 0.6;

const snake = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

type NodesSource = NodeDef[] | ((archetype: string) => NodeDef[]);
const nodesOf = (src: NodesSource, archetype: string): NodeDef[] => (typeof src === "function" ? src(archetype) : src);

/**
 * Document frequency over concepts: per archetype and node, how many specs chose each option. One vote per
 * document per node (the highest-confidence decision wins, so a noisy extraction can't double count), only
 * votes at/above MIN_CONFIDENCE, and only ids the catalog actually has — anything else is dropped silently
 * because the model was told the ids are closed; hallucinated ids are noise, not signal.
 */
export function aggregateConcepts(extractions: { archetype: string; data: ConceptExtraction }[], nodes: NodesSource): ConceptAggregate {
  const docs_by_archetype: Record<string, number> = {};
  const priors: ConceptAggregate["priors"] = {};
  const concepts: Record<string, Map<string, NewConceptAgg>> = {};
  const nodeCache = new Map<string, Map<string, NodeDef>>();

  for (const ex of extractions) {
    const a = ex.archetype;
    docs_by_archetype[a] = (docs_by_archetype[a] ?? 0) + 1;
    let byId = nodeCache.get(a);
    if (!byId) {
      byId = new Map(nodesOf(nodes, a).map((n) => [n.id, n]));
      nodeCache.set(a, byId);
      priors[a] = {};
      for (const n of byId.values()) {
        priors[a]![n.id] = { counts: Object.fromEntries(n.options.map((o) => [o.id, 0])), n: 0, fraction: Object.fromEntries(n.options.map((o) => [o.id, 0])), coverage: 0 };
      }
    }
    // one vote per node per doc: keep the best-supported valid decision
    const best = new Map<string, { option: string; confidence: number }>();
    for (const d of ex.data.decisions) {
      if (!(d.confidence >= MIN_CONFIDENCE)) continue;
      const node = byId.get(d.node_id);
      if (!node || !node.options.some((o) => o.id === d.option_id)) continue;
      const cur = best.get(d.node_id);
      if (!cur || d.confidence > cur.confidence) best.set(d.node_id, { option: d.option_id, confidence: d.confidence });
    }
    for (const [nodeId, v] of best) {
      const p = priors[a]![nodeId]!;
      p.counts[v.option] = (p.counts[v.option] ?? 0) + 1;
      p.n += 1;
    }
    // new concepts: one vote per (concept, value) per doc
    const bucket = (concepts[a] ??= new Map());
    const seen = new Set<string>();
    for (const c of ex.data.new_concepts) {
      const concept = snake(c.concept);
      const value = snake(c.value) || "yes";
      if (!concept) continue;
      const key = `${concept}=${value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const agg = bucket.get(concept) ?? { concept, values: {}, n: 0, examples: [] };
      agg.values[value] = (agg.values[value] ?? 0) + 1;
      if (agg.examples.length < 3 && c.evidence.trim()) agg.examples.push(c.evidence.trim());
      bucket.set(concept, agg);
    }
    // a doc that mentions the same concept with two values still counts once toward n
    for (const concept of new Set([...seen].map((k) => k.split("=")[0]!))) bucket.get(concept)!.n += 1;
  }

  for (const [a, byNode] of Object.entries(priors)) {
    const total = docs_by_archetype[a] ?? 0;
    for (const p of Object.values(byNode)) {
      for (const o of Object.keys(p.counts)) p.fraction[o] = p.n ? p.counts[o]! / p.n : 0;
      p.coverage = total ? p.n / total : 0;
    }
  }
  const new_concepts: ConceptAggregate["new_concepts"] = {};
  for (const [a, m] of Object.entries(concepts)) {
    new_concepts[a] = [...m.values()].sort((x, y) => y.n - x.n || x.concept.localeCompare(y.concept));
  }
  return { docs_by_archetype, priors, new_concepts };
}

// ---------- prior hints ----------

export interface PriorHint {
  /** Laplace-smoothed (+0.5 per option) fractions, rounded — paste into the node's `prior` */
  prior: Record<string, number>;
  /** argmax of the smoothed prior (ties → catalog order) */
  defaultOption: string;
  /** documents the estimate rests on */
  evidence_n: number;
  coverage: number;
}
export type PriorHints = Record<string, Record<string, PriorHint>>;

export const SMOOTHING = 0.5;

/**
 * Suggested catalog priors for nodes enough specs actually settle. Coverage gates the hint because a node
 * only 1 spec in 10 mentions tells us more about `applies_to` than about its option split. Smoothing keeps
 * zero-count options alive (the selector treats prior 0 as "impossible", which a small corpus cannot prove).
 */
export function priorHints(aggregate: ConceptAggregate, minCoverage = 0.3): PriorHints {
  const out: PriorHints = {};
  for (const [archetype, byNode] of Object.entries(aggregate.priors)) {
    for (const [nodeId, p] of Object.entries(byNode)) {
      if (p.n === 0 || p.coverage < minCoverage) continue;
      const optionIds = Object.keys(p.counts);
      const denom = p.n + SMOOTHING * optionIds.length;
      const prior: Record<string, number> = {};
      let defaultOption = optionIds[0]!;
      let bestCount = -1;
      for (const o of optionIds) {
        prior[o] = Math.round(((p.counts[o]! + SMOOTHING) / denom) * 1000) / 1000;
        if (p.counts[o]! > bestCount) {
          bestCount = p.counts[o]!;
          defaultOption = o;
        }
      }
      (out[archetype] ??= {})[nodeId] = { prior, defaultOption, evidence_n: p.n, coverage: Math.round(p.coverage * 1000) / 1000 };
    }
  }
  return out;
}

// ---------- stage 2 runner ----------

export interface ExtractionRecord {
  doc_id: string;
  archetype: string;
  /** null when the call failed (see `error`) — the doc then simply does not vote */
  data: ConceptExtraction | null;
  error: string | null;
  model: string;
  latency_ms: number;
  cached: boolean;
  usage: LLMUsage;
  truncated: boolean;
}

export interface Stage2Result {
  extractions: ExtractionRecord[];
  aggregate: ConceptAggregate;
  hints: PriorHints;
}

const NO_USAGE: LLMUsage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };

/**
 * Extract every doc (bounded parallelism), then aggregate. A failed extraction is recorded, logged and skipped
 * rather than aborting the batch: a real corpus run is long and one refusal/timeout should not lose the rest.
 */
export async function runStage2(
  llm: LLM,
  docs: Doc[],
  nodesFor: (archetype: string) => NodeDef[],
  opts: { concurrency?: number; log?: (s: string) => void; minCoverage?: number } = {},
): Promise<Stage2Result> {
  const log = opts.log ?? (() => {});
  const nodesCache = new Map<string, NodeDef[]>();
  const nodesOfArchetype = (a: string) => {
    let n = nodesCache.get(a);
    if (!n) nodesCache.set(a, (n = nodesFor(a)));
    return n;
  };
  const extractions = await parallelMap(docs, Math.max(1, opts.concurrency ?? 3), async (doc, i): Promise<ExtractionRecord> => {
    const nodes = nodesOfArchetype(doc.archetype);
    const { truncated } = renderExtractionPrompt(doc, nodes);
    try {
      const res = await extractConcepts(llm, { doc, nodes });
      log(`[${i + 1}/${docs.length}] ${doc.id}: ${res.data.decisions.length} decisions, ${res.data.new_concepts.length} new concepts (${res.model}${res.cached ? ", cached" : ""}, ${res.latency_ms}ms)`);
      return { doc_id: doc.id, archetype: doc.archetype, data: res.data, error: null, model: res.model, latency_ms: res.latency_ms, cached: res.cached, usage: res.usage, truncated };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log(`[${i + 1}/${docs.length}] ${doc.id}: FAILED ${msg}`);
      return { doc_id: doc.id, archetype: doc.archetype, data: null, error: msg, model: "", latency_ms: 0, cached: false, usage: NO_USAGE, truncated };
    }
  });
  const ok = extractions.flatMap((r) => (r.data ? [{ archetype: r.archetype, data: r.data }] : []));
  const aggregate = aggregateConcepts(ok, nodesOfArchetype);
  const hints = priorHints(aggregate, opts.minCoverage);
  return { extractions, aggregate, hints };
}

// ---------- CLI ----------
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const flag = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const corpusDir = flag("--corpus");
  if (!corpusDir) {
    console.error("usage: npm run mine:concepts -- --corpus <dir> [--out dir] [--mock] [--concurrency 3] [--min-coverage 0.3]");
    process.exit(1);
  }
  const outDir = flag("--out") ?? "mining-results";
  const mock = args.includes("--mock");
  const concurrency = Number(flag("--concurrency") ?? 3);
  const minCoverage = Number(flag("--min-coverage") ?? 0.3);

  const { loadCorpus } = await import("./mine.js");
  const { loadCatalogs } = await import("../engine/catalogs.js");
  const { mergeCatalogs } = await import("../core/catalog.js");
  const catalogs = await loadCatalogs();
  const docs = await loadCorpus(corpusDir);
  if (!docs.length) {
    console.error(`no documents found under ${corpusDir}`);
    process.exit(1);
  }

  let llm: LLM;
  if (mock) {
    const { MockLLM } = await import("../llm/client.js");
    const { conceptMockHandlers } = await import("./concepts_mock.js");
    llm = new MockLLM(conceptMockHandlers);
  } else {
    // buildEngine only constructs the Anthropic client; credentials are needed at call time, so this is cheap.
    const { buildEngine } = await import("../engine/bootstrap.js");
    const { MemoryStore } = await import("../store/file_store.js");
    llm = (await buildEngine({ mock: false, cache: true, store: new MemoryStore() })).llm;
  }
  console.log(`corpus: ${docs.length} docs · llm: ${llm.name} (${llm.models.strong}) · concurrency ${concurrency}`);

  const result = await runStage2(llm, docs, (a) => mergeCatalogs(catalogs.catalogs, [a]).nodes, { concurrency, minCoverage, log: (s) => console.log(`  ${s}`) });

  for (const archetype of Object.keys(result.aggregate.priors).sort()) {
    const byNode = result.aggregate.priors[archetype]!;
    const total = result.aggregate.docs_by_archetype[archetype] ?? 0;
    const failed = result.extractions.filter((r) => r.archetype === archetype && r.error).length;
    console.log(`\n══ ${archetype} (${total} specs extracted${failed ? `, ${failed} failed` : ""}) ══`);
    const stated = Object.entries(byNode)
      .filter(([, p]) => p.n > 0)
      .sort((x, y) => y[1].coverage - x[1].coverage || x[0].localeCompare(y[0]));
    if (!stated.length) console.log("  (no catalog decision stated in any spec)");
    else console.log(`  ${"node".padEnd(26)} ${"cov".padStart(5)}  option fractions → suggested default`);
    for (const [nodeId, p] of stated) {
      const hint = result.hints[archetype]?.[nodeId];
      const fr = Object.entries(p.fraction)
        .filter(([, f]) => f > 0)
        .map(([o, f]) => `${o}=${Math.round(f * 100)}%`)
        .join(" ");
      console.log(`  ${nodeId.padEnd(26)} ${`${Math.round(p.coverage * 100)}%`.padStart(5)}  ${fr} → ${hint ? `${hint.defaultOption} (n=${hint.evidence_n})` : "— (below min coverage)"}`);
    }
    const silent = Object.entries(byNode).filter(([, p]) => p.n === 0).map(([id]) => id);
    if (silent.length) console.log(`  never stated (${silent.length}): ${silent.slice(0, 12).join(", ")}${silent.length > 12 ? ", …" : ""}`);
    const fresh = result.aggregate.new_concepts[archetype] ?? [];
    if (fresh.length) {
      console.log(`  new concepts the catalog lacks:`);
      for (const c of fresh.slice(0, 10)) {
        console.log(`    ${c.concept.padEnd(30)} n=${c.n}  ${Object.entries(c.values).map(([v, k]) => `${v}:${k}`).join(" ")}`);
      }
    }
  }

  await fs.mkdir(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const write = async (name: string, data: unknown) => {
    const file = path.join(outDir, `${stamp}-${name}.json`);
    await fs.writeFile(file, JSON.stringify(data, null, 2));
    return file;
  };
  await write("concept-priors", { catalog_version: catalogs.version, docs_by_archetype: result.aggregate.docs_by_archetype, hints: result.hints, priors: result.aggregate.priors });
  await write("new-concepts", result.aggregate.new_concepts);
  const last = await write("extractions", { catalog_version: catalogs.version, llm: llm.name, model: llm.models.strong, extractions: result.extractions });
  console.log(`\nwritten ${outDir}/${stamp}-{concept-priors,new-concepts,extractions}.json (e.g. ${last})`);
}
