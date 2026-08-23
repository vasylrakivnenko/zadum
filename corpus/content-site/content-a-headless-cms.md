## the product is the Next.js fullstack framework.

Write the product Config and instantly get a full Admin Panel, a database with migrations, REST and GraphQL APIs, authentication, access control, file storage, live preview, and more — all in one open-source TypeScript codebase you own and deploy anywhere.

the product is based around a small and intuitive set of high-level concepts. Before starting to work with the product, it's a good idea to familiarize yourself with these concepts in order to establish a common language and understanding when discussing the product.

## Retrieving Data

Everything the product does (create, read, update, delete, login, logout, etc.) is exposed to you via three APIs:

  **Note:** All of these APIs share the exact same query language. More
  details.

## Package Structure

the product is abstracted into a set of dedicated packages to keep the core `the product` package as lightweight as possible. This allows you to only install the parts of the product based on your unique project requirements.

  **Important:** Version numbers of all official the product packages are always
  published in sync. You should make sure that you always use matching versions
  for all official the product packages.

`the product`

The `the product` package is where core business logic for the product lives. You can think of the product as an ORM with superpowers—it contains the logic for all the product "operations" like `find`, `create`, `update`, and `delete` and exposes a Local API. It executes Access Control, Hooks, Validation, and more.

the product itself is extremely compact, and can be used in any Node environment. As long as you have `the product` installed and you have access to your the product Config, you can query and mutate your database directly without going through an unnecessary HTTP layer.

the product also contains all TypeScript definitions, which can be imported from `the product` directly.

Here's how to import some common the product types:

`@the product/next`

Whereas the product itself is responsible for direct database access, and control over the product business logic, the `@the product/next` package is responsible for the Admin Panel and the entire HTTP layer that the product exposes, including the REST API and GraphQL API.

`@the product/graphql`

All of the product's GraphQL functionality is abstracted into a separate package. the product, its Admin UI, and REST API have absolutely no overlap with GraphQL, and you will incur no performance overhead from GraphQL if you are not using it. However, it's installed within the `@the product/next` package so you don't have to install it manually. You do, however, need to have GraphQL installed separately in your `package.json` if you are using GraphQL.

`@the product/ui`

This is the UI library that the product's Admin Panel uses. All components are exported from this package and can be re-used as you build extensions to the product admin UI, or want to use the product components in your own React apps. Some exports are server components and some are client components.

`@the product/db-postgres`, `@the product/db-vercel-postgres`, `@the product/db-mongodb`, `@the product/db-sqlite`

You can choose which Database Adapter you'd like to use for your project, and no matter which you choose, the entire data layer for the product is contained within these packages. You can only use one at a time for any given project.

`@the product/richtext-lexical`

the product's Rich Text functionality is abstracted into a separate package. If you want to enable Rich Text in your project, you'll need to install this package.

  **Note:** Rich Text is entirely optional and you may not need it for your
  project.

the product started as a headless Content Management System (CMS), but since, we've seen our community leverage the product in ways far outside of simply managing pages and blog posts. It's grown into a full-stack TypeScript app framework.

Large enterprises use the product to power significant internal tools, retailers power their entire storefronts without the need for headless Shopify, and massive amounts of digital assets are stored + managed within the product. Of course, websites large and small still use the product for content management as well.

### Headless CMS

The biggest barrier in large web projects cited by marketers is engineering. On the flip side, engineers say the opposite. This is a big problem that has yet to be solved even though we have countless CMS options.

the product has restored a little love back into the dev / marketer equation with features like Live Preview, redirects, form builders, visual editing, static A/B testing, and more. But even with all this focus on marketing efficiency, we aren't compromising on the developer experience. That way engineers and marketers alike can be proud of the products they build.

If you're building a website and your frontend is on Next.js, then the product is a no-brainer.

  Instead of going out and signing up for a SaaS vendor that makes it so you
  have to manage two completely separate concerns, with little to no native
  connection back and forth, just install the product in your existing Next.js repo
  and instantly get a full CMS.

Get started with the product as a CMS using our official Website template:

### Enterprise Tool

When a large organization starts up a new software initiative, there's a lot of plumbing to take care of.

- Scaffold the data layer with an ORM or an app framework like Ruby on Rails or Laravel
- Implement their SSO provider for authentication
- Design an access control pattern for authorization
- Open up any REST endpoints required or implement GraphQL queries / mutations
- Implement a migrations workflow for the database as it changes over time
- Integrate with other third party solutions by crafting a system of webhooks or similar

And then there's the Admin Panel. Most enterprise tools require an admin UI, and building one from scratch can be the most time-consuming aspect of any new enterprise tool. There are off-the-shelf packages for app frameworks like Rails, but often the customization is so involved that using Material UI or similar from scratch might be better.

Then there are no-code admin builders that could be used. However, wiring up access control and the connection to the data layer, with proper version control, makes this a challenging task as well.

That's where the product comes in. the product instantly provides all of this out of the box, making complex internal tools extremely simple to both spin up and maintain over time. The only custom code that will need to be written is any custom business logic. That means the product can expedite timelines, keep budgets low, and allow engineers to focus on their specific requirements rather than complex backend / admin UI plumbing.

Generally, the best place to start for a new enterprise tool is with a blank canvas, where you can define your own functionality:

### Headless Commerce

Companies who prioritize UX generally run into frontend constraints with traditional commerce vendors. These companies will then opt for frontend frameworks like Next.js which allow them to fine-tune their user experience as much as possible—promoting conversions, personalizing experiences, and optimizing for SEO.

But the challenge with using something like Next.js for headless commerce is that in order for non-technical users to manage the storefront, you instantly need to pair a headless commerce product with a headless CMS. Then, your editors need to bounce back and forth between different admin UIs for different functionality. The code required to seamlessly glue them together on the frontend becomes overly complex.

the product can integrate with any payment processor like Stripe and its content authoring capabilities allow it to manage every aspect of a storefront—all in one place.

If you can build your storefront with a single backend, and only offload things like payment processing, the code will be simpler and the editing experience will be significantly streamlined. Manage products, catalogs, page content, media, and more—all in one spot.

### Digital Asset Management

the product's API-first tagging, sorting, and querying engine lends itself perfectly to all types of content that a CMS might ordinarily store, but these strong fundamentals also make it a formidable Digital Asset Management (DAM) tool as well.

Similarly to the Ecommerce use case above, if an organization uses a CMS for its content but a separate DAM for its digital assets, administrators of both tools will need to juggle completely different services for tasks that are closely related. Two subscriptions will need to be managed, two sets of infrastructure will need to be provisioned, and two admin UIs need to be used / learned.

the product flattens CMS and DAM into a single tool that makes no compromises on either side. Powerful features like folder-based organization, file versioning, bulk upload, and media access control allow the product to simultaneously function as a full Digital Asset Management platform as well as a Content Management System at the same time.

Click here for more information on how to get started with the product as a DAM.

## Is the product Right For You?

the product is a great choice for applications of all sizes and types, but it might not be the right choice for every project. Here are some guidelines to help you decide if the product is the right choice for your project.

### When the product might be for you

- If data ownership and privacy are important to you, and you don't want to allow another proprietary SaaS vendor to host and own your data
- If you're building a Next.js site that needs a CMS
- If you need to re-use your data outside of a SaaS API
- If what you're building has custom business logic requirements outside of a typical headless CMS
- You want to deploy serverless on platforms like Vercel

### When the product might not be for you

- If you can manage your project fully with code, and don't need an admin UI
- If you are building a website that fits within the limits of a tool like Webflow or Framer
- If you already have a full database and just need to visualize the data somehow
- If you are confident that you won't need code / data ownership at any point in the future

A Collection is a group of records, called Documents, that all share a common schema. You can define as many Collections as your application needs. Each Document in a Collection is stored in the Database based on the Fields that you define, and automatically generates a Local API, REST API, and GraphQL API used to manage your Documents.

Collections are also used to achieve Authentication in the product. By defining a Collection with `auth` options, that Collection receives additional operations to support user authentication.

Collections are the primary way to structure recurring data in your application, such as users, products, pages, posts, and other types of content that you might want to manage. Each Collection can have its own unique Access Control, Hooks, Admin Options, and more.

To define a Collection Config, use the `collections` property in your the product Config:

  **Tip:** If your Collection is only ever meant to contain a single Document,
  consider using a Global instead.

## Config Options

It's often best practice to write your Collections in separate files and then import them into the main the product Config.

Here is what a simple Collection Config might look like:

  **Reminder:** For more complex examples, see the
  Templates and
  Examples
  directories in the product repository.

The following options are available:

  Option                 Description

  `admin`                The configuration options for the Admin Panel. More details.
  `access`               Provide Access Control functions to define exactly who should be able to do what with Documents in this Collection. More details.
  `auth`                 Specify options if you would like this Collection to feature authentication. More details.
  `custom`               Extension point for adding custom data (e.g. for plugins)
  `disableDuplicate`     When true, do not show the "Duplicate" button while editing documents within this Collection and prevent `duplicate` from all APIs.
  `defaultSort`          Pass a top-level field to sort by default in the Collection List View. Prefix the name of the field with a minus symbol ("-") to sort in descending order. Multiple fields can be specified by using a string array.
  `dbName`               Custom table or Collection name depending on the Database Adapter. Auto-generated from slug if not defined.
  `endpoints`            Add custom routes to the REST API. Set to `false` to disable routes. More details.
  `fields` \*            Array of field types that will determine the structure and functionality of the data stored within this Collection. More details.
  `graphQL`              Manage GraphQL-related properties for this collection. More
  `hooks`                Entry point for Hooks. More details.
  `hierarchy`            Enable hierarchical tree structure with automatic parent-child relationships and path generation. More details.
  `orderable`            If true, enables custom ordering for the collection, and documents can be reordered via drag and drop. Uses orderable for efficient reordering.
  `labels`               Singular and plural labels for use in identifying this Collection throughout the product. Auto-generated from slug if not defined.
  `enableQueryPresets`   Enable query presets for this Collection. More details.
  `lockDocuments`        Enables or disables document locking. By default, document locking is enabled. Set to an object to configure, or set to `false` to disable locking. More details.
  `slug` \*              Unique, URL-friendly string that will act as an identifier for this Collection.
  `timestamps`           Set to false to disable documents' automatically generated `createdAt` and `updatedAt` timestamps.
  `trash`                A boolean to enable soft deletes for this collection. Defaults to `false`. More details.
  `typescript`           An object with property `interface` as the text used in schema generation. Auto-generated from slug if not defined.
  `upload`               Specify options if you would like this Collection to support file uploads. For more, consult the Uploads documentation.
  `versions`             Set to true to enable default options, or configure with object properties. More details.
  `defaultPopulate`      Specify which fields to select when this Collection is populated from another document. More Details.
  `indexes`              Define compound indexes for this collection. This can be used to either speed up querying/sorting by 2 or more fields at the same time or to ensure uniqueness between several fields.
  `select`               Function that receives the current `operation`, `req`, and caller's `select`, and returns the final `select` to apply. Useful for forcing fields to be populated for hooks / access control. More details.
  `disableBulkDelete`    Disable the bulk delete operation for the collection in the admin panel and the REST API
  `disableBulkEdit`      Disable the bulk edit operation for the collection in the admin panel and the REST API

_\* An asterisk denotes that a property is required._

### Fields

Fields define the schema of the Documents within a Collection. To learn more, go to the Fields documentation.

### Access Control

Collection Access Control determines what a user can and cannot do with any given Document within a Collection. To learn more, go to the Access Control documentation.

### Hooks

Collection Hooks allow you to tie into the lifecycle of your Documents so you can execute your own logic during specific events. To learn more, go to the Hooks documentation.

### Orderable

When `orderable` is enabled, the product uses fractional indexing to efficiently manage document order. When enabled on collections, this allows you to manually drag and drop documents in the Admin Panel to reorder them, as well as programmatically set the order of documents via the Local API, REST API, or GraphQL API.

Orderable can also be added to joins fields.

#### Fractional indexing

If you need to generate order keys programmatically (e.g., when creating documents via the Local API with a specific order), you can import the utilities directly:

These utilities are useful when you need fine-grained control over document ordering, such as inserting documents at specific positions or batch-creating documents with predetermined order.

## Admin Options

The behavior of Collections within the Admin Panel can be fully customized to fit the needs of your application. This includes grouping or hiding their navigation links, adding Custom Components, selecting which fields to display in the List View, and more.

To configure Admin Options for Collections, use the `admin` property in your Collection Config:

The following options are available:

  Option                         Description
