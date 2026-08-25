/**
 * The Engine: a deterministic state machine that calls the LLM at fixed points.
 * Phases: drafting → correcting → cards → defaults_review → compiling → done.
 * Every Sheet change is a commit; every learning-relevant moment is an event.
 * Orchestration is one loop (cards) and two fan-outs (world sampling, compile).
 */
import { randomUUID } from "node:crypto";
import type { Store } from "../store/store.js";
import { parallelMap, type LLM } from "../llm/client.js";
import { makeFns, toUserOps, type Fns, type Draft } from "../llm/functions.js";
import { PROMPTS_VERSION, PHRASING_ARMS } from "../llm/prompts.js";
import { KNOWN_ARCHETYPES, type LoadedCatalogs } from "./catalogs.js";
import { emptySheet, type Sheet, type Decision } from "../core/sheet.js";
import { makeCommit, revertOps, type Commit, type CommitSourceKind } from "../core/commit.js";
import { applyPatch, type PatchOp } from "../core/patch.js";
import { ledgerConflicts, mergeCatalogs, nodeDefFromDecision, propagateHard, requirementsMet, type NodeDef, type PropagationResult } from "../core/catalog.js";
import { conditionSoft, conditionHard, distribution, maxOption, topOptions, ess, resolveAssignment, makeWorld, normalizeWeights, type Belief, type World } from "../core/worlds.js";
import { decideNext, impliedByUpdate, settledness, rankOpen, mergeConfig, type SelectorConfig, type Ranked } from "../core/selector.js";
import type { SessionState, Card, Answer, AnswerKind, ZEvent, EventType, ProjectRecord, Phase } from "../core/session.js";
import { FIT_LIKELIHOOD, reweightByLikelihood, worldSummaries, beliefShift } from "../core/evidence.js";
import { composeVerifyProbes, reweightOnVerify } from "../core/verify.js";
import { planInteractions, type PlannedInteraction } from "../core/planner.js";
import { changedHunks, renderHunks } from "../core/textdiff.js";
import { parseSpecGaps, proposeGapDecisions, type SpecGap, type GapCandidate } from "./gap_parse.js";
import { mixWithCatalog, type PopulationPriors } from "../learning/population_priors.js";
import { mapFromSerialized, type SerializedRecalibration } from "../learning/recalibrate.js";
import { loadRuleBank } from "./rule_bank.js";
import { augmentRulesFromBank } from "./rule_augment.js";

export interface EngineOptions {
  config?: Partial<SelectorConfig>;
  /** thoroughness dial: scales the calibrated θ of the EFFECTIVE scoring (see `mergeConfig`); an explicit
   *  `config.theta` still wins. Passing a resolved θ instead would be wrong whenever the scoring comes from a
   *  stored session rather than this run's flags. */
  thetaMultiplier?: number;
  worldBatches?: number; // parallel sampler calls (default 3)
  worldsPerBatch?: number; // worlds per call (default 4)
  eagerWorlds?: boolean; // sample worlds right after the draft (default true)
  precompute?: boolean; // speculative generation of likely next cards (default true)
  now?: () => string;
  arm?: string; // experiment arm tag
  log?: (line: string) => void;
  ruleBankDir?: string; // defaults to catalogs/rule-bank/ (src/engine/rule_bank.ts's DEFAULT_RULE_BANK_DIR)
  /** Opt-in (ZADUM_EVIDENCE=1): absorb `extra_context` as belief evidence right after initial world sampling —
   *  the selector then never spends a card on what a pasted artifact already answered. */
  evidenceOnContext?: boolean;
  /** Opt-in (ZADUM_CONTRARIAN=1): the last sampler batch is prompted to stake out coherent minority positions,
   *  attacking the concentrated-belief blind spot (asked 1/5 deviating nodes — docs/EVALS.md decision probes).
   *  OFF by default: it shifts belief concentration, so θ and the mock baselines must be re-validated by a
   *  live A/B before it ships default-on (same bar the rule bank cleared, ADR-027). */
  contrarianSampling?: boolean;
  /** Loop B, harness-gated: blend learned population priors into the planned nodes (ZADUM_PRIORS_FILE). */
  populationPriors?: PopulationPriors;
  /** Loop B, harness-gated: temper REPORTED confidences (defaults, soft implications) through the learned
   *  reliability map (ZADUM_RECALIBRATION_FILE, written by `npm run learn`). Deliberately not applied inside
   *  the selector's τ/θ decisions yet — that shift needs its own harness gate (see docs/REVIEW-2026-08-23.md
   *  on belief concentration). */
  recalibration?: SerializedRecalibration;
}

/**
 * A hard edge from a later answer that demanded a different option than the user had resolved earlier.
 * The engine REOPENS the earlier decision (Rule 3's "unless contradicted by a later user action"): `had` is
 * the answer that was standing and is now open again — re-askable by the card loop, or settled consistently
 * with the new edge at the next defaulting pass if the user never revisits it.
 */
export interface Contradiction {
  node: string;
  had: string;
  wants: string;
  because: string;
}

export type Implied = {
  hard: { node: string; option: string }[];
  soft: { node: string; option: string; p: number }[];
  contradictions: Contradiction[];
};

export type DealResult =
  | { kind: "card"; card: Card; settledness: number; remaining_estimate: number; top: { node: string; value: number }[] }
  | { kind: "stop"; reason: string; settledness: number };

export interface AnswerResult {
  answer: Answer;
  implied: Implied;
  sheet_version: number;
  next: DealResult;
}

/** The owner's corrections to a compiled spec: raw edited markdown, anchored comments, or both. */
export interface SpecFeedbackInput {
  /** the full spec markdown as the owner edited it (diffed against the stored spec.md) */
  edited?: string;
  /** free comments, each optionally quoting the passage it refers to */
  comments?: { quote?: string; text: string }[];
}

/** What the feedback meant, in the four categories the flywheel learns from. */
export interface SpecRefineExtraction {
  /** assumptions the owner says are wrong, with the correction when they gave one */
  wrong_assumptions: { node: string; was: string; should_be?: string; why: string }[];
  missing_elements: { kind: "actor" | "noun" | "action" | "rule" | "non_goal"; text: string }[];
  confirmed_elements: string[];
  /** choices the feedback opened that nothing settles — added as OPEN decisions, not guessed */
  new_questions: { id: string; question: string }[];
}

export interface SpecRefineResult {
  extraction: SpecRefineExtraction;
  version: number;
  applied: PatchOp[];
  rejected: { op: PatchOp; error: string }[];
  /** earlier answers reopened because the feedback contradicted them (ADR-037) */
  reopened: string[];
  added_decisions: string[];
  notes: string;
}

export interface DefaultItem {
  id: string;
  topic: string;
  question: string;
  chosen: string;
  chosen_label: string;
  status: Decision["status"];
  confidence: number;
  consequence: number;
  why: string;
  options: { id: string; label: string }[];
}

export class Engine {
  readonly fns: Fns;
  readonly config: SelectorConfig;
  private locks = new Map<string, Promise<unknown>>();
  constructor(
    public readonly store: Store,
    public readonly llm: LLM,
    public readonly catalogs: LoadedCatalogs,
    public readonly opts: EngineOptions = {},
  ) {
    this.fns = makeFns(llm);
    this.config = mergeConfig({}, opts.config, { ...(opts.thetaMultiplier !== undefined ? { thetaMultiplier: opts.thetaMultiplier } : {}) });
  }

  // ---------- infrastructure ----------

  private now(): string {
    return this.opts.now ? this.opts.now() : new Date().toISOString();
  }
  private log(line: string) {
    this.opts.log?.(line);
  }
  /** Serialize mutations per project (file store is not transactional). */
  private async withLock<T>(projectId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(projectId) ?? Promise.resolve();
    const run = prev.catch(() => undefined).then(fn);
    this.locks.set(projectId, run);
    try {
      return await run;
    } finally {
      if (this.locks.get(projectId) === run) this.locks.delete(projectId);
    }
  }
  private async emit(session: SessionState | { project_id: string; phase: Phase }, type: EventType, payload: Record<string, unknown>) {
    const versions = "versions" in session ? session.versions : this.versions();
    const e: ZEvent = { id: randomUUID(), project_id: session.project_id, ts: this.now(), type, payload, tags: { ...versions, phase: session.phase } };
    await this.store.appendEvent(e);
  }
  private versions() {
    return { catalog: this.catalogs.version, prompts: PROMPTS_VERSION, models: { ...this.llm.models }, ...(this.opts.arm ? { arm: this.opts.arm } : {}) };
  }
  private async commit(sheet: Sheet, ops: PatchOp[], source: { kind: CommitSourceKind; ref?: string }, message: string, itemSource?: string): Promise<{ sheet: Sheet; commit: Commit | null; rejected: { op: PatchOp; error: string }[] }> {
    const { commit, result } = makeCommit(sheet, ops, { id: randomUUID(), source, message, now: this.now(), itemSource });
    if (commit) {
      await this.store.appendCommit(commit);
      const p = await this.store.getProject(sheet.project_id);
      if (p) await this.store.updateProject({ ...p, latest_version: commit.version, updated_at: this.now() });
    }
    return { sheet: commit ? commit.sheet : sheet, commit, rejected: result.rejected };
  }
  private async setPhase(session: SessionState, phase: Phase) {
    session.phase = phase;
    session.updated_at = this.now();
    await this.store.saveSession(session);
    const p = await this.store.getProject(session.project_id);
    if (p) await this.store.updateProject({ ...p, phase, updated_at: this.now() });
  }
  private async load(projectId: string): Promise<{ sheet: Sheet; session: SessionState; project: ProjectRecord }> {
    const [sheet, session, project] = await Promise.all([this.store.getLatestSheet(projectId), this.store.getSession(projectId), this.store.getProject(projectId)]);
    if (!sheet || !session || !project) throw new Error(`project not found or incomplete: ${projectId}`);
    // sessions persisted by an older build may lack newer config fields; explicit engine options (CLI flags,
    // harness arms) override the stored session config — flags are intent, the stored copy is just the last run's.
    // `mergeConfig` (not a plain spread) keeps θ in the units of whichever scoring actually ends up in force.
    session.config = mergeConfig(session.config, this.opts.config, { ...(this.opts.thetaMultiplier !== undefined ? { thetaMultiplier: this.opts.thetaMultiplier } : {}) });
    return { sheet, session, project };
  }

  // ---------- phase 1: draft + plan ----------

  async createProject(one_liner: string, input: { extra_context?: string; id?: string } = {}): Promise<{ project: ProjectRecord; sheet: Sheet; session: SessionState; draft: Draft; rejected: number }> {
    const id = input.id ?? randomUUID().slice(0, 8);
    const project: ProjectRecord = { id, one_liner, created_at: this.now(), updated_at: this.now(), phase: "drafting", latest_version: 0 };
    await this.store.createProject(project);
    await this.emit({ project_id: id, phase: "drafting" }, "project_created", { one_liner, extra_context: input.extra_context ?? null });

    // 1. draft (one joint call)
    const t0 = Date.now();
    const draftRes = await this.fns.draft({ one_liner, extra_context: input.extra_context, archetypes: KNOWN_ARCHETYPES });
    const draft = draftRes.data;
    const ops = draftToOps(draft);
    const d = await this.commit(emptySheet(id, one_liner), ops, { kind: "draft" }, "Initial draft from one-liner", "draft");
    let sheet = d.sheet;
    await this.emit({ project_id: id, phase: "drafting" }, "draft_created", {
      version: sheet.version,
      counts: { actors: sheet.actors.length, nouns: sheet.nouns.length, actions: sheet.actions.length, rules: sheet.rules.length, non_goals: sheet.non_goals.length },
      rejected: d.rejected.length,
      assumptions: draft.assumptions.map((a) => a.text),
      latency_ms: Date.now() - t0,
      model: draftRes.model,
      usage: draftRes.usage,
    });

    // 2. plan decisions: catalog nodes + bespoke
    const merged = mergeCatalogs(this.catalogs.catalogs, sheet.archetypes);
    if (merged.errors.length) this.log(`catalog warnings: ${merged.errors.join("; ")}`);
    // Rule bank (in parallel with planning: independent LLM calls over the same draft sheet). A missing or
    // corrupt bank must never block onboarding — this is an enhancement, not a core commitment.
    const primaryArchetype = sheet.archetypes[0];
    const bank = primaryArchetype
      ? await loadRuleBank(primaryArchetype, this.opts.ruleBankDir).catch((e: unknown) => {
          this.log(`rule bank load failed for ${primaryArchetype}: ${(e as Error).message}`);
          return null;
        })
      : null;
    const [planRes, augmented] = await Promise.all([this.fns.plan({ sheet, nodes: merged.nodes }), augmentRulesFromBank(this.fns, sheet, bank)]);
    if (augmented.result.ops.length) {
      const ra = await this.commit(sheet, augmented.result.ops, { kind: "rule_bank" }, `Added ${augmented.result.ops.length} rule(s) common in similar ${primaryArchetype} apps`, "rule_bank");
      sheet = ra.sheet;
    }
    if (augmented.res) {
      await this.emit({ project_id: id, phase: "drafting" }, "rules_augmented", {
        archetype: primaryArchetype,
        bank_version: bank?.version ?? null,
        patterns_considered: augmented.result.patterns_considered,
        suggested: augmented.result.suggested,
        added: augmented.result.added,
        deduped: augmented.result.deduped,
        latency_ms: augmented.res.latency_ms,
        usage: augmented.res.usage,
      });
    }
    const plan = planRes.data;
    const notApplicable = new Set(plan.not_applicable.map((x) => x.id));
    const adjust = new Map(plan.consequence_adjustments.map((a) => [a.id, Math.max(0, Math.min(5, a.consequence))]));
    // Secondary archetypes (the drafter's 2nd/3rd tag) contribute nodes at reduced consequence: a generic
    // "crud-saas" question must not outrank the invoicing-specific ones on an invoicing app. Live finding.
    const primary = sheet.archetypes[0];
    const w = this.config.secondaryArchetypeWeight;
    const nodes: NodeDef[] = merged.nodes
      .filter((n) => !notApplicable.has(n.id))
      .map((n) => (adjust.has(n.id) ? { ...n, consequence: adjust.get(n.id)! } : n))
      .map((n) => (n.archetype !== "core" && n.archetype !== primary ? { ...n, consequence: Math.round(n.consequence * w * 10) / 10 } : n));
    const planOps: PatchOp[] = [];
    for (const n of nodes) planOps.push({ op: "add_decision", id: n.id, topic: n.topic, question: n.question, options: n.options.map((o) => ({ id: o.id, label: o.label })), consequence: n.consequence });
    const bespokeDefs: NodeDef[] = [];
    for (const b of plan.bespoke) {
      if (b.options.length < 2 || nodes.some((n) => n.id === b.id)) continue;
      const bid = b.id.startsWith("x") ? b.id : `x_${b.id}`;
      const dec: Decision = { id: bid, topic: b.topic, question: b.question, options: b.options, status: "open", consequence: Math.max(0, Math.min(5, b.consequence)), source: "plan" };
      planOps.push({ op: "add_decision", id: bid, topic: b.topic, question: b.question, options: b.options, consequence: dec.consequence });
      bespokeDefs.push(nodeDefFromDecision(dec));
    }
    for (const f of plan.fixed_by_sheet) {
      const n = nodes.find((x) => x.id === f.id);
      const opt = n?.options.find((o) => o.id === f.option || o.label.toLowerCase() === f.option.toLowerCase());
      if (n && opt) planOps.push({ op: "set_decision", id: n.id, status: "defaulted", chosen: opt.id, confidence: 0.95, rationale: `stated in the description: ${f.why}` });
    }
    const pl = await this.commit(sheet, planOps, { kind: "plan" }, `Planned ${nodes.length} catalog + ${bespokeDefs.length} bespoke decisions`, "plan");
    sheet = pl.sheet;
    const planned = [...nodes, ...bespokeDefs];
    const allNodes = this.opts.populationPriors ? mixWithCatalog(planned, this.opts.populationPriors, sheet.archetypes) : planned;
    const session: SessionState = {
      project_id: id,
      phase: "correcting",
      config: this.config,
      belief: { nodes: allNodes, worlds: [], alpha: this.config.alpha },
      cards: [],
      answers: [],
      precomputed: {},
      consequence_override: {},
      history: [],
      resample_count: 0,
      versions: this.versions(),
      created_at: this.now(),
      updated_at: this.now(),
    };
    await this.store.saveSession(session);
    await this.store.updateProject({ ...project, phase: "correcting", latest_version: sheet.version, updated_at: this.now() });
    await this.emit(session, "plan_created", { nodes: nodes.length, bespoke: bespokeDefs.length, not_applicable: [...notApplicable], fixed: plan.fixed_by_sheet.length, rejected: pl.rejected.length, usage: planRes.usage, latency_ms: planRes.latency_ms });

    if (this.opts.eagerWorlds ?? true) {
      await this.sampleWorlds(id, "initial");
      if (this.opts.evidenceOnContext && input.extra_context?.trim()) await this.absorbEvidence(id, input.extra_context);
    }
    const fresh = await this.load(id);
    return { project: fresh.project, sheet: fresh.sheet, session: fresh.session, draft, rejected: d.rejected.length };
  }

  /**
   * Evidence absorption (LLM-as-likelihood-function): one utterance or pasted artifact reweights the WHOLE
   * particle belief — likelihood weighting via `worldLikelihoods` — so the selector stops asking what the
   * evidence already answers. Far weaker than an answer (floor 0.25 keeps every world alive); never touches
   * the Sheet (Rule 1: only patch ops do that; this changes only the belief).
   */
  async absorbEvidence(projectId: string, text: string): Promise<{ shifts: ReturnType<typeof beliefShift>; ess_before: number; ess_after: number }> {
    return this.withLock(projectId, async () => {
      const { sheet, session } = await this.load(projectId);
      const before: Belief = { ...session.belief, worlds: session.belief.worlds };
      const res = await this.fns.worldLikelihoods({ sheet, worlds: worldSummaries(session.belief), text });
      const likes: Record<string, number> = {};
      for (const l of res.data.likelihoods) likes[l.world_id] = FIT_LIKELIHOOD[l.fit] ?? 0.5;
      const essBefore = ess(session.belief.worlds);
      session.belief.worlds = reweightByLikelihood(session.belief.worlds, likes);
      const shifts = beliefShift(before, session.belief);
      session.precomputed = {}; // belief changed; speculative cards may be stale
      session.updated_at = this.now();
      await this.store.saveSession(session);
      await this.emit(session, "evidence_absorbed", { text: text.slice(0, 300), shifts, ess_before: round(essBefore), ess_after: round(ess(session.belief.worlds)), latency_ms: res.latency_ms, usage: res.usage });
      return { shifts, ess_before: essBefore, ess_after: ess(session.belief.worlds) };
    });
  }

  // ---------- belief: worlds ----------

  async sampleWorlds(projectId: string, reason: "initial" | "resample" | "manual"): Promise<World[]> {
    return this.withLock(projectId, async () => {
      const { sheet, session } = await this.load(projectId);
      const fixed = fixedAssignments(sheet);
      const batches = this.opts.worldBatches ?? 3;
      const per = this.opts.worldsPerBatch ?? 4;
      const t0 = Date.now();
      const results = await parallelMap(Array.from({ length: batches }, (_, i) => i), 4, (i) =>
        // With contrarianSampling, the last batch stakes out coherent minority positions so the particle set
        // carries disagreement for the selector to score (a unanimous belief hides the questions worth asking).
        this.fns.sampleWorlds({ sheet, nodes: session.belief.nodes, fixed, count: per, batch: i, batches, contrarian: !!this.opts.contrarianSampling && batches > 1 && i === batches - 1 }),
      );
      const worlds: World[] = [];
      let repairs = 0;
      let conflicts = 0;
      /** node → how many worlds it does not arise in (every option contradicts what that world holds).
       *  A high count is a catalog signal: the node needs a "not applicable" option or a `requires` gate. */
      const inapplicable: Record<string, number> = {};
      results.forEach((res, bi) => {
        const raw = res.data.worlds;
        const totalW = raw.reduce((s, w) => s + Math.max(0.1, w.weight), 0) || 1;
        raw.forEach((w, wi) => {
          const asg: Record<string, string> = {};
          for (const a of w.assignment) asg[a.node] = a.option;
          // `fixed` is certain, the sample is a guess: resolving in that order makes the world hard-consistent
          // by construction. Forcing constraints on top of a repaired sample (the old order) left worlds that
          // violate hard edges — impossible worlds that still carried weight in every marginal.
          const rep = resolveAssignment([fixed, asg], session.belief.nodes);
          repairs += rep.filled.length;
          conflicts += rep.overridden.length;
          for (const id of rep.inapplicable) inapplicable[id] = (inapplicable[id] ?? 0) + 1;
          worlds.push(makeWorld(`w${session.resample_count}_${bi}_${wi}`, rep.assignment, (Math.max(0.1, w.weight) / totalW) * (1 / batches), reason === "initial" ? "sampled" : "resampled"));
        });
      });
      session.belief.worlds = normalizeWeights(worlds);
      session.resample_count += 1;
      session.precomputed = {}; // belief changed; speculative cards may be stale
      session.updated_at = this.now();
      await this.store.saveSession(session);
      await this.emit(session, "worlds_sampled", {
        reason,
        count: worlds.length,
        ess: ess(session.belief.worlds),
        repairs,
        conflicts,
        inapplicable,
        latency_ms: Date.now() - t0,
        usage: results.map((r) => r.usage),
        models: [...new Set(results.map((r) => r.model))],
      });
      return session.belief.worlds;
    });
  }

  // ---------- phase 2: correction moment ----------

  async applyUserEdit(projectId: string, text: string): Promise<{ version: number; applied: PatchOp[]; rejected: { op: PatchOp; error: string }[]; dropped: { op: string; reason: string }[]; notes: string; implied: Implied }> {
    return this.applyTextPatch(projectId, text, { kind: "user_edit", event: "edit_applied" });
  }

  /** Story-walkthrough corrections (SPEC §4.7) ride the same Rule-1 path as user edits, tagged with their own
   *  commit source and event so learning can attribute what the story step catches that the lists missed. */
  async applyStoryCorrection(projectId: string, text: string): Promise<{ version: number; applied: PatchOp[]; rejected: { op: PatchOp; error: string }[]; dropped: { op: string; reason: string }[]; notes: string; implied: Implied }> {
    return this.applyTextPatch(projectId, text, { kind: "story_correction", event: "story_corrected" });
  }

  private async applyTextPatch(projectId: string, text: string, src: { kind: CommitSourceKind; event: EventType }): Promise<{ version: number; applied: PatchOp[]; rejected: { op: PatchOp; error: string }[]; dropped: { op: string; reason: string }[]; notes: string; implied: Implied }> {
    return this.withLock(projectId, async () => {
      const { sheet, session } = await this.load(projectId);
      const res = await this.fns.patch({ sheet, decisions: sheet.decisions, text });
      const { ops, dropped } = toUserOps(res.data);
      const commitId = randomUUID();
      const { commit, result } = makeCommit(sheet, ops, { id: commitId, source: { kind: src.kind, ref: commitId }, message: text.slice(0, 200), now: this.now(), itemSource: `${src.kind}:${commitId}` });
      let current = sheet;
      if (commit) {
        await this.store.appendCommit(commit);
        current = commit.sheet;
        const p = await this.store.getProject(projectId);
        if (p) await this.store.updateProject({ ...p, latest_version: commit.version, updated_at: this.now() });
      }
      this.syncAddedOptions(session, result.applied);
      // decisions resolved by the edit → update belief + propagate
      const resolvedNow = result.applied.filter((o): o is Extract<PatchOp, { op: "resolve_decision" }> => o.op === "resolve_decision");
      let implied: Implied = { hard: [], soft: [], contradictions: [] };
      for (const r of resolvedNow) {
        const d = current.decisions.find((x) => x.id === r.id);
        if (!d?.chosen) continue;
        const out = await this.propagateResolution(current, session, d.id, d.chosen, { kind: src.kind, ref: commitId });
        current = out.sheet;
        implied = { hard: [...implied.hard, ...out.hard], soft: [...implied.soft, ...out.soft], contradictions: [...implied.contradictions, ...out.contradictions] };
      }
      // The correction moment is the richest evidence the user ever gives ("we're a two-person shop, keep it
      // simple" implies ten decisions and patches one), so the same text does double duty: explicit patch ops
      // above, and a likelihood reweight of the WHOLE belief here. Behind the same flag as context evidence.
      let evidence: ReturnType<typeof beliefShift> = [];
      if (this.opts.evidenceOnContext && text.trim()) {
        try {
          const before: Belief = { ...session.belief, worlds: session.belief.worlds };
          const ev = await this.fns.worldLikelihoods({ sheet: current, worlds: worldSummaries(session.belief), text });
          const likes: Record<string, number> = {};
          for (const l of ev.data.likelihoods) likes[l.world_id] = FIT_LIKELIHOOD[l.fit] ?? 0.5;
          session.belief.worlds = reweightByLikelihood(session.belief.worlds, likes);
          evidence = beliefShift(before, session.belief);
          session.precomputed = {};
          await this.emit(session, "evidence_absorbed", { text: text.slice(0, 300), shifts: evidence, source: src.kind, ess_after: round(ess(session.belief.worlds)), usage: ev.usage });
        } catch (e) {
          this.log(`evidence absorption skipped: ${(e as Error).message}`); // never fail an edit over an enhancement
        }
      }
      session.updated_at = this.now();
      await this.store.saveSession(session);
      await this.emit(session, src.event, { text, ops: result.applied.length, rejected: result.rejected.map((r) => r.error), dropped, notes: res.data.notes, version: current.version, evidence_shifts: evidence.length, latency_ms: res.latency_ms, usage: res.usage });
      return { version: current.version, applied: result.applied, rejected: result.rejected, dropped, notes: res.data.notes, implied };
    });
  }

  /**
   * Mirror patch-added decision options (`add_decision_option`) into the belief. `belief.nodes` is otherwise
   * fixed at planning time, so without this the user's own option could never be shown on a card, sampled, or
   * defaulted — and answering a card with it threw. The new option gets a uniform renormalized prior share
   * (no world holds it yet, so its evidence-weight is honestly near zero) and no hard edges.
   */
  private syncAddedOptions(session: SessionState, applied: PatchOp[]) {
    for (const op of applied) {
      if (op.op !== "add_decision_option") continue;
      const node = session.belief.nodes.find((n) => n.id === op.id);
      if (!node || node.options.some((o) => o.id === op.option.id)) continue;
      node.options = [...node.options, { id: op.option.id, label: op.option.label }];
      node.implies[op.option.id] = [];
      const share = 1 / node.options.length;
      const prior: Record<string, number> = {};
      for (const [k, v] of Object.entries(node.prior)) prior[k] = v * (1 - share);
      prior[op.option.id] = share;
      node.prior = prior;
    }
  }

  // ---------- phase 3: cards ----------

  async startCards(projectId: string): Promise<DealResult> {
    const { session } = await this.load(projectId);
    if (session.belief.worlds.length === 0) await this.sampleWorlds(projectId, "initial");
    return this.withLock(projectId, async () => {
      const { sheet, session } = await this.load(projectId);
      if (session.phase === "correcting" || session.phase === "drafting") await this.setPhase(session, "cards");
      if (session.pending_card) return this.dealResultFor(sheet, session, session.pending_card);
      return this.deal(sheet, session);
    });
  }

  /**
   * "Keep going" after a `converged` stop: the user has re-priced their own tap at ~0, so the next card is
   * dealt ignoring θ. Rule 7's maxCards cap and `no_open` still bind — soft stop, hard ceiling.
   */
  async continueCards(projectId: string): Promise<DealResult> {
    return this.withLock(projectId, async () => {
      const { sheet, session } = await this.load(projectId);
      session.user_continued = true;
      if (session.pending_card) {
        await this.store.saveSession(session);
        return this.dealResultFor(sheet, session, session.pending_card);
      }
      return this.deal(sheet, session); // deal() reads user_continued and saves the session on both paths
    });
  }

  async currentCard(projectId: string): Promise<DealResult | null> {
    const { sheet, session } = await this.load(projectId);
    if (!session.pending_card) return null;
    return this.dealResultFor(sheet, session, session.pending_card);
  }

  /** Open AND askable: hierarchically gated nodes (NodeDef.requires) join only once their parent decisions
   *  are settled at user grade — the card budget descends into a subtree only after its root is confirmed. */
  private openIds(sheet: Sheet, session: SessionState): string[] {
    const byId = new Map(session.belief.nodes.map((n) => [n.id, n]));
    return sheet.decisions
      .filter((d) => {
        if (d.status !== "open") return false;
        const node = byId.get(d.id);
        return !!node && (!node.requires?.length || requirementsMet(node.requires, sheet.decisions));
      })
      .map((d) => d.id);
  }

  private dealResultFor(sheet: Sheet, session: SessionState, card: Card): DealResult {
    // "remaining" means AFTER this card: the pending card's node is still `open` until answered, and counting
    // it made "about N more" one too high (and listed the current card in its own `top`).
    const open = this.openIds(sheet, session).filter((id) => id !== card.node_id);
    const cfg = session.config;
    const ranked = rankOpen(session.belief, open, session.consequence_override, { scoring: cfg.scoring, lookahead: cfg.lookahead, lookaheadTop: cfg.lookaheadTop, discount: cfg.discount });
    return {
      kind: "card",
      card,
      settledness: settledness(session.belief, this.allDecisionIds(sheet, session), session.consequence_override),
      remaining_estimate: ranked.filter((r) => r.value1 >= cfg.theta).length,
      top: ranked.slice(0, 5).map((r) => ({ node: r.nodeId, value: round(r.value) })),
    };
  }

  private allDecisionIds(sheet: Sheet, session: SessionState): string[] {
    const nodeIds = new Set(session.belief.nodes.map((n) => n.id));
    return sheet.decisions.filter((d) => nodeIds.has(d.id) && d.status !== "resolved" && d.status !== "implied" && d.status !== "delegated").map((d) => d.id);
  }

  /** Cards spent in the CURRENT round — Rule 7's cap is per sitting (see SessionState.round_base). */
  private cardsThisRound(session: SessionState): number {
    return Math.max(0, session.cards.length - (session.round_base ?? 0));
  }

  /** This round's effective selector config: θ re-priced by "keep going", cap from the round (≤ Rule 7's 12). */
  private roundConfig(session: SessionState): SelectorConfig {
    const cfg = session.user_continued ? { ...session.config, theta: -Infinity } : session.config;
    const roundMax = session.round_max_cards;
    return roundMax === undefined ? cfg : { ...cfg, maxCards: Math.min(roundMax, session.config.maxCards) };
  }

  /** Decide the next card (or stop), generating it if not precomputed. Caller holds the lock. */
  private async deal(sheet: Sheet, session: SessionState): Promise<DealResult> {
    const open = this.openIds(sheet, session);
    const cfg = this.roundConfig(session);
    const next = decideNext(session.belief, open, cfg, this.cardsThisRound(session), session.consequence_override);
    const settled = settledness(session.belief, this.allDecisionIds(sheet, session), session.consequence_override);
    if (next.action === "stop") {
      session.last_stop_reason = next.reason;
      delete session.pending_card;
      session.updated_at = this.now();
      await this.store.saveSession(session);
      await this.emit(session, "card_loop_stopped", { reason: next.reason, cards: session.cards.length, settledness: settled, top_remaining: next.ranked.slice(0, 3).map((r) => ({ node: r.nodeId, value: round(r.value) })) });
      return { kind: "stop", reason: next.reason, settledness: settled };
    }
    const t0 = Date.now();
    let card = session.precomputed[next.node.nodeId];
    const wasPrecomputed = !!card;
    if (!card) card = await this.generateCard(sheet, session, next.node);
    else card = { ...card, precomputed: true };
    delete session.precomputed[next.node.nodeId];
    session.pending_card = card;
    session.cards.push(card);
    session.updated_at = this.now();
    await this.store.saveSession(session);
    await this.emit(session, "card_shown", {
      card_id: card.id,
      node: card.node_id,
      value: round(next.node.value),
      value1: round(next.node.value1),
      share: round(next.node.share),
      scoring: session.config.scoring,
      lookahead: session.config.lookahead,
      maxP: round(next.node.maxP),
      dist: next.node.dist,
      precomputed: wasPrecomputed,
      render_ms: Date.now() - t0,
      card_index: session.cards.length,
      settledness: settled,
    });
    if (this.opts.precompute ?? true) void this.precomputeNext(session.project_id, card).catch((e) => this.log(`precompute failed: ${(e as Error).message}`));
    return this.dealResultFor(sheet, session, card);
  }

  private async generateCard(sheet: Sheet, session: SessionState, ranked: Ranked): Promise<Card> {
    const node = session.belief.nodes.find((n) => n.id === ranked.nodeId)!;
    const k = Math.max(2, Math.min(node.options.length, session.config.maxCardOptions));
    const top = topOptions(ranked.dist, k).map((t) => ({ option_id: t.option, label: node.options.find((o) => o.id === t.option)?.label ?? t.option, p: t.p }));
    const alsoSets = this.alsoSets(sheet, session, node, top.map((t) => t.option_id));
    const prior = sheet.decisions.filter((d) => d.status === "resolved" && d.chosen).map((d) => `${d.question} → ${d.options.find((o) => o.id === d.chosen)?.label ?? d.chosen}`);
    // Phrasing arm (loop B): deterministic per (project, node) so replays are stable, varied across projects so
    // the bandit (`learning/phrasing_bandit.ts`) accumulates evidence on more than one arm.
    const arm = PHRASING_ARMS[hashCode(`${session.project_id}:${node.id}`) % PHRASING_ARMS.length]!;
    const t0 = Date.now();
    const res = await this.fns.card({ sheet, node, options: top, also_sets: alsoSets, prior_answers: prior.slice(-6), ...(arm.style ? { phrasing_style: arm.style } : {}) });
    const options = top.map((t) => ({ option_id: t.option_id, label: t.label, scenario: res.data.options.find((o) => o.option_id === t.option_id)?.scenario?.trim() || t.label }));
    return { id: randomUUID(), node_id: node.id, context: res.data.context.trim(), options, also_sets: res.data.also_sets.slice(0, 5), created_at: this.now(), model: res.model, latency_ms: Date.now() - t0, phrasing_arm: arm.id };
  }

  /** Reported-confidence tempering through the learned reliability map (the map's own interpolation, incl.
   *  its identity fallback — a bin-level lookup here once coarsened untouched confidences to bin midpoints).
   *  Identity when no map is configured. */
  private recalMap?: (p: number) => number;
  private calibrate(p: number): number {
    if (!this.opts.recalibration) return p;
    this.recalMap ??= mapFromSerialized(this.opts.recalibration);
    return this.recalMap(p);
  }

  /**
   * Plain-language list of what else an answer settles: hard edges + soft implications under either option.
   *
   * This preview must apply exactly the test the engine will really apply after the answer — soft
   * ε-conditioning at `softImplyTau` with a `minImplyDelta` rise (ADR-020) — or the card promises settlements
   * that never happen. The earlier version previewed with HARD conditioning at the looser `tau` (0.9), which
   * over-promises precisely on the concentrated live beliefs ADR-020 tightened the real path for.
   */
  private alsoSets(sheet: Sheet, session: SessionState, node: NodeDef, optionIds: string[]): string[] {
    const out = new Set<string>();
    const open = this.openIds(sheet, session).filter((id) => id !== node.id);
    for (const opt of optionIds) {
      const prop = propagateHard({ [node.id]: opt }, session.belief.nodes, [node.id]);
      for (const [n, d] of Object.entries(prop.derived)) if (open.includes(n)) out.add(describe(session.belief.nodes, n, d.option));
      const after: Belief = { ...session.belief, worlds: conditionSoft(session.belief.worlds, node.id, opt, session.config.epsilon) };
      for (const s of impliedByUpdate(session.belief, after, open, session.config.softImplyTau, session.config.minImplyDelta))
        out.add(describe(session.belief.nodes, s.nodeId, s.option));
    }
    return [...out].slice(0, 6);
  }

  /** Speculatively generate the likely next card for each option of the pending card. */
  private async precomputeNext(projectId: string, card: Card): Promise<void> {
    const { sheet, session } = await this.load(projectId);
    const targets: { nodeId: string; ranked: Ranked }[] = [];
    for (const opt of card.options) {
      const hyp: SessionState = { ...session, belief: { ...session.belief, worlds: conditionSoft(session.belief.worlds, card.node_id, opt.option_id, session.config.epsilon) } };
      const open = this.openIds(sheet, session).filter((id) => id !== card.node_id);
      // exclude nodes that would be implied by this answer
      const prop = propagateHard({ [card.node_id]: opt.option_id }, session.belief.nodes, [card.node_id]);
      const soft = impliedByUpdate(session.belief, hyp.belief, open, session.config.softImplyTau, session.config.minImplyDelta).map((s) => s.nodeId);
      const openAfter = open.filter((id) => !(id in prop.derived) && !soft.includes(id));
      const cfg = this.roundConfig(session);
      const next = decideNext(hyp.belief, openAfter, cfg, this.cardsThisRound(session) + 1, session.consequence_override);
      if (next.action === "ask" && !targets.some((t) => t.nodeId === next.node.nodeId) && !session.precomputed[next.node.nodeId]) targets.push({ nodeId: next.node.nodeId, ranked: next.node });
    }
    if (!targets.length) return;
    const cards = await parallelMap(targets, 2, (t) => this.generateCard(sheet, session, t.ranked));
    await this.withLock(projectId, async () => {
      const [fresh, freshSheet] = await Promise.all([this.store.getSession(projectId), this.store.getLatestSheet(projectId)]);
      if (!fresh) return;
      cards.forEach((c, i) => {
        const nodeId = targets[i]!.nodeId;
        // Must be the DECISION's status, not mere membership in belief.nodes (which never changes and so
        // guarded nothing): between dealing and this write-back the node may have been implied or resolved.
        const stillOpen = freshSheet ? freshSheet.decisions.find((d) => d.id === nodeId)?.status === "open" : true;
        if (stillOpen && !fresh.precomputed[nodeId]) fresh.precomputed[nodeId] = { ...c, precomputed: true };
      });
      await this.store.saveSession(fresh);
    });
  }

  async answerCard(projectId: string, input: { kind: AnswerKind; option_id?: string; text?: string; think_ms?: number }): Promise<AnswerResult> {
    return this.withLock(projectId, async () => {
      const { sheet, session } = await this.load(projectId);
      const card = session.pending_card;
      if (!card) throw new Error("no card is pending");
      if (input.kind === "undo") throw new Error("use undoLast()");
      const node = session.belief.nodes.find((n) => n.id === card.node_id)!;
      const answer: Answer = { card_id: card.id, node_id: card.node_id, kind: input.kind, at: this.now(), ...(input.option_id ? { option_id: input.option_id } : {}), ...(input.text ? { text: input.text } : {}), ...(input.think_ms !== undefined ? { think_ms: input.think_ms } : {}) };
      session.history.push({ card_id: card.id, worlds: session.belief.worlds, consequence_override: { ...session.consequence_override }, sheet_version: sheet.version });
      session.answers.push(answer);
      let current = sheet;
      let implied: AnswerResult["implied"] = { hard: [], soft: [], contradictions: [] };

      if (input.kind === "option") {
        const opt = node.options.find((o) => o.id === input.option_id);
        if (!opt) throw new Error(`option ${input.option_id} not on decision ${node.id}`);
        const r = await this.commit(current, [{ op: "resolve_decision", id: node.id, chosen: opt.id, rationale: `card answer: ${card.options.find((o) => o.option_id === opt.id)?.scenario ?? opt.label}` }], { kind: "card_answer", ref: card.id }, `Card ${session.cards.length}: ${node.topic} → ${opt.label}`, `card:${card.id}`);
        current = r.sheet;
        const out = await this.propagateResolution(current, session, node.id, opt.id, { kind: "card_answer", ref: card.id });
        current = out.sheet;
        implied = { hard: out.hard, soft: out.soft, contradictions: out.contradictions };
      } else if (input.kind === "you_decide") {
        const best = maxOption(distribution(session.belief, node.id));
        session.consequence_override[node.id] = 0;
        const r = await this.commit(current, [{ op: "set_decision", id: node.id, status: "delegated", chosen: best.option, confidence: this.calibrate(best.p), rationale: "user: you decide" }], { kind: "card_answer", ref: card.id }, `Card ${session.cards.length}: ${node.topic} → you decide (${best.option})`, `card:${card.id}`);
        current = r.sheet;
      } else if (input.kind === "skip") {
        const r = await this.commit(current, [{ op: "set_decision", id: node.id, status: "skipped", rationale: "user skipped" }], { kind: "card_answer", ref: card.id }, `Card ${session.cards.length}: ${node.topic} skipped`, `card:${card.id}`);
        current = r.sheet;
      } else if (input.kind === "other") {
        const text = input.text?.trim() || "";
        if (text) {
          const res = await this.fns.patch({ sheet: current, decisions: current.decisions, text: `(Answering the question "${node.question}" with options ${node.options.map((o) => `${o.id}="${o.label}"`).join(", ")}) ${text}` });
          const { ops } = toUserOps(res.data);
          const r = await this.commit(current, ops, { kind: "card_answer", ref: card.id }, `Card ${session.cards.length}: ${node.topic} → other: ${text.slice(0, 80)}`, `card:${card.id}`);
          current = r.sheet;
          this.syncAddedOptions(session, r.commit ? r.commit.ops : []);
          const resolvedIds = r.commit ? r.commit.ops.filter((o): o is Extract<PatchOp, { op: "resolve_decision" }> => o.op === "resolve_decision").map((o) => o.id) : [];
          for (const rid of resolvedIds) {
            const d = current.decisions.find((x) => x.id === rid);
            if (!d?.chosen) continue;
            const out = await this.propagateResolution(current, session, rid, d.chosen, { kind: "card_answer", ref: card.id });
            current = out.sheet;
            implied = { hard: [...implied.hard, ...out.hard], soft: [...implied.soft, ...out.soft], contradictions: [...implied.contradictions, ...out.contradictions] };
          }
        }
        const d = current.decisions.find((x) => x.id === node.id);
        if (d && d.status === "open") {
          const r = await this.commit(current, [{ op: "set_decision", id: node.id, status: "skipped", rationale: `user said: ${text || "(other)"}` }], { kind: "card_answer", ref: card.id }, `Card ${session.cards.length}: ${node.topic} → other (not settled)`, `card:${card.id}`);
          current = r.sheet;
        }
      }
      delete session.pending_card;
      session.updated_at = this.now();
      await this.store.saveSession(session);
      await this.emit(session, "card_answered", { card_id: card.id, node: node.id, kind: input.kind, option: input.option_id ?? null, text: input.text ?? null, think_ms: input.think_ms ?? null, card_index: session.cards.length, implied_hard: implied.hard.length, implied_soft: implied.soft.length, contradictions: implied.contradictions.length });
      if (ess(session.belief.worlds) < session.config.minEss && session.belief.worlds.length) {
        // resample outside our lock scope is not possible (we hold it) → inline sampling
        await this.resampleInline(current, session);
      }
      const next = await this.deal(current, session);
      return { answer, implied, sheet_version: current.version, next };
    });
  }

  private async resampleInline(sheet: Sheet, session: SessionState) {
    const fixed = fixedAssignments(sheet);
    const batches = this.opts.worldBatches ?? 3;
    const per = this.opts.worldsPerBatch ?? 4;
    const results = await parallelMap(Array.from({ length: batches }, (_, i) => i), 4, (i) => this.fns.sampleWorlds({ sheet, nodes: session.belief.nodes, fixed, count: per, batch: i, batches, contrarian: !!this.opts.contrarianSampling && batches > 1 && i === batches - 1 }));
    const worlds: World[] = [];
    results.forEach((res, bi) => {
      const raw = res.data.worlds;
      const totalW = raw.reduce((s, w) => s + Math.max(0.1, w.weight), 0) || 1;
      raw.forEach((w, wi) => {
        const asg: Record<string, string> = {};
        for (const a of w.assignment) asg[a.node] = a.option;
        const rep = resolveAssignment([fixed, asg], session.belief.nodes);
        worlds.push(makeWorld(`w${session.resample_count}_${bi}_${wi}`, rep.assignment, (Math.max(0.1, w.weight) / totalW) * (1 / batches), "resampled"));
      });
    });
    // keep the surviving high-weight old worlds too (rejuvenation, not replacement)
    const survivors = normalizeWeights(session.belief.worlds.filter((w) => w.weight > 1 / (session.belief.worlds.length * 4))).map((w) => ({ ...w, weight: w.weight * 0.5 }));
    session.belief.worlds = normalizeWeights([...survivors, ...worlds.map((w) => ({ ...w, weight: w.weight * 0.5 }))]);
    session.resample_count += 1;
    session.precomputed = {};
    await this.store.saveSession(session);
    await this.emit(session, "worlds_sampled", { reason: "resample", count: session.belief.worlds.length, ess: ess(session.belief.worlds), usage: results.map((r) => r.usage) });
  }

  /** Update belief after node=option is settled; apply hard edges and soft implications as commits. */
  private async propagateResolution(sheet: Sheet, session: SessionState, nodeId: string, optionId: string, source: { kind: CommitSourceKind; ref?: string }): Promise<{ sheet: Sheet; hard: { node: string; option: string }[]; soft: { node: string; option: string; p: number }[]; contradictions: Contradiction[] }> {
    const before: Belief = { ...session.belief, worlds: session.belief.worlds };
    // hard edges
    const prop = propagateHard({ [nodeId]: optionId }, session.belief.nodes, [nodeId]);
    const hard: { node: string; option: string }[] = [];
    const contradictions: Contradiction[] = [];
    const ops: PatchOp[] = [];
    // Rule 3's "unless contradicted by a later user action": a hard edge that demands a DIFFERENT option than
    // a decision already carries must not be silently dropped, or the Sheet ships two contradictory decisions.
    // Derived (implied/defaulted/skipped) values lose to the newer user action and are re-implied. A value the
    // user themselves RESOLVED is where two user statements disagree — the engine won't silently flip an
    // explicit answer, so it REOPENS it (the sanctioned Rule-3 exception): the collision is reported, the
    // question is askable again, and if never revisited the next defaulting pass settles it consistently with
    // this edge. Its own derived decisions are stale with it and reopen too (unless this propagation is
    // re-deriving them anyway). The ledger itself never carries the contradiction.
    for (const [n, d] of Object.entries(prop.derived)) {
      const dec = sheet.decisions.find((x) => x.id === n);
      if (!dec || dec.chosen === d.option) continue; // absent, or already settled the same way
      if (dec.status === "resolved") {
        contradictions.push({ node: n, had: dec.chosen ?? "", wants: d.option, because: d.because });
        ops.push({ op: "reopen_decision", id: n, reason: `your earlier answer conflicts with ${d.because}` });
        for (const child of sheet.decisions) {
          if (child.implied_by !== n || (child.status !== "implied" && child.status !== "defaulted")) continue;
          if (child.id in prop.derived) continue; // being re-derived by this very propagation
          ops.push({ op: "reopen_decision", id: child.id, reason: `derived from ${n}, which was reopened` });
        }
        continue;
      }
      // "you decide" carries no user opinion on the value: re-derive it rather than leaving a silent conflict
      // for the compile gate (reopen first — delegated → implied is not a legal transition).
      if (dec.status === "delegated") ops.push({ op: "reopen_decision", id: n, reason: `re-derived: ${d.because}` });
      hard.push({ node: n, option: d.option });
      ops.push({ op: "set_decision", id: n, status: "implied", chosen: d.option, confidence: 1, implied_by: nodeId, rationale: `follows from ${d.because}` });
    }
    // belief update
    let worlds = conditionSoft(session.belief.worlds, nodeId, optionId, session.config.epsilon);
    for (const h of hard) worlds = conditionSoft(worlds, h.node, h.option, session.config.epsilon);
    session.belief.worlds = worlds;
    // soft implications: open nodes that crossed tau
    const openNow = sheet.decisions.filter((d) => d.status === "open" && d.id !== nodeId && !hard.some((h) => h.node === d.id)).map((d) => d.id);
    const candidateSoft = impliedByUpdate(before, session.belief, openNow, session.config.softImplyTau, session.config.minImplyDelta);
    // A soft implication is a LIKELIHOOD, not a logical consequence, so it may never be written in a way that
    // contradicts a hard edge the settled ledger already forces — a probability never outranks a rule. (The
    // belief is hard-consistent since `resolveAssignment`, but the Sheet can hold values no world does, e.g.
    // an answer the user typed; this is the guard on what we WRITE, independent of what we believe.)
    const settledNow: Record<string, string> = {};
    for (const d of sheet.decisions) if (d.chosen && d.status !== "open" && d.status !== "skipped") settledNow[d.id] = d.chosen;
    settledNow[nodeId] = optionId;
    for (const h of hard) settledNow[h.node] = h.option;
    const soft: typeof candidateSoft = [];
    const skippedSoft: { node: string; option: string }[] = [];
    for (const s of candidateSoft) {
      const trial = propagateHard({ ...settledNow, [s.nodeId]: s.option }, session.belief.nodes, [s.nodeId]);
      if (trial.conflicts.length) {
        skippedSoft.push({ node: s.nodeId, option: s.option });
        continue;
      }
      Object.assign(settledNow, trial.assignment);
      soft.push(s);
    }
    for (const s of soft) ops.push({ op: "set_decision", id: s.nodeId, status: "defaulted", chosen: s.option, confidence: round(this.calibrate(s.p)), implied_by: nodeId, rationale: `very likely given ${nodeId}=${optionId}` });
    // Backward consistency. Hard edges are DIRECTIONAL and `propagateHard` only walks forward from what was
    // just settled, so resolving a decision that is the TARGET of an edge leaves the SOURCE standing with a
    // value that implies something else. Measured: correcting `payments_in_app` to `none` in a story check
    // while `payment_recording=online_auto` stood (which implies `collect_online`) shipped a contradictory
    // ledger that only the compile gate caught. The newest user action wins (Rule 3), so the offending source
    // is reopened — and reported as a contradiction when the user had answered it themselves.
    const projected: Record<string, string> = {};
    for (const d of sheet.decisions) if (d.chosen && d.status !== "open" && d.status !== "skipped") projected[d.id] = d.chosen;
    projected[nodeId] = optionId;
    for (const h of hard) projected[h.node] = h.option;
    for (const s of soft) projected[s.nodeId] = s.option;
    for (const c of contradictions) delete projected[c.node]; // already being reopened
    const reopenedSources = new Set<string>();
    for (const c of propagateHard(projected, session.belief.nodes).conflicts) {
      const src = c.because.split("=")[0]!;
      if (src === c.node || src === nodeId || reopenedSources.has(src)) continue;
      const dec = sheet.decisions.find((x) => x.id === src);
      if (!dec || dec.status === "open") continue;
      reopenedSources.add(src);
      if (dec.status === "resolved") contradictions.push({ node: src, had: dec.chosen ?? "", wants: "", because: `${nodeId}=${optionId}` });
      ops.push({ op: "reopen_decision", id: src, reason: `no longer possible now that ${c.node} is ${c.have}` });
    }

    // Hierarchical unlock: this resolution can newly satisfy a gated child's `requires`. A child that was
    // already defaulted was defaulted while its parent pointed somewhere ELSE — its assumption is stale and
    // was never askable, so reopen it (measured: overriding invoice_delivery → hosted_link in the review left
    // link_expiry frozen at a default computed under pdf_email). Children the user settled themselves stand.
    const unlocked: string[] = [];
    for (const n of session.belief.nodes) {
      if (!n.requires?.length || !n.requires.some((r) => r.node === nodeId)) continue;
      const d = sheet.decisions.find((x) => x.id === n.id);
      if (!d || d.status !== "defaulted" || d.implied_by) continue; // only stale never-asked assumptions
      if (!requirementsMet(n.requires, [...sheet.decisions.filter((x) => x.id !== nodeId), { id: nodeId, chosen: optionId, status: "resolved" }])) continue;
      ops.push({ op: "reopen_decision", id: n.id, reason: `now relevant: ${nodeId} = ${optionId}` });
      unlocked.push(n.id);
    }
    let current = sheet;
    if (ops.length) {
      const r = await this.commit(current, ops, { kind: "implication", ref: source.ref }, `Implications of ${nodeId}=${optionId}: ${hard.length} hard, ${soft.length} likely${contradictions.length ? `, ${contradictions.length} conflicting answer(s) reopened` : ""}`, `implied:${nodeId}`);
      current = r.sheet;
      await this.emit(session, "implications_applied", { node: nodeId, option: optionId, hard, soft: soft.map((s) => ({ node: s.nodeId, option: s.option, p: round(s.p) })), skipped_soft: skippedSoft, unlocked, version: current.version, conflicts: prop.conflicts, contradictions });
    }
    for (const c of contradictions)
      this.log(`contradiction: ${nodeId}=${optionId} implies ${c.node}=${c.wants}, but you had chosen ${c.had} — that question is reopened so you can settle it`);
    session.precomputed = Object.fromEntries(Object.entries(session.precomputed).filter(([k]) => current.decisions.find((d) => d.id === k)?.status === "open"));
    return { sheet: current, hard, soft: soft.map((s) => ({ node: s.nodeId, option: s.option, p: s.p })), contradictions };
  }

  async undoLast(projectId: string): Promise<DealResult | null> {
    return this.withLock(projectId, async () => {
      const { sheet, session } = await this.load(projectId);
      const snap = session.history.pop();
      if (!snap) return null;
      const target = await this.store.getSheetVersion(projectId, snap.sheet_version);
      if (!target) throw new Error(`missing snapshot v${snap.sheet_version}`);
      // Commits since the snapshot that are NOT this card's own answer/implication chain: user edits, story
      // corrections, verifications, gap plans. A whole-snapshot revert deletes their work along with the
      // answer (measured: undoing a card erased a noun an edit had added after it), so with foreign commits
      // the revert target is instead "history minus this card": the snapshot with them replayed on top.
      // Replay is best-effort — an op the missing answer invalidates is skipped, matching undo's intent.
      const foreign = (await this.store.listCommits(projectId)).filter(
        (c) => c.version > snap.sheet_version && !((c.source.kind === "card_answer" || c.source.kind === "implication") && c.source.ref === snap.card_id),
      );
      let revertTarget = target;
      for (const c of foreign) revertTarget = applyPatch(revertTarget, c.ops, { source: `undo:${c.id}` }).sheet;
      const r = await this.commit(sheet, revertOps(sheet, revertTarget), { kind: "undo", ref: snap.card_id }, `Undo answer to card ${snap.card_id}`, "undo");
      // Belief: exact snapshot restore in the clean case. With foreign commits, restore and re-condition on
      // what they resolved — conditionSoft factors multiply per world, so replay order doesn't matter.
      // (Evidence/verify reweights are not replayed: deliberately weak signals, acceptably lost to an undo.)
      session.belief.worlds = snap.worlds;
      if (foreign.length) {
        for (const d of revertTarget.decisions) {
          if (!d.chosen || (d.status !== "resolved" && d.status !== "implied")) continue;
          const was = target.decisions.find((x) => x.id === d.id);
          if (was?.chosen === d.chosen && (was.status === "resolved" || was.status === "implied")) continue;
          session.belief.worlds = conditionSoft(session.belief.worlds, d.id, d.chosen, session.config.epsilon);
        }
      }
      session.consequence_override = snap.consequence_override;
      session.answers = session.answers.filter((a) => a.card_id !== snap.card_id);
      const idx = session.cards.findIndex((c) => c.id === snap.card_id);
      const card = idx >= 0 ? session.cards[idx] : undefined;
      // Cards dealt AFTER the undone answer (answering auto-deals the follow-up) are un-shown by the undo and
      // must leave the ledger too — each one left behind would permanently burn a Rule-7 slot (the selector
      // stops on session.cards.length) and drift card_index, since the re-answer deals its node again.
      if (idx >= 0) session.cards = session.cards.slice(0, idx + 1);
      session.precomputed = {};
      if (card) session.pending_card = card;
      session.updated_at = this.now();
      await this.store.saveSession(session);
      await this.emit(session, "card_answered", { card_id: snap.card_id, kind: "undo", version: r.sheet.version });
      return card ? this.dealResultFor(r.sheet, session, card) : null;
    });
  }

  // ---------- phase 3b: verification (group-testing elicitation over the defaults) ----------

  /** Accepting a scenario is k simultaneous but WEAK confirmations (the user skims a story; they did not
   *  answer k explicit questions), so disagreeing worlds keep far more mass than under a card answer's ε. */
  private static readonly VERIFY_ACCEPT_EPSILON = 0.2;

  /**
   * Per-node ε for accepting a k-node scenario. A flat ε would make one 6-node accept six times the evidence
   * of a 1-node accept — measured: six accepts drove ESS 5.98 → 1.01 (below minEss 4), collapsing the belief
   * the later probes, defaults and gap cards all depend on. Taking the k-th root keeps the TOTAL weight a
   * scenario can strip bounded by VERIFY_ACCEPT_EPSILON regardless of how many decisions it bundled.
   */
  private static acceptEpsilon(k: number): number {
    return Math.pow(Engine.VERIFY_ACCEPT_EPSILON, 1 / Math.max(1, k));
  }

  /**
   * Compose verification scenarios over the current defaults: each bundles several assumed decisions whose
   * JOINT correctness probability ≈ 0.5 (maximum-information yes/no — the batched generalization of binary
   * search; see core/verify.ts), rendered as one concrete story the owner confirms or corrects. Call after
   * finishCards; call again after answers for adaptive recomposition.
   */
  async getVerification(projectId: string, opts: { maxProbes?: number } = {}): Promise<{ probes: { id: string; scenario: string; p_all_correct: number; nodes: { node_id: string; question: string; answer_label: string }[] }[] }> {
    return this.withLock(projectId, async () => {
      const { sheet, session } = await this.load(projectId);
      const nodeIds = new Set(session.belief.nodes.map((n) => n.id));
      const candidates = sheet.decisions.filter((d) => d.status === "defaulted" && d.chosen && nodeIds.has(d.id)).map((d) => d.id);
      // probes must test the LEDGER's chosen values: a consistency-forced default can differ from the belief
      // argmax, and a scenario verifying the argmax would confirm nothing the Sheet actually assumes
      const chosen = Object.fromEntries(sheet.decisions.filter((d) => d.status === "defaulted" && d.chosen).map((d) => [d.id, d.chosen!]));
      const probes = composeVerifyProbes(session.belief, candidates, { consequenceOverride: session.consequence_override, maxProbes: opts.maxProbes ?? 4, chosen });
      const out: NonNullable<SessionState["pending_verification"]> = [];
      const rendered: { id: string; scenario: string; p_all_correct: number; nodes: { node_id: string; question: string; answer_label: string }[] }[] = [];
      for (const p of probes) {
        const bundle = p.nodes.map((n) => {
          const d = sheet.decisions.find((x) => x.id === n.id)!;
          return { node_id: n.id, question: d.question, answer_label: d.options.find((o) => o.id === n.option)?.label ?? n.option };
        });
        const res = await this.fns.verifyScenario({ sheet, bundle });
        out.push({ id: p.id, nodes: p.nodes, scenario: res.data.scenario, p_all_correct: p.p_all_correct });
        rendered.push({ id: p.id, scenario: res.data.scenario, p_all_correct: p.p_all_correct, nodes: bundle });
      }
      session.pending_verification = out;
      session.updated_at = this.now();
      await this.store.saveSession(session);
      await this.emit(session, "verification_shown", { probes: out.map((p) => ({ id: p.id, nodes: p.nodes.map((n) => n.id), p_all_correct: round(p.p_all_correct) })) });
      return { probes: rendered };
    });
  }

  /**
   * The user's verdict on one scenario. Accept: every bundled default gets a mild joint confirmation
   * (reweightOnVerify) and its recorded confidence refreshed. Reject with a correction: the named decision is
   * RESOLVED to the user's option (full Rule-1 commit + propagation) after the "at least one of these is
   * wrong" reweight. Rejection without a correction just applies the reweight — the UI should then elicit
   * which part read wrong (free text goes through the normal patch path with source "verification").
   */
  async answerVerification(projectId: string, input: { probe_id: string; ok: boolean; correction?: { node_id: string; option_id: string } }): Promise<{ implied: Implied; confirmed: string[]; sheet_version: number }> {
    return this.withLock(projectId, async () => {
      const { sheet, session } = await this.load(projectId);
      const probe = session.pending_verification?.find((p) => p.id === input.probe_id);
      if (!probe) throw new Error(`no pending verification probe ${input.probe_id}`);
      let current = sheet;
      let implied: Implied = { hard: [], soft: [], contradictions: [] };
      const confirmed: string[] = [];
      if (input.ok) {
        session.belief.worlds = reweightOnVerify(session.belief.worlds, probe.nodes, true, Engine.acceptEpsilon(probe.nodes.length));
        const ops: PatchOp[] = [];
        for (const n of probe.nodes) {
          const d = current.decisions.find((x) => x.id === n.id);
          if (!d || d.status !== "defaulted" || d.chosen !== n.option) continue;
          // The user accepted the scenario STATING this option — that outranks the belief marginal, which may
          // legitimately prefer another option for a consistency-forced default (it never saw the hard edges).
          // Confidence refreshes to the post-accept belief in the confirmed option, floored at its previous
          // value: a confirmation is evidence for, never against.
          const p = distribution(session.belief, n.id)[n.option] ?? 0;
          ops.push({ op: "set_decision", id: n.id, status: "defaulted", chosen: n.option, confidence: round(Math.max(d.confidence ?? 0, this.calibrate(p))), rationale: "confirmed in a story check" });
          confirmed.push(n.id);
        }
        if (ops.length) {
          const r = await this.commit(current, ops, { kind: "verification", ref: probe.id }, `Story check confirmed ${ops.length} assumption(s)`, `verify:${probe.id}`);
          current = r.sheet;
        }
      } else {
        session.belief.worlds = reweightOnVerify(session.belief.worlds, probe.nodes, false, session.config.epsilon);
        if (input.correction) {
          const r = await this.commit(current, [{ op: "resolve_decision", id: input.correction.node_id, chosen: input.correction.option_id, rationale: "corrected in a story check" }], { kind: "verification", ref: probe.id }, `Story check corrected ${input.correction.node_id}`, `verify:${probe.id}`);
          if (!r.commit) throw new Error(r.rejected[0]?.error ?? "correction rejected");
          const out = await this.propagateResolution(r.sheet, session, input.correction.node_id, input.correction.option_id, { kind: "verification", ref: probe.id });
          current = out.sheet;
          implied = { hard: out.hard, soft: out.soft, contradictions: out.contradictions };
        }
      }
      session.pending_verification = (session.pending_verification ?? []).filter((p) => p.id !== probe.id);
      session.precomputed = {};
      session.updated_at = this.now();
      await this.store.saveSession(session);
      await this.emit(session, "verification_answered", { probe_id: probe.id, ok: input.ok, nodes: probe.nodes.map((n) => n.id), correction: input.correction ?? null, confirmed, p_all_correct: round(probe.p_all_correct) });
      // Same rejuvenation guard the card loop has: a run of story checks depletes the particle set (measured:
      // ESS 5.98 → 1.01 over six accepts before the k-th-root ε above), and every later probe, default and
      // gap card reads that belief. Resampling inline because we hold the lock.
      if (session.belief.worlds.length && ess(session.belief.worlds) < session.config.minEss) await this.resampleInline(current, session);
      return { implied, confirmed, sheet_version: current.version };
    });
  }

  /**
   * Which INTERACTION is worth the user's next tap — a card, a story check, or a look at one assumption?
   * (core/planner.ts). Advisory: it ranks and explains; the caller runs the winner through the normal path.
   * Deliberately not wired into `deal` — swapping the card loop's selection rule needs a harness win first
   * (`npm run harness -- --mix`), per the working agreements.
   */
  async planNext(projectId: string): Promise<PlannedInteraction[]> {
    const { sheet, session } = await this.load(projectId);
    const nodeIds = new Set(session.belief.nodes.map((n) => n.id));
    const defaulted = sheet.decisions.filter((d) => d.status === "defaulted" && d.chosen && nodeIds.has(d.id));
    return planInteractions(session.belief, session.config, {
      openIds: this.openIds(sheet, session),
      defaultedIds: defaulted.map((d) => d.id),
      chosen: Object.fromEntries(defaulted.map((d) => [d.id, d.chosen!])),
      consequenceOverride: session.consequence_override,
      cardsRemaining: Math.max(0, this.roundConfig(session).maxCards - this.cardsThisRound(session)),
    });
  }

  // ---------- phase 5: the refine loop (the owner corrects the compiled spec) ----------

  /**
   * The owner's corrections to a compiled spec, applied to the SHEET.
   *
   * Editing the spec text directly would be overwritten by the next compile — the Sheet is the source of
   * truth (Rule 1, and the compile pipeline's own header). So an edit or a comment is read for INTENT and
   * lands as patch ops: assumptions the owner says are wrong get resolved, elements they say are missing get
   * added, and choices their feedback opens up become new open decisions to ask rather than fresh guesses.
   * Contradictions with earlier answers reopen those answers (ADR-037), so the caller may find questions
   * waiting and the compile gate refusing until they are settled — that is the honest outcome, not an error.
   *
   * The four classified lists are also the flywheel's best signal (docs/LEARNING.md): a wrong assumption is a
   * labelled miss with its correction attached, which no other moment in the product produces.
   */
  async refineFromSpecFeedback(projectId: string, input: SpecFeedbackInput): Promise<SpecRefineResult> {
    return this.withLock(projectId, async () => {
      const { sheet, session } = await this.load(projectId);
      const original = (await this.store.listArtifacts(projectId)).find((a) => a.name === "spec.md");
      const comments = (input.comments ?? []).filter((c) => c.text.trim());
      const edited = input.edited?.trim();
      const diff = edited && original ? renderHunks(changedHunks(original.content, edited)) : "";
      if (!diff && !comments.length) throw new Error("no feedback: edit the spec or leave a comment first");

      const res = await this.fns.specFeedback({ sheet, decisions: sheet.decisions, diff, comments });
      const data = res.data;
      const { ops: userOps, dropped } = toUserOps({ ops: data.ops, notes: data.notes });
      const ops: PatchOp[] = [...userOps];

      // New questions become OPEN decisions, never fresh assumptions: the feedback proved this choice is real
      // and unsettled, which is exactly the bar for spending a card on it.
      const added: string[] = [];
      let n = sheet.decisions.filter((d) => d.id.startsWith("xr_")).length;
      for (const q of data.new_questions) {
        if (!q.question.trim() || !q.option_a.trim() || !q.option_b.trim()) continue;
        const id = `xr_${++n}`;
        ops.push({ op: "add_decision", id, topic: q.topic || "from your feedback", question: q.question, options: [{ id: "a", label: q.option_a }, { id: "b", label: q.option_b }], consequence: 3, status: "open" });
        added.push(id);
      }

      const commitId = randomUUID();
      const { commit, result } = makeCommit(sheet, ops, { id: commitId, source: { kind: "spec_feedback", ref: commitId }, message: `Spec feedback: ${data.notes.slice(0, 160)}`, now: this.now(), itemSource: `spec_feedback:${commitId}` });
      let current = sheet;
      if (commit) {
        await this.store.appendCommit(commit);
        current = commit.sheet;
        const p = await this.store.getProject(projectId);
        if (p) await this.store.updateProject({ ...p, latest_version: commit.version, updated_at: this.now() });
      }
      this.syncAddedOptions(session, result.applied);
      for (const id of added) {
        const d = current.decisions.find((x) => x.id === id);
        if (d && !session.belief.nodes.some((x) => x.id === id)) session.belief.nodes = [...session.belief.nodes, nodeDefFromDecision(d)];
      }

      // resolutions from the feedback propagate exactly like any other user action
      let implied: Implied = { hard: [], soft: [], contradictions: [] };
      for (const r of result.applied.filter((o): o is Extract<PatchOp, { op: "resolve_decision" }> => o.op === "resolve_decision")) {
        const d = current.decisions.find((x) => x.id === r.id);
        if (!d?.chosen) continue;
        const out = await this.propagateResolution(current, session, d.id, d.chosen, { kind: "spec_feedback", ref: commitId });
        current = out.sheet;
        implied = { hard: [...implied.hard, ...out.hard], soft: [...implied.soft, ...out.soft], contradictions: [...implied.contradictions, ...out.contradictions] };
      }

      // Anything now open (new questions, or answers reopened by a contradiction) is a real question again:
      // reopen the card round so the loop will actually deal them (Rule 7 caps a sitting, not a lifetime).
      const openNow = this.openIds(current, session);
      if (openNow.length) {
        session.user_continued = true;
        session.round_base = session.cards.length;
        session.round_max_cards = Math.min(Math.max(added.length, openNow.length), session.config.maxCards);
        await this.setPhase(session, "cards");
      }
      session.precomputed = {};
      session.updated_at = this.now();
      await this.store.saveSession(session);

      const extraction: SpecRefineExtraction = {
        wrong_assumptions: data.wrong_assumptions
          .filter((w) => current.decisions.some((d) => d.id === w.node))
          .map((w) => {
            const d = current.decisions.find((x) => x.id === w.node)!;
            const label = (o?: string) => d.options.find((x) => x.id === o)?.label ?? o ?? "";
            return { node: w.node, was: label(sheet.decisions.find((x) => x.id === w.node)?.chosen), ...(w.should_be ? { should_be: label(w.should_be) || w.should_be } : {}), why: w.why };
          }),
        missing_elements: data.missing_elements.filter((m) => m.kind && m.text.trim()).map((m) => ({ kind: m.kind as Exclude<typeof m.kind, "">, text: m.text })),
        confirmed_elements: data.confirmed_elements.filter(Boolean),
        new_questions: added.map((id) => ({ id, question: current.decisions.find((d) => d.id === id)?.question ?? "" })),
      };
      // Machine-readable corrections beside the human-readable extraction: node + the VALIDATED option id as
      // it landed on the Sheet (the extraction carries labels, which learning cannot key on). This is the
      // observation the flywheel wants — a wrong default with its correction attached (docs/LEARNING.md §0).
      const corrections = result.applied
        .filter((o): o is Extract<PatchOp, { op: "resolve_decision" }> => o.op === "resolve_decision")
        .map((o) => ({ node: o.id, option: current.decisions.find((d) => d.id === o.id)?.chosen }))
        .filter((c): c is { node: string; option: string } => !!c.option);
      await this.emit(session, "spec_refined", {
        comments: comments.length,
        edited: !!diff,
        diff_chars: diff.length,
        ops: result.applied.length,
        corrections,
        rejected: result.rejected.map((r) => r.error),
        dropped,
        extraction,
        reopened: implied.contradictions.map((c) => c.node),
        version: current.version,
        latency_ms: res.latency_ms,
        usage: res.usage,
      });
      return {
        extraction,
        version: current.version,
        applied: result.applied,
        rejected: result.rejected,
        reopened: implied.contradictions.map((c) => c.node),
        added_decisions: added,
        notes: data.notes,
      };
    });
  }

  // ---------- gap mining: the compiled spec's confessed guesses become the next discriminative questions ----------

  /**
   * Every ⟨src: default⟩ marker in the compiled spec is a place the compiler had to guess. Parse them from the
   * latest compiled artifact, cluster into candidate DECISIONS (one LLM call), and return them ranked. With
   * `apply`, the top candidates are committed as open decisions and joined to the belief (prior-only — the
   * α-mix makes them askable immediately), and the phase returns to `cards` so the loop closes:
   * spec gaps → new questions → tighter spec.
   */
  async mineSpecGaps(projectId: string, opts: { max?: number; apply?: number; applyIds?: string[] } = {}): Promise<{ gaps: SpecGap[]; candidates: GapCandidate[]; applied: string[] }> {
    const { sheet } = await this.load(projectId);
    const spec = (await this.store.listArtifacts(projectId)).find((a) => a.name === "spec.md");
    if (!spec) throw new Error("no compiled spec.md artifact — compile first");
    const gaps = parseSpecGaps(spec.content);
    if (!gaps.length) return { gaps, candidates: [], applied: [] };
    const res = await proposeGapDecisions(this.llm, sheet, gaps, { max: opts.max ?? 8 });
    const applied: string[] = [];
    // `applyIds` selects EXACTLY those candidates (what a checkbox UI means); `apply` takes the top N by rank
    // (what a CLI "--apply 3" means). Without the id form, a user unchecking the top item silently got it
    // anyway — the count is a prefix, and a prefix is not a selection.
    const wanted = opts.applyIds?.length ? res.candidates.filter((c) => opts.applyIds!.includes(c.id)) : opts.apply ? res.candidates.slice(0, opts.apply) : [];
    if (wanted.length) {
      await this.withLock(projectId, async () => {
        const { sheet: current, session } = await this.load(projectId);
        const chosen = wanted;
        const ops: PatchOp[] = chosen.map((c) => ({ op: "add_decision" as const, id: c.id, topic: c.topic, question: c.question, options: c.options, consequence: c.consequence }));
        const r = await this.commit(current, ops, { kind: "plan" }, `Gap mining: ${chosen.length} decision(s) proposed from the spec's own defaults`, "gap_mining");
        for (const c of chosen) {
          const d = r.sheet.decisions.find((x) => x.id === c.id);
          if (d) {
            session.belief.nodes = [...session.belief.nodes, nodeDefFromDecision(d)];
            applied.push(c.id);
          }
        }
        if (applied.length) {
          // Applying gaps IS the user re-pricing these taps: a prior-only node's value1 ≈ c·H(prior) sits far
          // below the calibrated θ (≈5-8 vs 24), so without this the reopened loop would converge instantly
          // and never deal the very questions the user just asked for.
          session.user_continued = true;
          // …and it opens a NEW round: Rule 7 caps a sitting, not a lifetime. Without this, a user who spent
          // all 12 cards before compiling got `STOP max_cards` and their requested questions were silently
          // defaulted (measured). The round's own cap is the number of questions they asked for.
          session.round_base = session.cards.length;
          session.round_max_cards = Math.min(applied.length, session.config.maxCards);
        }
        session.updated_at = this.now();
        await this.store.saveSession(session);
        if (applied.length) await this.setPhase(session, "cards");
      });
    }
    await this.emit({ project_id: projectId, phase: "compiling" }, "gaps_proposed", { gaps: gaps.length, candidates: res.candidates.map((c) => ({ id: c.id, consequence: c.consequence })), applied, usage: res.usage });
    return { gaps, candidates: res.candidates, applied };
  }

  // ---------- phase 4: defaults review ----------

  async finishCards(projectId: string): Promise<DefaultItem[]> {
    return this.withLock(projectId, async () => {
      const { sheet, session } = await this.load(projectId);
      const { ops, conflicts, notApplicable } = this.defaultOps(sheet, session);
      const r = await this.commit(sheet, ops, { kind: "default" }, `Defaulted ${ops.length} decisions after card loop`, "default");
      delete session.pending_card;
      await this.setPhase(session, "defaults_review");
      await this.emit(session, "default_set", { count: ops.length, cards: session.cards.length, stop_reason: session.last_stop_reason ?? null, conflicts, not_applicable: notApplicable });
      for (const id of notApplicable) this.log(`not applicable for this design, dropped: ${id}`);
      for (const c of conflicts) this.log(`ledger conflict: ${c.node} is ${c.have} but ${c.because} wants ${c.want}`);
      return this.defaultsList(r.sheet, session);
    });
  }

  /**
   * Consistency-aware defaulting of everything still open or skipped. Decisions are settled one at a time in
   * consequence order with hard edges propagated as each default lands, so the FINAL ledger is jointly
   * consistent — independent per-node argmax over a mixed particle set was not (measured: a normal 5-card
   * mock session shipped `user_accounts=none` beside a default whose hard edge demands `multi_user`, and
   * nothing between defaulting and delivery re-checked the edges). A value an earlier decision's edge already
   * forces is taken as forced; otherwise the likeliest option that contradicts nothing wins. Residual
   * conflicts (every option contradicts, or the settled ledger already disagreed with itself) are returned
   * for the caller to surface — and compile refuses on them.
   */
  private defaultOps(sheet: Sheet, session: SessionState): { ops: PatchOp[]; conflicts: PropagationResult["conflicts"]; notApplicable: string[] } {
    const nodes = session.belief.nodes;
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const assignment: Record<string, string> = {};
    const conf: Record<string, number> = {};
    for (const d of sheet.decisions) {
      if (!d.chosen || d.status === "open" || d.status === "skipped") continue;
      assignment[d.id] = d.chosen;
      conf[d.id] = d.status === "defaulted" ? d.confidence ?? 1 : 1;
    }
    const base = propagateHard(assignment, nodes);
    const conflicts = [...base.conflicts];
    const notApplicable: string[] = [];
    let current = base.assignment;
    const forced: PropagationResult["derived"] = { ...base.derived };
    const weight = (d: Decision) => session.consequence_override[d.id] ?? d.consequence;
    const todo = sheet.decisions
      .filter((d) => (d.status === "open" || d.status === "skipped") && byId.has(d.id))
      .sort((a, b) => weight(b) - weight(a) || a.id.localeCompare(b.id));
    const ops: PatchOp[] = [];
    for (const d of todo) {
      const node = byId.get(d.id)!;
      const f = forced[d.id];
      if (f) {
        // already demanded by a hard edge from the ledger (or an earlier default this pass); the fixpoint has
        // propagated its own consequences, so no re-propagation is needed
        const src = f.because.split("=")[0]!;
        const p = conf[src] ?? round(this.calibrate(maxOption(distribution(session.belief, src)).p));
        ops.push({ op: "set_decision", id: d.id, status: "defaulted", chosen: f.option, confidence: p, rationale: `follows from ${f.because}${p < 1 ? " (assumed)" : ""}` });
        conf[d.id] = p;
        continue;
      }
      // A gated child is defaulted from the belief CONDITIONED on its parents' values in the ledger being
      // built — the joint structure is already in the particles, and using it keeps "if invoices go out as
      // links, links never expire" coherent instead of averaging over worlds where invoices are PDFs.
      const belief = this.beliefGivenParents(session, node, current);
      const dist = distribution(belief, d.id);
      const ranked = Object.entries(dist).sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]));
      let pick: { option: string; p: number; prop: PropagationResult } | null = null;
      for (const [option, p] of ranked) {
        const trial = propagateHard({ ...current, [d.id]: option }, nodes, [d.id]);
        if (trial.conflicts.length) continue;
        pick = { option, p, prop: trial };
        break;
      }
      if (!pick) {
        // NO option of this decision can be true given what the design already settled, so the question does
        // not arise — it is dropped, not answered. (Measured: with `payments_in_app = none`, every option of
        // `payment_recording` implies that payments happen. Defaulting the argmax anyway wrote a contradiction
        // the owner could not fix in review, because every choice offered was impossible; compile then refused
        // and the session was stuck.) This is the planner's own `not_applicable` verdict, reached later.
        ops.push({ op: "remove_decision", id: d.id });
        notApplicable.push(d.id);
        continue;
      }
      const conditioned = belief !== session.belief;
      const p = round(this.calibrate(pick.p));
      ops.push({
        op: "set_decision",
        id: d.id,
        status: "defaulted",
        chosen: pick.option,
        confidence: p,
        rationale: d.status === "skipped" ? "skipped by user; defaulted" : conditioned ? "not asked; defaulted from what follows for this kind of app" : "not asked; defaulted from belief",
      });
      conf[d.id] = p;
      current = pick.prop.assignment;
      Object.assign(forced, pick.prop.derived);
    }
    return { ops, conflicts, notApplicable };
  }

  /**
   * The belief conditioned on a gated node's parents as settled in `settled` (hard conditioning, with the
   * honest fallback of `hypothetical`: if no particle holds the parent's value, the particle set cannot
   * represent that posterior, so keep the unconditional belief rather than inventing certainty from an
   * empty set). `settled` carries defaults chosen earlier in the same pass, not just committed decisions.
   */
  private beliefGivenParents(session: SessionState, node: NodeDef, settled: Record<string, string>): Belief {
    if (!node.requires?.length) return session.belief;
    let worlds = session.belief.worlds;
    for (const r of node.requires) {
      const chosen = settled[r.node];
      if (!chosen) continue;
      const kept = conditionHard(worlds, r.node, chosen);
      if (kept.length) worlds = kept;
    }
    return worlds === session.belief.worlds ? session.belief : { ...session.belief, worlds };
  }

  /** Hard-edge contradictions in the settled ledger (empty = consistent). Compile refuses on these. */
  async checkConsistency(projectId: string): Promise<PropagationResult["conflicts"]> {
    const { sheet, session } = await this.load(projectId);
    return ledgerConflicts(sheet.decisions, session.belief.nodes);
  }

  async getDefaults(projectId: string): Promise<DefaultItem[]> {
    const { sheet, session } = await this.load(projectId);
    return this.defaultsList(sheet, session);
  }

  private defaultsList(sheet: Sheet, session: SessionState): DefaultItem[] {
    const items: DefaultItem[] = [];
    for (const d of sheet.decisions) {
      if (d.status === "resolved" || d.status === "open") continue;
      const chosen = d.chosen ?? "";
      items.push({
        id: d.id,
        topic: d.topic,
        question: d.question,
        chosen,
        chosen_label: d.options.find((o) => o.id === chosen)?.label ?? chosen,
        status: d.status,
        confidence: d.confidence ?? 0,
        consequence: session.consequence_override[d.id] ?? d.consequence,
        why: d.rationale ?? (d.implied_by ? `because of ${d.implied_by}` : ""),
        options: d.options,
      });
    }
    // riskiest first: consequence × (1 − confidence)
    return items.sort((a, b) => b.consequence * (1 - b.confidence) - a.consequence * (1 - a.confidence) || b.consequence - a.consequence || a.id.localeCompare(b.id));
  }

  async overrideDefault(projectId: string, nodeId: string, optionId: string): Promise<{ version: number; implied: Implied }> {
    return this.withLock(projectId, async () => {
      const { sheet, session } = await this.load(projectId);
      const d = sheet.decisions.find((x) => x.id === nodeId);
      if (!d) throw new Error(`decision ${nodeId} not found`);
      const before = { status: d.status, chosen: d.chosen ?? null, confidence: d.confidence ?? null };
      // 1-based position in the riskiest-first review order at override time: the catch-rate report needs to
      // know whether wrong defaults are being caught at the top of the list or dug out from below the fold.
      const review_position = this.defaultsList(sheet, session).findIndex((x) => x.id === nodeId) + 1;
      const r = await this.commit(sheet, [{ op: "resolve_decision", id: nodeId, chosen: optionId, rationale: "corrected in defaults review" }], { kind: "defaults_review" }, `Default override: ${d.topic} → ${optionId}`, "defaults_review");
      if (!r.commit) throw new Error(r.rejected[0]?.error ?? "override rejected");
      const out = await this.propagateResolution(r.sheet, session, nodeId, optionId, { kind: "defaults_review" });
      session.updated_at = this.now();
      await this.store.saveSession(session);
      await this.emit(session, "default_overridden", { node: nodeId, before, after: optionId, consequence: session.consequence_override[nodeId] ?? d.consequence, review_position: review_position || null });
      return { version: out.sheet.version, implied: { hard: out.hard, soft: out.soft, contradictions: out.contradictions } };
    });
  }

  async acceptDefaults(projectId: string): Promise<void> {
    return this.withLock(projectId, async () => {
      const { sheet, session } = await this.load(projectId);
      // A review override can reopen stale gated children (propagateResolution's unlock). Anything still open
      // when the user accepts is defaulted here — consistency-aware, conditioned on the corrected parent — so
      // the compiling phase never starts with open decisions (compile refuses them).
      let current = sheet;
      if (sheet.decisions.some((d) => d.status === "open" || d.status === "skipped")) {
        const { ops, conflicts, notApplicable } = this.defaultOps(sheet, session);
        if (ops.length) {
          const r = await this.commit(sheet, ops, { kind: "default" }, `Defaulted ${ops.length} decision(s) reopened during review`, "default");
          current = r.sheet;
          await this.emit(session, "default_set", { count: ops.length, cards: session.cards.length, stop_reason: "review_accept", conflicts, not_applicable: notApplicable });
        }
      }
      await this.setPhase(session, "compiling");
      await this.emit(session, "defaults_accepted", { defaulted: current.decisions.filter((d) => d.status === "defaulted").length, resolved: current.decisions.filter((d) => d.status === "resolved").length });
    });
  }

  async markDone(projectId: string): Promise<void> {
    const { session } = await this.load(projectId);
    await this.setPhase(session, "done");
  }

  // ---------- reads ----------

  async getState(projectId: string) {
    const { sheet, session, project } = await this.load(projectId);
    const commits = await this.store.listCommits(projectId);
    return { sheet, session, project, commits };
  }
}

// ---------- helpers ----------

export function draftToOps(draft: Draft): PatchOp[] {
  const ops: PatchOp[] = [];
  const archetypes = draft.archetypes.filter((a) => (KNOWN_ARCHETYPES as readonly string[]).includes(a));
  ops.push({ op: "set_archetypes", archetypes: archetypes.length ? archetypes : ["other"] });
  for (const a of draft.actors) ops.push({ op: "add_actor", name: a.name, ...(a.description ? { description: a.description } : {}) });
  for (const n of draft.nouns) ops.push({ op: "add_noun", name: n.name, ...(n.description ? { description: n.description } : {}), fields_hint: n.fields_hint, ...(n.example ? { example: n.example } : {}) });
  for (const a of draft.actions) ops.push({ op: "add_action", actor: a.actor, verb: a.verb, object: a.object, ...(a.example ? { example: a.example } : {}) });
  for (const r of draft.rules) ops.push({ op: "add_rule", text: r.text, kind: r.kind, ...(r.example ? { example: r.example } : {}) });
  for (const g of draft.non_goals) ops.push({ op: "add_non_goal", text: g.text });
  return ops;
}

/**
 * Decisions that constrain world sampling: settled by the user (resolved), by logic (implied), delegated,
 * or fixed by the planner from an unambiguous Sheet (source "plan" — still correctable in review).
 *
 * For a defaulted decision, provenance is the lock, not confidence: soft implications write confidence ≥
 * softImplyTau (0.95) by construction, so a confidence-only filter froze belief-derived guesses as hard
 * sampling constraints — measured: 17 of 27 "fixed" after a 9-card session were pure belief guesses, and a
 * guess implied by a guess could never be resampled away. Only the planner's fixed_by_sheet writes a
 * defaulted decision with source "plan" (every set_decision re-stamps source), so the filter is structural.
 */
export function fixedAssignments(sheet: Sheet): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of sheet.decisions) {
    if (!d.chosen) continue;
    if (d.status === "resolved" || d.status === "implied" || d.status === "delegated") out[d.id] = d.chosen;
    else if (d.status === "defaulted" && (d.confidence ?? 0) >= 0.95 && d.source === "plan") out[d.id] = d.chosen;
  }
  return out;
}

function describe(nodes: NodeDef[], nodeId: string, optionId: string): string {
  const n = nodes.find((x) => x.id === nodeId);
  const label = n?.options.find((o) => o.id === optionId)?.label ?? optionId;
  return `${n?.topic ?? nodeId}: ${label}`;
}

function round(x: number): number {
  return Math.round(x * 1000) / 1000;
}

/** djb2 — stable across runs (unlike anything Math.random-seeded), for deterministic arm assignment. */
function hashCode(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
