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
import { makeVariants } from "./perturb.js";

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

export async function runGold(engine: Engine, gold: Gold, opts: { idPrefix?: string; judge?: boolean } = {}): Promise<SessionMetrics> {
  const id = `${opts.idPrefix ?? "h"}_${gold.id.replace(/[^a-z0-9]+/gi, "-")}_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const created = await engine.createProject(gold.one_liner, { id });
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
    const a = sim.data;
    let ans;
    if (a.kind === "option" && card.options.some((o) => o.option_id === a.option_id)) ans = await engine.answerCard(id, { kind: "option", option_id: a.option_id, think_ms: 1000 });
    else if (a.kind === "other" && a.text) ans = await engine.answerCard(id, { kind: "other", text: a.text, think_ms: 1500 });
    else ans = await engine.answerCard(id, { kind: "you_decide", think_ms: 800 });
    answers.push({ kind: ans.answer.kind, node: card.node_id, ...(ans.answer.option_id ? { option: ans.answer.option_id } : {}) });
    const st = await engine.getState(id);
    curve.push(recovery(st.sheet, st.session, gold));
    res = ans.next;
  }
  await engine.finishCards(id);
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
    const results: SessionMetrics[] = [];
    for (const g of golds) {
      const m = await runGold(engine, g, { judge });
      results.push(m);
      const sem = m.semantic_draft_recall ? `  ·  JUDGE n${pc(m.semantic_draft_recall.nouns)} r${pc(m.semantic_draft_recall.rules)}` : "";
      console.log(`${g.id.padEnd(30)} cards ${String(m.cards).padStart(2)}  recovery ${pc(m.recovery_curve[0]!)} → ${pc(m.final_recovery)}  stop ${m.stop_reason}  draft recall n${pc(m.draft_recall.nouns)} r${pc(m.draft_recall.rules)}${sem}  asked: ${m.asked_nodes.join(",")}`);
    }
    const summary = aggregate(results);
    console.log(`\nSUMMARY n=${summary.n} · mean cards ${summary.mean_cards.toFixed(1)} · recovery ${pc(summary.mean_initial_recovery)} → ${pc(summary.mean_final_recovery)} · ${REPORT_K.map((k) => `r@${k} ${pc(summary.recovery_at[k] ?? 0)}`).join(" · ")} · AUC ${pc(summary.auc_0_12)} · render p90 ${summary.render_ms_p90}ms · you-decide ${pc(summary.you_decide_rate)} · other ${pc(summary.other_rate)}`);
    console.log(`calibration: ${summary.calibration_bins.map((b) => `${b.bin}: n=${b.n} acc=${pc(b.accuracy)}`).join(" | ")}`);
    const file = path.join(outDir, `${stamp}${mock ? "-mock" : ""}.json`);
    await fs.writeFile(file, JSON.stringify({ summary, results, config: { scoring, theta, lookahead }, mock, catalog: catalogs.version }, null, 2));
    console.log(`written ${file}`);
  }
}
