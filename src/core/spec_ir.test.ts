import { describe, it, expect } from "vitest";
import { StateMachinesIRSchema, checkStateMachines, renderStateMachines, formatIRFindings, demoInvoicingIR, type StateMachinesIR } from "./spec_ir.js";

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
