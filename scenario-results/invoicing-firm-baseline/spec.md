> ⚠️ **NOT DELIVERABLE — 1 gate(s) failed.** the critic returned fail (score 6).
>
> The Design Sheet (`design-sheet.md`) remains the source of truth. Fix these and recompile; do not resolve a contradiction by choosing one side of it.

> ⚠️ **DRAFT — THIS SPEC DID NOT PASS REVIEW.** The critic returned `fail` (score 6) after 8 violation(s) and 2 omission(s) survived the repair pass.
>
> Do not treat it as the source of truth. The Design Sheet (`design-sheet.md`) still is; fix the findings below (full list in `compile-report.json`) and recompile.
>
> - data_model × lifecycles (high) at "Invoice lifecycle lists 7 states incl. `viewed`; Data model Invoice `status` enum = (draft,sent,partially_paid,paid,overdue,void) with no `viewed`": The lifecycle section adds a `viewed` state and sent→viewed transition, but the Invoice status enum and status-derivation in the data model have no `viewed` state at all. The two sections disagree about the set of legal Invoice states.
> - actors_permissions × lifecycles (high) at "Invoice lifecycle row `sent`→`viewed` | Who: Client | "Client receives and opens the invoice" vs permissions Client column all ✗ and note 2 "performs no in-app action" and non-goals "no email open-tracking or 'viewed' signal"": The lifecycle has the Client (an actor with no account and no in-app action) drive a state transition, and relies on an open/viewed signal the permissions prose and non-goals both say does not exist. The scenario the lifecycle describes is forbidden by the permission matrix and explicitly denied elsewhere.
> - r3 × r7 (high) at "Invoice status derivation + R-r3 balance cap (amount − payments − credits) + R-r7 (paid iff payments==amount)": With any credit note applied, R-r3 caps recordable payments at amount−credits, so payments can never equal amount, so R-r7's `paid` is unreachable. Meanwhile status derivation only defines sent (requires credited_amount==0), partially_paid (requires amount_paid>0), and paid (amount_paid==amount). A credited invoice with amount_paid=0 (e.g. $450 invoice, $200 credit) matches NO status and can never leave it — an unsatisfiable, statusless stuck record.

# Specification — invoicing app for our small bookkeeping firm that bills clients monthly

_Compiled from Design Sheet v5 (b2b-invoicing, crud-saas). Trace markers ⟨src: …⟩ point at the Sheet items and decisions each line derives from: d: decision, r: rule, a: action, n: noun, p: actor, g: non-goal._

**How to use this spec:** the Design Sheet (design-sheet.md) is the source of truth; this spec is derived from it. Rules are inviolable. If a task would violate one, stop and cite it. If a task changes the design, update the Sheet first.

## Overview

### What this is

A web-based invoicing application for a single small bookkeeping firm that bills its own clients monthly for bookkeeping services. ⟨src: d:invoicing_model⟩ ⟨src: d:tenancy⟩ It runs in a browser on desktop and phone; there is no installed app and no offline mode. ⟨src: d:platform⟩ ⟨src: d:offline⟩

### Who it is for

- **Bookkeeper** — staff member who prepares invoices, adds line items, sends invoices, records payments, marks invoices paid, adds clients, and generates statements. ⟨src: p:p1⟩ ⟨src: a:a1⟩ ⟨src: a:a2⟩ ⟨src: a:a3⟩ ⟨src: a:a4⟩ ⟨src: a:a5⟩ ⟨src: a:a6⟩ ⟨src: a:a10⟩
- **Firm Owner** — owner/admin who sets service rates, changes client monthly rates, reviews statements, and voids invoices. ⟨src: p:p2⟩ ⟨src: a:a7⟩ ⟨src: a:a8⟩ ⟨src: a:a9⟩ ⟨src: r:r6⟩ ⟨src: r:r5⟩
- **Client** — a business the firm bills monthly; the Client is an outside party who only receives invoices by email and never logs in. ⟨src: p:p3⟩ ⟨src: a:a11⟩ ⟨src: d:external_access⟩ ⟨src: g:g2⟩

Both staff roles hold real accounts (email + password); the Firm Owner invites additional staff. ⟨src: d:user_accounts⟩ ⟨src: d:roles⟩ ⟨src: d:identity_provider⟩ ⟨src: d:invite_flow⟩

### Core value loop

1. The Bookkeeper adds a Client with a business name, contact email, monthly rate, and billing day. ⟨src: a:a6⟩ ⟨src: n:n1⟩
2. Each month the Bookkeeper creates a draft Invoice tied to exactly one Client and adds at least one Line Item carrying an amount. ⟨src: a:a1⟩ ⟨src: a:a2⟩ ⟨src: r:r8⟩ ⟨src: r:r2⟩ ⟨src: n:n2⟩ ⟨src: n:n3⟩
3. The Bookkeeper sends the Invoice as a PDF attached to an email to the Client's contact email. ⟨src: a:a3⟩ ⟨src: d:invoice_delivery⟩ ⟨src: a:a11⟩
4. The Client pays by their own method outside the app; the Bookkeeper records the resulting Payment against the Invoice. ⟨src: g:g1⟩ ⟨src: a:a4⟩ ⟨src: d:payment_recording⟩ ⟨src: n:n4⟩
5. When recorded Payments equal the full Invoice amount the Bookkeeper marks it paid; a partial payment leaves it partially paid. ⟨src: a:a5⟩ ⟨src: r:r7⟩ ⟨src: r:r10⟩
6. The Firm Owner reviews per-period Statements of billed totals and outstanding balances, and a dashboard shows how much was billed this month, how much is paid, and how many invoices are still outstanding. ⟨src: a:a8⟩ ⟨src: a:a10⟩ ⟨src: n:n6⟩ ⟨src: d:reporting⟩

### Platform, scale, and tenancy

- **Platform:** browser, desktop and phone, online only. ⟨src: d:platform⟩ ⟨src: d:offline⟩
- **Tenancy:** single organisation — one firm's data, no multi-org separation. ⟨src: d:tenancy⟩
- **Scale:** hundreds of records total. ⟨src: d:data_scale⟩
- **Money:** one currency, amounts rounded to cents; no tax lines. ⟨src: d:currencies⟩ ⟨src: d:taxes⟩ ⟨src: g:g4⟩
- **Data lifecycle:** records are never hard-deleted — invoices are voided and clients are archived, and the record and its number are retained for the audit trail. ⟨src: d:deletion⟩ ⟨src: r:r12⟩ ⟨src: d:x1⟩ ⟨src: d:x8⟩
- **Notifications:** email only. ⟨src: d:notifications⟩
- **Import/export:** a one-time spreadsheet/CSV import at setup and CSV/Excel list export. ⟨src: d:data_import⟩ ⟨src: d:data_export⟩

### Out of scope (v1)

- No online payment processing or card collection — clients pay by their own method and payments are only recorded. ⟨src: g:g1⟩ ⟨src: d:payments_in_app⟩
- No client login or self-service portal. ⟨src: g:g2⟩
- No payroll, expense tracking, or general accounting features. ⟨src: g:g3⟩
- No automatic tax calculation or filing. ⟨src: g:g4⟩
- No automated recurring billing — staff create invoices each month. ⟨src: g:g5⟩ ⟨src: d:recurring_invoices⟩
- No third-party integrations; the accountant is served by file export only. ⟨src: d:integrations⟩ ⟨src: d:accounting_sync⟩

## Actors & permissions

Three parties interact with the system, but only two hold accounts. The Bookkeeper prepares and sends invoices and records payments ⟨src: p:p1⟩. The Firm Owner oversees billing, sets rates, and holds the restricted powers ⟨src: p:p2⟩. The Client is the billed business; it holds no account and only receives emails ⟨src: p:p3, d:external_access, g:g2⟩.

Sign-in is email + password; additional staff are added only by an admin invitation from the Firm Owner ⟨src: d:identity_provider, d:invite_flow, d:roles⟩. This is a single-organisation deployment, so every logged-in user sees the one firm's data with no tenant partition ⟨src: d:tenancy⟩.

### Permissions matrix

Every cell is exactly ✓, ✗, or ✓* (conditional; see numbered notes). Columns are the actors; each row is one action the system performs.

| Action | Bookkeeper (p1) | Firm Owner (p2) | Client (p3) |
|---|---|---|---|
| Add or edit a Client's non-rate fields | ✓ | ✓ | ✗ |
| Change a Client's monthly rate | ✓*¹ | ✓ | ✗ |
| Archive a Client | ✓ | ✓ | ✗ |
| Restore an archived Client | ✗ | ✗ | ✗ |
| Set a Service default rate | ✗ | ✓ | ✗ |
| Create an Invoice | ✓ | ✓ | ✗ |
| Add a Line Item to an Invoice | ✓ | ✓ | ✗ |
| Edit an unsent / unpaid Invoice | ✓*⁴ | ✓*⁴ | ✗ |
| Send an Invoice | ✓ | ✓ | ✗ |
| Receive an Invoice by email | ✗ | ✗ | ✓*² |
| Record a Payment | ✓ | ✓ | ✗ |
| Mark an Invoice paid | ✓*³ | ✓*³ | ✗ |
| Send an overdue reminder | ✓ | ✓ | ✗ |
| Void an Invoice | ✓*¹ | ✓ | ✗ |
| Issue a credit note | ✗ | ✓ | ✗ |
| Generate a Statement | ✓ | ✓ | ✗ |
| Review a Statement | ✓ | ✓ | ✗ |
| View dashboard totals | ✓ | ✓ | ✗ |
| Attach or download files on an Invoice | ✓ | ✓ | ✗ |
| Export lists as CSV | ✓ | ✓ | ✗ |
| Apply a bulk action to selected records | ✓*⁶ | ✓*⁶ | ✗ |
| Undo the last field edit | ✓*⁵ | ✓*⁵ | ✗ |
| View audit fields (created/updated by, when) | ✓ | ✓ | ✗ |
| Import initial data (one-time CSV) | ✓*⁷ | ✓*⁷ | ✗ |
| Invite or manage user accounts | ✗ | ✓ | ✗ |
| Grant temporary delegated rights | ✗ | ✓ | ✗ |
| Edit firm branding and invoice template | ✗ | ✓ | ✗ |

#### Conditional notes

1. A Bookkeeper may change a Client's monthly rate or void an Invoice only while holding an active, unexpired delegation granted by the Firm Owner; without that delegation both actions are ✗ ⟨src: r:r5, r:r6, d:x7⟩.
2. The Client holds no account and performs no in-app action. The ✓* means the system delivers the Invoice PDF by email to the Client's contact email when the Invoice is sent; there is no login, portal, or email-open tracking ⟨src: n:n11, d:external_access, d:invoice_delivery, g:g2⟩.
3. "Mark an Invoice paid" is permitted only when the sum of applied Payments equals the Invoice amount exactly; applied credit-note amounts do not count toward Paid and instead settle the balance separately ⟨src: r:r7, r:r10⟩.
4. Editing an Invoice is permitted only while it is Draft, Sent, or Partially paid and is not yet Paid or Void; a Sent Invoice may never revert to Draft — corrections require voiding and reissuing ⟨src: d:invoice_edit_after_send, r:r4, r:r9⟩.
5. Undo affects only the most recent field edit on a Draft record; it can never change an Invoice's status and can never touch a Paid or Void Invoice ⟨src: r:r4, r:r9, src: default⟩.
6. A bulk action may void or archive the selected records but can never hard-delete; no record is ever physically removed ⟨src: d:record_bulk_edit, d:deletion, r:r12⟩.
7. Import is a one-time setup action available while the firm has no invoices; after first use it is disabled ⟨src: d:data_import⟩.

#### Notes on actions deliberately absent

No approval step exists on any action; nothing is queued for a second party's sign-off ⟨src: d:approval_workflow⟩. There is no "Restore an archived Client" capability in v1: archiving a Client is one-way, so the row is ✗ for all actors (default) ⟨src: d:x1, src: default⟩.

### Concurrency control

Editing is guarded. Each editable record carries a version stamp; a save that targets a stale version is rejected and the editor is asked to reload before retrying, so two simultaneous edits can never silently overwrite one another ⟨src: d:concurrency⟩. Repeated Send or Record-Payment submissions (double-click or retry) are detected and ignored as duplicates ⟨src: d:x2⟩.

### Data-visibility boundaries

These boundaries agree with the matrix cell for cell.

- The Client sees nothing inside the application and has no session; it receives only the PDF email for its own Invoices, matching the all-✗ Client column and the single ✓*² receipt row ⟨src: p:p3, d:external_access, g:g2⟩.
- The Bookkeeper and the Firm Owner both see the full firm dataset — all Clients, Invoices, Line Items, Payments, Services, and Statements — consistent with their shared ✓ rows for creating, viewing, and exporting ⟨src: d:tenancy, d:data_export⟩.
- Owner-exclusive visibility and control (matrix ✗ for an undelegated Bookkeeper) covers: setting Service default rates, changing a Client's monthly rate, voiding Invoices, issuing credit notes, inviting or managing user accounts, granting delegations, and editing firm branding and invoice templates ⟨src: r:r5, r:r6, a:a7, d:invite_flow, d:x7, d:credit_notes, d:branding⟩.
- A delegated Bookkeeper temporarily gains exactly the rate-change and void visibility of the Owner for the delegation's lifetime, and no more ⟨src: d:x7, r:r5, r:r6⟩.
- Audit fields (who created or updated a record and when) are visible to both logged-in roles on every record they can already see; there is no separate change-history viewer in v1 ⟨src: d:audit_trail⟩.

## Data model

All monetary values are stored as integer cents in a single currency ⟨src: d:currencies, d:x3⟩. Amounts are stored **positive**; reductions to a balance (payments, credit notes) are also stored positive and are **subtracted** in derived formulas, so a balance can only decrease toward zero and never below it ⟨src: d:payments_in_app, r:r3⟩. No tax fields exist on any entity ⟨src: d:taxes, g:g4⟩. No entity is ever hard-deleted; records leave active use only by `void` (Invoice) or `archived` (Client) status ⟨src: d:deletion, r:r12, d:x1⟩.

Every entity carries the same **audit fields** (basic who/when only) ⟨src: d:audit_trail⟩:
- `created_by` (User id, required)
- `created_at` (timestamp, required)
- `updated_by` (User id, required)
- `updated_at` (timestamp, required)

Every mutable entity also carries `version` (integer, required, starts at 1) used for optimistic-lock conflict detection: a save is rejected when the submitted `version` differs from the stored `version`, and the editor is shown the current record ⟨src: d:concurrency⟩.

### User
Login accounts for firm staff; one organisation only, no client accounts ⟨src: d:user_accounts, d:tenancy, d:external_access, g:g2⟩.
| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | uuid | yes | identifier |
| `name` | string | yes | |
| `email` | string | yes | unique, case-insensitive; sign-in identity ⟨src: d:identity_provider⟩ |
| `password_hash` | string | yes | email + password sign-in ⟨src: d:identity_provider⟩ |
| `role` | enum(`owner`,`bookkeeper`) | yes | maps to Firm Owner / Bookkeeper ⟨src: d:roles, p:p1, p:p2⟩ |
| `status` | enum(`active`,`archived`) | yes | invited by an admin; never deleted ⟨src: d:invite_flow, d:deletion⟩ |

### Delegation
A time-boxed grant letting a Bookkeeper exercise Owner-only rights while the Owner is unavailable ⟨src: d:x7, r:r5, r:r6⟩.
| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | uuid | yes | |
| `bookkeeper_id` | User id | yes | grantee, must be role `bookkeeper` ⟨src: d:x7⟩ |
| `granted_by` | User id | yes | must be role `owner` ⟨src: d:x7, r:r5⟩ |
| `rights` | set(`void_invoice`,`change_client_rate`) | yes | which Owner-only powers are delegated ⟨src: d:x7, r:r5, r:r6⟩ |
| `expires_at` | timestamp | yes | grant is inactive once `expires_at` has passed ⟨src: d:x7⟩ |

### Client
A business the firm bills monthly ⟨src: n:n1, p:p3⟩.
| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | uuid | yes | identifier |
| `business_name` | string | yes | e.g. Acme Landscaping ⟨src: n:n1⟩ |
| `contact_email` | string | yes | invoice delivery address ⟨src: n:n1, d:invoice_delivery⟩ |
| `monthly_rate` | money (cents ≥ 0) | yes | changeable only by Firm Owner or a Bookkeeper with an active `change_client_rate` delegation ⟨src: n:n1, r:r6, d:x7⟩ |
| `billing_day` | integer 1–31 | yes | when a `billing_day` does not exist in a month, use the last day of that month ⟨src: n:n1, d:x4⟩ |
| `status` | enum(`active`,`archived`) | yes | archiving keeps all invoices and payments intact; no cascade delete ⟨src: n:n1, d:x1, r:r12⟩ |

Identifier/uniqueness: `id` primary; `business_name` is unique after trimming and case-folding (used by import matching, below) ⟨src: n:n1, d:data_import⟩.

### Invoice
A monthly bill for one Client ⟨src: n:n2⟩.
| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | uuid | yes | identifier |
| `invoice_number` | integer | yes | strictly sequential per firm; unique; the only permitted gaps are numbers retained by voided invoices ⟨src: n:n2, r:r1, d:invoice_numbering, d:x8⟩ |
| `client_id` | Client id | yes | exactly one Client per invoice ⟨src: n:n2, r:r8⟩ |
| `status` | enum(`draft`,`sent`,`partially_paid`,`paid`,`overdue`,`void`) | yes | see status derivation below ⟨src: n:n2, d:invoice_statuses⟩ |
| `delivery_status` | enum(`not_sent`,`delivered`,`delivery_failed`) | yes | on send, marked `delivered`; if the email fails the invoice stays `sent` but `delivery_status` becomes `delivery_failed` for retry ⟨src: d:x5, d:invoice_delivery⟩ |
| `issue_date` | date | yes | set when sent ⟨src: a:a3⟩ |
| `due_date` | date | yes | `issue_date` + `net_terms_days` from Firm Settings ⟨src: n:n2, d:payment_terms⟩ |
| `discount_amount` | money (cents ≥ 0) | no | single whole-invoice discount ⟨src: d:invoice_discounts⟩ |
| `notes` | text | no | free text ⟨src: default⟩ |

**Derived fields** (never stored, always computed) ⟨src: n:n2⟩:
- `subtotal` = sum of `Line Item.amount` for the invoice ⟨src: n:n3, r:r2⟩
- `amount` (invoice total) = `subtotal` − `discount_amount` (0 when unset); must be > 0 to send ⟨src: n:n2, d:invoice_discounts, r:r2⟩
- `amount_paid` = sum of `Payment.amount` applied to the invoice ⟨src: n:n4⟩
- `credited_amount` = sum of `Credit Note.amount` applied to the invoice ⟨src: d:credit_notes⟩
- `balance_due` = `amount` − `amount_paid` − `credited_amount`; clamped so it can never go below 0 ⟨src: r:r3, d:partial_payments⟩

**Status derivation** (mutually exclusive) ⟨src: d:invoice_statuses, r:r7, r:r10, r:r11⟩:
- `draft` until sent ⟨src: r:r2, a:a3⟩
- `sent` once emailed with `amount_paid` = 0 and `credited_amount` = 0 ⟨src: a:a3⟩
- `partially_paid` when 0 < `amount_paid` < `amount` ⟨src: r:r10⟩
- `paid` **only** when `amount_paid` = `amount`; a balance closed by credit notes rather than payments is *settled by credit note* and does not set `paid` ⟨src: r:r7, d:credit_notes⟩
- `overdue` when `status` is `sent` or `partially_paid`, `balance_due` > 0, and `due_date` has passed ⟨src: r:r11⟩
- `void` when voided; terminal ⟨src: a:a9, r:r12, d:x6⟩

Editability: an invoice is editable while unpaid; a `paid` invoice cannot be edited and must be voided and reissued ⟨src: r:r4, d:invoice_edit_after_send⟩. A `sent` invoice never reverts to `draft` ⟨src: r:r9, d:x6⟩. Voiding retains the record and its `invoice_number` in place, leaving a visible gap ⟨src: r:r12, d:x8⟩.

### Line Item
A single charge on an invoice ⟨src: n:n3⟩.
| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | uuid | yes | identifier |
| `invoice_id` | Invoice id | yes | parent invoice ⟨src: n:n3, a:a2⟩ |
| `description` | string | yes | e.g. Monthly bookkeeping ⟨src: n:n3⟩ |
| `quantity` | decimal > 0 | yes | ⟨src: n:n3, d:x3⟩ |
| `rate` | money (cents) | yes | may be seeded from a Service `default_rate` ⟨src: n:n3, n:n5⟩ |
| `amount` (derived) | money | — | = round-to-cents(`quantity` × `rate`); a computed `amount` of zero or negative is rejected ⟨src: n:n3, d:x3⟩ |

### Payment
Money recorded against an invoice; money moves outside the app ⟨src: n:n4, d:payments_in_app, d:payment_recording, g:g1⟩.
| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | uuid | yes | identifier |
| `invoice_id` | Invoice id | yes | the invoice paid ⟨src: n:n4, a:a4⟩ |
| `amount` | money (cents > 0) | yes | stored positive; each save must satisfy `amount` ≤ current `balance_due`, so total payments plus credits never exceed `amount` ⟨src: n:n4, r:r3, d:partial_payments⟩ |
| `date_received` | date | yes | e.g. Mar 12 ⟨src: n:n4⟩ |
| `method` | enum(`bank_transfer`,`cheque`,`cash`,`other`) | yes | recorded label only; the firm does not process the payment ⟨src: n:n4, g:g1, default⟩ |
| `idempotency_key` | string | yes | a payment or send fired twice with the same key is detected and ignored ⟨src: d:x2⟩ |

### Credit Note
A correction that reduces an invoice's balance without a payment ⟨src: d:credit_notes⟩.
| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | uuid | yes | identifier |
| `credit_note_number` | string | yes | own `CN-` sequence, strictly sequential; kept separate from `invoice_number` so the invoice series stays gapless per R-r1 ⟨src: d:credit_note_numbering, r:r1⟩ |
| `invoice_id` | Invoice id | yes | invoice being credited ⟨src: d:credit_notes⟩ |
| `amount` | money (cents > 0) | yes | stored positive; subtracted in `balance_due`; sum of applied credit notes may not exceed `amount` ⟨src: d:credit_notes, r:r3⟩ |
| `reason` | string | yes | why the credit was issued ⟨src: d:credit_notes⟩ |
| `issued_date` | date | yes | ⟨src: d:credit_notes⟩ |

### Service
A reusable billable service with a standard rate, used to seed line items ⟨src: n:n5, a:a7⟩.
| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | uuid | yes | identifier |
| `name` | string | yes | e.g. Monthly bookkeeping ⟨src: n:n5⟩ |
| `default_rate` | money (cents) | yes | set by Firm Owner ⟨src: n:n5, a:a7⟩ |
| `billing_frequency` | enum(`monthly`,`quarterly`,`annual`,`one_time`) | yes | label only; no automatic recurring invoices ⟨src: n:n5, g:g5, d:recurring_invoices, default⟩ |

### Statement
A generated snapshot of a Client's invoices and balance over a period ⟨src: n:n6, a:a10⟩.
| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | uuid | yes | identifier |
| `client_id` | Client id | yes | ⟨src: n:n6⟩ |
| `period_start` | date | yes | ⟨src: n:n6⟩ |
| `period_end` | date | yes | ⟨src: n:n6⟩ |
| `generated_at` | timestamp | yes | snapshot time ⟨src: a:a10⟩ |
| `total_billed` (derived) | money | — | = sum of `Invoice.amount` for the client with `issue_date` within [`period_start`,`period_end`], excluding `void` ⟨src: n:n6, r:r12⟩ |
| `balance_due` (derived) | money | — | = sum of `Invoice.balance_due` for those same invoices ⟨src: n:n6⟩ |

### Firm Settings
Single-row configuration for the one organisation ⟨src: d:tenancy, d:customization⟩.
| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | uuid | yes | exactly one row ⟨src: d:tenancy⟩ |
| `logo` | file | no | shown on invoice PDFs ⟨src: d:branding, d:attachments⟩ |
| `primary_color` | string (hex) | no | invoice branding ⟨src: d:branding⟩ |
| `accent_color` | string (hex) | no | invoice branding ⟨src: d:branding⟩ |
| `invoice_footer_wording` | text | no | customisable invoice wording ⟨src: d:customization, d:branding⟩ |
| `net_terms_days` | integer | yes | default 15 (Net 15) unless changed; drives `Invoice.due_date` ⟨src: d:payment_terms, default⟩ |

### Import contract
One-time spreadsheet import of Clients and Services ⟨src: d:data_import⟩.
- **Accepted formats:** `.csv` (UTF-8, comma-separated) ⟨src: d:data_import, default⟩.
- **Client headers (exact, case-sensitive):** `business_name` (text), `contact_email` (text email), `monthly_rate` (currency, decimal dollars, e.g. `450.00`), `billing_day` (number 1–31) ⟨src: n:n1, d:data_import⟩.
- **Service headers (exact, case-sensitive):** `name` (text), `default_rate` (currency decimal dollars), `billing_frequency` (one of `monthly`,`quarterly`,`annual`,`one_time`) ⟨src: n:n5, d:data_import⟩.
- **Resolution rule:** a Client row resolves to an existing Client when `business_name` matches an existing `business_name` after trimming leading/trailing whitespace and case-folding; a matched row is skipped (never updated) and reported ⟨src: n:n1, d:data_import⟩.
- **Unresolved / invalid rows:** a row with a missing required header value, an unparseable currency, or `billing_day` outside 1–31 is rejected and listed in a per-row error report; valid rows in the same file still import ⟨src: d:data_import, d:x3⟩.
- **File retention:** the uploaded CSV is discarded after the import completes; only the created records remain ⟨src: d:data_import, default⟩.

Data export: active lists (Clients, Invoices, Payments) are downloadable as CSV; no API ⟨src: d:data_export, d:integrations, g:g3⟩.

## Lifecycles (state machines)

### Client

Each Client starts in `active` and moves through 2 states.

States:
- `active` — Active: Client is billed monthly for bookkeeping services and can have invoices created for it.
- `archived` — Archived: Client is no longer actively billed; existing invoices and payments are retained intact.

| From | To | Who | When | Guard | ⟨src⟩ |
|---|---|---|---|---|---|
| `active` | `archived` | Bookkeeper | Bookkeeper removes a client that has invoices or payments | — | ⟨src: a6, x1, never_delete⟩ |

Terminal: `archived` — once reached, no further transitions.

### Invoice

Each Invoice starts in `draft` and moves through 7 states.

States:
- `draft` — Draft: Invoice created with a sequential number but not yet sent; line items may still be added or edited.
- `sent` — Sent: Invoice emailed to the client as a PDF; awaiting payment. Delivery failures are flagged for retry but the invoice remains sent.
- `viewed` — Viewed: Client has received/opened the invoice; still awaiting payment.
- `partially_paid` — Partially Paid: One or more payments recorded but the total does not yet cover the full invoice amount.
- `overdue` — Overdue: Due date has passed without full payment; flagged for manual reminder.
- `paid` — Paid: Payments equal the full invoice amount; the invoice is locked and cannot be edited.
- `void` — Void: Invoice cancelled; the record and its number are retained for the audit trail. Corrections are made by reissuing a new invoice.

| From | To | Who | When | Guard | ⟨src⟩ |
|---|---|---|---|---|---|
| `draft` | `sent` | Bookkeeper | Bookkeeper sends the invoice by email | invoice has at least one line item with an amount | ⟨src: a3, r2, x5⟩ |
| `draft` | `void` | Firm Owner | Firm Owner voids an invoice created in error | — | ⟨src: a9, r5, r12, x8⟩ |
| `sent` | `viewed` | Client | Client receives and opens the invoice | — | ⟨src: a11⟩ |
| `sent` | `partially_paid` | Bookkeeper | Bookkeeper records a partial payment | recorded payments are less than the invoice total | ⟨src: a4, r10, r3⟩ |
| `sent` | `paid` | Bookkeeper | Bookkeeper records full payment and marks the invoice paid | recorded payments equal the invoice total | ⟨src: a4, a5, r7⟩ |
| `sent` | `overdue` | system | Due date passes without full payment | due date has passed and invoice is not fully paid | ⟨src: r11⟩ |
| `sent` | `void` | Firm Owner | Firm Owner voids the invoice | — | ⟨src: a9, r5, r12⟩ |
| `viewed` | `partially_paid` | Bookkeeper | Bookkeeper records a partial payment | recorded payments are less than the invoice total | ⟨src: a4, r10, r3⟩ |
| `viewed` | `paid` | Bookkeeper | Bookkeeper records full payment and marks the invoice paid | recorded payments equal the invoice total | ⟨src: a4, a5, r7⟩ |
| `viewed` | `overdue` | system | Due date passes without full payment | due date has passed and invoice is not fully paid | ⟨src: r11⟩ |
| `viewed` | `void` | Firm Owner | Firm Owner voids the invoice | — | ⟨src: a9, r5, r12⟩ |
| `partially_paid` | `paid` | Bookkeeper | Bookkeeper records the remaining payment | recorded payments now equal the invoice total | ⟨src: a4, a5, r7, r10⟩ |
| `partially_paid` | `overdue` | system | Due date passes with an outstanding balance | due date has passed and balance remains | ⟨src: r11, r10⟩ |
| `partially_paid` | `void` | Firm Owner | Firm Owner voids the invoice | — | ⟨src: a9, r5, r12⟩ |
| `overdue` | `partially_paid` | Bookkeeper | Bookkeeper records a partial payment | recorded payments are less than the invoice total | ⟨src: a4, r10, r3⟩ |
| `overdue` | `paid` | Bookkeeper | Bookkeeper records full payment and marks the invoice paid | recorded payments equal the invoice total | ⟨src: a4, a5, r7⟩ |
| `overdue` | `void` | Firm Owner | Firm Owner voids the invoice | — | ⟨src: a9, r5, r12⟩ |
| `paid` | `void` | Firm Owner | Firm Owner voids a paid invoice to correct it (reissue required) | — | ⟨src: r4, r5, x6, r12⟩ |

Terminal: `void` — once reached, no further transitions.

### Statement

Each Statement starts in `generated` and moves through 2 states.

States:
- `generated` — Generated: A period statement summarizing a client's invoices and balance has been produced.
- `reviewed` — Reviewed: Firm Owner has reviewed the statement.

| From | To | Who | When | Guard | ⟨src⟩ |
|---|---|---|---|---|---|
| `generated` | `reviewed` | Firm Owner | Firm Owner reviews the statement | — | ⟨src: a10, a8⟩ |

Terminal: `reviewed` — once reached, no further transitions.

## Rules & invariants

The rules below restate every Sheet rule with a stable id (`R-<id>`), a verification sketch, and the entities and actions it constrains. Derived invariants (`R-d<n>`) follow from decisions in the log. All money is integer cents in one currency; balances only decrease toward zero and never below it ⟨src: d:currencies⟩ ⟨src: d:x3⟩.

### Sheet rules

#### R-r1 — Unique sequential invoice numbers
Every issued Invoice carries a strictly sequential `invoice_number` that is unique per firm; the only gaps permitted are numbers retained by voided invoices ⟨src: r:r1⟩ ⟨src: d:invoice_numbering⟩ ⟨src: d:x8⟩. Constrains: Invoice, create Invoice ⟨src: n:n2⟩ ⟨src: a:a1⟩.

*Verify:* create #1042, then create the next invoice and assert it is #1043; void #1043 and create again, asserting the next is #1044 with #1043 retained as a visible void gap and never reused ⟨src: r:r1⟩ ⟨src: d:x8⟩.

#### R-r2 — No send without a chargeable line item
An Invoice cannot leave `draft` (be sent) until it has at least one Line Item with an `amount` greater than zero ⟨src: r:r2⟩. Constrains: Invoice, send Invoice, add Line Item ⟨src: n:n2⟩ ⟨src: a:a3⟩ ⟨src: a:a2⟩.

*Verify:* attempt to send an Invoice with no line items and assert rejection; add a $450 line item and assert send succeeds ⟨src: r:r2⟩ ⟨src: n:n3⟩.

#### R-r3 — Payments never exceed the outstanding balance
The sum of Payment amounts applied to an Invoice may never exceed the Invoice's outstanding balance, defined as `amount` minus already-applied Payment amounts minus applied credit-note amounts ⟨src: r:r3⟩ ⟨src: d:credit_notes⟩. This caps recording against the balance rather than the gross `amount`, so no overpaid (negative) balance can arise ⟨src: r:r3⟩. Constrains: Payment, record Payment ⟨src: n:n4⟩ ⟨src: a:a4⟩.

*Verify:* on a $450 Invoice, attempt to record a $500 Payment and assert rejection; apply a $200 credit note, then attempt a $300 Payment and assert rejection because the outstanding balance is $250 ⟨src: r:r3⟩ ⟨src: d:credit_notes⟩.

#### R-r4 — Paid invoices are immutable
An Invoice in `paid` status cannot be edited; corrections require voiding it and issuing a new Invoice ⟨src: r:r4⟩ ⟨src: d:invoice_edit_after_send⟩. Constrains: Invoice, edit Invoice, void Invoice ⟨src: n:n2⟩ ⟨src: a:a9⟩.

*Verify:* mark an Invoice `paid`, attempt to change any field or line item and assert rejection; void it and assert a new Invoice can be created ⟨src: r:r4⟩.

#### R-r5 — Voiding is restricted
An Invoice may be voided only by the Firm Owner, or by a Bookkeeper holding an active, unexpired Delegation that includes the `void_invoice` right ⟨src: r:r5⟩ ⟨src: d:x7⟩. Constrains: Invoice, void Invoice ⟨src: a:a9⟩ ⟨src: p:p2⟩ ⟨src: p:p1⟩.

*Verify:* a Bookkeeper with no delegation attempts to void and is denied; the Firm Owner voids and succeeds; a Bookkeeper with a live `void_invoice` Delegation voids and succeeds; after `expires_at` passes the same Bookkeeper is denied ⟨src: r:r5⟩ ⟨src: d:x7⟩.

#### R-r6 — Rate changes are restricted
A Client's `monthly_rate` may be changed only by the Firm Owner, or by a Bookkeeper holding an active, unexpired Delegation that includes the `change_client_rate` right ⟨src: r:r6⟩ ⟨src: d:x7⟩. Constrains: Client, set Service, edit Client rate ⟨src: n:n1⟩ ⟨src: a:a7⟩ ⟨src: p:p2⟩.

*Verify:* a Bookkeeper with no delegation attempts to change Acme's $450 rate and is denied; the Firm Owner changes it and succeeds; a delegated Bookkeeper succeeds until `expires_at` ⟨src: r:r6⟩ ⟨src: d:x7⟩.

#### R-r7 — Paid means payments equal the amount
An Invoice is set to `paid` only when the sum of applied Payment amounts equals `amount` exactly ⟨src: r:r7⟩. Credit-note amounts do not count toward `paid`: an Invoice fully offset by credit notes is recorded as settled-by-credit-note, not `paid`, so `paid` always reflects money actually received ⟨src: r:r7⟩ ⟨src: d:credit_notes⟩. Constrains: Invoice, mark paid Invoice, record Payment ⟨src: n:n2⟩ ⟨src: a:a5⟩ ⟨src: a:a4⟩.

*Verify:* a $450 Invoice with $300 in Payments cannot be marked `paid`; add $150 in Payments and assert it becomes `paid`; a $450 Invoice with a $450 credit note and $0 Payments is not `paid` ⟨src: r:r7⟩ ⟨src: r:r10⟩.

#### R-r8 — One client per invoice
Each Invoice is tied to exactly one Client via `client_id`, set at creation and never null ⟨src: r:r8⟩. Constrains: Invoice, create Invoice ⟨src: n:n2⟩ ⟨src: a:a1⟩.

*Verify:* attempt to create an Invoice with no `client_id` and assert rejection; assert an Invoice references exactly one Client ⟨src: r:r8⟩ ⟨src: n:n1⟩.

#### R-r9 — Sent invoices never revert to draft
Once an Invoice reaches `sent`, it can never return to `draft`; corrections require voiding and reissuing ⟨src: r:r9⟩ ⟨src: d:x6⟩. Constrains: Invoice, send Invoice, void Invoice ⟨src: n:n2⟩ ⟨src: a:a3⟩.

*Verify:* send an Invoice, then attempt any operation that would set status back to `draft` and assert rejection; assert the only correction path is void-and-reissue ⟨src: r:r9⟩ ⟨src: d:x6⟩.

#### R-r10 — Partial payments produce a partially-paid state
A Payment that leaves a positive outstanding balance moves the Invoice to `partially_paid`; it becomes `paid` only when applied Payments total `amount` ⟨src: r:r10⟩ ⟨src: d:partial_payments⟩. Constrains: Invoice, record Payment ⟨src: n:n2⟩ ⟨src: a:a4⟩.

*Verify:* record $200 against a $450 Invoice and assert status `partially_paid`; record the remaining $250 and assert status `paid` ⟨src: r:r10⟩ ⟨src: r:r7⟩.

#### R-r11 — Overdue flagging
A `sent` or `partially_paid` Invoice whose `due_date` has passed without full payment is flagged `overdue` ⟨src: r:r11⟩. Constrains: Invoice ⟨src: n:n2⟩.

*Verify:* set an Invoice `due_date` in the past with unpaid balance and assert status `overdue`; record full payment and assert it leaves `overdue` for `paid` ⟨src: r:r11⟩ ⟨src: r:r7⟩.

#### R-r12 — Voiding never deletes
Voiding an Invoice sets status `void` but never removes the record; both the record and its `invoice_number` are retained for the audit trail ⟨src: r:r12⟩ ⟨src: d:deletion⟩ ⟨src: d:x8⟩. Constrains: Invoice, void Invoice ⟨src: n:n2⟩ ⟨src: a:a9⟩.

*Verify:* void #1039, then assert the record is still readable, its status is `void`, and #1039 is never reissued to another Invoice ⟨src: r:r12⟩ ⟨src: d:x8⟩.

### Derived invariants

#### R-d1 — Line-item amount formula and sign
For every Line Item, `amount = quantity × rate`, rounded to cents; zero and negative line amounts are rejected ⟨src: n:n3⟩ ⟨src: d:x3⟩. *Verify:* enter quantity 1 × $450 and assert amount $450; enter a $0 or −$50 line and assert rejection ⟨src: d:x3⟩.

#### R-d2 — Invoice amount is the sum of its line items
An Invoice's `amount` equals the sum of its Line Item `amount` values ⟨src: n:n2⟩ ⟨src: n:n3⟩. *Verify:* add two lines of $450 and $50 and assert `amount` is $500 ⟨src: n:n3⟩.

#### R-d3 — Balance formula
Outstanding balance for an Invoice = `amount` − applied Payment amounts − applied credit-note amounts, and is never negative ⟨src: n:n6⟩ ⟨src: d:credit_notes⟩ ⟨src: r:r3⟩. A Client's Statement `balance_due` is the sum of its Invoices' balances over the period ⟨src: n:n6⟩. *Verify:* for a $450 Invoice with $200 Payment and $50 credit note, assert balance $200 and that no recording can drive it below zero ⟨src: r:r3⟩ ⟨src: n:n6⟩.

#### R-d4 — Billing-day roll-off
When a Client's `billing_day` does not exist in a given month (e.g. the 31st in April), the invoice and due dates use the last day of that month ⟨src: n:n1⟩ ⟨src: d:x4⟩. *Verify:* set `billing_day` 31 and generate for April; assert the date is April 30 ⟨src: d:x4⟩.

#### R-d5 — Idempotent send and payment
A Send or Record-Payment action fired twice for the same Invoice (double-click or retry) is detected and applied once; the duplicate is ignored ⟨src: d:x2⟩. *Verify:* submit the same $450 Payment twice with the same request key and assert only one Payment exists ⟨src: d:x2⟩ ⟨src: a:a4⟩.

#### R-d6 — Delivery-failure handling
When an Invoice is sent but the email fails, the Invoice remains `sent` and `delivery_status` is set to `delivery_failed` for retry; it is never silently dropped and never held in `draft` ⟨src: d:x5⟩ ⟨src: r:r9⟩. *Verify:* force an email failure on send and assert status `sent` with `delivery_status` `delivery_failed` ⟨src: d:x5⟩.

#### R-d7 — No state reversal except void-and-reissue
Invoice states cannot be reversed: a sent Invoice cannot be un-sent and a paid Invoice cannot be re-opened; the only correction is void-and-reissue ⟨src: d:x6⟩ ⟨src: r:r4⟩ ⟨src: r:r9⟩. *Verify:* attempt to un-send and to un-pay and assert both are rejected ⟨src: d:x6⟩.

#### R-d8 — Undo is scoped to draft field edits
Undo affects only the most recent field edit on a `draft` Invoice or on a Client; it can never change an Invoice's status and can never touch a `paid` or `void` Invoice ⟨src: r:r4⟩ ⟨src: r:r9⟩ ⟨src: default⟩. *Verify:* undo a description edit on a draft and assert success; attempt undo that would revert `sent`→`draft` and assert rejection ⟨src: r:r9⟩.

#### R-d9 — Bulk actions cannot hard-delete
A bulk action over selected records may only void Invoices or archive Clients; it can never physically remove a record ⟨src: d:record_bulk_edit⟩ ⟨src: d:deletion⟩ ⟨src: r:r12⟩. *Verify:* select several Invoices, apply bulk void, and assert all remain readable with status `void`; assert no bulk hard-delete option exists ⟨src: r:r12⟩.

#### R-d10 — Archiving a client preserves history
Archiving a Client sets `status` `archived` and keeps all its Invoices and Payments intact; there is no cascade delete and no restore path in v1 ⟨src: d:x1⟩ ⟨src: d:deletion⟩ ⟨src: default⟩. *Verify:* archive a Client with invoices and assert every invoice and payment is still present and readable ⟨src: d:x1⟩.

#### R-d11 — Credit notes use their own number sequence
Credit notes are numbered in a separate `CN-` sequence so they never consume invoice numbers; this preserves R-r1's no-gap invoice sequence ⟨src: d:credit_note_numbering⟩ ⟨src: r:r1⟩. *Verify:* issue a credit note after Invoice #1042, assert it takes CN-0001, and assert the next Invoice is still #1043 ⟨src: r:r1⟩ ⟨src: d:credit_note_numbering⟩.

#### R-d12 — Guarded concurrent edits
Each mutable record carries a `version`; a save whose submitted `version` differs from the stored `version` is rejected and the editor is shown the current record, so conflicting simultaneous edits never silently overwrite each other ⟨src: d:concurrency⟩. *Verify:* load a Client in two sessions, save in the first, then save in the second and assert the second is rejected with the current record returned ⟨src: d:concurrency⟩.

#### R-d13 — No tax, single currency
No Invoice, Line Item, or Statement carries a tax field, and all amounts are in one currency ⟨src: d:taxes⟩ ⟨src: g:g4⟩ ⟨src: d:currencies⟩. *Verify:* assert no tax field is accepted or computed on any invoice ⟨src: d:taxes⟩.

#### R-d14 — Sent invoices carry firm branding
Every sent Invoice PDF is rendered from the firm's configured branding — logo, colours, and wording — set only by the Firm Owner ⟨src: d:branding⟩ ⟨src: d:customization⟩ ⟨src: p:p2⟩. *Verify:* set a firm logo and colours, send an Invoice, and assert the generated PDF reflects them ⟨src: d:branding⟩.

#### R-d15 — Import is one-time
Initial CSV import is available only while the firm has no Invoices; after first successful use it is disabled ⟨src: d:data_import⟩. *Verify:* run import on an empty firm and assert success; create an Invoice, then assert import is no longer offered ⟨src: d:data_import⟩.

## Acceptance scenarios

These scenarios exercise every action and every rule at least once, including negative access cases. All money is integer cents in one currency; balances only fall toward zero and never below it ⟨src: d:currencies⟩ ⟨src: d:x3⟩.

### Client setup and rates

**S1 — Add a client (a6).**
Given a signed-in Bookkeeper, When they add "Acme Landscaping" with contact email `billing@acme.com`, a $450 monthly rate, and billing day 1, Then a Client record is created in `active` status and appears in the client list ⟨src: a:a6⟩ ⟨src: n:n1⟩.

**S2 — Owner sets a Service rate (a7).**
Given a signed-in Firm Owner, When they set the "Monthly bookkeeping" Service default rate to $450, Then the Service default rate is saved and offered when adding line items ⟨src: a:a7⟩ ⟨src: n:n5⟩.

**S3 — Owner changes a client's monthly rate (r6, positive).**
Given a signed-in Firm Owner and Acme at a $450 rate, When they change Acme's monthly rate to $500, Then the change is saved ⟨src: r:r6⟩ ⟨src: n:n1⟩.

**S4 — Bookkeeper cannot change a rate without delegation (r6, negative).**
Given a signed-in Bookkeeper holding no active `change_client_rate` delegation, When they attempt to change Acme's monthly rate, Then the action is denied and the rate is unchanged ⟨src: r:r6⟩ ⟨src: d:x7⟩ ⟨src: p:p1⟩.

**S5 — Delegated Bookkeeper may change a rate, until it expires (r6, x7).**
Given a Bookkeeper holding an active `change_client_rate` Delegation granted by the Firm Owner, When they change Acme's rate before `expires_at`, Then the change succeeds; and When they attempt the same change after `expires_at` has passed, Then it is denied ⟨src: r:r6⟩ ⟨src: d:x7⟩.

**S6 — Archiving a client keeps history (x1).**
Given Acme has invoices and recorded payments, When a Bookkeeper removes Acme, Then Acme moves to `archived`, its invoices and payments remain intact, and no record is deleted ⟨src: d:x1⟩ ⟨src: d:deletion⟩ ⟨src: r:r12⟩.

**S7 — Restore is not offered (negative, default).**
Given an `archived` Client, When any signed-in user looks for a restore control, Then none is available to any actor because archiving is one-way in v1 ⟨src: d:x1⟩ ⟨src: src: default⟩.

### Creating, editing, and sending invoices

**S8 — Create an invoice with a sequential number (a1, r1, r8).**
Given the last issued invoice is #1042, When a Bookkeeper creates a new Invoice for Acme, Then it is #1043, tied to exactly one Client, and starts in `draft` ⟨src: a:a1⟩ ⟨src: r:r1⟩ ⟨src: r:r8⟩ ⟨src: d:invoice_numbering⟩ ⟨src: n:n2⟩.

**S9 — Billing day that does not exist in the month (x4).**
Given a Client with billing day 31, When an Invoice is created in a 30-day month, Then the invoice date is set to the last day of that month ⟨src: d:x4⟩ ⟨src: n:n1⟩.

**S10 — Add a chargeable line item (a2).**
Given a draft Invoice #1043, When the Bookkeeper adds "Monthly bookkeeping", quantity 1, rate $450, Then a Line Item with amount $450 (quantity × rate) is attached ⟨src: a:a2⟩ ⟨src: n:n3⟩.

**S11 — Zero or negative line amount is rejected (x3).**
Given a draft Invoice, When the Bookkeeper adds a line item whose amount rounds to $0 or is negative, Then the line item is rejected ⟨src: d:x3⟩ ⟨src: n:n3⟩.

**S12 — Cannot send a draft without a chargeable line item (r2, negative).**
Given a draft Invoice with no line item carrying an amount, When the Bookkeeper attempts to send it, Then the send is refused and the Invoice stays `draft` ⟨src: r:r2⟩ ⟨src: a:a3⟩.

**S13 — Send an invoice by email (a3, a11, invoice_delivery).**
Given draft Invoice #1043 with a $450 line item, When the Bookkeeper sends it, Then the Client is emailed a PDF at `billing@acme.com`, the Invoice moves to `sent`, and its due date is set by the client's net payment terms counted from the invoice date ⟨src: a:a3⟩ ⟨src: a:a11⟩ ⟨src: d:invoice_delivery⟩ ⟨src: d:payment_terms⟩.

**S14 — Email delivery fails (x5).**
Given a send whose email is not accepted by the mail service, When the send completes, Then the Invoice is still `sent` but its delivery status is flagged `delivery_failed` so the Bookkeeper can retry ⟨src: d:x5⟩.

**S15 — Duplicate send is ignored (x2).**
Given a Bookkeeper double-clicks Send on Invoice #1043, When the second send fires, Then it is detected and ignored and the Client receives exactly one email ⟨src: d:x2⟩.

**S16 — A sent invoice cannot revert to draft (r9, negative).**
Given Invoice #1043 in `sent`, When any user attempts to move it back to `draft`, Then the action is refused; corrections require voiding and reissuing ⟨src: r:r9⟩.

**S17 — Editing is allowed while unpaid, refused once paid (r4, invoice_edit_after_send).**
Given a `sent` Invoice with no payments, When the Bookkeeper edits a line item, Then the edit is accepted; and Given the same Invoice once `paid`, When any edit is attempted, Then it is refused ⟨src: r:r4⟩ ⟨src: d:invoice_edit_after_send⟩.

### Recording payments and marking paid

**S18 — Record a partial payment (a4, r10).**
Given `sent` Invoice #1043 for $450, When the Bookkeeper records a $200 payment, Then the Invoice moves to `partially_paid` with a $250 outstanding balance ⟨src: a:a4⟩ ⟨src: r:r10⟩ ⟨src: n:n4⟩.

**S19 — Record the remaining payment and mark paid (a4, a5, r7).**
Given `partially_paid` Invoice #1043 with $250 outstanding, When the Bookkeeper records a $250 payment, Then applied payments equal $450 exactly and the Invoice becomes `paid` ⟨src: a:a4⟩ ⟨src: a:a5⟩ ⟨src: r:r7⟩.

**S20 — Payment above the outstanding balance is rejected (r3, negative).**
Given a $450 Invoice with no prior payments, When the Bookkeeper attempts to record a $500 payment, Then it is rejected ⟨src: r:r3⟩ ⟨src: n:n4⟩.

**S21 — Credit note caps the balance payments may reach (r3, credit_notes).**
Given a $450 Invoice with a $200 credit note applied (outstanding balance $250), When the Bookkeeper attempts a $300 payment, Then it is rejected because it would exceed the $250 outstanding balance, so the balance can never go negative ⟨src: r:r3⟩ ⟨src: d:credit_notes⟩.

**S22 — Credit note settles but does not mark Paid (r7).**
Given a $450 Invoice with a $450 credit note applied and zero payments, When the balance is checked, Then the Invoice is recorded as settled-by-credit-note and is NOT `paid`, because `paid` requires payments totalling the full amount ⟨src: r:r7⟩ ⟨src: d:credit_notes⟩.

**S23 — Duplicate payment recording is ignored (x2).**
Given the Bookkeeper submits the same $250 payment twice by retry, When the second submission fires, Then it is detected and ignored and only one Payment is stored ⟨src: d:x2⟩ ⟨src: n:n4⟩.

### Overdue and reminders

**S24 — A sent invoice becomes overdue (r11).**
Given `sent` Invoice #1043 whose due date has passed without full payment, When the due date passes, Then the system flags it `overdue` ⟨src: r:r11⟩.

**S25 — Send an overdue reminder.**
Given an `overdue` Invoice, When a Bookkeeper sends a reminder, Then the Client is emailed a reminder by hand (no automatic reminders in v1) ⟨src: d:overdue_reminders⟩.

### Voiding and reissuing

**S26 — Owner voids an invoice created in error (a9, r5, r12, x8).**
Given Invoice #1039 created in error, When the Firm Owner voids it, Then #1039 moves to `void`, its record and number are retained as a visible gap, and it is never deleted ⟨src: a:a9⟩ ⟨src: r:r5⟩ ⟨src: r:r12⟩ ⟨src: d:x8⟩.

**S27 — Bookkeeper cannot void without delegation (r5, negative).**
Given a Bookkeeper holding no active `void_invoice` delegation, When they attempt to void #1039, Then the action is denied ⟨src: r:r5⟩ ⟨src: d:x7⟩ ⟨src: p:p1⟩.

**S28 — Delegated Bookkeeper may void, until it expires (r5, x7).**
Given a Bookkeeper holding an active `void_invoice` Delegation, When they void #1039 before `expires_at`, Then it succeeds; and When they attempt to void after `expires_at`, Then it is denied ⟨src: r:r5⟩ ⟨src: d:x7⟩.

**S29 — Fix a paid invoice by void-and-reissue (r4).**
Given a `paid` Invoice #1042 needing correction, When the Firm Owner voids it and a Bookkeeper creates a new Invoice, Then #1042 stays `void` and the new Invoice takes the next sequential number ⟨src: r:r4⟩ ⟨src: r:r1⟩ ⟨src: d:x8⟩.

**S30 — Voiding never reuses the number (r1, x8).**
Given #1043 has been voided, When the next Invoice is created, Then it is #1044 and #1043 remains a retained void gap that is never reused ⟨src: r:r1⟩ ⟨src: d:x8⟩.

**S31 — Credit notes use their own sequence (credit_note_numbering).**
Given the last invoice is #1042, When the Firm Owner issues a credit note against it, Then the credit note takes the next number in the `CN-` sequence and the invoice sequence is unaffected — the next invoice is still #1043 ⟨src: d:credit_note_numbering⟩ ⟨src: r:r1⟩.

### Statements and dashboard

**S32 — Generate a statement (a10).**
Given Acme has Q1 invoices, When a Bookkeeper generates a Q1 Statement for Acme, Then a Statement is produced showing total billed and balance due for the period ⟨src: a:a10⟩ ⟨src: n:n6⟩.

**S33 — Owner reviews a statement (a8).**
Given a generated Q1 Statement for Acme with all invoices fully paid, When the Firm Owner reviews it, Then the balance due shows $0 ⟨src: a:a8⟩ ⟨src: n:n6⟩.

**S34 — Dashboard totals (reporting).**
Given several invoices this month, When a staff user opens the dashboard, Then it shows how much was billed this month, how much is paid, and how many invoices are still outstanding ⟨src: d:reporting⟩.

### Access, concurrency, and integrity guards

**S35 — Client has no login (external_access, negative).**
Given a Client who received an invoice email, When they attempt to access the app, Then no login or portal exists and the Client can perform no in-app action ⟨src: d:external_access⟩ ⟨src: g:g2⟩ ⟨src: p:p3⟩.

**S36 — Only the Owner invites staff (negative).**
Given a signed-in Bookkeeper, When they attempt to invite or manage a user account, Then the action is denied; the Firm Owner performs invitations ⟨src: d:invite_flow⟩ ⟨src: d:roles⟩ ⟨src: p:p2⟩.

**S37 — Undo is scoped and cannot touch the invoice lifecycle (r4, r9).**
Given a Bookkeeper made a field edit on a `draft` Invoice, When they undo, Then only that most-recent field edit is reverted; and When they attempt undo on a `sent`, `paid`, or `void` Invoice or attempt to undo a status transition, Then it is refused ⟨src: r:r4⟩ ⟨src: r:r9⟩ ⟨src: src: default⟩.

**S38 — Bulk actions cannot hard-delete (record_bulk_edit, deletion).**
Given several selected Invoices, When a staff user applies a bulk action, Then it may only void or archive the records; no bulk hard-delete is possible ⟨src: d:record_bulk_edit⟩ ⟨src: d:deletion⟩ ⟨src: r:r12⟩.

**S39 — Guarded concurrent edit (concurrency).**
Given two staff open the same Client record at `version` 3, When the first saves (advancing to `version` 4) and the second then submits against `version` 3, Then the second save is rejected and the second user is shown the current record ⟨src: d:concurrency⟩.

**S40 — One-time import then disabled (data_import).**
Given the firm has no invoices, When a staff user imports the client spreadsheet successfully, Then clients are created and the import control is disabled for all subsequent use ⟨src: d:data_import⟩.

**S41 — Export lists as CSV (data_export).**
Given a filtered list of invoices, When a staff user exports it, Then a CSV/Excel file of that list is downloaded ⟨src: d:data_export⟩.

**S42 — Owner sets invoice branding (branding).**
Given a signed-in Firm Owner, When they set the firm logo and colours on the invoice template, Then subsequently generated invoice PDFs carry that branding; and When a Bookkeeper attempts the same, Then it is denied ⟨src: d:branding⟩ ⟨src: d:customization⟩ ⟨src: p:p2⟩.

## Key journeys

These flows show the app end-to-end from setup through billing, payment, correction, and review. All notifications are email; the app never sends SMS or in-app-only alerts, and the Client never logs in — the Client only receives emails ⟨src: d:notifications⟩ ⟨src: d:external_access⟩ ⟨src: g:g2⟩.

### Journey A — First-time setup and adding a client

**Actors:** Firm Owner, Bookkeeper. ⟨src: p:p2⟩ ⟨src: p:p1⟩

1. The Firm Owner signs in with email + password and invites the Bookkeeper, who receives an invitation email and sets a password. ⟨src: d:identity_provider⟩ ⟨src: d:invite_flow⟩ ⟨src: d:notifications⟩
2. The Firm Owner sets each Service's default rate (for example, "Monthly bookkeeping" at $450). ⟨src: a:a7⟩ ⟨src: n:n5⟩
3. The Firm Owner uploads the one-time client spreadsheet; the app is empty of invoices, so import is available. After first successful import it is disabled. ⟨src: d:data_import⟩
4. The Bookkeeper adds any remaining Client by hand — business name, contact email, monthly rate, and billing day. ⟨src: a:a6⟩ ⟨src: n:n1⟩
5. **What each actor sees:** the Firm Owner sees the client list and Service rates; the Bookkeeper sees the same clients and can edit every field except a Client's monthly rate, which stays read-only unless the Bookkeeper holds an active rate-change delegation. ⟨src: r:r6⟩ ⟨src: d:x7⟩

### Journey B — Preparing and sending a monthly invoice

**Actors:** Bookkeeper, Client. ⟨src: p:p1⟩ ⟨src: p:p3⟩

1. On the client's billing day the Bookkeeper creates a draft Invoice tied to exactly one Client; the app assigns the next strictly-sequential invoice number. ⟨src: a:a1⟩ ⟨src: r:r8⟩ ⟨src: r:r1⟩ ⟨src: d:invoice_numbering⟩ ⟨src: n:n2⟩
2. If the client's billing day does not exist in the current month, the app sets the invoice and due date using the last day of that month. ⟨src: d:x4⟩
3. The Bookkeeper adds at least one Line Item carrying a positive amount (description, quantity, rate; amount = quantity × rate). Zero or negative line amounts are rejected. ⟨src: a:a2⟩ ⟨src: n:n3⟩ ⟨src: d:x3⟩
4. The Bookkeeper attempts to send. If the Invoice has no line item with an amount the send is refused and the Invoice stays a draft. ⟨src: r:r2⟩
5. On send, the app emails the Client a PDF of the Invoice at the Client's contact email and moves the Invoice from draft to sent. The due date is set by the client's net payment terms counted from the invoice date. ⟨src: a:a3⟩ ⟨src: a:a11⟩ ⟨src: d:invoice_delivery⟩ ⟨src: d:payment_terms⟩
6. **Delivery outcome → behaviour:** if the email is accepted the Invoice's delivery status is `delivered`; if the email fails the Invoice still counts as sent but its delivery status is flagged `delivery_failed` so the Bookkeeper can retry the send. ⟨src: d:x5⟩
7. A double-clicked or retried send is detected and ignored so the Client is not emailed twice for one send. ⟨src: d:x2⟩
8. **What each actor sees:** the Bookkeeper sees the Invoice as sent with its delivery status; the Client receives one email with the PDF attached and takes no in-app action — there is no portal, link, or open-tracking. ⟨src: g:g2⟩ ⟨src: d:external_access⟩
9. A sent Invoice can never revert to draft; any correction goes through Journey E. ⟨src: r:r9⟩

### Journey C — Recording payments and marking an invoice paid

**Actors:** Bookkeeper. ⟨src: p:p1⟩

1. The Client pays by their own method outside the app (for example bank transfer); no money moves through the app. ⟨src: g:g1⟩ ⟨src: d:payments_in_app⟩
2. The Bookkeeper records a Payment against the Invoice — amount, date received, and method. ⟨src: a:a4⟩ ⟨src: n:n4⟩
3. The app rejects any Payment that would push total applied payments above the Invoice's outstanding balance (invoice amount minus payments already applied minus any applied credit-note amounts), so an invoice can never be overpaid. ⟨src: r:r3⟩
4. **Partial vs full → status:** when applied payments total less than the invoice amount the Invoice moves to partially paid; it becomes paid only when payments total exactly the invoice amount. Amounts settled by a credit note reduce the balance but do not by themselves make the Invoice paid. ⟨src: r:r10⟩ ⟨src: r:r7⟩
5. The Bookkeeper marks the Invoice paid; the app allows this only when the sum of applied Payments equals the invoice amount exactly. ⟨src: a:a5⟩ ⟨src: r:r7⟩
6. A double-fired payment entry is detected and ignored so one receipt is not booked twice. ⟨src: d:x2⟩
7. **What the Bookkeeper sees:** the Invoice's running balance and status update after each Payment; once paid the Invoice becomes read-only and can no longer be edited. ⟨src: r:r4⟩

### Journey D — Chasing an overdue invoice

**Actors:** Bookkeeper, Client. ⟨src: p:p1⟩ ⟨src: p:p3⟩

1. When a sent Invoice's due date passes without full payment, the app flags it overdue. ⟨src: r:r11⟩
2. The Bookkeeper reviews overdue invoices and sends a reminder email to the Client by hand; there is no automatic reminder schedule in v1. ⟨src: d:overdue_reminders⟩ ⟨src: g:g5⟩
3. No late fee is added. ⟨src: d:late_fees⟩
4. When the Client later pays, the Bookkeeper records the Payment as in Journey C and the Invoice leaves the overdue flag once fully paid. ⟨src: a:a4⟩ ⟨src: r:r7⟩
5. **What each actor sees:** the Bookkeeper sees the overdue flag on the dashboard and invoice list; the Client receives the reminder email only. ⟨src: d:reporting⟩ ⟨src: d:notifications⟩

### Journey E — Correcting a mistake by voiding and reissuing

**Actors:** Firm Owner (or a delegated Bookkeeper), Client. ⟨src: p:p2⟩ ⟨src: p:p1⟩ ⟨src: p:p3⟩

1. A sent or paid Invoice is found to be wrong; it cannot be edited back into shape. Corrections require voiding and reissuing. ⟨src: r:r4⟩ ⟨src: r:r9⟩
2. The Firm Owner voids the Invoice. A Bookkeeper may perform the void only while holding an active, unexpired `void_invoice` delegation granted by the Firm Owner. ⟨src: a:a9⟩ ⟨src: r:r5⟩ ⟨src: d:x7⟩
3. Voiding never deletes the Invoice: the record and its number are retained for the audit trail, and its sequential number stays voided in place, leaving a visible gap. ⟨src: r:r12⟩ ⟨src: d:x8⟩
4. To correct amounts on an otherwise-valid invoice, the Firm Owner issues a Credit Note against it, numbered in its own CN- sequence so the invoice number series stays gap-free apart from voids. ⟨src: d:credit_notes⟩ ⟨src: d:credit_note_numbering⟩ ⟨src: r:r1⟩
5. The Bookkeeper (or Owner) creates a fresh Invoice with the next sequential number and sends it as in Journey B. ⟨src: a:a1⟩ ⟨src: r:r1⟩
6. **What each actor sees:** the Owner sees the voided Invoice retained with its gap and the new Invoice in sequence; the Client receives the reissued Invoice PDF by email. ⟨src: r:r12⟩ ⟨src: a:a11⟩

### Journey F — Period-end statement and owner review

**Actors:** Bookkeeper, Firm Owner. ⟨src: p:p1⟩ ⟨src: p:p2⟩

1. At period end the Bookkeeper generates a Statement for a Client covering the period — total billed and balance due, where balance due = invoice amounts minus applied payments minus applied credit-note amounts. ⟨src: a:a10⟩ ⟨src: n:n6⟩ ⟨src: d:credit_notes⟩
2. The Firm Owner reviews the Statement and the dashboard, which shows how much was billed this month, how much is paid, and how many invoices are still outstanding. ⟨src: a:a8⟩ ⟨src: d:reporting⟩
3. Either staff role exports the invoice or payment lists as CSV/Excel for the accountant; there is no accounting integration or sync. ⟨src: d:data_export⟩ ⟨src: d:accounting_sync⟩ ⟨src: d:integrations⟩
4. **What each actor sees:** both roles see the same Statement, dashboard totals, and audit fields (created/updated by whom and when) on each record. ⟨src: d:audit_trail⟩

## Non-goals

The items below are the capabilities this version deliberately omits. Each states what is out of scope, what a reader might wrongly assume in its place, and the nearest behaviour that *is* built.

### No online payment processing

Not in v1: the app never collects card or bank payments and no money moves through it; clients pay by their own method. ⟨src: g:g1⟩ ⟨src: d:payments_in_app⟩ A reader might assume an invoice carries a "Pay now" button or a card form. It does not. The nearest in-scope behaviour is manual recording: the Bookkeeper enters a Payment (amount, date received, method) after the client pays elsewhere. ⟨src: a:a4⟩ ⟨src: d:payment_recording⟩ ⟨src: n:n4⟩

### No client login or self-service portal

Not in v1: clients have no account, no login, and no hosted invoice page. ⟨src: g:g2⟩ ⟨src: d:external_access⟩ A reader might assume a client can log in to view invoices, balances, or payment history. They cannot, and there is no email open-tracking or "viewed" signal. The nearest in-scope behaviour is one-way email delivery: on send, the client receives a PDF of the invoice at their contact email. ⟨src: a:a3⟩ ⟨src: a:a11⟩ ⟨src: d:invoice_delivery⟩

### No payroll, expense tracking, or general accounting

Not in v1: the app does not run payroll, track expenses, or keep a general ledger. ⟨src: g:g3⟩ A reader might assume a full accounting suite. It is invoicing only. The nearest in-scope behaviour serving the accountant is CSV/Excel list export of clients, invoices, and payments. ⟨src: d:data_export⟩ ⟨src: d:accounting_sync⟩

### No automatic tax calculation or filing

Not in v1: no tax rates, tax lines, or filing. ⟨src: g:g4⟩ ⟨src: d:taxes⟩ A reader might assume line amounts are grossed up with tax. They are not — every stored amount is exactly what staff entered, with no tax component. The nearest in-scope behaviour is a plain line item whose amount = quantity × rate. ⟨src: n:n3⟩

### No automated recurring billing

Not in v1: invoices are never generated or sent on a schedule. ⟨src: g:g5⟩ ⟨src: d:recurring_invoices⟩ ⟨src: d:recurring_scheduled⟩ A reader might assume monthly invoices appear automatically on each client's billing day. They do not. The nearest in-scope behaviour is that staff create each Invoice by hand each month; the client's billing day only informs the invoice and due dates when staff create one. ⟨src: a:a1⟩ ⟨src: n:n1⟩ ⟨src: d:x4⟩

### No third-party integrations

Not in v1: the app connects to no external accounting, payment, or calendar tool, and exposes no public API or webhooks. ⟨src: d:integrations⟩ ⟨src: d:accounting_sync⟩ A reader might assume a two-way sync with QuickBooks- or Xero-style software. There is none. The nearest in-scope behaviour is a downloadable export file the accountant imports on their side. ⟨src: d:data_export⟩

### No multi-currency and no multi-organisation

Not in v1: every amount is in one currency, and this is a single-firm deployment with no tenant separation. ⟨src: d:currencies⟩ ⟨src: d:tenancy⟩ A reader might assume invoices can be issued in different currencies, or that several firms share the install with partitioned data. Neither is supported. The nearest in-scope behaviour is one firm billing its own clients in a single currency. ⟨src: d:invoicing_model⟩

### No automatic overdue reminders or late fees

Not in v1: the app applies no scheduled reminders and no late fees. ⟨src: d:overdue_reminders⟩ ⟨src: d:late_fees⟩ A reader might assume overdue invoices trigger automatic nudges or a surcharge. They do not. The nearest in-scope behaviour is that a sent invoice past its due date is flagged overdue and a staff member sends a reminder by hand. ⟨src: r:r11⟩

### No estimates, quotes, or time tracking

Not in v1: there are no estimates or quotes that convert to invoices, and no billing of tracked hours. ⟨src: d:estimates⟩ ⟨src: d:time_tracking⟩ A reader might assume a quote-to-invoice pipeline or timers that become invoice lines. Neither exists. The nearest in-scope behaviour is entering line items directly on a draft invoice. ⟨src: a:a2⟩ ⟨src: n:n3⟩

### No deposits or up-front retainers

Not in v1: the app does not take deposits or retainers that later apply to invoices. ⟨src: d:deposits⟩ A reader might assume a prepaid balance can be drawn down against future invoices. It cannot. The nearest in-scope behaviour is recording each Payment against a specific issued Invoice. ⟨src: a:a4⟩ ⟨src: n:n4⟩

### No hard deletion

Not in v1: no record can be permanently removed, including through bulk actions. ⟨src: d:deletion⟩ ⟨src: r:r12⟩ A reader might assume a delete button erases a client or invoice. It does not. The nearest in-scope behaviour is voiding an invoice (its number and record are retained) or archiving a client (its invoices and payments stay intact). ⟨src: a:a9⟩ ⟨src: d:x1⟩ ⟨src: d:x8⟩

## Glossary

The terms below fix the meaning of every actor and noun used across this specification. Where a concept was introduced by a design decision rather than the Sheet's noun list, its origin is traced to that decision.

### Actors

- **Bookkeeper** — Staff member who prepares invoices, adds line items and clients, sends invoices, records payments, marks invoices paid, and generates statements; holds fewer powers than the Firm Owner. ⟨src: p:p1⟩
- **Firm Owner** — Owner/admin who oversees billing, sets service rates and client monthly rates, voids invoices, reviews statements, and may grant temporary delegated void/rate-change rights. ⟨src: p:p2⟩
- **Client** — A business the firm bills monthly; an outside party who only receives invoices by email and has no login or self-service account. ⟨src: p:p3⟩ ⟨src: d:external_access⟩ ⟨src: g:g2⟩

### Core nouns

- **Client (record)** — A business the firm provides bookkeeping services to, holding business name, contact email, monthly rate, and billing day. ⟨src: n:n1⟩
- **Invoice** — A monthly bill issued to exactly one client for services rendered, carrying a unique sequential invoice number, amount, status, and due date. ⟨src: n:n2⟩ ⟨src: r:r1⟩ ⟨src: r:r8⟩
- **Line Item** — A single charge on an invoice, holding description, quantity, rate, and amount (amount = quantity × rate). ⟨src: n:n3⟩
- **Payment** — Money received from a client and recorded against an invoice, holding amount, date received, and method; recorded by hand, not collected in-app. ⟨src: n:n4⟩ ⟨src: d:payments_in_app⟩
- **Service** — A billable service the firm offers with a standard default rate and billing frequency, used as a template for line items. ⟨src: n:n5⟩
- **Statement** — A generated summary of one client's invoices and balance over a period, holding client, period, total billed, and balance due. ⟨src: n:n6⟩

### Introduced concepts

- **Credit Note** — A correction issued against an invoice to reduce what a client owes; used for corrections and refunds instead of editing settled invoices, and numbered in its own CN- sequence. ⟨src: d:credit_notes⟩ ⟨src: d:credit_note_numbering⟩
- **Delegation** — A temporary grant by the Firm Owner that lets a named Bookkeeper exercise void and rate-change rights while the Owner is unavailable. ⟨src: d:x7⟩ ⟨src: r:r5⟩ ⟨src: r:r6⟩
- **Void** — The act of retiring an invoice created in error; the record and its sequential number are retained (a visible gap remains) and never deleted. ⟨src: a:a9⟩ ⟨src: r:r12⟩ ⟨src: d:x8⟩
- **Draft status** — An invoice that has been created but not yet sent; editable and unable to be sent until it has at least one line item with an amount. ⟨src: d:invoice_statuses⟩ ⟨src: r:r2⟩
- **Sent status** — An invoice that has been emailed to the client; it cannot revert to draft and corrections require voiding and reissuing. ⟨src: d:invoice_statuses⟩ ⟨src: r:r9⟩
- **Partially paid status** — An invoice with one or more payments applied whose total is less than the invoice amount. ⟨src: d:invoice_statuses⟩ ⟨src: r:r10⟩
- **Paid status** — An invoice whose applied payments total exactly the invoice amount. ⟨src: d:invoice_statuses⟩ ⟨src: r:r7⟩
- **Overdue status** — A sent invoice whose due date has passed without full payment. ⟨src: d:invoice_statuses⟩ ⟨src: r:r11⟩
- **Void status** — A terminal status for an invoice that has been voided; retained for the audit trail. ⟨src: d:invoice_statuses⟩ ⟨src: r:r12⟩
- **Archived Client** — A client hidden from active use but whose invoices and payments are kept intact; used instead of deleting a client that has billing history. ⟨src: d:x1⟩ ⟨src: d:deletion⟩
- **Balance due** — For a client or invoice, the outstanding amount computed as invoice amount minus applied payments minus applied credit-note amounts. ⟨src: n:n6⟩ ⟨src: d:credit_notes⟩
- **Billing day** — The day of the month on which a client is billed; when that day does not exist in a month, the last day of that month is used. ⟨src: n:n1⟩ ⟨src: d:x4⟩
- **Net terms** — The payment window counted from the invoice date that sets an invoice's due date (default Net 15). ⟨src: d:payment_terms⟩ ⟨src: default⟩

## Decision ledger (complete)

_Every product decision this spec is built on. "assumed" rows carry the confidence of the assumption — an implementer should confirm low-confidence assumptions before building against them (see AGENTS.md)._

| Decision | Answer | How settled | Confidence |
|---|---|---|---|
| Who sends invoices to whom? ⟨src: d:invoicing_model⟩ | The business bills its own clients | assumed | 95% |
| Is this for one business, or will many separate businesses use it with their data kept apart? ⟨src: d:tenancy⟩ | One business (ours) | assumed | 95% |
| Who needs an account to use the app? ⟨src: d:user_accounts⟩ | Several people log in, possibly with different powers | assumed | 95% |
| Connect to accounting software? ⟨src: d:accounting_sync⟩ | Export files for the accountant | assumed | 90% |
| Do some actions need someone else's approval first? ⟨src: d:approval_workflow⟩ | No | assumed | 93% |
| Does it hold data with special legal handling (health, payment cards, minors)? ⟨src: d:compliance_sensitivity⟩ | Ordinary business data | assumed | 95% |
| Does it need to connect to other tools? ⟨src: d:integrations⟩ | No | assumed | 95% |
| Can an invoice change after it's sent? ⟨src: d:invoice_edit_after_send⟩ | Yes, until it's paid | assumed | 95% |
| How detailed is the invoice lifecycle? ⟨src: d:invoice_statuses⟩ | Draft → Sent → Viewed → Partially paid → Paid / Overdue / Void | assumed | 93% |
| How do payments get recorded? ⟨src: d:payment_recording⟩ | Someone marks invoices paid by hand | assumed | 95% |
| Does money move through the app? ⟨src: d:payments_in_app⟩ | It records payments that happen elsewhere | assumed | 95% |
| Where is it used? ⟨src: d:platform⟩ | In a browser, on desktop and phone | assumed | 96% |
| What do people need to see across many records? ⟨src: d:reporting⟩ | A dashboard with totals and counts | answered | 100% |
| Do different people have different powers? ⟨src: d:roles⟩ | An owner/admin plus staff with fewer powers | assumed | 95% |
| What happens when someone tries to remove a Client that has invoices or recorded payments? ⟨src: d:x1⟩ | Archive client but keep all invoices/payments intact | assumed | 91% |
| How does the app handle the same Payment or Send action fired twice (double-click, retry)? ⟨src: d:x2⟩ | Detect and ignore duplicates (idempotent) | assumed | 71% |
| An invoice is marked Sent but the email delivery fails — what state results? ⟨src: d:x5⟩ | Mark sent but flag delivery failure for retry | assumed | 94% |
| Can invoice states be reversed (unsend a sent invoice, reopen a paid one)? ⟨src: d:x6⟩ | No reversal — only void and reissue (per r4) | assumed | 92% |
| Do you need a record of who changed what and when? ⟨src: d:audit_trail⟩ | Just created/updated by whom and when | assumed | 65% |
| Corrections and refunds? ⟨src: d:credit_notes⟩ | Credit notes against invoices | assumed | 73% |
| One currency or several? ⟨src: d:currencies⟩ | One currency | assumed | 95% |
| Can each business customize the app? ⟨src: d:customization⟩ | Branding and templates (logo, colors, wording) | assumed | 92% |
| Do you start with existing data? ⟨src: d:data_import⟩ | Import from a spreadsheet/CSV once | assumed | 91% |
| How much data will there be? ⟨src: d:data_scale⟩ | Hundreds of records | assumed | 93% |
| When something is deleted, what really happens? ⟨src: d:deletion⟩ | Records are never deleted, only voided/cancelled | assumed | 95% |
| Estimates/quotes before invoices? ⟨src: d:estimates⟩ | No | assumed | 94% |
| How do additional people get access? ⟨src: d:invite_flow⟩ | An admin invites them | assumed | 96% |
| How do invoices reach clients? ⟨src: d:invoice_delivery⟩ | PDF attached to an email | assumed | 93% |
| Can discounts be applied to invoices? ⟨src: d:invoice_discounts⟩ | A single discount on the whole invoice | assumed | 48% |
| How are invoices numbered? ⟨src: d:invoice_numbering⟩ | Strictly sequential per business (no gaps; legally safe) | assumed | 95% |
| How is an automatic late fee calculated? ⟨src: d:late_fee_basis⟩ | A flat amount added once | assumed | 74% |
| Languages and regions? ⟨src: d:localization⟩ | One language, one country | assumed | 95% |
| How does the app reach people when something happens? ⟨src: d:notifications⟩ | Email | assumed | 97% |
| What happens when an invoice is overdue? ⟨src: d:overdue_reminders⟩ | Someone sends a reminder by hand | assumed | 72% |
| Can an invoice be paid in parts? ⟨src: d:partial_payments⟩ | Yes — partial payments and balances | assumed | 93% |
| What payment terms do invoices carry (when is payment due)? ⟨src: d:payment_terms⟩ | Net terms (e.g., Net 15/30/60) counted from the invoice date | assumed | 90% |
| Track time and bill hours? ⟨src: d:time_tracking⟩ | No | assumed | 95% |
| How are line-item amounts and currency precision handled? ⟨src: d:x3⟩ | Round to cents; reject zero/negative line amounts | assumed | 65% |
| When a client's Billing day (e.g. the 31st) doesn't exist in a month, when is the invoice/due date set? ⟨src: d:x4⟩ | Use the last day of that month | assumed | 93% |
| When the Firm Owner is unavailable, can a Bookkeeper be delegated void/rate-change rights (r5/r6)? ⟨src: d:x7⟩ | Owner can grant temporary delegated rights | assumed | 50% |
| When an invoice is voided, what happens to its sequential number (r1)? ⟨src: d:x8⟩ | Number stays voided in place — a visible gap remains | assumed | 95% |
| Can files/photos be attached to things? ⟨src: d:attachments⟩ | Yes — upload and download | assumed | 71% |
| How do automatic reminders escalate? ⟨src: d:auto_reminder_schedule⟩ | Two gentle nudges: a few days before and after the due date | assumed | 92% |
| Branding on invoices? ⟨src: d:branding⟩ | Logo and colors | assumed | 93% |
| What happens when two people edit the same thing at once? ⟨src: d:concurrency⟩ | Common; the app must prevent or merge conflicting edits | assumed | 51% |
| How are credit notes numbered? ⟨src: d:credit_note_numbering⟩ | They share the invoice number sequence | assumed | 55% |
| Do people need to get their data out? ⟨src: d:data_export⟩ | Download lists as CSV/Excel | assumed | 77% |
| Deposits / retainers up front? ⟨src: d:deposits⟩ | No | assumed | 94% |
| Do outside parties (customers, clients, vendors) use the app directly? ⟨src: d:external_access⟩ | No — outsiders only receive emails/PDFs/messages | assumed | 95% |
| How do people sign in? ⟨src: d:identity_provider⟩ | Email + password | assumed | 73% |
| Do invoices need to carry the customer's purchase order (PO) number? ⟨src: d:invoice_po_reference⟩ | No — invoices don't track customer PO numbers | assumed | 64% |
| Late fees? ⟨src: d:late_fees⟩ | No | assumed | 72% |
| Must it work without internet? ⟨src: d:offline⟩ | Online only | assumed | 99% |
| How long is data kept? ⟨src: d:retention⟩ | Until someone deletes it | assumed | 96% |
| Can people change many records at once? ⟨src: d:record_bulk_edit⟩ | Yes — select many and assign/move/tag/delete together | assumed | 73% |
| Recurring invoices (e.g., monthly retainers)? ⟨src: d:recurring_invoices⟩ | No | assumed | 95% |
| Must anything happen automatically on a schedule? ⟨src: d:recurring_scheduled⟩ | No | assumed | 95% |
| How is tax handled on invoices? ⟨src: d:taxes⟩ | No tax lines | assumed | 95% |
