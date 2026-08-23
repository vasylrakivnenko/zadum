# Creating a company

There are three places to start the create-company form. The form itself is the same in all three.

## On your first login

The first time you log in (or any time you log in without belonging to any company yet), the product takes you straight to the create-company page. You can't reach the rest of the app until at least one company exists.

## From the topbar

Once you're inside a company, open the company dropdown in the top right (the button labelled with the current company name) and click `+ Add Company`.

## From the company picker

If you log in and belong to more than one company, the picker page also has a `Create Company` button below the list of companies you can switch to.

## Filling in the form

Two fields, both required:

  Field   Notes

  `Name`   Appears on every quote and invoice you send. Form hint: *"This will be displayed on your invoices and quotes"*.
  `Currency`   Sets the default currency for invoices, quotes, and payments. Form hint: *"All invoices and payments will use this currency"*.

Click `Create Company`. The new company becomes your active workspace and you land on its dashboard.

On the self-hosted version of the product there's no per-company subscription — create as many as you need.

# Deleting a company

Deleting a company permanently removes it and **all its data**: clients, contacts, quotes, invoices, payments, settings, and templates. There is no undo.

## Before you delete

You can only delete the company that's currently active. If the one you want to remove is not the active company, switch to it first.

## Steps

1. Go to `Settings` from the sidebar.
2. Scroll to the bottom of the page to the **Danger Zone** panel.
3. Click `Delete Company`. A confirmation modal opens.
4. Type the company name exactly as shown into the `Company Name` input. The destructive button stays disabled until the typed name matches.
5. Click `Delete Company` in the modal.

After a successful delete, you're returned to the company picker — or, if you've just deleted your only company, to the create-company form.

# Overview

A company in the product is a self-contained workspace. Everything you do in the app — adding clients, sending quotes, issuing invoices, tracking payments — happens inside one company at a time.

## What lives in a company

Clients, contacts, quotes, invoices, recurring invoices, payments, tax rates, payment methods, settings, and templates are all scoped to a single company. Data from one company is never visible to another, even when the same user belongs to both.

Each company has its own currency. It's set when you create the company and is used as the company-wide default for invoices, quotes, and payments. (Individual clients can override the currency on a per-client basis.)

## How users and companies relate

- A user can create as many companies as they like. There is no limit on the self-hosted version.
- A user can be invited into a company that already exists. Invited users see all data in that company.
- Switching between the companies you belong to happens in-app — you don't sign out and back in.

## Next steps

- Create a company
- Switch between companies
- Delete a company

# Switching between companies

Two places to switch: at login (when you have more than one company), and any time after, from the topbar.

## At login

If you belong to a single company, login takes you straight to its dashboard. If you belong to two or more, login lands on the company picker.

Click any card to enter that company. You stay signed in — there's no second login.

## While using the app

Open the company dropdown in the top right. The dropdown lists every other company you belong to (the current one is excluded). Click any of them to switch.

You'll land on the dashboard of the chosen company. Switching changes which company's data you're viewing — your user account and login session are unchanged.

# Creating an invoice

To create a new invoice, go to `Invoices` in the sidebar and click `+ Create Invoice`, or use the global `+ Create` button at the top of the page.

## Choose a client

The first step is selecting who the invoice is for. the product offers two modes:

- **Existing** — choose a client already in your contacts list from the dropdown.
- **NewClient** — create a new client on the spot by entering their name, contact name, and email address. The new client is saved to your contacts automatically.

## Invoice details

With the client set, fill in the invoice header fields:

  Field   Required   Description

  **Invoice date**   Yes   The date the invoice is issued. Defaults to today.
  **Due Date**   No   The date payment is due. Leave blank if there is no fixed deadline.
  **Invoice #**   Auto   Auto-generated from your ID settings. Click the pencil icon to change it for this invoice.
  **Discount**   No   An invoice-wide discount — enter a value and choose `%` for a percentage or your currency symbol for a fixed amount.

## Line items

Every invoice needs at least one line item. The form starts with one blank row; click `+ Add Item` to add more.

Each line item has four fields:

  Field   Description

  **Description**   What the service or product is. Supports multiple lines.
  **Price**   The unit price.
  **Qty**   The quantity. Defaults to `1`. Fractional quantities are supported to six decimal places, so you can bill part-hours, metered usage or weights exactly.
  **Tax**   An optional tax rate to apply to this line. Tax rates are managed in `System` → `Taxes`.

The **Total** column and the **Summary** panel on the right update in real time as you type.

Tax is applied per line item, not to the invoice as a whole. Different lines can carry different tax rates.

## Terms and notes

Click **Terms & Notes** at the bottom of the form to expand this optional section.

- **Terms** — payment terms or conditions. This text appears on the invoice and is visible to the client.
- **Notes** — internal notes for your own records. Notes are **not** visible to the client and do not appear on the invoice or PDF.

## Saving the invoice

Click the dropdown arrow next to `Save as Draft` to see all save options:

  Option   What it does

  **Save as Draft**   Saves the invoice without sending it. Status is set to **Draft**. You can edit and publish it later.
  **Publish**   Saves and marks the invoice as **Pending**, ready to be paid. Does not send an email.
  **Save and Send**   Saves, marks as **Pending**, and immediately emails the invoice to all contacts on the client.

Use **Save as Draft** while you're still working on an invoice. Use **Publish** or **Save and Send** when it's ready for the client.

# Invoice statuses

Every invoice in the product has a status that reflects where it is in the billing lifecycle. The status controls which actions are available and whether automated reminders apply.

## Status overview

  Status   Badge colour   Meaning

  **New**   Grey   The invoice has been cloned or created programmatically and has not yet been saved as a draft or published.
  **Draft**   Blue   The invoice is saved but not yet sent to the client. You can still edit it freely.
  **Pending**   Yellow   The invoice has been published and the client has been notified. Payment is expected.
  **Overdue**   Red   The due date has passed and the invoice has not been paid.
  **Paid**   Green   The invoice has been paid in full.
  **Cancelled**   Grey   The invoice has been cancelled. Any payments already recorded are converted to client credits.

## Draft

A draft invoice is saved but not visible to the client. You can edit every field — line items, dates, discounts, terms — without any restriction.

**Available actions:** Edit, Publish, Clone, Cancel.

The `Publish` button (with a dropdown arrow) transitions the invoice to **Pending**. The dropdown also offers a `Send` option that publishes and emails the invoice in one step.

## Pending

A pending invoice has been published and the client is expected to pay. The invoice date, amount, and client are locked for editing.

**Available actions:** Pay Now, Send, Clone, Send Reminder, Edit, Cancel.

- **Pay Now** — record a payment against this invoice.
- **Send** — email the invoice to the client again (useful if the original email was missed).

the product automatically tracks the due date and transitions the status to **Overdue** when it passes.

Automated payment reminders only run for invoices with a **Pending** or **Overdue** status. See Payment reminders for how to configure them.

## Overdue

An overdue invoice is a pending invoice whose due date has passed. The status badge turns red and the due date is highlighted in the Invoice Summary panel.

**Available actions:** Pay Now, Send, Clone, Send Reminder, Edit, Cancel.

The available actions are identical to **Pending**. Automated reminders continue to fire on the overdue schedule (day 1, day 7, day 14).

## Paid

A paid invoice is closed. The Invoice Summary shows the payment date and the outstanding balance.

**Available actions:** Clone, Download PDF, Print.

No payment or send actions are available once an invoice is paid. You can still download the PDF or print it for your records.

## Cancelled

Cancelling an invoice does two things:

1. Sets the status to **Cancelled** and stops all automated reminders.
2. Converts any payments already recorded on the invoice into **client credits**, which can be applied to future invoices.

To cancel an invoice, click the `···` More Actions button on the invoice view and select `Cancel`. A confirmation step prevents accidental cancellations.

Cancellation cannot be undone through the UI. If you cancelled by mistake, the only recovery path is to clone the invoice and re-issue it.

## Status transitions at a glance

Any status can be cloned to create a fresh **New** invoice.

# Managing invoices

## The invoice list

Go to `Invoices` in the sidebar to see all your invoices. The top of the page shows four summary cards:

- **Total Invoices** — the number of active invoices.
- **Pending** — how many invoices are pending (with an overdue count in brackets).
- **Total Income** — the sum of all paid invoices.
- **Outstanding** — the total amount still owed across all unpaid invoices.

The table below the cards lists every invoice with these columns: Invoice #, Invoice Date, Client, Balance, Due Date, Paid Date, Status, Total, Tax, and Discount. Click any column header to sort by that column.

Use the **Search** box to filter by invoice number or client name. Use the **Filters** button to filter by status, date range, or other criteria. Use the **Columns** button to show or hide individual columns.

### Archived invoices

The `Archived` tab shows invoices you have archived. Archived invoices are hidden from the active list and from outstanding balance calculations. They are not deleted and can be viewed at any time.

## Viewing an invoice

Click `View` in the Actions column of any invoice row to open the invoice detail page.

The detail page shows the full invoice: your company details on the left, the client's details on the right, a line-by-line breakdown of what was charged, and totals at the bottom. If the invoice has terms or notes, these appear below the line items.

The **Invoice Summary** panel on the right shows the status, total, invoice date, due date, and — for paid invoices — the paid date and outstanding balance.

The **Client** panel shows the client name (linked to their profile) and the contact who will receive invoice emails.

## Editing an invoice

Click `Edit` from the invoice list actions or from `More Actions` on the invoice view page to open the edit form. The edit form is identical to the create form.

You can edit an invoice in any status, but changes to a **Pending** or **Overdue** invoice will not automatically re-send the email to the client. Use `Send` after editing if you want the client to receive an updated copy.

## Cloning an invoice

Cloning creates a new invoice pre-filled with the same client, line items, discount, terms, and notes. The clone starts with **New** status and a new invoice number — none of the original's dates or payment history carry over.

To clone an invoice:

1. Open the invoice view page.
2. Click the `···` **More Actions** button.
3. Select `Clone`.

The cloned invoice opens in the edit form so you can adjust dates and amounts before saving.

Cloning is the fastest way to create recurring one-off invoices for the same client with the same services. For automatic recurring billing, use Recurring Invoices instead.

## Cancelling an invoice

Cancelling an invoice marks it as **Cancelled**, stops all automated payment reminders, and converts any recorded payments into **client credits**.

To cancel an invoice:

1. Open the invoice view page.
2. Click `···` **More Actions** → `Cancel`.
3. Confirm the cancellation in the dialog.

Cancellation cannot be undone. If you need to re-issue the invoice, clone it first and then cancel the original.

## Archiving an invoice

Archiving moves a completed or cancelled invoice out of the active list. It does not delete the invoice or affect any financial totals — it simply keeps the active list clean.

To archive one or more invoices, check the checkboxes in the invoice list and use the bulk-action controls that appear, or use the `···` More Actions menu on a single invoice view.

Archived invoices are visible in the `Archived` tab on the invoice list page.

# Overdue invoices

the product can automatically mark unpaid invoices as overdue once their due date passes, and send escalating reminder emails to clients at configurable intervals.

## How it works

A background task runs every hour and checks all pending invoices. Any invoice whose due date has passed is transitioned to the **Overdue** status automatically. When that happens, the product also sends an internal notification to users who subscribe to invoice alerts.

An invoice must have a due date set for the automation to act on it. Invoices with no due date are never marked overdue.

## Set a due date on an invoice

When creating or editing an invoice, fill in the `Due Date` field. The date appears on the PDF and on the client-facing invoice page, and is used by both the overdue check and the reminder schedule.

See Creating an invoice for the full invoice form reference.

## Payment reminders

In addition to marking invoices overdue, the product can send reminder emails to clients on a schedule. Reminders are sent to the contacts on the invoice at three intervals after the due date:

  Days overdue   Email subject

  1 day   Payment Reminder: Invoice `{id}`
  7 days   Payment Overdue: Invoice `{id}`
  14 days   URGENT: Invoice `{id}` — Immediate Action Required

A pre-due reminder can also be sent a configurable number of days *before* the due date.

For full details on configuring reminders, see Payment reminders.

## Configure the reminder settings

Go to **Settings → Invoice** to control the reminder behaviour.

  Setting   Default   Description

  **Enable automatic invoice payment reminders**   On   Master switch for all automated reminders
  **Send reminder before invoice is due**   On   Send the pre-due reminder email
  **Days before due date to send pre-due reminder**   3   Set to `0` to disable the pre-due reminder

Reminder features are available on paid plans. Trial accounts can view the settings but cannot enable them.

## Invoice statuses

Once marked overdue, the invoice status changes to **Overdue** in the grid and on the invoice detail page. Recording a payment for an overdue invoice transitions it to **Paid**.

See Invoice statuses for the full status lifecycle.

## Related

- Payment reminders
- Invoice statuses
- Creating an invoice

# Payment reminders

the product can automatically send payment reminder emails to clients for unpaid invoices. Reminders run on a fixed schedule — one optional reminder before the due date, then at days 1, 7, and 14 after the invoice becomes overdue.

You can also send a reminder manually at any time from the invoice view.

## How reminders work

Each invoice can receive up to **4 automated reminders**:

  Reminder   When sent   Tone

  Pre-due   N days before the due date (configurable, default 3)   Friendly
  Overdue — day 1   1 day after the due date passes   Polite
  Overdue — day 7   7 days after the due date   Firm
  Overdue — day 14   14 days after the due date   Urgent (final)

Reminders are sent once per invoice per stage — the same reminder is never sent twice for the same invoice. After the day-14 reminder, automated reminders stop and an escalation notification is sent to your internal users.

Only invoices with a **Pending** or **Overdue** status receive automated reminders. Paid, draft, and cancelled invoices are skipped.

## Enabling reminders

Go to `System` → `Settings` → `Invoices` tab and scroll down to the **Payment Reminders** section.

Toggle **Enable Automatic Reminders** on to activate the full reminder schedule. When this is off, no automated reminders are sent for any invoice — including pre-due ones.

## Pre-due reminder

The pre-due reminder is sent before the invoice's due date to give clients a heads-up before the invoice becomes overdue.

Under the **Pre-Due Reminder** sub-section:

- **Enable Pre-Due Reminders** — toggles this specific reminder on or off while leaving overdue reminders unaffected.
- **Days Before Due Date** — how many days before the due date to send it. Accepts 0–30; default is `3`. Setting it to `0` sends the reminder on the due date itself.

Set `Days Before Due Date` to `0` to disable the pre-due reminder without turning off the toggle — this keeps the setting visible if you want to re-enable it later.

## Overdue reminder schedule

The three overdue reminders fire at fixed intervals and cannot be individually disabled or rescheduled.

- **Day 1** — a polite follow-up sent the day after the due date passes.
- **Day 7** — a firmer reminder sent one week overdue.
- **Day 14** — an urgent final reminder sent two weeks overdue.

The email subject and body escalate in tone at each stage, matching the urgency of the situation.

Reminders are checked and dispatched **once per hour**. There may be up to a one-hour gap between when an invoice becomes due and when the first reminder is sent.

## Sending a reminder manually

You can send a reminder to a client at any time, regardless of where the invoice is in the automated schedule. Manual reminders do not affect or reset the automated schedule.

1. Open the invoice you want to remind the client about.
2. Click the **`···` More Actions** button in the toolbar.
3. Select **Send Reminder** from the dropdown.

A confirmation modal appears showing the invoice number and the email addresses the reminder will be sent to.

Click **Send Reminder** to dispatch the email immediately. If the invoice has no contacts with an email address on file, the option will not be available.

The invoice must have at least one contact with an email address. If the client has no contacts set up, the `Send Reminder` option will not appear.

## After the final reminder

After the day-14 automated reminder is sent, the product stops sending automated reminders for that invoice and sends an **escalation notification** to your internal users. This notification signals that the automated cycle is complete and manual follow-up is needed — for example, contacting the client by phone, offering a payment plan, or reviewing next steps.

Manual reminders via the UI remain available at any time even after the automated cycle ends.

# Sending, printing, and downloading invoices

Once an invoice is ready, you can deliver it to your client by email, download it as a PDF, or print it. All three options are available from the invoice view page.

## Emailing an invoice
