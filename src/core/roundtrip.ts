/**
 * The round-trip check: reverse-compile the finished spec back into a Sheet, then measure how much of the
 * original Sheet survived. It is the compiler's one MECHANICAL signal — the critic is another LLM and can be
 * talked into agreeing with the spec it just read; this can only count.
 *
 * Two halves, and the second one is the half everybody forgets:
 *   - `missing`  — on the Sheet, absent from the spec. Content the compiler dropped.
 *   - `extra`    — in the spec, never on the Sheet. Content the compiler INVENTED: rules the user never
 *                  agreed to, entities nobody asked for. `scopeCreep` grades these.
 *
 * Matching is paraphrase-tolerant (src/core/textmatch.ts) because the reverse compiler restates rather than
 * quotes, and one-to-one, because a spec that says one thing twice must not be credited with covering two
 * different Sheet rules. Actors and nouns still match on normalised name — they are names, not sentences, and
 * exact matching there already worked.
 *
 * Pure and deterministic: no IO, no LLM, no clocks, no randomness (src/core house rule).
 */
import type { Sheet } from "./sheet.js";
import { normName } from "./ids.js";
import { alignOneToOne, similarity, MATCH_THRESHOLD, type MatchOptions } from "./textmatch.js";

/** The shape the reverse compiler returns (structurally `ReverseOut` from src/llm/functions.ts). */
export interface ReverseSheet {
  actors: { name: string }[];
  nouns: { name: string }[];
  actions: { actor: string; verb: string; object: string }[];
  rules: { text: string }[];
  non_goals: { text: string }[];
}

export interface RoundTripReport {
  recall: { actors: number; nouns: number; actions: number; rules: number; non_goals: number; overall: number };
  missing: { kind: string; item: string }[];
  /** In the reverse-compiled spec but NOT on the Sheet: the spec asserts things the Sheet never said. */
  extra: { kind: string; item: string }[];
}

/** Names and verbs are one or two words, so the bar for calling them "the same name" is higher than for a sentence. */
const NAME_THRESHOLD = 0.7;

export function roundTripReport(sheet: Sheet, rev: ReverseSheet): RoundTripReport {
  const missing: RoundTripReport["missing"] = [];
  const extra: RoundTripReport["extra"] = [];

  const rec = (kind: string, have: string[], got: string[], opts: MatchOptions & { score?: (a: string, b: string, o: MatchOptions) => number }) => {
    const aligned = alignOneToOne(have, got, opts);
    for (const i of aligned.unmatchedLeft) missing.push({ kind, item: have[i]! });
    for (const j of aligned.unmatchedRight) extra.push({ kind, item: got[j]! });
    return have.length ? aligned.pairs.length / have.length : 1;
  };

  // Names: normalised equality, scored 1/0 so the alignment is still one-to-one (two Sheet nouns that
  // normalise to the same name cannot both be covered by a single reverse noun).
  const byName = { score: (a: string, b: string) => (normName(a) === normName(b) ? 1 : 0), threshold: 1, weights: NO_CORPUS };
  const actorName = (id: string) => sheet.actors.find((a) => a.id === id)?.name ?? id;
  const nounName = (id: string) => sheet.nouns.find((n) => n.id === id)?.name ?? id;

  const recall = {
    actors: rec("actor", sheet.actors.map((a) => a.name), rev.actors.map((a) => a.name), byName),
    nouns: rec("noun", sheet.nouns.map((n) => n.name), rev.nouns.map((n) => n.name), byName),
    actions: rec(
      "action",
      sheet.actions.map((a) => `${actorName(a.actor)}|${a.verb}|${nounName(a.object)}`),
      rev.actions.map((a) => `${a.actor}|${a.verb}|${a.object}`),
      { score: actionScore, threshold: 0.5, weights: NO_CORPUS },
    ),
    rules: rec("rule", sheet.rules.map((r) => r.text), rev.rules.map((r) => r.text), { threshold: MATCH_THRESHOLD }),
    non_goals: rec("non_goal", sheet.non_goals.map((g) => g.text), rev.non_goals.map((g) => g.text), { threshold: MATCH_THRESHOLD }),
    overall: 0,
  };

  const total = sheet.actors.length + sheet.nouns.length + sheet.actions.length + sheet.rules.length + sheet.non_goals.length;
  recall.overall = total ? (total - missing.length) / total : 1;
  return { recall, missing, extra };
}

/** Empty weights map = "no candidate corpus", so `similarity` falls back to its own rarity heuristic. */
const NO_CORPUS: ReadonlyMap<string, number> = new Map();

/**
 * "Bookkeeper|creates|Invoice" ~ "bookkeeper|create|invoices": every part has to agree, by normalised name or
 * (for a paraphrased one, "approve" vs "approve new") by a close similarity; verbs additionally by stem.
 *
 * All three parts, with no whole-triple escape hatch: two triples that share two of their three parts agree
 * on most of their words and are still different actions — "Accountant|upload|Financial Record" against
 * "Accountant|delete|Financial Record" is the opposite action, and against "Manager|upload|Financial Record"
 * it is a different role's permission. Letting either through is how an invented action slips past as covered
 * and disappears from `scopeCreep`.
 */
export function sameAction(x: string, y: string): boolean {
  const [xa = "", xv = "", xo = ""] = x.split("|");
  const [ya = "", yv = "", yo = ""] = y.split("|");
  const part = (p: string, q: string) => normName(p) === normName(q) || similarity(p, q) >= NAME_THRESHOLD;
  const stem = (v: string) => normName(v).replace(/(ing|ed|es|s)$/, "");
  return (stem(xv) === stem(yv) || part(xv, yv)) && part(xa, ya) && part(xo, yo);
}

/** 0 when the triples are not the same action; otherwise 0.5..1, so the alignment prefers the closest fit. */
function actionScore(x: string, y: string): number {
  if (!sameAction(x, y)) return 0;
  return 0.5 + 0.5 * similarity(flat(x), flat(y));
}

const flat = (triple: string) => triple.replace(/\|/g, " ");

/**
 * Scope creep: what the spec asserts that the Sheet never authorised, graded by how much damage it does if an
 * agent builds it. This is `extra` put to work — before the matcher was fixed, `extra` was mostly paraphrase
 * noise and got ignored, which is how ~17 invented actions (propose, approve, archive, undo, download) and 3
 * invented nouns went unremarked on the f9280b97 run.
 *
 * A `rule` or a `noun` is HIGH: the spec invented a constraint the user never agreed to, or an entity the
 * data model never had — an agent will build both. An `actor` is high for the same reason: a role nobody
 * authorised. An `action` is MEDIUM: usually an affordance implied by the nouns, cheap to drop. A `non_goal`
 * is LOW: the spec ruled something OUT that the Sheet never mentioned, which narrows scope rather than
 * widening it — worth reading, rarely worth blocking on.
 *
 * Sorted high-first, stable within a severity, so the caller can print the top of the list and stop.
 */
export function scopeCreep(report: RoundTripReport): { kind: string; item: string; severity: "high" | "medium" | "low" }[] {
  const rank = { high: 0, medium: 1, low: 2 };
  return report.extra
    .map((e) => ({ kind: e.kind, item: e.item, severity: SEVERITY[e.kind] ?? "medium" }))
    .sort((a, b) => rank[a.severity] - rank[b.severity]);
}

const SEVERITY: Record<string, "high" | "medium" | "low"> = { rule: "high", noun: "high", actor: "high", action: "medium", non_goal: "low" };
