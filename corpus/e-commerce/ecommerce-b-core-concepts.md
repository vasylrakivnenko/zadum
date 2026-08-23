Your catalog is composed of `Products` and `ProductVariants`.
A `Product` always has _at least one_ `ProductVariant`. You can think of the product as a "container" which includes a name, description, and images that apply to all of
its variants.

Here's a visual example, in which we have a "Hoodie" product which is available in 3 sizes. Therefore, we have
3 variants of that product:

Multiple variants are made possible by adding one or more `ProductOptionGroups` to
the product. These option groups then define the available `ProductOptions`

If we were to add a new option group to the example above for "Color", with 2 options, "Black" and "White", then in total
we would be able to define up to 6 variants:

- Hoodie Small Black
- Hoodie Small White
- Hoodie Medium Black
- Hoodie Medium White
- Hoodie Large Black
- Hoodie Large White

When a customer adds a product to their cart, they are adding a specific `ProductVariant` to their cart, not the `Product` itself.
It is the `ProductVariant` that contains the SKU ("stock keeping unit", or product code) and price information.

## Product price and stock

The `ProductVariant` entity contains the price and stock information for a product. Since a given product variant can have more
than one price, and more than one stock level (in the case of multiple warehouses), the `ProductVariant` entity contains
relations to one or more `ProductVariantPrice` entities and
one or more `StockLevel` entities.

## Facets

`Facets` are used to add structured labels to products and variants. Facet values can be assigned to products or product variants, and are commonly used for catalog organization, storefront filtering, and internal business logic.

For a detailed explanation of facets, filtering, and how they relate to collections, see the Facets & Filters guide.

`Collections` are used to categorize and organize your catalog. A collection
contains multiple product variants, and a product variant can belong to multiple collections. Collections can be nested to
create a hierarchy of categories, which is typically used to create a menu structure in the storefront.

Collections are not _only_ used as the basis of storefront navigation. They are a general-purpose organization tool which can be used
for many purposes, such as:

- Creating a collection of "new arrivals" which is used on the homepage.
- Creating a collection of "best sellers" which is used to display a list of popular products.
- Creating a collection of "sale items" which is used to apply a discount to all products in the collection, via a promotion.

## Collection filters

The specific product variants that belong to a collection are determined by the collection's `CollectionFilters`.
A collection filter is a piece of logic which is used to determine whether a product variant should be included in the collection. By default, the product
includes a number of collection filters:

- **Filter by facet values**: Include all product variants which have a specific set of facet values.
- **Filter by product variant name**: Include all product variants whose name matches a specific string.
- **Manually select product variants**: Allows manual selection of individual product variants.
- **Manually select products**: Allows manual selection of entire products, and then includes all variants of those products.

Collections often work hand-in-hand with facets and filters to provide structured navigation in your storefront.

### Filter inheritance

When a collection is nested within another collection, the child collection can inherit the parent's collection filters. This means that the child collection
will _combine_ its own filters with the parent's filters.

In the example above, we have a parent collection "Menswear", with a child collection "Mens' Casual". The parent collection has a filter which includes all
product variants with the "clothing" and "mens" facet values. The child collection is set to inherit the parent's filters, and has an additional filter which
includes all product variants with the "casual" facet value.

Thus, the child collection will include all product variants which have the "clothing", "mens" and "casual" facet values.

When filter inheritance is enabled, a child collection will contain a **subset** of the product variants of its parent collection.

In order to create a child collection which contains product variants _not_ contained by the parent collection, you must disable filter inheritance
in the child collection.

For details on creating custom collection filters, see the Developer Guide.

## Code Examples

### Custom CollectionFilter

You can create your own custom collection filters with the `CollectionFilter` class. This class
is a configurable operation where the specific
filtering logic is implemented in the `apply()` method passed to its constructor.

The `apply()` method receives an instance of the TypeORM SelectQueryBuilder which should have filtering logic
added to it using the `.andWhere()` method.

Here's an example of a collection filter which filters by SKU:

In the `apply()` method, the product variant entity is aliased as `'productVariant'`.

This custom filter is then added to the defaults in your config:

To see some more advanced collection filter examples, you can look at the source code of the
default collection filters.

Facets are the primary mechanism for attaching structured, queryable metadata to your catalog. A `Facet` represents a label category — such as "Brand", "Material", or "Season" — and contains one or more `FacetValues` representing specific entries within that category, like "Nike", "Cotton", or "Summer 2025".

## Facets and FacetValues

The relationship is straightforward:

- A **Facet** is a named grouping (e.g., "Color").
- A **FacetValue** is a specific value within that grouping (e.g., "Red", "Blue", "Green").

FacetValues can be assigned to `Products` or `ProductVariants`. Assigning at the product level applies the value to all of that product's variants. Assigning at the variant level allows more granular control — for instance, tagging only certain color variants with a "Limited Edition" value.

## Three primary use cases

Facets serve three distinct purposes in the product, all built on the same underlying data model:

### 1. Collection basis

Collections can be configured to automatically include products based on facet value membership. For example, a "Running Shoes" collection might include all products tagged with the "Running" value from the "Category" facet. When new products receive that facet value, they are automatically added to the collection.

### 2. Storefront filtering (faceted search)

When customers browse a collection or search the catalog, facet values power the familiar "filter by" sidebar. The search system returns **facet value aggregations** — counts of how many results match each facet value — so your storefront can display dynamic filter options like "Brand: Nike (12), Adidas (8)" and let customers narrow their results.

Filters within the same facet are typically combined with OR logic (show Nike _or_ Adidas), while filters across different facets use AND logic (show Nike _and_ size Large).

### 3. Internal logic

Facets are not limited to customer-facing features. You can use them to drive backend behavior:

- A promotion that applies a 20% discount to all variants tagged with "Clearance".
- A shipping rule that adds a surcharge for products tagged with "Oversized" or "Fragile".
- Business reporting that groups sales by "Product Line" or "Supplier".

## Public vs. private facets

Each facet has a `isPrivate` flag. When set to `true`, the facet and its values are hidden from the Shop API and will not appear in storefront search results or filter menus. Private facets are only visible in the Admin API.

This is useful for facets that drive internal logic — like a "Warehouse Location" or "Margin Tier" facet — that should not be exposed to customers.

## Facet values and custom fields

Like most the product entities, both Facets and FacetValues support custom fields. This allows you to attach additional data to facet values — for example, a hex color code on "Color" facet values for rendering color swatches in your storefront, or an icon identifier for category facets.

## Channel awareness

Facets and FacetValues are channel-aware. In a multi-channel setup, you can control which facets are available in each channel. A facet created in one channel will also be visible in the default channel, but not necessarily in other sub-channels unless explicitly assigned.

This means you can have channel-specific facets — for instance, a "Region Exclusive" facet that only exists in certain regional channels — while still sharing common facets like "Brand" across all channels.

## Related topics

- Products — How facet values are assigned to products and variants
- Collections — Using facet values as the basis for dynamic collections
- Search — Facet value aggregations in search results
- Promotions — Using facet values to target promotion conditions and actions

A `Customer` is a person who can buy from your shop. A customer can have one or more
`Addresses`, which are used for shipping and billing.

If a customer has registered an account, they will have an associated `User`. The user
entity is used for authentication and authorization. **Guest checkouts** are also possible, in which case a customer will not have a user.

See the User Management guide for a detailed explanation of the relationship between
customers and users.

Customers can be organized into `CustomerGroups`. These groups can be used in
logic relating to promotions, shipping rules, payment rules etc. For example, you could create a "VIP" customer group and then create
a promotion which grants members of this group free shipping. Or a "B2B" group which is used in a custom tax calculator to
apply a different tax rate to B2B customers.

In the product, the `Order` entity represents the entire lifecycle of an order, from the moment a customer adds an item to their cart, through to the point where the order is completed and the customer has received their goods.

An `Order` is composed of one or more `OrderLines`.
Each order line represents a single product variant, and contains information such as the quantity, price, tax rate, etc.

In turn, the order is associated with a `Customer` and contains information such as
the shipping address, billing address, shipping method, payment method, etc.

## The Order Process

the product defines an order process which is based on a finite state machine (a method of precisely controlling how the order moves from one state to another). This means that the `Order.state` property will be one of a set of pre-defined states. From the current state, the Order can then transition (change) to another state, and the available next states depend on what the current state is.

In the product, there is no distinction between a "cart" and an "order". The same entity is used for both. A "cart" is simply an order
which is still "active" according to its current state.

The current state of an order is available via the `state` field on the `Order` type. The next possible states can be queried via the `nextOrderStates` query.

The available states and the permissible transitions between them are defined by the configured `OrderProcess`. By default, the product defines a `DefaultOrderProcess` which is suitable for typical B2C use-cases. Here's a simplified diagram of the default order process:

Let's take a look at each of these states, and the transitions between them:

* **`AddingItems:`** All orders begin in the `AddingItems` state. This means that the customer is adding items to his or her shopping cart. This is the state an order would be in as long as the customer is still browsing the store.
* **`ArrangingPayment:`** From there, the Order can transition to the `ArrangingPayment`, which will prevent any further modifications to the order, which ensures the price that is sent to the payment provider is the same as the price that the customer saw when they added the items to their cart. At this point, the storefront will execute the `addPaymentToOrder` mutation.
* **`PaymentAuthorized:`** Depending on the configured payment method, the order may then transition to the `PaymentAuthorized` state, which indicates that the payment has been successfully authorized by the payment provider. This is the state that the order will be in if the payment is not captured immediately. Once the payment is captured, the order will transition to the `PaymentSettled` state.
* **`PaymentSettled:`** If the payment captured immediately, the order will transition to the `PaymentSettled` state once the payment succeeds.
* At this point, one or more fulfillments can be created. A `Fulfillment` represents the process of shipping one or more items to the customer ("shipping" applies equally to physical or digital goods - it just means getting the product to the customer by any means). A fulfillment can be created via the `addFulfillmentToOrder` mutation, or via the Dashboard. If multiple fulfillments are created, then the order can end up partial states - `PartiallyShipped` or `PartiallyDelivered`. If there is only a single fulfillment which includes the entire order, then partial states are not possible.
* **`Shipped:`** When all fulfillments have been shipped, the order will transition to the `Shipped` state. This means the goods have left the warehouse and are en route to the customer.
* **`Delivered:`** When all fulfillments have been delivered, the order will transition to the `Delivered` state. This means the goods have arrived at the customer's address. This is the final state of the order.

## Order Interceptors

Order Interceptors allow you to intercept operations that add, modify, or remove order lines. Example use-cases include:

* Preventing certain products from being added to the order based on custom criteria
* Enforcing a minimum or maximum quantity of a given product in the order
* Using a CAPTCHA to prevent automated order creation

For details on customizing the order process, see the Developer Guide.

## Code Examples

### Querying order state

You can see the current state of an order via `state` field on the `Order` type:

### Querying next order states

The next possible states can be queried via the `nextOrderStates` query:

### Configuring the default order process

It is possible to customize the defaultOrderProcess to better match your business needs. For example, you might want to disable some of the constraints that are imposed by the default process, such as the requirement that a customer must have a shipping address before the Order can be completed.

This can be done by creating a custom version of the default process using the configureDefaultOrderProcess function, and then passing it to the `OrderOptions.process` config property.

### Custom order processes

Sometimes you might need to extend things beyond what is provided by the default Order process to better match your business needs. This is done by defining one or more `OrderProcess` objects and passing them to the `OrderOptions.process` config property.

#### Adding a new state

Let's say your company can only sell to customers with a valid EU tax ID. We'll assume that you've already used a custom field to store that code on the Customer entity.

Now you want to add a step _before_ the customer handles payment, where we can collect and verify the tax ID.

So we want to change the default process of:

to instead be:

Here's how we would define the new state:

This object means:

* the `AddingItems` state may _only_ transition to the `ValidatingCustomer` state (`mergeStrategy: 'replace'` tells the product to discard any existing transition targets and replace with this one).
* the `ValidatingCustomer` may transition to the `ArrangingPayment` state (assuming the tax ID is valid) or back to the `AddingItems` state.

And then add this configuration to our main VendureConfig:

Note that we also include the `defaultOrderProcess` in the array, otherwise we will lose all the default states and transitions.

To add multiple new States you need to extend the generic type like this:

This way multiple custom states get defined.

#### Intercepting a state transition

Now we have defined our new `ValidatingCustomer` state, but there is as yet nothing to enforce that the tax ID is valid. To add this constraint, we'll use the `onTransitionStart` state transition hook.

This allows us to perform our custom logic and potentially prevent the transition from occurring. We will also assume that we have a provider named `TaxIdService` available which contains the logic to validate a tax ID.

For an explanation of the `init()` method and `injector` argument, see the guide on injecting dependencies in configurable operations.

#### Responding to a state transition

Once an order has successfully transitioned to a new state, the `onTransitionEnd` state transition hook is called. This can be used to perform some action
upon successful state transition.

In this example, we have a referral service which creates a new referral for a customer when they complete an order. We want to create the referral only if the customer has a referral code associated with their account.

Use caution when modifying an order inside the `onTransitionEnd` function. The `order` object that gets passed in to this function
will later be persisted to the database. Therefore any changes must be made to that `order` object, otherwise the changes might be lost.

As an example, let's say we want to add a Surcharge to the order. The following code **will not work as expected**:

Instead, you need to ensure you **mutate the `order` object**:

### TypeScript typings for custom states

To make your custom states compatible with standard services you should declare your new states in the following way:

This technique uses advanced TypeScript features - declaration merging and  ambient modules.

the product does not have a separate "Cart" entity. Instead, a cart is simply an `Order` in the **AddingItems** state. This unified model means that the same entity, the same database table, and the same state machine govern an order from the moment a customer adds their first item all the way through to fulfillment.

## The active order

Every customer session (whether authenticated or guest) can have at most one **active order** — the order in the `AddingItems` state. This is the order that the Shop API's cart-related mutations operate on.

When a customer calls mutations like `addItemToOrder`, `adjustOrderLine`, or `removeOrderLine`, the product automatically finds (or creates) the active order for the current session. There is no need to pass an order ID; the active order is resolved from the session context.

The active order resolution logic is handled by the `ActiveOrderStrategy`. The default strategy uses the session to track the active order, but this can be customized for scenarios like named wishlists or saved carts.

## Order lines

Each item in the cart is represented by an `OrderLine`. An OrderLine links a specific `ProductVariant` to the order, along with:

- **quantity** — How many units of this variant are in the cart.
- **unitPrice / unitPriceWithTax** — The per-unit price as determined by the pricing pipeline.
- **linePrice / linePriceWithTax** — The total for this line (unit price multiplied by quantity, with adjustments applied).
- **adjustments** — Any discounts from promotions that apply to this line.

If a customer adds the same variant twice, the product increments the quantity on the existing OrderLine rather than creating a duplicate.

## Order Interceptors
