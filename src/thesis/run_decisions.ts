/**
 * The decision-sensitive experiment: which DESIGN does a coding agent build from a bundle compiled after
 * 0/3/6/12 cards, when the app's truth deviates from the priors? (docs/EVALS.md "curve v2".)
 *
 * The conduct harness (run.ts) measures whether agents respect written constraints — flat in cards, because
 * rules are drafted. THIS harness measures whether agents build the RIGHT design — which should rise with
 * cards exactly where a card corrected a wrong default, stay wrong where the selector never asked, and stay
 * flat on controls. The three cases are reported separately: "cards fixed it downstream", "the selector's
 * blind spot, priced downstream", and "instrument check".
 *
 * The judge is blind two ways: it never sees the arm/bundle, and the two candidate designs are presented in
 * a salt-determined order so "first" carries no information about which is true.
 *
 * CLI: npx tsx src/thesis/run_decisions.ts [--mock] --gold invoicing-bookkeeping-perturbed
 *        [--budgets c0,c3,c6,c12] [--agent-models a,b] [--judge-model j] [--repeats N]
 *        [--concurrency N] [--provider-concurrency N] [--out dir]
 */
import "../env.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { parallelMap, type LLM } from "../llm/client.js";
import { AGENT_SYSTEM, AgentOutSchema, keyedLimiter, readBundle, type AgentOut, type Arm, type NamedModel } from "./run.js";
import { DECISION_PROBE_SETS, type DecisionProbe } from "./decision_probes.js";

// ---------- agent ----------

export async function runDesignAgent(llm: LLM, arm: Arm, oneLiner: string, probe: DecisionProbe, salt: string): Promise<AgentOut> {
  const head = arm.context ? `PROJECT DOCUMENTATION (the current source of truth for this project):\n\n${arm.context}` : `PROJECT: ${oneLiner}`;
  const res = await llm.structured({
    fn: "decision_agent",
    tier: "strong",
    system: AGENT_SYSTEM,
    user: `${head}\n\n---\n\nThe owner says:\n\n"${probe.task}"`,
    schema: AgentOutSchema,
    effort: "medium",
    maxTokens: 1500,
    temperature: 1,
    cacheSalt: salt,
  });
  return res.data;
}

// ---------- blind two-design judge ----------

export const DESIGN_JUDGE_SYSTEM = `You compare a software engineer's proposed design against two candidate design descriptions. You do not know which candidate (if either) is the intended one — report only which one the engineer's design actually matches.

- "first": the design substantively matches the FIRST candidate (its distinguishing choice, not incidental details).
- "second": it substantively matches the SECOND candidate.
- "both": the engineer designs BOTH candidates' behaviours as coexisting options (not merely mentioning one in passing).
- "asks": the engineer does not commit to a design and asks the owner which way to go on exactly this choice.
- "neither": the design is unrelated to the distinguishing choice, or too vague to tell.

Judge only what is written. Return JSON only.`;

export const DesignJudgeOutSchema = z.object({
  match: z.enum(["first", "second", "both", "asks", "neither"]),
  evidence: z.string(),
});
export type DesignJudgeOut = z.infer<typeof DesignJudgeOutSchema>;

/** Deterministic per-salt coin so candidate order carries no signal across the run. */
export function saltCoin(salt: string): boolean {
  let h = 0;
  for (const ch of salt) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return (h & 1) === 1;
}

export async function judgeDesign(llm: LLM, probe: DecisionProbe, out: AgentOut, salt: string): Promise<{ raw: DesignJudgeOut; picked: "default" | "true" | "both" | "asks" | "neither" }> {
  const trueFirst = saltCoin(salt);
  const first = trueFirst ? probe.design_true : probe.design_default;
  const second = trueFirst ? probe.design_default : probe.design_true;
  const res = await llm.structured({
    fn: "decision_judge",
    tier: "strong",
    system: DESIGN_JUDGE_SYSTEM,
    user: `THE OWNER'S REQUEST:\n"${probe.task}"\n\nCANDIDATE DESIGN (FIRST):\n${first}\n\nCANDIDATE DESIGN (SECOND):\n${second}\n\nTHE ENGINEER'S DESIGN:\n${out.reply}\n\nPLAN:\n${out.plan.map((p, i) => `${i + 1}. ${p}`).join("\n")}`,
    schema: DesignJudgeOutSchema,
    effort: "medium",
    maxTokens: 700,
    cacheSalt: salt,
  });
  const m = res.data.match;
  const picked = m === "first" ? (trueFirst ? "true" : "default") : m === "second" ? (trueFirst ? "default" : "true") : m;
  return { raw: res.data, picked };
}

// ---------- trials ----------

export interface DecisionTrial {
  gold: string;
  agent_model: string;
  arm: string;
  probe: string;
  node: string;
  kind: DecisionProbe["kind"];
  repeat: number;
  /** was this node RESOLVED (asked) in the bundle this arm used? read from the bundle's ledger */
  node_resolved_in_bundle: boolean;
  agent: AgentOut;
  judge: DesignJudgeOut;
  picked: "default" | "true" | "both" | "asks" | "neither";
  error?: string;
}

export function decisionTable(trials: DecisionTrial[], arms: string[]): string {
  const ok = trials.filter((t) => !t.error);
  const pc = (x: number) => `${(100 * x).toFixed(0)}%`;
  const L: string[] = [];
  for (const kind of ["flip", "natural", "control"] as const) {
    const rows = ok.filter((t) => t.kind === kind);
    if (!rows.length) continue;
    L.push(
      kind === "control"
        ? `  CONTROL probes — the DEFAULT design IS correct here; expect ~100% default in EVERY arm (instrument check)`
        : `  ${kind.toUpperCase()} probes — share of designs following the TRUTH (vs the stale default)`,
    );
    L.push(`    ${"arm".padEnd(10)} ${"true".padStart(7)} ${"default".padStart(9)} ${"both".padStart(6)} ${"asks".padStart(6)} ${"neither".padStart(8)}`);
    for (const a of arms) {
      const r = rows.filter((t) => t.arm === a);
      if (!r.length) continue;
      const share = (p: DecisionTrial["picked"]) => pc(r.filter((t) => t.picked === p).length / r.length);
      L.push(`    ${a.padEnd(10)} ${share("true").padStart(7)} ${share("default").padStart(9)} ${share("both").padStart(6)} ${share("asks").padStart(6)} ${share("neither").padStart(8)}`);
    }
    L.push("");
  }
  return L.join("\n");
}

// ---------- CLI ----------

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const flag = (n: string) => {
    const i = args.indexOf(n);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const mock = args.includes("--mock");
  const goldId = flag("--gold") ?? "invoicing-bookkeeping-perturbed";
  const budgets = (flag("--budgets") ?? "c0,c3,c6,c12").split(",").map((x) => x.trim()).filter(Boolean);
  const repeats = Number(flag("--repeats") ?? 1);
  const concurrency = Number(flag("--concurrency") ?? 12);
  const providerConcurrency = Number(flag("--provider-concurrency") ?? 3);
  const outDir = flag("--out") ?? "thesis-results";

  const probes = DECISION_PROBE_SETS[goldId];
  if (!probes) throw new Error(`no decision probe set for ${goldId}`);

  const { MockLLM } = await import("../llm/client.js");
  const { decisionMockHandlers } = await import("./mock_fixtures.js");
  const { makeModel, routeFor } = await import("../llm/registry.js");
  const providerOf = (id: string) => routeFor(id)?.provider ?? id;
  const agentIds = (flag("--agent-models") ?? "gpt-4.1").split(",").map((x) => x.trim()).filter(Boolean);
  const judgeId = flag("--judge-model") ?? agentIds[0]!;
  const mockLlm = new MockLLM(decisionMockHandlers);
  const agents: NamedModel[] = agentIds.map((id) => ({ id, llm: mock ? mockLlm : makeModel(id) }));
  const judgeModel: NamedModel = { id: judgeId, llm: mock ? mockLlm : makeModel(judgeId) };

  // arms: none + the bundle at each budget; per-arm, note which probe nodes that bundle RESOLVED
  const arms: (Arm & { resolved: Set<string> })[] = [{ id: "none", description: "one-liner only", context: "", resolved: new Set<string>() }];
  let oneLiner = "an app";
  for (const b of budgets) {
    const dir = `out/thesis/${goldId}/bundle-${b}`;
    const bundle = await readBundle(dir);
    if (!bundle["design-sheet.md"]) throw new Error(`no bundle at ${dir}`);
    oneLiner = /# Design Sheet — (.+)/.exec(bundle["design-sheet.md"]!)?.[1]?.trim() ?? oneLiner;
    const sheetJson = JSON.parse(await fs.readFile(path.join(dir, "design-sheet.json"), "utf8")) as { decisions: { id: string; status: string }[] };
    const resolved = new Set(sheetJson.decisions.filter((d) => d.status === "resolved").map((d) => d.id));
    arms.push({ id: b, description: `bundle after ${b.replace("c", "")} cards`, context: [bundle["AGENTS.md"], bundle["design-sheet.md"], bundle["spec.md"]].filter(Boolean).join("\n\n---\n\n"), resolved });
  }

  console.log(`DECISION-SENSITIVE PROBES · ${goldId} · ${probes.length} probes × ${arms.length} arms × ${agents.length} agents × ${repeats} = ${probes.length * arms.length * agents.length * repeats} trials`);
  console.log(`judge: ${judgeModel.id}${agents.some((a) => a.id === judgeModel.id) ? "  ⚠ also an agent" : "  (independent)"}`);
  for (const a of arms.slice(1)) console.log(`  ${a.id}: probe nodes resolved by its cards: ${probes.filter((p) => a.resolved.has(p.node)).map((p) => p.node).join(", ") || "(none)"}`);
  console.log("");

  const limit = keyedLimiter(providerConcurrency);
  const jobs: { agent: NamedModel; arm: (typeof arms)[number]; probe: DecisionProbe; repeat: number }[] = [];
  for (let r = 0; r < repeats; r++) for (const agent of agents) for (const arm of arms) for (const probe of probes) jobs.push({ agent, arm, probe, repeat: r });
  let done = 0;
  const t0 = Date.now();
  const trials: DecisionTrial[] = await parallelMap(jobs, concurrency, async ({ agent: am, arm, probe, repeat }) => {
    const salt = `dec:${goldId}:${am.id}:${arm.id}:${probe.id}:${repeat}`;
    const base = { gold: goldId, agent_model: am.id, arm: arm.id, probe: probe.id, node: probe.node, kind: probe.kind, repeat, node_resolved_in_bundle: arm.resolved.has(probe.node) };
    try {
      const agent = await limit(providerOf(am.id), () => runDesignAgent(am.llm, arm, oneLiner, probe, salt));
      const j = await limit(providerOf(judgeModel.id), () => judgeDesign(judgeModel.llm, probe, agent, salt));
      done += 1;
      console.log(`  [${done}/${jobs.length}] ${am.id.padEnd(18)} ${arm.id.padEnd(5)} ${probe.id.padEnd(11)} → ${j.picked}`);
      return { ...base, agent, judge: j.raw, picked: j.picked };
    } catch (e) {
      done += 1;
      console.log(`  [${done}/${jobs.length}] ${am.id.padEnd(18)} ${arm.id.padEnd(5)} ${probe.id.padEnd(11)} ERROR ${(e as Error).message.slice(0, 70)}`);
      return { ...base, agent: { reply: "", plan: [] }, judge: { match: "neither" as const, evidence: "" }, picked: "neither" as const, error: (e as Error).message.slice(0, 200) };
    }
  });

  console.log(`\nRESULTS (${((Date.now() - t0) / 1000).toFixed(0)}s)\n`);
  console.log(decisionTable(trials, arms.map((a) => a.id)));
  await fs.mkdir(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(outDir, `${stamp}-decisions${mock ? "-mock" : ""}.json`);
  await fs.writeFile(file, JSON.stringify({ gold: goldId, budgets, repeats, agent_models: agentIds, judge_model: judgeId, arms: arms.map((a) => ({ id: a.id, context_chars: a.context.length, resolved: [...a.resolved] })), trials }, null, 2));
  console.log(`written ${file}`);
}
