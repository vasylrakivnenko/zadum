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
import { PROMPTS_VERSION } from "../llm/prompts.js";
import { KNOWN_ARCHETYPES, type LoadedCatalogs } from "./catalogs.js";
import { emptySheet, type Sheet, type Decision } from "../core/sheet.js";
import { makeCommit, revertOps, type Commit, type CommitSourceKind } from "../core/commit.js";
import type { PatchOp } from "../core/patch.js";
import { mergeCatalogs, nodeDefFromDecision, propagateHard, type NodeDef } from "../core/catalog.js";
import { conditionSoft, conditionHard, distribution, maxOption, topOptions, ess, repairAssignment, makeWorld, normalizeWeights, type Belief, type World } from "../core/worlds.js";
import { decideNext, impliedByUpdate, settledness, rankOpen, resolveConfig, type SelectorConfig, type Ranked } from "../core/selector.js";
import type { SessionState, Card, Answer, AnswerKind, ZEvent, EventType, ProjectRecord, Phase } from "../core/session.js";
import { loadRuleBank } from "./rule_bank.js";
import { augmentRulesFromBank } from "./rule_augment.js";

export interface EngineOptions {
  config?: Partial<SelectorConfig>;
  worldBatches?: number; // parallel sampler calls (default 3)
  worldsPerBatch?: number; // worlds per call (default 4)
  eagerWorlds?: boolean; // sample worlds right after the draft (default true)
  precompute?: boolean; // speculative generation of likely next cards (default true)
  now?: () => string;
  arm?: string; // experiment arm tag
  log?: (line: string) => void;
  ruleBankDir?: string; // defaults to catalogs/rule-bank/ (src/engine/rule_bank.ts's DEFAULT_RULE_BANK_DIR)
}

export type DealResult =
  | { kind: "card"; card: Card; settledness: number; remaining_estimate: number; top: { node: string; value: number }[] }
  | { kind: "stop"; reason: string; settledness: number };

export interface AnswerResult {
  answer: Answer;
  implied: { hard: { node: string; option: string }[]; soft: { node: string; option: string; p: number }[] };
  sheet_version: number;
  next: DealResult;
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
    this.config = resolveConfig(opts.config);
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
    session.config = resolveConfig({ ...session.config, ...(this.opts.config ?? {}) });
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
    const allNodes = [...nodes, ...bespokeDefs];
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

    if (this.opts.eagerWorlds ?? true) await this.sampleWorlds(id, "initial");
    const fresh = await this.load(id);
    return { project: fresh.project, sheet: fresh.sheet, session: fresh.session, draft, rejected: d.rejected.length };
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
        this.fns.sampleWorlds({ sheet, nodes: session.belief.nodes, fixed, count: per, batch: i, batches }),
      );
      const worlds: World[] = [];
      let repairs = 0;
      let conflicts = 0;
      results.forEach((res, bi) => {
        const raw = res.data.worlds;
        const totalW = raw.reduce((s, w) => s + Math.max(0.1, w.weight), 0) || 1;
        raw.forEach((w, wi) => {
          const asg: Record<string, string> = {};
          for (const a of w.assignment) asg[a.node] = a.option;
          for (const [k, v] of Object.entries(fixed)) asg[k] = v; // constraints always win
          const rep = repairAssignment(asg, session.belief.nodes);
          repairs += rep.repaired.length;
          conflicts += rep.conflicts.length;
          for (const [k, v] of Object.entries(fixed)) rep.assignment[k] = v;
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
        latency_ms: Date.now() - t0,
        usage: results.map((r) => r.usage),
        models: [...new Set(results.map((r) => r.model))],
      });
      return session.belief.worlds;
    });
  }

  // ---------- phase 2: correction moment ----------

  async applyUserEdit(projectId: string, text: string): Promise<{ version: number; applied: PatchOp[]; rejected: { op: PatchOp; error: string }[]; dropped: { op: string; reason: string }[]; notes: string; implied: { hard: { node: string; option: string }[]; soft: { node: string; option: string; p: number }[] } }> {
    return this.withLock(projectId, async () => {
      const { sheet, session } = await this.load(projectId);
      const res = await this.fns.patch({ sheet, decisions: sheet.decisions, text });
      const { ops, dropped } = toUserOps(res.data);
      const commitId = randomUUID();
      const { commit, result } = makeCommit(sheet, ops, { id: commitId, source: { kind: "user_edit", ref: commitId }, message: text.slice(0, 200), now: this.now(), itemSource: `user_edit:${commitId}` });
      let current = sheet;
      if (commit) {
        await this.store.appendCommit(commit);
        current = commit.sheet;
        const p = await this.store.getProject(projectId);
        if (p) await this.store.updateProject({ ...p, latest_version: commit.version, updated_at: this.now() });
      }
      // decisions resolved by the edit → update belief + propagate
      const resolvedNow = result.applied.filter((o): o is Extract<PatchOp, { op: "resolve_decision" }> => o.op === "resolve_decision");
      let implied = { hard: [] as { node: string; option: string }[], soft: [] as { node: string; option: string; p: number }[] };
      for (const r of resolvedNow) {
        const d = current.decisions.find((x) => x.id === r.id);
        if (!d?.chosen) continue;
        const out = await this.propagateResolution(current, session, d.id, d.chosen, { kind: "user_edit", ref: commitId });
        current = out.sheet;
        implied = { hard: [...implied.hard, ...out.hard], soft: [...implied.soft, ...out.soft] };
      }
      session.updated_at = this.now();
      await this.store.saveSession(session);
      await this.emit(session, "edit_applied", { text, ops: result.applied.length, rejected: result.rejected.map((r) => r.error), dropped, notes: res.data.notes, version: current.version, latency_ms: res.latency_ms, usage: res.usage });
      return { version: current.version, applied: result.applied, rejected: result.rejected, dropped, notes: res.data.notes, implied };
    });
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

  async currentCard(projectId: string): Promise<DealResult | null> {
    const { sheet, session } = await this.load(projectId);
    if (!session.pending_card) return null;
    return this.dealResultFor(sheet, session, session.pending_card);
  }

  private openIds(sheet: Sheet, session: SessionState): string[] {
    const nodeIds = new Set(session.belief.nodes.map((n) => n.id));
    return sheet.decisions.filter((d) => d.status === "open" && nodeIds.has(d.id)).map((d) => d.id);
  }

  private dealResultFor(sheet: Sheet, session: SessionState, card: Card): DealResult {
    const open = this.openIds(sheet, session);
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

  /** Decide the next card (or stop), generating it if not precomputed. Caller holds the lock. */
  private async deal(sheet: Sheet, session: SessionState): Promise<DealResult> {
    const open = this.openIds(sheet, session);
    const next = decideNext(session.belief, open, session.config, session.cards.length, session.consequence_override);
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
    const t0 = Date.now();
    const res = await this.fns.card({ sheet, node, options: top, also_sets: alsoSets, prior_answers: prior.slice(-6) });
    const options = top.map((t) => ({ option_id: t.option_id, label: t.label, scenario: res.data.options.find((o) => o.option_id === t.option_id)?.scenario?.trim() || t.label }));
    return { id: randomUUID(), node_id: node.id, context: res.data.context.trim(), options, also_sets: res.data.also_sets.slice(0, 5), created_at: this.now(), model: res.model, latency_ms: Date.now() - t0 };
  }

  /** Plain-language list of what else an answer settles: hard edges + soft implications under either option. */
  private alsoSets(sheet: Sheet, session: SessionState, node: NodeDef, optionIds: string[]): string[] {
    const out = new Set<string>();
    const open = new Set(this.openIds(sheet, session));
    for (const opt of optionIds) {
      const prop = propagateHard({ [node.id]: opt }, session.belief.nodes, [node.id]);
      for (const [n, d] of Object.entries(prop.derived)) if (open.has(n)) out.add(describe(session.belief.nodes, n, d.option));
      const hyp: Belief = { ...session.belief, worlds: conditionHard(session.belief.worlds, node.id, opt) };
      for (const n of open) {
        if (n === node.id) continue;
        const before = maxOption(distribution(session.belief, n)).p;
        const after = maxOption(distribution(hyp, n));
        if (before < session.config.tau && after.p >= session.config.tau) out.add(describe(session.belief.nodes, n, after.option));
      }
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
      const next = decideNext(hyp.belief, openAfter, session.config, session.cards.length + 1, session.consequence_override);
      if (next.action === "ask" && !targets.some((t) => t.nodeId === next.node.nodeId) && !session.precomputed[next.node.nodeId]) targets.push({ nodeId: next.node.nodeId, ranked: next.node });
    }
    if (!targets.length) return;
    const cards = await parallelMap(targets, 2, (t) => this.generateCard(sheet, session, t.ranked));
    await this.withLock(projectId, async () => {
      const fresh = await this.store.getSession(projectId);
      if (!fresh) return;
      cards.forEach((c, i) => {
        const nodeId = targets[i]!.nodeId;
        const stillOpen = fresh.belief.nodes.some((n) => n.id === nodeId);
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
      let implied: AnswerResult["implied"] = { hard: [], soft: [] };

      if (input.kind === "option") {
        const opt = node.options.find((o) => o.id === input.option_id);
        if (!opt) throw new Error(`option ${input.option_id} not on decision ${node.id}`);
        const r = await this.commit(current, [{ op: "resolve_decision", id: node.id, chosen: opt.id, rationale: `card answer: ${card.options.find((o) => o.option_id === opt.id)?.scenario ?? opt.label}` }], { kind: "card_answer", ref: card.id }, `Card ${session.cards.length}: ${node.topic} → ${opt.label}`, `card:${card.id}`);
        current = r.sheet;
        const out = await this.propagateResolution(current, session, node.id, opt.id, { kind: "card_answer", ref: card.id });
        current = out.sheet;
        implied = { hard: out.hard, soft: out.soft };
      } else if (input.kind === "you_decide") {
        const best = maxOption(distribution(session.belief, node.id));
        session.consequence_override[node.id] = 0;
        const r = await this.commit(current, [{ op: "set_decision", id: node.id, status: "delegated", chosen: best.option, confidence: best.p, rationale: "user: you decide" }], { kind: "card_answer", ref: card.id }, `Card ${session.cards.length}: ${node.topic} → you decide (${best.option})`, `card:${card.id}`);
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
          const resolvedIds = r.commit ? r.commit.ops.filter((o): o is Extract<PatchOp, { op: "resolve_decision" }> => o.op === "resolve_decision").map((o) => o.id) : [];
          for (const rid of resolvedIds) {
            const d = current.decisions.find((x) => x.id === rid);
            if (!d?.chosen) continue;
            const out = await this.propagateResolution(current, session, rid, d.chosen, { kind: "card_answer", ref: card.id });
            current = out.sheet;
            implied = { hard: [...implied.hard, ...out.hard], soft: [...implied.soft, ...out.soft] };
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
      await this.emit(session, "card_answered", { card_id: card.id, node: node.id, kind: input.kind, option: input.option_id ?? null, text: input.text ?? null, think_ms: input.think_ms ?? null, card_index: session.cards.length, implied_hard: implied.hard.length, implied_soft: implied.soft.length });
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
    const results = await parallelMap(Array.from({ length: batches }, (_, i) => i), 4, (i) => this.fns.sampleWorlds({ sheet, nodes: session.belief.nodes, fixed, count: per, batch: i, batches }));
    const worlds: World[] = [];
    results.forEach((res, bi) => {
      const raw = res.data.worlds;
      const totalW = raw.reduce((s, w) => s + Math.max(0.1, w.weight), 0) || 1;
      raw.forEach((w, wi) => {
        const asg: Record<string, string> = {};
        for (const a of w.assignment) asg[a.node] = a.option;
        for (const [k, v] of Object.entries(fixed)) asg[k] = v;
        const rep = repairAssignment(asg, session.belief.nodes);
        for (const [k, v] of Object.entries(fixed)) rep.assignment[k] = v;
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
  private async propagateResolution(sheet: Sheet, session: SessionState, nodeId: string, optionId: string, source: { kind: CommitSourceKind; ref?: string }): Promise<{ sheet: Sheet; hard: { node: string; option: string }[]; soft: { node: string; option: string; p: number }[] }> {
    const before: Belief = { ...session.belief, worlds: session.belief.worlds };
    // hard edges
    const prop = propagateHard({ [nodeId]: optionId }, session.belief.nodes, [nodeId]);
    const hard: { node: string; option: string }[] = [];
    const ops: PatchOp[] = [];
    for (const [n, d] of Object.entries(prop.derived)) {
      const dec = sheet.decisions.find((x) => x.id === n);
      if (!dec || dec.status === "resolved" || dec.status === "implied" || dec.status === "delegated") continue;
      hard.push({ node: n, option: d.option });
      ops.push({ op: "set_decision", id: n, status: "implied", chosen: d.option, confidence: 1, implied_by: nodeId, rationale: `follows from ${d.because}` });
    }
    // belief update
    let worlds = conditionSoft(session.belief.worlds, nodeId, optionId, session.config.epsilon);
    for (const h of hard) worlds = conditionSoft(worlds, h.node, h.option, session.config.epsilon);
    session.belief.worlds = worlds;
    // soft implications: open nodes that crossed tau
    const openNow = sheet.decisions.filter((d) => d.status === "open" && d.id !== nodeId && !hard.some((h) => h.node === d.id)).map((d) => d.id);
    const soft = impliedByUpdate(before, session.belief, openNow, session.config.softImplyTau, session.config.minImplyDelta);
    for (const s of soft) ops.push({ op: "set_decision", id: s.nodeId, status: "defaulted", chosen: s.option, confidence: round(s.p), implied_by: nodeId, rationale: `very likely given ${nodeId}=${optionId}` });
    let current = sheet;
    if (ops.length) {
      const r = await this.commit(current, ops, { kind: "implication", ref: source.ref }, `Implications of ${nodeId}=${optionId}: ${hard.length} hard, ${soft.length} likely`, `implied:${nodeId}`);
      current = r.sheet;
      await this.emit(session, "implications_applied", { node: nodeId, option: optionId, hard, soft: soft.map((s) => ({ node: s.nodeId, option: s.option, p: round(s.p) })), version: current.version, conflicts: prop.conflicts });
    }
    session.precomputed = Object.fromEntries(Object.entries(session.precomputed).filter(([k]) => current.decisions.find((d) => d.id === k)?.status === "open"));
    return { sheet: current, hard, soft: soft.map((s) => ({ node: s.nodeId, option: s.option, p: s.p })) };
  }

  async undoLast(projectId: string): Promise<DealResult | null> {
    return this.withLock(projectId, async () => {
      const { sheet, session } = await this.load(projectId);
      const snap = session.history.pop();
      if (!snap) return null;
      const target = await this.store.getSheetVersion(projectId, snap.sheet_version);
      if (!target) throw new Error(`missing snapshot v${snap.sheet_version}`);
      const r = await this.commit(sheet, revertOps(sheet, target), { kind: "undo", ref: snap.card_id }, `Undo answer to card ${snap.card_id}`, "undo");
      session.belief.worlds = snap.worlds;
      session.consequence_override = snap.consequence_override;
      session.answers = session.answers.filter((a) => a.card_id !== snap.card_id);
      const card = session.cards.find((c) => c.id === snap.card_id);
      session.cards = session.cards.filter((c) => c.id !== snap.card_id || c === card);
      session.precomputed = {};
      if (card) session.pending_card = card;
      session.updated_at = this.now();
      await this.store.saveSession(session);
      await this.emit(session, "card_answered", { card_id: snap.card_id, kind: "undo", version: r.sheet.version });
      return card ? this.dealResultFor(r.sheet, session, card) : null;
    });
  }

  // ---------- phase 4: defaults review ----------

  async finishCards(projectId: string): Promise<DefaultItem[]> {
    return this.withLock(projectId, async () => {
      const { sheet, session } = await this.load(projectId);
      const ops: PatchOp[] = [];
      for (const d of sheet.decisions) {
        if (d.status !== "open" && d.status !== "skipped") continue;
        if (!session.belief.nodes.some((n) => n.id === d.id)) continue;
        const best = maxOption(distribution(session.belief, d.id));
        ops.push({ op: "set_decision", id: d.id, status: "defaulted", chosen: best.option, confidence: round(best.p), rationale: d.status === "skipped" ? "skipped by user; defaulted" : "not asked; defaulted from belief" });
      }
      const r = await this.commit(sheet, ops, { kind: "default" }, `Defaulted ${ops.length} decisions after card loop`, "default");
      delete session.pending_card;
      await this.setPhase(session, "defaults_review");
      await this.emit(session, "default_set", { count: ops.length, cards: session.cards.length, stop_reason: session.last_stop_reason ?? null });
      return this.defaultsList(r.sheet, session);
    });
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

  async overrideDefault(projectId: string, nodeId: string, optionId: string): Promise<{ version: number; implied: { hard: { node: string; option: string }[]; soft: { node: string; option: string; p: number }[] } }> {
    return this.withLock(projectId, async () => {
      const { sheet, session } = await this.load(projectId);
      const d = sheet.decisions.find((x) => x.id === nodeId);
      if (!d) throw new Error(`decision ${nodeId} not found`);
      const before = { status: d.status, chosen: d.chosen ?? null, confidence: d.confidence ?? null };
      const r = await this.commit(sheet, [{ op: "resolve_decision", id: nodeId, chosen: optionId, rationale: "corrected in defaults review" }], { kind: "defaults_review" }, `Default override: ${d.topic} → ${optionId}`, "defaults_review");
      if (!r.commit) throw new Error(r.rejected[0]?.error ?? "override rejected");
      const out = await this.propagateResolution(r.sheet, session, nodeId, optionId, { kind: "defaults_review" });
      session.updated_at = this.now();
      await this.store.saveSession(session);
      await this.emit(session, "default_overridden", { node: nodeId, before, after: optionId, consequence: session.consequence_override[nodeId] ?? d.consequence });
      return { version: out.sheet.version, implied: { hard: out.hard, soft: out.soft } };
    });
  }

  async acceptDefaults(projectId: string): Promise<void> {
    return this.withLock(projectId, async () => {
      const { sheet, session } = await this.load(projectId);
      await this.setPhase(session, "compiling");
      await this.emit(session, "defaults_accepted", { defaulted: sheet.decisions.filter((d) => d.status === "defaulted").length, resolved: sheet.decisions.filter((d) => d.status === "resolved").length });
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
 * or fixed by the planner from an unambiguous Sheet (defaulted at confidence ≥ 0.95 — still correctable in review).
 */
export function fixedAssignments(sheet: Sheet): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of sheet.decisions) {
    if (!d.chosen) continue;
    if (d.status === "resolved" || d.status === "implied" || d.status === "delegated") out[d.id] = d.chosen;
    else if (d.status === "defaulted" && (d.confidence ?? 0) >= 0.95) out[d.id] = d.chosen;
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
