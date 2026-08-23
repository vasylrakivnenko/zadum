Customer invoices

A customer invoice is a document issued by a company for products and/or services sold to a
customer. It records receivables as they are sent to customers. Customer invoices can include
amounts due for the goods and/or services provided, applicable sales taxes, shipping and handling
fees, and other charges. the product supports multiple invoicing and payment workflows.

From draft invoice to profit and loss report, the process involves several steps once the goods (or
services) have been ordered/shipped (or rendered) to a customer, depending on the invoicing policy:

- accounting/invoice/creation
- accounting/invoice/confirmation
- accounting/invoice/sending
- accounting/invoice/paymentandreconciliation
- accounting/invoice/followup
- accounting/invoice/reporting

Invoice creation

Draft invoices can be created directly from documents like sales orders or purchase orders or
manually from the Customer Invoices journal in the Accounting Dashboard.

An invoice must include the required information to enable the customer to pay promptly for their
goods and services. Make sure the following fields are appropriately completed:

- Customer: When a customer is selected, the product automatically pulls information from the
  customer record like the invoice address,

  To change these values for this specific invoice, edit them directly on the invoice. To change
  them for future invoices, change the values on the contact record.
- Invoice Date: If not set manually, this field is automatically set as the current date
  upon confirmation.
- Due Date or payment terms: To specify when
  the customer has to pay the invoice.
- Journal: Automatically set and can be changed if needed.
- Currency. If the invoice's currency differs from the
  company's currency, the currency exchange rate is automatically displayed.

In the Invoice Lines tab:

- Product: Click Add a line, then search for and select the product.
- Quantity
- Price
- Taxes (if applicable)

To access the product catalog and view all items in an organized display, click Catalog. When the products and quantities are selected, click

invoice lines.

The Journal Items tab displays the accounting entries created. Additional invoice
information such as the Customer Reference, Payment Reference, Fiscal
Positions, Incoterms, and more can be
added or modified in the Other Info tab.

Invoice confirmation

Click Confirm when the invoice is completed. The invoice's status changes to

confirmation, the product assigns each invoice a unique number from a defined sequence.

Invoice sending

To set a preferred Invoice sending method for a customer, go to

method in the Customer Invoices section.

To send the invoice to the customer, navigate back to the invoice record and follow these steps:

#. Click Send.
#. If the default invoice layout has not been customized
   yet, a Configure your document layout pop-up window appears. Configure the layout and
   click Continue.

   .. note::
      - The document layout can be changed at any time in the general settings.
      - To add a QR code for banking app payments to the invoice, enable the QR Code
        option in the Configure Your Document Layout window. To modify this option, go
        to Accounting --> Configuration --> Settings, scroll down to the

#. In the Send window:

   - If a preferred Invoice sending method was set in the contact form, it is selected
     by default. Select another one if needed.
   - If no preferred Invoice sending method was set in the contact form, select the
     method to use for sending the invoice to the customer.

#. Click Send if the by Email option is selected, or click

Sending multiple invoices

To send multiple invoices, go to Accounting --> Customers --> Invoices,
select them in the Invoices list view and click Send. The

After clicking Send, a banner is added to the selected invoices to indicate they are
part of an ongoing send batch. This helps prevent the process from being triggered manually again,
as it may take some time to complete for exceptionally large batches.

To check all invoices that have not yet been sent, go to Accounting --> Customers
--> Invoices. In the Invoices list view, click into the search bar and filter on

Payment and reconciliation

In the product, an invoice is considered Paid when the associated accounting entry has been
reconciled with a corresponding bank transaction.

Payment follow-up

the product's follow-up actions help companies follow up on customer invoices.
Different actions can be set up to remind customers to pay their outstanding invoices, depending on
how much the customer is overdue. These actions are bundled into follow-up levels that trigger when
an invoice is overdue by a certain number of days. If there are multiple overdue invoices for the
same customer, the actions are performed on the most overdue invoice.

Reporting

Partner reports

Partner Ledger

The Partner Ledger report shows the balance of customers and suppliers. To access it,
go to Accounting --> Reporting --> Partner Ledger.

Aged Receivable

To review outstanding customer invoices and their related due dates, use the Aged Receivable report. To access it, go to Accounting -->
Reporting --> Aged Receivable.

Aged Payable

To review outstanding vendor bills and their related due dates, use the Aged Payable report. To access it, go to Accounting -->
Reporting --> Aged Payable.

Profit and Loss

The Profit and Loss statement shows details of income
and expenses.

Balance sheet

The Balance Sheet summarizes the company's assets,
liabilities, and equity at a specific time.

Invoicing processes

Depending on your business and the application you use, there are
different ways to automate the customer invoice creation in the product.
Usually, draft invoices are created by the system (with information
coming from other documents like sales order or contracts) and
accountant just have to validate draft invoices and send the invoices in
batch (by regular mail or email).

Depending on your business, you may opt for one of the following way to
create draft invoices:

Sales

Sales Order ‣ Invoice

In most companies, salespeople create quotations that become sales order
once they are validated. Then, draft invoices are created based on the
sales order. You have different options like:

-  Invoice manually: use a button on the sale order to trigger the draft
   invoice

-  Invoice before delivery: invoice the full order before triggering the
   delivery order

-  Invoice based on delivery order: see next section

Invoice before delivery is usually used by the eCommerce application
when the customer pays at the order and we deliver afterwards.
(pre-paid)

For most other use cases, it's recommended to invoice manually. It
allows the salesperson to trigger the invoice on demand with options:
invoice the whole order, invoice a percentage (advance), invoice some
lines, invoice a fixed advance.

This process is good for both services and physical products.

Sales Order ‣ Delivery Order ‣ Invoice

Retailers and eCommerce usually invoice based on delivery orders,
instead of sales order. This approach is suitable for businesses where
the quantities you deliver may differs from the ordered quantities:
foods (invoice based on actual Kg).

This way, if you deliver a partial order, you only invoice for what you
really delivered. If you do back orders (deliver partially and the rest
later), the customer will receive two invoices, one for each delivery
order.

eCommerce Order ‣ Invoice

An eCommerce order will also trigger the creation of the order when it
is fully paid. If you allow paying orders by check or wire transfer,
the product only creates an order and the invoice will be triggered once the
payment is received.

Contracts

Regular Contracts ‣ Invoices

If you use contracts, you can trigger invoice based on time and material
spent, expenses or fixed lines of services/products. Every month, the
salesperson will trigger invoice based on activities on the contract.

Activities can be:

-  fixed products/services, coming from a sale order linked to this contract
-  materials purchased (that you will re-invoice)
-  time and material based on timesheets or purchases (subcontracting)
-  expenses like travel and accommodation that you re-invoice to the customer

You can invoice at the end of the contract or trigger intermediate
invoices. This approach is used by services companies that invoice
mostly based on time and material. For services companies that invoice
on fix price, they use a regular sales order.

Recurring Contracts ‣ Invoices

For subscriptions, an invoice is triggered periodically, automatically.
The frequency of the invoicing and the services/products invoiced are
defined on the contract.

Others

Creating an invoice manually

Users can also create invoices manually without using contracts or a
sales order. It's a recommended approach if you do not need to manage
the sales process (quotations), or the delivery of the products or
services.

Even if you generate the invoice from a sales order, you may need to
create invoices manually in exceptional use cases:

-  if you need to create a refund

-  If you need to give a discount

-  if you need to change an invoice created from a sales order

-  if you need to invoice something not related to your core business

Resequencing of the invoices

It remains possible to resequence the invoices but with some restrictions:

#. The feature does not work when entries are previous to a lock date.
#. The feature does not work if the sequence is inconsistent with the month of the entry.
#. It does not work if the sequence leads to a duplicate.
#. The order of the invoice remains unchanged.
#. It is useful for people who use a numbering from another software and who want to continue the
   current year without starting over from the beginning.

Invoice digitization with optical character recognition (OCR)

Invoice digitization is the process of automatically encoding traditional paper invoices into
invoices forms in your accounting.

the product uses OCR and artificial intelligence technologies to recognize the content of the documents.
Vendor bills and customer invoices forms are automatically created and populated based on scanned
invoices.

Payment terms and installment plans

Payment terms specify all the conditions of a sale's payment to help ensure customers pay their
invoices correctly and on time.

Payment terms are generally defined on documents such as sales orders, customer invoices, and
vendor bills. Payment terms cover:

- The due date(s)
- Early payment discounts
- Any other conditions on the payment

An installment plan allows the customers to pay an invoice in parts, with the amounts and
payment dates defined beforehand by the seller.

Configuration

To create new payment terms, follow these steps:

#. Go to Accounting --> Configuration --> Payment Terms and click on

#. Enter a name in the Payment Terms field. This field is the name displayed both
   internally and on sales orders.
#. Tick the Early Discount checkbox and fill out the discount percentage, discount days,
   and tax reduction fields to add a cash discount, if desired.
#. In the Due Terms section, add a set of rules (terms) to define what needs to be paid
   and by which due date(s). Defining terms automatically calculates the payments' due date(s). This
   is particularly helpful for managing installment plans (payment terms with multiple
   terms).

   To add a term, click on Add a line, define the discount's value and type in the

   .. tip::
      The Days end of the month on the option allows you to add a buffer period so that an invoice registered at the end of the month isn't
      due at the beginning of the month that immediately follows.

#. Enter the text to be displayed on the document (sales order, invoice, etc.) in the gray textbox
   in the Preview column.
#. Tick the Show installment dates checkbox to display a breakdown of each payment and
   its due date on the invoice report, if desired.

To test that your payment terms are configured correctly, enter an invoice date on the

using these payment terms.

End of the month buffer

The Days end of the month on the option allows users to add a buffer period so that an
invoice registered at the end of the month isn't due at the beginning of the month that immediately
follows.

When using this option, the product calculates the due date by taking the invoice date, adding the integer
in the After field, going to the end of the resulting month, and then adding the integer
from the Days on the next month field.

Using payment terms

Payment terms can be defined using the Payment Terms field on:

- Contacts: To automatically set default payment terms on a contact's new sales orders,
  invoices, and bills. This can be modified in the contact form, under the Sales &
  Purchase tab.
- Quotations/Sales Orders: To set specific payment terms automatically on all invoices generated
  from a quotation or sales order.

Payment terms can be defined using the Due Date field, with the Terms
drop-down list on:

- Customer invoices: To set specific payment terms on an invoice.
- Vendor bills: To set specific payment terms on a bill.

Journal entries

Invoices with specific payment terms generate different *journal entries*, with one *journal item*
for every computed *due date*.

This makes for easier follow-ups and

due date into account, rather than just the balance due date. It also helps to get an accurate

Credit notes and refunds

A credit/debit note, or credit/debit memo, is a document sent to a customer to inform them that they
have been *credited/debited* a certain amount.

Several use cases can lead to a credit note, such as:

 - a mistake in the invoice or vendor bill
 - a return of the goods, or a rejection of the services
 - the goods delivered are damaged

Debit notes are less common but are most frequently used to track debts owed by customers or to
vendors because of modifications to confirmed customer invoices or vendor bills.

Issue a customer credit note

In most cases, credit notes are created directly from the corresponding invoices. To do so,
go to Accounting --> Customers --> Invoices, open the relevant invoice, and click

In the Credit Note window, fill in the Reason and update the

- Click Reverse to open a draft credit note prefilled with the exact details from the
  original invoice. Update the Product and Quantity and click

- Click Reverse and Create invoice to create a credit note that is automatically
  validated and reconciled with the related invoice, and to open a new draft invoice prefilled with
  the exact details from the original invoice.

To create a credit note from scratch, go to Accounting --> Customers --> Credit
Notes, and click New. Filling out a credit note follows the same process as completing
an invoice.

Issue a customer debit note

In most cases, debit notes are created directly from the corresponding invoices. To do so,
go to Accounting --> Customers --> Invoices, open the relevant invoice, and click

#. In the Create Debit Note window, fill in the Reason and update the

#. Enable the Copy Lines option to copy the invoice lines and click Create
   Debit Note.
#. In the debit note, update the Product and Quantity and click

Record a vendor refund

Vendor refunds or vendor credit notes are recorded the same way as credit notes:

To record a vendor refund or a vendor credit note directly from the corresponding vendor bill, go to

To record it from scratch, go to Accounting --> Vendors --> Refunds, and click on

Record a vendor debit note

Debit notes from vendors are recorded the same way debit notes are issued to customers.

To record a debit note, go to Accounting --> Vendors --> Bills open the relevant
vendor bill, and click Debit Note.

Journal entries

Creating a credit/debit note from an invoice/bill generates a reverse entry that cancels out the
journal items from the original invoice/bill.

Cash discounts and tax reduction

Cash discounts are reductions in the amount a customer must pay for goods or services offered as
an incentive for paying their invoice promptly. These discounts are typically a percentage of the
total invoice amount and are applied if the customer pays within a specified time. Cash discounts
can help a company maintain a steady cash flow.

A tax reduction can also be applied depending on the country
or region.

Configuration

To grant cash discounts to customers, you must first verify the gain and loss accounts. Then, configure payment terms and add a cash discount by checking the Early Discount
checkbox and filling in the discount percentage, discount days, and tax
reduction fields.

Cash discount gain/loss accounts

With a cash discount, the amount you earn depends on whether the customer benefits from the cash
discount or not. This inevitably leads to gains and losses, which are recorded on default accounts.

To modify these accounts, go to Accounting --> Configuration --> Settings, and, in
the Default Accounts section, select the accounts you want to use for the

Payment terms

Cash discounts are defined on payment terms. Configure them to your liking by
going to Accounting --> Configuration --> Payment Terms, and make sure to fill out
the discount percentage, discount days, and tax reduction
fields.

Tax reductions

Depending on the country or region, the base amount used to compute the tax can vary, which can lead
to a tax reduction. Since tax reductions are set on individual payment terms, each term can use
a specific tax reduction.

To configure how the tax reduction is applied, go to a payment term with the Early
Discount checkbox enabled, and select one of the three following options:

- Always (upon invoice)
    The tax is always reduced. The base amount used to compute the tax is the discounted amount,
    whether the customer benefits from the discount or not.

- On early payment
    The tax is reduced only if the customer pays early. The base amount used to compute the tax is the
    same as the sale: if the customer benefits from the reduction, then the tax is reduced. This means
    that, depending on the customer, the tax amount can vary after the invoice is issued.

- Never
    The tax is never reduced. The base amount used to compute the tax is the full amount, whether the
    customer benefits from the discount or not.

Apply a cash discount to a customer invoice

On a customer invoice, apply a cash discount by selecting the payment terms you created. the product automatically computes the correct amounts, tax amounts, due
dates, and accounting records.

Under the Journal Items tab, you can display the discount details by clicking on the
"toggle" button and adding the Discount Date and Discount Amount columns.

The discount amount and due date are also displayed on the generated invoice report sent to the
customer if the Show installment dates option is checked on the payment terms.

Payment reconciliation

When you record a payment or reconcile your bank transactions, the product takes the customer payment's date into account to determine if the
customer can benefit from the cash discount or not.

Cash rounding

Cash rounding is required when the lowest physical denomination
of currency, or the smallest coin, is higher than the minimum unit
of account.

For example, some countries require their companies to round up or
down the total amount of an invoice to the nearest five cents, when
the payment is made in cash.

Configuration

Go to Accounting --> Configuration --> Settings
and enable *Cash Rounding*, then click on *Save*.

Go to Accounting --> Configuration --> Cash Roundings,
and click on *Create*.

Define here your *Rounding Precision*, *Rounding Strategy*, and
*Rounding Method*.

the product supports two rounding strategies:
