# Design Sheet — invoicing app for our small bookkeeping firm that bills clients monthly
_v5 · b2b-invoicing, crud-saas_

## People
- **Bookkeeper** — Staff member who prepares and sends monthly invoices to clients. `p1`
- **Firm Owner** — Owner who oversees billing, sets rates, and reviews payments. `p2`
- **Client** — Business the firm bills monthly for bookkeeping services. `p3`

## Things it keeps track of
- **Client** — A business the firm provides bookkeeping services to. · fields: Business name, Contact email, Monthly rate, Billing day · e.g. Acme Landscaping, billing@acme.com, $450/mo, billed on the 1st `n1`
- **Invoice** — A monthly bill sent to a client for services rendered. · fields: Invoice number, Client, Amount, Status, Due date · e.g. Invoice #1042 for Acme Landscaping, $450, sent Mar 1, due Mar 15 `n2`
- **Line Item** — A single charge listed on an invoice. · fields: Description, Quantity, Rate, Amount · e.g. Monthly bookkeeping, 1 x $450 = $450 `n3`
- **Payment** — Money received from a client against an invoice. · fields: Invoice, Amount, Date received, Method · e.g. $450 received Mar 12 by bank transfer for Invoice #1042 `n4`
- **Service** — A billable service the firm offers with a standard rate. · fields: Name, Default rate, Billing frequency · e.g. Monthly bookkeeping, $450, monthly `n5`
- **Statement** — A summary of a client's invoices and balance over a period. · fields: Client, Period, Total billed, Balance due · e.g. Acme Landscaping, Q1, $1,350 billed, $0 due `n6`

## What people do
- Bookkeeper **creates** Invoice — e.g. Bookkeeper creates Invoice #1042 for Acme Landscaping on Mar 1 `a1`
- Bookkeeper **adds** Line Item — e.g. Bookkeeper adds 'Monthly bookkeeping $450' to Invoice #1042 `a2`
- Bookkeeper **sends** Invoice — e.g. Bookkeeper emails Invoice #1042 to billing@acme.com `a3`
- Bookkeeper **records** Payment — e.g. Bookkeeper records $450 payment for Invoice #1042 on Mar 12 `a4`
- Bookkeeper **marks paid** Invoice — e.g. Bookkeeper marks Invoice #1042 paid after full payment `a5`
- Bookkeeper **adds** Client — e.g. Bookkeeper adds Acme Landscaping with a $450 monthly rate `a6`
- Firm Owner **sets** Service — e.g. Firm Owner sets 'Monthly bookkeeping' rate to $450 `a7`
- Firm Owner **reviews** Statement — e.g. Firm Owner reviews Acme's Q1 statement showing $0 balance `a8`
- Firm Owner **voids** Invoice — e.g. Firm Owner voids Invoice #1039 created in error `a9`
- Bookkeeper **generates** Statement — e.g. Bookkeeper generates a Q1 statement for Acme Landscaping `a10`
- Client **receives** Invoice — e.g. Client receives Invoice #1042 by email `a11`

## What must never happen
- Every invoice must have a unique, sequential invoice number. — e.g. After #1042 the next invoice is #1043, never a repeat. _(integrity)_ `r1`
- An invoice cannot be sent until it has at least one line item with an amount. — e.g. Invoice #1042 stays a draft until 'Monthly bookkeeping $450' is added. _(state)_ `r2`
- Recorded payments for an invoice may never exceed the invoice total. — e.g. A $450 invoice cannot accept a $500 payment. _(integrity)_ `r3`
- A paid invoice cannot be edited; it must be voided and reissued instead. — e.g. To fix a paid #1042, void it and create #1043. _(state)_ `r4`
- Only the Firm Owner may void an invoice. — e.g. A Bookkeeper cannot void #1039; only the Owner can. _(access)_ `r5`
- Only the Firm Owner may change a client's monthly rate. — e.g. A Bookkeeper cannot change Acme's $450 rate. _(access)_ `r6`
- An invoice is marked paid only when payments equal the full amount. — e.g. #1042 stays unpaid until the full $450 is received. _(state)_ `r7`
- Each invoice must be tied to exactly one client. — e.g. Invoice #1042 belongs only to Acme Landscaping. _(integrity)_ `r8`
- Once an invoice has been sent to a client it cannot revert to draft status; corrections require voiding and reissuing. _(state)_ `r9`
- A partial payment moves an invoice to a 'partially paid' state rather than paid, and it becomes fully paid only when payments total the invoice amount. _(state)_ `r10`
- A sent invoice whose due date has passed without full payment is flagged as overdue. _(state)_ `r11`
- Voiding an invoice never deletes it; the record and its number are retained for the audit trail. _(integrity)_ `r12`

## Not yet (out of scope for v1)
- No online payment processing or card collection; clients pay by their own method. `g1`
- No client login or self-service portal in the first version. `g2`
- No payroll, expense tracking, or general accounting features. `g3`
- No automatic tax calculation or filing. `g4`
- No automated recurring billing; invoices are created by staff each month. `g5`

## Decisions
- ≈ **who logs in**: Several people log in, possibly with different powers (95%) _[defaulted]_
- ≈ **who can do what**: An owner/admin plus staff with fewer powers (95%) _[defaulted]_
- ≈ **outside parties**: No — outsiders only receive emails/PDFs/messages (95%) _[defaulted]_
- ≈ **one business or many**: One business (ours) (95%) _[defaulted]_
- ≈ **adding people**: An admin invites them (96%) _[defaulted]_
- ≈ **signing in**: Email + password (73%) _[defaulted]_
- ≈ **simultaneous edits**: Common; the app must prevent or merge conflicting edits (51%) _[defaulted]_
- ≈ **history**: Just created/updated by whom and when (65%) _[defaulted]_
- ≈ **reaching people**: Email (97%) _[defaulted]_
- ≈ **connectivity**: Online only (99%) _[defaulted]_
- ≈ **where it runs**: In a browser, on desktop and phone (96%) _[defaulted]_
- ≈ **starting data**: Import from a spreadsheet/CSV once (91%) _[defaulted]_
- ≈ **getting data out**: Download lists as CSV/Excel (77%) _[defaulted]_
- ≈ **deleting**: Records are never deleted, only voided/cancelled (95%) _[defaulted]_
- ≈ **volume**: Hundreds of records (93%) _[defaulted]_
- ≈ **other tools**: No (95%) _[defaulted]_
- ≈ **money**: It records payments that happen elsewhere (95%) _[defaulted]_
- ≈ **languages & regions**: One language, one country (95%) _[defaulted]_
- ≈ **files**: Yes — upload and download (71%) _[defaulted]_
- ≈ **sign-off**: No (93%) _[defaulted]_
- ≈ **automation**: No (95%) _[defaulted]_
- ≈ **sensitive data**: Ordinary business data (95%) _[defaulted]_
- ≈ **keeping data**: Until someone deletes it (96%) _[defaulted]_
- ≈ **per-business customization**: Branding and templates (logo, colors, wording) (92%) _[defaulted]_
- ✓ **overviews**: A dashboard with totals and counts _[resolved]_ — card:8c4ce052-a9a0-44c8-8611-58a9eba26049
- ≈ **who invoices whom**: The business bills its own clients (95%) _[defaulted]_
- ≈ **numbering**: Strictly sequential per business (no gaps; legally safe) (95%) _[defaulted]_
- ≈ **changing sent invoices**: Yes, until it's paid (95%) _[defaulted]_
- ≈ **getting paid**: Someone marks invoices paid by hand (95%) _[defaulted]_
- ≈ **getting paid**: Yes — partial payments and balances (93%) _[defaulted]_
- ≈ **tax**: No tax lines (95%) _[defaulted]_
- ≈ **money**: One currency (95%) _[defaulted]_
- ≈ **automation**: No (95%) _[defaulted]_
- ≈ **late invoices**: Someone sends a reminder by hand (72%) _[defaulted]_
- ≈ **late invoices**: No (72%) _[defaulted]_
- ≈ **before invoicing**: No (94%) _[defaulted]_
- ≈ **corrections & refunds**: Credit notes against invoices (73%) _[defaulted]_
- ≈ **scope**: No (95%) _[defaulted]_
- ≈ **sending**: PDF attached to an email (93%) _[defaulted]_
- ≈ **other tools**: Export files for the accountant (90%) _[defaulted]_
- ≈ **lifecycle**: Draft → Sent → Viewed → Partially paid → Paid / Overdue / Void (93%) _[defaulted]_
- ≈ **looks**: Logo and colors (93%) _[defaulted]_
- ≈ **getting paid**: No (94%) _[defaulted]_
- ≈ **customer references**: No — invoices don't track customer PO numbers (64%) _[defaulted]_
- ≈ **discounts**: A single discount on the whole invoice (48%) _[defaulted]_
- ≈ **getting paid**: Net terms (e.g., Net 15/30/60) counted from the invoice date (90%) _[defaulted]_
- ≈ **payments**: Two gentle nudges: a few days before and after the due date (92%) _[defaulted]_
- ≈ **payments**: A flat amount added once (74%) _[defaulted]_
- ≈ **records**: They share the invoice number sequence (55%) _[defaulted]_
- ≈ **bulk actions**: Yes — select many and assign/move/tag/delete together (73%) _[defaulted]_
- ≈ **deletion-with-dependents**: Archive client but keep all invoices/payments intact (91%) _[defaulted]_
- ≈ **duplicate-submission**: Detect and ignore duplicates (idempotent) (71%) _[defaulted]_
- ≈ **zero-negative-rounding**: Round to cents; reject zero/negative line amounts (65%) _[defaulted]_
- ≈ **time-boundaries**: Use the last day of that month (93%) _[defaulted]_
- ≈ **partial-failure**: Mark sent but flag delivery failure for retry (94%) _[defaulted]_
- ≈ **lifecycle-backwards**: No reversal — only void and reissue (per r4) (92%) _[defaulted]_
- ≈ **permission-escalation**: Owner can grant temporary delegated rights (50%) _[defaulted]_
- ≈ **invoice-numbering-integrity**: Number stays voided in place — a visible gap remains (95%) _[defaulted]_
