/**
 * Loop B — population priors (docs/LEARNING.md "Estimators").
 *
 * Pure arithmetic over logged events + final Sheets: counts per (archetype, node, option) with hierarchical
 * shrinkage catalog → global → archetype, and the mixing helper the engine would use to replace a node's
 * catalog `prior` with the learned estimate (α mixing with worlds stays untouched — see `worlds.distribution`).
 *
 * What counts as an observation (and what does not):
 *   - `card_answered` with kind=option → the user chose an option on a shown card. Weight 1. Answers that were
 *     later undone (a `card_answered` kind=undo for the same card_id) are dropped.
 *   - `default_overridden` → the user corrected a defaulted/implied decision to `after`. Weight 1 for `after`.
 *     The overridden-from option is NOT recorded as negative evidence: the `before` value was our own belief, not a
 *     user signal, and the positive observation of `after` already moves the estimate the right way.
 *   - Final *defaulted* decisions are NOT observations: they are the engine's own guesses (belief argmax), so
 *     counting them would make the prior confirm itself (Goodhart guardrail in LEARNING.md). Only decisions the
 *     user actually touched are evidence.
 * Only `collectObservations` does IO; everything else is pure and deterministic.
 */
import type { Store } from "../store/store.js";
import type { NodeDef } from "../core/catalog.js";
import type { ZEvent } from "../core/session.js";
import { learningProjectIds } from "./projects.js";
import type { Sheet } from "../core/sheet.js";

/** `refinement` = corrected while reading the compiled spec (`spec_refined`) — same grade of evidence as an
 *  `override`, kept separate so we can measure which surface actually catches wrong defaults. */
export type ObservationSource = "answer" | "override" | "refinement";

export interface Observation {
  project_id: string;
  archetypes: string[];
  node: string;
  option: string;
  source: ObservationSource;
  weight: number;
}

/** Extract observations from one project's final Sheet (for archetypes) and its event log. Pure. */
export function observationsFromEvents(projectId: string, archetypes: string[], events: ZEvent[]): Observation[] {
  // Effective answer per card: the latest option answer not followed by an undo of the same card.
  const answerByCard = new Map<string, { node: string; option: string }>();
  const order: string[] = []; // card ids in first-answer order, for deterministic output
  for (const e of events) {
    if (e.type !== "card_answered") continue;
    const cardId = typeof e.payload.card_id === "string" ? e.payload.card_id : undefined;
    if (!cardId) continue;
    const kind = e.payload.kind;
    if (kind === "undo") {
      answerByCard.delete(cardId);
      continue;
    }
    if (kind !== "option") continue;
    const node = e.payload.node;
    const option = e.payload.option;
    if (typeof node !== "string" || typeof option !== "string") continue;
    if (!order.includes(cardId)) order.push(cardId); // an undone-then-re-answered card keeps its first position
    answerByCard.set(cardId, { node, option });
  }
  const out: Observation[] = [];
  for (const cardId of order) {
    const a = answerByCard.get(cardId);
    if (a) out.push({ project_id: projectId, archetypes, node: a.node, option: a.option, source: "answer", weight: 1 });
  }
  for (const e of events) {
    if (e.type !== "default_overridden") continue;
    const node = e.payload.node;
    const after = e.payload.after;
    if (typeof node !== "string" || typeof after !== "string") continue;
    out.push({ project_id: projectId, archetypes, node, option: after, source: "override", weight: 1 });
  }
  for (const e of events) {
    if (e.type !== "spec_refined") continue;
    const corrections = Array.isArray(e.payload.corrections) ? e.payload.corrections : [];
    for (const c of corrections as { node?: unknown; option?: unknown }[]) {
      if (typeof c?.node !== "string" || typeof c?.option !== "string") continue;
      out.push({ project_id: projectId, archetypes, node: c.node, option: c.option, source: "refinement", weight: 1 });
    }
  }
  return out;
}

/** IO: walk projects (all, or the given ids), read the final Sheet + events, and extract observations. */
export async function collectObservations(store: Store, projectIds?: string[]): Promise<Observation[]> {
  const ids = projectIds ?? (await learningProjectIds(store));
  const out: Observation[] = [];
  for (const id of ids) {
    const [sheet, events] = await Promise.all([store.getLatestSheet(id), store.listEvents(id)]);
    out.push(...observationsFromEvents(id, archetypesOf(sheet), events));
  }
  return out;
}

function archetypesOf(sheet: Sheet | null): string[] {
  return sheet ? [...sheet.archetypes] : [];
}

export interface NodePrior {
  /** total observation weight that went into this estimate (before shrinkage) */
  n: number;
  prior: Record<string, number>; // normalized over the node's options
}

export interface PopulationPriors {
  n0: number;
  /** archetype → node → shrunk estimate (archetype counts shrunk toward the global estimate) */
  byArchetype: Record<string, Record<string, NodePrior>>;
  /** node → shrunk estimate (global counts shrunk toward the catalog prior) */
  global: Record<string, NodePrior>;
}

type Counts = Record<string, Record<string, number>>; // node → option → weight

function addCount(counts: Counts, node: string, option: string, w: number) {
  const c = (counts[node] ??= {});
  c[option] = (c[option] ?? 0) + w;
}

function normalize(p: Record<string, number>): Record<string, number> {
  const total = Object.values(p).reduce((s, v) => s + v, 0);
  const keys = Object.keys(p);
  if (total <= 0) return Object.fromEntries(keys.map((k) => [k, 1 / keys.length]));
  return Object.fromEntries(keys.map((k) => [k, p[k]! / total]));
}

/** `(count + n0·base) / (n + n0)` per option — the one shrinkage step used at every level. */
export function shrink(node: NodeDef, counts: Record<string, number> | undefined, base: Record<string, number>, n0: number): NodePrior {
  let n = 0;
  for (const o of node.options) n += counts?.[o.id] ?? 0; // options unknown to the catalog are ignored
  const prior: Record<string, number> = {};
  for (const o of node.options) prior[o.id] = ((counts?.[o.id] ?? 0) + n0 * (base[o.id] ?? 0)) / (n + n0);
  return { n, prior: normalize(prior) };
}

/**
 * Hierarchical shrinkage: catalog prior → global estimate → per-archetype estimate.
 * n0 is the pseudo-count of the parent level: with n ≪ n0 the estimate stays near the parent, with n ≫ n0 it
 * follows the counts. Observations on nodes absent from `nodes` (e.g. per-project bespoke nodes, whose ids are
 * not comparable across projects) are ignored.
 */
export function populationPriors(observations: Observation[], nodes: NodeDef[], opts: { n0?: number } = {}): PopulationPriors {
  const n0 = opts.n0 ?? 5;
  const globalCounts: Counts = {};
  const archCounts: Record<string, Counts> = {};
  const known = new Map(nodes.map((n) => [n.id, n]));
  for (const o of observations) {
    if (!known.has(o.node) || o.weight <= 0) continue;
    addCount(globalCounts, o.node, o.option, o.weight);
    for (const a of o.archetypes) addCount((archCounts[a] ??= {}), o.node, o.option, o.weight);
  }
  const global: Record<string, NodePrior> = {};
  for (const n of nodes) global[n.id] = shrink(n, globalCounts[n.id], n.prior, n0);
  const byArchetype: Record<string, Record<string, NodePrior>> = {};
  for (const a of Object.keys(archCounts).sort()) {
    const per: Record<string, NodePrior> = {};
    for (const n of nodes) per[n.id] = shrink(n, archCounts[a]?.[n.id], global[n.id]!.prior, n0);
    byArchetype[a] = per;
  }
  return { n0, byArchetype, global };
}

/** The prior a session should use: first of its archetypes with data for the node, else global, else null. */
export function learnedPriorFor(pp: PopulationPriors, archetypes: string[], nodeId: string): NodePrior | null {
  for (const a of archetypes) {
    const e = pp.byArchetype[a]?.[nodeId];
    if (e && e.n > 0) return e;
  }
  return pp.global[nodeId] ?? null;
}

/**
 * `P = (1 − λ)·P_catalog + λ·P_learned`, λ = λ(n) (default n/(n+n0)) — returns NEW NodeDef objects.
 * Where it would plug in: `Engine.createProject` builds `allNodes = [...nodes, ...bespokeDefs]` and puts it in
 * `belief.nodes`; replacing `nodes` with `mixWithCatalog(nodes, pp, sheet.archetypes)` there would make the
 * selector's α-mixing (`distribution`) regularize toward the learned prior instead of the hand-set one.
 * Not wired in: enabling it is a harness-gated experiment, not a code change.
 */
export function mixWithCatalog(nodes: NodeDef[], pp: PopulationPriors, archetypes: string[], lambdaOf: (n: number) => number = (n) => n / (n + pp.n0)): NodeDef[] {
  return nodes.map((node) => {
    const learned = learnedPriorFor(pp, archetypes, node.id);
    if (!learned) return { ...node, prior: { ...node.prior } };
    const lambda = Math.max(0, Math.min(1, lambdaOf(learned.n)));
    const prior: Record<string, number> = {};
    for (const o of node.options) prior[o.id] = (1 - lambda) * (node.prior[o.id] ?? 0) + lambda * (learned.prior[o.id] ?? 0);
    return { ...node, prior: normalize(prior) };
  });
}

/** Nodes ranked by how much evidence they have, for reports. */
export function topNodesByN(pp: PopulationPriors, archetype?: string, limit = 10): { node: string; n: number; prior: Record<string, number> }[] {
  const src = archetype ? (pp.byArchetype[archetype] ?? {}) : pp.global;
  return Object.entries(src)
    .map(([node, e]) => ({ node, n: e.n, prior: e.prior }))
    .sort((a, b) => b.n - a.n || a.node.localeCompare(b.node))
    .slice(0, limit);
}
