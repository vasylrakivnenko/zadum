# Design Sheet — internal dashboard based on our excel files with financials
_v7 · internal-dashboard_

## People
- **Owner** — Business owner who reviews overall financial health and trends. `p1`
- **Bookkeeper** — Maintains the source spreadsheets and updates monthly figures. `p2`
- **Manager** — Department lead who views budgets and actuals for their area. `p3`
- **Accountant** — External advisor who reviews numbers at period close. `p4`

## Things it keeps track of
- **Monthly Financials** — A month's summary of income, expenses, and profit pulled from the spreadsheet. · fields: month, total income, total expenses, net profit · e.g. March 2024: income $84,200, expenses $61,500, net profit $22,700 `n1`
- **Revenue Line** — A single income category for a period. · fields: category, month, amount · e.g. Product Sales, March 2024, $58,000 `n2`
- **Expense Line** — A single cost category for a period. · fields: category, month, amount, vendor · e.g. Rent, March 2024, $8,500, Landlord LLC `n3`
- **Budget** — Planned amount for a category over a period. · fields: category, period, planned amount · e.g. Marketing budget Q1 2024, $15,000 `n4`
- **Department** — A part of the business that owns certain budgets and costs. · fields: name, manager, cost center code · e.g. Sales, managed by J. Rivera, CC-200 `n5`
- **Cash Balance** — Running cash position as of a date. · fields: date, account, balance · e.g. Operating Account, Mar 31 2024, $142,300 `n6`
- **KPI** — A tracked metric shown on the dashboard. · fields: name, value, target, period · e.g. Gross Margin, 27%, target 30%, March 2024 `n7`
- **Spreadsheet Import** — A record of an uploaded Excel file and when it was loaded. · fields: file name, upload date, month covered, uploaded by · e.g. financials_Mar2024.xlsx, uploaded Apr 2 by Bookkeeper `n8`

## What people do
- Bookkeeper **uploads** Spreadsheet Import — e.g. Bookkeeper uploads financials_Mar2024.xlsx on Apr 2 `a1`
- Bookkeeper **updates** Revenue Line — e.g. Bookkeeper corrects Product Sales to $58,000 `a2`
- Bookkeeper **updates** Expense Line — e.g. Bookkeeper adds Rent expense of $8,500 `a3`
- Bookkeeper **enters** Cash Balance — e.g. Bookkeeper records $142,300 as of Mar 31 `a4`
- Owner **views** Monthly Financials — e.g. Owner opens March 2024 summary `a5`
- Owner **reviews** KPI — e.g. Owner checks gross margin against target `a6`
- Manager **views** Budget — e.g. Manager reviews Marketing budget vs actuals `a7`
- Manager **views** Department — e.g. Manager opens Sales department costs `a8`
- Owner **sets** Budget — e.g. Owner sets Q2 Marketing budget to $16,000 `a9`
- Accountant **reviews** Monthly Financials — e.g. Accountant reviews March figures at close `a10`
- Accountant **exports** Monthly Financials — e.g. Accountant downloads March summary as Excel `a11`
- Owner **compares** KPI — e.g. Owner compares gross margin across quarters `a12`

## What must never happen
- Only the Owner and Bookkeeper may upload or edit spreadsheet figures; Managers and Accountant see read-only views. — e.g. A Manager cannot change an Expense Line amount. _(access)_ `r1`
- Each Manager may only view budgets and costs for their own Department. — e.g. The Sales manager cannot open Operations department costs. _(access)_ `r2`
- A month's financials cannot be finalized until income and expense lines are both present. — e.g. March cannot close while expenses are blank. _(state)_ `r3`
- Net profit must always equal total income minus total expenses for the same month. — e.g. March net profit shows $22,700 = $84,200 - $61,500. _(integrity)_ `r4`
- Uploading a new spreadsheet for an already-loaded month replaces the prior figures and keeps a record of both uploads. — e.g. Re-uploading March keeps the Apr 2 and Apr 5 import records. _(integrity)_ `r5`
- All amounts are shown in a single currency (USD) and no mixed currencies are allowed. — e.g. A EUR figure would be rejected on import. _(integrity)_ `r6`
- Historical months cannot be edited once the Accountant marks them reviewed. — e.g. Once March is reviewed, its lines lock. _(state)_ `r7`
- There may be only one Monthly Financials record per calendar month, and each Spreadsheet Import must carry a unique file name and month-covered identifier. _(integrity)_ `r8`
- Every upload, figure edit, budget change, and review action is recorded with who did it and when, and these records cannot be altered or deleted. _(integrity)_ `r9`
- Every Revenue Line, Expense Line, and Budget must reference a valid existing month/period and (where applicable) an existing Department; no orphaned lines are allowed. _(integrity)_ `r10`
- Required fields (month, category, and amount) must be provided before a Revenue Line, Expense Line, or Cash Balance is saved. _(integrity)_ `r11`
- Users interact with financial figures only through the dashboard; direct access to the underlying spreadsheets or data store is not permitted. _(access)_ `r12`
- A Department cannot be deleted while it still has linked Budgets or Expense Lines assigned to it. _(state)_ `r13`

## Not yet (out of scope for v1)
- Does not send or generate customer invoices. `g1`
- Does not connect directly to bank accounts or accounting software. `g2`
- Does not run payroll or process payments. `g3`
- Does not forecast or project future financials automatically. `g4`

## Decisions
- ≈ **who logs in**: Several people log in, possibly with different powers (95%) _[defaulted]_
- ≈ **who can do what**: An owner/admin plus staff with fewer powers (95%) _[defaulted]_
- ≈ **outside parties**: No — outsiders only receive emails/PDFs/messages (95%) _[defaulted]_
- ≈ **one business or many**: One business (ours) (95%) _[defaulted]_
- ≈ **adding people**: An admin invites them (96%) _[defaulted]_
- ≈ **signing in**: Email + password (45%) _[defaulted]_
- ≈ **simultaneous edits**: Rare; the last save wins (56%) _[defaulted]_
- ≈ **history**: Just created/updated by whom and when (53%) _[defaulted]_
- ≈ **reaching people**: Email (54%) _[defaulted]_
- ≈ **connectivity**: Online only (99%) _[defaulted]_
- ≈ **where it runs**: In a browser, on desktop and phone (81%) _[defaulted]_
- ≈ **starting data**: Import from a spreadsheet/CSV once (95%) _[defaulted]_
- ≈ **getting data out**: Download lists as CSV/Excel (95%) _[defaulted]_
- ≈ **deleting**: It's archived and can be restored (76%) _[defaulted]_
- ≈ **volume**: Hundreds of records (60%) _[defaulted]_
- ≈ **other tools**: No (95%) _[defaulted]_
- ≈ **languages & regions**: One language, one country (95%) _[defaulted]_
- ✓ **sign-off**: One approver _[resolved]_ — defaults_review
- ✓ **automation**: Records get created automatically (recurring invoices, appointments, reports) _[resolved]_ — defaults_review
- ≈ **sensitive data**: Ordinary business data (97%) _[defaulted]_
- ≈ **keeping data**: Until someone deletes it (97%) _[defaulted]_
- ≈ **per-business customization**: No — everyone gets the same thing (72%) _[defaulted]_
- ≈ **overviews**: A dashboard with totals and counts (95%) _[defaulted]_
- ≈ **partial-failure**: Reject the whole file until fixed (45%) _[defaulted]_
- ≈ **lifecycle-backwards**: Only the Accountant can reopen it (40%) _[defaulted]_
- ≈ **zero-negative-rounding**: Round to whole dollars for display (55%) _[defaulted]_
- ✓ **concurrent-edits**: Last save wins _[resolved]_ — card:3cc4b90d-9418-4980-a96c-72de5a8ae4a7
- ≈ **deletion-with-dependents**: Require reassigning them to another department (41%) _[defaulted]_
- ≈ **time-boundaries**: Date-only in the business's single timezone (63%) _[defaulted]_
- ≈ **permission-escalation**: Owner can grant additional departments (49%) _[defaulted]_
- ≈ **duplicate-submission**: Detect identical file and ask to confirm (45%) _[defaulted]_
