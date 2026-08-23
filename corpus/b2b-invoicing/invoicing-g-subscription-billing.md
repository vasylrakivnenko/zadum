the product Payments Platform is designed to offer *a single payment API* for any type of payment gateway, processors, bank,... and to support any kind of payment flows. It is typically used to charge customers in eCommerce Shopping Cart type flows.

### API Overview

the product's payment related APIs can mainly be classified as follows:

* *Payment Methods APIs* - Used for operations related to payment methods like adding/deleting a payment method, etc.
* *Payment APIs* - Used for payment related operations. These are used by:
** the product core billing engine to charge for subscriptions
** the product (the product Admin UI) to handle refunds, chargebacks, adjustments, etc. for invoices and payments associated with such subscriptions.
** Directly by an e-commerce application to trigger payments for one-off charges or to create payment forms and redirect URLs in case of hosted payment pages.

### Plugin Properties

The Payment Method and Payment APIs have been built to be as generic as possible. Because each plugin/gateway has its own specificities, you can pass extra data by using plugin properties:

* For each API, one can specify custom properties by using query parameters -- those query parameters should be URL encoded
* the product will deserialize the query parameters and pass them straight to the plugin

This mechanism allows to pass information from the client of the API to the plugin, while being opaque to the product; for instance, in order to specify the following two plugin properties:

One would have to add the following query parameters (note that this needs to be URL encoded):

The mechanism also works for receiving information back from the plugin; the plugin can return a piece of json that will be embedded in the json response; for instance, the plugin could return a specific key:

### Direct Payments APIs

A payment object is associated with a set of transactions (authorization, multiple captures, etc.). You can retrieve that object via:

The calls below describe how to create payments. For each call, you can specify in the body a *transactionExternalKey* string to tag your payments (it represents a unique identifier in an external system).

#### Authorization

To create an authorization on the default payment method of the account:

This will return a direct payment object. We will assume its uuid is `078a4500-d15e-11e3-9c1a-0800200c9a66` in the examples below.

Notes:

* For multi-steps authorization (e.g. 3DS), you can specify a `paymentId` field in the body for subsequent calls
* You can specify another payment method (other than the default one) via the `paymentMethodId` query parameter

#### Capture

Notes:

* You can call this endpoint multiple times for partial captures (all of these captures will share the same direct payment id)

#### Purchase

This call is similar to the authorization one:

Notes:

* You can specify another payment method (other than the default one) via the `paymentMethodId` query parameter

#### Void

#### Refund

#### Credit

This call is similar to the authorization one:

Notes:

* You can specify another payment method (other than the default one) via the `paymentMethodId` query parameter

### Hosted pages helpers

[[build-form-descriptor]]
#### Build form descriptor

The `buildFormDescriptor` API is used to prepare a Hosted Payment Page (HPP) payment. In the body of the request, you need to pass custom fields that are plugin specific.

For example, given an order of $10, here is how you can get the redirect URL using the Adyen plugin:

Notes:

* Replace _268983f2-5443-47e4-a967-b8962fc699c5_ with the account id
* You can specify another payment method (other than the default one) via the `paymentMethodId` query parameter

[[gateway-notification]]
#### Process gateway notifications

Gateway notifications (Adyen notifications, Recurly push notifications, PayPal or BitPay IPN, etc.) can be processed through the `processNotification` API.

For example, here is the payload that Adyen would send:

Make sure to replace `the product-adyen` with your plugin name.

The plugin will deserialize either the request body and/or the url query parameters to process the notification and return a properly formatted HTTP response object for the gateway (some gateways require specific response codes or headers to consider the notification processed and prevent retries).

Because this endpoint needs to be on a public IP (to be accessible from the gateway), we recommend using the product Notifications Proxy to avoid exposing the entire the product server.

When an end-user is charged against a payment method, this is encapsulated as a *payment* in the product. These details need to be recorded in the product.

### Payment flows overview

*Payment flows* describe the flows that occur when a merchant site invokes the product payment APIs for charging a customer. Thus,
these flows are not applicable for recurring payments initiated by the product.

the product supports two main payment flows, referred to as *Hosted Payment Pages* (or *HPP*) and as *Gateway integration*:

* A *HPP* flow is when the payment is completely outsourced, either by redirecting the user to a third-party website or by hosting a form or an iframe, that submits the information to a third-party website
* A *Gateway integration* flow is when the customer doesn't leave your website and the product processes the payment directly by calling a gateway API

For a concrete example on how the two flows can be implemented, take a look at our Adyen demo.

In the flow diagrams below, we consider the following actors:

* *Browser*: user sitting behind a browser and initiating the payment flow
* *Merchants Site*: customer facing web site which receives the order and shields the payment system (i.e. the product)
* *Payments*: the payment system (i.e. the product and its specific payment plugins which interact with the payment providers) offering APIs for the various flows
* *Payment Provider*: also called Payment Service Provider (PSP), Payment Gateway or simply Gateway, this is the entity that will process the payment
* *Access Control Server* (optional): in the case of 3D-Secure checkout, the user is redirected to some third party entity to enter custom information that will validate whether he can pursue with the payment flow

### Hosted Payment Page flow

During an HPP flow, the customer enters his payment method information (either on the main Merchants Site or a third-party site) and then submits a form containing that information to make the payment. To obtain the information required to present the user with a payment form (specific form fields or URL where the form is hosted), call the *buildFormDescriptor* API.

The result of the API call will depend on the type of HPP integration:

* If the payment form is hosted on your own website (but the form data will be sent to a third-party website), the response will list the exact fields to set, such as required visible fields (the names will vary depending on the gateway, for instance some expect a `Sum` field instead of `amount`) and required hidden fields (e.g. `merchantId` value). For PayPal Payments Standard Buttons for example, the API would return the values of the fields *cmd*, *hosted_button_id* and *submit*. The browser submits the payment information to the payment provider, which then redirects the customer to a landing page upon success or failure.
* If the payment form is completely hosted on a third-party website, the response will contain a URL to redirect the user to. This URL can be generic or unique (generated by the payment plugin either by submitting the order information to the gateway or by constructing the special URL via query parameters). For Adyen HPPs for example, the API would return a url like  The browser is redirected to the payment provider website for the customer to complete the payment before being redirected back to a landing page upon success or failure.

Note that after calling *buildFormDescriptor*, the payment may or may not exist in the product: this will depend on the plugin. If it does however, it will be most likely in a **PENDING** state.

Here are a few common scenarios:

* the HPP provider doesn't provide an API to retrieve the state of the payment, nor sends notifications: the only way to record the payment is when the user is redirected to the Merchants Site. In that case, *buildFormDescriptor* can simply return the data to create the form and/or redirect the user without creating any payment. When the user completes the payment and is redirected back to the site, the Merchants Site will need to record the payment explicitly by calling the *createPurchase* API. Alternatively, if you want to keep track of abandoned purchases, the plugin could create a payment in a *PENDING* state during the *buildFormDescriptor* call. After the redirect, the Merchants Site will still call the *createPurchase* API to complete the payment, but will pass the paymentId returned by the previous *buildFormDescriptor* call.

.Payment created during the redirect

.Pending payment created during the *buildFormDescriptor* call, completed during the redirect

* the HPP provider provides an API to retrieve the state of the payment but does not send notifications. In this case, the URL constructed during the *buildFormDescriptor* call is most likely unique, and contains enough information for the plugin to poll the provider for the payment status. During the  *buildFormDescriptor* call, the plugin will need to create a *PENDING* payment. the product will automatically poll the plugin calling the *getPaymentInfo* API, which should query the provider for the latest payment status. Example: Boleto with PayU Latam.

.Pending payment created during the *buildFormDescriptor* call, completed by polling *getPaymentInfo*

* the HPP provider doesn't provide an API to retrieve the state of the payment but does send notifications. In this case, *buildFormDescriptor* can simply return the redirect URL without creating a payment, which will be created when the notification is received. Similarly to the first case above, you could create a *PENDING* payment if you want to track abandoned purchases, just make sure that the plugin has enough metadata to reconcile the notification with the payment. When the notification is received, either use the *notifyPendingTransactionOfStateChanged* the product API to transition the payment, or wait for the product to poll the plugin via  the *getPaymentInfo* API. Example: any HPP provided by Adyen.

.Payment created when receiving a notification from the provider

.Pending payment created during the *buildFormDescriptor* call, completed when receiving a notification from the provider

The conceptual flow below shows a 3D-Secure variation of the previous flows. The main difference is that prior redirecting the browser to the landing page, it is first redirected to the access control server where the user can enter custom information.

.Hosted Payment Page 3D-Secure variation

### Gateway Integration Flow

For gateway integrations, the entry point for any payment is either the *createAuthorization* (to authorize a credit card), *createPurchase* (to charge a payment method, for example authorizing and capturing a credit card, to initiate an ACH transfer, to withdraw money from a Bitcoin wallet, etc.) or *createCredit* (to deposit money on a payment method, without any reference to a previous payment) APIs. The payment state will be in `*_INIT` state before calling the plugin.

There are two main types of scenarios:

* When payment gateways provide synchronous APIs, transactions end up in a terminal state right away. The following figure demonstrates this scenario:
+
.Gateway integration (With Synchronous Payment API)

+
The payment is initiated using one of the *createAuthorization* or *createPurchase* APIs. the product then connects to its payment plugin, which in turn contacts the gateway to perform the required operation. Upon success/failure, the end-user is redirected to a landing page.
+

*Note:* Before any payment operation can occur, the user must first enter his/her payment information and a payment method must be created as explained in the <<payment_method_flows, payment method flows>> section. This is not represented in the flow above; it can happen either in a prior step or during the payment using one of our combo payment call.
+
* In some cases, a plugin can choose to set the status to *PENDING*. For example, this is the case for 3D-Secure transactions (until the issuer verifies the payment after redirecting the user), for direct debit transfers (e.g., ACH, which usually takes a couple of days for banks to acknowledge), or for Bitcoin transfers (until blockchain confirms the transaction). Additionally, some gateways don't always provide synchronous responses (e.g., when using Adyen to capture funds), in which case the plugin has to rely on asynchronous notifications to transition the payment into a terminal state. The <<Janitor, the product Janitor>> can also be used to automatically fix *PENDING* states.
+
The following figure demonstrates the Janitor scenario:
+
.Gateway integration (With Asynchronous payment)

The first step when registering payment methods is to create an account in the product. This needs to be done once:

This call will return a 201 Location header containing the id associated with the newly created account. The rest of this document will assume this id is `268983f2-5443-47e4-a967-b8962fc699c5`, make sure to update your commands accordingly.

To add a payment method, POST the following information:

This will create a default payment method associated with our account and the __EXTERNAL_PAYMENT__ plugin. *The `pluginInfo` fields are specific to the plugin* and can be seen as a contract between the client of the API and the plugin itself (opaque to the product). For example, to add a payment method corresponding to Stripe via a token, the Stripe plugin expects a field named `token`, with the value of the Stripe token.

Check our Stripe demo for an implementation example.

You can add as many payment methods as needed to a given account (across one or multiple plugins). You can specify for each payment call the payment method to use, or leave it blank to use the default.

Each payment method in the product has a unique uuid associated to it. Use this uuid to change the default payment method on the account (in this example, the payment method id `a91161b0-d159-11e3-9c1a-0800200c9a66` becomes the default one):

To get information on a payment method, use the following endpoint:

The `withPluginInfo` query parameter tells the product to fetch plugin specific properties. These properties are custom key/value pairs the plugin knows about the payment method, that are specific to that payment method.

To delete a payment method:

The payment method will be marked as inactive in the product. The actual deletion of the information is plugin specific (delete the information in the gateway, etc.).

Note that by default you cannot delete the default payment method on an account (because it is assumed to be used for recurring payments). If you really want to delete it though, you can pass the query parameter deleteDefaultPmWithAutoPayOff=true to the previous call. This will delete it and set the account in AUTO_PAY_OFF (invoices won't be paid automatically anymore).

### Payment Methods and plugin names

By default, each plugin has a *name* which is specific to the plugin and configured in the plugin code. On start-up, the product detects all the plugins and starts them. When a plugin is started, it gets *registered* with the product with its name.

When a payment method is added in the product via the `the product#addPaymentMethod`, the name of the plugin corresponding to the payment method needs to be specified by the merchant application. This gets saved in the product database as part of the payment method record.

the product then uses the plugin name to route the payment processing to the appropriate plugin. So, while charging a customer against a payment method, the plugin name corresponding to the payment method is retrieved from the product database and the payment is processed by the corresponding plugin.

As explained earlier, each end-user has an `account` in the product. Each `account` has a default payment method associated with it. In case the end-user is to be charged against the default payment method, the plugin name corresponding to the default payment method is retrieved and used. A merchant application can also explicitly specify a payment method against which the end-user should be charged. In such cases, the plugin name corresponding to the specified payment method is retrieved and used.

#### Payment Methods and plugin names example

Suppose there are two payment plugins named *PluginA* and *PluginB*. When the product is started, it starts both plugins which register themselves with the product as *PluginA* and *PluginB* respectively. Now suppose an end-user enters payment method details corresponding to *PluginA*. When the merchant application invokes `the product#addPaymentMethod`, *PluginA* needs to be specified along with the payment method details for *PluginA*. This creates a `PaymentMethod` record in the product database with the payment method details and plugin name as *PluginA*.

An end-user can choose to enter multiple payment methods. So, if the end-user chooses to enter payment method details corresponding to *PluginB*, the merchant application needs to invoke `the product#addPaymentMethod` with plugin name as *PluginB*. This creates another `PaymentMethod` record in the product database corresponding to *PluginB*.

Assuming that *PluginA* is the default payment method associated with the account, the product then retrieves the plugin name (*PluginA*) from the database and routes the payment processing to the *PluginA* code.

In case the merchant application wishes to override the default payment method and charge the customer using *PluginB*, it needs to specify the payment method id corresponding to *PluginB*. the product then retrieves the plugin name (*PluginB*) corresponding to the payment method id and charges the customer using *PluginB*.

A *payment method* refers to the end-user's payment details. When an end-user enters his/her payment details (like card information) into a merchant website, these payment details need to be saved in the product in order for the product to be able to process recurring payments. Additionally, the payment details may need to be saved within the payment gateway so that the end user does not have to enter their payment details each time.

The PaymentApi#addPaymentMethod is the entry point for saving a payment method in the product. Thus, a merchant website needs to invoke this method in order to save the payment details as a payment method in the product.

[[payment_method_flows]]
### Payment Method Flows Overview

*Payment method flows* describe how a payment method gets created in the product.

the product supports three main payment method flows as follows:

* *Client-Side Tokenization* - In this case, the end user's payment method details are converted into a token which is sent to the product.

*  *Hosted Payment Page* - In this case, the merchant website redirects the end-user to a page on the payment gateway, which collects the payment method details. the product then fetches a gateway-specific token from the payment gateway.

* *Server-Side Tokenization* - In this case, the end-user's payment details are sent to the product, which then sends these to the payment gateway to perform tokenization.

The flow diagrams below explain these payment method flows. We consider the following actors:

* *Browser*: The end-user sitting behind a browser and initiating the payment method flow
