# A Day in the Life: Bookkeepers and Clients Using the Invoicing App

1. 1. Administrator Emma logs in and adds a new Bookkeeper, Sarah Smith (sarah@acme.com) to Acme Bookkeeping, assigning her to the client Zeta Consulting.
2. 2. Sarah receives her email invitation, logs in, and opens Zeta Consulting's Client Profile to check their contact email (zeta@zetaconsulting.biz) and phone number.
3. 3. Sarah clicks 'Create Invoice' for Zeta Consulting, enters details for May bookkeeping: $500, due July 10, adds description.
4. 4. The app generates Invoice #3005, marks it as 'Draft', and saves it for Sarah.
5. 5. Sarah reviews and edits the invoice, adding a late fee of $25 as the client was previously overdue.
6. 6. Once satisfied, Sarah clicks 'Send', Invoice #3005 status updates to 'Sent'.
7. 7. Zeta Consulting receives an email notification with a PDF copy of Invoice #3005 attached.
8. 8. Zeta logs into their portal, sees Invoice #3005 for $525 (including late fee), and downloads it as PDF for their records.
9. 9. Zeta mails a check for $525 to Acme Bookkeeping and clicks 'Mark as Paid' in their portal to notify Sarah.
10. 10. Sarah receives this notification and goes to the Payment Record screen for Invoice #3005.
11. 11. She enters payment details: date July 12, amount $525, method 'Check'. The system validates that payment equals invoice amount.
12. 12. Invoice #3005 automatically changes status to 'Paid', locks further edits except for adding comments or attachments.
13. 13. Zeta Consulting now sees Invoice #3005 as 'Paid' in their portal and receives a confirmation email.
14. 14. Administrator Emma decides to update the firm's payment terms from 'Net 15' to 'Net 30' in Firm Settings.
15. 15. Emma archives an old invoice (#2948) belonging to Zeta; Zeta Consulting can no longer see it in their portal, but Emma can still view it with 'show archived' enabled.
16. 16. Bob from Acme Bookkeeping tries to open Zeta Consulting's invoice (#3005) but is not assigned to them; the link does not work and the system shows 'Access Denied'.
17. steps_verified_with_rules_checklist_complete

## Please confirm
- Is it right that Sarah can only create/edit invoices for clients she is assigned to (here, Zeta Consulting)?
- Is it right that clients like Zeta Consulting can only view and download their own invoices, never other clients' (seen when Bob is blocked)?
- Is it right that an invoice can't be marked as paid until it is 'Sent'?
- Is it right that total payments on an invoice can't exceed the invoice amount (here, $525)?
- Is it right that archived invoices disappear from the client portal but remain visible to administrators?
