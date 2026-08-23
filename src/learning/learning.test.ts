import { describe, it, expect } from "vitest";
import { MemoryStore } from "../store/file_store.js";
import { MockLLM } from "../llm/client.js";
import { invoicingMockHandlers } from "../llm/mock_fixtures.js";
import { loadCatalogs } from "../engine/catalogs.js";
import { Engine } from "../engine/orchestrator.js";
import type { NodeDef } from "../core/catalog.js";
import type { ZEvent } from "../core/session.js";
import { collectObservations, observationsFromEvents, populationPriors, learnedPriorFor, mixWithCatalog, shrink, type Observation } from "./population_priors.js";
import { calibrationReport, calTable, cardSamples, overrideSamples, formatCalibration, type CalSample } from "./calibration.js";
import { replayTheta, cardsUnderTheta, thetaTable, traceFromEvents, thetaGrid, formatThetaTable } from "./theta_replay.js";
import { rewardFromEvents, update, updateAll, choose, mulberry32, sampleBeta, armMeans } from "./phrasing_bandit.js";
import { runLearning, formatReport, allCatalogNodes } from "./report.js";

// ---------- fixtures: real events from mock sessions ----------

async function makeEngine() {
  const store = new MemoryStore();
  const llm = new MockLLM(invoicingMockHandlers);
  const catalogs = await loadCatalogs();
  const engine = new Engine(store, llm, catalogs, { precompute: false });
  return { store, engine, catalogs };
}

/** createProject → startCards → answer every card with options[pick] → finishCards → override one default. */
async function runSession(engine: Engine, id: string, pick: 0 | 1, extras: { undoFirst?: boolean; youDecideFirst?: boolean } = {}) {
  await engine.createProject("an invoicing app for small bookkeeping firms", { id });
  let res = await engine.startCards(id);
  let first = true;
  let guard = 0;
  while (res.kind === "card" && guard++ < 20) {
    if (first && extras.youDecideFirst) {
      res = (await engine.answerCard(id, { kind: "you_decide" })).next;
      first = false;
      continue;
    }
    if (first && extras.undoFirst) {
      await engine.answerCard(id, { kind: "option", option_id: res.card.options[0]!.option_id, think_ms: 500 });
      const back = await engine.undoLast(id);
      if (back?.kind === "card") res = back;
      first = false;
    }
    const opt = res.card.options[Math.min(pick, res.card.options.length - 1)]!;
    res = (await engine.answerCard(id, { kind: "option", option_id: opt.option_id, think_ms: 900 })).next;
    first = false;
  }
  const defaults = await engine.finishCards(id);
  const target = defaults.find((d) => d.status === "defaulted" && d.options.length > 1)!;
  const other = target.options.find((o) => o.id !== target.chosen)!;
  await engine.overrideDefault(id, target.id, other.id);
  await engine.acceptDefaults(id);
  return { overridden: { project: id, node: target.id, from: target.chosen, to: other.id } };
}

async function fixture() {
  const f = await makeEngine();
  const ov = [
    await runSession(f.engine, "s1", 0),
    await runSession(f.engine, "s2", 0),
    await runSession(f.engine, "s3", 1), // answers against the belief argmax → calibration misses
    await runSession(f.engine, "s4", 0, { undoFirst: true, youDecideFirst: false }),
  ];
  return { ...f, overrides: ov.map((o) => o.overridden) };
}

let cached: Promise<Awaited<ReturnType<typeof fixture>>> | undefined;
const getFixture = () => (cached ??= fixture());

describe("population priors over mock sessions", () => {
  it("collects answers and overrides, never final defaults", async () => {
    const { store, overrides } = await getFixture();
    const obs = await collectObservations(store);
    expect(obs.length).toBeGreaterThan(4);
    expect(new Set(obs.map((o) => o.source))).toEqual(new Set(["answer", "override"]));
    // every override shows up once, as a positive observation of `after`
    for (const o of overrides) expect(obs.filter((x) => x.project_id === o.project && x.source === "override" && x.node === o.node && x.option === o.to)).toHaveLength(1);
    // archetypes come from the final sheet
    expect(obs.every((o) => o.archetypes.includes("b2b-invoicing"))).toBe(true);
    // a final defaulted decision is not an observation unless the user touched it
    const sheet = (await store.getLatestSheet("s1"))!;
    const untouched = sheet.decisions.filter((d) => d.status === "defaulted");
    expect(untouched.length).toBeGreaterThan(0);
    for (const d of untouched) expect(obs.some((o) => o.project_id === "s1" && o.node === d.id)).toBe(false);
    // the undone answer in s4 is not counted twice
    const s4 = obs.filter((o) => o.project_id === "s4" && o.source === "answer");
    expect(new Set(s4.map((o) => o.node)).size).toBe(s4.length);
  });

  it("shrinks toward the catalog for large n0 and toward the counts for small n0", async () => {
    const { store, catalogs } = await getFixture();
    const nodes = allCatalogNodes(catalogs);
    const obs = await collectObservations(store);
    const node = obs.filter((o) => o.source === "answer").map((o) => o.node)[0]!;
    const def = nodes.find((n) => n.id === node)!;
    const counts: Record<string, number> = {};
    for (const o of obs) if (o.node === node) counts[o.option] = (counts[o.option] ?? 0) + o.weight;
    const n = Object.values(counts).reduce((a, b) => a + b, 0);
    const empirical = Object.fromEntries(def.options.map((o) => [o.id, (counts[o.id] ?? 0) / n]));

    const wide = populationPriors(obs, nodes, { n0: 1e6 });
    const tight = populationPriors(obs, nodes, { n0: 1e-6 });
    const dist = (a: Record<string, number>, b: Record<string, number>) => Math.max(...def.options.map((o) => Math.abs((a[o.id] ?? 0) - (b[o.id] ?? 0))));
    expect(dist(wide.global[node]!.prior, def.prior)).toBeLessThan(1e-4);
    expect(dist(tight.global[node]!.prior, empirical)).toBeLessThan(1e-4);
    expect(wide.global[node]!.n).toBe(n);
    // archetype level shrinks toward global, which here (all projects share the archetype) equals global
    const arch = tight.byArchetype["b2b-invoicing"]![node]!;
    expect(dist(arch.prior, empirical)).toBeLessThan(1e-4);
    // priors are normalized
    for (const e of Object.values(wide.global)) expect(Object.values(e.prior).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
  });

  it("mixWithCatalog reproduces the catalog at λ=0 and the learned prior at λ=1", async () => {
    const { store, catalogs } = await getFixture();
    const nodes = allCatalogNodes(catalogs);
    const pp = populationPriors(await collectObservations(store), nodes, { n0: 2 });
    const zero = mixWithCatalog(nodes, pp, ["b2b-invoicing"], () => 0);
    const one = mixWithCatalog(nodes, pp, ["b2b-invoicing"], () => 1);
    expect(zero).not.toBe(nodes);
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i]!;
      for (const o of n.options) {
        expect(zero[i]!.prior[o.id]).toBeCloseTo(n.prior[o.id]!, 12);
        expect(one[i]!.prior[o.id]).toBeCloseTo(learnedPriorFor(pp, ["b2b-invoicing"], n.id)!.prior[o.id]!, 12);
      }
      expect(zero[i]!.id).toBe(n.id);
    }
    // the default λ = n/(n+n0) lands strictly between for a node with data
    const withData = Object.entries(pp.global).find(([, e]) => e.n > 0)![0];
    const mid = mixWithCatalog(nodes, pp, ["b2b-invoicing"]).find((n) => n.id === withData)!;
    const cat = nodes.find((n) => n.id === withData)!;
    const learned = learnedPriorFor(pp, ["b2b-invoicing"], withData)!;
    for (const o of cat.options) {
      const lo = Math.min(cat.prior[o.id]!, learned.prior[o.id]!);
      const hi = Math.max(cat.prior[o.id]!, learned.prior[o.id]!);
      expect(mid.prior[o.id]!).toBeGreaterThanOrEqual(lo - 1e-12);
      expect(mid.prior[o.id]!).toBeLessThanOrEqual(hi + 1e-12);
    }
  });
});

describe("population priors — arithmetic", () => {
  const node: NodeDef = { id: "n", topic: "t", question: "q", options: [{ id: "a", label: "A" }, { id: "b", label: "B" }], consequence: 3, prior: { a: 0.8, b: 0.2 }, implies: { a: [], b: [] }, sections: [], bespoke: false, archetype: "core" };
  const obs = (archetypes: string[], option: string, k: number, source: Observation["source"] = "answer"): Observation[] => Array.from({ length: k }, (_, i) => ({ project_id: `p${i}`, archetypes, node: "n", option, source, weight: 1 }));

  it("shrink: (count + n0·base)/(n + n0)", () => {
    const r = shrink(node, { a: 1, b: 3 }, node.prior, 4);
    // a: (1 + 4·0.8)/8 = 0.525 ; b: (3 + 4·0.2)/8 = 0.475
    expect(r.n).toBe(4);
    expect(r.prior.a).toBeCloseTo(0.525, 12);
    expect(r.prior.b).toBeCloseTo(0.475, 12);
    expect(shrink(node, undefined, node.prior, 5).prior).toEqual(node.prior);
  });

  it("hierarchy: archetype shrinks toward global, global toward catalog; unknown nodes/options ignored", () => {
    const o = [...obs(["x"], "b", 6), ...obs(["y"], "a", 2), { project_id: "z", archetypes: ["x"], node: "ghost", option: "a", source: "answer" as const, weight: 1 }, { project_id: "z", archetypes: ["x"], node: "n", option: "nope", source: "answer" as const, weight: 1 }];
    const pp = populationPriors(o, [node], { n0: 2 });
    expect(pp.global.n!.n).toBe(8);
    const g = pp.global.n!.prior;
    expect(g.b).toBeCloseTo((6 + 2 * 0.2) / 10, 12);
    const x = pp.byArchetype.x!.n!;
    expect(x.n).toBe(6);
    expect(x.prior.b).toBeCloseTo((6 + 2 * g.b!) / 8, 12);
    const y = pp.byArchetype.y!.n!;
    expect(y.prior.a).toBeCloseTo((2 + 2 * g.a!) / 4, 12);
    expect(pp.global.ghost).toBeUndefined();
    // learnedPriorFor: first archetype with data, else global, else null
    expect(learnedPriorFor(pp, ["none", "y"], "n")).toBe(y);
    expect(learnedPriorFor(pp, ["none"], "n")).toBe(pp.global.n);
    expect(learnedPriorFor(pp, ["x"], "ghost")).toBeNull();
  });

  it("observationsFromEvents drops undone answers and keeps only `after` of overrides", () => {
    const ev = (type: ZEvent["type"], payload: Record<string, unknown>): ZEvent => ({ id: "", project_id: "p", ts: "", type, payload, tags: { catalog: "", prompts: "", models: { strong: "", fast: "" } } });
    const events = [
      ev("card_answered", { card_id: "c1", node: "n", kind: "option", option: "a" }),
      ev("card_answered", { card_id: "c1", kind: "undo" }),
      ev("card_answered", { card_id: "c1", node: "n", kind: "option", option: "b" }),
      ev("card_answered", { card_id: "c2", node: "m", kind: "skip", option: null }),
      ev("default_overridden", { node: "k", before: { status: "defaulted", chosen: "x", confidence: 0.7 }, after: "y" }),
    ];
    expect(observationsFromEvents("p", ["arch"], events)).toEqual([
      { project_id: "p", archetypes: ["arch"], node: "n", option: "b", source: "answer", weight: 1 },
      { project_id: "p", archetypes: ["arch"], node: "k", option: "y", source: "override", weight: 1 },
    ]);
  });
});

describe("calibration", () => {
  it("report over mock sessions has populated bins and ECE in [0,1]", async () => {
    const { store } = await getFixture();
    const r = await calibrationReport(store);
    expect(r.projects).toBe(4);
    expect(r.cards.n).toBeGreaterThan(0);
    expect(r.cards.bins.some((b) => b.n > 0)).toBe(true);
    expect(r.cards.bins.reduce((s, b) => s + b.n, 0)).toBe(r.cards.n);
    expect(r.cards.ece).toBeGreaterThanOrEqual(0);
    expect(r.cards.ece).toBeLessThanOrEqual(1);
    expect(r.cards.brier).toBeGreaterThanOrEqual(0);
    // s3 answered against the argmax, so accuracy is strictly below 1 overall
    const hits = r.cards.bins.reduce((s, b) => s + b.accuracy * b.n, 0);
    expect(hits).toBeLessThan(r.cards.n);
    expect(hits).toBeGreaterThan(0);
    // every shown card had maxP < τ — no bin at 0.9–1.0 for cards (Rule 4)
    expect(r.cards.bins.find((b) => b.lo === 0.9)!.n).toBe(0);
    // one override per session, all wrong by construction; defaults table adds the kept ones
    expect(r.overrides.n).toBe(4);
    expect(r.overrides.bins.every((b) => b.accuracy === 0)).toBe(true);
    expect(r.defaults.n).toBeGreaterThan(r.overrides.n);
    expect(r.defaults.ece).toBeGreaterThanOrEqual(0);
    expect(r.defaults.ece).toBeLessThanOrEqual(1);
    const text = formatCalibration(r);
    expect(text).toContain("CALIBRATION over 4 project(s)");
    expect(text).toContain("ECE");
  });

  it("calTable arithmetic: bins, ECE, Brier", () => {
    const s = (confidence: number, correct: boolean): CalSample => ({ project_id: "p", node: "n", confidence, correct });
    const t = calTable([s(0.55, true), s(0.55, false), s(0.95, true), s(1.0, true), s(0.3, false)]);
    expect(t.n).toBe(5);
    const b55 = t.bins.find((b) => b.lo === 0.5)!;
    expect(b55.n).toBe(2);
    expect(b55.accuracy).toBe(0.5);
    expect(b55.mean_confidence).toBeCloseTo(0.55, 12);
    const b9 = t.bins.find((b) => b.lo === 0.9)!;
    expect(b9.n).toBe(2); // 1.0 falls in the last bin
    expect(b9.accuracy).toBe(1);
    const b0 = t.bins.find((b) => b.lo === 0)!;
    expect(b0.n).toBe(1);
    // ECE = 2/5·|0.5−0.55| + 2/5·|1−0.975| + 1/5·|0−0.3|
    expect(t.ece).toBeCloseTo(0.4 * 0.05 + 0.4 * 0.025 + 0.2 * 0.3, 12);
    // Brier = mean (c − y)²
    const brier = ((0.55 - 1) ** 2 + 0.55 ** 2 + (0.95 - 1) ** 2 + 0 + 0.3 ** 2) / 5;
    expect(t.brier).toBeCloseTo(brier, 12);
    expect(calTable([]).ece).toBe(0);
  });

  it("cardSamples pairs card_shown with the effective answer; overrideSamples reads before.confidence", () => {
    const ev = (type: ZEvent["type"], payload: Record<string, unknown>): ZEvent => ({ id: "", project_id: "p", ts: "", type, payload, tags: { catalog: "", prompts: "", models: { strong: "", fast: "" } } });
    const events = [
      ev("card_shown", { card_id: "c1", node: "n", maxP: 0.7, dist: { a: 0.7, b: 0.3 } }),
      ev("card_answered", { card_id: "c1", node: "n", kind: "option", option: "a" }),
      ev("card_shown", { card_id: "c2", node: "m", maxP: 0.6, dist: { a: 0.4, b: 0.6 } }),
      ev("card_answered", { card_id: "c2", node: "m", kind: "option", option: "a" }),
      ev("card_answered", { card_id: "c2", kind: "undo" }),
      ev("card_answered", { card_id: "c2", node: "m", kind: "option", option: "b" }),
      ev("card_shown", { card_id: "c3", node: "k", maxP: 0.8, dist: { a: 0.8, b: 0.2 } }),
      ev("card_answered", { card_id: "c3", node: "k", kind: "you_decide", option: null }),
      ev("default_overridden", { node: "z", before: { status: "defaulted", chosen: "x", confidence: 0.66 }, after: "y" }),
    ];
    expect(cardSamples("p", events)).toEqual([
      { project_id: "p", node: "n", confidence: 0.7, correct: true },
      { project_id: "p", node: "m", confidence: 0.6, correct: true },
    ]);
    expect(overrideSamples("p", events)).toEqual([{ project_id: "p", node: "z", confidence: 0.66, correct: false }]);
  });
});

describe("theta replay", () => {
  it("mean cards is monotone non-increasing in θ over mock sessions", async () => {
    const { store } = await getFixture();
    const thetas = [0, 1, 5, 10, 20, 30, 50, 100, 1000];
    const pts = await replayTheta(store, thetas);
    expect(pts.map((p) => p.theta)).toEqual(thetas);
    expect(pts[0]!.sessions).toBe(4);
    for (let i = 1; i < pts.length; i++) expect(pts[i]!.mean_cards).toBeLessThanOrEqual(pts[i - 1]!.mean_cards);
    expect(pts[0]!.mean_cards).toBeGreaterThan(0);
    expect(pts.at(-1)!.mean_cards).toBe(0);
    for (const p of pts) {
      expect(p.overrides_avoided_rate).toBeGreaterThanOrEqual(0);
      expect(p.overrides_avoided_rate).toBeLessThanOrEqual(1);
    }
    // cutting every card turns s3's against-argmax answers into wrong defaults; asking everything costs none
    expect(pts.at(-1)!.mean_wrong_defaults).toBeGreaterThan(0);
    expect(pts[0]!.mean_wrong_defaults).toBe(0);
    expect(formatThetaTable(pts)).toContain("THETA REPLAY");
  });

  it("cardsUnderTheta / thetaTable arithmetic", () => {
    expect(cardsUnderTheta([5, 4, 3, 2, 1], 2.5)).toBe(3);
    expect(cardsUnderTheta([5, 4, 3], 0)).toBe(3);
    expect(cardsUnderTheta([5, 4, 3], 10)).toBe(0);
    expect(cardsUnderTheta([], 1)).toBe(0);
    const traces = [
      { project_id: "a", card_value1: [5, 3, 1], card_nodes: ["n1", "n2", "n3"], card_wrong: [false, true, false], overridden_nodes: ["n3", "zz"] },
      { project_id: "b", card_value1: [4, 2], card_nodes: ["m1", "m2"], card_wrong: [false, undefined], overridden_nodes: [] },
    ];
    const t = thetaTable(traces, [0, 2.5, 100]);
    expect(t[0]).toMatchObject({ theta: 0, mean_cards: 2.5, overrides_avoided_rate: 0.5, mean_wrong_defaults: 0 });
    // θ=2.5 → a asks 2 (n1,n2), b asks 1 (m1): n3 no longer asked; a's n2 is asked so no wrong default yet
    expect(t[1]).toMatchObject({ theta: 2.5, mean_cards: 1.5, overrides_avoided_rate: 0, mean_wrong_defaults: 0 });
    expect(t[2]).toMatchObject({ theta: 100, mean_cards: 0, mean_wrong_defaults: 0.5 });
    expect(thetaGrid(traces, 2)).toEqual([0, 1, 3, 5]);
    expect(thetaGrid([], 2)).toEqual([0]);
  });

  it("traceFromEvents marks against-argmax answers and ignores projects without cards", () => {
    const ev = (type: ZEvent["type"], payload: Record<string, unknown>): ZEvent => ({ id: "", project_id: "p", ts: "", type, payload, tags: { catalog: "", prompts: "", models: { strong: "", fast: "" } } });
    expect(traceFromEvents("p", [ev("project_created", {})])).toBeNull();
    const t = traceFromEvents("p", [
      ev("card_shown", { card_id: "c1", node: "n", value1: 3.2, dist: { a: 0.6, b: 0.4 } }),
      ev("card_answered", { card_id: "c1", node: "n", kind: "option", option: "b" }),
      ev("card_shown", { card_id: "c2", node: "m", value1: 1.1, dist: { a: 0.6, b: 0.4 } }),
      ev("card_answered", { card_id: "c2", node: "m", kind: "skip", option: null }),
      ev("default_overridden", { node: "q", before: {}, after: "x" }),
    ])!;
    expect(t).toEqual({ project_id: "p", card_value1: [3.2, 1.1], card_nodes: ["n", "m"], card_wrong: [true, undefined], overridden_nodes: ["q"] });
  });
});

describe("phrasing bandit", () => {
  it("rewards from mock events: answered fast = 1, undone = 0, you_decide = no sample", async () => {
    const { store } = await getFixture();
    const s1 = rewardFromEvents(await store.listEvents("s1"));
    expect(s1.length).toBeGreaterThan(0);
    expect(s1.every((r) => r.reward === 1 && r.arm === "default")).toBe(true);
    const s4 = rewardFromEvents(await store.listEvents("s4"));
    const undone = s4[0]!; // the first card was answered, undone, re-answered
    expect(undone.reward).toBe(0);
    expect(s4.slice(1).every((r) => r.reward === 1)).toBe(true);
    const state = updateAll({}, [...s1, ...s4]);
    const m = armMeans(state, undone.node);
    expect(m.default!.n).toBeGreaterThanOrEqual(1);
    // threshold: the mock answers carry think_ms 900, so a 500ms threshold zeroes them all
    expect(rewardFromEvents(await store.listEvents("s1"), { thinkThresholdMs: 500 }).every((r) => r.reward === 0)).toBe(true);
  });

  it("reward rules on hand-built events, with arm lookup", () => {
    const ev = (type: ZEvent["type"], payload: Record<string, unknown>): ZEvent => ({ id: "", project_id: "p", ts: "", type, payload, tags: { catalog: "", prompts: "", models: { strong: "", fast: "" } } });
    const events = [
      ev("card_shown", { card_id: "c1", node: "n" }),
      ev("card_answered", { card_id: "c1", node: "n", kind: "option", option: "a", think_ms: 1000 }),
      ev("card_shown", { card_id: "c2", node: "n" }),
      ev("card_answered", { card_id: "c2", node: "n", kind: "option", option: "a", think_ms: 30000 }),
      ev("card_shown", { card_id: "c3", node: "m" }),
      ev("card_answered", { card_id: "c3", node: "m", kind: "other", text: "hm" }),
      ev("card_shown", { card_id: "c4", node: "m" }),
      ev("card_answered", { card_id: "c4", node: "m", kind: "you_decide" }),
      ev("card_shown", { card_id: "c5", node: "k" }),
      ev("card_answered", { card_id: "c5", node: "k", kind: "option", option: "a", think_ms: null }),
      ev("card_shown", { card_id: "c6", node: "k" }),
    ];
    const arms: Record<string, string> = { c1: "v2", c2: "v2" };
    const r = rewardFromEvents(events, { armOf: (id) => arms[id] });
    expect(r).toEqual([
      { node: "n", arm: "v2", card_id: "c1", reward: 1 },
      { node: "n", arm: "v2", card_id: "c2", reward: 0 },
      { node: "m", arm: "default", card_id: "c3", reward: 0 },
      { node: "k", arm: "default", card_id: "c5", reward: 1 },
    ]);
  });

  it("update moves the posterior the right way and choose is deterministic under a seeded rng", () => {
    let s = update({}, "n", "a", 1);
    expect(s.n!.a).toEqual({ alpha: 2, beta: 1 });
    const before = s;
    s = update(s, "n", "a", 0);
    expect(s.n!.a).toEqual({ alpha: 2, beta: 2 });
    expect(before.n!.a).toEqual({ alpha: 2, beta: 1 }); // pure
    s = update(s, "n", "b", 1);
    expect(s.n!.b).toEqual({ alpha: 2, beta: 1 });
    // a clearly better arm wins most draws
    let t: typeof s = {};
    for (let i = 0; i < 40; i++) t = update(t, "n", "good", 1);
    for (let i = 0; i < 40; i++) t = update(t, "n", "bad", 0);
    const rng = mulberry32(42);
    let good = 0;
    for (let i = 0; i < 200; i++) if (choose(t, "n", ["bad", "good"], rng) === "good") good++;
    expect(good).toBeGreaterThan(190);
    // same seed → same sequence
    const a = Array.from({ length: 20 }, () => choose(s, "n", ["a", "b", "c"], mulberry32(7)));
    expect(new Set(a).size).toBe(1);
    expect(choose({}, "n", [], mulberry32(1))).toBe("default");
    // Beta sampling stays in [0,1] and has the right mean
    const r2 = mulberry32(3);
    const draws = Array.from({ length: 2000 }, () => sampleBeta(8, 2, r2));
    expect(draws.every((d) => d >= 0 && d <= 1)).toBe(true);
    expect(draws.reduce((x, y) => x + y, 0) / draws.length).toBeCloseTo(0.8, 1);
  });
});

describe("report", () => {
  it("runs every estimator and renders", async () => {
    const { store, catalogs } = await getFixture();
    const r = await runLearning(store, catalogs);
    expect(r.projects).toBe(4);
    expect(r.observations.length).toBeGreaterThan(0);
    expect(r.theta.length).toBeGreaterThan(1);
    expect(r.bandit.samples).toBeGreaterThan(0);
    const text = formatReport(r);
    expect(text).toContain("POPULATION PRIORS");
    expect(text).toContain("CALIBRATION");
    expect(text).toContain("THETA REPLAY");
    expect(text).toContain("PHRASING BANDIT");
    expect(text).toContain("archetype b2b-invoicing");
  });
});
