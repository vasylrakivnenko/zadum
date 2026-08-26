# Working on: invoicing app for our small bookkeeping firm that bills clients monthly

⚠️ **`spec.md` did not pass its critic review** (verdict fail, score 6). Treat `design-sheet.md` as the only source of truth and ask before relying on a spec section; see `compile-report.json`.

This project has a one-page Design Sheet (`design-sheet.md`) — the source of truth — and a compiled specification (`spec.md`) for implementation detail.

Before any task:
1. Read `design-sheet.md` in full. It is one page and it is the contract: People, Nouns, Actions, Rules, Not-yet, Decisions.
2. Consult `spec.md` as REFERENCE when you need implementation detail (data model, lifecycles, acceptance scenarios, journeys). You do not need it in full before starting.

While working:
- Rules in the Sheet are inviolable. If a requested change would violate a rule, stop, cite the rule id, and ask.
- **Confirm-first protocol.** The decisions listed below are ASSUMPTIONS (confidence under 80%), not facts. If a requested task depends on one of them, your FIRST reply must be one short question confirming that decision with the owner — do not design or build on it until they answer. If the task touches none of them, proceed normally.
  Assumptions requiring confirmation (riskiest first):
  - invoice_discounts: currently assumed "A single discount on the whole invoice" (48% confidence)
  - x7: currently assumed "Owner can grant temporary delegated rights" (50% confidence)
  - x2: currently assumed "Detect and ignore duplicates (idempotent)" (71% confidence)
  - x3: currently assumed "Round to cents; reject zero/negative line amounts" (65% confidence)
  - audit_trail: currently assumed "Just created/updated by whom and when" (65% confidence)
  - concurrency: currently assumed "Common; the app must prevent or merge conflicting edits" (51% confidence)
  - credit_note_numbering: currently assumed "They share the invoice number sequence" (55% confidence)
  - overdue_reminders: currently assumed "Someone sends a reminder by hand" (72% confidence)
  - credit_notes: currently assumed "Credit notes against invoices" (73% confidence)
  - late_fee_basis: currently assumed "A flat amount added once" (74% confidence)
  - invoice_po_reference: currently assumed "No — invoices don't track customer PO numbers" (64% confidence)
  - attachments: currently assumed "Yes — upload and download" (71% confidence)
  - late_fees: currently assumed "No" (72% confidence)
  - identity_provider: currently assumed "Email + password" (73% confidence)
  - data_export: currently assumed "Download lists as CSV/Excel" (77% confidence)
  - record_bulk_edit: currently assumed "Yes — select many and assign/move/tag/delete together" (73% confidence)
- Use the Glossary names exactly; never rename a concept.
- Respect the Not-yet list: do not build out-of-scope features unless the Sheet changes first.
- If a task changes the design (a new noun/action/rule/decision), update `design-sheet.md` FIRST (add a dated line under Decisions), then implement.
- `sheet-tests.ts` holds one named test stub per rule and action. Implement them as you build and KEEP the id-prefixed names — they are the Sheet's trace into the test suite. The spec's acceptance scenarios are the fuller test list.
