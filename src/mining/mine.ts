/**
 * Catalog miner — turns a corpus of real specifications into reviewable catalog data.
 *
 * Offline tooling in the spirit of ADR-010: it emits versioned JSON that a human reviews and folds into
 * `catalogs/*.json`; it never touches the runtime. What it produces:
 *   node-candidates.json — 1–3-grams in the maximum-entropy band per archetype = candidate decision axes
 *   catalog-gaps.json    — those candidates no existing catalog node covers (the holes in our catalog)
 *   node-relevance.json  — for each existing node, whether this archetype's corpus talks about it at all
 *   coverage.json        — the near-universal terms of each archetype (the omission checklist)
 *   terms.json           — the raw statistics, for anything else you want to ask
 *
 * Corpus layout: <corpus>/<archetype>/<anything>.md|txt   (directory name = archetype label)
 *            or: <corpus>/manifest.json  = [{ "file": "x.md", "archetype": "b2b-invoicing", "id": "x" }]
 *
 * CLI: npm run mine -- --corpus <dir> [--out dir] [--n 3] [--min-df 2] [--band 0.2,0.8] [--limit 40]
 *                      [--spec <file> --archetype <id>]   # coverage-check one compiled spec
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeCorpus, candidates, coverageTerms, cTfIdf, specCoverage, normToken, STOPWORDS, type Candidate, type CorpusStats, type Doc } from "./ngrams.js";
import type { NodeDef } from "../core/catalog.js";

export async function loadCorpus(dir: string): Promise<Doc[]> {
  const manifestPath = path.join(dir, "manifest.json");
  const manifest = await fs.readFile(manifestPath, "utf8").catch(() => null);
  const docs: Doc[] = [];
  if (manifest) {
    const entries = JSON.parse(manifest) as { file: string; archetype: string; id?: string }[];
    for (const e of entries) {
      const text = await fs.readFile(path.resolve(dir, e.file), "utf8");
      docs.push({ id: e.id ?? path.basename(e.file), archetype: e.archetype, text });
    }
    return docs;
  }
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const sub = path.join(dir, entry.name);
    for (const f of await fs.readdir(sub)) {
      if (!/\.(md|txt|markdown)$/i.test(f)) continue;
      docs.push({ id: `${entry.name}/${f}`, archetype: entry.name, text: await fs.readFile(path.join(sub, f), "utf8") });
    }
  }
  return docs;
}

/** Normalized content tokens of a catalog node — everything a term could plausibly match against. */
export function nodeTerms(node: NodeDef): Set<string> {
  const text = [node.id.replace(/_/g, " "), node.topic, node.question, ...node.options.map((o) => `${o.id.replace(/_/g, " ")} ${o.label}`)].join(" ");
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9'-]+/)
      .map(normToken)
      .filter((t) => t.length > 1 && !STOPWORDS.has(t)),
  );
}

export interface Gap {
  candidate: Candidate;
  /** the closest existing node, if any partially matched */
  nearest?: { node: string; overlap: number };
}

/** Candidates whose content words no catalog node covers — i.e. decision axes the catalog is blind to. */
export function catalogGaps(cands: Candidate[], nodes: NodeDef[]): Gap[] {
  const nodeSets = nodes.map((n) => ({ id: n.id, terms: nodeTerms(n) }));
  const gaps: Gap[] = [];
  for (const c of cands) {
    const tokens = c.term.split(" ").filter((t) => !STOPWORDS.has(t));
    if (!tokens.length) continue;
    let best: { node: string; overlap: number } | undefined;
    for (const n of nodeSets) {
      const hit = tokens.filter((t) => n.terms.has(t)).length / tokens.length;
      if (!best || hit > best.overlap) best = { node: n.id, overlap: hit };
    }
    if (!best || best.overlap < 1) gaps.push({ candidate: c, ...(best && best.overlap > 0 ? { nearest: best } : {}) });
  }
  return gaps;
}

export interface NodeRelevance {
  node: string;
  topic: string;
  /** best within-archetype document fraction across the node's own vocabulary */
  evidence: number;
  best_term: string | null;
}

/**
 * Does this archetype's corpus talk about this node at all? Low evidence → a candidate for `applies_to`
 * exclusion (or the planner's not_applicable list). This deliberately does NOT try to set option-level
 * priors: term presence has no polarity ("no multi-currency" and "full multi-currency" look identical to a
 * bag of words), so priors need the polarity-aware LLM extraction pass, not raw counts.
 */
export function nodeRelevance(stats: CorpusStats, archetype: string, nodes: NodeDef[]): NodeRelevance[] {
  const docsInArchetype = stats.docs_by_archetype[archetype] ?? 0;
  const out: NodeRelevance[] = [];
  for (const node of nodes) {
    let evidence = 0;
    let bestTerm: string | null = null;
    for (const t of nodeTerms(node)) {
      const stat = stats.terms.get(t);
      if (!stat) continue;
      const p = docsInArchetype ? (stat.df_by_archetype[archetype] ?? 0) / docsInArchetype : 0;
      if (p > evidence) {
        evidence = p;
        bestTerm = t;
      }
    }
    out.push({ node: node.id, topic: node.topic, evidence, best_term: bestTerm });
  }
  return out.sort((a, b) => a.evidence - b.evidence || a.node.localeCompare(b.node));
}

export interface MineReport {
  corpus: { docs: number; by_archetype: Record<string, number> };
  options: { maxN: number; minDf: number; band: [number, number]; limit: number };
  archetypes: Record<
    string,
    {
      candidates: Candidate[];
      gaps: Gap[];
      relevance: NodeRelevance[];
      coverage: { term: string; df_fraction: number; n: number }[];
      top_c_tfidf: { term: string; score: number }[];
      by_n: Record<number, number>;
    }
  >;
}

export function mine(
  docs: Doc[],
  nodesFor: (archetype: string) => NodeDef[],
  opts: { maxN?: number; minDf?: number; band?: [number, number]; limit?: number } = {},
): MineReport {
  const maxN = opts.maxN ?? 3;
  const minDf = opts.minDf ?? 2;
  const band = opts.band ?? [0.2, 0.8];
  const limit = opts.limit ?? 40;
  const stats = analyzeCorpus(docs, { maxN, minDf });
  const report: MineReport = {
    corpus: { docs: stats.docs, by_archetype: stats.docs_by_archetype },
    options: { maxN, minDf, band, limit },
    archetypes: {},
  };
  for (const archetype of Object.keys(stats.docs_by_archetype).sort()) {
    const nodes = nodesFor(archetype);
    const cands = candidates(stats, archetype, { band, maxN, limit });
    const by_n: Record<number, number> = {};
    for (const c of cands) by_n[c.n] = (by_n[c.n] ?? 0) + 1;
    const top_c_tfidf = [...stats.terms.values()]
      .filter((s) => (s.tf_by_archetype[archetype] ?? 0) > 0)
      .map((s) => ({ term: s.term, score: cTfIdf(stats, s.term, archetype) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    report.archetypes[archetype] = {
      candidates: cands,
      gaps: catalogGaps(cands, nodes),
      relevance: nodeRelevance(stats, archetype, nodes),
      coverage: coverageTerms(stats, archetype, 0.8, maxN).slice(0, 200),
      top_c_tfidf,
      by_n,
    };
  }
  return report;
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
    console.error("usage: npm run mine -- --corpus <dir> [--out dir] [--n 3] [--min-df 2] [--band 0.2,0.8] [--limit 40] [--spec file --archetype id]");
    process.exit(1);
  }
  const outDir = flag("--out") ?? "mining-results";
  const maxN = Number(flag("--n") ?? 3);
  const minDf = Number(flag("--min-df") ?? 2);
  const limit = Number(flag("--limit") ?? 40);
  const bandRaw = (flag("--band") ?? "0.2,0.8").split(",").map(Number);
  const band: [number, number] = [bandRaw[0] ?? 0.2, bandRaw[1] ?? 0.8];

  const { loadCatalogs } = await import("../engine/catalogs.js");
  const { mergeCatalogs } = await import("../core/catalog.js");
  const catalogs = await loadCatalogs();

  const docs = await loadCorpus(corpusDir);
  if (!docs.length) {
    console.error(`no documents found under ${corpusDir}`);
    process.exit(1);
  }
  const report = mine(docs, (a) => mergeCatalogs(catalogs.catalogs, [a]).nodes, { maxN, minDf, band, limit });

  console.log(`corpus: ${report.corpus.docs} docs · ${Object.entries(report.corpus.by_archetype).map(([a, n]) => `${a}=${n}`).join(" ")}`);
  for (const [archetype, r] of Object.entries(report.archetypes)) {
    console.log(`\n══ ${archetype} (${report.corpus.by_archetype[archetype]} specs) ══`);
    console.log(`  decision-axis candidates by n: ${Object.entries(r.by_n).map(([n, c]) => `${n}-gram:${c}`).join(" ") || "none"}`);
    console.log(`  ${"term".padEnd(34)} ${"DF".padStart(6)} ${"bits".padStart(5)} ${"dist".padStart(6)}  covered by`);
    for (const c of r.candidates.slice(0, 20)) {
      const gap = r.gaps.find((g) => g.candidate.term === c.term);
      const covered = gap ? (gap.nearest ? `~${gap.nearest.node} (${Math.round(gap.nearest.overlap * 100)}%)` : "— GAP") : "catalog";
      console.log(`  ${c.term.padEnd(34)} ${`${Math.round(c.df_fraction * 100)}%`.padStart(6)} ${c.entropy.toFixed(2).padStart(5)} ${c.distinctiveness.toFixed(1).padStart(6)}  ${covered}`);
    }
    const hardGaps = r.gaps.filter((g) => !g.nearest);
    if (hardGaps.length) console.log(`  ${hardGaps.length} candidate(s) with no catalog node at all: ${hardGaps.slice(0, 10).map((g) => g.candidate.term).join(", ")}`);
    const unused = r.relevance.filter((n) => n.evidence < 0.2);
    if (unused.length) console.log(`  nodes this corpus barely mentions (applies_to candidates): ${unused.slice(0, 10).map((n) => `${n.node}(${Math.round(n.evidence * 100)}%)`).join(", ")}`);
  }

  const specFile = flag("--spec");
  if (specFile) {
    const archetype = flag("--archetype") ?? Object.keys(report.archetypes)[0]!;
    const stats = analyzeCorpus(docs, { maxN, minDf });
    const cov = specCoverage(await fs.readFile(specFile, "utf8"), stats, archetype);
    console.log(`\ncoverage of ${specFile} vs ${archetype}: ${Math.round(cov.score * 100)}% (${cov.present.length}/${cov.checked})`);
    if (cov.missing.length) console.log(`  missing: ${cov.missing.slice(0, 25).map((m) => `${m.term}(${Math.round(m.df_fraction * 100)}%)`).join(", ")}`);
  }

  await fs.mkdir(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const write = async (name: string, data: unknown) => {
    const file = path.join(outDir, `${stamp}-${name}.json`);
    await fs.writeFile(file, JSON.stringify(data, null, 2));
    return file;
  };
  await write("node-candidates", Object.fromEntries(Object.entries(report.archetypes).map(([a, r]) => [a, r.candidates])));
  await write("catalog-gaps", Object.fromEntries(Object.entries(report.archetypes).map(([a, r]) => [a, r.gaps])));
  await write("node-relevance", Object.fromEntries(Object.entries(report.archetypes).map(([a, r]) => [a, r.relevance])));
  await write("coverage", Object.fromEntries(Object.entries(report.archetypes).map(([a, r]) => [a, r.coverage])));
  const full = await write("report", report);
  console.log(`\nwritten ${outDir}/${stamp}-*.json (full report: ${full})`);
}
