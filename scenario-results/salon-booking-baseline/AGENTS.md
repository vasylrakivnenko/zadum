# Working on: booking system for my hair salon so clients can book online instead of calling

⚠️ **`spec.md` did not pass its critic review** (verdict fail, score 6). Treat `design-sheet.md` as the only source of truth and ask before relying on a spec section; see `compile-report.json`.

This project has a one-page Design Sheet (`design-sheet.md`) — the source of truth — and a compiled specification (`spec.md`) for implementation detail.

Before any task:
1. Read `design-sheet.md` in full. It is one page and it is the contract: People, Nouns, Actions, Rules, Not-yet, Decisions.
2. Consult `spec.md` as REFERENCE when you need implementation detail (data model, lifecycles, acceptance scenarios, journeys). You do not need it in full before starting.

While working:
- Rules in the Sheet are inviolable. If a requested change would violate a rule, stop, cite the rule id, and ask.
- **Confirm-first protocol.** The decisions listed below are ASSUMPTIONS (confidence under 80%), not facts. If a requested task depends on one of them, your FIRST reply must be one short question confirming that decision with the owner — do not design or build on it until they answer. If the task touches none of them, proceed normally.
  Assumptions requiring confirmation (riskiest first):
  - platform: currently assumed "In a browser, mostly on phones" (62% confidence)
  - compliance_sensitivity: currently assumed "Personal data needing consent/retention care (GDPR-like)" (64% confidence)
  - booking_intake_form: currently assumed "Just name and contact details" (53% confidence)
  - data_scale: currently assumed "Tens of thousands" (55% confidence)
  - booking_waitlist: currently assumed "They join a waitlist and staff call them if something opens" (61% confidence)
  - audit_trail: currently assumed "Just created/updated by whom and when" (64% confidence)
  - booking_pricing_variation: currently assumed "One price per service" (64% confidence)
  - booking_recurring: currently assumed "No — each booking is made separately" (65% confidence)
  - attachments: currently assumed "No" (53% confidence)
  - booking_buffers: currently assumed "A fixed gap after every booking" (56% confidence)
  - booking_no_show: currently assumed "No-shows are counted and repeat offenders must prepay or are blocked" (73% confidence)
  - retention: currently assumed "Until someone deletes it" (64% confidence)
  - data_import: currently assumed "Import from a spreadsheet/CSV once" (77% confidence)
  - customization: currently assumed "Branding and templates (logo, colors, wording)" (79% confidence)
  - x7: currently assumed "Booking stands; reminder retried/flagged" (71% confidence)
- Use the Glossary names exactly; never rename a concept.
- Respect the Not-yet list: do not build out-of-scope features unless the Sheet changes first.
- If a task changes the design (a new noun/action/rule/decision), update `design-sheet.md` FIRST (add a dated line under Decisions), then implement.
- `sheet-tests.ts` holds one named test stub per rule and action. Implement them as you build and KEEP the id-prefixed names — they are the Sheet's trace into the test suite. The spec's acceptance scenarios are the fuller test list.
