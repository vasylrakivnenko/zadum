## Overview

An order is the central model connecting a customer to their purchase. It collects line items, addresses, shipments, payments, and adjustments into a single transaction that flows through a checkout state machine from cart to completion.

**Key relationships:**
- **Line Items** link orders to Variants (what was purchased)
- **Shipments** handle fulfillment from stock locations
- **Payments** track payment attempts and their states
- **Adjustments** apply taxes, promotions, and shipping costs
- **Addresses** store billing and shipping information

## Order Attributes

The API returns these key fields on every order:

  Attribute   Description

  `number`   Unique order number (e.g., `R123456789`), shown to customers
  `email`   Customer's email address
  `currency`   Order currency (e.g., `USD`)
  `total_quantity`   Total number of items
  `item_total` / `display_item_total`   Sum of line item prices
  `delivery_total` / `display_delivery_total`   Delivery cost
  `tax_total` / `display_tax_total`   Total tax
  `discount_total` / `display_discount_total`   Total discount from promotions
  `adjustment_total` / `display_adjustment_total`   Sum of all adjustments (tax + delivery + promos)
  `total` / `display_total`   Final order total
  `payment_status`   Payment status (`balance_due`, `paid`, `credit_owed`, `failed`, `void`)
  `fulfillment_status`   Fulfillment status (`pending`, `ready`, `partial`, `shipped`, `backorder`)
  `completed_at`   Timestamp when the order was placed

The `display_*` fields return formatted strings with currency symbols (e.g., `"$15.99"`).

## Cart

A cart is simply an order in the `cart` state. Guest carts are identified by a cart token; authenticated users' carts are linked to their account.

Every item mutation returns the full updated order with recalculated totals.

## Checkout Flow

The checkout is a state machine that advances the order through a series of steps. Each step collects required information before allowing the order to proceed.

    Customer has items in their cart. This is the starting state.

    Customer provides shipping and billing addresses.

    Customer selects a shipping rate for each shipment.

    Customer provides payment. Skipped if the order is fully covered by store credit.

    Customer reviews and confirms the order.

    Order is placed. `completed_at` is set and fulfillment begins.

If the order doesn't meet the requirements for the next state (e.g., missing address), the API returns an error.

## Coupon Codes

Apply or remove promotional coupon codes during checkout:

## Order History

Authenticated customers can view their past orders:

## Managing Orders

Everything above is the **Store API** — the customer's own cart and orders. Back-office order management (listing every order, creating phone/manual orders, capturing payments, cancelling) uses the Admin API.

### Listing and creating orders

List orders with Ransack filters and pagination (`state_eq`, `limit`, sorting). A draft order is created in one call; pass line items as `items` (each `{ variant_id, quantity }`):

### Order state actions

Orders move through their state machine via dedicated actions rather than raw `state` writes:

### Payments and refunds

Capture or void an authorized payment, and issue refunds, through the nested order resources:

## Line Items

Line items represent individual products in an order. Each line item links to a Variant and tracks the quantity and price at the time of purchase.

When a variant is added to an order, the price is locked on the line item. If the variant's price changes later, existing orders are unaffected.

## Adjustments

Adjustments modify an order's total — promotions decrease it, taxes and shipping increase it. Adjustments can be applied at the order level, the line item level, or the shipment level.

## Payment States

  State   Description

  `balance_due`   Payment total is less than the order total
  `paid`   Payment total equals the order total
  `credit_owed`   Payment total exceeds the order total (refund pending)
  `failed`   Most recent payment attempt failed
  `void`   Order was canceled and payments voided

## Fulfillment Statuses

The order's `fulfillment_status` field summarizes the state of all fulfillments (the Store API/SDK exposes shipments as `fulfillments`).

  Status   Description

  `pending`   All fulfillments are pending
  `ready`   All fulfillments are ready to ship
  `partial`   At least one fulfillment is shipped, others are not
  `shipped`   All fulfillments have been shipped
  `backorder`   Some inventory is on backorder

For more details, see Shipments and Payments.

## Related Documentation

- Cart, Checkout & Orders — Store SDK guide for carts, checkout, coupon codes, and order history
- Payments — Payment processing and payment sessions
- Shipments — Fulfillment and shipping rates
- Addresses — Billing and shipping addresses
- Promotions — Discounts and coupon codes
- Checkout Customization — Customizing the checkout flow
- Events — Subscribe to order events (e.g., `order.completed`)

## Overview

A product represents something you sell. Each product has one or more **variants** — the actual purchasable items with their own SKU, price, and inventory. For example, a "T-Shirt" product might have variants for each size and color combination.

Products are organized into **categories** — a flexible hierarchy for grouping products. Categories can be filtered, sorted, and searched via the Store API.

Product names, descriptions, slugs, and SEO fields are translatable.

## Product Attributes

  Attribute   Description   Translatable

  `name`   Product name   Yes
  `description`   Full product description   Yes
  `slug`   URL-friendly identifier (e.g., `the product-tote`)   Yes
  `status`   `draft`, `active`, or `archived`   No
  `available_on`   Date the product becomes available for sale   No
  `discontinue_on`   Date the product is no longer available   No
  `meta_title`   Custom SEO title   Yes
  `meta_description`   SEO description   Yes
  `meta_keywords`   SEO keywords   Yes
  `purchasable`   Whether the product can be added to cart   No
  `in_stock`   Whether any variant has stock available   No
  `price`   Default variant's price in the current currency   No
  `thumbnail_url`   URL to the product's first image — always returned, no expand needed   No
  `tags`   Array of tag strings for filtering   No

## Listing Products

See Querying for the full list of filtering, sorting, and pagination options.

## Getting a Product

Pass `expand` to include related resources in a single response — see expand relations for how relation inclusion works.

## Managing Products

The examples above use the **Store API** (publishable key, read-only, customer-facing). To **create and manage** products, use the Admin API — via the Admin SDK or the product CLI.

A product's purchasable attributes (SKU, prices, stock) live on its **variants**, which you can create inline:

Update, clone, or archive a product (deleting soft-deletes it):

Operating on many products at once? The Admin API has bulk actions — `bulkStatusUpdate`, `bulkAddToCategories`, `bulkAddTags`, `bulkDestroy`, and more. See the Admin API endpoint index.

## Product Filters

Get available filter options for building a faceted search UI. Returns price ranges, option values, and categories with counts:

## Variants

Variants are the purchasable units of a product. Each variant has its own SKU, price, inventory, and images, and is defined by a unique combination of option values.

  Attribute   Description

  `sku`   Unique stock keeping unit
  `barcode`   Barcode (UPC, EAN, etc.)
  `price`   Price in the current currency
  `original_price`   Compare-at price for showing discounts
  `weight`, `height`, `width`, `depth`   Dimensions for shipping calculations
  `in_stock`   Whether stock is available
  `backorderable`   Whether the variant can be ordered when out of stock
  `option_values`   The option values that define this variant (e.g., Size: Small, Color: Red)

### Master Variant

Every product has a **master variant** that holds default pricing and inventory. If a product has no option types (e.g., a book with no size/color), the master variant is the only purchasable variant.

### Regular Variants

When a product has option types, each unique combination of option values creates a variant. For example, a T-shirt with sizes (S, M, L) and colors (Red, Green) has 6 variants:

  SKU   Size   Color

  `TEE-S-R`   Small   Red
  `TEE-S-G`   Small   Green
  `TEE-M-R`   Medium   Red
  `TEE-M-G`   Medium   Green
  `TEE-L-R`   Large   Red
  `TEE-L-G`   Large   Green

The product's `default_variant_id` points to the first non-master variant (or the master variant if none exist).

Add a variant to an existing product via the Admin API (SKU, prices, and stock all live on the variant):

## Option Types and Option Values

Option types define the axes of variation for a product (e.g., Size, Color, Material). Option values are the specific choices within each type (e.g., Small, Medium, Large).

A product must have at least one option type to have multiple variants. Option types and their values are included in the product response when requested:

Option type `name` and `label` fields are translatable.

Create option types (and their values) via the Admin API. Sending `option_values` replaces the full set, so include every value you want to keep:

## Media

Media can be attached to the product (via the master variant) or to individual variants. When displaying a product, show the images for the selected variant, falling back to the product-level images.

### Thumbnails

Every product response includes a `thumbnail_url` field — the URL to the first image, ready to use without any expands. Similarly, each variant includes a `thumbnail_url` URL and an `media_count` counter.

Use these fields for product listing pages to avoid loading all images:

Avoid using `?expand=media` on listing pages. This loads **all** images for every product in the response, which is unnecessary when you only need a thumbnail. Use `thumbnail_url` instead and only expand full media on the product detail page.

### All Images

On the product detail page, expand `media` and `variants` to get the full set of images. Images are ordered by `position`:

  Field   Available on   Always returned   Description

  `thumbnail_url`   Product   Yes   URL to the product's first media
  `thumbnail_url`   Variant   Yes   URL to the variant's first media
  `media_count`   Variant   Yes   Number of media
  `media`   Product, Variant   No   Full image array (requires `?expand=media`)

## Prices

Each variant can have multiple prices — one per currency, plus additional prices from Price Lists that apply conditionally based on market, geography, customer segment, or quantity.

The API automatically returns the correct price based on the current currency and market context:

  Field   Description

  `price`   Current selling price
  `original_price`   Compare-at price (for showing strikethrough discounts)

See the Pricing guide for details on Price Lists, Price Rules, and market-specific pricing.

## Categories

Categories provide a flexible way to organize products into hierarchical trees. Internally, the product uses Taxonomies (category trees) and Taxons (nodes within those trees), but the Store API exposes them simply as **Categories**.

For example:
- **Categories** → Clothing → T-Shirts, Dresses
- **Brands** → Nike, Adidas, Puma
- **Collections** → Summer 2025, Best Sellers

Products can belong to multiple categories.

Category `name` and `description` fields are translatable.

## Publications and Sales Channels

A product is visible on a Channel only when a `ProductPublication` record joins the two. Publications carry an optional time window so a product can be scheduled to go live and come down without code or manual toggles.

  Publication state   What customers see

  No publication exists   Product is not on this channel — invisible
  Publication has no dates set   Live now and indefinitely
  `published_at` is in the future   Scheduled — not yet visible
  `unpublished_at` is in the past   Hidden — was visible, now sunset
  Within the window   Live

Product `status` (`draft` / `active` / `archived`) is the **outer gate**: a Draft or Archived product is hidden on every channel regardless of its publication window. Only `active` products consult publication state.

### Reading publications

Publications appear in the API under `product_publications` when expanded; the same data is available through the `channels` association as a flat list of joined channels.

### Writing publications

Two write surfaces serve different shapes:

- **Per-product, full-set** — `PATCH /api/v3/admin/products/{id}` with a `product_publications` array. The array represents the complete desired state; channels absent from the payload are detached.

- **Per-channel, bulk** — `POST /api/v3/admin/channels/{id}/add_products` and `POST /api/v3/admin/channels/{id}/remove_products` for publishing or unpublishing many products at once. Idempotent: re-publishing an already-published product is a no-op for its window unless `published_at` / `unpublished_at` are explicitly passed.

The two surfaces converge on the same `spree_product_publications` table — pick whichever matches your call site.

### Listing products on a specific channel

Storefronts and `client.products.list()` calls return only products published on the resolved channel (live within the publication window, with the product itself `active`). To scope a Store SDK request to a non-default channel — e.g. a POS app querying for the POS catalog — set the channel `code` on the client or per-request:

For Admin API filtering across channels (back-office reports, admin UI lists), use Ransack instead: `qchannels_id_in=ch_xxx`. See Sales Channels for the resolution rules.

### Auto-publish on the default channel

When a product is created via the dashboard, it is auto-published on the store's default channel (the only channel where `default = true`). The Admin API does **not** auto-publish — supply `product_publications: [{ channel_id }]` on create or call `add_products` afterwards.

See Sales Channels for the full channel lifecycle, including default-channel resolution and the `X-the product-Channel` header.

## Related Documentation

- Sales Channels — Channels, publications, and order attribution
- Pricing — Price Lists, Price Rules, and market-specific pricing
- Inventory — Stock management and backorders
- Media — Image management
- Translations — Translating product content
- Search & Filtering — Full-text search and Ransack filtering
- Store SDK Products — Listing, fetching, filtering, and categories via `client.products`
- Querying — API filtering, sorting, and pagination

## Overview

Each Variant has a `StockItem` that tracks its inventory at a specific location. A variant can have multiple stock items if it's available at multiple stock locations.

When products are sold or returned, individual `InventoryUnit` records track each unit through the fulfillment process.

Adding new inventory to an out-of-stock product that has backorders will first fill the backorders, then update the available count with the remainder.

During checkout, the product holds stock with time-limited Stock Reservations to prevent two customers from buying the same last unit simultaneously.

### Inventory Model Diagram

**Key relationships:**
- **Stock Location** → Contains Stock Items (inventory per variant) and is the source/destination for Stock Transfers
- **Stock Item** → Tracks quantity (`count_on_hand`) for a specific Variant at a specific Stock Location
- **Stock Movement** → Records changes to Stock Item quantities (purchases, returns, transfers)
- **Stock Transfer** → Moves inventory between Stock Locations, creating Stock Movements at source and destination
- **Inventory Unit** → Represents individual units in Orders and Shipments
- **Stock Reservation** → Time-limited soft hold on a Stock Item during checkout, scoped to a specific Order and Line Item

## Inventory Management

### Stock Locations

Stock Locations are the physical locations where your inventory is stored and shipped from.

Stock Locations can be created in the Admin Panel under **Settings → Stock Locations**, or via the Admin API.

Stock Locations have several attributes that define their properties and behavior within the product system. Below is a table outlining these attributes:

  Attribute           Description                                                                   Example Value

  `name`              The public name of the stock location. This is returned in Store API   Warehouse 1
  `admin_name`         The name used internally for the stock location. This is only returned in Admin API.   WH1 Domestic
  `address1`          The primary address line for the stock location.                             5th avenue
  `address2`          The secondary address line for the stock location.                           Suite 100
  `city`              The city where the stock location is based.                                  New York
  `state_id`          The ID of the state where the stock location is based. This references the `State` model.   1
  `country_id`        The ID of the country where the stock location is based. This references the `Country` model.   1
  `zipcode`           The postal code for the stock location.                                      10001
  `phone`             The contact phone number for the stock location.                             555-1234
  `active`            A boolean indicating whether the stock location is active. Inactive stock locations will not be used in stock calculations or be available for selection during checkout.   `true`
  `default`            A boolean indicating whether the stock location is the default one used for new inventory operations.   `false`
  `backorderable_default`   A boolean indicating whether new stock items in this location are backorderable by default.   `false`
  `propagate_all_variants`   A boolean indicating whether new stock items should be automatically created for all Store variants when a new stock location is added.   `false`

Stock Locations can be easily used for tracking warehouses and other physical locations. They can be used to track separate sections of a warehouse (e.g. aisles, shelves, etc.) or to track different warehouses.

You can easily use them with your Point of Sale (POS) system to track inventory at different locations.

Create and manage stock locations via the Admin API:

### Stock Items

Stock Items represent the inventory at a stock location for a specific variant. Stock item count on hand can be increased or decreased by creating stock movements.

  Attribute           Description                                                                   Example Value

  `stock_location_id`   References the stock location where the stock item belongs.                  `1`
  `variant_id`        References the variant associated with the stock item.                       `32`
  `count_on_hand`     The number of items available on hand.                                       `150`
  `backorderable`     Indicates whether the stock item can be backordered.                         `true`

Stock items are created automatically — for all variants when a location has `propagate_all_variants`, or via a variant's `stock_items` on create. To adjust quantity or backorderable status, **update** the existing stock item via the Admin API. The example below uses a Ransack predicate (`stock_location_id_eq`) to list a location's stock items before updating one:

### Stock Transfers
