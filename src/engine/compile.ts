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
import { checkStateMachines, formatIRFindings, renderStateMachines, type IRFinding } from "../core/spec_ir.js";
import { ledgerConflicts, type PropagationResult } from "../core/catalog.js";
import { composeVerifyProbes } from "../core/verify.js";
import { parallelMap, type LLMUsage } from "../llm/client.js";
import type { Sheet } from "../core/sheet.js";
import { renderSheetMarkdown } from "../core/render.js";
import { normName } from "../core/ids.js";
import type { Artifact, SessionState } from "../core/session.js";

export interface CompileOptions {
  candidates?: number; // best-of-N per section (default 1)
  criticLoops?: number; // repair loops after a failing critic verdict (default 1)
  roundTrip?: boolean; // default true
  story?: boolean; // default true
  outDir?: string; // also write the bundle to this directory
  /** AGENTS.md tells coding agents to CONFIRM decisions whose confidence is below this before building against
   *  them (default 0.8). The decision-probe eval showed a wrongly-defaulted decision silences the agent's own
   *  clarifying questions (asks 2/4 → 0/16) — this line is the countermeasure, priced in that same harness. */
  confirmBelow?: number;
  /** directory of mined precision-idiom exemplars (default catalogs/exemplars); missing files are fine */
  exemplarsDir?: string;
  /** compile even with open decisions or a self-contradictory ledger; the spec is stamped DRAFT and the
   *  phase never reaches done. Without it, compile refuses — a spec quietly built over 69 open decisions and
   *  marked "done" was exactly the failure the 2026-08 external review reproduced. */
  draft?: boolean;
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
  /** mechanical findings that survived the IR repair round for the state_machines section (empty = clean) */
  ir_findings: IRFinding[];
  roundtrip: RoundTripReport | null;
  story: StoryOut | null;
  bundle: { name: string; content: string }[];
  usage: LLMUsage;
  latency_ms: number;
  sheet_version: number;
  /** the Sheet moved while sections compiled — the spec reflects an older version and the phase is NOT done */
  stale: boolean;
  /** hard-edge contradictions in the settled ledger at compile time (only non-empty under `draft`) */
  conflicts: PropagationResult["conflicts"];
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
  // ---- gates: never compile silently from an unfinished or self-contradictory ledger ----
  const unfinished = sheet.decisions.filter((d) => d.status === "open" || d.status === "skipped");
  const conflicts = ledgerConflicts(sheet.decisions, session.belief.nodes);
  if (!opts.draft && (unfinished.length || conflicts.length)) {
    const parts = [
      unfinished.length
        ? `${unfinished.length} decision(s) are still open (${unfinished.slice(0, 5).map((d) => d.id).join(", ")}${unfinished.length > 5 ? ", …" : ""}) — finish the cards / accept the defaults review first`
        : "",
      conflicts.length
        ? `the settled ledger contradicts itself (${conflicts.map((c) => `${c.node} is ${c.have} but ${c.because} wants ${c.want}`).join("; ")}) — fix it in the defaults review`
        : "",
    ].filter(Boolean);
    throw new Error(`cannot compile: ${parts.join("; and ")}. Pass draft (--draft) to compile a draft anyway.`);
  }
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

  // Precision idioms mined from strong specs of this archetype (src/mining/idioms.ts) — style, never content.
  const styleExemplars = await loadStyleExemplars(sheet.archetypes[0], opts.exemplarsDir);

  // ---- sections, in waves ----
  const sections: CompileResult["sections"] = {};
  let priorText = "";
  let fixHints = "";
  let irFindings: IRFinding[] = [];
  const writeWave = async (wave: SectionId[]) => {
    const outs = await parallelMap(wave, 4, async (section) => {
      const ts = Date.now();
      // IR-first pilot: lifecycles are emitted as typed data, mechanically checked, and deterministically
      // rendered — best-of-N doesn't apply (the checker replaces the critic-pick; one repair round on
      // high-severity findings, then keep the better attempt and record what remains).
      if (section === "state_machines") {
        const high = (fs2: IRFinding[]) => fs2.filter((f) => f.severity === "high").length;
        const first = await engine.fns.compileStateMachines({ sheet, decisions: sheet.decisions });
        add(first.usage);
        let ir = first.data;
        let findings = checkStateMachines(ir, sheet);
        let irRounds = 1;
        if (high(findings) > 0) {
          const retry = await engine.fns.compileStateMachines({ sheet, decisions: sheet.decisions, findings: formatIRFindings(findings) });
          add(retry.usage);
          const f2 = checkStateMachines(retry.data, sheet);
          if (high(f2) <= high(findings)) {
            ir = retry.data;
            findings = f2;
          }
          irRounds = 2;
        }
        irFindings = findings;
        const markdown = renderStateMachines(ir) + (findings.length ? `\n\n> ⚠️ Mechanical lifecycle check: ${findings.length} finding(s) remain — see compile-report.json.` : "");
        const traces = ir.machines.map((m) => ({ anchor: m.entity, sources: [...new Set(m.transitions.flatMap((t) => t.sources))] }));
        await emit("compile_section", { section, candidates: 1, ir: true, ir_rounds: irRounds, ir_findings: findings.length, chosen_score: null, latency_ms: Date.now() - ts, chars: markdown.length });
        return { section, out: { markdown, traces }, chosenScore: null };
      }
      const cands = await parallelMap(Array.from({ length: N }, (_, i) => i), N, async (i) => {
        const r = await engine.fns.compileSection({ sheet, section, decisions: sheet.decisions, prior_sections: [priorText, fixHints].filter(Boolean).join("\n\n") + (N > 1 ? `\n(candidate ${i + 1} of ${N}: vary structure and emphasis)` : ""), ...(styleExemplars ? { style_exemplars: styleExemplars } : {}) });
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
  if (unfinished.length || conflicts.length) spec = withDraftLedgerBanner(spec, unfinished.length, conflicts);
  // ---- staleness: the Sheet may have moved while sections compiled (a live compile runs ~a minute outside
  // any lock). A spec compiled from version N must not pass for current when the project is at N+k — it is
  // stamped, reported, and the phase stays short of done so the advisor steers to a recompile. ----
  const latestSheet = await engine.store.getLatestSheet(projectId);
  const stale = !!latestSheet && latestSheet.version !== sheet.version;
  if (stale)
    spec = [
      `> ⚠️ **STALE — the Design Sheet changed during this compile** (compiled from v${sheet.version}, project now at v${latestSheet!.version}). Recompile before relying on this spec.`,
      "",
      spec,
    ].join("\n");
  // The walkthrough's "Please confirm" items ARE story checks: composed by the same 0.5-targeted group-testing
  // machinery the verify loop uses (core/verify.ts), so the owner's final recognition pass lands on the
  // riskiest bundles of assumptions rather than on whatever the story model chose to re-state. One vocabulary,
  // one mechanism. Deterministic — no extra LLM call — and it falls back to the story's own checks if the
  // belief has nothing worth doubting.
  const confirmChecks = verificationChecks(sheet, session);
  const ledger = { stale, open: unfinished.length, conflicts, latest_version: latestSheet?.version ?? null };
  const bundle = buildBundle(sheet, spec, sections, critic, roundtrip, story, rounds, now(), opts.confirmBelow ?? 0.8, irFindings, confirmChecks, ledger);
  for (const b of bundle) {
    const art: Artifact = { project_id: projectId, name: b.name, kind: kindOf(b.name), content: b.content, created_at: now(), meta: { sheet_version: sheet.version } };
    await engine.store.saveArtifact(art);
  }
  if (opts.outDir) {
    await fs.mkdir(opts.outDir, { recursive: true });
    for (const b of bundle) await fs.writeFile(path.join(opts.outDir, b.name), b.content);
  }
  await emit("compile_done", { verdict: critic.verdict, score: critic.score, rounds, roundtrip_overall: roundtrip?.recall.overall ?? null, stale, open_decisions: unfinished.length, conflicts: conflicts.length, usage, latency_ms: Date.now() - t0, out_dir: opts.outDir ?? null });
  // "done" requires ALL of: the critic passed, the ledger was finished and consistent, and the Sheet did not
  // move underneath the compile — anything less is a draft or stale spec, whatever the critic thought of it.
  if (critic.verdict === "pass" && !stale && !unfinished.length && !conflicts.length) await engine.markDone(projectId);
  return { spec, sections, critic, critic_rounds: rounds, ir_findings: irFindings, roundtrip, story, bundle, usage, latency_ms: Date.now() - t0, sheet_version: sheet.version, stale, conflicts };
}

/** Draft compile (opts.draft) over an unfinished or contradictory ledger — stamped the way a failed critic is. */
export function withDraftLedgerBanner(spec: string, openCount: number, conflicts: PropagationResult["conflicts"]): string {
  return [
    `> ⚠️ **DRAFT — COMPILED FROM AN UNFINISHED LEDGER.**${openCount ? ` ${openCount} decision(s) were still open (unanswered and undefaulted).` : ""}${conflicts.length ? ` ${conflicts.length} hard-edge contradiction(s) stand in the settled decisions:` : ""}`,
    ...conflicts.slice(0, 5).map((c) => `> - ${c.node} is "${c.have}" but ${c.because} demands "${c.want}"`),
    "",
    spec,
  ].join("\n");
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
  L.push("", decisionLedger(sheet));
  return L.join("\n") + "\n";
}

/**
 * The complete decision ledger, rendered deterministically into the spec itself. This is where "much more
 * detailed" comes from honestly: every micro-decision the system settled — asked, implied, or assumed — is
 * stated explicitly with its provenance and confidence, instead of living implicitly in prose an implementer
 * would have to guess at. No LLM writes this table, so it cannot hallucinate a decision that was never made.
 */
export function decisionLedger(sheet: Sheet): string {
  const label = (d: Sheet["decisions"][number]) => d.options.find((o) => o.id === d.chosen)?.label ?? d.chosen ?? "(open)";
  const how = (d: Sheet["decisions"][number]) =>
    d.status === "resolved" ? "answered" : d.status === "implied" ? `follows from ${d.implied_by ?? "logic"}` : d.status === "delegated" ? "delegated to us" : d.status === "defaulted" ? "assumed" : d.status;
  const rows = [...sheet.decisions].sort((a, b) => (a.status === "open" ? 1 : 0) - (b.status === "open" ? 1 : 0) || b.consequence - a.consequence || a.id.localeCompare(b.id));
  const L: string[] = [
    "## Decision ledger (complete)",
    "",
    "_Every product decision this spec is built on. \"assumed\" rows carry the confidence of the assumption — an implementer should confirm low-confidence assumptions before building against them (see AGENTS.md)._",
    "",
    "| Decision | Answer | How settled | Confidence |",
    "|---|---|---|---|",
  ];
  for (const d of rows) L.push(`| ${d.question} ⟨src: d:${d.id}⟩ | ${label(d)} | ${how(d)} | ${d.confidence !== undefined ? `${Math.round(d.confidence * 100)}%` : d.status === "open" ? "—" : "100%"} |`);
  return L.join("\n");
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

function buildBundle(sheet: Sheet, spec: string, sections: CompileResult["sections"], critic: CriticOut, roundtrip: RoundTripReport | null, story: StoryOut | null, rounds: number, generatedAt: string, confirmBelow: number, irFindings: IRFinding[] = [], confirmChecks: string[] = [], ledger: { stale: boolean; open: number; conflicts: PropagationResult["conflicts"]; latest_version: number | null } = { stale: false, open: 0, conflicts: [], latest_version: null }) {
  const sheetMd = renderSheetMarkdown(sheet, { showIds: true, showDecisions: true, showOpenDecisions: true });
  // The conduct-critical handoff is the page + this protocol (sheet_only+AGENTS.md scored 91% vs the full
  // bundle's 86% at ~1/6 the context — docs/EVALS.md "The 9k-char handoff"), so the spec is presented as
  // REFERENCE, not required preamble: it carries implementation detail, not the rules that govern conduct.
  // Complete, not curated: a capped list silently dropped a 36%-confidence auth decision on the first live
  // bundle (its consequence score sank it below the fold — the same failure mode the defaults-review
  // measurement found). The agent needs EVERY assumption below the bar; ~15 short lines cost ~600 chars
  // against the 45k the spec-as-reference change just removed from the required preamble.
  const lowConfidence = sheet.decisions
    .filter((d) => d.status === "defaulted" && d.chosen && (d.confidence ?? 0) < confirmBelow)
    .sort((a, b) => b.consequence * (1 - (b.confidence ?? 0)) - a.consequence * (1 - (a.confidence ?? 0)));
  const pct = `${Math.round(confirmBelow * 100)}%`;
  const agents = [
    `# Working on: ${sheet.one_liner}`,
    "",
    ...(critic.verdict !== "pass"
      ? [
          `⚠️ **\`spec.md\` did not pass its critic review** (verdict ${critic.verdict}, score ${critic.score}). Treat \`design-sheet.md\` as the only source of truth and ask before relying on a spec section; see \`compile-report.json\`.`,
          "",
        ]
      : []),
    ...(ledger.stale || ledger.open || ledger.conflicts.length
      ? [
          `⚠️ **\`spec.md\` is a draft**: ${[ledger.stale ? "the Design Sheet changed during the compile (recompile before relying on it)" : "", ledger.open ? `${ledger.open} decision(s) were still open` : "", ledger.conflicts.length ? `${ledger.conflicts.length} contradiction(s) stand in the decision ledger` : ""].filter(Boolean).join("; ")}. Confirm with the owner before building.`,
          "",
        ]
      : []),
    "This project has a one-page Design Sheet (`design-sheet.md`) — the source of truth — and a compiled specification (`spec.md`) for implementation detail.",
    "",
    "Before any task:",
    "1. Read `design-sheet.md` in full. It is one page and it is the contract: People, Nouns, Actions, Rules, Not-yet, Decisions.",
    "2. Consult `spec.md` as REFERENCE when you need implementation detail (data model, lifecycles, acceptance scenarios, journeys). You do not need it in full before starting.",
    "",
    "While working:",
    "- Rules in the Sheet are inviolable. If a requested change would violate a rule, stop, cite the rule id, and ask.",
    // Imperative, first-action phrasing: the first live measurement showed a passive "confirm before building
    // against it" note changes nothing — gpt-4.1 built straight on a 37%-confidence auth assumption it had
    // just been shown. Models act on protocols, not disclaimers (same finding as AGENTS.md vs sheet_only).
    `- **Confirm-first protocol.** The decisions listed below are ASSUMPTIONS (confidence under ${pct}), not facts. If a requested task depends on one of them, your FIRST reply must be one short question confirming that decision with the owner — do not design or build on it until they answer. If the task touches none of them, proceed normally.`,
    ...(lowConfidence.length
      ? [
          `  Assumptions requiring confirmation (riskiest first):`,
          ...lowConfidence.map((d) => `  - ${d.id}: currently assumed "${d.options.find((o) => o.id === d.chosen)?.label ?? d.chosen}" (${Math.round((d.confidence ?? 0) * 100)}% confidence)`),
        ]
      : []),
    "- Use the Glossary names exactly; never rename a concept.",
    "- Respect the Not-yet list: do not build out-of-scope features unless the Sheet changes first.",
    "- If a task changes the design (a new noun/action/rule/decision), update `design-sheet.md` FIRST (add a dated line under Decisions), then implement.",
    "- `sheet-tests.ts` holds one named test stub per rule and action. Implement them as you build and KEEP the id-prefixed names — they are the Sheet's trace into the test suite. The spec's acceptance scenarios are the fuller test list.",
    "",
  ].join("\n");
  const report = { sheet_version: sheet.version, critic, critic_rounds: rounds, ir_findings: irFindings, roundtrip, traces: Object.fromEntries(Object.entries(sections).map(([k, v]) => [k, v.traces])), critic_passed: critic.verdict === "pass", stale: ledger.stale, latest_sheet_version: ledger.latest_version, open_decisions: ledger.open, ledger_conflicts: ledger.conflicts, generated_at: generatedAt };
  const storyMd = story ? [`# ${story.title}`, "", ...story.steps.map((s, i) => `${i + 1}. ${s}`), "", "## Please confirm", ...(confirmChecks.length ? confirmChecks : story.checks).map((c) => `- ${c}`), ""].join("\n") : "";
  const out = [
    { name: "spec.md", content: spec },
    { name: "design-sheet.md", content: sheetMd },
    { name: "design-sheet.json", content: JSON.stringify(sheet, null, 2) },
    { name: "AGENTS.md", content: agents },
    { name: "sheet-tests.ts", content: buildSheetTests(sheet) },
    { name: "compile-report.json", content: JSON.stringify(report, null, 2) },
  ];
  if (story) out.push({ name: "story.md", content: storyMd });
  return out;
}

/**
 * Rules → runnable test stubs (SPEC.md's "flagship v2", v0 shape): `it.todo` stubs are executable immediately
 * under vitest/jest, show up as pending, and coding agents complete named tests. Deterministic — generated from
 * the Sheet alone, no LLM — so the rule/action ids in test names are exact and stable across recompiles.
 */
export function buildSheetTests(sheet: Sheet): string {
  const actorName = (id: string) => sheet.actors.find((a) => a.id === id)?.name ?? id;
  const nounName = (id: string) => sheet.nouns.find((n) => n.id === id)?.name ?? id;
  const L: string[] = [
    `// Generated from Design Sheet v${sheet.version} (${sheet.one_liner}).`,
    `// Do not rename tests: the "r…:"/"a…:" prefixes are the Sheet's stable rule/action ids — they are how`,
    `// reviews trace test coverage back to the Sheet. Implement each todo against the real app; a rule test`,
    `// must FAIL if the rule can be violated.`,
    `import { describe, it } from "vitest";`,
    ``,
    `describe("Design Sheet rules (inviolable)", () => {`,
    ...sheet.rules.map((r) => `  it.todo(${JSON.stringify(`${r.id} (${r.kind}): ${r.text}`)});`),
    ...sheet.rules
      .filter((r) => r.kind === "access")
      .map((r) => `  it.todo(${JSON.stringify(`${r.id} negative: the forbidden path is actually blocked — attempt it and assert denial`)});`),
    `});`,
    ``,
    `describe("Actions (happy paths)", () => {`,
    ...sheet.actions.map((a) => `  it.todo(${JSON.stringify(`${a.id}: ${actorName(a.actor)} ${a.verb} ${nounName(a.object)}${a.example ? ` — e.g. ${a.example}` : ""}`)});`),
    `});`,
    ``,
    `// Not-yet (scope guard) — these features must NOT exist; a test asserting their absence is optional but welcome:`,
    ...sheet.non_goals.map((g) => `//   ${g.id}: ${g.text}`),
    ``,
  ];
  return L.join("\n");
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

/**
 * Confirm-items for the walkthrough, composed from the belief the same way the interactive story checks are:
 * bundles of assumed decisions whose JOINT correctness is nearest 50/50 — the questions most worth the
 * owner's last look. Plain "Is it right that …?" phrasing, riskiest bundle first.
 */
export function verificationChecks(sheet: Sheet, session: SessionState, max = 5): string[] {
  const nodeIds = new Set(session.belief.nodes.map((n) => n.id));
  const candidates = sheet.decisions.filter((d) => d.status === "defaulted" && d.chosen && nodeIds.has(d.id)).map((d) => d.id);
  if (!candidates.length) return [];
  // maxSize 2: the INTERACTIVE story check can bundle six decisions because an LLM weaves them into a scene
  // the owner reads as one story. A static bullet cannot — "Is it right that A; and B; and C; and D…?" is a
  // run-on nobody answers honestly. Two clauses is the most a written check can carry and still be one thought.
  const chosen = Object.fromEntries(sheet.decisions.filter((d) => d.status === "defaulted" && d.chosen).map((d) => [d.id, d.chosen!]));
  const probes = composeVerifyProbes(session.belief, candidates, { consequenceOverride: session.consequence_override, maxProbes: max, maxSize: 2, chosen });
  const phrase = (nodeId: string, optionId: string) => {
    const d = sheet.decisions.find((x) => x.id === nodeId);
    const label = d?.options.find((o) => o.id === optionId)?.label ?? optionId;
    return `${(d?.topic ?? nodeId).toLowerCase()} — ${label.toLowerCase()}`;
  };
  return probes.map((p) => `Is it right that ${p.nodes.map((n) => phrase(n.id, n.option)).join(", and that ")}?`);
}

/** Tolerant loader for catalogs/exemplars/<archetype>.json — absent file or unknown shape = no style block. */
async function loadStyleExemplars(archetype: string | undefined, dir = "catalogs/exemplars"): Promise<string | null> {
  if (!archetype) return null;
  try {
    const raw = JSON.parse(await fs.readFile(path.join(dir, `${archetype}.json`), "utf8")) as Record<string, unknown>;
    const str = (x: unknown, ...keys: string[]) => keys.map((k) => (x as Record<string, unknown>)[k]).find((v) => typeof v === "string") as string | undefined;
    const list = (k: string) => (Array.isArray(raw[k]) ? (raw[k] as unknown[]) : []);
    const idioms = list("precision_idioms")
      .slice(0, 6)
      .map((i) => `- ${str(i, "template", "pattern", "text") ?? ""}${str(i, "example", "example_phrasing") ? ` (e.g. "${str(i, "example", "example_phrasing")}")` : ""}`)
      .filter((l) => l.length > 3);
    const sections = list("section_patterns")
      .slice(0, 6)
      .map((s) => `- strong specs of this kind cover: ${str(s, "name") ?? ""} — ${str(s, "purpose", "description") ?? ""}`)
      .filter((l) => l.length > 40);
    const block = [...idioms, ...sections].join("\n").slice(0, 1600);
    return block.trim() ? block : null;
  } catch {
    return null;
  }
}
