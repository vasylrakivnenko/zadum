import { describe, it, expect } from "vitest";
import { StateMachinesIRSchema, checkStateMachines, demoInvoicingIR, formatIRFindings, normalizeMachineActors, renderStateMachines, type StateMachinesIR } from "./spec_ir.js";

const sheet = {
  actors: [{ name: "Owner" }, { name: "Client" }],
  nouns: [{ name: "Invoice" }, { name: "Payment" }],
};

/** Minimal valid two-state machine to mutate per check. */
const base = (over: Partial<StateMachinesIR["machines"][number]> = {}): StateMachinesIR => ({
  machines: [
    {
      entity: "Invoice",
      states: [
        { id: "draft", label: "Draft", description: "Being edited." },
        { id: "sent", label: "Sent", description: "With the client." },
      ],
      initial: "draft",
      terminal: ["sent"],
      transitions: [{ from: "draft", to: "sent", trigger: "owner sends the invoice", actor: "Owner", guard: "", sources: ["a1"] }],
      ...over,
    },
  ],
});

const codes = (ir: StateMachinesIR) => checkStateMachines(ir, sheet).map((f) => f.code);

describe("StateMachinesIRSchema", () => {
  it("parses the demo IR round-trip", () => {
    const parsed = StateMachinesIRSchema.parse(demoInvoicingIR());
    expect(parsed).toEqual(demoInvoicingIR());
  });
});

describe("checkStateMachines", () => {
  it("is silent on a good machine and on the demo IR", () => {
    expect(checkStateMachines(base(), sheet)).toEqual([]);
    expect(checkStateMachines(demoInvoicingIR(), sheet)).toEqual([]);
  });

  it("unknown_entity: fires for a non-Sheet noun, tolerates case and simple plurals", () => {
    const bad = checkStateMachines(base({ entity: "Shipment" }), sheet);
    expect(bad).toContainEqual(expect.objectContaining({ code: "unknown_entity", severity: "medium", machine: "Shipment" }));
    expect(codes(base({ entity: "invoices" }))).toEqual([]); // plural + case ≠ a finding
  });

  it("unknown_actor: fires for a stranger, accepts Sheet actors case-insensitively and \"system\"", () => {
    const t = (actor: string) => base({ transitions: [{ from: "draft", to: "sent", trigger: "x", actor, guard: "", sources: [] }] });
    const bad = checkStateMachines(t("Accountant"), sheet);
    expect(bad).toContainEqual(expect.objectContaining({ code: "unknown_actor", severity: "high" }));
    expect(codes(t("owner"))).toEqual([]);
    expect(codes(t("system"))).toEqual([]);
  });

  it("bad_state_ref: bad initial, bad terminal, bad from/to, and duplicate state ids each fire", () => {
    const badInitial = codes(base({ initial: "nope" }));
    expect(badInitial).toContain("bad_state_ref");
    expect(codes(base({ terminal: ["sent", "ghost"] }))).toContain("bad_state_ref");
    const badRefs = checkStateMachines(base({ transitions: [{ from: "limbo", to: "void", trigger: "x", actor: "Owner", guard: "", sources: [] }], terminal: ["draft", "sent"] }), sheet).filter((f) => f.code === "bad_state_ref");
    expect(badRefs).toHaveLength(2); // from and to both undeclared
    const dup = base();
    dup.machines[0]!.states.push({ id: "draft", label: "Draft again", description: "dup" });
    expect(codes(dup)).toContain("bad_state_ref");
  });

  it("unreachable_state: handles cycles without looping and flags only truly orphaned states", () => {
    const ir = base({
      states: [
        { id: "a", label: "A", description: "" },
        { id: "b", label: "B", description: "" },
        { id: "c", label: "C", description: "" },
        { id: "d", label: "D", description: "" },
      ],
      initial: "a",
      terminal: ["c", "d"],
      transitions: [
        { from: "a", to: "b", trigger: "go", actor: "Owner", guard: "", sources: [] },
        { from: "b", to: "a", trigger: "back", actor: "Owner", guard: "", sources: [] }, // cycle
        { from: "b", to: "c", trigger: "finish", actor: "Owner", guard: "", sources: [] },
      ],
    });
    const f = checkStateMachines(ir, sheet).filter((x) => x.code === "unreachable_state");
    expect(f).toHaveLength(1);
    expect(f[0]!.message).toContain('"d"');
  });

  it("terminal_outgoing: a terminal state with an exit fires high", () => {
    const ir = base({ terminal: ["draft", "sent"] }); // draft is terminal yet has draft→sent
    expect(checkStateMachines(ir, sheet)).toContainEqual(expect.objectContaining({ code: "terminal_outgoing", severity: "high" }));
  });

  it("dead_end: non-terminal state with no way out fires; a terminal one stays silent", () => {
    const ir = base({ terminal: [] }); // "sent" now non-terminal, no outgoing
    const found = checkStateMachines(ir, sheet);
    expect(found).toContainEqual(expect.objectContaining({ code: "dead_end", machine: "Invoice" }));
    expect(codes(base()).filter((c) => c === "dead_end")).toEqual([]); // sent is terminal → fine
  });

  it("no_terminal: a machine with no terminal states fires low", () => {
    const ir = base({
      terminal: [],
      transitions: [
        { from: "draft", to: "sent", trigger: "send", actor: "Owner", guard: "", sources: [] },
        { from: "sent", to: "draft", trigger: "recall", actor: "Owner", guard: "", sources: [] },
      ],
    });
    expect(checkStateMachines(ir, sheet)).toContainEqual(expect.objectContaining({ code: "no_terminal", severity: "low" }));
  });

  it("nondeterministic_transition: same (from, trigger, actor), both unguarded, different targets", () => {
    const twin = (guard1: string, to2: string): StateMachinesIR =>
      base({
        states: [
          { id: "draft", label: "D", description: "" },
          { id: "sent", label: "S", description: "" },
          { id: "voided", label: "V", description: "" },
        ],
        terminal: ["sent", "voided"],
        transitions: [
          { from: "draft", to: "sent", trigger: "owner acts", actor: "Owner", guard: guard1, sources: [] },
          { from: "draft", to: to2, trigger: "owner acts", actor: "Owner", guard: "", sources: [] },
        ],
      });
    expect(codes(twin("", "voided"))).toContain("nondeterministic_transition");
    expect(codes(twin("total > 0", "voided"))).not.toContain("nondeterministic_transition"); // a guard disambiguates
    expect(codes(twin("", "sent"))).not.toContain("nondeterministic_transition"); // same target ≠ conflict
  });

  it("empty_machine: fires for no states / no transitions without cascading graph findings", () => {
    const noStates = codes(base({ states: [], initial: "", terminal: [], transitions: [] }));
    expect(noStates).toEqual(["empty_machine"]);
    const noTransitions = codes(base({ transitions: [] }));
    expect(noTransitions).toEqual(["empty_machine"]);
  });

  it("terminal_with_escape_prose: a terminal state whose own description promises a way out fires high", () => {
    const locked = (description: string): StateMachinesIR =>
      base({
        states: [
          { id: "draft", label: "Draft", description: "Being edited." },
          { id: "audit_locked", label: "Audit Locked", description },
        ],
        terminal: ["audit_locked"],
        transitions: [{ from: "draft", to: "audit_locked", trigger: "the invoice is included in a generated report", actor: "system", guard: "", sources: [] }],
      });
    const f = checkStateMachines(locked("Locked because it is part of a report; cannot be edited until unlinked."), sheet).filter((x) => x.code === "terminal_with_escape_prose");
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe("high");
    expect(f[0]!.message).toContain('"audit_locked"');
    expect(f[0]!.message).toContain('"until"'); // the matched phrase is quoted as evidence
    expect(f[0]!.fix_hint).toMatch(/terminal|transition|reword/i);
    // other escape clauses
    expect(codes(locked("Frozen unless an admin intervenes."))).toContain("terminal_with_escape_prose");
    expect(codes(locked("Sealed, but it can be reopened by the owner."))).toContain("terminal_with_escape_prose");
    expect(codes(locked("A temporary hold on the record."))).toContain("terminal_with_escape_prose");
    // clean equivalents: a plain description, and an empty one
    expect(codes(locked("Locked for good because it is part of a filed report."))).not.toContain("terminal_with_escape_prose");
    expect(codes(locked(""))).not.toContain("terminal_with_escape_prose");
    expect(codes(base())).not.toContain("terminal_with_escape_prose");
    expect(codes(demoInvoicingIR())).not.toContain("terminal_with_escape_prose");
  });

  it("terminal_contradicts_deletion: final archival fires high under a restorable deletion decision only", () => {
    const withDeletion = (chosen: string) => ({
      ...sheet,
      decisions: [
        {
          id: "deletion",
          status: "defaulted",
          chosen,
          options: [
            { id: "hard_delete", label: "It's gone" },
            { id: "soft_delete", label: "It's archived and can be restored" },
          ],
        },
      ],
    });
    const archivedIR = base({
      states: [
        { id: "draft", label: "Draft", description: "Being edited." },
        { id: "archived", label: "Archived", description: "Soft-deleted and hidden from the normal list." },
      ],
      terminal: ["archived"],
      transitions: [{ from: "draft", to: "archived", trigger: "owner archives the invoice", actor: "Owner", guard: "", sources: [] }],
    });

    const f = checkStateMachines(archivedIR, withDeletion("soft_delete")).filter((x) => x.code === "terminal_contradicts_deletion");
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe("high");
    expect(f[0]!.message).toContain('"archived"');
    expect(f[0]!.message).toContain("soft_delete"); // the settled choice is quoted as evidence
    expect(f[0]!.fix_hint).toMatch(/restore transition|deletion/i);

    // the chosen option's LABEL is enough evidence even when the option id says nothing
    const byLabel = { ...sheet, decisions: [{ id: "deletion", status: "resolved", chosen: "recycle_bin", options: [{ id: "recycle_bin", label: "It's archived and can be restored" }] }] };
    expect(checkStateMachines(archivedIR, byLabel).map((x) => x.code)).toContain("terminal_contradicts_deletion");

    // clean equivalents: hard delete, an unsettled decision, an unrelated decision, no decisions at all
    expect(checkStateMachines(archivedIR, withDeletion("hard_delete")).map((x) => x.code)).not.toContain("terminal_contradicts_deletion");
    expect(checkStateMachines(archivedIR, { ...sheet, decisions: [{ id: "deletion", status: "open", options: [{ id: "soft_delete", label: "It's archived and can be restored" }] }] }).map((x) => x.code)).not.toContain("terminal_contradicts_deletion");
    expect(checkStateMachines(archivedIR, { ...sheet, decisions: [{ id: "invoice_delivery", status: "resolved", chosen: "soft_delete", options: [] }] }).map((x) => x.code)).not.toContain("terminal_contradicts_deletion");
    expect(checkStateMachines(archivedIR, { ...sheet, decisions: [] }).map((x) => x.code)).not.toContain("terminal_contradicts_deletion");
    expect(codes(archivedIR)).not.toContain("terminal_contradicts_deletion");

    // a terminal state that only NEGATES the archive words ("cannot be deleted") is not an archive state
    const lockedIR = base({
      states: [
        { id: "draft", label: "Draft", description: "Being edited." },
        { id: "filed", label: "Filed", description: "Part of a filed report; cannot be deleted or edited, ever." },
      ],
      terminal: ["filed"],
      transitions: [{ from: "draft", to: "filed", trigger: "the invoice is filed", actor: "system", guard: "", sources: [] }],
    });
    expect(checkStateMachines(lockedIR, withDeletion("soft_delete")).map((x) => x.code)).not.toContain("terminal_contradicts_deletion");

    // a machine with no archival state is untouched by the deletion decision
    expect(checkStateMachines(demoInvoicingIR(), withDeletion("soft_delete"))).toEqual([]);
  });

  it("manual_derived_state: a computed condition entered by an actor toggling a flag fires medium", () => {
    const undoIR = (trigger: string): StateMachinesIR =>
      base({
        states: [
          { id: "active", label: "Active", description: "In use." },
          { id: "undo_recent", label: "Undo Recent", description: "Eligible for undo — a recent change can be reverted." },
        ],
        initial: "active",
        terminal: [],
        transitions: [
          { from: "active", to: "undo_recent", trigger, actor: "Owner", guard: "", sources: ["x8"] },
          { from: "undo_recent", to: "active", trigger: "owner undoes the recent change", actor: "Owner", guard: "", sources: ["x8"] },
        ],
      });
    const f = checkStateMachines(undoIR("owner marks the change as revertible within the allowed time window"), sheet).filter((x) => x.code === "manual_derived_state");
    expect(f).toHaveLength(1);
    expect(f[0]!.severity).toBe("medium");
    expect(f[0]!.message).toContain('"undo_recent"');
    expect(f[0]!.message).toContain("marks the change as revertible"); // the offending trigger is quoted
    expect(f[0]!.fix_hint).toMatch(/timestamp|window|derive/i);
    expect(codes(undoIR("owner flags the change as revertible"))).toContain("manual_derived_state");

    // clean equivalent: entered by something that actually happens in the world
    expect(codes(undoIR("owner edits the invoice"))).not.toContain("manual_derived_state");
    // mixed inbound: one real event among the toggles means the state is genuinely entered
    const mixed = undoIR("owner marks the change as revertible");
    mixed.machines[0]!.transitions.push({ from: "active", to: "undo_recent", trigger: "owner imports a spreadsheet", actor: "Owner", guard: "", sources: [] });
    expect(codes(mixed)).not.toContain("manual_derived_state");
    // a manual trigger into a state that is not a derived condition is fine
    expect(codes(base({ transitions: [{ from: "draft", to: "sent", trigger: "owner marks the invoice as sent", actor: "Owner", guard: "", sources: [] }] }))).not.toContain("manual_derived_state");
    // the initial state has no inbound transition, so it is never judged
    const initialDerived = base({
      states: [
        { id: "recent_upload", label: "Recent Upload", description: "Eligible for undo." },
        { id: "sent", label: "Sent", description: "With the client." },
      ],
      initial: "recent_upload",
      terminal: ["sent"],
      transitions: [{ from: "recent_upload", to: "sent", trigger: "owner marks it as sent", actor: "Owner", guard: "", sources: [] }],
    });
    expect(codes(initialDerived)).not.toContain("manual_derived_state");
    expect(codes(demoInvoicingIR())).not.toContain("manual_derived_state");
  });

  it("accepts a sheet with no decisions key at all (backward-compatible call from compile.ts)", () => {
    const noDecisions: { actors: { name: string }[]; nouns: { name: string }[] } = { actors: [{ name: "Owner" }], nouns: [{ name: "Invoice" }] };
    expect(checkStateMachines(base(), noDecisions)).toEqual([]);
    expect(checkStateMachines(demoInvoicingIR(), { actors: [{ name: "Owner" }, { name: "Client" }], nouns: [{ name: "Invoice" }] })).toEqual([]);
    // the decision-driven check simply doesn't run; the other two still do
    const ir = base({
      states: [
        { id: "draft", label: "Draft", description: "Being edited." },
        { id: "archived", label: "Archived", description: "Soft-deleted, but it can be restored later." },
      ],
      terminal: ["archived"],
      transitions: [{ from: "draft", to: "archived", trigger: "owner archives the invoice", actor: "Owner", guard: "", sources: [] }],
    });
    const found = checkStateMachines(ir, noDecisions).map((x) => x.code);
    expect(found).toContain("terminal_with_escape_prose");
    expect(found).not.toContain("terminal_contradicts_deletion");
  });

  it("every finding carries machine, message, and an actionable fix_hint", () => {
    const f = checkStateMachines(base({ entity: "Shipment", initial: "nope" }), sheet);
    expect(f.length).toBeGreaterThanOrEqual(2);
    for (const x of f) {
      expect(x.machine).toBe("Shipment");
      expect(x.message.length).toBeGreaterThan(10);
      expect(x.fix_hint.length).toBeGreaterThan(10);
    }
  });
});

describe("renderStateMachines", () => {
  const md = renderStateMachines(demoInvoicingIR());

  it("renders the house-style section body: machine heading, states list, transitions table, trace markers, terminal callout", () => {
    expect(md).toContain("### Invoice");
    expect(md).not.toContain("## Lifecycles"); // compile.ts owns the section header
    expect(md).toContain("| From | To | Who | When | Guard | ⟨src⟩ |");
    expect(md).toContain("- `draft` — Draft: Being edited by the owner; not visible to the client.");
    expect(md).toContain("⟨src: a1⟩");
    expect(md).toContain("Terminal: `voided`, `credited`");
    expect(md).toContain("| — |"); // unconditional guard rendered as em dash
    expect(md).toContain("| system |"); // system-triggered transition
  });

  it("is deterministic and sorts machines by entity", () => {
    expect(renderStateMachines(demoInvoicingIR())).toBe(md);
    const two: StateMachinesIR = { machines: [{ ...base().machines[0]!, entity: "Payment" }, base().machines[0]!] };
    const out = renderStateMachines(two);
    expect(out.indexOf("### Invoice")).toBeLessThan(out.indexOf("### Payment"));
  });

  it("escapes pipes so cells cannot break the table", () => {
    const ir = base({ transitions: [{ from: "draft", to: "sent", trigger: "sends | forwards it", actor: "Owner", guard: "", sources: [] }] });
    expect(renderStateMachines(ir)).toContain("sends \\| forwards it");
  });
});

describe("formatIRFindings", () => {
  it("orders worst-first and stays readable", () => {
    const out = formatIRFindings([
      { code: "no_terminal", severity: "low", machine: "Invoice", message: "no terminal states.", fix_hint: "Mark one." },
      { code: "unknown_actor", severity: "high", machine: "Invoice", message: "actor \"Accountant\" unknown.", fix_hint: "Use a Sheet actor." },
    ]);
    expect(out).toContain("STRUCTURAL FINDINGS");
    expect(out.indexOf("unknown_actor")).toBeLessThan(out.indexOf("no_terminal"));
    expect(out).toContain("Fix: Use a Sheet actor.");
  });

  it("says so when there is nothing to fix", () => {
    expect(formatIRFindings([])).toBe("No structural findings.");
  });
});

describe("normalizeMachineActors", () => {
  // A live compile emitted p1/p3 on four transitions; the repair round did not recover them, so the spec
  // rendered "p3 categorizes the transaction" and four unknown_actor findings blocked delivery.
  const sheet = { actors: [{ id: "p1", name: "Finance Manager" }, { id: "p3", name: "Accountant" }], nouns: [{ name: "Transaction" }] };
  const machine = (actor: string) => ({
    machines: [
      {
        entity: "Transaction",
        initial: "draft",
        terminal: ["categorized"],
        states: [{ id: "draft", label: "Draft", description: "" }, { id: "categorized", label: "Categorized", description: "" }],
        transitions: [{ from: "draft", to: "categorized", trigger: "categorize", actor, guard: "", sources: [] }],
      },
    ],
  });

  it("rewrites an actor id into the actor's name", () => {
    const out = normalizeMachineActors(machine("p3"), sheet);
    expect(out.machines[0]!.transitions[0]!.actor).toBe("Accountant");
    expect(checkStateMachines(out, sheet).filter((f) => f.code === "unknown_actor")).toEqual([]);
  });

  it("leaves names, \"system\", and genuinely unknown actors alone", () => {
    for (const [given, want] of [["Finance Manager", "Finance Manager"], ["system", "system"], ["Auditor", "Auditor"]] as const) {
      expect(normalizeMachineActors(machine(given), sheet).machines[0]!.transitions[0]!.actor).toBe(want);
    }
    // …so an actor the Sheet really does not have is still reported
    expect(checkStateMachines(normalizeMachineActors(machine("Auditor"), sheet), sheet).some((f) => f.code === "unknown_actor")).toBe(true);
  });

  it("is a no-op when the Sheet declares no actors", () => {
    const ir = machine("p3");
    expect(normalizeMachineActors(ir, { actors: [] })).toEqual(ir);
  });
});
