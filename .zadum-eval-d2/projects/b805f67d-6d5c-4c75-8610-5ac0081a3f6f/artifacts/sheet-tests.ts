// Generated from Design Sheet v5 (invoicing app for our small bookkeeping firm that bills clients monthly).
// Do not rename tests: the "r…:"/"a…:" prefixes are the Sheet's stable rule/action ids — they are how
// reviews trace test coverage back to the Sheet. Implement each todo against the real app; a rule test
// must FAIL if the rule can be violated.
import { describe, it } from "vitest";

describe("Design Sheet rules (inviolable)", () => {
  it.todo("r1 (integrity): Every invoice must have a unique, sequential invoice number.");
  it.todo("r2 (state): An invoice cannot be sent until it has at least one line item with an amount.");
  it.todo("r3 (integrity): Recorded payments for an invoice may never exceed the invoice total.");
  it.todo("r4 (state): A paid invoice cannot be edited; it must be voided and reissued instead.");
  it.todo("r5 (access): Only the Firm Owner may void an invoice.");
  it.todo("r6 (access): Only the Firm Owner may change a client's monthly rate.");
  it.todo("r7 (state): An invoice is marked paid only when payments equal the full amount.");
  it.todo("r8 (integrity): Each invoice must be tied to exactly one client.");
  it.todo("r9 (state): Once an invoice has been sent to a client it cannot revert to draft status; corrections require voiding and reissuing.");
  it.todo("r10 (state): A partial payment moves an invoice to a 'partially paid' state rather than paid, and it becomes fully paid only when payments total the invoice amount.");
  it.todo("r11 (state): A sent invoice whose due date has passed without full payment is flagged as overdue.");
  it.todo("r12 (integrity): Voiding an invoice never deletes it; the record and its number are retained for the audit trail.");
  it.todo("r5 negative: the forbidden path is actually blocked — attempt it and assert denial");
  it.todo("r6 negative: the forbidden path is actually blocked — attempt it and assert denial");
});

describe("Actions (happy paths)", () => {
  it.todo("a1: Bookkeeper creates Invoice — e.g. Bookkeeper creates Invoice #1042 for Acme Landscaping on Mar 1");
  it.todo("a2: Bookkeeper adds Line Item — e.g. Bookkeeper adds 'Monthly bookkeeping $450' to Invoice #1042");
  it.todo("a3: Bookkeeper sends Invoice — e.g. Bookkeeper emails Invoice #1042 to billing@acme.com");
  it.todo("a4: Bookkeeper records Payment — e.g. Bookkeeper records $450 payment for Invoice #1042 on Mar 12");
  it.todo("a5: Bookkeeper marks paid Invoice — e.g. Bookkeeper marks Invoice #1042 paid after full payment");
  it.todo("a6: Bookkeeper adds Client — e.g. Bookkeeper adds Acme Landscaping with a $450 monthly rate");
  it.todo("a7: Firm Owner sets Service — e.g. Firm Owner sets 'Monthly bookkeeping' rate to $450");
  it.todo("a8: Firm Owner reviews Statement — e.g. Firm Owner reviews Acme's Q1 statement showing $0 balance");
  it.todo("a9: Firm Owner voids Invoice — e.g. Firm Owner voids Invoice #1039 created in error");
  it.todo("a10: Bookkeeper generates Statement — e.g. Bookkeeper generates a Q1 statement for Acme Landscaping");
  it.todo("a11: Client receives Invoice — e.g. Client receives Invoice #1042 by email");
});

// Not-yet (scope guard) — these features must NOT exist; a test asserting their absence is optional but welcome:
//   g1: No online payment processing or card collection; clients pay by their own method.
//   g2: No client login or self-service portal in the first version.
//   g3: No payroll, expense tracking, or general accounting features.
//   g4: No automatic tax calculation or filing.
//   g5: No automated recurring billing; invoices are created by staff each month.
