import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
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
  LabelBatchSchema,
  applyEvidenceRules,
  askableFeatures,
  batchFeatures,
  categoryDiscussed,
  estimateCost,
  labelDocument,
  parseArgs,
  parseGithubRepo,
  quoteOccurs,
  renderLabelPrompt,
  summarizeRow,
  type Cell,
  type LabelBatch,
} from "./label.js";
import { labelMockHandlers, mockLabelFeatures, parseLabelPrompt } from "./label_mock.js";
import { MockLLM } from "../llm/client.js";
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
    expect(s.features).toBeGreaterThanOrEqual(120);
    expect(s.features).toBeLessThanOrEqual(150);
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
    expect(estimateCost("claude-opus-4-8", usage, {})).toBeCloseTo(15 + 7.5, 5);
    expect(estimateCost("claude-opus-4-8", usage, { ZADUM_PRICE_IN: "1", ZADUM_PRICE_OUT: "0" })).toBeCloseTo(1, 5);
    expect(estimateCost("unknown-model", usage, {})).toBe(0);
  });

  it("parses every GitHub source_url shape the corpus manifest actually uses", () => {
    expect(parseGithubRepo("https://github.com/solidinvoice/solidinvoice/tree/3.1.x/docs/docs")).toEqual({ owner: "solidinvoice", name: "solidinvoice" });
    expect(parseGithubRepo("https://github.com/invoiceninja/invoiceninja.github.io (docs/user-guide)")).toEqual({ owner: "invoiceninja", name: "invoiceninja.github.io" });
    expect(parseGithubRepo("https://github.com/odoo/documentation")).toEqual({ owner: "odoo", name: "documentation" });
    expect(parseGithubRepo("https://example.com/docs")).toBeNull();
    expect(parseGithubRepo(undefined)).toBeNull();
  });
});
