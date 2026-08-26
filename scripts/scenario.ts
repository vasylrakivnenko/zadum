/**
 * End-to-end scenario replay: a one-liner plus a scripted set of answers, driven through the real engine to a
 * compiled spec, then graded by every gate the product has.
 *
 * Why this exists rather than another harness arm: `src/harness/run.ts` measures *decision recovery* against a
 * gold Sheet — did we settle the right options — which is the selector's problem. It says nothing about whether
 * the compiled document is any good, and the two came apart badly. ADR-039 records a live run where the
 * critic returned `pass, score 10, zero violations` on a spec containing six contradictions between Rules the
 * spec itself calls inviolable, while its one mechanical signal reported `rules recall 0.2` when the true
 * value was 1.0. Recovery was fine. The artifact was not.
 *
 * So this script grades the ARTIFACT, and it deliberately reports several independent judgements side by side
 * rather than one number:
 *
 *   deterministic   `spec_checks` · `spec_ir` · round-trip recall · ledger conflicts · `blockingReasons`
 *                   — these cannot be talked out of a finding, which is exactly why ADR-039 moved the gate
 *                   here from the critic.
 *   the critic      the LLM's own verdict, kept because it catches things no checker encodes — but never
 *                   trusted alone again.
 *   an outside judge a second model reading the spec cold against a rubric (`--judge <model>`), which is the
 *                   closest thing available to "would a professional requirements engineer sign this off".
 *
 * Replaying a REAL session's answers is the point of `--answers`. Anything auto-answered from our own belief
 * grades the pipeline against its own guess, which is the one comparison guaranteed to look good.
 *
 *   npx tsx scripts/scenario.ts --scenario scenarios/excel-financials.json --model claude-opus-4-8 --yes-spend
 *   npx tsx scripts/scenario.ts --scenario <file> --mock            # free, exercises the plumbing
 */
import "../src/env.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { helpRequested, parseFlags, UsageError } from "../src/cli/flags.js";
import { buildEngine } from "../src/engine/bootstrap.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..");

export const ScenarioSchema = z.object({
  id: z.string().min(1),
  one_liner: z.string().min(1),
  /** what the owner would say if asked to correct the draft, applied via `applyUserEdit` before cards */
  edits: z.array(z.string()).default([]),
  /** node id -> option id. Replayed when that node is dealt; unmatched cards fall back to the argmax. */
  answers: z.record(z.string(), z.string()).default({}),
  /** node id -> option id, applied in the defaults review (an owner correcting a guess) */
  overrides: z.record(z.string(), z.string()).default({}),
  notes: z.string().default(""),
});
export type Scenario = z.infer<typeof ScenarioSchema>;

const USAGE = `scenario — replay a one-liner + scripted answers to a compiled spec, then grade it

  npx tsx scripts/scenario.ts --scenario <file.json> [--model <id>] [--judge <id>]
      [--data-dir <dir>] [--out <dir>] [--mock] [--yes-spend]`;

const FLAGS = { value: ["--scenario", "--model", "--judge", "--data-dir", "--out", "--stop-floor", "--theta", "--tag"], boolean: ["--mock", "--yes-spend", "--contrarian", "--evidence"] } as const;

const argv = process.argv.slice(2);
if (helpRequested(argv)) {
  console.log(USAGE);
  process.exit(0);
}
let flags;
try {
  flags = parseFlags(argv, FLAGS);
} catch (e) {
  console.error(`${(e as Error).message}\n\n${USAGE}`);
  process.exit(2);
}
const scenarioFile = flags.value("--scenario");
if (!scenarioFile) throw new UsageError("--scenario <file.json> is required");
const mock = flags.has("--mock");
if (!mock && !flags.has("--yes-spend")) {
  console.error(`a live scenario run is blocked without --yes-spend\n\n${USAGE}`);
  process.exit(2);
}
const model = flags.value("--model", "claude-opus-4-8");
const judgeModel = flags.value("--judge");
const dataDir = flags.value("--data-dir", path.join(ROOT, ".zadum-scenario"));
const out = flags.value("--out", path.join(ROOT, "scenario-results"));
/**
 * `--stop-floor` is the arm that matters. ADR-039 built `relativeStopFloor` — "keep asking while the next
 * question is still large NEXT TO THE ONES THIS SESSION ALREADY ASKED" — evidenced it on mock, and shipped it
 * at 0 (inert) because "mock beliefs are far less concentrated than live ones", leaving the number for a live
 * sweep to settle. This flag is how a live arm gets run.
 */
const stopFloor = flags.value("--stop-floor");
/**
 * `--contrarian` is the arm for the failure this script actually found. Three live Opus runs of the same
 * one-liner stopped the card loop after 1, 2 and 2 cards with "converged", against Rule 7's budget of 12 —
 * so 35 of 36 decisions were defaulted from priors and the product asked almost nothing. That is the
 * concentrated-belief blind spot `contrarianSampling` was built for (`EngineOptions.contrarianSampling`:
 * "the last sampler batch is prompted to stake out coherent minority positions"), shipped OFF pending
 * exactly this live A/B. Note `relativeStopFloor` cannot rescue a 1-card session — `relativeFloor` is
 * deliberately inert below two cards, because one card is not a scale.
 */
const contrarian = flags.has("--contrarian");
const theta = flags.value("--theta");
const tag = flags.value("--tag", contrarian ? "contrarian" : stopFloor ? `floor${stopFloor}` : "baseline");

const scenario = ScenarioSchema.parse(JSON.parse(await fs.readFile(scenarioFile, "utf8")));
if (!mock) process.env.ZADUM_MODEL = model;

console.log(`scenario ${scenario.id} · ${mock ? "MOCK" : model}`);
console.log(`  "${scenario.one_liner}"`);
console.log(`  ${Object.keys(scenario.answers).length} scripted answers · ${Object.keys(scenario.overrides).length} overrides · ${scenario.edits.length} edits\n`);

const started = Date.now();
const engineConfig: Record<string, number> = {};
if (stopFloor !== undefined) engineConfig.relativeStopFloor = Number(stopFloor);
if (theta !== undefined) engineConfig.theta = Number(theta);
const engineOpts: Record<string, unknown> = {};
if (Object.keys(engineConfig).length) engineOpts.config = engineConfig;
if (contrarian) engineOpts.contrarianSampling = true;
if (flags.has("--evidence")) engineOpts.evidenceOnContext = true;
const { engine } = await buildEngine({ mock, dataDir, ...(Object.keys(engineOpts).length ? { engine: engineOpts as never } : {}) });
if (Object.keys(engineOpts).length) console.log(`engine opts: ${JSON.stringify(engineOpts)}`);

// ---------------------------------------------------------------------------
// 1. draft
// ---------------------------------------------------------------------------
const created = await engine.createProject(scenario.one_liner);
const id = created.project.id;
console.log(`draft: ${id} · v${created.sheet.version} · ${created.sheet.decisions.length} decisions · ${((Date.now() - started) / 1000).toFixed(0)}s`);

for (const text of scenario.edits) {
  const res = await engine.applyUserEdit(id, text);
  console.log(`edit: "${text.slice(0, 60)}" → v${res.sheet.version}, ${res.applied.length} ops, ${res.rejected.length} rejected`);
}

// ---------------------------------------------------------------------------
// 2. cards — replay the scripted answers
// ---------------------------------------------------------------------------
const asked: { node: string; chosen: string; scripted: boolean; value?: number }[] = [];
let stopReason = "";
let deal = await engine.startCards(id);
// Rule 7 caps the session at 12 cards; the loop trusts the engine's own stop rather than counting itself.
for (let guard = 0; guard < 20; guard++) {
  if (deal.kind !== "card") {
    stopReason = deal.reason;
    console.log(`cards stopped after ${asked.length}: ${deal.reason}`);
    break;
  }
  const card = deal.card;
  const scripted = scenario.answers[card.node_id];
  const valid = !!scripted && card.options.some((o) => o.option_id === scripted);
  // Fall back to the card's first option (the belief argmax) only when the scenario has nothing to say.
  const chosen = valid ? scripted! : card.options[0]!.option_id;
  const res = await engine.answerCard(id, { kind: "option", option_id: chosen });
  asked.push({ node: card.node_id, chosen, scripted: valid });
  console.log(`  card ${asked.length}: ${card.node_id} = ${chosen}${valid ? " (scripted)" : " (argmax)"}`);
  deal = res.next;
}

// ---------------------------------------------------------------------------
// 3. defaults review — replay the owner's corrections
// ---------------------------------------------------------------------------
const overridden: string[] = [];
for (const [node, option] of Object.entries(scenario.overrides)) {
  try {
    await engine.overrideDefault(id, node, option);
    overridden.push(`${node}=${option}`);
  } catch (e) {
    console.log(`  override ${node}=${option} rejected: ${(e as Error).message}`);
  }
}
if (overridden.length) console.log(`overrides applied: ${overridden.join(", ")}`);
await engine.acceptDefaults(id);

// ---------------------------------------------------------------------------
// 4. compile
// ---------------------------------------------------------------------------
console.log(`\ncompiling…`);
const { compileProject } = await import("../src/engine/compile.js");
const compiled = await compileProject(engine, id, { outDir: path.join(out, `${scenario.id}-${tag}`) });
const critic = compiled.critic;
const roundtrip = compiled.roundtrip;
const irFindings = compiled.ir_findings ?? [];
const specChecks = compiled.spec_findings ?? [];
const ledger = compiled.ledger_findings ?? [];
const blocking = compiled.blocking ?? [];

const sev = (fs: { severity?: string }[]) => {
  const by: Record<string, number> = {};
  for (const f of fs) by[f.severity ?? "?"] = (by[f.severity ?? "?"] ?? 0) + 1;
  return Object.entries(by).map(([k, v]) => `${k} ${v}`).join(" · ") || "none";
};

console.log(`\n── deterministic gates (the ADR-039 gate: these cannot be talked out of a finding) ──`);
console.log(`  spec_checks findings   ${specChecks.length}  (${sev(specChecks)})`);
console.log(`  spec_ir findings       ${irFindings.length}  (${sev(irFindings)})`);
console.log(`  ledger findings        ${ledger.length}  (${sev(ledger)})`);
console.log(`  round-trip recall      ${roundtrip?.recall ? Object.entries(roundtrip.recall).map(([k, v]) => `${k} ${typeof v === "number" ? v.toFixed(2) : v}`).join(" · ") : "n/a"}`);
console.log(`  round-trip extra       ${roundtrip?.extra?.length ?? "n/a"}`);
console.log(`  blocking reasons       ${blocking.length}${blocking.length ? `\n    ${blocking.join("\n    ")}` : " (deliverable)"}`);
console.log(`── the critic (never trusted alone, ADR-039) ──`);
console.log(`  verdict ${critic?.verdict ?? "?"} · score ${critic?.score ?? "?"} · ${critic?.violations?.length ?? 0} violations · ${critic?.omissions?.length ?? 0} omissions`);
for (const f of specChecks.slice(0, 10)) console.log(`    spec_check: [${f.severity}] ${f.code} — ${String(f.message ?? "").slice(0, 120)}`);
for (const f of ledger.slice(0, 6)) console.log(`    ledger:     [${f.severity}] ${f.code} — ${String(f.message ?? "").slice(0, 120)}`);

// Did the answers the owner actually gave reach the document? This is the ADR-039 defect, checked directly.
const state = await engine.getState(id);
const sheet = state?.sheet ?? null;
const specPath = path.join(out, `${scenario.id}-${tag}`, "spec.md");
void compiled.spec;
const specText = await fs.readFile(specPath, "utf8").catch(() => "");
const answeredNodes = asked.filter((a) => a.scripted).map((a) => a.node);
const missing: string[] = [];
for (const node of [...answeredNodes, ...Object.keys(scenario.overrides)]) {
  const d = sheet?.decisions.find((x) => x.id === node);
  if (!d?.chosen) continue;
  const label = d.options.find((o) => o.id === d.chosen)?.label ?? d.chosen;
  // A deliberate answer should be traceable in the body, not just in the appendix ledger.
  const body = specText.split("## Decision ledger")[0] ?? specText;
  const words = label.toLowerCase().split(/\W+/).filter((w) => w.length > 4);
  const hit = words.length ? words.some((w) => body.toLowerCase().includes(w)) : body.toLowerCase().includes(d.chosen.toLowerCase());
  if (!hit) missing.push(`${node}=${d.chosen} ("${label}")`);
}
console.log(`── did the owner's own answers reach the spec body? ──`);
console.log(`  ${answeredNodes.length + Object.keys(scenario.overrides).length} deliberate decisions · ${missing.length} not traceable in the body`);
for (const m of missing) console.log(`    ✗ ${m}`);

// ---------------------------------------------------------------------------
// 5. outside judge
// ---------------------------------------------------------------------------
let judgement: unknown = null;
if (judgeModel && !mock && specText) {
  const { makeModel } = await import("../src/llm/registry.js");
  const judge = makeModel(judgeModel);
  const JudgeSchema = z.object({
    verdict: z.enum(["would_sign_off", "needs_work", "not_acceptable"]),
    score_out_of_10: z.number(),
    contradictions: z.array(z.string()),
    unbuildable_requirements: z.array(z.string()),
    missing_for_a_builder: z.array(z.string()),
    strongest_aspect: z.string(),
    weakest_aspect: z.string(),
    one_change_with_most_impact: z.string(),
  });
  const SYSTEM = `You are a senior requirements engineer reviewing a specification a small business will hand to a contractor to build from. Judge it as a professional deliverable, not as an AI output.

Be concrete and severe about the things that cost real money:
- CONTRADICTIONS between stated rules, or between a rule and a described behaviour. Quote both sides.
- Requirements a competent builder could not act on without guessing (undefined terms, missing quantities, "etc.", unstated defaults).
- Things a builder would have to ask about before starting — each of those is a question the elicitation process should have asked and did not.

Do not praise structure or completeness of formatting. A tidy document that contradicts itself is worse than a rough one that does not. Quote evidence for every claim.`;
  const res = await judge.structured({
    fn: "spec_judge",
    tier: "strong",
    system: SYSTEM,
    user: `Specification under review:\n\n${specText.slice(0, 120_000)}`,
    schema: JudgeSchema,
    effort: "high",
    maxTokens: 8000,
  });
  judgement = res.data;
  const j = res.data;
  console.log(`\n── outside judge (${judgeModel}) ──`);
  console.log(`  verdict: ${j.verdict} · ${j.score_out_of_10}/10`);
  console.log(`  contradictions (${j.contradictions.length}):`);
  for (const c of j.contradictions.slice(0, 8)) console.log(`    • ${c}`);
  console.log(`  unbuildable (${j.unbuildable_requirements.length}):`);
  for (const c of j.unbuildable_requirements.slice(0, 8)) console.log(`    • ${c}`);
  console.log(`  a builder would still have to ask (${j.missing_for_a_builder.length}):`);
  for (const c of j.missing_for_a_builder.slice(0, 8)) console.log(`    • ${c}`);
  console.log(`  strongest: ${j.strongest_aspect}`);
  console.log(`  weakest:   ${j.weakest_aspect}`);
  console.log(`  highest-impact change: ${j.one_change_with_most_impact}`);
}

// ---------------------------------------------------------------------------

await fs.mkdir(out, { recursive: true });
const summary = {
  scenario: scenario.id,
  tag,
  selector_config: engineConfig,
  contrarian,
  project_id: id,
  model: mock ? "mock" : model,
  judge_model: judgeModel ?? null,
  elapsed_s: Math.round((Date.now() - started) / 1000),
  cards_asked: asked,
  stop_reason: stopReason,
  overrides_applied: overridden,
  sheet: sheet ? { version: sheet.version, decisions: sheet.decisions.length, rules: sheet.rules.length, actors: sheet.actors.length, nouns: sheet.nouns.length, actions: sheet.actions.length } : null,
  gates: {
    spec_checks: specChecks,
    spec_ir: irFindings,
    ledger_findings: ledger,
    roundtrip_recall: roundtrip?.recall ?? null,
    roundtrip_extra: roundtrip?.extra?.length ?? null,
    blocking_reasons: blocking,
    critic: critic ?? null,
  },
  deliberate_decisions_missing_from_body: missing,
  judgement,
  spec_chars: specText.length,
};
const file = path.join(out, `${scenario.id}-${tag}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
await fs.writeFile(file, `${JSON.stringify(summary, null, 2)}\n`);
console.log(`\nwritten ${file}`);
console.log(`spec: ${specPath} (${specText.length} chars) · ${((Date.now() - started) / 1000).toFixed(0)}s total`);
