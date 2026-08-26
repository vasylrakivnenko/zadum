import { describe, it, expect } from "vitest";
import { loadCatalogs, KNOWN_ARCHETYPES } from "./catalogs.js";
import { mergeCatalogs, type Catalog } from "../core/catalog.js";

const SECTIONS = new Set([
  "overview", "actors_permissions", "data_model", "state_machines", "rules_invariants",
  "acceptance_scenarios", "journeys", "non_goals_defaults", "glossary",
  // legacy names still used by core/b2b-invoicing
  "rules",
]);

describe("decision catalogs", () => {
  it("loads and merges cleanly for every archetype with a dedicated catalog", async () => {
    const { catalogs, archetypes } = await loadCatalogs();
    expect(archetypes.length).toBeGreaterThan(0);
    for (const a of KNOWN_ARCHETYPES) {
      if (!archetypes.includes(a)) continue;
      const { nodes, errors } = mergeCatalogs(catalogs, [a]);
      expect(errors, `merge errors for ${a}`).toEqual([]);
      expect(nodes.length).toBeGreaterThan(catalogs.find((c) => c.archetype === "core")!.nodes.length);
    }
    // merging all archetypes at once must also be clean (ids are global)
    expect(mergeCatalogs(catalogs, [...archetypes]).errors).toEqual([]);
  });

  it("has the expected dedicated catalogs", async () => {
    const { archetypes } = await loadCatalogs();
    for (const a of ["b2b-invoicing", "booking", "marketplace", "e-commerce", "crud-saas"]) expect(archetypes).toContain(a);
  });

  it("node ids are globally unique, snake_case, and every node has >= 2 options", async () => {
    const { catalogs } = await loadCatalogs();
    const seen = new Map<string, string>();
    for (const c of catalogs) {
      expect(c.archetype === "core" || c.id === c.archetype, `${c.id}: id must equal archetype`).toBe(true);
      for (const n of c.nodes) {
        expect(n.id).toMatch(/^[a-z][a-z0-9_]*$/);
        expect(seen.has(n.id), `duplicate node id ${n.id} in ${c.id} and ${seen.get(n.id)}`).toBe(false);
        seen.set(n.id, c.id);
        expect(n.options.length, `${n.id} options`).toBeGreaterThanOrEqual(2);
        expect(n.options.length, `${n.id} too many options`).toBeLessThanOrEqual(5);
        const oids = new Set<string>();
        for (const o of n.options) {
          expect(o.id).toMatch(/^[a-z][a-z0-9_]*$/);
          expect(oids.has(o.id), `${n.id}: duplicate option ${o.id}`).toBe(false);
          oids.add(o.id);
        }
        expect(n.consequence).toBeGreaterThanOrEqual(0);
        expect(n.consequence).toBeLessThanOrEqual(5);
        expect(n.sections.length, `${n.id} sections`).toBeGreaterThan(0);
        for (const s of n.sections) expect(SECTIONS.has(s), `${n.id}: unknown section ${s}`).toBe(true);
      }
    }
  });

  it("priors reference valid options and sum to ~1", async () => {
    const { catalogs } = await loadCatalogs();
    for (const c of catalogs) {
      for (const n of c.nodes) {
        if (!n.prior) continue;
        const oids = new Set(n.options.map((o) => o.id));
        let sum = 0;
        for (const [k, v] of Object.entries(n.prior)) {
          expect(oids.has(k), `${c.id}/${n.id}: prior for unknown option ${k}`).toBe(true);
          expect(v).toBeGreaterThanOrEqual(0);
          sum += v;
        }
        expect(Math.abs(sum - 1), `${c.id}/${n.id}: prior sums to ${sum}`).toBeLessThanOrEqual(0.02);
      }
    }
  });

  it("implies targets resolve to existing nodes/options (core or same catalog)", async () => {
    const { catalogs } = await loadCatalogs();
    const core = catalogs.find((c) => c.archetype === "core")!;
    const index = (cs: Catalog[]) => {
      const m = new Map<string, Set<string>>();
      for (const c of cs) for (const n of c.nodes) m.set(n.id, new Set(n.options.map((o) => o.id)));
      return m;
    };
    for (const c of catalogs) {
      const visible = index(c.archetype === "core" ? [core] : [core, c]);
      for (const n of c.nodes) {
        for (const o of n.options) {
          for (const e of o.implies) {
            const target = visible.get(e.node);
            expect(target, `${c.id}/${n.id}.${o.id} implies unknown node ${e.node}`).toBeDefined();
            expect(target!.has(e.option), `${c.id}/${n.id}.${o.id} implies unknown option ${e.node}.${e.option}`).toBe(true);
            expect(e.node, `${n.id}.${o.id} implies itself`).not.toBe(n.id);
          }
        }
      }
    }
  });

  it("same_as targets resolve, and every declared equivalence actually collapses", async () => {
    const { catalogs, archetypes } = await loadCatalogs();
    const core = catalogs.find((c) => c.archetype === "core")!;
    const declared: { from: string; same: NonNullable<Catalog["nodes"][number]["same_as"]> }[] = [];
    for (const c of catalogs) {
      // a same_as target must be visible wherever the declaring node is (core, or the same catalog) —
      // otherwise the equivalence would be silently inert for some archetype combinations
      const visible = new Map<string, Set<string>>();
      for (const n of [...core.nodes, ...c.nodes]) visible.set(n.id, new Set(n.options.map((o) => o.id)));
      for (const n of c.nodes) {
        if (!n.same_as) continue;
        declared.push({ from: n.id, same: n.same_as });
        const target = visible.get(n.same_as.node);
        expect(target, `${c.id}/${n.id}.same_as targets ${n.same_as.node}, which is neither core nor in ${c.id}`).toBeDefined();
        expect(n.same_as.node, `${n.id}.same_as points at itself`).not.toBe(n.id);
        const loser = n.same_as.prefer === "this" ? n.same_as.node : n.id;
        const winner = n.same_as.prefer === "this" ? n.id : n.same_as.node;
        for (const [from, to] of Object.entries(n.same_as.map)) {
          expect(visible.get(loser)!.has(from), `${n.id}.same_as maps unknown ${loser}.${from}`).toBe(true);
          expect(visible.get(winner)!.has(to), `${n.id}.same_as maps to unknown ${winner}.${to}`).toBe(true);
        }
      }
    }
    expect(declared.length, "the catalogs should declare at least the known duplicate").toBeGreaterThan(0);
    // and the merge really removes the loser (Rule 3: a question the owner already answered is never re-asked)
    const merged = mergeCatalogs(catalogs, [...archetypes]);
    expect(merged.errors).toEqual([]);
    expect(merged.same_as.map((m) => `${m.loser}->${m.winner}`)).toContain("record_recurring->recurring_scheduled");
    expect(merged.nodes.map((n) => n.id)).not.toContain("record_recurring");
    const ids = new Set(merged.nodes.map((n) => n.id));
    for (const n of merged.nodes) for (const edges of Object.values(n.implies)) for (const e of edges) expect(ids.has(e.node), `${n.id} implies dropped node ${e.node}`).toBe(true);
  });

  it("record_workflow tags only mark generic per-record workflow nodes", async () => {
    const { catalogs } = await loadCatalogs();
    const tagged = catalogs.flatMap((c) => c.nodes.filter((n) => n.tags.includes("record_workflow")).map((n) => `${c.archetype}/${n.id}`));
    // routeByWorkflowSignal only ever drops these, and only from a SECONDARY archetype — so the tag must
    // stay on questions that genuinely presuppose a person and a deadline on each record.
    expect(tagged.sort()).toEqual(
      ["crud-saas/record_activity_feed", "crud-saas/record_assignment", "crud-saas/record_bulk_edit", "crud-saas/record_templates", "crud-saas/record_views", "crud-saas/record_watchers"].sort(),
    );
  });

  it("archetype catalogs do not redefine core nodes and have the expected size", async () => {
    const { catalogs } = await loadCatalogs();
    const core = new Set(catalogs.find((c) => c.archetype === "core")!.nodes.map((n) => n.id));
    const expected: Record<string, [number, number]> = {
      "b2b-invoicing": [15, 30] /* +6 hierarchical child nodes, 2026-08-24 */, booking: [18, 22], marketplace: [18, 22], "e-commerce": [16, 20], "crud-saas": [12, 16],
    };
    for (const c of catalogs) {
      if (c.archetype === "core") continue;
      for (const n of c.nodes) expect(core.has(n.id), `${c.id} redefines core node ${n.id}`).toBe(false);
      const range = expected[c.archetype];
      if (range) {
        expect(c.nodes.length, `${c.id} node count`).toBeGreaterThanOrEqual(range[0]);
        expect(c.nodes.length, `${c.id} node count`).toBeLessThanOrEqual(range[1]);
      }
    }
  });
});
