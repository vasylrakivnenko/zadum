/**
 * Every case here is drawn from real sheets in `.zadum`. The two positives are the pairs an outside reviewer
 * found by hand in the 2026-08-25 "internal dashboard" spec; the negatives are the four false positives a
 * looser first version of this check produced on that same Sheet.
 */
import { describe, expect, it } from "vitest";
import { ruleContradictions } from "./ledger_checks.js";
import type { Decision, Rule, Sheet } from "./sheet.js";

function rule(id: string, text: string, kind: Rule["kind"] = "access"): Rule {
  return { id, text, kind, source: "draft" };
}

function decision(id: string, question: string, chosenLabel: string, over: Partial<Decision> = {}): Decision {
  return {
    id,
    topic: id,
    question,
    options: [{ id: "chosen", label: chosenLabel }, { id: "other", label: "Something else" }],
    chosen: "chosen",
    status: "defaulted",
    confidence: 0.92,
    consequence: 4,
    ...over,
  } as Decision;
}

function sheet(rules: Rule[], decisions: Decision[], actors = ["Accountant", "Manager", "Executive"]): Sheet {
  return {
    project_id: "t1",
    name: "internal dashboard",
    version: 1,
    one_liner: "internal dashboard based on our excel files with financials",
    archetypes: ["crud-saas"],
    actors: actors.map((name, i) => ({ id: `p${i + 1}`, name, source: "draft" })),
    nouns: [{ id: "n1", name: "Financial Record", fields_hint: ["Amount"], source: "draft" }],
    actions: [],
    rules,
    non_goals: [],
    decisions,
  } as Sheet;
}

const R1 = rule("r1", "Only Accountants may upload or edit Financial Records.");
const R6 = rule("r6", "Only authorized users may view the Amount field in Financial Records; Executive access to detailed values is restricted to summary data.");

describe("ruleContradictions", () => {
  it("catches an answer that hands a restricted capability to everyone", () => {
    const s = sheet([R6], [decision("record_ownership", "Who can see a record?", "Everyone in the team sees everything", { confidence: 0.93 })]);
    const [f] = ruleContradictions(s);
    expect(f).toMatchObject({ code: "rule_contradicts_default", severity: "medium", rule_id: "r6", decision_id: "record_ownership" });
    expect(f!.message).toContain("Everyone in the team sees everything");
    expect(f!.fix_hint).toContain("Rules beat assumptions");
  });

  it("catches an answer that hands it to a principal set the Sheet has no person for", () => {
    const s = sheet([R1], [decision("record_edit_rights", "Who can change a record?", "Only its owner/assignee and admins; others just view")]);
    expect(ruleContradictions(s)).toMatchObject([{ rule_id: "r1", decision_id: "record_edit_rights" }]);
  });

  it("treats the owner's own answer as the more serious disagreement, and never picks a side", () => {
    const s = sheet([R6], [decision("record_ownership", "Who can see a record?", "Everyone in the team sees everything", { status: "resolved", confidence: undefined })]);
    const [f] = ruleContradictions(s);
    expect(f).toMatchObject({ code: "rule_contradicts_answer", severity: "high" });
    expect(f!.message).toContain("answered");
    expect(f!.fix_hint).toContain("Do not resolve it by picking a side");
  });

  it("reports each decision once even when several rules restrict it", () => {
    const s = sheet([R6, rule("r10", "Records may only be accessed via the dashboard interface.")], [decision("record_ownership", "Who can see a record?", "Everyone in the team sees everything")]);
    expect(ruleContradictions(s)).toHaveLength(1);
  });

  // The four false positives a looser version produced on the real Sheet. Each one is silent for its own reason.
  it.each([
    ["an answer whose 'everyone' is not a permission grant", "record_custom_fields", "Are the fields on a record fixed, or can admins add their own?", "Fixed — the same fields for everyone"],
    ["an answer whose 'anyone' is about notification, not access", "record_watchers", "Who gets told when a record changes?", "The assignee, and anyone @mentioned"],
    ["a generic principal in an answer to a question that is not about who may act", "invite_flow", "How do additional people get access?", "An admin invites them"],
  ])("stays silent on %s", (_why, id, question, label) => {
    expect(ruleContradictions(sheet([R1, R6], [decision(id, question, label)]))).toEqual([]);
  });

  it("does not read \"view-only\" as a restriction on viewing", () => {
    // Real false positive from the replay: r4 restricts UPDATING and explicitly permits Executives to view,
    // so "Everyone in the team sees everything" agrees with it rather than contradicting it.
    const r4 = rule("r4", "Budgets are view-only to Executives; only Finance Managers update targets.");
    const seeing = decision("record_ownership", "Who can see a record?", "Everyone in the team sees everything");
    expect(ruleContradictions(sheet([r4], [seeing], ["Finance Manager", "Executive", "Accountant"]))).toEqual([]);
    // …but it still restricts updating, so an answer that hands editing to everyone is caught.
    const editing = decision("record_edit_rights", "Who can change a record?", "Anyone in the team can update it");
    expect(ruleContradictions(sheet([r4], [editing], ["Finance Manager", "Executive", "Accountant"]))).toHaveLength(1);
  });

  it("stays silent when the rule is not restrictive, not access-kind, or names no capability", () => {
    const permissive = rule("r1", "Accountants may upload or edit Financial Records.");
    const wrongKind = rule("r1", "Only Accountants may upload or edit Financial Records.", "integrity");
    const noVerb = rule("r1", "Only one workspace may exist.");
    const d = [decision("record_ownership", "Who can see a record?", "Everyone in the team sees everything")];
    for (const r of [permissive, wrongKind, noVerb]) expect(ruleContradictions(sheet([r], d))).toEqual([]);
  });

  it("stays silent when the answer names a real person from the Sheet", () => {
    const s = sheet([R1], [decision("record_edit_rights", "Who can change a record?", "Only the Accountant who owns it, and admins")]);
    expect(ruleContradictions(s)).toEqual([]);
  });

  it("ignores decisions nobody has settled", () => {
    for (const status of ["open", "skipped"] as const) {
      const s = sheet([R6], [decision("record_ownership", "Who can see a record?", "Everyone in the team sees everything", { status })]);
      expect(ruleContradictions(s)).toEqual([]);
    }
  });
});
