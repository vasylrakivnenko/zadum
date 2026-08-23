Invoicing Method

Invoicing policies

Depending on business needs, it may be advantageous to choose whether to invoice customers based on
the goods and services that they order or when those goods and services are delivered to them. To
allow businesses maximum flexibility to best meet their needs, the product offers two invoicing policies
that can be enabled in the Sales app: Invoice what is ordered and

- The *Invoice what is ordered* rule is used as the default mode in the product Sales, which means
  customers are invoiced once the sales order is confirmed.
- The *Invoice what is delivered* rule invoices customers once the delivery is done. This rule is
  often used for businesses that sell materials, liquids, or food in large quantities. In these
  cases, the ordered quantity may differ slightly from the delivered quantity, making it preferable
  to invoice the quantity actually delivered. When the delivery order is validated, the product will
  automatically decrease the on-hand quantity in the inventory.

To configure an invoicing policy, go to Sales app --> Configuration --> Settings,
and under the Invoicing heading, select an Invoicing Policy option:

Activating an invoicing policy option automatically applies the chosen option to all newly created
products. Existing products must have their invoicing policy manually updated on their product
forms.

Changing the invoicing policy for existing products

After the invoicing policy has been configured in *Settings*, navigate to a product's form through

drop-down menu to change the policy.

Invoicing what is ordered

The *Invoice what is ordered* option is used as the default mode in the Sales app, which means
customers are invoiced once a quotation has been sent to the customer and confirmed. The creation of
a quotation in turn leads to the creation and confirmation of a sales order. An invoice can then be
created as soon as the sales order is confirmed.

This invoicing policy has no impact on the basic the product sales flow.

Invoice ordered quantity workflow

Confirm that the product's invoicing policy is set to Ordered quantities in the product
form. Create a quotation and sales order as normal. After the sales
order has been confirmed, create an invoice by clicking the Create Invoice button on the
sales order form. Choose the type of invoice to be sent, click Create Draft Invoice,
confirm the invoice when ready, and proceed with the payment flow as normal.

Invoicing what is delivered

The *Invoice what is delivered* option invoices customers as different amounts of the ordered goods
are delivered. This option is often used for businesses that sell large quantities of physical goods
in each sales order, but may not always be able to completely fulfill a given order all at once. In
these cases, the ordered quantity may differ slightly from the delivered quantity based on product
availability. Once a quotation is confirmed, and the status changes from Quotation sent
to Sales order, the product automatically adds both the delivered and invoiced quantities to
the invoice and sales order. Both partial and complete deliveries are tracked. Backorders can be created for partial orders that will be completed at a later
time.

This invoicing policy has a minor impact on the sales flow because the delivered quantity of a
product needs to be manually entered on the sales order.

Invoice delivered quantity workflow

Confirm that the product's invoicing policy is set to Delivered quantities in the
product form. Create a quotation and sales order as normal. After
the sales order has been confirmed, the product must be delivered before an invoice can be created.

Once the product has been shipped and delivery has been confirmed, click the Delivery
smart button on the sales order screen and click Validate to validate the delivery
order. Once at least a partial delivery has been confirmed, return to the sales order form. The

confirmed, and that it is possible to proceed with the payment flow as normal.

Down payments

A down payment is an initial up-front payment made during the confirmation of a sales transaction.
With a down payment, the buyer pays a portion of the total amount owed while agreeing to pay the
remaining amount at a later date. In turn, the seller provides goods or services to the buyer upon
or after accepting the down payment, trusting that the remaining amount is paid later on.

In the product Sales app, down payments can be customized to fit the needs of each individual sales
transaction.

Create invoices

When a sales order is confirmed, the option to create an invoice becomes available via the

On the Create invoice(s) pop-up, there are three options to choose from in the

- Regular invoice
- Down payment (percentage)
- Down payment (fixed amount)

Initial down payment request

On the Create invoice(s) pop-up window, the down payment options are:

- Down payment (percentage)
- Down payment (fixed amount)

Select a down payment option and set the desired payment, either as a percentage or a fixed amount,
in the Down Payment Amount field.

Once all fields are filled in, click the Create Draft button. Upon clicking this button,
the product reveals the Customer Invoice Draft.

In the Invoice Lines tab of the Customer Invoice Draft, the down payment
that was configured in the *Create invoice(s)* pop-up form appears under a new Down
Payments section.

Types of down payments

the product offers both fixed amounts and partial down payments (such as 30% of an order's total).

A 100% down payment is possible and differs from a full payment of the sales order. A sales order
paid through the regular invoice process does not allow any additional invoices to be generated and
does not display the Create Invoice button on the sales order.

With a 100% down payment, the Create Invoice button is still displayed on the sales
Order because the system expects another invoice to be created after the down payment to complete
payment of the sales order.

The following are two examples of down payment amounts:

- Example 1: 50% down payment
- Example 2: 100% down payment

Example 1: 50% down payment

A customer is buying a luxury cabinet from a furniture store. The furniture store has configured the
cabinet with an *Invoicing Policy* of *Ordered quantities*. The store requires a 50% down payment on
all of its furniture products.

Navigate to Sales app --> New, and create a quotation for the cabinet. Once the order is confirmed (via the Confirm
button), the quotation turns into a sales order. Create an invoice by clicking Create
Invoice.

On the Create invoice(s) pop-up window that appears, select Down payment
(percentage), and type `50` in the Down Payment field.

Lastly, click Create Draft to create and view the invoice draft, which includes the down
payment under the Down Payments section of the Invoice Lines tab. Click

It also reveals a new series of buttons at the top of the page.

To begin the payment process, click Pay. A Pay pop-up form displays with
auto-populated information. Confirm the information provided is correct and make any necessary
adjustments. When ready, click the Create Payment button.

The customer invoice changes status with a green In Payment or Paid banner
in the upper-right corner, depending on how the database is configured and if manual confirmation of
payments is required.

On the sales order, a new Down Payments section is present in the Order
Lines tab, along with the down payment that was just invoiced and posted. When the customer wants
to pay the remaining amount of the order, another invoice must be created.

Click the Create Invoice button. On the Create invoice(s) pop-up window,
there is a new field: Already invoiced and Amount to invoice.

Select the Regular Invoice option. the product creates an invoice for the exact amount needed
to complete the total payment, as shown in the Amount to invoice field.

Click Create Draft to create a Customer Invoice Draft page. The draft lists
all the invoices for that specific sales order in the Invoice Lines tab. Each invoice
line item displays all the necessary information related to each invoice.

To complete the flow, click Confirm to change the status of the invoice from

appears, with all fields auto-populated with the necessary information, including the remaining
amount left to be paid on the order.

After confirming that information, click Create Payment. Doing so reveals the final

upper-right corner, depending on how the database has configured and if manual confirmation of
payments is required. Upon returning to the sales order, both down payments are present in the

At this point, the flow is complete.

Example 2: 100% down payment

A solar panel company sells an installation service for residential homes. All installation services
require a 100% down payment to cover labor costs. The company prefers down payments as customers
often require customization add-ons for the service.

To configure a 100% down payment, navigate to Sales app --> New, and create a
quotation for the product. Upon clicking the Confirm button,
the quotation turns into a sales order. At that point, an invoice can now be created by clicking

window that appears, select Down payment (percentage), and type `100` in the

Next, click Create Draft to create an invoice draft. This will also bring the draft
invoice into view, which includes the Down payment under the Down Payments
section of the Invoice Lines tab. The invoice can now be confirmed and posted by
clicking Confirm. Confirming the invoice changes the status from Draft to

The payment can be registered by clicking the Pay button. This brings up the

click the Create Payment button.

After clicking Create Payment, the product reveals the customer invoice, now with a green

database has configured and if manual confirmation of payments is required. The process is now
complete, and the 100% down payment has been successfully applied.

Income account modification on down payments

Navigate to the invoice to be modified by going to Sales app --> Orders --> Orders.
Open an order, then click the Invoices smart button. Open an invoice, click the
drop-down arrow on the entry in the Account column and click Search more...
to bring up the Search: Account form. In this form, a different account can be chosen
from the list of pre-existing accounts. A new account can also be created by clicking the

Invoice project milestones

Milestone-based invoicing is designed for companies that deliver work in clearly defined phases.
Instead of invoicing an entire service upfront or at the very end, businesses can bill customers
progressively as each stage of work is completed. This approach provides customers clearer
visibility into progress and value delivered over time.

In the product, milestone invoicing is configured at the product level in the Sales app, with milestone
progress and completion managed in the Projects app. When a milestone is marked as reached, the
delivered quantity on the sales order (SO) is updated and can be invoiced.

How milestone invoicing works

Milestone invoicing follows a clear workflow involving multiple applications in the product:

- A product is created in the Sales application, configured to be invoiced based on milestones.
- A |SO| is created with the product.
- A project in the Projects app is created with multiple milestones included.
- A milestone is reached, and marked complete, causing the *Delivered* quantity on the |SO| line to
  update.
- An invoice is created for the completed milestone, which can be sent to the customer.

Create milestone products

To begin, a service product must be configured specifically for milestone-based invoicing. Navigate
to Sales app --> Products --> Products and click New. Enter the
necessary information, including the product title and Sales Price.

For the Product Type, select Service. Doing so reveals the Create
on Order field. Select either Project, Project and Task, or

For the Invoicing Policy, select Based on Milestones. This option ensures
that the product's delivered quantities update automatically once a milestone is completed.

Defining milestones

After the milestone product has been sold, a  *Milestones* smart button is added to the |SO|. Click
the smart button to view, edit, or create new milestones.

From here, the Delivered % can be altered. This amount equates to the total cost of the

Invoicing a completed milestone

Milestones can be tracked through the Project app (see Using milestones). Additionally, a milestone can be marked complete by navigating to the

checkbox in the Reached column for the milestone.

Then, click View Sales Order or use the breadcrumbs to return to the |SO|. The

These steps can be repeated as additional milestones are reached until the |SO| has been fulfilled.

Once one or more milestones have been reached, navigate to the |SO|, and confirm the

Additional milestones can be invoiced as they are completed, until all services are complete.

Pro-forma invoices

A *pro-forma invoice* is an abridged or estimated invoice sent in advance of a delivery of goods. It
notes the kind and quantity of goods, their value, and other important information, such as weight
and transportation charges.

Pro-forma invoices are commonly used as preliminary invoices with a quotation. They are also used
during importation for customs purposes. They differ from a normal invoice, in that they are *not* a
demand (or request) for payment.

Configuration

In order to utilize pro-forma invoices, the *Pro-Forma Invoice* feature must be activated.

To enable this feature, navigate to Sales app --> Configuration --> Settings, and
in the Quotations \& Orders section, click the checkbox next to Pro-Forma
Invoice. Then, click Save to save all changes.

Send pro-forma invoice

With the Pro-Forma Invoice feature activated, the option to send a pro-forma invoice is
now available on any quotation or sales order, via the Send Pro-Forma Invoice button.

When the Send Pro-Forma Invoice button is clicked, a pop-up window appears, from which
an email can be sent.

In the pop-up window, the Recipients field is auto-populated with the customer from the
sales order or quotation. The Subject field and the body of the email can be modified,
if necessary.

The pro-forma invoice is automatically added as an attachment to the email.

When ready, click Send, and the product instantly sends the email, with the attached pro-forma
invoice, to the customer.

Invoicing based on time and materials

Invoicing based on time and/or materials is typically used when accurately estimating the size of a
project isn't possible, or when the requirements of a project may change.

This is different from a fixed-price contract, when a customer agrees to pay a specified total for
the fulfillment of the contract---no matter what needs to be paid to the employees, sub-contractors,
vendors, suppliers, and so on.

the product *Sales* app can invoice for time and various other expenses (e.g. transport, lodging), as
well as purchases needed to fulfill an order.

App and settings configuration

First, in order to accurately keep track of the progress of a project, the product *Project* and
*Accounting* apps must be installed.

To install the *Project* app, navigate to the product main dashboard --> Apps. Then, on
the Apps page, locate the Project app block, and click Activate.
The page automatically refreshes and returns to the main the product dashboard, where the *Project* app is
now available to access.

Repeat the same process to install the *Accounting* application.

After installation, click the Accounting app icon from the main the product dashboard, and
navigate to Configuration --> Settings. On the Settings page, scroll
down to the Analytics section, and ensure the box next to Analytic
Accounting is checked.

Then, click Save to save all changes.

Then, navigate to the product main dashboard --> Project app --> Configuration -->
Settings. On the Settings page, in the Time Management section, ensure the
box beside the Timesheets feature is checked.

Then, click Save to save all changes.

Service product configuration

With the *Timesheets* feature activated in the *Project* app, it is now possible to invoice for time
spent on a project, but only when the following product configurations have been made.

To configure a service product, first navigate to Sales app --> Products -->
Products. On the Products page, select the desired service product to be configured, or
click New to create a new product.

From the product form, in the General Information tab, set the Product Type
to Service. Then, open the drop-down menu in the Invoicing Policy field, and
select Based on Timesheets.

Next, from the Create on Order drop-down menu, select Project \& Task. That
setting indicates that, when a sales order is created with this specific service product, a new
project and task is created in the *Project* app.

Add time spent to sales order

After properly configuring a service product with the correct *Invoicing Policy* and *Create on
Order* options, it is possible to add time spent to a sales order.

To see that in action, navigate to Sales app --> New to open a blank quotation
form. Then, proceed to add a Customer, and in the Order Lines tab, click

<sales/invoicing/configured-service-product>` from the drop-down menu.

Next, click Confirm to confirm the order.

After confirming the sales order, two smart buttons appear at the top of the order form:

If the Projects smart button is clicked, it reveals the specific project related to this
sales order. If the Tasks smart button is clicked, it reveals the specific project task
related to this sales order. Both are also accessible in the *Project* app.

In order to add time spent on a sales order, click the Tasks smart button.

On the task form, select the Timesheets tab. From the Timesheets tab,
employees can be assigned to work on the project, and the time they spend working on the task can be
added by the employees or by the person who created the sales order.

To add an employee, and the time spent working on the task, click Add a line in the

There is also the option to add a brief description of the work done during this time in the

Lastly, enter the amount of time worked on the task in the Hours Spent column, and click
away to complete that line in the Timesheets tab.

Repeat this process for however many employees and hours have been worked on the project.

Invoice time spent

Once all the necessary employees and time spent have been added to the project task, return to the
sales order to invoice the customer for those hours. To do that, either click the Sales
Order smart button at the top of the task form, or return to the sales order via the breadcrumb
links, located in the upper-left of the screen.

Back on the sales order form, the time that was added to the task is reflected in the

Hours` smart button at the top of the sales order.

To invoice the customer for time spent on the project, click Create Invoice, and select

Doing so reveals a Customer Invoice Draft, clearly showing all the work that's been done
in the Invoice Lines tab.

Click Confirm to confirm the invoice and continue with the invoicing process.

Expenses configuration

In order to track and invoice expenses related to a sales order, the product *Expenses* app must be
installed.

To install the *Expenses* app, navigate to the product main dashboard --> Apps. Then, on
the Apps page, locate the Expenses app block, and click

The page automatically refreshes and returns to the main the product dashboard, where the

Add expenses to sales order

To add an expense to a sales order, first navigate to the Expenses app. Then, from
the main *Expenses* dashboard, click New, which reveals a blank expense form.
