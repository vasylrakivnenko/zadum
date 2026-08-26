# Working on: internal dashboard based on our excel files with financials

⚠️ **`spec.md` did not pass its critic review** (verdict fail, score 6.5). Treat `design-sheet.md` as the only source of truth and ask before relying on a spec section; see `compile-report.json`.

This project has a one-page Design Sheet (`design-sheet.md`) — the source of truth — and a compiled specification (`spec.md`) for implementation detail.

Before any task:
1. Read `design-sheet.md` in full. It is one page and it is the contract: People, Nouns, Actions, Rules, Not-yet, Decisions.
2. Consult `spec.md` as REFERENCE when you need implementation detail (data model, lifecycles, acceptance scenarios, journeys). You do not need it in full before starting.

While working:
- Rules in the Sheet are inviolable. If a requested change would violate a rule, stop, cite the rule id, and ask.
- **Confirm-first protocol.** The decisions listed below are ASSUMPTIONS (confidence under 80%), not facts. If a requested task depends on one of them, your FIRST reply must be one short question confirming that decision with the owner — do not design or build on it until they answer. If the task touches none of them, proceed normally.
  Assumptions requiring confirmation (riskiest first):
  - x1: currently assumed "Keep prior version, switch active, allow rollback" (36% confidence)
  - x4: currently assumed "Block period from showing until all rows mapped" (49% confidence)
  - audit_trail: currently assumed "A full, viewable history of every change" (54% confidence)
  - x5: currently assumed "Only assigned categories; company totals hidden" (61% confidence)
  - x3: currently assumed "Import valid rows, flag bad ones for fixing" (62% confidence)
  - x7: currently assumed "Fixed calendar months/quarters/years" (60% confidence)
  - data_scale: currently assumed "Hundreds of records" (60% confidence)
  - customization: currently assumed "No — everyone gets the same thing" (69% confidence)
  - identity_provider: currently assumed "Email + password" (54% confidence)
  - record_automation: currently assumed "No — people do everything by hand" (60% confidence)
  - concurrency: currently assumed "Rare; the last save wins" (63% confidence)
  - x6: currently assumed "Cents precision, allow negatives (refunds/credits)" (78% confidence)
  - data_export: currently assumed "Download lists as CSV/Excel" (68% confidence)
  - notifications: currently assumed "Email" (79% confidence)
  - attachments: currently assumed "Yes — upload and download" (71% confidence)
  - record_search: currently assumed "Filter and sort within each list" (62% confidence)
  - record_duplicates: currently assumed "The app warns about likely duplicates and offers to merge" (72% confidence)
- Use the Glossary names exactly; never rename a concept.
- Respect the Not-yet list: do not build out-of-scope features unless the Sheet changes first.
- If a task changes the design (a new noun/action/rule/decision), update `design-sheet.md` FIRST (add a dated line under Decisions), then implement.
- `sheet-tests.ts` holds one named test stub per rule and action. Implement them as you build and KEEP the id-prefixed names — they are the Sheet's trace into the test suite. The spec's acceptance scenarios are the fuller test list.
