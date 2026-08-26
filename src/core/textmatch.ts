/**
 * Paraphrase-tolerant matching of short spec sentences (rules, non-goals, action triples).
 *
 * The compiler's round-trip check (src/core/roundtrip.ts) reverse-compiles the finished spec back into a
 * Sheet and asks "did every Sheet item survive?". The reverse compiler is an LLM, so it never returns the
 * Sheet's wording — it returns the same constraint said differently:
 *
 *   Sheet:   "All uploads must be logged with date, user, and file name."
 *   Reverse: "Every Excel file import must create an Upload Session entry recording the date/time,
 *             uploading user, and file name."
 *
 * A raw word-set Jaccard scores that pair at 0.24 and calls the rule dropped. The fix is NOT a lower Jaccard
 * threshold — that buys recall by matching any two rules that share "Financial Record". This module combines
 * signals that fail in different directions:
 *
 *   1. weighted Dice over stemmed content words — the base agreement signal;
 *   2. weighted containment (|A∩B| / min(|A|,|B|)) — a long paraphrase of a short rule still contains it;
 *   3. content-bigram overlap — word ORDER, which distinguishes "Accountants may view the Amount field on
 *      Financial Records" from "Only Accountants may upload or edit Financial Records" (both share
 *      {accountant, financial, record}, but only one shares the phrase "view amount field");
 *   4. entity-phrase agreement — two rules about different named entities are never the same rule, so a
 *      disjoint entity set is a penalty and a shared one a bonus;
 *   5. a shared predicate — agreeing on the subject and nothing else is not agreement (NO_SHARED_PREDICATE).
 *
 * Weights are IDF-ish: a word that shows up in every candidate ("record", "must", "system") carries almost no
 * evidence, a word that shows up once carries a lot. Callers that have the whole candidate list (bestMatch,
 * alignOneToOne) build those weights from it; a bare two-string `similarity` call falls back to a fixed
 * rarity heuristic so the function is still usable — and testable — on its own.
 *
 * Pure and deterministic: no IO, no LLM, no clocks, no randomness (src/core house rule).
 */

/**
 * Function words, modals and negations. Dropped BEFORE and AFTER stemming.
 *
 * Modality ("must", "may", "cannot", "only") is deliberately in here: every rule on every Sheet is phrased as
 * an obligation, so those words are pure noise for telling two rules apart. Domain verbs and nouns are not —
 * "delete", "upload", "view", "approve" are the whole signal.
 */
const STOP = new Set([
  "a", "an", "the", "and", "or", "nor", "but", "if", "then", "else", "of", "to", "in", "on", "at", "by", "for", "from", "with", "without", "within", "into", "onto", "out", "up", "off", "over", "under", "about", "against", "between", "through", "during", "before", "after", "until", "while", "unless", "because", "since", "so", "than", "as", "per", "via", "upon", "across", "along", "toward", "towards", "e", "g", "i", "ie", "eg", "etc",
  "is", "are", "was", "were", "be", "been", "being", "am", "do", "does", "did", "doing", "done", "has", "have", "had", "having", "get", "gets", "got",
  "will", "would", "shall", "should", "can", "could", "may", "might", "must", "cannot", "cant", "not", "no", "none", "never", "always", "still", "yet",
  "it", "its", "their", "them", "they", "he", "she", "his", "her", "hers", "we", "our", "ours", "us", "you", "your", "yours", "who", "whom", "whose", "which", "what", "when", "where", "why", "how", "this", "that", "these", "those", "there", "here", "itself", "themselves",
  "all", "any", "some", "each", "every", "both", "either", "neither", "many", "much", "few", "several", "only", "just", "also", "more", "most", "less", "least", "other", "others", "another", "such", "same", "very", "too", "own", "one",
]);

/**
 * Spec boilerplate: words that appear in nearly every sentence a compiler writes, so they should never carry
 * a paraphrase match on their own. Only used by the corpus-free fallback weighting — when a real candidate
 * corpus is available, IDF discovers this (and the project's own filler words) from the data.
 */
const GENERIC = new Set(["system", "data", "inform", "informat", "item", "entri", "valu", "use", "exist", "includ", "requir", "allow", "support", "provid", "ensur", "appli", "attempt", "way", "thing", "part", "level", "type", "kind", "state", "case", "step", "abl", "possibl", "relev", "specif", "certain", "appropri", "properli", "correctli", "new"]);

/**
 * Longest-first [suffix, replacement], stripped once per word after plural normalisation.
 * "-tion" becomes "t" rather than nothing so that "generation"/"generated" and "deletion"/"deleted" land on
 * one stem; a bare "-ion" rule would also chew "session" down to "sess".
 */
const SUFFIXES: [string, string][] = [["ements", ""], ["ement", ""], ["ments", ""], ["ment", ""], ["ness", ""], ["ally", ""], ["tion", "t"], ["ing", ""], ["ed", ""], ["ly", ""], ["er", ""], ["al", ""]];

/**
 * Words that get capitalised by grammar (sentence start, a title) rather than by being part of a name.
 * Grammar words ONLY: a domain noun in here silently deletes the entity ("Financial Records" -> "Records").
 */
const CAP_NOISE = new Set(["a", "an", "the", "all", "any", "each", "every", "no", "not", "only", "if", "when", "where", "while", "unless", "attempting", "deleting", "creating", "editing", "this", "that", "these", "those", "for", "and", "or", "but", "must", "may", "shall", "should", "can", "cannot", "will", "would", "it", "they", "we", "you", "he", "she", "there", "here", "some", "other", "such"]);

export interface MatchOptions {
  /** per-stem weights, e.g. from `buildWeights(candidates)`; absent = the corpus-free rarity heuristic */
  weights?: ReadonlyMap<string, number>;
  /** score at or above which two texts are "the same item"; defaults to MATCH_THRESHOLD */
  threshold?: number;
}

/**
 * The paraphrase-match cut-off, calibrated (not guessed) on the live compile f9280b97 (2026-08-25) — the run
 * where the old Jaccard matcher reported rules 0.2 / non_goals 0.0 while the reverse compiler had in fact
 * recovered all 10 rules and all 3 non-goals.
 *
 * Labelled set: 13 positives (each Sheet rule / non-goal paired with its true reverse-compiled paraphrase)
 * and 266 negatives (218 Sheet x reverse cross pairs of different items + 48 pairs of different items from
 * the same Sheet), including the near-miss trap "Only Accountants may upload or edit Financial Records" vs
 * "Field-level access control: Only Accountants and Managers may view the Amount field on Financial Records".
 *
 *   threshold   precision   recall      F1
 *   0.35          0.481      1.000     0.650
 *   0.40          0.591      1.000     0.743
 *   0.44          0.650      1.000     0.788
 *   0.48          0.867      1.000     0.929
 *   0.50          0.867      1.000     0.929   <- chosen
 *   0.52          0.867      1.000     0.929
 *   0.55          0.833      0.769     0.800
 *   0.60          0.909      0.769     0.833
 *   0.70          1.000      0.462     0.632
 *
 * 0.50 sits in the separating band: the worst true paraphrase scores 0.523 and the highest-scoring unrelated
 * pair below it scores 0.471 (the named trap above scores 0.302, or 0.368 for the truncated wording). The two
 * false positives that survive at 0.50 are one irreducible bag-of-words collision — "A Summary Report is
 * generated only from the existing set of Financial Records" vs "Financial Records cannot be deleted if they
 * are part of a generated Summary Report" share five of their seven content words — and `alignOneToOne`
 * resolves both by giving each reverse rule to the Sheet rule it fits best.
 *
 * End to end the threshold was then confirmed on the decision the report actually makes: 13/13 items assigned
 * to the right partner, and in a leave-one-out sweep (delete an item's true partner; it MUST come back
 * missing) 13/13 dropped items were still reported missing. That holds for 0.47-0.52 — below 0.47 a dropped
 * rule starts being covered by a neighbour, above 0.52 real paraphrases start being called missing. Re-run
 * the sweep before moving it; do not hand-pick (CLAUDE.md: calibrate from data).
 */
export const MATCH_THRESHOLD = 0.5;

/**
 * How the base score splits between weighted Dice (does the whole of each text agree?) and weighted
 * containment (is the shorter text inside the longer one?). Containment carries more because the reverse
 * compiler's paraphrase of a Sheet rule is routinely two or three times longer than the rule.
 */
const CONTAINMENT_WEIGHT = 0.65;
/** How much a shared content bigram (word order) can add. Bonus only — never a penalty for short texts. */
const BIGRAM_BONUS = 0.12;
/** Two texts naming disjoint sets of entities are about different things. */
const ENTITY_PENALTY = 0.15;
/**
 * Two texts naming the same entities get a nudge, not a free pass — in a finance app every second rule
 * mentions "Financial Record", so a large bonus would just shift the whole scale.
 */
const ENTITY_BONUS = 0.25;
/**
 * Words inside a named entity count for less in the word overlap, because entity agreement is already scored
 * separately. Without this, two rules that merely share their subject ("... Financial Record ... Summary
 * Report ...") outscore a genuine paraphrase whose agreement is in the PREDICATE, which is where a rule
 * actually says what it constrains.
 */
const ENTITY_WORD_DISCOUNT = 0.5;
/**
 * Two rules that agree on their SUBJECT and on nothing else are not the same rule, however much of the short
 * one the long one swallows: "Only Accountants may upload or edit Financial Records" against "Only
 * Accountants and Managers may view the Amount field on Financial Records" shares every word it has except
 * the two that say what it constrains. When both sides have predicate words (content words outside the named
 * entities) and share none of them, the score is scaled by this — enough to put that pair under any usable
 * threshold without hard-vetoing a pair the other signals like.
 */
const NO_SHARED_PREDICATE = 0.7;

/**
 * Lowercase, strip punctuation, drop stopwords, light suffix stemming. Domain words survive; grammar does not.
 * "All uploads must be logged with date, user, and file name." -> [upload, log, dat, user, fil, nam]
 */
export function normalizeWords(s: string): string[] {
  const out: string[] = [];
  for (const raw of s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/)) {
    if (!raw || raw.length < 2 || STOP.has(raw)) continue;
    const st = stemWord(raw);
    if (st.length < 2 || STOP.has(st)) continue;
    out.push(st);
  }
  return out;
}

/**
 * Conservative stemmer: plurals, -ing/-ed/-tion/-ment/-ly/-er/-al, doubled consonants, trailing -e. Enough to
 * fold "logged"/"logging"/"logs", "deletion"/"deleted", "generated"/"generation", "manager"/"management" onto
 * one stem. A strip is reverted when it would leave fewer than 3 characters, so short words stay intact.
 */
export function stemWord(word: string): string {
  let s = word;
  if (s.length <= 3) return s;

  // plurals
  if (s.endsWith("ies") && s.length > 4) s = s.slice(0, -3) + "y";
  else if (s.endsWith("sses") || s.endsWith("ches") || s.endsWith("shes") || s.endsWith("xes") || s.endsWith("zes")) s = s.slice(0, -2);
  else if (s.endsWith("s") && !s.endsWith("ss") && !s.endsWith("us") && !s.endsWith("is")) s = s.slice(0, -1);

  // one derivational suffix, longest first
  let stripped = "";
  for (const [suf, repl] of SUFFIXES) {
    if (!s.endsWith(suf) || s.length - suf.length + repl.length < 3) continue;
    // "-al" on a vowel stem is part of the word, not a suffix: financial -> financi is wrong, approval -> approv is right.
    if (suf === "al" && /[aeiou]$/.test(s.slice(0, -2))) continue;
    s = s.slice(0, -suf.length) + repl;
    stripped = suf;
    break;
  }

  // logged -> logg -> log, planning -> plann -> plan (but billing -> bill stays, to match "bills" -> "bill")
  if ((stripped === "ing" || stripped === "ed") && /([bcdgmnprtv])\1$/.test(s)) s = s.slice(0, -1);

  // manage/manager -> manag, file/files -> fil
  if (s.length > 3 && s.endsWith("e")) s = s.slice(0, -1);
  return s;
}

/**
 * Named entities: Capitalised names, normalised to stemmed lowercase — "Financial Record", "Summary Report",
 * "Upload Session", and single-word names like "Accountant", "Category", "Amount". Sentence-initial
 * capitalisation is grammar, not a name, so the first word of a sentence is only kept when it is part of a
 * longer Capitalised run whose remainder is itself a name.
 */
export function entityPhrases(s: string): string[] {
  const out: string[] = [];
  for (const sentence of s.split(/(?<=[.!?;:])[\s"')\]]+/)) {
    let first = true;
    for (const m of sentence.matchAll(/\b([A-Z][a-z]{2,}(?:[ -][A-Z][a-z]+)*)\b/g)) {
      const atStart = first && sentence.trimStart().startsWith(m[1]!);
      first = false;
      let parts = m[1]!.split(/[ -]/);
      const before = parts.length;
      while (parts.length && CAP_NOISE.has(parts[0]!.toLowerCase())) parts = parts.slice(1);
      const trimmedLeading = parts.length < before;
      while (parts.length && CAP_NOISE.has(parts[parts.length - 1]!.toLowerCase())) parts = parts.slice(0, -1);
      // A lone capitalised word that opened the sentence is grammar ("Every Excel file"); keep it only inside
      // a multi-word name — unless a grammar word was trimmed off its front, in which case it is not the
      // sentence's first word after all ("Only Accountants may ..." leaves the name Accountants).
      if (!parts.length || (parts.length < 2 && atStart && !trimmedLeading)) continue;
      out.push(parts.map((p) => stemWord(p.toLowerCase())).join(" "));
    }
  }
  return out;
}

/**
 * IDF-ish weights over the candidate texts actually being compared. A stem in most of the corpus is filler
 * for THIS corpus (in a finance app, "record" and "financial" tell you nothing); a stem in one text is the
 * whole reason that text is different from its neighbours. Multiplied onto the corpus-free rarity heuristic
 * and clamped, so a tiny corpus cannot produce extreme weights.
 */
export function buildWeights(docs: string[]): Map<string, number> {
  const df = new Map<string, number>();
  let n = 0;
  for (const d of docs) {
    n++;
    for (const t of new Set(normalizeWords(d))) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const weights = new Map<string, number>();
  if (!n || !df.size) return weights;
  const idf = new Map<string, number>();
  let sum = 0;
  for (const [t, d] of df) {
    const v = Math.log(1 + n / (1 + d));
    idf.set(t, v);
    sum += v;
  }
  const mean = sum / idf.size || 1;
  for (const [t, v] of idf) {
    const scaled = defaultWeight(t) * (v / mean);
    weights.set(t, Math.min(2, Math.max(0.25, scaled)));
  }
  return weights;
}

/** Corpus-free rarity: boilerplate is cheap, long words are rarer than short ones. */
function defaultWeight(stem: string): number {
  if (GENERIC.has(stem)) return 0.4;
  return Math.min(1.4, Math.max(0.7, 0.7 + 0.07 * (stem.length - 4)));
}

/**
 * How likely two short spec sentences state the same thing, in [0,1]. See the module header for the four
 * signals; compare against MATCH_THRESHOLD (or `opts.threshold`) rather than reading the number as a
 * probability. Symmetric: similarity(a, b) === similarity(b, a).
 */
export function similarity(a: string, b: string, opts: MatchOptions = {}): number {
  return similarityParts(a, b, opts).score;
}

/** The individual signals behind `similarity`, so a surprising non-match can be explained rather than argued about. */
export interface SimilarityParts {
  /** weighted Dice over stemmed content words */
  dice: number;
  /** weighted containment of the smaller text in the larger */
  containment: number;
  /** shared content bigrams (word order) */
  bigram: number;
  /** entity-phrase adjustment, negative when both texts name entities and share none */
  entity: number;
  /** the combined score in [0,1] */
  score: number;
}

export function similarityParts(a: string, b: string, opts: MatchOptions = {}): SimilarityParts {
  const A = normalizeWords(a);
  const B = normalizeWords(b);
  const SA = new Set(A);
  const SB = new Set(B);
  if (!SA.size || !SB.size) {
    // Nothing but stopwords on one side — fall back to literal equality so "Yes"/"No" style items still work.
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const eq = norm(a) === norm(b) ? 1 : 0;
    return { dice: eq, containment: eq, bigram: 0, entity: 0, score: eq };
  }

  const EA = new Set(entityPhrases(a));
  const EB = new Set(entityPhrases(b));
  const entityWords = new Set<string>();
  for (const e of [...EA, ...EB]) for (const part of e.split(" ")) entityWords.add(part);

  const w = (t: string) => (opts.weights?.get(t) ?? defaultWeight(t)) * (entityWords.has(t) ? ENTITY_WORD_DISCOUNT : 1);
  const total = (S: Set<string>) => {
    let n = 0;
    for (const t of S) n += w(t);
    return n;
  };
  let inter = 0;
  for (const t of SA) if (SB.has(t)) inter += w(t);
  const wa = total(SA);
  const wb = total(SB);
  const dice = (2 * inter) / (wa + wb);
  const containment = inter / Math.min(wa, wb);

  const GA = bigrams(A);
  const GB = bigrams(B);
  let shared = 0;
  for (const g of GA) if (GB.has(g)) shared++;
  const bigram = GA.size && GB.size ? shared / Math.min(GA.size, GB.size) : 0;
  const entity = entityAdjustment(EA, EB);

  const predA = [...SA].filter((t) => !entityWords.has(t));
  const predB = [...SB].filter((t) => !entityWords.has(t));
  const subjectOnly = predA.length > 0 && predB.length > 0 && !predA.some((t) => SB.has(t));

  // Bonuses fill the remaining headroom rather than being added on top: two texts that already agree
  // completely must land on exactly 1.0, or an exact match and a near-exact one both clamp to 1.0 and the
  // one-to-one assignment can no longer tell which is the better partner.
  const base = (1 - CONTAINMENT_WEIGHT) * dice + CONTAINMENT_WEIGHT * containment;
  const bonus = BIGRAM_BONUS * bigram + Math.max(0, entity);
  const raw = base + (1 - base) * bonus - Math.max(0, -entity);
  const score = Math.min(1, Math.max(0, raw * (subjectOnly ? NO_SHARED_PREDICATE : 1)));
  return { dice, containment, bigram, entity, score };
}

/**
 * +bonus when both texts name entities and share some, -penalty when both name entities and share none.
 * Neutral (0) when either side names none — an absent signal must not be read as disagreement.
 */
function entityAdjustment(EA: ReadonlySet<string>, EB: ReadonlySet<string>): number {
  if (!EA.size || !EB.size) return 0;
  let shared = 0;
  for (const e of EA) if (EB.has(e)) shared++;
  if (!shared) return -ENTITY_PENALTY;
  return ENTITY_BONUS * (shared / (EA.size + EB.size - shared));
}

function bigrams(words: string[]): Set<string> {
  const out = new Set<string>();
  for (let i = 1; i < words.length; i++) out.add(`${words[i - 1]} ${words[i]}`);
  return out;
}

/**
 * The best paraphrase of `needle` in `haystack`, or null when nothing clears the threshold. Weights are built
 * from needle + haystack (that is the corpus we are given) unless the caller supplies its own. Ties go to the
 * lower index, so the result is stable.
 */
export function bestMatch(needle: string, haystack: string[], opts: MatchOptions = {}): { index: number; score: number } | null {
  if (!haystack.length) return null;
  const weights = opts.weights ?? buildWeights([needle, ...haystack]);
  const threshold = opts.threshold ?? MATCH_THRESHOLD;
  let best: { index: number; score: number } | null = null;
  for (let i = 0; i < haystack.length; i++) {
    const score = similarity(needle, haystack[i]!, { weights });
    if (score >= threshold && (!best || score > best.score)) best = { index: i, score };
  }
  return best;
}

export interface Alignment {
  /** matched pairs, highest-scoring first */
  pairs: { left: number; right: number; score: number }[];
  /** indices into `left` that matched nothing */
  unmatchedLeft: number[];
  /** indices into `right` that matched nothing */
  unmatchedRight: number[];
}

/**
 * One-to-one greedy assignment: score every pair, take the best still-free pair, repeat. One-to-one matters
 * because a spec that says one thing twice must not be credited with covering two different Sheet rules, and
 * greedy-best-first matters because the near-duplicate trap ("Only Accountants may upload or edit Financial
 * Records" vs "...Only Accountants and Managers may VIEW the Amount field...") is resolved by letting each
 * reverse item go to the Sheet item it fits best.
 *
 * `score` lets a caller keep a domain gate (see sameAction in roundtrip.ts) while still ordering by fit.
 * Deterministic: ties break on the left index, then the right index.
 */
export function alignOneToOne(left: string[], right: string[], opts: MatchOptions & { score?: (a: string, b: string, o: MatchOptions) => number } = {}): Alignment {
  const weights = opts.weights ?? buildWeights([...left, ...right]);
  const threshold = opts.threshold ?? MATCH_THRESHOLD;
  const score = opts.score ?? similarity;
  const cands: { left: number; right: number; score: number }[] = [];
  for (let i = 0; i < left.length; i++) {
    for (let j = 0; j < right.length; j++) {
      const s = score(left[i]!, right[j]!, { weights, threshold });
      if (s >= threshold) cands.push({ left: i, right: j, score: s });
    }
  }
  cands.sort((x, y) => y.score - x.score || x.left - y.left || x.right - y.right);
  const usedL = new Set<number>();
  const usedR = new Set<number>();
  const pairs: Alignment["pairs"] = [];
  for (const c of cands) {
    if (usedL.has(c.left) || usedR.has(c.right)) continue;
    usedL.add(c.left);
    usedR.add(c.right);
    pairs.push(c);
  }
  return {
    pairs,
    unmatchedLeft: left.map((_, i) => i).filter((i) => !usedL.has(i)),
    unmatchedRight: right.map((_, j) => j).filter((j) => !usedR.has(j)),
  };
}
