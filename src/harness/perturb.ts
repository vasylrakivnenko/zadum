/**
 * Counterfactual gold variants — the defence against memorization and against n=1.
 *
 * A public spec can be recalled from a model's training data; a *perturbed* version of it cannot. Flipping a
 * few high-consequence decisions gives us many distinct hidden truths per gold file, and it tests exactly what
 * cards are for: recovering where this app deviates from its archetype's priors.
 *
 * Everything here is deterministic (seeded), so a sweep is reproducible.
 */
import type { NodeDef } from "../core/catalog.js";
import type { Gold } from "./run.js";

/** Tiny deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface PerturbOptions {
  /** how many decisions to flip */
  flips: number;
  seed: number;
  /** flip only among the top fraction by consequence (default 0.6) — perturbing trivia proves nothing */
  topFraction?: number;
  /** override the persona (real simulated users behave differently; the mock ignores it) */
  persona?: string;
  /** override the one-liner (vagueness variants live in the gold file as `one_liner_variants`) */
  one_liner?: string;
  idSuffix?: string;
}

export interface PerturbResult {
  gold: Gold;
  flipped: { node: string; from: string; to: string }[];
  /** dependent decisions changed to keep the truth internally consistent with the catalog's hard edges */
  repaired: { node: string; from: string; to: string; because: string }[];
  conflicts: string[];
}

/**
 * Flip `flips` high-consequence decisions and repair the rest so the hidden truth stays logically consistent
 * with the catalog's hard implications (a truth that contradicts itself would score the engine unfairly).
 */
export function perturbGold(gold: Gold, nodes: NodeDef[], opts: PerturbOptions): PerturbResult {
  const index = new Map(nodes.map((n) => [n.id, n]));
  const candidates = Object.keys(gold.decisions)
    .map((id) => index.get(id))
    .filter((n): n is NodeDef => !!n && n.options.length > 1)
    .sort((a, b) => b.consequence - a.consequence || a.id.localeCompare(b.id));
  const pool = candidates.slice(0, Math.max(opts.flips, Math.ceil(candidates.length * (opts.topFraction ?? 0.6))));

  const r = rng(opts.seed);
  const picked: NodeDef[] = [];
  const remaining = [...pool];
  while (picked.length < Math.min(opts.flips, remaining.length ? pool.length : 0) && remaining.length) {
    picked.push(remaining.splice(Math.floor(r() * remaining.length), 1)[0]!);
  }

  const assignment: Record<string, string> = { ...gold.decisions };
  const flipped: PerturbResult["flipped"] = [];
  for (const n of picked) {
    const from = assignment[n.id]!;
    const alternatives = n.options.filter((o) => o.id !== from);
    if (!alternatives.length) continue;
    const to = alternatives[Math.floor(r() * alternatives.length)]!.id;
    assignment[n.id] = to;
    flipped.push({ node: n.id, from, to });
  }

  const forced = new Set(flipped.map((f) => f.node));
  const { repaired, conflicts } = repairAssignment(assignment, index, forced, gold.decisions);

  const corrections = [...flipped, ...repaired.map((x) => ({ node: x.node, to: x.to }))]
    .map((f) => `- ${f.node} = ${f.to}`)
    .join("\n");
  const suffix = opts.idSuffix ?? `p${opts.seed}f${opts.flips}`;
  return {
    gold: {
      ...gold,
      id: `${gold.id}#${suffix}`,
      ...(opts.one_liner ? { one_liner: opts.one_liner } : {}),
      ...(opts.persona ? { persona: opts.persona } : {}),
      decisions: assignment,
      truth: `${gold.truth}\n\nCORRECTIONS — these override anything stated above:\n${corrections}`,
    },
    flipped,
    repaired,
    conflicts,
  };
}

/**
 * Make the flipped assignment consistent with hard implications. Forced (flipped) nodes never move; a node
 * whose chosen option implies something a forced node contradicts is moved to an option that doesn't.
 */
function repairAssignment(
  assignment: Record<string, string>,
  index: Map<string, NodeDef>,
  forced: Set<string>,
  original: Record<string, string>,
): { repaired: PerturbResult["repaired"]; conflicts: string[] } {
  const repaired = new Map<string, PerturbResult["repaired"][number]>();
  const conflicts: string[] = [];
  for (let pass = 0; pass < 6; pass++) {
    let changed = false;
    for (const [nodeId, chosen] of Object.entries(assignment)) {
      const node = index.get(nodeId);
      if (!node) continue;
      for (const edge of node.implies[chosen] ?? []) {
        const have = assignment[edge.node];
        if (have === undefined || have === edge.option) continue;
        if (forced.has(edge.node)) {
          // the dependent is pinned → move this node to a compatible option instead
          const alt = node.options.find((o) => o.id !== chosen && !(node.implies[o.id] ?? []).some((e) => e.node === edge.node && e.option !== assignment[edge.node]));
          if (alt && !forced.has(nodeId)) {
            assignment[nodeId] = alt.id;
            repaired.set(nodeId, { node: nodeId, from: original[nodeId] ?? chosen, to: alt.id, because: `${edge.node}=${assignment[edge.node]}` });
            changed = true;
          } else conflicts.push(`${nodeId}=${chosen} implies ${edge.node}=${edge.option} but ${edge.node} is pinned to ${have}`);
        } else {
          assignment[edge.node] = edge.option;
          repaired.set(edge.node, { node: edge.node, from: have, to: edge.option, because: `${nodeId}=${chosen}` });
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return { repaired: [...repaired.values()], conflicts: [...new Set(conflicts)] };
}

/**
 * A family of sessions from one gold: the original plus `count` perturbed variants, cycling through the
 * gold's persona and one-liner variants so drafting quality is exercised too.
 */
export function makeVariants(gold: Gold, nodes: NodeDef[], opts: { count: number; flips?: number; seed?: number }): { gold: Gold; info: Omit<PerturbResult, "gold"> | null }[] {
  const out: { gold: Gold; info: Omit<PerturbResult, "gold"> | null }[] = [{ gold, info: null }];
  const personas = gold.persona_variants?.length ? gold.persona_variants : [gold.persona];
  const oneLiners = gold.one_liner_variants?.length ? gold.one_liner_variants : [gold.one_liner];
  for (let i = 0; i < opts.count; i++) {
    const res = perturbGold(gold, nodes, {
      flips: opts.flips ?? 3,
      seed: (opts.seed ?? 1) * 1000 + i,
      persona: personas[i % personas.length]!,
      one_liner: oneLiners[i % oneLiners.length]!,
      idSuffix: `v${i + 1}`,
    });
    out.push({ gold: res.gold, info: { flipped: res.flipped, repaired: res.repaired, conflicts: res.conflicts } });
  }
  return out;
}
