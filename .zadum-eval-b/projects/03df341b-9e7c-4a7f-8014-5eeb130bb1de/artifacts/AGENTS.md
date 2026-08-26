# Working on: internal dashboard based on our excel files with financials

⚠️ **`spec.md` did not pass its critic review** (verdict fail, score 5). Treat `design-sheet.md` as the only source of truth and ask before relying on a spec section; see `compile-report.json`.

This project has a one-page Design Sheet (`design-sheet.md`) — the source of truth — and a compiled specification (`spec.md`) for implementation detail.

Before any task:
1. Read `design-sheet.md` in full. It is one page and it is the contract: People, Nouns, Actions, Rules, Not-yet, Decisions.
2. Consult `spec.md` as REFERENCE when you need implementation detail (data model, lifecycles, acceptance scenarios, journeys). You do not need it in full before starting.

While working:
- Rules in the Sheet are inviolable. If a requested change would violate a rule, stop, cite the rule id, and ask.
- **Confirm-first protocol.** The decisions listed below are ASSUMPTIONS (confidence under 80%), not facts. If a requested task depends on one of them, your FIRST reply must be one short question confirming that decision with the owner — do not design or build on it until they answer. If the task touches none of them, proceed normally.
  Assumptions requiring confirmation (riskiest first):
  - x2: currently assumed "Only the Accountant can reopen it" (40% confidence)
  - x1: currently assumed "Reject the whole file until fixed" (45% confidence)
  - audit_trail: currently assumed "Just created/updated by whom and when" (53% confidence)
  - x5: currently assumed "Require reassigning them to another department" (41% confidence)
  - x8: currently assumed "Detect identical file and ask to confirm" (45% confidence)
  - x7: currently assumed "Owner can grant additional departments" (49% confidence)
  - notifications: currently assumed "Email" (54% confidence)
  - x3: currently assumed "Round to whole dollars for display" (55% confidence)
  - data_scale: currently assumed "Hundreds of records" (60% confidence)
  - identity_provider: currently assumed "Email + password" (45% confidence)
  - concurrency: currently assumed "Rare; the last save wins" (56% confidence)
  - customization: currently assumed "No — everyone gets the same thing" (72% confidence)
  - x6: currently assumed "Date-only in the business's single timezone" (63% confidence)
  - deletion: currently assumed "It's archived and can be restored" (76% confidence)
- Use the Glossary names exactly; never rename a concept.
- Respect the Not-yet list: do not build out-of-scope features unless the Sheet changes first.
- If a task changes the design (a new noun/action/rule/decision), update `design-sheet.md` FIRST (add a dated line under Decisions), then implement.
- `sheet-tests.ts` holds one named test stub per rule and action. Implement them as you build and KEEP the id-prefixed names — they are the Sheet's trace into the test suite. The spec's acceptance scenarios are the fuller test list.
