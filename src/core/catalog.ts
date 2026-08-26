/**
 * Decision catalog — the universe of decisions the system may resolve, per archetype.
 * Hand/LLM-authored offline, versioned like code. The user never sees it; the selector
 * asks only the few nodes where the sampled worlds disagree AND the consequence is high.
 */
import { z } from "zod";
import type { Decision } from "./sheet.js";

export const CatalogOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  /** hard logical implications: choosing this option forces node=option elsewhere */
  implies: z.array(z.object({ node: z.string(), option: z.string() })).default([]),
  /**
   * Hard mutual exclusion: choosing this option makes node=option elsewhere IMPOSSIBLE.
   *
   * Why `implies` cannot say this. An implication must name the one option it forces, so ruling a single
   * option OUT of a three-option node can only be written by enumerating the survivors — and there is no
   * way to write "one of these two" at all. Worse, such an edge silently becomes a lie the day a fourth
   * option is added: it goes on forcing yesterday's survivor instead of merely forbidding the excluded one.
   * `payments_in_app = none` does not know WHICH `payment_recording` option holds; it knows that every
   * option which records a payment is off the table. An exclusion states exactly that and nothing more.
   *
   * It is a CONSTRAINT, not a derivation: on its own it never sets a value. It removes candidates, and only
   * when the removals leave a single candidate does the node settle (unit propagation, see `propagateHard`).
   *
   * It is also SYMMETRIC — "A=a and B=b cannot both hold" is one fact about a pair, and which end of the
   * pair the author happened to write it on is an accident of authoring. `propagateHard` indexes both
   * directions for that reason; see the note there.
   */
  excludes: z.array(z.object({ node: z.string(), option: z.string() })).default([]),
  /** how to phrase the consequence of this option to a non-technical user */
  hint: z.string().optional(),
});
export type CatalogOption = z.infer<typeof CatalogOptionSchema>;

/**
 * Two catalog nodes that ask the SAME question at different granularity (core's broad phrasing and an
 * archetype's specific one). A one-way `implies` edge cannot express this: `propagateHard` walks forward
 * only, so `recurring_scheduled = recurring_records` beside `record_recurring = no` produced ZERO conflicts
 * and the owner was asked "does anything happen on a schedule?" twice, under one topic label, and shipped
 * both answers. An equivalence is not an implication — it must remove one of the two nodes.
 *
 * Semantics: when BOTH nodes reach the merged node set, `prefer` says which one survives; the loser is
 * deleted before the planner ever sees it (so it can never be asked, shown, defaulted or sampled), and its
 * `implies` / `requires` edges — plus every edge anywhere that pointed AT it — are rewritten onto the winner
 * through `map`. When only one of the two is loaded (the archetype isn't in play), the declaration is inert.
 *
 * AUTHORING RULE (which node to prefer): keep the node whose option set can express every distinction the
 * other's can, so the merge loses no expressiveness — e.g. core `recurring_scheduled`
 * (none / reminders_only / recurring_records) subsumes crud-saas `record_recurring` (no / recurring_records)
 * and is also the target four archetype catalogs already imply into, so it wins. When neither subsumes the
 * other, prefer the archetype node over the core one: the app has that archetype, so the specific phrasing
 * is the one its owner can actually answer.
 */
export const CatalogSameAsSchema = z.object({
  /** the other node asking the same question */
  node: z.string().min(1),
  /** which of the two survives: "this" = the node carrying this declaration, "other" = `node` */
  prefer: z.enum(["this", "other"]),
  /**
   * LOSING node's option id -> SURVIVING node's option id (which side loses is decided by `prefer`).
   * Options whose ids are identical on both sides may be omitted; every other losing option must appear,
   * or the merge reports an error — an unmapped option would silently drop a hard edge.
   */
  map: z.record(z.string(), z.string()).default({}),
});
export type CatalogSameAs = z.infer<typeof CatalogSameAsSchema>;

export const CatalogNodeSchema = z.object({
  id: z.string().min(1),
  topic: z.string().min(1),
  /** internal phrasing (never shown as-is; cards rephrase as consequences) */
  question: z.string().min(1),
  options: z.array(CatalogOptionSchema).min(2),
  /** blast radius if defaulted wrong, 0..5 (v1 hand-set; later measured by sensitivity analysis) */
  consequence: z.number().min(0).max(5).default(3),
  /** spec sections this node touches */
  sections: z.array(z.string()).default([]),
  /** prior over options (unnormalized ok). Missing → uniform */
  prior: z.record(z.string(), z.number().min(0)).optional(),
  /** archetype ids this node applies to; empty → all archetypes */
  applies_to: z.array(z.string()).default([]),
  /**
   * Hierarchical gating (the fractal decision tree): this node is ASKABLE only while every entry holds —
   * entry = the named parent decision is settled to one of the listed options. Children are always sampled
   * into worlds and always defaulted at finish; the gate controls only whether a card may be spent on them,
   * so the ≤12-card budget descends into a subtree only after its parent is settled at user grade.
   */
  requires: z.array(z.object({ node: z.string(), options: z.array(z.string()).min(1) })).default([]),
  ask_hint: z.string().optional(),
  /**
   * Free-form authoring tags. `record_workflow` is load-bearing: it marks a node about per-record HUMAN
   * workflow (assignment, deadlines, watchers, comments, saved views, templates, bulk edit), which
   * `routeByWorkflowSignal` routes out of apps whose drafted nouns show no sign of such a workflow.
   */
  tags: z.array(z.string()).default([]),
  /** this node is the same question as another node — see CatalogSameAsSchema */
  same_as: CatalogSameAsSchema.optional(),
});
export type CatalogNode = z.infer<typeof CatalogNodeSchema>;

export const CatalogSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  /** 'core' = applies to every app; otherwise an archetype id */
  archetype: z.string().min(1),
  description: z.string().optional(),
  nodes: z.array(CatalogNodeSchema),
});
export type Catalog = z.infer<typeof CatalogSchema>;

/** Runtime node definition used by belief/selector (catalog nodes and bespoke nodes share this shape). */
export interface NodeDef {
  id: string;
  topic: string;
  question: string;
  options: { id: string; label: string; hint?: string }[];
  consequence: number;
  prior: Record<string, number>; // normalized
  implies: Record<string, { node: string; option: string }[]>; // by option id
  /**
   * Hard mutual exclusions, keyed by option id exactly like `implies` — see CatalogOptionSchema.excludes.
   * OPTIONAL where `implies` is required, deliberately: every NodeDef built by hand (test fixtures, harness
   * baselines, `nodeDefFromDecision`) predates exclusions, and "absent" has to keep meaning what "{}" means
   * — this node forbids nothing. Read it as `n.excludes?.[opt] ?? []`, never as `n.excludes[opt]`.
   */
  excludes?: Record<string, { node: string; option: string }[]>; // by option id
  sections: string[];
  bespoke: boolean;
  /** catalog the node came from: "core", an archetype id, or "bespoke" */
  archetype: string;
  /** hierarchical gate — see CatalogNodeSchema.requires; absent/empty = never gated */
  requires?: { node: string; options: string[] }[];
  ask_hint?: string;
  /** authoring tags carried through from the catalog (see CatalogNodeSchema.tags) */
  tags?: string[];
}

/**
 * Is a gated node currently askable? A requirement holds only when the parent is settled at USER grade
 * (resolved or implied): asking a child of a merely-defaulted parent would interrogate an assumption's
 * details before the assumption itself is confirmed. Children of defaulted parents stay gated, get
 * defaulted from priors like everything else, and unlock in a later loop if the parent gets resolved
 * (defaults-review override, gap loop, story correction).
 */
export function requirementsMet(
  requires: { node: string; options: string[] }[],
  decisions: { id: string; chosen?: string; status: string }[],
): boolean {
  return requires.every((r) => {
    const d = decisions.find((x) => x.id === r.node);
    return !!d && !!d.chosen && (d.status === "resolved" || d.status === "implied") && r.options.includes(d.chosen);
  });
}

export function normalizePrior(options: { id: string }[], prior?: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  let total = 0;
  for (const o of options) {
    const v = prior?.[o.id];
    const p = v !== undefined && v > 0 ? v : prior ? 0 : 1;
    out[o.id] = p;
    total += p;
  }
  if (total <= 0) {
    for (const o of options) out[o.id] = 1 / options.length;
    return out;
  }
  for (const k of Object.keys(out)) out[k] = out[k]! / total;
  return out;
}

export function toNodeDef(n: CatalogNode, archetype = "core"): NodeDef {
  const implies: NodeDef["implies"] = {};
  const excludes: NonNullable<NodeDef["excludes"]> = {};
  for (const o of n.options) {
    implies[o.id] = o.implies ?? [];
    excludes[o.id] = o.excludes ?? [];
  }
  return {
    id: n.id,
    topic: n.topic,
    question: n.question,
    options: n.options.map((o) => ({ id: o.id, label: o.label, ...(o.hint ? { hint: o.hint } : {}) })),
    consequence: n.consequence,
    prior: normalizePrior(n.options, n.prior),
    implies,
    excludes,
    sections: n.sections,
    bespoke: false,
    archetype,
    requires: n.requires ?? [],
    tags: n.tags ?? [],
    ...(n.ask_hint ? { ask_hint: n.ask_hint } : {}),
  };
}

/**
 * A bespoke decision (proposed by the planner for this app) as a NodeDef — no hard edges.
 * `implies` and `excludes` are both empty by construction: hard edges are authored offline and reviewed,
 * never proposed by the LLM at session time (dogfood rule 1 — the model proposes, the code decides).
 */
export function nodeDefFromDecision(d: Decision, prior?: Record<string, number>): NodeDef {
  const implies: NodeDef["implies"] = {};
  const excludes: NonNullable<NodeDef["excludes"]> = {};
  for (const o of d.options) {
    implies[o.id] = [];
    excludes[o.id] = [];
  }
  return {
    id: d.id,
    topic: d.topic,
    question: d.question,
    options: d.options.map((o) => ({ id: o.id, label: o.label })),
    consequence: d.consequence,
    prior: normalizePrior(d.options, prior),
    implies,
    excludes,
    sections: [],
    bespoke: true,
    archetype: "bespoke",
    requires: [],
    tags: [],
  };
}

/** Index of node id -> option ids, the shape both same_as validators work against. */
export type OptionIndex = Map<string, Set<string>>;

/**
 * Validate one `same_as` declaration against the two nodes' option sets: `map` must land inside both, and
 * every option of the LOSING node must have somewhere to go (explicit entry, or an identically-named option
 * on the winner). An unmapped losing option would silently drop whatever hard edge referenced it.
 */
function validateSameAsPair(declarer: string, same: CatalogSameAs, loser: string, winner: string, index: OptionIndex): string[] {
  const errors: string[] = [];
  const lo = index.get(loser);
  const wo = index.get(winner);
  if (!lo || !wo) return errors;
  for (const [from, to] of Object.entries(same.map)) {
    if (!lo.has(from)) errors.push(`${declarer}.same_as maps unknown option ${loser}.${from}`);
    if (!wo.has(to)) errors.push(`${declarer}.same_as maps ${loser}.${from} to unknown option ${winner}.${to}`);
  }
  for (const o of lo) if (same.map[o] === undefined && !wo.has(o)) errors.push(`${declarer}.same_as leaves ${loser}.${o} unmapped (no ${winner}.${o} either)`);
  return errors;
}

/** loser id -> { winner, map } for one declaration, or null when it is malformed / inert. */
function sameAsEdge(nodeId: string, same: CatalogSameAs): { loser: string; winner: string } {
  return same.prefer === "this" ? { loser: same.node, winner: nodeId } : { loser: nodeId, winner: same.node };
}

/**
 * Graph-level same_as checks over whatever set of declarations the caller can see: a node may lose at most
 * once (two winners would make the merge order-dependent), and the loser->winner graph must be acyclic —
 * a mutual declaration is just a 2-cycle, and it is the shape an author reaches for first.
 */
function validateSameAsGraph(decls: Map<string, CatalogSameAs>): { errors: string[]; edges: Map<string, { winner: string; map: Record<string, string> }> } {
  const errors: string[] = [];
  const edges = new Map<string, { winner: string; map: Record<string, string> }>();
  const owner = new Map<string, string>(); // loser -> declaring node id
  for (const [id, same] of [...decls].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const { loser, winner } = sameAsEdge(id, same);
    const prev = owner.get(loser);
    if (prev !== undefined) {
      errors.push(`${loser} is declared same_as by both ${prev} and ${id} — a node may be merged away only once`);
      continue;
    }
    owner.set(loser, id);
    edges.set(loser, { winner, map: same.map });
  }
  for (const start of edges.keys()) {
    const seen = new Set<string>([start]);
    let at = start;
    for (;;) {
      const next = edges.get(at);
      if (!next) break;
      if (seen.has(next.winner)) {
        errors.push(`same_as cycle: ${[...seen, next.winner].join(" -> ")}`);
        edges.delete(start);
        break;
      }
      seen.add(next.winner);
      at = next.winner;
    }
  }
  return { errors, edges };
}

/**
 * Validate a single catalog: unique node/option ids, and same_as declarations. `known` carries option ids of
 * nodes defined in OTHER catalogs (core, sibling archetypes) so cross-catalog same_as targets can be checked
 * too; without it only intra-catalog references are resolvable. Cross-node `implies`/`requires` edge targets
 * are still validated on merge.
 */
export function validateCatalog(c: Catalog, known?: OptionIndex): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const index: OptionIndex = new Map(known ? [...known] : []);
  for (const n of c.nodes) index.set(n.id, new Set(n.options.map((o) => o.id)));
  const decls = new Map<string, CatalogSameAs>();
  for (const n of c.nodes) {
    if (ids.has(n.id)) errors.push(`duplicate node id ${n.id}`);
    ids.add(n.id);
    const oids = new Set<string>();
    for (const o of n.options) {
      if (oids.has(o.id)) errors.push(`duplicate option id ${n.id}.${o.id}`);
      oids.add(o.id);
    }
    if (n.prior) for (const k of Object.keys(n.prior)) if (!oids.has(k)) errors.push(`prior references unknown option ${n.id}.${k}`);
    if (!n.same_as) continue;
    if (n.same_as.node === n.id) {
      errors.push(`${n.id}.same_as points at itself`);
      continue;
    }
    if (!index.has(n.same_as.node)) {
      errors.push(`${n.id}.same_as references unknown node ${n.same_as.node}`);
      continue;
    }
    const { loser, winner } = sameAsEdge(n.id, n.same_as);
    errors.push(...validateSameAsPair(n.id, n.same_as, loser, winner, index));
    decls.set(n.id, n.same_as);
  }
  // mutual/cyclic declarations that are visible from inside this catalog alone
  errors.push(...validateSameAsGraph(decls).errors);
  return errors;
}

/** One node merged away by a `same_as` declaration, for logging/telemetry. */
export interface SameAsMerge {
  loser: string;
  winner: string;
  /** losing option id -> surviving option id (identity entries included) */
  map: Record<string, string>;
}

/**
 * Merge core + archetype catalogs into the node set for a session. Later catalogs override earlier ones by
 * node id, and `same_as` equivalences collapse pairs that ask the same question (the loser is removed here,
 * before anything downstream can ask, show, sample or default it — see CatalogSameAsSchema).
 */
export function mergeCatalogs(catalogs: Catalog[], archetypes: string[]): { nodes: NodeDef[]; errors: string[]; same_as: SameAsMerge[] } {
  const errors: string[] = [];
  const byId = new Map<string, NodeDef>();
  const wanted = new Set(archetypes);
  const ordered = [...catalogs.filter((c) => c.archetype === "core"), ...catalogs.filter((c) => c.archetype !== "core" && wanted.has(c.archetype))];
  // Every node id defined anywhere in the input, so a same_as target that exists but was not loaded (its
  // archetype is not in play) stays inert, while a typo'd target is still reported.
  const definedAnywhere: OptionIndex = new Map();
  for (const c of catalogs) for (const n of c.nodes) definedAnywhere.set(n.id, new Set(n.options.map((o) => o.id)));
  const declarations = new Map<string, CatalogSameAs>();
  for (const c of ordered) {
    const known: OptionIndex = new Map([...definedAnywhere].filter(([id]) => !c.nodes.some((n) => n.id === id)));
    errors.push(...validateCatalog(c, known).map((e) => `${c.id}: ${e}`));
    for (const n of c.nodes) {
      if (n.applies_to.length > 0 && !n.applies_to.some((a) => wanted.has(a))) continue;
      byId.set(n.id, toNodeDef(n, c.archetype));
      if (n.same_as) declarations.set(n.id, n.same_as);
    }
  }
  const same_as = resolveSameAs(byId, declarations, errors);
  // validate edges
  for (const n of byId.values()) {
    for (const [opt, edges] of Object.entries(n.implies)) {
      for (const e of edges) {
        const t = byId.get(e.node);
        if (!t) errors.push(`${n.id}.${opt} implies unknown node ${e.node}`);
        else if (!t.options.some((o) => o.id === e.option)) errors.push(`${n.id}.${opt} implies unknown option ${e.node}.${e.option}`);
      }
    }
    // Exclusion targets are checked exactly like implication targets: a typo'd edge is worse here than
    // anywhere else, because an exclusion that resolves to nothing does not fail loudly at propagation time
    // — it simply never constrains anything, and the impossible pair it was written to forbid ships.
    for (const [opt, edges] of Object.entries(n.excludes ?? {})) {
      for (const e of edges) {
        // `A=a excludes A=a` makes the option unchoosable: pick it and you have contradicted yourself. That
        // is never what an author means, so it is an error rather than a runtime conflict. (`A=a excludes
        // A=a2` with a2 ≠ a is only a tautology — one node holds one option — so it is left alone: harmless
        // to state, inert at propagation.)
        if (e.node === n.id && e.option === opt) {
          errors.push(`${n.id}.${opt} excludes itself`);
          continue;
        }
        const t = byId.get(e.node);
        if (!t) errors.push(`${n.id}.${opt} excludes unknown node ${e.node}`);
        else if (!t.options.some((o) => o.id === e.option)) errors.push(`${n.id}.${opt} excludes unknown option ${e.node}.${e.option}`);
      }
    }
    for (const r of n.requires ?? []) {
      const t = byId.get(r.node);
      if (!t) errors.push(`${n.id} requires unknown node ${r.node}`);
      else for (const o of r.options) if (!t.options.some((x) => x.id === o)) errors.push(`${n.id} requires unknown option ${r.node}.${o}`);
      if (t?.requires?.some((rr) => rr.node === n.id)) errors.push(`${n.id} and ${r.node} require each other`);
    }
  }
  return { nodes: [...byId.values()], errors, same_as };
}

/**
 * Collapse `same_as` pairs in place: delete each loser from `byId`, carry its hard edges onto the winner
 * rewritten through the option map, and retarget every edge elsewhere that pointed at it. Chains
 * (A -> B -> C) resolve to the terminal winner with the maps composed. Only pairs where BOTH nodes are
 * present collapse; a declaration whose partner was not loaded is inert.
 */
function resolveSameAs(byId: Map<string, NodeDef>, declarations: Map<string, CatalogSameAs>, errors: string[]): SameAsMerge[] {
  const live = new Map<string, CatalogSameAs>();
  for (const [id, same] of declarations) if (byId.has(id) && byId.has(same.node) && same.node !== id) live.set(id, same);
  const graph = validateSameAsGraph(live);
  errors.push(...graph.errors);
  if (graph.edges.size === 0) return [];

  // one hop, with identity filled in for options whose ids match on both sides
  const hop = (loser: string): { winner: string; map: Record<string, string> } | undefined => {
    const e = graph.edges.get(loser);
    if (!e) return undefined;
    const w = byId.get(e.winner);
    const l = byId.get(loser);
    if (!w || !l) return undefined;
    const map: Record<string, string> = {};
    for (const o of l.options) {
      const to = e.map[o.id] ?? (w.options.some((x) => x.id === o.id) ? o.id : undefined);
      if (to === undefined) {
        errors.push(`same_as ${loser} -> ${e.winner} leaves option ${o.id} unmapped`);
        return undefined;
      }
      map[o.id] = to;
    }
    return { winner: e.winner, map };
  };
  /** follow the chain to the terminal winner, composing maps (cycles are already rejected above) */
  const terminal = (loser: string): { winner: string; map: Record<string, string> } | undefined => {
    let step = hop(loser);
    if (!step) return undefined;
    for (let guard = 0; guard < graph.edges.size + 1; guard++) {
      const next = hop(step.winner);
      if (!next) return step;
      const composed: Record<string, string> = {};
      for (const [from, to] of Object.entries(step.map)) composed[from] = next.map[to] ?? to;
      step = { winner: next.winner, map: composed };
    }
    return step;
  };

  const merges: SameAsMerge[] = [];
  for (const loser of [...graph.edges.keys()].sort()) {
    const t = terminal(loser);
    if (t) merges.push({ loser, winner: t.winner, map: t.map });
  }
  const retarget = (node: string, option: string): { node: string; option: string } => {
    const m = merges.find((x) => x.loser === node);
    return m ? { node: m.winner, option: m.map[option] ?? option } : { node, option };
  };

  for (const m of merges) {
    const loser = byId.get(m.loser);
    const winner = byId.get(m.winner);
    if (!loser || !winner) continue;
    // carry the loser's outgoing implications onto the winner's corresponding option
    for (const [opt, edges] of Object.entries(loser.implies)) {
      const wo = m.map[opt]!;
      for (const e of edges) {
        const t = retarget(e.node, e.option);
        if (t.node === m.winner) {
          if (t.option !== wo) errors.push(`same_as ${m.loser} -> ${m.winner}: ${m.loser}.${opt} implies ${t.node}=${t.option}, but the map sends it to ${wo}`);
          continue; // tautology once the two nodes are one
        }
        const into = (winner.implies[wo] ??= []);
        if (!into.some((x) => x.node === t.node && x.option === t.option)) into.push(t);
      }
    }
    // carry the loser's outgoing exclusions the same way. The polarity of the "lands on the winner" case is
    // the MIRROR of the implication one above: an implication into the winner is a tautology when the map
    // agrees and a contradiction when it disagrees; an exclusion into the winner is a tautology when the map
    // DISAGREES (two distinct options of one node already exclude each other — merging the two nodes is what
    // made that true, and there is nothing left to record) and impossible when it agrees, because the
    // surviving option would then forbid itself and could never be chosen at all.
    for (const [opt, edges] of Object.entries(loser.excludes ?? {})) {
      const wo = m.map[opt]!;
      for (const e of edges) {
        const t = retarget(e.node, e.option);
        if (t.node === m.winner) {
          if (t.option === wo) errors.push(`same_as ${m.loser} -> ${m.winner}: ${m.loser}.${opt} excludes ${t.node}=${t.option}, which the map turns into ${m.winner}.${wo} excluding itself`);
          continue; // tautology once the two nodes are one
        }
        const target = (winner.excludes ??= {});
        const into = (target[wo] ??= []);
        if (!into.some((x) => x.node === t.node && x.option === t.option)) into.push(t);
      }
    }
    // carry the loser's gate onto the winner (gates conjoin: the winner is askable only when both hold)
    const req = (winner.requires ??= []);
    for (const r of loser.requires ?? []) {
      const mapped = r.options.map((o) => retarget(r.node, o));
      const target = mapped[0]?.node ?? r.node;
      if (target === m.winner) continue;
      const options = mapped.map((x) => x.option);
      if (!req.some((x) => x.node === target && x.options.join(",") === options.join(","))) req.push({ node: target, options });
    }
    byId.delete(m.loser);
  }
  // rewrite every surviving edge that pointed at a node that just disappeared
  for (const n of byId.values()) {
    for (const [opt, edges] of Object.entries(n.implies)) {
      const next: { node: string; option: string }[] = [];
      for (const e of edges) {
        const t = retarget(e.node, e.option);
        if (t.node === n.id) {
          if (t.option !== opt) errors.push(`same_as rewrite made ${n.id}.${opt} imply itself as ${t.option}`);
          continue;
        }
        if (!next.some((x) => x.node === t.node && x.option === t.option)) next.push(t);
      }
      n.implies[opt] = next;
    }
    const excludes = n.excludes;
    if (excludes) {
      for (const [opt, edges] of Object.entries(excludes)) {
        const next: { node: string; option: string }[] = [];
        for (const e of edges) {
          const t = retarget(e.node, e.option);
          if (t.node === n.id) {
            // mirror of the implication rewrite: excluding the very option that declares the exclusion makes
            // that option unchoosable, which no author meant to write; excluding a SIBLING option is merely
            // restating that a node holds one option at a time, so it is dropped in silence.
            if (t.option === opt) errors.push(`same_as rewrite made ${n.id}.${opt} exclude itself`);
            continue;
          }
          if (!next.some((x) => x.node === t.node && x.option === t.option)) next.push(t);
        }
        excludes[opt] = next;
      }
    }
    if (n.requires?.length) {
      n.requires = n.requires
        .map((r) => {
          const mapped = r.options.map((o) => retarget(r.node, o));
          return { node: mapped[0]?.node ?? r.node, options: mapped.map((x) => x.option) };
        })
        .filter((r) => r.node !== n.id);
    }
  }
  return merges;
}

export interface PropagationResult {
  assignment: Record<string, string>;
  /**
   * nodes set by propagation: node -> {option, because: "node=option"}.
   * A value settled by unit propagation over exclusions (see `propagateHard`) names every settled decision
   * that ruled the alternatives out, comma-joined and sorted: "payments_in_app=none,refunds=never".
   */
  derived: Record<string, { option: string; because: string }>;
  /**
   * Hard contradictions: a node already set to a different option than an edge demands, or a pair of values
   * an exclusion forbids from holding together.
   *
   * SHAPE NOTE. `kind` is ABSENT for the implication case rather than set to "implies", and that is
   * load-bearing, not laziness: this record predates exclusions and is read all over —
   * `src/core/worlds.ts` (`repairAssignment` formats it into a string; `resolveAssignment` reads only
   * `.length`), `src/cli/index.ts` (`⚠️ ledger conflict: …`), `src/engine/compile.ts` (draft banner,
   * deliverability, `ledger_conflicts` in the report JSON), `src/engine/orchestrator.ts` (finishCards,
   * defaultOps, the `implications_applied` event payload), and `src/engine/orchestrator.test.ts` asserts a
   * whole record with `toEqual`. Absent therefore reads as "implies" and nothing written before this field
   * existed can tell the difference — including the serialized event payloads.
   *
   * For `kind: "excludes"` there is no single option the edge WANTS — it forbids one — so:
   *   · `have` is the forbidden option the node actually holds and `want` is that same option NEGATED,
   *     `"!<option>"`, which keeps every one of those sentences true: "B is b1 but A=a1 wants !b1";
   *   · `have === ""` with `want === "!*"` is the wipe-out case: the node holds nothing because exclusions
   *     ruled out EVERY option it has, so there is no value it could take at all. `because` then names all
   *     the decisions that did it. This one is an authoring bug in the catalog, not a user contradiction.
   * One violated pair is reported ONCE (the constraint is symmetric — reporting it from both ends would
   * double-count contradictions in the compile banner).
   */
  conflicts: { node: string; have: string; want: string; because: string; kind?: "implies" | "excludes" }[];
}

/**
 * Hard-edge contradictions in a SETTLED ledger (empty = consistent). Cards, defaults and reviews each keep
 * themselves consistent locally, but only a joint pass over the final assignment can certify the whole —
 * per-node marginal defaulting once shipped `user_accounts=none` beside a default whose edge demands
 * `multi_user`. Compile refuses on these; finishCards avoids creating them.
 */
export function ledgerConflicts(
  decisions: { id: string; chosen?: string; status: string }[],
  nodes: NodeDef[],
): PropagationResult["conflicts"] {
  const assignment: Record<string, string> = {};
  for (const d of decisions) if (d.chosen && d.status !== "open" && d.status !== "skipped") assignment[d.id] = d.chosen;
  return propagateHard(assignment, nodes).conflicts;
}

/**
 * Deterministic fixpoint over hard edges. Existing assignments are never overwritten (conflicts are reported).
 *
 * Two kinds of edge take part, and they are not the same kind of thing:
 *   · `implies` DERIVES. `A=a` forces `B=b`: an unset B is set, a differently-set B is a conflict.
 *   · `excludes` CONSTRAINS. `A=a` makes `B=b` impossible. It never sets B by itself — it removes b from
 *     B's candidates, and three things can follow:
 *       (1) B already holds b            → a hard conflict (kind "excludes"), REPORTED, never thrown;
 *       (2) removals leave ONE candidate → unit propagation: B is settled to the survivor and recorded in
 *           `derived`. This is what makes exclusions worth having rather than merely diagnostic — the whole
 *           point of `payments_in_app = none` is that the app stops asking how payments are recorded;
 *       (3) removals leave NONE          → the wipe-out conflict (see PropagationResult.conflicts), again
 *           reported rather than thrown: a catalog can be authored into a corner and the owner must be told,
 *           not crashed on.
 *
 * SYMMETRY. An exclusion is one fact about a PAIR, so it is indexed in both directions before the walk. The
 * alternative — walking it forward only, like an implication — reproduces a bug this codebase has already
 * paid for once: hard edges are directional and `propagateHard` walks forward from what was just settled,
 * which is why `finishCards` needs a whole extra backward pass (orchestrator.ts) and why `resolveAssignment`
 * (worlds.ts) propagates each value it places with `roots=[id]`. A world that placed `payments=none` first
 * and then proposed `recording=in_app` would walk only `recording`, never reach `payments`' edge, and ship
 * the impossible pair. Indexing both ends makes one forward walk enough, whichever end was authored.
 *
 * ORDER. On a consistent input the result does not depend on walk order: eliminations are monotone (an
 * option is only ever removed) and every settled value is enqueued, so the walk computes a least fixpoint.
 * On a CONTRADICTORY input a conflict is always reported whichever order the walk takes, but which of the
 * two symmetric phrasings you get, and which record carries the blame, follows the walk — exactly as it
 * already does when two implications fight over one node.
 *
 * TERMINATION. A node is assigned at most once and never overwritten, so `seen` admits each node once and
 * the queue takes at most one push per node; eliminations only ever grow. A cycle of exclusions (a excludes
 * b, b excludes c, c excludes a) therefore settles instead of spinning — see the cycle test in catalog.test.ts.
 *
 * COST. When no node declares an exclusion the pair index comes out empty and every exclusion branch is
 * skipped. That is a short-circuit, not a second code path: with no exclusion edges the bookkeeping below
 * cannot produce an elimination, a settled value or a conflict, so today's catalogs (which declare none) run
 * exactly the code and exactly the comparisons they ran before this feature landed.
 */
export function propagateHard(assignment: Record<string, string>, nodes: NodeDef[], roots?: string[]): PropagationResult {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out: Record<string, string> = { ...assignment };
  const derived: PropagationResult["derived"] = {};
  const conflicts: PropagationResult["conflicts"] = [];
  const queue = roots ? [...roots] : Object.keys(out);
  const seen = new Set<string>();

  // "node=option" -> the (node, option) pairs it forbids, both directions of every declared exclusion.
  const pairKey = (node: string, option: string) => `${node}=${option}`;
  const forbids = new Map<string, { node: string; option: string }[]>();
  const link = (from: { node: string; option: string }, to: { node: string; option: string }) => {
    const k = pairKey(from.node, from.option);
    const list = forbids.get(k);
    if (!list) forbids.set(k, [to]);
    else if (!list.some((x) => x.node === to.node && x.option === to.option)) list.push(to);
  };
  for (const n of nodes) {
    if (!n.excludes) continue;
    for (const [opt, edges] of Object.entries(n.excludes)) {
      for (const e of edges) {
        link({ node: n.id, option: opt }, e);
        link(e, { node: n.id, option: opt });
      }
    }
  }

  /**
   * Which settled decision, if any, makes `node = option` impossible right now. Derived from the pair index
   * and the CURRENT assignment rather than from a running tally, so it cannot go stale and cannot depend on
   * the order eliminations were discovered in.
   */
  const deadBy = (node: string, option: string): string | undefined => {
    for (const p of forbids.get(pairKey(node, option)) ?? []) if (out[p.node] === p.option) return pairKey(p.node, p.option);
    return undefined;
  };
  /** one violated pair = one conflict, whichever end of it the walk reached first */
  const reportedPairs = new Set<string>();
  const clash = (holder: { node: string; option: string }, cause: string) => {
    const k = [pairKey(holder.node, holder.option), cause].sort().join(" & ");
    if (reportedPairs.has(k)) return;
    reportedPairs.add(k);
    conflicts.push({ node: holder.node, have: holder.option, want: `!${holder.option}`, because: cause, kind: "excludes" });
  };
  const wiped = new Set<string>();
  /** Unit propagation for one still-unsettled node: count what is left, settle it or report the wipe-out. */
  const settleByElimination = (id: string) => {
    const n = byId.get(id);
    if (!n || out[id] !== undefined) return;
    const alive: string[] = [];
    const because = new Set<string>();
    for (const o of n.options) {
      const dead = deadBy(id, o.id);
      if (dead === undefined) alive.push(o.id);
      else because.add(dead);
    }
    if (alive.length > 1) return;
    const why = [...because].sort().join(","); // sorted: the attribution must not depend on option order
    if (alive.length === 1) {
      out[id] = alive[0]!;
      derived[id] = { option: alive[0]!, because: why };
      queue.push(id);
      return;
    }
    if (wiped.has(id)) return;
    wiped.add(id);
    conflicts.push({ node: id, have: "", want: "!*", because: why, kind: "excludes" });
  };

  while (queue.length) {
    const id = queue.shift()!;
    const key = `${id}=${out[id]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const n = byId.get(id);
    const chosen = out[id];
    if (!n || chosen === undefined) continue;
    for (const e of n.implies[chosen] ?? []) {
      const have = out[e.node];
      if (have === undefined) {
        out[e.node] = e.option;
        derived[e.node] = { option: e.option, because: key };
        queue.push(e.node);
      } else if (have !== e.option) {
        conflicts.push({ node: e.node, have, want: e.option, because: key });
      }
    }
    if (forbids.size === 0) continue;
    for (const p of forbids.get(key) ?? []) {
      const have = out[p.node];
      if (have === p.option) clash(p, key); // both halves of a forbidden pair are settled
      else if (have === undefined) settleByElimination(p.node); // one candidate fewer — does that settle it?
    }
  }
  return { assignment: out, derived, conflicts };
}

// ---------------------------------------------------------------------------
// Topic coherence (advisory)
// ---------------------------------------------------------------------------

/**
 * Option ids that read as "the app does not do this". Kept explicit rather than clever: the check is
 * advisory — it is shown to the owner and handed to the compiler, never used to block anything — so a miss
 * costs nothing and a false alarm costs the owner's attention.
 */
const NEGATION_OPTION_IDS = new Set(["no", "none", "nobody", "never", "nothing", "not_applicable", "fixed", "off", "disabled", "not_needed", "not_tracked"]);
const NEGATION_LABEL = /^(no\b|no[—–-]|none\b|nothing\b|never\b|not\b|nobody\b|it doesn'?t\b)/i;

/** Does this chosen option read as the negation of a capability rather than a flavour of it? */
export function readsAsNegation(optionId: string, label: string): boolean {
  if (NEGATION_OPTION_IDS.has(optionId)) return true;
  if (/^no_/.test(optionId)) return true;
  return NEGATION_LABEL.test(label.trim());
}

export interface TopicConflict {
  topic: string;
  decisions: { id: string; chosen: string; confidence?: number }[];
  why: string;
}

export type CoherenceDecision = {
  id: string;
  topic: string;
  chosen?: string;
  status: string;
  confidence?: number;
  options: { id: string; label: string }[];
};

const SETTLED = new Set(["resolved", "implied", "defaulted", "delegated"]);

/**
 * Settled decisions that share a `topic` and disagree about whether the app has that capability at all.
 *
 * The heuristic, stated plainly — three conditions, all required:
 *   1. the decisions are SETTLED (resolved / implied / defaulted / delegated) and share the topic label the
 *      OWNER sees on the Sheet;
 *   2. one's chosen option reads as an affirmative capability while another's reads as its negation
 *      (`no` / `none` / `never` / `fixed` …, see `readsAsNegation`);
 *   3. BOTH sides offer a negation among their options — i.e. the affirmative decision could have said "no"
 *      on this topic and did not. Without (3) a topic used as a filing bucket produces noise: under "money",
 *      `payments_in_app = none` beside `currencies = single` is not a disagreement, because "one currency"
 *      was never a claim that money moves — `currencies` has no way to say "no money".
 *
 * That is exactly the shape of the live failure — `recurring_scheduled = recurring_records` ("records get
 * created automatically") shipped beside `record_recurring = no` and `record_automation = none`, all three
 * labelled "automation". It is deliberately weak: two affirmative options on one topic (roles = owner_staff
 * beside record_edit_rights = owner_assignee_admin) are NOT flagged, because they can honestly differ.
 * It is also deliberately loose — a bucket topic whose questions really are independent ("scope": bill
 * expenses? bill hours?) can still produce a false alarm. That is the intended trade: this is a lint the
 * owner reads, never a gate. The hard gate stays `ledgerConflicts`, which reasons over declared edges
 * rather than over English.
 */
export function topicIncoherence(decisions: CoherenceDecision[]): TopicConflict[] {
  const byTopic = new Map<string, { d: CoherenceDecision; negative: boolean; label: string; canDeny: boolean }[]>();
  for (const d of decisions) {
    if (!d.chosen || !SETTLED.has(d.status)) continue;
    const label = d.options.find((o) => o.id === d.chosen)?.label ?? d.chosen;
    const list = byTopic.get(d.topic) ?? [];
    list.push({ d, negative: readsAsNegation(d.chosen, label), label, canDeny: d.options.some((o) => readsAsNegation(o.id, o.label)) });
    byTopic.set(d.topic, list);
  }
  const out: TopicConflict[] = [];
  for (const [topic, list] of byTopic) {
    if (list.length < 2) continue;
    const yes = list.filter((x) => !x.negative && x.canDeny);
    const no = list.filter((x) => x.negative);
    if (yes.length === 0 || no.length === 0) continue;
    const say = (x: { d: CoherenceDecision; label: string }) => `${x.d.id} = ${x.d.chosen} ("${x.label}")`;
    const involved = list.filter((x) => yes.includes(x) || no.includes(x));
    out.push({
      topic,
      decisions: involved.map((x) => ({ id: x.d.id, chosen: x.d.chosen!, ...(x.d.confidence !== undefined ? { confidence: x.d.confidence } : {}) })),
      why: `under "${topic}", ${yes.map(say).join(" and ")} say the app does this, while ${no.map(say).join(" and ")} say it does not`,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Question similarity
// ---------------------------------------------------------------------------
// TEMPORARY: a deliberately small normalise + token-overlap helper so the planner can spot a bespoke
// decision that re-asks a catalog question under a different id. It is meant to be replaced by
// `similarity(a, b)` from src/core/textmatch.ts (paraphrase-tolerant) once that lands — `questionSimilarity`
// is the only call site to swap.

const QUESTION_STOPWORDS = new Set(
  ("a an the and or but if of in on at to for from by as with without is are was were be been being do does did done it its this that these those they them their there here you your we our i my he she his her" +
    " what when where who whom whose why how which can could should would will shall may might must need needs than then so such into out up down over under about other others also just only really ever each every" +
    " get gets got make makes made happen happens happened does app system user")
    .split(" ")
    .filter(Boolean),
);

/** crude singular/gerund stemmer — enough to make "happens"/"happen" and "records"/"record" the same token */
function stem(w: string): string {
  let s = w;
  if (s.length > 4 && s.endsWith("ies")) s = `${s.slice(0, -3)}y`;
  else if (s.length > 4 && (s.endsWith("ses") || s.endsWith("xes") || s.endsWith("ches") || s.endsWith("shes"))) s = s.slice(0, -2);
  else if (s.length > 3 && s.endsWith("s") && !s.endsWith("ss")) s = s.slice(0, -1);
  if (s.length > 5 && s.endsWith("ing")) s = s.slice(0, -3);
  return s;
}

export function questionTokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ")) {
    if (!raw || QUESTION_STOPWORDS.has(raw)) continue;
    const s = stem(raw);
    if (s.length > 1 && !QUESTION_STOPWORDS.has(s)) out.add(s);
  }
  return out;
}

/** Dice coefficient over content tokens, 0..1. Two empty strings are 0, not 1. */
export function questionSimilarity(a: string, b: string): number {
  const ta = questionTokens(a);
  const tb = questionTokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return (2 * shared) / (ta.size + tb.size);
}

/**
 * Same topic (or near enough) AND a similar question, or a very similar question on its own — plus a floor
 * on the number of shared content words, because two SHORT strings score high on very little evidence:
 * "Who sends invoices to whom?" and "Who may send an invoice to a client?" overlap on {send, invoice} for a
 * Dice of 0.8 and are nonetheless different questions (billing relationship vs internal permission), and the
 * topics "sending" and "who can send" reduce to the single token {send} for a perfect 1.0.
 */
export const DUPLICATE_QUESTION = { topic: 0.8, questionWithinTopic: 0.45, question: 0.6, minSharedStandalone: 3, minSharedTopic: 2 } as const;

function sharedTokens(a: string, b: string): number {
  const tb = questionTokens(b);
  let n = 0;
  for (const t of questionTokens(a)) if (tb.has(t)) n++;
  return n;
}

export function isDuplicateQuestion(a: { topic: string; question: string }, b: { topic: string; question: string }): boolean {
  const q = questionSimilarity(a.question, b.question);
  if (q >= DUPLICATE_QUESTION.question && sharedTokens(a.question, b.question) >= DUPLICATE_QUESTION.minSharedStandalone) return true;
  const sameTopic =
    a.topic.trim().toLowerCase() === b.topic.trim().toLowerCase() ||
    (questionSimilarity(a.topic, b.topic) >= DUPLICATE_QUESTION.topic && sharedTokens(a.topic, b.topic) >= DUPLICATE_QUESTION.minSharedTopic);
  return sameTopic && q >= DUPLICATE_QUESTION.questionWithinTopic;
}

/** The already-planned node this bespoke decision re-asks, if any. */
export function findDuplicateNode<T extends { id: string; topic: string; question: string }>(
  candidate: { id: string; topic: string; question: string },
  planned: T[],
): T | undefined {
  return planned.find((n) => n.id === candidate.id || isDuplicateQuestion(n, candidate));
}

// ---------------------------------------------------------------------------
// Routing on the drafted nouns
// ---------------------------------------------------------------------------

/**
 * Field names that mark a record as part of a HUMAN workflow rather than a ledger row: a person who owes
 * work on it, or a date the app has to chase. Bare audit metadata ("User", "Date", "Date/time", "created
 * by") deliberately does NOT match — every record has that, and matching it would make the signal useless.
 */
const WORKFLOW_PERSON_FIELD = /\b(assignee|assigned[_ ]?to|assigned|owner|responsible|reviewer|approver|watcher|watchers|follower|followers|subscriber|collaborator|participant|team[_ ]?member)\b/i;
const WORKFLOW_DATE_FIELD = /\b(due|deadline|target[_ ]date|start[_ ]date|end[_ ]date|scheduled|schedule|recurrence|repeats?|expiry|expires|expiration|renewal|reminder|follow[_ -]?up|next[_ ]review)\b/i;
/** Verbs that only appear when records are handed between people. "reviews"/"approves" are excluded on
 *  purpose: they belong to the core `approval_workflow` node, not to per-record assignment. */
const WORKFLOW_VERB = /\b(assign|assigns|assigned|assigning|reassign|delegate|delegates|watch|watches|follow|follows|subscribe|subscribes|mention|mentions|comment|comments|discuss|discusses|remind|reminds|snooze|escalate|escalates|hand[s]?[_ ]off)\b/i;

export interface WorkflowSignal {
  present: boolean;
  /** the drafted evidence that produced the verdict (empty when absent) */
  because: string[];
}

export type DraftShape = {
  one_liner?: string;
  nouns: { name: string; description?: string; fields_hint?: string[] }[];
  actions?: { verb: string; description?: string; example?: string }[];
};

/**
 * Does anything the drafter wrote suggest that records are passed between people on a clock? Looks only at
 * the Sheet's own words: noun field hints, noun descriptions, action verbs, and the one-liner.
 */
export function workflowSignals(draft: DraftShape): WorkflowSignal {
  const because: string[] = [];
  for (const n of draft.nouns) {
    for (const f of n.fields_hint ?? []) {
      if (WORKFLOW_PERSON_FIELD.test(f)) because.push(`${n.name}.${f} names a person who owns the record`);
      else if (WORKFLOW_DATE_FIELD.test(f)) because.push(`${n.name}.${f} is a date the app has to chase`);
    }
    if (n.description && WORKFLOW_PERSON_FIELD.test(n.description)) because.push(`${n.name} is described in terms of who it belongs to`);
  }
  for (const a of draft.actions ?? []) {
    const text = [a.verb, a.description ?? "", a.example ?? ""].join(" ");
    if (WORKFLOW_VERB.test(text)) because.push(`an action reads "${a.verb}"`);
  }
  if (draft.one_liner && (WORKFLOW_VERB.test(draft.one_liner) || WORKFLOW_PERSON_FIELD.test(draft.one_liner) || WORKFLOW_DATE_FIELD.test(draft.one_liner))) {
    because.push("the one-liner names a workflow");
  }
  return { present: because.length > 0, because: because.slice(0, 6) };
}

/** Nodes tagged with this are about per-record human workflow — see CatalogNodeSchema.tags. */
export const RECORD_WORKFLOW_TAG = "record_workflow";

/**
 * Deterministic routing on the drafted nouns, the belt to the planner's `not_applicable` braces (which a
 * live session simply failed to use: a financial ledger was asked about assignee due dates and saved
 * personal views, picked the richest option for both, and the compiler then implemented neither).
 *
 * THE RULE, stated so it can be argued with: drop a node only when ALL THREE hold —
 *   1. the catalog tags it `record_workflow` (assignment, watchers, comments, saved views, templates, bulk
 *      edit) — the questions that presuppose a person and a deadline on each record;
 *   2. it comes from a SECONDARY archetype, never the app's primary identity — a crud-saas app keeps every
 *      crud-saas question, however sparse its draft; only the generic tag bolted onto a different kind of
 *      app is at risk;
 *   3. nothing the drafter wrote shows such a workflow (`workflowSignals`) — no person-valued or
 *      forward-looking date field on any noun, no assignment verb on any action, nothing in the one-liner.
 * Anything else — including every core node — is left for the LLM planner to judge.
 */
export function routeByWorkflowSignal(
  nodes: NodeDef[],
  draft: DraftShape & { archetypes?: string[] },
): { nodes: NodeDef[]; dropped: { id: string; why: string }[]; signal: WorkflowSignal } {
  const signal = workflowSignals(draft);
  const primary = draft.archetypes?.[0];
  if (signal.present) return { nodes, dropped: [], signal };
  const dropped: { id: string; why: string }[] = [];
  const kept = nodes.filter((n) => {
    const workflow = (n.tags ?? []).includes(RECORD_WORKFLOW_TAG);
    if (!workflow || n.archetype === "core" || n.archetype === primary) return true;
    dropped.push({ id: n.id, why: `per-record workflow question from the secondary archetype "${n.archetype}", but no drafted noun has an assignee or a deadline` });
    return false;
  });
  return { nodes: kept, dropped, signal };
}
