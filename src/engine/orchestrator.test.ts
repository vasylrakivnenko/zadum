import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { MemoryStore } from "../store/file_store.js";
import { MockLLM } from "../llm/client.js";
import { invoicingMockHandlers } from "../llm/mock_fixtures.js";
import { loadCatalogs } from "./catalogs.js";
import { Engine } from "./orchestrator.js";
import { compileProject } from "./compile.js";
import { DEFAULT_SELECTOR_CONFIG, DEFAULT_THETA, impliedByUpdate } from "../core/selector.js";
import { conditionHard, conditionSoft, distribution, maxOption, type Belief } from "../core/worlds.js";
import { propagateHard } from "../core/catalog.js";

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
    expect(r.session.belief.worlds.every((w) => Object.keys(w.assignment).length === r.session.belief.nodes.length)).toBe(true);
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

  it("never overwrites a decision the user resolved themselves, and reports the collision", async () => {
    const { engine, store } = await makeEngine();
    await engine.createProject("an invoicing app for small bookkeeping firms", { id: "pc2" });
    // the user settles payments_in_app directly, then answers something whose hard edge wants the opposite
    await engine.overrideDefault("pc2", "payments_in_app", "record_only");
    const r = await engine.overrideDefault("pc2", "payment_recording", "online_auto");
    expect(r.implied.hard.map((h) => h.node)).not.toContain("payments_in_app");
    expect(r.implied.contradictions).toEqual([{ node: "payments_in_app", had: "record_only", wants: "collect_online", because: "payment_recording=online_auto" }]);
    // the user's own answer stands (Rule 3), and the collision is on the record rather than silently dropped
    expect((await engine.getState("pc2")).sheet.decisions.find((d) => d.id === "payments_in_app")).toMatchObject({ status: "resolved", chosen: "record_only" });
    const contradicted = (await store.listEvents("pc2")).filter((e) => e.type === "implications_applied" && Array.isArray(e.payload.contradictions) && (e.payload.contradictions as unknown[]).length);
    expect(contradicted.length).toBe(1);
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
    await engine.acceptDefaults("p3");

    const c = await compileProject(engine, "p3", { story: true, roundTrip: true });
    expect(c.spec).toContain("# Specification");
    expect(c.spec).toContain("## Rules & invariants");
    expect(c.critic.verdict).toBe("pass");
    expect(c.roundtrip!.recall.nouns).toBeGreaterThan(0.9);
    expect(c.roundtrip!.recall.rules).toBeGreaterThan(0.9);
    expect(c.bundle.map((b) => b.name)).toEqual(["spec.md", "design-sheet.md", "design-sheet.json", "AGENTS.md", "compile-report.json", "story.md"]);
    expect((await store.listArtifacts("p3")).length).toBe(6);
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
