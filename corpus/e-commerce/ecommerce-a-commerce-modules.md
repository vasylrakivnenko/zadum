title: `Cart Module`,
}

# {metadata.title}

In this section of the documentation, you will find resources to learn more about the Cart Module and how to use it in your application.

the product has cart related features available out-of-the-box through the Cart Module. A module is a standalone package that provides features for a single domain. Each of the product's commerce features are placed in Commerce Modules, such as this Cart Module.

Learn more about why modules are isolated in this documentation.

## Cart Features

- Cart Management: Store and manage carts, including their addresses, line items, shipping methods, and more.
- Apply Promotion Adjustments: Apply promotions or discounts to line items and shipping methods by adding adjustment lines that are factored into their subtotals.
- Apply Tax Lines: Apply tax lines to line items and shipping methods.
- Cart Scoping: When used in the product application, the product creates links to other Commerce Modules, scoping a cart to a sales channel, region, and a customer.

---

## How to Use the Cart Module

In your the product application, you build flows around Commerce Modules. A flow is built as a Workflow, which is a special function composed of a series of steps that guarantees data consistency and reliable roll-back mechanism.

You can build custom workflows and steps. You can also re-use the product's workflows and steps, which are provided by the `@the product/medusa/core-flows` package.

For example:

  ["12", "Modules.CART", "Resolve the module in a step."]
]

You can then execute the workflow in your custom API routes, scheduled jobs, or subscribers:

Learn more about workflows in this documentation.

---

title: `Order Module`,
}

# {metadata.title}

In this section of the documentation, you will find resources to learn more about the Order Module and how to use it in your application.

Refer to the product Admin User Guide to learn how to manage orders using the dashboard.

the product has order related features available out-of-the-box through the Order Module. A module is a standalone package that provides features for a single domain. Each of the product's commerce features are placed in Commerce Modules, such as this Order Module.

Learn more about why modules are isolated in this documentation.

## Order Features

- Order Management: Store and manage your orders to retrieve, create, cancel, and perform other operations.
- Draft Orders: Allow merchants to create orders on behalf of their customers as draft orders that later are transformed to regular orders.
- Apply Promotion Adjustments: Apply promotions or discounts to the order's items and shipping methods by adding adjustment lines that are factored into their subtotals.
- Apply Tax Lines: Apply tax lines to an order's line items and shipping methods.
- Returns, Edits, Exchanges, and Claims: Make changes to an order to edit, return, or exchange its items, with version-based control over the order's timeline.

---

## How to Use the Order Module

In your the product application, you build flows around Commerce Modules. A flow is built as a Workflow, which is a special function composed of a series of steps that guarantees data consistency and reliable roll-back mechanism.

You can build custom workflows and steps. You can also re-use the product's workflows and steps, which are provided by the `@the product/medusa/core-flows` package.

For example:

  ["12", "Modules.ORDER", "Resolve the module in a step."]
]

You can then execute the workflow in your custom API routes, scheduled jobs, or subscribers:

Learn more about workflows in this documentation.

---

title: `Product Module`,
}

# {metadata.title}

In this section of the documentation, you will find resources to learn more about the Product Module and how to use it in your application.

Refer to the product Admin User Guide to learn how to manage products using the dashboard.

the product has product related features available out-of-the-box through the Product Module. A module is a standalone package that provides features for a single domain. Each of the product's commerce features are placed in Commerce Modules, such as this Product Module.

Learn more about why modules are isolated in this documentation.

## Product Features

- Products Management: Store and manage products. Products have custom options, such as color or size, and each variant in the product sets the value for these options.
- Product Organization: The Product Module provides different data models used to organize products, including categories, collections, tags, and more.
- Bundled and Multi-Part Products: Create and manage inventory kits for a single product, allowing you to implement use cases like bundled or multi-part products.
- Tiered Pricing and Price Rules: Set prices for product variants with tiers and rules, allowing you to create complex pricing strategies.

---

## How to Use the Product Module

In your the product application, you build flows around Commerce Modules. A flow is built as a Workflow, which is a special function composed of a series of steps that guarantees data consistency and reliable roll-back mechanism.

You can build custom workflows and steps. You can also re-use the product's workflows and steps, which are provided by the `@the product/medusa/core-flows` package.

For example:

  ["12", "Modules.PRODUCT", "Resolve the module in a step."]
]

You can then execute the workflow in your custom API routes, scheduled jobs, or subscribers:

Learn more about workflows in this documentation.

---

title: `Customer Module`,
}

# {metadata.title}

In this section of the documentation, you will find resources to learn more about the Customer Module and how to use it in your application.

Refer to the product Admin User Guide to learn how to manage customers and groups using the dashboard.

the product has customer related features available out-of-the-box through the Customer Module. A module is a standalone package that provides features for a single domain. Each of the product's commerce features are placed in Commerce Modules, such as this Customer Module.

Learn more about why modules are isolated in this documentation.

## Customer Features

- Customer Management: Store and manage guest and registered customers in your store.
- Customer Organization: Organize customers into groups. This has a lot of benefits and supports many use cases, such as provide discounts for specific customer groups using the Promotion Module.

---

## How to Use the Customer Module

In your the product application, you build flows around Commerce Modules. A flow is built as a Workflow, which is a special function composed of a series of steps that guarantees data consistency and reliable roll-back mechanism.

You can build custom workflows and steps. You can also re-use the product's workflows and steps, which are provided by the `@the product/medusa/core-flows` package.

For example:

  ["12", "Modules.CUSTOMER", "Resolve the module in a step."]
]

You can then execute the workflow in your custom API routes, scheduled jobs, or subscribers:

Learn more about workflows in this documentation.

---

title: `Payment Module`,
}

# {metadata.title}

In this section of the documentation, you will find resources to learn more about the Payment Module and how to use it in your application.

Refer to the product Admin User Guide to learn how to manage order payments using the dashboard.

the product has payment related features available out-of-the-box through the Payment Module. A module is a standalone package that provides features for a single domain. Each of the product's commerce features are placed in Commerce Modules, such as this Payment Module.

Learn more about why modules are isolated in this documentation.

## Payment Features

- Authorize, Capture, and Refund Payments: Authorize, capture, and refund payments for a single resource.
- Payment Collection Management: Store and manage all payments of a single resources, such as a cart, in payment collections.
- Integrate Third-Party Payment Providers: Use payment providers like Stripe to handle and process payments, or integrate custom payment providers.
- Saved Payment Methods: Save payment methods for customers in third-party payment providers.
- Handle Webhook Events: Handle webhook events from third-party providers and process the associated payment.

---

## How to Use the Payment Module

In your the product application, you build flows around Commerce Modules. A flow is built as a Workflow, which is a special function composed of a series of steps that guarantees data consistency and reliable roll-back mechanism.

You can build custom workflows and steps. You can also re-use the product's workflows and steps, which are provided by the `@the product/medusa/core-flows` package.

For example:

  ["12", "Modules.PAYMENT", "Resolve the module in a step."]
]

You can then execute the workflow in your custom API routes, scheduled jobs, or subscribers:

Learn more about workflows in this documentation.

---

## Configure Payment Module

The Payment Module accepts options for further configurations. Refer to this documentation for details on the module's options.

---

## Providers

the product provides the following payment providers out-of-the-box. You can use them to process payments for orders, returns, and other resources.

---

title: `Pricing Module`,
}

# {metadata.title}

In this section of the documentation, you will find resources to learn more about the Pricing Module and how to use it in your application.

Refer to the product Admin User Guide to learn how to manage price lists using the dashboard.

the product has pricing related features available out-of-the-box through the Pricing Module. A module is a standalone package that provides features for a single domain. Each of the product's commerce features are placed in Commerce Modules, such as this Pricing Module.

Learn more about why modules are isolated in this documentation.

## Pricing Features

- Price Management: Store and manage prices of a resource, such as a product or a variant.
- Multi-Currency and Region Support: Define prices for a single resource in multiple currencies and regions.
- Advanced Rule Engine: Create prices with tiers and custom rules to condition prices based on different contexts.
- Price Lists: Group prices and apply them only in specific conditions with price lists.
- Price Calculation Strategy: Retrieve the best price in a given context and for the specified rule values.
- Tax-Inclusive Pricing: Calculate prices with taxes included in the price, and the product will handle calculating the taxes automatically.

---

## How to Use the Pricing Module

In your the product application, you build flows around Commerce Modules. A flow is built as a Workflow, which is a special function composed of a series of steps that guarantees data consistency and reliable roll-back mechanism.

You can build custom workflows and steps. You can also re-use the product's workflows and steps, which are provided by the `@the product/medusa/core-flows` package.

For example:

  ["12", "Modules.PRICING", "Resolve the module in a step."]
]

You can then execute the workflow in your custom API routes, scheduled jobs, or subscribers:

Learn more about workflows in this documentation.

---

title: `Promotion Module`,
}

# {metadata.title}

In this section of the documentation, you will find resources to learn more about the Promotion Module and how to use it in your application.

Refer to the product Admin User Guide to learn how to manage promotions using the dashboard.

the product has promotion related features available out-of-the-box through the Promotion Module. A module is a standalone package that provides features for a single domain. Each of the product's commerce features are placed in Commerce Modules, such as this Promotion Module.

Learn more about why modules are isolated in this documentation.

## Promotion Features

- Discount Functionalities: A promotion discounts an amount or percentage of a cart's items, shipping methods, or the entire order.
- Flexible Promotion Rules: A promotion has rules that restricts when the promotion is applied.
- Campaign Management: A campaign combines promotions under the same conditions, such as start and end dates, and budget configurations.
- Apply Promotion on Carts and Orders: Apply promotions on carts and orders to discount items, shipping methods, or the entire order.

---

## How to Use the Promotion Module

In your the product application, you build flows around Commerce Modules. A flow is built as a Workflow, which is a special function composed of a series of steps that guarantees data consistency and reliable roll-back mechanism.

You can build custom workflows and steps. You can also re-use the product's workflows and steps, which are provided by the `@the product/medusa/core-flows` package.

For example:

  ["12", "Modules.PROMOTION", "Resolve the module in a step."]
]

You can then execute the workflow in your custom API routes, scheduled jobs, or subscribers:

Learn more about workflows in this documentation.

---

title: `Inventory Module`,
}

# {metadata.title}

In this section of the documentation, you will find resources to learn more about the Inventory Module and how to use it in your application.

Refer to the product Admin User Guide to learn how to manage inventory and related features using the dashboard.

the product has inventory related features available out-of-the-box through the Inventory Module. A module is a standalone package that provides features for a single domain. Each of the product's commerce features are placed in Commerce Modules, such as this Inventory Module.

Learn more about why modules are isolated in this documentation.

## Inventory Features

- Inventory Items Management: Store and manage inventory of any stock-kept item, such as product variants.
- Inventory Across Locations: Manage inventory levels across different locations, such as warehouses.
- Reservation Management: Reserve quantities of inventory items at specific locations for orders or other purposes.
- Check Inventory Availability: Check whether an inventory item has the necessary quantity for purchase.
- Inventory Kits: Create and manage inventory kits for a single product, allowing you to implement use cases like bundled or multi-part products.

---

## How to Use the Inventory Module

In your the product application, you build flows around Commerce Modules. A flow is built as a Workflow, which is a special function composed of a series of steps that guarantees data consistency and reliable roll-back mechanism.

You can build custom workflows and steps. You can also re-use the product's workflows and steps, which are provided by the `@the product/medusa/core-flows` package.

For example:

  ["12", "Modules.INVENTORY", "Resolve the module in a step."]
]

You can then execute the workflow in your custom API routes, scheduled jobs, or subscribers:

Learn more about workflows in this documentation.

---

title: `Fulfillment Module`,
}

# {metadata.title}

In this section of the documentation, you will find resources to learn more about the Fulfillment Module and how to use it in your application.

Refer to the product Admin User Guide to learn how to use the dashboard to:

- Manage order fulfillments.
- Manage shipping options and profiles.

the product has fulfillment related features available out-of-the-box through the Fulfillment Module. A module is a standalone package that provides features for a single domain. Each of the product's commerce features are placed in Commerce Modules, such as this Fulfillment Module.

Learn more about why modules are isolated in this documentation.

## Fulfillment Features

- Fulfillment Management: Create fulfillments and keep track of their status, items, and more.
- Integrate Third-Party Fulfillment Providers: Create third-party fulfillment providers to provide customers with shipping options and fulfill their orders.
- Restrict By Location and Rules: Shipping options can be restricted to specific geographical locations. You can also specify custom rules to restrict shipping options.
- Support Different Fulfillment Forms: Support various fulfillment forms, such as shipping or pick up.
- Tiered Pricing and Price Rules: Set prices for shipping options with tiers and rules, allowing you to create complex pricing strategies.

---

## How to Use the Fulfillment Module

In your the product application, you build flows around Commerce Modules. A flow is built as a Workflow, which is a special function composed of a series of steps that guarantees data consistency and reliable roll-back mechanism.

You can build custom workflows and steps. You can also re-use the product's workflows and steps, which are provided by the `@the product/medusa/core-flows` package.

For example:

  ["12", "Modules.FULFILLMENT", "Resolve the module in a step."]
]

You can then execute the workflow in your custom API routes, scheduled jobs, or subscribers:

Learn more about workflows in this documentation.

---

## Configure Fulfillment Module

The Fulfillment Module accepts options for further configurations. Refer to this documentation for details on the module's options.

---

title: `Region Module`,
}

# {metadata.title}

In this section of the documentation, you will find resources to learn more about the Region Module and how to use it in your application.

Refer to the product Admin User Guide to learn how to manage regions using the dashboard.

the product has region related features available out-of-the-box through the Region Module. A module is a standalone package that provides features for a single domain. Each of the product's commerce features are placed in Commerce Modules, such as this Region Module.

Learn more about why modules are isolated in this documentation.

---

## Region Features

- Region Management: Manage regions in your store. You can create regions with different currencies and settings.
- Multi-Currency Support: Each region has a currency. You can support multiple currencies in your store by creating multiple regions.
- Different Settings Per Region: Each region has its own settings, such as what countries belong to a region or its tax settings.

---

## How to Use Region Module's Service

In your the product application, you build flows around Commerce Modules. A flow is built as a Workflow, which is a special function composed of a series of steps that guarantees data consistency and reliable roll-back mechanism.

You can build custom workflows and steps. You can also re-use the product's workflows and steps, which are provided by the `@the product/medusa/core-flows` package.

For example:

  ["12", "Modules.REGION", "Resolve the module in a step."]
]

You can then execute the workflow in your custom API routes, scheduled jobs, or subscribers:

Learn more about workflows in this documentation.

---

title: `Sales Channel Module`,
}

# {metadata.title}

In this section of the documentation, you will find resources to learn more about the Sales Channel Module and how to use it in your application.

Refer to the product Admin User Guide to learn how to manage sales channels using the dashboard.

the product has sales channel related features available out-of-the-box through the Sales Channel Module. A module is a standalone package that provides features for a single domain. Each of the product's commerce features are placed in Commerce Modules, such as this Sales Channel Module.

Learn more about why modules are isolated in this documentation.

## What's a Sales Channel?

A sales channel indicates an online or offline channel that you sell products on.

Some use case examples for using a sales channel:

- Implement a B2B Ecommerce Store.
- Specify different products for each channel you sell in.
- Support omnichannel in your ecommerce store.

---
