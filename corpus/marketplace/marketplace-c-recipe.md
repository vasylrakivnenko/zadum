title: `Marketplace Recipe`,
}

# {metadata.title}

This recipe provides the general steps to implement a marketplace in your the product application.

## Example Guides

## Overview

A marketplace is an online commerce store that allows different vendors to sell their products within the same commerce system. Customers can purchase products from any of these vendors, and vendors can manage their orders separately.

the product Framework built for customizations facilitates building a marketplace. You can create a Marketplace Module that implements custom data models, such as vendors or sellers, and link those data models to existing ones such as products and orders. You also expose custom features using API routes, and implement complex flows using workflows.

How Foraged built a custom marketplace with the product.

---

## Create Custom Module with Data Models

In a marketplace, a business or a vendor has a user, and they can use that user to authenticate and manage the vendor's data.

You can create a marketplace module that implements data models for vendors, their admins, and any other data models that fit your use case.

<CardList items={[
  {
    href: "!docs!/learn/fundamentals/modules",
    title: "Create a Module",
    text: "Learn how to create a module.",
    icon: AcademicCapSolid,
  },
  {
    href: "!docs!/learn/fundamentals/modules#1-create-data-model",
    title: "Create Data Models",
    text: "Create data models in the module.",
    icon: AcademicCapSolid,
  },
]} />

---

## Link Custom and Existing Data Models

Since a vendor has products, orders, and other models based on your use case, you can define module links between your module's data models and the Commerce Module's data models.

For example, if you defined a vendor data model in a marketplace module, you can define a module link between the vendor and the Product Module's product data model. This builds an association between a vendor and their products, allowing you to query and manage products based on the vendor.

---

## Create Vendor API Routes

Your marketplace will most likely provide custom features for vendors, such as managing their products and orders. You can create API routes that expose these features to the vendors.

When you build these API routes, it's essential that you protect them to only allow authenticated vendors. For example, only a vendor's admin should be able to manage their products and orders.

the product supports creating custom actor types that can be authenticated with your custom API routes.

<CardList items={[
  {
    href: "!docs!/learn/fundamentals/api-routes",
    title: "Create API Routes",
    text: "Learn how to create an API Route in the product.",
    icon: AcademicCapSolid,
  },
  {
    href: "/commerce-modules/auth/create-actor-type",
    title: "Create an Actor Type",
    text: "Learn how to create an actor type and authenticate it.",
    icon: AcademicCapSolid,
  },
]} />

---

## Split Orders Based on Vendors

If your use case allows a customer's orders to have items from different vendors, you can replicate the Complete Cart API route to customize the order creation process.

In the API route, you can create a workflow that splits the order into multiple orders, one for each vendor. A workflow is a series of steps that provide features like rollback and retry mechanisms.

<CardList items={[
  {
    href: "!docs!/learn/fundamentals/api-routes/override",
    title: "Replicate API Routes",
    text: "Learn how to replicate an existing API route.",
    icon: AcademicCapSolid,
  },
  {
    href: "!docs!/learn/fundamentals/workflows",
    title: "Create a Workflow",
    text: "Learn how to create a workflow in the product.",
    icon: AcademicCapSolid,
  },
]} />

---

## Customize Admin Dashboard

Based on your use case, you may need to customize the product Admin to add new widgets or pages.

For example, you can create a page that lists all vendors or a widget that shows a product's vendor information.

the product Admin is an extensible application within your the product application. You can customize it by:

- **Widgets**: Adding widgets to existing pages, such as the product page.
- **UI Routes**: Adding new pages to the product Admin, such as a page to manage vendors.
- **Settings Pages**: Adding new pages to the product Admin settings, such as a page to manage marketplace settings.

<CardList items={[
  {
    href: "!docs!/learn/fundamentals/admin/widgets",
    title: "Create Admin Widget",
    text: "Add widgets into existing admin pages.",
    icon: AcademicCapSolid,
  },
  {
    href: "!docs!/learn/fundamentals/admin/ui-routes",
    title: "Create Admin UI Routes",
    text: "Add new pages to your the product Admin.",
    icon: AcademicCapSolid,
  },
]} />

---

## Build Dashboard for Vendors

For more complex use cases, customizing the product Admin may not be enough to allow vendors to manage their data.

In that case, you can build a custom dashboard for vendors that allows them to manage their data. This dashboard can interact with the product's Admin API and the custom API routes you created for vendors to provide a seamless experience.

---

## Customize or Build Storefront

the product provides a Next.js Starter Storefront to use with your application. You can customize it for your marketplace use case, such as showing products by vendor.

Alternatively, you can build your own storefront using the product APIs. This headless approach gives you the flexibility to build a custom storefront without limitations on which tech stack you use, or the design of the storefront.

<CardList items={[
  {
    href: "/nextjs-starter",
    title: "Next.js Starter Storefront",
    text: "Learn how to install and customize the Next.js Starter Storefront.",
    icon: AcademicCapSolid,
  },
  {
    href: "/storefront-development",
    title: "Storefront Development",
    text: "Find useful guides for creating a custom storefront.",
    icon: AcademicCapSolid,
  },
]} />

title: `B2B Recipe`,
}

# {metadata.title}

This recipe provides the general steps to implement a B2B store with the product.

the product has a ready-to-use B2B starter that you can install and use. Refer to the B2B Starter GitHub repository for more details.

## Overview

In a B2B store, you provide different types of customers with relevant pricing, products, shopping experience, and more.

the product’s Commerce Modules, including Sales Channel, Customer, and Pricing modules enable this setup out-of-the-box:

- **Sales Channel**: Use sales channels to set product availability per channel. In this case, create a B2B sales channel that includes only B2B products.
- **Customer**: Use customer groups to organize your customers into different groups. Then, you can apply different prices for each group.
- **Pricing**: Use price lists to set different prices for each B2B customer group, among other conditions.

In addition, the product’s extensible architecture and Framework for customization allow you to scope existing and custom features to specific customer groups or sales channels.

Visionary: Frictionless B2B ecommerce with the product

---

## Create B2B Sales Channel

Sales channels allow you to set product availability per channel. For B2B use cases, you can create a B2B sales channel that includes only B2B products.

Then, on the storefront, you retrieve only the B2B products for B2B customers, which is explained more in the next section.

You can create a sales channel through the product Admin or Admin REST APIs.

<CardList items={[
  {
    href: "!user-guide!/settings/sales-channels",
    title: "Using the product Admin",
    text: "Create the sales channel using the product Admin.",
    icon: UsersSolid,
  },
  {
    href: "!api!/admin/sales-channels/create-sales-channel",
    title: "Using Admin API",
    text: "Create the sales channel using the REST APIs.",
    icon: AcademicCapSolid,
  },
]} />

---

## Create a Publishable API Key

A publishable API key allows you to specify the context of client requests:

- You associate the publishable API key with one or more sales channels, such as the B2B sales channel.
- In a client such as a storefront, you pass the publishable API key in the header of your requests.

So, if you use the publishable API key associated with the B2B sales channel in your storefront, the product server will only return products that are available in the B2B sales channel.

You can create a publishable API key through the product Admin or the Admin REST APIs, then associate it with the B2B sales channel. Then, you can use this key when developing your B2B storefront.

### Create Publishable API Key

<CardList items={[
  {
    href: "!user-guide!/settings/developer/publishable-api-keys",
    title: "Using the product Admin",
    text: "Create the API key using the product Admin.",
    icon: UsersSolid,
  },
  {
    href: "!api!/admin/api-keys/create-api-key",
    title: "Using Admin API",
    text: "Create the API key using the REST APIs.",
    icon: AcademicCapSolid,
  },
]} />

### Associate Key with Sales Channel

<CardList items={[
  {
    href: "!user-guide!/settings/developer/publishable-api-keys#manage-publishable-api-keys-sales-channels",
    title: "Using the product Admin",
    text: "Associate the key with the sales channel using the product Admin.",
    icon: UsersSolid,
  },
  {
    href: "!api!/admin/api-keys/manage-sales-channels",
    title: "Using Admin API",
    text: "Associate the key with the sales channel using the REST APIs.",
    icon: AcademicCapSolid,
  },
]} />

---

## Add Products to B2B Sales Channel

You can manage products to be available in specific sales channels. For B2B, this allows you to add products that are only available to B2B customers.

You can create new products or add existing ones to the B2B sales channel using the product Admin or Admin REST APIs.

### Create Products

<CardList items={[
  {
    href: "!user-guide!/products/create",
    title: "Using the product Admin",
    text: "Create the products using the product Admin.",
    icon: UsersSolid,
  },
  {
    href: "!api!/admin/products/create-product",
    title: "Using Admin API",
    text: "Create the products using the REST APIs.",
    icon: AcademicCapSolid,
  },
]} />

### Add Products to Sales Channel

<CardList items={[
  {
    href: "!user-guide!/settings/sales-channels#manage-products-in-sales-channel",
    title: "Using the product Admin",
    text: "Create the products using the product Admin.",
    icon: UsersSolid,
  },
  {
    href: "!api!/admin/sales-channels/manage-products",
    title: "Using Admin API",
    text: "Add the products to the sales channel using the REST APIs.",
    icon: AcademicCapSolid,
  },
]} />

---

## Add B2B Customers and Groups

Customer groups allow you to organize your customers into different groups. Then, you can apply different prices for each group.

This is useful for B2B sales, as you often negotiate special prices with each customer or company.

You can create a customer group for each B2B company, then add customers of that company to the group.

### Create Customers

<CardList items={[
  {
    href: "!user-guide!/customers/manage",
    title: "Using the product Admin",
    text: "Create customers using the product Admin.",
    icon: UsersSolid,
  },
  {
    href: "!api!/admin/customers/create-customer",
    title: "Using Admin API",
    text: "Create customers using the REST APIs.",
    icon: AcademicCapSolid,
  },
]} />

### Assign Customers to Groups

<CardList items={[
  {
    href: "!user-guide!/customers/manage#manage-customers-groups",
    title: "Using the product Admin",
    text: "Assign customer to groups using the product Admin.",
    icon: UsersSolid,
  },
  {
    href: "!api!/admin/customer-groups/manage-customers",
    title: "Using Admin API",
    text: "Assign customer to groups using the REST APIs.",
    icon: AcademicCapSolid,
  },
]} />

### Flexible Customizations: Create Custom Module

B2B use cases often require more complex customer management, such as managing roles in a company with employees having different privileges.

For more complex use cases, you can create a custom module that introduces data models like `Company`, `Employee`, and other relevant models.

Then, you can link those companies to existing customers and groups, allowing you to benefit from existing features like price lists for specific customer groups.

<CardList items={[
  {
    href: "!docs!/learn/fundamentals/modules",
    title: "Create Module",
    text: "Learn how to create a module.",
    icon: AcademicCapSolid,
  },
  {
    href: "!docs!/learn/fundamentals/module-links",
    title: "Define Module Links",
    text: "Define links between data models.",
    icon: AcademicCapSolid,
  },
]} />

---

## Create B2B Price List

Price lists allow you to set different prices for each customer group, among other conditions. They're useful to override prices for custom use cases.

For B2B use cases, you can use price lists to set different prices for each B2B customer group. Then, B2B customers can see different prices on the storefront based on their group.

You can create a price list using the product Admin or the Admin REST APIs. Make sure to set the B2B customer group(s) as a condition.

<CardList items={[
  {
    href: "!user-guide!/price-lists/create",
    title: "Using the product Admin",
    text: "Create price list using the product Admin.",
    icon: UsersSolid,
  },
  {
    href: "!api!/admin/price-lists/create-price-list",
    title: "Using Admin API",
    text: "Create price list using the REST APIs.",
    icon: AcademicCapSolid,
  },
]} />

---

## Customize the product Admin

Based on your use case, you may need to customize the product Admin to add new widgets or pages.

For example, you may want to add a page to manage companies and their employees, or you may want to add a widget to show the company associated with a customer group.

the product Admin is an extensible application within your the product application. You can customize it by:

- **Widgets**: Adding widgets to existing pages, such as the customer group page.
- **UI Routes**: Adding new pages to the product Admin, such as a page to manage companies and employees.
- **Settings Pages**: Adding new pages to the product Admin settings, such as a page to manage company settings.

<CardList items={[
  {
    href: "!docs!/learn/fundamentals/admin/widgets",
    title: "Create Admin Widget",
    text: "Add widgets into existing admin pages.",
    icon: AcademicCapSolid,
  },
  {
    href: "!docs!/learn/fundamentals/admin/ui-routes",
    title: "Create Admin UI Routes",
    text: "Add new pages to your the product Admin.",
    icon: AcademicCapSolid,
  },
]} />

---

## Customize or Build Storefront

the product provides a Next.js Starter Storefront to use with your application. You can customize it for your B2B use case, such as adding a login page for B2B customers or expanding the profile page to show the company associated with the customer.

Alternatively, you can build your own storefront using the product APIs. This headless approach gives you the flexibility to build a custom storefront without limitations on which tech stack you use, or the design of the storefront.

In your storefront, you can use the publishable API key you associated with your B2B sales channel to ensure only B2B products are retrieved.

<CardList items={[
  {
    href: "/nextjs-starter",
    title: "Next.js Starter Storefront",
    text: "Learn how to install and customize the Next.js Starter Storefront.",
    icon: AcademicCapSolid,
  },
  {
    href: "/storefront-development",
    title: "Storefront Development",
    text: "Find guides to build your own storefront.",
    icon: AcademicCapSolid,
  },
]} />

title: `Digital Products Recipe`,
}

# {metadata.title}

This recipe provides the general steps to implement digital products in your the product application.

Follow the step-by-step Digital Products Example to learn how to implement digital products in your the product application.

## Overview

Digital products are products that are stored and delivered electronically. Examples include e-books, software, and digital art.

When the customer buys a digital product, an email is sent to them where they can download the product.

To implement digital products in the product, you create a Digital Product Module that introduces the concept of a digital product and link it to existing product concepts in the Product Module.

---

## Install a File Module Provider

A file module provider handles storage functionalities in the product. This includes uploading, retrieving, and downloading files, among other features.

You can use a file module provider to store and manage your digital products.

During development, you can use the Local File Module Provider, which is installed by default in your store. For production, you can use module providers like S3 or create your own.

<CardList items={[
  {
    href: "/infrastructure-modules/file",
    title: "File Module Providers",
    text: "Check out available file module providers.",
    icon: PuzzleSolid,
  },
  {
    href: "/references/file-provider-module",
    title: "Create a File Module Provider",
    text: "Learn how to create a file module provider.",
    icon: AcademicCapSolid,
  },
]} />

---

## Create Digital Product Module

Your custom features and functionalities are implemented inside modules. The module is integrated into the product application without any implications on existing functionalities.

You can create a custom module for digital products that holds your custom data models and the service implementing digital-product-related features.

### Create Custom Data Model

A data model represents a table in the database. You can define in your module data models to store data related to your custom features, such as a digital product.

Then, you can link your custom data model to data models from other modules. For example, you can link the digital product model to the Product Module's `ProductVariant` data model.

<CardList itemsPerRow={2} items={[
  {
    href: "!docs!/learn/fundamentals/modules#1-create-data-model",
    title: "How to Create a Data Model",
    text: "Learn how to create a data model.",
    icon: AcademicCapSolid,
  },
  {
    href: "!docs!/learn/fundamentals/module-links",
    title: "Define Module Links",
    text: "Define links between data models.",
    icon: AcademicCapSolid,
  },
]} />

### Implement Data Management Features

Your module’s main service holds data-management and other related features. Then, in other resources, such as an API route, you can resolve the service from the product container and use its functionalities.

the product facilitates implementing data-management features using the service factory. Your module's main service can extend this service factory, and it generates data-management methods for your data models.

---

## Build Flows for Digital Products

Your use case most likely has flows, such as creating digital products, that require multiple steps.

Create workflows to implement these flows, then utilize these workflows in other resources, such as an API route.

In the workflow's steps, you can resolve the Digital Product Module's service and use its data-management methods to manage digital products.

---

## Add Custom API Routes

API routes expose your features to external applications, such as the admin dashboard or the storefront.

You can create custom admin API routes that allow merchants to list and create digital products, and store API routes that allow customers to purchase and download digital products.

---

## Customize Admin Dashboard

Based on your use case, you may need to customize the product Admin to add new widgets or pages.
