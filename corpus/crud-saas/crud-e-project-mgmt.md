# Work packages

**Work packages** are items in a project (such as tasks, features, risks, user stories, bugs, change requests). A work package captures important information and can be assigned to project members for execution.

Work packages have a **type**, an **ID**, a **subject** and may have various additional attributes, such as **status**, **assignee**, **priority**, **due date**.

**Work package ID** is a unique identifier assigned to a newly created work package. By default, the product uses an instance-wide numerical sequence (for example, `#12345`). Administrators can alternatively enable project-based identifiers, which combine a project identifier with a sequential number (for example, `PROJ-123`).

Work package identifiers cannot be edited manually and remain associated with the work package throughout its lifecycle.

**Types** are the different items a work package can represent, such as task, feature, bug, phase, milestone. The work package types can be configured in the system administration.

Work packages can be displayed in a projects timeline, e.g. as a milestone or a phase. In order to use the work packages, the work package module has to be activated in the project settings.

## Overview

  Topic                                                          Content

  Work packages views                      What is the difference between the work packages views: table view, split screen view, details view?
  Create a work package                   How to create a new work package in the product.
  Set and change dates and duration          How to set and change the start date, finish date and duration of a work package.
  Baseline comparison                     How to track work package changes over time.
  Share work packages with external users (Enterprise add-on)   How to share work package with users or group outside of your project.
  Edit work package                         How to edit a work package in the product.
  Automatic subjects for work package (Enterprise add-on)   How to use automatically generated work package subjects in the product.
  Duplicate, move, delete               How to copy, move, delete a work package.
  Work package table configuration   How to configure the work package table (columns, filters, group by, etc.).
  Export work packages                              How to export work packages for other tools such as Microsoft Excel.
  Work package relations and hierarchies   How to create work package relations and hierarchies.

# Manage projects

In the product you can create projects to collaborate with your team members, track issues, document and share information with stakeholders, organize things. A project is a way to structure and organize your work in the product.

Your projects can be available publicly or internally. the product does not limit the number of projects, neither in the Community edition nor in the Enterprise cloud or in Enterprise on-premises edition.

  Topic                                                          Content

  Select a project   Open a project which you want to work on.
  Create a new project   Find out how to create a new project in the product.
  Create a subproject   Create a subproject of an existing project.
  Project structure                        Find out how to set up a project structure.
  Project settings                        Configure further settings for your projects, such as description, project hierarchy structure, or setting it to public.
  Project lists                              Get an overview of all your projects and configure project views.
  Change the project hierarchy   You can change the hierarchy by selecting the parent project ("subproject of").
  Set a project to public   Make a project accessible to (at least) all users within your instance.
  Create a project template   Configure a project and set it as a template to copy it for future projects.
  Use a project template   Create a new project based on an existing template project.
  Copy a project   Copy an existing project.
  Archive a project   Find out how to archive completed projects.
  Delete a project   How to delete a project.

## Project structure

Projects form a structure in the product. You can have parent projects and sub-projects. A project can represent an organizational unit of a company, e.g. to have issues separated:

- Company (Parent project)
  - Marketing (Sub-project)
  - Sales
  - HR
  - IT
  - ...

Projects can also be for overarching teams working on one topic:

- Launch a new product
  - Design
  - Development
  - ...

Or, a project can be used to separate products or customers.

- Product A
  - Customer A
  - Customer B
  - Customer C

> [!NOTE]
> You must be a member of a project  to view and work in it.

## Select a project

Find out  how to open an existing project in the product in our _Getting started_ guide.

## Create a new project

Find out how to create a new project in the product in our _Getting started_ guide.

## Create a subproject

Find out how to create a subproject in the product in our _Project settings_ guide.

## Project Settings

You can specify further advanced settings for your project. Navigate to your project settings by selecting a project, and click -> _Project settings_ -> _Information_. Here you can:

- Define whether the project should have a parent by selecting **Subproject of**. This way, you can change the project hierarchy.

- Enter a detailed description for your project.

- Set the default project **Identifier**.

- Set a project to **Public**. This means it can be accessed without signing in to the product.

Read the full guide on project settings in the product.

# Manage members

  Topic                                                   Content

  Project members overview   How to get an overview of all project members.
  Add members                             How to add existing members or invite new members to a project.
  Edit members                           How to change the role of a member in a project.
  Remove members                       How to remove members from a project.
  Roles and permissions         How to manage roles and permissions for members.
  Groups                                       How to add members to a group and add groups to a project.
  Visibility of users             Which users and groups you are able to see.

## Project members overview

On the left side menu you will see **Members**. When selected, it will show a list of project members, project groups, as well as the users with whom work packages from this project have been shared. You can **edit** or **delete** a user or a group by clicking the respective icon at the end of the line listing the user or group.

> [!IMPORTANT]
> If you do not have a global permission to **View all users and groups**, you may not see all project members.  The selection is limited to users who you share a project with or are in the same group with.

Standard filters on the left-side menu include the following:

- **All** - returns all members and groups of the project, as well as non-members, with whom one or more work packages from this project have been shared

- **Locked** - returns all locked users that are members of this project, as well as locked non-members, with whom one or more work packages from this project have been shared

- **Invited** - returns all users that have been invited, but have not yet registered

- **Project roles** provides filters based on all the member roles that have been assigned to users in that specific project.

- **Work package shares** provides filters based on all the roles available for sharing work packages. They include:
  - **All shares** - returns all users that a work package in this project has been shared with
  - **View** - returns all users that can view, but not edit or comment on a work package that has been shared with them

  - **Comment** - returns all users that are allowed to add comments to a work package that has been shared with them

  - **Edit** - returns all users that are permitted to edit a work package that has been shared with them

> [!NOTE]
> Users, with whom work packages from a given project have been shared,  be edited or deleted under **Members**. To edit or revoke their viewing rights you can click on the "Number of work package(s) in the column "Shared" (3 work packages in the example above). This will open an already filtered work package list of all  work packages shared with that user.
>
> Another way is to navigate to **Work packages**, select the **Shared with users** filter and adjust the privileges accordingly. Read more here.

- **Groups** lists all groups that have been added to this project (this filter will only be visible if a group has been added to the project).

> [!NOTE]
> Members that are part of a group will also be displayed as members individually. In that case you can only edit the roles assigned to the users, but not delete them. If you want to delete a user that is a member of a group (also added to this project) you will have to delete the entire group and add group members individually if needed.

You can adjust the displayed members by clicking on the **Filter**  button in the left corner under the module name. Once you are done adjusting your preferences, click the green **Apply** button.

You can adjust the project member overview based on the following filters:

- **Status** - allows filtering based on the user status, such as active, invited, locked or registered.
- **Group** - allows filtering for project members that are part of an existing group (all groups available in your instance will be listed as options), even if the group itself has not been added to the project.
- **Role** - allows filtering based on all the user roles that have been assigned to users in that specific project. The options of these filters are the same as in the left side menu.
- **Work package shares** - provides the same filters as listed in the left side menu, based on all the roles available for sharing work packages. They include all shares, view, comment, edit.
- **Name** - allows searching for a specific user or group by typing in a user or group name.

## Visibility of users

Not every user can see every other user or group in the product. When you pick members, use filters, or search for people, the list is limited to the users and groups that are visible to you.

You can see another user or group if **any** of the following applies:

- **You are an administrator.** Administrators can see all users and groups.
- **You have the global permission "View all users and groups".** This grants the same full visibility without being an administrator.
- **You are in the same group.** If you and another user belong to a common group, you can see each other regardless of any shared projects.
- **You share a project.** If you are both members of the same project, you can see each other. This also covers users who are not project members but have a work package in that project shared with them.
- **You have access to a project the other user belongs to.** A project is accessible to you when it is a **public** project, when you are a member of it, or when a work package in it has been shared with you. In each of these cases you can see all members of that project, as well as everyone who has a work package shared with them there.

It is important to keep in mind that:

- Members of a **public** project are visible to everyone, since public projects are accessible to all users.
- Visibility is evaluated **per project**, not per work package. Once you can see a project, you can see all of its members, not only the people involved in the specific work package that was shared with you.
- Being able to see a user does not grant any additional permissions on their data. It only determines whether they appear in member lists, filters, and user search.

> [!NOTE]
> If you do not have the global permission **View all users and groups**, some project members added through other means (for example via a group you are not part of) may not appear to you, even though they participate in the project.

## Add members

Find out here how to add existing users to a project and here how to invite new users to join a project.

## Edit members

To change the role of a member within a project, select the corresponding project and open the Members module.

To edit an existing member of a project, click the **More** icon in the list next to the member on the right and select **Manage roles**. Add and remove roles, then press the green **Change** button to save your changes.

## Remove members

To remove members from a project, select the project for which you want to remove the members. In the project menu on the left, select the **Members** module. In the members list, click the **More** icon at the right end of the row with the corresponding member name and select **Remove member**.

You will be asked to confirm your decision.

> [!NOTE]
>
> A project member can be a part of the project either individually, as a member of a group, or both. The role removal will only affect the member's individual roles. All those roles obtained via a group will not be removed. To remove those group roles you can either remove the member from the group or remove the entire group from the project.

If the project member you are removing is also part of a group that is also a member of the project, you will be notified that they will keep the access to the project as a member of the group.

If the project member you are removing has shared work packages, you will also be asked whether these sharing rights also need to be removed.

> [!IMPORTANT]
> Please keep in mind that removing project members can only be done if you have the correct permissions.

## Revoke sharing privileges

If a work package has been shared, you may need to revoke sharing privileges at a later stage in the project. To do that select the **More** icon at the right end of the row with the corresponding member name and select **Revoke work package shares**. You can also choose the **View shared work packages** option to see the list of all work packages shared with the user.

> [!NOTE]
> A project member can be a part of the project either individually, as a member of a group, or both. The revoking action will only affect the individual work package shares. All work package shares with the user as part of a group will not be revoked. To revoke those group shares you can either remove the member from the group or revoke the privileges from the entire group.

## Roles and permissions

Members will have different roles with different permissions in a project. To find out how to configure roles and permissions click here.

A **role** is defined as a set of permissions defined by a unique name. Project members are assigned to a project by specifying a user's, group's or placeholder user's name and the role(s) they should assume in the project.

To assign work packages to a project member, the respective user's or placeholder user's role needs to be able to be assigned work packages. This is the default setting for default roles. You can check this setting in the Roles and Permissions section of the system administration.

## Groups

Users can be added to groups. A group can be added to a project. With this, all users within a group will have the corresponding role in this project.
Find out how to create and manage groups in the product here.

# Time tracking and cost reporting

Time and costs functionality in the product allows keeping track of the resources,  both in terms of labor and budgets. With the product you can always keep control of the time and costs planned for and spent on the projects.

Create budgets, log time and costs on specific work packages and create time and cost reports based on your needs.

  Topic                                  Content

  Progress tracking  How to track progress for work packages
  Time tracking         How to log time to work packages.
  My time tracking module   How to log time in my tracking module
  Cost tracking         How to track unit costs spent in a project.
  Time and cost reporting   How to create time and cost reports.

## Time tracking, cost tracking and reporting video tutorial

Watch this short video to get a first overview about time and cost reporting in the product.

## Frequently asked questions (FAQ)

### Does the product provide resource management?

Yes. The Resource management module enables project managers to plan capacity, allocate work and staff projects based on team members' availability and skills. For details, see the Resource management user guide.

# Notifications

This page will explain how in-app notifications work and how to use them.

  Topic                                                          Description

  An overview of in-app notifications   What notifications are and how they work in the product
  Access in-app notifications    How to view your notifications and find the relevant update
  Manage notifications                  How to filter notifications and set your notification preferences
  Mark notifications as read      How to mark notifications as read
  Notifications outside of Notification Center   How to tell when there are unread notifications for a work package you are viewing

## An overview of in-app notifications

With in-app notifications, you will be notified about important changes that are relevant to you, whether they are new comments that mention you, updates to status, type or dates or new assignments. The in-app notifications can work as an alternative to email notifications or be used in parallel. This feature is enabled by default.

## Access in-app notifications

When there are notifications that require your attention, you will see a red badge on the notification bell icon on the right edge of the top header. The number on the badge indicates the number of total unread notifications (up to 99, after which the badge will simply indicate "99+").

To view the notifications, click the bell icon at the top right of the header.  This will take you to **Notification center**.

Each row in Notification center is a work package that has generated a notification. It is possible that you have received multiple notifications for the same work package (if, for example, the date of a work package you are watching was changed by one person and then the status later change by another, that would generate two notifications). A blue badge on the right edge of each row displays the number of unread notifications concerning that particular work package.

The work packages are listed in order of freshness. The work packages on top of the list have the "newest" notifications. This means if there is a new update to a work package that was further down in your notification list, it will be moved to the top since that is now the newest notification.

> [!NOTE]
>
> If multiple notifications exist for a single work package, the work package reminder will take precedence, showing the reminder note at the bottom of the page if one exists.
>
> In case a work package has both a reminder and a date alert notification set up, then the date alert is combined with the reminder note such that that both are visible in the last line. If there are additional reasons for the notification (watcher, mentioned, assignee), those will continue to be displayed in first line of the notification.

## Manage notifications

Click on a notification to open the Activity tab of this work package in split screen. If you double click on a notification, it will open the full view of a work package.

> [!TIP]
> You can adjust the split screen by moving the resizer on the left side of the split screen, it will be stored locally and used for other split screen layouts.
