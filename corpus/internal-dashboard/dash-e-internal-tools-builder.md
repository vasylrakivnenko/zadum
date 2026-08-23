# Building UI

the product has a grid-style canvas where you can drag and drop customizable widgets to build an app UI quickly.

Refer to the sections below to build dynamic UI and design beautifully themed applications.

# Bind Data to Widgets

This page shows how you can dynamically update widget properties using queries, JavaScript functions, and setter methods. There are several ways to bind data to widgets:

* Using query
* Using JS Objects
* Using widgets
* Using storeValue
* Using setters methods

## Using query

This method allows you to update widget data based on the query response.

*Example:* suppose you have data that you want to display in a Table widget; you can do so by binding the response to the widget's properties using mustache syntax ``.
* For instance, you have a query called `fetchData` that retrieves data from a datasource, like:

* To display the data, bind the query response. For the Table widget, add the following code to the **Table data** property:

## Using JS Objects

This method allows you to dynamically connect your data using JavaScript Objects. You can achieve this by binding the results returned in variables or functions to different widget properties.

* For synchronous functions, use ``.
* For asynchronous ones, access the data using ``.
* For variables, access their values using ``.

*Example:* suppose you want to display data using a JavaScript object, such as the current date and time, within a Text widget.

* To display the current date and time, add the following code in the JS object:

Additionally, you can also bind data from queries directly into JavaScript objects for dynamic data integration.

* Add the following code to the **Text** property of the Text widget to bind the properties of the JS objects:

By following similar steps, you can create a JavaScript object, define variables and functions within it, and bind their values to widgets.

See How to display data from functions.

## Using widgets

When working with widgets in the product, you may need to update values in the widget properties dynamically. the product follows the reactive programming paradigm. Instead of updating widget properties and states through direct variable assignment (x = 5), widgets are connected and share data. When a value is updated, any widgets that depend on that changed value also update automatically.

*Example:* suppose you have a Table widget connected to a query. Whenever a user selects a row in the Table, you want to display specific data in a Text widget based on user selections.

Add the following code to the Text widget's **Text** property:

Similarly, you can connect values from other widgets using the mustache syntax `` and reference properties.

## Using storeValue()

This method uses the product framework function storeValue() to bind data to widgets. `storeValue()` stores data as key-value pairs in the browser's local storage for universal accessibility within the application.

*Example:* suppose you want to save the text of an Input widget, you can do so by using `storeValue()`.

1. In the **onTextChanged** event of the Input widget, enable JS and add the following code:

2. Drag the Text widget and add the following code to the **Text** property to display the saved text:

Similarly, you can use different functions to perform actions like page navigation, displaying alerts, managing modals, and storing data in local storage.

You can also use `` to display the email address of the current user.

## Using setters methods

Widget property setters enable you to modify the values of widget properties at runtime, eliminating the need to manually update properties in the editor.

These methods are asynchronous and return a Promise. You can use the `.then()` block to ensure the execution and sequencing of subsequent lines of code in the product.

*Example:* suppose you want to display a Form widget only when a user selects a specific option from a Select widget, such as `Yes` and `No`.

* Write a function in the JS object that sets the values for the widgets. For instance, use the `setVisibility` method to change the visibility of a Form widget to `true`:

* Set the Select widget's **onOptionChange** event to execute the JS function.

Similarly, you can use setter methods to programmatically update data, color, visibility, and other properties.

## Accessing object attributes

When dealing with object attributes that contain spaces in their names, you need to use a specific syntax to access their values. Instead of the conventional dot notation (`obj.attributeName`), you should use square brackets and quotes (`obj["attribute Name"]`).

*Example:* Suppose you have an object with an attribute named `income tax`, and you want to access its value. To achieve this, use the following syntax:

# Controlling Widget Visibility

The visibility property is usually a switch in the property pane of every widget. This property can be made dynamic by clicking the JS button next to the property which converts it to a text field. Inside the text, the value of the visibility can be conditionally set using JavaScript.

## Control visibility with other widgets

In the example below the visibility of the table is a conditional value based on the selected value of the `RadioGroup1`

The Visible property expects the expression to evaluate to a boolean value

## Control visibility with query responses

Similar to the above example, you can bind the visibility of a widget to the response of a Query.

# Write Code in the product

the product enables writing JavaScript code almost everywhere on the GUI inside widget properties, events listeners, queries, and other settings. With the help of the JavaScript editor and the debugging tools, you can write complex reusable code and build scalable applications.

the product also provides the ability to import external libraries, helping you expand the capabilities of your applications.

## Code in JavaScript
You can write JS code inside the **mustache syntax ``**. You can reference entities (widgets, queries, JS objects) and their associated data and properties as JavaScript variables and perform operations on them using built-in functions.

the product currently supports two forms of JavaScript code for dynamically evaluated properties:

#### Single-line code
the product supports writing single-line code within `` and interprets anything written between the brackets as a JavaScript expression. The output of the JS expression is bound to the corresponding property. You can write single-line code for cases such as performing transformations on arrays or using ternary operators for conditional expressions.

**Example**

Sometimes, you may have to chain multiple operations, such as running queries, calling functions/methods, using conditional expressions, etc., in a single line to achieve a desired outcome.

**Example**:This example shows how to run multiple actions on the successful execution of the `updateData` query.

If your expression becomes too complex or challenging to fit in a single line, use multi-line code explained in the following section. To keep the code readable, you can also write a helper function in a JS Object.

#### Multi-line code

As the name suggests, you can break code into multiple lines to make it readable and also use **Immediately Invoked Function Expression (IIFE)** to write functions or code blocks with return statements.

**Example**:This example shows how to code the button's `onClick` event listener to execute a set of actions.

The example below shows how to restructure an invalid code block using **IIFE**.

**Invalid code**

 **Valid code**

#### JS Objects
JS Objects stores a collection of variables and functions, and you can use it to write reusable code in the product. With it, you can manipulate data, handle events, perform advanced operations, write complex logic and invoke them anywhere within the application where it's defined. You can create JS Objects in the JavaScript Editor. For more information, see JS Objects.

## See also

* Using JavaScript Promises
* Importing External Libraries
* Working with the product Framework Functions

# Trigger UI Actions

This guide shows you how to initiate and manage UI actions, which allows you to trigger multiple queries or JavaScript functions in response to user actions. They can be executed serially, in parallel, or conditionally to create complex, dynamic behaviors.

## Execute actions in a specific order

There is an event listener associated with every widget that can be configured to perform various actions. To execute actions in a specific order, you can chain them using the action selector. You can create multiple **Events** and **OnSuccess** callbacks to trigger different actions in a series.

1. In the event property, click the **+** icon and select the action you want to execute. For instance, set the Submit Button's **onClick** event to execute a update query.

2. Set the **onSuccess** callback to perform additional actions upon successful completion of the specified action. For instance, you can use the **onSuccess** callback to execute a fetch query or to close the Modal.

3. To set up multiple **onSuccess** callbacks, click the **+** icon within the callback configuration, and select the desired actions.

You can only execute two levels of **onSuccess** callbacks from the UI. To add additional callbacks, enable JS and and add your code, like:

*Example:*

Learn more about Global Functions.

## Execute actions in parallel

To execute actions in parallel, you can add multiple action selectors for a specific event.

1. In the event property, click the **+** icon and select the action you want to execute. For instance, set the Submit Button's **onClick** event to execute a status change query.

2. Create a new **onClick** event by clicking the **+** icon and set it to execute another action. For instance, set it to run a query that logs the status change.

Additionally, you can enable *JS* next to events and add your code, like:

*Example:*

You can create multiple **Events** and **OnSuccess** callbacks to trigger different actions in parallel.

## Execute actions conditionally

This section covers conditional query execution, allowing queries to be executed based on user input or based on the results of previous queries. You can enable *JS* next to the event and add your code.

#### Based on user input

*Example:* If you want to conditionally queries execute based on the option selected in the Select widget.

In the above code, if the selected option is Categories, it triggers the `fetchCategories` query; otherwise, it runs the `fetchProducts` query.

#### Based on query response

If you want to execute a action based on the response from another query, you can enable *JS* and add your JS Code.  Alternatively, you can create a JSObject and define a JavaScript function for the desired logic.

1. Create a JSObject and define a function to execute custom JavaScript logic.

 *Example:* When the user selects Pending from the status dropdown, the system triggers a `fetchPendingUsers`'query. Subsequently, it displays a relevant alert based on whether there are pending users or not.

2. In the event property, enable JS and call the JS function, like:

#### Disable action

To disable an action based on specific criteria, you can use *JS* in the **Disabled** property of the widget.

*Example*: If specific criteria are not met, you want to disable the Refund button on the customer dashboard. Enable *JS* for **Disabled** property, and add:

This code determines whether to disable the Refund button on the customer dashboard based on conditions related to payment method, delivery status, and refund amount.

See how to pass parameters at runtime.

Granular Access Control

Granular Access Control (GAC) in the product allows you to specify precise access permissions for every resource within your the product instance. This includes applications, users, workspaces, queries, and more. Here’s a quick overview of how GAC works:

## Core components

* **Permissions** - define the actions users can perform on specific resources. In the product, each resource, whether an app, page, workflow, datasource, environment, or query, can have detailed permissions for actions such as create, read, update, and delete.
* **Roles** - are sets of permissions bundled together that can be assigned to users or user groups. They provide varying levels of access to the product resources. On the Roles screen, you can review who has each role from the Assignees view.
* **Users** - Individual users who need access to the product instance.
* **User Groups** - Collections of users that allow you to assign roles to multiple users simultaneously. Users in a group inherit the roles assigned to that group.

## Get started

Below are key areas you can explore to get started with Granular Access Control in the product. Click on the cards to learn more about each aspect.

---

            Permissions

         Understand the permissions available as part of Granular Access Control and how to apply them to users and user roles.

            Custom Role

         Learn how to create custom roles to manage users and user groups within your the product instance.

Roles

To configure Granular Access Control (GAC), the product provides pre-defined roles along with the flexibility to create your own roles. This page provides information on default and custom roles in the product.

## Default roles

Default roles provide standardized permission sets designed to match different user responsibilities in the product. They include pre-defined permissions tailored for roles such as administrators, developers, and app viewers, and cannot be altered or deleted. You can assign these roles to your users if the permissions align with your desired permission model. To view the default roles available for your the product instance, toggle the **Default Roles**  option on the Roles screen.

### Instance level

Instance-level default roles have permissions that govern access to the product instance, affecting all workspaces and users within the instance. Some instance-level roles can be tailored to provide specific access to all users. The instance-level roles include:

* Organization Administrator Role - to configure instances, manage user groups and roles, create workspaces, and monitor audit logs.

* Default Roles for All Users - helps you define some default permissions that will be applicable to all users across your the product instance.

### Workspace level

Workspace-level default roles control access within a specific workspace. These roles are pre-defined, offering standard access controls tailored to each workspace. The workspace level roles are not available for customization. They include:

* Administrator - Workspace Role - to create, edit, view and delete apps, queries, datasources, environments, export apps and make apps public within a workpsace.

* Developer - Workspace Role - to create, edit, and delete apps, pages, queries, datasources, and environments within a workspace.

* App Viewer - Workspace Role - to provide read-only access to apps within a workspace.

### Application level

Application level default roles control access within a specific application. These roles are pre-defined with standard access controls for each application. The application level roles are not available for customization, and are on-the-fly created when you share an application by providing Developer or App viewer access to the user. They include:

* Developer - Application Role - to create pages, queries, datasources, and environments within the product app, but cannot create workspaces, and apps.

* App Viewer - Application Role - to provide read-only access to the shared app.

## Custom roles

Custom roles in the product allow users to define specific permission sets tailored to their business needs. With custom roles, instance administrators can fine-tune access levels by assigning granular permissions to different users or user groups. To create a custom role, click the **Add role** button on the Roles screen. For more information about setting up a custom role, see Custom Roles.

## View role assignees

The Roles screen shows how each role is assigned. The **Assignees** column lists direct assignment counts as `N users · M groups`. For the Default Role for All Users, the column shows **All users** instead of numeric counts, because every user in the instance inherits that role.

To review who has a role:

1. Go to **Admin Settings** > **Roles**.
2. Open the role.
3. Select the **Assignees** tab. Use the **Permissions** tab to configure the role's permission tree.

The **Assignees** tab is view-only. It lists users who have the role either directly or through a group. To assign or unassign a role, use the Users or Groups pages.

### Assignee sources

Each user row shows the assignment source:

* **Direct**: You assigned the role to the user.
* **via group name**: You assigned the role to a group that includes the user. The group name links to that group's settings page.

A user can show both sources when you assign the role directly and through one or more groups. Users provisioned through System for Cross-domain Identity Management (SCIM) show a provisioned indicator next to their username. For more information, see User Provisioning & Group Sync.

### Filter and search assignees

Use the filter control on the **Assignees** tab to narrow the list:

  Filter   Shows

  **All**   Users with the role from any source
  **Direct**   Users assigned the role directly
  **Via group**   Users who inherit the role through a group

Use the search field on the role page to find assignees by username. Scroll the list to load more results when a role has many assignees.

### Default Role for All Users

For the **Default Role for All Users**, the **Assignees** tab shows **Assigned to all users** instead of an enumerated list. Membership is implicit for every user in the instance. Configure the permissions for this role on the **Permissions** tab. For more information, see Configure Default Access to Apps.

## See also

* Custom Roles
* Default Roles
* Permissions
* User Management

Default Roles

This page provides detailed insights into the individual permissions associated with the default roles available in the product.

## Organization Administrator Role

The Organization Administrator Role (previously Instance Administrator role) operates at the highest level within the platform, managing organization-wide settings such as branding, GAC, licenses, provisioning, and audit logs.

### Permissions

To perform different tasks, the Organization Administrator role in the product has the following permissions:

        (✓) Permission Assigned

                    Create
                    Edit
                    Delete
                    View
                    Invite User
                    Remove User
                    Associate Role

                    **Groups**
                    (✓)
                    (✓)
                    (✓)
                    (✓)
                    (✓)
                    (✓)

                    **Roles**
                    (✓)
                    (✓)
                    (✓)
                    (✓)

                    (✓)

                          Default Roles

                    (✓)

                    (✓)

                          Custom Roles

                    (✓)
                    (✓)
                    (✓)

                    (✓)

                    **Workspace**
                    (✓)

                    **Audit Logs**

                    (✓)

For more information about each permission, see Permissions.

### Limitations

Despite having extensive permissions, the Organization Administrator role in the product cannot perform the following tasks:
