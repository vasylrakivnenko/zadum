eCommerce

the product eCommerce provides an open-source platform for building and managing an online store. It
offers a wide range of tools and features to configure products, customize the design, manage
ordering and checkout processes, set up delivery methods, handle orders, and analyze performance.

Ordering and checkout

the product eCommerce provides several options to organize the ordering and checkout process. It offers
different order button options and sequential

related buttons and checkout pages can be customized using the website editor.

Order buttons

To customize the ordering process in the product eCommerce, you can:

- change the Add to Cart button's behavior;
- replace it with a customized button;
- add a Buy now button.

Add to cart options

Default add to cart behavior

When clicking the Add to cart button, different actions can be triggered. To configure
them, go to Website --> Configuration --> Settings, scroll down to the

Cart` feature:

- Stay on Product Page: The customer remains on the product page after adding a product
  to the cart. If the added product has linked optional products, the customer can choose between Add to cart (to
  stay on the product page) and Go to Checkout fa-chevron-right (to be
  redirected to the cart).
- Go to cart: The customer is redirected to the cart immediately.

Button customization

You can replace the Add to Cart button with a Contact Us button, which
redirects users to the default contact form.

To display the Contact Us button, you need to hide prices on the product page. When the customer clicks the Contact
Us button, by default, they are redirected to the contact form where the Subject field
is already auto-filled with the requested product's name.

Additional add to cart buttons

You can add additional Add to Cart buttons and link them to specific products on any
website page. To add them, open the website editor and place the Add to Cart Button
inner content building block. Once placed, click the button, scroll to the Add to Cart
Button section, and configure the following:

- Product: Select the product to link the button with.
- Action: Choose whether to use an Add to Cart or Buy Now button.

Buy now

To let customers choose to go directly to the Order summary
step, add an additional Buy now button. To do so, go to any product's page, open the
website editor, go to the Style tab, and click the fa-bolt Buy Now
button next to the Purchase Options.

Reorder products

Customers can reorder items from a previous sales order:

- from their customer portal, using the Order Again button. All products from the
  selected order are automatically added to the cart, and customers can then Remove any
  items they don't want to reorder.

  .. image:: checkout/order-again.png

- from the cart, by clicking Quick reorder at the Order summary step. Customers can then adjust quantities as needed and click the

  .. image:: checkout/cart-quick-reorder.png

Checkout steps

During checkout, customers are taken through the following steps:

- Order summary
- Address
- Extra Info (if enabled)
- Payment
- Order confirmation

Each step can be customized using the website editor by adding building blocks or opening the Style tab to enable various
checkout options.

Order summary

The Order summary step allows customers to see the items they added to their cart,
adjust quantities, Remove products, and reorder products from a previous order. Information on product prices and the taxes applied is also
displayed. Customers can then click the Checkout fa-chevron-right button to
continue to the Address step.

Open the website editor to enable checkout options such
as:

- Suggested Accessories: to showcase accessory products;
- Promo Code: to allow customers to redeem gift cards
  and apply discount codes or

- Add to Wishlist: Enable wishlists to allow signed-in users to remove a product
  from their cart and add it to their wishlist using the Save for Later option.

Address

Once they have reviewed their order:

- Unsigned-in customers are prompted to Sign in or enter their Name and

- Signed-in customers can select the appropriate Delivery address.

They can then choose a delivery method, select or enter their Billing
Address (or toggle the Same as delivery address switch if the billing and delivery
addresses are identical), and click Confirm to proceed to the next step.

Automatic address validation

Use the Google Places API to ensure
that partner delivery addresses are valid. Addresses are automatically validated as the user types
during checkout.

To enable this feature, the Google Places API
needs to be configured first. Then, go to Website --> Configuration --> Settings.
In the General section, enable Google Address Validation, then paste the

field.

Extra info

You can add an Extra Info step in the checkout process to collect additional customer
information through an online form, which is then included in the sales order. To do so, enable the

<website/building_blocks/form>` as needed.

Payment

At the Payment step, customers can choose a Payment method, enter their
payment details, and click Pay now.

To make payment methods available to customers, configure and enable one or more payment
provider(s). To do so, go to Website -->
Configuration --> Payment Providers, Activate the relevant payment provider, and

Terms and conditions

To require customers to agree to the terms and conditions before payment, open the website
editor and toggle the Accept Terms switch in the Style tab.

eWallets and gift cards

Customers can pay with an eWallet or gift card during checkout. To offer these options, go to

Loyalty & Gift Card` in the eCommerce section. Then, go to Website -->
eCommerce --> Gift cards & eWallet and create a gift card and/or eWallet program.

Order confirmation

The final step of the checkout process is the order confirmation page, which provides a
summary of the customer's purchase details. A sales order is automatically created in the backend.

To automatically send an order confirmation message, navigate to Website -->
Configuration --> Settings and scroll down to the eCommerce section. Under

</applications/general/companies/email_template>`, or, if the WhatsApp app is installed, a WhatsApp template from the dropdown list. To edit the selected template, click the

To automatically send an invoice to the customer, enable the Automatic Invoice setting.

Order handling

In the product's e-commerce workflow, an online purchase typically goes through three main steps:

orders upon order confirmation, delivery orders to manage picking,

</applications/inventory_and_mrp/inventory/shipping_receiving/setup_configuration/multipack>`, and

<ecommerce/handling/stock-management>`, and handle product returns and refunds.

Sale

To view all quotations and orders, navigate to Website --> eCommerce -->
Orders, and select one to open it. The status bar at the top of the order shows its current status:

- Quotation: A product has been added to the cart, but the customer has not yet completed the checkout
  process. If the customer is not logged in, the quotation is assigned
  to the default *Public User* contact.
- Quotation Sent: The customer has completed the checkout process and confirmed the order, but the payment has not yet been confirmed.
- Sales Order: The customer has completed the checkout process, confirmed the order, and the payment has been successfully received.

Abandoned carts

An abandoned cart is created when a customer adds products to the cart but does not go through the

is possible to automatically send an email reminder to the customer for these pending orders.

To enable abandoned cart reminders:

#. Go to Website --> Configuration --> Settings.
#. In the eCommerce section, enable Follow up abandoned carts.
#. Set the time delay after which the reminder email is sent in the Send after field,
   then click Save.
#. If needed, click the fa-arrow-right Customize Abandoned Email Template
   link to customize the email template.

To view all abandoned carts, go to Website --> eCommerce --> Orders and remove
the Confirmed filter. Open the fa-caret-down dropdown menu and, under

Delivery

Once a sales order is confirmed, a delivery order is automatically created. To access it, click
the fa-truck Delivery smart button on the sales order.

The next step is preparing e-commerce orders in the warehouse. Depending on order volume, refill and
stock management strategies, or available resources, different stock handling flows
for receipts and deliveries can be implemented.
These flows may involve manually receiving, picking, and packing
products, printing shipping labels, and

</applications/inventory_and_mrp/inventory/shipping_receiving/daily_operations/dropshipping>` or

</applications/inventory_and_mrp/inventory/shipping_receiving/daily_operations/owned_stock>`.

After completing the warehouse operations, return to the delivery order and click

Stock management

To ensure that products ordered by customers are reserved in stock, go to Inventory
--> Configuration --> Operation Types, click the Delivery Orders operation type, and
set the Reservation Method field to At Confirmation.
When enabled, product quantities are automatically reserved once the order is confirmed, preventing
items from becoming unavailable after the order is placed.

Returns and refunds

Customers can return products
through the customer portal by navigating to the

button. A return document is automatically generated.

Once the returned items are received, initiate the return and refund process in the backend.

Invoicing

The final step of an e-commerce order is generating and sending the customer invoice. Depending on your needs, invoices can
be generated manually or automatically.

To automate invoicing:

#. Go to Website --> Configuration --> Settings.
#. In the eCommerce section, enable Automatic Invoice.
#. Select the relevant Email Template, then click Save.
#. If needed, click the fa-arrow-right icon next to the template name to customize the

Delivery methods

the product eCommerce allows you to configure various delivery methods, enabling customers to choose their
preferred option at checkout. These methods include integrations
with external providers as well as custom
options such as flat-rate shipping, free shipping, or

External provider integration

You can integrate with third-party shipping carriers,
such as FedEx,

or DHL
to streamline shipping operations. Connecting with an external provider allows to generate

</applications/inventory_and_mrp/inventory/shipping_receiving/setup_configuration/labels>`
automatically and to offer customers several delivery options at checkout.

To enable a third-party delivery provider:

#. Go to Website --> Configuration --> Settings.
#. Scroll to the eCommerce section.
#. Under Configure Delivery Methods, click fa-arrow-right Find a
   Delivery Provider.
#. On the New Providers page, click the Delivery methods button of an
   already-installed provider to access the delivery method's form, or Install a new
   provider.
#. Configure the delivery method.

Custom delivery method

Custom delivery methods must be created, for example:

- to configure fixed-price shipping that applies to all orders;
- to configure shipping based on rules;
- to configure the Click & Collect option.

To create a custom delivery method,
go to Website --> Configuration --> Delivery Methods, click New, and

Click & Collect

To allow customers to reserve products online and collect them in-store, follow these steps:

#. Go to Website --> Configuration --> Settings.
#. Scroll to the eCommerce section, enable Click & Collect, and

#. Click fa-arrow-right Configure Pickup Locations to configure the
   delivery method,
   if needed, and ensure the Provider field is set to Pick up in store.
#. In the Stores tab, click Add a line and select the warehouse(s) where
   customers can collect their orders.
#. Once the setup is complete, click the Unpublished button to change the status to

Configuration

the product eCommerce enables the configuration of products, categories, variants, and pricing. It also
manages customer accounts and access, supporting both B2B and B2C business models.

eCommerce design

Customize the design of the product pages,
structure the product catalog and use

customer's shopping experience.