/**
 * Instrument 1 — the ambiguity adversary.
 *
 * Operational definition: a spec is precise exactly to the degree that two independent competent readers
 * derive the SAME design from it. Two "implementer" calls (different cacheSalts, temperature 1) each read
 * ONLY the spec text and commit to a concrete design, aspect by aspect. A blind "aligner" judge then matches
 * the two derivations (presented in salt-randomized order as FIRST/SECOND — it never learns which reader is
 * which, let alone which system produced the spec) and classifies each matched design question as
 * agree / diverge_cosmetic / diverge_material / unmatched, with a 1-5 consequence estimate per pair.
 *
 * The headline metric deliberately does NOT reward length:
 *   spec_entropy = Σ consequence over material divergences ÷ Σ consequence over ALL matched aspects
 * (0 = the spec fully determined every consequential choice; 1 = every consequential choice went two ways).
 * A longer spec only wins by actually pinning decisions down, and each material divergence is itself the
 * located imprecision — the product's next discriminative question — so they are all kept verbatim.
 *
 * House rules (same as src/thesis/run.ts): raw observations are stored so metrics can be re-scored offline;
 * order randomization is a deterministic function of the trial salt; scoring is pure code over stored pairs.
 */
import { z } from "zod";
import type { LLM } from "../llm/client.js";

// ---------- the independent implementer readers ----------

export const IMPLEMENTER_SYSTEM = `You are a senior software engineer about to implement an application. You are given ONLY the specification text below — no other context, and no chance to ask anyone questions. Read it and commit to a concrete design.

Report your design as a list of aspects (at most 25). Cover at minimum: the data model (entities, key fields, identifiers/numbering), lifecycle and state transitions of the main objects, permissions and roles, delivery/notifications, and edge cases (errors, limits, concurrent or conflicting actions). For each aspect report:
- aspect: a short slug naming the design question (e.g. "invoice numbering")
- decision: ONE concrete sentence stating the design you commit to — specific enough that another engineer could tell whether their build matches yours
- forced: true if the specification text forces this decision; false if the spec left it open and you had to choose

Where the spec is silent on something you must still build, decide anyway — pick what you would actually build — and mark forced: false. Do not hedge, do not list options: commit to one design. Return JSON only.`;

export const DerivationSchema = z.object({
  aspects: z.array(
    z.object({
      aspect: z.string(),
      decision: z.string(),
      forced: z.boolean(),
    }),
  ),
});
export type Derivation = z.infer<typeof DerivationSchema>;

export async function deriveDesign(llm: LLM, specText: string, salt: string): Promise<Derivation> {
  const res = await llm.structured({
    fn: "quality_implementer",
    tier: "strong",
    system: IMPLEMENTER_SYSTEM,
    user: `THE SPECIFICATION:\n\n${specText}`,
    schema: DerivationSchema,
    effort: "medium",
    maxTokens: 3500,
    temperature: 1,
    cacheSalt: salt,
  });
  // Cap defensively at 25 — the prompt asks for it, but the metric must not depend on prompt obedience.
  return { aspects: res.data.aspects.slice(0, 25) };
}

// ---------- the blind aligner judge ----------

export const ALIGNER_SYSTEM = `You compare two engineers' design derivations, each produced independently from the same specification (which you do not see). You do not know who the engineers are or where the specification came from. Your job: match their aspects and judge where they arrived at the same design.

Output one pair per design question (match aspects by topic, not by exact wording — "invoice ids" and "invoice numbering" are the same question). For each pair report:
- aspect: a short slug for the design question
- first_decision / second_decision: the matched decision from each derivation, quoted or tightly paraphrased ("" on a side where the question does not appear)
- verdict:
    "agree" — the same design in substance;
    "diverge_cosmetic" — differences of wording or incidental detail; the two builds would be interchangeable;
    "diverge_material" — the two engineers would BUILD DIFFERENT THINGS (different schema, different behaviour, different rules, different user experience);
    "unmatched" — the design question appears in only one derivation.
- consequence: 1 to 5, how much this design question matters for the product (5 = money, data integrity or users directly affected; 1 = trivial). Estimate it for EVERY pair, not only for divergences.
- note: for diverge_material, one sentence on what would differ in the shipped product; otherwise "".

Do not invent aspects that appear in neither derivation. Return JSON only.`;

export const AlignOutSchema = z.object({
  pairs: z.array(
    z.object({
      aspect: z.string(),
      first_decision: z.string(),
      second_decision: z.string(),
      verdict: z.enum(["agree", "diverge_cosmetic", "diverge_material", "unmatched"]),
      // plain z.number() (clamped in code) keeps the schema in the strict-mode subset every provider accepts
      consequence: z.number(),
      note: z.string(),
    }),
  ),
});
export type AlignOut = z.infer<typeof AlignOutSchema>;

export type Verdict = AlignOut["pairs"][number]["verdict"];

/** A pair mapped back to reader identity: reading_a is ALWAYS reader A's decision, whatever order the judge saw. */
export interface AlignedPair {
  aspect: string;
  reading_a: string;
  reading_b: string;
  verdict: Verdict;
  consequence: number;
  note: string;
}

/** Deterministic per-salt coin so presentation order carries no signal across a run (same trick as run_decisions). */
export function saltCoin(salt: string): boolean {
  let h = 0;
  for (const ch of salt) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return (h & 1) === 1;
}

export function clampConsequence(x: number): number {
  if (!Number.isFinite(x)) return 1;
  return Math.min(5, Math.max(1, Math.round(x)));
}

export function renderDerivation(d: Derivation): string {
  return d.aspects.map((a, i) => `${i + 1}. [${a.aspect}] ${a.decision} (${a.forced ? "forced" : "chose"})`).join("\n");
}

/**
 * Present the two derivations to the aligner in salt-determined order, then map its FIRST/SECOND labels back
 * to reader A / reader B so downstream code never needs to know which way the coin fell.
 */
export async function alignDerivations(
  llm: LLM,
  a: Derivation,
  b: Derivation,
  salt: string,
): Promise<{ swapped: boolean; pairs: AlignedPair[] }> {
  const swapped = saltCoin(salt);
  const first = swapped ? b : a;
  const second = swapped ? a : b;
  const res = await llm.structured({
    fn: "quality_aligner",
    tier: "strong",
    system: ALIGNER_SYSTEM,
    user: `DERIVATION FIRST:\n${renderDerivation(first)}\n\nDERIVATION SECOND:\n${renderDerivation(second)}`,
    schema: AlignOutSchema,
    effort: "medium",
    maxTokens: 4000,
    cacheSalt: salt,
  });
  const pairs: AlignedPair[] = res.data.pairs.map((p) => ({
    aspect: p.aspect,
    reading_a: swapped ? p.second_decision : p.first_decision,
    reading_b: swapped ? p.first_decision : p.second_decision,
    verdict: p.verdict,
    consequence: clampConsequence(p.consequence),
    note: p.note,
  }));
  return { swapped, pairs };
}

// ---------- metrics (pure code over stored observations — re-scorable offline) ----------

export interface AmbiguityMetrics {
  aspects_a: number;
  aspects_b: number;
  /** pairs whose design question appeared in BOTH derivations */
  matched: number;
  material: number;
  cosmetic: number;
  unmatched: number;
  /** material ÷ matched (0 when nothing matched) */
  divergence_rate: number;
  /** Σ consequence over material ÷ Σ consequence over matched — 0 = perfectly determined spec */
  spec_entropy: number;
  /** share of aspects (both readers pooled) the readers say the spec FORCED — higher = more prescriptive spec */
  forced_rate: number;
}

export function ambiguityMetrics(a: Derivation, b: Derivation, pairs: AlignedPair[]): AmbiguityMetrics {
  const matchedPairs = pairs.filter((p) => p.verdict !== "unmatched");
  const material = matchedPairs.filter((p) => p.verdict === "diverge_material");
  const cosmetic = matchedPairs.filter((p) => p.verdict === "diverge_cosmetic");
  const sum = (xs: AlignedPair[]) => xs.reduce((s, p) => s + clampConsequence(p.consequence), 0);
  const denom = sum(matchedPairs);
  const totalAspects = a.aspects.length + b.aspects.length;
  const forced = a.aspects.filter((x) => x.forced).length + b.aspects.filter((x) => x.forced).length;
  return {
    aspects_a: a.aspects.length,
    aspects_b: b.aspects.length,
    matched: matchedPairs.length,
    material: material.length,
    cosmetic: cosmetic.length,
    unmatched: pairs.length - matchedPairs.length,
    divergence_rate: matchedPairs.length ? material.length / matchedPairs.length : 0,
    spec_entropy: denom > 0 ? sum(material) / denom : 0,
    forced_rate: totalAspects ? forced / totalAspects : 0,
  };
}

// ---------- one full trial ----------

/** A located imprecision: two competent readers built different things here. */
export interface MaterialDivergence {
  aspect: string;
  reading_a: string;
  reading_b: string;
  consequence: number;
  note: string;
}

export interface AmbiguityTrial {
  swapped: boolean;
  derivation_a: Derivation;
  derivation_b: Derivation;
  pairs: AlignedPair[];
  metrics: AmbiguityMetrics;
  material_divergences: MaterialDivergence[];
}

export async function runAmbiguity(reader: LLM, judge: LLM, specText: string, salt: string): Promise<AmbiguityTrial> {
  const [a, b] = await Promise.all([
    deriveDesign(reader, specText, `${salt}:reader1`),
    deriveDesign(reader, specText, `${salt}:reader2`),
  ]);
  const { swapped, pairs } = await alignDerivations(judge, a, b, `${salt}:align`);
  return {
    swapped,
    derivation_a: a,
    derivation_b: b,
    pairs,
    metrics: ambiguityMetrics(a, b, pairs),
    material_divergences: pairs
      .filter((p) => p.verdict === "diverge_material")
      .map((p) => ({ aspect: p.aspect, reading_a: p.reading_a, reading_b: p.reading_b, consequence: p.consequence, note: p.note })),
  };
}
