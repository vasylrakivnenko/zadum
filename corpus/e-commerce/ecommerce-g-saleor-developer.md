An attribute is a reusable field that can be assigned to a product or a variant, similar to fields in a CMS.

Here is an overview of all possible attribute types:
  Name                   Description                                                                                             Example

  **Dropdown**           List of predefined choices; rendered as a single-select dropdown.                                       Store a color of a variant with predefined choices: orange, black, blue, etc.
  **Multiselect**        List of predefined choices; rendered as a multi-select dropdown.                                        Add multiple tags to a product or a page.
  **File**               Allows to store a file as an attribute value; rendered as a file input.                                 Store a product manual as a PDF file; store a hero image for a page.
  **Reference**          Values are references to other entities such as products, variants, pages, collections or categories.   Render a list of related products on a product page.
  **Single reference**   Stores a reference to other entity such as product, variant, page, collection or category.              Render a related collection on a product page.
  **Numeric**            Values are numbers; optionally, a unit can be provided to represent measures and dimensions.            Dimensions of a product represented with three numeric attributes: length, width, and depth.
  **Rich text**          Value is stored as rich-text content; rendered as a rich-text editor.                                   Additional content blocks for a page or product.
  **Plain text**         Value is stored as plain text; rendered as a text input.                                                Stores unformatted text for simple labels, e.g., "Material: 100% Cotton".
  **Swatch**             Stores a color code or an image.                                                                        Stores a color or an image to visually represent options like colors or patterns.
  **Boolean**            Allows storing boolean values.                                                                          Yes/no properties, e.g., "Product is fair trade certified: yes/no".
  **Date**               Allows storing date values.                                                                             Store release date of a product.
  **Date time**          Allows storing date-time values.                                                                        Store release date with the time of a product.

### Reference attributes with restricted choices

You can restrict the allowed target types for `Reference` and `Single reference` attributes.

- For `PRODUCT` and `PRODUCT_VARIANT` reference attributes (reference attributes with `PRODUCT` or `PRODUCT_VARIANT` entity type), define the allowed product types.
- For `PAGE` reference attributes (reference attributes with `PAGE` entity type), define the allowed page types.
- Category and collection reference attributes (reference attributes with `CATEGORY` or `COLLECTION` entity type) do not support restricting choices.

Configure these constraints on the attribute using the `AttributeCreate` or `AttributeUpdate`
mutation by providing the `referenceTypes` field.

When assigning a reference attribute value to a product, variant, or page, if the target does not match one of the allowed types,
a validation error is returned.

Changing the allowed reference types does not modify existing references.

If you clear the allowed types, updates to existing references and any newly provided references will no longer be validated against types.

See the guide on configuring reference attributes with restricted choices.

## Product and Content Types

A type is a collection of attributes that make up the shape of data in a product or a content block.

## Reusable attributes

Each attribute configuration is reusable across different product types, which is convenient when managing them across multiple products.

For example attribute **T-shirt Size** might have range of values **S - L** where is attribute **Shoe Size** have **34-46**, therefore they can be used in different product types without creating attribute from scratch in each flavor of Shoe or T-shirt product type.

Using dropdown attributes can also help to maintain consistency across the store.

## Attributes vs. Metadata Difference

the product uses both Attributes and Metadata in various places. Attributes have a strict structure with data types, validation, schema etc. Metadata is a simple `key: value` structure without types. You might wonder, do we need both? Or which should I use where?

Attributes:

- intended to be filled in by people
- strictly typed
- the schema is strict so that the storefront can depend on this value being of a specific shape e.g. a field for number of pages will not contain a photo of jeans
- attributes are typically used in the UI layer, presented to customers, merchandisers, or admins

Metadata:

- intended to be filled by an app, an automation or integration through the API
- validation should happen in unit tests of the app
- metadata has no schema so that it doesn’t require a human to change how the code is operating with them

Sales channels allow you to model your data across different regions, brands, and business models where data can be customized and shared across different channels. Another way to describe channels is the ability to serve customers and markets differently from a **single backend** instance.

### Relationships and scope

Adding a channel creates a wide scope of customization options; below is the degree of customization per entity:

  Entity                 Degree of customization per channel

  **Checkout**           Contextualized to a channel to display the appropriate stock, prices, taxes, etc.
  **Product**            Control visibility, availability, search, publication date
  **Variants**           Control availability and price
  **Taxes**              Control calculation methods, gross or net, country exceptions
  **Vouchers**           Control availability, discount values, rules
  **Orders**             Contextualized to the channel and required channel permission for access.
  **Promotions**         Control availability, rules, and pricing
  **Payment flow**       Settings for authorization, payment conditions, expiration, etc.
  **Currency**           Channel belongs to a single currency.
  **Warehouses**         Availability
  **Permission group**   Assigned to channels to control access to sensitive data
  **Shipping rates**     Availability, price, order total conditions
  **Shipping zones**     Availability

### How Channels are used

- **Multiple geographical markets:** Each market has different prices, taxes, shipping options, stock availability, back-office integrations, etc.

- **B2B and B2C:** Customer types can map Channels to grant exclusivity of prices and services.

- **Different Legal Entities:** Businesses that have different legal entities can restrict access to customer and order data per entity

- **Distribution channels:** Serving physical and online channels

- **Multi-brand:** Businesses that wish to share customer data, loyalty programs, and products but want separate order data.

- **A/B testing:** Testing different pricing strategies for product and fulfillment.

- **External channels:** Create dedicated channels for marketplaces or other sales platforms.

### Not ideal for

- Dynamic Currency conversion. Each channel can have a different currency; however, `Checkout` belongs to a single channel, so converting to another channel would not be straightforward. That is because each channel can have different stock, prices, taxes, etc.

- Customer-specific pricing. Potentially, you could serve customers differently using channels, but note that each channel also adds configuration complexity. See relationships and scope for more details.;

- Supplier-specific pricing. If you wish to sell a single product at a different price depending on the supplier, using channels would not work because each checkout is scoped to a single channel; you would have to implement price list functionality instead. See example repository.

### Channel access control

Admin access to order data can be configured on a channel level, this is useful for businesses that have different legal entities that should not have access to each other's data.
Other objects such as products, vouchers, shipping, can belong to multiple channels at once so their permissions are not scoped per channel to avoid complexity.

### Data model

### Why Is There No Cart Model?

the product has no distinct object type for shopping carts and checkouts. We wanted the same features – like discounts, vouchers, address-specific taxes, and shipping estimates – to be available in the cart and the checkout, so we've decided to use the same object type for both.
Checkout provides the interface for standard cart operations like adding products or promo codes. It can also be processed in almost any order, for example, by saving a billing address before adding any items.

### Glossary

- **Checkout**: Object that groups all the data needed for the checkout process and creating an order.
- **Checkout Line**: Items added to the checkout with quantity data. Each added variant has a separate line.
- **Checkout Completion**: During this step, payments may be processed and stocks may be reserved. If requirements are met, the order is created.
- **Payment Gateway**: Payment App or legacy plugin. e.g., Adyen, Stripe.
- **Transaction**: Object containing status and additional data about payment.
- **Shipping Methods**: The way orders will be sent. E.g., DHL courier, postal service.
- **Collection Points**: Places where orders can be self-picked.
- **Delivery Methods**: Union of shipping methods and collection points.

## Multiple Channels and Checkout

Depending on the chosen channel, the user will have access to different objects. This impacts available:

- Products and Product Variants
- Payment Gateways
- Shipping Methods
- Collection Points
- Discounts

Learn more about using multiple channels.

## Permissions

A checkout is identified by a UUID-based ID.
Anyone who knows this ID can query or modify the checkout.

The table below shows what is publicly accessible when you know the checkout ID,
and what requires ownership or staff/app permissions.

  Public   Private

  **Cart details**: products in the checkout, quantities, discounts, totals   **User**: returned only to the authenticated owner or staff/app with `MANAGE_CHECKOUTS`
  **Addresses & contact**: shipping and billing address, customer email, customer note   **Transactions**: require staff/app with `MANAGE_CHECKOUTS` and `HANDLE_PAYMENTS`
  **Delivery options**: shipping methods, collection points, selected delivery method   **Private metadata**: only staff with `MANAGE_CHECKOUTS`
  **Public metadata**

Discounts allow for the reduction of prices for selected variants, products, collections,
or categories by a given percentage or a fixed value. They can also decrease the value
of subtotal and shipping price or grant a gift if certain conditions are met.

## Classification

To better understand the product discounts and explain the terms used in this documentation, let's classify discounts
by type, level and value type.

### Type
There are three kinds of discounts in the product: `Promotions`,
`Vouchers` and `Manual discounts`.
The **promotion** discount is automatically applied to all products included in the promotion,
without requiring any additional actions from the user.
In contrast, **voucher** requires the customer to provide a code during the checkout process (or staff user during draft order process).
Lastly, the product offer **manual discounts**, which can be applied by staff users.

* promotions
    * catalogue promotion
    * order promotion
* vouchers
    * entire order
    * specific product
    * voucher applied to the cheapest line
    * shipping
* manual discounts
    * manual order discount
    * manual line discount

### Level
We can distinguish discounts by the object they are associated with.
Line-level discounts are applicable first, directly to the order line, and decrease the line base prices.
Order-level discounts are associated with an order object, they decrease subtotal or shipping price,
and next the discount is propagated to the order's lines.

* **line-level discounts**
    * catalogue promotion
    * specific product vouchers
    * vouchers with applyOncePerOrder=True
    * shipping voucher (despite being associated with the order,
    and not with the order line, it decreases the shipping base price,
    so should be considered as line-level discount)
    * manual line discount

* **order-level discounts**
    * order promotion
    * entire order voucher
    * manual order discount

### Value Type
In general, discounts can take two forms:
* **fixed** - fixed amount, that is deducted from the original price
* **percentage** - percentage value of the original price

## Difference Between Vouchers and Gift Cards
While both vouchers and gift cards are applied and removed using the same mutations (`checkoutAddPromoCode` / `checkoutRemovePromoCode`), they work differently:
- **Vouchers** reduce the **subtotal**, product **unit price**, or **shipping price** depending on voucher type and conditions.
- **Gift cards** reduce the **total price** of the checkout.

**Scope:** Vouchers are scoped to **channels**, while gift cards are created **per currency** and can be used across multiple channels as long as the currency matches.

Gift cards in the product are digital codes that customers can redeem during checkout to reduce the total order amount. In the product, they can be created by staff or purchased directly at checkout.

Gift cards are not assigned to any channel and can be used in any channel whose currency matches the gift card's currency.

**Gift Cards vs Vouchers**

Gift cards are currency-based and usable across channels with the same currency. Depending on how gift cards are used they may reduce the total price of a checkout.
Vouchers discount the subtotal, unit price, or shipping and are scoped to channels.

## Creating and Managing Gift Cards

Staff users with the `MANAGE_GIFT_CARD` permission can create gift cards directly in the product and send them to customers. Gift cards can be created individually or in bulk, and can have an expiry date set or be non-expiring.

### Creating Gift Cards

#### Single Gift Card Creation
The following example shows how to create a single gift card. Once you provide the `userEmail` and configure the email plugin for the given channel, the gift card is sent to the customer, and the `SENT_TO_CUSTOMER` event is created. In this example, providing the `expiryDate` value will set the expiry date. If you want to create a non-expiring card, do not provide the `expiryDate` value.

#### Bulk Gift Card Creation
Creating gift cards in bulk is similar, but you need to specify the number of gift cards to create and the tag value which will be assigned to all created gift cards.

After creation, you can export the gift card codes to CSV. Read more about exporting gift cards.

### Managing Gift Cards

#### Resending Gift Cards
You can resend the gift card to the customer at any time after creation. If the `userEmail` is not provided, the card is sent to the customer who already used the card. If the card hasn't been used yet, it is sent to the customer who created it.

#### Updating Gift Cards
After creation, the tag, expiry date, and balance amount can be updated.

Updating the balanceAmount will update both current and initial ballance, no matter if the card has already been used.

#### Adjusting the Balance

Added in the product 3.23.

Use the `giftCardBalanceAdjust` mutation to change a card's current balance by an `amount` instead of overwriting it. A positive amount tops the card up, and a negative amount deducts from it.

Unlike `giftCardUpdate` (which sets `balanceAmount` to an absolute value and records a `BALANCE_RESET` event), the adjustment is applied atomically at the database level. This makes it safe to run while a card is being charged in a concurrent checkout, so no update is silently lost. Each adjustment records a `BALANCE_ADJUSTED` event.

The mutation applies two clamping rules:

- A deduction that would take the balance below zero clamps the current balance to zero.
- A top-up above the current initial balance raises the initial balance to the new current balance.

The `amount` cannot be zero and must match the currency precision of the card. The staff member or app needs the `MANAGE_GIFT_CARD` permission.

#### Activating and Deactivating Gift Cards
Cards can be activated and deactivated at any time, either individually or in bulk.

For bulk operations, use `giftCardBulkActivate` and `giftCardBulkDeactivate` mutations.

## Restricting Gift Cards to a Customer

Added in the product 3.23.

By default, a gift card is a **bearer instrument**: whoever holds the code can redeem it, including in guest checkout. Customer assignment is an **opt-in restriction** layered on top of this default. Once a card is restricted to a customer, only that customer's account can use it, and the card can no longer be redeemed in guest checkout.

Assignment is distinct from `usedBy`:

- `assignedTo` is forward-looking — the customer who is **allowed** to spend the card. It is a restriction that staff set on purpose.
- `usedBy` is historical — the last customer who **spent** the card. It is an audit record and is deprecated.

Assignment is manual only. the product never auto-assigns a card to whoever pays with it. A card stays unrestricted until staff explicitly assign it.

### Assigning a Customer

You can restrict a card to a customer at creation time by passing `assignedTo` (a customer's user ID) to `giftCardCreate`, or afterwards with the `giftCardAssignUser` mutation. Both require the `MANAGE_GIFT_CARD` permission and trigger the `GIFT_CARD_UPDATED` webhook.

Assigning a customer records an `ASSIGNED_TO_USER` event and stores the customer's email on the card.

A card cannot be assigned when it has already been used in an order, when it is attached to a checkout that has payments, or when it has been used by a gift card payment transaction. In those cases the mutation returns a `CANNOT_ASSIGN` error. If the card is attached to a checkout that has no payments, the card is detached from that checkout as part of the assignment.

The link between a gift card and a payment transaction is permanent: cancelling the authorization does **not** release the card for assignment. The link is the record that the card was used.

The `assignedTo` field on `GiftCard` requires the `MANAGE_USERS` permission (or the card's owner), while `assignedToEmail` requires `MANAGE_GIFT_CARD` (or being the owner of that gift card). Enforcement at checkout is intentionally generic: a restricted card that does not match the customer is rejected with the same error as any unusable code, so it never reveals whether a card is assigned or to whom. This applies to both the `transactionInitialize` and the legacy `checkoutAddPromoCode` flows.

### Unassigning a Customer

Use the `giftCardUnassignUser` mutation to remove the restriction and return the card to bearer behavior. It requires the `MANAGE_GIFT_CARD` permission, triggers the `GIFT_CARD_UPDATED` webhook, and records an `UNASSIGNED_FROM_USER` event.

Deleting the customer a card is assigned to does **not** lift the restriction. the product keeps the assignment trace so the card stays locked rather than silently becoming spendable by anyone again. To make the card usable, reassign it to another customer or unassign it explicitly.

### Filtering by Assigned Customer
