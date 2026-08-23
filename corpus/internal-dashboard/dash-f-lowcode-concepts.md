Components in the product serve as the building blocks for creating applications. They are pre-designed elements that you can drag and drop onto the canvas in the App-Builder. the product comes with 45+ built-in components.

### Customizing Components

Components are highly customizable and interactive. Once you place a component on the canvas, you can easily modify its properties, styles, and behaviors through the properties panel on the right side of the App-Builder. This allows you to make your application dynamic and responsive.

### Using Components With Data

In the product, components can be easily connected to various data sources like databases, APIs, and third-party services through **queries**. Once the data is fetched, you can bind it to components like tables, charts, and more.

## Custom Components

the product allows for the creation of custom components using React. This feature is invaluable for developers who require functionalities beyond the 45+ built-in components that the product offers. To create a custom component, you can drag and drop a **Custom Component** on the canvas and configure its data and code.

By incorporating custom React components, you can significantly extend the capabilities of your the product applications, allowing for a more tailored and unique user experience.

To explore the full list of components in the product, go through the **Component Library**.

Data sources are pivotal as they enable us to fetch and send data to and from different sources including databases, external APIs, or services. Once a data source is configured, it can be shared across all apps within a workspace.

## Types and Management of Data Sources

Apart from its built-in database, the product supports a range of external data sources which can be broadly categorized into databases, external APIs, and services. To manage these data sources, the product provides a data source manager that can be opened by clicking on the **Data Sources** button located on the left-sidebar of the App-Builder.

## Adding a Data Source

Adding a new data source is as easy as filling out a form; users can click on the Data Sources button in the left-sidebar, navigate to the required data source, click on the corresponding **Add** button and enter the credentials.

To see a full list of compatible data sources and their set up details, checkout the **Datasource Catalog**.

**Queries** act as a bridge between the application and data sources. Queries help interact with data sources like databases or APIs. They fetch or update data based on events like button clicks, making apps dynamic.

## Creation and Management

**Query Panel** is the hub for creating and managing queries to interact with connected data sources. Located at the bottom of the app-builder, it allows users to perform API requests, database queries, and data manipulations using JavaScript and Python. The Query Panel is divided into two main sections: on the left, the **Query Manager** allows for the listing and management of queries; on the right, the **Query Editor** provides the functionality to construct queries either through a low-code interface or by manually entering the query text.

## Execution and Interaction

Queries run when triggered by app events, such as clicking a button. They can fetch new data or change existing data, and the results can be displayed in the app using tables or charts. This makes data interaction in your app straightforward and effective.

Learn more about queries in this **detailed guide** for Query Panel.

Events are used to run queries, show alerts and other functionalities based on triggers such as button clicks or query completion. Events can be chained together to run a series of logical operations. For example, the completion of one query could trigger another event that runs a second query, and so on. This way, a single user interaction, like clicking a button, could set off a chain of events.

## Triggering Events
Suppose you have a query that refreshes data when a user clicks on a button, and you also want to display a pop-up alert upon successful data refresh. In the product, you can configure an event to trigger a query upon clicking the button, followed by another event to display a pop-up alert confirming the successful data refresh after the query execution is completed.

## Setting Up Event Handlers

Setting up event handlers to manage such triggers and responses is a straightforward process in the product. For instance, to set up an event that triggers on the click of a button, you simply navigate to the button component's configuration, click on **New Event Handler**, and define the Event and the Action to be taken. The actions could range from running a query, showing an alert, or even switching to a different page.

For detailed information about the events related to components, please refer to their respective documentation.

the product allows you to create multi-page applications. By using the **Pages** panel on the left sidebar of the app-builder, you can create, manage and navigate through different pages of your application. The ability to create multiple pages allows for diverse functionalities within a single app.

## Managing Pages
The Pages panel provides several options for managing your pages. You can add new pages by clicking the `+` button on the Pages header. Each new page can be named and customized. The Settings option lets you hide the page navigation sidebar. Additionally, the Pages panel also offers various page-specific options like renaming, marking a page as the home page, hiding or duplicating pages, and adding event handlers.

## Advanced Page Features
the product's Pages panel also includes advanced features like Page Handle, which is the unique slug at the end of the application URL, and can be customized. Pages can be set as the default landing (home) page, or hidden from the page navigation menu. You can duplicate pages, making exact copies for different uses or even add event handlers. Furthermore, pages can be disabled or deleted, with certain restrictions like the inability to delete a home page.

To understand each functionality associated with Pages, read this **document**.

the product employs a Role-Based Access Control (RBAC) system to manage security and access to its resources, which include apps, folders, and workspace variables. In this system, Admins have the authority to invite Users to their workspaces and assign them to specific Groups. Each Group is associated with a set of Permissions that dictate what level of access its members have to various resources.

## Groups and User Roles

the product provides a set of default user roles (e.g., Admin, Builder, End-user) and the ability to create custom groups (e.g., Support, Engineering, Finance) for more granular access control. These groups and roles determine the level of access a user has to resources within the workspace.

## Setting Permissions Based on Groups and Permissions
To secure your applications in the product, you can leverage Groups and Permissions. For instance, you could create a custom group named Finance Team and assign it permissions to only access financial apps and constants within the workspace. When you invite new users, you can directly assign them to this group, ensuring they only have access to the resources they need to perform their tasks. You can also make the app public and make it accessible to users without the need to log in.

Read more about managing users and groups **here**.

The Super Admin in the product plays a critical role in managing the instance by having full access to all workspaces, users, and groups. Super Admins differ significantly from standard Admins, possessing a broader range of privileges. They can manage users in any workspace, including archiving or unarchiving them, and have unrestricted access to all workspaces. This allows Super Admins to create, edit, or delete apps in any user's personal workspace. They also have the authority to access and modify the product database across all workspaces, an ability not granted to regular Admins.

## Advanced Control and Customization
Beyond regular management tasks, Super Admins can implement more intricate settings like white labeling, enabling multiplayer editing, and managing instance licenses. They also have the power to restrict personal workspace creation for users, ensuring tighter control over the workspace environment. These advanced capabilities underscore the Super Admin's pivotal role in overseeing the comprehensive management and customization of the product instance.

Read more about super admins **here**.

the product provides comprehensive User Management and Access Control capabilities, allowing you to onboard and offboard users efficiently, configure diverse authentication methods, manage role-based permissions, and integrate with SSO providers. With features like group sync and user profile management, the product ensures secure and flexible access control for your organization.

- **Onboarding and Offboarding Users**: the product provides flexible options to onboard and offboard users.
- **Authentication**: the product ensures secure access with multiple login methods, SSO, and Two-Factor Authentication (2FA).
- **Role Based Access Control**: the product enables granular access permissions by different roles and custom groups.
- **Single Sign-On (SSO)**: the product streamlines authentication by allowing integrations with various identity providers.
- **Group Sync**: the product supports group sync which helps keep group memberships updated automatically based on your organization's identity system.
- **User Management**: In the product you can easily manage user profiles, including editing details and resetting passwords.

# App-Builder: Overview

the product's App-Builder is a visual development platform that lets you create business applications in minutes. Transform your ideas into working solutions using an intuitive drag-and-drop interface that helps you design everything from simple forms to complex dashboards.

Getting started is straightforward – design your interface, connect your data sources, and add business logic through the visual builder. As your needs grow, extend your applications with custom code and use GitSync to streamline application management.

Explore these hands-on guides to start building your first app. The step-by-step guides will walk you through the App-Builder's essential features:

- **Create UIs Using Pre-Built Components**
- **Create Queries to Interact With Data Sources**
- **Use Custom Code**
- **Access and Referring Values Within The App-Builder**
- **Create and Managing Variables**
- **Use Gitsync to Sync your Application with a Git Repository**
- **Versioning and Release**
- **Import and Export Apps**

the product apps offer two sharing options: private sharing with workspace users or public sharing via a generated link. To obtain the shareable URL, click the **Share** icon on the top bar of the App Builder.

### Making the app public

To share the app publicly and make it accessible to anyone on the internet without requiring the product login, toggle the **Make application public** switch in the Share modal.

Only released apps can be accessed using the Shareable app link.

### Customizing the app URL

By default, the product will generate a unique URL for your application. However, you also have the option to edit the slug of the URL to make it more customized and user-friendly.

### Embedding the product Apps

the product apps can be directly shared with end users and embedded into web apps using `iframes`. If you want to make your application public, you can use the Share modal to obtain the embeddable link.

For embedding private the product apps, you'll need to set an environment variable in the `.env` file.

  Variable          Description

  ENABLE_PRIVATE_APP_EMBED   `true` or `false`

You can learn more here.