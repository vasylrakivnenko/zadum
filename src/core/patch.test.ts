import { describe, it, expect } from "vitest";
import { emptySheet, SheetSchema } from "./sheet.js";
import { applyPatch, PatchError, type PatchOp } from "./patch.js";
import { makeCommit, diffSheets, revertOps } from "./commit.js";

const base = () => {
  const s = emptySheet("p1", "an invoicing app for small bookkeeping firms");
  const r = applyPatch(
    s,
    [
      { op: "add_actor", name: "Bookkeeper" },
      { op: "add_actor", name: "Client" },
      { op: "add_noun", name: "Invoice", fields_hint: ["amount", "status"] },
      { op: "add_noun", name: "Client" },
      { op: "add_action", actor: "Bookkeeper", verb: "sends", object: "Invoice" },
      { op: "add_action", actor: "Client", verb: "pays", object: "Invoice" },
      { op: "add_rule", text: "A client never sees another client's invoice", kind: "access" },
      { op: "add_non_goal", text: "multi-currency" },
      {
        op: "add_decision",
        id: "client_portal",
        topic: "client access",
        question: "Do clients log in?",
        options: [
          { id: "email_only", label: "Clients get invoices by email" },
          { id: "portal", label: "Clients log into a portal" },
        ],
        consequence: 5,
      },
    ],
    { source: "draft", strict: true },
  );
  return r.sheet;
};

describe("applyPatch", () => {
  it("adds items with readable ids and stamps provenance", () => {
    const s = base();
    expect(s.actors.map((a) => a.id)).toEqual(["p1", "p2"]);
    expect(s.nouns.map((n) => n.id)).toEqual(["n1", "n2"]);
    expect(s.actions[0]).toMatchObject({ id: "a1", actor: "p1", object: "n1", verb: "sends", source: "draft" });
    expect(SheetSchema.parse(s)).toBeTruthy();
  });

  it("rejects duplicates (normalized names) and reports them in non-strict mode", () => {
    const s = base();
    const r = applyPatch(s, [{ op: "add_noun", name: "invoices" }], { source: "user_edit:c1" });
    expect(r.applied).toHaveLength(0);
    expect(r.rejected[0]?.code).toBe("duplicate");
    expect(() => applyPatch(s, [{ op: "add_noun", name: "INVOICE " }], { source: "x", strict: true })).toThrow(PatchError);
  });

  it("resolves references by name and cascades removals", () => {
    const s = base();
    const r = applyPatch(s, [{ op: "remove_noun", ref: "Invoice" }], { source: "user_edit:c2", strict: true });
    expect(r.sheet.nouns.map((n) => n.name)).toEqual(["Client"]);
    expect(r.sheet.actions).toHaveLength(0);
    expect(r.cascaded.map((o) => o.op)).toEqual(["remove_action", "remove_action"]);
  });

  it("modifies actions referenced by phrase", () => {
    const s = base();
    const r = applyPatch(s, [{ op: "modify_action", ref: "Bookkeeper sends Invoice", verb: "issues" }], { source: "u", strict: true });
    expect(r.sheet.actions[0]?.verb).toBe("issues");
  });

  it("resolves decisions by option id or label and enforces transitions", () => {
    const s = base();
    const r = applyPatch(s, [{ op: "resolve_decision", id: "client_portal", chosen: "Clients log into a portal" }], {
      source: "card:c1",
      strict: true,
    });
    const d = r.sheet.decisions[0]!;
    expect(d.chosen).toBe("portal");
    expect(d.status).toBe("resolved");
    expect(d.confidence).toBe(1);
    expect(() =>
      applyPatch(r.sheet, [{ op: "set_decision", id: "client_portal", status: "implied", chosen: "portal" }], { source: "x", strict: true }),
    ).toThrow(/not allowed/);
    const bad = applyPatch(s, [{ op: "resolve_decision", id: "client_portal", chosen: "nope" }], { source: "x" });
    expect(bad.rejected[0]?.code).toBe("invalid_option");
  });

  it("never mutates its input", () => {
    const s = base();
    const before = JSON.stringify(s);
    applyPatch(s, [{ op: "remove_actor", ref: "Client" }], { source: "x", strict: true });
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe("commits + diff", () => {
  it("bumps version per commit and keeps a snapshot", () => {
    const s0 = emptySheet("p1", "x");
    const { commit } = makeCommit(s0, [{ op: "add_actor", name: "Owner" }], {
      id: "c1",
      source: { kind: "draft" },
      message: "draft",
      now: "2026-08-22T00:00:00Z",
      strict: true,
    });
    expect(commit?.version).toBe(1);
    expect(commit?.sheet.actors[0]?.source).toBe("draft");
    const none = makeCommit(commit!.sheet, [{ op: "remove_actor", ref: "ghost" }], {
      id: "c2",
      source: { kind: "user_edit", ref: "c2" },
      message: "noop",
      now: "2026-08-22T00:00:01Z",
    });
    expect(none.commit).toBeNull();
    expect(none.result.rejected).toHaveLength(1);
  });

  it("diffSheets produces ops that reproduce the target; revert restores an earlier snapshot", () => {
    const a = base();
    const ops: PatchOp[] = [
      { op: "add_noun", name: "Payment", fields_hint: ["amount", "method"] },
      { op: "modify_noun", ref: "Invoice", description: "A bill sent to a client" },
      { op: "remove_actor", ref: "Client" },
      { op: "add_rule", text: "An invoice cannot be sent twice", kind: "state" },
      { op: "resolve_decision", id: "client_portal", chosen: "portal" },
    ];
    const b = applyPatch(a, ops, { source: "user_edit:c9", strict: true }).sheet;
    const forward = diffSheets(a, b);
    const b2 = applyPatch(a, forward, { source: "replay", strict: true }).sheet;
    expect(strip(b2)).toEqual(strip(b));
    const back = revertOps(b, a);
    const a2 = applyPatch(b, back, { source: "undo", strict: true }).sheet;
    expect(strip(a2)).toEqual(strip(a));
  });
});

/** ignore provenance strings when comparing structure */
function strip(s: ReturnType<typeof base>) {
  return JSON.parse(JSON.stringify(s, (k, v) => (k === "source" ? undefined : v)));
}
