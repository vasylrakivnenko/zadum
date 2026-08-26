import { describe, it, expect } from "vitest";
import { UsageError } from "../cli/flags.js";
import { loadLexicon } from "./lexicon.js";
import { NO_USAGE, VERDICTS, type Cell, type DocumentLabels, type Verdict } from "./label.js";
import {
  DEFAULT_GOLD_FILE,
  LabelGoldSchema,
  RUN_DISAGREEMENT,
  UNANIMOUS,
  absentPrecision,
  absentRecall,
  agreementByArchetype,
  agreementByCategory,
  agreementBySourceType,
  buildLabelEvalReport,
  confusionCounts,
  consensusCell,
  consensusRows,
  evidenceQuoteValidity,
  evidenceQuoteValidityCounts,
  foldErrors,
  goldCellCount,
  goldIndex,
  informativeAgreement,
  informativeAgreementCounts,
  loadGold,
  noAnswerCounts,
  noAnswerRate,
  parseEvalArgs,
  parseLabelJsonl,
  precisionByArchetype,
  precisionByCategory,
  precisionBySourceType,
  presentPrecision,
  presentRecall,
  rawAgreementCounts,
  renderLabelEvalReport,
  verdictPrecisionCounts,
  type ConsensusRule,
  type LabelGold,
} from "./label_eval.js";

// ---------- fixtures ----------

const cell = (feature_id: string, verdict: Verdict, over: Partial<Cell> = {}): Cell => ({
  feature_id,
  category: "payments",
  verdict,
  raw_verdict: verdict,
  evidence: verdict === "present" ? `evidence for ${feature_id}` : "",
  loci_checked: [],
  downgrade_reason: null,
  ...over,
});

const row = (doc_id: string, cells: Cell[], over: Partial<DocumentLabels> = {}): DocumentLabels => ({
  doc_id,
  doc_type: "spec_doc",
  archetype: "crud-saas",
  run: 1,
  model: "mock-model",
  lexicon_version: "test-lex",
  catalog_version: "test-cat",
  cells,
  asked: cells.length,
  calls: 1,
  errors: [],
  usage: NO_USAGE,
  latency_ms: 0,
  digest_tokens: 0,
  available_loci: [],
  ...over,
});

const gold = (over: Partial<LabelGold> = {}): LabelGold => ({
  schema: "zadum.label-gold.v1",
  version: "test-gold",
  lexicon_version: "test-lex",
  catalog_version: "",
  note: "",
  todo: "",
  artifacts: [
    {
      doc_id: "d1",
      doc_type: "spec_doc",
      archetype: "crud-saas",
      cells: [
        { feature_id: "f1", verdict: "present", note: "a human read it" },
        { feature_id: "f2", verdict: "absent", note: "a human read it" },
        { feature_id: "f3", verdict: "unobserved", note: "a human read it" },
      ],
    },
  ],
  ...over,
});

/** d1: two of the five cells were never adjudicated, and one adjudicated cell is a real miss. */
const gradedRow = () =>
  row("d1", [
    cell("f1", "present"), //  gold: present     → correct present
    cell("f2", "absent"), //   gold: absent      → correct absent
    cell("f3", "present"), //  gold: unobserved  → wrong present
    cell("f4", "present"), //  NOT in gold       → must not be scored
    cell("f5", "absent"), //   NOT in gold       → must not be scored
  ]);

// ---------- precision / recall against gold ----------

describe("precision and recall against a gold set", () => {
  it("computes present and absent precision from counts", () => {
    const idx = goldIndex(gold());
    const rows = [gradedRow()];
    expect(presentPrecision(rows, idx)).toBeCloseTo(0.5, 10); // f1 right, f3 wrong
    expect(absentPrecision(rows, idx)).toBe(1); // f2 right
    expect(presentRecall(rows, idx)).toBe(1); // the one gold `present` was found
    expect(absentRecall(rows, idx)).toBe(1);
  });

  it("EXCLUDES cells the gold set never adjudicated from the denominators", () => {
    const idx = goldIndex(gold());
    const rows = [gradedRow()];
    const present = verdictPrecisionCounts(rows, idx, "present");
    const absent = verdictPrecisionCounts(rows, idx, "absent");
    // Three `present` and two `absent` predictions were made, but only two and one were adjudicated.
    expect(present).toEqual({ matched: 1, total: 2, rate: 0.5 });
    expect(absent).toEqual({ matched: 1, total: 1, rate: 1 });
    // If f4/f5 had leaked in as agreement the rates would be 2/3 and 1/2 — assert they did not.
    expect(present.rate).not.toBeCloseTo(2 / 3, 10);
    expect(absent.rate).not.toBe(0.5);
  });

  it("never scores an unadjudicated cell as an agreed `unobserved`", () => {
    const idx = goldIndex(gold());
    // 100 columns the labeller left `unobserved`, none of them in the gold row.
    const many = Array.from({ length: 100 }, (_, i) => cell(`pad${i}`, "unobserved"));
    const rows = [row("d1", [cell("f1", "present"), ...many])];
    const confusion = confusionCounts(rows, idx);
    expect(confusion).toEqual([{ gold: "present", predicted: "present", n: 1 }]);
    expect(confusion.reduce((n, c) => n + c.n, 0)).toBe(1);
  });

  it("ignores documents the gold set says nothing about", () => {
    const idx = goldIndex(gold());
    const rows = [row("other-doc", [cell("f1", "present"), cell("f2", "absent")])];
    expect(presentPrecision(rows, idx)).toBeNull();
    expect(absentPrecision(rows, idx)).toBeNull();
    expect(confusionCounts(rows, idx)).toEqual([]);
  });

  it("shows WHERE disagreement lives as {gold, predicted, n} triples", () => {
    const idx = goldIndex(gold());
    expect(confusionCounts([gradedRow()], idx)).toEqual([
      { gold: "present", predicted: "present", n: 1 },
      { gold: "absent", predicted: "absent", n: 1 },
      { gold: "unobserved", predicted: "present", n: 1 },
    ]);
  });
});

describe("zero denominators are null, never 0 and never 1", () => {
  const idx = goldIndex(gold());

  it("returns null for precision with no predictions of that verdict", () => {
    const rows = [row("d1", [cell("f1", "present"), cell("f3", "present")])];
    expect(absentPrecision(rows, idx)).toBeNull();
    expect(verdictPrecisionCounts(rows, idx, "absent")).toEqual({ matched: 0, total: 0, rate: null });
    expect(absentRecall(rows, idx)).toBeNull();
  });

  it("returns null for precision with no gold at all", () => {
    const empty = new Map();
    expect(presentPrecision([gradedRow()], empty)).toBeNull();
    expect(absentPrecision([gradedRow()], empty)).toBeNull();
  });

  it("returns null for agreement when nothing was run twice", () => {
    expect(informativeAgreement([gradedRow()])).toBeNull();
    expect(rawAgreementCounts([gradedRow()]).rate).toBeNull();
  });

  it("returns null for the no-answer rate when nothing was asked", () => {
    const rows = [
      row("d1", [
        cell("f1", "unobserved", { downgrade_reason: "undetectable_in_doc_type", raw_verdict: "" }),
        cell("f2", "unobserved", { downgrade_reason: "feature_not_asked", raw_verdict: "" }),
      ]),
    ];
    expect(noAnswerRate(rows)).toBeNull();
    expect(noAnswerCounts(rows)).toEqual({ matched: 0, total: 0, rate: null });
  });

  it("returns null — not 1.0 — for quote validity when no artifact text is available", () => {
    const rows = [gradedRow()];
    expect(evidenceQuoteValidity(rows, undefined)).toBeNull();
    const counts = evidenceQuoteValidityCounts(rows, undefined);
    expect(counts.rate).toBeNull();
    expect(counts.unchecked).toBe(3); // three `present` cells, none checkable
    expect(evidenceQuoteValidity(rows, new Map())).toBeNull();
  });
});

describe("evidence quote validity", () => {
  it("counts only quotes that really occur in the artifact", () => {
    const rows = [row("d1", [cell("f1", "present", { evidence: "invoices are locked after sending" }), cell("f2", "present", { evidence: "a sentence the artifact never contained" })])];
    const digests = new Map([["d1", "Section 4.  Invoices  are   locked after sending, so numbering has no gaps."]]);
    expect(evidenceQuoteValidityCounts(rows, digests)).toEqual({ matched: 1, total: 2, rate: 0.5, unchecked: 0 });
    expect(evidenceQuoteValidity(rows, digests)).toBe(0.5);
  });

  it("leaves present cells with no supplied text out of both numerator and denominator", () => {
    const rows = [row("d1", [cell("f1", "present", { evidence: "invoices are locked after sending" })]), row("d2", [cell("f1", "present", { evidence: "anything at all here" })])];
    const digests = new Map([["d1", "Invoices are locked after sending."]]);
    expect(evidenceQuoteValidityCounts(rows, digests)).toEqual({ matched: 1, total: 1, rate: 1, unchecked: 1 });
  });
});

// ---------- run-to-run agreement ----------

describe("informative agreement", () => {
  const runA = row("d1", [cell("f1", "present"), cell("f2", "absent"), cell("f3", "unobserved"), cell("f4", "unobserved")], { run: 1 });
  const runB = row("d1", [cell("f1", "present"), cell("f2", "unobserved"), cell("f3", "unobserved"), cell("f4", "present")], { run: 2 });

  it("matches the hand-computed value", () => {
    // 4 compared cells. Raw agreement: f1 ✓, f2 ✗, f3 ✓, f4 ✗ → 2/4.
    expect(rawAgreementCounts([runA, runB])).toEqual({ matched: 2, total: 4, rate: 0.5 });
    // Informative = at least one run not `unobserved`: f1, f2, f4 (f3 is agreed silence, which is not
    // evidence of stability). Of those, only f1 agrees → 1/3.
    expect(informativeAgreementCounts([runA, runB])).toEqual({ matched: 1, total: 3, rate: 1 / 3 });
    expect(informativeAgreement([runA, runB])).toBeCloseTo(0.3333333, 6);
  });

  it("is stricter than raw agreement, because raw agreement is inflated by agreed silence", () => {
    const inf = informativeAgreement([runA, runB])!;
    const raw = rawAgreementCounts([runA, runB]).rate!;
    expect(inf).toBeLessThan(raw);
  });
});

describe("breakdowns keep populations separate and never silently pool", () => {
  const specA = row("spec-1", [cell("f1", "present"), cell("f2", "present")], { run: 1, doc_type: "spec_doc", archetype: "crud-saas" });
  const specB = row("spec-1", [cell("f1", "present"), cell("f2", "present")], { run: 2, doc_type: "spec_doc", archetype: "crud-saas" });
  const repoA = row("repo-1", [cell("f1", "present"), cell("f2", "present")], { run: 1, doc_type: "repo", archetype: "marketplace" });
  const repoB = row("repo-1", [cell("f1", "absent"), cell("f2", "unobserved")], { run: 2, doc_type: "repo", archetype: "marketplace" });
  const all = [specA, specB, repoA, repoB];

  it("splits agreement by source type without mixing denominators", () => {
    const bySource = agreementBySourceType(all);
    expect(bySource.map((b) => b.key)).toEqual(["repo", "spec_doc"]);
    const repo = bySource.find((b) => b.key === "repo")!;
    const spec = bySource.find((b) => b.key === "spec_doc")!;
    expect(spec).toMatchObject({ documents: 1, pairs: 2, informative_pairs: 2, agreement: 1, agreement_informative: 1 });
    expect(repo).toMatchObject({ documents: 1, pairs: 2, informative_pairs: 2, agreement: 0, agreement_informative: 0 });
    // the pooled figure is the average of two very different populations — which is exactly why it is
    // reported separately and labelled `pooled` rather than presented as "the" agreement.
    expect(rawAgreementCounts(all).rate).toBe(0.5);
  });

  it("splits agreement by archetype", () => {
    const byArch = agreementByArchetype(all);
    expect(byArch.map((b) => b.key)).toEqual(["crud-saas", "marketplace"]);
    expect(byArch.find((b) => b.key === "crud-saas")!.agreement_informative).toBe(1);
    expect(byArch.find((b) => b.key === "marketplace")!.agreement_informative).toBe(0);
  });

  it("splits agreement by category", () => {
    const r1 = row("d1", [cell("p1", "present", { category: "payments" }), cell("b1", "present", { category: "booking_scheduling" })], { run: 1 });
    const r2 = row("d1", [cell("p1", "present", { category: "payments" }), cell("b1", "absent", { category: "booking_scheduling" })], { run: 2 });
    const byCat = agreementByCategory([r1, r2]);
    expect(byCat.map((b) => b.key)).toEqual(["booking_scheduling", "payments"]);
    expect(byCat.find((b) => b.key === "payments")).toMatchObject({ pairs: 1, informative_pairs: 1, agreement: 1 });
    expect(byCat.find((b) => b.key === "booking_scheduling")).toMatchObject({ pairs: 1, informative_pairs: 1, agreement: 0 });
  });

  it("splits precision by source type, archetype and category without pooling", () => {
    const idx = goldIndex(
      gold({
        artifacts: [
          { doc_id: "s1", doc_type: "spec_doc", archetype: "crud-saas", cells: [{ feature_id: "f1", verdict: "present", note: "" }] },
          { doc_id: "r1", doc_type: "repo", archetype: "marketplace", cells: [{ feature_id: "f1", verdict: "absent", note: "" }] },
        ],
      }),
    );
    const rows = [
      row("s1", [cell("f1", "present", { category: "payments" })], { doc_type: "spec_doc", archetype: "crud-saas" }),
      row("r1", [cell("f1", "present", { category: "invoicing" })], { doc_type: "repo", archetype: "marketplace" }),
    ];
    const bySource = precisionBySourceType(rows, idx);
    expect(bySource.find((b) => b.key === "spec_doc")!.present_precision).toEqual({ matched: 1, total: 1, rate: 1 });
    expect(bySource.find((b) => b.key === "repo")!.present_precision).toEqual({ matched: 0, total: 1, rate: 0 });
    const byArch = precisionByArchetype(rows, idx);
    expect(byArch.find((b) => b.key === "crud-saas")!.present_precision.rate).toBe(1);
    expect(byArch.find((b) => b.key === "marketplace")!.present_precision.rate).toBe(0);
    const byCat = precisionByCategory(rows, idx);
    expect(byCat.find((b) => b.key === "payments")!.present_precision.rate).toBe(1);
    expect(byCat.find((b) => b.key === "invoicing")!.present_precision.rate).toBe(0);
    // Each breakdown's denominators sum back to the pooled denominator — nothing double-counted, nothing lost.
    expect(bySource.reduce((n, b) => n + b.present_precision.total, 0)).toBe(verdictPrecisionCounts(rows, idx, "present").total);
  });
});

// ---------- consensus ----------

describe("consensus across repeated runs", () => {
  const runs = (verdicts: Verdict[]): Cell[] => verdicts.map((v) => cell("f1", v));

  it("accepts an agreed verdict (unanimous)", () => {
    const res = consensusCell(runs(["present", "present", "present"]), UNANIMOUS);
    expect(res.verdict).toBe("present");
    expect(res.accepted).toBe(true);
    expect(res.unanimous).toBe(true);
    expect(res.reason).toBeNull();
    expect(res.tally).toEqual({ present: 3, absent: 0, unobserved: 0 });
    expect(res.cell.evidence).toBe("evidence for f1");
  });

  it("turns disagreement into `unobserved` with reason run_disagreement", () => {
    const res = consensusCell(runs(["present", "absent"]), UNANIMOUS);
    expect(res.verdict).toBe("unobserved");
    expect(res.accepted).toBe(false);
    expect(res.unanimous).toBe(false);
    expect(res.reason).toBe(RUN_DISAGREEMENT);
    expect(res.cell.downgrade_reason).toBe(RUN_DISAGREEMENT);
    expect(res.cell.evidence).toBe("");
  });

  it("keeps the per-run tally so the disagreement is preserved, never silently resolved", () => {
    const res = consensusCell(runs(["present", "absent", "unobserved"]), UNANIMOUS);
    expect(res.runs).toEqual(["present", "absent", "unobserved"]);
    expect(res.tally).toEqual({ present: 1, absent: 1, unobserved: 1 });
  });

  it("accepts a majority when the rule allows it", () => {
    const res = consensusCell(runs(["present", "present", "absent"]), { kind: "majority", min: 2 });
    expect(res.verdict).toBe("present");
    expect(res.accepted).toBe(true);
    expect(res.unanimous).toBe(false);
    expect(res.tally).toEqual({ present: 2, absent: 1, unobserved: 0 });
  });

  it("refuses a majority that does not reach `min`", () => {
    const res = consensusCell(runs(["present", "present", "absent"]), { kind: "majority", min: 3 });
    expect(res.verdict).toBe("unobserved");
    expect(res.reason).toBe(RUN_DISAGREEMENT);
  });

  it("never breaks a tie", () => {
    const res = consensusCell(runs(["present", "absent"]), { kind: "majority", min: 1 });
    expect(res.verdict).toBe("unobserved");
    expect(res.reason).toBe(RUN_DISAGREEMENT);
  });

  it("NEVER averages conflicting labels into a probability", () => {
    for (const rule of [UNANIMOUS, { kind: "majority", min: 2 } as ConsensusRule]) {
      const res = consensusCell(runs(["present", "absent", "present"]), rule);
      expect(VERDICTS).toContain(res.verdict);
      // every number anywhere in the result is an integer run count — no 0.66, no confidence, no score
      const numbers = JSON.stringify(res).match(/-?\d+\.\d+/g);
      expect(numbers).toBeNull();
      expect(res.tally.present + res.tally.absent + res.tally.unobserved).toBe(3);
      expect(Object.keys(res)).not.toContain("probability");
      expect(Object.keys(res)).not.toContain("confidence");
    }
  });

  it("throws rather than inventing a verdict when there are no runs", () => {
    expect(() => consensusCell([], UNANIMOUS)).toThrow(/no cells/);
  });

  it("folds whole rows, one row per document, recording which features disagreed", () => {
    const r1 = row("d1", [cell("f1", "present"), cell("f2", "absent")], { run: 1 });
    const r2 = row("d1", [cell("f1", "present"), cell("f2", "unobserved")], { run: 2 });
    const [folded] = consensusRows([r1, r2], UNANIMOUS);
    expect(folded!.runs_folded).toBe(2);
    expect(folded!.disagreements).toBe(1);
    expect(folded!.disagreed_features).toEqual(["f2"]);
    expect(folded!.cells.map((c) => c.verdict)).toEqual(["present", "unobserved"]);
    expect(folded!.cells[1]!.downgrade_reason).toBe(RUN_DISAGREEMENT);
  });

  it("passes single-run documents through and says so in the summary", () => {
    const report = buildLabelEvalReport([row("d1", [cell("f1", "present")])], { now: "T" });
    expect(report.consensus).toMatchObject({ documents: 1, disagreements: 0, single_run_documents: 1 });
  });

  it("produces rows the same precision code can grade", () => {
    const idx = goldIndex(gold());
    const r1 = row("d1", [cell("f1", "present"), cell("f2", "absent"), cell("f3", "present")], { run: 1 });
    const r2 = row("d1", [cell("f1", "present"), cell("f2", "absent"), cell("f3", "unobserved")], { run: 2 });
    const folded = consensusRows([r1, r2], UNANIMOUS);
    // f3 disagreed → unobserved, so the wrong `present` no longer counts against precision.
    expect(presentPrecision(folded, idx)).toBe(1);
    expect(absentPrecision(folded, idx)).toBe(1);
    // …whereas grading the raw runs counts the bad cell once per run.
    expect(presentPrecision([r1, r2], idx)).toBeCloseTo(2 / 3, 10);
  });
});

// ---------- failed batches ----------

describe("failed batches never disappear", () => {
  const failed = () =>
    row(
      "d1",
      [
        cell("f1", "present"),
        cell("f2", "unobserved", { raw_verdict: "", downgrade_reason: "no_answer_from_model" }),
        cell("f3", "unobserved", { raw_verdict: "", downgrade_reason: "no_answer_from_model" }),
        cell("f4", "unobserved", { raw_verdict: "", downgrade_reason: "undetectable_in_doc_type" }),
      ],
      { errors: ["batch 2: 529 overloaded", "batch 3: timeout"] },
    );

  it("surfaces an explicit error count and the affected doc ids", () => {
    const folded = foldErrors([failed(), row("d2", [cell("f1", "present")])]);
    expect(folded.errors).toBe(2);
    expect(folded.rows_with_errors).toBe(1);
    expect(folded.documents_affected).toEqual(["d1"]);
    expect(folded.messages).toEqual([
      { doc_id: "d1", run: 1, message: "batch 2: 529 overloaded" },
      { doc_id: "d1", run: 1, message: "batch 3: timeout" },
    ]);
  });

  it("counts the cells the failures left unanswered in the no-answer rate", () => {
    const rows = [failed()];
    // asked = f1, f2, f3 (f4 was never asked: rule 0). Two of the three came back with no answer.
    expect(noAnswerCounts(rows)).toEqual({ matched: 2, total: 3, rate: 2 / 3 });
    expect(foldErrors(rows).no_answer_cells).toBe(2);
    expect(foldErrors(rows).no_answer_rate).toBeCloseTo(2 / 3, 10);
  });

  it("puts the failure in the report and in the rendered text", () => {
    const report = buildLabelEvalReport([failed()], { now: "T" });
    expect(report.errors.errors).toBe(2);
    expect(report.errors.documents_affected).toEqual(["d1"]);
    const text = renderLabelEvalReport(report);
    expect(text).toContain("2 batch error(s)");
    expect(text).toContain("529 overloaded");
    expect(text).toContain("no-answer rate");
  });
});

// ---------- report ----------

describe("LabelEvalReport", () => {
  const rows = [gradedRow(), row("d1", [cell("f1", "present"), cell("f2", "unobserved"), cell("f3", "present"), cell("f4", "present"), cell("f5", "absent")], { run: 2 })];

  it("is JSON-serialisable, versioned, and carries the provenance the rows supply", () => {
    const report = buildLabelEvalReport(rows, { gold: gold(), now: "2026-08-25T00:00:00.000Z" });
    expect(report.schema).toBe("zadum.label-eval.v1");
    expect(report.generated_at).toBe("2026-08-25T00:00:00.000Z");
    expect(report.models).toEqual(["mock-model"]);
    expect(report.lexicon_versions).toEqual(["test-lex"]);
    expect(report.catalog_versions).toEqual(["test-cat"]);
    expect(report.documents).toBe(1);
    expect(report.max_runs).toBe(2);
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });

  it("reports null — never a fabricated value — for provenance the rows do not record", () => {
    const report = buildLabelEvalReport(rows, { now: "T" });
    expect(report.label_prompt_version).toBeNull();
    expect(report.digest_hash).toBeNull();
    expect(report.gold).toBeNull();
    expect(report.pooled.present_precision.rate).toBeNull();
  });

  it("picks up prompt version and digest hash when the rows carry them", () => {
    const enriched = [{ ...gradedRow(), prompt_version: "label@3", digest_hash: "abc123" } as unknown as DocumentLabels];
    const report = buildLabelEvalReport(enriched, { now: "T" });
    expect(report.label_prompt_version).toBe("label@3");
    expect(report.digest_hash).toBe("abc123");
  });

  it("names gold documents that were never labelled instead of scoring them", () => {
    const report = buildLabelEvalReport([row("elsewhere", [cell("f1", "present")])], { gold: gold(), now: "T" });
    expect(report.gold).toMatchObject({ artifacts: 1, cells: 3, matched_cells: 0, unmatched_documents: ["d1"] });
    expect(report.pooled.present_precision.rate).toBeNull();
  });

  it("labels its pooled aggregate as pooled in the rendering", () => {
    const text = renderLabelEvalReport(buildLabelEvalReport(rows, { gold: gold(), now: "T" }));
    expect(text).toContain("POOLED");
    expect(text).toContain("NOT pooled");
    expect(text).toContain("the expensive one");
    expect(text).toContain("present precision");
  });

  it("renders n/a rather than 0% when a rate has no support", () => {
    const text = renderLabelEvalReport(buildLabelEvalReport([row("d1", [cell("f1", "present")])], { now: "T" }));
    expect(text).toContain("n/a");
    expect(text).toContain("NOT scored as 1.0");
  });
});

// ---------- JSONL + CLI parsing ----------

describe("row loading and CLI arguments", () => {
  it("reads the JSONL format label.ts writes", () => {
    const text = `${JSON.stringify(gradedRow())}\n\n${JSON.stringify(row("d2", [cell("f1", "absent")], { run: 2 }))}\n`;
    const parsed = parseLabelJsonl(text);
    expect(parsed.map((r) => r.doc_id)).toEqual(["d1", "d2"]);
    expect(parsed[0]!.cells).toHaveLength(5);
    expect(parsed[1]!.run).toBe(2);
  });

  it("fails loudly on a bad line rather than dropping it", () => {
    expect(() => parseLabelJsonl("{ not json")).toThrow(UsageError);
    expect(() => parseLabelJsonl(`{"doc_id":"d1"}`)).toThrow(/not a label row/);
    expect(() => parseLabelJsonl("\n\n")).toThrow(/no label rows/);
  });

  it("parses its flags", () => {
    const args = parseEvalArgs(["--labels", "rows.jsonl", "--gold", "none", "--out", "tmp", "--consensus", "majority:2"]);
    expect(args).toEqual({ labels: "rows.jsonl", gold: null, digests: null, out: "tmp", rule: { kind: "majority", min: 2 } });
    expect(parseEvalArgs(["--labels", "rows.jsonl"]).gold).toBe(DEFAULT_GOLD_FILE);
    expect(() => parseEvalArgs([])).toThrow(UsageError);
    expect(() => parseEvalArgs(["--labels", "r.jsonl", "--consensus", "vibes"])).toThrow(/unanimous/);
  });
});

// ---------- the shipped gold set ----------

describe("catalogs/gold/label-gold.json", () => {
  it("parses against the schema", async () => {
    const shipped = await loadGold();
    expect(shipped.schema).toBe("zadum.label-gold.v1");
    expect(shipped.artifacts.length).toBeGreaterThan(0);
    expect(goldCellCount(shipped)).toBeGreaterThan(0);
    expect(LabelGoldSchema.parse(shipped)).toEqual(shipped);
  });

  it("only names features that exist in the real lexicon", async () => {
    const [shipped, lex] = await Promise.all([loadGold(), loadLexicon()]);
    const known = new Set(lex.features.map((f) => f.id));
    const unknown = shipped.artifacts.flatMap((a) => a.cells.filter((c) => !known.has(c.feature_id)).map((c) => `${a.doc_id}:${c.feature_id}`));
    expect(unknown).toEqual([]);
  });

  it("has unique documents, unique features per document, and a reason on every cell", async () => {
    const shipped = await loadGold();
    const docIds = shipped.artifacts.map((a) => a.doc_id);
    expect(new Set(docIds).size).toBe(docIds.length);
    for (const a of shipped.artifacts) {
      const ids = a.cells.map((c) => c.feature_id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const c of a.cells) expect(c.note.length).toBeGreaterThan(10);
    }
  });

  it("says how many artifacts it holds and that it must grow", async () => {
    const shipped = await loadGold();
    expect(shipped.note).toContain(String(shipped.artifacts.length));
    expect(shipped.todo).toMatch(/30/);
  });

  it("can be indexed and used to grade a row", async () => {
    const shipped = await loadGold();
    const idx = goldIndex(shipped);
    const first = shipped.artifacts[0]!;
    const perfect = row(
      first.doc_id,
      first.cells.map((c) => cell(c.feature_id, c.verdict)),
      { doc_type: first.doc_type, archetype: first.archetype },
    );
    expect(presentPrecision([perfect], idx)).toBe(1);
    // an oracle that answers `present` everywhere is caught, not flattered
    const overclaimer = row(
      first.doc_id,
      first.cells.map((c) => cell(c.feature_id, "present")),
      { doc_type: first.doc_type, archetype: first.archetype },
    );
    expect(presentPrecision([overclaimer], idx)!).toBeLessThan(1);
  });
});
