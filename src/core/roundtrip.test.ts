import { describe, it, expect } from "vitest";
import { roundTripReport, scopeCreep, sameAction, type ReverseSheet } from "./roundtrip.js";
import { emptySheet, type Sheet } from "./sheet.js";

const sheetOf = (parts: Partial<Sheet>): Sheet => ({ ...emptySheet("p1", "a small finance app"), ...parts });
const actor = (id: string, name: string) => ({ id, name, source: "draft" });
const noun = (id: string, name: string) => ({ id, name, fields_hint: [], source: "draft" });
const act = (id: string, a: string, verb: string, o: string) => ({ id, actor: a, verb, object: o, source: "draft" });
const rule = (id: string, text: string) => ({ id, text, kind: "other" as const, source: "draft" });
const goal = (id: string, text: string) => ({ id, text, source: "draft" });
const rev = (parts: Partial<ReverseSheet>): ReverseSheet => ({ actors: [], nouns: [], actions: [], rules: [], non_goals: [], ...parts });

describe("roundTripReport — the f9280b97 regression", () => {
  /**
   * Live compile f9280b97 (2026-08-25): the reverse compiler recovered every rule and every non-goal as a
   * paraphrase, and the old jaccard(a, b) >= 0.5 matcher reported rules 0.2 / non_goals 0.0 — counting all
   * eleven of them as BOTH missing and extra. These are the exact strings from that run's compile-report.
   */
  const sheet = sheetOf({
    rules: [
      rule("r1", "All uploads must be logged with date, user, and file name."),
      rule("r2", "Financial Records cannot be deleted if they are part of a generated Summary Report unless the report is first updated or removed."),
      rule("r3", "All mandatory fields (Date, Category, Amount, Description) must be completed when creating or uploading a Financial Record."),
    ],
    non_goals: [goal("g1", "Does not handle invoicing or payment collection."), goal("g2", "Does not support direct connection to bank accounts or real-time transaction sync.")],
  });
  const reverse = rev({
    rules: [
      { text: "Every Excel file import must create an Upload Session entry recording the date/time, uploading user, and file name." },
      { text: "If a Financial Record is referenced by an existing Summary Report, the record cannot be deleted until the relevant Summary Report is updated (to remove it) or deleted." },
      { text: "Date, Category, Amount, and Description are required for all Financial Record insertions and uploads; records missing any are rejected." },
    ],
    non_goals: [{ text: "No invoicing, billing, or payment collection workflows." }, { text: "No bank connections or real-time financial transaction sync." }],
  });

  it("recovers every paraphrased rule and non-goal", () => {
    const r = roundTripReport(sheet, reverse);
    expect(r.recall.rules).toBe(1);
    expect(r.recall.non_goals).toBe(1);
    expect(r.recall.overall).toBe(1);
    expect(r.missing).toEqual([]);
    expect(r.extra).toEqual([]);
  });

  it("does not credit a different rule about the same entities", () => {
    // From the same run: this is a field-level ACCESS rule, not the upload/edit rule it shares its subject with.
    const fieldLevel = "Field-level access control: Only Accountants and Managers may view the Amount field on Financial Records.";
    const s = sheetOf({ rules: [rule("r1", "Only Accountants may upload or edit Financial Records.")] });
    const r = roundTripReport(s, rev({ rules: [{ text: fieldLevel }] }));
    expect(r.recall.rules).toBe(0);
    expect(r.missing).toEqual([{ kind: "rule", item: "Only Accountants may upload or edit Financial Records." }]);
    expect(r.extra).toEqual([{ kind: "rule", item: fieldLevel }]);
  });

  it("gives that rule to the Sheet rule it is actually about", () => {
    const fieldLevel = "Field-level access control: Only Accountants and Managers may view the Amount field on Financial Records.";
    const s = sheetOf({
      rules: [
        rule("r1", "Only Accountants may upload or edit Financial Records."),
        rule("r2", "Only authorized users may view the Amount field in Financial Records; Executive access to detailed values is restricted to summary data."),
      ],
    });
    const r = roundTripReport(s, rev({ rules: [{ text: fieldLevel }] }));
    expect(r.recall.rules).toBe(0.5);
    expect(r.missing).toEqual([{ kind: "rule", item: "Only Accountants may upload or edit Financial Records." }]);
    expect(r.extra).toEqual([]);
  });
});

describe("roundTripReport — one-to-one assignment", () => {
  it("lets one reverse rule cover only one Sheet rule, the better one", () => {
    const s = sheetOf({
      rules: [
        rule("r1", "Financial Records must be archived after seven years of inactivity."),
        rule("r2", "Financial Records must be archived after seven years."),
      ],
    });
    const r = roundTripReport(s, rev({ rules: [{ text: "Financial Records must be archived after seven years." }] }));
    expect(r.recall.rules).toBe(0.5);
    expect(r.missing).toEqual([{ kind: "rule", item: "Financial Records must be archived after seven years of inactivity." }]);
    expect(r.extra).toEqual([]);
  });

  it("does not let one reverse noun cover two Sheet nouns", () => {
    const s = sheetOf({ nouns: [noun("n1", "Invoice"), noun("n2", "Invoices")] });
    const r = roundTripReport(s, rev({ nouns: [{ name: "invoice" }] }));
    expect(r.recall.nouns).toBe(0.5);
    expect(r.missing).toHaveLength(1);
  });
});

describe("roundTripReport — names and actions", () => {
  const sheet = sheetOf({
    actors: [actor("p1", "Accountant"), actor("p2", "Manager")],
    nouns: [noun("n1", "Financial Record"), noun("n2", "Summary Report")],
    actions: [act("a1", "p1", "upload", "n1"), act("a2", "p2", "approve", "n2")],
  });

  it("matches actors and nouns by normalised name, and actions through their parts", () => {
    const r = roundTripReport(
      sheet,
      rev({
        actors: [{ name: "accountants" }, { name: "Manager" }],
        nouns: [{ name: "Financial Records" }, { name: "Summary Reports" }],
        actions: [
          { actor: "Accountant", verb: "uploads", object: "Financial Records" },
          { actor: "Manager", verb: "approving", object: "Summary Report" },
        ],
      }),
    );
    expect(r.recall).toMatchObject({ actors: 1, nouns: 1, actions: 1, overall: 1 });
    expect(r.missing).toEqual([]);
  });

  it("reports an action the spec invented and one it dropped", () => {
    const r = roundTripReport(
      sheet,
      rev({
        actors: [{ name: "Accountant" }, { name: "Manager" }],
        nouns: [{ name: "Financial Record" }, { name: "Summary Report" }],
        actions: [
          { actor: "Accountant", verb: "upload", object: "Financial Record" },
          { actor: "Accountant", verb: "download", object: "Summary Report" },
        ],
      }),
    );
    expect(r.recall.actions).toBe(0.5);
    expect(r.missing).toEqual([{ kind: "action", item: "Manager|approve|Summary Report" }]);
    expect(r.extra).toEqual([{ kind: "action", item: "Accountant|download|Summary Report" }]);
  });

  it("sameAction folds verb inflections but not different verbs or objects", () => {
    expect(sameAction("Bookkeeper|creates|Invoice", "bookkeeper|create|invoices")).toBe(true);
    expect(sameAction("Accountant|upload|Financial Record", "Accountant|uploading|Financial Records")).toBe(true);
    expect(sameAction("Accountant|upload|Financial Record", "Accountant|delete|Financial Record")).toBe(false);
    expect(sameAction("Accountant|upload|Financial Record", "Accountant|upload|Summary Report")).toBe(false);
    expect(sameAction("Accountant|upload|Financial Record", "Manager|upload|Financial Record")).toBe(false);
  });
});

describe("roundTripReport — recall arithmetic", () => {
  it("divides matched by the number of Sheet items, per list and overall", () => {
    const sheet = sheetOf({
      actors: [actor("p1", "Accountant"), actor("p2", "Manager")],
      nouns: [noun("n1", "Invoice")],
      rules: [rule("r1", "Only Accountants may upload Financial Records."), rule("r2", "Every Invoice must have a due date.")],
    });
    const r = roundTripReport(sheet, rev({ actors: [{ name: "Accountant" }], nouns: [{ name: "Invoice" }], rules: [{ text: "An Invoice is required to carry a due date." }] }));
    expect(r.recall.actors).toBe(0.5);
    expect(r.recall.nouns).toBe(1);
    expect(r.recall.rules).toBe(0.5);
    // lists the Sheet does not use are vacuously complete, and must not drag the overall down
    expect(r.recall.actions).toBe(1);
    expect(r.recall.non_goals).toBe(1);
    expect(r.recall.overall).toBe(3 / 5);
    expect(r.missing.map((m) => m.kind).sort()).toEqual(["actor", "rule"]);
  });

  it("is 1 for an empty Sheet, and everything in the spec is then extra", () => {
    const r = roundTripReport(sheetOf({}), rev({ nouns: [{ name: "Comment" }], rules: [{ text: "Comments may be edited for five minutes." }] }));
    expect(r.recall).toEqual({ actors: 1, nouns: 1, actions: 1, rules: 1, non_goals: 1, overall: 1 });
    expect(r.missing).toEqual([]);
    expect(r.extra).toEqual([
      { kind: "noun", item: "Comment" },
      { kind: "rule", item: "Comments may be edited for five minutes." },
    ]);
  });

  it("is 0 when the reverse compiler found nothing", () => {
    const sheet = sheetOf({ nouns: [noun("n1", "Invoice")], rules: [rule("r1", "Every Invoice must have a due date.")] });
    const r = roundTripReport(sheet, rev({}));
    expect(r.recall).toMatchObject({ nouns: 0, rules: 0, overall: 0 });
    expect(r.missing).toEqual([
      { kind: "noun", item: "Invoice" },
      { kind: "rule", item: "Every Invoice must have a due date." },
    ]);
    expect(r.extra).toEqual([]);
  });

  it("is 1 on both sides when Sheet and spec are both empty", () => {
    const r = roundTripReport(sheetOf({}), rev({}));
    expect(r.recall.overall).toBe(1);
    expect(r.missing).toEqual([]);
    expect(r.extra).toEqual([]);
  });
});

describe("scopeCreep", () => {
  const report = {
    recall: { actors: 1, nouns: 1, actions: 1, rules: 1, non_goals: 1, overall: 1 },
    missing: [],
    extra: [
      { kind: "action", item: "Accountant|undo|Financial Record" },
      { kind: "non_goal", item: "No offline operation; an internet connection is always required." },
      { kind: "rule", item: "If multiple users edit the same Financial Record, the last save wins." },
      { kind: "noun", item: "Audit Trail Entry" },
      { kind: "actor", item: "Auditor" },
    ],
  };

  it("grades invented constraints and entities high, actions medium, non-goals low", () => {
    expect(scopeCreep(report)).toEqual([
      { kind: "rule", item: "If multiple users edit the same Financial Record, the last save wins.", severity: "high" },
      { kind: "noun", item: "Audit Trail Entry", severity: "high" },
      { kind: "actor", item: "Auditor", severity: "high" },
      { kind: "action", item: "Accountant|undo|Financial Record", severity: "medium" },
      { kind: "non_goal", item: "No offline operation; an internet connection is always required.", severity: "low" },
    ]);
  });

  it("is empty when the spec invented nothing, and never touches `missing`", () => {
    expect(scopeCreep({ ...report, extra: [] })).toEqual([]);
    expect(scopeCreep({ ...report, missing: [{ kind: "rule", item: "a dropped rule" }], extra: [] })).toEqual([]);
  });

  it("reads the extra half of a real report", () => {
    const sheet = sheetOf({ nouns: [noun("n1", "Financial Record")] });
    const r = roundTripReport(
      sheet,
      rev({
        nouns: [{ name: "Financial Record" }, { name: "Audit Trail Entry" }],
        actions: [{ actor: "Accountant", verb: "undo", object: "Financial Record" }],
        rules: [{ text: "Deleting a Financial Record marks it as archived; data can be restored, not purged." }],
      }),
    );
    expect(scopeCreep(r).map((c) => `${c.severity}:${c.kind}`)).toEqual(["high:noun", "high:rule", "medium:action"]);
  });
});
