// Generated from Design Sheet v7 (internal dashboard based on our excel files with financials).
// Do not rename tests: the "r…:"/"a…:" prefixes are the Sheet's stable rule/action ids — they are how
// reviews trace test coverage back to the Sheet. Implement each todo against the real app; a rule test
// must FAIL if the rule can be violated.
import { describe, it } from "vitest";

describe("Design Sheet rules (inviolable)", () => {
  it.todo("r1 (access): Only the Owner and Bookkeeper may upload or edit spreadsheet figures; Managers and Accountant see read-only views.");
  it.todo("r2 (access): Each Manager may only view budgets and costs for their own Department.");
  it.todo("r3 (state): A month's financials cannot be finalized until income and expense lines are both present.");
  it.todo("r4 (integrity): Net profit must always equal total income minus total expenses for the same month.");
  it.todo("r5 (integrity): Uploading a new spreadsheet for an already-loaded month replaces the prior figures and keeps a record of both uploads.");
  it.todo("r6 (integrity): All amounts are shown in a single currency (USD) and no mixed currencies are allowed.");
  it.todo("r7 (state): Historical months cannot be edited once the Accountant marks them reviewed.");
  it.todo("r8 (integrity): There may be only one Monthly Financials record per calendar month, and each Spreadsheet Import must carry a unique file name and month-covered identifier.");
  it.todo("r9 (integrity): Every upload, figure edit, budget change, and review action is recorded with who did it and when, and these records cannot be altered or deleted.");
  it.todo("r10 (integrity): Every Revenue Line, Expense Line, and Budget must reference a valid existing month/period and (where applicable) an existing Department; no orphaned lines are allowed.");
  it.todo("r11 (integrity): Required fields (month, category, and amount) must be provided before a Revenue Line, Expense Line, or Cash Balance is saved.");
  it.todo("r12 (access): Users interact with financial figures only through the dashboard; direct access to the underlying spreadsheets or data store is not permitted.");
  it.todo("r13 (state): A Department cannot be deleted while it still has linked Budgets or Expense Lines assigned to it.");
  it.todo("r1 negative: the forbidden path is actually blocked — attempt it and assert denial");
  it.todo("r2 negative: the forbidden path is actually blocked — attempt it and assert denial");
  it.todo("r12 negative: the forbidden path is actually blocked — attempt it and assert denial");
});

describe("Actions (happy paths)", () => {
  it.todo("a1: Bookkeeper uploads Spreadsheet Import — e.g. Bookkeeper uploads financials_Mar2024.xlsx on Apr 2");
  it.todo("a2: Bookkeeper updates Revenue Line — e.g. Bookkeeper corrects Product Sales to $58,000");
  it.todo("a3: Bookkeeper updates Expense Line — e.g. Bookkeeper adds Rent expense of $8,500");
  it.todo("a4: Bookkeeper enters Cash Balance — e.g. Bookkeeper records $142,300 as of Mar 31");
  it.todo("a5: Owner views Monthly Financials — e.g. Owner opens March 2024 summary");
  it.todo("a6: Owner reviews KPI — e.g. Owner checks gross margin against target");
  it.todo("a7: Manager views Budget — e.g. Manager reviews Marketing budget vs actuals");
  it.todo("a8: Manager views Department — e.g. Manager opens Sales department costs");
  it.todo("a9: Owner sets Budget — e.g. Owner sets Q2 Marketing budget to $16,000");
  it.todo("a10: Accountant reviews Monthly Financials — e.g. Accountant reviews March figures at close");
  it.todo("a11: Accountant exports Monthly Financials — e.g. Accountant downloads March summary as Excel");
  it.todo("a12: Owner compares KPI — e.g. Owner compares gross margin across quarters");
});

// Not-yet (scope guard) — these features must NOT exist; a test asserting their absence is optional but welcome:
//   g1: Does not send or generate customer invoices.
//   g2: Does not connect directly to bank accounts or accounting software.
//   g3: Does not run payroll or process payments.
//   g4: Does not forecast or project future financials automatically.
