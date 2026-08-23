import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MemoryStore } from "../store/file_store.js";
import { MockLLM } from "../llm/client.js";
import { invoicingMockHandlers } from "../llm/mock_fixtures.js";
import { loadCatalogs } from "../engine/catalogs.js";
import { Engine } from "../engine/orchestrator.js";
import { loadGolds, runGold, aggregate, recovery, recoveryAt, sweep, sweepTable, type EngineFactory } from "./run.js";
import { perturbGold, makeVariants } from "./perturb.js";
import { mergeCatalogs } from "../core/catalog.js";

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
