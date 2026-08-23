the product

  The open-source marketplace platform. A Mirakl alternative.

  Website ·
  Documentation ·
  Live Demo ·
  Discord

## What is the product

**the product** is an open-source, headless platform for building multi-vendor marketplaces. Add vendor onboarding, multi-vendor catalogs, offers, commissions, and automated payouts on top of a commerce core you can change at its foundation. Run B2C, B2B, and hybrid marketplaces without choosing between a profit-draining SaaS platform and a build from scratch.

- **Own your marketplace, no fees**: Self-host on your own infrastructure with full source access. No percentage of GMV, no per-transaction cut, no vendor lock-in — your data, your customers, and your roadmap stay yours.
- **Built for the marketplace model**: Vendor onboarding, multi-vendor catalogs, offers, commissions, and automated payouts are built in — multiple sellers can list offers against the same product, so you're not rebuilding marketplace logic on top of a single-seller commerce engine.
- **Headless and customizable, no forks**: TypeScript, event-driven, and API-first — serve any storefront or frontend. Extend or override workflows, products, and vendor rules through a composable architecture built for the most complex B2B and multi-vendor models, without patching the core.
- **Standing on the product**: Inherit a mature, battle-tested commerce core — catalog, orders, payments, shipping, tax, and stock — instead of reinventing it. the product adds the marketplace layer on top of **the product**.
- **Production-ready and AI-native**: Run real marketplaces in production today, on an architecture designed for AI-assisted development — an introspectable, API-first stack that works hand in hand with your AI coding tools.

## Getting Started

To get a local marketplace up and running, please follow these simple steps.

### Prerequisites

Here's what you need to run the product.

- Node.js (Version: >=20.x)
- PostgreSQL (Version: >=13.x)
- Redis
- Bun _(recommended)_

> If you want to enable any of the available integrations (e.g. Stripe Connect payouts, Resend email, Algolia/Meilisearch search), you may want to obtain additional credentials for each one and add them to your `.env` file.

### Setup

1. Create a new the product project

2. Start the development server

3. Access your marketplace
   - Backend API: `
   - Admin Panel: `
   - Vendor Panel: `

   Your marketplace comes seeded with a demo store out of the box — a ready-to-go seller (`seller@the product.dev` / `supersecret`) with a full catalog of products and offers, so you can explore the admin and vendor panels immediately. Sign in to the Vendor Panel with those credentials, or manage everything from the Admin Panel.

### Built With

- the product.js
- TypeScript
- React.js
- Vite
- Node.js
- PostgreSQL
- Redis

## Architecture

the product is modular. Each piece is a separate, independently deployable app that talks to the core over APIs.

- **the product Core**: the marketplace engine on top of the product, with vendors, commissions, payouts, and multi-vendor primitives.
- **Admin Panel**: marketplace operators manage vendors, catalog, categories, commissions, and rules.
- **Vendor Panel**: sellers manage their products, orders, and payouts.
- **Storefronts**: customer-facing B2C/B2B apps with multi-vendor browsing, cart, and checkout.

## What's in this repo

This is the product development monorepo: the `@the product/core` plugin, the React + Vite admin and vendor dashboards, the `@the product/cli`, the typed API client, the dashboard SDK, the Stripe Connect payout provider, and the cross-package integration suites. If you just want to build a marketplace, run `bun create the product-app@latest` (see Getting Started) - clone this repo only when you want to contribute to the product itself.

## Deployment

Because the product is a plain Node.js application backed by PostgreSQL and Redis, it deploys the same way whether you ship it as a container, orchestrate it with Kubernetes, push it to a managed cloud, or lock it inside an air-gapped network. There's no proprietary runtime to adopt and no hosting tier you're forced onto, so where your marketplace lives and where its data sits stay entirely under your control. Prefer a managed backend? the product also deploys to the product Cloud with push-to-deploy and auto-scaling.

## License

This repository is **the product core**, licensed under the MIT License and fully open source. It's the marketplace engine on top of the product — vendors, multi-vendor catalogs, offers, commissions, and payouts, with the admin and vendor dashboards and APIs to run a marketplace yourself.

**the product Enterprise** adds a licensed suite of advanced modules (EAN matching & deduplication, a Buy Box / winning-offer engine, master-data governance, multi-channel stock sync, automated split payouts, vendor KYC, and much more), all maintained, tested, and upgraded by the core team. You deploy and run Enterprise on your own infrastructure, exactly like the open-source core.

It comes backed by a direct support relationship with the people who build the platform: a dedicated support channel, contractual SLAs with guaranteed response times, prioritized bug fixes and security patches, and hands-on onboarding and architecture guidance to get you to production. Higher support tiers add priority escalation and a named technical contact.

Book the product Enterprise demo.

## Professional services

the product is built and maintained by Rigby, a team that has designed, built, and launched multi-vendor marketplaces in production. If you'd rather not do it alone, we work alongside your engineers — from architecture reviews and integrating the product with your existing stack to hardening, scaling, and getting your marketplace live on schedule. Talk to our team.

## Contribution

the product is an Open Source project and we encourage everyone to help us making it better. If you are interested in contributing to the project, please read our Contributing Guide and Code of Conduct.

If you have any questions about contributing, please join our Discord server - we are happy to help you!

Discovered a 🐜 or have feature suggestion? Feel free to create an issue on Github.

## Upgrades

Follow the Release Notes to keep your the product marketplace up-to-date.

## Contributors

## Star history

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- @vitejs/plugin-react uses Babel (or oxc when used in rolldown-vite) for Fast Refresh
- @vitejs/plugin-react-swc uses SWC for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see this documentation.

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

You can also install eslint-plugin-react-x and eslint-plugin-react-dom for React-specific lint rules:

# Custom Pages

A custom page lets you add new views to the vendor portal. Pages are automatically discovered using file-based routing powered by the `@the product/dashboard-sdk` Vite plugin.

> Learn more about the dashboard SDK in the product documentation.

To create a custom page:

## 1. Create a Page File

Create a `page.tsx` file inside the `src/routes/` directory. The file path determines the URL route.

For example, create the file `src/routes/blog/page.tsx` with the following content:

This page will be accessible at `/blog` in the vendor portal.

## 2. File-Based Routing

The route is derived from the file path relative to `src/routes/`. Each route must be defined in a file named `page.tsx` (or `.ts`, `.jsx`, `.js`).

  File Path   Route

  `src/routes/page.tsx`   `/`
  `src/routes/blog/page.tsx`   `/blog`
  `src/routes/blog/[id]/page.tsx`   `/blog/:id` (dynamic)
  `src/routes/blog/[[id]]/page.tsx`   `/blog/:id?` (optional dynamic)
  `src/routes/blog/[*]/page.tsx`   `/blog/*` (splat/catch-all)
  `src/routes/(group)/foo/page.tsx`   `/foo` (route grouping)
  `src/routes/dashboard/@sidebar/page.tsx`   Parallel route (nested child)

## 3. Add a Sidebar Menu Item

To add your page to the sidebar navigation, export a `config` object from the page file:

### Config Options

  Property   Type   Description

  `label`   `string`   **(required)** Display name in the sidebar
  `icon`   `ComponentType`   Icon component shown next to the label
  `rank`   `number`   Controls ordering in the sidebar
  `nested`   `string`   Parent menu item path to nest under
  `translationNs`   `string`   i18n translation namespace for the label

## 4. Add Data Loading

Use React Router's loader pattern to pre-fetch data before the page renders:

## 5. Add Route Metadata

Export a `handle` object to attach metadata to the route, accessible via React Router's `useMatches()`:

## Summary

Each `page.tsx` file supports these exports:

  Export   Required   Description

  `default`   Yes   The React component to render
  `config`   No   Sidebar menu item configuration
  `loader`   No   Data loading function (React Router)
  `handle`   No   Route metadata (React Router)

the product

  Documentation
  Website

  Building blocks for digital commerce

## Compatibility

This starter is compatible with versions >= 2 of `@medusajs/medusa`.

## Getting Started

Visit the Quickstart Guide to set up a server.

Visit the Docs to learn more about our system requirements.

## What is the product

the product is a set of commerce modules and tools that allow you to build rich, reliable, and performant commerce applications without reinventing core commerce logic. The modules can be customized and used to build advanced ecommerce stores, marketplaces, or any product that needs foundational commerce primitives. All modules are open-source and freely available on npm.

Learn more about the product’s architecture and commerce modules in the Docs.

## Community & Contributions

The community and core team are available in GitHub Discussions, where you can ask for support, discuss roadmap, and share ideas.

Join our Discord server to meet other community members.

## Other channels

- GitHub Issues
- Twitter
- LinkedIn
- the product Blog

# Integration Tests

The `the product-test-utils` package provides utility functions to create integration tests for your API routes and workflows.

For example:

Learn more in this documentation.

# Custom API Routes

An API Route is a REST API endpoint.

An API Route is created in a TypeScript or JavaScript file under the `/src/api` directory of your the product application. The file’s name must be `route.ts` or `route.js`.

> Learn more about API Routes in this documentation

For example, to create a `GET` API Route at `/store/hello-world`, create the file `src/api/store/hello-world/route.ts` with the following content:

## Supported HTTP methods

The file based routing supports the following HTTP methods:

- GET
- POST
- PUT
- PATCH
- DELETE
- OPTIONS
- HEAD

You can define a handler for each of these methods by exporting a function with the name of the method in the paths `route.ts` file.

For example:

## Parameters

To create an API route that accepts a path parameter, create a directory within the route's path whose name is of the format `[param]`.

For example, if you want to define a route that takes a `productId` parameter, you can do so by creating a file called `/api/products/[productId]/route.ts`:

To create an API route that accepts multiple path parameters, create within the file's path multiple directories whose names are of the format `[param]`.

For example, if you want to define a route that takes both a `productId` and a `variantId` parameter, you can do so by creating a file called `/api/products/[productId]/variants/[variantId]/route.ts`.

## Using the container

the product container is available on `req.scope`. Use it to access modules' main services and other registered resources:

## Middleware

You can apply middleware to your routes by creating a file called `/api/middlewares.ts`. This file must export a configuration object with what middleware you want to apply to which routes.

For example, if you want to apply a custom middleware function to the `/store/custom` route, you can do so by adding the following to your `/api/middlewares.ts` file:

The `matcher` property can be either a string or a regular expression. The `middlewares` property accepts an array of middleware functions.

# Custom scheduled jobs

A scheduled job is a function executed at a specified interval of time in the background of your the product application.

> Learn more about scheduled jobs in this documentation.

A scheduled job is created in a TypeScript or JavaScript file under the `src/jobs` directory.

For example, create the file `src/jobs/hello-world.ts` with the following content:

A scheduled job file must export:

- The function to be executed whenever it’s time to run the scheduled job.
- A configuration object defining the job. It has three properties:
  - `name`: a unique name for the job.
  - `schedule`: a cron expression.
  - `numberOfExecutions`: an optional integer, specifying how many times the job will execute before being removed

The `handler` is a function that accepts one parameter, `container`, which is a `MedusaContainer` instance used to resolve services.

# Module Links

A module link forms an association between two data models of different modules, while maintaining module isolation.

> Learn more about links in this documentation

For example:

This defines a link between the Product Module's `product` data model and the Blog Module (custom module)'s `post` data model.

Then, in the product application, run the following command to sync the links to the database:

# Custom Module

A module is a package of reusable functionalities. It can be integrated into your the product application without affecting the overall system. You can create a module as part of a plugin.

> Learn more about modules in this documentation.

To create a module:

## 1. Create a Data Model

A data model represents a table in the database. You create a data model in a TypeScript or JavaScript file under the `models` directory of a module.

For example, create the file `src/modules/blog/models/post.ts` with the following content:

## 2. Create a Service

A module must define a service. A service is a TypeScript or JavaScript class holding methods related to a business logic or commerce functionality.

For example, create the file `src/modules/blog/service.ts` with the following content:

## 3. Export Module Definition

A module must have an `index.ts` file in its root directory that exports its definition. The definition specifies the main service of the module.

For example, create the file `src/modules/blog/index.ts` with the following content:

## 4. Add Module to the product's Configurations

To start using the module, add it to `the product-config.ts`:

## 5. Generate and Run Migrations

To generate migrations for your module, run the following command:

Then, to run migrations, run the following command:

## Use Module

You can use the module in customizations within the product application, such as workflows and API routes.

For example, to use the module in an API route:

# Custom CLI Script

A custom CLI script is a function to execute through the product's CLI tool. This is useful when creating custom the product tooling to run as a CLI tool.

> Learn more about custom CLI scripts in this documentation.

## How to Create a Custom CLI Script?

To create a custom CLI script, create a TypeScript or JavaScript file under the `src/scripts` directory. The file must default export a function.

For example, create the file `src/scripts/my-script.ts` with the following content:

The function receives as a parameter an object having a `container` property, which is an instance of the product Container. Use it to resolve resources in your the product application.

---

## How to Run Custom CLI Script?

To run the custom CLI script, run the `exec` command:

---

## Custom CLI Script Arguments

Your script can accept arguments from the command line. Arguments are passed to the function's object parameter in the `args` property.

For example:

Then, pass the arguments in the `exec` command after the file path:

# Custom subscribers

Subscribers handle events emitted in the product application.

> Learn more about Subscribers in this documentation.

The subscriber is created in a TypeScript or JavaScript file under the `src/subscribers` directory.

For example, create the file `src/subscribers/product-created.ts` with the following content:

A subscriber file must export:

- The subscriber function that is an asynchronous function executed whenever the associated event is triggered.
- A configuration object defining the event this subscriber is listening to.

## Subscriber Parameters

A subscriber receives an object having the following properties:

- `event`: An object holding the event's details. It has a `data` property, which is the event's data payload.
- `container`: the product container. Use it to resolve modules' main services and other registered resources.

# Custom Workflows

A workflow is a series of queries and actions that complete a task.

The workflow is created in a TypeScript or JavaScript file under the `src/workflows` directory.

> Learn more about workflows in this documentation.

For example:

## Execute Workflow

You can execute the workflow from other resources, such as API routes, scheduled jobs, or subscribers.

For example, to execute the workflow in an API route: