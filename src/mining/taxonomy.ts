/**
 * Evidence layer, part 2 — the **taxonomy overlay**: the shelf the catalog's decisions sit on.
 *
 * The lexicon (`./lexicon.ts`) gives the evidence matrix its columns; this module gives the catalog its
 * *map*. Six catalogs currently declare 135 decision nodes, each with a one-word `topic` written for the
 * card that shows it ("money", "scope", "automation", "other tools"). Those topics are UI labels, not a
 * classification: they are archetype-local, they collide across catalogs (three different "money"s), and
 * several are bucket words that group questions which have nothing to do with each other. That is fine for
 * a card and useless for the two questions the evidence layer keeps asking:
 *
 *   - "which areas of the decision space does this corpus of documents actually talk about?" — you cannot
 *     aggregate 135 rarely-co-occurring nodes into a readable answer without a coarser axis to sum over;
 *   - "where is the catalog blind?" — a gap is only visible against a declared map of the terrain, next to
 *     the lexicon features that map to nothing (`maps_to === null`).
 *
 * WHAT THIS FILE ENFORCES, and why it is a separate file from the catalogs:
 *
 *  1. The overlay **references, never restates**. An entry is `{ node_id, layer_id, category, status }` and
 *     nothing else — no question, no options, no topic. A copy of the catalog would go stale silently the
 *     first time a node's options changed; a reference cannot. Every `node_id` is checked against the real
 *     `catalogs/*.json`, and an unknown one is a LOUD failure listed by `validateTaxonomy`, exactly as an
 *     unresolvable `maps_to` is in the lexicon. That is the whole point of the reference discipline: the
 *     overlay is allowed to lag the catalog only in the direction that is safe.
 *
 *  2. The safe direction is **unclassified, not unknown**. A catalog node with no overlay entry is NOT an
 *     error — someone adding a node to `catalogs/booking.json` should not have their change rejected by a
 *     file in `src/mining`. It surfaces in the report as `unclassified`, which is the drift signal: a
 *     growing unclassified list means the map has stopped describing the terrain. (The repo's own test
 *     pins it at zero, so the drift is caught the day it appears rather than the day someone reads a
 *     report.)
 *
 *  3. Layers are a **forest, not a soup**: parents are optional, must resolve, and the parent graph must be
 *     acyclic. Nothing downstream may loop while walking a node up to its top-level layer, and a cycle is
 *     reported with its path rather than as a hang — the same treatment `same_as` cycles get in
 *     `src/core/catalog.ts`. Today all ten layers are roots; the check exists so nesting stays cheap and
 *     safe to introduce later.
 *
 *  4. `category` is the finer grain *inside* a layer (`payments_and_commercial` → `tax`, `payouts`,
 *     `late_fees`). It is deliberately free-ish text under `^[a-z0-9_]+$` rather than a closed enum: the
 *     coarse axis is the one reports sum over and the one that must stay stable, while categories are
 *     expected to multiply as the corpus does. `status` (`canonical` / `provisional` / `deprecated`) lets a
 *     speculative area of the map be labelled as such without a fork.
 *
 * Where the file lives: `catalogs/taxonomy/overlay.json`, NOT `catalogs/overlay.json` — `loadCatalogs()`
 * parses *every* top-level `catalogs/*.json` with `CatalogSchema`, so a non-catalog JSON there would crash
 * catalog loading for the whole engine. Sub-directories are the established escape hatch
 * (`catalogs/lexicon`, `catalogs/exemplars`, `catalogs/rule-bank`).
 *
 * Pure by construction: `validateTaxonomy`, `unclassifiedNodes`, `taxonomyReport` and
 * `renderTaxonomyReport` do no IO and read no clock, so the report is unit-testable on a synthetic fixture
 * and byte-identical for identical inputs.
 */
import { z } from "zod";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { catalogNodeIndex, loadLexicon, type Lexicon } from "./lexicon.js";

// ---------- schema ----------

/** Bumped only when the shape changes incompatibly; a mismatch fails the parse rather than mis-reading. */
export const TAXONOMY_SCHEMA_ID = "zadum.taxonomy-overlay.v1";

/**
 * `canonical` — the classification is settled and reports may lean on it.
 * `provisional` — placed to keep the node out of `unclassified`, expected to move.
 * `deprecated` — kept so old reports still resolve the id; excluded from "where is the catalog thin" reads.
 */
export const TAXONOMY_STATUSES = ["canonical", "provisional", "deprecated"] as const;
export type TaxonomyStatus = (typeof TAXONOMY_STATUSES)[number];

const IDENT = /^[a-z0-9_]+$/;

export const TaxonomyLayerSchema = z.object({
  id: z.string().regex(IDENT),
  label: z.string().min(3),
  /** enclosing layer, or null for a root. The parent graph must stay acyclic — see `validateTaxonomy`. */
  parent_id: z.string().regex(IDENT).nullable().default(null),
});
export type TaxonomyLayer = z.infer<typeof TaxonomyLayerSchema>;

export const TaxonomyNodeSchema = z.object({
  /** a real decision node id from `catalogs/*.json` — validated, never restated */
  node_id: z.string().min(1),
  layer_id: z.string().regex(IDENT),
  /** finer grain than the layer, e.g. payments_and_commercial → "payouts" */
  category: z.string().regex(IDENT),
  status: z.enum(TAXONOMY_STATUSES).default("canonical"),
});
export type TaxonomyNode = z.infer<typeof TaxonomyNodeSchema>;

export const TaxonomyOverlaySchema = z.object({
  schema: z.literal(TAXONOMY_SCHEMA_ID),
  version: z.string().min(1),
  description: z.string().default(""),
  layers: z.array(TaxonomyLayerSchema).min(1),
  nodes: z.array(TaxonomyNodeSchema).min(1),
});
export type TaxonomyOverlay = z.infer<typeof TaxonomyOverlaySchema>;

// ---------- validation against the real catalogs ----------

export interface TaxonomyIssue {
  where: string;
  problem: string;
}

/**
 * Every cycle in the layer parent graph, each reported once as the path that closes it
 * (`["a", "b", "a"]`). A layer whose `parent_id` names something undeclared simply terminates the walk —
 * that is reported separately as an unresolved parent, and reporting it twice would only obscure it.
 */
export function layerCycles(layers: TaxonomyLayer[]): string[][] {
  const parent = new Map(layers.map((l) => [l.id, l.parent_id]));
  const cycles: string[][] = [];
  const reported = new Set<string>();
  for (const start of layers) {
    const path: string[] = [];
    const onPath = new Set<string>();
    let at: string | null = start.id;
    while (at !== null && parent.has(at)) {
      if (onPath.has(at)) {
        const cycle = [...path.slice(path.indexOf(at)), at];
        const key = [...new Set(cycle)].sort().join(",");
        if (!reported.has(key)) {
          reported.add(key);
          cycles.push(cycle);
        }
        break;
      }
      onPath.add(at);
      path.push(at);
      at = parent.get(at) ?? null;
    }
  }
  return cycles;
}

/**
 * Every structural promise the reports rely on, checked at load time:
 *  - layer ids unique, and a node classified at most once (two layers for one node would make every
 *    per-layer count depend on iteration order);
 *  - every `layer_id` and every non-null `parent_id` resolves to a declared layer;
 *  - the layer parent graph is acyclic, reported with the offending path;
 *  - every `node_id` is a real catalog node — the loud failure the reference discipline is for. A typo'd
 *    node id would otherwise sit in the overlay forever, counted under a layer it does not belong to and
 *    invisible in `unclassifiedNodes` (which only ever reports the *other* direction).
 *
 * Note what is deliberately NOT an issue: a catalog node the overlay omits. See `unclassifiedNodes`.
 */
export function validateTaxonomy(overlay: TaxonomyOverlay, nodeIndex: Map<string, Set<string>>): TaxonomyIssue[] {
  const issues: TaxonomyIssue[] = [];
  const layerIds = new Set<string>();
  for (const l of overlay.layers) {
    if (layerIds.has(l.id)) issues.push({ where: `layer ${l.id}`, problem: "duplicate layer id" });
    layerIds.add(l.id);
  }
  for (const l of overlay.layers) {
    // a self-parent is not special-cased: it is a 1-cycle and `layerCycles` reports it as "a -> a"
    if (l.parent_id !== null && !layerIds.has(l.parent_id)) {
      issues.push({ where: `layer ${l.id}`, problem: `parent_id "${l.parent_id}" is not a declared layer` });
    }
  }
  for (const cycle of layerCycles(overlay.layers)) {
    issues.push({ where: `layer ${cycle[0]}`, problem: `layer parent cycle: ${cycle.join(" -> ")}` });
  }
  const seen = new Set<string>();
  for (const n of overlay.nodes) {
    const w = `node ${n.node_id}`;
    if (seen.has(n.node_id)) issues.push({ where: w, problem: "duplicate node entry — a node may be classified only once" });
    seen.add(n.node_id);
    if (!layerIds.has(n.layer_id)) issues.push({ where: w, problem: `layer_id "${n.layer_id}" is not a declared layer` });
    if (!nodeIndex.has(n.node_id)) issues.push({ where: w, problem: `"${n.node_id}" is not a catalog node` });
  }
  return issues;
}

/**
 * Catalog nodes with no overlay entry, sorted. NOT a validation failure — the overlay is allowed to lag a
 * freshly added catalog node — but it is the drift signal the report leads with, and the repo's own test
 * pins it at zero so the lag is caught in CI rather than by whoever next reads a report.
 */
export function unclassifiedNodes(overlay: TaxonomyOverlay, nodeIndex: Map<string, Set<string>>): string[] {
  const classified = new Set(overlay.nodes.map((n) => n.node_id));
  return [...nodeIndex.keys()].filter((id) => !classified.has(id)).sort();
}

export function assertTaxonomy(overlay: TaxonomyOverlay, nodeIndex: Map<string, Set<string>>): void {
  const issues = validateTaxonomy(overlay, nodeIndex);
  if (issues.length) {
    throw new Error(
      `taxonomy overlay invalid (${issues.length} problem${issues.length === 1 ? "" : "s"}):\n${issues.map((i) => `  - ${i.where}: ${i.problem}`).join("\n")}`,
    );
  }
}

// ---------- loading ----------

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_TAXONOMY_FILE = path.resolve(here, "../../catalogs/taxonomy/overlay.json");

export async function loadTaxonomy(file: string = DEFAULT_TAXONOMY_FILE): Promise<TaxonomyOverlay> {
  return TaxonomyOverlaySchema.parse(JSON.parse(await fs.readFile(file, "utf8")));
}

/** Load + validate against the catalogs on disk. Throws on the first bad reference, listing all of them. */
export async function loadValidatedTaxonomy(
  file: string = DEFAULT_TAXONOMY_FILE,
): Promise<{ overlay: TaxonomyOverlay; nodeIndex: Map<string, Set<string>>; catalogVersion: string }> {
  const { loadCatalogs } = await import("../engine/catalogs.js");
  const catalogs = await loadCatalogs();
  const overlay = await loadTaxonomy(file);
  const nodeIndex = catalogNodeIndex(catalogs.catalogs);
  assertTaxonomy(overlay, nodeIndex);
  return { overlay, nodeIndex, catalogVersion: catalogs.version };
}

// ---------- accessors ----------

export function layersById(overlay: TaxonomyOverlay): Map<string, TaxonomyLayer> {
  return new Map(overlay.layers.map((l) => [l.id, l]));
}

export function entriesByNodeId(overlay: TaxonomyOverlay): Map<string, TaxonomyNode> {
  return new Map(overlay.nodes.map((n) => [n.node_id, n]));
}

/** Entries grouped by layer, in declaration order, including layers with no entries at all. */
export function nodesByLayer(overlay: TaxonomyOverlay): Map<string, TaxonomyNode[]> {
  const out = new Map<string, TaxonomyNode[]>(overlay.layers.map((l) => [l.id, []]));
  for (const n of overlay.nodes) {
    const list = out.get(n.layer_id) ?? [];
    list.push(n);
    out.set(n.layer_id, list);
  }
  return out;
}

/** The layer a catalog node sits in, or undefined when it is unclassified. */
export function layerOf(overlay: TaxonomyOverlay, nodeId: string): TaxonomyLayer | undefined {
  const entry = overlay.nodes.find((n) => n.node_id === nodeId);
  return entry ? layersById(overlay).get(entry.layer_id) : undefined;
}

/** A layer's chain to its root, nearest first. Empty when the id is unknown; truncated at a cycle. */
export function layerPath(overlay: TaxonomyOverlay, layerId: string): TaxonomyLayer[] {
  const byId = layersById(overlay);
  const out: TaxonomyLayer[] = [];
  const seen = new Set<string>();
  let at: string | null = layerId;
  while (at !== null && !seen.has(at)) {
    const layer = byId.get(at);
    if (!layer) break;
    seen.add(at);
    out.push(layer);
    at = layer.parent_id;
  }
  return out;
}

export interface TaxonomyStats {
  layers: number;
  classified: number;
  categories: number;
  by_status: Record<TaxonomyStatus, number>;
}

export function taxonomyStats(overlay: TaxonomyOverlay): TaxonomyStats {
  const by_status = { canonical: 0, provisional: 0, deprecated: 0 } as Record<TaxonomyStatus, number>;
  for (const n of overlay.nodes) by_status[n.status]++;
  return {
    layers: overlay.layers.length,
    classified: overlay.nodes.length,
    categories: new Set(overlay.nodes.map((n) => n.category)).size,
    by_status,
  };
}

// ---------- report (pure) ----------

export interface TaxonomyLayerReport {
  layer_id: string;
  label: string;
  parent_id: string | null;
  nodes: number;
  categories: { category: string; nodes: number }[];
}

export interface TaxonomyReport {
  versions: { taxonomy: string; catalog: string; lexicon: string | null };
  totals: { catalog_nodes: number; classified: number; unclassified: number; layers: number; categories: number };
  by_status: Record<TaxonomyStatus, number>;
  by_layer: TaxonomyLayerReport[];
  /** catalog nodes with no overlay entry — the drift signal, not an error */
  unclassified: string[];
  /** null when no lexicon was supplied (the taxonomy stands on its own) */
  lexicon: { features: number; by_category: { category: string; features: number }[]; catalog_gaps: string[] } | null;
}

/**
 * The whole evidence-layer map in one JSON-serialisable object: how the catalog's decisions distribute over
 * the layers, what the map does not yet cover (`unclassified`), and — when a lexicon is handed in — how the
 * matrix's columns distribute over their own categories plus the features that map to no catalog node at
 * all (`catalog_gaps`). Those two lists are the pair worth reading together: `unclassified` is the map
 * lagging the catalog, `catalog_gaps` is the catalog lagging the corpus.
 *
 * Pure: no IO, no clock, no randomness. `catalogVersion` is passed in rather than read so this stays true.
 */
export function taxonomyReport(input: {
  overlay: TaxonomyOverlay;
  nodeIndex: Map<string, Set<string>>;
  lexicon?: Lexicon | null;
  catalogVersion?: string;
}): TaxonomyReport {
  const { overlay, nodeIndex, lexicon = null, catalogVersion = "unknown" } = input;
  const grouped = nodesByLayer(overlay);
  const by_layer: TaxonomyLayerReport[] = overlay.layers.map((l) => {
    const entries = grouped.get(l.id) ?? [];
    const counts = new Map<string, number>();
    for (const n of entries) counts.set(n.category, (counts.get(n.category) ?? 0) + 1);
    return {
      layer_id: l.id,
      label: l.label,
      parent_id: l.parent_id,
      nodes: entries.length,
      categories: [...counts]
        .map(([category, nodes]) => ({ category, nodes }))
        .sort((a, b) => b.nodes - a.nodes || (a.category < b.category ? -1 : 1)),
    };
  });
  const unclassified = unclassifiedNodes(overlay, nodeIndex);
  const stats = taxonomyStats(overlay);

  let lexiconReport: TaxonomyReport["lexicon"] = null;
  if (lexicon) {
    const counts = new Map<string, number>(lexicon.categories.map((c) => [c.id, 0]));
    for (const f of lexicon.features) counts.set(f.category, (counts.get(f.category) ?? 0) + 1);
    lexiconReport = {
      features: lexicon.features.length,
      by_category: [...counts]
        .map(([category, features]) => ({ category, features }))
        .sort((a, b) => b.features - a.features || (a.category < b.category ? -1 : 1)),
      catalog_gaps: lexicon.features.filter((f) => f.maps_to === null).map((f) => f.id).sort(),
    };
  }

  return {
    versions: { taxonomy: overlay.version, catalog: catalogVersion, lexicon: lexicon?.version ?? null },
    totals: {
      catalog_nodes: nodeIndex.size,
      classified: stats.classified,
      unclassified: unclassified.length,
      layers: stats.layers,
      categories: stats.categories,
    },
    by_status: stats.by_status,
    by_layer,
    unclassified,
    lexicon: lexiconReport,
  };
}

/** Plain-text/markdown rendering of `taxonomyReport`. Pure: same report in, same string out. */
export function renderTaxonomyReport(report: TaxonomyReport): string {
  const { versions, totals } = report;
  const lines: string[] = [];
  lines.push(`# Taxonomy overlay ${versions.taxonomy}`);
  lines.push("");
  lines.push(`catalogs: ${versions.catalog}`);
  lines.push(`lexicon:  ${versions.lexicon ?? "(not loaded)"}`);
  lines.push(
    `${totals.classified}/${totals.catalog_nodes} catalog nodes classified into ${totals.layers} layers · ` +
      `${totals.categories} categories · ${totals.unclassified} unclassified`,
  );
  const status = Object.entries(report.by_status)
    .filter(([, n]) => n > 0)
    .map(([s, n]) => `${n} ${s}`)
    .join(" · ");
  if (status) lines.push(`status: ${status}`);
  lines.push("");
  lines.push("## Nodes by layer");
  lines.push("");
  const width = Math.max(...report.by_layer.map((l) => l.layer_id.length));
  for (const l of report.by_layer) {
    const nesting = l.parent_id ? ` (under ${l.parent_id})` : "";
    lines.push(`  ${l.layer_id.padEnd(width)}  ${String(l.nodes).padStart(3)}${nesting}`);
    if (l.categories.length) lines.push(`  ${" ".repeat(width)}      ${l.categories.map((c) => `${c.category}:${c.nodes}`).join(", ")}`);
  }
  lines.push("");
  lines.push("## Unclassified catalog nodes");
  lines.push("");
  lines.push(report.unclassified.length ? report.unclassified.map((id) => `  - ${id}`).join("\n") : "  (none — the overlay covers every catalog node)");
  if (report.lexicon) {
    lines.push("");
    lines.push("## Lexicon features by category");
    lines.push("");
    const cw = Math.max(...report.lexicon.by_category.map((c) => c.category.length), 1);
    for (const c of report.lexicon.by_category) lines.push(`  ${c.category.padEnd(cw)}  ${String(c.features).padStart(3)}`);
    lines.push("");
    lines.push(`## Catalog-gap features (${report.lexicon.catalog_gaps.length} of ${report.lexicon.features})`);
    lines.push("");
    lines.push(report.lexicon.catalog_gaps.length ? report.lexicon.catalog_gaps.map((id) => `  - ${id}`).join("\n") : "  (none)");
  }
  return lines.join("\n");
}

// ---------- CLI (validation + report; read-only) ----------

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { loadCatalogs } = await import("../engine/catalogs.js");
  const catalogs = await loadCatalogs();
  const nodeIndex = catalogNodeIndex(catalogs.catalogs);
  const overlay = await loadTaxonomy();
  const issues = validateTaxonomy(overlay, nodeIndex);
  // The lexicon half of the report is a bonus: a broken lexicon must not hide the taxonomy's own verdict.
  let lexicon: Lexicon | null = null;
  try {
    lexicon = await loadLexicon();
  } catch (e) {
    console.error(`(lexicon not loaded: ${e instanceof Error ? e.message : String(e)})`);
  }
  console.log(renderTaxonomyReport(taxonomyReport({ overlay, nodeIndex, lexicon, catalogVersion: catalogs.version })));
  if (issues.length) {
    console.error(`\ntaxonomy overlay INVALID (${issues.length} problem${issues.length === 1 ? "" : "s"}):`);
    for (const i of issues) console.error(`  - ${i.where}: ${i.problem}`);
    process.exit(1);
  }
}
