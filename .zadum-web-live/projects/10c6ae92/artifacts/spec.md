# Specification — an invoicing app for small bookkeeping firms

_Compiled from Design Sheet v16 (b2b-invoicing, crud-saas). Trace markers ⟨src: …⟩ point at the Sheet items and decisions each line derives from: d: decision, r: rule, a: action, n: noun, p: actor, g: non-goal._

**How to use this spec:** the Design Sheet (design-sheet.md) is the source of truth; this spec is derived from it. Rules are inviolable. If a task would violate one, stop and cite it. If a task changes the design, update the Sheet first.

## Overview

## Overview

This application is a web-based invoicing tool built for small bookkeeping firms to streamline their client billing workflows. The primary users are Bookkeepers (staff or owners), Clients (businesses that receive invoices), and Administrators (firm management). ⟨src: d:user_accounts, d:roles, d:external_access, d:invite_flow, d:platform⟩

### Core Value Loop
1. Administrators set up firm-wide settings and invite bookkeepers to join the system. ⟨src: a5, a6, d:invite_flow⟩
2. Bookkeepers manage client profiles and issue invoices to assigned clients, recording payments as received. ⟨src: a1, a2, a3, a4, n1, n2, n4, r1, r2, d:manual, d:partial_payments⟩
3. Clients log in to view and download their invoices as PDFs, and may pay invoices (outside the system, with payment then marked manually). ⟨src: a7, a8, a9, d:external_access, x2, d:payment_recording, g1⟩
4. The app sends email notifications regarding invoice activity (e.g., when issued or overdue). ⟨src: d:notifications, d:overdue_reminders, d:recurring_scheduled⟩
5. All actors can see a history of changes (created/updated by whom and when), and leave comments on records as needed. ⟨src: d:audit_trail, d:record_activity_feed⟩

### Technical and Operational Scope
* Platform: Web application usable on desktop and phone browsers. ⟨src: d:platform⟩
* Tenant Model: Single bookkeeping firm per deployment; all users belong to the same organization and data pool. ⟨src: d:tenancy, d:workspace_structure⟩
* Scale: Designed for hundreds (not millions) of records and a small team. ⟨src: d:data_scale⟩
* Authentication: Email and password; admins invite others, no self-signup. ⟨src: d:identity_provider, d:invite_flow⟩
* Data import/export: One-time import via spreadsheet/CSV; export via CSV and clients download invoices as PDFs. ⟨src: d:data_import, d:data_export, x2⟩
* Compliance: Designed for ordinary business data, suitable for standard privacy and retention requirements. ⟨src: d:compliance_sensitivity, d:retention⟩

### Out-of-Scope (v1 Non-Goals)
* No integrated online payment processing. ⟨src: g1⟩
* No time/expense tracking, tax filing, or advanced accounting. ⟨src: g2, g3⟩
* No external software integrations. ⟨src: g4, d:integrations⟩
* No recurring invoices (all are created individually). ⟨src: d:recurring_invoices⟩
* No client self-service beyond viewing/downloading invoices and paying them. ⟨src: d:client_portal_scope⟩

This app emphasizes simplicity, easy access for all actor types, compliance with basic invoicing/legal requirements, and reliable handling of a single firm's billing workflows.

## Actors & permissions

## Permissions Matrix

| Actor           | Action                                   | Noun            | Allowed? | Notes                                                      |
|----------------|------------------------------------------|-----------------|---------|------------------------------------------------------------|
| Bookkeeper     | Create Invoice                           | Invoice         | ✔        | Only for clients assigned to this bookkeeper                ⟨src: r1⟩        |
| Bookkeeper     | Edit Invoice                             | Invoice         | ✔        | Only for clients assigned to this bookkeeper; editable until paid ⟨src: r1⟩ ⟨src: invoice_edit_after_send⟩ |
| Bookkeeper     | Mark paid Invoice                        | Invoice         | ✔        | Only for clients assigned; cannot mark paid if invoice not 'Sent' ⟨src: r1⟩ ⟨src: r2⟩ |
| Bookkeeper     | View Client Profile                      | Client Profile  | ✔        | Only for clients assigned to this bookkeeper                ⟨src: r1⟩        |
| Bookkeeper     | Add comment                              | Invoice, Client Profile | ✔     | Can comment on assigned client or invoice                   ⟨src: record_activity_feed⟩ |
| Bookkeeper     | View Payment Record                      | Payment Record  | ✔        | Only for assigned clients                                  ⟨src: record_relationships⟩ |
| Administrator  | Add Bookkeeper Profile                   | Bookkeeper Profile| ✔      | Can invite/add new bookkeepers                             ⟨src: invite_flow⟩           |
| Administrator  | Edit Firm Settings                       | Firm Settings   | ✔        | All firm-wide settings, including payment terms and email templates ⟨src: a6⟩ |
| Administrator  | View all profiles, invoices, payments     | All             | ✔        | Admin can see and edit all data                            ⟨src: roles⟩                |
| Administrator  | Edit Invoice, Client Profile, Payment Record | All         | ✔        | Can always edit                                           ⟨src: roles⟩                |
| Administrator  | Delete/Archive any record                | All             | ✔        | Can soft-delete/archive any record                         ⟨src: deletion⟩             |
| Client         | View Invoice                             | Invoice         | ✔        | Only their own invoices                                    ⟨src: r4⟩                  |
| Client         | Download Invoice (PDF)                   | Invoice         | ✔        | Only their own invoices; PDF only                          ⟨src: r4⟩ ⟨src: x2⟩      |
| Client         | Pay Invoice (manual)                     | Invoice         | ✔        | Only their own invoices; marks as paid for bookkeeper       ⟨src: client_portal_scope⟩  |
| Client         | View Client Profile                      | Client Profile  | ✔        | Only their own profile; cannot edit                         ⟨src: x3⟩                  |
| Client         | Add comment                              | Invoice         | ✔        | Only on their own invoice                                  ⟨src: record_activity_feed⟩ |

### Data Visibility Boundaries
- Bookkeepers see and act on invoices, profiles, and payments ONLY for clients assigned to them ⟨src: r1⟩.
- Administrators see and manage ALL data across the firm ⟨src: roles⟩.
- Clients see, download, and comment ONLY on their own invoices and profile ⟨src: r4⟩ ⟨src: x3⟩.
- Payment Records are visible to bookkeepers on assigned clients and to administrators ⟨src: record_relationships⟩.
- Soft-deleted (archived) records are only visible to administrators; clients do not see archived items ⟨src: deletion⟩.

### Additional Notes
- Only bookkeepers assigned to a client may create, edit, or mark invoices as paid for those clients ⟨src: r1⟩.
- Administrators invite/add bookkeepers; clients cannot invite, edit, or add users ⟨src: invite_flow⟩.
- Clients cannot edit their own profile or invoices, only view and comment ⟨src: x3⟩.
- All actions are subject to audit trail (tracked creation/update by whom and when) ⟨src: audit_trail⟩.

## Data model

# Data Model

## Entities

### Invoice ⟨src: n1, r5, r2, r3, a1, a2, a3, a7, a8, a9, d:invoice_numbering, d:invoice_statuses, d:invoice_edit_after_send, d:partial_payments, d:late_fees, d:deletion, d:audit_trail, d:record_assignment, d:record_activity_feed, d:record_relationships, d:record_duplicates, d:record_custom_fields, d:record_bulk_edit⟩
- **Invoice number**: string, required, unique within firm; sequentially generated by system ⟨src: n1, r5, d:invoice_numbering, d:x4⟩
- **Client Profile**: reference to Client Profile entity, required ⟨src: n1, d:record_relationships⟩
- **Amount**: decimal, required ⟨src: n1⟩
- **Due date**: date, optional ⟨src: n1, d:record_assignment⟩
- **Status**: enum {Draft, Sent, Paid}, required; transitions managed by state machine ⟨src: n1, r2, d:invoice_statuses⟩
- **Bookkeeper Profile**: reference to Bookkeeper Profile, required (assignee) ⟨src: d:record_assignment⟩
- **Late fees**: decimal, optional ⟨src: d:late_fees⟩
- **Comments**: list of comment objects ⟨src: d:record_activity_feed⟩
- **Attachments**: list of files ⟨src: d:attachments⟩
- **Created by / Created at**: user reference, timestamp ⟨src: d:audit_trail⟩
- **Updated by / Updated at**: user reference, timestamp ⟨src: d:audit_trail⟩
- **Deleted (archived) flag**: boolean for soft delete ⟨src: d:deletion⟩

#### Relationships
- One Invoice is linked to exactly one Client Profile (required) ⟨src: n1, d:record_relationships⟩
- One Invoice can have multiple Payment Records ⟨src: n4, d:record_relationships, r3⟩
- One Invoice is assigned to one Bookkeeper Profile ⟨src: d:record_assignment⟩

#### Uniqueness
- Invoice number is unique within Firm Settings (firm scope) ⟨src: r5, d:invoice_numbering, d:record_duplicates⟩

#### Deletion
- Soft delete: invoices are archived and hidden from clients; can be restored ⟨src: d:deletion⟩

#### Audit
- Created/updated by whom and when ⟨src: d:audit_trail⟩

---

### Client Profile ⟨src: n2, r1, r4, d:record_relationships, d:record_duplicates, d:x3, d:deletion, d:audit_trail⟩
- **Business name**: string, required, unique within firm ⟨src: n2, d:record_duplicates⟩
- **Contact email**: string, required ⟨src: n2⟩
- **Phone**: string, optional ⟨src: n2⟩
- **Address**: string, optional ⟨src: n2⟩
- **Created by / Created at**: user reference, timestamp ⟨src: d:audit_trail⟩
- **Updated by / Updated at**: user reference, timestamp ⟨src: d:audit_trail⟩
- **Deleted (archived) flag**: boolean for soft delete ⟨src: d:deletion⟩

#### Relationships
- One Client Profile can be assigned to one or more Bookkeeper Profiles ⟨src: n3, d:record_relationships⟩
- One Client Profile can have many Invoices ⟨src: n1, d:record_relationships⟩

#### Uniqueness
- Business name must be unique within firm (firm scope) ⟨src: d:record_duplicates⟩

#### Deletion
- Soft delete: profiles archived, hidden from clients; can be restored ⟨src: d:deletion⟩

#### Audit
- Created/updated by whom and when ⟨src: d:audit_trail⟩

---

### Bookkeeper Profile ⟨src: n3, p1, a5, d:record_relationships, d:invite_flow, d:record_duplicates, d:deletion, d:audit_trail⟩
- **Full name**: string, required ⟨src: n3⟩
- **Email**: string, required, unique ⟨src: n3, d:record_duplicates⟩
- **Assigned clients**: list of references to Client Profiles ⟨src: n3, d:record_relationships⟩
- **Created by / Created at**: user reference, timestamp ⟨src: d:audit_trail⟩
- **Updated by / Updated at**: user reference, timestamp ⟨src: d:audit_trail⟩
- **Deleted (archived) flag**: boolean for soft delete ⟨src: d:deletion⟩

#### Relationships
- One Bookkeeper Profile can be assigned to many Client Profiles ⟨src: n3, d:record_relationships⟩

#### Uniqueness
- Email must be unique ⟨src: d:record_duplicates⟩

#### Deletion
- Soft delete: archived, can be restored; loses access rights when archived ⟨src: d:deletion⟩

#### Audit
- Created/updated by whom and when ⟨src: d:audit_trail⟩

---

### Payment Record ⟨src: n4, r3, r2, a3, a9, d:record_relationships, d:partial_payments, d:payment_recording, d:deletion, d:audit_trail⟩
- **Invoice reference**: reference to Invoice entity, required ⟨src: n4, d:record_relationships⟩
- **Date received**: date, required ⟨src: n4⟩
- **Amount**: decimal, required; must not exceed remaining invoice balance ⟨src: n4, r3, d:partial_payments⟩
- **Payment method**: enum {ACH, Check, Credit card, Manual}, required ⟨src: n4, d:payment_recording⟩
- **Created by / Created at**: user reference, timestamp ⟨src: d:audit_trail⟩
- **Updated by / Updated at**: user reference, timestamp ⟨src: d:audit_trail⟩
- **Deleted (archived) flag**: boolean for soft delete ⟨src: d:deletion⟩

#### Relationships
- Multiple Payment Records can reference a single Invoice ⟨src: n4, d:record_relationships⟩

#### Deletion
- Soft delete: archived, can be restored; affects invoice balance ⟨src: d:deletion⟩

#### Audit
- Created/updated by whom and when ⟨src: d:audit_trail⟩

---

### Firm Settings ⟨src: n5, p3, a6, d:x1, d:audit_trail⟩
- **Firm name**: string, required ⟨src: n5, d:x1⟩
- **Address**: string, required ⟨src: n5, d:x1⟩
- **Payment terms**: string, required; default net 15 ⟨src: n5, d:x1⟩
- **Email templates**: string, optional ⟨src: n5, d:x1⟩
- **Logo and colors**: file/image, optional ⟨src: d:branding⟩
- **Created by / Created at**: user reference, timestamp ⟨src: d:audit_trail⟩
- **Updated by / Updated at**: user reference, timestamp ⟨src: d:audit_trail⟩

#### Uniqueness
- Only one Firm Settings record per deployment ⟨src: d:tenancy, n5⟩

#### Audit
- Created/updated by whom and when ⟨src: d:audit_trail⟩

---

## Default Decisions (where design is silent)
- All records use soft delete and can be restored ⟨src: d:deletion⟩
- All audit fields are basic: created/updated by whom and when ⟨src: d:audit_trail⟩
- No recurring invoices or scheduled record creation ⟨src: recurring_invoices, d:record_recurring⟩

---

## Notes
- All records are visible to everyone in the workspace unless archived; clients only see their own ⟨src: d:record_ownership, r1, r4⟩
- All referenced fields use enforced foreign keys ⟨src: d:record_relationships⟩
- No sensitive or regulated data is handled ⟨src: d:compliance_sensitivity⟩

## Lifecycles (state machines)

# State Machines

## Invoice State Machine ⟨src: n1, r2, d:invoice_statuses, d:invoice_edit_after_send, a1, a2, a3, a9⟩

**States:**
- `Draft` — Invoice is editable, not sent to the client yet. Default state at creation. ⟨src: d:invoice_statuses⟩
- `Sent` — Invoice has been sent to the client; client can view/download/pay. Still editable by bookkeeper until paid. ⟨src: d:invoice_statuses, d:invoice_edit_after_send⟩
- `Paid` — Invoice is fully paid (total of Payment Records equals invoice amount). No further edits allowed. ⟨src: d:invoice_statuses, d:invoice_edit_after_send, d:partial_payments⟩
- `[Archived]` — (Soft delete); logically outside the normal lifecycle, but invoices can be archived/restored by admin. ⟨src: d:deletion⟩

**Transitions:**

| From    | To     | Trigger                  | Who can trigger                  | Guards/Validation                                              | Notes                                                        |
|---------|--------|--------------------------|----------------------------------|----------------------------------------------------------------|--------------------------------------------------------------|
| Draft   | Sent   | Bookkeeper sends invoice | Bookkeeper (assigned)            | Must be assigned to client ⟨src: r1⟩                         | Sends email notification to client ⟨src: d:notifications⟩    |
| Sent    | Paid   | Mark paid (add payment)  | Bookkeeper (assigned), Client    | - Status must be Sent.<br>- Total payments must not exceed amount ⟨src: r2, r3⟩ | Moves to Paid if invoice fully paid, otherwise remains Sent.  |
| Draft   | Archived | Archive                 | Admin, Bookkeeper (assigned)     | None                                                           | Becomes hidden to clients.                                   |
| Sent    | Archived | Archive                 | Admin, Bookkeeper (assigned)     | None                                                           | Becomes hidden to clients.                                   |
| Paid    | Archived | Archive                 | Admin only                       | None                                                           | Becomes hidden to clients.                                   |
| Archived| [Prev State] | Restore              | Admin only                       | None                                                           | Returns to pre-archive state (Draft, Sent, or Paid)          |

**Additional Notes on Edits:**
- Invoice can be edited only in `Draft` and `Sent` (not in `Paid`).
- Only assigned Bookkeeper or Admin can edit, per rule ⟨src: r1⟩.

---

## Payment Record State ⟨src: n4, r2, r3, a3, a9⟩
- No independent lifecycle; created only in the context of an Invoice.
- Creation permitted only when attached Invoice is at least `Sent` (not `Draft`). ⟨src: r2⟩
- On creation, if sum of Payment Records equals Invoice amount, Invoice transitions to `Paid`. ⟨src: r3, d:partial_payments⟩
- Payment Records can be soft-deleted (archived) by an Admin; this may also trigger Invoice status update if total payments drop below invoice amount (Invoice returns to `Sent`). ⟨src: d:partial_payments, d:deletion⟩

---

## Client Profile, Bookkeeper Profile, Firm Settings State ⟨src: n2, n3, n5, d:deletion⟩
- No workflow state; only `active` or `archived` (soft deleted). ⟨src: d:deletion⟩
- Profiles and settings do not have multi-step lifecycles. (default) ⟨src: default⟩

---

## Summary Table

| Entity            | States                         | Terminal/Archived State        |
|-------------------|-------------------------------|-------------------------------|
| Invoice           | Draft → Sent → Paid           | Archived (can be restored)    |
| Payment Record    | (Created when Invoice sent/paid)| Archived (can be restored)    |
| Client Profile    | Active                        | Archived (can be restored)    |
| Bookkeeper Profile| Active                        | Archived (can be restored)    |
| Firm Settings     | Active                        | Archived (can be restored)    |

---

## Guards & Validation
- Invoice cannot be marked as paid unless in `Sent` ⟨src: r2⟩
- Total payments must not exceed invoice amount ⟨src: r3⟩
- Only assigned Bookkeeper can trigger transitions for their assigned clients ⟨src: r1⟩

---

## Triggers
- Email notifications are sent on `Sent` and possibly on overdue/past due transitions (handled outside state model). ⟨src: d:notifications, d:overdue_reminders, d:recurring_scheduled⟩

## Rules & invariants

# Rules & Invariants

## R-1: Bookkeeper Assignment Access
Only bookkeepers who are assigned to a client may create, edit, or mark paid any invoices for that client. Administrators may perform these actions for any client. ⟨src: r1⟩
- **Test**: Attempt to create/edit/mark paid an invoice as a bookkeeper for a client they are not assigned to. Expect failure (forbidden). Check bookkeeper assignment enforcement at each action boundary.
- **Constrains**: Bookkeeper actions on Invoice and Client Profile nouns (create, edit, mark paid, view), and Payment Record creation.

## R-2: Invoice State Precondition for Payment
An invoice cannot be marked as paid until its status is 'Sent'. ⟨src: r2⟩
- **Test**: Attempt to mark an invoice as paid while status is 'Draft'. Expect operation to be rejected; system should enforce the 'Sent' status prerequisite.
- **Constrains**: Invoice (status transition: mark paid), Payment Record creation.

## R-3: Payment Amount Limit
The total amount of payments recorded on an invoice may not exceed the original invoice amount. ⟨src: r3⟩
- **Test**: Record multiple payment records for an invoice; if the cumulative amount exceeds invoice total, reject addition. Support partial payments up to, but not past, the invoice amount.
- **Constrains**: Payment Record (create, edit), Invoice (status, amount_paid field if present).

## R-4: Client Data Access Isolation
A client may only view or download invoices that are assigned to their own client profile; they cannot access or view any other client’s invoices or contact info. ⟨src: r4⟩
- **Test**: Attempt to view/download invoices by logging in as a client that does not own the invoice. System must return not found/forbidden.
- **Constrains**: Client actions (view, download, pay) on Invoice and Client Profile nouns.

## R-5: Unique Invoice Numbers
Each invoice must have a unique invoice number within the firm; numbers are system-generated and strictly sequential. ⟨src: r5, d:invoice_numbering, d:x4⟩
- **Test**: Attempt to manually specify or duplicate invoice numbers during invoice creation. The system only generates the next sequential number and blocks any duplicates.
- **Constrains**: Invoice (create), Invoice number field, Firm Settings.

---

## Derived Invariants

### D-1: Bookkeeper Cannot Act After Reassignment
If a bookkeeper is unassigned from a client, they must immediately lose access to that client’s invoices and profiles.
- **Test**: Remove a client assignment from a bookkeeper; verify they lose all create/edit/view rights on affected records.
- **Constrains**: Bookkeeper Profile (assigned clients), Invoice, Client Profile actions.

### D-2: Archived Records Hidden from Clients
Soft-deleted (archived) invoices and client profiles become invisible to client users but remain accessible to admins for restore.
- **Test**: Archive any record; verify clients cannot see the invoice/profile in their portal, but admin can view/restore.
- **Constrains**: All nouns (soft delete flag), client view/download actions.

### D-3: Invoice Editability Until Paid
Invoices may only be edited while status is not 'Paid'. Once paid, only comments or attachments may be added, but not core fields. ⟨src: d:invoice_edit_after_send⟩
- **Test**: Attempt to edit invoice fields after status is set to 'Paid'; expect operation to be blocked.
- **Constrains**: Invoice (edit action, status field).

### D-4: Client May Not Edit Own Profile
Clients may only view, not edit, their own profile or contact information. ⟨src: d:x3⟩
- **Test**: Attempt profile edit as a client; expect UI and backend to block or not show this capability.
- **Constrains**: Client Profile (edit action by client actor).

### D-5: Only One Assignee per Invoice
Each invoice must have exactly one assigned bookkeeper. System prevents assigning multiple bookkeepers. ⟨src: d:record_assignment⟩
- **Test**: Attempt to assign multiple bookkeepers to a single invoice; system enforces single assignment.
- **Constrains**: Invoice (assigned bookkeeper field).

## Acceptance scenarios

# Acceptance Scenarios

## 1. Bookkeeper creates an Invoice for an assigned Client
- **Given** Jane (a Bookkeeper) is logged in and assigned to Client ABC Retail ⟨src: n3, r1⟩
- **When** Jane navigates to ABC Retail's profile and selects "Create Invoice" ⟨src: a1, n2⟩
- **Then** the system allows Jane to enter invoice details and saves an invoice with a unique number ⟨src: n1, r5, d:invoice_numbering, d:x4⟩

## 2. Bookkeeper cannot create an Invoice for an unassigned Client
- **Given** Jane is logged in but not assigned to Client XYZ Widgets ⟨src: n3, r1⟩
- **When** Jane attempts to create an invoice for XYZ Widgets ⟨src: a1, n2⟩
- **Then** the system displays a forbidden or not allowed message ⟨src: r1⟩

## 3. Bookkeeper edits Invoice details (before paid)
- **Given** Jane created Invoice #1209 for ABC Retail and it is in status 'Draft' ⟨src: a1, d:invoice_statuses⟩
- **When** Jane edits the amount or due date and saves changes ⟨src: a2⟩
- **Then** the changes are accepted and saved ⟨src: d:invoice_edit_after_send⟩

## 4. Bookkeeper edits Invoice after sending (still unpaid)
- **Given** Jane sent Invoice #1209 (status: Sent) for ABC Retail ⟨src: d:invoice_statuses⟩
- **When** Jane edits the due date ⟨src: a2⟩
- **Then** the change is accepted and visible to the client ⟨src: d:invoice_edit_after_send⟩

## 5. Bookkeeper cannot edit Invoice after it is marked Paid
- **Given** Invoice #1209 is in status Paid ⟨src: d:invoice_statuses⟩
- **When** Jane attempts to edit amount or due date ⟨src: a2⟩
- **Then** the system blocks the edit and shows a suitable message ⟨src: d:invoice_edit_after_send⟩

## 6. Bookkeeper marks Invoice as paid (Invoice must be Sent)
- **Given** Invoice #1209 is in status Draft ⟨src: d:invoice_statuses⟩
- **When** Jane tries to record a payment on this invoice ⟨src: a3, r2⟩
- **Then** the system rejects the action with validation that Invoice must be Sent ⟨src: r2⟩

## 7. Bookkeeper records partial payment for Invoice
- **Given** Invoice #1210 for $600 is in status 'Sent' ⟨src: d:invoice_statuses, d:partial_payments⟩
- **When** Jane records a payment of $400 ⟨src: a3, n4⟩
- **Then** the invoice remains 'Sent' and shows balance due $200 ⟨src: d:partial_payments, d:invoice_statuses⟩

## 8. Bookkeeper records payment that would exceed Invoice amount (invalid)
- **Given** payments totaling $600 on a $600 invoice (status: Paid) exist ⟨src: n4, d:partial_payments⟩
- **When** Jane attempts to add a new $100 payment record ⟨src: a3⟩
- **Then** the system blocks with an error on overpayment ⟨src: r3⟩

## 9. Unique Invoice number is enforced
- **Given** Jane attempts to create a new invoice for any client ⟨src: a1⟩
- **When** Jane tries to specify or duplicate an invoice number ⟨src: a1, d:x4⟩
- **Then** the system always generates the next unique, sequential number (does not permit override) ⟨src: r5, d:invoice_numbering, d:x4⟩

## 10. Client views and downloads own Invoice only
- **Given** Smith & Co. is logged in as a Client ⟨src: d:external_access, d:client_portal_scope⟩
- **When** they view/download their invoice
- **Then** the system provides access to download (PDF format), but only for their assigned invoices ⟨src: a7, a8, r4, x2⟩

## 11. Client cannot view or download others' Invoices
- **Given** Smith & Co. is logged in as a Client
- **When** they attempt to access/download an invoice for ABC Retail ⟨src: a7, a8⟩
- **Then** they receive a forbidden or not found error ⟨src: r4⟩

## 12. Client pays Invoice (system marks as paid manually)
- **Given** Smith & Co. logs in and views a 'Sent' invoice ⟨src: d:client_portal_scope⟩
- **When** they click 'Mark as Paid' or notify payment (if portal flow supports this) ⟨src: a9⟩
- **Then** a notification is sent to assigned bookkeeper, and invoice is eligible for marking as paid by bookkeeper ⟨src: d:notifications, a3⟩

## 13. Administrator adds a new Bookkeeper Profile
- **Given** Administrator is logged in ⟨src: d:identity_provider, p3⟩
- **When** they use the UI to add bookkeeper with email/name and assign clients ⟨src: a5, n3⟩
- **Then** Bookkeeper appears in user list and receives invite email ⟨src: d:invite_flow, d:notifications⟩

## 14. Soft-deleted (archived) Invoice is hidden from clients
- **Given** Admin or Bookkeeper archives an invoice for Smith & Co. ⟨src: d:deletion⟩
- **When** Smith & Co. logs in as client
- **Then** the archived invoice does not appear in their portal ⟨src: d:deletion⟩

## 15. Soft-deleted Invoice is still visible to Administrator
- **Given** Admin archives an invoice ⟨src: d:deletion⟩
- **When** Admin views invoice list with 'show archived' enabled
- **Then** the archived invoice is visible with option to restore ⟨src: d:deletion⟩

## 16. Bookkeeper loses access after client unassignment
- **Given** Bookkeeper Jane is assigned to ABC Retail
- **When** Admin removes ABC Retail from Jane's assigned clients ⟨src: n3, r1⟩
- **Then** Jane can no longer view or edit ABC Retail's invoices or profile ⟨src: r1⟩

## 17. Client may only view, not edit, own Client Profile
- **Given** Smith & Co. logs in
- **When** they view their profile
- **Then** all fields are read-only; no edit options appear ⟨src: d:x3⟩

## 18. Only assigned Bookkeeper and Admin may view or add Payment Record on Invoice
- **Given** Jane is assigned to ABC Retail
- **When** Jane or Admin adds/edits Payment Record for ABC Retail's invoice ⟨src: a3, n4⟩
- **Then** permitted
- **When** an unrelated bookkeeper tries
- **Then** action is rejected ⟨src: r1⟩

## 19. Comments thread visible per assignment
- **Given** Invoice #1212 for ABC Retail
- **When** Jane (assigned bookkeeper) or ABC Retail logs in
- **Then** both can view/add comments to the invoice ⟨src: d:record_activity_feed⟩
- **When** an unassigned bookkeeper or unrelated client attempts
- **Then** access is rejected or not shown ⟨src: r1, r4⟩

## 20. Invoice can have only one assigned Bookkeeper
- **Given** Admin is assigning Bookkeepers to Invoice
- **When** they attempt to assign more than one
- **Then** system prevents multiple assignment; only one Bookkeeper permitted ⟨src: d:record_assignment⟩

## 21. Administrator can always view and edit all records
- **Given** Admin is logged in
- **When** they view/edit any Invoice, Profile, or Payment Record
- **Then** system always allows access, regardless of assignment ⟨src: d:roles⟩

## 22. Client sees only their active (not archived) Invoices in portal
- **Given** Smith & Co. logs in
- **When** they view their invoices
- **Then** system excludes archived invoices ⟨src: d:deletion⟩

## 23. Email notification on invoice sent, payment received, or new comment
- **Given** Invoice is sent, payment recorded, or a comment is added to an invoice ⟨src: d:notifications, d:record_activity_feed⟩
- **Then** an email notification is sent to the relevant bookkeeper, client, or admin as appropriate ⟨src: d:notifications, d:record_watchers⟩

## 24. Automatic overdue reminder is sent if invoice is past due
- **Given** Invoice is in 'Sent' status and past due date ⟨src: d:overdue_reminders, d:recurring_scheduled⟩
- **When** scheduled reminder job runs
- **Then** email reminder goes to client (and optionally bookkeeper) ⟨src: d:overdue_reminders, d:notifications⟩

---

All scenarios above are expected to be checked in both UI and API with appropriate negative cases for access rules and invariants.

## Key journeys

# Key End-to-End Journeys

## 1. Administrator Onboards a New Bookkeeper
1. Administrator logs in with email and password. ⟨src: d:identity_provider⟩
2. Navigates to Bookkeepers or User Management. ⟨src: a5⟩
3. Clicks "Add Bookkeeper", enters full name and email. ⟨src: a5, n3⟩
4. Assigns new bookkeeper to one or more client profiles. ⟨src: n3, d:invite_flow⟩
5. Bookkeeper receives invitation email with login details/instructions. ⟨src: d:notifications, d:invite_flow⟩
6. Bookkeeper logs in and is able to access assigned client profiles and start invoicing. ⟨src: d:user_accounts, r1⟩

---

## 2. Bookkeeper Issues and Sends Invoice to Client
1. Bookkeeper signs in and accesses dashboard or client list. ⟨src: d:identity_provider, a4⟩
2. Opens an assigned client profile. ⟨src: n2, a4, r1⟩
3. Clicks "Create Invoice", enters invoice details (amount, due date, description, etc.). ⟨src: a1, n1⟩
4. System generates a unique, sequential invoice number. ⟨src: d:invoice_numbering, r5, d:x4⟩
5. Bookkeeper saves the invoice (status: Draft). ⟨src: d:invoice_statuses⟩
6. Bookkeeper reviews and edits as needed (while status is Draft). ⟨src: a2, d:invoice_edit_after_send⟩
7. Bookkeeper clicks "Send Invoice"—status changes to Sent.
8. Client receives email notification with attached PDF invoice. ⟨src: d:notifications, d:invoice_delivery, x2⟩
9. Invoice appears in the client's online portal (status: Sent). ⟨src: d:external_access, d:client_portal_scope⟩

---

## 3. Client Views and Pays Invoice
1. Client logs into the portal using email and password. ⟨src: d:identity_provider, d:external_access⟩
2. Sees a list of their invoices, with status highlighted (e.g., Draft not shown to client, Sent visible, Paid visible). ⟨src: r4, d:client_portal_scope, d:invoice_statuses⟩
3. Opens any invoice to view full details, add comments or questions as needed. ⟨src: a7, d:record_activity_feed, r4⟩
4. Downloads invoice as PDF if desired. ⟨src: a8, x2, r4⟩
5. Pays invoice outside the system (bank transfer or other method), as app does not process payments. ⟨src: g1⟩
6. Optionally marks invoice as paid in portal, sending a notification to bookkeeper (if allowed by portal scope). ⟨src: a9, d:client_portal_scope⟩

---

## 4. Bookkeeper Records Payment
1. Bookkeeper receives notification or client communication about payment. ⟨src: d:notifications⟩
2. Finds and opens the invoice (must be status: Sent). ⟨src: r2⟩
3. Clicks "Record Payment", enters payment details (date, amount, method).
4. System checks that total of payments (including new one) does not exceed invoice amount. ⟨src: r3⟩
5. If payment covers full invoice, status changes to Paid; if partial, invoice remains Sent with adjusted balance. ⟨src: d:partial_payments, d:invoice_statuses⟩
6. Entry appears in Payment Record log linked to the invoice. ⟨src: n4⟩
7. Client receives email notification that payment was received. ⟨src: d:notifications⟩

---

## 5. Automatic Overdue Reminder Sends
1. System checks for Sent invoices where Due date is past and status is still Sent. ⟨src: d:recurring_scheduled, d:overdue_reminders, d:invoice_statuses⟩
2. For each overdue invoice, sends reminder emails to client (and optionally bookkeeper). ⟨src: d:notifications, d:overdue_reminders⟩
3. Reminder content and schedule are based on Firm Settings. ⟨src: n5, d:x1⟩
4. Bookkeeper sees indicator of overdue status in their dashboard/list. ⟨src: d:reporting, d:record_views⟩

---

## 6. Bookkeeper and Client Discuss Invoice or Payment
1. Bookkeeper and client can add comments/questions within the invoice record. ⟨src: d:record_activity_feed, a3, a7⟩
2. Participants receive email notifications for new comments where they are mentioned or assigned. ⟨src: d:record_activity_feed, d:record_watchers⟩
3. All comments are visible in the invoice's activity feed; clients only see comments on their own invoices. ⟨src: r4⟩

---

## 7. Administrator Changes Firm Settings
1. Administrator logs in, navigates to Firm Settings. ⟨src: d:identity_provider, n5⟩
2. Edits items like business name, payment terms, or email template content. ⟨src: a6, d:x1⟩
3. Saves changes; updated settings reflected in future new invoices and notifications. ⟨src: a6, n5⟩

---

## 8. Bookkeeper Adds a Late Fee to Overdue Invoice (Manual Handling)
1. Bookkeeper identifies overdue invoice needing a late fee. ⟨src: d:late_fees⟩
2. Edits invoice, manually adds or increases late fee field, saves invoice. ⟨src: d:late_fees, d:invoice_edit_after_send⟩
3. Late fee appears in the invoice details for bookkeeper and client. ⟨src: d:late_fees, r4⟩
4. Sends updated invoice PDF to client via email. ⟨src: d:notifications, d:invoice_delivery⟩

---

## Non-goals & defaulted decisions

# Non-Goals & Defaults

## Explicit Non-Goals (Out of Scope)
- **No integrated online payment processing or receiving money directly**: The system does not handle actual receipt of funds or connect to payment gateways. Payment is handled outside, with manual marking in-app. ⟨src: g1⟩
- **No time/expense tracking for bookkeeping activities**: No internal tracking of staff hours, billable time, or expenses. ⟨src: g2⟩
- **No tax filing or advanced accounting beyond basic invoicing**: No payroll, year-end tax support, or financial statements. ⟨src: g3⟩
- **No integration with external accounting software in v1**: The app is standalone. No API integrations, import/export to QuickBooks/Xero, etc. ⟨src: g4, d:integrations⟩
- **No recurring invoice automation**: Recurring/automatic invoice creation is not included. Invoices are created one at a time. ⟨src: d:recurring_invoices⟩
- **No client self-service beyond viewing/downloading/paying invoices in the portal**: Clients cannot update their profiles, request services, or message bookkeepers in v1. ⟨src: d:client_portal_scope⟩

---

## Defaulted Decisions Table
| Decision                        | Chosen Option                           | Confidence | Source              |
|----------------------------------|-----------------------------------------|------------|---------------------|
| user_accounts                    | multi_user                              | 95%        | defaulted           |
| roles                            | owner_staff                             | 95%        | defaulted           |
| external_access                  | portal                                  | 95%        | defaulted           |
| tenancy                          | single_org                              | 96%        | defaulted           |
| invite_flow                      | invite_by_admin                         | 95%        | defaulted           |
| identity_provider                | email_password                          | 95%        | defaulted           |
| concurrency                      | last_write_wins                         | 96%        | defaulted           |
| audit_trail                      | basic                                   | 100%       | resolved            |
| notifications                    | email                                   | 95%        | defaulted           |
| offline                          | online_only                             | 99%        | defaulted           |
| platform                         | web                                     | 97%        | defaulted           |
| data_import                      | import_spreadsheet                      | 57%        | defaulted           |
| data_export                      | csv_export                              | 96%        | defaulted           |
| deletion                         | soft_delete                             | 100%       | resolved            |
| data_scale                       | small                                   | 87%        | defaulted           |
| integrations                     | none                                    | 94%        | defaulted           |
| localization                     | single_locale                           | 96%        | defaulted           |
| attachments                      | basic                                   | 95%        | defaulted           |
| approval_workflow                | none                                    | 96%        | defaulted           |
| recurring_scheduled              | reminders_only                          | 100%       | resolved            |
| public_facing                    | none                                    | 65%        | defaulted           |
| compliance_sensitivity           | ordinary                                | 95%        | defaulted           |
| retention                        | forever                                 | 97%        | defaulted           |
| customization                    | fixed                                   | 75%        | defaulted           |
| reporting                        | basic_dashboard                         | 85%        | defaulted           |
| client_portal_scope              | view_act                                | 100%       | resolved            |
| invoicing_model                  | firm_bills_own_clients                  | 95%        | defaulted           |
| invoice_numbering                | sequential                              | 95%        | defaulted           |
| invoice_edit_after_send          | editable_until_paid                     | 90%        | defaulted           |
| payment_recording                | manual                                  | 95%        | defaulted           |
| partial_payments                 | allowed                                 | 95%        | defaulted           |
| taxes                            | single_rate                             | 92%        | defaulted           |
| currencies                       | single                                  | 96%        | defaulted           |
| recurring_invoices               | no                                      | 61%        | defaulted           |
| overdue_reminders                | auto_reminders                          | 91%        | defaulted           |
| late_fees                        | manual                                  | 100%       | resolved            |
| estimates                        | no                                      | 91%        | defaulted           |
| credit_notes                     | credit_notes                            | 96%        | defaulted           |
| invoice_delivery                 | pdf_email                               | 94%        | defaulted           |
| invoice_statuses                 | simple                                  | 56%        | defaulted           |
| branding                         | logo_colors                             | 96%        | defaulted           |
| deposits                         | no                                      | 96%        | defaulted           |
| workspace_structure              | single_pool                             | 96%        | defaulted           |
| record_ownership                 | everyone_in_workspace                   | 61%        | defaulted           |
| record_edit_rights               | owner_assignee_admin                    | 95%        | defaulted           |
| record_custom_fields             | fixed_fields                            | 92%        | defaulted           |
| record_pipeline                  | no_stages                               | 100%       | resolved            |
| record_assignment                | single_assignee_due                     | 95%        | defaulted           |
| record_activity_feed             | comments                                | 100%       | resolved            |
| record_relationships             | linked_types                            | 95%        | defaulted           |
| record_views                     | list_only                               | 94%        | defaulted           |
| record_automation                | none                                    | 100%       | resolved            |
| record_templates                 | none                                    | 60%        | defaulted           |
| record_duplicates                | unique_key_enforced                     | 94%        | defaulted           |
| record_search                    | filters_in_lists                        | 94%        | defaulted           |
| record_watchers                  | assignee_and_mentions                   | 96%        | defaulted           |
| record_bulk_edit                 | one_at_a_time                           | 92%        | defaulted           |
| record_recurring                 | no                                      | 93%        | defaulted           |
| x1                               | basic_settings                          | 88%        | defaulted           |
| x2                               | pdf_only                                | 100%       | resolved            |
| x3                               | view_only                               | 95%        | defaulted           |
| x4                               | system_enforced                         | 96%        | defaulted           |

## Glossary

# Glossary

## Actors

- **Bookkeeper**: Employee or owner of a bookkeeping firm handling client accounts. ⟨src: n:Bookkeeper Profile, p:p1⟩
- **Client**: Business customer receiving invoices from the bookkeeping firm. ⟨src: n:Client Profile, p:p2⟩
- **Administrator**: Person managing user access and firm-wide settings. ⟨src: n:Firm Settings, p:p3⟩

## Nouns

- **Invoice**: A bill sent to a client for bookkeeping services. Includes invoice number, client name, amount, due date, and status. ⟨src: n:Invoice⟩
- **Client Profile**: Business information for each client the firm invoices, including business name, contact email, phone, and address. ⟨src: n:Client Profile⟩
- **Bookkeeper Profile**: Information about a bookkeeper who sends invoices, including full name, email, and the clients assigned to them. ⟨src: n:Bookkeeper Profile⟩
- **Payment Record**: Details of payments received on invoices, including invoice number, date received, amount, and payment method. ⟨src: n:Payment Record⟩
- **Firm Settings**: General information and configuration for the bookkeeping firm, such as firm name, address, payment terms, and email templates. ⟨src: n:Firm Settings⟩
