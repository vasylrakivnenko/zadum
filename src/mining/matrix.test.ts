import { describe, expect, it } from "vitest";
import {
  aggregateRow,
  buildMatrix,
  checkVersion,
  consensusVerdict,
  decisionRowFromSession,
  DecisionRowSchema,
  EvidenceRowSchema,
  evidenceRowFromLabels,
  flattenMatrix,
  matrixStats,
  mergeRuns,
  parseJsonl,
  parseMatrixArgs,
  partitionByVersion,
  toCsv,
  uncoveredNodes,
  type EvidenceRow,
  type FeatureCell,
} from "./matrix.js";
import { loadValidatedLexicon, catalogNodeIndex, type Lexicon } from "./lexicon.js";
import { loadCatalogs } from "../engine/catalogs.js";
import type { DocumentLabels } from "./label.js";
import { UsageError } from "../cli/flags.js";

// ---------------------------------------------------------------------------
// A tiny synthetic lexicon: two features pointing at OPPOSITE options of one node (so a conflict is
// constructible), one feature on a second node, and one catalog-gap feature that must be ignored.
// ---------------------------------------------------------------------------

const LEX: Lexicon = {
  version: "test-lex-1",
  description: "",
  categories: [
    { id: "identity_access", label: "Identity", context_loci: { repo: ["auth_code"], spec_doc: ["actors_section"] } },
    { id: "money", label: "Money", context_loci: { repo: ["payment_code"], spec_doc: ["payments_section"] } },
  ],
  features: [
    { id: "no_login", label: "Nobody logs in", category: "identity_access", maps_to: { node: "user_accounts", option: "none" }, loci: { repo: [], spec_doc: ["actors_section"] }, detectable_in: ["spec_doc"] },
    { id: "login_route", label: "A login route exists", category: "identity_access", maps_to: { node: "user_accounts", option: "multi_user" }, loci: { repo: ["auth_code"], spec_doc: ["actors_section"] }, detectable_in: ["repo", "spec_doc"] },
    { id: "stripe_checkout", label: "Stripe checkout", category: "money", maps_to: { node: "payments_in_app", option: "collect_online" }, loci: { repo: ["payment_code"], spec_doc: ["payments_section"] }, detectable_in: ["repo", "spec_doc"] },
    { id: "orphan_feature", label: "No catalog home", category: "money", maps_to: null, loci: { repo: ["payment_code"], spec_doc: [] }, detectable_in: ["repo"] },
  ],
};

const cell = (verdict: FeatureCell["verdict"], over: Partial<FeatureCell> = {}): FeatureCell => ({
  verdict,
  evidence: [],
  loci_checked: [],
  downgrade_reason: null,
  ...over,
});

const row = (cells: Record<string, FeatureCell>, over: Partial<EvidenceRow> = {}): EvidenceRow =>
  EvidenceRowSchema.parse({
    schema: "zadum.evidence-row.v1",
    row_id: "repo:acme/app@abc123",
    source: { kind: "repo", id: "acme/app", url: "https://github.com/acme/app", commit: "abc123", license: "MIT" },
    archetype: "crud-saas",
    catalog_version: "cat-1",
    lexicon_version: "test-lex-1",
    model: "mock",
    digest_hash: "deadbeef",
    run: 1,
    label_prompt_version: "p1",
    errors: [],
    feature_cells: cells,
    ...over,
  });

// ---------------------------------------------------------------------------

describe("evidence rows", () => {
  it("converts DocumentLabels into an evidence row, keeping quotes, loci and downgrade reasons", () => {
    const labels: DocumentLabels = {
      doc_id: "acme/app",
      doc_type: "repo",
      archetype: "crud-saas",
      run: 2,
      model: "claude-opus-4-8",
      lexicon_version: "test-lex-1",
      catalog_version: "cat-1",
      cells: [
        { feature_id: "login_route", category: "identity_access", verdict: "present", raw_verdict: "present", evidence: "router.post('/login')", loci_checked: ["auth_code"], downgrade_reason: null },
        { feature_id: "no_login", category: "identity_access", verdict: "unobserved", raw_verdict: "absent", evidence: "", loci_checked: [], downgrade_reason: "no_declared_locus_inspected" },
      ],
      asked: 2,
      calls: 1,
      errors: ["batch 1: boom"],
      usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      latency_ms: 0,
      digest_tokens: 100,
      available_loci: ["auth_code"],
    };
    const r = evidenceRowFromLabels(labels, { source: { license: "MIT" }, digest_hash: "h1" });
    expect(r.row_id).toBe("repo:acme/app");
    expect(r.run).toBe(2);
    expect(r.source.license).toBe("MIT");
    expect(r.digest_hash).toBe("h1");
    expect(r.errors).toEqual(["batch 1: boom"]);
    expect(r.feature_cells.login_route!.evidence).toEqual(["router.post('/login')"]);
    expect(r.feature_cells.no_login!.downgrade_reason).toBe("no_declared_locus_inspected");
    expect(() => EvidenceRowSchema.parse(r)).not.toThrow();
  });
});

describe("aggregation: evidence row → decision row", () => {
  it("exactly one option with positive evidence → observed, with its features and quotes", () => {
    const { row: d } = aggregateRow(row({ login_route: cell("present", { evidence: ["router.post('/login')"] }), no_login: cell("unobserved") }), LEX);
    expect(d.cells.user_accounts!.status).toBe("observed");
    expect(d.cells.user_accounts!.option).toBe("multi_user");
    expect(d.cells.user_accounts!.evidence_feature_ids).toEqual(["login_route"]);
    expect(d.cells.user_accounts!.evidence_quotes).toEqual(["router.post('/login')"]);
  });

  it("two options with positive evidence → conflict; both candidates kept, nothing auto-resolved", () => {
    const { row: d } = aggregateRow(row({ login_route: cell("present", { evidence: ["/login"] }), no_login: cell("present", { evidence: ["single user"] }) }), LEX);
    expect(d.cells.user_accounts!.status).toBe("conflict");
    expect(d.cells.user_accounts!.option).toBeUndefined();
    expect(d.cells.user_accounts!.candidates.map((c) => c.option)).toEqual(["multi_user", "none"]);
    expect(d.conflicts).toEqual([{ node_id: "user_accounts", options: ["multi_user", "none"] }]);
  });

  it("a licensed negative NEVER selects the other option (spec rule 5)", () => {
    // `no_login` absent is evidence AGAINST user_accounts=none. It must not make the node observed as
    // multi_user, even though multi_user is the only remaining option.
    const { row: d } = aggregateRow(row({ no_login: cell("absent", { loci_checked: ["actors_section"] }), login_route: cell("unobserved") }), LEX);
    const c = d.cells.user_accounts!;
    expect(c.status).toBe("unobserved");
    expect(c.option).toBeUndefined();
    expect(c.negative_feature_ids).toEqual(["no_login"]);
    expect(c.unobserved_reason).toBe("negative_only");
  });

  it("unobserved is not absent: a silent artifact yields status unobserved with reason `silent`", () => {
    const { row: d } = aggregateRow(row({ login_route: cell("unobserved"), no_login: cell("unobserved") }), LEX);
    expect(d.cells.user_accounts!.status).toBe("unobserved");
    expect(d.cells.user_accounts!.unobserved_reason).toBe("silent");
    expect(d.cells.user_accounts!.negative_feature_ids).toEqual([]);
  });

  it("marks a node NOT observable when every mapped feature was undetectable in this source type", () => {
    const { row: d } = aggregateRow(
      row({
        login_route: cell("unobserved", { downgrade_reason: "undetectable_in_doc_type" }),
        no_login: cell("unobserved", { downgrade_reason: "undetectable_in_doc_type" }),
      }),
      LEX,
    );
    expect(d.cells.user_accounts!.observable).toBe(false);
    expect(d.cells.user_accounts!.unobserved_reason).toBe("not_askable_in_source");
  });

  it("keeps a node observable when at least one mapped feature WAS asked", () => {
    const { row: d } = aggregateRow(
      row({ login_route: cell("unobserved"), no_login: cell("unobserved", { downgrade_reason: "undetectable_in_doc_type" }) }),
      LEX,
    );
    expect(d.cells.user_accounts!.observable).toBe(true);
  });

  it("preserves downgrade reasons as counts (spec rule 7)", () => {
    const { row: d } = aggregateRow(
      row({ login_route: cell("unobserved", { downgrade_reason: "evidence_not_in_artifact" }), no_login: cell("unobserved", { downgrade_reason: "evidence_not_in_artifact" }) }),
      LEX,
    );
    expect(d.cells.user_accounts!.downgrade_reasons).toEqual({ evidence_not_in_artifact: 2 });
  });

  it("ignores catalog-gap features (maps_to === null) — they are never a decision column", () => {
    const { row: d } = aggregateRow(row({ orphan_feature: cell("present", { evidence: ["x"] }) }), LEX);
    expect(Object.keys(d.cells).sort()).toEqual(["payments_in_app", "user_accounts"]);
  });

  it("excludes nodes that do not apply to the row's archetype, and lists them", () => {
    const appliesTo = new Map([["payments_in_app", ["e-commerce"]]]);
    const { row: d } = aggregateRow(row({ stripe_checkout: cell("present", { evidence: ["stripe"] }) }), LEX, { appliesTo });
    expect(d.cells.payments_in_app).toBeUndefined();
    expect(d.not_applicable).toEqual(["payments_in_app"]);
  });

  it("reports a lexicon feature mapping to an option the catalog does not have", () => {
    const nodeIndex = new Map([["user_accounts", new Set(["none"])]]);
    const { issues } = aggregateRow(row({ login_route: cell("present", { evidence: ["x"] }) }), LEX, { nodeIndex });
    expect(issues).toContain("feature login_route maps to unknown option user_accounts.multi_user");
  });

  it("produces a row that satisfies its own schema", () => {
    const { row: d } = aggregateRow(row({ login_route: cell("present", { evidence: ["x"] }) }), LEX);
    expect(() => DecisionRowSchema.parse(d)).not.toThrow();
  });
});

describe("consensus over repeated runs", () => {
  it("agreeing runs are accepted", () => {
    const c = consensusVerdict(["present", "present"]);
    expect(c).toMatchObject({ verdict: "present", agreed: true, reason: "agreed" });
  });

  it("disagreeing runs collapse to unobserved with a reason, never an average", () => {
    const c = consensusVerdict(["present", "absent"]);
    expect(c.verdict).toBe("unobserved");
    expect(c.reason).toBe("run_disagreement");
    expect(c.tally).toEqual({ present: 1, absent: 1 });
    // the tally is preserved: the disagreement is data, not something to smooth away
    expect(Object.values(c.tally).reduce((a, b) => a + b, 0)).toBe(2);
  });

  it("a majority rule resolves a clear majority and refuses a tie", () => {
    expect(consensusVerdict(["present", "present", "absent"], { kind: "majority", min: 0.6 })).toMatchObject({ verdict: "present", reason: "majority" });
    expect(consensusVerdict(["present", "absent"], { kind: "majority", min: 0.5 }).verdict).toBe("unobserved");
    // below the configured threshold, even without a tie
    expect(consensusVerdict(["present", "absent", "unobserved", "absent", "unobserved"], { kind: "majority", min: 0.8 }).verdict).toBe("unobserved");
  });

  it("mergeRuns downgrades disagreeing cells and records which ones", () => {
    const a = row({ login_route: cell("present", { evidence: ["/login"] }) }, { run: 1 });
    const b = row({ login_route: cell("absent", { loci_checked: ["auth_code"] }) }, { run: 2 });
    const [merged] = mergeRuns([a, b]);
    expect(merged!.runs).toBe(2);
    expect(merged!.disagreements).toEqual(["login_route"]);
    expect(merged!.row.feature_cells.login_route!.verdict).toBe("unobserved");
    expect(merged!.row.feature_cells.login_route!.downgrade_reason).toBe("run_disagreement");
  });

  it("a disagreement propagates to the decision row as unobserved/run_disagreement", () => {
    const a = row({ login_route: cell("present", { evidence: ["/login"] }) }, { run: 1 });
    const b = row({ login_route: cell("absent", { loci_checked: ["auth_code"] }) }, { run: 2 });
    const { matrix } = buildMatrix([a, b], LEX, { expected: { catalog: "cat-1", lexicon: "test-lex-1" }, now: () => "2026-08-25T00:00:00.000Z" });
    expect(matrix.rows).toHaveLength(1);
    expect(matrix.rows[0]!.cells.user_accounts!.status).toBe("unobserved");
    expect(matrix.rows[0]!.cells.user_accounts!.unobserved_reason).toBe("run_disagreement");
  });

  it("keeps distinct artifacts distinct", () => {
    const a = row({ login_route: cell("present", { evidence: ["x"] }) }, { row_id: "repo:a/a@1" });
    const b = row({ login_route: cell("present", { evidence: ["y"] }) }, { row_id: "repo:b/b@1" });
    expect(mergeRuns([a, b])).toHaveLength(2);
  });
});

describe("version rules", () => {
  it("rejects a row from a different catalog version", () => {
    const issue = checkVersion({ row_id: "r", catalog_version: "cat-0", lexicon_version: "test-lex-1" }, { catalog: "cat-1", lexicon: "test-lex-1" });
    expect(issue).toEqual({ row_id: "r", field: "catalog_version", got: "cat-0", expected: "cat-1" });
  });

  it("accepts it when an explicit migration map says the two are compatible", () => {
    const issue = checkVersion({ row_id: "r", catalog_version: "cat-0", lexicon_version: "test-lex-1" }, { catalog: "cat-1", lexicon: "test-lex-1" }, { catalog: { "cat-0": "cat-1" } });
    expect(issue).toBeNull();
  });

  it("rejects an UNVERSIONED row — an empty version is not a wildcard", () => {
    const issue = checkVersion({ row_id: "r", catalog_version: "", lexicon_version: "test-lex-1" }, { catalog: "cat-1", lexicon: "test-lex-1" });
    expect(issue).toEqual({ row_id: "r", field: "catalog_version", got: "(unversioned)", expected: "cat-1" });
  });

  it("is vacuous when there is no expected version to compare against", () => {
    expect(checkVersion({ row_id: "r", catalog_version: "", lexicon_version: "" }, { catalog: "", lexicon: "" })).toBeNull();
  });

  it("partitions rather than silently dropping, so an operator sees the exclusion", () => {
    const good = row({ login_route: cell("present", { evidence: ["x"] }) });
    const bad = row({ login_route: cell("present", { evidence: ["x"] }) }, { row_id: "repo:old/old@1", catalog_version: "cat-0" });
    const { accepted, rejected } = partitionByVersion([good, bad], { catalog: "cat-1", lexicon: "test-lex-1" });
    expect(accepted).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.issue.field).toBe("catalog_version");
  });
});

describe("session rows", () => {
  it("an answered card becomes an observed decision cell", () => {
    const d = decisionRowFromSession(
      [{ project_id: "p1", archetypes: ["crud-saas"], node: "user_accounts", option: "multi_user", source: "answer" }],
      { project_id: "p1", archetype: "crud-saas", catalog_version: "cat-1" },
    );
    expect(d.source_kind).toBe("session");
    expect(d.row_id).toBe("session:p1");
    expect(d.cells.user_accounts).toMatchObject({ status: "observed", option: "multi_user", observable: true });
  });

  it("the same node answered two ways is a conflict, not a silent last-write-wins", () => {
    const d = decisionRowFromSession(
      [
        { project_id: "p1", archetypes: ["crud-saas"], node: "user_accounts", option: "none", source: "answer" },
        { project_id: "p1", archetypes: ["crud-saas"], node: "user_accounts", option: "multi_user", source: "override" },
      ],
      { project_id: "p1", archetype: "crud-saas", catalog_version: "cat-1" },
    );
    expect(d.cells.user_accounts!.status).toBe("conflict");
    expect(d.conflicts).toEqual([{ node_id: "user_accounts", options: ["multi_user", "none"] }]);
  });

  it("session rows stay distinguishable from repo/spec rows", () => {
    const d = decisionRowFromSession([{ project_id: "p1", archetypes: [], node: "user_accounts", option: "none", source: "answer" }], { project_id: "p1", archetype: "other", catalog_version: "cat-1" });
    expect(() => DecisionRowSchema.parse(d)).not.toThrow();
    expect(d.source_kind).toBe("session");
  });
});

describe("matrix, stats and flattening", () => {
  const built = () =>
    buildMatrix(
      [
        row({ login_route: cell("present", { evidence: ["/login"] }), stripe_checkout: cell("unobserved") }, { row_id: "repo:a/a@1" }),
        row({ login_route: cell("unobserved", { downgrade_reason: "undetectable_in_doc_type" }), no_login: cell("unobserved", { downgrade_reason: "undetectable_in_doc_type" }), stripe_checkout: cell("present", { evidence: ["stripe.checkout"] }) }, { row_id: "spec_doc:b", source: { kind: "spec_doc", id: "b", url: null, commit: null, license: null }, archetype: "e-commerce" }),
      ],
      LEX,
      { expected: { catalog: "cat-1", lexicon: "test-lex-1" }, now: () => "2026-08-25T00:00:00.000Z" },
    );

  it("computes fill rate against OBSERVABLE cells, not all cells", () => {
    const s = matrixStats(built().matrix);
    // 4 cells total; user_accounts on row 2 is not observable → 3 observable, 2 observed
    expect(s.cells_total).toBe(4);
    expect(s.observable).toBe(3);
    expect(s.observed).toBe(2);
    expect(s.fill_rate).toBeCloseTo(2 / 3, 10);
  });

  it("returns null (not 0) for a fill rate with no observable cells", () => {
    const empty = buildMatrix([], LEX, { expected: { catalog: "cat-1", lexicon: "test-lex-1" }, now: () => "t" });
    expect(matrixStats(empty.matrix).fill_rate).toBeNull();
  });

  it("keeps source kinds and archetypes separate in the stats (never pooled)", () => {
    const s = matrixStats(built().matrix);
    expect(s.by_source_kind).toEqual({ repo: 1, spec_doc: 1 });
    expect(s.by_archetype).toEqual({ "crud-saas": 1, "e-commerce": 1 });
  });

  it("flattens to one line per (row, node) and round-trips through CSV", () => {
    const flat = flattenMatrix(built().matrix);
    expect(flat).toHaveLength(4);
    expect(flat[0]).toMatchObject({ row_id: "repo:a/a@1", node_id: "payments_in_app" });
    const csv = toCsv(flat);
    expect(csv.split("\n")).toHaveLength(5); // header + 4
    expect(csv.split("\n")[0]).toContain("observable");
  });

  it("surfaces labelling errors instead of dropping them", () => {
    const { validation } = buildMatrix([row({ login_route: cell("unobserved") }, { errors: ["batch 1: 500"] })], LEX, { expected: { catalog: "cat-1", lexicon: "test-lex-1" }, now: () => "t" });
    expect(validation.errors_by_row).toEqual([{ row_id: "repo:acme/app@abc123", errors: ["batch 1: 500"] }]);
  });
});

describe("jsonl io", () => {
  it("parses JSONL and reports the bad lines rather than throwing", () => {
    const { rows, errors } = parseJsonl<{ a: number }>('{"a":1}\nnot json\n{"a":2}\n', (v) => v as { a: number });
    expect(rows).toEqual([{ a: 1 }, { a: 2 }]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("line 2");
  });

  it("also accepts a JSON array", () => {
    const { rows, errors } = parseJsonl<{ a: number }>('[{"a":1},{"a":2}]', (v) => v as { a: number });
    expect(rows).toHaveLength(2);
    expect(errors).toEqual([]);
  });
});

describe("cli args", () => {
  it("requires a source", () => {
    expect(() => parseMatrixArgs([])).toThrow(UsageError);
  });
  it("refuses both --labels and --sessions", () => {
    expect(() => parseMatrixArgs(["--labels", "a", "--sessions", "b"])).toThrow(UsageError);
  });
  it("validates the majority threshold", () => {
    expect(() => parseMatrixArgs(["--mock", "--consensus", "majority", "--min-agree", "0.4"])).toThrow(UsageError);
    expect(parseMatrixArgs(["--mock", "--consensus", "majority", "--min-agree", "0.75"]).consensus).toEqual({ kind: "majority", min: 0.75 });
  });
});

describe("against the real lexicon and catalogs", () => {
  it("every mapped lexicon feature points at a real catalog node+option, and blindness is reported", async () => {
    const { lexicon } = await loadValidatedLexicon();
    const { catalogs } = await loadCatalogs();
    const nodeIndex = catalogNodeIndex(catalogs);
    const blind = uncoveredNodes(lexicon, nodeIndex);
    // not an assertion that blind is empty — it is a real, reportable state of the world; assert it is
    // computable and disjoint from the covered set instead.
    const covered = new Set(lexicon.features.flatMap((f) => (f.maps_to ? [f.maps_to.node] : [])));
    for (const n of blind) expect(covered.has(n)).toBe(false);
    expect(blind.length).toBeLessThan(nodeIndex.size);
  });

  it("aggregates a real-lexicon evidence row without issues", async () => {
    const { lexicon } = await loadValidatedLexicon();
    const { catalogs } = await loadCatalogs();
    const nodeIndex = catalogNodeIndex(catalogs);
    const feature = lexicon.features.find((f) => f.maps_to)!;
    const cells: Record<string, FeatureCell> = {};
    for (const f of lexicon.features) cells[f.id] = cell("unobserved");
    cells[feature.id] = cell("present", { evidence: ["a quote"] });
    const { row: d, issues } = aggregateRow(row(cells), lexicon, { nodeIndex });
    expect(issues).toEqual([]);
    expect(d.cells[feature.maps_to!.node]!.status).toBe("observed");
    expect(d.cells[feature.maps_to!.node]!.option).toBe(feature.maps_to!.option);
  });
});
