import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import {
  DOC_TYPES,
  LexiconSchema,
  assertLexicon,
  catalogNodeIndex,
  detectableIn,
  gapCandidates,
  isKnownLocus,
  lexiconStats,
  loadLexicon,
  loadValidatedLexicon,
  validateLexicon,
  type Lexicon,
  type LexiconEntry,
} from "./lexicon.js";
import {
  MAX_TREE_ENTRIES,
  approxTokens,
  boundText,
  classifyRepoFile,
  condenseRepo,
  condenseSpecDoc,
  pruneFiles,
  readRepoDir,
  renderTree,
  specHeadings,
  type Digest,
  type RepoFile,
} from "./condense.js";
import {
  ARTIFACT_MARKER,
  FEATURES_MARKER,
  LabelBatchSchema,
  applyEvidenceRules,
  askableFeatures,
  batchFeatures,
  cacheHitRate,
  categoryDiscussed,
  estimateCost,
  labelDocument,
  parseArgs,
  parseGithubRepo,
  quoteOccurs,
  renderLabelPrefix,
  renderLabelPrompt,
  renderLabelQuestion,
  summarizeRow,
  type Cell,
  type LabelBatch,
  PRICE_PER_MTOK,
} from "./label.js";
import { labelMockHandlers, mockLabelFeatures, parseLabelPrompt } from "./label_mock.js";
import { AnthropicLLM, CachedLLM, MockLLM, type LLMUsage } from "../llm/client.js";
import { AnthropicFoundryLLM } from "../llm/anthropic_foundry.js";
import { loadCatalogs } from "../engine/catalogs.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_REPO = path.join(here, "fixtures", "repo");

// ---------- small hand-built lexicon for the rule tests ----------

const entry = (over: Partial<LexiconEntry> & { id: string }): LexiconEntry => ({
  label: `feature ${over.id}`,
  category: "payments",
  maps_to: null,
  loci: { repo: [], spec_doc: [] },
  detectable_in: [],
  ...over,
});

const TEST_LEXICON: Lexicon = {
  version: "test-1",
  description: "",
  categories: [
    { id: "payments", label: "Payments", context_loci: { repo: ["payment_code"], spec_doc: ["payments_section"] } },
    { id: "identity_access", label: "Identity", context_loci: { repo: ["auth_code"], spec_doc: ["actors_section"] } },
  ],
  features: [
    entry({ id: "refunds", loci: { repo: ["payment_code", "db_schema"], spec_doc: ["payments_section"] }, detectable_in: ["repo", "spec_doc"] }),
    entry({ id: "sso", category: "identity_access", loci: { repo: ["auth_code"], spec_doc: ["actors_section"] }, detectable_in: ["repo", "spec_doc"] }),
    entry({ id: "spec_only_thing", loci: { repo: [], spec_doc: ["payments_section"] }, detectable_in: ["spec_doc"] }),
  ],
};

const digest = (over: Partial<Digest> = {}): Digest => ({
  doc_id: "d1",
  doc_type: "repo",
  archetype: "b2b-invoicing",
  text: "===== LOCUS: payment_code =====\nconst stripe = new Stripe(key);\n",
  available_loci: ["payment_code", "db_schema", "file_tree"],
  sections: [],
  approx_tokens: 10,
  truncated: false,
  stats: {},
  ...over,
});

const raw = (over: Partial<LabelBatch["labels"][number]> = {}): LabelBatch["labels"][number] => ({
  feature_id: "refunds",
  verdict: "absent",
  evidence: "",
  loci_checked: ["payment_code"],
  ...over,
});

const featureOf = (id: string) => TEST_LEXICON.features.find((f) => f.id === id)!;

// ---------- lexicon ----------

describe("lexicon: the real catalogs/lexicon/lexicon.json", () => {
  it("every maps_to resolves to a real catalog node AND a real option of that node", async () => {
    const { lexicon, catalogVersion } = await loadValidatedLexicon(); // throws on any unresolved reference
    expect(catalogVersion).toContain("core@");
    const catalogs = await loadCatalogs();
    const index = catalogNodeIndex(catalogs.catalogs);
    for (const f of lexicon.features) {
      if (!f.maps_to) continue;
      expect(index.get(f.maps_to.node), `${f.id} → node ${f.maps_to.node}`).toBeDefined();
      expect([...index.get(f.maps_to.node)!], `${f.id} → option`).toContain(f.maps_to.option);
    }
  });

  it("is the size and shape the evidence layer needs", async () => {
    const lexicon = await loadLexicon();
    const s = lexiconStats(lexicon);
    // A sanity band, not a target. The ceiling was 150 when the lexicon covered 102 of the 135 catalog nodes;
    // closing the remaining 33 (each needing >= 2 features on distinct options, or the node can never reach
    // `observed`) put the arithmetic floor at ~202, so the old bound was incompatible with full coverage
    // rather than protective of it. Raised to 300 — wide enough for the rest of the catalog to be covered,
    // tight enough that a runaway generator adding a thousand features still trips it.
    expect(s.features).toBeGreaterThanOrEqual(120);
    expect(s.features).toBeLessThanOrEqual(300);
    // Every catalog node is observable: a new node added with no lexicon feature would make the matrix
    // silently blind to it, so coverage is asserted here rather than left to a report nobody reads.
    expect(s.nodes_covered).toBe(135);
    expect(s.mapped + s.gaps).toBe(s.features);
    // catalog-gap candidates are a legitimate output, not a defect — but they must be a minority
    expect(s.gaps).toBeGreaterThan(0);
    expect(s.gaps).toBeLessThan(s.mapped / 4);
    expect(s.by_doc_type.spec_doc).toBeGreaterThan(0);
    expect(s.by_doc_type.repo).toBeGreaterThan(0);
    // features that are undetectable in repos by construction exist — that is rule 0 having something to do
    expect(s.by_doc_type.repo).toBeLessThan(s.features);
    for (const g of gapCandidates(lexicon)) expect(g.maps_to).toBeNull();
  });

  it("detectable_in is exactly the doc types with declared loci, and every locus is in the closed vocabulary", async () => {
    const lexicon = await loadLexicon();
    for (const f of lexicon.features) {
      for (const dt of DOC_TYPES) {
        expect(f.detectable_in.includes(dt), `${f.id}/${dt}`).toBe(f.loci[dt].length > 0);
        for (const l of f.loci[dt]) expect(isKnownLocus(dt, l), `${f.id}: ${l}`).toBe(true);
      }
    }
  });

  it("every category referenced by a feature exists and declares context loci for both doc types", async () => {
    const lexicon = await loadLexicon();
    const byId = new Map(lexicon.categories.map((c) => [c.id, c]));
    for (const f of lexicon.features) {
      const cat = byId.get(f.category);
      expect(cat, `${f.id} → ${f.category}`).toBeDefined();
      expect(cat!.context_loci.repo.length).toBeGreaterThan(0);
      expect(cat!.context_loci.spec_doc.length).toBeGreaterThan(0);
    }
  });
});

describe("lexicon: validation fails loudly", () => {
  const index = new Map([["payments_in_app", new Set(["none", "collect_online"])]]);
  const base = (features: LexiconEntry[]): Lexicon => ({ ...TEST_LEXICON, features });

  it("rejects an unknown node, an unknown option, an unknown category and an unknown locus", () => {
    const bad = base([
      entry({ id: "ghost_node", maps_to: { node: "not_a_node", option: "x" }, loci: { repo: ["db_schema"], spec_doc: [] }, detectable_in: ["repo"] }),
      entry({ id: "ghost_option", maps_to: { node: "payments_in_app", option: "not_an_option" }, loci: { repo: ["db_schema"], spec_doc: [] }, detectable_in: ["repo"] }),
      entry({ id: "ghost_category", category: "nope", loci: { repo: ["db_schema"], spec_doc: [] }, detectable_in: ["repo"] }),
      entry({ id: "ghost_locus", loci: { repo: ["not_a_locus"], spec_doc: [] }, detectable_in: ["repo"] }),
    ]);
    const problems = validateLexicon(bad, index).map((i) => `${i.where}: ${i.problem}`);
    expect(problems.some((p) => p.includes("ghost_node") && p.includes("not a catalog node"))).toBe(true);
    expect(problems.some((p) => p.includes("ghost_option") && p.includes("not an option"))).toBe(true);
    expect(problems.some((p) => p.includes("ghost_category") && p.includes("unknown category"))).toBe(true);
    expect(problems.some((p) => p.includes("ghost_locus") && p.includes("unknown repo locus"))).toBe(true);
    expect(() => assertLexicon(bad, index)).toThrow(/lexicon invalid \(4 problems\)/);
  });

  it("rejects detectable_in that disagrees with the declared loci, and duplicate ids", () => {
    const bad = base([
      entry({ id: "claims_too_much", loci: { repo: [], spec_doc: ["payments_section"] }, detectable_in: ["repo", "spec_doc"] }),
      entry({ id: "claims_too_little", loci: { repo: ["db_schema"], spec_doc: [] }, detectable_in: [] }),
      entry({ id: "dup", loci: { repo: ["db_schema"], spec_doc: [] }, detectable_in: ["repo"] }),
      entry({ id: "dup", loci: { repo: ["db_schema"], spec_doc: [] }, detectable_in: ["repo"] }),
    ]);
    const problems = validateLexicon(bad, index).map((i) => `${i.where}: ${i.problem}`);
    expect(problems.some((p) => p.includes("claims_too_much") && p.includes("declares no repo witness locus"))).toBe(true);
    expect(problems.some((p) => p.includes("claims_too_little") && p.includes("detectable in no document type"))).toBe(true);
    expect(problems.some((p) => p.includes("dup") && p.includes("duplicate"))).toBe(true);
  });

  it("accepts the valid hand-built lexicon", () => {
    expect(validateLexicon(TEST_LEXICON, index)).toEqual([]);
  });

  it("the on-disk file parses under the schema", async () => {
    const lexicon = await loadLexicon();
    expect(LexiconSchema.safeParse(lexicon).success).toBe(true);
  });
});

// ---------- condenser ----------

const file = (p: string, text: string | null = `content of ${p}`, bytes = 100): RepoFile => ({ path: p, text, bytes });

describe("condense: pruning", () => {
  it("drops vendored trees, build output, lockfiles, binaries and oversized files — by path alone", () => {
    const { kept, dropped } = pruneFiles([
      file("src/app.ts"),
      file("node_modules/left-pad/index.js"),
      file("frontend/node_modules/x/y.js"),
      file("dist/bundle.js"),
      file("vendor/acme/huge.php"),
      file("package-lock.json"),
      file("assets/logo.png", null),
      file("data/dump.sqlite3", null),
      file("huge.ts", "x", 900_000),
      file(".git/config"),
    ]);
    expect(kept.map((f) => f.path)).toEqual(["src/app.ts"]);
    const reasons = Object.fromEntries(dropped.map((d) => [d.path, d.reason]));
    expect(reasons["node_modules/left-pad/index.js"]).toContain("node_modules");
    expect(reasons["frontend/node_modules/x/y.js"]).toContain("node_modules");
    expect(reasons["package-lock.json"]).toBe("lockfile/noise");
    expect(reasons["assets/logo.png"]).toBe("binary/asset");
    expect(reasons["huge.ts"]).toContain("over ");
  });

  it("classifies files into loci, structural buckets before topical ones", () => {
    expect(classifyRepoFile("README.md")).toBe("readme");
    expect(classifyRepoFile("composer.json")).toBe("dependency_manifest");
    expect(classifyRepoFile("db/migrate/20240101_add_invoices.rb")).toBe("db_schema");
    expect(classifyRepoFile("app/controllers/invoices_controller.rb")).toBe("routes");
    expect(classifyRepoFile("src/payments/stripe.ts")).toBe("payment_code");
    expect(classifyRepoFile("lib/auth/session.py")).toBe("auth_code");
    expect(classifyRepoFile("app/jobs/reminder_job.rb")).toBe("background_jobs");
    expect(classifyRepoFile(".env.example")).toBe("config_env");
    expect(classifyRepoFile("some/random/thing.txt")).toBeNull();
  });
});

describe("condense: the fixture repo", () => {
  it("is deterministic — the same listing always yields byte-identical text and loci", async () => {
    const files = await readRepoDir(FIXTURE_REPO);
    const a = condenseRepo("tinyshop", files);
    const b = condenseRepo("tinyshop", [...files].reverse());
    expect(b.text).toBe(a.text);
    expect(b.available_loci).toEqual(a.available_loci);
  });

  it("keeps the evidence-bearing files, prunes the noise, and reports the loci it contains", async () => {
    const d = condenseRepo("tinyshop", await readRepoDir(FIXTURE_REPO));
    expect(d.doc_type).toBe("repo");
    expect(d.text).toContain("stripe");
    expect(d.text).toContain("invoice_number TEXT NOT NULL UNIQUE");
    expect(d.text).not.toContain("vendored third-party bundle");
    expect(d.text).not.toContain("build output");
    expect(d.text).not.toContain("lockfileVersion");
    expect(d.available_loci).toContain("db_schema");
    expect(d.available_loci).toContain("payment_code");
    expect(d.available_loci).toContain("dependency_manifest");
    expect(d.available_loci).toContain("file_tree");
    // every reported locus really has a section header in the text — this is what licenses `absent`
    for (const l of d.available_loci) expect(d.text).toContain(`===== LOCUS: ${l} =====`);
    // and nothing is claimed that is not there
    expect(d.available_loci).toEqual([...new Set(d.sections.map((s) => s.locus))].sort());
    expect(d.stats.files_pruned).toBeGreaterThan(0);
  });

  it("a locus whose files yielded no quotable line is still reported as inspected-and-empty", async () => {
    const d = condenseRepo("tinyshop", await readRepoDir(FIXTURE_REPO));
    // src/auth/session.ts has no cue lines, but the file exists, so auth_code was inspected
    expect(d.available_loci).toContain("auth_code");
    expect(d.text).toContain("no line matched the signature patterns");
  });

  it("respects the token cap, dropping whole files rather than half-showing one", async () => {
    const files = await readRepoDir(FIXTURE_REPO);
    const tiny = condenseRepo("tinyshop", files, { maxTokens: 60 });
    expect(tiny.truncated).toBe(true);
    expect(tiny.approx_tokens).toBeLessThanOrEqual(60 + 20);
    expect(tiny.available_loci.length).toBeLessThan(condenseRepo("tinyshop", files).available_loci.length);
    for (const l of tiny.available_loci) expect(tiny.text).toContain(`===== LOCUS: ${l} =====`);
  });

  it("weights the budget across loci so one enormous locus cannot starve the rest", () => {
    // Spree's ~160k characters of Ruby models did exactly this under an all-or-nothing section rule.
    const huge = Array.from({ length: 60 }, (_, i) => file(`app/models/model${String(i).padStart(2, "0")}.rb`, "class Thing\n".repeat(400)));
    const rest = [file("README.md", "# App"), file("package.json", '{"dependencies":{"stripe":"^1"}}'), file("app/controllers/orders_controller.rb", "def create\nend\n")];
    const d = condenseRepo("big", [...huge, ...rest], { maxTokens: 10_000 });
    expect(d.available_loci).toContain("db_schema");
    expect(d.available_loci).toContain("readme");
    expect(d.available_loci).toContain("dependency_manifest");
    expect(d.available_loci).toContain("routes"); // would have been starved by the models
    expect(d.text).toContain("further db_schema file(s) omitted for length");
    expect(d.truncated).toBe(true);
    expect(d.approx_tokens).toBeLessThanOrEqual(10_000);
  });

  it("renders a pruned, capped, sorted file tree", () => {
    const many = Array.from({ length: 400 }, (_, i) => file(`src/mod${String(i).padStart(3, "0")}/index.ts`));
    const tree = renderTree(many, 50);
    expect(tree.split("\n")[0]).toContain("src/mod000/");
    expect(tree).toContain("more directories");
    expect(renderTree(many, MAX_TREE_ENTRIES).length).toBeGreaterThan(tree.length);
  });
});

describe("condense: spec documents", () => {
  const DOC = `# Invoicing app

An app for a bookkeeper.

## People and roles
Owner and staff.

## Payments
Clients pay by card.

## Out of scope
No multi-currency.
`;

  it("derives available loci from headings — that is what makes a spec-side negative licensable", () => {
    const d = condenseSpecDoc("doc1", DOC);
    expect(d.doc_type).toBe("spec_doc");
    expect(d.available_loci).toContain("overview"); // every document has a beginning
    expect(d.available_loci).toContain("payments_section");
    expect(d.available_loci).toContain("actors_section");
    expect(d.available_loci).toContain("non_goals_section");
    expect(d.available_loci).not.toContain("scheduling_section");
    expect(d.text).toContain("Clients pay by card.");
  });

  it("matches setext headings too, and never reports a locus twice", () => {
    const headings = specHeadings("Payments\n========\n\nBilling and refunds\n-------------------\n");
    expect(headings.map((h) => h.locus)).toContain("payments_section");
    const d = condenseSpecDoc("doc2", "## Payments\n\n## Billing\n");
    expect(d.available_loci.filter((l) => l === "payments_section")).toHaveLength(1);
  });

  it("bounds a long document and says so", () => {
    const long = "x".repeat(200_000);
    const b = boundText(long, 1000);
    expect(b.truncated).toBe(true);
    expect(b.text).toContain("truncated: 199000 more characters");
    const d = condenseSpecDoc("doc3", long, { maxTokens: 1000 });
    expect(d.truncated).toBe(true);
    expect(approxTokens(d.text.length)).toBeLessThanOrEqual(1000);
  });
});

// ---------- the rules ----------

describe("applyEvidenceRules: rule 0 — undetectable by construction", () => {
  it("a feature with no locus for this doc type is unobserved and is never asked", () => {
    const d = digest();
    const cell = applyEvidenceRules(featureOf("spec_only_thing"), raw({ feature_id: "spec_only_thing", verdict: "present", evidence: "anything" }), d, TEST_LEXICON);
    expect(cell.verdict).toBe("unobserved");
    expect(cell.downgrade_reason).toBe("undetectable_in_doc_type");
    expect(askableFeatures(TEST_LEXICON, d).map((f) => f.id)).not.toContain("spec_only_thing");
  });
});

describe("applyEvidenceRules: rule 1 — a negative needs a declared locus that was really inspected", () => {
  it("IS licensed when the model names a declared locus that the digest contains", () => {
    const cell = applyEvidenceRules(featureOf("refunds"), raw({ loci_checked: ["payment_code"] }), digest(), TEST_LEXICON);
    expect(cell.verdict).toBe("absent");
    expect(cell.downgrade_reason).toBeNull();
    expect(cell.loci_checked).toEqual(["payment_code"]);
  });

  it("is NOT licensed when the named locus is not in the digest — downgraded to unobserved", () => {
    // routes is not among available_loci: the labeller cannot have looked there
    const cell = applyEvidenceRules(featureOf("refunds"), raw({ loci_checked: ["routes"] }), digest(), TEST_LEXICON);
    expect(cell.verdict).toBe("unobserved");
    expect(cell.raw_verdict).toBe("absent");
    expect(cell.downgrade_reason).toBe("no_declared_locus_inspected");
    expect(cell.loci_checked).toEqual([]);
  });

  it("is NOT licensed when the named locus is in the digest but is not declared for this feature", () => {
    // file_tree is available, but `refunds` never declared it as a witness locus
    const cell = applyEvidenceRules(featureOf("refunds"), raw({ loci_checked: ["file_tree"] }), digest(), TEST_LEXICON);
    expect(cell.verdict).toBe("unobserved");
    expect(cell.downgrade_reason).toBe("no_declared_locus_inspected");
  });

  it("is NOT licensed when the model names no locus at all", () => {
    const cell = applyEvidenceRules(featureOf("refunds"), raw({ loci_checked: [] }), digest(), TEST_LEXICON);
    expect(cell.downgrade_reason).toBe("no_declared_locus_inspected");
  });
});

describe("applyEvidenceRules: rule 2 — a negative needs its parent context", () => {
  const specWithPayments = digest({
    doc_type: "spec_doc",
    text: "## Payments\nClients pay by card.\n",
    available_loci: ["overview", "payments_section"],
  });
  const specWithoutPayments = digest({
    doc_type: "spec_doc",
    text: "## People\nOwner and staff.\n",
    available_loci: ["overview", "actors_section"],
  });

  it("IS licensed when the category is discussed: a Payments section that never mentions refunds", () => {
    const cell = applyEvidenceRules(featureOf("refunds"), raw({ loci_checked: ["payments_section"] }), specWithPayments, TEST_LEXICON);
    expect(categoryDiscussed(TEST_LEXICON, "payments", specWithPayments)).toBe(true);
    expect(cell.verdict).toBe("absent");
    expect(cell.downgrade_reason).toBeNull();
  });

  it("is NOT licensed when the category is never discussed: a spec with no payments section says nothing about refunds", () => {
    // the feature declares payments_section; make it available so rule 1 passes and only rule 2 can bite
    const noPaymentContext: Lexicon = {
      ...TEST_LEXICON,
      categories: TEST_LEXICON.categories.map((c) => (c.id === "payments" ? { ...c, context_loci: { repo: ["payment_code"], spec_doc: ["pricing_section"] } } : c)),
    };
    const cell = applyEvidenceRules(featureOf("refunds"), raw({ loci_checked: ["payments_section"] }), specWithPayments, noPaymentContext);
    expect(categoryDiscussed(noPaymentContext, "payments", specWithPayments)).toBe(false);
    expect(cell.verdict).toBe("unobserved");
    expect(cell.raw_verdict).toBe("absent");
    expect(cell.downgrade_reason).toBe("category_not_discussed");
    // the loci it did inspect are still recorded — the downgrade is about meaning, not about the record
    expect(cell.loci_checked).toEqual(["payments_section"]);
  });

  it("rule 1 bites before rule 2 when both fail", () => {
    const cell = applyEvidenceRules(featureOf("refunds"), raw({ loci_checked: ["scheduling_section"] }), specWithoutPayments, TEST_LEXICON);
    expect(cell.downgrade_reason).toBe("no_declared_locus_inspected");
  });
});

describe("applyEvidenceRules: the evidence rule for `present`", () => {
  it("keeps a present verdict whose quote really occurs in the artifact", () => {
    const cell = applyEvidenceRules(featureOf("refunds"), raw({ verdict: "present", evidence: "const stripe = new Stripe(key);" }), digest(), TEST_LEXICON);
    expect(cell.verdict).toBe("present");
    expect(cell.evidence).toBe("const stripe = new Stripe(key);");
  });

  it("downgrades a present verdict with no quote, and one whose quote is invented", () => {
    const noQuote = applyEvidenceRules(featureOf("refunds"), raw({ verdict: "present", evidence: "   " }), digest(), TEST_LEXICON);
    expect(noQuote.verdict).toBe("unobserved");
    expect(noQuote.downgrade_reason).toBe("present_without_evidence");
    const invented = applyEvidenceRules(featureOf("refunds"), raw({ verdict: "present", evidence: "refunds are issued within 30 days" }), digest(), TEST_LEXICON);
    expect(invented.verdict).toBe("unobserved");
    expect(invented.downgrade_reason).toBe("evidence_not_in_artifact");
  });

  it("clamps the quote to 200 characters and tolerates whitespace normalisation", () => {
    const long = "x".repeat(400);
    const d = digest({ text: `a line with ${long} in it` });
    const cell = applyEvidenceRules(featureOf("refunds"), raw({ verdict: "present", evidence: `a line with ${long}` }), d, TEST_LEXICON);
    expect(cell.evidence.length).toBe(200);
    expect(quoteOccurs("const   stripe = new\n Stripe(key);", digest().text)).toBe(true);
    expect(quoteOccurs("short", digest().text)).toBe(false);
  });

  it("an unobserved answer is kept as-is, with only inspectable loci recorded", () => {
    const cell = applyEvidenceRules(featureOf("refunds"), raw({ verdict: "unobserved", loci_checked: ["payment_code", "routes"] }), digest(), TEST_LEXICON);
    expect(cell.verdict).toBe("unobserved");
    expect(cell.downgrade_reason).toBeNull();
    expect(cell.loci_checked).toEqual(["payment_code"]);
  });

  it("a feature that was asked but never answered is unobserved, and says which", () => {
    const asked = applyEvidenceRules(featureOf("refunds"), null, digest(), TEST_LEXICON);
    expect(asked.downgrade_reason).toBe("no_answer_from_model");
    const notAsked = applyEvidenceRules(featureOf("sso"), null, digest(), TEST_LEXICON);
    expect(notAsked.downgrade_reason).toBe("feature_not_asked"); // auth_code is not in this digest
  });
});

// ---------- asking: what gets sent to the model ----------

describe("askableFeatures / batchFeatures / prompt", () => {
  it("asks only about features with a declared locus present in this digest", () => {
    expect(askableFeatures(TEST_LEXICON, digest()).map((f) => f.id)).toEqual(["refunds"]);
    expect(askableFeatures(TEST_LEXICON, digest({ available_loci: ["auth_code"] })).map((f) => f.id)).toEqual(["sso"]);
    expect(askableFeatures(TEST_LEXICON, digest({ available_loci: [] }))).toEqual([]);
  });

  it("batches by category without ever splitting one", async () => {
    const lexicon = await loadLexicon();
    const batches = batchFeatures(detectableIn(lexicon, "spec_doc"), 45);
    expect(batches.length).toBeGreaterThan(1);
    const seen = new Set<string>();
    for (const b of batches) {
      const categories = new Set(b.map((f) => f.category));
      for (const c of categories) {
        expect(seen.has(c), `category ${c} split across batches`).toBe(false);
        seen.add(c);
      }
    }
    expect(batches.flat().length).toBe(detectableIn(lexicon, "spec_doc").length);
  });

  it("renders a prompt the mock parses back identically (the two formats are pinned together)", () => {
    const d = digest();
    const features = askableFeatures(TEST_LEXICON, d);
    const user = renderLabelPrompt(d, features);
    expect(user).toContain("DOCUMENT TYPE: repo");
    expect(user).toContain(ARTIFACT_MARKER);
    const parsed = parseLabelPrompt(user);
    expect(parsed.docType).toBe("repo");
    expect(parsed.available).toEqual(d.available_loci);
    expect(parsed.features.map((f) => f.id)).toEqual(features.map((f) => f.id));
    expect(parsed.features[0]!.loci).toEqual(features[0]!.loci.repo);
    expect(parsed.artifact).toBe(d.text);
  });

  /**
   * The prompt's ORDER is load-bearing, not cosmetic: prompt caching is a prefix match, so the constant
   * artifact has to precede the per-batch feature list or the prefix is invalidated on every one of the 5-6
   * calls a document costs. These three tests are the contract the caching depends on.
   */
  it("puts the artifact BEFORE the feature list, and is exactly prefix + blank line + question", () => {
    const d = digest();
    const features = askableFeatures(TEST_LEXICON, d);
    const user = renderLabelPrompt(d, features);
    expect(user.indexOf(ARTIFACT_MARKER)).toBeGreaterThan(-1);
    expect(user.indexOf(FEATURES_MARKER)).toBeGreaterThan(-1);
    expect(user.indexOf(ARTIFACT_MARKER)).toBeLessThan(user.indexOf(FEATURES_MARKER));
    expect(user).toBe(`${renderLabelPrefix(d)}\n\n${renderLabelQuestion(features, d.doc_type)}`);
    // the question is the tail, and the prefix carries no per-batch bytes
    expect(user.endsWith(renderLabelQuestion(features, d.doc_type))).toBe(true);
    expect(renderLabelPrefix(d)).not.toContain(FEATURES_MARKER);
    expect(renderLabelQuestion(features, d.doc_type)).not.toContain(ARTIFACT_MARKER);
  });

  it("renders a byte-identical prefix for two different batches of the same document", () => {
    const d = digest({ available_loci: ["payment_code", "db_schema", "auth_code", "file_tree"] });
    const batchA = [featureOf("refunds")];
    const batchB = [featureOf("sso"), featureOf("refunds")];
    expect(renderLabelQuestion(batchB, d.doc_type)).not.toBe(renderLabelQuestion(batchA, d.doc_type));
    // ...and yet the leading bytes of the two prompts are the same. One differing byte here would turn every
    // batch into a cache WRITE (1.25x) and cost more than not caching at all.
    const prefix = renderLabelPrefix(d);
    expect(renderLabelPrompt(d, batchA).slice(0, prefix.length)).toBe(prefix);
    expect(renderLabelPrompt(d, batchB).slice(0, prefix.length)).toBe(prefix);
  });

  it("the mock parses the NEW order back — features, loci and artifact all recovered", () => {
    const d = digest({ text: "===== LOCUS: payment_code =====\nrefund the deposit online\n" });
    const features = [featureOf("refunds"), featureOf("sso")];
    const parsed = parseLabelPrompt(renderLabelPrompt(d, features));
    expect(parsed.docType).toBe("repo");
    expect(parsed.available).toEqual(d.available_loci);
    expect(parsed.artifact).toBe(d.text);
    expect(parsed.features.map((f) => f.id)).toEqual(["refunds", "sso"]);
    expect(parsed.features[1]!.loci).toEqual(featureOf("sso").loci.repo);
    // an artifact that happens to contain the seam bytes must not fool the split (lastIndexOf, not indexOf)
    const adversarial = digest({ text: `a repo whose README says\n\n${FEATURES_MARKER}3): nonsense\n` });
    const p2 = parseLabelPrompt(renderLabelPrompt(adversarial, features));
    expect(p2.artifact).toBe(adversarial.text);
    expect(p2.features.map((f) => f.id)).toEqual(["refunds", "sso"]);
  });

  it("the schema stays in the conservative JSON-schema subset (ADR-011)", () => {
    const js = z.toJSONSchema(LabelBatchSchema) as { properties: Record<string, unknown>; required: string[] };
    expect(new Set(js.required)).toEqual(new Set(Object.keys(js.properties)));
    const item = (js.properties.labels as { items: { required: string[] } }).items;
    expect(new Set(item.required)).toEqual(new Set(["feature_id", "verdict", "evidence", "loci_checked"]));
    expect(JSON.stringify(js)).not.toContain('additionalProperties":{');
  });
});

// ---------- end to end on the mock ----------

describe("labelDocument", () => {
  it("returns one cell per lexicon feature, whatever the model answered", async () => {
    const llm = new MockLLM(labelMockHandlers);
    const row = await labelDocument(llm, digest(), TEST_LEXICON);
    expect(row.cells.map((c) => c.feature_id).sort()).toEqual(TEST_LEXICON.features.map((f) => f.id).sort());
    expect(row.asked).toBe(1);
    expect(row.calls).toBe(1);
    expect(row.errors).toEqual([]);
  });

  it("survives a failed batch: the row is complete, the failure is recorded", async () => {
    const llm = new MockLLM({ evidence_label: () => { throw new Error("boom"); } });
    const row = await labelDocument(llm, digest(), TEST_LEXICON);
    expect(row.errors[0]).toContain("boom");
    expect(row.cells).toHaveLength(TEST_LEXICON.features.length);
    expect(row.cells.every((c) => c.verdict === "unobserved")).toBe(true);
  });

  it("drops labels for features that were not in the batch (no hallucinated columns)", async () => {
    const llm = new MockLLM({
      evidence_label: () => ({ labels: [{ feature_id: "not_a_feature", verdict: "present", evidence: "const stripe = new Stripe(key);", loci_checked: [] }] }),
    });
    const row = await labelDocument(llm, digest(), TEST_LEXICON);
    expect(row.cells.map((c) => c.feature_id)).not.toContain("not_a_feature");
    expect(row.cells.every((c) => c.verdict === "unobserved")).toBe(true);
  });

  it("runs the real 136-column lexicon over the fixture repo without credentials", async () => {
    const lexicon = await loadLexicon();
    const d = condenseRepo("tinyshop", await readRepoDir(FIXTURE_REPO), { archetype: "b2b-invoicing" });
    const row = await labelDocument(new MockLLM(labelMockHandlers), d, lexicon);
    expect(row.cells).toHaveLength(lexicon.features.length);
    const s = summarizeRow(row);
    expect(s.present + s.absent + s.unobserved).toBe(lexicon.features.length);
    expect(s.present).toBeGreaterThan(0);
    // some negatives are refused: the repo has no scheduling/marketplace context for those categories
    expect(s.absent_raw).toBeGreaterThan(s.absent_licensed);
    expect(s.absent_licensing_rate).toBeLessThan(1);
    expect(Object.keys(s.downgrades)).toContain("category_not_discussed");
    expect(Object.keys(s.downgrades)).toContain("undetectable_in_doc_type");
    for (const c of row.cells.filter((c: Cell) => c.verdict === "present")) {
      expect(quoteOccurs(c.evidence, d.text), `${c.feature_id}: ${c.evidence}`).toBe(true);
    }
  });
});

// ---------- the cacheable-prefix plumbing, end to end ----------

/** A stand-in for the SDK client `AnthropicLLM` wraps, capturing the exact params it would POST. */
function fakeAnthropic(capture: Record<string, unknown>[]) {
  return {
    messages: {
      parse: async (params: Record<string, unknown>) => {
        capture.push(params);
        return {
          stop_reason: "end_turn",
          parsed_output: { labels: [] },
          model: "claude-opus-5",
          usage: { input_tokens: 7, output_tokens: 3, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        };
      },
    },
  } as unknown as Anthropic;
}

/** A stand-in for `fetch`, capturing the parsed request body the Foundry client would send. */
function fakeFoundryFetch(capture: Record<string, unknown>[]): typeof fetch {
  return (async (_url: string, init: { body: string }) => {
    capture.push(JSON.parse(init.body) as Record<string, unknown>);
    const body = {
      model: "claude-opus-4-8",
      stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify({ labels: [] }) }],
      usage: { input_tokens: 7, output_tokens: 3 },
    };
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
}

describe("userPrefix: the cache breakpoint reaches both real clients", () => {
  const models = { strong: "claude-opus-4-8", fast: "claude-opus-4-8" };
  const base = { fn: "evidence_label", tier: "strong" as const, system: "S", user: "Q", schema: LabelBatchSchema };

  it("AnthropicLLM sends two text blocks with the breakpoint on the prefix — and a bare string without one", async () => {
    const seen: Record<string, unknown>[] = [];
    const llm = new AnthropicLLM(models, { client: fakeAnthropic(seen) });
    await llm.structured({ ...base, userPrefix: "BIG ARTIFACT" });
    await llm.structured(base);

    const withPrefix = (seen[0]!.messages as { content: unknown }[])[0]!.content;
    expect(withPrefix).toEqual([
      { type: "text", text: "BIG ARTIFACT", cache_control: { type: "ephemeral" } },
      { type: "text", text: "Q" },
    ]);
    // REGRESSION: ~15 other LLM functions pass no prefix and must be byte-identical to before this field
    // existed — a single string, not a one-element block array.
    expect((seen[1]!.messages as { content: unknown }[])[0]!.content).toBe("Q");
  });

  it("AnthropicFoundryLLM applies it in BOTH request shapes (structured outputs and forced tool use)", async () => {
    const structured: Record<string, unknown>[] = [];
    await new AnthropicFoundryLLM({ baseUrl: "https://r.services.ai.azure.com/anthropic", apiKey: "k", models, fetchImpl: fakeFoundryFetch(structured) }).structured({
      ...base,
      userPrefix: "BIG ARTIFACT",
    });
    expect(structured[0]!.output_config).toBeDefined();
    expect((structured[0]!.messages as { content: unknown }[])[0]!.content).toEqual([
      { type: "text", text: "BIG ARTIFACT", cache_control: { type: "ephemeral" } },
      { type: "text", text: "Q" },
    ]);

    // Drive the client onto the fallback shape with the one 400 that downgrades it, then re-assert.
    const toolShape: Record<string, unknown>[] = [];
    const downgradeOnce = (async (_url: string, init: { body: string }) => {
      toolShape.push(JSON.parse(init.body) as Record<string, unknown>);
      if (toolShape.length === 1) {
        return new Response(JSON.stringify({ error: { message: "output_config.format.name: Extra inputs are not permitted" } }), { status: 400 });
      }
      const body = {
        model: "claude-opus-4-8",
        stop_reason: "tool_use",
        content: [{ type: "tool_use", name: "emit_result", input: { labels: [] } }],
        usage: { input_tokens: 7, output_tokens: 3 },
      };
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    const c = new AnthropicFoundryLLM({ baseUrl: "https://r.services.ai.azure.com/anthropic", apiKey: "k", models, fetchImpl: downgradeOnce, sleep: () => Promise.resolve() });
    await c.structured({ ...base, userPrefix: "BIG ARTIFACT" });
    expect(c.outputMode).toBe("tool_use");
    const fallback = toolShape[1]!;
    expect(fallback.tool_choice).toEqual({ type: "tool", name: "emit_result" });
    expect((fallback.messages as { content: unknown }[])[0]!.content).toEqual([
      { type: "text", text: "BIG ARTIFACT", cache_control: { type: "ephemeral" } },
      { type: "text", text: "Q" },
    ]);
  });

  it("CachedLLM treats two requests differing only in userPrefix as distinct entries", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "zadum-llm-cache-"));
    let n = 0;
    const inner = new MockLLM({ evidence_label: () => ({ labels: [{ feature_id: `answer_${++n}`, verdict: "unobserved", evidence: "", loci_checked: [] }] }) });
    const cached = new CachedLLM(inner, dir);
    const req = (userPrefix?: string) => ({ ...base, ...(userPrefix ? { userPrefix } : {}) });

    // Same `user` (the batch's feature list is shared by every document), different artifact. Without
    // userPrefix in the key these two collide and a replay answers document B with document A's labels.
    const a = await cached.structured(req("ARTIFACT A"));
    const b = await cached.structured(req("ARTIFACT B"));
    expect(a.data.labels[0]!.feature_id).toBe("answer_1");
    expect(b.data.labels[0]!.feature_id).toBe("answer_2");
    const again = await cached.structured(req("ARTIFACT A"));
    expect(again.cached).toBe(true);
    expect(again.data.labels[0]!.feature_id).toBe("answer_1");
    // and a prefix-less request is still its own entry, unaffected by either
    expect((await cached.structured(req())).data.labels[0]!.feature_id).toBe("answer_3");
    expect(inner.calls.length).toBe(3);
    expect(inner.calls.map((c) => c.userPrefix)).toEqual(["ARTIFACT A", "ARTIFACT B", undefined]);
  });

  it("labelDocument sends the artifact as the prefix and only the questions as the varying part", async () => {
    const llm = new MockLLM(labelMockHandlers);
    const d = digest();
    await labelDocument(llm, d, TEST_LEXICON);
    expect(llm.calls[0]!.userPrefix).toBe(renderLabelPrefix(d));
    expect(llm.calls[0]!.userPrefix).toContain(ARTIFACT_MARKER);
    expect(llm.calls[0]!.user.startsWith(FEATURES_MARKER)).toBe(true);
    expect(llm.calls[0]!.user).not.toContain(ARTIFACT_MARKER);
  });
});

describe("cache_hit_rate", () => {
  const usage = (over: Partial<LLMUsage> = {}): LLMUsage => ({ input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, ...over });

  it("is null on a zero denominator rather than a fabricated 0", () => {
    expect(cacheHitRate(usage())).toBeNull();
    expect(cacheHitRate(usage({ output_tokens: 500 }))).toBeNull(); // output tokens are not prompt tokens
    expect(cacheHitRate(usage({ input_tokens: 100 }))).toBe(0); // measured, and really zero
  });

  it("is cache_read over TOTAL prompt tokens, not over input_tokens alone", () => {
    // one 20k write then four 20k reads, with 500 uncached question tokens per call
    expect(cacheHitRate(usage({ cache_creation_input_tokens: 20_000, cache_read_input_tokens: 80_000, input_tokens: 2_500 }))).toBeCloseTo(80_000 / 102_500, 10);
    expect(cacheHitRate(usage({ cache_read_input_tokens: 1, input_tokens: 1 }))).toBe(0.5);
  });

  it("rides along on summarizeRow, null on a mock run that reports no tokens", async () => {
    const row = await labelDocument(new MockLLM(labelMockHandlers), digest(), TEST_LEXICON);
    expect(summarizeRow(row).cache_hit_rate).toBeNull();
    expect(summarizeRow({ ...row, usage: usage({ input_tokens: 3, cache_read_input_tokens: 9 }) }).cache_hit_rate).toBe(0.75);
  });
});

describe("label_mock", () => {
  it("quotes verbatim lines, over-claims loci on absent, and stays silent with no loci", () => {
    const parsed = parseLabelPrompt(
      renderLabelPrompt(digest({ text: "we take a deposit online before the booking\nnothing else here" }), [
        { ...featureOf("refunds"), id: "deposit_taken_online", label: "A deposit is taken online up front" },
        featureOf("refunds"),
      ]),
    );
    const labels = mockLabelFeatures(parsed);
    const deposit = labels.find((l) => l.feature_id === "deposit_taken_online")!;
    expect(deposit.verdict).toBe("present");
    expect(deposit.evidence).toBe("we take a deposit online before the booking");
    const refunds = labels.find((l) => l.feature_id === "refunds")!;
    expect(refunds.verdict).toBe("absent");
    expect(refunds.loci_checked).toEqual(featureOf("refunds").loci.repo); // includes loci this digest lacks
  });
});

// ---------- CLI + cost ----------

describe("cost discipline and CLI defaults", () => {
  it("defaults to a small limit and requires --all for the whole corpus", () => {
    const a = parseArgs([]);
    expect(a.limit).toBe(10);
    expect(a.all).toBe(false);
    expect(a.model).toBe("claude-opus-4-8");
    expect(parseArgs(["--all"]).all).toBe(true);
    expect(parseArgs(["--doc-type", "repo"]).docType).toBe("repo");
    expect(() => parseArgs(["--doc-type", "tweets"])).toThrow(/doc-type/);
    expect(() => parseArgs(["--wat"])).toThrow(/unknown argument/);
    expect(() => parseArgs(["--limit"])).toThrow(/needs a value/);
    expect(() => parseArgs(["--limit", "NaN"])).toThrow(/whole number/);
    expect(() => parseArgs(["--all", "--limit", "2"])).toThrow(/either --limit or --all/);
    expect(parseArgs(["--yes-spend"]).yesSpend).toBe(true);
  });

  it("estimates cost from token counts, honouring price overrides", () => {
    const usage = { input_tokens: 1_000_000, output_tokens: 100_000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    // Derived from the table rather than hardcoded: this test is about the ARITHMETIC (1M in at the input
    // rate, 0.1M out at the output rate), and it used to fail whenever a price changed — which is a test
    // breaking for the one reason it should not. The prices themselves are pinned once, in the test below.
    const p = PRICE_PER_MTOK["claude-opus-4-8"]!;
    expect(estimateCost("claude-opus-4-8", usage, {})).toBeCloseTo(p.input + p.output / 10, 5);
    expect(estimateCost("claude-opus-4-8", usage, { ZADUM_PRICE_IN: "1", ZADUM_PRICE_OUT: "0" })).toBeCloseTo(1, 5);
    expect(estimateCost("unknown-model", usage, {})).toBe(0);
  });

  /**
   * The ONE place published prices are asserted. It exists because this table silently carried the
   * pre-Opus-4.6 rate ($15/$75) long after the price dropped to $5/$25, making every mining budget in the
   * repo 3x too pessimistic — a stale price is invisible until someone makes a spending decision on it.
   * When Anthropic changes pricing, this test is the thing that should fail, and it is the only one.
   */
  it("counts cache writes at 1.25x and cache reads at 0.1x — the estimate must never understate", () => {
    const p = PRICE_PER_MTOK["claude-opus-4-8"]!;
    // The measured shape of a cached labelling run: a small full-price input, one write, several reads.
    const usage = { input_tokens: 9_644, output_tokens: 21_665, cache_creation_input_tokens: 12_887, cache_read_input_tokens: 64_435 };
    const expected =
      (9_644 / 1e6) * p.input + (21_665 / 1e6) * p.output + (12_887 / 1e6) * p.input * 1.25 + (64_435 / 1e6) * p.input * 0.1;
    expect(estimateCost("claude-opus-4-8", usage, {})).toBeCloseTo(expected, 9);
    // and it must be strictly MORE than the cache-blind figure it used to report
    const blind = (9_644 / 1e6) * p.input + (21_665 / 1e6) * p.output;
    expect(estimateCost("claude-opus-4-8", usage, {})).toBeGreaterThan(blind);
  });

  it("pins the published per-Mtok prices (update BOTH here and PRICE_PER_MTOK when pricing changes)", () => {
    expect(PRICE_PER_MTOK["claude-opus-4-8"]).toEqual({ input: 5, output: 25 });
    expect(PRICE_PER_MTOK["claude-opus-5"]).toEqual({ input: 5, output: 25 });
    expect(PRICE_PER_MTOK["claude-sonnet-5"]).toEqual({ input: 2, output: 10 });
    expect(PRICE_PER_MTOK["claude-haiku-4-5"]).toEqual({ input: 1, output: 5 });
    // output is priced at 5x input across the current line-up — a sanity check on a typo'd future edit
    for (const [id, price] of Object.entries(PRICE_PER_MTOK)) {
      expect(price.output, `${id} output/input ratio`).toBeCloseTo(price.input * 5, 6);
    }
  });

  it("parses every GitHub source_url shape the corpus manifest actually uses", () => {
    expect(parseGithubRepo("https://github.com/solidinvoice/solidinvoice/tree/3.1.x/docs/docs")).toEqual({ owner: "solidinvoice", name: "solidinvoice" });
    expect(parseGithubRepo("https://github.com/invoiceninja/invoiceninja.github.io (docs/user-guide)")).toEqual({ owner: "invoiceninja", name: "invoiceninja.github.io" });
    expect(parseGithubRepo("https://github.com/odoo/documentation")).toEqual({ owner: "odoo", name: "documentation" });
    expect(parseGithubRepo("https://example.com/docs")).toBeNull();
    expect(parseGithubRepo(undefined)).toBeNull();
  });
});
