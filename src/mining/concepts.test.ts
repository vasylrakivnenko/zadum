import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  ConceptExtractionSchema,
  aggregateConcepts,
  priorHints,
  runStage2,
  extractConcepts,
  renderNodesForExtraction,
  parseRenderedNodes,
  renderExtractionPrompt,
  boundDocText,
  MAX_DOC_CHARS,
  type ConceptExtraction,
} from "./concepts.js";
import { conceptMockHandlers, mockDecide, mockExtract, parseNodesFromPrompt } from "./concepts_mock.js";
import { loadCorpus } from "./mine.js";
import { MockLLM } from "../llm/client.js";
import { loadCatalogs } from "../engine/catalogs.js";
import { mergeCatalogs, type NodeDef } from "../core/catalog.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const CORPUS = path.join(here, "fixtures", "corpus");

function node(id: string, options: string[], question = `${id}?`): NodeDef {
  return {
    id,
    topic: id,
    question,
    options: options.map((o) => ({ id: o, label: o.replace(/_/g, " ") })),
    consequence: 3,
    prior: Object.fromEntries(options.map((o) => [o, 1 / options.length])),
    implies: Object.fromEntries(options.map((o) => [o, []])),
    sections: [],
    bespoke: false,
  archetype: "core",
  };
}

const NODES: NodeDef[] = [node("credit_notes", ["none", "credit_notes", "refunds_via_provider"]), node("partial_payments", ["not_allowed", "allowed"])];

const empty = (over: Partial<ConceptExtraction> = {}): ConceptExtraction => ({ decisions: [], new_concepts: [], actors: [], nouns: [], rules: [], non_goals: [], ...over });
const dec = (node_id: string, option_id: string, confidence = 0.9) => ({ node_id, option_id, confidence, evidence: `${node_id} says ${option_id}` });

describe("ConceptExtractionSchema", () => {
  it("accepts a full extraction and rejects missing fields", () => {
    const ok = ConceptExtractionSchema.safeParse(
      empty({
        decisions: [dec("credit_notes", "credit_notes")],
        new_concepts: [{ concept: "purchase_order_reference", value: "yes", evidence: "PO printed", why_it_matters: "clients reject invoices without one" }],
        actors: ["client"],
      }),
    );
    expect(ok.success).toBe(true);
    expect(ConceptExtractionSchema.safeParse({ decisions: [] }).success).toBe(false);
    expect(ConceptExtractionSchema.safeParse(empty({ decisions: [{ node_id: "x", option_id: "y", confidence: "high", evidence: "" } as never] })).success).toBe(false);
  });

  it("stays in the conservative JSON-schema subset (ADR-011): every property required, no records", () => {
    const js = z.toJSONSchema(ConceptExtractionSchema) as { properties: Record<string, unknown>; required: string[] };
    expect(new Set(js.required)).toEqual(new Set(Object.keys(js.properties)));
    const decisionItem = (js.properties.decisions as { items: { properties: Record<string, unknown>; required: string[]; additionalProperties?: unknown } }).items;
    expect(new Set(decisionItem.required)).toEqual(new Set(["node_id", "option_id", "confidence", "evidence"]));
    expect(JSON.stringify(js)).not.toContain("additionalProperties\":{");
  });
});

describe("prompt rendering", () => {
  it("renders nodes with ids/questions/options and the mock parser reads them back", () => {
    const text = renderNodesForExtraction(NODES);
    expect(text).toContain("- credit_notes: credit_notes?");
    expect(text).toContain('credit_notes="credit notes"');
    const parsed = parseRenderedNodes(text);
    expect(parsed.map((n) => n.id)).toEqual(["credit_notes", "partial_payments"]);
    expect(parsed[0]!.options.map((o) => o.id)).toEqual(["none", "credit_notes", "refunds_via_provider"]);
    // the mock keeps its own copy of the parser (no static back-import); they must agree
    expect(parseNodesFromPrompt(text)).toEqual(parsed.map((n) => ({ id: n.id, options: n.options })));
  });

  it("bounds very long documents and says so", () => {
    const long = "x".repeat(MAX_DOC_CHARS + 5000);
    const b = boundDocText(long);
    expect(b.truncated).toBe(true);
    expect(b.text.length).toBeLessThan(MAX_DOC_CHARS + 200);
    expect(b.text).toContain("truncated: 5000 more characters");
    expect(boundDocText("short").truncated).toBe(false);
    const { user, truncated } = renderExtractionPrompt({ id: "d", archetype: "a", text: long }, NODES);
    expect(truncated).toBe(true);
    expect(user).toContain("CATALOG NODES:");
    expect(user).toContain("DOCUMENT:\n");
  });

  it("extractConcepts calls the LLM with fn concept_extract on the strong tier", async () => {
    const llm = new MockLLM({ concept_extract: () => empty({ decisions: [dec("credit_notes", "credit_notes")] }) });
    const res = await extractConcepts(llm, { doc: { id: "d", archetype: "a", text: "We issue credit notes." }, nodes: NODES });
    expect(res.data.decisions[0]!.option_id).toBe("credit_notes");
    expect(llm.calls[0]).toMatchObject({ fn: "concept_extract", tier: "strong" });
    expect(llm.calls[0]!.user).toContain("We issue credit notes.");
    expect(llm.calls[0]!.system).toMatch(/out of scope/);
  });
});

describe("aggregateConcepts", () => {
  const extractions = [
    { archetype: "inv", data: empty({ decisions: [dec("credit_notes", "credit_notes"), dec("partial_payments", "allowed")] }) },
    { archetype: "inv", data: empty({ decisions: [dec("credit_notes", "none"), dec("partial_payments", "allowed", 0.5)] }) }, // 0.5 < threshold → silent
    { archetype: "inv", data: empty({ decisions: [dec("credit_notes", "credit_notes", 0.7), dec("credit_notes", "none", 0.95), dec("ghost", "x"), dec("partial_payments", "maybe")] }) }, // dup node → best conf; unknown ids dropped
    { archetype: "inv", data: empty() },
  ];
  const agg = aggregateConcepts(extractions, NODES);

  it("counts one vote per doc per node, filtered by confidence and catalog ids", () => {
    const cn = agg.priors.inv!.credit_notes!;
    expect(cn.counts).toEqual({ none: 2, credit_notes: 1, refunds_via_provider: 0 });
    expect(cn.n).toBe(3);
    expect(cn.fraction.none).toBeCloseTo(2 / 3);
    expect(cn.fraction.credit_notes).toBeCloseTo(1 / 3);
    expect(cn.coverage).toBeCloseTo(0.75);
    const pp = agg.priors.inv!.partial_payments!;
    expect(pp.counts).toEqual({ not_allowed: 0, allowed: 1 });
    expect(pp.n).toBe(1);
    expect(pp.coverage).toBeCloseTo(0.25);
    expect(agg.priors.inv!.ghost).toBeUndefined();
    expect(agg.docs_by_archetype).toEqual({ inv: 4 });
  });

  it("keeps a zero-filled entry for nodes no spec mentions (coverage 0)", () => {
    const a = aggregateConcepts([{ archetype: "inv", data: empty() }], NODES);
    expect(a.priors.inv!.credit_notes).toEqual({ counts: { none: 0, credit_notes: 0, refunds_via_provider: 0 }, n: 0, fraction: { none: 0, credit_notes: 0, refunds_via_provider: 0 }, coverage: 0 });
  });

  it("merges new concepts by normalized name, one vote per doc per value, sorted by n", () => {
    const nc = (concept: string, value: string, evidence = "ev") => ({ concept, value, evidence, why_it_matters: "w" });
    const a = aggregateConcepts(
      [
        { archetype: "inv", data: empty({ new_concepts: [nc("Purchase Order Reference", "Yes"), nc("purchase_order_reference", "yes", "dup in same doc"), nc("late_fee_grace", "7_days")] }) },
        { archetype: "inv", data: empty({ new_concepts: [nc("purchase-order reference", "no"), nc("purchase_order_reference", "yes")] }) },
        { archetype: "inv", data: empty({ new_concepts: [nc("purchase_order_reference", "yes")] }) },
        { archetype: "other", data: empty({ new_concepts: [nc("something_else", "")] }) },
      ],
      () => NODES,
    );
    expect(a.new_concepts.inv!.map((c) => c.concept)).toEqual(["purchase_order_reference", "late_fee_grace"]);
    const po = a.new_concepts.inv![0]!;
    expect(po.n).toBe(3); // doc 2 mentions it with two values but counts once
    expect(po.values).toEqual({ yes: 3, no: 1 });
    expect(po.examples.length).toBeLessThanOrEqual(3);
    expect(a.new_concepts.other![0]).toMatchObject({ concept: "something_else", values: { yes: 1 }, n: 1 });
  });

  it("resolves nodes per archetype when given a function", () => {
    const a = aggregateConcepts(
      [
        { archetype: "x", data: empty({ decisions: [dec("only_x", "a")] }) },
        { archetype: "y", data: empty({ decisions: [dec("only_x", "a")] }) },
      ],
      (arch) => (arch === "x" ? [node("only_x", ["a", "b"])] : []),
    );
    expect(a.priors.x!.only_x!.n).toBe(1);
    expect(a.priors.y).toEqual({});
  });
});

describe("priorHints", () => {
  const agg = aggregateConcepts(
    [
      { archetype: "inv", data: empty({ decisions: [dec("credit_notes", "credit_notes"), dec("partial_payments", "allowed")] }) },
      { archetype: "inv", data: empty({ decisions: [dec("credit_notes", "credit_notes")] }) },
      { archetype: "inv", data: empty({ decisions: [dec("credit_notes", "none")] }) },
      { archetype: "inv", data: empty() },
    ],
    NODES,
  );

  it("smooths with +0.5 per option and picks the argmax", () => {
    const h = priorHints(agg, 0.3);
    const cn = h.inv!.credit_notes!;
    // counts 1/2/0 over n=3, K=3 → denom 4.5
    expect(cn.prior.none).toBeCloseTo(1.5 / 4.5, 3);
    expect(cn.prior.credit_notes).toBeCloseTo(2.5 / 4.5, 3);
    expect(cn.prior.refunds_via_provider).toBeCloseTo(0.5 / 4.5, 3);
    expect(Object.values(cn.prior).reduce((s, v) => s + v, 0)).toBeCloseTo(1, 2);
    expect(cn.defaultOption).toBe("credit_notes");
    expect(cn.evidence_n).toBe(3);
    expect(cn.coverage).toBeCloseTo(0.75);
  });

  it("gates on coverage (default 0.3) and never emits a zero prior", () => {
    expect(priorHints(agg).inv!.partial_payments).toBeUndefined(); // coverage 0.25
    const loose = priorHints(agg, 0.2).inv!.partial_payments!;
    expect(loose.defaultOption).toBe("allowed");
    expect(loose.prior.not_allowed).toBeGreaterThan(0);
    expect(loose.prior).toEqual({ not_allowed: 0.25, allowed: 0.75 });
    expect(JSON.parse(JSON.stringify(loose))).toEqual(loose); // plain JSON, pasteable
  });

  it("breaks argmax ties by catalog order", () => {
    const tie = aggregateConcepts([{ archetype: "inv", data: empty({ decisions: [dec("partial_payments", "allowed")] }) }, { archetype: "inv", data: empty({ decisions: [dec("partial_payments", "not_allowed")] }) }], NODES);
    expect(priorHints(tie, 0).inv!.partial_payments!.defaultOption).toBe("not_allowed");
  });
});

describe("concept mock", () => {
  const nodes = [
    { id: "credit_notes", options: [{ id: "none", label: "Not needed" }, { id: "credit_notes", label: "Credit notes against invoices" }, { id: "refunds_via_provider", label: "Credit notes plus refunds" }] },
    { id: "partial_payments", options: [{ id: "not_allowed", label: "No" }, { id: "allowed", label: "Yes" }] },
    { id: "currencies", options: [{ id: "single", label: "One currency" }, { id: "multi", label: "Invoices in different currencies" }] },
  ];

  it("is polarity-aware: negated mentions select the negative option", () => {
    const pos = mockDecide(nodes, "The firm issues a credit note when needed. Partial payments are allowed.");
    expect(pos.find((d) => d.node_id === "credit_notes")?.option_id).toBe("credit_notes");
    expect(pos.find((d) => d.node_id === "partial_payments")?.option_id).toBe("allowed");
    const neg = mockDecide(nodes, "Credit notes are not supported. We do not allow partial payment.");
    expect(neg.find((d) => d.node_id === "credit_notes")?.option_id).toBe("none");
    expect(neg.find((d) => d.node_id === "partial_payments")?.option_id).toBe("not_allowed");
    const silent = mockDecide(nodes, "Invoices are sent by email.");
    expect(silent).toEqual([]);
  });

  it("produces schema-valid output from a rendered prompt", () => {
    const { user } = renderExtractionPrompt({ id: "d", archetype: "b2b-invoicing", text: "The client pays. Each invoice references the purchase order." }, NODES);
    const out = mockExtract(user);
    expect(ConceptExtractionSchema.safeParse(out).success).toBe(true);
    expect(out.new_concepts.map((c) => c.concept)).toContain("purchase_order_reference");
    expect(out.actors).toContain("client");
  });
});

describe("stage 2 end to end over the fixture corpus (mock)", () => {
  it("extracts all docs and yields option-level priors for b2b-invoicing", async () => {
    const docs = await loadCorpus(CORPUS);
    const catalogs = await loadCatalogs();
    const nodesFor = (a: string) => mergeCatalogs(catalogs.catalogs, [a]).nodes;
    const llm = new MockLLM(conceptMockHandlers);
    const logs: string[] = [];
    const result = await runStage2(llm, docs, nodesFor, { concurrency: 2, log: (s) => logs.push(s) });

    expect(docs.length).toBe(7);
    expect(result.extractions.length).toBe(7);
    expect(result.extractions.every((r) => r.data !== null && r.error === null)).toBe(true);
    expect(llm.calls.length).toBe(7);
    expect(logs.length).toBe(7);
    expect(new Set(result.extractions.map((r) => r.doc_id))).toEqual(new Set(docs.map((d) => d.id)));
    expect(result.aggregate.docs_by_archetype).toEqual({ "b2b-invoicing": 4, booking: 3 });

    const inv = result.aggregate.priors["b2b-invoicing"]!;
    // fixtures: "credit note" in a.md and b.md; "partial payment" in a.md and c.md; "recurring invoice" in b.md and d.md
    expect(inv.credit_notes).toMatchObject({ n: 2, coverage: 0.5 });
    expect(inv.credit_notes!.counts.credit_notes).toBe(2);
    expect(inv.credit_notes!.fraction.credit_notes).toBe(1);
    expect(inv.partial_payments).toMatchObject({ n: 2, coverage: 0.5 });
    expect(inv.partial_payments!.counts.allowed).toBe(2);
    expect(inv.recurring_invoices!.counts.yes).toBe(2);
    // a node no fixture mentions stays at zero
    expect(inv.currencies!.n).toBe(0);

    const hints = result.hints["b2b-invoicing"]!;
    expect(hints.credit_notes!.defaultOption).toBe("credit_notes");
    expect(hints.credit_notes!.evidence_n).toBe(2);
    expect(hints.partial_payments!.defaultOption).toBe("allowed");
    expect(hints.currencies).toBeUndefined();

    const fresh = result.aggregate.new_concepts["b2b-invoicing"]!;
    expect(fresh[0]).toMatchObject({ concept: "purchase_order_reference", n: 2, values: { yes: 2 } });
  });

  it("records a failed extraction instead of aborting the batch", async () => {
    const docs = await loadCorpus(CORPUS);
    let calls = 0;
    const llm = new MockLLM({
      concept_extract: (req) => {
        calls++;
        if (req.user.includes("DOCUMENT ID: b2b-invoicing/b.md")) throw new Error("boom");
        return conceptMockHandlers.concept_extract!(req, calls);
      },
    });
    const result = await runStage2(llm, docs, () => NODES, { concurrency: 1 });
    const failed = result.extractions.filter((r) => r.error);
    expect(failed.map((r) => r.doc_id)).toEqual(["b2b-invoicing/b.md"]);
    expect(failed[0]!.data).toBeNull();
    expect(result.aggregate.docs_by_archetype["b2b-invoicing"]).toBe(3); // the failed doc does not vote
  });
});
