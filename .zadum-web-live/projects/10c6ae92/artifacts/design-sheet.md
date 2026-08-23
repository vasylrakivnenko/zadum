# Design Sheet — an invoicing app for small bookkeeping firms
_v16 · b2b-invoicing, crud-saas_

## People
- **Bookkeeper** — Employee or owner of a bookkeeping firm handling client accounts. `p1`
- **Client** — Business customer receiving invoices from the bookkeeping firm. `p2`
- **Administrator** — Person managing user access and firm-wide settings. `p3`

## Things it keeps track of
- **Invoice** — A bill sent to a client for bookkeeping services. · fields: Invoice number, Client name, Amount, Due date, Status · e.g. Invoice #1208 for Smith & Co., $600, due June 30, status: Sent. `n1`
- **Client Profile** — Business information for each client the firm invoices. · fields: Business name, Contact email, Phone, Address · e.g. ABC Retail, contact@abcretail.com, 555-1234. `n2`
- **Bookkeeper Profile** — Information about a bookkeeper who sends invoices. · fields: Full name, Email, Assigned clients · e.g. Jane Doe, jane@firm.com, assigned to Smith & Co. `n3`
- **Payment Record** — Details of payments received on invoices. · fields: Invoice number, Date received, Amount, Payment method · e.g. Invoice #1208, paid June 25, $600, ACH Transfer. `n4`
- **Firm Settings** — General information and configuration for the bookkeeping firm. · fields: Firm name, Address, Payment terms, Email templates · e.g. Acme Bookkeeping, default terms: Net 15. `n5`

## What people do
- Bookkeeper **creates** Invoice — e.g. Jane creates an invoice for Smith & Co. for May's services. `a1`
- Bookkeeper **edits** Invoice — e.g. Jane updates the due date on Invoice #1208. `a2`
- Bookkeeper **marks paid** Invoice — e.g. Jane records a payment for Invoice #1208. `a3`
- Bookkeeper **views** Client Profile — e.g. Jane checks ABC Retail's contact info. `a4`
- Administrator **adds** Bookkeeper Profile — e.g. Admin adds John as a new bookkeeper. `a5`
- Administrator **edits** Firm Settings — e.g. Admin changes the firm's default payment terms. `a6`
- Client **views** Invoice — e.g. Smith & Co. checks their latest invoice online. `a7`
- Client **downloads** Invoice — e.g. ABC Retail downloads Invoice #1212 as PDF. `a8`
- Client **pays** Invoice — e.g. Smith & Co. pays Invoice #1208 online. `a9`

## What must never happen
- Only bookkeepers assigned to a client may create or edit that client's invoices. — e.g. Jane can't edit invoices for clients she isn't assigned to. _(access)_ `r1`
- An invoice cannot be marked as paid until it has been sent. — e.g. Status must be 'Sent' before payment is recorded. _(state)_ `r2`
- Total payments recorded for an invoice may not exceed the invoice amount. — e.g. Cannot record $700 payment for $600 invoice. _(integrity)_ `r3`
- Clients can only view and download their own invoices. — e.g. Smith & Co. can't see ABC Retail's invoices. _(access)_ `r4`
- Each invoice must have a unique invoice number within the firm. — e.g. No two invoices can be #1208 for Acme Bookkeeping. _(integrity)_ `r5`

## Not yet (out of scope for v1)
- Does not handle online payment processing or receive money directly. `g1`
- No built-in time tracking or expense management for bookkeeping activities. `g2`
- Does not provide tax filing or advanced accounting functions. `g3`
- No integration with external accounting software in version one. `g4`

## Decisions
- ≈ **who logs in**: Several people log in, possibly with different powers (95%) _[defaulted]_
- ≈ **who can do what**: An owner/admin plus staff with fewer powers (95%) _[defaulted]_
- ≈ **outside parties**: They have their own accounts and log in (95%) _[defaulted]_
- ≈ **one business or many**: One business (ours) (96%) _[defaulted]_
- ≈ **adding people**: An admin invites them (95%) _[defaulted]_
- ≈ **signing in**: Email + password (95%) _[defaulted]_
- ≈ **simultaneous edits**: Rare; the last save wins (96%) _[defaulted]_ — because of record_pipeline
- ✓ **history**: Just created/updated by whom and when _[resolved]_ — card:0809fc90-ae81-48ae-8fe2-a443924873aa
- ≈ **reaching people**: Email (95%) _[defaulted]_ — because of record_activity_feed
- ≈ **connectivity**: Online only (99%) _[defaulted]_
- ≈ **where it runs**: In a browser, on desktop and phone (97%) _[defaulted]_
- ≈ **starting data**: Import from a spreadsheet/CSV once (57%) _[defaulted]_
- ≈ **getting data out**: Download lists as CSV/Excel (96%) _[defaulted]_
- ✓ **deleting**: It's archived and can be restored _[resolved]_ — card:e64f3616-b244-4219-82ee-dbe0699b4ff5
- ≈ **volume**: Hundreds of records (87%) _[defaulted]_
- ≈ **other tools**: No (94%) _[defaulted]_
- ≈ **languages & regions**: One language, one country (96%) _[defaulted]_ — because of record_pipeline
- ≈ **files**: Yes — upload and download (95%) _[defaulted]_ — because of record_activity_feed
- ≈ **sign-off**: No (96%) _[defaulted]_ — because of x2
- ✓ **automation**: Only reminders/notifications _[resolved]_ — card:1e6896ec-8fa6-4eaf-82ed-2ea3b905cea2
- ≈ **public pages**: No (65%) _[defaulted]_
- ≈ **sensitive data**: Ordinary business data (95%) _[defaulted]_ — because of record_pipeline
- ≈ **keeping data**: Until someone deletes it (97%) _[defaulted]_
- ≈ **per-business customization**: No — everyone gets the same thing (75%) _[defaulted]_
- ≈ **overviews**: A dashboard with totals and counts (85%) _[defaulted]_
- ✓ **outside parties**: View what's theirs and act on it (pay, approve, book) _[resolved]_ — user_edit:25243835-111b-4853-9062-1889aa75f832
- ≈ **who invoices whom**: The business bills its own clients (95%) _[defaulted]_
- ≈ **numbering**: Strictly sequential per business (no gaps; legally safe) (95%) _[defaulted]_
- ≈ **changing sent invoices**: Yes, until it's paid (90%) _[defaulted]_
- ≈ **getting paid**: Someone marks invoices paid by hand (95%) _[defaulted]_
- ≈ **getting paid**: Yes — partial payments and balances (95%) _[defaulted]_
- ≈ **tax**: One tax rate per invoice (92%) _[defaulted]_
- ≈ **money**: One currency (96%) _[defaulted]_ — because of record_pipeline
- ≈ **automation**: No (61%) _[defaulted]_
- ≈ **late invoices**: Automatic reminders on a schedule (91%) _[defaulted]_
- ✓ **late invoices**: Added by hand when needed _[resolved]_ — card:d8632131-469d-4f35-9768-5435ef355e6b
- ≈ **before invoicing**: No (91%) _[defaulted]_
- ≈ **corrections & refunds**: Credit notes against invoices (96%) _[defaulted]_
- ≈ **sending**: PDF attached to an email (94%) _[defaulted]_
- ≈ **lifecycle**: Draft → Sent → Paid (56%) _[defaulted]_
- ≈ **looks**: Logo and colors (96%) _[defaulted]_
- ≈ **getting paid**: No (96%) _[defaulted]_ — because of record_pipeline
- ≈ **how things are grouped**: One shared pool — everything lives in one place with filters (96%) _[defaulted]_ — because of record_pipeline
- ≈ **who sees what**: Everyone in the team sees everything (61%) _[defaulted]_
- ≈ **who can do what**: Only its owner/assignee and admins; others just view (95%) _[defaulted]_
- ≈ **fields**: Fixed — the same fields for everyone (92%) _[defaulted]_
- ✓ **stages**: No — just a status flag (open/closed) _[resolved]_ — card:20d1c3f2-81ea-439f-8b68-b35cb20d0ffd
- ≈ **assignments**: One assignee and an optional due date (95%) _[defaulted]_ — because of record_activity_feed
- ✓ **collaboration**: Comments on each record _[resolved]_ — card:62134e2b-1a13-4a26-843d-666b02016888
- ≈ **links between records**: Yes — records of different types reference each other (contact → company → deal) (95%) _[defaulted]_
- ≈ **views**: A sortable, filterable list/table (94%) _[defaulted]_
- ✓ **automation**: No — people do everything by hand _[resolved]_ — card:ee448ad3-bfec-4c6a-abf1-9a3808362bd1
- ≈ **templates**: No — start from blank (60%) _[defaulted]_
- ≈ **data quality**: A key field must be unique; duplicates are rejected (94%) _[defaulted]_
- ≈ **finding things**: Filter and sort within each list (94%) _[defaulted]_
- ≈ **reaching people**: The assignee, and anyone @mentioned (96%) _[defaulted]_
- ≈ **bulk actions**: No — one record at a time (92%) _[defaulted]_
- ≈ **automation**: No (93%) _[defaulted]_
- ≈ **Firm Settings Customization**: Firm name/address, simple terms (88%) _[defaulted]_
- ✓ **Invoice Download Format**: PDF only _[resolved]_ — card:b9ccff34-239f-4b0e-8c21-d5a4e91732b9
- ≈ **Client Profile Visibility**: Can only view (95%) _[defaulted]_ — because of record_automation
- ≈ **Invoice Number Format Enforcement**: System always generates unique numbers (96%) _[defaulted]_
