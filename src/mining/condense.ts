/**
 * Evidence layer, part 2 — the **condenser**: an artifact (a repo directory, or a spec document) becomes a
 * bounded, labelable *digest* plus the set of **loci it actually contains**.
 *
 * The second half is the point. `absent` is only allowed to mean something when a declared witness locus was
 * present in what the labeller saw and turned out to be empty (lexicon.ts, rule 1). That is enforceable only
 * if the digest can say, mechanically, which loci it contains — so every section of the digest is tagged with
 * a locus id from the closed vocabulary, and `available_loci` is exactly the set of non-empty sections. A
 * feature whose declared loci are all missing from `available_loci` is never asked about: silence there is
 * the artifact's silence, not the app's.
 *
 * Both condensers are **pure functions** over already-read input (a file listing; a string), so the whole
 * pipeline is unit-testable without a network or a clone. `readRepoDir` is the only IO, and it does nothing
 * but read bytes.
 *
 * Determinism: everything is sorted by path, sections come in a fixed order, and every cap is a count of
 * characters or lines — no clocks, no randomness, no map-iteration order.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { REPO_LOCI, SPEC_LOCI, type DocType, type RepoLocus, type SpecLocus } from "./lexicon.js";

// ---------- shared shape ----------

export interface DigestSection {
  locus: string;
  /** files (repo) or headings (spec doc) that fed this section */
  sources: string[];
  chars: number;
}

export interface Digest {
  doc_id: string;
  doc_type: DocType;
  archetype: string;
  text: string;
  /** loci physically present in `text` — the only loci an `absent` verdict may cite */
  available_loci: string[];
  sections: DigestSection[];
  approx_tokens: number;
  truncated: boolean;
  /** repo digests only: what the pruner threw away, for reporting */
  stats: Record<string, number>;
}

/** Rough token estimate. Good enough for budgeting; the cost report uses the API's real counts. */
export const CHARS_PER_TOKEN = 4;
export const DEFAULT_MAX_TOKENS = 50_000;
export const approxTokens = (chars: number) => Math.ceil(chars / CHARS_PER_TOKEN);

// ---------- repo: file listing ----------

export interface RepoFile {
  /** repo-relative, POSIX separators */
  path: string;
  bytes: number;
  /** null = binary or over the read cap (kept in the tree, never quoted) */
  text: string | null;
}

/** Directories that are never a source of evidence about the app's behaviour. */
const PRUNED_DIRS = [
  "node_modules", ".git", ".hg", ".svn", "vendor", "dist", "build", "out", "target", ".next", ".nuxt", ".output",
  "coverage", "__pycache__", ".venv", "venv", "env", ".tox", ".mypy_cache", ".pytest_cache", ".gradle", ".idea",
  ".vscode", "bower_components", "jspm_packages", "site-packages", ".terraform", "Pods", "DerivedData", ".cache",
  "storybook-static", "public/build", ".husky", ".yarn",
];

/** Files that are bytes, not statements: lockfiles, minified bundles, media, archives, fonts. */
const PRUNED_FILE = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|composer\.lock|Gemfile\.lock|poetry\.lock|Cargo\.lock|go\.sum|\.DS_Store)$/;
const PRUNED_EXT = /\.(png|jpe?g|gif|svg|ico|webp|avif|bmp|tiff?|mp[34]|wav|ogg|webm|mov|avi|pdf|zip|t?gz|bz2|xz|7z|rar|jar|war|so|dylib|dll|exe|bin|dat|db|sqlite3?|wasm|woff2?|ttf|eot|otf|pyc|class|map|min\.js|min\.css|snap)$/i;
export const MAX_FILE_BYTES = 400_000;

export interface PruneResult {
  kept: RepoFile[];
  dropped: { path: string; reason: string }[];
}

/** Deterministic, path-only pruning (pure — no filesystem access), so it can be unit-tested on synthetic paths. */
export function pruneFiles(files: RepoFile[]): PruneResult {
  const kept: RepoFile[] = [];
  const dropped: { path: string; reason: string }[] = [];
  for (const f of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    const segments = f.path.split("/");
    const dir = segments.slice(0, -1).find((s) => PRUNED_DIRS.includes(s));
    if (dir) dropped.push({ path: f.path, reason: `pruned dir ${dir}` });
    else if (PRUNED_FILE.test(f.path)) dropped.push({ path: f.path, reason: "lockfile/noise" });
    else if (PRUNED_EXT.test(f.path)) dropped.push({ path: f.path, reason: "binary/asset" });
    else if (f.bytes > MAX_FILE_BYTES) dropped.push({ path: f.path, reason: `over ${MAX_FILE_BYTES}B` });
    else kept.push(f);
  }
  return { kept, dropped };
}

// ---------- repo: locus classification ----------

/**
 * Which witness locus a file belongs to. First match wins, so the table is ordered from most specific to
 * least. A file matching nothing still appears in `file_tree` — the tree is a locus in its own right, because
 * a directory called `refunds/` is real evidence even when no file in it is quoted.
 */
const REPO_CLASSIFIERS: { locus: RepoLocus; test: RegExp }[] = [
  { locus: "readme", test: /(^|\/)(readme|README)(\.(md|rst|txt|markdown))?$/ },
  { locus: "dependency_manifest", test: /(^|\/)(package\.json|composer\.json|requirements(-\w+)?\.txt|pyproject\.toml|Pipfile|Gemfile|go\.mod|Cargo\.toml|pubspec\.yaml|build\.gradle(\.kts)?|pom\.xml|\w+\.csproj|mix\.exs)$/ },
  { locus: "config_env", test: /(^|\/)(\.env[\w.-]*|env\.example|\.env\.sample|settings\.(py|ini)|config\/(settings|database|services|packages)[\w.-]*\.(php|yml|yaml|json|py|ts|js)|application(-\w+)?\.(yml|yaml|properties))$/ },
  { locus: "db_schema", test: /(^|\/)(migrations?|migrate|schema|db|database|prisma|models?|entities|entity|sql)(\/|$)|(^|\/)(schema\.(sql|prisma|rb|ts)|structure\.sql|\d{3,}[-_].+\.(sql|php|py|js|ts)|.*\.migration\.(ts|js)|models?\.(py|rb|ts|js|go)|.*[Ss]chema\.(ts|js|py|rb|go|sql))$/ },
  // structural loci win over topical ones: `routes/invoices.ts` is a route file that happens to be about
  // invoices, and quoting it as a route signature is more informative than quoting it as payment code.
  { locus: "routes", test: /(^|\/)(routes?|controllers?|handlers?|endpoints?|api|views?|resources?|pages)(\/|$)|(^|\/)(routes?|urls|web|api)\.(php|py|rb|ts|js|go)$/ },
  { locus: "payment_code", test: /(^|\/)[\w.-]*(payment|billing|checkout|invoice|stripe|paypal|braintree|adyen|subscription|payout|refund|charge|wallet|price|pricing|tax|cart|order)[\w.-]*(\/|$)/i },
  { locus: "auth_code", test: /(^|\/)[\w.-]*(auth|login|signin|session|password|permission|policy|policies|ability|abilities|guard|role|acl|oauth|saml|sso|tenant|tenancy|middleware)[\w.-]*(\/|$)/i },
  { locus: "integration_code", test: /(^|\/)[\w.-]*(integration|webhook|connector|adapter|client|api[-_]?client|sync|import|export|third[-_]?party|external|provider|sdk)[\w.-]*(\/|$)/i },
  { locus: "background_jobs", test: /(^|\/)[\w.-]*(job|jobs|worker|workers|queue|task|tasks|cron|schedul|celery|sidekiq|command|commands|console)[\w.-]*(\/|$)/i },
  { locus: "email_templates", test: /(^|\/)[\w.-]*(mail|mailer|email|notification|notify|template|templates|reminder)[\w.-]*(\/|$)/i },
  { locus: "admin_ui", test: /(^|\/)[\w.-]*(admin|dashboard|backoffice|back[-_]office|report|reports|analytics|settings)[\w.-]*(\/|$)/i },
  { locus: "tests", test: /(^|\/)(tests?|spec|specs|__tests__|cypress|e2e|features)(\/|$)|\.(test|spec)\.(ts|tsx|js|jsx|py|rb|go)$/ },
  { locus: "framework_config", test: /(^|\/)([\w.-]*\.config\.(js|ts|mjs|cjs|json|yaml|yml)|tsconfig\.json|next\.config\.\w+|vite\.config\.\w+|nuxt\.config\.\w+|angular\.json|webpack\.config\.\w+|docker-compose\.ya?ml|Dockerfile|Makefile|\.eslintrc[\w.]*|babel\.config\.\w+|tailwind\.config\.\w+|manifest\.json|app\.json)$/ },
];

export function classifyRepoFile(p: string): RepoLocus | null {
  for (const c of REPO_CLASSIFIERS) if (c.test.test(p)) return c.locus;
  return null;
}

// ---------- repo: what to quote from each locus ----------

/** Lines that carry the shape of an HTTP surface across the frameworks the corpus actually uses. */
const ROUTE_LINE =
  /(\b(app|router|route|api|server|blueprint|bp)\s*\.\s*(get|post|put|patch|delete|all|use|route|resource)\s*\(|@(app|router|blueprint|bp)\.route|@(Get|Post|Put|Patch|Delete|Controller|RequestMapping|GetMapping|PostMapping)\b|\bRoute::(get|post|put|patch|delete|resource|apiResource|group)\b|\bpath\s*\(|\bre_path\s*\(|\bresources?\s+:|^\s*(get|post|put|patch|delete)\s+["'/]|\bexport\s+(default\s+)?(async\s+)?function\s+\w+|\b(class|def|func|function)\s+\w+|\bpublic\s+function\s+\w+)/;

/** Lines worth quoting from auth/payment/integration code: the ones that name a behaviour, not plumbing. */
const CUE_LINE = new RegExp(
  [
    "\\b(stripe|paypal|braintree|adyen|square|mollie|razorpay|klarna|afterpay|checkout|webhook|refund|payout|invoice|subscription|coupon|discount|tax|vat|currenc|escrow|commission|fee|deposit|prepay|instal)",
    "\\b(role|permission|ability|policy|scope|tenant|organi[sz]ation|workspace|owner|admin|guest|sso|saml|oauth|oidc|magic.?link|two.?factor|totp|mfa|impersonat|invite)",
    "\\b(reminder|notification|mail|sms|twilio|sendgrid|mailgun|postmark|nexmo|push)",
    "\\b(calendar|ical|caldav|google.?calendar|availability|slot|waitlist|no.?show|cancel|reschedul)",
    "\\b(audit|retention|soft.?delete|deleted_at|gdpr|erasure|anonymi[sz]|encrypt)",
  ].join("|"),
  "i",
);

interface LocusPolicy {
  /** max files quoted from this locus */
  maxFiles: number;
  /** max characters kept per file */
  maxCharsPerFile: number;
  /** whole file, or only lines matching a pattern */
  filter: "whole" | "routes" | "cues";
}

/** Section order is the emission order, and also the priority order when the global budget runs out. */
export const REPO_SECTION_ORDER: RepoLocus[] = [
  "readme",
  "dependency_manifest",
  "db_schema",
  "routes",
  "payment_code",
  "auth_code",
  "integration_code",
  "background_jobs",
  "email_templates",
  "framework_config",
  "config_env",
  "admin_ui",
  "tests",
  "file_tree",
];

const POLICY: Record<RepoLocus, LocusPolicy> = {
  readme: { maxFiles: 2, maxCharsPerFile: 12_000, filter: "whole" },
  dependency_manifest: { maxFiles: 6, maxCharsPerFile: 6_000, filter: "whole" },
  db_schema: { maxFiles: 40, maxCharsPerFile: 4_000, filter: "whole" },
  routes: { maxFiles: 60, maxCharsPerFile: 1_500, filter: "routes" },
  payment_code: { maxFiles: 30, maxCharsPerFile: 1_500, filter: "cues" },
  auth_code: { maxFiles: 30, maxCharsPerFile: 1_500, filter: "cues" },
  integration_code: { maxFiles: 20, maxCharsPerFile: 1_200, filter: "cues" },
  background_jobs: { maxFiles: 20, maxCharsPerFile: 1_200, filter: "cues" },
  email_templates: { maxFiles: 20, maxCharsPerFile: 800, filter: "cues" },
  framework_config: { maxFiles: 8, maxCharsPerFile: 1_500, filter: "whole" },
  config_env: { maxFiles: 6, maxCharsPerFile: 2_500, filter: "whole" },
  admin_ui: { maxFiles: 20, maxCharsPerFile: 800, filter: "routes" },
  tests: { maxFiles: 30, maxCharsPerFile: 400, filter: "routes" },
  file_tree: { maxFiles: 0, maxCharsPerFile: 0, filter: "whole" },
};

function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n… [${s.length - max} more characters]`;
}

/** Keep only lines matching `re`, deduplicated and capped — a signature sketch, not the file. */
function grepLines(text: string, re: RegExp, maxChars: number): string {
  const out: string[] = [];
  let used = 0;
  const seen = new Set<string>();
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line.length < 4 || line.length > 300 || !re.test(line) || seen.has(line)) continue;
    seen.add(line);
    if (used + line.length + 1 > maxChars) break;
    out.push(line);
    used += line.length + 1;
  }
  return out.join("\n");
}

export const MAX_TREE_ENTRIES = 600;

/** A pruned file tree: directories with a file count, plus the leading files of each. Deterministic by path. */
export function renderTree(files: RepoFile[], maxEntries: number = MAX_TREE_ENTRIES): string {
  const byDir = new Map<string, string[]>();
  for (const f of files) {
    const dir = f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/")) : ".";
    (byDir.get(dir) ?? byDir.set(dir, []).get(dir)!).push(f.path.slice(dir === "." ? 0 : dir.length + 1));
  }
  const lines: string[] = [];
  let entries = 0;
  for (const dir of [...byDir.keys()].sort()) {
    const names = byDir.get(dir)!.sort();
    if (entries >= maxEntries) {
      lines.push(`… [${byDir.size - lines.length} more directories]`);
      break;
    }
    const show = names.slice(0, 12);
    entries += show.length + 1;
    lines.push(`${dir}/ (${names.length}): ${show.join(" ")}${names.length > show.length ? ` … +${names.length - show.length}` : ""}`);
  }
  return lines.join("\n");
}

export interface CondenseOptions {
  archetype?: string;
  maxTokens?: number;
  maxTreeEntries?: number;
}

/**
 * How the character budget is split between loci. Weights, not fixed sizes: a locus that needs less than its
 * share leaves the remainder to the ones that follow (they are visited in `REPO_SECTION_ORDER`).
 *
 * Why weights at all: with a single global budget spent first-come, one enormous locus eats everything. A
 * real case from the live run — Spree's `db_schema` is ~160k characters of Ruby models, so at a 40k budget an
 * all-or-nothing section rule dropped the schema *entirely*, and the repo arm then looked blind for reasons
 * that had nothing to do with repos. Weighting caps each locus and drops files from the tail of the oversized
 * one instead, with a note saying how many were omitted.
 */
const LOCUS_WEIGHT: Record<RepoLocus, number> = {
  readme: 2,
  dependency_manifest: 1.5,
  db_schema: 4,
  routes: 4,
  payment_code: 2.5,
  auth_code: 2.5,
  integration_code: 1.5,
  background_jobs: 1.5,
  email_templates: 1,
  framework_config: 1,
  config_env: 1,
  admin_ui: 1,
  tests: 0.75,
  file_tree: 1.5,
};

/**
 * Repo → digest. Pure over the file listing.
 *
 * Each locus gets `weight/Σweights` of the remaining budget (and never less than what is left over from the
 * loci before it). Within a locus, whole files are dropped from the tail — never half a file — so every quote
 * the labeller can make is a complete, faithful excerpt.
 */
export function condenseRepo(docId: string, files: RepoFile[], opts: CondenseOptions = {}): Digest {
  const maxChars = (opts.maxTokens ?? DEFAULT_MAX_TOKENS) * CHARS_PER_TOKEN;
  const { kept, dropped } = pruneFiles(files);

  const byLocus = new Map<RepoLocus, RepoFile[]>();
  for (const f of kept) {
    const locus = classifyRepoFile(f.path);
    if (!locus) continue;
    (byLocus.get(locus) ?? byLocus.set(locus, []).get(locus)!).push(f);
  }

  const sections: DigestSection[] = [];
  const parts: string[] = [];
  let used = 0;
  let truncated = false;
  // weights of the loci not yet visited, so an underspending locus hands its slack to the ones after it
  let remainingWeight = REPO_SECTION_ORDER.reduce((n, l) => n + LOCUS_WEIGHT[l], 0);

  const push = (locus: RepoLocus, sources: string[], body: string): boolean => {
    if (!body.trim()) return false;
    const block = `\n===== LOCUS: ${locus} =====\n${body.trim()}\n`;
    if (used + block.length > maxChars) {
      truncated = true;
      return false;
    }
    parts.push(block);
    used += block.length;
    sections.push({ locus, sources, chars: block.length });
    return true;
  };

  for (const locus of REPO_SECTION_ORDER) {
    const share = Math.max(0, Math.floor(((maxChars - used) * LOCUS_WEIGHT[locus]) / remainingWeight));
    remainingWeight -= LOCUS_WEIGHT[locus];
    if (locus === "file_tree") {
      push("file_tree", [], clip(renderTree(kept, opts.maxTreeEntries), share));
      continue;
    }
    const policy = POLICY[locus];
    const candidates = (byLocus.get(locus) ?? []).filter((f) => f.text !== null).slice(0, policy.maxFiles);
    const chunks: string[] = [];
    const sources: string[] = [];
    let spent = 0;
    let omitted = 0;
    for (const f of candidates) {
      const raw = f.text!;
      const body =
        policy.filter === "whole" ? clip(raw, policy.maxCharsPerFile) : grepLines(raw, policy.filter === "routes" ? ROUTE_LINE : CUE_LINE, policy.maxCharsPerFile);
      if (!body.trim()) continue;
      const chunk = `--- ${f.path} ---\n${body}`;
      if (spent + chunk.length > share && chunks.length) {
        omitted += 1;
        continue;
      }
      chunks.push(chunk);
      sources.push(f.path);
      spent += chunk.length + 1;
    }
    if (omitted) {
      truncated = true;
      chunks.push(`… [${omitted} further ${locus} file(s) omitted for length]`);
    }
    // A locus whose files exist but yielded no quotable line is still an INSPECTED, EMPTY locus — exactly the
    // situation that licenses `absent`. Emitting the paths keeps that fact in the digest; dropping the section
    // would silently turn "we looked and found nothing" back into "we never looked".
    if (!sources.length && candidates.length) {
      const paths = candidates.map((f) => f.path);
      push(locus, paths, clip(`(these files were inspected; no line matched the signature patterns for this locus)\n${paths.map((p) => `- ${p}`).join("\n")}`, share));
      continue;
    }
    push(locus, sources, chunks.join("\n"));
  }

  const header = `REPOSITORY: ${docId}\nfiles kept: ${kept.length} (of ${files.length}; ${dropped.length} pruned)\n`;
  const text = header + parts.join("");
  return {
    doc_id: docId,
    doc_type: "repo",
    archetype: opts.archetype ?? "other",
    text,
    available_loci: sections.map((s) => s.locus).sort(),
    sections,
    approx_tokens: approxTokens(text.length),
    truncated,
    stats: { files_total: files.length, files_kept: kept.length, files_pruned: dropped.length, sections: sections.length },
  };
}

// ---------- spec documents ----------

/**
 * Heading cues per spec locus. A spec document's "sections" are its headings, so locus availability is a
 * heading match — the same mechanical test the repo side gets from file paths. `overview` is unconditional:
 * every document has a beginning, and that beginning is always inspected.
 */
export const SPEC_HEADING_CUES: { locus: SpecLocus; test: RegExp }[] = [
  { locus: "actors_section", test: /\b(users?|roles?|actors?|people|staff|teams?|members?|customers?|clients?|accounts?|sellers?|vendors?|providers?|admins?|personas?|audience)\b/ },
  { locus: "permissions_section", test: /\b(permission|access|rights|privileg|authori[sz]|who can|visibility|sharing|ownership)\b/ },
  { locus: "data_model_section", test: /\b(data model|schema|entit|objects?|records?|fields?|database|glossary|nouns?|attributes?|structure|taxonomy)\b/ },
  { locus: "workflow_section", test: /\b(workflow|process|lifecycle|status|states?|flows?|journey|steps?|approval|stages?|pipeline|how it works|scenarios?|use cases?)\b/ },
  { locus: "payments_section", test: /\b(payments?|billing|invoic|checkout|refunds?|payouts?|credit notes?|money|charges?|transactions?|paying|balance|wallet)\b/ },
  { locus: "pricing_section", test: /\b(pricing|prices?|rates?|fees?|plans?|subscription|discounts?|coupons?|tax|vat|currenc|commission)\b/ },
  { locus: "scheduling_section", test: /\b(booking|appointment|schedul|calendar|availabilit|slots?|reservations?|shifts?|timetable|no.?show|cancellation)\b/ },
  { locus: "catalog_section", test: /\b(products?|catalog|catalogue|listings?|services?|items?|inventory|stock|menu|variants?|categor|offerings?)\b/ },
  { locus: "orders_section", test: /\b(orders?|carts?|fulfil|fulfill|shipping|delivery|returns?|shipments?|dispatch|purchas)\b/ },
  { locus: "notifications_section", test: /\b(notification|emails?|sms|remind|messag|alerts?|inbox|chat|communication|templates?)\b/ },
  { locus: "integrations_section", test: /\b(integrat|api|webhooks?|sync|import|export|third.?party|connect|plugins?|apps?|extensions?)\b/ },
  { locus: "reporting_section", test: /\b(report|dashboard|analytic|metrics?|statistics|insights?|charts?|exports?|kpi)\b/ },
  { locus: "settings_section", test: /\b(settings?|configur|preferences?|customi[sz]|branding|localis|localiz|languages?|currenc|time ?zones?|options|setup|installation)\b/ },
  { locus: "admin_section", test: /\b(admin|back.?office|management|moderation|superuser|operator|console)\b/ },
  { locus: "compliance_section", test: /\b(complian|security|privacy|gdpr|audit|retention|legal|verification|kyc|consent|terms|data protection)\b/ },
  { locus: "non_goals_section", test: /\b(non.?goals?|out of scope|not supported|limitations?|constraints?|won'?t|future|roadmap|later|known issues)\b/ },
];

export interface SpecHeading {
  locus: SpecLocus;
  heading: string;
}

/** Markdown/underlined/ALL-CAPS headings, matched against the cue table. Order = document order, deduped. */
export function specHeadings(text: string): SpecHeading[] {
  const lines = text.split("\n");
  const headings: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const md = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    if (md) {
      headings.push(md[1]!);
      continue;
    }
    const next = lines[i + 1] ?? "";
    if (line.trim().length > 2 && line.trim().length < 90 && /^\s{0,3}[=-]{3,}\s*$/.test(next)) headings.push(line.trim());
  }
  const out: SpecHeading[] = [];
  const seen = new Set<string>();
  for (const h of headings) {
    const lower = h.toLowerCase();
    for (const c of SPEC_HEADING_CUES) {
      if (!c.test.test(lower)) continue;
      const key = `${c.locus}::${lower}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ locus: c.locus, heading: h.trim() });
    }
  }
  return out;
}

/** Bounds a long document and says so, the same way `concepts.ts` does. */
export function boundText(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  return { text: `${text.slice(0, max)}\n\n[... document truncated: ${text.length - max} more characters omitted ...]`, truncated: true };
}

/**
 * Spec document → digest. The text is passed through (bounded); the work is deciding which loci it contains,
 * which is what makes an `absent` verdict licensable.
 */
export function condenseSpecDoc(docId: string, text: string, opts: CondenseOptions = {}): Digest {
  const maxChars = (opts.maxTokens ?? DEFAULT_MAX_TOKENS) * CHARS_PER_TOKEN;
  const bounded = boundText(text, maxChars - 500);
  const headings = specHeadings(bounded.text);
  const byLocus = new Map<SpecLocus, string[]>();
  for (const h of headings) (byLocus.get(h.locus) ?? byLocus.set(h.locus, []).get(h.locus)!).push(h.heading);

  const sections: DigestSection[] = [{ locus: "overview", sources: ["(document start)"], chars: Math.min(bounded.text.length, 2000) }];
  for (const locus of SPEC_LOCI) {
    if (locus === "overview") continue;
    const sources = byLocus.get(locus);
    if (sources?.length) sections.push({ locus, sources, chars: 0 });
  }
  const map = sections.map((s) => `  ${s.locus}${s.sources.length ? `  ←  ${s.sources.slice(0, 6).join(" | ")}` : ""}`).join("\n");
  const body = `SPEC DOCUMENT: ${docId}\nSECTIONS PRESENT (headings matched):\n${map}\n\n===== DOCUMENT =====\n${bounded.text}`;
  return {
    doc_id: docId,
    doc_type: "spec_doc",
    archetype: opts.archetype ?? "other",
    text: body,
    available_loci: sections.map((s) => s.locus).sort(),
    sections,
    approx_tokens: approxTokens(body.length),
    truncated: bounded.truncated,
    stats: { headings_matched: headings.length, sections: sections.length, chars: bounded.text.length },
  };
}

// ---------- the only IO ----------

export interface ReadRepoOptions {
  maxFileBytes?: number;
  /** hard cap on files read, after pruning by path (protects against pathological monorepos) */
  maxFiles?: number;
}

/** Walk a directory into `RepoFile[]`. Path pruning happens first so pruned trees are never even read. */
export async function readRepoDir(dir: string, opts: ReadRepoOptions = {}): Promise<RepoFile[]> {
  const maxFileBytes = opts.maxFileBytes ?? MAX_FILE_BYTES;
  const maxFiles = opts.maxFiles ?? 8000;
  const out: RepoFile[] = [];
  const walk = async (rel: string): Promise<void> => {
    if (out.length >= maxFiles) return;
    const abs = rel ? path.join(dir, rel) : dir;
    let entries;
    try {
      entries = await fs.readdir(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const child = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (PRUNED_DIRS.includes(e.name)) continue;
        await walk(child);
      } else if (e.isFile()) {
        if (out.length >= maxFiles) return;
        let bytes = 0;
        try {
          bytes = (await fs.stat(path.join(dir, child))).size;
        } catch {
          continue;
        }
        const readable = bytes <= maxFileBytes && !PRUNED_EXT.test(child) && !PRUNED_FILE.test(child);
        const text = readable ? await fs.readFile(path.join(dir, child), "utf8").catch(() => null) : null;
        out.push({ path: child, bytes, text });
      }
    }
  };
  await walk("");
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/** Locus vocabulary for a document type, for prompt rendering and validation. */
export function locusVocabulary(docType: DocType): readonly string[] {
  return docType === "repo" ? REPO_LOCI : SPEC_LOCI;
}
