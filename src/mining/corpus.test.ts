/**
 * Phase 2 (corpus + repository ingestion) under test — with **no network, no LLM, no git and no clock**.
 *
 * Everything that touches the outside world (`fetchRepoPinned`, the directory walk, the corpus file read, the
 * timestamp) is an injectable option on the ingest functions, which exists precisely so these cases can be
 * written: a repository that cannot be fetched must produce an artifact row carrying `blocked_reason`, not an
 * exception that loses the other forty rows.
 */
import { describe, it, expect } from "vitest";
import {
  CORPUS_ARTIFACT_SCHEMA,
  CorpusArtifactSchema,
  MIRROR_NAME_HEURISTICS,
  UNPINNED_REF,
  artifactId,
  digestHash,
  estimateIngestion,
  ingestCorpus,
  ingestRepo,
  ingestSpecDoc,
  mirrorHeuristic,
  parseArtifactId,
  parseCorpusArgs,
  parseGithubRef,
  renderIngestion,
  repoCacheDir,
  selectCorpus,
  spendGateBlocks,
  stratify,
  toJsonl,
  type CorpusEntry,
  type FetchPinnedResult,
  type RepoFetcher,
} from "./corpus.js";
import type { Digest, RepoFile } from "./condense.js";
import type { Lexicon, LexiconEntry } from "./lexicon.js";
import { UsageError } from "../cli/flags.js";

// ---------- fixtures ----------

const entry = (id: string, archetype: string, over: Partial<CorpusEntry> = {}): CorpusEntry => ({
  id,
  archetype,
  file: `${archetype}/${id}.md`,
  license: "MIT",
  ...over,
});

const gh = (id: string, archetype: string, slug: string, over: Partial<CorpusEntry> = {}): CorpusEntry =>
  entry(id, archetype, { source_url: `https://github.com/${slug}`, ...over });

const digest = (over: Partial<Digest> = {}): Digest => ({
  doc_id: "d1",
  doc_type: "spec_doc",
  archetype: "b2b-invoicing",
  text: "SPEC DOCUMENT: d1\n\n## Payments\nRefunds are issued to the original card.\n",
  available_loci: ["overview", "payments_section", "actors_section"],
  sections: [],
  approx_tokens: 100,
  truncated: false,
  stats: {},
  ...over,
});

const feature = (over: Partial<LexiconEntry> & { id: string }): LexiconEntry => ({
  label: `feature ${over.id}`,
  category: "payments",
  maps_to: null,
  loci: { repo: [], spec_doc: [] },
  detectable_in: [],
  ...over,
});

/** Two categories × one feature each, so a batch size of 1 really produces two calls (batches never split a category). */
const TEST_LEXICON: Lexicon = {
  version: "test-1",
  description: "",
  categories: [
    { id: "payments", label: "Payments", context_loci: { repo: ["payment_code"], spec_doc: ["payments_section"] } },
    { id: "identity_access", label: "Identity", context_loci: { repo: ["auth_code"], spec_doc: ["actors_section"] } },
  ],
  features: [
    feature({ id: "refunds", loci: { repo: ["payment_code"], spec_doc: ["payments_section"] }, detectable_in: ["repo", "spec_doc"] }),
    feature({ id: "sso", category: "identity_access", loci: { repo: ["auth_code"], spec_doc: ["actors_section"] }, detectable_in: ["repo", "spec_doc"] }),
    // never asked in a spec doc: it declares no spec locus at all (rule 0)
    feature({ id: "repo_only", loci: { repo: ["db_schema"], spec_doc: [] }, detectable_in: ["repo"] }),
  ],
};

const okFetcher =
  (commit: string, dir = "/cache/owner__name"): RepoFetcher =>
  async (_owner, _name, _cacheDir, opts) => ({ dir, commit, ref: opts.ref ?? null, cached: true, blocked_reason: null });

const blockedFetcher =
  (reason: string): RepoFetcher =>
  async (_owner, _name, _cacheDir, opts) => ({ dir: null, commit: null, ref: opts.ref ?? null, cached: false, blocked_reason: reason });

const REPO_FILES: RepoFile[] = [
  { path: "README.md", bytes: 40, text: "# Shop\nRefunds are supported.\n" },
  { path: "package.json", bytes: 30, text: '{"dependencies":{"stripe":"^14.0.0"}}' },
  { path: "app/payments/refund.ts", bytes: 60, text: "export function refund(chargeId: string) { return stripe.refunds.create({ charge: chargeId }); }" },
];

const fixedNow = () => "2026-08-25T00:00:00.000Z";

// ---------- A. stable artifact ids ----------

describe("artifact ids", () => {
  it("round-trips a repo id through parseArtifactId", () => {
    const id = artifactId("repo", "spree/spree", "9f1b2c3d4e5f60718293a4b5c6d7e8f901234567");
    expect(id).toBe("repo:spree/spree@9f1b2c3d4e5f60718293a4b5c6d7e8f901234567");
    expect(parseArtifactId(id)).toEqual({
      kind: "repo",
      id: "spree/spree",
      owner: "spree",
      name: "spree",
      ref: "9f1b2c3d4e5f60718293a4b5c6d7e8f901234567",
    });
  });

  it("round-trips a branch ref that contains a slash", () => {
    const id = artifactId("repo", "solidinvoice/solidinvoice", "release/3.1.x");
    expect(parseArtifactId(id)).toMatchObject({ kind: "repo", id: "solidinvoice/solidinvoice", ref: "release/3.1.x" });
  });

  it("round-trips a spec doc id", () => {
    const id = artifactId("spec_doc", "invoicing-b-solid");
    expect(id).toBe("spec_doc:invoicing-b-solid");
    expect(parseArtifactId(id)).toEqual({ kind: "spec_doc", id: "invoicing-b-solid", owner: null, name: null, ref: null });
  });

  it("refuses an unpinned repo id and a malformed owner/name", () => {
    expect(() => artifactId("repo", "spree/spree")).toThrow(/needs a commit or ref/);
    expect(() => artifactId("repo", "spree", "main")).toThrow(/owner\/name/);
    expect(() => artifactId("spec_doc", "")).toThrow();
  });

  it("returns null rather than throwing for anything that is not one of our ids", () => {
    for (const bad of ["", "spree/spree", "repo:spree@", "repo:@abc", "repo:spree/spree", "http://github.com/a/b", "repo:a/b/c@main"]) {
      expect(parseArtifactId(bad)).toBeNull();
    }
  });

  it("parses the branch a manifest source_url pins", () => {
    expect(parseGithubRef("https://github.com/odoo/documentation/tree/19.0/content/applications/finance")).toBe("19.0");
    expect(parseGithubRef("https://github.com/solidinvoice/solidinvoice/tree/3.1.x/docs/docs")).toBe("3.1.x");
    expect(parseGithubRef("https://github.com/knadh/listmonk")).toBeNull();
    expect(parseGithubRef(undefined)).toBeNull();
  });

  it("keys the clone cache by repository AND ref, and reuses the unpinned layout", () => {
    expect(repoCacheDir("spree", "spree", "/c", null)).toBe("/c/spree__spree");
    expect(repoCacheDir("spree", "spree", "/c", UNPINNED_REF)).toBe("/c/spree__spree");
    expect(repoCacheDir("spree", "spree", "/c", "release/3.1.x")).toBe("/c/spree__spree@release_3.1.x");
    expect(repoCacheDir("spree", "spree", "/c", "4.7")).not.toBe(repoCacheDir("spree", "spree", "/c", "4.8"));
  });
});

// ---------- B. digest hash ----------

describe("digestHash", () => {
  it("is deterministic and 64 hex characters", () => {
    const d = digest();
    expect(digestHash(d)).toMatch(/^[0-9a-f]{64}$/);
    expect(digestHash(d)).toBe(digestHash({ ...d }));
  });

  it("changes when the text, the doc id or the doc type changes", () => {
    const d = digest();
    const base = digestHash(d);
    expect(digestHash({ ...d, text: `${d.text} ` })).not.toBe(base);
    expect(digestHash({ ...d, doc_id: "d2" })).not.toBe(base);
    expect(digestHash({ ...d, doc_type: "repo" })).not.toBe(base);
  });

  it("cannot be forged by shifting characters between the fields", () => {
    // a plain concatenation would hash these two rows identically; the NUL separator keeps them apart
    const shifted = { doc_id: "a", doc_type: "b repo", text: "x" } as unknown as Digest;
    expect(digestHash({ doc_id: "a b", doc_type: "repo", text: "x" })).not.toBe(digestHash(shifted));
  });
});

// ---------- C. selection: filters, stratification, duplicates ----------

describe("selectCorpus: archetype stratification", () => {
  const manifest: CorpusEntry[] = [
    ...["a1", "a2", "a3", "a4"].map((id) => gh(id, "booking", `book/${id}`)),
    ...["b1", "b2", "b3", "b4"].map((id) => gh(id, "e-commerce", `shop/${id}`)),
    ...["c1", "c2", "c3", "c4"].map((id) => gh(id, "crud-saas", `saas/${id}`)),
  ];

  it("spreads a limit across archetypes instead of taking one archetype whole", () => {
    const res = selectCorpus(manifest, { limit: 6 });
    expect(res.selected).toHaveLength(6);
    expect(res.byArchetype).toEqual({ booking: 2, "e-commerce": 2, "crud-saas": 2 });
  });

  it("round-robins in a fixed order when the limit does not divide evenly", () => {
    const res = selectCorpus(manifest, { limit: 4 });
    // archetypes are visited in sorted order: booking, crud-saas, e-commerce, then round two
    expect(res.selected.map((e) => e.id)).toEqual(["a1", "c1", "b1", "a2"]);
    expect(res.byArchetype).toEqual({ booking: 2, "e-commerce": 1, "crud-saas": 1 });
  });

  it("is deterministic: manifest order cannot change the sample", () => {
    const shuffled = [...manifest].reverse();
    expect(selectCorpus(shuffled, { limit: 5 }).selected.map((e) => e.id)).toEqual(selectCorpus(manifest, { limit: 5 }).selected.map((e) => e.id));
  });

  it("--all takes everything and reports no sampling drops", () => {
    const res = selectCorpus(manifest, { all: true, limit: 2 });
    expect(res.selected).toHaveLength(12);
    expect(res.dropped).toEqual([]);
  });

  it("accounts for every manifest row exactly once: selected ∪ dropped = manifest", () => {
    const res = selectCorpus(manifest, { limit: 5 });
    const ids = [...res.selected.map((e) => e.id), ...res.dropped.map((d) => d.id)].sort();
    expect(ids).toEqual(manifest.map((e) => e.id).sort());
    expect(res.dropped.every((d) => d.reason.length > 0)).toBe(true);
  });

  it("hands an exhausted archetype's slots to the others", () => {
    const lopsided = [gh("z1", "other", "o/z1"), ...["a1", "a2", "a3"].map((id) => gh(id, "booking", `book/${id}`))];
    const res = selectCorpus(lopsided, { limit: 3 });
    expect(res.byArchetype).toEqual({ booking: 2, other: 1 });
  });

  it("passes the repeat count through untouched", () => {
    expect(selectCorpus(manifest, { limit: 2, runs: 3 }).runs).toBe(3);
    expect(selectCorpus(manifest, { limit: 2 }).runs).toBe(1);
  });

  it("stratify() leaves the unsampled entries behind, sorted", () => {
    const { taken, left } = stratify(manifest, 2);
    expect(taken.map((e) => e.id)).toEqual(["a1", "c1"]);
    expect(left).toHaveLength(10);
    expect(left.map((e) => e.id)).toEqual([...left.map((e) => e.id)].sort());
  });
});

describe("selectCorpus: duplicates, forks and mirrors", () => {
  it("drops a second row pointing at an already-selected repository, with a reason naming the first", () => {
    const manifest = [gh("first", "booking", "acme/app"), gh("second", "booking", "acme/app/tree/main/docs")];
    const res = selectCorpus(manifest, { sourceKind: "repo" });
    expect(res.selected.map((e) => e.id)).toEqual(["first"]);
    expect(res.dropped).toEqual([{ id: "second", reason: 'duplicate repository acme/app (already selected as "first")' }]);
  });

  it("drops tutorial/doc/mirror-looking repository names and says which heuristic fired", () => {
    const manifest = [
      gh("real", "booking", "acme/bookings"),
      gh("tut", "booking", "acme/booking-tutorial"),
      gh("awe", "booking", "sindresorhus/awesome-booking"),
      gh("docs", "booking", "acme/docs"),
      gh("pages", "booking", "invoiceninja/invoiceninja.github.io"),
      gh("mirror", "booking", "acme/gitlab-mirror"),
      gh("boiler", "booking", "acme/saas-boilerplate"),
    ];
    const res = selectCorpus(manifest, { sourceKind: "repo" });
    expect(res.selected.map((e) => e.id)).toEqual(["real"]);
    const reasons = Object.fromEntries(res.dropped.map((d) => [d.id, d.reason]));
    expect(reasons["tut"]).toMatch(/fork\/mirror heuristic on acme\/booking-tutorial: tutorial/);
    expect(reasons["awe"]).toMatch(/awesome-list/);
    expect(reasons["docs"]).toMatch(/documentation repository/);
    expect(reasons["pages"]).toMatch(/GitHub Pages/);
    expect(reasons["mirror"]).toMatch(/mirror of another repository/);
    expect(reasons["boiler"]).toMatch(/boilerplate/);
  });

  it("the heuristic is exported, and leaves ordinary application names alone", () => {
    expect(mirrorHeuristic("spree")).toBeNull();
    expect(mirrorHeuristic("invoiceninja")).toBeNull();
    expect(mirrorHeuristic("documenso")).toBeNull(); // ends in "so", not "docs"
    expect(mirrorHeuristic("easyappointments")).toBeNull();
    expect(mirrorHeuristic("examples")).not.toBeNull();
    expect(MIRROR_NAME_HEURISTICS.length).toBeGreaterThan(3);
  });

  it("keeps documentation repositories in spec_doc mode — that is where the spec documents come from", () => {
    const manifest = [
      gh("odoo-finance", "b2b-invoicing", "odoo/documentation/tree/19.0/content/finance"),
      gh("odoo-sales", "b2b-invoicing", "odoo/documentation/tree/19.0/content/sales"),
    ];
    expect(selectCorpus(manifest, { sourceKind: "spec_doc" }).selected.map((e) => e.id)).toEqual(["odoo-finance", "odoo-sales"]);
    // …and drops both in repo mode: one is a docs mirror, the other is also a duplicate of it
    expect(selectCorpus(manifest, { sourceKind: "repo" }).selected).toEqual([]);
  });

  it("can be turned off explicitly", () => {
    const manifest = [gh("a", "booking", "acme/app"), gh("b", "booking", "acme/app")];
    expect(selectCorpus(manifest, { sourceKind: "repo", dedupeRepos: false }).selected).toHaveLength(2);
  });
});

describe("selectCorpus: filters", () => {
  const manifest = [
    gh("with-repo", "booking", "acme/bookings"),
    entry("no-repo", "booking"),
    gh("shop", "e-commerce", "acme/shop"),
    entry("dashboard", "internal-dashboard"),
  ];

  it("--source-kind repo keeps only rows with a GitHub source_url", () => {
    const res = selectCorpus(manifest, { sourceKind: "repo" });
    expect(res.selected.map((e) => e.id)).toEqual(["with-repo", "shop"]); // booking before e-commerce
    expect(res.dropped.map((d) => d.id).sort()).toEqual(["dashboard", "no-repo"]);
    expect(res.dropped[0]!.reason).toMatch(/no GitHub repository/);
    expect(res.sourceKinds).toEqual(["repo"]);
  });

  it("--source-kind both keeps everything and ingests two kinds", () => {
    expect(selectCorpus(manifest, {}).sourceKinds).toEqual(["spec_doc", "repo"]);
  });

  it("--archetype filters, and combines with the limit", () => {
    const res = selectCorpus(manifest, { archetypes: ["booking", "e-commerce"] });
    expect(res.selected.map((e) => e.id).sort()).toEqual(["no-repo", "shop", "with-repo"]);
    expect(res.dropped).toEqual([{ id: "dashboard", reason: 'archetype "internal-dashboard" not in the --archetype filter' }]);
    expect(selectCorpus(manifest, { archetypes: ["booking"], limit: 1 }).selected).toHaveLength(1);
  });
});

// ---------- D. ingestion, with the world injected ----------

describe("ingestSpecDoc", () => {
  it("condenses, hashes and preserves the licence", async () => {
    const { artifact, digest: d } = await ingestSpecDoc(entry("invoicing-b-solid", "b2b-invoicing", { license: "MIT", retrieved: "2026-08-22" }), "/corpus", {
      now: fixedNow,
      readText: async () => "# Overview\nInvoices.\n\n## Payments\nRefunds are issued within 14 days.\n",
    });
    expect(artifact.blocked_reason).toBeNull();
    expect(artifact.artifact_id).toBe("spec_doc:invoicing-b-solid");
    expect(artifact.source_kind).toBe("spec_doc");
    expect(artifact.license).toBe("MIT");
    expect(artifact.manifest_retrieved).toBe("2026-08-22");
    expect(artifact.retrieved_at).toBe(fixedNow());
    expect(artifact.digest_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(artifact.digest_hash).toBe(digestHash(d!));
    expect(artifact.available_loci).toContain("payments_section");
    expect(CorpusArtifactSchema.parse(artifact).schema).toBe(CORPUS_ARTIFACT_SCHEMA);
  });

  it("records a missing corpus file as a blocked row instead of throwing", async () => {
    const { artifact, digest: d } = await ingestSpecDoc(entry("gone", "booking"), "/corpus", { now: fixedNow, readText: async () => null });
    expect(d).toBeNull();
    expect(artifact.blocked_reason).toMatch(/corpus file missing or unreadable: booking\/gone\.md/);
    expect(artifact.license).toBe("MIT"); // rule 2: licence survives on a blocked row
    expect(CorpusArtifactSchema.safeParse(artifact).success).toBe(true);
  });
});

describe("ingestRepo", () => {
  const row = gh("shop", "e-commerce", "acme/shop/tree/main/docs", { license: "AGPL-3.0" });

  it("pins the artifact id to the resolved commit", async () => {
    const commit = "0123456789abcdef0123456789abcdef01234567";
    const { artifact, digest: d } = await ingestRepo(row, {
      now: fixedNow,
      fetcher: okFetcher(commit, "/cache/acme__shop@main"),
      readDir: async () => REPO_FILES,
    });
    expect(artifact.artifact_id).toBe(`repo:acme/shop@${commit}`);
    expect(artifact.commit).toBe(commit);
    expect(artifact.ref).toBe("main");
    expect(artifact.cache_path).toBe("/cache/acme__shop@main");
    expect(artifact.license).toBe("AGPL-3.0");
    expect(artifact.owner).toBe("acme");
    expect(artifact.repo_name).toBe("shop");
    expect(d!.doc_id).toBe("acme/shop");
    expect(artifact.digest_hash).toBe(digestHash(d!));
    expect(artifact.available_loci).toContain("dependency_manifest");
  });

  it("a blocked fetch produces an artifact row with blocked_reason rather than throwing", async () => {
    const { artifact, digest: d } = await ingestRepo(row, {
      now: fixedNow,
      fetcher: blockedFetcher("git clone failed (128): repository not found"),
      readDir: async () => {
        throw new Error("must not be called");
      },
    });
    expect(d).toBeNull();
    expect(artifact.blocked_reason).toBe("git clone failed (128): repository not found");
    expect(artifact.digest_hash).toBeNull();
    expect(artifact.commit).toBeNull();
    // still a well-formed, parseable id — unpinned, and honest about it
    expect(artifact.artifact_id).toBe("repo:acme/shop@main");
    expect(parseArtifactId(artifact.artifact_id)).toMatchObject({ owner: "acme", name: "shop" });
    expect(artifact.license).toBe("AGPL-3.0");
    expect(CorpusArtifactSchema.safeParse(artifact).success).toBe(true);
  });

  it("survives a fetcher that throws outright", async () => {
    const { artifact } = await ingestRepo(row, {
      now: fixedNow,
      fetcher: async () => {
        throw new Error("ENETDOWN");
      },
    });
    expect(artifact.blocked_reason).toMatch(/fetch threw: ENETDOWN/);
  });

  it("falls back to @HEAD when nothing pins the repository", async () => {
    const unpinned = gh("plain", "booking", "acme/plain");
    const { artifact } = await ingestRepo(unpinned, { now: fixedNow, fetcher: blockedFetcher("offline") });
    expect(artifact.artifact_id).toBe(`repo:acme/plain@${UNPINNED_REF}`);
    expect(artifact.ref).toBe(UNPINNED_REF);
  });

  it("blocks a manifest row that has no repository at all", async () => {
    const { artifact } = await ingestRepo(entry("no-repo", "booking"), { now: fixedNow });
    expect(artifact.blocked_reason).toMatch(/no GitHub repository in source_url/);
    expect(parseArtifactId(artifact.artifact_id)).toMatchObject({ owner: "unknown", name: "no-repo" });
  });

  it("blocks an empty clone rather than emitting an empty digest", async () => {
    const { artifact, digest: d } = await ingestRepo(row, { now: fixedNow, fetcher: okFetcher("abc1234"), readDir: async () => [] });
    expect(d).toBeNull();
    expect(artifact.blocked_reason).toMatch(/no readable files/);
  });
});

describe("ingestCorpus", () => {
  it("ingests both kinds, keeps order, and reports the blocked ones", async () => {
    const entries = [gh("a", "booking", "acme/a"), gh("b", "e-commerce", "acme/b")];
    const result = await ingestCorpus(entries, {
      now: fixedNow,
      concurrency: 2,
      corpusDir: "/corpus",
      readText: async (f) => (f.endsWith("a.md") ? "# Overview\n\n## Payments\nRefunds.\n" : null),
      fetcher: async (owner, name, _c, opts) =>
        name === "a"
          ? ({ dir: "/cache/acme__a", commit: "aaaaaaa", ref: opts.ref ?? null, cached: true, blocked_reason: null } satisfies FetchPinnedResult)
          : ({ dir: null, commit: null, ref: null, cached: false, blocked_reason: "network unreachable" } satisfies FetchPinnedResult),
      readDir: async () => REPO_FILES,
    });
    expect(result.artifacts.map((a) => `${a.source_kind}:${a.manifest_id}`)).toEqual(["spec_doc:a", "repo:a", "spec_doc:b", "repo:b"]);
    expect(result.digests).toHaveLength(2); // spec a + repo a
    expect(result.blocked.map((b) => b.manifest_id)).toEqual(["b", "b"]);
    expect(result.blocked.map((b) => b.reason)).toEqual([expect.stringMatching(/corpus file missing/), "network unreachable"]);
    expect(toJsonl(result.artifacts).trim().split("\n")).toHaveLength(4);
  });

  it("honours an explicit single source kind", async () => {
    const result = await ingestCorpus([gh("a", "booking", "acme/a")], {
      now: fixedNow,
      sourceKinds: ["spec_doc"],
      readText: async () => "# Overview\n",
    });
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0]!.source_kind).toBe("spec_doc");
  });
});

// ---------- E. dry-run estimator ----------

describe("estimateIngestion", () => {
  const spec = digest({ approx_tokens: 100 });

  it("counts asked features, batches, tokens and cost", () => {
    const est = estimateIngestion([spec], { lexicon: TEST_LEXICON, model: "claude-opus-4-8", batchSize: 1, env: {} });
    // refunds (payments_section) + sso (actors_section) are askable; repo_only is rule-0 undetectable here
    expect(est.per_document).toEqual([{ doc_id: "d1", doc_type: "spec_doc", archetype: "b2b-invoicing", tokens: 100, asked: 2, calls: 2, input_tokens: 200 }]);
    expect(est.documents).toBe(1);
    expect(est.feature_questions).toBe(2);
    expect(est.llm_calls).toBe(2);
    expect(est.input_tokens).toBe(200);
    expect(est.output_tokens).toBe(4000); // 2 calls × 2000
    // 200/1e6 × $15 + 4000/1e6 × $75
    expect(est.est_cost_usd).toBeCloseTo(0.303, 6);
  });

  it("batches by category: one call when both features share a category", () => {
    const oneCategory: Lexicon = { ...TEST_LEXICON, features: TEST_LEXICON.features.map((f) => ({ ...f, category: "payments", loci: { ...f.loci, spec_doc: ["payments_section"] } })) };
    const est = estimateIngestion([spec], { lexicon: oneCategory, batchSize: 1, env: {} });
    expect(est.llm_calls).toBe(1);
    expect(est.feature_questions).toBe(2); // repo_only is still rule-0 undetectable in a spec doc
  });

  it("multiplies by the repeat count", () => {
    const one = estimateIngestion([spec], { lexicon: TEST_LEXICON, batchSize: 1, env: {} });
    const three = estimateIngestion([spec], { lexicon: TEST_LEXICON, batchSize: 1, runs: 3, env: {} });
    expect(three.runs).toBe(3);
    expect(three.llm_calls).toBe(one.llm_calls * 3);
    expect(three.input_tokens).toBe(one.input_tokens * 3);
    expect(three.est_cost_usd).toBeCloseTo(one.est_cost_usd * 3, 8);
    // the per-document breakdown stays per-run, so the table is readable
    expect(three.per_document[0]!.calls).toBe(one.per_document[0]!.calls);
  });

  it("is zero-everything for an empty ingestion", () => {
    const est = estimateIngestion([], { lexicon: TEST_LEXICON, env: {} });
    expect([est.documents, est.llm_calls, est.input_tokens, est.est_cost_usd]).toEqual([0, 0, 0, 0]);
  });

  it("a digest whose loci are absent asks nothing (silence is not a question)", () => {
    const silent = digest({ available_loci: ["overview"] });
    expect(estimateIngestion([silent], { lexicon: TEST_LEXICON, env: {} }).feature_questions).toBe(0);
  });
});

// ---------- F. CLI surface ----------

describe("CLI", () => {
  it("refuses a live run without --yes-spend, and only then", () => {
    expect(spendGateBlocks(parseCorpusArgs(["--limit", "2"]))).toBe(true);
    expect(spendGateBlocks(parseCorpusArgs(["--limit", "2", "--yes-spend"]))).toBe(false);
    expect(spendGateBlocks(parseCorpusArgs(["--limit", "2", "--mock"]))).toBe(false);
    expect(spendGateBlocks(parseCorpusArgs(["--limit", "2", "--dry-run"]))).toBe(false);
  });

  it("parses the documented flags", () => {
    const args = parseCorpusArgs(["--limit", "5", "--archetype", "booking, e-commerce", "--source-kind", "repo", "--runs", "2", "--no-fetch", "--out", "tmp"]);
    expect(args).toMatchObject({ limit: 5, archetypes: ["booking", "e-commerce"], sourceKind: "repo", runs: 2, fetch: false, out: "tmp" });
    expect(parseCorpusArgs([]).fetch).toBe(true);
    expect(parseCorpusArgs(["--all"]).limit).toBeNull();
  });

  it("rejects contradictory or malformed flags with a usage error", () => {
    expect(() => parseCorpusArgs(["--all", "--limit", "3"])).toThrow(UsageError);
    expect(() => parseCorpusArgs(["--source-kind", "repos"])).toThrow(/--source-kind must be/);
    expect(() => parseCorpusArgs(["--limit", "0"])).toThrow(/whole number/);
    expect(() => parseCorpusArgs(["--limit", "2.5"])).toThrow(/whole number/);
    expect(() => parseCorpusArgs(["--nope"])).toThrow(UsageError);
  });

  it("renders a table that names the licence, the digest hash and every blocked row", async () => {
    const result = await ingestCorpus([gh("a", "booking", "acme/a")], {
      now: fixedNow,
      readText: async () => "# Overview\n\n## Payments\nRefunds.\n",
      fetcher: blockedFetcher("offline"),
    });
    const text = renderIngestion(result, estimateIngestion(result.digests, { lexicon: TEST_LEXICON, batchSize: 1, env: {} }));
    expect(text).toContain("spec_doc:a");
    expect(text).toContain("repo:acme/a@HEAD");
    expect(text).toContain("MIT");
    expect(text).toContain("BLOCKED offline");
    expect(text).toMatch(/estimated labelling cost: \$\d/);
  });
});
