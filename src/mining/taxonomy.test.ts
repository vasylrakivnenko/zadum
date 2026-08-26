import { describe, it, expect } from "vitest";
import {
  DEFAULT_TAXONOMY_FILE,
  TAXONOMY_SCHEMA_ID,
  TaxonomyOverlaySchema,
  assertTaxonomy,
  entriesByNodeId,
  layerCycles,
  layerOf,
  layerPath,
  loadTaxonomy,
  loadValidatedTaxonomy,
  nodesByLayer,
  renderTaxonomyReport,
  taxonomyReport,
  taxonomyStats,
  unclassifiedNodes,
  validateTaxonomy,
  type TaxonomyLayer,
  type TaxonomyNode,
  type TaxonomyOverlay,
} from "./taxonomy.js";
import { catalogNodeIndex, type Lexicon } from "./lexicon.js";
import { loadCatalogs } from "../engine/catalogs.js";

// ---------- synthetic fixtures (pure, no IO) ----------

const layer = (id: string, parent_id: string | null = null): TaxonomyLayer => ({ id, label: `layer ${id}`, parent_id });

const node = (node_id: string, layer_id: string, category = "cat"): TaxonomyNode => ({ node_id, layer_id, category, status: "canonical" });

const overlayOf = (layers: TaxonomyLayer[], nodes: TaxonomyNode[]): TaxonomyOverlay => ({
  schema: TAXONOMY_SCHEMA_ID,
  version: "test-1",
  description: "",
  layers,
  nodes,
});

/** three catalog nodes, the shape `catalogNodeIndex` produces */
const INDEX = new Map<string, Set<string>>([
  ["user_accounts", new Set(["none", "single_user", "multi_user"])],
  ["payments_in_app", new Set(["none", "collect_online"])],
  ["reporting", new Set(["lists_only", "basic_dashboard"])],
]);

const TEST_OVERLAY = overlayOf(
  [layer("actors_and_access"), layer("payments_and_commercial"), layer("operations_and_reporting")],
  [
    node("user_accounts", "actors_and_access", "identity"),
    node("payments_in_app", "payments_and_commercial", "money_movement"),
    node("reporting", "operations_and_reporting", "reporting"),
  ],
);

const problemsOf = (overlay: TaxonomyOverlay, index = INDEX) => validateTaxonomy(overlay, index).map((i) => `${i.where}: ${i.problem}`);

// ---------- the real overlay ----------

describe("taxonomy: the real catalogs/taxonomy/overlay.json", () => {
  it("validates against all current catalogs with zero issues", async () => {
    const { overlay, nodeIndex, catalogVersion } = await loadValidatedTaxonomy(); // throws on any bad reference
    expect(catalogVersion).toContain("core@");
    expect(validateTaxonomy(overlay, nodeIndex)).toEqual([]);
    expect(overlay.schema).toBe(TAXONOMY_SCHEMA_ID);
    expect(DEFAULT_TAXONOMY_FILE.endsWith("/catalogs/taxonomy/overlay.json")).toBe(true);
  });

  it("leaves zero catalog nodes unclassified — a node added to a catalog must be classified too", async () => {
    const overlay = await loadTaxonomy();
    const { catalogs } = await loadCatalogs();
    const nodeIndex = catalogNodeIndex(catalogs);
    expect(unclassifiedNodes(overlay, nodeIndex)).toEqual([]);
    expect(overlay.nodes.length).toBe(nodeIndex.size);
  });

  it("references catalog nodes and never restates them", async () => {
    const overlay = await loadTaxonomy();
    const { catalogs } = await loadCatalogs();
    const nodeIndex = catalogNodeIndex(catalogs);
    for (const n of overlay.nodes) {
      expect(nodeIndex.has(n.node_id), n.node_id).toBe(true);
      // an entry carries classification only — no question, no options, no topic to go stale
      expect(Object.keys(n).sort()).toEqual(["category", "layer_id", "node_id", "status"]);
    }
  });

  it("declares the ten evidence-matrix layers, all acyclic roots", async () => {
    const overlay = await loadTaxonomy();
    expect(overlay.layers.map((l) => l.id)).toEqual([
      "scope_and_archetype",
      "actors_and_access",
      "domain_and_workflow",
      "data_and_lifecycle",
      "payments_and_commercial",
      "communication_and_integrations",
      "operations_and_reporting",
      "platform_and_quality",
      "security_and_compliance",
      "other",
    ]);
    expect(layerCycles(overlay.layers)).toEqual([]);
    for (const l of overlay.layers) expect(layerPath(overlay, l.id).map((x) => x.id)).toEqual([l.id]);
  });

  it("every category is finer-grained than its layer, and the coarse axis is usable", async () => {
    const overlay = await loadTaxonomy();
    const grouped = nodesByLayer(overlay);
    for (const [layerId, entries] of grouped) {
      for (const e of entries) expect(e.category, `${e.node_id}`).not.toBe(layerId);
    }
    const s = taxonomyStats(overlay);
    expect(s.categories).toBeGreaterThan(s.layers); // a real second level, not a relabelled first
    expect(s.by_status.canonical + s.by_status.provisional + s.by_status.deprecated).toBe(s.classified);
    // no layer swallows the catalog: an axis where one bucket holds most nodes cannot be summed over
    for (const entries of grouped.values()) expect(entries.length).toBeLessThan(s.classified / 2);
  });

  it("the on-disk file parses under the schema", async () => {
    const overlay = await loadTaxonomy();
    expect(TaxonomyOverlaySchema.safeParse(overlay).success).toBe(true);
  });
});

// ---------- validation fails loudly ----------

describe("taxonomy: validation fails loudly", () => {
  it("accepts the valid hand-built overlay", () => {
    expect(validateTaxonomy(TEST_OVERLAY, INDEX)).toEqual([]);
    expect(() => assertTaxonomy(TEST_OVERLAY, INDEX)).not.toThrow();
  });

  it("rejects a node id that is not a catalog node", () => {
    const bad = overlayOf(TEST_OVERLAY.layers, [...TEST_OVERLAY.nodes, node("not_a_node", "actors_and_access")]);
    const problems = problemsOf(bad);
    expect(problems.some((p) => p.includes("not_a_node") && p.includes("is not a catalog node"))).toBe(true);
    expect(() => assertTaxonomy(bad, INDEX)).toThrow(/taxonomy overlay invalid \(1 problem\)/);
  });

  it("rejects an entry whose layer_id is not a declared layer", () => {
    const bad = overlayOf(TEST_OVERLAY.layers, [node("user_accounts", "no_such_layer"), node("reporting", "operations_and_reporting")]);
    const problems = problemsOf(bad);
    expect(problems.some((p) => p.includes("user_accounts") && p.includes('layer_id "no_such_layer" is not a declared layer'))).toBe(true);
  });

  it("rejects a parent_id that is not a declared layer", () => {
    const bad = overlayOf([layer("actors_and_access", "ghost_parent")], [node("user_accounts", "actors_and_access")]);
    const problems = problemsOf(bad);
    expect(problems.some((p) => p.includes("actors_and_access") && p.includes('parent_id "ghost_parent" is not a declared layer'))).toBe(true);
  });

  it("rejects a cyclic layer parent chain and reports the cycle path", () => {
    const bad = overlayOf([layer("a", "b"), layer("b", "c"), layer("c", "a")], [node("user_accounts", "a")]);
    const problems = problemsOf(bad);
    expect(problems.some((p) => p.includes("layer parent cycle") && p.includes("a -> b -> c -> a"))).toBe(true);
    // one cycle, reported once, however many layers sit on it
    expect(problems.filter((p) => p.includes("layer parent cycle")).length).toBe(1);
    expect(() => assertTaxonomy(bad, INDEX)).toThrow(/layer parent cycle/);
  });

  it("rejects a layer that is its own parent (a 1-cycle), without hanging", () => {
    const bad = overlayOf([layer("a", "a")], [node("user_accounts", "a")]);
    expect(problemsOf(bad).some((p) => p.includes("layer parent cycle: a -> a"))).toBe(true);
    expect(layerPath(bad, "a").map((l) => l.id)).toEqual(["a"]); // walking up terminates
  });

  it("rejects a duplicate node entry — a node may be classified only once", () => {
    const bad = overlayOf(TEST_OVERLAY.layers, [node("user_accounts", "actors_and_access", "identity"), node("user_accounts", "payments_and_commercial", "money_movement")]);
    const problems = problemsOf(bad);
    expect(problems.some((p) => p.includes("user_accounts") && p.includes("duplicate node entry"))).toBe(true);
  });

  it("rejects a duplicate layer id", () => {
    const bad = overlayOf([layer("actors_and_access"), layer("actors_and_access")], [node("user_accounts", "actors_and_access")]);
    expect(problemsOf(bad).some((p) => p.includes("duplicate layer id"))).toBe(true);
  });

  it("lists every problem at once rather than the first", () => {
    const bad = overlayOf([layer("a"), layer("a")], [node("ghost", "nowhere"), node("user_accounts", "a"), node("user_accounts", "a")]);
    expect(validateTaxonomy(bad, INDEX).length).toBe(4); // dup layer, ghost node id, unknown layer_id, dup entry
    expect(() => assertTaxonomy(bad, INDEX)).toThrow(/taxonomy overlay invalid \(4 problems\)/);
  });

  it("refuses a foreign schema id at parse time", () => {
    expect(TaxonomyOverlaySchema.safeParse({ ...TEST_OVERLAY, schema: "zadum.taxonomy-overlay.v2" }).success).toBe(false);
  });
});

// ---------- unclassified is drift, not failure ----------

describe("unclassifiedNodes", () => {
  it("reports a catalog node the overlay omits, and does NOT make validation fail", () => {
    const partial = overlayOf(TEST_OVERLAY.layers, [node("user_accounts", "actors_and_access", "identity")]);
    expect(unclassifiedNodes(partial, INDEX)).toEqual(["payments_in_app", "reporting"]); // sorted
    expect(validateTaxonomy(partial, INDEX)).toEqual([]);
    expect(() => assertTaxonomy(partial, INDEX)).not.toThrow();
  });

  it("is empty when the overlay covers every catalog node", () => {
    expect(unclassifiedNodes(TEST_OVERLAY, INDEX)).toEqual([]);
  });
});

// ---------- report (pure) ----------

const TEST_LEXICON: Lexicon = {
  version: "lex-1",
  description: "",
  categories: [
    { id: "identity_access", label: "Who logs in", context_loci: { repo: ["auth_code"], spec_doc: ["actors_section"] } },
    { id: "payments", label: "Money moving", context_loci: { repo: ["payment_code"], spec_doc: ["payments_section"] } },
    { id: "unused_category", label: "Nothing here yet", context_loci: { repo: ["readme"], spec_doc: ["overview"] } },
  ],
  features: [
    { id: "has_login", label: "has a login", category: "identity_access", maps_to: { node: "user_accounts", option: "multi_user" }, loci: { repo: ["auth_code"], spec_doc: [] }, detectable_in: ["repo"] },
    { id: "has_sso", label: "has SSO", category: "identity_access", maps_to: null, loci: { repo: ["auth_code"], spec_doc: [] }, detectable_in: ["repo"] },
    { id: "takes_cards", label: "takes cards", category: "payments", maps_to: { node: "payments_in_app", option: "collect_online" }, loci: { repo: ["payment_code"], spec_doc: [] }, detectable_in: ["repo"] },
    { id: "does_dunning", label: "chases late payment", category: "payments", maps_to: null, loci: { repo: ["background_jobs"], spec_doc: [] }, detectable_in: ["repo"] },
  ],
};

describe("taxonomyReport", () => {
  it("counts nodes by layer, including layers with nothing in them", () => {
    const overlay = overlayOf(
      [layer("actors_and_access"), layer("payments_and_commercial"), layer("operations_and_reporting"), layer("other")],
      [
        node("user_accounts", "actors_and_access", "identity"),
        node("payments_in_app", "payments_and_commercial", "money_movement"),
        node("reporting", "actors_and_access", "permissions"),
      ],
    );
    const report = taxonomyReport({ overlay, nodeIndex: INDEX, catalogVersion: "core@test" });
    expect(report.by_layer.map((l) => [l.layer_id, l.nodes])).toEqual([
      ["actors_and_access", 2],
      ["payments_and_commercial", 1],
      ["operations_and_reporting", 0],
      ["other", 0],
    ]);
    expect(report.by_layer[0]!.categories).toEqual([
      { category: "identity", nodes: 1 },
      { category: "permissions", nodes: 1 },
    ]);
    expect(report.totals).toEqual({ catalog_nodes: 3, classified: 3, unclassified: 0, layers: 4, categories: 3 });
    expect(report.by_status).toEqual({ canonical: 3, provisional: 0, deprecated: 0 });
    expect(report.versions).toEqual({ taxonomy: "test-1", catalog: "core@test", lexicon: null });
  });

  it("lists unclassified catalog nodes without counting them as classified", () => {
    const partial = overlayOf(TEST_OVERLAY.layers, [node("user_accounts", "actors_and_access", "identity")]);
    const report = taxonomyReport({ overlay: partial, nodeIndex: INDEX });
    expect(report.unclassified).toEqual(["payments_in_app", "reporting"]);
    expect(report.totals.classified).toBe(1);
    expect(report.totals.unclassified).toBe(2);
    expect(report.totals.catalog_nodes).toBe(3);
    expect(report.versions.catalog).toBe("unknown");
  });

  it("counts lexicon features by category and lists the catalog-gap feature ids", () => {
    const report = taxonomyReport({ overlay: TEST_OVERLAY, nodeIndex: INDEX, lexicon: TEST_LEXICON, catalogVersion: "core@test" });
    expect(report.lexicon).toEqual({
      features: 4,
      by_category: [
        { category: "identity_access", features: 2 },
        { category: "payments", features: 2 },
        { category: "unused_category", features: 0 },
      ],
      catalog_gaps: ["does_dunning", "has_sso"], // sorted
    });
    expect(report.versions.lexicon).toBe("lex-1");
  });

  it("omits the lexicon half when no lexicon is supplied", () => {
    const report = taxonomyReport({ overlay: TEST_OVERLAY, nodeIndex: INDEX });
    expect(report.lexicon).toBeNull();
    expect(report.versions.lexicon).toBeNull();
  });

  it("is pure — same inputs, byte-identical output", () => {
    const a = taxonomyReport({ overlay: TEST_OVERLAY, nodeIndex: INDEX, lexicon: TEST_LEXICON, catalogVersion: "core@test" });
    const b = taxonomyReport({ overlay: TEST_OVERLAY, nodeIndex: INDEX, lexicon: TEST_LEXICON, catalogVersion: "core@test" });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("renderTaxonomyReport", () => {
  it("renders versions, the layer histogram, the gap lists and the no-drift case", () => {
    const text = renderTaxonomyReport(taxonomyReport({ overlay: TEST_OVERLAY, nodeIndex: INDEX, lexicon: TEST_LEXICON, catalogVersion: "core@test" }));
    expect(text).toContain("# Taxonomy overlay test-1");
    expect(text).toContain("catalogs: core@test");
    expect(text).toContain("lexicon:  lex-1");
    expect(text).toContain("3/3 catalog nodes classified into 3 layers");
    expect(text).toContain("actors_and_access");
    expect(text).toContain("(none — the overlay covers every catalog node)");
    expect(text).toContain("Catalog-gap features (2 of 4)");
    expect(text).toContain("- has_sso");
  });

  it("names the unclassified nodes when the overlay has drifted", () => {
    const partial = overlayOf(TEST_OVERLAY.layers, [node("user_accounts", "actors_and_access", "identity")]);
    const text = renderTaxonomyReport(taxonomyReport({ overlay: partial, nodeIndex: INDEX }));
    expect(text).toContain("lexicon:  (not loaded)");
    expect(text).toContain("- payments_in_app");
    expect(text).toContain("- reporting");
    expect(text).not.toContain("Lexicon features by category");
  });

  it("renders the real overlay without throwing", async () => {
    const { overlay, nodeIndex, catalogVersion } = await loadValidatedTaxonomy();
    const text = renderTaxonomyReport(taxonomyReport({ overlay, nodeIndex, catalogVersion }));
    expect(text).toContain(`# Taxonomy overlay ${overlay.version}`);
    expect(text).toContain("(none — the overlay covers every catalog node)");
  });
});

// ---------- accessors ----------

describe("accessors", () => {
  it("index and group the overlay by node and by layer", () => {
    expect(entriesByNodeId(TEST_OVERLAY).get("payments_in_app")?.category).toBe("money_movement");
    expect([...nodesByLayer(TEST_OVERLAY).keys()]).toEqual(["actors_and_access", "payments_and_commercial", "operations_and_reporting"]);
    expect(layerOf(TEST_OVERLAY, "user_accounts")?.id).toBe("actors_and_access");
    expect(layerOf(TEST_OVERLAY, "not_classified")).toBeUndefined();
  });

  it("walks a nested layer up to its root, nearest first", () => {
    const nested = overlayOf([layer("leaf", "mid"), layer("mid", "root"), layer("root")], [node("user_accounts", "leaf")]);
    expect(validateTaxonomy(nested, INDEX)).toEqual([]);
    expect(layerPath(nested, "leaf").map((l) => l.id)).toEqual(["leaf", "mid", "root"]);
    expect(layerPath(nested, "ghost")).toEqual([]);
  });
});
