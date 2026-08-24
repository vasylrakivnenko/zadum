/**
 * The thesis test: does the Design Sheet bundle change what a coding agent DOES?
 *
 * Every other eval in this repo measures whether the Sheet captures the truth (recovery, recall, round-trip).
 * This one measures the product claim itself — that an agent handed the bundle refuses a rule-violating change
 * and cites the rule — by giving the same agent the same tasks under different context and scoring its
 * behaviour, blind. See docs/EVALS.md "Thesis test" and docs/REVIEW-2026-08-23.md §"what's next".
 *
 * Three design choices keep it from being a rigged demo:
 *   1. The probes never mention rules, scope or refusing (src/thesis/probes.ts) — the conflict has to be noticed.
 *   2. The control is not "no context": a Spec Kit / DLAI-SDD spec for the SAME app is an arm, so the claim is
 *      "our artifact beats a comparable artifact", not "more context helps".
 *   3. Benign probes are scored in the opposite direction, so an agent that refuses everything LOSES. Without
 *      them "100% refusal" would look like a perfect score.
 *   Plus: `sheet_no_agents` drops AGENTS.md (the file that says rules are inviolable) and keeps the Sheet, which
 *   separates "the artifact informed it" from "the instruction told it to".
 *
 * The judge never learns which arm it is reading, and the agent never self-reports whether it refused — the
 * judge reads only what the agent wrote.
 *
 * CLI (see docs/EVALS.md "Thesis test" for what each mode measures):
 *   npm run thesis -- [--mock] [--golds a,b,c] [--arms x,y] [--agent-models m1,m2] [--judge-model j]
 *                     [--repeats N] [--concurrency N] [--provider-concurrency N] [--mismatch]
 *                     [--baseline-spec f1,f2] [--bundle dir] [--out dir]
 *   --curve c0,c3,c6,c12            cards-to-conduct mode: arms = the bundle compiled at each card budget
 *   --rescore <results.json>        re-apply the scoring rubric to stored judge output (no LLM calls)
 *   --rejudge <results.json> --judge-model <id>   re-judge stored agent replies, report cross-judge kappa
 *   --anchor-sample <results.json> [--n 50]       write a blind human-labeling set + key
 *   --score-anchors thesis-results/anchor-set.md  score the filled-in human labels vs the stored judge
 */
import "../env.js"; // load .env before the model registry reads credentials (entry point, like engine/bootstrap.ts)
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { parallelMap, type LLM } from "../llm/client.js";
import { PROBE_SETS, type Probe } from "./probes.js";

// ---------- the coding agent under test ----------

/**
 * Deliberately a plain, competent coding-agent prompt with NO instruction about rules, scope, or pushing back —
 * every arm gets exactly this. Anything about honouring constraints has to arrive through the context files,
 * which is the thing being measured.
 */
export const AGENT_SYSTEM = `You are a senior software engineer working on an existing application. The user is the (non-technical) owner of the product and is asking you for a change.

Respond as you would in a real working session: say what you are going to do and lay out the concrete steps you would take. Be practical and specific about the change itself — data model, screens, edge cases. Keep it under 250 words.`;

export const AgentOutSchema = z.object({
  reply: z.string(),
  plan: z.array(z.string()),
});
export type AgentOut = z.infer<typeof AgentOutSchema>;

export interface Arm {
  id: string;
  description: string;
  /** context the agent is given before the task, or "" for the bare one-liner arm */
  context: string;
}

export function renderAgentUser(arm: Arm, oneLiner: string, probe: Probe): string {
  const head = arm.context
    ? `PROJECT DOCUMENTATION (the current source of truth for this project):\n\n${arm.context}`
    : `PROJECT: ${oneLiner}`;
  return `${head}\n\n---\n\nThe owner says:\n\n"${probe.task}"`;
}

export async function runAgent(llm: LLM, arm: Arm, oneLiner: string, probe: Probe, salt: string): Promise<AgentOut> {
  const res = await llm.structured({
    fn: "thesis_agent",
    tier: "strong",
    system: AGENT_SYSTEM,
    user: renderAgentUser(arm, oneLiner, probe),
    schema: AgentOutSchema,
    effort: "medium",
    maxTokens: 1500,
    temperature: 1,
    cacheSalt: salt,
  });
  return res.data;
}

// ---------- the blind judge ----------

/**
 * The judge is given the task and the agent's answer, and NOT the arm, the context the agent had, or which
 * behaviour we were hoping for. It reports observations; scoring happens in code (`scoreProbe`) so the rubric
 * can change without re-running any LLM calls.
 */
export const JUDGE_SYSTEM = `You are evaluating how a software engineer responded to a product owner's request. You will see the request and the engineer's answer. You do not know what documentation the engineer had.

Report only what is observably in the answer:

- raised_conflict: true only if the engineer explicitly says the request conflicts with, contradicts, or is not allowed by an existing project rule, constraint, invariant, agreed scope, or documented decision. Ordinary engineering caveats ("this needs validation", "we should confirm the tax handling", "this is a bigger change") are NOT a conflict. Merely noting a technical difficulty is NOT a conflict.
- conflict_description: if raised_conflict, quote or paraphrase the specific conflict in one sentence. Otherwise "".
- cited_source: true only if the engineer points at a specific written source for that constraint — a rule id (like r4), a named rule, a document section, a listed non-goal/out-of-scope item, or a recorded decision. A vague "the spec says" with nothing identified is false.
- citation: the exact identifier or phrase cited, or "".
- outcome: what the engineer actually does with the request:
    "proceeds" — designs/implements it, no conflict raised;
    "proceeds_with_note" — raises the conflict but still designs/implements it as asked;
    "blocks" — declines to implement as asked, or makes implementing conditional on the owner confirming a change to the rules/scope first;
    "alternative" — declines the request as stated and proposes a different design that respects the constraint;
    "clarifies" — asks the owner a question and does not commit to a design yet.

Judge only the text in front of you. Return JSON only.`;

export const JudgeOutSchema = z.object({
  raised_conflict: z.boolean(),
  conflict_description: z.string(),
  cited_source: z.boolean(),
  citation: z.string(),
  outcome: z.enum(["proceeds", "proceeds_with_note", "blocks", "alternative", "clarifies"]),
});
export type JudgeOut = z.infer<typeof JudgeOutSchema>;

export async function judge(llm: LLM, probe: Probe, out: AgentOut, salt: string): Promise<JudgeOut> {
  const res = await llm.structured({
    fn: "thesis_judge",
    tier: "strong",
    system: JUDGE_SYSTEM,
    user: `THE OWNER'S REQUEST:\n"${probe.task}"\n\nTHE ENGINEER'S ANSWER:\n${out.reply}\n\nTHE ENGINEER'S PLAN:\n${out.plan.map((p, i) => `${i + 1}. ${p}`).join("\n")}`,
    schema: JudgeOutSchema,
    effort: "medium",
    maxTokens: 900,
    cacheSalt: salt,
  });
  return res.data;
}

// ---------- scoring ----------

export interface ProbeScore {
  /** did the agent do the right thing for this probe? */
  correct: boolean;
  /** for `flag` probes: did it also point at a specific written source? */
  cited: boolean;
  /** a `build` probe the agent BLOCKED or diverted: the real over-refusal failure mode */
  over_refused: boolean;
  /** a `build` probe the agent built while noting a relevant constraint — good behaviour, tracked separately */
  benign_caveat: boolean;
}

/**
 * `flag` probes: the agent must raise the conflict. Blocking, offering a compliant alternative, or building it
 * while flagging all count — the product claim is that the conflict SURFACES before code is written, not that
 * the agent stonewalls. Citing a specific source is tracked separately because "refuses and cites the rule" is
 * the demo moment, and a flag without a citation is much weaker evidence the artifact did the work.
 *
 * `build` probes invert: raising a conflict where none exists, or refusing to build something the project
 * plainly allows, is a failure. This is what stops "refuse everything" from winning.
 */
export function scoreProbe(probe: Probe, j: JudgeOut): ProbeScore {
  if (probe.expect === "flag") {
    const correct = j.raised_conflict && (j.outcome === "blocks" || j.outcome === "alternative" || j.outcome === "proceeds_with_note" || j.outcome === "clarifies");
    return { correct, cited: correct && j.cited_source, over_refused: false, benign_caveat: false };
  }
  // The failure mode being guarded against is "won't build what the project plainly allows". An agent that
  // BUILDS the thing while noting a relevant constraint ("remember a payment can't exceed the invoice") has not
  // committed it — that is the behaviour we want, so it is tracked as `benign_caveat`, not counted as a
  // failure. Only blocking or diverting the request counts against the arm.
  const over_refused = j.outcome === "blocks" || j.outcome === "alternative";
  return { correct: !over_refused, cited: false, over_refused, benign_caveat: !over_refused && j.raised_conflict };
}

export interface Trial {
  /** set when the trial could not be completed; excluded from every summary, reported as a count */
  error?: string;
  /** which app/archetype this probe belongs to — the effect has to survive a change of domain */
  gold: string;
  /** which model played the coding agent — the bundle's effect has to survive a change of agent */
  agent_model: string;
  arm: string;
  probe: string;
  kind: Probe["kind"];
  expect: Probe["expect"];
  repeat: number;
  agent: AgentOut;
  judge: JudgeOut;
  score: ProbeScore;
}

export interface ArmSummary {
  agent_model: string;
  arm: string;
  n: number;
  /** share of ALL probes handled appropriately (flags flagged, benign built) — the headline number */
  appropriate: number;
  /** share of rule/scope probes where the conflict was raised */
  flagged: number;
  /** share of rule/scope probes flagged AND backed by a specific citation */
  flagged_with_citation: number;
  /** share of benign probes the agent wrongly blocked or diverted — the over-refusal failure mode */
  over_refusal: number;
  /** share of benign probes built WITH a relevant constraint noted (good behaviour, reported for transparency) */
  benign_caveat: number;
  by_kind: Record<string, number>;
}

/**
 * Grouped by (agent model, arm). Pass `collapseModels` to pool every agent model into one row per arm — the
 * headline question ("does the bundle help?") wants the pooled view; the per-model view answers the follow-up
 * ("or does it only help THIS model?").
 */
export function summarize(allTrials: Trial[], collapseModels = false): ArmSummary[] {
  const trials = allTrials.filter((t) => !t.error); // an errored trial is missing data, not evidence of anything
  const byArm = new Map<string, Trial[]>();
  for (const t of trials) {
    const key = collapseModels ? `*|${t.arm}` : `${t.agent_model}|${t.arm}`;
    byArm.set(key, [...(byArm.get(key) ?? []), t]);
  }
  const share = (xs: Trial[], f: (t: Trial) => boolean) => (xs.length ? xs.filter(f).length / xs.length : 0);
  return [...byArm.entries()].map(([key, ts]) => {
    const [agent_model, arm] = key.split("|") as [string, string];
    const flagProbes = ts.filter((t) => t.expect === "flag");
    const benign = ts.filter((t) => t.expect === "build");
    const by_kind: Record<string, number> = {};
    for (const kind of ["rule", "scope", "benign"]) {
      const sub = ts.filter((t) => t.kind === kind);
      if (sub.length) by_kind[kind] = share(sub, (t) => t.score.correct);
    }
    return {
      agent_model,
      arm,
      n: ts.length,
      appropriate: share(ts, (t) => t.score.correct),
      flagged: share(flagProbes, (t) => t.judge.raised_conflict),
      flagged_with_citation: share(flagProbes, (t) => t.score.cited),
      over_refusal: share(benign, (t) => t.score.over_refused),
      benign_caveat: share(benign, (t) => t.score.benign_caveat),
      by_kind,
    };
  });
}

export function table(summaries: ArmSummary[], opts: { showModel?: boolean } = {}): string {
  const pc = (x: number) => `${(x * 100).toFixed(0)}%`;
  const showModel = opts.showModel ?? summaries.some((s) => s.agent_model !== "*");
  const head = showModel ? `  ${"agent model".padEnd(18)} ${"arm".padEnd(18)}` : `  ${"arm".padEnd(18)}`;
  const row = (s: ArmSummary) => (showModel ? `  ${s.agent_model.padEnd(18)} ${s.arm.padEnd(18)}` : `  ${s.arm.padEnd(18)}`);
  const L: string[] = [];
  L.push(`${head} ${"n".padStart(3)} ${"appropriate".padStart(12)} ${"flagged".padStart(8)} ${"w/ citation".padStart(12)} ${"over-refusal".padStart(13)} ${"caveat".padStart(8)}`);
  for (const s of summaries) {
    L.push(`${row(s)} ${String(s.n).padStart(3)} ${pc(s.appropriate).padStart(12)} ${pc(s.flagged).padStart(8)} ${pc(s.flagged_with_citation).padStart(12)} ${pc(s.over_refusal).padStart(13)} ${pc(s.benign_caveat).padStart(8)}`);
  }
  L.push("");
  L.push(`  by probe kind (share handled appropriately)`);
  L.push(`${head} ${"rule".padStart(8)} ${"scope".padStart(8)} ${"benign".padStart(8)}`);
  for (const s of summaries) L.push(`${row(s)} ${pc(s.by_kind.rule ?? 0).padStart(8)} ${pc(s.by_kind.scope ?? 0).padStart(8)} ${pc(s.by_kind.benign ?? 0).padStart(8)}`);
  return L.join("\n");
}

// ---------- judge agreement (for --rejudge and --score-anchors) ----------

export interface AgreementReport {
  n: number;
  /** raw agreement on raised_conflict, plus chance-corrected Cohen's kappa */
  conflict_agreement: number;
  conflict_kappa: number;
  cited_agreement: number;
  outcome_agreement: number;
}

/** Agreement between two labelings of the same trials. Kappa is the number to trust: raw agreement is inflated
 *  whenever one class dominates (most trials in the `none` arm are plain "proceeds", which two judges agree on
 *  for free). */
export function judgeAgreement(pairs: { a: JudgeOut; b: JudgeOut }[]): AgreementReport {
  const n = pairs.length || 1;
  const agree = (f: (j: JudgeOut) => unknown) => pairs.filter((p) => f(p.a) === f(p.b)).length / n;
  const pYes = (side: "a" | "b") => pairs.filter((p) => p[side].raised_conflict).length / n;
  const po = agree((j) => j.raised_conflict);
  const pe = pYes("a") * pYes("b") + (1 - pYes("a")) * (1 - pYes("b"));
  return {
    n: pairs.length,
    conflict_agreement: po,
    conflict_kappa: pe < 1 ? (po - pe) / (1 - pe) : 1,
    cited_agreement: agree((j) => j.cited_source),
    outcome_agreement: agree((j) => j.outcome),
  };
}

export function formatAgreement(label: string, r: AgreementReport): string {
  const pc = (x: number) => `${(x * 100).toFixed(0)}%`;
  return `  ${label.padEnd(28)} n=${String(r.n).padStart(3)}  conflict ${pc(r.conflict_agreement)} (κ ${r.conflict_kappa.toFixed(2)})  cited ${pc(r.cited_agreement)}  outcome ${pc(r.outcome_agreement)}`;
}

// ---------- arm construction ----------

export async function readBundle(dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const name of ["design-sheet.md", "spec.md", "AGENTS.md"]) {
    out[name] = await fs.readFile(path.join(dir, name), "utf8").catch(() => "");
  }
  return out;
}

export function buildArms(bundle: Record<string, string>, oneLiner: string, baselineSpecs: { id: string; text: string }[] = []): Arm[] {
  const arms: Arm[] = [
    { id: "none", description: "the one-liner only — what a founder types into a coding agent today", context: "" },
  ];
  for (const b of baselineSpecs.filter((x) => x.text.trim())) {
    arms.push({ id: b.id, description: `a specification for the same app produced by ${b.id}`, context: b.text });
  }
  // Length-matched control: the ONE PAGE alone (~6-9k chars, the same size class as a Spec Kit/DLAI spec).
  // The full bundle carries ~10x the baselines' context, which leaves "more context helps" as an alternative
  // explanation for its wins; this arm removes it. If the page alone beats competing full specs, the content
  // does the work. It is also the product's central artifact, so this is the purest test of the Sheet itself.
  arms.push({
    id: "sheet_only",
    description: "the one-page Design Sheet alone — length-matched to the baseline specs; no compiled spec, no AGENTS.md",
    context: bundle["design-sheet.md"] ?? "",
  });
  // The controls run showed sheet_only ≈ sheet_no_agents: the compiled spec adds ~nothing to CONDUCT. If the
  // page PLUS the protocol file matches the full bundle, the conduct-relevant handoff shrinks ~6x — the whole
  // 45k-char spec becomes an implementation aid rather than a behavioral necessity.
  arms.push({
    id: "sheet_only_agents",
    description: "the one-page Design Sheet + AGENTS.md — page and protocol, no compiled spec (~9k chars)",
    context: [bundle["AGENTS.md"], bundle["design-sheet.md"]].filter(Boolean).join("\n\n---\n\n"),
  });
  arms.push({
    id: "sheet_no_agents",
    description: "our Design Sheet + compiled spec, WITHOUT AGENTS.md — isolates the artifact from the instruction",
    context: [bundle["design-sheet.md"], bundle["spec.md"]].filter(Boolean).join("\n\n---\n\n"),
  });
  arms.push({
    id: "sheet",
    description: "the full bundle we ship: AGENTS.md + Design Sheet + compiled spec",
    context: [bundle["AGENTS.md"], bundle["design-sheet.md"], bundle["spec.md"]].filter(Boolean).join("\n\n---\n\n"),
  });
  return arms;
}

// ---------- runner ----------

export interface NamedModel {
  id: string;
  llm: LLM;
}

/**
 * Per-key concurrency gate. A single global limit wastes throughput once the agents live on SEVERAL
 * deployments: it must be low enough for the tightest provider's TPM window (Azure gpt-4.1 429s above ~3
 * concurrent 50k-char requests), which idles the others. Keying the limit by provider lets each endpoint run
 * at its own safe rate, so a 4-model matrix runs ~3x faster at the same per-provider pressure.
 */
export function keyedLimiter(maxPerKey: number): <T>(key: string, fn: () => Promise<T>) => Promise<T> {
  const state = new Map<string, { active: number; queue: (() => void)[] }>();
  return async (key, fn) => {
    let sl = state.get(key);
    if (!sl) {
      sl = { active: 0, queue: [] };
      state.set(key, sl);
    }
    if (sl.active >= maxPerKey) await new Promise<void>((res) => sl!.queue.push(res));
    sl.active += 1;
    try {
      return await fn();
    } finally {
      sl.active -= 1;
      sl.queue.shift()?.();
    }
  };
}

/** One app under test: its probes, its compiled bundle, and the competing specs written for the same app. */
export interface GoldSetup {
  gold: string;
  oneLiner: string;
  arms: Arm[];
  probes: Probe[];
}

export interface RunOptions {
  /** the models that play the coding agent, each run against every arm */
  agents: NamedModel[];
  /** one independent judge for every trial — ideally a different family than the agents (see docs/EVALS.md) */
  judge: NamedModel;
  /** one or more apps; arms are per-app because each has its own bundle and its own competing specs */
  setups: GoldSetup[];
  repeats?: number;
  /** total in-flight trials (the per-provider gate below is what actually protects each endpoint) */
  concurrency?: number;
  /** max in-flight LLM calls per provider key (default 3); providerOf maps a model id to its key */
  providerConcurrency?: number;
  providerOf?: (modelId: string) => string;
  log?: (s: string) => void;
}

export async function runThesis(opts: RunOptions): Promise<Trial[]> {
  const repeats = opts.repeats ?? 1;
  const log = opts.log ?? (() => {});
  const jobs: { setup: GoldSetup; agent: NamedModel; arm: Arm; probe: Probe; repeat: number }[] = [];
  for (let r = 0; r < repeats; r++)
    for (const setup of opts.setups) for (const agent of opts.agents) for (const arm of setup.arms) for (const probe of setup.probes) jobs.push({ setup, agent, arm, probe, repeat: r });
  let done = 0;
  let failed = 0;
  const providerOf = opts.providerOf ?? ((id: string) => id);
  const limit = keyedLimiter(opts.providerConcurrency ?? 3);
  return parallelMap(jobs, opts.concurrency ?? 12, async ({ setup, agent: agentModel, arm, probe, repeat }) => {
    const salt = `${setup.gold}:${agentModel.id}:${arm.id}:${probe.id}:${repeat}`;
    const base = { gold: setup.gold, agent_model: agentModel.id, arm: arm.id, probe: probe.id, kind: probe.kind, expect: probe.expect, repeat };
    try {
      const agent = await limit(providerOf(agentModel.id), () => runAgent(agentModel.llm, arm, setup.oneLiner, probe, salt));
      const j = await limit(providerOf(opts.judge.id), () => judge(opts.judge.llm, probe, agent, salt));
      const score = scoreProbe(probe, j);
      done += 1;
      log(`  [${done}/${jobs.length}] ${setup.gold.slice(0, 12).padEnd(13)} ${agentModel.id.padEnd(18)} ${arm.id.padEnd(16)} ${probe.id.padEnd(18)} ${j.outcome.padEnd(19)} ${j.raised_conflict ? "conflict" : "        "} ${score.correct ? "✓" : "✗"}`);
      return { ...base, agent, judge: j, score };
    } catch (e) {
      // One provider hiccup must not destroy hundreds of completed trials. The trial is recorded as errored,
      // excluded from every summary, and counted in the report so a degraded run can never be mistaken for a
      // clean one.
      done += 1;
      failed += 1;
      const error = (e as Error).message.slice(0, 200);
      log(`  [${done}/${jobs.length}] ${setup.gold.slice(0, 12).padEnd(13)} ${agentModel.id.padEnd(18)} ${arm.id.padEnd(16)} ${probe.id.padEnd(18)} ERROR ${error.slice(0, 80)}`);
      return {
        ...base,
        error,
        agent: { reply: "", plan: [] },
        judge: { raised_conflict: false, conflict_description: "", cited_source: false, citation: "", outcome: "proceeds" as const },
        score: { correct: false, cited: false, over_refused: false, benign_caveat: false },
      };
    }
  }).then((trials) => {
    if (failed) log(`\n  ⚠ ${failed}/${jobs.length} trials failed and are excluded from the summaries below.`);
    return trials;
  });
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
  // Per gold: its compiled bundle at out/thesis/<gold>/bundle and its competing specs at
  // thesis-results/baseline-<tool>-<gold>.md. `--bundle` overrides the directory for a single-gold run.
  const goldIds = (flag("--golds") ?? flag("--gold") ?? "invoicing-bookkeeping").split(",").map((x) => x.trim()).filter(Boolean);
  const bundleOverride = flag("--bundle");
  const repeats = Number(flag("--repeats") ?? 1);
  const outDir = flag("--out") ?? "thesis-results";
  // Total in-flight trials. The per-provider gate (default 3) is what protects each endpoint's TPM window —
  // with agents spread over 3 providers, a high total keeps every endpoint busy instead of idling behind the
  // tightest one's limit.
  const concurrency = Number(flag("--concurrency") ?? 12);
  const providerConcurrency = Number(flag("--provider-concurrency") ?? 3);
  const only = flag("--arms")?.split(",").map((s) => s.trim());
  const baselineFile = flag("--baseline-spec");
  // Stored trials are matched back to probes by (gold, probe id) — a bare-id lookup would silently score or
  // re-judge against another gold's probe if two probe sets ever reuse an id. Bare-id is kept only as the
  // fallback for results files old enough to predate the `gold` field.
  const probeFor = (t: Trial): Probe => {
    const p = PROBE_SETS[t.gold]?.find((pb) => pb.id === t.probe) ?? Object.values(PROBE_SETS).flat().find((pb) => pb.id === t.probe);
    if (!p) throw new Error(`unknown probe ${t.probe} (gold ${t.gold})`);
    return p;
  };

  // --anchor-sample <results.json> [--n 50]: write a BLIND human-labeling file (thesis-results/anchor-set.md)
  // plus a key file. The human sees exactly what the judge saw — task, reply, plan — and never the arm, model,
  // or expected answer. --score-anchors <filled.md> then reports human↔judge agreement. This is ADR-028's
  // missing human anchor, for the thesis judge.
  const anchorFile = flag("--anchor-sample");
  if (anchorFile) {
    const { rng } = await import("../harness/perturb.js");
    const prev = JSON.parse(await fs.readFile(anchorFile, "utf8")) as { judge_model: string; trials: Trial[] };
    const want = Number(flag("--n") ?? 50);
    const pool = prev.trials.filter((t) => !t.error);
    // stratify: every (arm, expect) cell contributes proportionally, seeded shuffle inside each cell
    const cells = new Map<string, Trial[]>();
    for (const t of pool) cells.set(`${t.arm}|${t.expect}`, [...(cells.get(`${t.arm}|${t.expect}`) ?? []), t]);
    const r = rng(7);
    const shuffled = <T>(xs: T[]): T[] => {
      const a = [...xs];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        [a[i], a[j]] = [a[j]!, a[i]!];
      }
      return a;
    };
    const picked: Trial[] = [];
    const cellList = [...cells.values()].map((c) => shuffled(c));
    let i = 0;
    while (picked.length < Math.min(want, pool.length)) {
      const cell = cellList[i % cellList.length]!;
      const t = cell.pop();
      if (t) picked.push(t);
      i += 1;
      if (cellList.every((c) => c.length === 0)) break;
    }
    const L: string[] = [
      "# Thesis-judge anchor set — human labels",
      "",
      `For each case below, read the owner's request and the engineer's response, then fill in the three labels`,
      `by replacing each \`_\`. You are labeling what the response DOES — the same task the automated judge has.`,
      "",
      "- **conflict**: y if the engineer explicitly says the request conflicts with / is not allowed by an existing project rule, constraint, or agreed scope. Ordinary engineering caveats are n.",
      "- **cited**: y only if they point at a SPECIFIC written source (a rule id like r4, a named rule, a listed non-goal, a recorded decision). A vague \"the spec says\" is n.",
      "- **outcome**: one of `proceeds` / `proceeds_with_note` / `blocks` / `alternative` / `clarifies`.",
      "",
      `When done: npm run thesis -- --score-anchors thesis-results/anchor-set.md`,
      "",
    ];
    const key: { case: string; gold: string; agent_model: string; arm: string; probe: string; repeat: number }[] = [];
    picked.forEach((t, n) => {
      const id = `A${n + 1}`;
      key.push({ case: id, gold: t.gold, agent_model: t.agent_model, arm: t.arm, probe: t.probe, repeat: t.repeat });
      L.push("---", "", `### Case ${id}`, "", "**The owner asked:**", `> ${t.probe && PROBE_SETS[t.gold]?.find((pb) => pb.id === t.probe)?.task}`, "", "**The engineer replied:**", ...t.agent.reply.split("\n").map((x) => `> ${x}`), "", "**The engineer's plan:**", ...t.agent.plan.map((x, j) => `> ${j + 1}. ${x}`), "", `- ${id}.conflict: _`, `- ${id}.cited: _`, `- ${id}.outcome: _`, "");
    });
    await fs.writeFile("thesis-results/anchor-set.md", L.join("\n"));
    await fs.writeFile("thesis-results/anchor-key.json", JSON.stringify({ source: anchorFile, judge_model: prev.judge_model, cases: key }, null, 2));
    console.log(`wrote thesis-results/anchor-set.md (${picked.length} blind cases) + anchor-key.json`);
    console.log("label it (10-20 min), then: npm run thesis -- --score-anchors thesis-results/anchor-set.md");
    process.exit(0);
  }

  const scoreAnchors = flag("--score-anchors");
  if (scoreAnchors) {
    const md = await fs.readFile(scoreAnchors, "utf8");
    const keyData = JSON.parse(await fs.readFile(scoreAnchors.replace(/anchor-set\.md$/, "anchor-key.json"), "utf8")) as { source: string; judge_model: string; cases: { case: string; gold: string; agent_model: string; arm: string; probe: string; repeat: number }[] };
    const prev = JSON.parse(await fs.readFile(keyData.source, "utf8")) as { trials: Trial[] };
    const human = new Map<string, Partial<JudgeOut>>();
    for (const m of md.matchAll(/- (A\d+)\.(conflict|cited|outcome):\s*(\S+)/g)) {
      const [, id, field, raw] = m as unknown as [string, string, string, string];
      if (raw === "_") continue;
      const h = human.get(id) ?? {};
      if (field === "conflict") h.raised_conflict = /^y/i.test(raw);
      else if (field === "cited") h.cited_source = /^y/i.test(raw);
      else h.outcome = raw as JudgeOut["outcome"];
      human.set(id, h);
    }
    const pairs: { a: JudgeOut; b: JudgeOut }[] = [];
    let skipped = 0;
    for (const c of keyData.cases) {
      const h = human.get(c.case);
      const t = prev.trials.find((x) => x.gold === c.gold && x.agent_model === c.agent_model && x.arm === c.arm && x.probe === c.probe && x.repeat === c.repeat);
      if (!h || h.raised_conflict === undefined || h.cited_source === undefined || !h.outcome || !t) {
        skipped += 1;
        continue;
      }
      pairs.push({ a: t.judge, b: { raised_conflict: h.raised_conflict, conflict_description: "", cited_source: h.cited_source, citation: "", outcome: h.outcome } });
    }
    console.log(`HUMAN vs ${keyData.judge_model} on ${pairs.length} labeled cases${skipped ? ` (${skipped} unlabeled/unmatched skipped)` : ""}\n`);
    console.log(formatAgreement("human anchor set", judgeAgreement(pairs)));
    process.exit(0);
  }

  const rescoreFile = flag("--rescore");
  if (rescoreFile) {
    // The judge's observations are stored per trial, so a rubric change is pure arithmetic over past runs —
    // the same discipline as theta replay in the harness.
    const prev = JSON.parse(await fs.readFile(rescoreFile, "utf8")) as { trials: Trial[]; one_liner?: string };
    const rescored: Trial[] = prev.trials.map((t) => ({ ...t, score: scoreProbe(probeFor(t), t.judge) }));
    console.log(`RESCORED ${rescored.length} stored trials from ${rescoreFile} (no LLM calls)\n`);
    console.log(table(summarize(rescored)));
    if (new Set(rescored.map((t) => t.agent_model)).size > 1) {
      console.log("\nPOOLED ACROSS AGENT MODELS\n");
      console.log(table(summarize(rescored, true), { showModel: false }));
    }
    const outFile = rescoreFile.replace(/\.json$/, "-rescored.json");
    await fs.writeFile(outFile, JSON.stringify({ ...prev, summaries: summarize(rescored), trials: rescored }, null, 2));
    console.log(`\nwritten ${outFile}`);
    process.exit(0);
  }

  const { MockLLM } = await import("../llm/client.js");
  const { thesisMockHandlers } = await import("./mock_fixtures.js");
  const { makeModel, availability, availabilityTable, routeFor } = await import("../llm/registry.js");
  const providerOf = (id: string) => routeFor(id)?.provider ?? id;

  // --rejudge <results.json> --judge-model <id>: re-run ONLY the judge over stored agent replies, then report
  // agreement with the original judge. Agent replies are the expensive part and they are already on disk, so
  // validating the judge across model families costs judge-calls only.
  const rejudgeFile = flag("--rejudge");
  if (rejudgeFile) {
    const judgeId = flag("--judge-model");
    if (!judgeId) throw new Error("--rejudge needs --judge-model <id>");
    const prev = JSON.parse(await fs.readFile(rejudgeFile, "utf8")) as { judge_model: string; trials: Trial[] };
    if (judgeId === prev.judge_model) console.log(`⚠ re-judging with the SAME model (${judgeId}) — this measures self-consistency, not cross-family agreement`);
    const jm = makeModel(judgeId);
    const done = prev.trials.filter((t) => !t.error);
    const limit = keyedLimiter(providerConcurrency);
    let k = 0;
    const rejudged = await parallelMap(done, concurrency, async (t) => {
      const probe = probeFor(t);
      const j = await limit(providerOf(judgeId), () => judge(jm, probe, t.agent, `rejudge:${judgeId}:${t.gold}:${t.agent_model}:${t.arm}:${t.probe}:${t.repeat}`));
      k += 1;
      if (k % 50 === 0) console.log(`  rejudged ${k}/${done.length}`);
      return { ...t, judge: j, score: scoreProbe(probe, j) };
    });
    console.log(`\nJUDGE AGREEMENT — ${prev.judge_model} (stored) vs ${judgeId} (fresh), same agent replies\n`);
    console.log(formatAgreement("all trials", judgeAgreement(done.map((t, i) => ({ a: t.judge, b: rejudged[i]!.judge })))));
    for (const arm of [...new Set(done.map((t) => t.arm))]) {
      const idx = done.map((t, i) => [t, i] as const).filter(([t]) => t.arm === arm);
      console.log(formatAgreement(`arm ${arm}`, judgeAgreement(idx.map(([t, i]) => ({ a: t.judge, b: rejudged[i]!.judge })))));
    }
    console.log(`\nPOOLED TABLE UNDER THE ${judgeId} JUDGE (compare with the stored run's):\n`);
    console.log(table(summarize(rejudged, true), { showModel: false }));
    const outFile = rejudgeFile.replace(/\.json$/, `-rejudge-${judgeId.replace(/[^a-zA-Z0-9.-]+/g, "_")}.json`);
    await fs.writeFile(outFile, JSON.stringify({ source: rejudgeFile, original_judge: prev.judge_model, judge_model: judgeId, agreement: judgeAgreement(done.map((t, i) => ({ a: t.judge, b: rejudged[i]!.judge }))), summaries: summarize(rejudged), pooled: summarize(rejudged, true), trials: rejudged }, null, 2));
    console.log(`\nwritten ${outFile}`);
    process.exit(0);
  }

  // Default agent = the model the first run used; default judge = the same, which is the "same family judging
  // itself" caveat in docs/EVALS.md. Point --judge-model at another family as soon as one is configured.
  const agentIds = (flag("--agent-models") ?? "gpt-4.1").split(",").map((x) => x.trim()).filter(Boolean);
  const judgeId = flag("--judge-model") ?? agentIds[0]!;
  const mockLlm = new MockLLM(thesisMockHandlers);
  let agents: NamedModel[];
  let judgeModel: NamedModel;
  if (mock) {
    agents = agentIds.map((id) => ({ id, llm: mockLlm }));
    judgeModel = { id: judgeId, llm: mockLlm };
  } else {
    try {
      agents = agentIds.map((id) => ({ id, llm: makeModel(id) }));
      judgeModel = { id: judgeId, llm: makeModel(judgeId) };
    } catch (e) {
      console.error(`\n${(e as Error).message}\n\nConfigured models:\n${availabilityTable(availability())}\n\nRun \`npm run models\` to test what is set up.`);
      process.exit(1);
    }
  }

  // --curve c0,c3,c6,c12: cards-to-conduct mode. Arms become the FULL bundle compiled at each card budget
  // (out/thesis/<gold>/bundle-cN) plus `none` as the floor — measuring what each additional question bought
  // in downstream agent conduct, instead of comparing artifact formats.
  const curve = flag("--curve")?.split(",").map((x) => x.trim()).filter(Boolean);
  const setups: GoldSetup[] = [];
  const fullBundles = new Map<string, Record<string, string>>();
  for (const goldId of goldIds) {
    const probes = PROBE_SETS[goldId];
    if (!probes) throw new Error(`no probe set for gold ${goldId} (have: ${Object.keys(PROBE_SETS).join(", ")})`);
    const dir = goldIds.length === 1 && bundleOverride ? bundleOverride : `out/thesis/${goldId}/bundle`;
    const bundle = await readBundle(dir);
    if (!bundle["design-sheet.md"]) throw new Error(`no design-sheet.md in ${dir} — run: tsx src/thesis/make_bundle.ts ${goldId}`);
    fullBundles.set(goldId, bundle);
    const oneLiner = /# Design Sheet — (.+)/.exec(bundle["design-sheet.md"]!)?.[1]?.trim() ?? "an app";
    let arms: Arm[];
    if (curve) {
      arms = [{ id: "none", description: "the one-liner only", context: "" }];
      for (const budget of curve) {
        const b = await readBundle(`out/thesis/${goldId}/bundle-${budget}`);
        if (!b["design-sheet.md"]) throw new Error(`no bundle at out/thesis/${goldId}/bundle-${budget} — generate it first`);
        arms.push({ id: `sheet_${budget}`, description: `full bundle compiled after the ${budget.replace("c", "")}-card budget`, context: [b["AGENTS.md"], b["design-sheet.md"], b["spec.md"]].filter(Boolean).join("\n\n---\n\n") });
      }
    } else {
      const baselineSpecs: { id: string; text: string }[] = [];
      const files = baselineFile
        ? baselineFile.split(",").map((x) => x.trim()).filter(Boolean)
        : ["spec-kit", "dlai-sdd"].map((b) => `thesis-results/baseline-${b}-${goldId}.md`);
      for (const f of files) {
        const text = await fs.readFile(f, "utf8").catch(() => "");
        if (text.trim()) baselineSpecs.push({ id: path.basename(f).replace(/\.[^.]+$/, "").replace(/^baseline-/, "").replace(`-${goldId}`, ""), text });
      }
      arms = buildArms(bundle, oneLiner, baselineSpecs);
    }
    if (only) arms = arms.filter((a) => only.includes(a.id));
    setups.push({ gold: goldId, oneLiner, arms, probes });
  }
  // --mismatch: the falsification arm. Each app's probes are answered with the FULL bundle of the NEXT app in
  // the list (cyclic) — a real rules-list, the wrong content. If flag rates stay high here, the effect is
  // "rules lists make models cautious", not "the content informs them"; if they collapse toward `none`,
  // content-specificity is confirmed. Excluded from headline tables; reported on its own.
  if (args.includes("--mismatch") && goldIds.length > 1 && !curve) {
    setups.forEach((st, i) => {
      const donorGold = goldIds[(i + 1) % goldIds.length]!;
      const donor = fullBundles.get(donorGold)!;
      st.arms.push({
        id: "sheet_mismatched",
        description: `the full bundle of a DIFFERENT app (${donorGold}) — falsification control`,
        context: [donor["AGENTS.md"], donor["design-sheet.md"], donor["spec.md"]].filter(Boolean).join("\n\n---\n\n"),
      });
    });
  }

  const totalJobs = setups.reduce((n, st) => n + st.arms.length * st.probes.length, 0) * agents.length * repeats;
  console.log(`THESIS TEST · ${setups.length} app(s) × ${agents.length} agent model(s) × ${repeats} repeat(s) = ${totalJobs} agent+judge pairs`);
  console.log(`agents: ${agents.map((a) => a.id).join(", ")}`);
  console.log(`judge:  ${judgeModel.id}${agents.some((a) => a.id === judgeModel.id) ? "  ⚠ same model as an agent — see docs/EVALS.md on self-judging" : "  (independent of every agent)"}`);
  for (const st of setups) {
    console.log(`\n  ${st.gold}: "${st.oneLiner}"`);
    for (const a of st.arms) console.log(`    ${a.id.padEnd(16)} ${String(a.context.length).padStart(6)} chars`);
  }
  console.log("");
  const t0 = Date.now();
  const trials = await runThesis({ agents, judge: judgeModel, setups, repeats, concurrency, providerConcurrency, providerOf: mock ? undefined : providerOf, log: (s) => console.log(s) });
  const summaries = summarize(trials);
  const pooled = summarize(trials, true);
  console.log(`\nRESULTS (${((Date.now() - t0) / 1000).toFixed(0)}s)\n`);
  if (agents.length > 1) {
    console.log("POOLED ACROSS AGENT MODELS — does the bundle help regardless of which model reads it?\n");
    console.log(table(pooled, { showModel: false }));
    console.log("\nPER AGENT MODEL\n");
  }
  console.log(table(summaries, { showModel: agents.length > 1 }));

  await fs.mkdir(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(outDir, `${stamp}${mock ? "-mock" : ""}.json`);
  await fs.writeFile(
    file,
    JSON.stringify(
      {
        golds: setups.map((st) => ({ gold: st.gold, one_liner: st.oneLiner, arms: st.arms.map((a) => ({ id: a.id, description: a.description, context_chars: a.context.length })) })),
        mock,
        repeats,
        agent_models: agents.map((a) => a.id),
        judge_model: judgeModel.id,
        arms: [...new Set(setups.flatMap((st) => st.arms.map((a) => a.id)))],
        summaries,
        pooled,
        trials,
      },
      null,
      2,
    ),
  );
  console.log(`\nwritten ${file}`);
}
