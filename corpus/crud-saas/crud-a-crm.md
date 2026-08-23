the product is a full-featured CRM platform. Here's what you can build with it.

    Custom Data Model
    Define the exact data structure your business needs.
    Create custom objects, add custom fields with 20+ field types, and build relationships between any objects.

    Views & Pipelines
    Switch between table views, kanban boards, and calendar views.
    Filter with AND/OR logic, sort by multiple fields, group records, and save custom views.

    Workflows & Automation
    Automate any business process without writing code.
    Trigger workflows on record changes, schedules, manual actions, or incoming webhooks.

    Calendar & Email Sync
    Connect your Google Workspace or Microsoft 365 account.
    Emails and calendar events automatically appear on the relevant CRM records.

    AI
    AI agents that work autonomously within your CRM — answering questions, enriching records, and executing multi-step tasks within your permission model.

    Dashboards & Reporting
    Build custom dashboards with real-time widgets.
    Track pipeline metrics, team performance, and business KPIs with configurable charts and filters.

    Permissions & Access Control
    Role-based access control at every level — objects, fields, and individual records.
    Configure SSO with SAML or OIDC. Audit logs track who did what.

    API & Extensibility
    A developer-first API that adapts to your custom data model.
    Both GraphQL and REST endpoints, with auto-generated documentation per workspace.

    Data Import & Export
    Import data from CSV files or via API.
    Field mapping, duplicate detection, and error handling built in. Export your data anytime — no lock-in.

    Self-Hosting
    Run the product on your own infrastructure with a single Docker Compose command.
    Full control over your data, updates on your schedule.

Everything in the product is built around **objects** and **fields** — the building blocks of your data model.

## Objects

Objects are the tables that hold your data. the product comes with standard objects out of the box:

- **Companies** — Organizations you do business with
- **People** — Individual contacts
- **Opportunities** — Deals in your pipeline
- **Tasks** — Action items for your team
- **Notes** — Free-form text linked to records

You can also create **custom objects** for anything your business needs — projects, support tickets, products, contracts, or anything else.

## Fields

Fields are the properties on each object. the product supports a wide range of field types:

  Category   Types

  **Basic**   Text, Number, Boolean, Date, Currency, Rating, Select
  **Composite**   Address (street, city, state, zip), Full Name, Links, Phones, Emails
  **Special**   Relation, File Attachment, JSON, Actor (who created/modified)

Every object also gets automatic system fields: `id`, `createdAt`, `updatedAt`, `createdBy`, and `position`.

## Relations

Objects connect to each other through relations. A Company has many People, an Opportunity belongs to a Company, and so on. You can create custom relations between any objects, including many-to-many relationships.

## What makes this powerful

Unlike traditional CRMs where you're limited to pre-defined fields on pre-defined objects, the product lets you model your data exactly the way your business works. Custom objects get the same first-class treatment as built-in ones — including API endpoints, views, permissions, and workflow triggers.

  Full reference on objects, fields, relations, and how to configure them.

Workflows let you automate repetitive tasks and connect the product to external tools — without writing code (though you can if you want to).

## How workflows work

Every workflow has three parts:

1. **Trigger** — What starts the workflow
2. **Steps** — What happens next (one or more actions in sequence)
3. **Variables** — Data that flows between steps

## Triggers

  Trigger   When it fires

  **Record event**   A record is created, updated, deleted, or upserted
  **Manual**   A user clicks a button (on a single record, multiple records, or globally)
  **Schedule**   On a recurring interval (cron syntax)
  **Webhook**   An external system sends an HTTP POST

## Actions

Workflows can chain any combination of:

- **Record operations** — Create, update, find, delete, or upsert records
- **Send email** — Send or draft emails from connected accounts
- **HTTP request** — Call any external API
- **Code** — Run custom JavaScript for complex logic
- **Branches** — If/else conditions to split the workflow path
- **Iterator** — Loop over arrays of data
- **AI Agent** — Let an AI agent process data autonomously
- **Delay** — Wait before continuing
- **Form** — Collect user input mid-workflow

## What you can build

- Send Slack alerts when a deal reaches a certain stage
- Auto-enrich new contacts with data from external APIs
- Detect stale opportunities and notify the owner
- Sync data between the product and your billing system
- Generate PDFs or invoices from record data
- Auto-reply to inbound emails matching certain criteria

  Detailed reference on triggers, actions, variables, and real-world automation recipes.

## The main layout

The center of the screen is where your records live — people, companies, opportunities, tasks, notes, dashboards, workflows, and any custom objects. You view, edit, and delete records here, and create new views.

## Navigation bar

The left sidebar gives you:
- **Workspace switcher** — switch between workspaces or create a new one (top dropdown)
- **Search** — press `/` to focus instantly, searches across all objects
- **Settings** — access from the top left
- **Favorites** — pinned views, unique per user
- **Object shortcuts** — quick access to People, Companies, Opportunities, etc.
- **Workflows** — create automations

Drag items to reorder, create folders to group related objects, hide what you don't use.

## Command menu

Press `Cmd+K` (Mac) or `Ctrl+K` (Windows) — or click the three dots in the top right. From here you can:
- Create new records
- Import and export data via CSV
- Create new views
- Access deleted records (the product supports soft and hard deletes)
- See keyboard shortcuts for navigating your workspace

## Search

Accessible via the Command Menu, the top of the navigation bar, or by pressing `/`. Search works across all objects.

## Side panel

Click a record to open the side panel on the right — a quick overview of the record's key information without leaving the current page. Click **Open** to go to the full record page.

## Views

Every object supports multiple views — unlimited per object. Use the dropdown at the top left to switch between them.

- **Table** — spreadsheet-style rows and columns, with grouping, inline editing, and column customization
- **Kanban** — drag-and-drop cards organized by a select field, ideal for pipelines
- **Calendar** — records plotted by a date field for time-based planning

Each view saves its own filters, sorting, and field visibility. Share views with your workspace or keep them private. Favorite views for fast access from the sidebar.

## Record pages

When you open a record, the detail page is built from configurable **tabs** and **widgets**. Add, remove, reorder, and resize widgets on a grid — fields, related records, emails, timeline, tasks, notes, files, charts, iframes, and more. Each object type has its own layout.

  Navigation, views, record pages — detailed reference and how-tos.

Dashboards give you real-time visibility into your business metrics — pipeline health, team performance, revenue trends, and anything else you want to track.

## Widgets

Each dashboard is made up of widgets. A widget is a single chart or metric tied to your CRM data. You can configure:

- **Chart type** — Bar, line, pie, number, and more
- **Data source** — Any object in your data model (standard or custom)
- **Filters** — Narrow down to specific records, date ranges, or segments
- **Aggregation** — Count, sum, average, min, max on any numeric field
- **Grouping** — Break down by select fields, dates, or relations

## What you can track

- Pipeline value by stage
- Deals closed over time
- Average deal size by source
- Task completion rates
- Custom metrics on any object

## Sharing

Dashboards are workspace-level — everyone on your team can see them. Arrange widgets in a grid layout and resize them to build the view that works for your team.

  Detailed reference on creating dashboards, configuring widgets, and chart settings.

the product connects to your existing tools so your CRM stays up to date without manual data entry.

## Email sync

Connect your **Google Workspace** or **Microsoft 365** mailbox. Once connected:

- Emails are automatically linked to the matching Company and People records
- Full email threads are visible on each record's timeline
- You can send emails directly from the product
- Multiple mailboxes per user are supported

You control what gets imported — filter by date range or sender to avoid pulling in irrelevant emails.

## Calendar sync

Calendar events sync automatically from your connected account. Events appear on the relevant CRM records, giving you a complete picture of your interactions with each contact or company.

## Integrations

Beyond email and calendar, the product connects to external tools through:

  Method   Use case

  **API**   Build custom integrations with the GraphQL or REST API
  **Webhooks**   Push real-time notifications to external systems when records change
  **Zapier**   Connect to 5,000+ apps without code
  **Workflow HTTP actions**   Call any external API as part of an automated workflow

## Custom apps

Developers can build full-featured apps on top of the product — adding custom UI, server-side logic, and deep integrations. Apps can be published for the community or kept private.

    Set up email sync, calendar sync, and troubleshoot issues.

    Build custom integrations with the product API.

the product's permission system lets you control who can access and modify data in your workspace. Create roles, assign permissions, and configure SSO for secure access.

## What's in this section

    Create roles and configure object, field, and settings permissions.

    Set up Single Sign-On with your identity provider.

    Common questions about roles, permissions, and SSO.

## Key features

- **Role-based access**: Create custom roles with specific permissions
- **Object permissions**: Control who can view, edit, or delete records
- **Field permissions**: Restrict access to sensitive fields
- **Settings permissions**: Control access to workspace configuration
- **SSO integration**: Configure single sign-on for enterprise security (Organization plan)

## Quick links

- Create a Role
- Configure SSO
- Manage team members

## Understanding Views

Views are saved configurations that determine how your data is displayed. Each view can have its own:
- **Layout**: Table, Kanban, or Calendar
- **Filters**: Which records to show
- **Sorting**: How records are ordered
- **Fields**: Which columns are visible

## View Types

### Table View
The default spreadsheet-like view showing records in rows with customizable columns.

### Kanban View
A visual board view where records appear as cards organized by stages. Ideal for:
- Sales pipelines
- Project tracking
- Any workflow with defined stages

### Calendar View
A calendar view that displays records with date fields. Perfect for:
- Meetings and events
- Deadlines and due dates
- Time-based planning

## Creating a View
There are two ways to create a new view.
### Use the View Dropdown Menu
1. Navigate to any object (People, Companies, etc.)
2. Click the view name at the top left (shows current view with a dropdown arrow)
3. Click **+ Add view**
4. Name your view and click **Create**
5. Choose a layout (Table, Kanban, or Calendar) under **Options**
6. Add filters and sorting as needed
7. Select which fields to display and reorder them
8. Click **Save**

### Start by Editing an Existing View
1. Navigate to any object (People, Companies, etc.)
2. Choose a layout (Table, Kanban, or Calendar) under **Options**, and add filters and sorting as needed
3. Click on **Save as new view**
4. Name your view and click **Create**
5. Keep editing your new view
6. Click on **Update view** to save your additional configurations

## Managing Views

### Edit a View
1. Select the view from the dropdown
2. Make your changes (filters, sorting, columns)
3. Click **Save** to update the view

### Rename a View or Change Its Icon
1. Open the view dropdown
2. Click the **⋮** menu next to the view name
3. Select **Edit**
4. Change the name or icon
5. Click **Save**

### Reorder Views
1. Open the view dropdown
2. Click and drag a view by its handle
3. Drop it in the desired position
4. The new order is saved automatically

### Add to Favorites
Pin frequently used views for quick access:
1. Open the view dropdown
2. Click the **⋮** menu next to a view
3. Select **Add to favorites**
4. The view appears in your favorites section

### Delete a View
1. Select the view to delete
2. Click the view dropdown
3. Click the **⋮** menu next to the view
4. Select **Delete**
5. Confirm deletion

Deleted views cannot be recovered. Make sure you want to remove it before confirming.

## View Visibility

Each view (except the default "All [Object Name]" views) has its own visibility setting.

To change visibility:
1. Open the view
2. Click **Options → Visibility**
3. Choose:
   - **Workspace**: Visible to all workspace members
   - **Unlisted**: Visible only to you

The default "All [Object Name]" views cannot have their visibility changed.

## Next Steps

- Table Views
- Kanban Views
- Filters and Sorting
- View Settings

## What is a Data Model?

A data model is the structure that defines how information is organized in your CRM. Think of it as the **blueprint** of your customer data — you design it once, then fill it with your actual data.

## Key Concepts

### Objects

**Objects** are the main categories of data in your CRM. Each object represents a type of thing you want to track.

the product comes with standard objects:
- **People** — individuals (contacts, leads, partners)
- **Companies** — organizations
- **Opportunities** — deals or sales
- **Notes** — notes attached to records
- **Tasks** — to-dos linked to records

You can also create **custom objects** for anything specific to your business (e.g., Projects, Subscriptions, Events).

### Fields

**Fields** are the properties or attributes that describe each object. They store the actual information.

For example, the **People** object has fields like:
- Name
- Email
- Phone
- Job Title
- Company (a relation to the Companies object)

Fields have different **types**: text, number, date, select, multi-select, relation, and more. You can add custom fields to any object.

### Records

**Records** are the individual entries within an object — the actual data you create and manage.

For example:
- "John Smith" is a **record** in the People object
- "Acme Corp" is a **record** in the Companies object

**An analogy:**
  Data Model Concept   Real-World Analogy

  **Objects**   Sections in a book (the categories)
  **Fields**   Columns in a spreadsheet (the properties)
  **Records**   Rows in a spreadsheet (the actual entries)

You design the data model (objects + fields) once, then create many records within that structure.

## Why Customize Your Data Model?

Every business works differently. Customizing your data model means you can shape the product around **your** processes instead of forcing yours into a rigid system.

the product offers full flexibility:
- Create as many custom objects as you need
- Add unlimited custom fields
- The price doesn't change based on customization

## Tips to Design Your Data Model

### 1. Start with Your Core Objects

Identify the main concepts you work with. the product already provides:
- **People** — your contacts
- **Companies** — your accounts
- **Opportunities** — your deals

Think about what else you might need:
- Stripe would need a `Subscriptions` object
- Airbnb would need a `Trips` object
- An accelerator would need a `Batches` object

### 2. Use Fields for Variations, Not New Objects

If something is just a characteristic of an existing object, make it a **field**.

**Use fields for:**
- Categories and labels (e.g., `Industry` for Companies)
- Status values (e.g., `Stage` for Opportunities)
- Attributes and properties

### 3. Create an Object When It Stands on Its Own

If the concept has its own lifecycle, properties, or relationships, it deserves an object.

**Create an object for:**
- **Projects** — have deadlines, owners, and tasks
- **Subscriptions** — connect companies, products, and invoices
- **Events** — involve attendees and follow-up actions

These go beyond a single field because they carry their own data and relationships.

### 4. Create an Object When Records Are Open-Ended

If something can be linked multiple times and you don't know how many, use an object.

**Bad approach:**
Creating fields like `Product 1`, `Product 2`, `Product 3`...

**Good approach:**
Create a `Products` object and relate it to records. This supports one, two, or a hundred products without changing your model.

### 5. Keep It Simple First

Start with fields. Move to new objects only when you feel the limits:
- Too many fields on one object
- Repeated records that should be separate
- Relationships that don't fit neatly

## Special Note on People, Companies, and Opportunities

**Email and calendar sync only works with People, Companies, and Opportunities.**

These are the only objects where you can access synchronized emails and meetings from your mailbox/calendar. We recommend using them as much as possible.

**Best practices:**
- If you need categories of People, use fields (not new objects)
- Example: Use a `Person Type` field with values "Prospect" and "Partner" instead of creating separate objects
- Create different **views** to filter: one showing partners, another showing prospects

**It's okay to have fields that don't apply to every record.** For example, a `Referral Link` field on People that only applies when `Person Type = Partner`. Hide this field from views where it's not relevant.

## Questions to Guide Your Choice

Ask yourself:

Is this just a property of something I already have, or does it need its own properties?
Will I ever need to track multiple of these per record, without knowing how many?
Does this concept connect to several different objects, not just one?
Will it have its own lifecycle (stages, start/end dates)?

If the answer is "yes" to one or more, it's probably time for a new object.

## Accessing Your Data Model

1. Go to **Settings** in the left sidebar
2. Click **Data Model**
3. View all your objects (standard and custom)
4. Click any object to see and edit its fields

**Don't see Data Model in Settings?**

Access to the data model is usually restricted to administrators. Contact your workspace admin if you need access.

## Next Steps

Once you've planned your data model:

- How to Create Custom Objects
- How to Create Custom Fields
- How to Create Relation Fields

## Need Help?

  Want help designing your data model? Find a certified the product partner to design and build your objects, fields, and relationships.

## Initial Setup

When you first create your workspace, there are several key settings to configure.

### Workspace Name and Logo
1. Go to **Settings → General**
2. Update your workspace name
3. Upload your company logo
4. Save your changes

### Time Zone and Date Format
1. Go to **Settings → Experience**
2. Select your time zone
3. Choose your preferred date format
4. Save your changes

## Essential Configurations
