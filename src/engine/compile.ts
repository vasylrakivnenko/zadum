/**
 * Compile pipeline: Sheet + decision log → spec.md (+ bundle).
 *   sections fan-out (3 waves for consistency) → best-of-N per section (critic picks) → assemble →
 *   critic vs Rules (repair loop) → round-trip check (spec → Sheet' → diff) → story walkthrough → bundle.
 */
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Engine } from "./orchestrator.js";
import { SECTIONS, type SectionId, type SectionOut, type CriticOut, type ReverseOut, type StoryOut } from "../llm/functions.js";
import { parallelMap, type LLMUsage } from "../llm/client.js";
import type { Sheet } from "../core/sheet.js";
import { renderSheetMarkdown } from "../core/render.js";
import { normName } from "../core/ids.js";
import type { Artifact } from "../core/session.js";

export interface CompileOptions {
  candidates?: number; // best-of-N per section (default 1)
  criticLoops?: number; // repair loops after a failing critic verdict (default 1)
  roundTrip?: boolean; // default true
  story?: boolean; // default true
  outDir?: string; // also write the bundle to this directory
}

export interface RoundTripReport {
  recall: { actors: number; nouns: number; actions: number; rules: number; non_goals: number; overall: number };
  missing: { kind: string; item: string }[];
  extra: { kind: string; item: string }[];
}

export interface CompileResult {
  spec: string;
  sections: Record<string, { markdown: string; traces: SectionOut["traces"]; candidates: number; chosen_score: number | null }>;
  critic: CriticOut;
  critic_rounds: number;
  roundtrip: RoundTripReport | null;
  story: StoryOut | null;
  bundle: { name: string; content: string }[];
  usage: LLMUsage;
  latency_ms: number;
  sheet_version: number;
}

const WAVES: SectionId[][] = [
  ["overview", "data_model", "actors_permissions", "glossary"],
  ["state_machines", "rules_invariants", "journeys"],
  ["acceptance_scenarios", "non_goals_defaults"],
];

const TITLES: Record<SectionId, string> = {
  overview: "Overview",
  actors_permissions: "Actors & permissions",
  data_model: "Data model",
  state_machines: "Lifecycles (state machines)",
  rules_invariants: "Rules & invariants",
  acceptance_scenarios: "Acceptance scenarios",
  journeys: "Key journeys",
  non_goals_defaults: "Non-goals & defaulted decisions",
  glossary: "Glossary",
};

export async function compileProject(engine: Engine, projectId: string, opts: CompileOptions = {}): Promise<CompileResult> {
  const t0 = Date.now();
  const N = Math.max(1, opts.candidates ?? 1);
  const { sheet, session } = await engine.getState(projectId);
  const usage = zeroUsage();
  const add = (u: LLMUsage) => {
    usage.input_tokens += u.input_tokens;
    usage.output_tokens += u.output_tokens;
    usage.cache_read_input_tokens += u.cache_read_input_tokens;
    usage.cache_creation_input_tokens += u.cache_creation_input_tokens;
  };
  // Same injected clock the Engine uses (`EngineOptions.now`), so compile events stay deterministic in tests
  // and replays instead of being the one path that reaches for the wall clock.
  const now = () => engine.opts.now?.() ?? new Date().toISOString();
  const emit = (type: Parameters<Engine["store"]["appendEvent"]>[0]["type"], payload: Record<string, unknown>) =>
    engine.store.appendEvent({ id: randomUUID(), project_id: projectId, ts: now(), type, payload, tags: { ...session.versions, phase: "compiling" } });

  await emit("compile_started", { candidates: N, sheet_version: sheet.version });

  // ---- sections, in waves ----
  const sections: CompileResult["sections"] = {};
  let priorText = "";
  let fixHints = "";
  const writeWave = async (wave: SectionId[]) => {
    const outs = await parallelMap(wave, 4, async (section) => {
      const ts = Date.now();
      const cands = await parallelMap(Array.from({ length: N }, (_, i) => i), N, async (i) => {
        const r = await engine.fns.compileSection({ sheet, section, decisions: sheet.decisions, prior_sections: [priorText, fixHints].filter(Boolean).join("\n\n") + (N > 1 ? `\n(candidate ${i + 1} of ${N}: vary structure and emphasis)` : "") });
        add(r.usage);
        return r.data;
      });
      let chosen = cands[0]!;
      let chosenScore: number | null = null;
      if (N > 1) {
        const scored = await parallelMap(cands, N, async (c) => {
          const cr = await engine.fns.critique({ spec: `## ${TITLES[section]}\n\n${c.markdown}`, sheet });
          add(cr.usage);
          return cr.data;
        });
        let best = -1;
        scored.forEach((s, i) => {
          const score = s.score - s.violations.filter((v) => v.severity === "high").length * 3 - s.violations.filter((v) => v.severity === "medium").length;
          if (score > best) {
            best = score;
            chosen = cands[i]!;
            chosenScore = s.score;
          }
        });
      }
      await emit("compile_section", { section, candidates: N, chosen_score: chosenScore, latency_ms: Date.now() - ts, chars: chosen.markdown.length });
      return { section, out: chosen, chosenScore };
    });
    for (const o of outs) {
      sections[o.section] = { markdown: o.out.markdown, traces: o.out.traces, candidates: N, chosen_score: o.chosenScore };
      priorText += `\n\n## ${TITLES[o.section]}\n${o.out.markdown.slice(0, 4000)}`;
    }
  };
  for (const wave of WAVES) await writeWave(wave);

  // ---- assemble + critic (+ repair loop) ----
  let spec = assemble(sheet, sections);
  let criticRes = await engine.fns.critique({ spec, sheet });
  add(criticRes.usage);
  let critic = criticRes.data;
  let rounds = 1;
  await emit("critic_result", { round: rounds, verdict: critic.verdict, score: critic.score, violations: critic.violations.length, omissions: critic.omissions.length });
  const maxLoops = opts.criticLoops ?? 1;
  while (critic.verdict === "fail" && rounds <= maxLoops) {
    fixHints = `REVIEW FINDINGS TO FIX (from the previous attempt):\n${critic.violations.map((v) => `- violation of ${v.rule_id} (${v.severity}) at "${v.where}": ${v.why}. Fix: ${v.fix_hint}`).join("\n")}\n${critic.omissions.map((o) => `- omission: ${o.kind} ${o.item}: ${o.why}`).join("\n")}`;
    priorText = "";
    for (const wave of WAVES) await writeWave(wave);
    spec = assemble(sheet, sections);
    criticRes = await engine.fns.critique({ spec, sheet });
    add(criticRes.usage);
    critic = criticRes.data;
    rounds += 1;
    await emit("critic_result", { round: rounds, verdict: critic.verdict, score: critic.score, violations: critic.violations.length, omissions: critic.omissions.length });
  }

  // ---- round trip ----
  let roundtrip: RoundTripReport | null = null;
  if (opts.roundTrip ?? true) {
    const rev = await engine.fns.reverse({ spec });
    add(rev.usage);
    roundtrip = roundTripReport(sheet, rev.data);
    await emit("roundtrip_result", { recall: roundtrip.recall, missing: roundtrip.missing.length, extra: roundtrip.extra.length });
  }

  // ---- story ----
  let story: StoryOut | null = null;
  if (opts.story ?? true) {
    const st = await engine.fns.story({ spec, sheet });
    add(st.usage);
    story = st.data;
  }

  // ---- bundle ----
  // Rule 6: the spec must pass the critic before delivery. We still WRITE the bundle after an exhausted repair
  // loop (throwing away a minute of compute helps nobody), but a failing spec must be impossible to mistake
  // for a passing one — it is stamped as a draft, in the two files a coding agent actually reads.
  if (critic.verdict !== "pass") spec = withFailedCriticBanner(spec, critic);
  const bundle = buildBundle(sheet, spec, sections, critic, roundtrip, story, rounds, now());
  for (const b of bundle) {
    const art: Artifact = { project_id: projectId, name: b.name, kind: kindOf(b.name), content: b.content, created_at: now(), meta: { sheet_version: sheet.version } };
    await engine.store.saveArtifact(art);
  }
  if (opts.outDir) {
    await fs.mkdir(opts.outDir, { recursive: true });
    for (const b of bundle) await fs.writeFile(path.join(opts.outDir, b.name), b.content);
  }
  await emit("compile_done", { verdict: critic.verdict, score: critic.score, rounds, roundtrip_overall: roundtrip?.recall.overall ?? null, usage, latency_ms: Date.now() - t0, out_dir: opts.outDir ?? null });
  if (critic.verdict === "pass") await engine.markDone(projectId);
  return { spec, sections, critic, critic_rounds: rounds, roundtrip, story, bundle, usage, latency_ms: Date.now() - t0, sheet_version: sheet.version };
}

/** Loud, unmissable header for a spec the critic rejected — see Rule 6 in CLAUDE.md. */
export function withFailedCriticBanner(spec: string, critic: CriticOut): string {
  const worst = critic.violations.filter((v) => v.severity === "high").slice(0, 5);
  const listed = (worst.length ? worst : critic.violations.slice(0, 5)).map((v) => `> - ${v.rule_id} (${v.severity}) at "${v.where}": ${v.why}`);
  return [
    `> ⚠️ **DRAFT — THIS SPEC DID NOT PASS REVIEW.** The critic returned \`${critic.verdict}\` (score ${critic.score}) after ${critic.violations.length} violation(s) and ${critic.omissions.length} omission(s) survived the repair pass.`,
    ">",
    "> Do not treat it as the source of truth. The Design Sheet (`design-sheet.md`) still is; fix the findings below (full list in `compile-report.json`) and recompile.",
    ...(listed.length ? [">", ...listed] : []),
    "",
    spec,
  ].join("\n");
}

function assemble(sheet: Sheet, sections: CompileResult["sections"]): string {
  const L: string[] = [];
  L.push(`# Specification — ${sheet.one_liner}`);
  L.push("");
  L.push(`_Compiled from Design Sheet v${sheet.version}${sheet.archetypes.length ? ` (${sheet.archetypes.join(", ")})` : ""}. Trace markers ⟨src: …⟩ point at the Sheet items and decisions each line derives from: d: decision, r: rule, a: action, n: noun, p: actor, g: non-goal._`);
  L.push("");
  L.push("**How to use this spec:** the Design Sheet (design-sheet.md) is the source of truth; this spec is derived from it. Rules are inviolable. If a task would violate one, stop and cite it. If a task changes the design, update the Sheet first.");
  for (const s of SECTIONS) {
    const sec = sections[s];
    if (!sec) continue;
    L.push("", `## ${TITLES[s]}`, "", sec.markdown.trim());
  }
  return L.join("\n") + "\n";
}

export function roundTripReport(sheet: Sheet, rev: ReverseOut): RoundTripReport {
  const missing: RoundTripReport["missing"] = [];
  const extra: RoundTripReport["extra"] = [];
  const rec = (kind: string, have: string[], got: string[], match: (a: string, b: string) => boolean) => {
    let hit = 0;
    for (const h of have) {
      if (got.some((g) => match(h, g))) hit++;
      else missing.push({ kind, item: h });
    }
    for (const g of got) if (!have.some((h) => match(h, g))) extra.push({ kind, item: g });
    return have.length ? hit / have.length : 1;
  };
  const eqName = (a: string, b: string) => normName(a) === normName(b);
  const fuzzy = (a: string, b: string) => jaccard(a, b) >= 0.5;
  const actorName = (id: string) => sheet.actors.find((a) => a.id === id)?.name ?? id;
  const nounName = (id: string) => sheet.nouns.find((n) => n.id === id)?.name ?? id;
  const recall = {
    actors: rec("actor", sheet.actors.map((a) => a.name), rev.actors.map((a) => a.name), eqName),
    nouns: rec("noun", sheet.nouns.map((n) => n.name), rev.nouns.map((n) => n.name), eqName),
    actions: rec(
      "action",
      sheet.actions.map((a) => `${actorName(a.actor)}|${a.verb}|${nounName(a.object)}`),
      rev.actions.map((a) => `${a.actor}|${a.verb}|${a.object}`),
      sameAction,
    ),
    rules: rec("rule", sheet.rules.map((r) => r.text), rev.rules.map((r) => r.text), fuzzy),
    non_goals: rec("non_goal", sheet.non_goals.map((g) => g.text), rev.non_goals.map((g) => g.text), fuzzy),
    overall: 0,
  };
  const total = sheet.actors.length + sheet.nouns.length + sheet.actions.length + sheet.rules.length + sheet.non_goals.length;
  const found = total - missing.length;
  recall.overall = total ? found / total : 1;
  return { recall, missing, extra };
}

/** "Bookkeeper|creates|Invoice" ~ "bookkeeper|create|invoices": actor and object by normalized name, verb by stem. */
function sameAction(x: string, y: string): boolean {
  const [xa = "", xv = "", xo = ""] = x.split("|");
  const [ya = "", yv = "", yo = ""] = y.split("|");
  const stem = (v: string) => normName(v).replace(/(ing|ed|es|s)$/, "");
  const actorOk = normName(xa) === normName(ya) || jaccard(xa, ya) >= 0.5;
  const objectOk = normName(xo) === normName(yo) || jaccard(xo, yo) >= 0.5;
  const verbOk = stem(xv) === stem(yv) || jaccard(xv, yv) >= 0.5;
  return (actorOk && objectOk && verbOk) || jaccard(x.replace(/\|/g, " "), y.replace(/\|/g, " ")) >= 0.75;
}

function jaccard(a: string, b: string): number {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (!A.size && !B.size) return 1;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}
function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP.has(t));
}
const STOP = new Set(["the", "and", "for", "that", "this", "with", "from", "never", "must", "can", "cannot", "not", "are", "its", "their", "they", "has", "have", "any", "only", "all"]);

function buildBundle(sheet: Sheet, spec: string, sections: CompileResult["sections"], critic: CriticOut, roundtrip: RoundTripReport | null, story: StoryOut | null, rounds: number, generatedAt: string) {
  const sheetMd = renderSheetMarkdown(sheet, { showIds: true, showDecisions: true, showOpenDecisions: true });
  const agents = [
    `# Working on: ${sheet.one_liner}`,
    "",
    ...(critic.verdict !== "pass"
      ? [
          `⚠️ **\`spec.md\` did not pass its critic review** (verdict ${critic.verdict}, score ${critic.score}). Treat \`design-sheet.md\` as the only source of truth and ask before relying on a spec section; see \`compile-report.json\`.`,
          "",
        ]
      : []),
    "This project has a Design Sheet (`design-sheet.md`) and a compiled specification (`spec.md`).",
    "",
    "Before any task:",
    "1. Read `design-sheet.md` in full. It is the source of truth: People, Nouns, Actions, Rules, Not-yet, Decisions.",
    "2. Read the relevant sections of `spec.md`.",
    "",
    "While working:",
    "- Rules in the Sheet are inviolable. If a requested change would violate a rule, stop, cite the rule id, and ask.",
    "- Use the Glossary names exactly; never rename a concept.",
    "- Respect the Not-yet list: do not build out-of-scope features unless the Sheet changes first.",
    "- If a task changes the design (a new noun/action/rule/decision), update `design-sheet.md` FIRST (add a dated line under Decisions), then implement.",
    "- Prefer the spec's acceptance scenarios as the test list.",
    "",
  ].join("\n");
  const report = { sheet_version: sheet.version, critic, critic_rounds: rounds, roundtrip, traces: Object.fromEntries(Object.entries(sections).map(([k, v]) => [k, v.traces])), critic_passed: critic.verdict === "pass", generated_at: generatedAt };
  const storyMd = story ? [`# ${story.title}`, "", ...story.steps.map((s, i) => `${i + 1}. ${s}`), "", "## Please confirm", ...story.checks.map((c) => `- ${c}`), ""].join("\n") : "";
  const out = [
    { name: "spec.md", content: spec },
    { name: "design-sheet.md", content: sheetMd },
    { name: "design-sheet.json", content: JSON.stringify(sheet, null, 2) },
    { name: "AGENTS.md", content: agents },
    { name: "compile-report.json", content: JSON.stringify(report, null, 2) },
  ];
  if (story) out.push({ name: "story.md", content: storyMd });
  return out;
}

function kindOf(name: string): Artifact["kind"] {
  if (name === "spec.md") return "spec_md";
  if (name === "design-sheet.md") return "sheet_md";
  if (name === "design-sheet.json") return "sheet_json";
  if (name === "AGENTS.md") return "agents_md";
  if (name === "compile-report.json") return "report_json";
  if (name === "story.md") return "story_md";
  return "other";
}

function zeroUsage(): LLMUsage {
  return { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
}
