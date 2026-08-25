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
  /** how to phrase the consequence of this option to a non-technical user */
  hint: z.string().optional(),
});
export type CatalogOption = z.infer<typeof CatalogOptionSchema>;

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
  tags: z.array(z.string()).default([]),
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
  sections: string[];
  bespoke: boolean;
  /** catalog the node came from: "core", an archetype id, or "bespoke" */
  archetype: string;
  /** hierarchical gate — see CatalogNodeSchema.requires; absent/empty = never gated */
  requires?: { node: string; options: string[] }[];
  ask_hint?: string;
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
  for (const o of n.options) implies[o.id] = o.implies ?? [];
  return {
    id: n.id,
    topic: n.topic,
    question: n.question,
    options: n.options.map((o) => ({ id: o.id, label: o.label, ...(o.hint ? { hint: o.hint } : {}) })),
    consequence: n.consequence,
    prior: normalizePrior(n.options, n.prior),
    implies,
    sections: n.sections,
    bespoke: false,
    archetype,
    requires: n.requires ?? [],
    ...(n.ask_hint ? { ask_hint: n.ask_hint } : {}),
  };
}

/** A bespoke decision (proposed by the planner for this app) as a NodeDef — no hard edges. */
export function nodeDefFromDecision(d: Decision, prior?: Record<string, number>): NodeDef {
  const implies: NodeDef["implies"] = {};
  for (const o of d.options) implies[o.id] = [];
  return {
    id: d.id,
    topic: d.topic,
    question: d.question,
    options: d.options.map((o) => ({ id: o.id, label: o.label })),
    consequence: d.consequence,
    prior: normalizePrior(d.options, prior),
    implies,
    sections: [],
    bespoke: true,
    archetype: "bespoke",
    requires: [],
  };
}

/** Validate a single catalog: unique node/option ids. Cross-node edge targets are validated on merge. */
export function validateCatalog(c: Catalog): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const n of c.nodes) {
    if (ids.has(n.id)) errors.push(`duplicate node id ${n.id}`);
    ids.add(n.id);
    const oids = new Set<string>();
    for (const o of n.options) {
      if (oids.has(o.id)) errors.push(`duplicate option id ${n.id}.${o.id}`);
      oids.add(o.id);
    }
    if (n.prior) for (const k of Object.keys(n.prior)) if (!oids.has(k)) errors.push(`prior references unknown option ${n.id}.${k}`);
  }
  return errors;
}

/** Merge core + archetype catalogs into the node set for a session. Later catalogs override earlier ones by node id. */
export function mergeCatalogs(catalogs: Catalog[], archetypes: string[]): { nodes: NodeDef[]; errors: string[] } {
  const errors: string[] = [];
  const byId = new Map<string, NodeDef>();
  const wanted = new Set(archetypes);
  const ordered = [...catalogs.filter((c) => c.archetype === "core"), ...catalogs.filter((c) => c.archetype !== "core" && wanted.has(c.archetype))];
  for (const c of ordered) {
    errors.push(...validateCatalog(c).map((e) => `${c.id}: ${e}`));
    for (const n of c.nodes) {
      if (n.applies_to.length > 0 && !n.applies_to.some((a) => wanted.has(a))) continue;
      byId.set(n.id, toNodeDef(n, c.archetype));
    }
  }
  // validate edges
  for (const n of byId.values()) {
    for (const [opt, edges] of Object.entries(n.implies)) {
      for (const e of edges) {
        const t = byId.get(e.node);
        if (!t) errors.push(`${n.id}.${opt} implies unknown node ${e.node}`);
        else if (!t.options.some((o) => o.id === e.option)) errors.push(`${n.id}.${opt} implies unknown option ${e.node}.${e.option}`);
      }
    }
    for (const r of n.requires ?? []) {
      const t = byId.get(r.node);
      if (!t) errors.push(`${n.id} requires unknown node ${r.node}`);
      else for (const o of r.options) if (!t.options.some((x) => x.id === o)) errors.push(`${n.id} requires unknown option ${r.node}.${o}`);
      if (t?.requires?.some((rr) => rr.node === n.id)) errors.push(`${n.id} and ${r.node} require each other`);
    }
  }
  return { nodes: [...byId.values()], errors };
}

export interface PropagationResult {
  assignment: Record<string, string>;
  /** nodes set by propagation: node -> {option, because: "node=option"} */
  derived: Record<string, { option: string; because: string }>;
  /** hard contradictions: node already set to a different option than an edge demands */
  conflicts: { node: string; have: string; want: string; because: string }[];
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

/** Deterministic fixpoint over hard edges. Existing assignments are never overwritten (conflicts are reported). */
export function propagateHard(assignment: Record<string, string>, nodes: NodeDef[], roots?: string[]): PropagationResult {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out: Record<string, string> = { ...assignment };
  const derived: PropagationResult["derived"] = {};
  const conflicts: PropagationResult["conflicts"] = [];
  const queue = roots ? [...roots] : Object.keys(out);
  const seen = new Set<string>();
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
  }
  return { assignment: out, derived, conflicts };
}
