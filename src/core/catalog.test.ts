import { describe, it, expect } from "vitest";
import {
  CatalogSchema,
  findDuplicateNode,
  isDuplicateQuestion,
  mergeCatalogs,
  propagateHard,
  questionSimilarity,
  readsAsNegation,
  routeByWorkflowSignal,
  topicIncoherence,
  validateCatalog,
  workflowSignals,
  type Catalog,
  type CatalogNode,
  type NodeDef,
} from "./catalog.js";
import { resolveAssignment } from "./worlds.js";

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

type NodeInput = Omit<Partial<CatalogNode>, "options"> &
  Pick<CatalogNode, "id"> & { options: { id: string; label?: string; implies?: { node: string; option: string }[]; excludes?: { node: string; option: string }[] }[] };

function cat(id: string, archetype: string, nodes: NodeInput[]): Catalog {
  return CatalogSchema.parse({
    id,
    version: "test",
    archetype,
    nodes: nodes.map((n) => ({
      topic: n.topic ?? id,
      question: n.question ?? `${n.id}?`,
      ...n,
      options: n.options.map((o) => ({ ...o, label: o.label ?? o.id })),
    })),
  });
}

/** the real shape of the live defect: a broad core node and a narrow archetype node asking the same thing */
const core = () =>
  cat("core", "core", [
    { id: "recurring_scheduled", topic: "automation", question: "Must anything happen automatically on a schedule?", options: [{ id: "none" }, { id: "reminders_only" }, { id: "recurring_records" }] },
    { id: "audit_trail", topic: "history", options: [{ id: "none" }, { id: "full" }] },
  ]);

const crud = (same: CatalogNode["same_as"]) =>
  cat("crud-saas", "crud-saas", [
    {
      id: "record_recurring",
      topic: "automation",
      question: "Do some records repeat on a schedule?",
      options: [{ id: "no" }, { id: "recurring_records" }],
      same_as: same,
    },
  ]);

const EQUIV = { node: "recurring_scheduled", prefer: "other", map: { no: "none", recurring_records: "recurring_records" } } as const;

// ---------------------------------------------------------------------------

describe("same_as equivalence", () => {
  it("removes the losing node from the merged set so it can never be planned", () => {
    const m = mergeCatalogs([core(), crud(EQUIV)], ["crud-saas"]);
    expect(m.errors).toEqual([]);
    expect(m.nodes.map((n) => n.id)).toEqual(["recurring_scheduled", "audit_trail"]);
    expect(m.same_as).toEqual([{ loser: "record_recurring", winner: "recurring_scheduled", map: { no: "none", recurring_records: "recurring_records" } }]);
  });

  it("is inert when the partner catalog is not loaded", () => {
    const m = mergeCatalogs([core(), crud(EQUIV)], []);
    expect(m.errors).toEqual([]);
    expect(m.same_as).toEqual([]);
    expect(m.nodes.map((n) => n.id)).toContain("recurring_scheduled");
    expect(m.nodes.map((n) => n.id)).not.toContain("record_recurring"); // filtered by archetype, not by same_as
  });

  it("keeps the declaring node when prefer is 'this'", () => {
    const m = mergeCatalogs([core(), crud({ node: "recurring_scheduled", prefer: "this", map: { none: "no", reminders_only: "no", recurring_records: "recurring_records" } })], ["crud-saas"]);
    expect(m.errors).toEqual([]);
    expect(m.nodes.map((n) => n.id)).toEqual(["audit_trail", "record_recurring"]);
  });

  it("carries the loser's implications onto the winner, rewritten through the map", () => {
    const c = crud(EQUIV);
    c.nodes[0]!.options[1]!.implies = [{ node: "audit_trail", option: "full" }];
    const m = mergeCatalogs([core(), c], ["crud-saas"]);
    expect(m.errors).toEqual([]);
    const w = m.nodes.find((n) => n.id === "recurring_scheduled")!;
    expect(w.implies.recurring_records).toEqual([{ node: "audit_trail", option: "full" }]);
    expect(w.implies.none).toEqual([]);
  });

  it("drops the loser's implication INTO the winner as a tautology (the one-way edge that hid the bug)", () => {
    const c = crud(EQUIV);
    c.nodes[0]!.options[1]!.implies = [{ node: "recurring_scheduled", option: "recurring_records" }];
    const m = mergeCatalogs([core(), c], ["crud-saas"]);
    expect(m.errors).toEqual([]);
    expect(m.nodes.find((n) => n.id === "recurring_scheduled")!.implies.recurring_records).toEqual([]);
  });

  it("reports an implication into the winner that the map contradicts", () => {
    const c = crud(EQUIV);
    c.nodes[0]!.options[0]!.implies = [{ node: "recurring_scheduled", option: "recurring_records" }]; // no -> none, not recurring_records
    const m = mergeCatalogs([core(), c], ["crud-saas"]);
    expect(m.errors.join(" ")).toMatch(/record_recurring.no implies recurring_scheduled=recurring_records, but the map sends it to none/);
  });

  it("retargets edges elsewhere that pointed at the loser", () => {
    const c = crud(EQUIV);
    c.nodes.push(
      ...cat("x", "crud-saas", [{ id: "other_node", options: [{ id: "a", implies: [{ node: "record_recurring", option: "no" }] }, { id: "b" }] }]).nodes,
    );
    const m = mergeCatalogs([core(), c], ["crud-saas"]);
    expect(m.errors).toEqual([]);
    expect(m.nodes.find((n) => n.id === "other_node")!.implies.a).toEqual([{ node: "recurring_scheduled", option: "none" }]);
  });

  it("carries the loser's gate onto the winner", () => {
    const c = crud(EQUIV);
    c.nodes[0]!.requires = [{ node: "audit_trail", options: ["full"] }];
    const m = mergeCatalogs([core(), c], ["crud-saas"]);
    expect(m.errors).toEqual([]);
    expect(m.nodes.find((n) => n.id === "recurring_scheduled")!.requires).toEqual([{ node: "audit_trail", options: ["full"] }]);
  });

  it("resolves a chain to its terminal winner, composing the maps", () => {
    const a = cat("core", "core", [{ id: "a", options: [{ id: "a1" }, { id: "a2" }] }]);
    const b = cat("mid", "mid", [
      { id: "b", options: [{ id: "b1" }, { id: "b2" }], same_as: { node: "a", prefer: "other", map: { b1: "a1", b2: "a2" } } },
      { id: "c", options: [{ id: "c1" }, { id: "c2" }], same_as: { node: "b", prefer: "other", map: { c1: "b2", c2: "b1" } } },
      { id: "d", options: [{ id: "d1", implies: [{ node: "c", option: "c1" }] }, { id: "d2" }] },
    ]);
    const m = mergeCatalogs([a, b], ["mid"]);
    expect(m.errors).toEqual([]);
    expect(m.nodes.map((n) => n.id).sort()).toEqual(["a", "d"]);
    // c1 -> b2 -> a2
    expect(m.nodes.find((n) => n.id === "d")!.implies.d1).toEqual([{ node: "a", option: "a2" }]);
    expect(m.same_as.find((x) => x.loser === "c")).toEqual({ loser: "c", winner: "a", map: { c1: "a2", c2: "a1" } });
  });

  it("errors on a mutual declaration", () => {
    const c = cat("core", "core", [
      { id: "a", options: [{ id: "x" }, { id: "y" }], same_as: { node: "b", prefer: "other", map: { x: "x", y: "y" } } },
      { id: "b", options: [{ id: "x" }, { id: "y" }], same_as: { node: "a", prefer: "other", map: { x: "x", y: "y" } } },
    ]);
    expect(validateCatalog(c).join(" ")).toMatch(/same_as cycle/);
    expect(mergeCatalogs([c], []).errors.join(" ")).toMatch(/same_as cycle/);
  });

  it("errors on a longer cycle", () => {
    const c = cat("core", "core", [
      { id: "a", options: [{ id: "x" }, { id: "y" }], same_as: { node: "b", prefer: "other", map: {} } },
      { id: "b", options: [{ id: "x" }, { id: "y" }], same_as: { node: "c", prefer: "other", map: {} } },
      { id: "c", options: [{ id: "x" }, { id: "y" }], same_as: { node: "a", prefer: "other", map: {} } },
    ]);
    expect(validateCatalog(c).join(" ")).toMatch(/same_as cycle: a -> b -> c -> a/);
  });

  it("errors on a dangling reference", () => {
    const m = mergeCatalogs([core(), crud({ node: "nope_not_here", prefer: "other", map: {} })], ["crud-saas"]);
    expect(m.errors.join(" ")).toMatch(/record_recurring.same_as references unknown node nope_not_here/);
    expect(m.nodes.map((n) => n.id)).toContain("record_recurring"); // and nothing is silently dropped
  });

  it("errors on a self reference", () => {
    expect(validateCatalog(crud({ node: "record_recurring", prefer: "other", map: {} })).join(" ")).toMatch(/points at itself/);
  });

  it("errors on a map that names an option neither side has", () => {
    const bad = mergeCatalogs([core(), crud({ node: "recurring_scheduled", prefer: "other", map: { nope: "none", recurring_records: "wrong" } })], ["crud-saas"]).errors.join(" ");
    expect(bad).toMatch(/maps unknown option record_recurring.nope/);
    expect(bad).toMatch(/to unknown option recurring_scheduled.wrong/);
  });

  it("errors when a losing option has nowhere to go", () => {
    // `no` has no entry and there is no recurring_scheduled.no either
    expect(mergeCatalogs([core(), crud({ node: "recurring_scheduled", prefer: "other", map: { recurring_records: "recurring_records" } })], ["crud-saas"]).errors.join(" ")).toMatch(
      /leaves record_recurring.no unmapped/,
    );
  });

  it("errors when two declarations merge the same node away", () => {
    const c = cat("core", "core", [
      { id: "a", options: [{ id: "x" }, { id: "y" }] },
      { id: "b", options: [{ id: "x" }, { id: "y" }], same_as: { node: "a", prefer: "this", map: {} } },
      { id: "c", options: [{ id: "x" }, { id: "y" }], same_as: { node: "a", prefer: "this", map: {} } },
    ]);
    expect(validateCatalog(c).join(" ")).toMatch(/a is declared same_as by both b and c/);
  });
});

// ---------------------------------------------------------------------------

describe("hard mutual exclusion", () => {
  const nodesOf = (c: Catalog, archetypes: string[] = []): NodeDef[] => {
    const m = mergeCatalogs([c], archetypes);
    expect(m.errors).toEqual([]);
    return m.nodes;
  };

  /**
   * The shape the feature exists for: "no payments in the app" rules out recording them in the app, but says
   * nothing about which of the remaining ways of recording one holds. An `implies` edge cannot express that
   * — it would have to name a survivor, and would go on naming the wrong one the day a fourth option lands.
   */
  const payments = () =>
    cat("core", "core", [
      { id: "payments_in_app", topic: "money", options: [{ id: "none", excludes: [{ node: "payment_recording", option: "in_app" }] }, { id: "card" }] },
      { id: "payment_recording", topic: "money", options: [{ id: "manual" }, { id: "in_app" }, { id: "receipts" }] },
    ]);

  it("records the exclusion on the NodeDef, keyed by option, parallel to implies", () => {
    const nodes = nodesOf(payments());
    expect(nodes.find((n) => n.id === "payments_in_app")!.excludes).toEqual({ none: [{ node: "payment_recording", option: "in_app" }], card: [] });
    expect(nodes.find((n) => n.id === "payment_recording")!.excludes).toEqual({ manual: [], in_app: [], receipts: [] });
  });

  it("reports a conflict (never throws) when both halves of an excluded pair are assigned", () => {
    const nodes = nodesOf(payments());
    const p = propagateHard({ payments_in_app: "none", payment_recording: "in_app" }, nodes);
    expect(p.conflicts).toEqual([{ node: "payment_recording", have: "in_app", want: "!in_app", because: "payments_in_app=none", kind: "excludes" }]);
    expect(p.assignment).toEqual({ payments_in_app: "none", payment_recording: "in_app" }); // reported, not rewritten
    expect(p.derived).toEqual({});
  });

  it("fires from whichever end of the pair the walk reaches, and reports the pair only once", () => {
    const nodes = nodesOf(payments());
    // authored on payments_in_app, but the constraint is symmetric — starting at the other end must still
    // catch it, which is exactly what a directional edge would have failed to do (`roots` = the incremental
    // one-value-at-a-time propagation `resolveAssignment` and the orchestrator use)
    expect(propagateHard({ payments_in_app: "none", payment_recording: "in_app" }, nodes, ["payment_recording"]).conflicts).toEqual([
      { node: "payments_in_app", have: "none", want: "!none", because: "payment_recording=in_app", kind: "excludes" },
    ]);
    // a full walk reaches both ends and must still count ONE contradiction, not two
    expect(propagateHard({ payments_in_app: "none", payment_recording: "in_app" }, nodes).conflicts).toHaveLength(1);
  });

  it("does not settle a node while more than one option survives (an exclusion forbids, it never chooses)", () => {
    const p = propagateHard({ payments_in_app: "none" }, nodesOf(payments()));
    expect(p.assignment).toEqual({ payments_in_app: "none" });
    expect(p.derived).toEqual({});
    expect(p.conflicts).toEqual([]);
  });

  it("unit propagation: exclusions that leave one option settle the node and record it in derived", () => {
    const nodes = nodesOf(
      cat("core", "core", [
        { id: "payments_in_app", options: [{ id: "none", excludes: [{ node: "payment_recording", option: "in_app" }] }, { id: "card" }] },
        { id: "payment_recording", options: [{ id: "manual" }, { id: "in_app" }] },
      ]),
    );
    const p = propagateHard({ payments_in_app: "none" }, nodes);
    expect(p.assignment).toEqual({ payments_in_app: "none", payment_recording: "manual" });
    expect(p.derived).toEqual({ payment_recording: { option: "manual", because: "payments_in_app=none" } });
    expect(p.conflicts).toEqual([]);
  });

  it("names every decision that ruled the alternatives out when several did", () => {
    const nodes = nodesOf(
      cat("core", "core", [
        { id: "a", options: [{ id: "a1", excludes: [{ node: "b", option: "b1" }] }, { id: "a2" }] },
        { id: "c", options: [{ id: "c1", excludes: [{ node: "b", option: "b2" }] }, { id: "c2" }] },
        { id: "b", options: [{ id: "b1" }, { id: "b2" }, { id: "b3" }] },
      ]),
    );
    expect(propagateHard({ a: "a1", c: "c1" }, nodes).derived).toEqual({ b: { option: "b3", because: "a=a1,c=c1" } });
    expect(propagateHard({ c: "c1", a: "a1" }, nodes).derived).toEqual({ b: { option: "b3", because: "a=a1,c=c1" } }); // sorted: attribution is walk-order-free
  });

  it("reports a conflict, not a crash, when exclusions eliminate EVERY option of a node", () => {
    const nodes = nodesOf(
      cat("core", "core", [
        { id: "a", options: [{ id: "a1", excludes: [{ node: "b", option: "b1" }] }, { id: "a2" }] },
        { id: "c", options: [{ id: "c1", excludes: [{ node: "b", option: "b2" }] }, { id: "c2" }] },
        { id: "b", options: [{ id: "b1" }, { id: "b2" }] },
      ]),
    );
    const p = propagateHard({ a: "a1", c: "c1" }, nodes);
    expect(p.assignment.b).toBeUndefined(); // there is no value b could take, so it takes none
    expect(p.conflicts).toEqual([{ node: "b", have: "", want: "!*", because: "a=a1,c=c1", kind: "excludes" }]);
    expect(propagateHard({ c: "c1", a: "a1" }, nodes).conflicts).toHaveLength(1); // once, from either direction
  });

  it("terminates on a cycle of exclusions", () => {
    const cycle = nodesOf(
      cat("core", "core", [
        { id: "a", options: [{ id: "a1", excludes: [{ node: "b", option: "b1" }] }, { id: "a2" }] },
        { id: "b", options: [{ id: "b1", excludes: [{ node: "c", option: "c1" }] }, { id: "b2" }] },
        { id: "c", options: [{ id: "c1", excludes: [{ node: "a", option: "a1" }] }, { id: "c2" }] },
      ]),
    );
    const p = propagateHard({ a: "a1" }, cycle);
    expect(p.assignment).toEqual({ a: "a1", b: "b2", c: "c2" });
    expect(p.conflicts).toEqual([]);
    // and the 2-cycle an author reaches for first: the same pair declared from both ends
    const mutual = nodesOf(
      cat("core", "core", [
        { id: "a", options: [{ id: "a1", excludes: [{ node: "b", option: "b1" }] }, { id: "a2" }] },
        { id: "b", options: [{ id: "b1", excludes: [{ node: "a", option: "a1" }] }, { id: "b2" }] },
      ]),
    );
    expect(propagateHard({ a: "a1" }, mutual).assignment).toEqual({ a: "a1", b: "b2" });
    expect(propagateHard({ a: "a1", b: "b1" }, mutual).conflicts).toHaveLength(1); // declared twice, reported once
  });

  it("errors on an exclusion pointing at an unknown node or an unknown option", () => {
    const errors = mergeCatalogs(
      [
        cat("core", "core", [
          { id: "a", options: [{ id: "a1", excludes: [{ node: "nope", option: "x" }] }, { id: "a2", excludes: [{ node: "b", option: "b9" }] }] },
          { id: "b", options: [{ id: "b1" }, { id: "b2" }] },
        ]),
      ],
      [],
    ).errors.join(" ");
    expect(errors).toMatch(/a\.a1 excludes unknown node nope/);
    expect(errors).toMatch(/a\.a2 excludes unknown option b\.b9/);
  });

  it("errors on an option that excludes itself (it could never be chosen)", () => {
    const errors = mergeCatalogs([cat("core", "core", [{ id: "a", options: [{ id: "a1", excludes: [{ node: "a", option: "a1" }] }, { id: "a2" }] }])], []).errors.join(" ");
    expect(errors).toMatch(/a\.a1 excludes itself/);
  });

  it("carries the loser's exclusions onto the winner through a same_as merge, rewritten through the map", () => {
    const c = crud(EQUIV);
    c.nodes[0]!.options[1]!.excludes = [{ node: "audit_trail", option: "none" }];
    const m = mergeCatalogs([core(), c], ["crud-saas"]);
    expect(m.errors).toEqual([]);
    const w = m.nodes.find((n) => n.id === "recurring_scheduled")!;
    expect(w.excludes).toEqual({ none: [], reminders_only: [], recurring_records: [{ node: "audit_trail", option: "none" }] });
    // and the carried edge really constrains: recurring records now force an audit trail
    expect(propagateHard({ recurring_scheduled: "recurring_records" }, m.nodes).derived).toEqual({ audit_trail: { option: "full", because: "recurring_scheduled=recurring_records" } });
  });

  it("retargets an exclusion that pointed at a node the merge removed", () => {
    const c = crud(EQUIV);
    c.nodes.push(...cat("x", "crud-saas", [{ id: "other_node", options: [{ id: "a", excludes: [{ node: "record_recurring", option: "no" }] }, { id: "b" }] }]).nodes);
    const m = mergeCatalogs([core(), c], ["crud-saas"]);
    expect(m.errors).toEqual([]);
    expect(m.nodes.find((n) => n.id === "other_node")!.excludes!.a).toEqual([{ node: "recurring_scheduled", option: "none" }]);
  });

  it("drops an exclusion the merge turns into a sibling tautology", () => {
    const c = crud(EQUIV);
    // record_recurring.recurring_records excludes recurring_scheduled=none; once the two nodes are one, that
    // says "recurring_records excludes none" — true of any two options of one node, so nothing to record
    c.nodes[0]!.options[1]!.excludes = [{ node: "recurring_scheduled", option: "none" }];
    const m = mergeCatalogs([core(), c], ["crud-saas"]);
    expect(m.errors).toEqual([]);
    expect(m.nodes.find((n) => n.id === "recurring_scheduled")!.excludes!.recurring_records).toEqual([]);
  });

  it("reports an exclusion the merge turns into self-exclusion, from either side", () => {
    const carried = crud(EQUIV);
    carried.nodes[0]!.options[1]!.excludes = [{ node: "recurring_scheduled", option: "recurring_records" }]; // maps onto its own surviving option
    expect(mergeCatalogs([core(), carried], ["crud-saas"]).errors.join(" ")).toMatch(
      /record_recurring\.recurring_records excludes recurring_scheduled=recurring_records, which the map turns into recurring_scheduled\.recurring_records excluding itself/,
    );

    const rewritten = core();
    rewritten.nodes[0]!.options[0]!.excludes = [{ node: "record_recurring", option: "no" }]; // no -> none, i.e. onto itself
    expect(mergeCatalogs([rewritten, crud(EQUIV)], ["crud-saas"]).errors.join(" ")).toMatch(/same_as rewrite made recurring_scheduled\.none exclude itself/);
  });

  it("repairs a sampled world that proposes an excluded pair instead of shipping it", () => {
    const nodes = nodesOf(payments());
    // layers are priority-ordered: what is already settled, then what the world sampled
    const r = resolveAssignment([{ payments_in_app: "none" }, { payment_recording: "in_app" }], nodes);
    expect(r.overridden).toEqual(["payment_recording"]); // the impossible sampled value loses
    expect(r.filled).toEqual(["payment_recording"]); // and the prior fill supplies a possible one
    expect(r.assignment).toEqual({ payments_in_app: "none", payment_recording: "manual" });
    expect(propagateHard(r.assignment, nodes).conflicts).toEqual([]); // the repaired world is itself clean
    // the same world without the exclusion would have shipped the pair — that is the regression this guards
    expect(resolveAssignment([{ payments_in_app: "none" }, { payment_recording: "in_app" }], nodesOf(cat("core", "core", [
      { id: "payments_in_app", options: [{ id: "none" }, { id: "card" }] },
      { id: "payment_recording", options: [{ id: "manual" }, { id: "in_app" }, { id: "receipts" }] },
    ]))).assignment).toEqual({ payments_in_app: "none", payment_recording: "in_app" });
  });

  it("is exactly the old behaviour when nothing declares an exclusion", () => {
    const nodes = nodesOf(
      cat("core", "core", [
        { id: "A", options: [{ id: "a1", implies: [{ node: "B", option: "b1" }] }, { id: "a2" }] },
        { id: "B", options: [{ id: "b1" }, { id: "b2" }] },
      ]),
    );
    expect(propagateHard({ A: "a1" }, nodes)).toEqual({ assignment: { A: "a1", B: "b1" }, derived: { B: { option: "b1", because: "A=a1" } }, conflicts: [] });
    const conflict = propagateHard({ A: "a1", B: "b2" }, nodes).conflicts;
    expect(conflict).toEqual([{ node: "B", have: "b2", want: "b1", because: "A=a1" }]);
    // no discriminator is added to an implication conflict — the record every existing consumer formats and
    // `orchestrator.test.ts` asserts with toEqual keeps exactly the four keys it always had
    expect(Object.keys(conflict[0]!)).toEqual(["node", "have", "want", "because"]);
  });
});

// ---------------------------------------------------------------------------

describe("topicIncoherence", () => {
  /** the real triple from live project f9280b97 (financial ledger, internal-dashboard + crud-saas) */
  const automationTriple = [
    {
      id: "recurring_scheduled",
      topic: "automation",
      status: "resolved",
      chosen: "recurring_records",
      confidence: 1,
      options: [
        { id: "none", label: "No" },
        { id: "reminders_only", label: "Only reminders/notifications" },
        { id: "recurring_records", label: "Records get created automatically (recurring invoices, appointments, reports)" },
      ],
    },
    {
      id: "record_automation",
      topic: "automation",
      status: "defaulted",
      chosen: "none",
      confidence: 0.758,
      options: [
        { id: "none", label: "No — people do everything by hand" },
        { id: "simple_rules", label: "Simple rules: when X happens, notify/assign/change stage" },
      ],
    },
    {
      id: "record_recurring",
      topic: "automation",
      status: "defaulted",
      chosen: "no",
      confidence: 0.906,
      options: [
        { id: "no", label: "No" },
        { id: "recurring_records", label: "Yes — they are created automatically on a schedule" },
      ],
    },
  ];

  it("flags the live automation triple", () => {
    const out = topicIncoherence(automationTriple);
    expect(out).toHaveLength(1);
    expect(out[0]!.topic).toBe("automation");
    expect(out[0]!.decisions.map((d) => d.id)).toEqual(["recurring_scheduled", "record_automation", "record_recurring"]);
    expect(out[0]!.decisions[0]).toEqual({ id: "recurring_scheduled", chosen: "recurring_records", confidence: 1 });
    expect(out[0]!.why).toMatch(/recurring_scheduled = recurring_records .* say the app does this, while record_automation = none .* and record_recurring = no .* say it does not/);
  });

  it("says nothing when the topic is settled coherently", () => {
    expect(topicIncoherence(automationTriple.map((d) => (d.id === "recurring_scheduled" ? { ...d, chosen: "none" } : d)))).toEqual([]);
  });

  it("does not flag two affirmative answers on one topic (roles vs record_edit_rights)", () => {
    expect(
      topicIncoherence([
        { id: "roles", topic: "who can do what", status: "defaulted", chosen: "owner_staff", options: [{ id: "single", label: "Everyone who logs in can do everything" }, { id: "owner_staff", label: "An owner/admin plus staff with fewer powers" }] },
        { id: "record_edit_rights", topic: "who can do what", status: "defaulted", chosen: "owner_assignee_admin", options: [{ id: "anyone_who_sees", label: "Anyone who can see it can edit it" }, { id: "owner_assignee_admin", label: "Only its owner/assignee and admins; others just view" }] },
      ]),
    ).toEqual([]);
  });

  it("does not flag a bucket topic whose other question cannot say 'no' (money: payments vs currencies)", () => {
    expect(
      topicIncoherence([
        { id: "payments_in_app", topic: "money", status: "defaulted", chosen: "none", options: [{ id: "none", label: "No payments involved" }, { id: "record_only", label: "It records payments that happen elsewhere" }] },
        { id: "currencies", topic: "money", status: "defaulted", chosen: "single", options: [{ id: "single", label: "One currency" }, { id: "multi", label: "Invoices in different currencies" }] },
      ]),
    ).toEqual([]);
  });

  it("ignores unsettled decisions and lone topics", () => {
    expect(topicIncoherence(automationTriple.map((d) => (d.id === "recurring_scheduled" ? { ...d, status: "open" } : d)))).toEqual([]);
    expect(topicIncoherence([automationTriple[0]!])).toEqual([]);
  });

  it("reads negation from the label when the option id does not say it", () => {
    expect(readsAsNegation("mark_only", "No — nothing else happens")).toBe(true);
    expect(readsAsNegation("no_stages", "Just a status flag")).toBe(true);
    expect(readsAsNegation("single_pool", "One shared pool")).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe("question similarity (bespoke dedup)", () => {
  const concurrency = { id: "concurrency", topic: "simultaneous edits", question: "What happens when two people edit the same thing at once?" };
  const x2 = { id: "x2", topic: "Concurrent Edit Handling", question: "If two users edit the same Financial Record at once, what should happen?" };

  it("catches the live x2-vs-concurrency re-ask across different ids and topics", () => {
    expect(questionSimilarity(concurrency.question, x2.question)).toBeGreaterThanOrEqual(0.6);
    expect(isDuplicateQuestion(concurrency, x2)).toBe(true);
    expect(findDuplicateNode(x2, [concurrency])?.id).toBe("concurrency");
  });

  it("leaves the genuinely new bespoke questions from the same session alone", () => {
    const planned = [
      { id: "deletion", topic: "deleting", question: "When something is deleted, what really happens?" },
      { id: "record_duplicates", topic: "data quality", question: "Can two records be the same thing (same email, same serial number)?" },
      { id: "audit_trail", topic: "history", question: "Do you need a record of who changed what and when?" },
      { id: "attachments", topic: "files", question: "Can files/photos be attached to things?" },
    ];
    for (const b of [
      { id: "x1", topic: "Dependent Upload Session Deletion", question: "What happens to Financial Records imported in an Upload Session if that session is deleted?" },
      { id: "x3", topic: "Duplicate Upload Submission Handling", question: "If the same Excel file (or a nearly identical one) is uploaded twice, what should the app do?" },
      { id: "x6", topic: "Partial Failure on Upload", question: "What happens if a batch Excel upload partially fails?" },
    ]) {
      expect(findDuplicateNode(b, planned), `${b.id} must survive`).toBeUndefined();
    }
  });

  it("still matches on exact id", () => {
    expect(findDuplicateNode({ id: "concurrency", topic: "anything", question: "unrelated words entirely" }, [concurrency])?.id).toBe("concurrency");
  });

  it("takes a weaker overlap as duplicate only when the topic agrees", () => {
    const a = { id: "record_duplicates", topic: "data quality", question: "Can two records be the same email?" };
    const b = { id: "x9", topic: "data quality", question: "Should two duplicate records merge?" };
    expect(questionSimilarity(a.question, b.question)).toBeCloseTo(0.5, 5); // below the standalone bar, above the within-topic one
    expect(isDuplicateQuestion(a, b)).toBe(true);
    expect(isDuplicateQuestion(a, { ...b, topic: "merging things" })).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe("routeByWorkflowSignal", () => {
  const nodes: NodeDef[] = [
    { id: "audit_trail", topic: "history", question: "q", options: [{ id: "a", label: "a" }, { id: "b", label: "b" }], consequence: 3, prior: {}, implies: {}, sections: [], bespoke: false, archetype: "core", tags: ["record_workflow"] },
    { id: "record_assignment", topic: "assignments", question: "Are records assigned to people with deadlines?", options: [{ id: "a", label: "a" }, { id: "b", label: "b" }], consequence: 3, prior: {}, implies: {}, sections: [], bespoke: false, archetype: "crud-saas", tags: ["record_workflow"] },
    { id: "record_views", topic: "views", question: "How do people look at their records?", options: [{ id: "a", label: "a" }, { id: "b", label: "b" }], consequence: 3, prior: {}, implies: {}, sections: [], bespoke: false, archetype: "crud-saas", tags: ["record_workflow"] },
    { id: "record_search", topic: "finding things", question: "How do people find a record?", options: [{ id: "a", label: "a" }, { id: "b", label: "b" }], consequence: 3, prior: {}, implies: {}, sections: [], bespoke: false, archetype: "crud-saas", tags: [] },
  ];

  /** the real f9280b97 draft: a financial ledger with no person and no deadline on any record */
  const ledger = {
    one_liner: "internal dashboard based on our excel files with financials",
    archetypes: ["internal-dashboard", "crud-saas"],
    nouns: [
      { name: "Financial Record", description: "A single line from the financials Excel file.", fields_hint: ["Date", "Category", "Amount", "Description"] },
      { name: "Summary Report", description: "Aggregated view of financials over a chosen period.", fields_hint: ["Date range", "Total income", "Total expenses", "Net profit"] },
      { name: "Category", description: "Expense, income, or account grouping.", fields_hint: ["Name", "Type (expense/income)", "Notes"] },
      { name: "Upload Session", description: "A record of an Excel file upload event for audit.", fields_hint: ["Date/time", "User", "File name"] },
    ],
    actions: [
      { verb: "uploads", example: "Accountant uploads Q2_financials.xlsx on 2024-05-15." },
      { verb: "views", example: "Manager reviews net profit for Q1 2024 in dashboard." },
      { verb: "edits", example: "Accountant corrects amount on 2024-04-22 salary expense line." },
      { verb: "filters", example: "Manager filters records to see all Marketing expenses for March." },
    ],
  };

  it("sees no workflow in the live financial ledger", () => {
    expect(workflowSignals(ledger).present).toBe(false);
  });

  it("drops the tagged secondary-archetype nodes and nothing else", () => {
    const r = routeByWorkflowSignal(nodes, ledger);
    expect(r.dropped.map((d) => d.id)).toEqual(["record_assignment", "record_views"]);
    expect(r.nodes.map((n) => n.id)).toEqual(["audit_trail", "record_search"]); // core is never routed out, untagged is never routed out
  });

  it("keeps everything once a noun names an assignee or a deadline", () => {
    for (const field of ["assignee", "due date", "Owner", "follow-up"]) {
      const draft = { ...ledger, nouns: [...ledger.nouns, { name: "Task", fields_hint: [field] }] };
      expect(workflowSignals(draft).present, field).toBe(true);
      expect(routeByWorkflowSignal(nodes, draft).dropped, field).toEqual([]);
    }
  });

  it("keeps everything once an action reads as assignment", () => {
    const draft = { ...ledger, actions: [...ledger.actions, { verb: "assigns", example: "Manager assigns the line to Dana" }] };
    expect(routeByWorkflowSignal(nodes, draft).dropped).toEqual([]);
  });

  it("does not treat audit metadata as a workflow signal", () => {
    const draft = { ...ledger, nouns: [{ name: "Row", fields_hint: ["Date", "User", "Created at", "Modified by", "Date/time"] }] };
    expect(workflowSignals(draft).present).toBe(false);
  });

  it("never routes out the app's primary archetype", () => {
    const r = routeByWorkflowSignal(nodes, { ...ledger, archetypes: ["crud-saas"] });
    expect(r.dropped).toEqual([]);
  });
});
