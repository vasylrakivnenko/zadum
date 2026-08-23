the product v2.0 introduced a number of changes and new APIs to enable developers to build multi-vendor marketplace apps.

This is a type of application in which multiple sellers are able to list products, and then customers can create orders containing products from one or more of these sellers. Well-known examples include Amazon, Ebay, Etsy and Airbnb.

This guide introduces the major concepts & APIs you will need to understand in order to implement your own multi-vendor marketplace application.

## Multi-vendor plugin

All the concepts presented here have been implemented in our example multi-vendor plugin. The guides here will refer to specific parts of this plugin which you should consult to get a full understanding of how an implementation would look.

**Note:** the example multi-vendor plugin is for educational purposes only, and for the sake of clarity leaves out several parts that would be required in a production-ready solution, such as email verification and setup of a real payment solution.

## Sellers, Channels & Roles

The core of the product's multi-vendor support is Channels. Read the Channels guide to get a more detailed understanding of how they work.

Each Channel is assigned to a Seller, which is another term for the vendor who is selling things in our marketplace.

So the first thing to do is to implement a way to create a new Channel and Seller.

In the multi-vendor plugin, we have defined a new mutation in the Shop API which allows a new seller to register on our marketplace:

Executing the `registerNewSeller` mutation does the following:

- Create a new Seller representing the shop "Bob's Parts"
- Create a new Channel and associate it with the new Seller
- Create a Role & Administrator for Bob to access his shop admin account
- Create a ShippingMethod for Bob's shop
- Create a StockLocation for Bob's shop

Bob can now log in to the Dashboard using the provided credentials and begin creating products to sell!

### Keeping prices synchronized

In some marketplaces, the same product may be sold by multiple sellers. When this is the case, the product and its variants
will be assigned not only to the default channel, but to multiple other channels as well - see the
Channels, Currencies & Prices section for a visual explanation of how this works.

This means that there will be multiple ProductVariantPrice entities per variant, one for each channel.

In order
to keep prices synchronized across all channels, the example multi-vendor plugin sets the `syncPricesAcrossChannels` property
of the DefaultProductVariantPriceUpdateStrategy
to `true`. Your own multi-vendor implementation may require more sophisticated price synchronization logic, in which case
you can implement your own custom ProductVariantPriceUpdateStrategy.

## Assigning OrderLines to the correct Seller

In order to correctly split the Order later, we need to assign each added OrderLine to the correct Seller. This is done with the OrderSellerStrategy API, and specifically the `setOrderLineSellerChannel()` method.

The following logic will run any time the `addItemToOrder` mutation is executed from our storefront:

The end result is that each OrderLine in the Order will have its `sellerChannelId` property set to the correct Channel for the Seller.

## Shipping

When it comes time to choose a ShippingMethod for the Order, we need to ensure that the customer can only choose from the ShippingMethods which are supported by the Seller. To do this, we need to implement a ShippingEligibilityChecker which will filter the available ShippingMethods based on the `sellerChannelId` properties of the OrderLines.

Here's how we do it in the example plugin:

In the storefront, when it comes time to assign ShippingMethods to the Order, we need to ensure that
every OrderLine is covered by a valid ShippingMethod. We pass the ids of the eligible ShippingMethods to the `setOrderShippingMethod` mutation:

Now we need a way to assign the correct method to each line in an Order. This is done with the ShippingLineAssignmentStrategy API.

We will again be relying on the `sellerChannelId` property of the OrderLines to determine which ShippingMethod to assign to each line. Here's how we do it in the example plugin:

## Splitting orders & payment

When it comes to payments, there are many different ways that a multi-vendor marketplace might want to handle this. For example, the marketplace may collect all payments and then later disburse the funds to the Sellers. Or the marketplace may allow each Seller to connect their own payment gateway and collect payments directly.

In the example plugin, we have implemented a simplified version of a service like Stripe Connect, whereby each Seller has a `connectedAccountId` (we auto-generate a random string for the example when registering the Seller). When configuring the plugin we also specify a "platform fee" percentage, which is the percentage of the total Order value which the marketplace will collect as a fee. The remaining amount is then split between the Sellers.

The OrderSellerStrategy API contains two methods which are used to first split the Order from a single order into one _Aggregate Order_ and multiple _Seller Orders_, and then to calculate the platform fee for each of the Seller Orders:

- `OrderSellerStrategy.splitOrder`: Splits the OrderLines and ShippingLines of the Order into multiple groups, one for each Seller.
- `OrderSellerStrategy.afterSellerOrdersCreated`: This method is run on every Seller Order created after the split, and we can use this to assign the platform fees to the Seller Order.

## Custom OrderProcess

Finally, we need a custom OrderProcess which will help keep the state of the resulting Aggregate Order and its Seller Orders in sync. For example, we want to make sure that the Aggregate Order cannot be transitioned to the `Shipped` state unless all of its Seller Orders are also in the `Shipped` state.

Conversely, we can automatically set the state of the Aggregate Order to `Shipped` once all of its Seller Orders are in the `Shipped` state.

Channels are a feature of the product which allows multiple sales channels to be represented in a single the product instance. A Channel allows you to:

* Set Channel-specific currency, language, tax and shipping defaults
* Assign only specific products to the channel (with channel-specific prices)
* Create administrator roles limited to one or more channels
* Assign specific stock locations, assets, facets, collections, promotions, and other entities to the channel
* Have orders and customers associated with specific channels.

This is useful for a number of use-cases, including:

- **Multi-tenancy**: Each channel can be configured with its own set of products, shipping methods, payment methods, etc. This
  allows you to run multiple shops from a single the product server.
- **Multi-vendor**: Each channel can represent a distinct vendor or seller, which can be used to implement a marketplace.
- **Region-specific stores**: Each channel can be configured with its own set of languages, currencies, tax rates, etc. This
  allows you to run multiple stores for different regions from a single the product server.
- **Distinct sales channels**: Each channel can represent a sales channel of a single business, with one channel for the online
  store, one for selling via Amazon, one for selling via Facebook etc.

Every the product server always has a **default Channel**, which contains _all_ entities. Subsequent channels can then contain a subset of channel-aware entities.

## Channel-aware entities

Many entities are channel-aware, meaning that they can be associated with multiple channels. The following entities are channel-aware:

- `Asset`
- `Collection`
- `Customer`
- `Facet`
- `FacetValue`
- `Order`
- `PaymentMethod`
- `Product`
- `ProductVariant`
- `Promotion`
- `Role`
- `ShippingMethod`
- `StockLocation`

## Channels & Sellers

Each channel is also assigned a single `Seller`. This entity is used to represent
the vendor or seller of the products in the channel. This is useful for implementing a marketplace, where each channel represents
a distinct vendor. The `Seller` entity can be extended with custom fields to store additional information about the seller, such as a logo, contact details etc.

## Channels, Currencies & Prices

Each Channel has a set of `availableCurrencyCodes`, and one of these is designated as the `defaultCurrencyCode`, which sets the default currency for all monetary values in that channel.

Internally, there is a one-to-many relation from `ProductVariant` to `ProductVariantPrice`. So the ProductVariant does _not_ hold a price for the product - this is actually stored on the `ProductVariantPrice` entity, and there will be at least one for each Channel to which the ProductVariant has been assigned.

In this diagram we can see that every channel has at least 1 `ProductVariantPrice`. In the case of the UK Channel, there are 2 prices assigned - one for
GBP and one for USD. This means that you are able to define multiple prices in different currencies on a single product variant for a single channel.

**Note:** in the diagram above that the ProductVariant is **always assigned to the default Channel**, and thus will have a price in the default channel too. Likewise, the default Channel also has a defaultCurrencyCode. Depending on your requirements, you may or may not make use of the default Channel.

### Keeping prices synchronized

When you have products assigned to multiple channels, updates to the price of a product in one channel will not automatically
be reflected in other channels. For instance, in the diagram above, both the Default channel and the UK channel have a price
in USD for the same product variant.

If an administrator of the UK channel changes the USD price to $20, the price in the Default channel will remain at $30. This
is the default behavior, and is controlled by the ProductVariantPriceUpdateStrategy.

If you want to keep prices synchronized across all channels, you can set the `syncPricesAcrossChannels` property of the
DefaultProductVariantPriceUpdateStrategy
to `true`. This will ensure that when the price of a product variant is updated in one channel, the price in all other channels
(of that particular currency) will be updated to match.

You may however require even more sophisticated logic. For instance, you may want a one-way synchronization, where the price
in the Default channel is always the master price, and the prices in other channels are updated to match. In this case, you
can create a custom `ProductVariantPriceUpdateStrategy` which implements the desired logic.

## Use cases

### Single shop

This is the simplest set-up. You just use the default Channel for everything.

### Multiple separate shops

Let's say you are running multiple distinct businesses, each with its own distinct inventory and possibly different currencies. In this case, you set up a Channel for each shop and create the Product & Variants in the relevant shop's Channel.

The default Channel can then be used by the superadmin for administrative purposes, but other than that the default Channel would not be used. Storefronts would only target a specific shop's Channel.

### Multiple shops sharing inventory

Let's say you have a single inventory but want to split it between multiple shops. There might be overlap in the inventory, e.g. the US & EU shops share 80% of inventory, and then the rest is specific to either shop.

In this case, you can create the entire inventory in the default Channel and then assign the Products & ProductVariants to each Channel as needed, setting the price as appropriate for the currency used by each shop.

**Note:** When creating a new Product & ProductVariants inside a sub-Channel, it will also **always get assigned to the default Channel**. If your sub-Channel uses a different currency from the default Channel, you should be aware that in the default Channel, that ProductVariant will be assigned the **same price** as it has in the sub-Channel. If the currency differs between the Channels, you need to make sure to set the correct price in the default Channel if you are exposing it to Customers via a storefront.

### Multi-vendor marketplace

This is the most advanced use of channels. For a detailed guide to this use-case, see our Multi-vendor marketplace guide.

## Specifying channel in the GraphQL API

To specify which channel to use when making an API call, set the `'the product-token'` header to match the token of the desired Channel.

For example, if we have a UK Channel with the token set to "uk-channel" as shown in this screenshot:

Then we can make a GraphQL API call to the UK Channel by setting the `'the product-token'` header to `'uk-channel'`:

This is an example using Apollo Client in React. The same principle applies to any GraphQL client library - set the `'the product-token'` header to the token of the desired Channel.

With the above header set, the API call will be made to the UK Channel, and the response will contain only the entities which are assigned to that Channel.

Roles are the foundation of the product's **role-based access control (RBAC)** system. A Role is a named
collection of Permissions that determines what actions an administrator
is allowed to perform.

## How roles work

Each `Administrator` is assigned one or more Roles.
When an administrator makes a request to the Admin API, the product checks whether their combined roles include
the permission required for that operation. If not, the request is denied.

When an administrator has multiple roles, the permissions from all roles are **unioned together**. This
means an administrator with an "Order Manager" role and a "Catalog Manager" role can perform all actions
allowed by either role.

## Built-in roles

the product creates two special roles automatically. These roles cannot be modified or deleted:

- **SuperAdmin** — carries every permission in the system. This role is assigned to the first
  administrator created during server initialization. It grants unrestricted access to all operations
  across all channels.

- **Customer** — assigned to every registered customer. This role carries the minimum permissions
  required for a customer to manage their own account, such as viewing their order history and
  updating their profile.

## Custom roles

Beyond the built-in roles, administrators can create any number of custom roles to match their
organizational structure. A custom role is defined by selecting the specific permissions it should
grant.

Common patterns include roles like "Inventory Manager" (stock and product permissions), "Order
Processor" (order and fulfillment permissions), or "Marketing Lead" (promotion and collection
permissions). The granularity of the product's permission system means you can tailor roles precisely
to each team member's responsibilities.

## Channel-scoped roles

Roles can optionally be **scoped to one or more Channels**. This is a powerful feature for multi-tenant
and multi-vendor setups where different administrators should only have access to specific parts of the
system.

For example, in a marketplace scenario, a seller's administrator might have a "Seller Product Manager"
role that is scoped only to that seller's channel. They can manage products within their channel but
have no visibility into other channels or the default channel.

A single administrator can have a mix of channel-scoped and global roles, providing flexible access
control that scales with the complexity of your business.

## Role assignment

Roles are assigned to administrators through the Admin API or the admin interface. Changes take effect
on the administrator's next authenticated request — there is no need to invalidate sessions.

## Further reading

- Permissions — the individual permissions that make up a role
- User Management — how users and administrators relate
- Channels — channel-scoped access control for multi-tenant setups