/**
 * Evidence layer, part 1 — the **feature lexicon**: the columns of the evidence matrix.
 *
 * REVIEW-2026-08-23 §3 ("the matrix idea, fixed") settled what a row and a column are: rows are documents
 * (spec-like documents and, if they earn it, repos), columns are *behavioural* decisions from the catalog —
 * never stack choices — and cells are categorical with an explicit `unobserved`, never a bare 0.
 *
 * A lexicon entry is a **binary observable**: "this artifact shows feature X". It carries three things the
 * labelling rules depend on:
 *   - `maps_to`  — the catalog node+option whose choice this observation is evidence *for*. Validated against
 *                  `catalogs/*.json`; an unknown node or option is a loud failure, never a silent drop.
 *                  `null` is legitimate and useful: it records a real decision the catalog has no home for
 *                  (a catalog-gap candidate, the same kind of output `mine:concepts` produces).
 *   - `loci`     — per document type, the **witness loci**: the declared places in a document of that type
 *                  where this feature WOULD show up if it were there. This is what licenses a negative:
 *                  `absent` may only be recorded when a declared locus was actually present in the digest and
 *                  inspected. A feature with no declarable locus for a document type is *undetectable there
 *                  by construction* — every cell is `unobserved` and the labeller is never even asked.
 *   - `category` — the parent context. A negative also requires the category to be discussed at all
 *                  (a spec with a Payments section but no refunds is meaningful absence; a spec with no
 *                  payments section at all says nothing about refunds). Categories declare their own
 *                  `context_loci`, so "was the category discussed" is a set-membership test, not a judgement.
 *
 * The vocabularies of loci are CLOSED enums, deliberately. Free-text loci would make rule 1 unenforceable in
 * code: we could not check that what the model says it inspected is a thing that exists in the digest.
 *
 * Where the file lives: `catalogs/lexicon/lexicon.json`, not `catalogs/lexicon.json` — `loadCatalogs()` parses
 * *every* top-level `catalogs/*.json` with `CatalogSchema`, so a non-catalog JSON there would crash catalog
 * loading for the whole engine. Sub-directories are the established escape hatch (`catalogs/exemplars`,
 * `catalogs/rule-bank`).
 */
import { z } from "zod";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Catalog } from "../core/catalog.js";

// ---------- document types and locus vocabularies ----------

export const DOC_TYPES = ["repo", "spec_doc"] as const;
export type DocType = (typeof DOC_TYPES)[number];

/** Where a feature can show itself in a source repository. One bucket = one section of the condensed digest. */
export const REPO_LOCI = [
  "readme",
  "dependency_manifest",
  "framework_config",
  "config_env",
  "db_schema",
  "routes",
  "auth_code",
  "payment_code",
  "integration_code",
  "background_jobs",
  "email_templates",
  "admin_ui",
  "tests",
  "file_tree",
] as const;
export type RepoLocus = (typeof REPO_LOCI)[number];

/** Where a feature can show itself in a specification-like document. One bucket = one kind of section. */
export const SPEC_LOCI = [
  "overview",
  "actors_section",
  "permissions_section",
  "data_model_section",
  "workflow_section",
  "payments_section",
  "pricing_section",
  "scheduling_section",
  "catalog_section",
  "orders_section",
  "notifications_section",
  "integrations_section",
  "reporting_section",
  "settings_section",
  "admin_section",
  "compliance_section",
  "non_goals_section",
] as const;
export type SpecLocus = (typeof SPEC_LOCI)[number];

export const LOCI_VOCABULARY: Record<DocType, readonly string[]> = { repo: REPO_LOCI, spec_doc: SPEC_LOCI };

export function isKnownLocus(docType: DocType, locus: string): boolean {
  return LOCI_VOCABULARY[docType].includes(locus);
}

// ---------- schema ----------

export const MapsToSchema = z.object({ node: z.string().min(1), option: z.string().min(1) });
export type MapsTo = z.infer<typeof MapsToSchema>;

export const LexiconEntrySchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  label: z.string().min(3),
  category: z.string().regex(/^[a-z0-9_]+$/),
  /** the catalog decision this observation is evidence for; null = catalog-gap candidate */
  maps_to: MapsToSchema.nullable(),
  loci: z.object({ repo: z.array(z.string()), spec_doc: z.array(z.string()) }),
  detectable_in: z.array(z.enum(DOC_TYPES)),
});
export type LexiconEntry = z.infer<typeof LexiconEntrySchema>;

export const LexiconCategorySchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  label: z.string().min(3),
  /** a negative in this category is licensed only when one of these loci is present in the digest */
  context_loci: z.object({ repo: z.array(z.string()), spec_doc: z.array(z.string()) }),
});
export type LexiconCategory = z.infer<typeof LexiconCategorySchema>;

export const LexiconSchema = z.object({
  version: z.string().min(1),
  description: z.string().default(""),
  categories: z.array(LexiconCategorySchema).min(1),
  features: z.array(LexiconEntrySchema).min(1),
});
export type Lexicon = z.infer<typeof LexiconSchema>;

// ---------- validation against the real catalogs ----------

export interface LexiconIssue {
  where: string;
  problem: string;
}

/** node id → the set of its option ids, across every catalog (node ids are unique across catalogs by design). */
export function catalogNodeIndex(catalogs: Catalog[]): Map<string, Set<string>> {
  const idx = new Map<string, Set<string>>();
  for (const c of catalogs) {
    for (const n of c.nodes) {
      const set = idx.get(n.id) ?? new Set<string>();
      for (const o of n.options) set.add(o.id);
      idx.set(n.id, set);
    }
  }
  return idx;
}

/**
 * Every structural promise the labelling rules rely on, checked at load time:
 *  - ids unique, category known;
 *  - `maps_to` resolves to a real catalog node AND a real option of that node (the loud failure the brief asks
 *    for — a typo'd option id would otherwise silently produce a column that can never feed a prior);
 *  - every locus is in the closed vocabulary for its document type;
 *  - `detectable_in` is exactly the set of document types with a non-empty locus list. Nothing else is
 *    coherent: a feature declared detectable with no witness locus could never license a negative, and a
 *    feature with loci but not declared detectable would silently never be asked.
 */
export function validateLexicon(lex: Lexicon, nodeIndex: Map<string, Set<string>>): LexiconIssue[] {
  const issues: LexiconIssue[] = [];
  const categoryIds = new Set<string>();
  for (const c of lex.categories) {
    if (categoryIds.has(c.id)) issues.push({ where: `category ${c.id}`, problem: "duplicate category id" });
    categoryIds.add(c.id);
    for (const dt of DOC_TYPES) {
      for (const l of c.context_loci[dt]) {
        if (!isKnownLocus(dt, l)) issues.push({ where: `category ${c.id}`, problem: `unknown ${dt} context locus "${l}"` });
      }
    }
  }
  const seen = new Set<string>();
  for (const f of lex.features) {
    const w = `feature ${f.id}`;
    if (seen.has(f.id)) issues.push({ where: w, problem: "duplicate feature id" });
    seen.add(f.id);
    if (!categoryIds.has(f.category)) issues.push({ where: w, problem: `unknown category "${f.category}"` });
    if (f.maps_to) {
      const options = nodeIndex.get(f.maps_to.node);
      if (!options) issues.push({ where: w, problem: `maps_to.node "${f.maps_to.node}" is not a catalog node` });
      else if (!options.has(f.maps_to.option)) {
        issues.push({ where: w, problem: `maps_to.option "${f.maps_to.option}" is not an option of node "${f.maps_to.node}" (has: ${[...options].join(", ")})` });
      }
    }
    for (const dt of DOC_TYPES) {
      for (const l of f.loci[dt]) if (!isKnownLocus(dt, l)) issues.push({ where: w, problem: `unknown ${dt} locus "${l}"` });
      const declared = f.loci[dt].length > 0;
      const claimed = f.detectable_in.includes(dt);
      if (declared && !claimed) issues.push({ where: w, problem: `declares ${dt} loci but is not detectable_in "${dt}"` });
      if (claimed && !declared) issues.push({ where: w, problem: `detectable_in "${dt}" but declares no ${dt} witness locus` });
    }
    if (f.detectable_in.length === 0) issues.push({ where: w, problem: "detectable in no document type — it can never be observed" });
  }
  return issues;
}

export function assertLexicon(lex: Lexicon, nodeIndex: Map<string, Set<string>>): void {
  const issues = validateLexicon(lex, nodeIndex);
  if (issues.length) {
    throw new Error(`lexicon invalid (${issues.length} problem${issues.length === 1 ? "" : "s"}):\n${issues.map((i) => `  - ${i.where}: ${i.problem}`).join("\n")}`);
  }
}

// ---------- loading ----------

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_LEXICON_FILE = path.resolve(here, "../../catalogs/lexicon/lexicon.json");

export async function loadLexicon(file: string = DEFAULT_LEXICON_FILE): Promise<Lexicon> {
  return LexiconSchema.parse(JSON.parse(await fs.readFile(file, "utf8")));
}

/** Load + validate against the catalogs on disk. Throws on the first invalid entry, listing all of them. */
export async function loadValidatedLexicon(file: string = DEFAULT_LEXICON_FILE): Promise<{ lexicon: Lexicon; nodeIndex: Map<string, Set<string>>; catalogVersion: string }> {
  const { loadCatalogs } = await import("../engine/catalogs.js");
  const catalogs = await loadCatalogs();
  const lexicon = await loadLexicon(file);
  const nodeIndex = catalogNodeIndex(catalogs.catalogs);
  assertLexicon(lexicon, nodeIndex);
  return { lexicon, nodeIndex, catalogVersion: catalogs.version };
}

// ---------- accessors ----------

export function categoriesById(lex: Lexicon): Map<string, LexiconCategory> {
  return new Map(lex.categories.map((c) => [c.id, c]));
}

export function featuresById(lex: Lexicon): Map<string, LexiconEntry> {
  return new Map(lex.features.map((f) => [f.id, f]));
}

/** Features that could, in principle, be witnessed in this document type. The rest are `unobserved` a priori. */
export function detectableIn(lex: Lexicon, docType: DocType): LexiconEntry[] {
  return lex.features.filter((f) => f.detectable_in.includes(docType));
}

/** Features with no catalog home — a real output of this pipeline (catalog-gap candidates). */
export function gapCandidates(lex: Lexicon): LexiconEntry[] {
  return lex.features.filter((f) => f.maps_to === null);
}

export interface LexiconStats {
  features: number;
  mapped: number;
  gaps: number;
  categories: number;
  by_doc_type: Record<DocType, number>;
  nodes_covered: number;
}

export function lexiconStats(lex: Lexicon): LexiconStats {
  const nodes = new Set(lex.features.flatMap((f) => (f.maps_to ? [f.maps_to.node] : [])));
  return {
    features: lex.features.length,
    mapped: lex.features.filter((f) => f.maps_to).length,
    gaps: gapCandidates(lex).length,
    categories: lex.categories.length,
    by_doc_type: { repo: detectableIn(lex, "repo").length, spec_doc: detectableIn(lex, "spec_doc").length },
    nodes_covered: nodes.size,
  };
}

// ---------- CLI (validation only; `npm run label` and `npm run detectability` are the real entry points) ----------

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { lexicon, catalogVersion } = await loadValidatedLexicon();
  const s = lexiconStats(lexicon);
  console.log(`lexicon ${lexicon.version} valid against catalogs ${catalogVersion}`);
  console.log(`  ${s.features} features · ${s.mapped} mapped to ${s.nodes_covered} catalog nodes · ${s.gaps} catalog-gap candidates · ${s.categories} categories`);
  console.log(`  detectable in repo: ${s.by_doc_type.repo} · in spec_doc: ${s.by_doc_type.spec_doc}`);
  for (const g of gapCandidates(lexicon)) console.log(`  gap: ${g.id.padEnd(34)} ${g.label}`);
}
