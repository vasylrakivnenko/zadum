/**
 * Eval harness: degrade-and-re-elicit with a simulated user.
 *   gold (hidden full requirements) → one-liner → engine → sim user answers cards from the gold →
 *   consequence-weighted recovery vs number of cards.
 *
 * Two experiments live here:
 *   run    — one arm over the gold set (metrics + summary)
 *   sweep  — compare selection criteria. Ordering is compared at EQUAL QUESTION BUDGET (θ disabled, cap 12)
 *            so "which question first" is measured independently of "when to stop"; stopping is then compared
 *            separately at each criterion's own θ.
 *
 * CLI: npm run harness -- [--mock] [--gold <dir|file>] [--sweep] [--variants N] [--flips N]
 *                         [--scoring s] [--theta n] [--lookahead 1|2] [--budget N] [--out dir]
 *                         [--review [depth]] [--catch-prob p] [--noise p] [--with-context]
 *   --review [depth]  simulate the defaults review (examine top `depth` items, default 8 ≈ one screen)
 *   --catch-prob p    P(an examined wrong default is caught), default 1.0 (attentive ceiling; try 0.5)
 *   --noise p         per-card P(the sim user mis-taps a random different option), default 0
 *   --with-context    A/B: run each gold with vs without its `extra_context` artifact and compare
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { Engine } from "../engine/orchestrator.js";
import type { Sheet } from "../core/sheet.js";
import type { SessionState } from "../core/session.js";
import { distribution, maxOption } from "../core/worlds.js";
import { normName } from "../core/ids.js";
import type { Scoring } from "../core/selector.js";
import { makeVariants, rng } from "./perturb.js";

export const GoldSchema = z.object({
  id: z.string(),
  one_liner: z.string(),
  archetypes: z.array(z.string()).default([]),
  persona: z.string(),
  truth: z.string(),
  decisions: z.record(z.string(), z.string()),
  /** alternative phrasings of the same request, vaguer or more specific (drafting robustness) */
  one_liner_variants: z.array(z.string()).optional(),
  /** alternative users wanting the same app (answer style, not truth) */
  persona_variants: z.array(z.string()).optional(),
  /** a pasted artifact (e.g. an example invoice) consistent with the truth — for the --with-context A/B */
  extra_context: z.string().optional(),
  sheet: z
    .object({
      actors: z.array(z.string()).default([]),
      nouns: z.array(z.string()).default([]),
      rules: z.array(z.string()).default([]),
      non_goals: z.array(z.string()).default([]),
    })
    .optional(),
});
export type Gold = z.infer<typeof GoldSchema>;

export interface SessionMetrics {
  gold_id: string;
  project_id: string;
  cards: number;
  stop_reason: string;
  recovery_curve: number[]; // index k = after k cards
  final_recovery: number;
  settledness_final: number;
  draft_recall: { actors: number; nouns: number; rules: number; non_goals: number };
  calibration: { node: string; confidence: number; correct: boolean }[];
  answers: { kind: string; node: string; option?: string }[];
  card_render_ms: number[];
  /** one-step value of each card at the moment it was shown — replaying this gives the whole theta curve */
  card_value1: number[];
  asked_nodes: string[];
  /** LLM-judge semantic recall (src/harness/judge.ts), same draft stage as draft_recall — opt-in via runGold's `judge` flag, since it costs 4 extra LLM calls per gold. See ADR-024/EVALS.md for why lexical draft_recall alone is not trustworthy for rules. */
  semantic_draft_recall?: { actors: number; nouns: number; rules: number; non_goals: number };
  // ---- simulated defaults review (opt-in via runGold's `review` option; absent otherwise) ----
  /** defaulted/implied decisions that mismatch the gold truth, counted on the riskiest-first list finishCards returns */
  wrong_defaults_before?: number;
  /** same count re-taken after the simulated review (corrected defaults become resolved and drop out) */
  wrong_defaults_after?: number;
  /** (before − after) / before — omitted when wrong_defaults_before is 0 */
  review_catch_rate?: number;
  /** 1-based positions of ALL wrong defaults in the riskiest-first review order (measures whether the ordering surfaces them) */
  review_positions?: number[];
  /** simulated mis-taps: option answers replaced by a random different option (opt-in via `noise`) */
  noise_events?: number;
}

export interface Summary {
  n: number;
  mean_cards: number;
  mean_final_recovery: number;
  mean_initial_recovery: number;
  /** recovery after k cards, averaged over sessions (curve held flat past its end) */
  recovery_at: Record<number, number>;
  auc_0_12: number;
  draft_recall: { actors: number; nouns: number; rules: number; non_goals: number };
  calibration_bins: { bin: string; n: number; accuracy: number; mean_confidence: number }[];
  render_ms_p90: number;
  you_decide_rate: number;
  other_rate: number;
  /** present only when sessions ran with the simulated defaults review */
  review?: {
    sessions: number;
    mean_wrong_before: number;
    mean_wrong_after: number;
    /** pooled net catch: Σ(before − after) / Σbefore over sessions with wrong defaults */
    catch_rate: number;
    /** review-order position (1-based) → how many wrong defaults sat there, pooled over sessions */
    position_histogram: Record<number, number>;
  };
  /** total simulated mis-taps, present only when sessions ran with answer noise */
  noise_events?: number;
}

/** Consequence-weighted share of gold decisions the session currently gets right (settled value or argmax belief). */
export function recovery(sheet: Sheet, session: SessionState, gold: Gold): number {
  let num = 0;
  let den = 0;
  for (const [nodeId, truth] of Object.entries(gold.decisions)) {
    const d = sheet.decisions.find((x) => x.id === nodeId);
    const node = session.belief.nodes.find((n) => n.id === nodeId);
    if (!d || !node) continue;
    const c = session.consequence_override[nodeId] ?? d.consequence;
    if (c <= 0) continue;
    const value = d.status !== "open" && d.chosen ? d.chosen : maxOption(distribution(session.belief, nodeId)).option;
    den += c;
    if (value === truth) num += c;
  }
  return den ? num / den : 1;
}

/** Hidden requirements as the simulated user sees them: prose + the structured decision list. */
export function truthText(gold: Gold): string {
  return `${gold.truth}\n\nKNOWN DECISIONS (id = option):\n${Object.entries(gold.decisions).map(([k, v]) => `- ${k} = ${v}`).join("\n")}`;
}

export function draftRecall(sheet: Sheet, gold: Gold): SessionMetrics["draft_recall"] {
  const g = gold.sheet;
  if (!g) return { actors: 1, nouns: 1, rules: 1, non_goals: 1 };
  const rec = (have: string[], got: string[], match: (a: string, b: string) => boolean) => (have.length ? have.filter((h) => got.some((x) => match(h, x))).length / have.length : 1);
  const eq = (a: string, b: string) => normName(a) === normName(b);
  const fuzzy = (a: string, b: string) => jaccard(a, b) >= 0.5;
  return {
    actors: rec(g.actors, sheet.actors.map((a) => a.name), eq),
    nouns: rec(g.nouns, sheet.nouns.map((n) => n.name), eq),
    rules: rec(g.rules, sheet.rules.map((r) => r.text), fuzzy),
    non_goals: rec(g.non_goals, sheet.non_goals.map((x) => x.text), fuzzy),
  };
}

export interface ReviewOptions {
  /** how many items from the top of the riskiest-first list the reviewer examines (≈ one screen) */
  depth?: number;
  /** P(an examined wrong default is caught): 1.0 = attentive ceiling, 0.5 = realistic mid */
  catchProb?: number;
  seed?: number;
}

export interface NoiseOptions {
  /** per-card probability that an option answer is replaced by a uniformly random DIFFERENT option (a mis-tap) */
  p: number;
  seed?: number;
}

/** Deterministic per-gold seed component so seeded behaviours differ across golds but replay identically. */
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export async function runGold(
  engine: Engine,
  gold: Gold,
  opts: { idPrefix?: string; judge?: boolean; review?: ReviewOptions; noise?: NoiseOptions; withContext?: boolean } = {},
): Promise<SessionMetrics> {
  const id = `${opts.idPrefix ?? "h"}_${gold.id.replace(/[^a-z0-9]+/gi, "-")}_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const created = await engine.createProject(gold.one_liner, { id, ...(opts.withContext && gold.extra_context ? { extra_context: gold.extra_context } : {}) });
  const noiseR = opts.noise && opts.noise.p > 0 ? rng(((opts.noise.seed ?? 7) * 2654435761) ^ hashSeed(gold.id)) : null;
  let noiseEvents = 0;
  const semanticPromise = opts.judge
    ? (async () => {
        const { semanticRecall } = await import("./judge.js");
        return semanticRecall(engine.llm, { actors: created.sheet.actors.map((a) => a.name), nouns: created.sheet.nouns.map((n) => n.name), rules: created.sheet.rules.map((r) => r.text), non_goals: created.sheet.non_goals.map((g) => g.text) }, gold.sheet);
      })()
    : null;
  const curve: number[] = [recovery(created.sheet, created.session, gold)];
  const answers: SessionMetrics["answers"] = [];
  const asked: string[] = [];
  let res = await engine.startCards(id);
  let guard = 0;
  while (res.kind === "card" && guard++ < 20) {
    const card = res.card;
    asked.push(card.node_id);
    const sim = await engine.fns.simUser({ card, persona: gold.persona, truth: truthText(gold) });
    let a = sim.data;
    // simulated mis-tap (survey §7): the real user sometimes taps the wrong option; the mock sim never does
    if (noiseR && a.kind === "option" && noiseR() < opts.noise!.p) {
      const chosen = a.option_id;
      const others = card.options.filter((o) => o.option_id !== chosen);
      if (others.length) {
        a = { ...a, option_id: others[Math.floor(noiseR() * others.length)]!.option_id };
        noiseEvents++;
      }
    }
    let ans;
    if (a.kind === "option" && card.options.some((o) => o.option_id === a.option_id)) ans = await engine.answerCard(id, { kind: "option", option_id: a.option_id, think_ms: 1000 });
    else if (a.kind === "other" && a.text) ans = await engine.answerCard(id, { kind: "other", text: a.text, think_ms: 1500 });
    else ans = await engine.answerCard(id, { kind: "you_decide", think_ms: 800 });
    answers.push({ kind: ans.answer.kind, node: card.node_id, ...(ans.answer.option_id ? { option: ans.answer.option_id } : {}) });
    const st = await engine.getState(id);
    curve.push(recovery(st.sheet, st.session, gold));
    res = ans.next;
  }
  const defaultsList = await engine.finishCards(id); // riskiest-first: consequence × (1 − confidence)
  let review: Pick<SessionMetrics, "wrong_defaults_before" | "wrong_defaults_after" | "review_catch_rate" | "review_positions"> | null = null;
  if (opts.review) {
    const depth = opts.review.depth ?? 8;
    const catchProb = opts.review.catchProb ?? 1;
    const r = rng(((opts.review.seed ?? 7) * 2654435761) ^ hashSeed(gold.id));
    const isWrong = (it: { id: string; chosen: string }) => gold.decisions[it.id] !== undefined && it.chosen !== gold.decisions[it.id];
    const wrong = defaultsList.map((it, i) => ({ it, pos: i + 1 })).filter((x) => isWrong(x.it));
    for (const { it, pos } of wrong) {
      if (pos > depth) continue; // below the fold: the reviewer never sees it
      if (r() >= catchProb) continue; // seen but not caught
      const truth = gold.decisions[it.id]!;
      if (!it.options.some((o) => o.id === truth)) continue; // gold truth is not an option of this node
      try {
        await engine.overrideDefault(id, it.id, truth);
      } catch {
        /* override rejected (e.g. hard-edge contradiction) — counts as not caught */
      }
    }
    const after = (await engine.getDefaults(id)).filter(isWrong).length;
    review = {
      wrong_defaults_before: wrong.length,
      wrong_defaults_after: after,
      review_positions: wrong.map((x) => x.pos),
      ...(wrong.length ? { review_catch_rate: (wrong.length - after) / wrong.length } : {}),
    };
  }
  const st = await engine.getState(id);
  const events = await engine.store.listEvents(id);
  const calibration = st.sheet.decisions
    .filter((d) => d.status === "defaulted" && d.chosen && gold.decisions[d.id] !== undefined)
    .map((d) => ({ node: d.id, confidence: d.confidence ?? 0, correct: d.chosen === gold.decisions[d.id] }));
  const semantic_draft_recall = semanticPromise ? await semanticPromise : undefined;
  return {
    gold_id: gold.id,
    project_id: id,
    cards: st.session.cards.length,
    stop_reason: st.session.last_stop_reason ?? "user",
    recovery_curve: curve,
    final_recovery: recovery(st.sheet, st.session, gold),
    settledness_final: res.kind === "stop" ? res.settledness : 0,
    draft_recall: draftRecall(created.sheet, gold),
    calibration,
    answers,
    card_render_ms: events.filter((e) => e.type === "card_shown").map((e) => Number(e.payload.render_ms ?? 0)),
    card_value1: events.filter((e) => e.type === "card_shown").map((e) => Number(e.payload.value1 ?? e.payload.value ?? 0)),
    asked_nodes: asked,
    ...(semantic_draft_recall ? { semantic_draft_recall } : {}),
    ...(review ?? {}),
    ...(noiseR ? { noise_events: noiseEvents } : {}),
  };
}

/** Recovery after exactly k cards (curve held flat past its end, so short sessions are comparable). */
export function recoveryAt(m: SessionMetrics, k: number): number {
  return m.recovery_curve[Math.min(k, m.recovery_curve.length - 1)] ?? 0;
}

export const REPORT_K = [1, 3, 5, 8, 12];

export interface ThetaPoint {
  theta: number;
  mean_cards: number;
  mean_recovery: number;
}

/**
 * Off-policy replay of the stopping rule: from ONE equal-budget run (theta disabled) we can read off what any
 * theta would have done, because the loop is deterministic given the same answers — a session stops before the
 * first card whose one-step value fell below theta, and the prefix up to that point is unchanged.
 * This turns theta calibration into arithmetic over logged runs instead of N more LLM-burning sessions.
 */
export function cardsUnderTheta(m: SessionMetrics, theta: number): number {
  const i = m.card_value1.findIndex((v) => v < theta);
  return i < 0 ? m.card_value1.length : i;
}

export function thetaCurve(sessions: SessionMetrics[], thetas: number[]): ThetaPoint[] {
  return thetas.map((theta) => {
    const cards = sessions.map((m) => cardsUnderTheta(m, theta));
    const recs = sessions.map((m, i) => recoveryAt(m, cards[i]!));
    const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    return { theta, mean_cards: mean(cards), mean_recovery: mean(recs) };
  });
}

/** Thetas worth probing for an arm: spread over the observed range of one-step card values. */
export function thetaGrid(sessions: SessionMetrics[], steps = 10): number[] {
  const vals = sessions.flatMap((m) => m.card_value1).filter((v) => v > 0);
  if (!vals.length) return [0];
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const out: number[] = [];
  for (let i = 0; i <= steps; i++) out.push(round3(lo + ((hi - lo) * i) / steps));
  return [...new Set(out)];
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

export function aggregate(ms: SessionMetrics[]): Summary {
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const recovery_at: Record<number, number> = {};
  for (const k of REPORT_K) recovery_at[k] = mean(ms.map((m) => recoveryAt(m, k)));
  const auc = mean(ms.map((m) => mean(Array.from({ length: 13 }, (_, k) => recoveryAt(m, k)))));
  const cal = ms.flatMap((m) => m.calibration);
  const edges = [0.5, 0.6, 0.7, 0.8, 0.9, 1.01];
  const bins = edges.slice(0, -1).map((lo, i) => {
    const hi = edges[i + 1]!;
    const inBin = cal.filter((c) => c.confidence >= lo && c.confidence < hi);
    return { bin: `${lo.toFixed(1)}–${Math.min(hi, 1).toFixed(1)}`, n: inBin.length, accuracy: inBin.length ? inBin.filter((c) => c.correct).length / inBin.length : 0, mean_confidence: mean(inBin.map((c) => c.confidence)) };
  });
  const renders = ms.flatMap((m) => m.card_render_ms).sort((a, b) => a - b);
  const allAnswers = ms.flatMap((m) => m.answers);
  const rev = ms.filter((m) => m.wrong_defaults_before !== undefined);
  let review: Summary["review"];
  if (rev.length) {
    const position_histogram: Record<number, number> = {};
    for (const m of rev) for (const p of m.review_positions ?? []) position_histogram[p] = (position_histogram[p] ?? 0) + 1;
    const before = rev.reduce((a, m) => a + (m.wrong_defaults_before ?? 0), 0);
    const after = rev.reduce((a, m) => a + (m.wrong_defaults_after ?? 0), 0);
    review = {
      sessions: rev.length,
      mean_wrong_before: before / rev.length,
      mean_wrong_after: after / rev.length,
      catch_rate: before ? (before - after) / before : 1,
      position_histogram,
    };
  }
  const noised = ms.filter((m) => m.noise_events !== undefined);
  return {
    n: ms.length,
    mean_cards: mean(ms.map((m) => m.cards)),
    mean_final_recovery: mean(ms.map((m) => m.final_recovery)),
    mean_initial_recovery: mean(ms.map((m) => m.recovery_curve[0] ?? 0)),
    recovery_at,
    auc_0_12: auc,
    draft_recall: {
      actors: mean(ms.map((m) => m.draft_recall.actors)),
      nouns: mean(ms.map((m) => m.draft_recall.nouns)),
      rules: mean(ms.map((m) => m.draft_recall.rules)),
      non_goals: mean(ms.map((m) => m.draft_recall.non_goals)),
    },
    calibration_bins: bins,
    render_ms_p90: renders.length ? renders[Math.min(renders.length - 1, Math.floor(renders.length * 0.9))]! : 0,
    you_decide_rate: allAnswers.length ? allAnswers.filter((a) => a.kind === "you_decide").length / allAnswers.length : 0,
    other_rate: allAnswers.length ? allAnswers.filter((a) => a.kind === "other").length / allAnswers.length : 0,
    ...(review ? { review } : {}),
    ...(noised.length ? { noise_events: noised.reduce((a, m) => a + (m.noise_events ?? 0), 0) } : {}),
  };
}

// ---------- sweep ----------

export interface Arm {
  label: string;
  scoring: Scoring;
  lookahead: 1 | 2;
}

export const DEFAULT_ARMS: Arm[] = [
  { label: "weighted_entropy", scoring: "weighted_entropy", lookahead: 1 },
  { label: "joint_entropy", scoring: "joint_entropy", lookahead: 1 },
  { label: "risk", scoring: "risk", lookahead: 1 },
  { label: "ec2", scoring: "ec2", lookahead: 1 },
  { label: "weighted_entropy+2ply", scoring: "weighted_entropy", lookahead: 2 },
];

export type EngineFactory = (config: { scoring: Scoring; lookahead: 1 | 2; theta?: number; maxCards: number }) => Promise<Engine>;

export interface ArmResult {
  arm: Arm;
  /** what each theta would have cost/recovered, replayed from the equal-budget run */
  theta_curve: ThetaPoint[];
  /** equal-budget run (θ disabled): measures ORDERING quality only */
  budget: { summary: Summary; sessions: SessionMetrics[] };
  /** natural run at the arm's own θ: measures STOPPING behaviour */
  natural: { summary: Summary; sessions: SessionMetrics[] };
}

export async function sweep(makeEngine: EngineFactory, golds: Gold[], arms: Arm[] = DEFAULT_ARMS, budget = 12, log: (s: string) => void = () => {}): Promise<ArmResult[]> {
  const out: ArmResult[] = [];
  for (const arm of arms) {
    log(`\n── arm ${arm.label} (equal-budget ${budget} cards) ──`);
    const budgetEngine = await makeEngine({ scoring: arm.scoring, lookahead: arm.lookahead, theta: -1, maxCards: budget });
    const budgetSessions: SessionMetrics[] = [];
    for (const g of golds) {
      const m = await runGold(budgetEngine, g, { idPrefix: `b_${arm.label}` });
      budgetSessions.push(m);
      log(`   ${g.id.padEnd(30)} r@1 ${pc(recoveryAt(m, 1))} r@3 ${pc(recoveryAt(m, 3))} r@5 ${pc(recoveryAt(m, 5))} r@8 ${pc(recoveryAt(m, 8))}`);
    }
    log(`── arm ${arm.label} (own θ) ──`);
    const naturalEngine = await makeEngine({ scoring: arm.scoring, lookahead: arm.lookahead, maxCards: 12 });
    const naturalSessions: SessionMetrics[] = [];
    for (const g of golds) {
      const m = await runGold(naturalEngine, g, { idPrefix: `n_${arm.label}` });
      naturalSessions.push(m);
      log(`   ${g.id.padEnd(30)} cards ${String(m.cards).padStart(2)} (${m.stop_reason}) final ${pc(m.final_recovery)}`);
    }
    out.push({
      arm,
      theta_curve: thetaCurve(budgetSessions, thetaGrid(budgetSessions)),
      budget: { summary: aggregate(budgetSessions), sessions: budgetSessions },
      natural: { summary: aggregate(naturalSessions), sessions: naturalSessions },
    });
  }
  return out;
}

export function sweepTable(results: ArmResult[]): string {
  const L: string[] = [];
  L.push("ORDERING (equal budget — who recovers the truth fastest per card)");
  L.push(`  ${"arm".padEnd(24)} ${REPORT_K.map((k) => `r@${k}`.padStart(6)).join(" ")}   ${"AUC".padStart(6)}`);
  for (const r of results) L.push(`  ${r.arm.label.padEnd(24)} ${REPORT_K.map((k) => pc(r.budget.summary.recovery_at[k] ?? 0).padStart(6)).join(" ")}   ${pc(r.budget.summary.auc_0_12).padStart(6)}`);
  L.push("");
  L.push("STOPPING (each arm at its own θ — cards spent vs what was recovered)");
  L.push(`  ${"arm".padEnd(24)} ${"cards".padStart(6)} ${"final".padStart(7)} ${"p90 ms".padStart(7)} ${"you-decide".padStart(11)}`);
  for (const r of results) {
    const s = r.natural.summary;
    L.push(`  ${r.arm.label.padEnd(24)} ${s.mean_cards.toFixed(1).padStart(6)} ${pc(s.mean_final_recovery).padStart(7)} ${String(s.render_ms_p90).padStart(7)} ${pc(s.you_decide_rate).padStart(11)}`);
  }
  L.push("");
  L.push("STOPPING RULE CALIBRATION (replayed from the equal-budget runs: what each theta would do)");
  for (const r of results) {
    const pts = r.theta_curve.filter((p) => p.mean_cards >= 1);
    L.push(`  ${r.arm.label}`);
    L.push(`    ${"theta".padStart(7)} ${pts.map((p) => String(p.theta).padStart(7)).join(" ")}`);
    L.push(`    ${"cards".padStart(7)} ${pts.map((p) => p.mean_cards.toFixed(1).padStart(7)).join(" ")}`);
    L.push(`    ${"recov".padStart(7)} ${pts.map((p) => pc(p.mean_recovery).padStart(7)).join(" ")}`);
    const target = pts.filter((p) => p.mean_cards >= 3 && p.mean_cards <= 9).sort((a, b) => b.mean_recovery - a.mean_recovery || a.mean_cards - b.mean_cards)[0];
    if (target) L.push(`    → best theta inside the 3–9 card band: ${target.theta} (${target.mean_cards.toFixed(1)} cards, ${pc(target.mean_recovery)} recovered)`);
  }
  return L.join("\n");
}

export async function loadGolds(p: string): Promise<Gold[]> {
  const stat = await fs.stat(p);
  const files = stat.isDirectory() ? (await fs.readdir(p)).filter((f) => f.endsWith(".json")).map((f) => path.join(p, f)) : [p];
  const out: Gold[] = [];
  for (const f of files) out.push(GoldSchema.parse(JSON.parse(await fs.readFile(f, "utf8"))));
  return out;
}

function jaccard(a: string, b: string): number {
  const tok = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((t) => t.length > 2));
  const A = tok(a);
  const B = tok(b);
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return A.size + B.size - inter ? inter / (A.size + B.size - inter) : 1;
}

function pc(x: number): string {
  return `${(x * 100).toFixed(0)}%`;
}

// ---------- CLI ----------
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const flag = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const mock = args.includes("--mock");
  const doSweep = args.includes("--sweep");
  const goldPath = flag("--gold") ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "gold");
  const outDir = flag("--out") ?? "harness-results";
  const scoring = flag("--scoring") as Scoring | undefined;
  const theta = flag("--theta");
  const lookahead = Number(flag("--lookahead") ?? 1) === 2 ? 2 : 1;
  const ruleBankDir = flag("--rule-bank-dir"); // e.g. an empty temp dir to A/B "with vs without the rule bank"
  const judge = args.includes("--judge"); // adds LLM-judge semantic recall (4 extra calls/gold) — see ADR-024
  const variants = Number(flag("--variants") ?? 0);
  const flips = Number(flag("--flips") ?? 3);
  const budget = Number(flag("--budget") ?? 12);
  const reviewIdx = args.indexOf("--review");
  const reviewDepthArg = reviewIdx >= 0 ? args[reviewIdx + 1] : undefined;
  const review = reviewIdx >= 0 ? { depth: reviewDepthArg && /^\d+$/.test(reviewDepthArg) ? Number(reviewDepthArg) : 8, catchProb: Number(flag("--catch-prob") ?? 1) } : undefined;
  const noiseP = Number(flag("--noise") ?? 0);
  const withContext = args.includes("--with-context");

  const { buildEngine } = await import("../engine/bootstrap.js");
  const { MemoryStore } = await import("../store/file_store.js");
  const { loadCatalogs } = await import("../engine/catalogs.js");
  const { mergeCatalogs } = await import("../core/catalog.js");

  const store = new MemoryStore();
  const makeEngine: EngineFactory = async (config) =>
    (
      await buildEngine({
        mock,
        cache: !mock,
        store,
        engine: {
          precompute: false,
          config: { scoring: config.scoring, lookahead: config.lookahead, maxCards: config.maxCards, ...(config.theta !== undefined ? { theta: config.theta } : {}) },
          arm: `${config.scoring}/la${config.lookahead}${config.theta !== undefined ? `/θ${config.theta}` : ""}`,
          ...(ruleBankDir ? { ruleBankDir } : {}),
        },
      })
    ).engine;

  // expand the gold set with counterfactual variants (defeats memorization, gives n > 1)
  const base = await loadGolds(goldPath);
  const catalogs = await loadCatalogs();
  let golds = base;
  if (variants > 0) {
    golds = [];
    for (const g of base) {
      const { nodes } = mergeCatalogs(catalogs.catalogs, g.archetypes);
      for (const v of makeVariants(g, nodes, { count: variants, flips, seed: 7 })) {
        golds.push(v.gold);
        if (v.info?.flipped.length) console.log(`variant ${v.gold.id}: flipped ${v.info.flipped.map((f) => `${f.node} ${f.from}→${f.to}`).join(", ")}${v.info.repaired.length ? ` · repaired ${v.info.repaired.map((r) => `${r.node}→${r.to}`).join(", ")}` : ""}${v.info.conflicts.length ? ` · conflicts ${v.info.conflicts.length}` : ""}`);
      }
    }
  }

  await fs.mkdir(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  if (doSweep) {
    const results = await sweep(makeEngine, golds, DEFAULT_ARMS, budget, (s) => console.log(s));
    console.log(`\n${sweepTable(results)}`);
    const file = path.join(outDir, `${stamp}-sweep${mock ? "-mock" : ""}.json`);
    await fs.writeFile(file, JSON.stringify({ golds: golds.map((g) => g.id), budget, mock, catalog: catalogs.version, results }, null, 2));
    console.log(`\nwritten ${file}`);
  } else {
    const engine = await makeEngine({ scoring: scoring ?? "weighted_entropy", lookahead, maxCards: 12, ...(theta ? { theta: Number(theta) } : {}) });
    const runOpts = { judge, ...(review ? { review } : {}), ...(noiseP > 0 ? { noise: { p: noiseP } } : {}) };
    const logGold = (g: Gold, m: SessionMetrics, tag = "") => {
      const sem = m.semantic_draft_recall ? `  ·  JUDGE n${pc(m.semantic_draft_recall.nouns)} r${pc(m.semantic_draft_recall.rules)}` : "";
      const rev = m.wrong_defaults_before !== undefined ? `  wrong defaults ${m.wrong_defaults_before}→${m.wrong_defaults_after} @pos [${(m.review_positions ?? []).join(",")}]` : "";
      const noi = m.noise_events !== undefined ? `  mis-taps ${m.noise_events}` : "";
      console.log(`${(g.id + tag).padEnd(30)} cards ${String(m.cards).padStart(2)}  recovery ${pc(m.recovery_curve[0]!)} → ${pc(m.final_recovery)}  stop ${m.stop_reason}  draft recall n${pc(m.draft_recall.nouns)} r${pc(m.draft_recall.rules)}${sem}${rev}${noi}  asked: ${m.asked_nodes.join(",")}`);
    };
    const logSummary = (summary: Summary) => {
      console.log(`\nSUMMARY n=${summary.n} · mean cards ${summary.mean_cards.toFixed(1)} · recovery ${pc(summary.mean_initial_recovery)} → ${pc(summary.mean_final_recovery)} · ${REPORT_K.map((k) => `r@${k} ${pc(summary.recovery_at[k] ?? 0)}`).join(" · ")} · AUC ${pc(summary.auc_0_12)} · render p90 ${summary.render_ms_p90}ms · you-decide ${pc(summary.you_decide_rate)} · other ${pc(summary.other_rate)}`);
      console.log(`calibration: ${summary.calibration_bins.map((b) => `${b.bin}: n=${b.n} acc=${pc(b.accuracy)}`).join(" | ")}`);
      if (summary.review) {
        const r = summary.review;
        console.log(`DEFAULTS REVIEW (depth ${review?.depth ?? 8}, catch-prob ${review?.catchProb ?? 1}): wrong defaults/session ${r.mean_wrong_before.toFixed(1)} → ${r.mean_wrong_after.toFixed(1)} · net catch ${pc(r.catch_rate)}`);
        const positions = Object.keys(r.position_histogram).map(Number).sort((a, b) => a - b);
        console.log(`  wrong-default positions in review order (1 = riskiest): ${positions.map((p) => `${p}:${r.position_histogram[p]}`).join(" ")}${positions.some((p) => p > (review?.depth ?? 8)) ? `  ← ${positions.filter((p) => p > (review?.depth ?? 8)).reduce((a, p) => a + r.position_histogram[p]!, 0)} wrong default(s) BELOW the review fold (depth ${review?.depth ?? 8})` : ""}`);
      }
      if (summary.noise_events !== undefined) console.log(`answer noise: ${summary.noise_events} simulated mis-tap(s)`);
    };
    if (withContext) {
      // A/B: evidence in, not just answers in — same golds, with vs without the pasted artifact
      const withCtx = golds.filter((g) => g.extra_context).length;
      console.log(`extra_context A/B over ${golds.length} gold(s) (${withCtx} carry extra_context; the rest are identical in both arms)\n`);
      const armA: SessionMetrics[] = [];
      const armB: SessionMetrics[] = [];
      // fresh engine per session: the MockLLM's call counter is per-instance state, so a shared engine would
      // make paired arms differ even on golds with no extra_context (stream position, not context, would differ)
      const fresh = () => makeEngine({ scoring: scoring ?? "weighted_entropy", lookahead, maxCards: 12, ...(theta ? { theta: Number(theta) } : {}) });
      for (const g of golds) {
        const a = await runGold(await fresh(), g, { ...runOpts, idPrefix: "noctx" });
        logGold(g, a, " [no-ctx]");
        armA.push(a);
        const b = await runGold(await fresh(), g, { ...runOpts, idPrefix: "ctx", withContext: true });
        logGold(g, b, " [ctx]");
        armB.push(b);
      }
      const sa = aggregate(armA);
      const sb = aggregate(armB);
      console.log(`\nEXTRA-CONTEXT A/B (per gold: initial → final recovery · draft recall nouns/rules)`);
      console.log(`  ${"gold".padEnd(30)} ${"without".padStart(24)} ${"with".padStart(24)}`);
      for (let i = 0; i < golds.length; i++) {
        const fmt = (m: SessionMetrics) => `${pc(m.recovery_curve[0]!)}→${pc(m.final_recovery)} n${pc(m.draft_recall.nouns)} r${pc(m.draft_recall.rules)}`;
        console.log(`  ${golds[i]!.id.padEnd(30)} ${fmt(armA[i]!).padStart(24)} ${fmt(armB[i]!).padStart(24)}${golds[i]!.extra_context ? "" : "  (no extra_context)"}`);
      }
      console.log(`  ${"MEAN".padEnd(30)} ${`${pc(sa.mean_initial_recovery)}→${pc(sa.mean_final_recovery)} n${pc(sa.draft_recall.nouns)} r${pc(sa.draft_recall.rules)}`.padStart(24)} ${`${pc(sb.mean_initial_recovery)}→${pc(sb.mean_final_recovery)} n${pc(sb.draft_recall.nouns)} r${pc(sb.draft_recall.rules)}`.padStart(24)}`);
      logSummary(sb);
      const file = path.join(outDir, `${stamp}${mock ? "-mock" : ""}-context-ab.json`);
      await fs.writeFile(file, JSON.stringify({ arms: { without: { summary: sa, results: armA }, with: { summary: sb, results: armB } }, config: { scoring, theta, lookahead, review, noise: noiseP }, mock, catalog: catalogs.version }, null, 2));
      console.log(`written ${file}`);
    } else {
      const results: SessionMetrics[] = [];
      for (const g of golds) {
        const m = await runGold(engine, g, runOpts);
        results.push(m);
        logGold(g, m);
      }
      const summary = aggregate(results);
      logSummary(summary);
      const file = path.join(outDir, `${stamp}${mock ? "-mock" : ""}.json`);
      await fs.writeFile(file, JSON.stringify({ summary, results, config: { scoring, theta, lookahead, ...(review ? { review } : {}), ...(noiseP ? { noise: noiseP } : {}) }, mock, catalog: catalogs.version }, null, 2));
      console.log(`written ${file}`);
    }
  }
}
