# Permissions introduction

There are always going to be sensitive bits of information in your data, and thankfully the product provides a rich set of tools to ensure that people on your team only see the data they're supposed to.

If instead you're wondering about what data the product the company can see, check out our page on data privacy and security.

## Key points regarding permissions

- Permissions are granted to groups, not people. Though you can define user attributes to apply permissions person to person.
- People can be in more than one group.
- If a person is in multiple groups, they will have the _most permissive_ access granted to them across all of their groups. For example, if a person is in three groups, and any one of those groups has Curate access to a collection, then that person will have curate access to that collection.
- By default, everyone is in the All users group, so be sure to block that group's access before granting permissions to other groups. Thankfully, the product will warn you if the All users group has more permissive permissions than the group you're restricting.

## What you can set permissions on

- Data permissions - Control access to databases, schemas, and tables, including:
  - View data
  - Create queries
  - Download results
  - Manage database
- Collection permissions - Control access to questions, dashboards, models, metrics, events, and timelines
- Application permissions - Control access to admin features (Pro and Enterprise plans only):
  - Settings tab in Admin panel
  - Monitoring tools and troubleshooting
  - Dashboard subscriptions and alerts
- Snippet folder permissions - Control access to SQL snippet folders (available on plans with snippet folders)

## Tools for managing multi-tenant setups

At a high-level, the product provides several approaches to managing permissions for different multi-tenant setups, depending on how you've segregated your data.

### Your customers share a single database

The row and column security permission setting lets you restrict rows and columns based on who's logged in.

### Each customer has their own database

With Database routing, you can build a question once, and have the product send a query to a different database depending on the customer.

### You'd prefer to manage permissions via the database itself

With Connection impersonation, you can manage permissions with roles you define in your database.

# Data permissions

This page covers permissions for databases and tables. If you haven't already, check out our Permissions overview.

## Setting permissions on a database, schema, or table

To set data permissions on a database, schema, or table for a group:

1. Hit Cmd/Ctrl + K. Search for **Permissions** and click on the Permissions settings result. the product will default to the **Data** tab.

Or

1. Click the **grid** icon in the upper right.

2. Select **Admin**.

3. Click on the **Permissions** tab, which defaults to the **Data** tab.

You can view permissions either by group or by database.

## Data permission types

You can set the following types of permissions on a database, schema, or table:

- View data
- Create queries
- Download results
- Manage table metadata
- Manage database
- Transform

If you need to change the target database based on who is logged in, check out Database routing. Database routing is particularly useful when each of your customers has their own database.

## Before you apply specific permissions, block the All Users group

Before you apply more specific permissions, you'll want to make sure that no one can see any data. Since everyone's automatically in the All Users group, you'll want to block this group from seeing any data.

In the **Admin** > **Permissions** > **Data**, block the All Users group's access to the database.

From there, you can selectively grant privileges to different groups.

## View data permissions

The **View data** permission determines what data people can see when viewing questions, dashboards, models, and metrics. View data permissions also determine whether a group can view the models and metrics browsers in the sidebar. To browse databases, a group will also need Create queries permissions for the relevant data.

Permission levels include:

- Can view
- Granular
- Row and column security
- Impersonated
- Blocked

View data permission settings apply to different levels in your database:

  View data permission      Database   Schema   Table

  Can view                  ✅         ✅       ✅
  Granular\*                ✅         ✅       ❌
  Row and column security   ❌         ❌       ✅
  Impersonated              ✅         ❌       ❌
  Blocked                   ✅         ✅       ✅

\* The "Granular" setting is not itself a type of permission; it just signals that permissions are set at a level below the current level. For example, you can select "Granular" at a schema level to set permissions per table for tables in that schema.

In the free, open-source version of the product, the **View data** setting defaults to "Can view". Since the setting's options aren't available in the OSS version, the product will only display this **View data** setting in the Pro/Enterprise version.

For _which_ questions, models, and dashboards a group can view, instead see collection permissions.

### Can view data permission

Setting to **Can view** means the group can view all the data for the data source, provided they have collection permissions to view questions, models, and dashboards.

In order to view the data in the Browse databases section, the group would additionally need to be able to Create queries.

### Granular view data permission

This option lets you set View data permissions for individual schemas or tables. Available only for databases and schemas. If you select Granular for a database or schema, the product will open that data source and ask you to set permissions for each individual schema or table.

For tables, you have the option to set either **Can view** or **Sandboxed**.

### Row and column security

Allows you to set row-level permissions based on user attributes, as well as custom views. Can only be configured at the table level.

See Row and column security.

### Impersonated view data permission

The **Impersonated** option lets you use a role in your database to specify what data people can view and query. Impersonation can only be set at the database level, as the product will defer to the permissions granted to the database role.

See impersonated view data permissions

### Blocked view data permission

**Blocked** ensures people in a group can’t see the data from this database, schema, or table, regardless of their permissions at the collection level.

The Blocked view data permission can be set at the database, schema, or table level. Essentially, what Blocked does is make collections permissions _insufficient_ to view a question. For example, even if a question is in a collection that the group has access to, but that question queries a data source that is Blocked for that group, people in that group won't be able to view that question _unless_ they're in another group with the data permissions to that data source.

Setting blocked access for a group ALWAYS prevents the group from viewing questions built with the native query editor that query ANY tables from the same database. So even if you only block a single table in a database, the group won't be able to view the results of SQL questions that query ANY table in that database. The reason: the product doesn't (yet) parse SQL queries, so it can't know for sure whether the SQL queries the table you want to block.

If a person in a Blocked group belongs to _another_ group that has its View data permission set to "Can view", that more permissive access will take precedence, and they'll be able to view that question.

## Create queries permissions

Specifies whether a group can create new questions based on the data source. Creating queries includes the ability to drill-through and filter questions, or anything that involves changing the results. This permission also determines whether a group will get access to the database browser to explore that data source.

To enable Create queries permissions for a group, that group must be able to view the data source ("Can view" permission.)

Create query levels include:

### Query builder and native create queries permission

People can use the product's query builder or its native/SQL editor.

If a group has "Blocked" or "Row and column security" View data permissions for _any_ of the tables in the database, then this group will have native queries disabled for _all_ tables in that database. That's because the product can't parse SQL queries, so it can't know for sure whether the SQL queries are using the tables with restricted access.

### Query builder only create queries permission

People can create new questions and drill-through existing questions using the product's query builder.

### Granular

The granular option lets you define Create queries permissions for each schema and/or table in the database.

## Download results permissions

You can set permissions on whether people in a group can download results (and how many rows) from a data source. Options are:

- No (they can't download results)
- Granular (you want to set access for individual tables or schemas)
- 10 thousand rows
- 1 million rows

Downloads of native queries are only allowed if a group has download permissions for the _entire_ database. If a group only has download permissions for specific tables or schemas (using the Granular setting), they won't be able to download results from native/SQL queries, even for tables they have permissions for. This is because the product doesn't parse SQL queries, so it can't determine which tables are being queried.

## Manage table metadata permissions

You can define whether a group can edit table metadata. Options are:

- Yes (meaning, they can edit metadata for that data source).
- No
- Granular (to set permissions specific to each table).

## Manage database permissions

The **Manage database** permission grants access to the settings page for a given database (i.e., the page at **Admin** > **Databases** > your database).

On the database settings page, you can:

- Edit any of the connection options for the data source.
- Sync schemas.
- Scan field values.

Note that only admins can delete database connections in your the product, so people with **Manage database** permissions won't see the **Remove database** button.

## Revoke access even though "All Users" has greater access

If you see this modal pop-up, the product is telling you that the people in the All Users group (that is, everyone in your the product), have a higher level of access to the database, schema, or table that you're setting permissions on. To limit your current group to your preferred permission level, the All Users group must have a less permissive level of access to the data source in question.

## Upload permissions

See Upload permissions.

## Transform permissions

Transform permissions control who can manage and run transforms on a database. Transform permissions can only be set on a database level, not on a table level.

A group can only have transform permissions for a database if they also have "View data" and "Query builder and native" permissions for _all_ the tables in a database.

## Further reading

- Permissions introduction
- Impersonation
- Learn permissions
- Troubleshooting permissions
- Users, roles, and privileges

# Collection permissions

You can use collections to organize questions, dashboards, models, timelines, and other collections. You can set permissions on those collections to determine which groups of people can view and curate collections' items.

the product starts out with a default top-level collection which is called **Our analytics**, which every other collection is saved inside of.

## Collection permission levels

There are three permission levels for collections:

- Curate access
- View access
- No access

  Action                               Curate Access   View Access   No Access

  View items                           ✅              ✅            ❌
  Edit items' title and descriptions   ✅              ❌            ❌
  Move items                           ✅              ❌            ❌
  Delete items                         ✅              ❌            ❌
  Pin items                            ✅              ❌            ❌
  View events and timelines            ✅              ✅            ❌
  Edit events and timelines            ✅              ❌            ❌

### Curate access

The group can view, edit, move, delete, and pin items saved in this collection, and can save or move new items into it. The group can also create new sub-collections within this collection. The group can also create and edit events and timelines.

### View access

The group can see all the questions, dashboards, and models in the collection, as well as events and timelines. Note: Curate access includes View access.

### No access

The group won't see this collection listed, and they'll lack access to any of the items saved within it.

## Collection vs data permissions

Collection permissions only apply to viewing and curating existing questions, models, and dashboards. Changing the query on an existing question, or creating a new question, requires that the group have data permissions for the underlying data.

There is one, important exception: when a group has their data permission set to Block for a database or table, the group won't be able to view questions based on that data, even if they have curate access to the collection where those questions are saved.

## Dashboards with questions from multiple collections

If a dashboard includes questions saved to other collections, the group will need view or curate access to all of those collections to view those questions. If not, the product will apologize and tell you that you lack permissions to see the cards saved to the other collections.

In general, it's easier to manage permissions when keeping all of a dashboard's questions in the same collection.

## Setting permissions for collections

You can set permissions on collections by clicking on the lock icon in the top-right of the screen while viewing the collection and clicking on **Edit permissions**. Only Administrators can edit collection permissions. Each user group can have either View, Curate, or No access to a collection:

If you want to see the bigger picture of what permissions your user groups have for all your collections, just click the link that says **See all collection permissions**, which takes you to the Admin Panel. You'll see a list of your collections down along the left, and clicking on any of those will bring up a list of each group's permission settings for that collection.

Just like with data access permissions, collection permissions are _additive_, meaning that if a user belongs to more than one group, if one of their groups has a more restrictive setting for a collection than another one of their groups, they'll be given the _more permissive_ setting. This is especially important to remember when dealing with the All Users group: since all users are members of this group, if you give the All Users group Curate access to a collection, then _all_ users will be given Curate access for that collection, even if they also belong to a group with _less_ access than that.

## Permissions and sub-collections

- Changing access to a collection doesn't automatically change access to _existing_ subcollections, but all _new_ subcollections will inherit the access level.

  For example, let's say you have a `Campaigns` collection with a `2025 reports` subcollection, and you change the "Data team" group's access to `Campaigns` from "View" to "Curate". Then by default, Data team will get Curate access to `Campaigns` but will retain only "View" access to `2025 reports`. However, if after these permissions are configured, someone adds a new subcollection `2026 reports`, then Data team will get Curate access to "2026 reports" because new subcollections inherit permissions from the parent collection.

- To change access for existing subcollections as well, toggle **Also change sub-collections** when changing collection access.

- A group can be given access to a collection located somewhere within one or more sub-collections _without_ having to have access to every collection "above" it.

  For example, if a group had access to the "Super Secret Collection" that's saved several layers deep within a "Marketing" collection that the group lacks access to, the "Super Secret Collection" would show up at the top-most level that the group _does_ have access to.

## Deleting collections

Users with curate permission for a collection can move collections to Trash, see Delete and Restore.

## Pinning items in collections

People in groups with Curate access to a collection can pin items in the collection. Pinning an item in a collection turns the item into a handsome card at the top of the collection.

To pin an item, select the **pin icon** next to the item's name.

Note that collections themselves can't be pinned. If you're running on a Pro or Enterprise plan, admins can designate Official Collections.

## Special collections

### Our analytics

The "Our analytics" collection and individual personal collections are invincible; they cannot be archived, injured, or slain. They are eternal.

### Usage analytics

See Usage analytics.

### Personal collections

Each person has a personal collection where they're always allowed to save things, even if they don't have Curate permissions for any other collections.

Administrators can see and edit the contents of every user's personal collection (even those belonging to other Administrators) by clicking on the **Other users' personal collections** link at the bottom of the sidebar when viewing "Our analytics".

A personal collection works just like any other collection except that its permissions are fixed and cannot be changed. If a sub-collection within a personal collection is moved to a different collection, the sub-collection will inherit the permissions of its new parent collection.

### Library collection

See Permissions for the Library and its subcollections.

Do not use collection permissions for **Library > Data** to control access to data in published tables. Use Data permissions instead.

### External collections

See Tenants > External collections

## Further reading

- Working with collection permissions.

# Application permissions

Application settings are useful for granting groups access to some, but not all, of the product's administrative features.

To set application permissions, go to the top right of the screen and click the **grid** icon > **Admin** > **Permissions** > **Application**.

## Settings access

Settings access defines which groups can view and edit the settings under the Admin > Settings tab. These settings include:

- Settings
- Email
- Slack
- Webhooks
- Maps
- Localization
- Appearance
- Public sharing
- Embedding in other applications
- Caching

## Monitoring access

People in groups with Monitoring access can view:

- Monitor, including:
  - Erroring questions
  - Background tasks
  - Scheduled jobs
  - Application logs (read-only)
  - Model persistence log
- The **Help** tab in Admin
- Troubleshooting

The following Monitor pages aren't included in Monitoring access:

- Dependency diagnostics: Available to admins and people in the Data Analysts group
- Alerts management: Available to admins only

## Subscriptions and alerts

This setting determines who can create:

- Dashboard subscriptions
- Alerts
