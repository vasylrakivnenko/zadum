import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MemoryStore } from "../store/file_store.js";
import { MockLLM } from "../llm/client.js";
import { invoicingMockHandlers } from "../llm/mock_fixtures.js";
import { loadCatalogs } from "../engine/catalogs.js";
import { Engine } from "../engine/orchestrator.js";
import { loadGolds, runGold, aggregate, recovery, recoveryAt, recoveryAtInteraction, sweep, sweepTable, REPORT_K, GoldSchema, type EngineFactory, type SessionMetrics } from "./run.js";
import { perturbGold, makeVariants } from "./perturb.js";
import { mergeCatalogs, type NodeDef } from "../core/catalog.js";
import { emptySheet, type Decision } from "../core/sheet.js";
import type { SessionState } from "../core/session.js";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * The gold directory now holds multiple archetypes (invoicing, booking, marketplace, ...), and `loadGolds`
 * does not sort — `fs.readdir` order is filesystem-dependent, so `golds[0]` is not stable. Tests that need
 * the invoicing gold specifically (because they use `invoicingMockHandlers`, which only produces a sensible
 * draft/cards for an invoicing one-liner) select it by id instead of by array position.
 */
async function loadInvoicingGold() {
  const golds = await loadGolds(path.join(here, "gold"));
  const gold = golds.find((g) => g.id === "invoicing-bookkeeping");
  if (!gold) throw new Error("expected src/harness/gold/invoicing-bookkeeping.json to exist");
  return gold;
}

describe("harness (mock)", () => {
  it("runs a gold through the engine with a simulated user and computes metrics", async () => {
    const engine = new Engine(new MemoryStore(), new MockLLM(invoicingMockHandlers), await loadCatalogs(), { precompute: false });
    const golds = await loadGolds(path.join(here, "gold"));
    expect(golds.length).toBeGreaterThan(0);
    const gold = await loadInvoicingGold();
    const m = await runGold(engine, gold, { idPrefix: "t" });
    expect(m.cards).toBeGreaterThan(0);
    expect(m.cards).toBeLessThanOrEqual(12);
    expect(m.recovery_curve.length).toBe(m.cards + 1);
    for (const r of m.recovery_curve) expect(r).toBeGreaterThanOrEqual(0);
    for (const r of m.recovery_curve) expect(r).toBeLessThanOrEqual(1);
    // the simulated user answers from the truth: every resolved decision must match the gold
    const st = await engine.getState(m.project_id);
    for (const d of st.sheet.decisions.filter((x) => x.status === "resolved")) expect(d.chosen).toBe(gold.decisions[d.id]);
    expect(m.answers.filter((a) => a.kind === "option").length).toBeGreaterThan(0);
    expect(m.final_recovery).toBeGreaterThan(0.3);
    // asked nodes never repeat
    expect(new Set(m.asked_nodes).size).toBe(m.asked_nodes.length);
    // draft recall vs gold sheet (mock draft matches the gold names closely)
    expect(m.draft_recall.actors).toBe(1);
    expect(m.draft_recall.nouns).toBeGreaterThanOrEqual(0.7);
    expect(m.draft_recall.rules).toBeGreaterThanOrEqual(0.8);
    expect(m.calibration.length).toBeGreaterThan(0);
    const s = aggregate([m]);
    expect(s.n).toBe(1);
    expect(s.auc_0_12).toBeGreaterThan(0);
    expect(s.calibration_bins.length).toBe(5);
  });

  it("recovery() counts settled values and argmax beliefs, consequence-weighted", async () => {
    const engine = new Engine(new MemoryStore(), new MockLLM(invoicingMockHandlers), await loadCatalogs(), { precompute: false });
    const gold = await loadInvoicingGold();
    const r = await engine.createProject(gold.one_liner, { id: "rec1" });
    // a gold equal to the session's own current values → recovery 1
    const { distribution, maxOption } = await import("../core/worlds.js");
    const mirror = { ...gold, decisions: Object.fromEntries(r.session.belief.nodes.map((n) => [n.id, maxOption(distribution(r.session.belief, n.id)).option])) };
    expect(recovery(r.sheet, r.session, mirror)).toBeCloseTo(1, 6);
    // settled values count as the current value, and wrong ones cost their consequence
    await engine.applyUserEdit("rec1", "Clients log into a portal to see and pay their invoices");
    const st = await engine.getState("rec1");
    const wrong = { ...mirror, decisions: { ...mirror.decisions, external_access: "none" } };
    const right = { ...mirror, decisions: { ...mirror.decisions, external_access: "portal", user_accounts: "multi_user" } };
    expect(recovery(st.sheet, st.session, right)).toBeGreaterThan(recovery(st.sheet, st.session, wrong));
  });
});

describe("recovery() denominator honesty (missing work is wrong, not free)", () => {
  const opts = [
    { id: "yes", label: "yes" },
    { id: "no", label: "no" },
  ];
  const mkNode = (id: string, consequence: number): NodeDef => ({ id, topic: id, question: id, options: opts, consequence, prior: { yes: 0.5, no: 0.5 }, implies: {}, sections: [], bespoke: false, archetype: "core" });
  const mkDec = (id: string, chosen: string, consequence: number): Decision => ({ id, topic: id, question: id, options: opts, chosen, status: "resolved", consequence, source: "test" });
  const mkSheet = (decisions: Decision[]) => ({ ...emptySheet("p", "x"), decisions });
  const mkSession = (nodes: NodeDef[]): SessionState => ({ belief: { nodes, worlds: [], alpha: 1 }, consequence_override: {} }) as unknown as SessionState;
  const mkGold = (decisions: Record<string, string>) => GoldSchema.parse({ id: "g", one_liner: "x", persona: "p", truth: "t", decisions });

  it("an empty design vs a non-empty gold scores 0, not 1", () => {
    const gold = mkGold({ a: "yes", b: "no" });
    expect(recovery(mkSheet([]), mkSession([]), gold)).toBe(0);
  });

  it("a gold decision missing from the design counts as wrong at the node's consequence", () => {
    // a (consequence 4) matches; b (consequence 1) was never surfaced on the sheet → 4 / (4 + 1)
    const gold = mkGold({ a: "yes", b: "no" });
    const sheet = mkSheet([mkDec("a", "yes", 4)]);
    const session = mkSession([mkNode("a", 4), mkNode("b", 1)]);
    expect(recovery(sheet, session, gold)).toBeCloseTo(4 / 5, 12);
  });

  it("all gold decisions present and matching scores 1", () => {
    const gold = mkGold({ a: "yes", b: "no" });
    const sheet = mkSheet([mkDec("a", "yes", 4), mkDec("b", "no", 1)]);
    const session = mkSession([mkNode("a", 4), mkNode("b", 1)]);
    expect(recovery(sheet, session, gold)).toBe(1);
  });

  it("a gold decision whose node is absent from the catalog counts as wrong at fallback weight 3", () => {
    // a (consequence 4) matches; c exists nowhere (no sheet decision, no belief node) → 4 / (4 + 3)
    const gold = mkGold({ a: "yes", c: "no" });
    const sheet = mkSheet([mkDec("a", "yes", 4)]);
    const session = mkSession([mkNode("a", 4)]);
    expect(recovery(sheet, session, gold)).toBeCloseTo(4 / 7, 12);
  });

  it("the vacuous case stays vacuous: a gold with no decisions scores 1", () => {
    expect(recovery(mkSheet([]), mkSession([]), mkGold({}))).toBe(1);
  });
});

describe("simulated defaults review + answer noise (opt-in)", () => {
  const mkEngine = async () => new Engine(new MemoryStore(), new MockLLM(invoicingMockHandlers), await loadCatalogs(), { precompute: false });

  it("plain runGold carries none of the opt-in fields (regression gate)", async () => {
    const m = await runGold(await mkEngine(), await loadInvoicingGold(), { idPrefix: "plain" });
    expect(m.wrong_defaults_before).toBeUndefined();
    expect(m.wrong_defaults_after).toBeUndefined();
    expect(m.review_positions).toBeUndefined();
    expect(m.noise_events).toBeUndefined();
    // unified interaction accounting is opt-in too: with no flags the metrics SHAPE is exactly what it was
    expect(m.interactions).toBeUndefined();
    expect(m.recovery_by_interaction).toBeUndefined();
    expect(m.verify_accepts).toBeUndefined();
    expect(m.verify_rejects).toBeUndefined();
    expect(m.verify_catches).toBeUndefined();
    expect(m.wrong_defaults_remaining).toBeUndefined();
    const s = aggregate([m]);
    expect(s.review).toBeUndefined();
    expect(s.noise_events).toBeUndefined();
    expect(s.auc_per_interaction).toBeUndefined();
    expect(s.recovery_at_interaction).toBeUndefined();
    expect(s.verify).toBeUndefined();
  });

  it("attentive reviewer at full depth corrects every wrong default to the gold truth", async () => {
    const gold = await loadInvoicingGold();
    const base = await runGold(await mkEngine(), gold, { idPrefix: "base" });
    const engine = await mkEngine();
    const m = await runGold(engine, gold, { idPrefix: "rev", review: { depth: 999, catchProb: 1 } });
    expect(m.wrong_defaults_before).toBeGreaterThan(0);
    expect(m.wrong_defaults_after).toBe(0);
    expect(m.review_catch_rate).toBe(1);
    expect(m.review_positions).toHaveLength(m.wrong_defaults_before!);
    for (const p of m.review_positions!) expect(p).toBeGreaterThanOrEqual(1);
    // corrected decisions are resolved to the truth on the final sheet
    const st = await engine.getState(m.project_id);
    for (const d of st.sheet.decisions) {
      if (d.status === "defaulted" && gold.decisions[d.id] !== undefined) expect(d.chosen).toBe(gold.decisions[d.id]);
    }
    // review can only help recovery
    expect(m.final_recovery).toBeGreaterThanOrEqual(base.final_recovery - 1e-9);
  });

  it("catchProb 0 examines but catches nothing; shallow depth only sees the top of the list", async () => {
    const gold = await loadInvoicingGold();
    const m0 = await runGold(await mkEngine(), gold, { idPrefix: "r0", review: { depth: 999, catchProb: 0 } });
    expect(m0.wrong_defaults_after).toBe(m0.wrong_defaults_before);
    expect(m0.review_catch_rate).toBe(0);
    const shallow = await runGold(await mkEngine(), gold, { idPrefix: "r1", review: { depth: 1, catchProb: 1 } });
    const deep = await runGold(await mkEngine(), gold, { idPrefix: "r2", review: { depth: 999, catchProb: 1 } });
    // examining fewer items can never catch more
    expect(shallow.wrong_defaults_after!).toBeGreaterThanOrEqual(deep.wrong_defaults_after!);
  });

  it("aggregate pools review counts and builds the position histogram", async () => {
    const gold = await loadInvoicingGold();
    const m = await runGold(await mkEngine(), gold, { idPrefix: "agg", review: { depth: 8, catchProb: 1 } });
    const s = aggregate([m]);
    expect(s.review).toBeDefined();
    expect(s.review!.sessions).toBe(1);
    expect(s.review!.mean_wrong_before).toBe(m.wrong_defaults_before);
    expect(s.review!.mean_wrong_after).toBe(m.wrong_defaults_after);
    const histTotal = Object.values(s.review!.position_histogram).reduce((a, b) => a + b, 0);
    expect(histTotal).toBe(m.review_positions!.length);
    for (const p of m.review_positions!) expect(s.review!.position_histogram[p]).toBeGreaterThanOrEqual(1);
  });

  it("noise p=1 replaces every option answer with a different option, deterministically per seed", async () => {
    const gold = await loadInvoicingGold();
    const m = await runGold(await mkEngine(), gold, { idPrefix: "nz", noise: { p: 1, seed: 3 } });
    const optionAnswers = m.answers.filter((a) => a.kind === "option");
    expect(m.noise_events).toBeGreaterThan(0);
    expect(m.noise_events).toBe(optionAnswers.length);
    // seeded: an identical run answers identically
    const m2 = await runGold(await mkEngine(), gold, { idPrefix: "nz", noise: { p: 1, seed: 3 } });
    expect(m2.answers).toEqual(m.answers);
    expect(m2.asked_nodes).toEqual(m.asked_nodes);
    // and p=0-equivalent (no noise option) differs from the fully-noised run
    const clean = await runGold(await mkEngine(), gold, { idPrefix: "cl" });
    expect(clean.noise_events).toBeUndefined();
    expect(m.answers).not.toEqual(clean.answers);
    expect(aggregate([m]).noise_events).toBe(m.noise_events);
  });

  it("gold extra_context is parsed and passed only under withContext", async () => {
    const gold = await loadInvoicingGold();
    expect(gold.extra_context).toContain("INV-0231");
    const m = await runGold(await mkEngine(), gold, { idPrefix: "ctx", withContext: true });
    expect(m.cards).toBeGreaterThan(0); // plumbing: createProject accepts the artifact
  });
});

describe("unified interaction accounting (cards + story checks + review taps)", () => {
  const mkEngine = async (maxCards?: number) =>
    new Engine(new MemoryStore(), new MockLLM(invoicingMockHandlers), await loadCatalogs(), {
      precompute: false,
      ...(maxCards !== undefined ? { config: { maxCards } } : {}),
    });

  it("spends verification interactions through the engine's real methods and prices them like cards", async () => {
    const gold = await loadInvoicingGold();
    const m = await runGold(await mkEngine(), gold, { idPrefix: "vfy", verify: { budget: 4 } });
    expect(m.verify_accepts).toBeDefined();
    expect(m.verify_rejects).toBeDefined();
    const spent = m.verify_accepts! + m.verify_rejects!;
    expect(spent).toBeGreaterThan(0);
    expect(spent).toBeLessThanOrEqual(4);
    // one card = one story check = one interaction
    expect(m.interactions).toBe(m.cards + spent);
    // the unified curve has exactly one point per interaction, in chronological order
    expect(m.recovery_by_interaction).toHaveLength(m.interactions!);
    for (const r of m.recovery_by_interaction!) {
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
    }
    // the card prefix of the unified curve IS the card curve (which stays card-only)
    expect(m.recovery_by_interaction!.slice(0, m.cards)).toEqual(m.recovery_curve.slice(1));
    // a story check can only leave the ledger no worse: catches are a NET count and never fabricate recovery
    expect(m.wrong_defaults_remaining).toBeGreaterThanOrEqual(0);
    expect(m.final_recovery).toBeCloseTo(m.recovery_by_interaction!.at(-1)!, 10);
  });

  it("budget 0 turns accounting on without spending a story check", async () => {
    const gold = await loadInvoicingGold();
    const m = await runGold(await mkEngine(), gold, { idPrefix: "v0", verify: { budget: 0 } });
    expect(m.verify_accepts).toBe(0);
    expect(m.verify_rejects).toBe(0);
    expect(m.interactions).toBe(m.cards);
    expect(m.recovery_by_interaction).toEqual(m.recovery_curve.slice(1));
    // no story checks spent ⇒ the per-interaction north star reduces to the card-only one
    const s = aggregate([m]);
    expect(s.auc_per_interaction).toBeCloseTo(s.auc_0_12, 10);
  });

  it("review taps count as interactions and land in the unified curve after the cards", async () => {
    const gold = await loadInvoicingGold();
    const m = await runGold(await mkEngine(), gold, { idPrefix: "rt", review: { depth: 999, catchProb: 1 }, verify: { budget: 0 } });
    const taps = m.wrong_defaults_before! - m.wrong_defaults_after!;
    expect(taps).toBeGreaterThan(0);
    expect(m.interactions).toBe(m.cards + taps);
    expect(m.recovery_by_interaction).toHaveLength(m.interactions!);
  });

  it("a mix arm caps the card loop at its budget and spends the rest on story checks", async () => {
    const gold = await loadInvoicingGold();
    const mix = await runGold(await mkEngine(6), gold, { idPrefix: "mix", verify: { budget: 6 } });
    expect(mix.cards).toBe(6);
    expect(mix.asked_nodes).toHaveLength(6);
    expect(mix.stop_reason).toBe("max_cards");
    expect(mix.interactions).toBeLessThanOrEqual(12);
    // the pure-verification arm asks no cards at all (defaults straight from the belief, then story checks)
    const pure = await runGold(await mkEngine(0), gold, { idPrefix: "pure", verify: { budget: 6 } });
    expect(pure.cards).toBe(0);
    expect(pure.asked_nodes).toEqual([]);
    expect(pure.verify_accepts! + pure.verify_rejects!).toBeGreaterThan(0);
    expect(pure.interactions).toBe(pure.verify_accepts! + pure.verify_rejects!);
  });

  it("aggregate does the per-interaction arithmetic and pools the verification counts", () => {
    const base = (p: Partial<SessionMetrics>): SessionMetrics => ({
      gold_id: "g",
      project_id: "p",
      cards: 0,
      stop_reason: "max_cards",
      recovery_curve: [0.2],
      final_recovery: 0.6,
      settledness_final: 0,
      draft_recall: { actors: 1, nouns: 1, rules: 1, non_goals: 1 },
      calibration: [],
      answers: [],
      card_render_ms: [],
      card_value1: [],
      asked_nodes: [],
      ...p,
    });
    const unified = base({
      recovery_curve: [0.2],
      recovery_by_interaction: [0.4, 0.6],
      interactions: 2,
      verify_accepts: 1,
      verify_rejects: 3,
      verify_catches: 5,
      wrong_defaults_remaining: 7,
    });
    // k = 0 is the draft; the curve is held flat past its end
    expect(recoveryAtInteraction(unified, 0)).toBe(0.2);
    expect(recoveryAtInteraction(unified, 1)).toBe(0.4);
    expect(recoveryAtInteraction(unified, 2)).toBe(0.6);
    expect(recoveryAtInteraction(unified, 12)).toBe(0.6);
    // a session without unified accounting falls back to the CARD curve rather than to zero
    const cardsOnly = base({ recovery_curve: [0.1, 0.3], cards: 1 });
    expect(recoveryAtInteraction(cardsOnly, 0)).toBe(0.1);
    expect(recoveryAtInteraction(cardsOnly, 5)).toBe(0.3);

    const s = aggregate([unified]);
    expect(s.auc_per_interaction).toBeCloseTo((0.2 + 0.4 + 0.6 * 11) / 13, 12);
    expect(s.recovery_at_interaction![1]).toBeCloseTo(0.4, 12);
    for (const k of REPORT_K.filter((k) => k > 1)) expect(s.recovery_at_interaction![k]).toBeCloseTo(0.6, 12);
    expect(s.verify).toEqual({ sessions: 1, mean_interactions: 2, accepts: 1, rejects: 3, catches: 5, mean_wrong_remaining: 7 });
    // the card-based headline is untouched by any of this
    expect(s.auc_0_12).toBeCloseTo(0.2, 12);

    // mixed populations: per-interaction means average across BOTH kinds of session
    const s2 = aggregate([unified, cardsOnly]);
    expect(s2.recovery_at_interaction![1]).toBeCloseTo((0.4 + 0.3) / 2, 12);
    expect(s2.verify!.sessions).toBe(1); // pooled over the sessions that actually verified
  });
});

describe("counterfactual gold variants", () => {
  it("flips high-consequence decisions and keeps the hidden truth logically consistent", async () => {
    const catalogs = await loadCatalogs();
    const gold = await loadInvoicingGold();
    const { nodes } = mergeCatalogs(catalogs.catalogs, gold.archetypes);
    const r = perturbGold(gold, nodes, { flips: 3, seed: 42 });

    expect(r.flipped).toHaveLength(3);
    for (const f of r.flipped) {
      expect(f.to).not.toBe(f.from);
      expect(r.gold.decisions[f.node]).toBe(f.to);
      // only meaningful decisions get flipped
      expect(nodes.find((n) => n.id === f.node)!.consequence).toBeGreaterThanOrEqual(2);
    }
    // the perturbed truth satisfies every hard implication the catalog declares
    for (const [nodeId, chosen] of Object.entries(r.gold.decisions)) {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) continue;
      for (const e of node.implies[chosen] ?? []) {
        if (r.gold.decisions[e.node] === undefined) continue;
        expect(r.gold.decisions[e.node]).toBe(e.option);
      }
    }
    expect(r.conflicts).toEqual([]);
    // the simulated user is told about the overrides
    expect(r.gold.truth).toContain("CORRECTIONS");
    for (const f of r.flipped) expect(r.gold.truth).toContain(`- ${f.node} = ${f.to}`);
    // deterministic
    expect(perturbGold(gold, nodes, { flips: 3, seed: 42 }).gold.decisions).toEqual(r.gold.decisions);
    expect(perturbGold(gold, nodes, { flips: 3, seed: 43 }).flipped).not.toEqual(r.flipped);
  });

  it("makeVariants returns the original plus distinct variants with rotating personas", async () => {
    const catalogs = await loadCatalogs();
    const gold = await loadInvoicingGold();
    const { nodes } = mergeCatalogs(catalogs.catalogs, gold.archetypes);
    const vs = makeVariants(gold, nodes, { count: 3, flips: 2, seed: 1 });
    expect(vs).toHaveLength(4);
    expect(vs[0]!.gold.id).toBe(gold.id);
    expect(vs[0]!.info).toBeNull();
    expect(new Set(vs.map((v) => v.gold.id)).size).toBe(4);
    const truths = vs.slice(1).map((v) => JSON.stringify(v.gold.decisions));
    expect(new Set(truths).size).toBeGreaterThan(1);
    expect(vs[1]!.gold.persona).not.toBe(vs[2]!.gold.persona);
  });
});

describe("sweep", () => {
  it("compares arms at equal budget and at their own theta", async () => {
    const catalogs = await loadCatalogs();
    const gold = await loadInvoicingGold();
    const store = new MemoryStore();
    const makeEngine: EngineFactory = async (config) =>
      new Engine(store, new MockLLM(invoicingMockHandlers), catalogs, {
        precompute: false,
        config: { scoring: config.scoring, lookahead: config.lookahead, maxCards: config.maxCards, ...(config.theta !== undefined ? { theta: config.theta } : {}) },
      });
    const arms = [
      { label: "weighted_entropy", scoring: "weighted_entropy" as const, lookahead: 1 as const },
      { label: "joint_entropy", scoring: "joint_entropy" as const, lookahead: 1 as const },
    ];
    const results = await sweep(makeEngine, [gold], arms, 4);
    expect(results).toHaveLength(2);
    for (const r of results) {
      // equal budget: theta disabled, so every arm spends exactly the budget
      expect(r.budget.summary.mean_cards).toBe(4);
      expect(r.budget.sessions[0]!.stop_reason).toBe("max_cards");
      expect(r.budget.summary.recovery_at[3]).toBeGreaterThan(0);
      // natural: bounded by the hard cap
      expect(r.natural.summary.mean_cards).toBeLessThanOrEqual(12);
    }
    // arms with different criteria should not ask an identical question sequence
    expect(results[0]!.budget.sessions[0]!.asked_nodes).not.toEqual(results[1]!.budget.sessions[0]!.asked_nodes);
    const table = sweepTable(results);
    expect(table).toContain("ORDERING");
    expect(table).toContain("STOPPING");
    expect(table).toContain("weighted_entropy");
  });

  it("recoveryAt holds the curve flat past the end of a short session", () => {
    const m = { recovery_curve: [0.2, 0.5, 0.6] } as never;
    expect(recoveryAt(m, 0)).toBe(0.2);
    expect(recoveryAt(m, 2)).toBe(0.6);
    expect(recoveryAt(m, 12)).toBe(0.6);
  });
});
