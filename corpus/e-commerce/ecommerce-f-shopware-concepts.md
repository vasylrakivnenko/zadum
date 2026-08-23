# Categories

Categories in the product organize products, drive storefront navigation, and define SEO-relevant URLs. The entire catalog lives in one category tree, and every sales channel chooses entry points inside that tree. For how to use the Admin UI, see the user documentation on categories and Dynamic Product Groups. This page focuses on developer details.

## Category model and tree

- Each category stores `parentId`, `path`, and `level` to build breadcrumbs, infer inheritance, and traverse efficiently.
- Flags:
  - `active` determines whether the category participates in navigation and listings.
  - `visible` and `hideInNavigation` control menu rendering without disabling the category entirely.
- Types:
  - `page`: regular category (listing or landing page).
  - `folder`: structuring element; not rendered as a page and typically used to group children.
  - `link`: redirects to an external URL or internal static link.

## Entity associations and database schema

- `category`: tree structure plus `cmsPageId` for layout inheritance; `productAssignmentType` controls explicit vs. stream-based listings.
- `category_translation`: localized names, breadcrumbs, links, and SEO text.
- `product_category`: explicit product links used for listings when not driven by a product stream.
- `product_stream`: dynamic filters attached to a category when assignments are stream-based.
- `cms_page`: CMS layout referenced by categories (inherited when missing).
- `sales_channel`: entry categories (`navigation`, `footer`, `service`) anchoring storefront menus.
- `seo_url`: generated URLs per category and sales channel domain, rebuilt by the SEO indexer.

## Sales channel entry points and navigation

Every Sales Channel defines `navigation`, `footer`, and `service` entry categories. The storefront builds menus from the children of those entry points, inheriting explicit assignments from lower levels.

Store API endpoints:

- `/store-api/navigation/{activeId}/{rootId}` for hierarchical menus.
- `/store-api/category/{navigationId}` for category details including assigned CMS layout data.

Navigation responses are cached. Adjust cache identity or tags via `NavigationRouteCacheKeyEvent` and `NavigationRouteCacheTagsEvent`. Use `NavigationLoadedEvent` to enrich or modify the tree before it is returned.

Categories can be hidden from navigation via the hide-in-navigation flag while remaining reachable by direct URL if they are still `active`.

## Product assignments and Dynamic Product Groups

- Explicit assignments: stored in `product_category` (and `product_category_tree` for inherited links) to put category IDs directly on products.
- Dynamic Product Groups (product streams): attached to a category to evaluate saved filters at runtime and automate listings (for example, brand filters or price ranges). See the user docs for configuration guidance.

Both assignment types are merged for a category listing. `ProductListingRoute` builds the listing criteria from the category configuration, sales channel, and request filters. Extend or alter the listing query with `ProductListingCriteriaEvent`.

## CMS layout integration

Categories can reference a CMS layout. Layout selection is inherited: if `cmsPageId` is missing, the parent layout is used. Category-specific slot configuration is stored on the category and merged at runtime, so one layout can serve many categories with different media and copy. `folder` categories ignore layouts; `link` categories redirect immediately.

## SEO and URLs

Per-category SEO fields include `metaTitle`, `metaDescription`, `keywords`, `seoUrl`, and robot flags (`noIndex`, `noFollow`). SEO URLs are generated from templates under *Settings → SEO* and are rebuilt when categories change or when the SEO indexer runs.

- Customize URL templates (e.g., include the breadcrumb) and priorities per sales channel domain.
- React to regenerated URLs via `SeoUrlUpdateEvent`, or enqueue additional updates when categories are changed programmatically.
- Emit canonical links when rendering custom category pages.

## Extensibility and events

- `NavigationLoadedEvent`: navigation tree loaded; enrich or adjust nodes.
- `SalesChannelCategoryIdsFetchedEvent`: category IDs resolved for a sales channel.
- `CategoryIndexerEvent`: keep de-normalized data or external search indices in sync.
- `ProductListingCriteriaEvent`: customize listing filters, sorting, and aggregations for category pages.
- `SeoUrlUpdateEvent`: observe or react to SEO URL regeneration.

Categories are fully extensible via custom fields or entity extensions. Expose custom data through Store API response extensions when it is needed in storefronts or external channels.

# Catalog

In this section, we will go through the structure that organizes products, prices and everything related to maintaining a **product catalog** within the store.

First, let us understand about products and how they are defined.

# Products

Products are sellable entities (physical and digital products) within your shop.

Depending on your setup, the product can easily handle thousands of products. However, an upsurge in the product quantity (in millions) needs some tweaks for robust running of the environment as it depends on factors like the number of categories, sales channels, product properties, etc. Every product added to your shop can be made available on one or more sales channels.

Let's delve into a more detailed understanding of products using the example of garments:

* **Product details**: General information about a Product.

  Title                Product Id   Manufacturer   Prices   ....

  Levis Ocean Hoodie   SW1001       CA             40       ...

* **Product properties**: Product properties encapsulate property groups and options. They are displayed in a table on product details page, in listings, or even be used for filtering. A product can have arbitrarily many property group options.

  Property Group   Property Group Options

  Size             *S*, *M*, *L*, *XL*, etc
  Color            *Red*, *Blue*, *Green*, *Black*
  Material         *Leather*, *Cotton*, *Jeans*

* **Category**: Products in the product are organized in categories. It is a grouping of products based on characteristics, marketing or search concerns. Categories are represented as a hierarchical tree to form a navigation menu. A product can be contained in multiple categories.

* **Packaging dimensions**: Physical dimensions and weight of the product packaging. These values are stored in standardized units: weight in kilograms (kg) and dimensions (width, length, height) in millimeters (mm). This information is crucial for shipping calculations, storage planning, and logistics operations. However, these units can be configured to be displayed differently on storefront and APIs depending on the sales channel context.

  Dimension   Stored Value   Display Value (configurable)

  Weight      1.5            3.3 lbs/1500g/1.5kg
  Width       300            11.8 in/300mm/0.3m
  Length      400            15.7 in/400mm/0.4m
  Height      200            7.9 in/200mm/0.2m

The configurable measurement units are only available in the product v6.7.1.0 and later version. Before that, the values are always stored in the metric system and displayed in the same way.

Below you find an overview of relationships between the entities. Products, categories, options, and property groups are interconnected in the database schema.

* **Product variant**: A sellable product. Products are a self-referencing entity, which is interpreted as a parent-child relationship. Similarly, product variants are also generally mapped to products. This mechanism is used to model variants. This also provides inheritance between field values from parent products to child products.

It is also useful to attach some additional properties to differentiate product variants next to the field inheritance. For that reason, it is critical to understand the difference between *properties* and *options*:

**Properties** are used to model facts about a product, but usually, different product variants share these facts. We can refer to properties as *non variant defining*. They could be useful to represent the following information:

* Product Series / Collection
* Washing Instructions
* Manufacturing country

Opposed to that, **options** are considered variant defining, as they are the facts that differ from one product variant to another. Such as

* Shirt Size
* Color
* Container volume

It is important to understand the difference between those two because both provide a relation between the *product* and the *property group option* entity. However, only one constitutes to *product variants*.

  Variant     Product              Category            Product Group   Product Group Option

  Variant 1   Levis Ocean Hoodie   Hoodie & Sweaters   Color           Red
  Variant 2   Levis Ocean Hoodie   Hoodie & Sweaters   Color           Black

## Configurator

When a variant product is loaded for a Store API-scoped request, the product assembles a configurator object which includes all different property groups and the corresponding variants. This way client applications, such as the Storefront or Composable Frontends can display the different variant options of the product.

The following section is a detailed understanding on category.

# Sales Channels

Sales channels define how your catalog is exposed to a concrete audience (storefront, headless client, feed, or app). Each channel carries defaults for language, currency, taxes, payment/shipping, domains, and navigation entry points so one the product instance can serve multiple “stores” without duplicating data.

## What a sales channel controls

- Channel type: Storefront, headless Store API, product feed, or custom type.
- Audience defaults: language, currency, country, tax calculation mode, customer group, default payment/shipping methods.
- Navigation roots: `navigation`, `footer`, and `service` entry categories that drive storefront menus and listings.
- Presentation: home CMS page (`homeCmsPageId` with slot config) and storefront theme config for Storefront channels.
- Availability: which domains, payment/shipping methods, languages, currencies, and countries are allowed and which products are visible.

## Core model and relations

- `sales_channel`: Holds defaults (language, currency, country, payment/shipping, tax calculation), navigation roots, home CMS page, access key, maintenance flags, hreflang config.
- `sales_channel_domain`: URL + language + currency + snippet set. Matched by host/path to build the sales channel context.
- `sales_channel_translation`: Localized channel names and home page fields.
- `product_visibility`: Per-channel visibility level for products. Required for products to appear.
- `sales_channel_*` mappings: Allow additional currencies, languages, countries, payment, and shipping methods beyond the defaults.
- `cms_page`: Optional home page layout with channel-specific slot configuration.

## Domains and localization

Configure multiple domains per sales channel. Each domain pins language, currency, and snippet set (translations). Example:

- ` → en-GB, GBP
- ` → de-DE, EUR
- ` → es-ES, EUR

Use subdomains (e.g., de.example.com) rather than sub-paths (e.g., example.com/de) for fully isolated sales channels. Combining the root domain with sub-path-based channels means cookies are not fully isolated between channels, which can cause session conflicts.

`hreflangActive` and `hreflangDefaultDomainId` control hreflang links across these domains.

## Navigation entry categories

Every sales channel defines three category entry points: `navigation`, `footer`, and `service`. Storefront menus are built from the children of those entries. Category listings under these roots merge explicit product assignments and, if configured, dynamic product streams.

## Product availability per channel

Products must have a `product_visibility` row for each sales channel. Visibility values decide whether a product is searchable and/or directly accessible. A canonical category (`main_category`) can be set per product and sales channel for SEO-friendly URLs.

## Context creation and Store API

Incoming requests resolve a sales channel by access key or matched domain. `SalesChannelContextService` builds a `SalesChannelContext` with the defaults above plus token, customer, rule-based pricing, and permissions. Store API routes such as `/store-api/context`, `/store-api/navigation/{activeId}/{rootId}`, and `/store-api/category/{navigationId}` use that context to filter data to the channel.

## Extension points and events

- `SalesChannelContextCreatedEvent`: context built; use to enrich the context or persist session data.
- `SalesChannelContextSwitchEvent`: fired when `/store-api/context` switches currency, language, payment, shipping, or addresses.
- `SalesChannelContextRestoredEvent`: emitted when a stored context token is restored.
- Entity extensions: add custom fields or associations on `sales_channel` or mapping entities and expose them through Store API responses as needed.

# Cart

Shopping cart management is a central feature of the product 6. The shopping cart resides in the checkout bundle and is a central part of the checkout process.

## Design goals

The cart was designed with a few design goals in mind.

### Adaptability

Although many services exist to make working with the cart simple and intuitive, the cart itself can be changed through various processes and adapt to numerous use cases.

### Performance

The cart is designed by identifying key processes and optimizing upon them. Therefore the amount of calculations, queries, and iterations are kept to a minimum, and a clear state management is implemented.

### Abstraction

The cart has very few hard dependencies on other core entities in the product 6. Entities such as products, surcharges, or discounts are referenced through interfaces that the line items in the cart reference.

## Cart Struct

`\the product\Core\Checkout\Cart\Cart`

An instance of this class represents one single cart. As shown in the diagram below, relations to central Entities of the system are omitted. This allows the product 6 to manage multiple carts per user, per sales channel, or across all sales channels. The only identification is a token hash.

This highly mutable data structure is acted upon from requests and calculated and validated through services. It contains:

### Line Items

A line item represents an order position.

* It may be a  shippable good, a download article, or even a bundle of many products.
* Line items contain properties that tell the cart how to handle changes in line items. E.g., *stackable* - quantity can be changed, *removable* - removable through the API, and so on.
* A line item is the main extension point for the cart process. Therefore a promotion, a discount, or a surcharge is also a line item.
* A line item can even contain other line items. So a single order position can be the composition of multiple single line items.

### Transaction

It is the payment in the cart. Contains a payment handler and the amount.

### Delivery

It is a shipment in the cart. It contains a date, a method, a target location, and the line items that should be shipped together.

### Error

Validation errors which prevent ordering from that cart.

### Tax

The calculated tax rate for the cart.

### Price

The price of all line items, including tax, delivery costs, voucher discounts, and surcharges.

## State

the product 6 manages the cart's state through different services. The diagram below illustrates the different states the cart can have and the state changes it can go through.

  Cart state   Description

  Empty   A cart with no items will have default shipping and payment settings.
  Dirty   On adding a new line item, the cart undergoes modifications with invalid prices, raw line items, and uncertain delivery validity. Consequently, calculations are necessary.
  Calculated   After accurate calculations, the cart can be either submitted as an order or may contain errors that need to be addressed.

## Calculation

Calculating a cart is one of the more costly operations an ecommerce system must support. Therefore the interfaces of the cart are designed as precise and as quick as possible. The calculation is a multi-stage process that revolves around the mutation of the data structure of the cart struct shown in the diagram below:

  Cart calculation state   Description

  Enrich   The calculation process in the **enrich state** for line items involves adding images, its descriptions and determining prices
  Process   During the **process state**, price updates occur, adjustments to shipping and payment are made
  Validate   In the **validate state**, validation is performed using the rule system and cart changes based on plausibility checks.
  Persist   The **persist state** is responsible for updating the storage.

### Cart enrichment

Enrichment secures the *Independence_ and _Adaptability* of the product 6. As shown in the below code snippet, the cart can create and contain line items that are initially empty and will only be loaded \(enriched\) during the calculation.

This process is transparently controlled from the cart but executed through implementations of `\the product\Core\Checkout\Cart\CartDataCollectorInterface`. This interface is cut in order to reduce the number of database calls necessary to set up the cart's data structure for **price calculation** and **inspection** \(meaning: rendering in a storefront, reading from the API\).

A default set of collectors is implemented in the product 6, which has a set call order shown in the diagram below.

  Service ID   Task

  the product\Core\Content\Product\Cart\ProductCartProcessor   Enrich all referenced products
  the product\Core\Checkout\Promotion\Cart\CartPromotionsCollector   Enrich add, remove and validate promotions
  the product\Core\Checkout\Shipping\Cart\ShippingMethodPriceCollector   Handle shipping prices

## Cart processors - price calculation and validation

After a cart is enriched, the cart is processed. The price information for all individual `LineItems` is now set up to calculate the sums. This happens in the `\the product\Core\Checkout\Cart\Processor` class, following these steps:

* The `lineItem` prices are calculated by applying the quantity and the tax rate.
* Deliveries are set up and cost calculated.
* Different cart values are summed up \(incl, excl. vat, inc. excl. shipping\).

Then the calculation of prices is done, and the cart can be inspected from the rule system.

## Context rules

After the cart has been processed, it is validated against the rules, which can lead to a change in the carts' data, so a revalidation becomes necessary. We can envision a scenario where we sell cars and have the following rules:

* Everybody buying a car gets a pair of sunglasses for free.
* Every cart containing two products gets a discount of 2%.

As you can see in the diagram above, the cart is modified during the enrichment process. The sunglasses are added in the first iteration, and in the second iteration, the discount is added as the cart contains two products. This results in the expected state of one car, one pair of sunglasses, and a two-percent discount.

## Cart storage

Contrary to other entities in the system, the cart is not managed through the Data Abstraction Layer\(DAL)\. The cart can only be written and retrieved as a whole. As discussed in the sections, the workload of the product 6 can only be performed on the whole object in memory.

## Cart control

The state changes and cart mutation is handled automatically by a facade the `\the product\Core\Checkout\Cart\SalesChannel\CartService`. It controls, sets up, and modifies the cart struct.

# Document generation architecture
