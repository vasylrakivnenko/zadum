/**
 * Corpus statistics over 1–3-grams — the cold-start for the decision catalog and its priors.
 *
 * Why n-grams 1..3 together, and why they are NOT one blended list:
 *   n=1  saturates. "payment" appears in ~every invoicing spec (DF≈1) → useless as a decision axis, but
 *        perfect for the coverage/omission check (is our compiled spec even talking about payments?).
 *   n=2,3 is where the discriminative signal lives: "partial payment", "credit note", "two factor" sit at
 *        DF≈0.5 inside an archetype — a binary feature with ~1 bit of entropy, i.e. exactly a decision node.
 * So we compute all n together and report them by role, not merged into one ranking.
 *
 * Everything here is pure and deterministic. Three filters keep an all-n-grams list from drowning in
 * redundant nested junk (see `candidates`):
 *   1. boundary stopwords  — reject grams starting/ending with a stopword ("of the", "the invoice"),
 *      but keep internal ones ("payment on account"). Stopwords are NOT stripped before n-gramming,
 *      which would create false adjacencies.
 *   2. phraseness (PMI)    — keep a multiword gram only if it co-occurs above chance given its parts.
 *   3. subsumption         — drop a shorter gram whose document frequency is ~the same as a longer one
 *      containing it: it carries no extra information.
 */

export interface Doc {
  id: string;
  archetype: string;
  text: string;
}

export interface TermStat {
  term: string;
  /** number of words in the gram (1..3) */
  n: number;
  /** documents containing it, globally */
  df: number;
  /** documents containing it, per archetype */
  df_by_archetype: Record<string, number>;
  /** total occurrences, globally */
  tf: number;
  tf_by_archetype: Record<string, number>;
}

export interface CorpusStats {
  docs: number;
  docs_by_archetype: Record<string, number>;
  /** total token count per n (denominator for PMI) */
  totals_by_n: Record<number, number>;
  terms: Map<string, TermStat>;
}

export interface TokenizeOptions {
  maxN?: number;
  /** drop grams occurring in fewer than this many documents (noise floor; trigrams are sparse) */
  minDf?: number;
}

export const STOPWORDS = new Set(
  ("a an the and or but if then than that this these those there here of to in on at by for with without from into over under " +
    "is are was were be been being am do does did doing have has had having will would shall should can could may might must " +
    "it its it's they them their he she his her we us our you your i me my not no nor so as such about after before between " +
    "each other others any all both few more most some only own same too very just also which who whom whose what when where " +
    "why how while during through against above below up down out off again further once because until unless upon per via " +
    "shall_not e g ie eg etc")
    .split(/\s+/)
    .filter(Boolean),
);

/**
 * Conservative singularizer. Deliberately not the naive "strip trailing s": that turns "status" into
 * "statu" and "analysis" into "analysi", which silently fragments the very domain terms we are mining.
 */
export function normToken(raw: string): string {
  const t = raw.toLowerCase();
  if (t.length <= 3) return t;
  if (/(ss|us|is|as|os|ics)$/.test(t)) return t;
  if (/ies$/.test(t) && t.length > 4) return `${t.slice(0, -3)}y`;
  if (/(ches|shes|xes|zes|sses)$/.test(t)) return t.slice(0, -2);
  if (/s$/.test(t)) return t.slice(0, -1);
  return t;
}

/** Strip markdown/code so we mine prose, not syntax. */
export function stripMarkup(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/[|>*_~#]+/g, " ")
    .replace(/<[^>]+>/g, " ");
}

/** Sentences of normalized tokens. n-grams never span a sentence boundary. */
export function tokenizeSentences(text: string): string[][] {
  return stripMarkup(text)
    .split(/[.!?;:\n\r]+/)
    .map((s) =>
      s
        .split(/[^a-zA-Z0-9'-]+/)
        .map((w) => w.replace(/^['-]+|['-]+$/g, ""))
        .filter((w) => w.length > 0 && !/^\d+$/.test(w))
        .map(normToken),
    )
    .filter((s) => s.length > 0);
}

/**
 * Internal words that never occur inside a concept phrase. Prepositions ARE allowed internally
 * ("payment on account", "log in to portal"); copulas and conjunctions are not, because they only ever
 * produce grammatical fragments ("booking is confirmed", "calendar and create").
 */
export const INTERNAL_BLOCK = new Set(["is", "are", "was", "were", "be", "been", "being", "and", "or", "but", "that", "which", "not", "no", "if", "then", "than", "so", "as", "it", "this", "there"]);

function isBoundaryOk(tokens: string[]): boolean {
  const first = tokens[0]!;
  const last = tokens[tokens.length - 1]!;
  if (STOPWORDS.has(first) || STOPWORDS.has(last) || first.length < 2 || last.length < 2) return false;
  for (let i = 1; i < tokens.length - 1; i++) if (INTERNAL_BLOCK.has(tokens[i]!)) return false;
  return true;
}

/** All acceptable n-grams (n = 1..maxN) of one document, as term → occurrence count. */
export function documentGrams(text: string, maxN = 3): Map<string, number> {
  const out = new Map<string, number>();
  for (const sentence of tokenizeSentences(text)) {
    for (let n = 1; n <= maxN; n++) {
      for (let i = 0; i + n <= sentence.length; i++) {
        const tokens = sentence.slice(i, i + n);
        if (!isBoundaryOk(tokens)) continue;
        if (n === 1 && STOPWORDS.has(tokens[0]!)) continue;
        const term = tokens.join(" ");
        out.set(term, (out.get(term) ?? 0) + 1);
      }
    }
  }
  return out;
}

export function analyzeCorpus(docs: Doc[], opts: TokenizeOptions = {}): CorpusStats {
  const maxN = opts.maxN ?? 3;
  const minDf = opts.minDf ?? 2;
  const terms = new Map<string, TermStat>();
  const docs_by_archetype: Record<string, number> = {};
  const totals_by_n: Record<number, number> = {};

  for (const doc of docs) {
    docs_by_archetype[doc.archetype] = (docs_by_archetype[doc.archetype] ?? 0) + 1;
    const grams = documentGrams(doc.text, maxN);
    for (const [term, count] of grams) {
      const n = term.split(" ").length;
      totals_by_n[n] = (totals_by_n[n] ?? 0) + count;
      let stat = terms.get(term);
      if (!stat) {
        stat = { term, n, df: 0, df_by_archetype: {}, tf: 0, tf_by_archetype: {} };
        terms.set(term, stat);
      }
      stat.df += 1;
      stat.df_by_archetype[doc.archetype] = (stat.df_by_archetype[doc.archetype] ?? 0) + 1;
      stat.tf += count;
      stat.tf_by_archetype[doc.archetype] = (stat.tf_by_archetype[doc.archetype] ?? 0) + count;
    }
  }
  if (minDf > 1) for (const [term, stat] of terms) if (stat.df < minDf) terms.delete(term);
  return { docs: docs.length, docs_by_archetype, totals_by_n, terms };
}

/** Pointwise mutual information of a multiword gram against its constituent unigrams (bits). */
export function pmi(stats: CorpusStats, term: string): number {
  const tokens = term.split(" ");
  if (tokens.length < 2) return Infinity;
  const stat = stats.terms.get(term);
  const nTotal = stats.totals_by_n[tokens.length] ?? 0;
  const uniTotal = stats.totals_by_n[1] ?? 0;
  if (!stat || !nTotal || !uniTotal) return -Infinity;
  let denom = 1;
  for (const t of tokens) {
    // constituent unigrams may have been pruned by minDf or dropped as stopwords; fall back to a floor
    const u = stats.terms.get(t);
    denom *= (u ? u.tf : 1) / uniTotal;
  }
  if (denom <= 0) return -Infinity;
  return Math.log2(stat.tf / nTotal / denom);
}

/** Binary entropy in bits of "a document in this archetype mentions this term". */
export function binaryEntropy(p: number): number {
  if (p <= 0 || p >= 1) return 0;
  return -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p));
}

/**
 * Class-based TF-IDF (BERTopic-style): treat every doc of an archetype as one document and score a term by
 * how characteristic it is of that class versus the rest of the corpus.
 */
export function cTfIdf(stats: CorpusStats, term: string, archetype: string): number {
  const stat = stats.terms.get(term);
  if (!stat) return 0;
  const inClass = stat.tf_by_archetype[archetype] ?? 0;
  if (inClass === 0) return 0;
  const classes = Object.keys(stats.docs_by_archetype).length || 1;
  const classesWithTerm = Object.keys(stat.tf_by_archetype).length || 1;
  return inClass * Math.log2(1 + classes / classesWithTerm);
}

export interface Candidate {
  term: string;
  n: number;
  /** fraction of this archetype's documents that mention it — the prior hint */
  df_fraction: number;
  /** bits of entropy in that fraction; peaks at df_fraction = 0.5 */
  entropy: number;
  /** how much more this archetype mentions it than the corpus at large */
  distinctiveness: number;
  c_tfidf: number;
  pmi: number;
  score: number;
  df_in_archetype: number;
  docs_in_archetype: number;
}

export interface CandidateOptions {
  /** keep grams whose within-archetype document fraction falls in this band (the "decision axis" band) */
  band?: [number, number];
  minPmi?: number;
  /** prune a short gram when a longer one containing it has >= this share of its document frequency */
  subsumptionRatio?: number;
  maxN?: number;
  limit?: number;
}

/**
 * Decision-node candidates for one archetype: terms sitting in the maximum-entropy band, i.e. the axes on
 * which apps in this category actually differ. Terms at DF≈1 are defaults, not questions; terms at DF≈0 are
 * non-goals. This is the card-selection criterion applied one level up, to catalog construction.
 */
export function candidates(stats: CorpusStats, archetype: string, opts: CandidateOptions = {}): Candidate[] {
  const [lo, hi] = opts.band ?? [0.2, 0.8];
  const minPmi = opts.minPmi ?? 1;
  const subsumption = opts.subsumptionRatio ?? 0.8;
  const maxN = opts.maxN ?? 3;
  const docsInArchetype = stats.docs_by_archetype[archetype] ?? 0;
  if (!docsInArchetype) return [];

  const kept: Candidate[] = [];
  for (const stat of stats.terms.values()) {
    if (stat.n > maxN) continue;
    const dfArch = stat.df_by_archetype[archetype] ?? 0;
    if (dfArch === 0) continue;
    const p = dfArch / docsInArchetype;
    if (p < lo || p > hi) continue;
    const phraseness = pmi(stats, stat.term);
    if (stat.n > 1 && phraseness < minPmi) continue;
    const globalP = stat.df / stats.docs;
    const distinctiveness = p / Math.max(globalP, 1e-6);
    const entropy = binaryEntropy(p);
    kept.push({
      term: stat.term,
      n: stat.n,
      df_fraction: p,
      entropy,
      distinctiveness,
      c_tfidf: cTfIdf(stats, stat.term, archetype),
      pmi: phraseness,
      // entropy is the information the axis carries; distinctiveness keeps generic prose out; longer grams
      // are more specific and therefore more likely to name a real decision.
      score: entropy * Math.log2(1 + distinctiveness) * (1 + 0.25 * (stat.n - 1)),
      df_in_archetype: dfArch,
      docs_in_archetype: docsInArchetype,
    });
  }

  // subsumption: "credit" adds nothing over "credit note" when they occur in the same documents
  const byTerm = new Map(kept.map((c) => [c.term, c]));
  const pruned = new Set<string>();
  for (const c of kept) {
    if (c.n < 2) continue;
    const tokens = c.term.split(" ");
    for (let n = 1; n < c.n; n++) {
      for (let i = 0; i + n <= tokens.length; i++) {
        const sub = tokens.slice(i, i + n).join(" ");
        const child = byTerm.get(sub);
        if (child && c.df_in_archetype / child.df_in_archetype >= subsumption) pruned.add(sub);
      }
    }
  }

  const out = kept.filter((c) => !pruned.has(c.term)).sort((a, b) => b.score - a.score || a.term.localeCompare(b.term));
  return opts.limit ? out.slice(0, opts.limit) : out;
}

/** Terms an archetype's specs almost always mention — the coverage checklist (n=1 dominates here, by design). */
export function coverageTerms(stats: CorpusStats, archetype: string, minFraction = 0.8, maxN = 3): { term: string; df_fraction: number; n: number }[] {
  const docsInArchetype = stats.docs_by_archetype[archetype] ?? 0;
  if (!docsInArchetype) return [];
  const out: { term: string; df_fraction: number; n: number }[] = [];
  for (const stat of stats.terms.values()) {
    if (stat.n > maxN) continue;
    const p = (stat.df_by_archetype[archetype] ?? 0) / docsInArchetype;
    if (p >= minFraction) out.push({ term: stat.term, df_fraction: p, n: stat.n });
  }
  return out.sort((a, b) => b.df_fraction - a.df_fraction || b.n - a.n || a.term.localeCompare(b.term));
}

export interface CoverageReport {
  archetype: string;
  checked: number;
  present: string[];
  missing: { term: string; df_fraction: number }[];
  score: number;
}

/**
 * Cheap, deterministic omission check for a compiled spec: does it mention what specs of its archetype
 * almost always mention? Complements the LLM critic, which is structurally weakest at spotting absence.
 */
export function specCoverage(specText: string, stats: CorpusStats, archetype: string, minFraction = 0.8): CoverageReport {
  const grams = documentGrams(specText, 3);
  const checklist = coverageTerms(stats, archetype, minFraction);
  const present: string[] = [];
  const missing: { term: string; df_fraction: number }[] = [];
  for (const item of checklist) {
    if (grams.has(item.term)) present.push(item.term);
    else missing.push({ term: item.term, df_fraction: item.df_fraction });
  }
  return {
    archetype,
    checked: checklist.length,
    present,
    missing: missing.sort((a, b) => b.df_fraction - a.df_fraction),
    score: checklist.length ? present.length / checklist.length : 1,
  };
}
