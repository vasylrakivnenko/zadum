/**
 * Evidence layer, part 5 — **corpus and repository ingestion** (Phase 2 of the evidence-matrix spec).
 *
 * `detectability.ts` grew an ingestion half by accident: a `fetchRepo` that clones whatever the manifest points
 * at, and a loop that condenses it. That was enough to run one experiment and not enough to build a matrix from,
 * because nothing it produced could later answer the two questions every row of the matrix has to answer:
 * *which bytes was this labelled from*, and *may we say so in public*. This module is that half, generalised:
 * one **artifact record** per (document, source kind), carrying its own provenance.
 *
 * What a `CorpusArtifact` (`zadum.corpus-artifact.v1`) pins down:
 *   - a STABLE artifact id — `repo:<owner>/<name>@<commit-or-ref>` / `spec_doc:<manifest id>` — the join key
 *     every later phase uses. Repos carry a commit (or, when nothing better is knowable, the honest `@HEAD`),
 *     because "we labelled owner/name" is not a reproducible claim and "we labelled owner/name@<sha>" is.
 *   - the digest hash: sha256 over the exact digest text the labeller was shown. A row can therefore prove
 *     which bytes produced it, and a re-run that condenses differently is visibly a different row.
 *   - the licence, verbatim from the manifest, on EVERY row including blocked ones (see the rules below).
 *   - `blocked_reason`, nullable. Network failures, missing clones and missing corpus files are recorded, never
 *     thrown: an ingestion run that dies on the 41st repository has told you nothing about the first 40.
 *
 * Selection is pure and deterministic (`selectCorpus`): sort by id, filter, then round-robin **stratify across
 * archetypes**, so `--limit 8` never silently means "the first 8 rows of the manifest", which is 8 invoicing
 * documents. There is no randomness anywhere in this file — not even a seeded rng — because a sample that
 * depends on a seed is a sample somebody has to record the seed for.
 *
 * ── Non-negotiable rules this file honours ────────────────────────────────────────────────────────────────
 *  1. **Never commit raw repository code to this repo.** What leaves ingestion is bounded digests, hashes,
 *     metadata and short evidence quotes — nothing else. Clones live in `.cache/repos` (gitignored: `.cache/`
 *     is in `.gitignore`) and the artifact row stores only the path to them, never their contents.
 *  2. **Licence information is preserved on every row**, including rows that failed to fetch. A row without a
 *     licence is a row nothing downstream may quote from.
 *  3. **Build output, vendored code, binaries, secrets and generated files are excluded.** This is not
 *     reimplemented here: `condense.ts`'s `pruneFiles` / `readRepoDir` own that policy (pruned directories,
 *     lockfiles, binary extensions, per-file byte caps), and this module relies on them. One pruning policy,
 *     one place to fix it.
 *  4. **GitHub is not the target user population.** The corpus is what is public and permissively licensed,
 *     which over-represents developer tools, open-source-friendly domains and English-language projects, and
 *     under-represents the small commercial apps this product is actually for. Every rate computed from these
 *     artifacts is a rate *in this corpus*; the population claim needs a different sample.
 *  5. **Each source is used only for what it can observe.** Repos are the stronger witness for structural
 *     facts (schemas, routes, dependencies), spec documents for workflow and policy facts (approval chains,
 *     retention, who-may-do-what). That restriction is already enforced by the lexicon's `detectable_in` and
 *     witness loci; ingestion only has to record which kind of source a row came from, and does.
 *
 * A live run is gated behind `--yes-spend`, exactly like `npm run label`. Ingestion itself buys no tokens, but
 * it clones dozens of third-party repositories over the network and is the thing that feeds the paid labelling
 * run; the gate is the same gate, and it is cheaper to keep one habit than two.
 *
 * CLI: npm run mine:corpus -- [--limit N | --all] [--archetype a,b] [--source-kind repo|spec_doc|both]
 *                             [--runs N] [--mock] [--dry-run] [--yes-spend] [--out <dir>]
 *                             [--repo-cache <dir>] [--no-fetch]
 */
import "../env.js";
import { z } from "zod";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { helpRequested, parseFlags, UsageError } from "../cli/flags.js";
import { parallelMap } from "../llm/client.js";
import { condenseRepo, condenseSpecDoc, readRepoDir, type Digest, type RepoFile } from "./condense.js";
import {
  CORPUS_DIR,
  DEFAULT_BATCH_SIZE,
  NO_USAGE,
  askableFeatures,
  batchFeatures,
  estimateCost,
  loadManifest,
  parseGithubRepo,
  type ManifestEntry,
} from "./label.js";
import type { DocType, Lexicon } from "./lexicon.js";

// ---------- the record ----------

export const CORPUS_ARTIFACT_SCHEMA = "zadum.corpus-artifact.v1";

/** A source kind is a document type: the two vocabularies are deliberately the same one. */
export const SOURCE_KINDS = ["repo", "spec_doc"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

/**
 * What we write down for every artifact we touched — fetched, condensed, or blocked. Flat and fully populated
 * (nulls rather than absent keys) so a JSONL file of these can be loaded by anything, in any order.
 */
export const CorpusArtifactSchema = z.object({
  schema: z.literal(CORPUS_ARTIFACT_SCHEMA),
  /** `repo:<owner>/<name>@<commit-or-ref>` or `spec_doc:<manifest id>` — the join key for every later phase */
  artifact_id: z.string().min(1),
  source_kind: z.enum(SOURCE_KINDS),
  /** the corpus manifest row this came from */
  manifest_id: z.string().min(1),
  archetype: z.string().min(1),
  /** repository this artifact is (repo) or was copied out of (spec_doc); null when the manifest has none */
  repo_url: z.string().nullable(),
  owner: z.string().nullable(),
  repo_name: z.string().nullable(),
  /** resolved commit sha when a clone was available, else null */
  commit: z.string().nullable(),
  /** branch/tag the manifest pinned (from a /tree/<ref>/ url), or the fallback `HEAD` */
  ref: z.string().nullable(),
  /** verbatim from the manifest — rule 2: never dropped, not even on a blocked row */
  license: z.string().nullable(),
  /** corpus-relative path of the spec document (null for repos) */
  corpus_file: z.string().nullable(),
  /** when the manifest says the text was retrieved */
  manifest_retrieved: z.string().nullable(),
  /** when THIS ingestion ran */
  retrieved_at: z.string().min(1),
  /** where the bytes are on this machine — a clone dir or a corpus file. Never the bytes themselves. */
  cache_path: z.string().nullable(),
  /** sha256 of the digest the labeller would see; null when nothing could be condensed */
  digest_hash: z.string().nullable(),
  digest_tokens: z.number().int().nonnegative().nullable(),
  digest_truncated: z.boolean().nullable(),
  available_loci: z.array(z.string()),
  /** null on success; a human-readable reason on failure. Never an exception. */
  blocked_reason: z.string().nullable(),
});
export type CorpusArtifact = z.infer<typeof CorpusArtifactSchema>;

/** Manifest rows carry a `retrieved` date that `ManifestEntry` does not declare; keep it rather than lose it. */
export type CorpusEntry = ManifestEntry & { retrieved?: string };

/** The ref recorded when nothing better is knowable. Explicitly *not* a reproducible pin — say so, don't hide it. */
export const UNPINNED_REF = "HEAD";

// ---------- stable ids ----------

/**
 * The id convention every later phase joins on:
 *   repo      → `repo:<owner>/<name>@<commit-or-ref>`
 *   spec doc  → `spec_doc:<manifest id>`
 * A repo id without a ref is refused: an unpinned repository row cannot be re-derived later, and a join key
 * that silently means "whatever main was that day" is worse than no key.
 */
export function artifactId(kind: SourceKind, id: string, ref?: string | null): string {
  const clean = id.trim();
  if (!clean) throw new Error("artifactId: empty id");
  if (kind === "spec_doc") {
    if (/\s/.test(clean)) throw new Error(`artifactId: a spec_doc id may not contain whitespace (got "${id}")`);
    return `spec_doc:${clean}`;
  }
  if (!/^[^/\s]+\/[^/\s]+$/.test(clean)) throw new Error(`artifactId: a repo id must be "owner/name" (got "${id}")`);
  const r = (ref ?? "").trim();
  if (!r) throw new Error(`artifactId: repo ${clean} needs a commit or ref (pass ${UNPINNED_REF} if genuinely unknown)`);
  if (/\s/.test(r)) throw new Error(`artifactId: a ref may not contain whitespace (got "${ref}")`);
  return `repo:${clean}@${r}`;
}

export interface ParsedArtifactId {
  kind: SourceKind;
  /** `owner/name` for repos, the manifest id for spec docs */
  id: string;
  owner: string | null;
  name: string | null;
  ref: string | null;
}

/** Inverse of `artifactId`. Null (never a throw) for anything that is not one of our ids. */
export function parseArtifactId(s: string): ParsedArtifactId | null {
  const t = s.trim();
  if (t.startsWith("spec_doc:")) {
    const id = t.slice("spec_doc:".length);
    return id ? { kind: "spec_doc", id, owner: null, name: null, ref: null } : null;
  }
  if (!t.startsWith("repo:")) return null;
  const rest = t.slice("repo:".length);
  // refs may contain "/" (release/1.2) but never "@", so the LAST @ separates id from ref
  const at = rest.lastIndexOf("@");
  if (at <= 0 || at === rest.length - 1) return null;
  const id = rest.slice(0, at);
  const ref = rest.slice(at + 1);
  const slash = id.indexOf("/");
  if (slash <= 0 || slash === id.length - 1 || id.indexOf("/", slash + 1) !== -1) return null;
  return { kind: "repo", id, owner: id.slice(0, slash), name: id.slice(slash + 1), ref };
}

// ---------- digest hash ----------

/** NUL, written without a literal control character in the source: it cannot occur in a doc id or a
 *  doc type, so the concatenation below has exactly one reading. */
const HASH_SEPARATOR = String.fromCharCode(0);

/**
 * The proof-of-bytes: sha256 over `doc_id`, `doc_type` and the digest text, NUL-separated so the concatenation
 * is unambiguous. Pure, and stable across processes and machines — two rows with the same hash were labelled
 * from literally the same prompt body.
 *
 * Field order is part of the v1 contract; changing it invalidates every stored hash, which is the intended
 * cost of changing it.
 */
export function digestHash(digest: Pick<Digest, "doc_id" | "doc_type" | "text">): string {
  return createHash("sha256")
    .update(digest.doc_id, "utf8")
    .update(HASH_SEPARATOR)
    .update(digest.doc_type, "utf8")
    .update(HASH_SEPARATOR)
    .update(digest.text, "utf8")
    .digest("hex");
}

// ---------- git (the only network IO in this file) ----------

export interface GitResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Injectable so every test in this repo can run with no git, no network and no clones. */
export type GitRunner = (args: string[], opts: { cwd?: string; timeoutMs: number }) => Promise<GitResult>;

const OUTPUT_CAP = 8_000;

export const runGit: GitRunner = (args, opts) =>
  new Promise((resolve) => {
    const child = spawn("git", args, { cwd: opts.cwd, timeout: opts.timeoutMs, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => {
      if (stdout.length < OUTPUT_CAP) stdout += String(d);
    });
    child.stderr?.on("data", (d) => {
      if (stderr.length < OUTPUT_CAP) stderr += String(d);
    });
    child.on("error", (e) => resolve({ code: -1, stdout: "", stderr: e.message }));
    child.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });

const lastLine = (s: string) => s.trim().split("\n").pop() ?? "";

/** `git rev-parse HEAD` in a clone. Null on any failure — a missing commit is data, not an error. */
export async function resolveCommit(dir: string, opts: { git?: GitRunner; timeoutMs?: number } = {}): Promise<string | null> {
  const git = opts.git ?? runGit;
  try {
    const res = await git(["rev-parse", "HEAD"], { cwd: dir, timeoutMs: opts.timeoutMs ?? 30_000 });
    const sha = res.stdout.trim();
    return res.code === 0 && /^[0-9a-f]{7,40}$/.test(sha) ? sha : null;
  } catch {
    return null;
  }
}

const isDir = (p: string) =>
  fs
    .stat(p)
    .then((s) => s.isDirectory())
    .catch(() => false);

export const REPO_CACHE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.cache/repos");

/**
 * Cache key = repository **plus** ref, so two pins of the same repository never overwrite each other. The
 * unpinned form keeps `detectability.ts`'s `<owner>__<name>` layout on purpose: the clones already on disk from
 * that experiment are reused rather than re-fetched.
 */
export function repoCacheDir(owner: string, name: string, cacheDir: string, ref?: string | null): string {
  const slug = `${owner}__${name}`;
  const pin = ref && ref !== UNPINNED_REF ? `@${ref.replace(/[^\w.-]+/g, "_")}` : "";
  return path.join(cacheDir, `${slug}${pin}`);
}

export const repoUrl = (owner: string, name: string) => `https://github.com/${owner}/${name}.git`;

export interface FetchPinnedOptions {
  /** false = use only what is already cached (--no-fetch, --dry-run, --mock) */
  fetch?: boolean;
  /** commit sha, branch or tag to pin to */
  ref?: string | null;
  timeoutMs?: number;
  git?: GitRunner;
}

export interface FetchPinnedResult {
  dir: string | null;
  commit: string | null;
  ref: string | null;
  cached: boolean;
  blocked_reason: string | null;
}

/** The seam the tests inject at: everything below `ingest*` takes its fetcher as an option. */
export type RepoFetcher = (owner: string, name: string, cacheDir: string, opts: FetchPinnedOptions) => Promise<FetchPinnedResult>;

/**
 * Shallow (`--depth 1`) clone into the ref-keyed cache, pinned when we know what to pin to:
 *   - a 40-hex ref is a commit → init + `fetch --depth 1 origin <sha>` + checkout FETCH_HEAD;
 *   - any other ref is a branch/tag → `clone --branch <ref>`;
 *   - no ref → default branch, and the resolved sha is read back with `rev-parse` so the row is still pinned
 *     to something specific even though the request was not.
 *
 * Never throws. Network failures, timeouts, missing clones and a missing `git` all come back as
 * `blocked_reason`, because one unreachable repository must not cost the other forty.
 */
export async function fetchRepoPinned(owner: string, name: string, cacheDir: string, opts: FetchPinnedOptions = {}): Promise<FetchPinnedResult> {
  const git = opts.git ?? runGit;
  const timeoutMs = opts.timeoutMs ?? 180_000;
  const ref = opts.ref ?? null;
  const dir = repoCacheDir(owner, name, cacheDir, ref);
  const url = repoUrl(owner, name);
  try {
    if (await isDir(dir)) return { dir, commit: await resolveCommit(dir, { git, timeoutMs: 30_000 }), ref, cached: true, blocked_reason: null };
    if (opts.fetch === false) {
      return { dir: null, commit: null, ref, cached: false, blocked_reason: `no local clone at ${dir} and fetching is disabled` };
    }
    await fs.mkdir(cacheDir, { recursive: true });

    const steps: { args: string[]; cwd?: string }[] = /^[0-9a-f]{40}$/.test(ref ?? "")
      ? [
          { args: ["init", "--quiet", dir] },
          { args: ["remote", "add", "origin", url], cwd: dir },
          { args: ["fetch", "--depth", "1", "--quiet", "origin", ref!], cwd: dir },
          { args: ["checkout", "--quiet", "FETCH_HEAD"], cwd: dir },
        ]
      : [{ args: ["clone", "--depth", "1", "--single-branch", "--quiet", ...(ref ? ["--branch", ref] : []), url, dir] }];

    for (const step of steps) {
      const res = await git(step.args, { cwd: step.cwd, timeoutMs });
      if (res.code !== 0) {
        await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
        return { dir: null, commit: null, ref, cached: false, blocked_reason: `git ${step.args[0]} failed (${res.code}): ${lastLine(res.stderr)}` };
      }
    }
    return { dir, commit: await resolveCommit(dir, { git, timeoutMs: 30_000 }), ref, cached: false, blocked_reason: null };
  } catch (e) {
    return { dir: null, commit: null, ref, cached: false, blocked_reason: `fetch failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/**
 * The branch/tag a manifest `source_url` pins, from a `/tree/<ref>/…` or `/blob/<ref>/…` url. Only the first
 * path segment is taken: `owner/name/tree/19.0/content/applications` is ref `19.0` and a path, and there is no
 * way to tell a slashed branch name from a directory in a url, so we do not pretend to.
 */
export function parseGithubRef(sourceUrl: string | undefined): string | null {
  if (!sourceUrl) return null;
  const m = /github\.com[/:][\w.-]+\/[\w.-]+?(?:\.git)?\/(?:tree|blob)\/([\w.-]+)(?:[/#?)\s]|$)/.exec(sourceUrl.trim());
  return m ? m[1]! : null;
}

// ---------- ingestion ----------

/** Matches `label.ts`'s `--max-digest-tokens` default, so a corpus row is the same size the labeller expects. */
/**
 * Digest cap in REAL tokens. Raised from 20,000 when `CHARS_PER_TOKEN` was corrected from 4 (the prose rule of
 * thumb) to a measured 2.03 for code digests — so the CHARACTER budget is unchanged (20,000 x 4.0 = 80,000
 * chars; 38,000 x 2.1 = 79,800) and only the units are now honest. Changing the nominal number without this
 * would silently have halved every digest.
 */
export const DEFAULT_DIGEST_TOKENS = 38_000;
export const DEFAULT_CONCURRENCY = 3;

export interface IngestOptions {
  corpusDir?: string;
  repoCache?: string;
  maxTokens?: number;
  /** false = cached clones only */
  fetch?: boolean;
  timeoutMs?: number;
  concurrency?: number;
  /** injected in tests (no clock, no network, no filesystem) */
  now?: () => string;
  fetcher?: RepoFetcher;
  readDir?: (dir: string) => Promise<RepoFile[]>;
  readText?: (file: string) => Promise<string | null>;
  log?: (s: string) => void;
}

export interface Ingested {
  artifact: CorpusArtifact;
  /** null exactly when `artifact.blocked_reason` is set */
  digest: Digest | null;
}

function baseArtifact(entry: CorpusEntry, kind: SourceKind, at: string): CorpusArtifact {
  const repo = parseGithubRepo(entry.source_url);
  const ref = parseGithubRef(entry.source_url);
  return {
    schema: CORPUS_ARTIFACT_SCHEMA,
    // a repo row with no parsable repository still needs a well-formed id; `unknown/<manifest id>` parses,
    // sorts, and is obviously not a real repository, and `blocked_reason` says why it is there.
    artifact_id:
      kind === "spec_doc"
        ? artifactId("spec_doc", entry.id)
        : artifactId("repo", repo ? `${repo.owner}/${repo.name}` : `unknown/${entry.id.replace(/[/\s]+/g, "_")}`, ref ?? UNPINNED_REF),
    source_kind: kind,
    manifest_id: entry.id,
    archetype: entry.archetype || "other",
    repo_url: entry.source_url ?? null,
    owner: repo?.owner ?? null,
    repo_name: repo?.name ?? null,
    commit: null,
    ref: kind === "repo" ? (ref ?? UNPINNED_REF) : ref,
    license: entry.license ?? null, // rule 2
    corpus_file: kind === "spec_doc" ? entry.file : null,
    manifest_retrieved: entry.retrieved ?? null,
    retrieved_at: at,
    cache_path: null,
    digest_hash: null,
    digest_tokens: null,
    digest_truncated: null,
    available_loci: [],
    blocked_reason: null,
  };
}

const withDigest = (a: CorpusArtifact, digest: Digest): CorpusArtifact => ({
  ...a,
  digest_hash: digestHash(digest),
  digest_tokens: digest.approx_tokens,
  digest_truncated: digest.truncated,
  available_loci: digest.available_loci,
});

/** One corpus document → one condensed spec-doc artifact. A missing file is a blocked row, not a throw. */
export async function ingestSpecDoc(entry: CorpusEntry, corpusDir: string = CORPUS_DIR, opts: IngestOptions = {}): Promise<Ingested> {
  const now = opts.now ?? (() => new Date().toISOString());
  const readText = opts.readText ?? ((f: string) => fs.readFile(f, "utf8").catch(() => null));
  const base = baseArtifact(entry, "spec_doc", now());
  if (!entry.file) return { artifact: { ...base, blocked_reason: "manifest row has no corpus file" }, digest: null };
  const file = path.join(corpusDir, entry.file);
  const text = await readText(file).catch(() => null);
  if (text === null) return { artifact: { ...base, blocked_reason: `corpus file missing or unreadable: ${entry.file}` }, digest: null };
  const digest = condenseSpecDoc(entry.id, text, { archetype: entry.archetype, maxTokens: opts.maxTokens ?? DEFAULT_DIGEST_TOKENS });
  return { artifact: withDigest({ ...base, cache_path: file }, digest), digest };
}

/**
 * One manifest row → one condensed repository artifact. The fetch is injectable and never throws, so a dead
 * network produces a row with `blocked_reason` and the run continues.
 *
 * Pruning of build output, vendored code, binaries and generated files is `condense.ts`'s job (rule 3) — this
 * function only decides what to clone and what to write down about it.
 */
export async function ingestRepo(entry: CorpusEntry, opts: IngestOptions = {}): Promise<Ingested> {
  const now = opts.now ?? (() => new Date().toISOString());
  const base = baseArtifact(entry, "repo", now());
  const repo = parseGithubRepo(entry.source_url);
  if (!repo) return { artifact: { ...base, blocked_reason: `no GitHub repository in source_url (${entry.source_url ?? "none"})` }, digest: null };

  const fetcher = opts.fetcher ?? fetchRepoPinned;
  const cacheDir = opts.repoCache ?? REPO_CACHE_DIR;
  const requestedRef = parseGithubRef(entry.source_url);
  const got = await fetcher(repo.owner, repo.name, cacheDir, {
    fetch: opts.fetch ?? true,
    ref: requestedRef,
    timeoutMs: opts.timeoutMs,
  }).catch((e: unknown) => ({
    dir: null,
    commit: null,
    ref: requestedRef,
    cached: false,
    blocked_reason: `fetch threw: ${e instanceof Error ? e.message : String(e)}`,
  }));

  // the id pins to the resolved commit when there is one, and says `@HEAD` when there is not
  const pin = got.commit ?? got.ref ?? requestedRef ?? UNPINNED_REF;
  const pinned: CorpusArtifact = {
    ...base,
    artifact_id: artifactId("repo", `${repo.owner}/${repo.name}`, pin),
    commit: got.commit,
    ref: got.ref ?? requestedRef ?? UNPINNED_REF,
    cache_path: got.dir,
  };
  if (!got.dir) return { artifact: { ...pinned, blocked_reason: got.blocked_reason ?? "repository unavailable" }, digest: null };

  const readDirectory = opts.readDir ?? ((d: string) => readRepoDir(d));
  let files: RepoFile[];
  try {
    files = await readDirectory(got.dir);
  } catch (e) {
    return { artifact: { ...pinned, blocked_reason: `could not read clone: ${e instanceof Error ? e.message : String(e)}` }, digest: null };
  }
  if (!files.length) return { artifact: { ...pinned, blocked_reason: `clone at ${got.dir} contained no readable files` }, digest: null };

  const digest = condenseRepo(`${repo.owner}/${repo.name}`, files, { archetype: entry.archetype, maxTokens: opts.maxTokens ?? DEFAULT_DIGEST_TOKENS });
  opts.log?.(`  repo ${repo.owner}/${repo.name}@${pin.slice(0, 12)}: ${files.length} files → ${digest.approx_tokens} tok${got.cached ? " (cached clone)" : ""}`);
  return { artifact: withDigest(pinned, digest), digest };
}

export interface BlockedArtifact {
  artifact_id: string;
  source_kind: SourceKind;
  manifest_id: string;
  reason: string;
}

export interface IngestResult {
  artifacts: CorpusArtifact[];
  /** only the artifacts that produced one; index-aligned with nothing — join on `doc_id`/`artifact_id` */
  digests: Digest[];
  blocked: BlockedArtifact[];
}

/**
 * Ingest a selection, both source kinds if asked, with bounded concurrency (`parallelMap`). Deterministic in
 * output order regardless of which job finishes first.
 */
export async function ingestCorpus(entries: readonly CorpusEntry[], opts: IngestOptions & { sourceKinds?: readonly SourceKind[] } = {}): Promise<IngestResult> {
  const kinds = opts.sourceKinds?.length ? [...opts.sourceKinds] : (["spec_doc", "repo"] as SourceKind[]);
  const corpusDir = opts.corpusDir ?? CORPUS_DIR;
  const jobs: { entry: CorpusEntry; kind: SourceKind }[] = [];
  for (const entry of entries) for (const kind of kinds) jobs.push({ entry, kind });

  const done = await parallelMap(jobs, Math.max(1, opts.concurrency ?? DEFAULT_CONCURRENCY), async (job, i) => {
    opts.log?.(`[${i + 1}/${jobs.length}] ${job.kind} · ${job.entry.id}`);
    return job.kind === "spec_doc" ? ingestSpecDoc(job.entry, corpusDir, opts) : ingestRepo(job.entry, opts);
  });

  const artifacts = done.map((d) => d.artifact);
  return {
    artifacts,
    digests: done.flatMap((d) => (d.digest ? [d.digest] : [])),
    blocked: artifacts
      .filter((a) => a.blocked_reason)
      .map((a) => ({ artifact_id: a.artifact_id, source_kind: a.source_kind, manifest_id: a.manifest_id, reason: a.blocked_reason! })),
  };
}

// ---------- selection (pure) ----------

export type SourceKindFilter = SourceKind | "both";

export interface SelectOptions {
  /** sample size; ignored when `all` is set. Defaults to everything. */
  limit?: number;
  all?: boolean;
  /** keep only these archetypes (empty/absent = all) */
  archetypes?: readonly string[];
  sourceKind?: SourceKindFilter;
  /** repeat count, passed through untouched for the caller to use */
  runs?: number;
  /** drop a second row pointing at an already-selected owner/name. Defaults on when repos are ingested. */
  dedupeRepos?: boolean;
  /** drop tutorial/mirror-looking repository names. Defaults on when repos are ingested. */
  mirrorHeuristic?: boolean;
}

export interface DroppedEntry {
  id: string;
  reason: string;
}

export interface SelectResult {
  selected: CorpusEntry[];
  /** every entry that did not make it, with why. `selected` ∪ `dropped` = the whole manifest. */
  dropped: DroppedEntry[];
  byArchetype: Record<string, number>;
  runs: number;
  sourceKinds: SourceKind[];
}

/**
 * Repository names that are documented as *not* evidence about a running application. The list is a heuristic
 * and is deliberately visible (exported, unit-tested, and every drop is reported with its reason) rather than
 * a silent filter — a false positive here removes a real data point, so it has to be auditable.
 *
 * The seed pattern is `/(awesome|tutorial|example|demo|boilerplate|starter|clone|docs?|-mirror)$/i`; these are
 * the same families, split so each drop names which family caught it.
 */
export const MIRROR_NAME_HEURISTICS: { re: RegExp; reason: string }[] = [
  { re: /(^|[-_.])awesome([-_.]|$)/i, reason: "awesome-list, a link collection rather than an application" },
  { re: /(tutorial|example|demo|sample|boilerplate|starter|template|scaffold|playground|kata|workshop)s?$/i, reason: "tutorial/example/boilerplate repository, not a running application" },
  { re: /(^|[-_.])(clone)([-_.]|$)|clone$/i, reason: "clone of another product" },
  { re: /(docs?|documentation|handbook|wiki|guides?)$/i, reason: "documentation repository — a spec_doc source, not an application repository" },
  { re: /(-mirror|^mirror-)$/i, reason: "mirror of another repository" },
  { re: /\.github\.(io|com)$/i, reason: "GitHub Pages documentation site" },
];

/** The reason this repository name looks like a tutorial/doc/mirror, or null when it looks like an app. */
export function mirrorHeuristic(name: string): string | null {
  for (const h of MIRROR_NAME_HEURISTICS) if (h.re.test(name)) return h.reason;
  return null;
}

// ---------------------------------------------------------------------------
// Is this an APPLICATION, or DOCUMENTATION about one?
// ---------------------------------------------------------------------------

/**
 * The name heuristic above is necessary but nowhere near sufficient, and this is the measurement that shows why.
 *
 * `condense.ts` classifies files into witness loci by PATH. A documentation repository about an e-commerce
 * platform therefore looks exactly like an e-commerce application to it: `shopware/docs` yields all fourteen
 * loci — `db_schema`, `routes`, `payment_code`, `auth_code`, `config_env`, the lot — because it contains
 * `docs/.../payment/*.md`, `docs/.../routes/*.md` and so on. Measured on the real clone cache:
 *
 *     shopware/docs        14 loci · 8 "structural" · indistinguishable from a real app by locus count alone
 *     saleor/saleor-docs   11 loci · 6 structural
 *     mastodon/documentation 10 loci · 5 structural
 *
 * Labelling one of those produces `present` verdicts quoting prose ABOUT how to build a payment plugin, filed
 * as evidence that this product HAS payments implemented that way. It is not a wrong quote — the quote is
 * real — which is what makes it dangerous: nothing downstream can tell that the row describes a manual rather
 * than an application, and no report would flag it.
 *
 * The discriminator that does work is the file mix, and it separates cleanly (measured over 54 clones):
 *
 *     documentation repos   79 % – 100 % prose   (lemmy-docs 100, shopware/docs 98.5, erpnext_documentation 79)
 *     real applications     14 % –  42 % prose   (spree 14.6, superset 23.4, twenty 42.1)
 *
 * Nothing sits between 55 % and 76 %, so the default threshold is 0.65 — comfortably inside the gap rather
 * than tuned to its edge. It is path-only and therefore free, deterministic and unit-testable, like every
 * other decision in the condenser.
 *
 * Honest limit: a genuinely mixed repository (a docs site with a real app inside it, e.g. `sharetribe/flex-docs`
 * at 51 % prose) is NOT flagged. That is the intended failure direction — this gate exists to keep obvious
 * manuals out of the matrix, not to adjudicate hard cases, and a false negative costs one noisy row while a
 * false positive silently discards a real application.
 */
const PROSE_EXT = /\.(md|mdx|markdown|rst|txt|adoc|asciidoc)$/i;
const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|py|rb|php|go|java|kt|cs|ex|exs|rs|swift|scala|vue|svelte|sql|prisma|erb|twig|haml|slim)$/i;

export const DEFAULT_PROSE_THRESHOLD = 0.65;

export interface ProseMix {
  prose_files: number;
  code_files: number;
  /** prose / (prose + code); 1 when a repo has neither, which reads as "nothing to label" */
  prose_share: number;
}

/** Pure over a file listing — no IO, so it is testable on synthetic paths like `pruneFiles`. */
export function proseMix(files: readonly { path: string }[]): ProseMix {
  let prose = 0;
  let code = 0;
  for (const f of files) {
    if (PROSE_EXT.test(f.path)) prose += 1;
    else if (CODE_EXT.test(f.path)) code += 1;
  }
  const total = prose + code;
  return { prose_files: prose, code_files: code, prose_share: total > 0 ? prose / total : 1 };
}

/**
 * "Documentation rather than application", or null when it looks like an app. Returns the REASON string so a
 * skipped repository is reported with its numbers rather than silently dropped — the same discipline
 * `selectCorpus` uses for its drops.
 */
export function documentationHeuristic(files: readonly { path: string }[], threshold = DEFAULT_PROSE_THRESHOLD): string | null {
  const mix = proseMix(files);
  if (mix.prose_files + mix.code_files === 0) return "no prose or code files at all — nothing to label";
  if (mix.prose_share <= threshold) return null;
  return `${(mix.prose_share * 100).toFixed(1)}% of files are prose (${mix.prose_files} prose / ${mix.code_files} code) — documentation about an application, not an application`;
}

/**
 * Round-robin across archetypes, so a limit spreads instead of eating the first archetype whole. Deterministic:
 * archetypes in sorted order, entries within an archetype in sorted id order, no randomness at all. An
 * archetype that runs out is skipped and its slots go to the others.
 */
export function stratify<T extends { id: string; archetype: string }>(entries: readonly T[], limit: number): { taken: T[]; left: T[] } {
  const sorted = [...entries].sort((a, b) => a.id.localeCompare(b.id));
  const groups = new Map<string, T[]>();
  for (const e of sorted) (groups.get(e.archetype) ?? groups.set(e.archetype, []).get(e.archetype)!).push(e);
  const order = [...groups.keys()].sort();
  const cursors = new Map(order.map((a) => [a, 0]));
  const taken: T[] = [];
  const cap = Math.max(0, Math.min(limit, sorted.length));
  let progressed = true;
  while (taken.length < cap && progressed) {
    progressed = false;
    for (const archetype of order) {
      if (taken.length >= cap) break;
      const at = cursors.get(archetype)!;
      const group = groups.get(archetype)!;
      if (at >= group.length) continue;
      taken.push(group[at]!);
      cursors.set(archetype, at + 1);
      progressed = true;
    }
  }
  const chosen = new Set<T>(taken);
  return { taken, left: sorted.filter((e) => !chosen.has(e)) };
}

/**
 * Manifest → the sample to ingest, plus a full account of what was left out and why.
 *
 * Order of judgement, and why:
 *   1. archetype filter        — an explicit request from the operator wins over everything.
 *   2. source-kind filter      — `repo` needs a GitHub url; `spec_doc` needs a corpus file.
 *   3. mirror/tutorial names   — checked BEFORE dedupe so a mirror never occupies a de-dup slot.
 *   4. duplicate owner/name    — the same repository twice is one observation, not two, and forks/mirrors of
 *                                one product would otherwise weight it by how often it was copied.
 *   5. stratified sampling     — round-robin across archetypes up to `limit`.
 *
 * Steps 3 and 4 concern *repository identity*, so they are on only when repositories are being ingested. In
 * `spec_doc` mode they are off deliberately: the corpus's spec documents were copied out of documentation
 * repositories (odoo/documentation, invoiceninja.github.io), and two different subsystem manuals from one docs
 * repo are two genuinely different documents.
 */
export function selectCorpus(manifest: readonly CorpusEntry[], opts: SelectOptions = {}): SelectResult {
  const sourceKind: SourceKindFilter = opts.sourceKind ?? "both";
  const ingestsRepos = sourceKind !== "spec_doc";
  const dedupe = opts.dedupeRepos ?? ingestsRepos;
  const useMirrors = opts.mirrorHeuristic ?? ingestsRepos;
  const archetypes = new Set(opts.archetypes ?? []);
  const dropped: DroppedEntry[] = [];
  const pool: CorpusEntry[] = [];
  const seenRepos = new Map<string, string>();

  for (const entry of [...manifest].sort((a, b) => a.id.localeCompare(b.id))) {
    const drop = (reason: string) => dropped.push({ id: entry.id, reason });
    if (archetypes.size && !archetypes.has(entry.archetype)) {
      drop(`archetype "${entry.archetype}" not in the --archetype filter`);
      continue;
    }
    const repo = parseGithubRepo(entry.source_url);
    if (sourceKind === "repo" && !repo) {
      drop(`no GitHub repository in source_url (${entry.source_url ?? "none"})`);
      continue;
    }
    if (sourceKind === "spec_doc" && !entry.file) {
      drop("no corpus file for a spec document");
      continue;
    }
    if (repo) {
      const mirror = useMirrors ? mirrorHeuristic(repo.name) : null;
      if (mirror) {
        drop(`fork/mirror heuristic on ${repo.owner}/${repo.name}: ${mirror}`);
        continue;
      }
      const key = `${repo.owner}/${repo.name}`.toLowerCase();
      if (dedupe) {
        const already = seenRepos.get(key);
        if (already !== undefined) {
          drop(`duplicate repository ${repo.owner}/${repo.name} (already selected as "${already}")`);
          continue;
        }
        seenRepos.set(key, entry.id);
      }
    }
    pool.push(entry);
  }

  const limit = opts.all ? pool.length : Math.max(0, Math.floor(opts.limit ?? pool.length));
  const { taken, left } = stratify(pool, limit);
  const archetypeCount = new Set(pool.map((e) => e.archetype)).size;
  for (const e of left) dropped.push({ id: e.id, reason: `beyond the sample size (limit ${limit}, stratified across ${archetypeCount} archetype(s))` });

  const byArchetype: Record<string, number> = {};
  for (const e of taken) byArchetype[e.archetype] = (byArchetype[e.archetype] ?? 0) + 1;

  return {
    selected: taken,
    dropped,
    byArchetype,
    runs: Math.max(1, Math.floor(opts.runs ?? 1)),
    sourceKinds: sourceKind === "both" ? ["spec_doc", "repo"] : [sourceKind],
  };
}

// ---------- dry-run cost estimate (pure) ----------

/** What `label.ts`'s dry run assumes one structured answer costs in output tokens. Same number, same place. */
/**
 * Output tokens per labelling call. **Measured, not assumed**: a live 3-repo run on 2026-08-25 produced
 * 90,642 output tokens across 18 calls = ~5,035 per call, against the 2,000 this constant used to hold — so
 * every estimate was ~2x low on the output side (the smoke run estimated $2.32 and cost $4.94).
 *
 * Why it is this large: one call answers up to 45 features, and each answer carries a verdict, a verbatim
 * quote of up to 200 characters, and a `loci_checked` list. Output scales with the number of features asked,
 * not with the artifact — so this is a per-call constant rather than a per-token ratio.
 */
export const OUTPUT_TOKENS_PER_CALL = 5_000;

export interface EstimateOptions {
  lexicon: Lexicon;
  model?: string;
  batchSize?: number;
  /** repeat count from `selectCorpus` — a 2-run experiment costs twice */
  runs?: number;
  outputTokensPerCall?: number;
  env?: NodeJS.ProcessEnv;
}

export interface DocumentEstimate {
  doc_id: string;
  doc_type: DocType;
  archetype: string;
  tokens: number;
  /** feature-questions actually put to the model (rule 0 + locus availability already removed) */
  asked: number;
  calls: number;
  input_tokens: number;
}

export interface IngestionEstimate {
  documents: number;
  runs: number;
  feature_questions: number;
  llm_calls: number;
  input_tokens: number;
  output_tokens: number;
  est_cost_usd: number;
  per_document: DocumentEstimate[];
}

/**
 * What labelling this ingestion would cost, before anything is called. Arithmetic only, no model, no clock:
 *   asked  = features detectable in this document type whose declared loci are actually in the digest
 *   calls  = category-respecting batches of those features
 *   input  = digest tokens × calls (each batch re-sends the artifact)
 *   output = calls × OUTPUT_TOKENS_PER_CALL
 * then × `runs`.
 */
export function estimateIngestion(digests: readonly Digest[], opts: EstimateOptions): IngestionEstimate {
  const batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE;
  const runs = Math.max(1, Math.floor(opts.runs ?? 1));
  const perCall = opts.outputTokensPerCall ?? OUTPUT_TOKENS_PER_CALL;
  const per_document = digests.map((d) => {
    const asked = askableFeatures(opts.lexicon, d);
    const calls = batchFeatures(asked, batchSize).length;
    return {
      doc_id: d.doc_id,
      doc_type: d.doc_type,
      archetype: d.archetype,
      tokens: d.approx_tokens,
      asked: asked.length,
      calls,
      input_tokens: d.approx_tokens * calls,
    };
  });
  const sum = (pick: (d: DocumentEstimate) => number) => per_document.reduce((n, d) => n + pick(d), 0);
  const llm_calls = sum((d) => d.calls) * runs;
  const input_tokens = sum((d) => d.input_tokens) * runs;
  const output_tokens = llm_calls * perCall;
  return {
    documents: per_document.length,
    runs,
    feature_questions: sum((d) => d.asked) * runs,
    llm_calls,
    input_tokens,
    output_tokens,
    est_cost_usd: estimateCost(opts.model ?? "claude-opus-4-8", { ...NO_USAGE, input_tokens, output_tokens }, opts.env ?? process.env),
    per_document,
  };
}

// ---------- rendering + output (pure) ----------

/** One JSONL line per artifact, each validated against the schema first — an unwritable row is a loud failure. */
export function toJsonl(artifacts: readonly CorpusArtifact[]): string {
  return `${artifacts.map((a) => JSON.stringify(CorpusArtifactSchema.parse(a))).join("\n")}\n`;
}

const trunc = (s: string, n: number) => (s.length <= n ? s.padEnd(n) : `${s.slice(0, n - 1)}…`);

/** The per-document table both `--dry-run` and a real run print. */
export function renderIngestion(result: IngestResult, estimate: IngestionEstimate | null): string {
  const byDoc = new Map((estimate?.per_document ?? []).map((d) => [`${d.doc_type}::${d.doc_id}`, d]));
  const out: string[] = [];
  out.push("");
  out.push(`${"artifact".padEnd(46)} ${"kind".padEnd(9)} ${"archetype".padEnd(18)} ${"tok".padStart(7)} ${"asked".padStart(6)} ${"calls".padStart(6)} ${"digest".padEnd(10)} status`);
  for (const a of result.artifacts) {
    const digestKey = `${a.source_kind}::${a.source_kind === "repo" ? `${a.owner}/${a.repo_name}` : a.manifest_id}`;
    const est = byDoc.get(digestKey);
    out.push(
      [
        trunc(a.artifact_id, 46),
        a.source_kind.padEnd(9),
        trunc(a.archetype, 18),
        String(a.digest_tokens ?? 0).padStart(7),
        String(est?.asked ?? 0).padStart(6),
        String(est?.calls ?? 0).padStart(6),
        (a.digest_hash?.slice(0, 10) ?? "—").padEnd(10),
        a.blocked_reason ? `BLOCKED ${a.blocked_reason}` : `ok  ${a.license ?? "licence UNKNOWN"}`,
      ].join(" "),
    );
  }
  if (estimate) {
    out.push("");
    out.push(
      `${estimate.documents} documents · ${estimate.feature_questions} feature-questions · ${estimate.llm_calls} LLM calls · ~${estimate.input_tokens} input tokens (${estimate.runs} run(s))`,
    );
    out.push(`estimated labelling cost: $${estimate.est_cost_usd.toFixed(2)} (list-price estimate; ingestion itself buys no tokens)`);
  }
  if (result.blocked.length) {
    out.push("");
    out.push(`blocked (${result.blocked.length}):`);
    for (const b of result.blocked.slice(0, 20)) out.push(`  ${b.source_kind} ${b.manifest_id}: ${b.reason}`);
    if (result.blocked.length > 20) out.push(`  … and ${result.blocked.length - 20} more`);
  }
  return out.join("\n");
}

// ---------- CLI ----------

export interface CorpusArgs {
  limit: number | null;
  all: boolean;
  archetypes: string[];
  sourceKind: SourceKindFilter;
  runs: number;
  mock: boolean;
  dryRun: boolean;
  yesSpend: boolean;
  out: string;
  corpusDir: string;
  repoCache: string;
  fetch: boolean;
  maxTokens: number;
  batchSize: number;
  concurrency: number;
  model: string;
}

export const CORPUS_USAGE = `mine:corpus — ingest the corpus into pinned, hashed, licence-carrying artifact records

  npm run mine:corpus -- [--limit N | --all] [--archetype a,b] [--source-kind repo|spec_doc|both]
                          [--runs N] [--mock] [--dry-run] [--yes-spend] [--out <dir>]
                          [--corpus <dir>] [--repo-cache <dir>] [--no-fetch]
                          [--max-digest-tokens N] [--batch-size N] [--concurrency N] [--model <id>]

  --limit N      stratified sample: round-robin across archetypes, never the first N manifest rows
  --all          the whole (filtered) manifest
  --dry-run      condense what is already local, print the table and the cost estimate, write nothing
  --mock         no network: cached clones only, no model, no cost
  --yes-spend    required for every non-mock, non-dry run (it clones third-party repositories)
  --no-fetch     use cached clones only, even in a live run`;

const CORPUS_FLAGS = {
  value: ["--limit", "--archetype", "--source-kind", "--runs", "--out", "--corpus", "--repo-cache", "--max-digest-tokens", "--batch-size", "--concurrency", "--model"],
  boolean: ["--all", "--mock", "--dry-run", "--yes-spend", "--no-fetch"],
} as const;

export function parseCorpusArgs(argv: readonly string[]): CorpusArgs {
  const flags = parseFlags(argv, CORPUS_FLAGS);
  if (flags.has("--all") && flags.value("--limit") !== undefined) throw new UsageError("use either --limit or --all, not both");
  const sourceKind = flags.value("--source-kind", "both");
  if (sourceKind !== "repo" && sourceKind !== "spec_doc" && sourceKind !== "both") {
    throw new UsageError(`--source-kind must be repo|spec_doc|both (got "${sourceKind}")`);
  }
  const rawLimit = flags.value("--limit");
  const args: CorpusArgs = {
    limit: rawLimit === undefined ? null : Number(rawLimit),
    all: flags.has("--all"),
    archetypes: flags
      .value("--archetype", "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    sourceKind,
    runs: Number(flags.value("--runs", "1")),
    mock: flags.has("--mock"),
    dryRun: flags.has("--dry-run"),
    yesSpend: flags.has("--yes-spend"),
    out: flags.value("--out", "mining-results"),
    corpusDir: flags.value("--corpus", CORPUS_DIR),
    repoCache: flags.value("--repo-cache", REPO_CACHE_DIR),
    fetch: !flags.has("--no-fetch"),
    maxTokens: Number(flags.value("--max-digest-tokens", String(DEFAULT_DIGEST_TOKENS))),
    batchSize: Number(flags.value("--batch-size", String(DEFAULT_BATCH_SIZE))),
    concurrency: Number(flags.value("--concurrency", String(DEFAULT_CONCURRENCY))),
    model: flags.value("--model", "claude-opus-4-8"),
  };
  for (const [name, value, min] of [
    ["--limit", args.limit ?? 1, 1],
    ["--runs", args.runs, 1],
    ["--max-digest-tokens", args.maxTokens, 1],
    ["--batch-size", args.batchSize, 1],
    ["--concurrency", args.concurrency, 1],
  ] as const) {
    if (!Number.isInteger(value) || value < min) throw new UsageError(`${name} must be a whole number >= ${min}`);
  }
  return args;
}

/**
 * The spend gate, as a predicate so it is testable without spawning a process: a run that is neither mocked
 * nor a dry run must say `--yes-spend` out loud. Same rule, same words, same exit code as `npm run label`.
 */
export function spendGateBlocks(args: Pick<CorpusArgs, "mock" | "dryRun" | "yesSpend">): boolean {
  return !args.mock && !args.dryRun && !args.yesSpend;
}

export const SPEND_GATE_MESSAGE = "live corpus ingestion is blocked without --yes-spend";

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  if (helpRequested(argv)) {
    console.log(CORPUS_USAGE);
    process.exit(0);
  }
  let args: CorpusArgs;
  try {
    args = parseCorpusArgs(argv);
  } catch (e) {
    console.error(`${(e as Error).message}\n\n${CORPUS_USAGE}`);
    process.exit(2);
  }
  if (spendGateBlocks(args)) {
    console.error(`${SPEND_GATE_MESSAGE}\n\n${CORPUS_USAGE}`);
    process.exit(2);
  }

  const manifest = (await loadManifest(args.corpusDir)) as CorpusEntry[];
  const selection = selectCorpus(manifest, {
    ...(args.limit === null ? {} : { limit: args.limit }),
    all: args.all,
    archetypes: args.archetypes,
    sourceKind: args.sourceKind,
    runs: args.runs,
  });

  console.log(`corpus ${args.corpusDir}: ${manifest.length} manifest rows → ${selection.selected.length} selected · source kinds [${selection.sourceKinds.join(",")}] · runs ${selection.runs}`);
  console.log(`stratified by archetype: ${Object.entries(selection.byArchetype).map(([a, n]) => `${a}=${n}`).join(" ") || "(none)"}`);
  const heuristicDrops = selection.dropped.filter((d) => !d.reason.startsWith("beyond the sample size"));
  if (heuristicDrops.length) {
    console.log(`dropped ${heuristicDrops.length} row(s) before sampling:`);
    for (const d of heuristicDrops.slice(0, 15)) console.log(`  ${d.id}: ${d.reason}`);
    if (heuristicDrops.length > 15) console.log(`  … and ${heuristicDrops.length - 15} more`);
  }

  // Neither a dry run nor a mock run may touch the network: both work from what is already in the clone cache.
  const fetchEnabled = args.fetch && !args.dryRun && !args.mock;
  if (!fetchEnabled) console.log(`fetching disabled (${args.dryRun ? "--dry-run" : args.mock ? "--mock" : "--no-fetch"}): cached clones only, from ${args.repoCache}`);

  const result = await ingestCorpus(selection.selected, {
    corpusDir: args.corpusDir,
    repoCache: args.repoCache,
    maxTokens: args.maxTokens,
    fetch: fetchEnabled,
    concurrency: args.concurrency,
    sourceKinds: selection.sourceKinds,
    log: (s) => console.log(s),
  });

  // dynamic: `loadValidatedLexicon` pulls in the catalog loader, which the pure half of this module has no
  // business depending on.
  const { loadValidatedLexicon } = await import("./lexicon.js");
  const { lexicon, catalogVersion } = await loadValidatedLexicon();
  const estimate = estimateIngestion(result.digests, { lexicon, model: args.model, batchSize: args.batchSize, runs: selection.runs });
  console.log(`lexicon ${lexicon.version} (${lexicon.features.length} features) · catalogs ${catalogVersion}`);
  console.log(renderIngestion(result, estimate));

  if (args.dryRun) {
    console.log(`\ndry run: nothing written. Re-run with --yes-spend to ingest for real.`);
    process.exit(0);
  }

  await fs.mkdir(args.out, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(args.out, `${stamp}-corpus-artifacts.jsonl`);
  await fs.writeFile(file, toJsonl(result.artifacts));
  console.log(`\nwritten ${file} (${result.artifacts.length} artifact records, ${result.blocked.length} blocked)`);
  console.log(`clones stay in ${args.repoCache} (gitignored) — only digests, hashes and metadata ever leave ingestion`);
}
