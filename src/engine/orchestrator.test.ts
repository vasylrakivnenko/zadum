import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { MemoryStore } from "../store/file_store.js";
import { MockLLM } from "../llm/client.js";
import { invoicingMockHandlers } from "../llm/mock_fixtures.js";
import { loadCatalogs } from "./catalogs.js";
import { Engine, fixedAssignments } from "./orchestrator.js";
import { compileProject } from "./compile.js";
import { DEFAULT_SELECTOR_CONFIG, DEFAULT_THETA, impliedByUpdate } from "../core/selector.js";
import { conditionHard, conditionSoft, distribution, ess, maxOption, type Belief } from "../core/worlds.js";
import { ledgerConflicts, propagateHard, type NodeDef } from "../core/catalog.js";
import { emptySheet, type Decision } from "../core/sheet.js";
import { makeCommit } from "../core/commit.js";
import { collectObservations } from "../learning/population_priors.js";

// This file is about the general engine loop, not the rule bank — point at a guaranteed-empty directory so
// these tests stay deterministic regardless of whether `catalogs/rule-bank/*.json` has been mined on disk
// (dedicated rule-bank behavior, with and without a real bank, is covered by rule_augment.test.ts).
let emptyRuleBankDir: string | undefined;
async function makeEngine(overrides: Partial<ConstructorParameters<typeof Engine>[3]> = {}) {
  if (!emptyRuleBankDir) emptyRuleBankDir = await fs.mkdtemp(path.join(os.tmpdir(), "no-rule-bank-"));
  const store = new MemoryStore();
  const llm = new MockLLM(invoicingMockHandlers);
  const catalogs = await loadCatalogs();
  const engine = new Engine(store, llm, catalogs, { precompute: false, ruleBankDir: emptyRuleBankDir, ...overrides });
  return { store, llm, engine };
}

describe("Engine end-to-end (mock LLM, memory store)", () => {
  it("drafts, plans, samples worlds, and commits everything", async () => {
    const { engine, store } = await makeEngine();
    const r = await engine.createProject("an invoicing app for small bookkeeping firms", { id: "p1" });
    expect(r.sheet.actors.map((a) => a.name)).toContain("Bookkeeper");
    expect(r.sheet.nouns.length).toBeGreaterThanOrEqual(4);
    expect(r.sheet.actions.every((a) => r.sheet.actors.some((x) => x.id === a.actor) && r.sheet.nouns.some((n) => n.id === a.object))).toBe(true);
    expect(r.sheet.archetypes).toEqual(["b2b-invoicing", "crud-saas"]);
    // planner: catalog nodes minus not_applicable, plus bespoke x1, tenancy fixed by sheet
    const ids = r.sheet.decisions.map((d) => d.id);
    expect(ids).toContain("external_access");
    expect(ids).toContain("x1");
    expect(ids).not.toContain("public_facing");
    expect(r.sheet.decisions.find((d) => d.id === "tenancy")?.status).toBe("defaulted");
    expect(r.sheet.decisions.find((d) => d.id === "payments_in_app")?.consequence).toBe(5);
    // worlds
    expect(r.session.belief.worlds.length).toBe(12);
    // Worlds are complete apart from decisions that cannot arise in them (every option would contradict a hard
    // edge that world already holds — e.g. how payments are recorded, in a world that takes no payments).
    // Those are left unassigned rather than filled with a contradiction; see resolveAssignment.
    const assignedCounts = r.session.belief.worlds.map((w) => Object.keys(w.assignment).length);
    expect(Math.max(...assignedCounts)).toBe(r.session.belief.nodes.length);
    expect(Math.min(...assignedCounts)).toBeGreaterThanOrEqual(r.session.belief.nodes.length - 2);
    expect(r.session.belief.worlds.every((w) => w.assignment.tenancy === "single_org")).toBe(true);
    expect(r.session.phase).toBe("correcting");
    const commits = await store.listCommits("p1");
    expect(commits.map((c) => c.source.kind)).toEqual(["draft", "plan"]);
    expect(commits.at(-1)!.version).toBe(2);
    const events = await store.listEvents("p1");
    expect(events.map((e) => e.type)).toEqual(["project_created", "draft_created", "plan_created", "worlds_sampled"]);
    expect(events[0]!.tags.catalog).toMatch(/core@/);
  });

  it("promises only the settlements the answer will really produce", async () => {
    // Regression: the card preview used HARD conditioning at the looser tau (0.9) while the engine really
    // applies soft ε-conditioning at softImplyTau (0.95) with a minImplyDelta rise (ADR-020). On this belief
    // the old predicate previewed 71 settlements for one card where the engine settles none — the UI slices to
    // 6, so every card showed six fabricated "this also settles …" promises.
    const { engine, llm } = await makeEngine();
    await engine.createProject("an invoicing app for small bookkeeping firms", { id: "pa1" });
    const deal = await engine.startCards("pa1");
    expect(deal.kind).toBe("card");
    if (deal.kind !== "card") return;
    const { sheet, session } = await engine.getState("pa1");
    const node = session.belief.nodes.find((n) => n.id === deal.card.node_id)!;
    const open = sheet.decisions.filter((d) => d.status === "open" && d.id !== node.id).map((d) => d.id);
    const label = (nodeId: string, optionId: string) => {
      const d = sheet.decisions.find((x) => x.id === nodeId);
      return `${d?.topic ?? nodeId}: ${d?.options.find((o) => o.id === optionId)?.label ?? optionId}`;
    };
    // what the engine would REALLY settle, under any option the card offers
    const real = new Set<string>();
    const loose = new Set<string>();
    for (const opt of deal.card.options.map((o) => o.option_id)) {
      for (const [n, d] of Object.entries(propagateHard({ [node.id]: opt }, session.belief.nodes, [node.id]).derived)) if (open.includes(n)) real.add(label(n, d.option));
      const after: Belief = { ...session.belief, worlds: conditionSoft(session.belief.worlds, node.id, opt, session.config.epsilon) };
      for (const s of impliedByUpdate(session.belief, after, open, session.config.softImplyTau, session.config.minImplyDelta)) real.add(label(s.nodeId, s.option));
      // the predicate this used to use, kept here to prove the guard is load-bearing rather than cosmetic
      const hard: Belief = { ...session.belief, worlds: conditionHard(session.belief.worlds, node.id, opt) };
      for (const n of open) {
        const before = maxOption(distribution(session.belief, n)).p;
        const a = maxOption(distribution(hard, n));
        if (before < session.config.tau && a.p >= session.config.tau) loose.add(label(n, a.option));
      }
    }
    const prompt = llm.calls.filter((c) => c.fn === "card").at(-1)!.user;
    const promised = (prompt.split("WHAT ELSE THIS SETTLES (raw):")[1] ?? "")
      .split("\n\n")[0]!
      .split("\n")
      .map((l) => l.replace(/^- /, "").trim())
      .filter((l) => l && l !== "(nothing else)");
    for (const p of promised) expect([...real]).toContain(p);
    expect(loose.size).toBeGreaterThan(real.size); // the old predicate really did over-promise here
  });

  it("re-derives what a changed answer had implied (Rule 3's 'unless contradicted')", async () => {
    // Regression: a hard edge that demanded a DIFFERENT option than a decision already carried was skipped
    // whenever that decision was already `implied` — so changing your mind left the old consequence standing
    // and the compiled spec shipped two contradictory decisions.
    const { engine } = await makeEngine();
    await engine.createProject("an invoicing app for small bookkeeping firms", { id: "pc1" });
    const first = await engine.overrideDefault("pc1", "payment_recording", "manual");
    expect(first.implied.hard).toContainEqual({ node: "payments_in_app", option: "record_only" });
    expect((await engine.getState("pc1")).sheet.decisions.find((d) => d.id === "payments_in_app")).toMatchObject({ status: "implied", chosen: "record_only" });
    // the user changes their mind: the old implication must follow, not linger
    const second = await engine.overrideDefault("pc1", "payment_recording", "online_auto");
    expect(second.implied.hard).toContainEqual({ node: "payments_in_app", option: "collect_online" });
    expect(second.implied.contradictions).toEqual([]);
    expect((await engine.getState("pc1")).sheet.decisions.find((d) => d.id === "payments_in_app")).toMatchObject({ status: "implied", chosen: "collect_online", implied_by: "payment_recording" });
  });

  it("a later answer that contradicts an earlier one reopens it — the ledger never holds both (Rule 3)", async () => {
    const { engine, store } = await makeEngine();
    await engine.createProject("an invoicing app for small bookkeeping firms", { id: "pc2" });
    // the user settles payments_in_app directly, then answers something whose hard edge wants the opposite
    await engine.overrideDefault("pc2", "payments_in_app", "record_only");
    const r = await engine.overrideDefault("pc2", "payment_recording", "online_auto");
    expect(r.implied.hard.map((h) => h.node)).not.toContain("payments_in_app"); // an explicit answer is never silently flipped
    expect(r.implied.contradictions).toEqual([{ node: "payments_in_app", had: "record_only", wants: "collect_online", because: "payment_recording=online_auto" }]);
    // the collision is on the record AND the contradicted answer is reopened — Rule 3's sanctioned re-ask
    const { sheet, session } = await engine.getState("pc2");
    expect(sheet.decisions.find((d) => d.id === "payments_in_app")).toMatchObject({ status: "open" });
    expect(sheet.decisions.find((d) => d.id === "payments_in_app")?.chosen).toBeUndefined();
    expect(ledgerConflicts(sheet.decisions, session.belief.nodes)).toEqual([]); // the ledger itself is consistent
    const contradicted = (await store.listEvents("pc2")).filter((e) => e.type === "implications_applied" && Array.isArray(e.payload.contradictions) && (e.payload.contradictions as unknown[]).length);
    expect(contradicted.length).toBe(1);
    // never revisited → the next defaulting pass settles it consistently with the newer answer's edge
    await engine.finishCards("pc2");
    expect((await engine.getState("pc2")).sheet.decisions.find((d) => d.id === "payments_in_app")).toMatchObject({ status: "defaulted", chosen: "collect_online" });
    expect((await engine.getState("pc2")).sheet.decisions.find((d) => d.id === "payments_in_app")?.rationale).toMatch(/follows from payment_recording=online_auto/);
  });

  it("applies a plain-language correction as a commit and propagates implications", async () => {
    const { engine, store } = await makeEngine();
    await engine.createProject("an invoicing app for small bookkeeping firms", { id: "p2" });
    const e = await engine.applyUserEdit("p2", "Clients log into a portal to see and pay their invoices");
    expect(e.applied.map((o) => o.op)).toEqual(["resolve_decision"]);
    const { sheet } = await engine.getState("p2");
    expect(sheet.decisions.find((d) => d.id === "external_access")).toMatchObject({ status: "resolved", chosen: "portal" });
    // hard edge: portal ⇒ user_accounts = multi_user
    expect(e.implied.hard).toContainEqual({ node: "user_accounts", option: "multi_user" });
    expect(sheet.decisions.find((d) => d.id === "user_accounts")).toMatchObject({ status: "implied", chosen: "multi_user", implied_by: "external_access" });
    const commits = await store.listCommits("p2");
    expect(commits.map((c) => c.source.kind)).toEqual(["draft", "plan", "user_edit", "implication"]);
    // rename via edit
    const e2 = await engine.applyUserEdit("p2", "rename Service to Offering");
    expect(e2.applied).toHaveLength(1);
    const s2 = (await engine.getState("p2")).sheet;
    expect(s2.nouns.map((n) => n.name)).toContain("Offering");
    expect(s2.nouns.map((n) => n.name)).not.toContain("Service");
  });

  it("runs the card loop: never re-asks, applies implications, stops, defaults, compiles", async () => {
    const { engine, store } = await makeEngine();
    await engine.createProject("an invoicing app for small bookkeeping firms", { id: "p3" });
    let res = await engine.startCards("p3");
    const asked: string[] = [];
    const optionCounts: number[] = [];
    let guard = 0;
    while (res.kind === "card" && guard++ < 20) {
      expect(asked).not.toContain(res.card.node_id); // Rule 3
      asked.push(res.card.node_id);
      // cards show up to maxCardOptions (default 4) of a node's real options, not always exactly 2
      expect(res.card.options.length).toBeGreaterThanOrEqual(2);
      expect(res.card.options.length).toBeLessThanOrEqual(4);
      expect(new Set(res.card.options.map((o) => o.option_id)).size).toBe(res.card.options.length); // no duplicate options
      expect(res.card.context.length).toBeGreaterThan(5);
      optionCounts.push(res.card.options.length);
      const ans = await engine.answerCard("p3", { kind: "option", option_id: res.card.options[0]!.option_id, think_ms: 900 });
      res = ans.next;
    }
    expect(res.kind).toBe("stop");
    // the feature is actually exercised, not vacuously always 2: with this catalog's diffuse mock belief,
    // most cards should show more than 2 real options
    expect(optionCounts.some((c) => c > 2)).toBe(true);
    expect(asked.length).toBeLessThanOrEqual(12); // Rule 7
    const state = await engine.getState("p3");
    expect(state.session.cards.length).toBe(asked.length);
    const resolved = state.sheet.decisions.filter((d) => d.status === "resolved");
    expect(resolved.length).toBe(asked.length);
    // nothing asked was derivable at the time (Rule 4) — every asked node had maxP < tau when shown
    const shown = (await store.listEvents("p3")).filter((e) => e.type === "card_shown");
    expect(shown.every((e) => (e.payload.maxP as number) < 0.9)).toBe(true);
    expect(shown.every((e) => (e.payload.value1 as number) >= DEFAULT_THETA[DEFAULT_SELECTOR_CONFIG.scoring])).toBe(true);
    expect(shown.every((e) => (e.payload.share as number) > 0 && (e.payload.share as number) <= 1)).toBe(true);

    const defaults = await engine.finishCards("p3");
    expect((await engine.getState("p3")).session.phase).toBe("defaults_review");
    expect((await engine.getState("p3")).sheet.decisions.every((d) => d.status !== "open")).toBe(true);
    expect(defaults[0]!.consequence * (1 - defaults[0]!.confidence)).toBeGreaterThanOrEqual(defaults.at(-1)!.consequence * (1 - defaults.at(-1)!.confidence));
    // override a default and make sure it becomes resolved
    const target = defaults.find((d) => d.status === "defaulted" && d.options.length > 1)!;
    const other = target.options.find((o) => o.id !== target.chosen)!;
    const ov = await engine.overrideDefault("p3", target.id, other.id);
    expect(ov.version).toBeGreaterThan(state.sheet.version);
    expect((await engine.getState("p3")).sheet.decisions.find((d) => d.id === target.id)).toMatchObject({ status: "resolved", chosen: other.id });
    // the override may contradict an earlier card answer — the engine reports it and reopens that answer, and
    // acceptDefaults settles anything reopened consistently, so the flow below needs no manual alignment
    await engine.acceptDefaults("p3");

    const c = await compileProject(engine, "p3", { story: true, roundTrip: true });
    expect(c.spec).toContain("# Specification");
    expect(c.spec).toContain("## Rules & invariants");
    expect(c.critic.verdict).toBe("pass");
    expect(c.roundtrip!.recall.nouns).toBeGreaterThan(0.9);
    expect(c.roundtrip!.recall.rules).toBeGreaterThan(0.9);
    expect(c.bundle.map((b) => b.name)).toEqual(["spec.md", "design-sheet.md", "design-sheet.json", "AGENTS.md", "sheet-tests.ts", "compile-report.json", "story.md"]);
    expect((await store.listArtifacts("p3")).length).toBe(7);
    // the 9k-handoff protocol: spec is reference, low-confidence decisions are flagged for confirmation
    const agentsMd = c.bundle.find((b) => b.name === "AGENTS.md")!.content;
    expect(agentsMd).toMatch(/as REFERENCE/);
    expect(agentsMd).toMatch(/Confirm-first protocol/);
    expect(agentsMd).toMatch(/confidence under 80%/);
    const stubs = c.bundle.find((b) => b.name === "sheet-tests.ts")!.content;
    for (const r of (await engine.getState("p3")).sheet.rules) expect(stubs).toContain(`${r.id} (`);
    expect(stubs).toContain("it.todo(");
    expect(c.blocking).toEqual([]); // the deterministic gate: nothing mechanical stands in the way of delivery
    expect((await engine.getState("p3")).session.phase).toBe("done");
    const types = (await store.listEvents("p3")).map((e) => e.type);
    expect(types).toContain("card_loop_stopped");
    expect(types).toContain("default_overridden");
    expect(types).toContain("compile_done");
  });

  it("stamps a spec that failed its critic so it cannot pass for a delivered one (Rule 6)", async () => {
    const store = new MemoryStore();
    const failing = {
      ...invoicingMockHandlers,
      critic: () => ({
        violations: [{ rule_id: "r1", severity: "high" as const, where: "Rules & invariants", why: "contradicts r1", fix_hint: "restate it" }],
        omissions: [],
        score: 4,
        verdict: "fail" as const,
      }),
    };
    const engine = new Engine(store, new MockLLM(failing), await loadCatalogs(), { precompute: false, ruleBankDir: emptyRuleBankDir });
    await engine.createProject("an invoicing app for small bookkeeping firms", { id: "p9" });
    await engine.finishCards("p9");
    await engine.acceptDefaults("p9");
    const c = await compileProject(engine, "p9", { story: false, roundTrip: false, criticLoops: 1 });
    expect(c.critic.verdict).toBe("fail");
    // the bundle is still written (a minute of compute is not thrown away) but is unmistakably a draft
    const spec = c.bundle.find((b) => b.name === "spec.md")!.content;
    const agents = c.bundle.find((b) => b.name === "AGENTS.md")!.content;
    expect(spec).toMatch(/DID NOT PASS REVIEW/);
    expect(spec).toContain("contradicts r1");
    expect(agents).toMatch(/did not pass its critic review/);
    expect(JSON.parse(c.bundle.find((b) => b.name === "compile-report.json")!.content).critic_passed).toBe(false);
    // and phase must NOT advance to done
    expect((await engine.getState("p9")).session.phase).not.toBe("done");
  });

  it("supports you-decide, skip, other, and undo", async () => {
    const { engine } = await makeEngine();
    await engine.createProject("an invoicing app for small bookkeeping firms", { id: "p4" });
    const first = await engine.startCards("p4");
    expect(first.kind).toBe("card");
    if (first.kind !== "card") return;
    const node1 = first.card.node_id;
    const a1 = await engine.answerCard("p4", { kind: "you_decide" });
    let s = (await engine.getState("p4")).sheet;
    expect(s.decisions.find((d) => d.id === node1)?.status).toBe("delegated");
    expect(a1.next.kind).toBe("card");
    if (a1.next.kind !== "card") return;
    // undo brings the same card back and restores the decision
    const back = await engine.undoLast("p4");
    expect(back?.kind).toBe("card");
    if (back?.kind === "card") expect(back.card.node_id).toBe(node1);
    s = (await engine.getState("p4")).sheet;
    expect(s.decisions.find((d) => d.id === node1)?.status).toBe("open");
    // skip
    const a2 = await engine.answerCard("p4", { kind: "skip" });
    s = (await engine.getState("p4")).sheet;
    expect(s.decisions.find((d) => d.id === node1)?.status).toBe("skipped");
    expect(a2.next.kind).toBe("card");
    if (a2.next.kind !== "card") return;
    expect(a2.next.card.node_id).not.toBe(node1);
    // other with free text that resolves a different decision
    const a3 = await engine.answerCard("p4", { kind: "other", text: "we need recurring invoices every month" });
    s = (await engine.getState("p4")).sheet;
    expect(s.decisions.find((d) => d.id === "recurring_invoices")).toMatchObject({ status: "resolved", chosen: "yes" });
    expect(s.decisions.find((d) => d.id === "recurring_scheduled")).toMatchObject({ status: "implied", chosen: "recurring_records" });
    expect(["card", "stop"]).toContain(a3.next.kind);
  });

  it("undo revokes the auto-dealt follow-up card instead of burning a Rule-7 slot", async () => {
    // Regression: answering auto-deals the next card; undoing the answer restored the undone card as pending
    // but left the follow-up in session.cards, so the re-answer dealt its node AGAIN — each undo permanently
    // ate one of the 12 card slots (the selector stops on session.cards.length) and drifted card_index.
    const { engine } = await makeEngine();
    await engine.createProject("an invoicing app for small bookkeeping firms", { id: "p7" });
    const first = await engine.startCards("p7");
    expect(first.kind).toBe("card");
    if (first.kind !== "card") return;
    // "about N more" and `top` describe what comes AFTER this card, so they must exclude its own node
    expect(first.top.every((t) => t.node !== first.card.node_id)).toBe(true);
    const a1 = await engine.answerCard("p7", { kind: "option", option_id: first.card.options[0]!.option_id });
    expect(a1.next.kind).toBe("card");
    expect((await engine.getState("p7")).session.cards.length).toBe(2); // answered + follow-up pending
    await engine.undoLast("p7");
    const afterUndo = (await engine.getState("p7")).session;
    expect(afterUndo.cards.length).toBe(1); // the follow-up was un-shown along with the answer
    expect(afterUndo.pending_card?.id).toBe(first.card.id);
    const a2 = await engine.answerCard("p7", { kind: "option", option_id: first.card.options[0]!.option_id });
    expect(a2.next.kind).toBe("card");
    const s = (await engine.getState("p7")).session;
    expect(s.cards.length).toBe(2); // not 3: the budget reflects questions actually standing
    expect(new Set(s.cards.map((c) => c.node_id)).size).toBe(s.cards.length); // no node counted twice
  });

  it("a patch-added decision option reaches the belief, not just the Sheet", async () => {
    // Regression: `add_decision_option` committed to the Sheet but belief.nodes is fixed at planning time, so
    // the user's own option could never be shown on a card, sampled, or defaulted — and answering with it threw.
    await makeEngine(); // ensures emptyRuleBankDir exists
    const blank = { ref: "", name: "", description: "", fields_hint: [] as string[], example: "", actor: "", verb: "", object: "", text: "", kind: "" as const, id: "", chosen: "", rationale: "", option_id: "", option_label: "" };
    const custom = {
      ...invoicingMockHandlers,
      patcher: () => ({
        ops: [
          { ...blank, op: "add_decision_option" as const, id: "external_access", option_id: "api_only", option_label: "Through an API only" },
          { ...blank, op: "resolve_decision" as const, id: "external_access", chosen: "api_only", rationale: "user wants API-only access" },
        ],
        notes: "added and chose a new option",
      }),
    };
    const engine = new Engine(new MemoryStore(), new MockLLM(custom), await loadCatalogs(), { precompute: false, ruleBankDir: emptyRuleBankDir });
    await engine.createProject("an invoicing app for small bookkeeping firms", { id: "p8" });
    const e = await engine.applyUserEdit("p8", "clients should only reach us through an API");
    expect(e.applied.map((o) => o.op)).toEqual(["add_decision_option", "resolve_decision"]);
    const { sheet, session } = await engine.getState("p8");
    expect(sheet.decisions.find((d) => d.id === "external_access")).toMatchObject({ status: "resolved", chosen: "api_only" });
    const node = session.belief.nodes.find((n) => n.id === "external_access")!;
    expect(node.options.map((o) => o.id)).toContain("api_only");
    expect(node.implies.api_only).toEqual([]);
    expect(Object.values(node.prior).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    expect(node.prior.api_only).toBeGreaterThan(0);
    // the belief distribution now knows the option exists
    expect(Object.keys(distribution(session.belief, "external_access"))).toContain("api_only");
  });

  it("continueCards overrides a converged stop for the REST of the loop, still capped by Rule 7", async () => {
    const big = await makeEngine({ config: { theta: 1e6 } as never });
    await big.engine.createProject("an invoicing app for small bookkeeping firms", { id: "p11" });
    const stopped = await big.engine.startCards("p11");
    expect(stopped.kind).toBe("stop");
    if (stopped.kind !== "stop") return;
    expect(stopped.reason).toBe("converged");
    // the user says "keep going": θ is re-priced at ~0 for the whole rest of the loop, not one card
    let res = await big.engine.continueCards("p11");
    expect(res.kind).toBe("card");
    let n = 0;
    while (res.kind === "card" && n < 30) {
      n++;
      expect(res.card.phrasing_arm).toBeDefined(); // loop B: every card carries its arm
      res = (await big.engine.answerCard("p11", { kind: "option", option_id: res.card.options[0]!.option_id })).next;
    }
    expect(n).toBeGreaterThan(1); // it kept dealing without another continueCards call
    expect(n).toBeLessThanOrEqual(12); // Rule 7 still binds
    if (res.kind === "stop") expect(["max_cards", "no_open"]).toContain(res.reason); // never "converged" again
  });

  it("story corrections ride the Rule-1 patch path with their own commit source and event", async () => {
    const { engine, store } = await makeEngine();
    await engine.createProject("an invoicing app for small bookkeeping firms", { id: "p12" });
    const r = await engine.applyStoryCorrection("p12", "we need recurring invoices every month");
    expect(r.applied.map((o) => o.op)).toEqual(["resolve_decision"]);
    const { sheet } = await engine.getState("p12");
    expect(sheet.decisions.find((d) => d.id === "recurring_invoices")).toMatchObject({ status: "resolved", chosen: "yes" });
    const commits = await store.listCommits("p12");
    expect(commits.map((c) => c.source.kind)).toContain("story_correction");
    expect((await store.listEvents("p12")).map((e) => e.type)).toContain("story_corrected");
  });

  it("a recalibration map tempers reported default confidences without touching the selector", async () => {
    // A one-knot map ("whatever the belief claims, observed accuracy is 60%"): defaults must REPORT 0.6, while
    // the asked-node sequence (selector behavior) stays exactly the un-mapped engine's. An identity-flagged
    // map (not enough data) must leave every confidence untouched — a bin-level reader once coarsened them.
    const oneKnot = { version: 1 as const, total_n: 100, min_n: 30, identity: false, knots: [{ x: 0.5, y: 0.6 }], bins: [] };
    const identity = { version: 1 as const, total_n: 3, min_n: 30, identity: true, knots: [], bins: [] };
    const plain = await makeEngine();
    const mapped = await makeEngine({ recalibration: oneKnot });
    const untouched = await makeEngine({ recalibration: identity });
    for (const { engine } of [plain, mapped, untouched]) {
      await engine.createProject("an invoicing app for small bookkeeping firms", { id: "p13" });
      await engine.finishCards("p13");
    }
    const [plainDefaults, mappedDefaults, untouchedDefaults] = await Promise.all([plain.engine.getDefaults("p13"), mapped.engine.getDefaults("p13"), untouched.engine.getDefaults("p13")]);
    // only belief-derived confidences go through the map; the planner's fixed_by_sheet 0.95 is a policy
    // constant the reliability curve was never fitted on, so it stays as-is
    const fromBelief = (ds: typeof plainDefaults) => ds.filter((d) => d.status === "defaulted" && d.why.includes("defaulted from belief"));
    expect(fromBelief(mappedDefaults).length).toBeGreaterThan(3);
    expect(fromBelief(mappedDefaults).every((d) => d.confidence === 0.6)).toBe(true);
    expect(fromBelief(plainDefaults).some((d) => d.confidence !== 0.6)).toBe(true);
    expect(untouchedDefaults.map((d) => [d.id, d.confidence])).toEqual(plainDefaults.map((d) => [d.id, d.confidence]));
    expect(mappedDefaults.map((d) => d.id).sort()).toEqual(plainDefaults.map((d) => d.id).sort());
  });

  it("absorbEvidence reweights the whole belief toward evidence-fitting worlds without touching the Sheet", async () => {
    const { engine, store } = await makeEngine();
    await engine.createProject("an invoicing app for small bookkeeping firms", { id: "p14" });
    const s0 = (await store.getSession("p14"))!;
    // pick a node where worlds genuinely disagree, and a world holding its minority option
    const disagreeing = s0.belief.nodes.find((n) => new Set(s0.belief.worlds.map((w) => w.assignment[n.id])).size > 1)!;
    const counts = new Map<string, number>();
    for (const w of s0.belief.worlds) counts.set(w.assignment[disagreeing.id]!, (counts.get(w.assignment[disagreeing.id]!) ?? 0) + 1);
    const minority = [...counts.entries()].sort((a, b) => a[1] - b[1])[0]![0];
    const champion = s0.belief.worlds.find((w) => w.assignment[disagreeing.id] === minority)!;
    const custom = {
      ...invoicingMockHandlers,
      world_likelihoods: (req: { user: string }) => ({
        likelihoods: [...req.user.matchAll(/^- ([\w.]+): /gm)].map((m) => ({ world_id: m[1]!, fit: m[1] === champion.id ? ("very_likely" as const) : ("very_unlikely" as const) })),
      }),
    };
    const engine2 = new Engine(engine.store, new MockLLM(custom as never), engine.catalogs, { precompute: false, ruleBankDir: emptyRuleBankDir });
    // capture the scalar BEFORE the call: MemoryStore returns live references and the engine updates in place
    const pMinorityBefore = distribution(s0.belief, disagreeing.id)[minority]!;
    const sheetBefore = JSON.stringify((await engine2.getState("p14")).sheet);
    const r = await engine2.absorbEvidence("p14", "we are exactly the kind of shop that wants the unusual setup");
    const s1 = (await store.getSession("p14"))!;
    const pMinority = distribution(s1.belief, disagreeing.id)[minority]!;
    expect(pMinority).toBeGreaterThan(pMinorityBefore); // shifted toward the evidence
    expect(r.ess_after).toBeLessThan(r.ess_before); // concentration increased
    expect(s1.belief.worlds.every((w) => w.weight > 0)).toBe(true); // floor kept support
    expect(JSON.stringify((await engine2.getState("p14")).sheet)).toBe(sheetBefore); // Rule 1: belief only, never the Sheet
    expect((await store.listEvents("p14")).map((e) => e.type)).toContain("evidence_absorbed");
  });

  it("hierarchically gated child nodes unlock only when their parent is settled at user grade", async () => {
    const { engine } = await makeEngine();
    await engine.createProject("an invoicing app for small bookkeeping firms", { id: "p15" });
    const { sheet, session } = await engine.getState("p15");
    const child = session.belief.nodes.find((n) => n.id === "link_expiry");
    expect(child?.requires?.[0]?.node).toBe("invoice_delivery"); // pilot child present in the belief
    expect(sheet.decisions.some((d) => d.id === "link_expiry")).toBe(true); // and on the Sheet
    // children are sampled into every world from the start
    expect(session.belief.worlds.every((w) => w.assignment.link_expiry !== undefined)).toBe(true);
    // gated while the parent is open…
    const deal0 = await engine.startCards("p15");
    if (deal0.kind === "card") expect(deal0.card.node_id).not.toBe("link_expiry");
    // …unlocked once the parent is RESOLVED to a qualifying option
    await engine.overrideDefault("p15", "invoice_delivery", "hosted_link");
    const open = (await engine.getState("p15")).sheet.decisions.filter((d) => d.status === "open").map((d) => d.id);
    expect(open).toContain("link_expiry"); // still open on the Sheet, and now askable — verified via a fresh deal ranking
    // a defaulted (assumption-grade) parent must NOT unlock children: check the other pilot child stays gated
    const gated = (await engine.getState("p15")).sheet.decisions.find((d) => d.id === "late_fee_basis");
    expect(gated?.status).toBe("open"); // open on the Sheet…
    // …but never dealt while late_fees is merely open/defaulted (no card for it in a full auto loop)
    let res = await engine.currentCard("p15") ?? deal0;
    const asked: string[] = [];
    let guard = 0;
    while (res.kind === "card" && guard++ < 20) {
      asked.push(res.card.node_id);
      res = (await engine.answerCard("p15", { kind: "option", option_id: res.card.options[0]!.option_id })).next;
    }
    expect(asked).not.toContain("late_fee_basis");
    await engine.finishCards("p15");
    // gated children still get honestly defaulted at finish
    expect((await engine.getState("p15")).sheet.decisions.find((d) => d.id === "late_fee_basis")?.status).toBe("defaulted");
  });

  it("verification: scenarios bundle mid-probability defaults; accept confirms, reject+correction resolves", async () => {
    const { engine, store } = await makeEngine();
    await engine.createProject("an invoicing app for small bookkeeping firms", { id: "p16" });
    await engine.finishCards("p16"); // 0 cards → pure-defaults regime, the verification sweet spot
    const v1 = await engine.getVerification("p16", { maxProbes: 3 });
    expect(v1.probes.length).toBeGreaterThan(0);
    const probe = v1.probes[0]!;
    expect(probe.scenario.length).toBeGreaterThan(20);
    expect(probe.nodes.length).toBeGreaterThanOrEqual(1);
    expect(probe.p_all_correct).toBeGreaterThan(0.2); // the composer targets ~0.5
    expect(probe.p_all_correct).toBeLessThan(0.8);
    // accept: bundled defaults get confirmed (confidence refreshed, still defaulted), event emitted
    const acc = await engine.answerVerification("p16", { probe_id: probe.id, ok: true });
    expect(acc.confirmed.length).toBeGreaterThan(0);
    const afterAccept = (await engine.getState("p16")).sheet;
    for (const id of acc.confirmed) expect(afterAccept.decisions.find((d) => d.id === id)?.rationale).toBe("confirmed in a story check");
    // reject with a correction: the named decision becomes RESOLVED via the Rule-1 path
    const v2 = await engine.getVerification("p16", { maxProbes: 3 });
    const p2 = v2.probes[0]!;
    const wrong = p2.nodes[0]!;
    const d = (await engine.getState("p16")).sheet.decisions.find((x) => x.id === wrong.node_id)!;
    const other = d.options.find((o) => o.id !== d.chosen)!;
    await engine.answerVerification("p16", { probe_id: p2.id, ok: false, correction: { node_id: wrong.node_id, option_id: other.id } });
    expect((await engine.getState("p16")).sheet.decisions.find((x) => x.id === wrong.node_id)).toMatchObject({ status: "resolved", chosen: other.id });
    const types = (await store.listEvents("p16")).map((e) => e.type);
    expect(types.filter((t) => t === "verification_shown").length).toBe(2);
    expect(types.filter((t) => t === "verification_answered").length).toBe(2);
    const commits = await store.listCommits("p16");
    expect(commits.map((c) => c.source.kind)).toContain("verification");
  });

  it("a run of story-check accepts does not deplete the belief (bounded ε + rejuvenation)", async () => {
    // Regression: a flat accept-ε made one 6-node accept six times the evidence of a 1-node accept, and there
    // was no ESS guard — six accepts drove ESS 5.98 → 1.01 (minEss 4), collapsing the belief every later
    // probe, default and gap card reads.
    const { engine, store } = await makeEngine();
    await engine.createProject("an invoicing app for small bookkeeping firms", { id: "p17" });
    await engine.finishCards("p17");
    for (let i = 0; i < 6; i++) {
      const v = await engine.getVerification("p17", { maxProbes: 1 });
      if (!v.probes.length) break;
      await engine.answerVerification("p17", { probe_id: v.probes[0]!.id, ok: true });
      const s = (await store.getSession("p17"))!;
      expect(ess(s.belief.worlds)).toBeGreaterThanOrEqual(s.config.minEss);
    }
  });

  it("gap mining opens a NEW card round when the session already spent its 12 (Rule 7 caps a sitting)", async () => {
    // Regression: cards.length is a lifetime counter, so a user who spent all 12 cards, compiled, and then
    // asked for the spec's own gaps got STOP max_cards — the questions they explicitly requested were never
    // asked and shipped as silent 50% assumptions.
    const { engine } = await makeEngine({ config: { theta: 0.0001 } as never });
    await engine.createProject("an invoicing app for small bookkeeping firms", { id: "p18" });
    let res = await engine.startCards("p18");
    let n = 0;
    while (res.kind === "card" && n++ < 30) res = (await engine.answerCard("p18", { kind: "option", option_id: res.card.options[0]!.option_id })).next;
    expect(n).toBe(12);
    expect(res.kind === "stop" && res.reason).toBe("max_cards");
    await engine.finishCards("p18");
    await engine.acceptDefaults("p18");
    await compileProject(engine, "p18", { story: false, roundTrip: false });
    const g = await engine.mineSpecGaps("p18", { apply: 2 });
    expect(g.applied.length).toBe(2);
    const next = await engine.startCards("p18");
    expect(next.kind).toBe("card"); // the requested questions are actually asked
    if (next.kind === "card") expect(g.applied).toContain(next.card.node_id);
    // the new round is capped at what was asked for, and never exceeds Rule 7
    const s = (await engine.getState("p18")).session;
    expect(s.round_max_cards).toBe(2);
    expect(s.round_max_cards!).toBeLessThanOrEqual(s.config.maxCards);
  });

  it("resolving a parent in review reopens its stale gated children and defaults them conditionally", async () => {
    // Regression: gated children were defaulted from the UNCONDITIONAL belief while their parent pointed
    // elsewhere, and a review-time parent resolution (exactly where wrong parents get fixed) left them frozen.
    const { engine, store } = await makeEngine();
    await engine.createProject("an invoicing app for small bookkeeping firms", { id: "p19" });
    await engine.finishCards("p19");
    const child = (await engine.getState("p19")).sheet.decisions.find((d) => d.id === "link_expiry")!;
    expect(child.status).toBe("defaulted");
    // conditional defaulting: the child's default is taken under its parent's settled value, not the average
    const s = (await store.getSession("p19"))!;
    const sheetNow = (await engine.getState("p19")).sheet;
    const parentChosen = sheetNow.decisions.find((d) => d.id === "invoice_delivery")!.chosen!;
    const conditioned = maxOption(distribution({ ...s.belief, worlds: conditionHard(s.belief.worlds, "invoice_delivery", parentChosen) }, "link_expiry"));
    expect(child.chosen).toBe(conditioned.option);
    expect(child.rationale).toMatch(/for this kind of app|defaulted from belief/);
    // a later parent RESOLUTION reopens the stale child so it can be asked/verified/reviewed
    await engine.overrideDefault("p19", "invoice_delivery", "hosted_link");
    expect((await engine.getState("p19")).sheet.decisions.find((d) => d.id === "link_expiry")?.status).toBe("open");
    const implied = (await store.listEvents("p19")).filter((e) => e.type === "implications_applied" && Array.isArray(e.payload.unlocked) && (e.payload.unlocked as string[]).includes("link_expiry"));
    expect(implied.length).toBe(1);
  });

  it("gap mining applies EXACTLY the selected candidates when ids are given (a prefix is not a selection)", async () => {
    const { engine } = await makeEngine();
    await engine.createProject("an invoicing app for small bookkeeping firms", { id: "p20" });
    await engine.finishCards("p20");
    await engine.acceptDefaults("p20");
    await compileProject(engine, "p20", { story: false, roundTrip: false });
    const preview = await engine.mineSpecGaps("p20");
    expect(preview.candidates.length).toBeGreaterThan(1);
    const second = preview.candidates[1]!.id; // deliberately NOT the top-ranked one
    const applied = await engine.mineSpecGaps("p20", { applyIds: [second] });
    expect(applied.applied).toEqual([second]);
    const ids = (await engine.getState("p20")).sheet.decisions.map((d) => d.id);
    expect(ids).toContain(second);
    expect(ids).not.toContain(preview.candidates[0]!.id); // the unchecked top candidate did NOT ride along
  });

  it("planNext ranks a card, a story check and a review tap on one scale", async () => {
    const { engine } = await makeEngine();
    await engine.createProject("an invoicing app for small bookkeeping firms", { id: "p21" });
    await engine.finishCards("p21"); // 0 cards → everything defaulted, all three instruments available
    const plan = await engine.planNext("p21");
    expect(plan.length).toBeGreaterThan(0);
    expect(plan.map((p) => p.kind)).toContain("verify");
    for (let i = 1; i < plan.length; i++) expect(plan[i - 1]!.value).toBeGreaterThanOrEqual(plan[i]!.value);
  });

  it("sampled worlds never violate a hard edge (no impossible worlds in the belief)", async () => {
    // Regression: `fixed` constraints were forced ON TOP of a repaired sample, so a world could keep a
    // logically impossible pair — repairAssignment reports collisions but never overwrites. Measured on real
    // session logs: 971 surviving violations across 39 sampling calls. Those worlds carried weight in every
    // marginal the selector, the defaults and the soft implications read.
    const { engine } = await makeEngine();
    await engine.createProject("an invoicing app for small bookkeeping firms", { id: "w1" });
    const check = async () => {
      const { session } = await engine.getState("w1");
      for (const w of session.belief.worlds) {
        const conflicts = propagateHard(w.assignment, session.belief.nodes).conflicts;
        expect({ world: w.id, conflicts }).toEqual({ world: w.id, conflicts: [] });
        // complete except decisions that do not ARISE in this world (every option would contradict it)
        const missing = session.belief.nodes.filter((n) => w.assignment[n.id] === undefined);
        for (const n of missing) expect(n.options.every((o) => propagateHard({ ...w.assignment, [n.id]: o.id }, session.belief.nodes, [n.id]).conflicts.length > 0)).toBe(true);
      }
      return session.belief.worlds.length;
    };
    expect(await check()).toBe(12);
    // …and after answers force more constraints, and after a resample
    let res = await engine.startCards("w1");
    let n = 0;
    while (res.kind === "card" && n++ < 4) res = (await engine.answerCard("w1", { kind: "option", option_id: res.card.options[0]!.option_id })).next;
    await check();
    await engine.sampleWorlds("w1", "resample");
    await check();
  });

  it("a soft implication is never written against a hard edge (a likelihood cannot outrank a rule)", () => {
    // Direct guard on what we WRITE: the Sheet can hold a value no world does (a user's typed answer), so
    // ledger consistency cannot rely on the belief being consistent.
    const nodes: NodeDef[] = [
      { id: "A", topic: "a", question: "a?", options: [{ id: "a1", label: "a1" }, { id: "a2", label: "a2" }], consequence: 3, prior: { a1: 0.5, a2: 0.5 }, implies: { a1: [{ node: "B", option: "b1" }], a2: [] }, sections: [], bespoke: false, archetype: "core" },
      { id: "B", topic: "b", question: "b?", options: [{ id: "b1", label: "b1" }, { id: "b2", label: "b2" }], consequence: 3, prior: { b1: 0.5, b2: 0.5 }, implies: { b1: [], b2: [] }, sections: [], bespoke: false, archetype: "core" },
    ];
    // A=a1 forces B=b1, so a "very likely B=b2" must be dropped, not written beside it
    expect(propagateHard({ A: "a1", B: "b2" }, nodes).conflicts).toHaveLength(1);
    expect(propagateHard({ A: "a1", B: "b1" }, nodes).conflicts).toEqual([]);
  });

  it("settling the TARGET of a hard edge reopens a source that now implies something else", async () => {
    // Regression: hard edges are directional and propagateHard only walks FORWARD from what was just settled,
    // so answering a decision that is the target of an edge left the source standing with a value implying
    // something else. Found live: correcting payments_in_app → none in a story check while
    // payment_recording=online_auto stood (which implies collect_online) shipped a contradictory ledger that
    // only the compile gate caught.
    const { engine } = await makeEngine();
    await engine.createProject("an invoicing app for small bookkeeping firms", { id: "q10" });
    await engine.overrideDefault("q10", "payment_recording", "online_auto");
    expect((await engine.getState("q10")).sheet.decisions.find((d) => d.id === "payments_in_app")).toMatchObject({ chosen: "collect_online" });
    // now settle the TARGET the other way — nothing propagates backward, so the source must be reopened
    await engine.overrideDefault("q10", "payments_in_app", "none");
    const { sheet, session } = await engine.getState("q10");
    expect(sheet.decisions.find((d) => d.id === "payments_in_app")).toMatchObject({ status: "resolved", chosen: "none" });
    expect(sheet.decisions.find((d) => d.id === "payment_recording")?.status).toBe("open");
    expect(ledgerConflicts(sheet.decisions, session.belief.nodes)).toEqual([]);
    // and a decision with no option left compatible is dropped as not applicable, not forced to contradict
    await engine.finishCards("q10");
    const after = await engine.getState("q10");
    expect(after.sheet.decisions.some((d) => d.id === "payment_recording")).toBe(false);
    expect(ledgerConflicts(after.sheet.decisions, after.session.belief.nodes)).toEqual([]);
    expect(after.sheet.decisions.every((d) => d.status !== "open" && d.status !== "skipped")).toBe(true);
  });

  it("finishCards ships a jointly consistent ledger (external review claim 1)", async () => {
    // Regression: per-node marginal argmax over a mixed particle set is jointly inconsistent — a normal
    // 5-card mock session shipped user_accounts=none beside a default whose hard edge demands multi_user,
    // and nothing between defaulting and delivery re-checked the edges.
    const { engine } = await makeEngine();
    await engine.createProject("an invoicing app for small bookkeeping firms", { id: "q1" });
    let res = await engine.startCards("q1");
    let n = 0;
    while (res.kind === "card" && n++ < 5) res = (await engine.answerCard("q1", { kind: "option", option_id: res.card.options[0]!.option_id })).next;
    await engine.finishCards("q1");
    const { sheet, session } = await engine.getState("q1");
    expect(sheet.decisions.every((d) => d.status !== "open" && d.status !== "skipped")).toBe(true);
    expect(ledgerConflicts(sheet.decisions, session.belief.nodes)).toEqual([]);
    expect(await engine.checkConsistency("q1")).toEqual([]);
    // and the same holds for the 0-card pure-defaults regime
    const zero = await makeEngine();
    await zero.engine.createProject("an invoicing app for small bookkeeping firms", { id: "q1z" });
    await zero.engine.finishCards("q1z");
    expect(await zero.engine.checkConsistency("q1z")).toEqual([]);
  });

  it("ledgerConflicts reports hard-edge contradictions between settled decisions", () => {
    const nodes: NodeDef[] = [
      { id: "A", topic: "a", question: "a?", options: [{ id: "a1", label: "a1" }, { id: "a2", label: "a2" }], consequence: 3, prior: { a1: 0.5, a2: 0.5 }, implies: { a1: [{ node: "B", option: "b1" }], a2: [] }, sections: [], bespoke: false, archetype: "core" },
      { id: "B", topic: "b", question: "b?", options: [{ id: "b1", label: "b1" }, { id: "b2", label: "b2" }], consequence: 3, prior: { b1: 0.5, b2: 0.5 }, implies: { b1: [], b2: [] }, sections: [], bespoke: false, archetype: "core" },
    ];
    const contradictory = [
      { id: "A", chosen: "a1", status: "defaulted" },
      { id: "B", chosen: "b2", status: "defaulted" },
    ];
    expect(ledgerConflicts(contradictory, nodes)).toEqual([{ node: "B", have: "b2", want: "b1", because: "A=a1" }]);
    // an open decision is not part of the settled ledger, and a consistent ledger is clean
    expect(ledgerConflicts([{ id: "A", chosen: "a1", status: "defaulted" }, { id: "B", status: "open" }], nodes)).toEqual([]);
    expect(ledgerConflicts([{ id: "A", chosen: "a1", status: "resolved" }, { id: "B", chosen: "b1", status: "defaulted" }], nodes)).toEqual([]);
  });

  it("fixedAssignments locks only user-grade and planner-stated decisions (external review claim 2)", async () => {
    // Regression: soft implications write confidence ≥ softImplyTau (0.95) by construction, so a
    // confidence-only filter froze belief-derived guesses as hard sampling constraints — measured: 17 of 27
    // "fixed" after a 9-card session were pure belief guesses, unfixable by any later resample.
    const sheet = emptySheet("t", "test");
    const dec = (id: string, status: Decision["status"], source: string, confidence?: number): Decision => ({
      id, topic: id, question: `${id}?`, options: [{ id: "x", label: "x" }, { id: "y", label: "y" }], chosen: "x", status, ...(confidence !== undefined ? { confidence } : {}), consequence: 3, source,
    });
    sheet.decisions = [
      dec("user_answered", "resolved", "card:c1"),
      dec("logically_implied", "implied", "implied:user_answered", 1),
      dec("user_delegated", "delegated", "card:c2", 0.8),
      dec("planner_stated", "defaulted", "plan", 0.95),
      dec("soft_implication", "defaulted", "implied:user_answered", 0.97), // the regression: a guess implied by an answer
      dec("belief_guess", "defaulted", "default", 0.99), // and a finishCards default, however confident
      dec("planner_low", "defaulted", "plan", 0.7),
      dec("still_open", "open", "plan"),
    ];
    expect(Object.keys(fixedAssignments(sheet)).sort()).toEqual(["logically_implied", "planner_stated", "user_answered", "user_delegated"]);
    // engine-level: after a pure-defaults session, no belief-derived default is a sampling constraint
    const { engine } = await makeEngine();
    await engine.createProject("an invoicing app for small bookkeeping firms", { id: "q2" });
    await engine.finishCards("q2");
    const s = (await engine.getState("q2")).sheet;
    const fixed = fixedAssignments(s);
    const byId = new Map(s.decisions.map((d) => [d.id, d]));
    for (const id of Object.keys(fixed)) {
      const d = byId.get(id)!;
      expect(d.status !== "defaulted" || d.source === "plan").toBe(true);
    }
    // non-vacuous: confident belief-derived defaults exist and are NOT locked
    const guesses = s.decisions.filter((d) => d.status === "defaulted" && (d.confidence ?? 0) >= 0.95 && d.source !== "plan");
    expect(guesses.length).toBeGreaterThan(0);
    for (const g of guesses) expect(fixed[g.id]).toBeUndefined();
  });

  it("undo of a card keeps the work committed after it (external review claim 3)", async () => {
    // Regression: undo reverted the WHOLE sheet to the pre-answer snapshot, deleting an edit made between
    // the answer and the undo (measured: a noun added by an edit vanished when the card was undone).
    const { engine } = await makeEngine();
    await engine.createProject("an invoicing app for small bookkeeping firms", { id: "q3" });
    const first = await engine.startCards("q3");
    expect(first.kind).toBe("card");
    if (first.kind !== "card") return;
    await engine.answerCard("q3", { kind: "option", option_id: first.card.options[0]!.option_id });
    // an interleaved user edit: resolves external_access=portal, whose hard edge implies user_accounts
    await engine.applyUserEdit("q3", "Clients log into a portal to see and pay their invoices");
    const back = await engine.undoLast("q3");
    expect(back?.kind).toBe("card");
    if (back?.kind === "card") expect(back.card.node_id).toBe(first.card.node_id);
    const s = (await engine.getState("q3")).sheet;
    // the undone answer is gone…
    expect(s.decisions.find((d) => d.id === first.card.node_id)?.status).toBe("open");
    // …but the edit made AFTER it survives, implication and all
    expect(s.decisions.find((d) => d.id === "external_access")).toMatchObject({ status: "resolved", chosen: "portal" });
    expect(s.decisions.find((d) => d.id === "user_accounts")).toMatchObject({ status: "implied", chosen: "multi_user" });
    // and the follow-up card is still un-shown (the clean-path behavior holds)
    expect((await engine.getState("q3")).session.cards.length).toBe(1);
  });

  it("compile refuses an unfinished ledger; draft compiles are stamped and never done (claim 4a)", async () => {
    const { engine } = await makeEngine();
    await engine.createProject("an invoicing app for small bookkeeping firms", { id: "q4" });
    // straight to compile with dozens of open decisions: refused with an actionable message
    await expect(compileProject(engine, "q4", { story: false, roundTrip: false })).rejects.toThrow(/cannot compile: .*open/);
    // the escape hatch compiles, but the result is unmistakably a draft and the phase never reaches done
    const r = await compileProject(engine, "q4", { story: false, roundTrip: false, draft: true });
    expect(r.spec).toMatch(/UNFINISHED LEDGER/);
    expect(r.bundle.find((b) => b.name === "AGENTS.md")!.content).toMatch(/is a draft/);
    const report = JSON.parse(r.bundle.find((b) => b.name === "compile-report.json")!.content) as { open_decisions: number };
    expect(report.open_decisions).toBeGreaterThan(0);
    expect((await engine.getState("q4")).session.phase).not.toBe("done");
  });

  it("contradictory answers self-heal: reopen → consistent default → clean compile, no manual alignment", async () => {
    const { engine } = await makeEngine();
    await engine.createProject("an invoicing app for small bookkeeping firms", { id: "q5" });
    // the user creates a real contradiction: resolves payments_in_app, then an answer whose edge wants the opposite
    await engine.overrideDefault("q5", "payments_in_app", "record_only");
    const r = await engine.overrideDefault("q5", "payment_recording", "online_auto");
    expect(r.implied.contradictions.length).toBe(1);
    await engine.finishCards("q5");
    await engine.acceptDefaults("q5");
    const c = await compileProject(engine, "q5", { story: false, roundTrip: false });
    expect(c.conflicts).toEqual([]);
    expect((await engine.getState("q5")).sheet.decisions.find((d) => d.id === "payments_in_app")).toMatchObject({ chosen: "collect_online" });
    expect((await engine.getState("q5")).session.phase).toBe("done");
  });

  it("compile's conflict gate is the backstop for a ledger corrupted outside the engine's own paths", async () => {
    const { engine, store } = await makeEngine();
    await engine.createProject("an invoicing app for small bookkeeping firms", { id: "q5b" });
    await engine.finishCards("q5b");
    await engine.acceptDefaults("q5b");
    // write two contradictory resolutions directly (no propagation ran — simulating older data / a raw import)
    const { sheet } = await engine.getState("q5b");
    const { commit } = makeCommit(
      sheet,
      [
        { op: "resolve_decision", id: "payment_recording", chosen: "online_auto", rationale: "raw" },
        { op: "resolve_decision", id: "payments_in_app", chosen: "record_only", rationale: "raw" },
      ],
      { id: "raw1", source: { kind: "system" }, message: "raw import", now: new Date().toISOString() },
    );
    await store.appendCommit(commit!);
    await expect(compileProject(engine, "q5b", { story: false, roundTrip: false })).rejects.toThrow(/contradicts itself/);
    expect((await engine.getState("q5b")).session.phase).not.toBe("done");
  });

  it("reopening a contradicted answer also reopens what it had implied (no stale derivations)", async () => {
    const { engine } = await makeEngine();
    await engine.createProject("an invoicing app for small bookkeeping firms", { id: "q8" });
    // user_accounts=none implies roles/invite_flow/identity_provider/concurrency — a whole derived subtree
    await engine.overrideDefault("q8", "user_accounts", "none");
    const before = (await engine.getState("q8")).sheet;
    const derived = before.decisions.filter((d) => d.implied_by === "user_accounts" && d.status === "implied").map((d) => d.id);
    expect(derived.length).toBeGreaterThanOrEqual(3);
    // …then the user answers something whose edge demands the opposite of that root
    const r = await engine.overrideDefault("q8", "external_access", "portal");
    expect(r.implied.contradictions).toEqual([{ node: "user_accounts", had: "none", wants: "multi_user", because: "external_access=portal" }]);
    const after = (await engine.getState("q8")).sheet;
    expect(after.decisions.find((d) => d.id === "user_accounts")?.status).toBe("open");
    for (const id of derived) expect(after.decisions.find((d) => d.id === id)?.status).toBe("open"); // stale subtree reopened with it
    // the whole thing settles consistently at the next defaulting pass
    await engine.finishCards("q8");
    const { sheet, session } = await engine.getState("q8");
    expect(sheet.decisions.find((d) => d.id === "user_accounts")).toMatchObject({ status: "defaulted", chosen: "multi_user" });
    expect(ledgerConflicts(sheet.decisions, session.belief.nodes)).toEqual([]);
  });

  it("a delegated ('you decide') value contradicted by a later answer is re-derived, not silently left", async () => {
    const { engine, store } = await makeEngine();
    await engine.createProject("an invoicing app for small bookkeeping firms", { id: "q9" });
    const { sheet } = await engine.getState("q9");
    const { commit } = makeCommit(sheet, [{ op: "set_decision", id: "payments_in_app", status: "delegated", chosen: "record_only", confidence: 0.6, rationale: "user: you decide" }], { id: "del1", source: { kind: "system" }, message: "delegate", now: new Date().toISOString() });
    await store.appendCommit(commit!);
    const r = await engine.overrideDefault("q9", "payment_recording", "online_auto");
    expect(r.implied.contradictions).toEqual([]); // no user opinion was at stake — nothing to report as a conflict
    expect(r.implied.hard).toContainEqual({ node: "payments_in_app", option: "collect_online" });
    expect((await engine.getState("q9")).sheet.decisions.find((d) => d.id === "payments_in_app")).toMatchObject({ status: "implied", chosen: "collect_online", implied_by: "payment_recording" });
  });

  it("a compile the Sheet moved under is stamped stale and not marked done (claim 4b)", async () => {
    const { engine, store } = await makeEngine();
    await engine.createProject("an invoicing app for small bookkeeping firms", { id: "q6" });
    await engine.finishCards("q6");
    await engine.acceptDefaults("q6");
    // simulate a mid-compile edit: after compile's initial read, the latest sheet carries a rule the compiled
    // one does not. Staleness is judged on CONTENT (sheetFingerprint), so the edit has to be a real one.
    let calls = 0;
    const realGet = store.getLatestSheet.bind(store);
    store.getLatestSheet = async (id: string) => {
      const s = await realGet(id);
      calls += 1;
      return s && calls > 1 ? { ...s, version: s.version + 1, rules: [...s.rules, { id: "r99", text: "An invoice may never be sent twice.", kind: "state" as const, source: "user_edit:x" }] } : s;
    };
    const r = await compileProject(engine, "q6", { story: false, roundTrip: false });
    expect(r.stale).toBe(true);
    expect(r.spec).toMatch(/STALE/);
    expect(JSON.parse(r.bundle.find((b) => b.name === "compile-report.json")!.content).stale).toBe(true);
    expect((await engine.getState("q6")).session.phase).not.toBe("done");
  });

  it("a Sheet that moved without changing anything the spec is built from is NOT stale (claim 4c)", async () => {
    // The live regression: a background story check raised three confidences from 95% to 97%, bumping the
    // version. The spec was stamped STALE and, because `done` requires a fresh Sheet, the project was
    // stranded in "compiling" forever — over a change no artifact in the bundle can see.
    const { engine, store } = await makeEngine();
    await engine.createProject("an invoicing app for small bookkeeping firms", { id: "q6b" });
    await engine.finishCards("q6b");
    await engine.acceptDefaults("q6b");
    let calls = 0;
    const realGet = store.getLatestSheet.bind(store);
    store.getLatestSheet = async (id: string) => {
      const s = await realGet(id);
      calls += 1;
      if (!s || calls <= 1) return s;
      // a confidence bump on an already-confident decision: no answer changes, no confirm-first row changes
      const decisions = s.decisions.map((d) => (d.status === "defaulted" && (d.confidence ?? 0) >= 0.9 ? { ...d, confidence: Math.min(0.99, (d.confidence ?? 0.9) + 0.02) } : d));
      return { ...s, version: s.version + 1, decisions };
    };
    const r = await compileProject(engine, "q6b", { story: false, roundTrip: false });
    expect(r.stale).toBe(false);
    expect(r.spec).not.toMatch(/STALE/);
    const report = JSON.parse(r.bundle.find((b) => b.name === "compile-report.json")!.content);
    expect(report.stale).toBe(false);
    expect(report.sheet_moved).toBe(true); // still reported honestly, just not disqualifying
  });

  it("acceptDefaults re-defaults children reopened during review, so compiling never starts open", async () => {
    const { engine } = await makeEngine();
    await engine.createProject("an invoicing app for small bookkeeping firms", { id: "q7" });
    await engine.finishCards("q7");
    // a review-time parent resolution reopens its stale gated child…
    await engine.overrideDefault("q7", "invoice_delivery", "hosted_link");
    expect((await engine.getState("q7")).sheet.decisions.find((d) => d.id === "link_expiry")?.status).toBe("open");
    // …and accepting the review must not carry that open decision into compiling
    await engine.acceptDefaults("q7");
    const { sheet, session } = await engine.getState("q7");
    expect(session.phase).toBe("compiling");
    expect(sheet.decisions.find((d) => d.id === "link_expiry")?.status).toBe("defaulted");
    expect(sheet.decisions.every((d) => d.status !== "open" && d.status !== "skipped")).toBe(true);
  });

  it("spec feedback lands on the SHEET, not the spec text, and survives the next compile", async () => {
    const { engine, store } = await makeEngine();
    await engine.createProject("an invoicing app for small bookkeeping firms", { id: "r1" });
    await engine.finishCards("r1");
    await engine.acceptDefaults("r1");
    await compileProject(engine, "r1", { story: false, roundTrip: false });
    const before = (await engine.getState("r1")).sheet;

    const r = await engine.refineFromSpecFeedback("r1", { comments: [{ quote: "Clients sign in to a portal", text: "This is wrong — our clients never log in, we email everything." }] });
    // the correction is a Sheet change, with provenance
    expect(r.extraction.wrong_assumptions[0]).toMatchObject({ node: "external_access", should_be: expect.any(String) });
    expect(r.version).toBeGreaterThan(before.version);
    const after = (await engine.getState("r1")).sheet;
    expect(after.decisions.find((d) => d.id === "external_access")).toMatchObject({ status: "resolved", chosen: "none" });
    const commits = await store.listCommits("r1");
    expect(commits.at(-1)!.source.kind).toBe("spec_feedback");
    // and it is recorded as learning signal, with the four classified lists…
    const ev = (await store.listEvents("r1")).filter((e) => e.type === "spec_refined");
    expect(ev).toHaveLength(1);
    expect((ev[0]!.payload.extraction as { wrong_assumptions: unknown[] }).wrong_assumptions).toHaveLength(1);
    // …and a machine-readable correction (validated option id) that reaches the observation store
    expect(ev[0]!.payload.corrections).toEqual([{ node: "external_access", option: "none" }]);
    const obs = await collectObservations(store, ["r1"]);
    expect(obs.filter((o) => o.source === "refinement")).toEqual([expect.objectContaining({ node: "external_access", option: "none" })]);
    // the correction survives a recompile because it changed the source of truth
    await engine.acceptDefaults("r1");
    const c2 = await compileProject(engine, "r1", { story: false, roundTrip: false });
    expect(c2.sheet_version).toBeGreaterThan(before.version);
  });

  it("feedback that opens a real choice becomes an open QUESTION, not a fresh guess", async () => {
    const { engine } = await makeEngine();
    await engine.createProject("an invoicing app for small bookkeeping firms", { id: "r2" });
    await engine.finishCards("r2");
    await engine.acceptDefaults("r2");
    await compileProject(engine, "r2", { story: false, roundTrip: false });
    const r = await engine.refineFromSpecFeedback("r2", { comments: [{ text: "we also handle refunds sometimes" }] });
    expect(r.added_decisions.length).toBeGreaterThan(0);
    const id = r.added_decisions[0]!;
    const { sheet, session } = await engine.getState("r2");
    expect(sheet.decisions.find((d) => d.id === id)).toMatchObject({ status: "open" });
    expect(session.belief.nodes.some((n) => n.id === id)).toBe(true); // askable, not stranded
    expect(r.extraction.new_questions[0]!.question).toMatch(/refund/i);
    // a new round is opened so the loop actually deals it (Rule 7 caps a sitting, not a lifetime)
    expect(session.phase).toBe("cards");
    const next = await engine.startCards("r2");
    expect(next.kind).toBe("card");
    if (next.kind === "card") expect(r.added_decisions).toContain(next.card.node_id);
    // …and compile now refuses until that question is settled — the honest consequence, not an error
    await expect(compileProject(engine, "r2", { story: false, roundTrip: false })).rejects.toThrow(/cannot compile/);
  });

  it("an edited spec is understood as a diff of what changed, not as two whole documents", async () => {
    const { engine, llm } = await makeEngine();
    await engine.createProject("an invoicing app for small bookkeeping firms", { id: "r3" });
    await engine.finishCards("r3");
    await engine.acceptDefaults("r3");
    const c = await compileProject(engine, "r3", { story: false, roundTrip: false });
    const edited = `${c.spec}\n\nWe also track a Purchase order for every job.\n`;
    const r = await engine.refineFromSpecFeedback("r3", { edited });
    const sent = llm.calls.filter((x) => x.fn === "spec_feedback").at(-1)!.user;
    expect(sent).toContain("@@ line"); // hunks, not the whole spec
    expect(sent.length).toBeLessThan(c.spec.length); // the 45k-char document was never re-sent
    expect(r.extraction.missing_elements[0]).toMatchObject({ kind: "noun" });
    expect((await engine.getState("r3")).sheet.nouns.map((n) => n.name)).toContain("Purchase order");
  });

  it("refining with nothing to say is refused rather than burning a model call", async () => {
    const { engine, llm } = await makeEngine();
    await engine.createProject("an invoicing app for small bookkeeping firms", { id: "r4" });
    const before = llm.calls.length;
    await expect(engine.refineFromSpecFeedback("r4", { comments: [{ text: "   " }] })).rejects.toThrow(/no feedback/);
    expect(llm.calls.length).toBe(before);
  });

  it("stops immediately when theta is huge and asks more when theta is tiny (bounded by 12)", async () => {
    const big = await makeEngine({ config: { theta: 1e6 } as never });
    await big.engine.createProject("an invoicing app for small bookkeeping firms", { id: "p5" });
    expect((await big.engine.startCards("p5")).kind).toBe("stop");
    const small = await makeEngine({ config: { theta: 0.0001 } as never });
    await small.engine.createProject("an invoicing app for small bookkeeping firms", { id: "p6" });
    let res = await small.engine.startCards("p6");
    let n = 0;
    while (res.kind === "card" && n < 30) {
      n++;
      res = (await small.engine.answerCard("p6", { kind: "option", option_id: res.card.options[0]!.option_id })).next;
    }
    expect(n).toBeLessThanOrEqual(12);
    if (res.kind === "stop") expect(["max_cards", "no_open", "converged"]).toContain(res.reason);
  });
});
