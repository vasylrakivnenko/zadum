import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  normToken,
  tokenizeSentences,
  documentGrams,
  analyzeCorpus,
  candidates,
  coverageTerms,
  specCoverage,
  binaryEntropy,
  pmi,
  cTfIdf,
  type Doc,
} from "./ngrams.js";
import { loadCorpus, mine, catalogGaps, nodeRelevance, nodeTerms } from "./mine.js";
import { loadCatalogs } from "../engine/catalogs.js";
import { mergeCatalogs } from "../core/catalog.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const CORPUS = path.join(here, "fixtures", "corpus");

async function fixtures(): Promise<Doc[]> {
  return loadCorpus(CORPUS);
}

describe("tokenization", () => {
  it("singularizes without mangling -us / -is / -ss words", () => {
    expect(normToken("invoices")).toBe("invoice");
    expect(normToken("policies")).toBe("policy");
    expect(normToken("batches")).toBe("batch");
    // the naive "strip trailing s" would break all of these
    expect(normToken("status")).toBe("status");
    expect(normToken("analysis")).toBe("analysis");
    expect(normToken("business")).toBe("business");
    expect(normToken("tax")).toBe("tax");
  });

  it("keeps n-grams inside sentences and rejects stopword boundaries", () => {
    const grams = documentGrams("The client pays an invoice. Credit note issued.", 3);
    const terms = [...grams.keys()];
    // internal stopwords are allowed, boundary stopwords are not
    expect(terms).toContain("client");
    expect(terms).toContain("credit note");
    expect(terms).not.toContain("the client");
    expect(terms).not.toContain("pays an");
    // no gram spans the sentence boundary
    expect(terms.some((t) => t.includes("invoice credit"))).toBe(false);
  });

  it("rejects grammatical fragments while keeping prepositional concepts", () => {
    const terms = [...documentGrams("The booking is confirmed by email. Payment on account is allowed. Calendar and create.", 3).keys()];
    expect(terms).not.toContain("booking is confirmed");
    expect(terms).not.toContain("calendar and create");
    expect(terms).toContain("payment on account");
  });

  it("strips markdown and drops bare numbers", () => {
    const s = tokenizeSentences("## Heading\n`code()` and [a link](http://x) with 42 items");
    const flat = s.flat();
    expect(flat).toContain("heading");
    expect(flat).toContain("link");
    expect(flat).not.toContain("42");
    expect(flat.join(" ")).not.toContain("http");
  });
});

describe("corpus statistics", () => {
  it("counts document frequency per archetype across n = 1..3", async () => {
    const stats = analyzeCorpus(await fixtures(), { maxN: 3, minDf: 1 });
    expect(stats.docs).toBe(7);
    expect(stats.docs_by_archetype).toEqual({ "b2b-invoicing": 4, booking: 3 });

    const df = (t: string, a: string) => stats.terms.get(t)?.df_by_archetype[a] ?? 0;
    // saturated unigrams: every invoicing spec mentions them → no information as a decision axis
    expect(df("invoice", "b2b-invoicing")).toBe(4);
    expect(df("client", "b2b-invoicing")).toBe(4);
    // engineered half-and-half phrases → the maximum-entropy axes
    expect(df("credit note", "b2b-invoicing")).toBe(2);
    expect(df("partial payment", "b2b-invoicing")).toBe(2);
    expect(df("recurring invoice", "b2b-invoicing")).toBe(2);
    expect(df("client portal", "b2b-invoicing")).toBe(2);
    expect(df("purchase order", "b2b-invoicing")).toBe(2);
    // archetype separation
    expect(df("invoice", "booking")).toBe(0);
    expect(df("booking", "booking")).toBe(3);
    expect(stats.terms.get("appointment")?.df_by_archetype["b2b-invoicing"]).toBeUndefined();
  });

  it("scores phraseness and class-distinctiveness", async () => {
    const stats = analyzeCorpus(await fixtures(), { maxN: 3, minDf: 1 });
    // a real phrase co-occurs far above chance
    expect(pmi(stats, "credit note")).toBeGreaterThan(1);
    expect(pmi(stats, "invoice")).toBe(Infinity); // unigrams are not phraseness-filtered
    // c-TF-IDF separates the classes
    expect(cTfIdf(stats, "invoice", "b2b-invoicing")).toBeGreaterThan(cTfIdf(stats, "invoice", "booking"));
    expect(cTfIdf(stats, "booking", "booking")).toBeGreaterThan(0);
    expect(cTfIdf(stats, "booking", "b2b-invoicing")).toBe(0);
  });

  it("binary entropy peaks at one half", () => {
    expect(binaryEntropy(0.5)).toBeCloseTo(1, 9);
    expect(binaryEntropy(1)).toBe(0);
    expect(binaryEntropy(0)).toBe(0);
    expect(binaryEntropy(0.9)).toBeLessThan(binaryEntropy(0.7));
  });
});

describe("decision-axis candidates", () => {
  it("keeps the half-and-half phrases and excludes saturated terms", async () => {
    const stats = analyzeCorpus(await fixtures(), { maxN: 3, minDf: 1 });
    const cands = candidates(stats, "b2b-invoicing", { band: [0.2, 0.8], minPmi: 1 });
    const terms = cands.map((c) => c.term);

    for (const t of ["credit note", "partial payment", "recurring invoice", "client portal", "purchase order"]) expect(terms).toContain(t);
    // DF = 1.0 → no entropy → not a question, it is a default (and belongs on the coverage checklist)
    expect(terms).not.toContain("invoice");
    expect(terms).not.toContain("client");
    // nothing from the other archetype leaks in
    expect(terms).not.toContain("booking");

    for (const c of cands) {
      expect(c.df_fraction).toBeGreaterThanOrEqual(0.2);
      expect(c.df_fraction).toBeLessThanOrEqual(0.8);
      expect(c.entropy).toBeGreaterThan(0);
    }
    // multiword axes outrank generic single words: this is why 1..3-grams are mined but reported by role
    expect(cands[0]!.n).toBeGreaterThan(1);
  });

  it("prunes a short gram subsumed by a longer one with the same document frequency", async () => {
    const stats = analyzeCorpus(await fixtures(), { maxN: 3, minDf: 1 });
    const terms = candidates(stats, "b2b-invoicing", { band: [0.2, 0.8], minPmi: 1 }).map((c) => c.term);
    // "credit" only ever occurs inside "credit note" here → it carries no extra information
    expect(terms).toContain("credit note");
    expect(terms).not.toContain("credit");
    // pruning is non-destructive: the raw statistics still hold the term
    expect(stats.terms.get("credit")?.df_by_archetype["b2b-invoicing"]).toBe(2);
  });

  it("mines both archetypes independently", async () => {
    const stats = analyzeCorpus(await fixtures(), { maxN: 3, minDf: 1 });
    const booking = candidates(stats, "booking", { band: [0.2, 0.8], minPmi: 1 }).map((c) => c.term);
    expect(booking.some((t) => t.includes("deposit") || t.includes("reminder") || t.includes("service"))).toBe(true);
    expect(booking).not.toContain("invoice");
    // "booking" is in every booking spec → checklist, not axis
    expect(booking).not.toContain("booking");
  });
});

describe("coverage checklist", () => {
  it("collects the near-universal terms of an archetype", async () => {
    const stats = analyzeCorpus(await fixtures(), { maxN: 3, minDf: 1 });
    const checklist = coverageTerms(stats, "b2b-invoicing", 0.8).map((c) => c.term);
    expect(checklist).toContain("invoice");
    expect(checklist).toContain("client");
    expect(checklist).not.toContain("credit note");
  });

  it("flags what a compiled spec fails to mention", async () => {
    const stats = analyzeCorpus(await fixtures(), { maxN: 3, minDf: 1 });
    const good = "The firm sends an invoice to a client and records each payment against it.";
    const bad = "Users can log in and see a dashboard of things.";
    const covGood = specCoverage(good, stats, "b2b-invoicing", 0.8);
    const covBad = specCoverage(bad, stats, "b2b-invoicing", 0.8);
    expect(covGood.score).toBeGreaterThan(covBad.score);
    expect(covBad.missing.map((m) => m.term)).toContain("invoice");
    expect(covGood.present).toContain("invoice");
    expect(covGood.missing.every((m) => m.df_fraction >= 0.8)).toBe(true);
  });
});

describe("catalog confrontation", () => {
  it("reports axes the catalog has no node for, and matches the ones it does", async () => {
    const catalogs = await loadCatalogs();
    const { nodes } = mergeCatalogs(catalogs.catalogs, ["b2b-invoicing"]);
    const stats = analyzeCorpus(await fixtures(), { maxN: 3, minDf: 1 });
    const cands = candidates(stats, "b2b-invoicing", { band: [0.2, 0.8], minPmi: 1 });
    const gaps = catalogGaps(cands, nodes);
    const gapTerms = gaps.map((g) => g.candidate.term);

    // the catalog has a credit_notes node and a client-portal node → covered, not gaps
    expect(gapTerms).not.toContain("credit note");
    expect(gapTerms).not.toContain("partial payment");
    // the fixture corpus also mentions purchase orders on invoices — the catalog now HAS a node for that
    // (invoice_po_reference, added from this exact mining signal on the real corpus). Confirming it dropped
    // out of `gaps` entirely (full overlap, not just a nearest-match) is the regression test that catalog
    // growth is being picked up correctly.
    expect(gapTerms).not.toContain("purchase order");
    const poNode = nodes.find((n) => n.id === "invoice_po_reference");
    expect(poNode).toBeDefined();
    expect(nodeTerms(poNode!).has("purchase")).toBe(true);
    expect(nodeTerms(poNode!).has("order")).toBe(true);
  });

  it("scores how much a corpus talks about each existing node", async () => {
    const catalogs = await loadCatalogs();
    const { nodes } = mergeCatalogs(catalogs.catalogs, ["b2b-invoicing"]);
    const stats = analyzeCorpus(await fixtures(), { maxN: 3, minDf: 1 });
    const rel = nodeRelevance(stats, "b2b-invoicing", nodes);
    const byId = new Map(rel.map((r) => [r.node, r]));
    expect(byId.get("payment_recording")!.evidence).toBeGreaterThan(0.9);
    // sorted least-mentioned first — those are the applies_to / not_applicable candidates
    expect(rel[0]!.evidence).toBeLessThanOrEqual(rel.at(-1)!.evidence);
    expect(nodeTerms(nodes.find((n) => n.id === "credit_notes")!)).toContain("credit");
  });
});

describe("mine()", () => {
  it("produces a reviewable report per archetype", async () => {
    const catalogs = await loadCatalogs();
    const report = mine(await fixtures(), (a) => mergeCatalogs(catalogs.catalogs, [a]).nodes, { minDf: 1, limit: 25 });
    expect(report.corpus.docs).toBe(7);
    expect(Object.keys(report.archetypes).sort()).toEqual(["b2b-invoicing", "booking"]);
    const inv = report.archetypes["b2b-invoicing"]!;
    expect(inv.candidates.length).toBeGreaterThan(3);
    expect(inv.candidates.length).toBeLessThanOrEqual(25);
    expect(inv.coverage.some((c) => c.term === "invoice")).toBe(true);
    expect(inv.relevance.length).toBeGreaterThan(20);
    expect(inv.top_c_tfidf[0]!.score).toBeGreaterThan(0);
    // 1..3-grams all present in the mix
    expect(Object.keys(inv.by_n).length).toBeGreaterThan(1);
  });
});
