the product sends email notifications to users when specific events occur
in your marketplace. There are two categories of email notifications in
the product: built-in email notifications, which relate to user account
management, and transaction process emails, which get triggered at
specific stages of transactions. For instance, an built-in email
notification gets sent when a user changes their email or password or
when they need to verify a new email address. A transaction process
email can inform the user of a successful payment or a new booking
request.

## Enable email notifications

Email notifications are automatically enabled in your test and dev
marketplaces. However, in your Live marketplace, you must
configure outgoing email settings
for email notifications to work.

Users will not receive email notifications until they have verified
their email address. the product does not send emails to unconfirmed
addresses to avoid people flagging those as spam emails, as that can
hurt your marketplace's ability to send mail to legitimate users.

You can disable some email notifications through Console.

## Built-in email notifications

There are ten built-in email notifications, related to end-users'
account management, permissions, and listings approval. Use the
Console to manage the built-in email
notifications.

You can edit the built-in email content with the Email texts editor in
Console > Build > Content > Email texts.

You can preview and customise built-in emails using the
Built-in email notifications editor
in the product Console. You can find the editor in Console under the
Build > Advanced > Email notifications section.

These built-in email notifications can be disabled through Console:

- Listing approved
- New message
- User approved
- User joined
- User permissions changed
- Verify email address

The email templates use the
Handlebars template language.
The most prominent use of the handlebar templates is the `t` helper,
which is used to render the template content. The helper renders either
the message denoted by a message key, or a fallback message.

In each template, you can use a set of predefined context variables
(such as the name and email of the recipient). You can find all context
variables to the right of the built-in email template editor. You can
access user extended data through the context variables, if you want to
customise email content further.

You can edit the text content of email notifications in Console >
Build > Content > Email texts. You can preview the built-in emails, and
customise their structure,using the
Built-in email template editor
in the product Console. You can find the editor in the Console under
the Build > Advanced section.

The built-in email template editor does not include a visual editor, but
if you want, you can design your email in any
WYSIWYG email editor you find
online and paste the resulting HTML into the built-in email editor. You
can then preview the email by sending it to your email address by
clicking on "preview" and pressing on the "Send a test email" button.

For more information on how to use the Handlebars to customise email
templates, see our
reference article on email templates.

## Transaction notifications

Transaction notifications inform the user of events related to the
transaction process. These
notifications usually relate to information about bookings and payments,
in contrast to built-in email notifications, which are typically
actionable and related to account management.

You can edit the content of the transaction notifications in Console >
Build > Content > Email texts. You can preview your changes, as well as
update message keys and add or delete transaction notifications, with
the
the product CLI.

The
template sub-directory
in the transaction process directory contains all the transaction
notification email templates. All transaction notifications use the
Handlebars templating language
and can be edited similarly to built-in email templates.

In addition to making changes to the content of the transaction
notifications, you can change
when email notifications get sent.
A transaction notification must always be associated with a specific
transition. When a specific transition transitions, the transaction
notification associated with it is triggered.

Read more about transaction notifications in our
tutorial on how to add new email notifications.

## Custom notifications through Zapier

Sometimes the built-in and transaction notifications are not enough, and
you might need more control over what triggers an email. Examples
include notifying your marketplace operators when a user submits a
listing for review or sending a provider an email once their listing is
published. As neither of these actions is transaction related, you can
not trigger them as transaction notifications. Instead, you must listen
to events and trigger an email to respond to the correct event.

For building custom email notifications, we recommend connecting your
app to Zapier. You can use Zapier to listen for events in your
marketplace and react to them using different actions. Zapier also
supports sending text messages instead of emails. Read more about Zapier
in our
Help Center.

If you are unsure how to approach a Zapier integration, do not hesitate
to reach out to our support team through one of our
official support channels. We
will be happy to help you figure out your specific use case and give you
some suggestions for implementation.

## What are messages?

Messages let your users communicate with other users in your
marketplace. They can be exchanged freely between a customer and a
provider once they have engaged in a transaction. Messages always need
to be associated with a transaction and can not be sent outside of one.

The default booking and purchase
transaction processes
include an inquiry transition, which initiates a transaction without
running any actions,
allowing the provider and customer to send messages to each other. In
addition, the
default-inquiry process
initiates a simple transaction that is only intended for messaging.

Note that messages do not alter the transaction or transition it to a
different state.

### Sending messages

You can send messages using the
send message endpoint,
which requires an authenticated user’s access token to call. The
Integration API
does not offer an endpoint to send messages, and therefore, only
authenticated users can send messages through the Marketplace API.

### Querying messages

You can query messages through the query messages endpoint, which
returns all messages in a given transaction. Messages can also be
included as a relationship when
querying transactions.

### Email notifications

New messages trigger a
built-in email notification sent to
the receiving party of the message. You can edit built-in email
notification content through
Console > Build > Content > Email texts,
and you can modify the structure and code of the notifications through
Console.

## Zapier, events and messages

Using Zapier
you can connect your marketplace with other web applications and create
automated workflows.

Even though you can’t listen for new messages through Zapier, messages
can easily be retrieved as a transaction relationship. For more complex
customisations, you can use events to listen to new or deleted messages.

### How to retrieve messages in Zapier

You can use Zapier to access messages using the transaction ID that is
associated with them. By default, when you listen to transaction events,
the message relationship is not included. To include the message
relationship, add the action "Show Transaction" to the trigger
"Transaction events" and select messages from the dropdown menu.

From the dropdown menu, you can select messages, and you are then able
to use the message content in your Zap.

### Events and messages

Listening to events through the
Integration API
is the most versatile way to react to what is happening in your
marketplace. As sending new messages does not affect transaction state
or transitions, you can’t use Zapier to detect new messages as it can
only react to transactions, listing and user events. Events allow you to
listen to created messages
and react directly to them. See how to
react to events and the
Integration API example script repository
if you’re unsure where to start building your integration.

## Message notifications in the product Web Template

By default, the product Web Template renders a notification symbol when
the provider has transactions that require action, i.e. transactions
that require acceptance of a booking request.

This is how the default logic works:

1.  A
    query is made
    that retrieves all sales transactions (i.e. transactions where the
    current user is the provider) transactions that are in a state that
    requires provider attention
2.  The amount of sales transactions determines the
    notification count
    shown
    in the badge.

The variable
currentUserNotificationCount
stores the number of active notifications.

You can extend the messaging logic in many ways. For example, a common
customisation is to display a notification every time a user receives a
new message. To achieve this, you could change the logic behind
currentUserNotificationCount
to display a number stored in extended data. The data attribute would
represent the number of unread messages, and could be updated every time
a new message is detected using events.

## Introduction

PaymentIntents are a
mechanism provided by Stripe to track the lifecycle of customer checkout
flow. In addition, PaymentIntents provide tools for
Strong Customer Authentication (SCA)
where required. the product has built-in support for PaymentIntents and
Strong Customer Authentication.

In September 2019
new European regulation
will begin requiring SCA for online payments from European customers. In
order to conform to these regulatory changes, Stripe encourages users to
migrate or use PaymentIntents
instead of directly creating Charges.

In the future, PaymentIntents can be required in other countries outside
Europe due to local regulatory changes but they can already be used
outside Europe. And if needed, they can provide fraud prevention with
things like
3D Secure Card Payments.

PaymentIntents also allow a variety of payment methods to be used when
making a payment in the product. See the
overview of supported payment methods in the product.

This article will describe how PaymentIntents relate to the product
transaction processes and the general principles of implementing a
checkout flow with PaymentIntents.

## Transaction process with PaymentIntents

On high level, the payment flow with PaymentIntents has the following
steps:

1. Customer initiates (or transitions) a transaction with a transition
   containing action that creates a PaymentIntent.
2. Customer uses the PaymentIntent data to complete any steps necessary
   to authenticate and authorize the payment.
3. The transaction can proceed only after customer has authorized (if
   required) the payment. The PaymentIntent is confirmed, resulting in a
   Charge being preauthorized (in the case of
   card payments)
   or fully captured (in the case of
   push payment methods).
4. Transaction flow continues as usual onwards.

### Example transaction process with card payments

For technical implementation of PaymentIntents, Stripe offers two
approaches -
manual or automatic confirmation flow.
the product uses the automatic flow. In practice, the product
transaction engine models the automatic flow with two transitions. First
transition creates the PaymentIntent (Step 1.) and second transition
will validate and mark it confirmed in the product (Step 3.). Between
these steps, the automatic flow pushes the responsibility of
authenticating, authorizing and confirming the payment in Stripe to the
client application (Step 2.). More information on the Step 2. can be
found in this section.

### Example transaction process with both card and push payments

Since push payments
do not have a preauthorization stage,
this process allows an instant-booking type of flow, where the booking
does not need acceptance from the provider.

You can find another example process with only an _instant booking_ flow
and support for both card and push payments in the
Instant booking process
in the
the product example transaction processes repository.

## Actions related to PaymentIntents

The following actions can be attached to a transaction process in order
to implement PaymentIntent flow and are already present in the default
flows.

### stripe-create-payment-intent

Creates a PaymentIntent for use with card payments (or payment methods
that are similar, such as Google Pay or Apple Pay). You can optionally
pass in a
PaymentMethod ID, or
attach a PaymentMethod later to the transaction during the validation
and confirmation in the client by using Stripe Elements. The latter is
the recommended way and is covered in the
implementation guide.

For detailed reference, see
here.

### stripe-create-payment-intent-push

Creates a PaymentIntent for use with push payments. You can optionally
pass in a
PaymentMethod ID, or
attach a PaymentMethod later to the transaction during the validation
and confirmation in the client by using Stripe Elements. The latter is
the recommended way and is covered in the
implementation guide.

For detailed reference, see
here.

### stripe-confirm-payment-intent

Validates that the transaction has a PaymentIntent created and verifies
via Stripe API that the PaymentIntent status is `requires_capture`,
`requires_confirmation` or `succeeded` (only allowed for push payment
methods). Confirms the PaymentIntent in Stripe, if needed.

If the payment intent was created with `stripe-create-payment-intent` (a
card payment), a preauthorization is placed on the card. The payment
then can be captured in full by using `stripe-capture-payment-intent`
within 7 days of creating the payment intent, or the preauthorization
can be released by using `stripe-refund-payment`.

On the other hand, if the payment intent was created with
`stripe-create-payment-intent-push`, there is no preauthorization, the
payment is captured in full and there is no need to use the
`stripe-capture-payment-intent` action. The payment can be refunded in
full using the `stripe-refund-payment`.

For detailed reference, see
here.

### stripe-capture-payment-intent

Captures a confirmed PaymentIntent. In case of PaymentIntents created
through `stripe-create-payment-intent-push`, the PaymentIntent is
automatically captured already when confirmed and this action has no
effect. Note that uncaptured payment intents are valid for seven days,
after which they are automatically canceled by Stripe.

For detailed reference, see
here.

### stripe-refund-payment

Either cancels an unconfirmed PaymentIntent or refunds the related
captured charge.

For detailed reference, see
here.

## Required actions in the client

The required actions in the client are related to authentication and
confirmation. You need to be able to handle potential authentication
steps required by the customer's card issuing bank. After
authentication, the client needs to
obtain PaymentIntent data from the transaction's protected data
and use that to confirm the payment.

In case you wish to enforce
3D Secure Card Payments
for cards that support 3DS, in addition to supporting payment
authentication in your client app, you may need to update your
Stripe Radar rules.

### Handling Strong Customer Authentication

Strong Customer Authentication
is a potential step enforced by governmental regulation. Not every
PaymentIntent for card payments will require customer authentication.
For instance, authentication may not be required for:

- transactions out of scope of SCA
- e.g. when card issuing bank is outside of EEA
- merchant initiated transactions
- transactions that fall under an SCA exemption
- low value or low risk transactions
- recurring payments for fixed amount
- other

In addition, PaymentIntents for push payment methods also require
customer action. Typically, the customer needs to be redirected to their
bank website or app where they can complete the payment, after which
they get redirected back to the marketplace.

This means that the product implementation of PaymentIntents supports
payment flows that require authentication and those that do not. When
implementing the PaymentIntent flow in the client you need to be
prepared for handling both cases - payments requiring SCA and payments
that do not. It might be impossible to know in advance whether the
payment will require authentication, unless the marketplace and all its
customers are outside of EEA.

The recommended way of implementing support for SCA is to use
Stripe Elements
that can provide you with ready modals for handling e.g. 3D Secure Card
Payments. The next section will provide high level instructions on how
to do this in the client.

### Implementing the PaymentIntent flow

For implementing the PaymentIntent flow, you can use the following
guides as a reference:

- card payments
- push payment methods:
  - Alipay
  - Bancontact
  - EPS
  - giropay
  - iDEAL
  - Przelewy24

Below we outline the concrete steps and how they work in combination
with the product transaction process.

#### Step 1: Initiate or transition the product transaction

With the product, the step to create a PaymentIntent in handled by the
transaction engine when a transaction transitions with a transition
using one of the following actions:

- stripe-create-payment-intent - use
  this action for card payments
- stripe-create-payment-intent-push -
  use this action for payments with push payment methods

If we assume that your transaction process follows
this example,
you would use the `request-card-payment` transition for card payments
and the `request-push-payment` transition for push payments.

#### Step 2: Collect payment information and handle customer actions

Stripe Elements provides ready
tools and a reference for implementing the automatic PaymentIntent flow.
It is useful for both collecting payment details, attaching the
PaymentMethod to the PaymentIntent, as well as handling any customer
payment authentication or confirmation steps. It's the recommended way
to support PaymentIntents in the client.

For card payments, your implementation will typically invoke a call to
Stripe.js
stripe.confirmCardPayment.

For push payments, the correct Stripe.js method depends on the concrete
payment system. See here
for a full list of Stripe.js methods.

In either case, you need the PaymentIntent's ID and client secret. Both
of those values are exposed in the transaction's protectedData map under
a key `stripePaymentIntents` after the PaymentIntent has been created.
The value of `stripePaymentIntents` is an object in the form of:

This data is only exposed to the customer in the transaction. The
provider can not access neither the PaymentIntent ID nor the client
secret.

#### Step 3: Transition the product transaction further

Once any customer authentication or payment confirmation is handled in
the UI, you need to transition the product transaction further in
order for the product to record the payment details correctly. Make sure
that the transition includes the
stripe-confirm-payment-intent action.

If we assume that your transaction process follows
this example,
you would use the `confirm-payment` transition for card payments and the
`confirm-payment-instant-booking` transition for push payments.

## Using PaymentIntents in the product

the product Web Template supports card payments with PaymentIntents
by default. If you need to adjust the default implementation, or if
you're currently using one of our
legacy templates,
learn more about how to take PaymentIntents into use.

## Further reading

- Payment methods overview
