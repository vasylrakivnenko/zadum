/**
 * Standalone mock experiment: how many wrong defaults does ONE verification interaction catch, vs one card?
 *
 * VERIFICATION MODE (src/core/verify.ts): instead of asking "which option?", show a scenario bundling
 * several defaulted decisions at their argmax values and ask "does anything here read wrong?" — adaptive
 * group testing tuned so P(all correct) ≈ 0.5. This harness measures that mechanism WITHOUT touching the
 * engine loop: it builds a mock engine exactly like src/harness/run.ts, runs a session to an endpoint
 * (0 cards = pure-defaults regime, or the normal card loop), then simulates B verification interactions
 * against the gold truth on COPIES of the ledger and worlds:
 *
 *   - probe accepted  ⇔ every bundled argmax equals the gold truth (perfect sim reviewer);
 *   - on rejection the sim user corrects exactly ONE bundled wrong node — the highest-effective-consequence
 *     one (the UI will elicit which) — applied to the ledger copy, plus `reweightOnVerify(ok=false)` on the
 *     worlds copy; acceptance applies `reweightOnVerify(ok=true)` and confirms the shown values into the
 *     ledger copy (the scenario shown IS what would ship);
 *   - probes are recomposed after every interaction (adaptive), so later probes reflect what was learned.
 *
 * Honest scope notes: the sim reviewer is perfect (accepts/rejects with certainty), so numbers are a
 * mechanism ceiling like the harness's `--catch-prob 1` reviewer; the elicited correction itself is NOT
 * soft-conditioned into the worlds copy (only the bundle-level reweight is applied — exactly the two
 * operations the mechanism defines); mock beliefs are known-miscalibrated, so compare against the mock
 * review baseline (EVALS "simulated defaults reviewer": perfect reviewer at depth 8 nets ~31%), not live.
 *
 * CLI: npx tsx src/harness/verify_eval.ts --mock [--budget B] [--cards 0|normal|both] [--gold <dir|file>]
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Engine } from "../engine/orchestrator.js";
import { composeVerifyProbes, reweightOnVerify, type VerifyProbe } from "../core/verify.js";
import { distribution, maxOption, type Belief, type World } from "../core/worlds.js";
import { loadGolds, truthText, type Gold } from "./run.js";

export type CardsRegime = "0" | "normal";

export interface VerifyInteraction {
  probe_id: string;
  size: number;
  p_all_correct: number;
  expected_bits: number;
  /** surprisal of the observed outcome under the probe's own p (+ log2(size) localization on rejection) — same heuristic units as expected_bits */
  realized_bits: number;
  ok: boolean;
  corrected?: string;
}

export interface VerifyEvalMetrics {
  gold_id: string;
  regime: CardsRegime;
  cards: number;
  /** defaulted decisions with a gold truth (the verifiable candidate pool) */
  verifiable: number;
  wrong_before: number;
  interactions: number;
  accepts: number;
  rejections: number;
  /** wrong ledger defaults fixed by the B interactions (corrections + accepted argmax flips) */
  catches: number;
  wrong_after: number;
  /** catches / wrong_before (absent when wrong_before = 0) */
  catch_rate?: number;
  catches_per_interaction: number;
  mean_p_all_correct: number;
  mean_expected_bits: number;
  mean_realized_bits: number;
  /** still-wrong ledger entries whose CURRENT worlds-argmax now equals gold — a re-default pass would fix these too */
  belief_flips_after: number;
  trace: VerifyInteraction[];
}

const clamp = (p: number) => Math.min(1 - 1e-9, Math.max(1e-9, p));
const log2 = Math.log2;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * Pure core of the experiment: B adaptive verification interactions over copies of (worlds, ledger).
 * Exported for tests; deterministic given its inputs.
 */
export function simulateVerification(input: {
  belief: Belief;
  /** worlds copy to reweight; defaults to belief.worlds (reweightOnVerify never mutates its input) */
  worlds?: World[];
  /** current defaulted value per candidate node (a COPY of the ledger — never the engine's) */
  ledger: Map<string, string>;
  goldDecisions: Record<string, string>;
  candidateIds: string[];
  budget: number;
  epsilon: number;
  consequenceOverride?: Record<string, number>;
}): { ledger: Map<string, string>; worlds: World[]; trace: VerifyInteraction[] } {
  const { belief, goldDecisions, budget, epsilon, consequenceOverride } = input;
  const ledger = new Map(input.ledger);
  let worlds = input.worlds ?? belief.worlds;
  const settled = new Set<string>();
  const trace: VerifyInteraction[] = [];
  const effC = (id: string) => consequenceOverride?.[id] ?? belief.nodes.find((n) => n.id === id)?.consequence ?? 0;

  for (let b = 0; b < budget; b++) {
    const remaining = input.candidateIds.filter((id) => !settled.has(id));
    const probes: VerifyProbe[] = composeVerifyProbes({ ...belief, worlds }, remaining, { consequenceOverride, chosen: Object.fromEntries(ledger) });
    if (!probes.length) break;
    const probe = probes[0]!;
    const ok = probe.nodes.every((n) => goldDecisions[n.id] === n.option);
    const realized = ok ? -log2(clamp(probe.p_all_correct)) : -log2(clamp(1 - probe.p_all_correct)) + log2(probe.nodes.length);
    let corrected: string | undefined;
    if (ok) {
      for (const n of probe.nodes) {
        ledger.set(n.id, n.option); // confirm the shown scenario (all values equal gold here by construction)
        settled.add(n.id);
      }
      worlds = reweightOnVerify(worlds, probe.nodes, true, epsilon);
    } else {
      const wrong = probe.nodes.filter((n) => goldDecisions[n.id] !== n.option);
      const fix = wrong.sort((a, b) => effC(b.id) - effC(a.id) || a.id.localeCompare(b.id))[0]!;
      ledger.set(fix.id, goldDecisions[fix.id]!);
      settled.add(fix.id);
      corrected = fix.id;
      worlds = reweightOnVerify(worlds, probe.nodes, false, epsilon);
    }
    trace.push({
      probe_id: probe.id,
      size: probe.nodes.length,
      p_all_correct: probe.p_all_correct,
      expected_bits: probe.expected_bits,
      realized_bits: realized,
      ok,
      ...(corrected ? { corrected } : {}),
    });
  }
  return { ledger, worlds, trace };
}

/** Run one gold to an endpoint (0 cards or the normal card loop), then measure B verification interactions. */
export async function verifyEvalOnGold(
  engine: Engine,
  gold: Gold,
  opts: { regime: CardsRegime; budget?: number; idPrefix?: string } ,
): Promise<VerifyEvalMetrics> {
  const budget = opts.budget ?? 4;
  const id = `${opts.idPrefix ?? "ve"}_${opts.regime}_${gold.id.replace(/[^a-z0-9]+/gi, "-")}`;
  await engine.createProject(gold.one_liner, { id, origin: "experiment" });

  if (opts.regime === "normal") {
    // same card-loop pattern as runGold (src/harness/run.ts), minus its optional instrumentation
    let res = await engine.startCards(id);
    let guard = 0;
    while (res.kind === "card" && guard++ < 20) {
      const card = res.card;
      const sim = await engine.fns.simUser({ card, persona: gold.persona, truth: truthText(gold) });
      const a = sim.data;
      let ans;
      if (a.kind === "option" && card.options.some((o) => o.option_id === a.option_id)) ans = await engine.answerCard(id, { kind: "option", option_id: a.option_id, think_ms: 1000 });
      else if (a.kind === "other" && a.text) ans = await engine.answerCard(id, { kind: "other", text: a.text, think_ms: 1500 });
      else ans = await engine.answerCard(id, { kind: "you_decide", think_ms: 800 });
      res = ans.next;
    }
  }

  const defaults = await engine.finishCards(id); // 0-card regime: defaults everything straight from the belief
  const st = await engine.getState(id);
  const session = st.session;

  // Verifiable pool: belief-defaulted decisions with a gold truth. Implied/delegated/resolved decisions are
  // not belief defaults; nodes without a gold truth can't be judged by the sim reviewer.
  const candidates = defaults.filter((d) => d.status === "defaulted" && gold.decisions[d.id] !== undefined);
  const candidateIds = candidates.map((d) => d.id);
  const ledger = new Map(candidates.map((d) => [d.id, d.chosen]));
  const wrongIn = (l: Map<string, string>) => candidateIds.filter((n) => l.get(n) !== gold.decisions[n]).length;
  const wrong_before = wrongIn(ledger);

  const out = simulateVerification({
    belief: session.belief,
    ledger,
    goldDecisions: gold.decisions,
    candidateIds,
    budget,
    epsilon: session.config.epsilon,
    consequenceOverride: session.consequence_override,
  });

  const wrong_after = wrongIn(out.ledger);
  const catches = wrong_before - wrong_after;
  const finalBelief: Belief = { ...session.belief, worlds: out.worlds };
  const belief_flips_after = candidateIds.filter((n) => out.ledger.get(n) !== gold.decisions[n] && maxOption(distribution(finalBelief, n)).option === gold.decisions[n]).length;
  const interactions = out.trace.length;
  return {
    gold_id: gold.id,
    regime: opts.regime,
    cards: st.session.cards.length,
    verifiable: candidateIds.length,
    wrong_before,
    interactions,
    accepts: out.trace.filter((t) => t.ok).length,
    rejections: out.trace.filter((t) => !t.ok).length,
    catches,
    wrong_after,
    ...(wrong_before ? { catch_rate: catches / wrong_before } : {}),
    catches_per_interaction: interactions ? catches / interactions : 0,
    mean_p_all_correct: mean(out.trace.map((t) => t.p_all_correct)),
    mean_expected_bits: mean(out.trace.map((t) => t.expected_bits)),
    mean_realized_bits: mean(out.trace.map((t) => t.realized_bits)),
    belief_flips_after,
    trace: out.trace,
  };
}

export function verifyEvalTable(rows: VerifyEvalMetrics[]): string {
  const pc = (x: number) => `${(x * 100).toFixed(0)}%`;
  const L: string[] = [];
  L.push(`  ${"gold".padEnd(30)} ${"regime".padEnd(7)} ${"cards".padStart(5)} ${"verif".padStart(5)} ${"wrong".padStart(5)} ${"iact".padStart(4)} ${"acc/rej".padStart(7)} ${"catch".padStart(5)} ${"c/iact".padStart(6)} ${"rate".padStart(5)} ${"p(all)".padStart(7)} ${"bits e/r".padStart(9)} ${"flips".padStart(5)}`);
  for (const m of rows)
    L.push(
      `  ${m.gold_id.padEnd(30)} ${(m.regime === "0" ? "c0" : "cards").padEnd(7)} ${String(m.cards).padStart(5)} ${String(m.verifiable).padStart(5)} ${String(m.wrong_before).padStart(5)} ${String(m.interactions).padStart(4)} ${`${m.accepts}/${m.rejections}`.padStart(7)} ${String(m.catches).padStart(5)} ${m.catches_per_interaction.toFixed(2).padStart(6)} ${(m.catch_rate !== undefined ? pc(m.catch_rate) : "—").padStart(5)} ${m.mean_p_all_correct.toFixed(2).padStart(7)} ${`${m.mean_expected_bits.toFixed(1)}/${m.mean_realized_bits.toFixed(1)}`.padStart(9)} ${String(m.belief_flips_after).padStart(5)}`,
    );
  return L.join("\n");
}

// ---------- CLI ----------
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const flag = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  if (!args.includes("--mock")) console.log("note: verify_eval runs mock-only (no live LLM path); proceeding with --mock behaviour");
  const budget = Number(flag("--budget") ?? 4);
  const cardsFlag = flag("--cards") ?? "both";
  const regimes: CardsRegime[] = cardsFlag === "0" ? ["0"] : cardsFlag === "normal" ? ["normal"] : ["0", "normal"];
  const goldPath = flag("--gold") ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "gold");

  const { buildEngine } = await import("../engine/bootstrap.js");
  const { MemoryStore } = await import("../store/file_store.js");
  const golds: Gold[] = await loadGolds(goldPath);

  const rows: VerifyEvalMetrics[] = [];
  for (const regime of regimes) {
    for (const g of golds) {
      // fresh engine + store per session: the MockLLM call counter is per-instance state (see run.ts)
      const { engine } = await buildEngine({ mock: true, cache: false, store: new MemoryStore(), engine: { precompute: false } });
      rows.push(await verifyEvalOnGold(engine, g, { regime, budget }));
    }
  }
  console.log(`VERIFICATION-MODE EVAL (mock, budget ${budget}) — one probe = one interaction; sim reviewer answers from gold truth`);
  console.log(verifyEvalTable(rows));
  const agg = (rs: VerifyEvalMetrics[]) => {
    const wrong = rs.reduce((a, m) => a + m.wrong_before, 0);
    const catches = rs.reduce((a, m) => a + m.catches, 0);
    const iact = rs.reduce((a, m) => a + m.interactions, 0);
    return { wrong, catches, iact, rate: wrong ? catches / wrong : 0, per: iact ? catches / iact : 0 };
  };
  for (const regime of regimes) {
    const a = agg(rows.filter((r) => r.regime === regime));
    console.log(
      `POOLED ${regime === "0" ? "0-cards" : "post-cards"}: ${a.catches}/${a.wrong} wrong defaults caught (${(a.rate * 100).toFixed(0)}%) in ${a.iact} interactions → ${a.per.toFixed(2)} catches/interaction`,
    );
  }
  console.log(`baseline (docs/EVALS.md, same mock setup): perfect review reads its top-8 riskiest defaults → nets ~31% of wrong defaults for ~8 items scanned`);
}
