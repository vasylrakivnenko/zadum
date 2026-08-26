// Generated from Design Sheet v7 (internal dashboard based on our excel files with financials).
// Do not rename tests: the "r…:"/"a…:" prefixes are the Sheet's stable rule/action ids — they are how
// reviews trace test coverage back to the Sheet. Implement each todo against the real app; a rule test
// must FAIL if the rule can be violated.
import { describe, it } from "vitest";

describe("Design Sheet rules (inviolable)", () => {
  it.todo("r1 (access): Only the Owner and Bookkeeper may upload or edit spreadsheets and figures; Managers and Accountants can only view.");
  it.todo("r2 (access): A Manager may only see figures for the areas assigned to them, not the whole company.");
  it.todo("r3 (state): A period must be uploaded and mapped before its figures appear on any dashboard.");
  it.todo("r4 (state): Once a period is closed, its figures cannot be edited unless it is reopened by the Owner.");
  it.todo("r5 (integrity): Profit Summary must always equal Revenue Figure minus Expense Figure for the same period.");
  it.todo("r6 (integrity): Every Account Line must belong to exactly one Category and one Period.");
  it.todo("r7 (integrity): All amounts are recorded in a single currency across all uploads.");
  it.todo("r8 (integrity): Re-uploading a file for a period replaces the prior figures rather than adding to them.");
  it.todo("r9 (access): Only the Owner may invite users, assign roles, and change what areas a user can access; Bookkeepers, Managers, and Accountants cannot manage user accounts.");
  it.todo("r10 (integrity): Every upload, correction, and period close/reopen must be recorded with who did it and when, and this history cannot be altered.");
  it.todo("r11 (integrity): Each User must have a role and (for Managers) their allowed areas assigned when they are invited.");
  it.todo("r12 (integrity): A Category cannot be deleted while Account Lines are still assigned to it; the lines must be reassigned or removed first.");
  it.todo("r13 (integrity): An Excel Upload must have a file, a period covered, and an uploader recorded before it can be imported.");
  it.todo("r14 (integrity): Each Period label must be unique, so figures are never split across two records for the same month, quarter, or year.");
  it.todo("r1 negative: the forbidden path is actually blocked — attempt it and assert denial");
  it.todo("r2 negative: the forbidden path is actually blocked — attempt it and assert denial");
  it.todo("r9 negative: the forbidden path is actually blocked — attempt it and assert denial");
});

describe("Actions (happy paths)", () => {
  it.todo("a1: Bookkeeper uploads Excel Upload — e.g. Bookkeeper uploads Financials_2024_Q1.xlsx");
  it.todo("a2: Bookkeeper maps Category — e.g. Bookkeeper maps 'Rent' column to Office Rent category");
  it.todo("a3: Bookkeeper corrects Account Line — e.g. Bookkeeper fixes a mistyped $3,200 rent amount");
  it.todo("a4: Owner views Profit Summary — e.g. Owner views Q1 2024 net profit of $38,000");
  it.todo("a5: Owner opens Dashboard View — e.g. Owner opens Monthly Overview");
  it.todo("a6: Manager views Expense Figure — e.g. Manager views Marketing spend of $9,400");
  it.todo("a7: Owner closes Period — e.g. Owner closes Q1 2024 after review");
  it.todo("a8: Accountant reviews Revenue Figure — e.g. Accountant reviews Q1 2024 revenue of $148,000");
  it.todo("a9: Bookkeeper reopens Period — e.g. Bookkeeper reopens Q1 to fix a figure");
  it.todo("a10: Owner saves Dashboard View — e.g. Owner saves a new Cash Flow view");
  it.todo("a11: Bookkeeper creates Category — e.g. Bookkeeper adds a 'Software' expense category");
  it.todo("a12: Owner invites User — e.g. Owner invites Jane as a Manager");
});

// Not-yet (scope guard) — these features must NOT exist; a test asserting their absence is optional but welcome:
//   g1: Does not connect to bank accounts or pull transactions automatically.
//   g2: Does not generate or send invoices to customers.
//   g3: Does not file taxes or produce official accounting statements.
//   g4: Does not let external clients or the public log in.
//   g5: Does not handle payroll processing or payments.
