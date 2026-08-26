# Design Sheet — internal dashboard based on our excel files with financials
_v7 · internal-dashboard, crud-saas_

## People
- **Owner** — Business owner who reviews the financial picture and makes decisions. `p1`
- **Bookkeeper** — Person who maintains the numbers and uploads the Excel files. `p2`
- **Manager** — Department lead who views figures for their own area. `p3`
- **Accountant** — External advisor who reviews period totals for tax and reporting. `p4`

## Things it keeps track of
- **Excel Upload** — A source spreadsheet imported to feed the dashboard. · fields: file name, period covered, uploaded by, upload date · e.g. Financials_2024_Q1.xlsx uploaded by Bookkeeper on Apr 2 `n1`
- **Account Line** — A single row from the spreadsheet tying a category to an amount. · fields: category name, amount, period, type (income/expense) · e.g. Office Rent, $3,200 expense, March 2024 `n2`
- **Category** — A grouping of income or expense lines. · fields: name, type, parent group · e.g. Marketing (expense) `n3`
- **Period** — A month, quarter, or year the figures belong to. · fields: label, start date, end date, status (open/closed) · e.g. Q1 2024, Jan 1 – Mar 31, closed `n4`
- **Revenue Figure** — Total income recorded for a period. · fields: period, amount, source upload · e.g. Q1 2024 revenue, $148,000 `n5`
- **Expense Figure** — Total spending recorded for a period. · fields: period, amount, category · e.g. Q1 2024 payroll, $62,000 `n6`
- **Profit Summary** — Revenue minus expenses for a period. · fields: period, revenue, expenses, net profit · e.g. Q1 2024, revenue $148,000, expenses $110,000, net $38,000 `n7`
- **Dashboard View** — A saved arrangement of charts and totals someone looks at. · fields: name, owner, filters, time range · e.g. Owner's Monthly Overview, last 12 months `n8`
- **User** — A person with access to the dashboard. · fields: name, role, email, areas allowed · e.g. Jane, Manager, jane@company.com, Marketing only `n9`

## What people do
- Bookkeeper **uploads** Excel Upload — e.g. Bookkeeper uploads Financials_2024_Q1.xlsx `a1`
- Bookkeeper **maps** Category — e.g. Bookkeeper maps 'Rent' column to Office Rent category `a2`
- Bookkeeper **corrects** Account Line — e.g. Bookkeeper fixes a mistyped $3,200 rent amount `a3`
- Owner **views** Profit Summary — e.g. Owner views Q1 2024 net profit of $38,000 `a4`
- Owner **opens** Dashboard View — e.g. Owner opens Monthly Overview `a5`
- Manager **views** Expense Figure — e.g. Manager views Marketing spend of $9,400 `a6`
- Owner **closes** Period — e.g. Owner closes Q1 2024 after review `a7`
- Accountant **reviews** Revenue Figure — e.g. Accountant reviews Q1 2024 revenue of $148,000 `a8`
- Bookkeeper **reopens** Period — e.g. Bookkeeper reopens Q1 to fix a figure `a9`
- Owner **saves** Dashboard View — e.g. Owner saves a new Cash Flow view `a10`
- Bookkeeper **creates** Category — e.g. Bookkeeper adds a 'Software' expense category `a11`
- Owner **invites** User — e.g. Owner invites Jane as a Manager `a12`

## What must never happen
- Only the Owner and Bookkeeper may upload or edit spreadsheets and figures; Managers and Accountants can only view. — e.g. Manager Jane cannot upload a new Excel file _(access)_ `r1`
- A Manager may only see figures for the areas assigned to them, not the whole company. — e.g. Marketing Manager sees Marketing expenses but not Payroll _(access)_ `r2`
- A period must be uploaded and mapped before its figures appear on any dashboard. — e.g. Q2 2024 shows no totals until its file is uploaded _(state)_ `r3`
- Once a period is closed, its figures cannot be edited unless it is reopened by the Owner. — e.g. Closed Q1 figures are locked from edits _(state)_ `r4`
- Profit Summary must always equal Revenue Figure minus Expense Figure for the same period. — e.g. $148,000 − $110,000 must show as $38,000 net _(integrity)_ `r5`
- Every Account Line must belong to exactly one Category and one Period. — e.g. A rent line cannot be left uncategorized _(integrity)_ `r6`
- All amounts are recorded in a single currency across all uploads. — e.g. A euro-denominated line is rejected or converted before import _(integrity)_ `r7`
- Re-uploading a file for a period replaces the prior figures rather than adding to them. — e.g. Uploading Q1 twice does not double revenue _(integrity)_ `r8`
- Only the Owner may invite users, assign roles, and change what areas a user can access; Bookkeepers, Managers, and Accountants cannot manage user accounts. _(access)_ `r9`
- Every upload, correction, and period close/reopen must be recorded with who did it and when, and this history cannot be altered. _(integrity)_ `r10`
- Each User must have a role and (for Managers) their allowed areas assigned when they are invited. _(integrity)_ `r11`
- A Category cannot be deleted while Account Lines are still assigned to it; the lines must be reassigned or removed first. _(integrity)_ `r12`
- An Excel Upload must have a file, a period covered, and an uploader recorded before it can be imported. _(integrity)_ `r13`
- Each Period label must be unique, so figures are never split across two records for the same month, quarter, or year. _(integrity)_ `r14`

## Not yet (out of scope for v1)
- Does not connect to bank accounts or pull transactions automatically. `g1`
- Does not generate or send invoices to customers. `g2`
- Does not file taxes or produce official accounting statements. `g3`
- Does not let external clients or the public log in. `g4`
- Does not handle payroll processing or payments. `g5`

## Decisions
- ≈ **who logs in**: Several people log in, possibly with different powers (95%) _[defaulted]_
- ≈ **who can do what**: An owner/admin plus staff with fewer powers (95%) _[defaulted]_
- ≈ **one business or many**: One business (ours) (95%) _[defaulted]_
- ≈ **adding people**: An admin invites them (95%) _[defaulted]_
- ≈ **signing in**: Email + password (54%) _[defaulted]_
- ≈ **simultaneous edits**: Rare; the last save wins (63%) _[defaulted]_
- ≈ **history**: A full, viewable history of every change (54%) _[defaulted]_
- ≈ **reaching people**: Email (79%) _[defaulted]_
- ≈ **connectivity**: Online only (99%) _[defaulted]_
- ≈ **where it runs**: In a browser, on desktop and phone (89%) _[defaulted]_
- ≈ **starting data**: Import from a spreadsheet/CSV once (95%) _[defaulted]_
- ≈ **getting data out**: Download lists as CSV/Excel (68%) _[defaulted]_
- ≈ **deleting**: It's archived and can be restored (82%) _[defaulted]_
- ≈ **volume**: Hundreds of records (60%) _[defaulted]_
- ≈ **languages & regions**: One language, one country (95%) _[defaulted]_
- ≈ **files**: Yes — upload and download (71%) _[defaulted]_
- ✓ **sign-off**: One approver _[resolved]_ — defaults_review
- ≈ **sensitive data**: Ordinary business data (97%) _[defaulted]_
- ≈ **keeping data**: Until someone deletes it (95%) _[defaulted]_ — because of x8
- ≈ **per-business customization**: No — everyone gets the same thing (69%) _[defaulted]_
- ≈ **overviews**: A dashboard with totals and counts (95%) _[defaulted]_
- ≈ **how things are grouped**: One shared pool — everything lives in one place with filters (97%) _[defaulted]_
- ≈ **who sees what**: Visible within the owner's team/department; admins see all (95%) _[defaulted]_
- ≈ **who can do what**: Only its owner/assignee and admins; others just view (95%) _[defaulted]_
- ≈ **fields**: Fixed — the same fields for everyone (81%) _[defaulted]_
- ≈ **automation**: No — people do everything by hand (60%) _[defaulted]_
- ≈ **data quality**: The app warns about likely duplicates and offers to merge (72%) _[defaulted]_
- ≈ **finding things**: Filter and sort within each list (62%) _[defaulted]_
- ≈ **re-upload replacement**: Keep prior version, switch active, allow rollback (36%) _[defaulted]_
- ≈ **closed-period edits (lifecycle-backwards)**: Owner reopens, changes logged (95%) _[defaulted]_
- ≈ **upload parse failure (partial-failure)**: Import valid rows, flag bad ones for fixing (62%) _[defaulted]_
- ≈ **unmapped category handling**: Block period from showing until all rows mapped (49%) _[defaulted]_
- ≈ **manager area scoping (permission-escalation)**: Only assigned categories; company totals hidden (61%) _[defaulted]_
- ≈ **negative and rounding (zero-negative-rounding)**: Cents precision, allow negatives (refunds/credits) (78%) _[defaulted]_
- ≈ **period boundary definition (time-boundaries)**: Fixed calendar months/quarters/years (60%) _[defaulted]_
- ✓ **currency validation (r7)**: Assume all files are in the org's configured currency _[resolved]_ — card:8747eba4-ca29-4c72-8829-90317a891964
