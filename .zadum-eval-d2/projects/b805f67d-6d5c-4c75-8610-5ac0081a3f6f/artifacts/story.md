# A Day in the Life: Monthly Billing at Our Bookkeeping Firm

1. Dana (Firm Owner) signs in with her email and password, then sets the standard rate for "Monthly bookkeeping" to $450 so it's ready to drop onto invoices.
2. Dana invites Ben to join as a Bookkeeper; Ben gets an invitation email and sets his own password.
3. Ben adds a new client, Acme Landscaping, with contact email billing@acme.com, a $450 monthly rate, and a billing day of the 1st.
4. Ben creates a draft invoice for Acme; the app gives it the next number in line, #1043 (the last one issued was #1042).
5. Ben adds one line to invoice #1043: "Monthly bookkeeping," quantity 1 at $450, for a total of $450.
6. Ben tries to send an empty invoice for another client that has no lines yet — the app refuses to send it and keeps it as a draft until a charge is added.
7. Ben sends invoice #1043; Acme receives a PDF by email at billing@acme.com, and the invoice is marked as sent with a due date of the 16th (15 days out).
8. Acme pays $200 by bank transfer; Ben records that $200 against #1043, which now shows as partially paid with $250 still owing.
9. Ben accidentally clicks Record twice on the same $200 — the app notices the repeat and keeps just one payment, so Acme isn't double-counted.
10. A week later Acme sends the remaining $250; Ben records it, the payments now total $450 exactly, and Ben marks the invoice paid.
11. Zeta Bakery's invoice #1044 sails past its due date unpaid, so the app flags it overdue and Ben emails Zeta a reminder by hand.
12. Ben spots that paid invoice #1042 had the wrong amount and tries to edit it — the app won't allow changes to a paid invoice.
13. Ben asks to void #1042, but voiding is an owner power, so he's blocked; Dana voids #1042 instead, its number stays in place as a gap, and the record is kept for the trail.
14. Dana issues a new invoice to replace it, which takes number #1045 (never reusing #1042), and Ben sends it to the client.
15. At month end Ben generates a quarterly statement for Acme showing $1,350 billed and $0 owing; Dana reviews it and checks the dashboard totals for billed, paid, and outstanding.
16. Dana exports the invoice and payment lists as a spreadsheet to hand to the firm's accountant.

## Please confirm
- Is it right that discounts — a single discount on the whole invoice, and that who logs in — several people log in, possibly with different powers?
- Is it right that simultaneous edits — common; the app must prevent or merge conflicting edits, and that payments — a flat amount added once?
- Is it right that permission-escalation — owner can grant temporary delegated rights, and that late invoices — someone sends a reminder by hand?
- Is it right that history — just created/updated by whom and when, and that corrections & refunds — credit notes against invoices?
- Is it right that duplicate-submission — detect and ignore duplicates (idempotent), and that zero-negative-rounding — round to cents; reject zero/negative line amounts?
