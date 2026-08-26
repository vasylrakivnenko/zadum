> ⚠️ **NOT DELIVERABLE — 1 gate(s) failed.** the critic returned fail (score 5).
>
> The Design Sheet (`design-sheet.md`) remains the source of truth. Fix these and recompile; do not resolve a contradiction by choosing one side of it.

> ⚠️ **DRAFT — THIS SPEC DID NOT PASS REVIEW.** The critic returned `fail` (score 5) after 9 violation(s) and 1 omission(s) survived the repair pass.
>
> Do not treat it as the source of truth. The Design Sheet (`design-sheet.md`) still is; fix the findings below (full list in `compile-report.json`) and recompile.
>
> - r8 (high) at "Spreadsheet Import → 'Identifiers / uniqueness': "the business key is (`file_name`, `month_covered`, `upload_date`), which lets a confirmed identical-file re-import be retained as a distinct row without colliding on (`file_name`, `month_covered`)"": Sheet r8 states each Spreadsheet Import "must carry a unique file name and month-covered identifier." The spec silently redefines uniqueness to include the surrogate id/upload_date so two imports may share the same file_name and month_covered — directly weakening the Sheet rule the spec claims to implement (R-8 even says "Two imports may share the same file name and month covered").
> - r5 × r8 (high) at "R-5 test ("upload the same file name for the same month twice ... assert two Spreadsheet Import rows both persist") vs R-8 ("each Spreadsheet Import is uniquely identified by ... file_name, month_covered")": r5 (with x8) requires retaining BOTH import rows when the identical file is re-uploaded for the same month; r8 forbids two imports sharing file_name+month_covered. As literally stated in the Sheet, obeying r5 forces breaking r8 — neither is satisfiable for an identical re-upload. The spec masks this only by adding a surrogate key not present in r8.
> - r5 × r8 (high) at "R-8 Test sketch: "upload the same file name for the same month twice (after the R-D9 confirmation) → assert two Spreadsheet Import rows with distinct id both persist."": R-8's own verification test requires creating two imports with the same file_name and month_covered, which is exactly what r8 (as worded in the Sheet) forbids. The test cannot be executed while r8's stated uniqueness holds, making r8 unverifiable.

# Specification — internal dashboard based on our excel files with financials

_Compiled from Design Sheet v7 (internal-dashboard). Trace markers ⟨src: …⟩ point at the Sheet items and decisions each line derives from: d: decision, r: rule, a: action, n: noun, p: actor, g: non-goal._

**How to use this spec:** the Design Sheet (design-sheet.md) is the source of truth; this spec is derived from it. Rules are inviolable. If a task would violate one, stop and cite it. If a task changes the design, update the Sheet first.

## Overview

An internal financial dashboard that turns the business's monthly Excel files into reviewable summaries, budgets, KPIs, and cash position. ⟨src: d:reporting⟩ It is built for one business only, with all figures held in a single organisation's workspace. ⟨src: d:tenancy⟩

### Who it is for

Four internal actors sign in with different powers: the Owner reviews overall financial health and sets budgets ⟨src: p:p1⟩, the Bookkeeper maintains source spreadsheets and updates monthly figures ⟨src: p:p2⟩, a Manager views budgets and actuals for their own department ⟨src: p:p3⟩, and the external Accountant reviews numbers at period close. ⟨src: p:p4⟩ Access is account-based with an owner/admin plus staff who have fewer powers; there is no external customer-facing access. ⟨src: d:user_accounts⟩ ⟨src: d:roles⟩ ⟨src: d:external_access⟩ Additional people are added only when an admin invites them, signing in with email and password (default). ⟨src: d:invite_flow⟩ ⟨src: d:identity_provider⟩

### Core value loop

1. The Bookkeeper uploads a month's Excel file as a Spreadsheet Import. ⟨src: a:a1⟩ ⟨src: n:n8⟩
2. The import populates that month's Revenue Lines, Expense Lines, and Cash Balance, which the Bookkeeper may correct or enter directly. ⟨src: a:a2⟩ ⟨src: a:a3⟩ ⟨src: a:a4⟩ ⟨src: n:n2⟩ ⟨src: n:n3⟩ ⟨src: n:n6⟩
3. The system rolls the lines into one Monthly Financials summary of total income, total expenses, and net profit. ⟨src: n:n1⟩ ⟨src: r:r4⟩
4. The Owner reviews Monthly Financials and KPIs against targets and compares them across periods, and sets budgets per department. ⟨src: a:a5⟩ ⟨src: a:a6⟩ ⟨src: a:a12⟩ ⟨src: a:a9⟩ ⟨src: n:n7⟩ ⟨src: n:n4⟩
5. Each Manager views the budgets and department costs for their own area only. ⟨src: a:a7⟩ ⟨src: a:a8⟩ ⟨src: n:n5⟩ ⟨src: r:r2⟩
6. At period close the Accountant reviews the month, marks it reviewed to lock the figures, and can export the summary as Excel. ⟨src: a:a10⟩ ⟨src: r:r7⟩ ⟨src: a:a11⟩ ⟨src: d:data_export⟩

All amounts are held and shown in a single currency, USD, with no mixed currencies. ⟨src: r:r6⟩ ⟨src: d:localization⟩

### Platform, scale, and tenancy

The app runs in a web browser on desktop and phone, online only. ⟨src: d:platform⟩ ⟨src: d:offline⟩ It serves a single business; there is no separation of multiple organisations' data. ⟨src: d:tenancy⟩ Expected data volume is small — on the order of hundreds of records (default). ⟨src: d:data_scale⟩ It holds ordinary business data with no special legal handling, and records are kept until someone deletes them (default). ⟨src: d:compliance_sensitivity⟩ ⟨src: d:retention⟩ Deletion is soft: a deleted record is archived and can be restored. ⟨src: d:deletion⟩ The app does not connect to any external tools; all data enters via spreadsheet import and leaves via Excel/CSV export. ⟨src: d:integrations⟩ ⟨src: d:data_import⟩ ⟨src: d:data_export⟩ Users interact with figures only through the dashboard, never the underlying spreadsheets or data store directly. ⟨src: r:r12⟩

### Out of scope (v1)

This version does not send or generate customer invoices ⟨src: g:g1⟩, does not connect directly to bank accounts or accounting software ⟨src: g:g2⟩, does not run payroll or process payments ⟨src: g:g3⟩, and does not forecast or project future financials automatically. ⟨src: g:g4⟩

## Actors & permissions

The four actors below are the only account holders; all sign in with email + password and belong to the single business tenant. ⟨src: d:user_accounts, d:identity_provider, d:tenancy⟩ Columns are actors; every row is an action performed somewhere in this spec. Cells are exactly `✓` (allowed), `✗` (not allowed), or `✓*n` (allowed only under numbered condition *n*). ⟨src: default⟩

### Permissions matrix

| Action | Owner (p1) | Bookkeeper (p2) | Manager (p3) | Accountant (p4) |
|---|---|---|---|---|
| Upload Spreadsheet Import (a1) | ✓ | ✓ | ✗ | ✗ |
| Confirm or cancel a duplicate-upload prompt (x8) | ✓*2 | ✓*2 | ✗ | ✗ |
| Update Revenue Line (a2) | ✓*3 | ✓*3 | ✗ | ✗ |
| Update Expense Line (a3) | ✓*3 | ✓*3 | ✗ | ✗ |
| Enter Cash Balance (a4) | ✓*3 | ✓*3 | ✗ | ✗ |
| Finalize month | ✓*3 | ✓*3 | ✗ | ✗ |
| Mark month reviewed | ✗ | ✗ | ✗ | ✓ |
| Reopen a reviewed month (x2) | ✗ | ✗ | ✗ | ✓ |
| Archive Revenue/Expense/Budget line | ✓*3 | ✓*3 | ✗ | ✗ |
| Restore an archived record | ✓ | ✗ | ✗ | ✗ |
| Reassign Budget/Expense Line to another Department (x5) | ✓*4 | ✗ | ✗ | ✗ |
| Archive Department (x5) | ✓*4 | ✗ | ✗ | ✗ |
| Grant a Manager access to an additional Department (x7) | ✓ | ✗ | ✗ | ✗ |
| Propose Budget creation/change (a9) | ✓ | ✓ | ✗ | ✗ |
| Approve Budget creation/change (single approver) | ✓ | ✗ | ✗ | ✗ |
| View Monthly Financials (a5) | ✓ | ✓ | ✗ | ✓ |
| Review Monthly Financials (a10) | ✓ | ✓ | ✗ | ✓ |
| Export Monthly Financials (a11) | ✓ | ✓ | ✗ | ✓ |
| Review KPI (a6) | ✓ | ✓ | ✗ | ✓ |
| Compare KPI across periods (a12) | ✓ | ✓ | ✗ | ✓ |
| View Budget (a7) | ✓ | ✓ | ✓*1 | ✓ |
| View Department (a8) | ✓ | ✓ | ✓*1 | ✓ |
| View audit trail | ✓ | ✗ | ✗ | ✗ |
| Generate scheduled records | ✗ | ✗ | ✗ | ✗ |

### Conditional notes

1. A Manager may view a Budget or Department only for their own Department plus any additional Department the Owner has explicitly granted them; all other Departments are hidden. ⟨src: r2, x7⟩
2. Only the user who initiated that specific upload (the Owner or Bookkeeper who clicked upload) may confirm or cancel its duplicate-detection prompt. ⟨src: x8, r1⟩
3. Allowed only while the target month is in `draft`; once the Accountant has marked the month reviewed the figures are locked and the action is refused until the Accountant reopens the month. ⟨src: r7, x2⟩
4. Reassignment and Department archival edit a line's `department_id`; when any affected Expense Line belongs to a reviewed month, the Accountant must reopen that month first, after which the Owner performs the reassignment and re-review follows. ⟨src: r13, x5, r7, x2⟩

The `Generate scheduled records` row is `✗` for every human actor because it is executed automatically by the system on its schedule, not initiated by any role. ⟨src: d:recurring_scheduled⟩ Budget changes take effect only after the Owner — the single approver — approves them; the Owner may both propose and approve in one act. ⟨src: d:approval_workflow, a9⟩

### Data-visibility boundaries

- **Owner (p1)** sees and may act on every Monthly Financials, Revenue Line, Expense Line, Budget, Department, Cash Balance, KPI, and Spreadsheet Import across the whole business, and is the only actor who may view the audit trail, restore archived records, grant Department access, and approve Budgets. ⟨src: p1, r1, r9⟩
- **Bookkeeper (p2)** may read and write all financial figures (Spreadsheet Imports, Revenue Lines, Expense Lines, Cash Balances) and read all Monthly Financials, KPIs, Budgets, and Departments org-wide, but may not mark months reviewed, reopen months, approve Budgets, restore records, or view the audit trail. ⟨src: p2, r1⟩
- **Manager (p3)** sees only Budgets and Departments (with their linked Expense Lines) for their own Department and any Owner-granted Department; org-wide Monthly Financials, KPIs, Cash Balances, and every other Department are hidden, and the Manager may not edit any figure. ⟨src: p3, r1, r2, x7⟩
- **Accountant (p4)** has read-only access to all Monthly Financials, KPIs, Budgets, and Departments and may export Monthly Financials, but may not upload, edit, or delete figures; the Accountant's only state-changing powers are marking a month reviewed and reopening a reviewed month. ⟨src: p4, r1, r7, x2, a11⟩
- No actor reaches figures except through the dashboard; direct access to the underlying spreadsheets or data store is denied to all four roles. ⟨src: r12⟩

These boundaries match the matrix cell for cell: any row showing `✗` for a role denies that action entirely, and every `✓*1` reflects the Manager's Department-scoped visibility above. ⟨src: r2, r1⟩

## Data model

### Conventions

All monetary fields are stored in USD only; any non-USD value is rejected on import and on manual save ⟨src: r:r6, d:localization⟩. Amounts are stored to the cent as positive magnitudes; the only signed value is a computed `net_profit` (and any negative `balance`), which may be negative ⟨src: r:r6, d:x3⟩. Displayed figures are rounded to whole dollars; stored figures keep exact cents ⟨src: d:x3⟩. All entities carry basic audit fields `created_by`, `created_at`, `updated_by`, `updated_at` ⟨src: d:audit_trail, r:r9⟩. Deletion is soft: entities carry an `archived` boolean and an `archived_at` timestamp, and archived rows are excluded from all active dashboard views ⟨src: d:deletion⟩. Concurrent edits to the same row resolve last-write-wins with no conflict warning ⟨src: d:x4, d:concurrency⟩.

### Monthly Financials (n1)

| Field | Type | Required | Notes |
|---|---|---|---|
| id | UUID | yes | Surrogate primary key ⟨src: default⟩ |
| month | Month (YYYY-MM) | yes | Business identifier; exactly one record per calendar month ⟨src: n:n1, r:r8⟩ |
| total_income | Money USD | derived | Sum of `amount` over all non-archived Revenue Lines with the same `month` ⟨src: r:r4, d:deletion⟩ |
| total_expenses | Money USD | derived | Sum of `amount` over all non-archived Expense Lines with the same `month` ⟨src: r:r4, d:deletion⟩ |
| net_profit | Money USD (signed) | derived | `net_profit = total_income − total_expenses`; may be negative and is stored/shown as a negative number ⟨src: r:r4, d:x3⟩ |
| status | Enum: draft, finalized, reviewed | yes | Lifecycle state; see state machine ⟨src: r:r3, r:r7⟩ |
| archived | Boolean | yes | Soft-delete flag ⟨src: d:deletion⟩ |

Archived Revenue Lines and Expense Lines are excluded from `total_income` and `total_expenses`, so archiving a line changes both totals and `net_profit` deterministically ⟨src: r:r4, d:deletion⟩. A draft Monthly Financials record is auto-generated for each new calendar month so figures can be attached to it ⟨src: d:recurring_scheduled, default⟩.

**Identifiers / uniqueness:** `month` is unique across all Monthly Financials records ⟨src: r:r8⟩.

### Revenue Line (n2)

| Field | Type | Required | Notes |
|---|---|---|---|
| id | UUID | yes | Surrogate primary key ⟨src: default⟩ |
| category | Text | yes | Income category label ⟨src: n:n2, r:r11⟩ |
| month | Month (YYYY-MM) | yes | Must reference an existing Monthly Financials.month; no orphans ⟨src: r:r10, r:r11⟩ |
| amount | Money USD | yes | Stored positive ⟨src: n:n2, r:r11, d:x3⟩ |
| archived | Boolean | yes | Soft-delete flag ⟨src: d:deletion⟩ |

**Relationships:** many Revenue Lines belong to one Monthly Financials via `month` ⟨src: r:r10⟩.

**Identifiers / uniqueness:** one Revenue Line per (`category`, `month`) ⟨src: default⟩.

### Expense Line (n3)

| Field | Type | Required | Notes |
|---|---|---|---|
| id | UUID | yes | Surrogate primary key ⟨src: default⟩ |
| category | Text | yes | Cost category label ⟨src: n:n3, r:r11⟩ |
| month | Month (YYYY-MM) | yes | Must reference an existing Monthly Financials.month; no orphans ⟨src: r:r10, r:r11⟩ |
| amount | Money USD | yes | Stored positive ⟨src: n:n3, r:r11, d:x3⟩ |
| vendor | Text | no | Optional supplier name ⟨src: n:n3⟩ |
| department_id | UUID (FK Department) | yes | Must reference an existing Department; no orphans ⟨src: n:n3, r:r10, r:r2⟩ |
| archived | Boolean | yes | Soft-delete flag ⟨src: d:deletion⟩ |

**Relationships:** many Expense Lines belong to one Monthly Financials via `month` and to one Department via `department_id` ⟨src: r:r10, r:r13⟩.

**Identifiers / uniqueness:** one Expense Line per (`category`, `month`, `department_id`) ⟨src: default⟩.

### Budget (n4)

| Field | Type | Required | Notes |
|---|---|---|---|
| id | UUID | yes | Surrogate primary key ⟨src: default⟩ |
| category | Text | yes | Budgeted category label ⟨src: n:n4⟩ |
| period | Text (e.g. Q1 2024 or YYYY-MM) | yes | Planning period; must be a valid existing period ⟨src: n:n4, r:r10⟩ |
| planned_amount | Money USD | yes | Stored positive ⟨src: n:n4, d:x3⟩ |
| department_id | UUID (FK Department) | yes | Must reference an existing Department; no orphans ⟨src: n:n4, r:r10, r:r2⟩ |
| archived | Boolean | yes | Soft-delete flag ⟨src: d:deletion⟩ |

**Relationships:** many Budgets belong to one Department via `department_id` ⟨src: r:r13, r:r2⟩.

### Department (n5)

| Field | Type | Required | Notes |
|---|---|---|---|
| id | UUID | yes | Surrogate primary key ⟨src: default⟩ |
| name | Text | yes | Unique department name ⟨src: n:n5⟩ |
| manager_id | UUID (FK User) | yes | The Manager who may view this Department ⟨src: n:n5, r:r2⟩ |
| cost_center_code | Text | yes | Unique cost-center code (e.g. CC-200) ⟨src: n:n5⟩ |
| archived | Boolean | yes | Soft-delete flag ⟨src: d:deletion⟩ |

**Relationships:** one Department has many Budgets and many Expense Lines ⟨src: r:r13⟩. The Owner may additionally grant a Manager view access to Departments beyond their own ⟨src: d:x7, r:r2⟩.

**Identifiers / uniqueness:** `name` unique; `cost_center_code` unique ⟨src: n:n5⟩.

**Archive guard:** a Department cannot be archived while any non-archived Budget or Expense Line references it; those lines must first be reassigned to another Department ⟨src: r:r13, d:x5⟩. If any such Expense Line belongs to a `reviewed` month, the Accountant must reopen that month before reassignment, because reassigning `department_id` is a figure edit blocked by the review lock ⟨src: r:r7, r:r13, d:x2⟩.

### Cash Balance (n6)

| Field | Type | Required | Notes |
|---|---|---|---|
| id | UUID | yes | Surrogate primary key ⟨src: default⟩ |
| as_of_date | Date (date-only, business timezone) | yes | No time-of-day component ⟨src: n:n6, d:x6, r:r11⟩ |
| account | Text | yes | Account name (e.g. Operating Account) ⟨src: n:n6, r:r11⟩ |
| balance | Money USD (signed) | yes | Running cash position; may be negative ⟨src: n:n6, r:r11, d:x3⟩ |
| archived | Boolean | yes | Soft-delete flag ⟨src: d:deletion⟩ |

**Month attribution:** a Cash Balance is attributed to the calendar month of its `as_of_date` in the single business timezone ⟨src: d:x6⟩.

### KPI (n7)

| Field | Type | Required | Notes |
|---|---|---|---|
| id | UUID | yes | Surrogate primary key ⟨src: default⟩ |
| name | Text | yes | Metric name (e.g. Gross Margin) ⟨src: n:n7⟩ |
| value | Number/percent | yes | Sourced value for the period (see below) ⟨src: n:n7⟩ |
| target | Number/percent | no | Goal value for the period ⟨src: n:n7⟩ |
| period | Month (YYYY-MM) | yes | Period the metric applies to ⟨src: n:n7⟩ |
| archived | Boolean | yes | Soft-delete flag ⟨src: d:deletion⟩ |

**Value source (default):** each KPI's `value` is read from a `Value` column in the uploaded spreadsheet for the matching `period` and `name`; if a `Target` column is present it populates `target` ⟨src: d:data_import, n:n7, default⟩. KPIs are not computed by the app in v1 ⟨src: default⟩.

**Identifiers / uniqueness:** one KPI per (`name`, `period`) ⟨src: default⟩.

### Spreadsheet Import (n8)

| Field | Type | Required | Notes |
|---|---|---|---|
| id | UUID | yes | Surrogate primary key ⟨src: default⟩ |
| file_name | Text | yes | Original uploaded file name ⟨src: n:n8, r:r8⟩ |
| upload_date | Timestamp | yes | When the file was loaded ⟨src: n:n8⟩ |
| month_covered | Month (YYYY-MM) | yes | The month the file supplies figures for ⟨src: n:n8, r:r8⟩ |
| uploaded_by | UUID (FK User) | yes | Owner or Bookkeeper who uploaded ⟨src: n:n8, r:r1⟩ |
| status | Enum: awaiting_confirmation, imported, rejected, superseded | yes | See state machine ⟨src: d:x1, d:x8, r:r5⟩ |
| stored_file | Binary/blob reference | yes | The uploaded file is retained, not discarded ⟨src: r:r5⟩ |
| archived | Boolean | yes | Soft-delete flag ⟨src: d:deletion⟩ |

**Retention on re-upload:** uploading a new spreadsheet for an already-loaded month replaces the prior figures and marks the prior import `superseded`, while both import rows persist ⟨src: r:r5⟩.

**Identifiers / uniqueness:** the surrogate `id` is the primary key; the business key is (`file_name`, `month_covered`, `upload_date`), which lets a confirmed identical-file re-import be retained as a distinct row without colliding on (`file_name`, `month_covered`) ⟨src: r:r8, r:r5, d:x8⟩.

#### Import contract

- **Accepted extensions/formats:** `.xlsx` and `.csv` only; any other extension is rejected ⟨src: d:data_import, default⟩.
- **Required headers** (exact, case-insensitive, whitespace-trimmed): `Month` (text, format `YYYY-MM`), `Type` (text, one of `income` or `expense`), `Category` (text), `Amount` (currency, USD, decimal), and `Department` (text) for expense rows ⟨src: d:data_import, n:n2, n:n3, r:r6, r:r11⟩.
- **Optional headers:** `Vendor` (text, expense rows only), `KPI Name` (text), `Value` (number), `Target` (number) ⟨src: n:n3, n:n7⟩.
- **Currency:** every `Amount` must be USD; a row carrying any other currency symbol or code causes the file to be rejected ⟨src: r:r6⟩.
- **Department resolution:** the `Department` cell resolves to an existing Department by exact match on `cost_center_code` after trimming whitespace and ignoring case; no other matching field is used ⟨src: n:n5, r:r10⟩.
- **Unresolved rows:** if any row fails to resolve its Department, fails required-field validation, or carries a non-USD amount, the entire file is rejected and no figures are written; the import row is saved with `status = rejected` ⟨src: d:x1, r:r10, r:r11⟩.
- **File retention:** the uploaded file is retained on the import record after processing ⟨src: r:r5⟩.
- **Duplicate detection:** if a byte-identical file for the same `month_covered` was already imported, the upload enters `awaiting_confirmation` and the uploader must confirm before it becomes `imported` or cancel to reject it ⟨src: d:x8⟩.

### Audit Entry

| Field | Type | Required | Notes |
|---|---|---|---|
| id | UUID | yes | Surrogate primary key ⟨src: default⟩ |
| actor_id | UUID (FK User) | yes | Who performed the action ⟨src: r:r9⟩ |
| action | Text | yes | One of: upload, figure edit, budget change, review ⟨src: r:r9⟩ |
| entity | Text | yes | Target entity type ⟨src: r:r9⟩ |
| entity_id | UUID | yes | Target record ⟨src: r:r9⟩ |
| occurred_at | Timestamp | yes | When it happened ⟨src: r:r9⟩ |

Audit Entry rows are append-only: they cannot be altered or deleted (no `updated_by`, no `archived`) ⟨src: r:r9⟩.

## Lifecycles (state machines)

### Department

Each Department starts in `active` and moves through 3 states.

States:
- `active` — Active: Department is active and owns budgets and expense lines.
- `reassigning` — Reassigning: Department is slated for deletion but still has linked budgets/expense lines that must be reassigned first.
- `archived` — Archived: Department is soft-deleted and can be restored.

| From | To | Who | When | Guard | ⟨src⟩ |
|---|---|---|---|---|---|
| `active` | `archived` | Owner | Owner deletes the department | no linked budgets or expense lines | ⟨src: r13, deletion⟩ |
| `active` | `reassigning` | Owner | Owner attempts to delete a department with linked lines | has linked budgets or expense lines | ⟨src: r13, x5⟩ |
| `reassigning` | `archived` | Owner | Linked budgets and expense lines reassigned to another department | no remaining linked lines | ⟨src: x5, r13⟩ |
| `reassigning` | `active` | Owner | Owner cancels the deletion | — | ⟨src: x5⟩ |
| `archived` | `active` | Owner | Owner restores the archived department | — | ⟨src: deletion⟩ |

Terminal: none declared.

### Expense Line

Each Expense Line starts in `saved` and moves through 2 states.

States:
- `saved` — Saved: Expense line is saved and editable via the dashboard.
- `locked` — Locked: Expense line is locked because its month was marked reviewed.

| From | To | Who | When | Guard | ⟨src⟩ |
|---|---|---|---|---|---|
| `saved` | `saved` | Bookkeeper | Bookkeeper updates the expense line | month not reviewed | ⟨src: a3, x4, r11⟩ |
| `saved` | `locked` | system | Owning month is marked reviewed | — | ⟨src: r7⟩ |
| `locked` | `saved` | system | Owning month is reopened | — | ⟨src: x2⟩ |

Terminal: none declared.

### Monthly Financials

Each Monthly Financials starts in `draft` and moves through 4 states.

States:
- `draft` — Draft: Month summary exists but income and/or expense lines are not both present yet.
- `ready_to_close` — Ready to Close: Both income and expense lines are present; the month can be reviewed and finalized.
- `reviewed` — Reviewed & Locked: Accountant marked the month reviewed at period close; its figures are locked from editing.
- `reopened` — Reopened: Accountant reopened a previously reviewed month so figures can be corrected.

| From | To | Who | When | Guard | ⟨src⟩ |
|---|---|---|---|---|---|
| `draft` | `ready_to_close` | system | Income and expense lines both become present | income lines present AND expense lines present | ⟨src: r3⟩ |
| `ready_to_close` | `reviewed` | Accountant | Accountant reviews the month's figures at close | — | ⟨src: a10, r7⟩ |
| `reviewed` | `reopened` | Accountant | Accountant reopens the locked month | — | ⟨src: x2, r7⟩ |
| `reopened` | `reviewed` | Accountant | Accountant re-reviews the corrected month | — | ⟨src: a10, x2⟩ |

Terminal: none declared.

### Revenue Line

Each Revenue Line starts in `saved` and moves through 2 states.

States:
- `saved` — Saved: Revenue line is saved and editable via the dashboard.
- `locked` — Locked: Revenue line is locked because its month was marked reviewed.

| From | To | Who | When | Guard | ⟨src⟩ |
|---|---|---|---|---|---|
| `saved` | `saved` | Bookkeeper | Bookkeeper updates the revenue line | month not reviewed | ⟨src: a2, x4, r11⟩ |
| `saved` | `locked` | system | Owning month is marked reviewed | — | ⟨src: r7⟩ |
| `locked` | `saved` | system | Owning month is reopened | — | ⟨src: x2⟩ |

Terminal: none declared.

### Spreadsheet Import

Each Spreadsheet Import starts in `uploaded` and moves through 5 states.

States:
- `uploaded` — Uploaded: File has been uploaded and is being validated/parsed.
- `needs_confirmation` — Needs Confirmation: An identical file to the last import was detected; confirmation is required before applying.
- `rejected` — Rejected: File was rejected due to invalid, unparseable, or mixed-currency rows and no figures were applied.
- `applied` — Applied: Valid figures were loaded into the covered month.
- `superseded` — Superseded: A later import for the same month replaced this import's figures; the record is retained.

| From | To | Who | When | Guard | ⟨src⟩ |
|---|---|---|---|---|---|
| `uploaded` | `applied` | system | All rows valid and no duplicate detected | all rows parse AND single currency USD | ⟨src: x1, r6, r11⟩ |
| `uploaded` | `rejected` | system | Invalid, unparseable, or mixed-currency rows found | any row invalid OR non-USD amount | ⟨src: x1, r6⟩ |
| `uploaded` | `needs_confirmation` | system | Identical file to the last import detected | file identical to prior import | ⟨src: x8⟩ |
| `needs_confirmation` | `applied` | Bookkeeper | Bookkeeper confirms the duplicate upload | — | ⟨src: x8, r5⟩ |
| `needs_confirmation` | `rejected` | Bookkeeper | Bookkeeper cancels the duplicate upload | — | ⟨src: x8⟩ |
| `applied` | `superseded` | system | A new spreadsheet is uploaded for the same month | newer import applied for same month | ⟨src: r5⟩ |

Terminal: `rejected`, `superseded` — once reached, no further transitions.

> ⚠️ Mechanical lifecycle check: 4 finding(s) remain — see compile-report.json.

## Rules & invariants

### Sheet rules

Each rule below is stated precisely, given a verification sketch, and mapped to the entities and actions it constrains. A rule holds if every listed test passes.

#### R-1 — Edit rights restricted to Owner and Bookkeeper
Only the Owner and Bookkeeper may upload spreadsheets or create/update Revenue Lines, Expense Lines, Cash Balances, Budgets, or finalize a month; Managers and Accountant have read-only access to figures. ⟨src: r:r1⟩
- **Constrains:** actions a1, a2, a3, a4, a9; entities Spreadsheet Import (n8), Revenue Line (n2), Expense Line (n3), Cash Balance (n6), Budget (n4). ⟨src: r:r1, a:a1, a:a2, a:a3, a:a4, a:a9⟩
- **Test sketch:** signed in as Manager (p3), attempt to update an Expense Line amount → expect 403; repeat as Accountant (p4) → expect 403; repeat as Bookkeeper (p2) → expect success. ⟨src: r:r1, p:p3, p:p4, p:p2⟩

#### R-2 — Manager sees only their own department
A Manager may view Budgets and Departments (with linked Expense Lines) only for the Department they manage plus any Department the Owner has explicitly granted them; all other Departments are hidden. ⟨src: r:r2, d:x7⟩
- **Constrains:** actions a7, a8; entities Department (n5), Budget (n4), Expense Line (n3). ⟨src: r:r2, a:a7, a:a8⟩
- **Test sketch:** as Sales Manager, request the Operations Department view → expect 403/hidden; have the Owner grant Operations to that Manager, request again → expect success. ⟨src: r:r2, d:x7, p:p3, p:p1⟩

#### R-3 — A month finalizes only with both income and expense lines present
A Monthly Financials record may transition to `finalized` only when at least one non-archived Revenue Line and at least one non-archived Expense Line exist for that `month`. ⟨src: r:r3⟩
- **Constrains:** Monthly Financials (n1) status transition `draft → finalized`; performed by Owner or Bookkeeper. ⟨src: r:r3, n:n1, p:p1, p:p2⟩
- **Test sketch:** create a month with revenue lines but no expense lines, attempt finalize → expect rejection; add one expense line, finalize → expect success. ⟨src: r:r3⟩

#### R-4 — Net profit equals income minus expenses
For every Monthly Financials record, `net_profit = total_income − total_expenses`, where `total_income` is the sum of `amount` over all non-archived Revenue Lines of that `month` and `total_expenses` is the sum of `amount` over all non-archived Expense Lines of that `month`. Archived (soft-deleted) lines are excluded from both totals, so archiving a line deterministically lowers the corresponding total and recomputes `net_profit`. ⟨src: r:r4, d:deletion⟩
- **Constrains:** Monthly Financials (n1) derived fields; Revenue Line (n2), Expense Line (n3). ⟨src: r:r4⟩
- **Test sketch:** load income $84,200 and expenses $61,500 → assert `net_profit == 22,700`; archive a $500 expense line → assert `total_expenses == 61,000` and `net_profit == 23,200`. ⟨src: r:r4, d:deletion⟩

#### R-5 — Re-upload replaces figures, retains both import records
Uploading a new spreadsheet for a month that is already loaded replaces that month's Revenue Lines, Expense Lines, and Cash Balance with the new file's values, while both the prior and the new Spreadsheet Import records are retained. ⟨src: r:r5⟩
- **Constrains:** action a1; Spreadsheet Import (n8), Revenue Line (n2), Expense Line (n3), Cash Balance (n6). ⟨src: r:r5, a:a1⟩
- **Test sketch:** upload March on Apr 2, upload a corrected March on Apr 5 → assert figures reflect the Apr 5 file and that two Spreadsheet Import rows (Apr 2 and Apr 5) both persist. ⟨src: r:r5⟩

#### R-6 — Single currency (USD) only
Every stored and displayed amount is in USD; any value carrying a non-USD currency is rejected on import and on manual save. ⟨src: r:r6, d:localization⟩
- **Constrains:** Revenue Line (n2), Expense Line (n3), Budget (n4), Cash Balance (n6), Monthly Financials (n1). ⟨src: r:r6⟩
- **Test sketch:** import a row with a EUR amount → expect the whole file rejected (see R-D1); attempt a manual save of a EUR-tagged amount → expect rejection. ⟨src: r:r6⟩

#### R-7 — Reviewed months are locked
Once the Accountant marks a Monthly Financials record `reviewed`, its Revenue Lines, Expense Lines, and Cash Balance are locked: no upload, figure edit, archive, or Department reassignment may change them while the month is `reviewed`. Editing resumes only after the Accountant reopens the month (see R-D2). ⟨src: r:r7, d:x2⟩
- **Constrains:** actions a1, a2, a3, a4; Monthly Financials (n1) lifecycle. ⟨src: r:r7, a:a1, a:a2, a:a3, a:a4⟩
- **Test sketch:** mark March reviewed, attempt to edit a March expense line as Bookkeeper → expect rejection; have Accountant reopen March, edit again → expect success. ⟨src: r:r7, d:x2, p:p4⟩

#### R-8 — Uniqueness of month record and imports
There is exactly one Monthly Financials record per calendar `month`, and each Spreadsheet Import is uniquely identified by the triple (`file_name`, `month_covered`, import `id`). Two imports may share the same file name and month covered because the surrogate `id` keeps every retained record distinct, satisfying R-5. ⟨src: r:r8, r:r5⟩
- **Constrains:** Monthly Financials (n1), Spreadsheet Import (n8). ⟨src: r:r8, n:n1, n:n8⟩
- **Test sketch:** attempt to create a second Monthly Financials for `2024-03` → expect rejection; upload the same file name for the same month twice (after the R-D9 confirmation) → assert two Spreadsheet Import rows with distinct `id` both persist. ⟨src: r:r8, r:r5, d:x8⟩

#### R-9 — Immutable audit records
Every upload, figure edit, budget change, and review action is recorded with the acting user and timestamp, and these audit records cannot be altered or deleted. ⟨src: r:r9, d:audit_trail⟩
- **Constrains:** actions a1, a2, a3, a4, a9, a10; all figure entities. ⟨src: r:r9, a:a1, a:a2, a:a3, a:a4, a:a9, a:a10⟩
- **Test sketch:** perform an expense edit, read the audit record → assert it names the user and time; attempt to update or delete that audit record via any role → expect rejection. ⟨src: r:r9⟩

#### R-10 — No orphaned lines
Every Revenue Line and Expense Line must reference an existing Monthly Financials `month`; every Budget must reference a valid existing `period`; every Expense Line and department-scoped Budget must reference an existing Department. ⟨src: r:r10⟩
- **Constrains:** Revenue Line (n2), Expense Line (n3), Budget (n4), Department (n5), Monthly Financials (n1). ⟨src: r:r10⟩
- **Test sketch:** attempt to save an Expense Line with a `month` that has no Monthly Financials record → expect rejection; attempt to save an Expense Line with a non-existent `department_id` → expect rejection. ⟨src: r:r10⟩

#### R-11 — Required fields before save
A Revenue Line, Expense Line, or Cash Balance is saved only when its required fields are present: `month`/`date`, `category` (for Revenue and Expense Lines), and `amount`/`balance`. ⟨src: r:r11⟩
- **Constrains:** actions a2, a3, a4; Revenue Line (n2), Expense Line (n3), Cash Balance (n6). ⟨src: r:r11, a:a2, a:a3, a:a4⟩
- **Test sketch:** attempt to save a Revenue Line with a blank `amount` → expect rejection; supply all required fields → expect success. ⟨src: r:r11⟩

#### R-12 — Dashboard-only access
Users interact with financial figures only through the dashboard; there is no direct access to the underlying spreadsheet files or data store. ⟨src: r:r12⟩
- **Constrains:** all actors (p1, p2, p3, p4); all entities. ⟨src: r:r12, p:p1, p:p2, p:p3, p:p4⟩
- **Test sketch:** confirm the application exposes no file-system or raw datastore endpoint to any signed-in role; all reads/writes route through dashboard actions. ⟨src: r:r12⟩

#### R-13 — Department cannot be archived while lines remain
A Department may not be archived while any non-archived Budget or Expense Line is still linked to it; the Owner must first reassign those lines to another Department (see R-D5). Where a linked Expense Line belongs to a `reviewed` month, the Accountant must reopen that month before the Owner reassigns, then re-review it (see R-7, R-D2). ⟨src: r:r13, d:x5, r:r7, d:x2⟩
- **Constrains:** action Archive Department; Department (n5), Budget (n4), Expense Line (n3). ⟨src: r:r13, n:n5⟩
- **Test sketch:** attempt to archive a Department that still has a linked Expense Line → expect rejection; **branch A (draft lines):** reassign all linked Budgets and Expense Lines to another Department, then archive → assert success; **branch B (reviewed lines):** for any linked Expense Line in a reviewed month, have the Accountant reopen the month, have the Owner reassign, re-review, then archive → assert success. ⟨src: r:r13, d:x5, r:r7, d:x2, p:p4, p:p1⟩

### Derived invariants

These follow from the decision log and constrain the same entities and actions.

#### R-D1 — All-or-nothing import
When an uploaded spreadsheet contains any invalid or unparseable row, the entire file is rejected and no figures are written until it is fixed and re-uploaded. ⟨src: d:x1, a:a1⟩
- **Test sketch:** upload a file with one malformed amount row → assert zero rows imported and an error listing the offending row. ⟨src: d:x1⟩

#### R-D2 — Only the Accountant reopens a reviewed month
A month locked under R-7 may be reopened for edits only by the Accountant; reopening returns it to `draft` for editing and it must be marked `reviewed` again to re-lock. ⟨src: d:x2, r:r7, p:p4⟩
- **Test sketch:** as Owner, attempt to reopen a reviewed month → expect 403; as Accountant, reopen → expect status `draft`. ⟨src: d:x2, p:p1, p:p4⟩

#### R-D3 — Rounding and sign convention
Stored monetary figures keep exact cents; displayed figures are rounded to whole dollars. `amount` and `balance` magnitudes are stored positive; only computed `net_profit` (and any negative `balance`) may be negative, shown as a negative number. ⟨src: d:x3, r:r4⟩
- **Test sketch:** store income $84,200.40 and expenses $61,500.60 → assert stored `net_profit == 22,699.80` and display shows `$22,700`; a month with expenses exceeding income → assert `net_profit` displays as a negative dollar figure. ⟨src: d:x3, r:r4⟩

#### R-D4 — Last-write-wins on concurrent edits
When the Owner and Bookkeeper edit the same Revenue Line or Expense Line concurrently, the last save overwrites the earlier one with no conflict warning. ⟨src: d:x4, d:concurrency⟩
- **Test sketch:** open the same expense line in two sessions, save $100 then $120 → assert stored value is $120 and no conflict prompt was shown. ⟨src: d:x4⟩

#### R-D5 — Reassignment before Department archival
Budgets and Expense Lines linked to a Department being archived must be reassigned to another existing Department by the Owner; reassignment sets a new `department_id` and is subject to the R-7 reopen dependency for reviewed months. ⟨src: d:x5, r:r13, r:r7⟩
- **Test sketch:** reassign a draft-month Expense Line to another Department, assert its `department_id` updates and no orphan remains; for a reviewed-month line, assert reassignment is refused until the Accountant reopens the month. ⟨src: d:x5, r:r13, r:r7⟩

#### R-D6 — Cash Balance dating
A Cash Balance's `date` is a date-only value in the business's single timezone; there is no time component and no cross-timezone conversion. ⟨src: d:x6, n:n6⟩
- **Test sketch:** enter a balance as of Mar 31 → assert it stores the date `2024-03-31` with no timestamp shift. ⟨src: d:x6, n:n6⟩

#### R-D7 — Owner grants extra department access
A Manager's view scope (R-2) may be extended only by the Owner explicitly granting one or more additional Departments; Managers cannot self-grant or delegate access. ⟨src: d:x7, r:r2, p:p1⟩
- **Test sketch:** as Manager, attempt to add a Department to own scope → expect 403; as Owner, grant it → assert the Manager can now view that Department. ⟨src: d:x7, p:p1, p:p3⟩

#### R-D8 — Budget change requires single-approver approval
Budget creation and changes take effect only after the Owner, the single approver, approves them; a proposal by the Bookkeeper remains pending until Owner approval, and the Owner may propose and approve in one act. ⟨src: d:approval_workflow, a:a9, p:p1⟩
- **Test sketch:** as Bookkeeper, propose a Budget change → assert it is pending and not yet effective; as Owner, approve → assert it becomes effective; as Owner, propose-and-approve → assert immediate effect. ⟨src: d:approval_workflow, a:a9, p:p1, p:p2⟩

#### R-D9 — Identical re-upload requires confirmation, still retained distinctly
If a month's spreadsheet is uploaded again and detected as byte-identical to a prior import, the uploader (the Owner or Bookkeeper who initiated it) is prompted to confirm or cancel. On confirm, the file is imported and retained as a new Spreadsheet Import row whose surrogate `id` keeps it distinct under R-8; on cancel, no new row is written. ⟨src: d:x8, r:r5, r:r8, r:r1⟩
- **Test sketch:** upload an identical March file twice, confirm the prompt → assert two distinct import rows persist; repeat and cancel the prompt → assert only the original row remains. ⟨src: d:x8, r:r5, r:r8⟩

#### R-D10 — Archived rows excluded from active views and totals
A soft-deleted (archived) record is hidden from all active dashboard views and, for Revenue and Expense Lines, excluded from R-4 totals; only the Owner may restore an archived record. ⟨src: d:deletion, r:r4, p:p1⟩
- **Test sketch:** archive an expense line → assert it disappears from the month view and lowers `total_expenses`; as Owner, restore it → assert it reappears and the total returns. ⟨src: d:deletion, r:r4, p:p1⟩

#### R-D11 — KPI values are computed from the month's figures
Each KPI's `value` is derived from the underlying Monthly Financials and lines for its `period` — for example Gross Margin = `net_profit ÷ total_income`, expressed as a percentage — and its `target` is set by the Owner; KPIs are never entered as free-standing figures. ⟨src: n:n7, a:a6, a:a12, r:r4, p:p1⟩
- **Test sketch:** for a month with income $84,200 and net profit $22,700, assert the Gross Margin KPI computes to 27% and re-derives whenever the source lines change. ⟨src: n:n7, r:r4⟩

#### R-D12 — Automatic monthly draft generation
On the first day of each calendar month the system automatically creates one `draft` Monthly Financials record for that month so figures can be attached; this is the only auto-generated record and no human actor initiates it. ⟨src: d:recurring_scheduled, r:r8, n:n1⟩
- **Test sketch:** advance the clock to the first of a new month → assert exactly one `draft` Monthly Financials record exists for it and that no second record can be created (R-8). ⟨src: d:recurring_scheduled, r:r8⟩

## Acceptance scenarios

These scenarios are written Given/When/Then and are directly executable as tests. Every action (a1–a12) and every rule (r1–r13) appears at least once, and every access rule has a negative case. All amounts are USD; displayed figures are rounded to whole dollars while stored figures keep exact cents. ⟨src: r:r6, d:x3⟩

### Uploading and importing figures

**S1 — Bookkeeper uploads a clean month (a1).**
Given the Bookkeeper is signed in and March 2024 exists as a draft Monthly Financials, when they upload `financials_Mar2024.xlsx` whose rows all parse and are USD, then a Spreadsheet Import record is created (file name, upload date, month covered, uploaded by) and the month's Revenue Lines, Expense Lines, and Cash Balance are written. ⟨src: p:p2, a:a1, n:n8, n:n2, n:n3, n:n6⟩

**S2 — Whole-file rejection on any bad row (x1, r6).**
Given the Bookkeeper uploads a March file where one row carries a EUR amount and another is unparseable, when the system validates the file, then the entire file is rejected, the offending rows are listed, and no Revenue Line, Expense Line, or Cash Balance is created. ⟨src: d:x1, r:r6, a:a1⟩

**S3 — Manager cannot upload (negative, r1).**
Given a Manager is signed in, when they attempt to upload a Spreadsheet Import, then the request is refused with 403 and no import record is created. ⟨src: r:r1, p:p3, a:a1⟩

**S4 — Accountant cannot upload (negative, r1).**
Given the Accountant is signed in, when they attempt to upload a Spreadsheet Import, then the request is refused with 403. ⟨src: r:r1, p:p4, a:a1⟩

### Re-upload, replacement, and duplicate detection

**S5 — Re-upload replaces figures and keeps both records (r5, r8).**
Given March was loaded from a file uploaded Apr 2, when the Bookkeeper uploads a corrected, non-identical March file on Apr 5, then March's Revenue Lines, Expense Lines, and Cash Balance are replaced by the Apr 5 values and two distinct Spreadsheet Import rows (Apr 2 and Apr 5), each uniquely identified by its own id and upload timestamp, both persist. ⟨src: r:r5, r:r8, a:a1⟩

**S6 — Identical re-upload prompts the initiator (x8, r1).**
Given the most recent March import is `financials_Mar2024.xlsx`, when the same Bookkeeper uploads a byte-identical file, then the system detects the duplicate and prompts only that uploader to confirm or cancel; a different user may not respond to that prompt. ⟨src: d:x8, r:r1, a:a1⟩

**S7 — Owner-initiated duplicate can be confirmed by the Owner (x8, matrix fix).**
Given the Owner uploaded a byte-identical March file, when the duplicate prompt appears, then the Owner (the uploader) may confirm or cancel it, and no other actor may. ⟨src: d:x8, r:r1, p:p1, a:a1⟩

**S8 — Confirming an identical re-upload retains a new record without breaking uniqueness (x8, r5, r8).**
Given the duplicate prompt is shown, when the uploader confirms, then a new Spreadsheet Import row is created with its own id and upload timestamp so both the prior and new rows persist, and the figure identity of one Monthly Financials per calendar month is unchanged. ⟨src: d:x8, r:r5, r:r8⟩

**S9 — Cancelling an identical re-upload changes nothing (x8).**
Given the duplicate prompt is shown, when the uploader cancels, then no new Spreadsheet Import row is written and the month's figures are unchanged. ⟨src: d:x8, a:a1⟩

### Editing figures

**S10 — Bookkeeper updates a Revenue Line (a2, r11).**
Given March is in draft, when the Bookkeeper sets Product Sales to $58,000 with month and category present, then the Revenue Line is saved and `total_income` and `net_profit` recompute immediately. ⟨src: p:p2, a:a2, r:r11, r:r4⟩

**S11 — Bookkeeper adds an Expense Line (a3, r10, r11).**
Given March is in draft, when the Bookkeeper adds a Rent expense of $8,500 with category, month, amount, and a valid existing Department, then the Expense Line is saved and totals recompute. ⟨src: p:p2, a:a3, r:r10, r:r11, r:r4⟩

**S12 — Missing required field is refused (r11).**
Given the Bookkeeper is entering an Expense Line, when they omit the amount, then the save is rejected until month, category, and amount are all provided. ⟨src: r:r11, a:a3⟩

**S13 — Orphan line is refused (r10).**
Given no Monthly Financials exists for 2025-01, when the Bookkeeper tries to save a Revenue Line for 2025-01, then the save is rejected because it references no existing month. ⟨src: r:r10, a:a2⟩

**S14 — Owner enters a Cash Balance (a4, r11).**
Given the Owner is signed in, when they record $142,300 for the Operating Account as of Mar 31 2024 with account, date, and balance present, then the Cash Balance is saved dated in the business's single timezone. ⟨src: p:p1, a:a4, r:r11, d:x6⟩

**S15 — Manager cannot edit a figure (negative, r1).**
Given a Manager views a March Expense Line, when they attempt to change its amount, then the request is refused with 403. ⟨src: r:r1, p:p3, a:a3⟩

**S16 — Concurrent edit resolves last-write-wins (x4).**
Given the Owner and Bookkeeper open the same Revenue Line, when both save different amounts, then the later save silently becomes the stored value with no conflict warning. ⟨src: d:x4, a:a2⟩

### Net profit and totals

**S17 — Net profit equals income minus expenses (r4).**
Given March total income $84,200 and total expenses $61,500, when the summary renders, then `net_profit` shows $22,700. ⟨src: r:r4⟩

**S18 — Archiving a line changes totals deterministically (r4, deletion).**
Given March total expenses are $61,500, when a $500 Expense Line is archived, then that line is excluded from `total_expenses`, which becomes $61,000, and `net_profit` becomes $23,200. ⟨src: r:r4, d:deletion⟩

**S19 — Negative net profit renders as a negative (x3).**
Given March total income $40,000 and total expenses $52,000, when the summary renders, then `net_profit` shows −$12,000 rounded to whole dollars. ⟨src: d:x3, r:r4⟩

### Finalizing and reviewing

**S20 — Finalize requires both line types (r3).**
Given March has Revenue Lines but no Expense Lines, when the Bookkeeper attempts to finalize the month, then the transition to `finalized` is refused; after one Expense Line is added, finalizing succeeds. ⟨src: r:r3, a:a3⟩

**S21 — Owner may also finalize (matrix, r3).**
Given March has both income and expense lines present, when the Owner finalizes the month, then it transitions to `finalized`. ⟨src: r:r3, p:p1⟩

**S22 — Accountant reviews and locks a month (a10, r7).**
Given March is ready to close, when the Accountant marks it reviewed, then it enters `reviewed` and its Revenue Lines and Expense Lines become locked against edits. ⟨src: p:p4, a:a10, r:r7⟩

**S23 — Reviewed month rejects figure edits (r7).**
Given March is reviewed, when the Bookkeeper attempts to update a March Expense Line, then the edit is refused until the month is reopened. ⟨src: r:r7, a:a3⟩

**S24 — Only the Accountant may reopen a reviewed month (x2).**
Given March is reviewed, when the Owner attempts to reopen it, then the request is refused; when the Accountant reopens it, March enters `reopened` and its lines unlock. ⟨src: d:x2, r:r7, p:p1, p:p4⟩

**S25 — Re-upload blocked on a reviewed month (r7, x2).**
Given March is reviewed, when the Bookkeeper uploads a corrected March file, then the replacement is refused until the Accountant reopens the month. ⟨src: r:r7, d:x2, a:a1⟩

### Budgets and approval

**S26 — Owner sets and approves a Budget (a9, approval).**
Given the Owner opens the budgets view, when they propose Q2 Marketing at $16,000 against a valid existing period and Department, then they may approve it in the same act and the Budget becomes active in that Department's budget view. ⟨src: p:p1, a:a9, d:approval_workflow, r:r10⟩

**S27 — Bookkeeper's Budget proposal needs Owner approval (approval, r1).**
Given the Bookkeeper proposes a Budget change, when it is submitted, then it does not take effect until the Owner, the single approver, approves it. ⟨src: d:approval_workflow, p:p2, p:p1, a:a9⟩

**S28 — Budget against a missing period is refused (r10).**
Given no such period exists, when the Owner proposes a Budget for it, then the proposal is rejected. ⟨src: r:r10, a:a9⟩

**S29 — Manager cannot set a Budget (negative, r1).**
Given a Manager is signed in, when they attempt to set or approve a Budget, then the request is refused with 403. ⟨src: r:r1, p:p3, a:a9⟩

### Department-scoped viewing

**S30 — Manager views their own Budget and Department (a7, a8).**
Given the Sales Manager is signed in, when they open Budgets and Department costs for Sales, then they see Sales budgets and its linked Expense Lines. ⟨src: p:p3, a:a7, a:a8⟩

**S31 — Manager cannot view another Department (negative, r2).**
Given the Sales Manager is signed in, when they request the Operations Department view, then it is hidden/refused. ⟨src: r:r2, p:p3, a:a8⟩

**S32 — Owner grants cross-department access (x7, r2).**
Given the Sales Manager cannot see Operations, when the Owner grants Operations to that Manager, then a subsequent Operations Budget/Department request succeeds. ⟨src: d:x7, r:r2, p:p1, a:a8⟩

### Monthly Financials, KPIs, and export

**S33 — Owner views Monthly Financials (a5).**
Given March is loaded, when the Owner opens the March summary, then they see total income, total expenses, and net profit. ⟨src: p:p1, a:a5, n:n1⟩

**S34 — Manager cannot view org-wide Monthly Financials (negative, r1, r2).**
Given a Manager is signed in, when they request the org-wide March Monthly Financials or KPIs, then access is refused. ⟨src: r:r1, r:r2, p:p3, a:a5⟩

**S35 — Owner reviews a KPI against target (a6, KPI source).**
Given Gross Margin for March is derived from that month's figures (value `total_income − total_expenses over total_income`, target and period taken from the imported KPI definition), when the Owner opens the KPI, then its value (27%) is shown against its target (30%). ⟨src: p:p1, a:a6, n:n7, d:data_import⟩

**S36 — Owner compares a KPI across periods (a12).**
Given Gross Margin exists for several quarters, when the Owner compares them, then the values are shown side by side for the selected periods. ⟨src: p:p1, a:a12, n:n7⟩

**S37 — Accountant reviews figures at close (a10).**
Given period close, when the Accountant reviews the March figures read-only, then they can inspect all lines and the summary without editing them. ⟨src: p:p4, a:a10, r:r1⟩

**S38 — Accountant exports the month as Excel (a11).**
Given March is loaded, when the Accountant exports Monthly Financials, then an Excel/CSV file of the March summary is downloaded. ⟨src: p:p4, a:a11, d:data_export⟩

### Departments and reassignment

**S39 — Department with linked lines cannot be archived directly (r13).**
Given Sales has linked Budgets and Expense Lines, when the Owner attempts to archive Sales, then the Department enters `reassigning` and archival is blocked until its lines are moved. ⟨src: r:r13, d:x5, p:p1⟩

**S40 — Reassigning lines in a reviewed month requires reopening first (r13, r7, x2).**
Given some of Sales' Expense Lines belong to a reviewed month, when the Owner tries to reassign them, then the reassignment is refused until the Accountant reopens those months; after reopening, the Owner reassigns the lines and archival of Sales then succeeds, and the Accountant re-reviews the affected months. ⟨src: r:r13, r:r7, d:x2, d:x5, p:p1, p:p4⟩

**S41 — Cancelling a Department deletion restores it (x5).**
Given Sales is in `reassigning`, when the Owner cancels the deletion, then Sales returns to `active` with its lines intact. ⟨src: d:x5, p:p1⟩

### Soft delete, restore, and audit

**S42 — Owner restores an archived record (deletion).**
Given an Expense Line is archived, when the Owner restores it, then it re-enters `saved` and is again included in its month's totals. ⟨src: d:deletion, r:r4, p:p1⟩

**S43 — Bookkeeper cannot restore (negative, matrix).**
Given an archived record exists, when the Bookkeeper attempts to restore it, then the request is refused with 403. ⟨src: d:deletion, p:p2⟩

**S44 — Every change is recorded immutably (r9).**
Given an upload, a figure edit, a Budget approval, and a review have occurred, when the audit records are inspected, then each carries who acted and when, and any attempt to alter or delete a record is refused. ⟨src: r:r9⟩

**S45 — Only the Owner may view the audit trail (matrix, r9).**
Given audit records exist, when the Bookkeeper, Manager, or Accountant requests the audit trail, then access is refused; when the Owner requests it, the records are shown. ⟨src: r:r9, p:p1, p:p2, p:p3, p:p4⟩

### System-generated records

**S46 — Draft month is auto-generated on schedule (recurring_scheduled).**
Given a new calendar month begins, when the scheduled job runs, then a draft Monthly Financials record for that month is created automatically by the system, with no human actor initiating it. ⟨src: d:recurring_scheduled, n:n1⟩

**S47 — No human may trigger scheduled generation (negative, matrix).**
Given any actor is signed in, when they attempt to invoke scheduled record generation, then it is unavailable because generation runs only on the system schedule. ⟨src: d:recurring_scheduled⟩

### Direct-access boundary

**S48 — Figures are reachable only through the dashboard (r12).**
Given any actor, when they attempt to reach the underlying spreadsheet file or data store directly, then access is denied and only dashboard views are available. ⟨src: r:r12⟩

**S49 — One Monthly Financials per calendar month (r8).**
Given March 2024 already exists, when a second March 2024 Monthly Financials would be created, then creation is refused because `month` is unique. ⟨src: r:r8⟩

## Key journeys

These flows trace the app's main paths end to end. Notifications are sent by email, the only channel in v1; there is no in-app inbox or SMS. ⟨src: d:notifications⟩ Every actor works in a browser on desktop or phone, online only, and reaches figures only through the dashboard. ⟨src: d:platform, d:offline, r:r12⟩

### Journey 1 — Bookkeeper loads a month from Excel

1. The Bookkeeper opens the dashboard and selects the auto-generated draft Monthly Financials for the target calendar month; the summary shows empty totals until lines are loaded. ⟨src: p:p2, a:a5, n:n1, d:recurring_scheduled⟩
2. The Bookkeeper uploads the month's Excel file as a Spreadsheet Import (file name, upload date, month covered, uploaded by). ⟨src: p:p2, a:a1, n:n8⟩
3. The system validates every row before writing anything; if any row is invalid or unparseable, or carries a non-USD amount, the whole file is rejected and the Bookkeeper sees a list of offending rows and no records are created. ⟨src: d:x1, r:r6⟩
4. On a clean file, the system creates the month's Revenue Lines, Expense Lines, and Cash Balance, and rolls them into the Monthly Financials summary; the Bookkeeper sees total income, total expenses, and net profit populate. ⟨src: n:n2, n:n3, n:n6, n:n1, r:r4⟩
5. The Bookkeeper corrects any figure directly — for example editing a Revenue Line amount or adding a missing Expense Line — and the totals and net profit recompute immediately. ⟨src: p:p2, a:a2, a:a3, r:r4⟩
6. Once both income and expense lines are present, the Bookkeeper finalizes the month, moving it from `draft` to `finalized`; a month with blank income or expense lines cannot be finalized. ⟨src: r:r3⟩
7. Every upload and figure edit is recorded with who did it and when; these records cannot be altered or deleted. ⟨src: r:r9⟩

### Journey 2 — Re-uploading a month and handling a duplicate

1. The Bookkeeper (or the Owner) uploads a corrected spreadsheet for a month that was already loaded. ⟨src: p:p2, p:p1, a:a1, r:r5⟩
2. If the new file is byte-identical to the most recent import for that month, the system detects the duplicate and prompts the uploader to confirm or cancel; only the user who initiated that specific upload may respond. ⟨src: d:x8, r:r1⟩
3. If the uploader cancels, nothing changes and no new Spreadsheet Import record is written. ⟨src: d:x8⟩
4. If the uploader confirms — or the file differs from the prior one — the system creates a new Spreadsheet Import record. Each import row is uniquely identified by its own id and upload timestamp in addition to file name and month covered, so both the prior and the new import records are retained without violating the one-per-(file name, month) figure identity. ⟨src: r:r5, r:r8, d:x8⟩
5. The new figures replace the prior month's Revenue Lines, Expense Lines, and Cash Balance; the Monthly Financials summary recomputes and both import records remain visible in the month's upload history. ⟨src: r:r5, r:r4⟩
6. The replacement is refused if the month has been marked reviewed and locked; the Accountant must first reopen the month (see Journey 5). ⟨src: r:r7, d:x2⟩

### Journey 3 — Owner sets and approves a budget

1. The Owner opens the budgets view and proposes a Budget for a category and period (for example Q2 Marketing at $16,000), or the Bookkeeper proposes a change. ⟨src: p:p1, a:a9, n:n4⟩
2. A Budget must reference a valid existing period and, where applicable, an existing Department; a proposal against a missing period or Department is rejected. ⟨src: r:r10⟩
3. A Budget change takes effect only after the single approver — the Owner — approves it; when the Owner proposes, they may approve in the same act. ⟨src: d:approval_workflow, a:a9⟩
4. On approval the Budget becomes active and appears in the affected Department's budget view; the change is recorded with who approved it and when. ⟨src: r:r9, a:a7⟩

### Journey 4 — Manager reviews their department

1. The Manager signs in and opens their own Department; they see its budgets and linked expense lines only. ⟨src: p:p3, a:a8, a:a7, n:n5, r:r2⟩
2. Any Department the Manager has not been granted — plus org-wide Monthly Financials, KPIs, and Cash Balances — is hidden from them. ⟨src: r:r2, r:r1⟩
3. If the Owner has granted the Manager access to an additional Department, that Department also appears in read-only form; the Manager can never edit any figure. ⟨src: d:x7, r:r1⟩
4. The Manager compares each Budget against actual Expense Lines for the period to gauge spend versus plan. ⟨src: a:a7, n:n3⟩

### Journey 5 — Accountant closes and reopens a period

1. At period close the Accountant opens the finalized Monthly Financials and reviews the figures. ⟨src: p:p4, a:a10, n:n1⟩
2. Where needed, the Accountant exports the month's summary as Excel for their working papers. ⟨src: a:a11, d:data_export⟩
3. The Accountant marks the month reviewed, moving it to `reviewed`; this locks all of the month's Revenue Lines, Expense Lines, and Cash Balance against uploads, edits, and archiving. ⟨src: r:r7, d:x2⟩
4. The system records the review action with who did it and when. ⟨src: r:r9⟩
5. If a correction is later required, only the Accountant may reopen the reviewed month, returning it to `draft` so the Owner or Bookkeeper can edit; after edits, the Accountant marks it reviewed again. ⟨src: d:x2, r:r7⟩

### Journey 6 — Owner reorganizes a Department

1. The Owner decides to archive or reorganize a Department that still has linked Budgets and Expense Lines. ⟨src: p:p1, n:n5, r:r13⟩
2. A Department cannot be archived while any Budget or Expense Line is still assigned to it; the Owner must first reassign those lines to another Department. ⟨src: r:r13, d:x5⟩
3. Reassigning an Expense Line changes its `department_id`, which is a figure edit and is therefore blocked for any line in a reviewed month. When affected Expense Lines fall in reviewed months, the Accountant reopens each such month first; the Owner then performs the reassignment, and the Accountant re-reviews the months. ⟨src: r:r7, d:x2, r:r13, d:x5⟩
4. Once no Budgets or Expense Lines remain linked, the Owner archives the Department; it is soft-deleted and can be restored later by the Owner. ⟨src: r:r13, d:deletion, p:p1⟩

### Journey 7 — Owner reviews KPIs and trends

1. The Owner opens the dashboard and reviews each KPI's value against its target for the period; KPI values are computed from the month's Monthly Financials and lines (for example Gross Margin from net profit over total income). ⟨src: p:p1, a:a6, n:n7, r:r4⟩
2. The Owner compares a KPI across periods to spot trends, for instance gross margin across quarters. ⟨src: a:a12, n:n7⟩
3. All figures are shown rounded to whole dollars and in USD only; a negative net profit displays as a negative number. ⟨src: d:x3, r:r6⟩

## Non-goals

### Explicitly out of scope

The items below are deliberately excluded from v1. For each, the nearest capability that *is* in scope is named so a reader does not assume it by proximity.

- **No customer invoicing.** The app neither generates nor sends invoices to customers. ⟨src: g:g1⟩ A reader might assume that because it holds Revenue Lines and income totals it can bill customers from them; it cannot. The nearest in-scope behaviour is recording income as Revenue Lines and rolling them into a month's total income. ⟨src: n:n2, n:n1, r:r4⟩
- **No direct bank or accounting-software connection.** The app does not link to bank accounts or external accounting tools, and it pulls no figures automatically. ⟨src: g:g2, d:integrations⟩ A reader might assume Cash Balances and monthly figures sync live from a bank feed; they do not. The nearest in-scope behaviour is the Bookkeeper manually uploading a month's Excel file as a Spreadsheet Import and entering Cash Balances by hand. ⟨src: a:a1, n:n8, a:a4, n:n6⟩
- **No payroll or payment processing.** The app does not run payroll or move money. ⟨src: g:g3, d:integrations⟩ A reader might assume that recording an Expense Line with a vendor triggers a payment; it does not. The nearest in-scope behaviour is recording such costs as Expense Lines attributed to a Department. ⟨src: n:n3, n:n5⟩
- **No automatic forecasting or projection.** The app does not predict or project future financials. ⟨src: g:g4⟩ A reader might assume KPIs and period comparisons extrapolate future months; they only reflect already-loaded figures. The nearest in-scope behaviour is reviewing KPIs against their targets and comparing them across past periods. ⟨src: a:a6, a:a12, n:n7⟩

### Boundaries a reader might over-read

- **No multi-business separation.** The app serves this one business only and does not partition data for multiple organisations. ⟨src: d:tenancy⟩ A reader might assume departments imply tenant isolation; Departments only scope a Manager's view within the single business. The nearest in-scope behaviour is per-Department visibility for Managers. ⟨src: n:n5, r:r2⟩
- **No external/customer access.** No outside party logs in or opens a shared link; only the four internal actors have accounts. ⟨src: d:external_access, d:user_accounts⟩ A reader might assume the Accountant is an outside portal user; the Accountant is an internal read-only account holder. ⟨src: p:p4⟩
- **No self-service report builder.** Users cannot define their own reports or custom fields; the dashboard shows fixed totals, counts, and KPIs. ⟨src: d:reporting, d:customization⟩ A reader might assume they can compose arbitrary reports; the nearest in-scope behaviour is the fixed dashboard plus Excel/CSV export of Monthly Financials. ⟨src: a:a11, d:data_export⟩
- **No offline use.** The app works online only and does not queue or sync work done offline. ⟨src: d:offline⟩ A reader might assume figures can be edited without a connection; they cannot. Online editing through the dashboard is the only supported path. ⟨src: r:r12⟩

## Glossary

### Actors

- **Owner** — Business owner who reviews overall financial health and trends; holds edit rights over figures and sets budgets. ⟨src: p1⟩
- **Bookkeeper** — Staff member who maintains the source spreadsheets and updates monthly figures. ⟨src: p2⟩
- **Manager** — Department lead who views budgets and actuals for their own department in read-only form. ⟨src: p3⟩
- **Accountant** — External advisor who reviews numbers at period close and locks reviewed months; read-only otherwise. ⟨src: p4⟩

### Nouns

- **Monthly Financials** — A single month's summary of total income, total expenses, and net profit for the business. ⟨src: n1⟩
- **Revenue Line** — One income category for a given month, with a category, month, and amount. ⟨src: n2⟩
- **Expense Line** — One cost category for a given month, with a category, month, amount, and vendor. ⟨src: n3⟩
- **Budget** — A planned amount for a category over a period. ⟨src: n4⟩
- **Department** — A part of the business that owns certain budgets and expense lines, with a name, manager, and cost center code. ⟨src: n5⟩
- **Cash Balance** — The running cash position of an account as of a specific date. ⟨src: n6⟩
- **KPI** — A tracked metric shown on the dashboard, with a name, value, target, and period. ⟨src: n7⟩
- **Spreadsheet Import** — A record of an uploaded Excel file, capturing file name, upload date, month covered, and who uploaded it. ⟨src: n8⟩

### Related terms

- **Net profit** — For a month, total income minus total expenses over that month's lines. ⟨src: r4⟩
- **Reviewed month** — A Monthly Financials record the Accountant has marked reviewed, locking its lines against edits. ⟨src: r7⟩
- **Finalized month** — A Monthly Financials record whose income and expense lines are both present and which is closed to further drafting. ⟨src: r3⟩
- **Cost center code** — The identifier assigned to a Department. ⟨src: n5⟩
- **USD** — The single currency in which all amounts are recorded and displayed; no mixed currencies are permitted. ⟨src: r6⟩

## Decision ledger (complete)

_Every product decision this spec is built on. "assumed" rows carry the confidence of the assumption — an implementer should confirm low-confidence assumptions before building against them (see AGENTS.md)._

| Decision | Answer | How settled | Confidence |
|---|---|---|---|
| Do you start with existing data? ⟨src: d:data_import⟩ | Import from a spreadsheet/CSV once | assumed | 95% |
| Do outside parties (customers, clients, vendors) use the app directly? ⟨src: d:external_access⟩ | No — outsiders only receive emails/PDFs/messages | assumed | 95% |
| What do people need to see across many records? ⟨src: d:reporting⟩ | A dashboard with totals and counts | assumed | 95% |
| Is this for one business, or will many separate businesses use it with their data kept apart? ⟨src: d:tenancy⟩ | One business (ours) | assumed | 95% |
| Who needs an account to use the app? ⟨src: d:user_accounts⟩ | Several people log in, possibly with different powers | assumed | 95% |
| Do some actions need someone else's approval first? ⟨src: d:approval_workflow⟩ | One approver | answered | 100% |
| Do you need a record of who changed what and when? ⟨src: d:audit_trail⟩ | Just created/updated by whom and when | assumed | 53% |
| Does it hold data with special legal handling (health, payment cards, minors)? ⟨src: d:compliance_sensitivity⟩ | Ordinary business data | assumed | 97% |
| Does it need to connect to other tools? ⟨src: d:integrations⟩ | No | assumed | 95% |
| Must it work without internet? ⟨src: d:offline⟩ | Online only | assumed | 99% |
| Where is it used? ⟨src: d:platform⟩ | In a browser, on desktop and phone | assumed | 81% |
| Do different people have different powers? ⟨src: d:roles⟩ | An owner/admin plus staff with fewer powers | assumed | 95% |
| When an uploaded spreadsheet has some invalid or unparseable rows, what happens? ⟨src: d:x1⟩ | Reject the whole file until fixed | assumed | 45% |
| Can a month that the Accountant marked reviewed (and locked per r7) be reopened for edits? ⟨src: d:x2⟩ | Only the Accountant can reopen it | assumed | 40% |
| Can each business customize the app? ⟨src: d:customization⟩ | No — everyone gets the same thing | assumed | 72% |
| Do people need to get their data out? ⟨src: d:data_export⟩ | Download lists as CSV/Excel | assumed | 95% |
| How much data will there be? ⟨src: d:data_scale⟩ | Hundreds of records | assumed | 60% |
| When something is deleted, what really happens? ⟨src: d:deletion⟩ | It's archived and can be restored | assumed | 76% |
| How do additional people get access? ⟨src: d:invite_flow⟩ | An admin invites them | assumed | 96% |
| Languages and regions? ⟨src: d:localization⟩ | One language, one country | assumed | 95% |
| How does the app reach people when something happens? ⟨src: d:notifications⟩ | Email | assumed | 54% |
| Must anything happen automatically on a schedule? ⟨src: d:recurring_scheduled⟩ | Records get created automatically (recurring invoices, appointments, reports) | answered | 100% |
| How are negative net profit, zero lines, and cent rounding handled in figures and KPIs? ⟨src: d:x3⟩ | Round to whole dollars for display | assumed | 55% |
| When the Owner and Bookkeeper edit the same Revenue/Expense line at once, what happens? ⟨src: d:x4⟩ | Last save wins | answered | 100% |
| What happens to budgets and expense lines when a Department is deleted or reorganized? ⟨src: d:x5⟩ | Require reassigning them to another department | assumed | 41% |
| Can a Manager's per-department view (r2) be extended, e.g. delegated or cross-department access? ⟨src: d:x7⟩ | Owner can grant additional departments | assumed | 49% |
| If the same month's spreadsheet is uploaded twice in quick succession (double-click/retry), how is it treated? ⟨src: d:x8⟩ | Detect identical file and ask to confirm | assumed | 45% |
| What happens when two people edit the same thing at once? ⟨src: d:concurrency⟩ | Rare; the last save wins | assumed | 56% |
| How do people sign in? ⟨src: d:identity_provider⟩ | Email + password | assumed | 45% |
| How long is data kept? ⟨src: d:retention⟩ | Until someone deletes it | assumed | 97% |
| How is a Cash Balance's 'as of date' and month attribution handled across timezones/month-end? ⟨src: d:x6⟩ | Date-only in the business's single timezone | assumed | 63% |
