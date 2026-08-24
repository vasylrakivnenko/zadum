# Invoicing App for Small Bookkeeping Firms

## Feature Overview

A user-focused invoicing application designed to streamline billing, invoice management, and client communications for small bookkeeping firms. The app should simplify the process of generating, sending, and tracking invoices, tailored to the needs of small groups and their clients.

## Clarifications

### Session 2024-06-10
- Q: **Question:** What mechanism should be used for user authentication and access control (e.g., email/password login, Google OAuth, firm-provided SSO, etc.)? → A: Email and password login (unique per user)
- Q: **Question:** What client data fields must be required versus optional when creating or editing a client record? → A: Name, email (required); phone and address (optional)

### Session 2024-06-12
- Q: **Question:** What statuses should an invoice be allowed to transition between, and are any transitions forbidden (e.g., can a Paid invoice be marked Overdue)? → A: Draft → Sent → Overdue/Paid (Paid/Overdue are final, no reversal)

### Session 2024-06-13
- Q: **Question:** What are the essential invoice fields (beyond status and line items) that must be included on every invoice record (e.g., invoice number, issue date, due date, client reference, notes)? Answer in <=5 words. → A: Invoice number, issue date, due date.

### Session 2024-06-14
- Q: **Question:** What information must be included in each invoice line item (e.g., description, quantity, unit price, amount, tax rate)? → A: Description, quantity, unit price, amount, tax rate

## User Scenarios & Testing

1. A bookkeeper logs in, adds a new client, creates an invoice, and sends it by email to the client.
2. A bookkeeper views all outstanding invoices, filters by due date, and sends reminders for unpaid invoices.
3. A bookkeeper marks an invoice as paid and the system updates reports/analytics accordingly.
4. A bookkeeper downloads a summary of invoices sent and their payment statuses for a specified date range.

## Functional Requirements

1. Users can add, edit, and archive client records with relevant contact details.
   - When creating or editing a client record: **Client Name and client email address are required fields; phone number and address are optional.**
2. Users can create new invoices by selecting a client, adding line items (description, quantity, unit price), and specifying terms (due date, payment instructions).
   - **Each invoice line item must include: description, quantity, unit price, amount, and tax rate.**
3. Invoices can be sent via email directly from the app to the client's email address.
4. Users can view the status of invoices (e.g., Draft, Sent, Paid, Overdue) and filter/search the invoice list by various criteria (client, status, date).
   - **Invoice statuses follow the progression: Draft → Sent → Overdue/Paid. Once an invoice is marked as Paid or Overdue, it cannot be reversed to any previous status (both Paid and Overdue are final states and cannot transition further).**
5. App supports marking invoices as paid (manually updated by user), and automatically reflects payment status.
6. Users can send payment reminders for overdue invoices.
7. Users can generate simple reports summarizing invoices issued, payments received, and outstanding balances within a selected period.
8. Login and access control: Only authorized users (bookkeeping firm staff) can access firm data. **User authentication is performed via email and password login, with each user having a unique email/password combination.**
9. **All invoice records must include: invoice number, issue date, due date, status, line items, and reference to the associated client.**

## Success Criteria

- Bookkeepers can create, send, and track invoices to completion within 5 minutes per transaction.
- At least 95% of invoices dispatched reach clients without errors (tracked via delivery reports).
- Bookkeepers report a subjective improvement in invoicing workflow efficiency compared to their previous (manual or legacy) process.
- The system correctly displays all outstanding invoices and flags overdue amounts reliably.
- All primary flows (create, send, track, report) can be completed by users without outside help.

## Key Entities

- User (Bookkeeper/Firm Staff)
- Client (fields: name [required], email [required], phone [optional], address [optional])
- Invoice
  - **Fields:**
    - invoice number (required, unique)
    - issue date (required)
    - due date (required)
    - client (reference) (required)
    - status (Draft, Sent, Overdue, Paid; required)
    - line items (at least one; required)
  - **Status field:** Draft, Sent, Overdue, Paid (can only advance; cannot return once marked Paid/Overdue)
- Invoice Line Item
  - **Fields:** description (required), quantity (required), unit price (required), amount (required), tax rate (required)

## Assumptions

- The target users are employees of small bookkeeping firms (1-10 staff; small client lists).
- Payment collection and processing (e.g., integrating payment gateways) is out of scope and handled externally; only invoice generation, sending, and tracking is required.
- Email delivery is considered successful when not bounced (system will not guarantee read receipts).
- User interface is assumed web-based for initial scope.

## Constraints

- Must comply with common privacy standards for handling client and invoice data (such as GDPR if in relevant markets).
- Data should be exportable for firm records and accounting needs.
- The system should be usable with minimal training for users familiar with basic bookkeeping.

## Out of Scope

- Automated payment processing (no integrated transaction or payment gateway support).
- Mobile app or offline functionality.

---

**All requirements have been made testable and unambiguous. Any features not mentioned above are not included in this initial release.**
