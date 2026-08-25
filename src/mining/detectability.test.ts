import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PREDICTION,
  buildDocTypeReport,
  buildReport,
  computeAgreement,
  fetchRepo,
  groupByDoc,
  pairedEntries,
  renderReport,
  runExperiment,
  scorePrediction,
  type DocTypeReport,
} from "./detectability.js";
import { loadLexicon, type Lexicon, type LexiconEntry } from "./lexicon.js";
import { CORPUS_DIR, loadManifest, parseGithubRepo, type Cell, type DocumentLabels, type Verdict } from "./label.js";
import { labelMockHandlers } from "./label_mock.js";
import { MockLLM } from "../llm/client.js";

const here = path.dirname(fileURLToPath(import.meta.url));

// ---------- fixtures ----------

const entry = (id: string, category = "payments"): LexiconEntry => ({
  id,
  label: `feature ${id}`,
  category,
  maps_to: null,
  loci: { repo: ["payment_code"], spec_doc: ["payments_section"] },
  detectable_in: ["repo", "spec_doc"],
});

const LEX: Lexicon = {
  version: "test-1",
  description: "",
  categories: [{ id: "payments", label: "Payments", context_loci: { repo: ["payment_code"], spec_doc: ["payments_section"] } }],
  features: [entry("a"), entry("b"), entry("c")],
};

const cell = (feature_id: string, verdict: Verdict, raw_verdict: Verdict | "" = verdict, downgrade_reason: Cell["downgrade_reason"] = null): Cell => ({
  feature_id,
  category: "payments",
  verdict,
  raw_verdict,
  evidence: verdict === "present" ? "quote" : "",
  loci_checked: [],
  downgrade_reason,
});

const row = (doc_id: string, run: number, doc_type: "repo" | "spec_doc", cells: Cell[]): DocumentLabels => ({
  doc_id,
  doc_type,
  archetype: "b2b-invoicing",
  run,
  model: "test-model",
  lexicon_version: "test-1",
  catalog_version: "test",
  cells,
  asked: cells.length,
  calls: 1,
  errors: [],
  usage: { input_tokens: 100, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  latency_ms: 1,
  digest_tokens: 500,
  available_loci: ["payment_code"],
});

// ---------- agreement ----------

describe("computeAgreement", () => {
  it("pairs consecutive runs of the same document and counts exact-verdict matches", () => {
    const rows = [
      row("d1", 1, "repo", [cell("a", "present"), cell("b", "absent"), cell("c", "unobserved")]),
      row("d1", 2, "repo", [cell("a", "present"), cell("b", "unobserved"), cell("c", "unobserved")]),
    ];
    const { overall, byFeature } = computeAgreement(rows);
    expect(overall.pairs).toBe(3);
    expect(overall.agree).toBe(2); // a agrees, c agrees, b flipped
    // informative = at least one side said something. c (unobserved twice) does not count.
    expect(overall.informative).toBe(2);
    expect(overall.informativeAgree).toBe(1);
    expect(byFeature.get("b")!.agree).toBe(0);
    expect(byFeature.get("c")!.informative).toBe(0);
  });

  it("never pairs across documents, and reports nothing when each document was labelled once", () => {
    const rows = [row("d1", 1, "repo", [cell("a", "present")]), row("d2", 1, "repo", [cell("a", "absent")])];
    expect(computeAgreement(rows).overall.pairs).toBe(0);
    expect(groupByDoc(rows).size).toBe(2);
  });

  it("chains three runs into two pairs", () => {
    const rows = [1, 2, 3].map((r) => row("d1", r, "repo", [cell("a", r === 2 ? "absent" : "present")]));
    const { overall } = computeAgreement(rows);
    expect(overall.pairs).toBe(2);
    expect(overall.agree).toBe(0);
  });

  it("is insensitive to the order rows arrive in", () => {
    const rows = [row("d1", 2, "repo", [cell("a", "absent")]), row("d1", 1, "repo", [cell("a", "present")])];
    expect(computeAgreement(rows).overall).toEqual(computeAgreement([...rows].reverse()).overall);
  });
});

// ---------- report shaping ----------

describe("buildDocTypeReport", () => {
  const rows = [
    row("d1", 1, "repo", [cell("a", "present"), cell("b", "absent"), cell("c", "unobserved", "absent", "category_not_discussed")]),
    row("d1", 2, "repo", [cell("a", "present"), cell("b", "unobserved", "absent", "no_declared_locus_inspected"), cell("c", "unobserved", "absent", "category_not_discussed")]),
  ];
  const rep = buildDocTypeReport("repo", rows, LEX, "claude-opus-4-8");

  it("counts cells, fill rate and the absent-licensing rate from raw vs surviving verdicts", () => {
    expect(rep.documents).toBe(1);
    expect(rep.runs).toBe(2);
    expect(rep.cells).toBe(6);
    expect(rep.present).toBe(2);
    expect(rep.absent).toBe(1);
    expect(rep.unobserved).toBe(3);
    expect(rep.fill_rate).toBeCloseTo(3 / 6);
    expect(rep.absent_raw).toBe(4); // three downgraded + one kept
    expect(rep.absent_licensing_rate).toBeCloseTo(1 / 4);
    expect(rep.downgrades).toEqual({ category_not_discussed: 2, no_declared_locus_inspected: 1 });
  });

  it("separates raw agreement from agreement over informative cells", () => {
    expect(rep.agreement).toBeCloseTo(2 / 3); // a agrees, c agrees, b flips
    expect(rep.agreement_informative).toBeCloseTo(1 / 2); // only a and b are informative
  });

  it("reports every lexicon feature as a column, even ones no document filled", () => {
    expect(rep.per_feature.map((f) => f.feature_id).sort()).toEqual(["a", "b", "c"]);
    const c = rep.per_feature.find((f) => f.feature_id === "c")!;
    expect(c.fill_rate).toBe(0);
    expect(c.absent_raw).toBe(2);
    expect(c.absent_licensing_rate).toBe(0);
    expect(rep.per_feature[0]!.fill_rate).toBeGreaterThanOrEqual(rep.per_feature[1]!.fill_rate); // sorted by fill
  });

  it("removes rule-0 columns from the detectable-only denominator", () => {
    const narrowed: Lexicon = { ...LEX, features: LEX.features.map((f) => (f.id === "c" ? { ...f, loci: { repo: [], spec_doc: ["payments_section"] }, detectable_in: ["spec_doc"] } : f)) };
    const r = buildDocTypeReport("repo", rows, narrowed, "claude-opus-4-8");
    expect(r.fill_rate).toBeCloseTo(3 / 6); // unchanged: every column stays in the matrix
    expect(r.fill_rate_detectable).toBeCloseTo(3 / 4); // but `c` leaves the detectable denominator
  });

  it("summarises per document, including the doc's own agreement", () => {
    expect(rep.per_doc).toHaveLength(1);
    expect(rep.per_doc[0]).toMatchObject({ doc_id: "d1", runs: 2, present: 2, absent: 1, errors: 0 });
    expect(rep.per_doc[0]!.agreement).toBeCloseTo(2 / 3);
  });

  it("is empty-safe", () => {
    const empty = buildDocTypeReport("spec_doc", [], LEX, "m");
    expect(empty.documents).toBe(0);
    expect(empty.fill_rate).toBe(0);
    expect(empty.agreement).toBeNull();
    expect(empty.per_feature).toHaveLength(3);
  });
});

// ---------- the verdict ----------

describe("scorePrediction", () => {
  const mk = (doc_type: "repo" | "spec_doc", fill: number, agreement: number): DocTypeReport =>
    ({ ...buildDocTypeReport(doc_type, [], LEX, "m"), documents: 1, fill_rate: fill, agreement_informative: agreement }) as DocTypeReport;

  it("scores each clause of the recorded prediction separately", () => {
    const v = scorePrediction([mk("repo", 0.25, 0.5), mk("spec_doc", 0.7, 0.9)])!;
    expect(v.prediction).toBe(PREDICTION);
    expect(v.repo_fill_in_predicted_band).toBe(true);
    expect(v.spec_fill_at_least_2x_repo).toBe(true);
    expect(v.spec_agreement_higher).toBe(true);
    expect(v.fill_ratio_spec_over_repo).toBeCloseTo(2.8);
    expect(v.supported).toBe(true);
  });

  it("refuses to declare support when repos fill as well as specs", () => {
    const v = scorePrediction([mk("repo", 0.5, 0.9), mk("spec_doc", 0.55, 0.5)])!;
    expect(v.spec_fill_at_least_2x_repo).toBe(false);
    expect(v.spec_agreement_higher).toBe(false);
    expect(v.supported).toBe(false);
  });

  it("records an out-of-band repo fill without treating it as a refutation of the whole prediction", () => {
    const v = scorePrediction([mk("repo", 0.05, 0.4), mk("spec_doc", 0.6, 0.8)])!;
    expect(v.repo_fill_in_predicted_band).toBe(false);
    expect(v.supported).toBe(true); // the load-bearing claim is the ratio, not the exact band
  });

  it("is null unless both document types actually produced documents", () => {
    expect(scorePrediction([mk("repo", 0.2, 0.5)])).toBeNull();
    expect(scorePrediction([mk("repo", 0.2, 0.5), { ...mk("spec_doc", 0.6, 0.8), documents: 0 }])).toBeNull();
  });
});

describe("renderReport", () => {
  const rows = [
    row("r1", 1, "repo", [cell("a", "present"), cell("b", "unobserved")]),
    row("r1", 2, "repo", [cell("a", "absent"), cell("b", "unobserved")]),
    row("s1", 1, "spec_doc", [cell("a", "present"), cell("b", "present")]),
    row("s1", 2, "spec_doc", [cell("a", "present"), cell("b", "present")]),
  ];
  const report = buildReport(rows, LEX, { model: "claude-opus-4-8", catalogVersion: "cat@1", blocked: [{ doc_type: "repo", doc_id: "x/y", reason: "git clone failed" }], now: "2026-08-25T00:00:00.000Z" });

  it("shapes a machine-readable report with both document types and a verdict", () => {
    expect(report.by_doc_type.map((r) => r.doc_type)).toEqual(["repo", "spec_doc"]);
    expect(report.features).toBe(3);
    expect(report.verdict).not.toBeNull();
    expect(report.blocked).toHaveLength(1);
  });

  it("prints the verdict table, the per-document rows, the blocked list and a plain-English conclusion", () => {
    const text = renderReport(report);
    expect(text).toContain("detectability: repos vs spec documents");
    expect(text).toMatch(/^repo\s+1\s+2\s+/m);
    expect(text).toMatch(/^spec_doc\s+1\s+2\s+/m);
    expect(text).toContain("r1");
    expect(text).toContain("s1");
    expect(text).toContain("blocked (1)");
    expect(text).toContain("git clone failed");
    expect(text).toMatch(/the recorded prediction is (SUPPORTED|NOT supported)/);
    expect(text).toContain("columns never filled in any document");
  });

  it("says so, rather than inventing a verdict, when one side is missing", () => {
    const oneSided = buildReport(rows.filter((r) => r.doc_type === "spec_doc"), LEX, { model: "m", catalogVersion: "c", blocked: [], now: "now" });
    expect(oneSided.verdict).toBeNull();
    expect(renderReport(oneSided)).toContain("not computable");
  });
});

// ---------- corpus pairing ----------

describe("the paired corpus", () => {
  it("finds the GitHub-sourced documents the experiment runs on", async () => {
    const manifest = await loadManifest(CORPUS_DIR);
    expect(manifest.length).toBeGreaterThan(100);
    const paired = manifest.filter((e) => parseGithubRepo(e.source_url));
    expect(paired.length).toBeGreaterThanOrEqual(60);
    expect(pairedEntries(manifest, 8)).toHaveLength(8);
    expect(pairedEntries(manifest, 8)).toEqual(paired.slice(0, 8));
    for (const e of pairedEntries(manifest, 8)) expect(parseGithubRepo(e.source_url)).not.toBeNull();
  });

  it("fetchRepo reports a clear reason instead of throwing when fetching is off", async () => {
    const res = await fetchRepo("nobody", "nothing", path.join(here, "fixtures", "no-such-cache"), { fetch: false });
    expect(res.dir).toBeNull();
    expect(res.reason).toContain("--no-fetch");
  });

  it("fetchRepo reuses an existing clone without touching the network", async () => {
    const cache = await fs.mkdtemp(path.join(tmpdir(), "zadum-repo-cache-"));
    try {
      await fs.mkdir(path.join(cache, "acme__widgets"));
      const hit = await fetchRepo("acme", "widgets", cache, { fetch: false });
      expect(hit.cached).toBe(true);
      expect(hit.dir).toBe(path.join(cache, "acme__widgets"));
      expect(hit.reason).toBeNull();
    } finally {
      await fs.rm(cache, { recursive: true, force: true });
    }
  });
});

// ---------- end to end, no credentials ----------

describe("runExperiment (mock)", () => {
  it("labels the spec-doc side twice and produces a complete, verdict-free report", async () => {
    const lexicon = await loadLexicon();
    const { rows, blocked } = await runExperiment(new MockLLM(labelMockHandlers), lexicon, "cat@test", {
      docTypes: ["spec_doc"],
      limit: 2,
      runs: 2,
      maxTokens: 4000,
      batchSize: 45,
      concurrency: 2,
      repoCache: path.join(here, "fixtures", "no-such-cache"),
      fetch: false,
      corpusDir: CORPUS_DIR,
    });
    expect(blocked).toEqual([]);
    expect(rows).toHaveLength(4); // 2 documents x 2 runs
    expect(new Set(rows.map((r) => r.run))).toEqual(new Set([1, 2]));
    for (const r of rows) expect(r.cells).toHaveLength(lexicon.features.length);

    const report = buildReport(rows, lexicon, { model: "mock-strong", catalogVersion: "cat@test", blocked, now: "now" });
    const spec = report.by_doc_type.find((r) => r.doc_type === "spec_doc")!;
    expect(spec.documents).toBe(2);
    expect(spec.agreement).toBe(1); // the mock is deterministic, so its runs agree perfectly
    expect(report.verdict).toBeNull(); // no repo side was run
    expect(renderReport(report)).toContain("spec_doc");
  });

  it("records a blocked repo instead of faking data when no clone is available", async () => {
    const lexicon = await loadLexicon();
    const { rows, blocked } = await runExperiment(new MockLLM(labelMockHandlers), lexicon, "cat@test", {
      docTypes: ["repo"],
      limit: 2,
      runs: 1,
      maxTokens: 4000,
      batchSize: 45,
      concurrency: 2,
      repoCache: path.join(here, "fixtures", "no-such-cache"),
      fetch: false,
      corpusDir: CORPUS_DIR,
    });
    expect(rows).toEqual([]);
    expect(blocked).toHaveLength(2);
    expect(blocked[0]!.doc_type).toBe("repo");
    expect(blocked[0]!.reason).toContain("--no-fetch");
  });
});
