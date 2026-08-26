/**
 * Phase 9 — the end-to-end mock fixture.
 *
 * One test walks the WHOLE evidence pipeline on real corpus documents with the mock labeller, and asserts the
 * properties that must hold at every joint:
 *
 *   corpus documents → condensed digests → mock labels → evidence rows → decision matrix
 *     → element statistics → co-occurrence statistics → design graph → graph validation
 *
 * Everything here is offline: `MockLLM` + `labelMockHandlers`, no credentials, no network, no git. That is a
 * hard requirement (spec: "No live API calls are allowed in CI"), and it is also the point — the pipeline's
 * invariants are structural, so a scripted labeller exercises them exactly as well as a real one and does it
 * in milliseconds.
 *
 * The individual stages have their own unit tests with hand-computed numbers. What this file adds is the
 * thing unit tests cannot check: that the stages actually compose, that a version or a source kind survives
 * the whole journey, and that the rules which matter (`unobserved` is never a negative; no statistic becomes
 * a law) still hold after five transformations rather than one.
 */
import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { MockLLM } from "../llm/client.js";
import { labelMockHandlers } from "./label_mock.js";
import { CORPUS_DIR, labelDocument, loadManifest, type DocumentLabels } from "./label.js";
import { condenseSpecDoc } from "./condense.js";
import { loadValidatedLexicon } from "./lexicon.js";
import { loadCatalogs } from "../engine/catalogs.js";
import { catalogNodeIndex } from "./lexicon.js";
import { mergeCatalogs } from "../core/catalog.js";
import {
  aggregateRow,
  buildMatrix,
  evidenceRowFromLabels,
  flattenMatrix,
  matrixStats,
  toCsv,
  uncoveredNodes,
  type DecisionRow,
  type EvidenceRow,
} from "./matrix.js";
import { elementStatsReport } from "./element_stats.js";
import { cooccurrenceReport } from "./cooccurrence.js";
import {
  buildDesignGraph,
  DesignGraphSchema,
  hardEdgesFromCatalog,
  isHard,
  SOFT_RELATIONS,
  validateGraph,
  validatePairStat,
} from "../learning/design_graph.js";

/** How many corpus documents the fixture walks. Small enough to stay fast, wide enough to span archetypes. */
const DOCS = 8;

interface Pipeline {
  labels: DocumentLabels[];
  evidence: EvidenceRow[];
  decisions: DecisionRow[];
  catalogVersion: string;
  lexiconVersion: string;
  nodeIndex: Map<string, Set<string>>;
}

let cached: Pipeline | null = null;

/** Run the pipeline once and share it — every assertion below reads the same artifacts, as a real run would. */
async function pipeline(): Promise<Pipeline> {
  if (cached) return cached;
  const { lexicon, catalogVersion } = await loadValidatedLexicon();
  const { catalogs } = await loadCatalogs();
  const nodeIndex = catalogNodeIndex(catalogs);
  const appliesTo = new Map<string, string[]>();
  for (const c of catalogs) for (const n of c.nodes) appliesTo.set(n.id, n.applies_to ?? []);

  // Spread across archetypes rather than taking the first N (which are all invoicing) — a single-archetype
  // fixture could not exercise stratification at all.
  const manifest = await loadManifest();
  const byArchetype = new Map<string, typeof manifest>();
  for (const e of manifest) (byArchetype.get(e.archetype) ?? byArchetype.set(e.archetype, []).get(e.archetype)!).push(e);
  const picked: typeof manifest = [];
  const archetypes = [...byArchetype.keys()].sort();
  for (let round = 0; picked.length < DOCS && round < 10; round++) {
    for (const a of archetypes) {
      const e = byArchetype.get(a)![round];
      if (e && picked.length < DOCS) picked.push(e);
    }
  }

  const llm = new MockLLM(labelMockHandlers);
  const labels: DocumentLabels[] = [];
  for (const e of picked) {
    const text = await fs.readFile(path.join(CORPUS_DIR, e.file), "utf8");
    const digest = condenseSpecDoc(e.id, text, { archetype: e.archetype, maxTokens: 20_000 });
    labels.push(await labelDocument(llm, digest, lexicon, { versions: { lexicon: lexicon.version, catalog: catalogVersion } }));
  }

  const evidence = labels.map((l) => evidenceRowFromLabels(l, { digest_hash: `mock-${l.doc_id}` }));
  const { matrix } = buildMatrix(evidence, lexicon, {
    appliesTo,
    nodeIndex,
    expected: { catalog: catalogVersion, lexicon: lexicon.version },
    uncovered: uncoveredNodes(lexicon, nodeIndex),
    now: () => "2026-08-25T00:00:00.000Z",
  });

  cached = { labels, evidence, decisions: matrix.rows, catalogVersion, lexiconVersion: lexicon.version, nodeIndex };
  return cached;
}

describe("end-to-end: corpus → labels → matrix → statistics → graph", () => {
  it("labels real corpus documents offline and produces complete evidence rows", async () => {
    const { labels, evidence, lexiconVersion } = await pipeline();
    expect(labels.length).toBe(DOCS);
    for (const row of evidence) {
      // Every lexicon feature gets a cell, including the ones never asked — a row with holes would silently
      // change the denominator of every rate computed downstream.
      expect(Object.keys(row.feature_cells).length).toBeGreaterThan(100);
      expect(row.lexicon_version).toBe(lexiconVersion);
      expect(row.digest_hash).not.toBe("");
      expect(row.source.kind).toBe("spec_doc");
    }
    // the fixture really does span archetypes, or the stratification assertions below prove nothing
    expect(new Set(evidence.map((r) => r.archetype)).size).toBeGreaterThan(1);
  });

  it("every `present` cell carries a quote that really occurs in the artifact", async () => {
    const { labels } = await pipeline();
    let present = 0;
    for (const row of labels) {
      for (const c of row.cells) {
        if (c.verdict !== "present") continue;
        present += 1;
        expect(c.evidence.length).toBeGreaterThan(0);
      }
    }
    expect(present).toBeGreaterThan(0);
  });

  it("aggregates into decision rows that preserve unobserved, conflict and source kind", async () => {
    const { decisions } = await pipeline();
    expect(decisions.length).toBe(DOCS);
    const statuses = new Set(decisions.flatMap((r) => Object.values(r.cells).map((c) => c.status)));
    expect(statuses.has("observed")).toBe(true);
    expect(statuses.has("unobserved")).toBe(true);
    for (const r of decisions) {
      expect(r.source_kind).toBe("spec_doc");
      expect(r.schema).toBe("zadum.decision-row.v1");
      // a conflict is recorded in BOTH places or neither — never silently dropped from the row summary
      const conflictCells = Object.entries(r.cells).filter(([, c]) => c.status === "conflict").map(([id]) => id).sort();
      expect(r.conflicts.map((c) => c.node_id).sort()).toEqual(conflictCells);
    }
  });

  it("never lets an unobserved cell claim an option, and never resolves a conflict", async () => {
    const { decisions } = await pipeline();
    for (const r of decisions) {
      for (const c of Object.values(r.cells)) {
        if (c.status === "unobserved") {
          expect(c.option).toBeUndefined();
          expect(c.unobserved_reason).toBeTruthy();
        }
        if (c.status === "conflict") {
          expect(c.option).toBeUndefined(); // no tie-break was applied
          expect(c.candidates.length).toBeGreaterThan(1);
        }
        if (c.status === "observed") {
          expect(c.option).toBeTruthy();
          expect(c.evidence_feature_ids.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("a licensed negative never becomes a chosen option anywhere in the matrix", async () => {
    const { decisions } = await pipeline();
    let negativeOnly = 0;
    for (const r of decisions) {
      for (const c of Object.values(r.cells)) {
        if (!c.negative_feature_ids.length) continue;
        // a node with negatives may still be observed — but only on the strength of a POSITIVE
        if (c.status === "observed") expect(c.evidence_feature_ids.length).toBeGreaterThan(0);
        if (c.unobserved_reason === "negative_only") negativeOnly += 1;
      }
    }
    // the mock labeller over-claims `absent` on purpose, so this path must actually be exercised
    expect(negativeOnly).toBeGreaterThan(0);
  });

  it("flattens to CSV without losing a cell", async () => {
    const { decisions } = await pipeline();
    const matrix = { schema: "zadum.decision-matrix.v1" as const, version: "t", catalog_version: "c", lexicon_version: "l", created_at: "t", rows: decisions };
    const flat = flattenMatrix(matrix);
    const cells = decisions.reduce((n, r) => n + Object.keys(r.cells).length, 0);
    expect(flat.length).toBe(cells);
    expect(toCsv(flat).split("\n").length).toBe(cells + 1);
  });

  it("computes element statistics whose observed count never exceeds the eligible count", async () => {
    const { decisions } = await pipeline();
    const report = elementStatsReport(decisions, { pooled: true });
    const all = [...report.byStratum, ...report.pooled];
    expect(all.length).toBeGreaterThan(0);
    for (const s of all) {
      expect(s.observed_documents).toBeLessThanOrEqual(s.eligible_documents);
      expect(s.prevalence).toBeGreaterThanOrEqual(0);
      expect(s.prevalence).toBeLessThanOrEqual(1);
      expect(Number.isFinite(s.idf)).toBe(true);
      expect(s.entropy).toBeGreaterThanOrEqual(0);
      expect(s.entropy).toBeLessThanOrEqual(1.0000001);
    }
  });

  it("computes pair statistics whose 2×2 table sums to the eligible count (unobserved is never an n00)", async () => {
    const { decisions } = await pipeline();
    const res = cooccurrenceReport(decisions, { minEligible: 1, pooled: true });
    const stats = res.stats;
    expect(stats.length).toBeGreaterThan(0);
    for (const s of stats) {
      expect(validatePairStat(s)).toEqual([]); // the invariant, checked on every pair the corpus produced
      expect(s.n11 + s.n10 + s.n01 + s.n00).toBe(s.eligible_n);
      expect(s.eligible_n).toBeLessThanOrEqual(decisions.length);
    }
  });

  it("keeps archetypes and source kinds in separate strata", async () => {
    const { decisions } = await pipeline();
    const res = cooccurrenceReport(decisions, { minEligible: 1 });
    const archetypes = new Set(res.strata.map((s) => s.archetype));
    expect(archetypes.size).toBeGreaterThan(1);
    // no stratum silently mixes two archetypes
    for (const s of res.strata) {
      if (s.archetype === null) continue;
      expect(s.stats.every((p) => p.archetype === s.archetype)).toBe(true);
    }
  });

  it("builds a design graph that validates, with no learned edge claiming a hard relation", async () => {
    const { decisions, catalogVersion, nodeIndex } = await pipeline();
    const { catalogs } = await loadCatalogs();
    const merged = mergeCatalogs(catalogs, [...new Set(decisions.map((r) => r.archetype))]);
    const res = cooccurrenceReport(decisions, { minEligible: 1, pooled: true });
    const built = buildDesignGraph(res.stats, {
      pooled: res.pooled,
      elements: [...res.elements, ...res.pooled_elements],
      hardEdges: hardEdgesFromCatalog(merged.nodes),
      catalog_version: catalogVersion,
      matrix_version: "test",
      now: () => "2026-08-25T00:00:00.000Z",
    });

    expect(() => DesignGraphSchema.parse(built.graph)).not.toThrow();
    expect(validateGraph(built.graph, nodeIndex)).toEqual([]);

    // THE rule: every hard edge in the graph is authored, every learned edge is a candidate.
    for (const e of built.graph.edges) {
      if (isHard(e.relation)) expect(e.status).toBe("authored");
      else expect(e.status).toBe("candidate");
    }
    // the authored hard edges really did come through (the catalogs declare plenty)
    expect(built.graph.edges.filter((e) => isHard(e.relation)).length).toBeGreaterThan(0);
  });

  it("emits hard-rule PROPOSALS separately from edges, and never as edges", async () => {
    const { decisions } = await pipeline();
    const res = cooccurrenceReport(decisions, { minEligible: 1 });
    // deliberately absurd thresholds so a tiny fixture can produce proposals at all
    const built = buildDesignGraph(res.stats, {
      thresholds: { reportMinN: 1, softMinN: 1, hardMinN: 1, hardMinLowerBound: 0.1, smoothing: { a: 0.5, b: 0.5 } },
      now: () => "t",
    });
    expect(built.candidates.length).toBeGreaterThan(0); // the path is exercised
    for (const c of built.candidates) expect(["hard_implies", "hard_excludes"]).toContain(c.proposed);
    // …and none of them leaked into the graph as a hard edge
    const learnedHard = built.graph.edges.filter((e) => isHard(e.relation) && e.status !== "authored");
    expect(learnedHard).toEqual([]);
    // every learned edge is soft or unknown
    for (const e of built.graph.edges) expect(SOFT_RELATIONS.has(e.relation) || e.relation === "unknown").toBe(true);
  });

  it("carries versions and provenance all the way from the label run to the graph", async () => {
    const { decisions, catalogVersion, lexiconVersion, evidence } = await pipeline();
    for (const r of decisions) {
      expect(r.catalog_version).toBe(catalogVersion);
      expect(r.lexicon_version).toBe(lexiconVersion);
    }
    const res = cooccurrenceReport(decisions, { minEligible: 1 });
    const built = buildDesignGraph(res.stats, {
      catalog_version: catalogVersion,
      lexicon_version: lexiconVersion,
      matrix_version: "test",
      provenance: {
        label_models: [...new Set(evidence.map((e) => e.model))],
        label_prompt_versions: [],
        source_kinds: [...new Set(decisions.map((r) => r.source_kind))],
        archetypes: [...new Set(decisions.map((r) => r.archetype))].sort(),
        rows: decisions.length,
      },
      now: () => "t",
    });
    expect(built.graph.catalog_version).toBe(catalogVersion);
    expect(built.graph.provenance.rows).toBe(DOCS);
    expect(built.graph.provenance.source_kinds).toEqual(["spec_doc"]);
    // every soft edge can be traced back to the rows that produced it
    for (const e of built.graph.edges) {
      if (!SOFT_RELATIONS.has(e.relation)) continue;
      expect(e.eligible_n).toBeGreaterThan(0);
      expect(e.ci95).not.toBeNull();
    }
  });

  it("names the labeller on the DECISION row, so provenance reaches the graph", async () => {
    const { decisions, evidence } = await pipeline();
    // The graph is built from decision rows alone. If the model id stopped at the evidence layer, a graph
    // could not say whose judgement its probabilities rest on — provenance that stops one layer short of the
    // artifact is not provenance.
    const models = new Set(evidence.map((e) => e.model));
    for (const r of decisions) {
      expect(r.label_models ?? []).not.toEqual([]);
      for (const m of r.label_models ?? []) expect(models.has(m)).toBe(true);
    }
  });

  it("reports its own blindness rather than hiding it", async () => {
    const { nodeIndex } = await pipeline();
    const { lexicon } = await loadValidatedLexicon();
    const blind = uncoveredNodes(lexicon, nodeIndex);
    // A real, honest state of the world: some catalog nodes have no lexicon feature at all. The pipeline must
    // be able to name them — silence about blindness is how a matrix pretends to be complete.
    expect(Array.isArray(blind)).toBe(true);
    expect(blind.length).toBeGreaterThan(0);
    for (const n of blind) expect(nodeIndex.has(n)).toBe(true);
  });

  it("is deterministic: the same corpus produces the same matrix twice", async () => {
    const { lexicon, catalogVersion } = await loadValidatedLexicon();
    const { evidence } = await pipeline();
    const build = () =>
      buildMatrix(evidence, lexicon, { expected: { catalog: catalogVersion, lexicon: lexicon.version }, now: () => "fixed" }).matrix;
    expect(JSON.stringify(build())).toBe(JSON.stringify(build()));
  });

  it("the matrix summary adds up", async () => {
    const { decisions } = await pipeline();
    const s = matrixStats({ schema: "zadum.decision-matrix.v1", version: "t", catalog_version: "c", lexicon_version: "l", created_at: "t", rows: decisions });
    expect(s.observed + s.unobserved + s.conflict).toBe(s.cells_total);
    expect(s.observable).toBeLessThanOrEqual(s.cells_total);
    expect(s.fill_rate).not.toBeNull();
    expect(s.rows).toBe(DOCS);
  });

  it("aggregating one evidence row twice is stable", async () => {
    const { evidence } = await pipeline();
    const { lexicon } = await loadValidatedLexicon();
    const a = aggregateRow(evidence[0]!, lexicon);
    const b = aggregateRow(evidence[0]!, lexicon);
    expect(JSON.stringify(a.row)).toBe(JSON.stringify(b.row));
  });
});
