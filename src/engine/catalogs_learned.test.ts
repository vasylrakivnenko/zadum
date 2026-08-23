/**
 * Regression coverage for the 2026-08-23 catalog-mining update (see catalogs/README.md
 * "Learned from corpus"): blended priors on existing nodes + a handful of brand-new nodes
 * promoted from corpus/mining/2026-08-23-new-concepts.json.
 */
import { describe, it, expect } from "vitest";
import { loadCatalogs, KNOWN_ARCHETYPES } from "./catalogs.js";
import { mergeCatalogs } from "../core/catalog.js";

// Node counts as found in catalogs/*.json BEFORE the 2026-08-23 mining update (confirmed by
// counting `nodes` in each file prior to editing). core.json was not touched by that update.
const ORIGINAL_NODE_COUNTS: Record<string, number> = {
  core: 27,
  "b2b-invoicing": 19,
  booking: 22,
  marketplace: 22,
  "e-commerce": 19,
  "crud-saas": 16,
};

// Nodes actually added by the 2026-08-23 mining update (see catalogs/README.md).
const NEW_NODE_IDS = ["invoice_po_reference", "invoice_discounts", "payment_terms", "shop_category_structure"];

describe("catalogs learned from corpus mining (2026-08-23)", () => {
  it("merges cleanly for every known archetype with a dedicated catalog", async () => {
    const { catalogs, archetypes } = await loadCatalogs();
    for (const a of KNOWN_ARCHETYPES) {
      if (!archetypes.includes(a)) continue;
      const { errors } = mergeCatalogs(catalogs, [a]);
      expect(errors, `merge errors for ${a}`).toEqual([]);
    }
    expect(mergeCatalogs(catalogs, [...archetypes]).errors).toEqual([]);
  });

  it("every prior sums to ~1 and references real option ids", async () => {
    const { catalogs } = await loadCatalogs();
    for (const c of catalogs) {
      for (const n of c.nodes) {
        if (!n.prior) continue;
        const oids = new Set(n.options.map((o) => o.id));
        let sum = 0;
        for (const [k, v] of Object.entries(n.prior)) {
          expect(oids.has(k), `${c.id}/${n.id}: prior references unknown option ${k}`).toBe(true);
          sum += v;
        }
        expect(Math.abs(sum - 1), `${c.id}/${n.id}: prior sums to ${sum}`).toBeLessThanOrEqual(0.02);
      }
    }
  });

  it("node ids are globally unique across all catalogs", async () => {
    const { catalogs } = await loadCatalogs();
    const seen = new Map<string, string>();
    for (const c of catalogs) {
      for (const n of c.nodes) {
        expect(seen.has(n.id), `duplicate node id ${n.id} in ${c.id} and ${seen.get(n.id)}`).toBe(false);
        seen.set(n.id, c.id);
      }
    }
  });

  it("added at least 3 new nodes total relative to the pre-mining baseline", async () => {
    const { catalogs } = await loadCatalogs();
    let originalTotal = 0;
    let currentTotal = 0;
    for (const c of catalogs) {
      const baseline = ORIGINAL_NODE_COUNTS[c.archetype];
      if (baseline === undefined) continue; // catalogs without a recorded baseline (none expected today)
      originalTotal += baseline;
      currentTotal += c.nodes.length;
    }
    expect(currentTotal - originalTotal).toBeGreaterThanOrEqual(3);

    // the specific new nodes exist exactly once, globally
    const allIds = new Set(catalogs.flatMap((c) => c.nodes.map((n) => n.id)));
    for (const id of NEW_NODE_IDS) expect(allIds.has(id), `expected new node ${id} to exist`).toBe(true);
  });

  it("no newly-added node has a prior option above 0.9 (single-document evidence is capped)", async () => {
    const { catalogs } = await loadCatalogs();
    const byId = new Map(catalogs.flatMap((c) => c.nodes.map((n) => [n.id, n] as const)));
    for (const id of NEW_NODE_IDS) {
      const n = byId.get(id);
      expect(n, `new node ${id} should exist`).toBeDefined();
      if (!n?.prior) continue;
      for (const [opt, v] of Object.entries(n.prior)) {
        expect(v, `${id}.${opt} prior should be capped at 0.9`).toBeLessThanOrEqual(0.9);
      }
    }
  });
});
