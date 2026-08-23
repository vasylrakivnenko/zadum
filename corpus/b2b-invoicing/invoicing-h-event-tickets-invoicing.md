## Enable the invoice subsystem

Head to the "Invoice" section of your organization's configuration

--------------------------------------------------------
### VAT number
Your Organization's VAT number - **Required**

### Invoice number Pattern

The pattern to apply when generating the invoice number.
The default is to increment an organization-based counter.

#### Customize number

Here some examples of how you can customize the invoice number:

Description   Value    Result
-------------   -------------   -------------
prepend the "INVOICE-" text    `INVOICE-%d`   `INVOICE-1`
append the "-INVOICE" text    `%d-INVOICE`    `1-INVOICE`
prepend the "INVOICE-" text, ensure a length of 3 zero-padded     `INVOICE-%03d`   `INVOICE-001`

### Invoice Address
Enter here the address of your Organization, as it should appear on the invoice

## Additional options

### Use invoice number for public references
Enable this flag if you want to use the invoice number as reference number, instead of the Reservation ID

### VAT/GST Number is required for Business Customers
Enable this flag if you want to force every business customer to enter their TAX ID number.

### Generate only Invoice
Enable this flag if you want to generate only invoices. The default is to let the attendee choose whether they want an invoice or a payment receipt.

### Enable the support for Italian e-invoicing
Enable this flag if your business is based in Italy and you must comply with the E-Invoicing regulation, more here

## How it works

### Reservation Process

Depending on the value of the Generate only Invoice flag, the customer might have the possibility to choose whether or not they want to generate an invoice:

Once they fill up the billing data and confirm, the Invoice Details will be saved

they can check the invoice details and update if needed.

Once the reservation is complete:

- The invoice will be attached to the confirmation email
- The customer will be able to download the invoice from the confirmation page

### Backoffice

#### Invoice management for reservation

If you want to regenerate/download an invoice for a reservation, head to the Reservation Detail, and click on the "Billing Documents" tab

#### Download all Billing Documents for an event

You can download all the invoices generated for an event, by selecting _Download_ -> _all Billing Documents_ on the event detail page

the product supports the Reverse Charge mechanism for EU-based B2B invoices.

Since there's no general rule about the reverse charge (i.e. each Member State can decide whether or not to apply it),
**Please check with your accountant if you must apply it or not**

To activate it, head to the Invoice section of your configuration

### Enable EU Reverse Charge

**default: false**

Enable this flag if you want to activate the Reverse Charge mechanism

### Validate VAT using EU VIES Webservice

**default: true**

Controls whether or not to call the VIES Webservice to validate a given EU VAT number

### Apply VAT to non-EU B2B customers

**default: true**

Controls whether or not to apply VAT to non-EU business customers. This regulation is country-specific, please check with your accountant.

### The country where the organizer run its business

Select the Country where your business is based. This will be compared with the customer Country to determine if Reverse Charge must be applied.

## Context

If your business is based in Italy, you should check if you're expected to comply with the "Fatturazione Elettronica" (E-Invoicing) directive. More info here.

If you must issue "electronic invoices" (that is, submit the invoice to the taxation authority **instead of** sending them directly to your customers), the product helps you to collect all the required information for doing that.

the product is not capable of sending the invoices directly to the italian taxation authority, so you'll have to submit them manually.

## Configuration

### How to activate Italian E-Invoice

Please follow the tutorial on how to activate invoices, then enable the following option:

## How does it work

### Reservation Process

It is mandatory to register all the transactions, even if the customer is not a company.
the product will request billing data for each customer buying a ticket, and if they set **Italy (IT)** as their billing country, they'll be asked to fill additional fields

#### Fiscal Code (Codice Fiscale)

It's the Tax Code for private customers and companies. It is a required information

#### E-Invoice addressee (Destinatario Fattura Elettronica)

It specifies the final recipient of the invoice. It can be:

- **Addressee Code** (Codice Destinatario): an alphanumeric code assigned to companies or to invoicing systems.
- **PEC**: an certified e-mail address, see more
- **Neither**: if the buyer does not have none of the above

### Reservation Confirmed

Once the Reservation has been confirmed/paid by the customer, the organizer will receive a notification email with the following contents:

- The customer's billing details, as specified during the reservation process
- The Invoice in PDF format. This contains all the information that must be sent to the taxation authority



Custom offline payment methods allow you as an organizer to define your own payment methods which users can select during checkout. The confirmation of payment for these methods is a manual process similar to the Bank Transfer payment method. Once a user selects their payment method of choice, they will be given a set of instructions on how to complete the payment. The organizer then manually verifies the attendee's payment and marks the reservation as "Confirmed", giving them access to the event.

### Video Demonstration
If you would like to see a visual walk-through of the feature, you can view the video below.

    Your browser does not support the video tag

### Configuring custom payment methods
Start by navigating to the configuration section for your organization. In the example below the organization we are using is "Org1".

Close to the bottom of the page you will see a section card called "Custom Offline Payments". This is where we will be configuring the payment methods for use in our events.

After pressing "New Payment Method" you will be greeted with a dialog asking for some basic information including what language the initial translation is, as well as a name, description and instructions. The name and description are shown on the checkout page when the user is selecting their payment method. Once the user has selected the payment method during checkout, we will present the content in the instructions field so they know how to complete their payment. The description and instructions field support markdown, allowing you to change the formatting of the text and to insert images and links. In the example below I have included a link in the payment method description for users to find more information about the payment method, as well as a QR code in the instructions for users to scan to complete their payments.

Once saved, you will now see your new payment method in the Custom Offline Payments card. You can expand each item in the list to see its contents. You can add additional translations and edit existing ones as needed.

### Configuring an event to use custom offline payments
Create a new event as normal or edit an existing event. When you arrive at the "Seats and payment info" section, you will see a new checkbox under "Accepted payment methods" called "Custom Offline Payment Methods". Checking this field will present a new list including each custom payment method you have configured in your organization. Select the custom payment methods you would like to use for your event. In the example case shown below, we have selected the "ACME App Instant Money Transfer" payment method we created in the last section.

Once you finish creating your categories and adding other event configuration as needed, you can save the event. Your event will now be configured to use the custom payment method. You can change your payment method selection as needed by using the "Edit" button under the "Seats and payment info" section.

### Disabling custom payment methods for certain categories
If there is a particular custom payment method you do not want to be accessible for certain categories, you can disable it by pressing the "options" button on the category, selecting the payment method you would like to disable, and pressing "Save". Now if a user selects the category, your disabled payment method will not show as a payment option.

### Validating payments as an organizer
When a user completes the checkout process using a custom payment method, they will be given instructions to complete their payment outside of the product platform. These pending reservations will show in the event admin panel under "Reservations" -> "Payment Pending".

You can click on the ID of the reservation to view its details. Under the "Order Summary" section we show the name of the custom payment method the user selected. Using the information provided, you can validate externally whether the user has paid.

Once you have validated the payment, you can complete the payment process and provide the user with their tickets by pressing the "Confirm payment received" button.

### User Checkout Process
From the user's perspective, once they have selected their tickets and entered in the attendee information, they will be presented with a set of payment options including our custom offline payment method. The description we configured previously is shown to give the user more context for the payment method. In our case we used markdown to provide a link to the payment app. If you have configured multiple translations for your payment method, the translation shown will match the user's language.

Once a user confirms their payment choice, they will be shown a "Payment Pending" screen including instructions on how they can complete their payment. In our case we have provided a QR code through markdown which is displayed for users to complete their payment through the app.

Once the user has completed their payment and an operator has confirmed the reservation, the user will receive an email including their tickets and the pending payment screen will change to a success screen. This screen informs the user that their reservation has been completed and they have been successfully registered for the event.