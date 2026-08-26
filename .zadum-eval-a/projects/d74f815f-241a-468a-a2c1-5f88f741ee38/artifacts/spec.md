> ⚠️ **NOT DELIVERABLE — 1 gate(s) failed.** the critic returned fail (score 6.5).
>
> The Design Sheet (`design-sheet.md`) remains the source of truth. Fix these and recompile; do not resolve a contradiction by choosing one side of it.

> ⚠️ **DRAFT — THIS SPEC DID NOT PASS REVIEW.** The critic returned `fail` (score 6.5) after 6 violation(s) and 2 omission(s) survived the repair pass.
>
> Do not treat it as the source of truth. The Design Sheet (`design-sheet.md`) still is; fix the findings below (full list in `compile-report.json`) and recompile.
>
> - data_model × lifecycles (medium) at "Account Line lifecycle (states imported/flagged/unmapped/mapped) vs Import Staging Row model & R-6": The data model and R-6 state emphatically that unresolved/invalid rows are held as Import Staging Rows and 'no Account Line is created for it until it is mapped'; a 'category-less Account Line can never exist'. But the Account Line lifecycle starts in `imported` and transits through `flagged` and `unmapped` states (and `mapped → unmapped`), which models Account Lines existing before mapping and without a category — the opposite of R6's implementation.
> - actors_permissions × lifecycles (medium) at "Dashboard View lifecycle 'Who' column vs permissions matrix and S-21": The permissions matrix grants Bookkeeper ✓*(4) for Open/Save Dashboard View, and S-21 says 'Given the Bookkeeper has saved a Dashboard View'. But the Dashboard View lifecycle lists only 'Owner' as the actor for draft→saved, saved→archived, and archived→saved, denying the Bookkeeper a capability the matrix and a scenario grant.
> - r9 (medium) at "Permissions matrix row 'Restore an archived record' (Bookkeeper ✓) applied to the User entity (which has archived_by/archived_at)": R-9 restricts all user-account management to the Owner ('Bookkeepers, Managers, and Accountants cannot manage user accounts'). Yet the matrix grants Bookkeeper an unqualified '✓' to Restore an archived record, and User is a soft-deletable record. A Bookkeeper restoring an archived User account would be managing an account, contradicting R9.
> - r12 × r4 (medium) at "R-12 delete guard vs R-4 edit lock / Account Line 'Edit lock'": R-12 lets a Category be archived only after its Account Lines are 'reassigned to another Category or removed'. R-4 (and the Account Line Edit lock) forbid editing OR archiving any Account Line whose period is `closed`. If a Category's only lines live in closed periods, R-12's mandatory escape (reassign/remove those lines) is exactly what R-4 prohibits, so the Category can never be archived without first reopening a closed period — R-12's escape hatch is R-4's prohibition.
> - r12 × r4 (low) at "R-12 Verify: 'reassign or archive those lines, retry → succeeds'": R-12's verification test instructs the tester to reassign or archive the referencing Account Lines, but if those lines belong to a closed Period R-4 forbids that step, so the test cannot be executed for such a Category.

# Specification — internal dashboard based on our excel files with financials

_Compiled from Design Sheet v7 (internal-dashboard, crud-saas). Trace markers ⟨src: …⟩ point at the Sheet items and decisions each line derives from: d: decision, r: rule, a: action, n: noun, p: actor, g: non-goal._

**How to use this spec:** the Design Sheet (design-sheet.md) is the source of truth; this spec is derived from it. Rules are inviolable. If a task would violate one, stop and cite it. If a task changes the design, update the Sheet first.

## Overview

### What this is

An internal financial dashboard for a single business that turns Bookkeeper-maintained Excel files into reviewable revenue, expense, and profit figures per period. ⟨src: d:tenancy⟩ ⟨src: n:n1⟩ ⟨src: n:n7⟩ It is a CRUD-plus-dashboard tool: spreadsheets are imported, their rows mapped to categories, and the resulting totals are displayed on saved dashboard views. ⟨src: d:reporting⟩ ⟨src: n:n8⟩

### Who it is for

Four actor types log in with different powers: the Owner reviews the financial picture and makes decisions, the Bookkeeper maintains the numbers and uploads the Excel files, the Manager views figures for their own assigned area only, and the Accountant reviews period totals for tax and reporting. ⟨src: p:p1⟩ ⟨src: p:p2⟩ ⟨src: p:p3⟩ ⟨src: p:p4⟩ ⟨src: d:user_accounts⟩ Roles are a fixed owner/admin-plus-staff split rather than custom roles. ⟨src: d:roles⟩

### Core value loop

1. The Bookkeeper uploads an Excel Upload for a period. ⟨src: a:a1⟩ ⟨src: r:r13⟩
2. Valid rows import; rows that fail validation are flagged, and rows whose category is not yet resolved are held for mapping. ⟨src: d:x3⟩ ⟨src: d:x4⟩
3. The Bookkeeper maps each row to a Category (creating categories as needed) and corrects any wrong Account Lines. ⟨src: a:a2⟩ ⟨src: a:a11⟩ ⟨src: a:a3⟩
4. Once every row for a period is mapped, its Revenue Figure, Expense Figure, and Profit Summary appear on dashboards. ⟨src: r:r3⟩ ⟨src: d:x4⟩ ⟨src: n:n5⟩ ⟨src: n:n6⟩ ⟨src: n:n7⟩
5. The Owner opens and saves Dashboard Views and reviews Profit Summaries; the Manager views only their assigned-area figures; the Accountant reviews period revenue. ⟨src: a:a5⟩ ⟨src: a:a10⟩ ⟨src: a:a4⟩ ⟨src: a:a6⟩ ⟨src: a:a8⟩ ⟨src: r:r2⟩
6. After review the Owner closes the Period, locking its figures; the Owner alone may reopen it to fix a figure, with every change logged. ⟨src: a:a7⟩ ⟨src: r:r4⟩ ⟨src: d:x2⟩ ⟨src: r:r10⟩

### Platform and delivery

Web application used in a browser on desktop and phone. ⟨src: d:platform⟩ Online only, no offline mode. ⟨src: d:offline⟩ Sign-in is by email and password. ⟨src: d:identity_provider⟩ Notifications are delivered by email. ⟨src: d:notifications⟩ One language and one country; all amounts are recorded in the org's single configured currency and files are assumed to already use it. ⟨src: d:localization⟩ ⟨src: r:r7⟩ ⟨src: d:x8⟩

### Scale and tenancy

Single organisation — one business, one shared pool of records with filters, not separate workspaces. ⟨src: d:tenancy⟩ ⟨src: d:workspace_structure⟩ Expected data volume is small, on the order of hundreds of records. ⟨src: d:data_scale⟩ Data is ordinary business data with no special legal handling. ⟨src: d:compliance_sensitivity⟩ Records are kept until an actor deletes them, and deletion archives a record so it can be restored rather than removing it. ⟨src: d:retention⟩ ⟨src: d:deletion⟩ Every upload, correction, mapping, and period close/reopen is written to an unalterable audit history. ⟨src: r:r10⟩ ⟨src: d:audit_trail⟩

### Out of scope (v1 summary)

This version does not connect to bank accounts or pull transactions automatically, does not generate or send customer invoices, does not file taxes or produce official accounting statements, does not let external clients or the public log in, and does not handle payroll processing or payments. ⟨src: g:g1⟩ ⟨src: g:g2⟩ ⟨src: g:g3⟩ ⟨src: g:g4⟩ ⟨src: g:g5⟩

## Actors & permissions

Four human actors sign in with email + password; there are no anonymous or public roles. ⟨src: d:identity_provider, g:g4⟩

- **Owner** — reviews the whole financial picture and administers access. ⟨src: p:p1⟩
- **Bookkeeper** — maintains the numbers and uploads the Excel files. ⟨src: p:p2⟩
- **Manager** — department lead who views figures for their own area only. ⟨src: p:p3⟩
- **Accountant** — external advisor who reviews period totals for reporting. ⟨src: p:p4⟩

### Permissions matrix

Every cell is exactly ✓, ✗, or ✓* (a conditional whose rule is spelled out in the numbered notes below).

| Action | Owner | Bookkeeper | Manager | Accountant |
|---|---|---|---|---|
| Upload Excel Upload | ✓ | ✓ | ✗ | ✗ |
| Map imported rows to a Category | ✓ | ✓ | ✗ | ✗ |
| Correct Account Line | ✓* (1) | ✓* (1) | ✗ | ✗ |
| Create Category | ✓ | ✓ | ✗ | ✗ |
| Archive Category | ✓* (2) | ✓* (2) | ✗ | ✗ |
| Restore an archived record | ✓ | ✓ | ✗ | ✗ |
| Close Period | ✓ | ✗ | ✗ | ✗ |
| Reopen Period | ✓ | ✗ | ✗ | ✗ |
| Approve reopening of a closed Period | ✓ | ✗ | ✗ | ✗ |
| View Revenue Figure | ✓ | ✓ | ✗ | ✓ |
| View Expense Figure | ✓ | ✓ | ✓* (3) | ✓ |
| View Profit Summary | ✓ | ✓ | ✗ | ✓ |
| Generate Profit Summary | ✗ | ✗ | ✗ | ✗ |
| Open Dashboard View | ✓* (4) | ✓* (4) | ✗ | ✗ |
| Save Dashboard View | ✓* (4) | ✓* (4) | ✗ | ✗ |
| Export figures as CSV | ✓ | ✓ | ✓* (3) | ✓ |
| Invite User | ✓ | ✗ | ✗ | ✗ |
| Assign role & allowed areas | ✓ | ✗ | ✗ | ✗ |
| View audit trail | ✓ | ✗ | ✗ | ✗ |

**Notes**

1. Correct Account Line and Archive Category succeed only while the target Period's status is `open`; a `closed` Period is locked from all edits until the Owner reopens it. ⟨src: r:r4, d:x2⟩
2. Archive Category is permitted only when no Account Line references that Category; the lines must be reassigned or removed first. ⟨src: r:r12⟩
3. A Manager may view or export only Expense Figures whose Category is one of that Manager's allowed areas; Revenue Figures, Profit Summary, and company-wide totals stay hidden. ⟨src: r:r2, d:x5, n:n9⟩
4. Open and Save Dashboard View apply only to Views whose `owner` field is the acting user; saved Views are personal and are not visible to any other actor, the Owner included. ⟨src: n:n8, default⟩

**Row rationale.** Upload, mapping, correction, category creation, close, reopen, and Dashboard-View saving are edit actions restricted to the Owner and Bookkeeper. ⟨src: r:r1⟩ Reopening a closed Period and approving that reopen are limited to the Owner acting as the single approver, overriding the a9 example that showed the Bookkeeper reopening. ⟨src: r:r4, d:x2, d:approval_workflow⟩ Generate Profit Summary is never a manual action — the system computes it as Revenue Figure minus Expense Figure for the same Period. ⟨src: r:r5, n:n7⟩ Inviting Users and assigning roles or allowed areas belong to the Owner alone. ⟨src: r:r9, r:r11⟩ There is no undo action in v1; concurrent edits resolve by last-write-wins. ⟨src: d:concurrency⟩

### Data-visibility boundaries

These boundaries agree with the matrix cell for cell.

- **Owner** — sees every Excel Upload, Account Line, Category, Period, Revenue Figure, Expense Figure, and Profit Summary across the whole business, plus the full audit trail. ⟨src: p:p1, d:record_ownership, d:audit_trail⟩
- **Bookkeeper** — sees and edits all financial data (uploads, account lines, categories, figures, periods) but cannot close, reopen, or approve Periods, cannot invite or manage Users, and cannot view the audit trail. ⟨src: p:p2, r:r1, r:r9⟩ (audit-view restriction is default) ⟨src: default⟩
- **Manager** — sees only Expense Figures whose Category is in that Manager's allowed areas; Revenue Figures, Profit Summary, company totals, other departments' figures, uploads, and User administration are all hidden. ⟨src: p:p3, r:r2, d:x5, n:n9⟩
- **Accountant** — view-only across all Periods' Revenue Figures, Expense Figures, and Profit Summaries for reporting, and cannot edit anything, upload, save Dashboard Views, manage Users, or view the audit trail. ⟨src: p:p4, r:r1⟩
- Saved Dashboard Views are personal to their `owner`; only that user may open them, and the Owner is not exempt from this rule. ⟨src: n:n8, default⟩

## Data model

This section defines every stored entity behind the dashboard, its fields, relationships, identifiers, delete behaviour, audit fields, and the formulas for all derived figures. All entities live in one shared pool for a single business; there is no per-tenant partitioning. ⟨src: d:tenancy⟩ ⟨src: d:workspace_structure⟩

### Conventions

- **Identifiers.** Every entity has a system-generated `id` (UUID, required, immutable) as its primary key unless a natural key is named below. ⟨src: default⟩
- **Money.** All monetary amounts are stored as signed integers in minor units (cents) of the org's single configured currency; there is no per-row currency field. ⟨src: r:r7⟩ ⟨src: d:x6⟩ ⟨src: d:x8⟩
- **Sign convention.** An Account Line stores a positive amount for an ordinary income or expense entry and a negative amount for a refund (against income) or a credit (against an expense). Revenue and expense totals sum these signed amounts within their `type`, so refunds and credits reduce the relevant total. ⟨src: d:x6⟩
- **Currency source.** The configured currency code is held once at org level in `OrgSettings.currency_code` (ISO 4217, required); imports assume every file already uses it. ⟨src: r:r7⟩ ⟨src: d:x8⟩
- **Deletion.** Deletion is soft everywhere: a deleted record sets `archived_at` and `archived_by` and can be restored. No hard delete and no automatic purge exists in v1; records are kept until an actor archives them. ⟨src: d:deletion⟩ ⟨src: d:retention⟩
- **Audit fields.** Every mutable entity carries `created_at`, `created_by`, `updated_at`, `updated_by` (all required). Concurrent edits resolve last-write-wins using `updated_at`. ⟨src: d:audit_trail⟩ ⟨src: d:concurrency⟩

### OrgSettings

Single-row configuration for the one business. ⟨src: d:tenancy⟩

| Field | Type | Required | Notes |
|---|---|---|---|
| id | UUID | yes | Single row |
| currency_code | string (ISO 4217) | yes | The one currency all amounts use ⟨src: r:r7⟩ ⟨src: d:x8⟩ |

### Period ⟨src: n:n4⟩

| Field | Type | Required | Notes |
|---|---|---|---|
| id | UUID | yes | |
| label | string | yes | Unique across all periods ⟨src: r:r14⟩ |
| granularity | enum(month, quarter, year) | yes | Fixed calendar periods only ⟨src: d:x7⟩ |
| start_date | date | yes | Aligned to calendar boundary ⟨src: d:x7⟩ |
| end_date | date | yes | Aligned to calendar boundary ⟨src: d:x7⟩ |
| status | enum(open, closed) | yes | Closed locks figures from edits ⟨src: r:r4⟩ |
| created_by / created_at / updated_by / updated_at | audit | yes | ⟨src: d:audit_trail⟩ |
| archived_by / archived_at | audit | no | Soft delete ⟨src: d:deletion⟩ |

- **Uniqueness.** `label` is unique so figures are never split across two records for the same month, quarter, or year. ⟨src: r:r14⟩
- **Relationships.** Owns many Account Lines, one Revenue Figure, many Expense Figures, one Profit Summary. ⟨src: n:n2⟩ ⟨src: n:n5⟩ ⟨src: n:n6⟩ ⟨src: n:n7⟩

### Category ⟨src: n:n3⟩

| Field | Type | Required | Notes |
|---|---|---|---|
| id | UUID | yes | |
| name | string | yes | Trimmed; compared case-insensitively for import matching ⟨src: a:a2⟩ |
| type | enum(income, expense) | yes | ⟨src: n:n3⟩ |
| parent_group_id | UUID → Category | no | Optional grouping parent ⟨src: n:n3⟩ |
| created_by / created_at / updated_by / updated_at | audit | yes | ⟨src: d:audit_trail⟩ |
| archived_by / archived_at | audit | no | Soft delete ⟨src: d:deletion⟩ |

- **Delete guard.** A Category cannot be archived while any active Account Line references it; its lines must be reassigned or removed first. ⟨src: r:r12⟩
- **Relationships.** Has many Account Lines; may reference a parent Category; may be listed in a Manager's `allowed_areas`. ⟨src: n:n2⟩ ⟨src: r:r2⟩

### Excel Upload ⟨src: n:n1⟩

| Field | Type | Required | Notes |
|---|---|---|---|
| id | UUID | yes | |
| file_name | string | yes | Original file name ⟨src: n:n1⟩ ⟨src: r:r13⟩ |
| stored_file_ref | string | yes | Reference to the retained uploaded file ⟨src: d:attachments⟩ |
| period_id | UUID → Period | yes | Period covered ⟨src: n:n1⟩ ⟨src: r:r13⟩ |
| uploaded_by | UUID → User | yes | ⟨src: n:n1⟩ ⟨src: r:r13⟩ |
| upload_date | datetime | yes | ⟨src: n:n1⟩ |
| version_number | integer | yes | Increments per re-upload for the same period ⟨src: d:x1⟩ |
| is_active | boolean | yes | Exactly one active upload per period supplies figures ⟨src: d:x1⟩ ⟨src: r:r8⟩ |
| parse_status | enum(parsed, imported_with_errors) | yes | `imported_with_errors` when some rows staged as invalid ⟨src: d:x3⟩ |
| archived_by / archived_at | audit | no | Soft delete ⟨src: d:deletion⟩ |

- **Required-before-import.** An upload must record a file, a period covered, and an uploader before it can be imported. ⟨src: r:r13⟩
- **Re-upload behaviour.** Re-uploading a file for a period creates a new version and switches the active version; the prior version is kept and can be rolled back, so figures are replaced rather than added. ⟨src: r:r8⟩ ⟨src: d:x1⟩
- **File retention.** The uploaded file itself is retained after import (never discarded) to support rollback. ⟨src: d:x1⟩ ⟨src: d:attachments⟩

### Import Staging Row ⟨src: a:a1⟩

A staging record for a raw spreadsheet row that has not yet become an Account Line. Staging rows are **not** Account Lines and are never counted in any figure. ⟨src: d:x3⟩ ⟨src: d:x4⟩

| Field | Type | Required | Notes |
|---|---|---|---|
| id | UUID | yes | |
| upload_id | UUID → Excel Upload | yes | Source upload/version ⟨src: n:n1⟩ |
| row_number | integer | yes | Position in the source sheet |
| raw_category_text | string | yes | Verbatim category cell ⟨src: a:a2⟩ |
| raw_amount_text | string | yes | Verbatim amount cell |
| raw_type_text | string | yes | Verbatim income/expense cell |
| resolved_category_id | UUID → Category | no | Set once mapped ⟨src: a:a2⟩ |
| status | enum(unmapped, invalid, resolved, discarded) | yes | See resolution rules below ⟨src: d:x3⟩ ⟨src: d:x4⟩ |

- **unmapped:** amount and type parsed, but `raw_category_text` did not match any Category. ⟨src: d:x4⟩
- **invalid:** amount or type could not be parsed. ⟨src: d:x3⟩
- **resolved:** mapped to a Category and promoted to an Account Line. ⟨src: a:a2⟩
- **discarded:** deliberately removed by an editor so an irreparable row cannot block the period. ⟨src: d:x3⟩
- **Blocking rule.** A period shows figures only when it has zero staging rows in `unmapped` or `invalid` status; every such row must be resolved (mapped and promoted) or discarded first. ⟨src: r:r3⟩ ⟨src: d:x4⟩

### Account Line ⟨src: n:n2⟩

A fully resolved, categorised line that contributes to figures. An Account Line is only ever created from a staging row after a Category is assigned, so it always has exactly one Category and one Period. ⟨src: r:r6⟩

| Field | Type | Required | Notes |
|---|---|---|---|
| id | UUID | yes | |
| category_id | UUID → Category | yes | Exactly one Category; never null ⟨src: r:r6⟩ |
| period_id | UUID → Period | yes | Exactly one Period ⟨src: r:r6⟩ |
| type | enum(income, expense) | yes | Matches the Category's type ⟨src: n:n2⟩ |
| category_name_snapshot | string | yes | Category name as imported ⟨src: n:n2⟩ |
| amount | integer (minor units) | yes | Signed; negative for refund/credit ⟨src: d:x6⟩ |
| source_upload_id | UUID → Excel Upload | yes | Version this line came from ⟨src: d:x1⟩ |
| is_correction | boolean | yes | True if manually edited after import ⟨src: a:a3⟩ |
| created_by / created_at / updated_by / updated_at | audit | yes | ⟨src: d:audit_trail⟩ |
| archived_by / archived_at | audit | no | Soft delete ⟨src: d:deletion⟩ |

- **Membership invariant.** Every Account Line belongs to exactly one Category and one Period; neither field may be null. Because unresolved rows stay as Import Staging Rows, no category-less Account Line can exist. ⟨src: r:r6⟩
- **Edit lock.** Account Lines whose period is `closed` cannot be edited or archived until the Owner reopens the period. ⟨src: r:r4⟩ ⟨src: d:x2⟩
- **Correction.** Bookkeeper corrections update `amount` (or `category_id`) on an open period and set `is_correction = true`. ⟨src: a:a3⟩

### Revenue Figure (derived) ⟨src: n:n5⟩

One per period. `amount = SUM(Account Line.amount WHERE type = income AND period_id = this.period_id AND archived_at IS NULL)`. Recomputed after each import, mapping, or correction. ⟨src: n:n5⟩ ⟨src: r:r5⟩

| Field | Type | Required | Notes |
|---|---|---|---|
| id | UUID | yes | |
| period_id | UUID → Period | yes | One figure per period |
| amount | integer (minor units) | yes | Signed sum of income lines ⟨src: d:x6⟩ |
| source_upload_id | UUID → Excel Upload | yes | Active version used ⟨src: n:n5⟩ ⟨src: d:x1⟩ |

### Expense Figure (derived) ⟨src: n:n6⟩

One per period per category. `amount = SUM(Account Line.amount WHERE type = expense AND period_id = this.period_id AND category_id = this.category_id AND archived_at IS NULL)`. Recomputed after each import, mapping, or correction. ⟨src: n:n6⟩

| Field | Type | Required | Notes |
|---|---|---|---|
| id | UUID | yes | |
| period_id | UUID → Period | yes | |
| category_id | UUID → Category | yes | The area/category the spend belongs to ⟨src: n:n6⟩ ⟨src: r:r2⟩ |
| amount | integer (minor units) | yes | Signed sum of expense lines ⟨src: d:x6⟩ |

### Profit Summary (derived) ⟨src: n:n7⟩

One per period. Recomputed whenever its period's figures change. ⟨src: n:n7⟩

| Field | Type | Required | Notes |
|---|---|---|---|
| id | UUID | yes | |
| period_id | UUID → Period | yes | One summary per period |
| revenue | integer (minor units) | yes | Copy of Revenue Figure.amount ⟨src: n:n5⟩ |
| expenses | integer (minor units) | yes | Sum of all Expense Figures for the period ⟨src: n:n6⟩ |
| net_profit | integer (minor units) | yes | `net_profit = revenue − expenses` ⟨src: r:r5⟩ |

- **Integrity invariant.** `net_profit` must always equal `revenue − expenses` for the same period. ⟨src: r:r5⟩

### Dashboard View ⟨src: n:n8⟩

| Field | Type | Required | Notes |
|---|---|---|---|
| id | UUID | yes | |
| name | string | yes | ⟨src: n:n8⟩ |
| owner_user_id | UUID → User | yes | The user who saved it ⟨src: n:n8⟩ ⟨src: a:a10⟩ |
| filters | JSON | no | Category/period filters ⟨src: n:n8⟩ |
| time_range | JSON | yes | e.g. last 12 months ⟨src: n:n8⟩ |
| created_by / created_at / updated_by / updated_at | audit | yes | ⟨src: d:audit_trail⟩ |
| archived_by / archived_at | audit | no | Soft delete ⟨src: d:deletion⟩ |

- **Ownership.** A saved Dashboard View is personal to its `owner_user_id`; it is not shared with other users, including the Owner actor. ⟨src: d:record_ownership⟩ ⟨src: n:n8⟩

### User ⟨src: n:n9⟩

| Field | Type | Required | Notes |
|---|---|---|---|
| id | UUID | yes | |
| name | string | yes | ⟨src: n:n9⟩ |
| email | string | yes | Unique login identifier ⟨src: d:identity_provider⟩ |
| password_hash | string | yes | Email + password sign-in ⟨src: d:identity_provider⟩ |
| role | enum(owner, bookkeeper, manager, accountant) | yes | Set at invite ⟨src: r:r11⟩ ⟨src: p:p1⟩ ⟨src: p:p2⟩ ⟨src: p:p3⟩ ⟨src: p:p4⟩ |
| status | enum(invited, active) | yes | Invited by the Owner ⟨src: a:a12⟩ ⟨src: d:invite_flow⟩ |
| allowed_areas | list of UUID → Category | conditional | Required and non-empty when role = manager; empty otherwise ⟨src: r:r2⟩ ⟨src: r:r11⟩ ⟨src: d:x5⟩ |
| created_by / created_at / updated_by / updated_at | audit | yes | ⟨src: d:audit_trail⟩ |
| archived_by / archived_at | audit | no | Soft delete ⟨src: d:deletion⟩ |

- **Uniqueness.** `email` is unique across all users. ⟨src: default⟩
- **Invite invariant.** Each user must have a role, and Managers must have their `allowed_areas` assigned, at invite time. ⟨src: r:r11⟩
- **Area scope.** A Manager may only be linked to Categories in `allowed_areas`; company-wide totals are not exposed to Managers. ⟨src: r:r2⟩ ⟨src: d:x5⟩

### AuditEntry ⟨src: r:r10⟩

Append-only history; entries are never updated or deleted. ⟨src: r:r10⟩ ⟨src: d:audit_trail⟩

| Field | Type | Required | Notes |
|---|---|---|---|
| id | UUID | yes | |
| action | enum(upload, map_line, correct_line, close_period, reopen_period) | yes | Every audited event type ⟨src: r:r10⟩ ⟨src: a:a1⟩ ⟨src: a:a2⟩ ⟨src: a:a3⟩ ⟨src: a:a7⟩ ⟨src: a:a9⟩ |
| actor_user_id | UUID → User | yes | Who did it ⟨src: r:r10⟩ |
| target_type | string | yes | Entity affected |
| target_id | UUID | yes | Record affected |
| occurred_at | datetime | yes | When it happened ⟨src: r:r10⟩ |
| detail | JSON | no | Before/after snapshot |

- **Immutability.** AuditEntry rows cannot be altered or removed after they are written. ⟨src: r:r10⟩

### Import contract

Applies when a Bookkeeper uploads a spreadsheet to feed the dashboard. ⟨src: a:a1⟩ ⟨src: d:data_import⟩

- **Accepted extensions and formats.** `.xlsx` and `.csv` only. ⟨src: d:data_import⟩ ⟨src: n:n1⟩
- **Required headers.** Each data row must supply four columns: `category` (text), `amount` (currency in the org's configured currency, minor-unit precision, optional leading minus for refunds/credits), `type` (text, one of `income` or `expense`), `period` (the period label text, matching an existing Period). ⟨src: n:n2⟩ ⟨src: d:x6⟩ ⟨src: d:x7⟩ ⟨src: r:r7⟩
- **Category resolution.** The `category` cell resolves to an existing Category by matching `Category.name`, comparing case-insensitively after trimming leading and trailing whitespace. A resolved row is promoted to an Account Line carrying that `category_id`. ⟨src: a:a2⟩ ⟨src: r:r6⟩
- **Rows that do not resolve.** A row whose category text matches no Category is stored as an Import Staging Row with status `unmapped` (not as an Account Line). A row whose amount or type cannot be parsed is stored with status `invalid`. Valid, resolvable rows import immediately as Account Lines. ⟨src: d:x3⟩ ⟨src: d:x4⟩ ⟨src: r:r6⟩
- **Effect on the period.** The period shows no figures while any staging row remains `unmapped` or `invalid`; each must be mapped (then promoted) or discarded before totals appear. Discarding is the exit path for an irreparable row. ⟨src: r:r3⟩ ⟨src: d:x4⟩ ⟨src: d:x3⟩
- **Currency handling.** Every amount is assumed to already be in the org's configured currency; no per-row currency is read or converted. ⟨src: r:r7⟩ ⟨src: d:x8⟩
- **File retention.** The uploaded file is retained (kept, not discarded) as an Excel Upload version to support replace-and-rollback. ⟨src: d:x1⟩ ⟨src: d:attachments⟩

## Lifecycles (state machines)

### Account Line

Each Account Line starts in `imported` and moves through 5 states.

States:
- `imported` — Imported: Row just brought in from the spreadsheet, awaiting validation.
- `flagged` — Flagged: Row failed validation and needs correction before it can be used.
- `unmapped` — Unmapped: Valid row not yet tied to a category.
- `mapped` — Mapped: Assigned to exactly one category and period; appears on dashboards.
- `locked` — Locked: Period is closed; the line cannot be edited.

| From | To | Who | When | Guard | ⟨src⟩ |
|---|---|---|---|---|---|
| `imported` | `unmapped` | system | row parses as a valid amount | row is valid | ⟨src: x3⟩ |
| `imported` | `flagged` | system | row fails to parse | row is invalid | ⟨src: x3⟩ |
| `flagged` | `unmapped` | Bookkeeper | Bookkeeper corrects the line | — | ⟨src: a3⟩ |
| `unmapped` | `mapped` | Bookkeeper | Bookkeeper maps the line to a category | exactly one category and period | ⟨src: a2, r6, x4⟩ |
| `mapped` | `unmapped` | Bookkeeper | Bookkeeper corrects or reassigns the line | period is open | ⟨src: a3, r4⟩ |
| `mapped` | `locked` | system | period is closed | — | ⟨src: r4⟩ |
| `locked` | `mapped` | system | period is reopened | — | ⟨src: r4, x2⟩ |

Terminal: none declared.

### Category

Each Category starts in `active` and moves through 2 states.

States:
- `active` — Active: In use for grouping account lines.
- `archived` — Archived: Retired but retained; can be restored.

| From | To | Who | When | Guard | ⟨src⟩ |
|---|---|---|---|---|---|
| `active` | `archived` | Bookkeeper | Bookkeeper archives the category | no account lines still assigned | ⟨src: r12, a11⟩ |
| `archived` | `active` | Bookkeeper | Bookkeeper restores the category | — | ⟨src: r12⟩ |

Terminal: none declared.

### Dashboard View

Each Dashboard View starts in `draft` and moves through 3 states.

States:
- `draft` — Draft: Arrangement of charts and filters being configured, not yet saved.
- `saved` — Saved: Stored view someone can open.
- `archived` — Archived: Retired but retained; can be restored.

| From | To | Who | When | Guard | ⟨src⟩ |
|---|---|---|---|---|---|
| `draft` | `saved` | Owner | Owner saves the view | — | ⟨src: a10⟩ |
| `saved` | `archived` | Owner | Owner archives the view | — |  |
| `archived` | `saved` | Owner | Owner restores the view | — |  |

Terminal: none declared.

### Excel Upload

Each Excel Upload starts in `draft` and moves through 4 states.

States:
- `draft` — Draft: Upload record started; file, period covered, and uploader being recorded.
- `parsing` — Parsing: File is being imported and rows validated.
- `active` — Active: Imported and serving as the current version for its period; bad rows flagged.
- `superseded` — Superseded: Replaced by a newer upload for the same period; retained for rollback.

| From | To | Who | When | Guard | ⟨src⟩ |
|---|---|---|---|---|---|
| `draft` | `parsing` | Bookkeeper | Bookkeeper imports the spreadsheet | file, period covered, and uploader recorded | ⟨src: a1, r13⟩ |
| `parsing` | `active` | system | parsing completes, valid rows imported and bad rows flagged | — | ⟨src: x3, a1⟩ |
| `active` | `superseded` | Bookkeeper | a new file is uploaded for the same period | — | ⟨src: r8, x1⟩ |
| `superseded` | `active` | Bookkeeper | Bookkeeper rolls back to this version | — | ⟨src: x1⟩ |

Terminal: none declared.

### Period

Each Period starts in `empty` and moves through 3 states.

States:
- `empty` — Empty: Period exists but has no imported and mapped figures yet.
- `open` — Open: Figures uploaded and mapped; visible on dashboards and editable.
- `closed` — Closed: Reviewed and locked; figures cannot be edited.

| From | To | Who | When | Guard | ⟨src⟩ |
|---|---|---|---|---|---|
| `empty` | `open` | system | upload imported and all rows mapped | all account lines mapped | ⟨src: r3, x4⟩ |
| `open` | `closed` | Owner | Owner closes the period after review | — | ⟨src: a7, r4⟩ |
| `closed` | `open` | Owner | Owner reopens the period | — | ⟨src: a9, r4, x2⟩ |

Terminal: none declared.

### User

Each User starts in `invited` and moves through 3 states.

States:
- `invited` — Invited: Owner has invited the person; awaiting first sign-in.
- `active` — Active: Has access with an assigned role and allowed areas.
- `deactivated` — Deactivated: Access revoked but record retained.

| From | To | Who | When | Guard | ⟨src⟩ |
|---|---|---|---|---|---|
| `invited` | `active` | system | invitee sets password and signs in | role and (for Managers) allowed areas assigned | ⟨src: a12, r11, invite_by_admin⟩ |
| `active` | `deactivated` | Owner | Owner deactivates the user | — | ⟨src: r9⟩ |
| `deactivated` | `active` | Owner | Owner reactivates the user | — | ⟨src: r9⟩ |

Terminal: none declared.

> ⚠️ Mechanical lifecycle check: 6 finding(s) remain — see compile-report.json.

## Rules & invariants

This section restates every Sheet rule as a numbered, testable invariant, names the entities and actions it constrains, and adds the invariants that follow from the decision log. Amounts, deletion, audit, and currency conventions referenced here are defined in the Data model section and are not re-derived. ⟨src: r:r10⟩

### Sheet rules

**R-1 — Editing is restricted to Owner and Bookkeeper.** Only the Owner and Bookkeeper may upload Excel Uploads, map rows, correct Account Lines, create or archive Categories, close or reopen Periods, and restore archived records; Managers and Accountants may only view and export. ⟨src: r:r1⟩ *Constrains:* actions a1, a2, a3, a7, a9, a11 and entities Excel Upload, Account Line, Category, Period. ⟨src: a:a1, a:a2, a:a3, a:a7, a:a9, a:a11⟩ *Verify:* sign in as a Manager and as an Accountant and attempt each edit action → each is rejected with 403; sign in as Owner and Bookkeeper → upload/map/correct/create succeed. ⟨src: r:r1⟩

**R-2 — Managers see only their assigned areas.** A Manager may view and export only Expense Figures whose Category is one of that Manager's `allowed_areas`; Revenue Figures, Profit Summary, and company-wide totals are hidden. ⟨src: r:r2, d:x5, n:n9⟩ *Constrains:* action a6, entities Expense Figure, User, Category. ⟨src: a:a6, n:n6⟩ *Verify:* assign a Manager `allowed_areas = [Marketing]`; request the Marketing Expense Figure → returned; request the Payroll Expense Figure, any Revenue Figure, or any Profit Summary → not found / 403. ⟨src: r:r2, d:x5⟩

**R-3 — A Period shows no figures until fully uploaded and mapped.** A Period's Revenue Figure, Expense Figures, and Profit Summary appear on dashboards only after an Excel Upload exists for that Period and every one of its parsed rows has been resolved into a categorised Account Line. ⟨src: r:r3, d:x4⟩ *Constrains:* action a1, a2, entities Period, Excel Upload, Account Line, Revenue Figure, Expense Figure, Profit Summary. ⟨src: a:a1, a:a2, n:n4⟩ *Verify:* upload a file leaving one row unresolved → the Period returns no totals; resolve the last row → totals become visible. ⟨src: r:r3, d:x4⟩

**R-4 — Closed Periods are locked from edits.** While a Period's `status = closed`, no Account Line, mapping, or figure for that Period may be edited; edits become possible only after the Owner reopens it. ⟨src: r:r4, d:x2⟩ *Constrains:* actions a3, a7, a9, entities Period, Account Line. ⟨src: a:a3, a:a7, a:a9, n:n4⟩ *Verify:* close a Period, then attempt to correct one of its Account Lines → rejected; reopen the Period as Owner, retry the correction → succeeds. ⟨src: r:r4, d:x2⟩

**R-5 — Profit Summary equals revenue minus expenses for its Period.** For every Period, `Profit Summary.net_profit = Revenue Figure.amount − Σ(Expense Figure.amount)` over that same Period, and the Profit Summary is computed by the system, never entered by hand. ⟨src: r:r5, n:n7⟩ *Constrains:* entities Revenue Figure, Expense Figure, Profit Summary. ⟨src: n:n5, n:n6, n:n7⟩ *Verify:* with revenue $148,000 and expenses $110,000, read the Profit Summary → net $38,000; change an underlying Account Line (in an open Period) → the recomputed net changes accordingly. ⟨src: r:r5⟩

**R-6 — Every Account Line belongs to exactly one Category and one Period.** A persisted Account Line always has a non-null `category_id` referencing exactly one Category and a non-null `period_id` referencing exactly one Period. Unresolved spreadsheet rows are held as Import staging rows and are **not** Account Lines; a row becomes an Account Line only at the moment it is mapped to a Category, so a category-less Account Line can never exist. ⟨src: r:r6, d:x4, d:x3⟩ *Constrains:* entity Account Line, Import staging row, action a2. ⟨src: n:n2, a:a2⟩ *Verify:* attempt to persist an Account Line with null `category_id` → rejected; import a file with an unmatched row → the row appears as an Import staging row (not on any figure), and no Account Line row exists for it until it is mapped. ⟨src: r:r6, d:x4⟩

**R-7 — Single currency across all data.** All amounts are stored in the org's one configured currency (`OrgSettings.currency_code`); there is no per-line currency field, and uploads are assumed to already use that currency. ⟨src: r:r7, d:x8⟩ *Constrains:* entities OrgSettings, Account Line, Excel Upload. ⟨src: n:n1, n:n2⟩ *Verify:* confirm no Account Line carries a currency field and every amount is interpreted against `OrgSettings.currency_code`. ⟨src: r:r7, d:x8⟩

**R-8 — Re-uploading a Period replaces its figures.** Uploading a second file for a Period replaces the prior figures for that Period rather than adding to them; the prior version is kept and the new upload becomes the active version, with rollback available. ⟨src: r:r8, d:x1⟩ *Constrains:* action a1, entities Excel Upload, Account Line, Revenue Figure, Expense Figure. ⟨src: a:a1, n:n1⟩ *Verify:* upload Q1 with revenue $148,000, upload Q1 again → Period revenue reads $148,000 (not doubled), and the earlier version remains available to roll back to. ⟨src: r:r8, d:x1⟩

**R-9 — Only the Owner manages users and access.** Only the Owner may invite Users, assign roles, and change a User's allowed areas; Bookkeepers, Managers, and Accountants cannot manage user accounts. ⟨src: r:r9⟩ *Constrains:* actions a12, entity User. ⟨src: a:a12, n:n9⟩ *Verify:* attempt to invite a User or change allowed areas as Bookkeeper, Manager, or Accountant → rejected; as Owner → succeeds. ⟨src: r:r9⟩

**R-10 — Every mutation is recorded in an unalterable history.** Every upload, mapping, correction, and period close/reopen writes an Audit entry capturing the acting User and the timestamp; Audit entries can be created but never edited or deleted. ⟨src: r:r10, d:audit_trail⟩ *Constrains:* actions a1, a2, a3, a7, a9, entity Audit entry. ⟨src: a:a1, a:a2, a:a3, a:a7, a:a9⟩ *Verify:* perform an upload, a mapping, a correction, a close, and a reopen → five Audit entries appear each with actor and time; attempt to update or delete any Audit entry through any API path → rejected. ⟨src: r:r10⟩

**R-11 — Users carry role and (for Managers) allowed areas from invitation.** Every User has a role, and every User whose role is Manager has at least one allowed area assigned at invitation time. ⟨src: r:r11, n:n9⟩ *Constrains:* action a12, entity User. ⟨src: a:a12, n:n9⟩ *Verify:* invite a User with no role → rejected; invite a Manager with empty allowed areas → rejected; invite a Manager with `allowed_areas = [Marketing]` → accepted. ⟨src: r:r11⟩

**R-12 — A Category in use cannot be archived.** A Category cannot be archived while any active (non-archived) Account Line references it; its lines must first be reassigned to another Category or removed. ⟨src: r:r12⟩ *Constrains:* action a11, entities Category, Account Line. ⟨src: a:a11, n:n3⟩ *Verify:* attempt to archive a Category that still has Account Lines → rejected with a reassign-first message; reassign or archive those lines, retry → succeeds. ⟨src: r:r12⟩

**R-13 — An upload needs file, period, and uploader before import.** An Excel Upload must have a `file_name`, a `period_covered`, and a recorded uploader before its rows may be imported. ⟨src: r:r13⟩ *Constrains:* action a1, entity Excel Upload. ⟨src: a:a1, n:n1⟩ *Verify:* submit an upload missing any of the three fields → import is refused; supply all three → import proceeds. ⟨src: r:r13⟩

**R-14 — Period labels are unique.** Each Period `label` is unique across all Periods, so figures are never split across two records for the same month, quarter, or year. ⟨src: r:r14⟩ *Constrains:* entity Period. ⟨src: n:n4⟩ *Verify:* create Period `Q1 2024`, then create a second Period with the same label → rejected on the uniqueness constraint. ⟨src: r:r14⟩

### Derived invariants

**R-15 — Unmapped and validation-failed rows are staged, never figures.** On import, a row that parses cleanly but matches no Category becomes an unmapped Import staging row, and a row that fails validation becomes a flagged Import staging row; neither contributes to any figure. A Period with any unmapped **or** flagged staging row shows no totals (per R-3). A flagged row that cannot be repaired may be discarded by the Owner or Bookkeeper, which removes it from staging and unblocks the Period once no other staging rows remain. ⟨src: d:x3, d:x4, r:r3⟩ *(discard path chosen to keep an irreparable row from blocking a Period indefinitely)* ⟨src: default⟩ *Verify:* import a file with one unmatched row and one bad-value row → both appear in staging and the Period shows no totals; map the first and discard the second → the Period's totals appear. ⟨src: d:x3, d:x4⟩

**R-16 — Signed-amount aggregation.** Account Lines store positive amounts for ordinary income/expense entries and negative amounts for refunds/credits; Revenue Figure sums signed amounts of `type = income` and each Expense Figure sums signed amounts of `type = expense` within its Category, so refunds and credits reduce the relevant total. ⟨src: d:x6⟩ *Constrains:* entities Account Line, Revenue Figure, Expense Figure. ⟨src: n:n2, n:n5, n:n6⟩ *Verify:* add an income line of $1,000 and a refund line of −$200 for a Period → Revenue Figure reads $800. ⟨src: d:x6⟩

**R-17 — Only the Owner reopens a closed Period, and it is logged.** Reopening a closed Period is an Owner-only action functioning as the single approval step; it succeeds only for the Owner and writes an Audit entry, overriding any example that showed another actor reopening. ⟨src: d:x2, d:approval_workflow, r:r4, r:r10⟩ *Constrains:* action a9, entity Period, Audit entry. ⟨src: a:a9, n:n4⟩ *Verify:* attempt to reopen as Bookkeeper → rejected; reopen as Owner → status returns to `open` and a `reopen_period` Audit entry is written. ⟨src: d:x2, r:r10⟩

**R-18 — Deletion is soft and restorable; nothing is auto-purged.** Every entity deletion sets `archived_at`/`archived_by` and can be restored; there is no hard delete and no automatic retention purge in v1 — records are kept until an actor archives them. ⟨src: d:deletion, d:retention⟩ *Constrains:* all soft-deletable entities. ⟨src: n:n1, n:n2, n:n3, n:n4, n:n9⟩ *Verify:* archive a Category, confirm it is hidden but restorable, and confirm no scheduled job removes archived records. ⟨src: d:deletion, d:retention⟩

**R-19 — Concurrent edits resolve last-write-wins.** When two editors save the same record, the later `updated_at` write wins; the app does not lock or merge. ⟨src: d:concurrency⟩ *Constrains:* all mutable financial entities. ⟨src: n:n2, n:n4⟩ *Verify:* have two Bookkeepers edit the same Account Line; the last save is the persisted value. ⟨src: d:concurrency⟩

**R-20 — Saved Dashboard Views are personal.** A Dashboard View is visible only to the User named in its `owner` field; no other actor, including the Owner, may open or save another user's View. ⟨src: n:n8⟩ *(personal-view scope is default)* ⟨src: default⟩ *Constrains:* actions a5, a10, entity Dashboard View. ⟨src: a:a5, a:a10, n:n8⟩ *Verify:* create a View as one Owner account, sign in as a different user → the View is not listed and cannot be opened or overwritten. ⟨src: n:n8⟩

## Acceptance scenarios

These scenarios use Given/When/Then and cover every action and every rule at least once, with negative cases for the access rules. Amounts are in the org's single configured currency; sign-out/sign-in is by email + password. ⟨src: r:r7⟩ ⟨src: d:identity_provider⟩

### Uploading and importing

**S-1 — Bookkeeper uploads a valid Excel Upload.** Given the Bookkeeper is signed in and has a file, a period covered, and their identity recorded, When they import `Financials_2024_Q1.xlsx` for Q1 2024, Then the upload is retained, its rows are parsed into import staging rows, and an audit entry records who uploaded and when. ⟨src: a:a1⟩ ⟨src: r:r13⟩ ⟨src: d:attachments⟩ ⟨src: r:r10⟩

**S-2 — Upload missing a required field is rejected.** Given a would-be upload with no period covered, When the Bookkeeper tries to import it, Then the import is rejected and no staging rows are created. ⟨src: r:r13⟩ ⟨src: a:a1⟩

**S-3 — Manager cannot upload.** Given a Manager is signed in, When they attempt to upload an Excel Upload, Then the action is rejected with 403 and no upload is created. ⟨src: r:r1⟩ ⟨src: p:p3⟩

**S-4 — Accountant cannot upload.** Given an Accountant is signed in, When they attempt to upload an Excel Upload, Then the action is rejected with 403. ⟨src: r:r1⟩ ⟨src: p:p4⟩

**S-5 — Valid rows import, bad rows are flagged.** Given a file where most rows parse but one amount is unreadable, When it is imported, Then the valid rows become staging rows ready to map and the bad row is flagged as invalid rather than rejecting the whole file. ⟨src: d:x3⟩ ⟨src: a:a1⟩

**S-6 — Re-uploading a period replaces, never doubles.** Given Q1 2024 already has an active upload showing revenue $148,000, When the Bookkeeper uploads a new Q1 2024 file, Then the prior upload becomes superseded, the new one becomes active, revenue still reflects a single upload (not $296,000), and the prior version remains available for rollback. ⟨src: r:r8⟩ ⟨src: d:x1⟩

**S-7 — Rollback to a prior upload version.** Given a superseded Q1 2024 upload exists, When the Bookkeeper rolls back to it, Then that version becomes active again and its figures replace the current ones. ⟨src: d:x1⟩

### Mapping, categories, and account lines

**S-8 — Bookkeeper maps a staging row to a Category.** Given an unmapped staging row for a 'Rent' column, When the Bookkeeper maps it to the Office Rent category, Then the staging row is promoted to an Account Line belonging to exactly one Category and one Period, and the mapping is audited. ⟨src: a:a2⟩ ⟨src: r:r6⟩ ⟨src: r:r10⟩

**S-9 — No category-less Account Line can exist.** Given a staging row whose category is not yet resolved, When the system persists data, Then the row remains an import staging row and no Account Line is created for it until it is mapped; attempting to persist an Account Line with a null category is rejected. ⟨src: r:r6⟩ ⟨src: d:x4⟩

**S-10 — Category matching is case- and whitespace-insensitive.** Given a category named `Marketing`, When a staging row's column value is ` marketing `, Then it resolves to the existing Marketing category rather than creating a duplicate. ⟨src: a:a2⟩

**S-11 — Bookkeeper creates a new Category.** Given no category fits a staging row, When the Bookkeeper adds a 'Software' expense category and maps the row to it, Then the category is created with type expense and the row is promoted to an Account Line. ⟨src: a:a11⟩ ⟨src: n:n3⟩

**S-12 — Bookkeeper corrects a mistyped Account Line in an open period.** Given Q1 2024 is open and a rent line reads $32,000, When the Bookkeeper corrects it to $3,200, Then the line updates, the affected figures recompute, and the correction is audited. ⟨src: a:a3⟩ ⟨src: r:r4⟩ ⟨src: r:r10⟩

**S-13 — Irreparable flagged row is discarded so it never blocks the period.** Given a flagged-invalid staging row that cannot be corrected, When the Bookkeeper discards it, Then it is removed from the staging list and the period can become fully resolved. ⟨src: d:x3⟩ ⟨src: r:r3⟩

**S-14 — Category with assigned lines cannot be archived.** Given the Office Rent category still has active Account Lines, When the Bookkeeper tries to archive it, Then the action is rejected until the lines are reassigned or removed. ⟨src: r:r12⟩

**S-15 — Category with no lines is archivable and restorable.** Given a category with no active Account Lines, When the Bookkeeper archives it and later restores it, Then it moves to archived and back to active, and no data is destroyed. ⟨src: r:r12⟩ ⟨src: d:deletion⟩

### Figures and dashboards

**S-16 — Period shows no totals until fully resolved.** Given Q2 2024 has one unmapped staging row remaining, When any actor opens a dashboard for Q2 2024, Then no Revenue Figure, Expense Figure, or Profit Summary is shown; When the last row is mapped or discarded, Then the totals appear. ⟨src: r:r3⟩ ⟨src: d:x4⟩ ⟨src: n:n5⟩ ⟨src: n:n6⟩ ⟨src: n:n7⟩

**S-17 — Profit Summary equals revenue minus expenses.** Given a resolved Q1 2024 with revenue $148,000 and expenses $110,000, When the Owner views the Profit Summary, Then net profit reads $38,000 and is computed by the system, not entered by hand. ⟨src: r:r5⟩ ⟨src: a:a4⟩ ⟨src: n:n7⟩

**S-18 — Refund reduces the relevant total.** Given an income Account Line of $1,000 and a refund Account Line of −$200 in the same period, When revenue is summed, Then it reflects $800. ⟨src: d:x6⟩

**S-19 — Accountant reviews revenue.** Given an Accountant is signed in, When they open Q1 2024, Then they can view the Revenue Figure of $148,000, the Expense Figures, and the Profit Summary, but cannot edit any of them. ⟨src: a:a8⟩ ⟨src: r:r1⟩ ⟨src: p:p4⟩

**S-20 — Owner opens and saves a personal Dashboard View.** Given the Owner is signed in, When they configure a Cash Flow arrangement and save it, Then a Dashboard View owned by the Owner is stored, and When they later open it, Then it loads their saved filters and time range. ⟨src: a:a10⟩ ⟨src: a:a5⟩ ⟨src: n:n8⟩

**S-21 — Saved Dashboard Views are personal.** Given the Bookkeeper has saved a Dashboard View, When any other actor including the Owner lists Dashboard Views, Then they do not see the Bookkeeper's view; each actor sees only views whose owner is themselves. ⟨src: n:n8⟩ ⟨src: default⟩

### Manager area restriction

**S-22 — Manager sees only assigned-area expenses.** Given Manager Jane has `allowed_areas = [Marketing]`, When she views expenses, Then she sees the Marketing Expense Figure of $9,400. ⟨src: a:a6⟩ ⟨src: r:r2⟩ ⟨src: d:x5⟩ ⟨src: n:n9⟩

**S-23 — Manager cannot see other areas or company totals.** Given Manager Jane is restricted to Marketing, When she requests the Payroll Expense Figure, any Revenue Figure, or any Profit Summary, Then each returns not-found/403 and no company-wide total leaks. ⟨src: r:r2⟩ ⟨src: d:x5⟩

**S-24 — Manager cannot edit.** Given Manager Jane is signed in, When she attempts to correct an Account Line or map a row, Then the action is rejected with 403. ⟨src: r:r1⟩ ⟨src: p:p3⟩

### Period lifecycle and locking

**S-25 — Owner closes a period after review.** Given Q1 2024 is open and fully resolved, When the Owner closes it, Then its status becomes closed and the close is audited with the Owner's identity and timestamp. ⟨src: a:a7⟩ ⟨src: r:r4⟩ ⟨src: r:r10⟩

**S-26 — Bookkeeper cannot close a period.** Given Q1 2024 is open, When the Bookkeeper attempts to close it, Then the action is rejected with 403. ⟨src: r:r1⟩ ⟨src: a:a7⟩ ⟨src: p:p2⟩

**S-27 — Closed period figures are locked.** Given Q1 2024 is closed, When the Bookkeeper attempts to correct one of its Account Lines, Then the edit is rejected until the period is reopened. ⟨src: r:r4⟩ ⟨src: d:x2⟩

**S-28 — Only the Owner may reopen a closed period.** Given Q1 2024 is closed, When the Bookkeeper attempts to reopen it, Then the action is rejected; When the Owner reopens it, Then its status returns to open and the reopen is audited. ⟨src: a:a9⟩ ⟨src: d:x2⟩ ⟨src: d:approval_workflow⟩ ⟨src: r:r4⟩ ⟨src: r:r10⟩

**S-29 — Edits resume after reopen.** Given the Owner has reopened Q1 2024, When the Bookkeeper corrects an Account Line, Then the correction succeeds, figures recompute per R-5, and the correction is audited. ⟨src: a:a3⟩ ⟨src: r:r5⟩ ⟨src: r:r10⟩

### Users, roles, and access administration

**S-30 — Owner invites a Manager with a role and allowed areas.** Given the Owner is signed in, When they invite Jane as a Manager with `allowed_areas = [Marketing]`, Then a User is created with that role and areas and an invitation email is sent. ⟨src: a:a12⟩ ⟨src: r:r11⟩ ⟨src: d:notifications⟩

**S-31 — Inviting a Manager without allowed areas is rejected.** Given the Owner invites a Manager, When no allowed areas are provided, Then the invite is rejected because a Manager must have allowed areas assigned at invitation. ⟨src: r:r11⟩ ⟨src: n:n9⟩

**S-32 — Only the Owner may manage users.** Given the Bookkeeper, a Manager, or an Accountant is signed in, When any of them attempts to invite a User or change a User's role or allowed areas, Then the action is rejected with 403. ⟨src: r:r9⟩ ⟨src: p:p2⟩ ⟨src: p:p3⟩ ⟨src: p:p4⟩

### Currency, periods, and audit

**S-33 — Single currency is assumed on import.** Given the org currency is configured, When a file is imported, Then amounts are treated as that currency with no per-row currency check or conversion. ⟨src: r:r7⟩ ⟨src: d:x8⟩

**S-34 — Period labels are unique.** Given a Period labelled `Q1 2024` exists, When a second Period with the same label is created, Then it is rejected so figures are never split across two records for the same period. ⟨src: r:r14⟩

**S-35 — Audit trail is append-only and Owner-only.** Given uploads, mappings, corrections, and period close/reopen have occurred, When the Owner opens the audit trail, Then every such event shows who did it and when; When any actor attempts to alter an existing audit entry, Then the attempt is rejected. ⟨src: r:r10⟩ ⟨src: d:audit_trail⟩

**S-36 — Non-owners cannot view the audit trail.** Given the Bookkeeper, a Manager, or an Accountant is signed in, When they attempt to open the audit trail, Then access is denied. ⟨src: r:r10⟩ ⟨src: default⟩

### Export and restore

**S-37 — Owner, Bookkeeper, and Accountant export figures as CSV.** Given resolved figures for Q1 2024, When the Owner, Bookkeeper, or Accountant exports them, Then a CSV of those figures is produced. ⟨src: d:data_export⟩ ⟨src: r:r1⟩

**S-38 — Manager export is limited to assigned areas.** Given Manager Jane is restricted to Marketing, When she exports, Then the CSV contains only her allowed-area Expense Figures and no revenue, profit, or other-area figures. ⟨src: r:r2⟩ ⟨src: d:x5⟩ ⟨src: d:data_export⟩

**S-39 — Archived records are restorable, never purged.** Given a Category or Dashboard View has been archived, When the Owner or Bookkeeper restores it, Then it returns to active; no automatic retention purge ever destroys it. ⟨src: d:deletion⟩ ⟨src: d:retention⟩

## Key journeys

These are the key end-to-end flows. Each step names the actor, what they do, what they see, and any email that is sent. All flows happen in the browser after email + password sign-in. ⟨src: d:platform⟩ ⟨src: d:identity_provider⟩

### Journey 1 — Bookkeeper imports and maps a period

1. The Bookkeeper signs in and uploads an Excel Upload, naming the Period it covers; the file must have a file, a period covered, and the uploader recorded before it can be imported. ⟨src: p:p2⟩ ⟨src: a:a1⟩ ⟨src: r:r13⟩
2. The uploaded file is retained and its rows are parsed. Amounts are assumed to already be in the org's configured currency; there is no per-row currency check. ⟨src: d:attachments⟩ ⟨src: r:r7⟩ ⟨src: d:x8⟩
3. Each parsed row becomes an **import staging row**, not yet an Account Line. Rows that fail validation are flagged; rows whose Category cannot be resolved are held as unmapped. A staging row never persists as a category-less Account Line. ⟨src: d:x3⟩ ⟨src: d:x4⟩ ⟨src: r:r6⟩
4. The Bookkeeper sees the staging list split into three groups: mapped-ready, unmapped, and flagged-invalid. ⟨src: d:x3⟩ ⟨src: d:x4⟩
5. The Bookkeeper maps each unmapped staging row to a Category, creating a new Category where none fits. Category name matching is case-insensitive on the trimmed name. ⟨src: a:a2⟩ ⟨src: a:a11⟩
6. On mapping, and only then, the staging row is promoted to an Account Line that belongs to exactly one Category and exactly one Period. ⟨src: r:r6⟩
7. For a flagged-invalid staging row the Bookkeeper either corrects the value so it validates and can be mapped, or discards the row; an irreparable flagged row is discarded so it can never block the Period indefinitely. ⟨src: a:a3⟩ ⟨src: d:x3⟩
8. The Bookkeeper may correct any mistyped Account Line amount while the Period is `open`. ⟨src: a:a3⟩ ⟨src: r:r4⟩
9. Once every staging row for the Period is either promoted to a mapped Account Line or discarded, the Period's Revenue Figure, Expense Figure, and Profit Summary become visible on dashboards; before that the Period shows no totals. ⟨src: r:r3⟩ ⟨src: d:x4⟩ ⟨src: n:n5⟩ ⟨src: n:n6⟩ ⟨src: n:n7⟩
10. Profit Summary is computed by the system as Revenue Figure minus Expense Figure for the same Period; it is never entered by hand. ⟨src: r:r5⟩ ⟨src: n:n7⟩
11. The upload, each mapping, and each correction are written to the append-only audit trail with who did it and when. ⟨src: r:r10⟩
12. (default) On successful import the system emails the Owner that a Period's figures are ready to review. ⟨src: default⟩ ⟨src: d:notifications⟩

### Journey 2 — Owner reviews and closes a period

1. The Owner signs in and opens a saved Dashboard View that they own; saved views are personal and not visible to any other actor. ⟨src: p:p1⟩ ⟨src: a:a5⟩ ⟨src: n:n8⟩
2. The Owner views the Period's Profit Summary — revenue, expenses, and net profit. ⟨src: a:a4⟩ ⟨src: n:n7⟩
3. Satisfied, the Owner closes the Period; the Bookkeeper cannot perform this action. ⟨src: a:a7⟩ ⟨src: r:r1⟩
4. From then on all figures for that Period are locked from edits until it is reopened. ⟨src: r:r4⟩
5. The close is recorded in the audit trail with the Owner's identity and timestamp. ⟨src: r:r10⟩ ⟨src: d:x2⟩
6. (default) The system emails the Accountant that the Period is closed and ready for review. ⟨src: default⟩ ⟨src: d:notifications⟩

### Journey 3 — Owner reopens a closed period to fix a figure

1. The Bookkeeper spots a wrong figure in a closed Period but cannot edit it while the Period is `closed`. ⟨src: r:r4⟩
2. Only the Owner may reopen the Period, acting as the single approver of the reopen; despite the a9 example, the Bookkeeper cannot reopen. ⟨src: a:a9⟩ ⟨src: d:x2⟩ ⟨src: d:approval_workflow⟩ ⟨src: r:r4⟩
3. The Owner reopens the Period, returning its status to `open`. ⟨src: a:a9⟩ ⟨src: d:x2⟩
4. The Bookkeeper corrects the affected Account Line; Revenue, Expense, and Profit figures recompute. ⟨src: a:a3⟩ ⟨src: r:r5⟩
5. The reopen and the correction are each logged with who and when; audit history cannot be altered. ⟨src: r:r10⟩
6. The Owner closes the Period again to relock it. ⟨src: a:a7⟩ ⟨src: r:r4⟩

### Journey 4 — Owner invites a Manager, who then views their area

1. The Owner invites a new User, setting their role and, for a Manager, their allowed areas at invite time; no other actor may invite users or assign areas. ⟨src: a:a12⟩ ⟨src: r:r9⟩ ⟨src: r:r11⟩ ⟨src: d:invite_flow⟩
2. The system emails the invitee a link to set an email + password and sign in. ⟨src: d:notifications⟩ ⟨src: d:identity_provider⟩
3. The Manager signs in and sees only Expense Figures whose Category is one of their allowed areas; Revenue Figures, Profit Summary, company-wide totals, and other departments' figures stay hidden. ⟨src: a:a6⟩ ⟨src: r:r2⟩ ⟨src: d:x5⟩ ⟨src: n:n9⟩
4. The Manager cannot upload files, edit figures, or manage users; those controls are not shown. ⟨src: r:r1⟩ ⟨src: r:r9⟩

### Journey 5 — Accountant reviews period totals and exports

1. The Accountant signs in and reviews a closed Period's Revenue Figure. ⟨src: p:p4⟩ ⟨src: a:a8⟩ ⟨src: n:n5⟩
2. The Accountant also views the Period's Expense Figures and Profit Summary across all Periods, view-only, and cannot edit anything. ⟨src: n:n6⟩ ⟨src: n:n7⟩ ⟨src: r:r1⟩
3. The Accountant exports the figures as CSV for tax and reporting work. ⟨src: d:data_export⟩
4. The Accountant cannot save a Dashboard View, invite users, or view the audit trail. ⟨src: r:r1⟩ ⟨src: r:r9⟩

### Journey 6 — Bookkeeper re-uploads a corrected file for a period

1. While the Period is `open`, the Bookkeeper uploads a new Excel Upload for that same Period. ⟨src: a:a1⟩ ⟨src: r:r4⟩
2. Re-uploading replaces the Period's prior figures rather than adding to them, so totals never double. ⟨src: r:r8⟩
3. The prior version is kept and the new upload becomes the active one; the Bookkeeper may roll back to the earlier version. ⟨src: d:x1⟩
4. Rows from the new file pass through the same staging, mapping, and validation flow as Journey 1 before any figures update. ⟨src: d:x3⟩ ⟨src: d:x4⟩ ⟨src: r:r6⟩
5. The re-upload and the version switch are recorded in the audit trail. ⟨src: r:r10⟩
6. (default) The system emails the Owner that the Period's figures were revised. ⟨src: default⟩ ⟨src: d:notifications⟩

## Non-goals

Each item below is something v1 deliberately does **not** do. For each, the paragraph names the wrong assumption a reader might make and the nearest behaviour that IS in scope, so the boundary is unambiguous.

### Bank and transaction feeds

The app does not connect to bank accounts or pull transactions automatically. ⟨src: g:g1⟩ A reader might assume figures refresh themselves from a live bank feed; they do not. The only way numbers enter the system is the Bookkeeper uploading an Excel Upload for a Period, which is then parsed and mapped by hand. ⟨src: a:a1, r:r13⟩

### Invoicing

The app does not generate or send invoices to customers. ⟨src: g:g2⟩ A reader might assume revenue lines can be turned into outgoing invoices or that customers are billed from here; they are not. In scope is only viewing recorded income as Revenue Figures and Profit Summaries. ⟨src: n:n5, n:n7⟩

### Tax filing and official statements

The app does not file taxes or produce official accounting statements. ⟨src: g:g3⟩ A reader might assume the dashboard emits a filing-ready P&L or balance sheet; it does not. The nearest in-scope behaviour is the Accountant reviewing period revenue and totals for their own external tax and reporting work, and exporting figures as CSV. ⟨src: a:a8, d:data_export⟩

### External and public access

The app does not let external clients or the public log in. ⟨src: g:g4⟩ A reader might assume there is a customer or public-facing portal, or that anyone can self-register; there is not. Access is limited to the four named actor types, and new people gain access only when the Owner invites them. ⟨src: d:user_accounts, d:invite_flow, a:a12⟩

### Payroll and payments

The app does not handle payroll processing or payments. ⟨src: g:g5⟩ A reader might assume it pays staff or moves money; it does not. Payroll appears only as recorded spending — an Expense Figure under an expense Category — never as a disbursement the app executes. ⟨src: n:n6, n:n3⟩

### Multiple businesses

The app does not host multiple separate businesses with partitioned data. ⟨src: d:tenancy⟩ A reader might assume a tenant per client; instead all records live in one shared pool for the single business. ⟨src: d:workspace_structure⟩ The nearest in-scope isolation is the Manager's area filter, which restricts one actor's view rather than separating organisations. ⟨src: r:r2, d:x5⟩

### Custom roles and permissions

The app does not let anyone define their own roles or per-record permission sets. ⟨src: d:roles⟩ A reader might assume configurable permission profiles; instead the four roles and their fixed powers are built in, editing limited to Owner and Bookkeeper. ⟨src: r:r1⟩ The nearest in-scope control is the Owner assigning a role and, for Managers, allowed areas at invite time. ⟨src: r:r9, r:r11⟩

### Offline use

The app does not work offline or sync later. ⟨src: d:offline⟩ A reader might assume an installable app that queues uploads without a connection; instead it is an online-only browser application. ⟨src: d:platform⟩

### Currency detection and conversion

The app does not detect foreign currencies on import or convert amounts. ⟨src: d:x8⟩ A reader might assume mixed-currency files are caught or normalised; instead every uploaded file is assumed to already use the org's one configured currency, and amounts import as-is. ⟨src: r:r7⟩ The nearest in-scope guarantee is that all stored amounts share the single `OrgSettings.currency_code`. ⟨src: r:r7⟩

### Automatic data purge

The app does not auto-remove records after any retention window. ⟨src: d:retention⟩ A reader might assume old Periods or Users are permanently destroyed on a schedule; instead records are kept until an actor archives them, and archiving is a restorable soft delete with no hard delete and no scheduled purge. ⟨src: d:deletion⟩

### Custom fields, reports, and automation

The app does not let admins add custom fields, build their own reports, or configure rules that act on records automatically. ⟨src: d:record_custom_fields, d:reporting, d:record_automation⟩ A reader might assume a report builder or workflow engine; instead people work by hand against fixed fields, and the only cross-record view is the built-in totals-and-counts dashboard with personal saved Dashboard Views. ⟨src: n:n8⟩

### Programmatic export and API

The app does not expose a full data export or an API. ⟨src: d:data_export⟩ A reader might assume an integration endpoint; instead the only way out is downloading figure lists as CSV, subject to the same view permissions as on screen. ⟨src: d:data_export, r:r2⟩

## Glossary

### Actors

- **Owner** — Business owner who reviews the financial picture, closes and reopens periods, invites users, and saves dashboard views; holds full administrative power. ⟨src: p:p1⟩
- **Bookkeeper** — Person who uploads Excel files, maps categories, corrects account lines, and maintains the numbers; an editor who cannot manage user accounts. ⟨src: p:p2⟩
- **Manager** — Department lead who views figures only for the areas assigned to them; view-only, no company-wide totals. ⟨src: p:p3, r:r2⟩
- **Accountant** — External advisor who reviews period totals for tax and reporting; view-only with no editing rights. ⟨src: p:p4, r:r1⟩

### Nouns

- **Excel Upload** — A source spreadsheet imported to feed the dashboard, carrying its file name, the period it covers, its uploader, and upload date. ⟨src: n:n1⟩
- **Account Line** — A single row derived from an Excel Upload that ties a category to an amount for one period and type (income or expense). ⟨src: n:n2⟩
- **Category** — A named grouping of income or expense lines, with a type and optional parent group. ⟨src: n:n3⟩
- **Period** — A fixed calendar month, quarter, or year that figures belong to, with a unique label, start and end dates, and an open/closed status. ⟨src: n:n4, r:r14, d:x7⟩
- **Revenue Figure** — The total income recorded for a period, traced to its source upload. ⟨src: n:n5⟩
- **Expense Figure** — The total spending recorded for a period, grouped by category. ⟨src: n:n6⟩
- **Profit Summary** — A per-period roll-up whose net profit equals that period's Revenue Figure minus its Expense Figure. ⟨src: n:n7, r:r5⟩
- **Dashboard View** — A personal saved arrangement of charts and totals, with a name, owner, filters, and time range. ⟨src: n:n8⟩
- **User** — A person with access to the dashboard, holding a name, role, email, and (for Managers) their allowed areas. ⟨src: n:n9, r:r11⟩

### Supporting terms

- **Import staging row** — A parsed spreadsheet row held separately before it becomes an Account Line; a row that is unmapped or failed validation stays here and never exists as a category-less Account Line. ⟨src: r:r6, d:x3, d:x4⟩
- **Audit entry** — An unalterable record of who performed an upload, mapping, correction, or period close/reopen and when. ⟨src: r:r10, d:audit_trail⟩

## Decision ledger (complete)

_Every product decision this spec is built on. "assumed" rows carry the confidence of the assumption — an implementer should confirm low-confidence assumptions before building against them (see AGENTS.md)._

| Decision | Answer | How settled | Confidence |
|---|---|---|---|
| Do you start with existing data? ⟨src: d:data_import⟩ | Import from a spreadsheet/CSV once | assumed | 95% |
| What do people need to see across many records? ⟨src: d:reporting⟩ | A dashboard with totals and counts | assumed | 95% |
| Do different people have different powers? ⟨src: d:roles⟩ | An owner/admin plus staff with fewer powers | assumed | 95% |
| Who needs an account to use the app? ⟨src: d:user_accounts⟩ | Several people log in, possibly with different powers | assumed | 95% |
| Do some actions need someone else's approval first? ⟨src: d:approval_workflow⟩ | One approver | answered | 100% |
| Do you need a record of who changed what and when? ⟨src: d:audit_trail⟩ | A full, viewable history of every change | assumed | 54% |
| Does it hold data with special legal handling (health, payment cards, minors)? ⟨src: d:compliance_sensitivity⟩ | Ordinary business data | assumed | 97% |
| Must it work without internet? ⟨src: d:offline⟩ | Online only | assumed | 99% |
| Where is it used? ⟨src: d:platform⟩ | In a browser, on desktop and phone | assumed | 89% |
| When a file is re-uploaded for a period (r8 replace), how are prior figures and manual corrections handled? ⟨src: d:x1⟩ | Keep prior version, switch active, allow rollback | assumed | 36% |
| Can a closed period be reopened, and what happens to figures and audit when it is? ⟨src: d:x2⟩ | Owner reopens, changes logged | assumed | 95% |
| If an Excel upload parses partway then hits a bad row, what happens? ⟨src: d:x3⟩ | Import valid rows, flag bad ones for fixing | assumed | 62% |
| How are spreadsheet rows with no matching Category treated (r6 requires exactly one)? ⟨src: d:x4⟩ | Block period from showing until all rows mapped | assumed | 49% |
| How is a Manager restricted to their assigned areas, and can totals leak? ⟨src: d:x5⟩ | Only assigned categories; company totals hidden | assumed | 61% |
| Can each business customize the app? ⟨src: d:customization⟩ | No — everyone gets the same thing | assumed | 69% |
| How much data will there be? ⟨src: d:data_scale⟩ | Hundreds of records | assumed | 60% |
| When something is deleted, what really happens? ⟨src: d:deletion⟩ | It's archived and can be restored | assumed | 82% |
| How do additional people get access? ⟨src: d:invite_flow⟩ | An admin invites them | assumed | 95% |
| Languages and regions? ⟨src: d:localization⟩ | One language, one country | assumed | 95% |
| How does the app reach people when something happens? ⟨src: d:notifications⟩ | Email | assumed | 79% |
| How are negative amounts, refunds, and rounding handled in figures? ⟨src: d:x6⟩ | Cents precision, allow negatives (refunds/credits) | assumed | 78% |
| How are periods and overlapping/misaligned dates resolved? ⟨src: d:x7⟩ | Fixed calendar months/quarters/years | assumed | 60% |
| How is the single-currency rule enforced on import? ⟨src: d:x8⟩ | Assume all files are in the org's configured currency | answered | 100% |
| Are the fields on a record fixed, or can admins add their own? ⟨src: d:record_custom_fields⟩ | Fixed — the same fields for everyone | assumed | 81% |
| Who can see a record? ⟨src: d:record_ownership⟩ | Visible within the owner's team/department; admins see all | assumed | 95% |
| Can files/photos be attached to things? ⟨src: d:attachments⟩ | Yes — upload and download | assumed | 71% |
| What happens when two people edit the same thing at once? ⟨src: d:concurrency⟩ | Rare; the last save wins | assumed | 63% |
| Do people need to get their data out? ⟨src: d:data_export⟩ | Download lists as CSV/Excel | assumed | 68% |
| How do people sign in? ⟨src: d:identity_provider⟩ | Email + password | assumed | 54% |
| Should the app do things on its own when records change? ⟨src: d:record_automation⟩ | No — people do everything by hand | assumed | 60% |
| Who can change a record? ⟨src: d:record_edit_rights⟩ | Only its owner/assignee and admins; others just view | assumed | 95% |
| How long is data kept? ⟨src: d:retention⟩ | Until someone deletes it | assumed | 95% |
| Is this for one business, or will many separate businesses use it with their data kept apart? ⟨src: d:tenancy⟩ | One business (ours) | assumed | 95% |
| Are records grouped into separate projects/workspaces, or is it one shared pool? ⟨src: d:workspace_structure⟩ | One shared pool — everything lives in one place with filters | assumed | 97% |
| Can two records be the same thing (same email, same serial number)? ⟨src: d:record_duplicates⟩ | The app warns about likely duplicates and offers to merge | assumed | 72% |
| How do people find a record? ⟨src: d:record_search⟩ | Filter and sort within each list | assumed | 62% |
