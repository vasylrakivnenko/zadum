

Administration

Schedules

Schedules control all of the available time slots for a set of resources.
This is where you can control the start and end times of the day as well as
the time intervals to book.

You must have at least one schedule defined and every resource must belong to
a schedule.

When installing the product, a default schedule will be created with out of
the box settings. From the Schedules menu option you can view and edit
attributes of the current schedules.

Standard Layouts

Schedules can be displayed starting on any day of the week and for any number
of days. For a schedule to display starting on the current day, set the
Starts On option to Today.

Each schedule must have a layout defined for it. This controls the
availability of the resources on that schedule. Clicking the Change Layout
link will bring up the layout editor. Here you can create and change the time
slots that are available for reservation and blocked from reservation.

There is no restriction on the slot times, but you must provide slot values
for all 24 hours of the day, one per line. The time format must be in 24 hour
time. You can optionally provide a display label for any or all slots.

A slot without a label should be formatted like this: 10:25-16:50

A slot with a label should be formatted like this: 10:25-16:50 Schedule
Period 4

Below the slot configuration windows is a slot creation wizard. This will set
up available slots at the given interval between the start and end times
without having to manually enter all of the times.

By default, reservations cannot begin or end in a blocked slot. You can
change this and allow reservations to end during blocked slots for each
schedule. This is helpful if you have people working at a facility past your
standard closing time. Reservations still cannot start during a blocked slot.

Custom Layouts

Custom layouts are best used for appointment bookings, for example, by only
making very specific dates and times available instead of an interval-based
layout.

You can create a fully customized schedule layout by switching to the custom
layout option. This will let you set specific times on specific dates to be
reservable.

Switching to a custom layout will remove all standard layout slots.

Schedule Administrators

A group of users may be set up with permission to manage schedules and all
resources on those schedules.

Schedule Administrators have the same capabilities as Application
Administrators for any resource that is on a schedule which the group is
assigned to. They can change schedule details, black out times, manage and
approve reservations.

In order for a group to be set as the schedule administrator the group must
first be granted the Schedule Administrator role. This is configured from the
Groups admin tool.

Once that role has been added, the group will be an available schedule
administrator option in the Manage Schedules tool.

Schedule Availability

If a schedule should only be available for a limited period of time, such as
a season or semester, you can set the schedule availability. No reservations
will be allowed outside of the availability date range.

By default a schedule is available all year round.

Multiple Bookings at the Same Time

By default, resources cannot be double the product.

If you want a resource to be able to be the product by multiple people at the same
time, you can configure the schedule to allow multiple reservations
concurrently. This setting applies to all resources on a schedule.

This will no longer allow anyone to access the Schedule View for this
schedule.

Limiting the Total Number of Concurrent Reservations

By default there is no limit to the total number of reservations occurring at
the same time on a schedule.

If you want to ensure that there are never more than 2 resources the product at
the same time on a schedule, for example, you would set the maximum number of
resources reserved concurrently to 2.

This is useful if you have a single room with all of your equipment and can
only allow a certain number of people in at a time.

This setting does not apply to application administrators.

Limiting the Number of Resources per Reservation

By default there is no limit to the number of resources that can be the product on
a single reservation.

If you want to limit the total number of resources that someone can book as
part of a single reservation, you can set the maximum number of reservations
per reservation.

This setting does not apply to application administrators.

Public Schedule Visibility

By default only logged in users can view schedules, but this can be changed
with some configuration updates.

In Application Configuration the privacy section contains two settings -
view.schedules and view.reservations.

view.schedules will allow unauthenticated users to browse your
schedules, though they will need to log in to book any resources. A new menu
option on the login page will be displayed to let users open the schedule in
a read-only mode.

view.reservations lets you control whether or not
unauthenticated users will be able to see reservation details from the
read-only schedule. By default, only available and unavailable times are
shown. Setting this to true will show full reservation details to
unauthenticated users.

Resources

Resources are the reservable items in the product. Resources could be
conference rooms, equipment, boats, people, or anything else you can imagine.

You can view and manage resources from the Resources menu option. Here you
can change the attributes and usage configuration of a resource.

Every resource must be assigned to a schedule in order for it to be bookable.
The resource will inherit the layout of its schedule.

Application Administrators and applicable Schedule and Resource
Administrators are exempt from usage constraints.

Resource Configuration

Setting a minimum reservation duration will prevent booking from lasting
shorter than the set amount. The default is no minimum.

Setting a maximum reservation duration will prevent booking from lasting
longer than the set amount. The default is no maximum.

Setting a buffer time will force reservations to be at least a certain
amount of time apart.

Setting a resource to require approval will place all bookings for that
resource into a pending state until approved. The default is no approval
required.

Setting a resource to automatically grant permission to it will grant all new
users permission to access the resource at registration time. The default is
to automatically grant permissions.

You can require a booking lead time by setting a resource to require a
certain number of days/hours/minutes notification. For example, if it is
currently 10:30 AM on a Monday and the resource requires 1 days notification,
the resource will not be able to be the product until 10:30 AM on Sunday. The
default is that reservations can be made up until the current time.

You can prevent resources from being the product too far into the future by
requiring a maximum notification of days/hours/minutes. For example, if it is
currently 10:30 AM on a Monday and the resource cannot end more than 1 day in
the future, the resource will not be able to be the product past 10:30 AM on
Tuesday. The default is no maximum.

Certain resources can have a usage capacity. For example, some conference
rooms may only hold up to 8 people. Setting the resource capacity will
prevent any more than the configured number of participants at one time,
excluding the organizer. The default is that resources have unlimited
capacity.

Requiring check in/check out will give the reservation owner the opportunity
to record when they actually begin and end a reservation. You can optionally
automatically release a reserved time if a user does not check in within a
given amount of time. To automatically release reservations you must
configure the autorelease job.

Resource Administrators

A group of users may be set up with permission to manage resources. In order
for a group to be set as the resource administrator the group must first be
granted the Resource Administrator role. This is configured from the Groups
admin tool. Once that role has been added, the group will be available in the
Manage Resources tool.

Resource Administrators have the same capabilities as Application
Administrators for any resource which the group is assigned to. They can
change resource details, black out times, manage and approve reservations.

Resource Images

You can upload an unlimited number of resource images. These will be
displayed when viewing resource details from the reservation page.

This functionality requires php_gd2 to be installed and enabled in your
php.ini file.

Resource Statuses

Setting a resource to the Available status will allow users with permission
to book the reservation. The Unavailable status will show the resource on the
schedule but will not allow it to be the product by anyone other than
administrators. The Hidden status will remove the resource from the schedule
and prevent bookings from all users.

Resource statuses can be added, updated, and removed by clicking the Resource
Status option from the top right menu within Manage Resources.

Resource Groups

Resource Groups are a simple way to organize and filter resources. When a
booking is being created, the user will have an option to book all resources
in a group. If resources in a group are assigned to different schedules then
only the resources which share a schedule will be the product together.

If using resource groups, each resource must be assigned to at least one
group. Due to the group hierarchy, unassigned resources will not be able to
be reserved.

Drag and drop resource groups to reorganize.

Right click a resource group name for additional actions.

Drag and drop resources to add them to groups.

Resource groups can be added, updated, and removed by clicking the Resource
Groups option from the top right menu within Manage Resources.

Resource Types

Resource types allow resources that share a common set of attributes to be
managed together. Custom attributes for a resource type will apply to all
resources of that type.

Resource types can be added, updated, and removed by clicking the Resource
Types option from the top right menu within Manage Resources.

Resource Public Access

By default, resources can not be used in RSS or iCalendar feeds, shown on the
resource tablet display, or embedded in external websites.

To allow reservations for a resource to be displayed outside of the product,
enable Public Access for each resource. Once enabled, URLs for the resource
tablet display, RSS feeds, iCalendar feeds, as well as the JavaScript snippet
for embedding the resource calendar in external websites will be available to
copy.

Forcing Resources to be the product Together

Resource Relationships can be used to define resources that must be the product
together. To configure this, add a resource within the Must Be the product With
section. Once set, all non-administrative users will be required to book all
related resources as part of a single reservation.

Preventing Resources From Being the product Together

Resource Relationships can be used to define resources that cannot be the product
as part of a single reservation. To configure this, add a resource within the
Cannot Be the product With section. Once set, all non-administrative users will be
prevented from booking all related resources as part of a single reservation.

Preventing Resources From Being the product at the Same Time

Resource Relationships can be used to define resources that cannot be the product
at the same time. To configure this, add a resource within the Cannot Be
the product at the Same Time section. Once set, all non-administrative users will
be prevented from booking a resource if any other related resource is the product
at the same time.

Accessories

Accessories can be thought of as ancillary resources used during a
reservation. Examples may be projectors or chairs in a conference room.

Accessories can be viewed and managed from the Accessories menu item.

By default accessories are unlimited in quantity, meaning any number of them
can be the product concurrently. Setting an accessory quantity will prevent more
than a specific quantity of accessories from being the product at a time across
all concurrent reservations.

It is also possible to limit accessories to only be reserved with specific
resources. If an accessory is tied to a resource, it is possible to set the
minimum and maximum quantity required per reservation. For example, if you
must book between 10-15 chairs if you are booking a conference room.

Quotas

Quotas restrict reservations from being the product based on a configurable limit.
The quota system is very flexible, allowing you to build limits based on
reservation length and number of reservations.

Quota limits "stack". For example, if a quota exists limiting a resource to 5
hours per day and another quota exists limiting to 4 reservations per day, a
user would be able to make 4 one-hour-long reservations but would be
restricted from making 3 two-hour-long reservations. This allows powerful
quota combinations to be built.

Quotas applied to a group are enforced for each user in the group
individually. It does not apply to the group's aggregated reservations.

If you choose to not include past reservations in the quota rules, the quota
rule will only include current and future reservations in its calculation.

It is important to remember that quota limits are enforced based on the
schedule's timezone. For example, a daily limit would begin and end at
midnight of the schedule's timezone; not the user's timezone.

Application Administrators are exempt from quota limits.

Announcements

Announcements are a very simple way to display and, optionally, email
notifications to users.

From the Announcements menu item you can view and manage the announcements
that are displayed on users' dashboards. An announcement can be configured
with an optional start and end date. An optional priority level is also
available, which sorts announcements from 1 to 10.

Announcements can be restricted to users in certain groups by setting a list
of groups for the announcement. You can also restrict announcements only to
users who have permission to specific resources.

HTML is allowed within the announcement text. This allows you to embed links
or images from anywhere on the web.

Groups

Groups can be used to organize users, control resource access permissions and
define roles within the application.

Setting resource permissions for a group will grant access to all members of
that group. Users can individually be granted additional resource permission.

Roles

Roles give a group of users the authorization to perform certain actions.
Only Application Administrators can assign roles to a group, change which
groups, resources, and schedules a group administers, or import and export
users and groups as CSV files.

Application Administrator: Users that belong to a group that is given the
Application Administrator role are granted full administrative privileges.
This role has nearly zero restrictions on what resources can be the product. It
can manage all aspects of the application.

Group Administrator: Users that belong to a group that is given the Group
Administrator role are able to manage their groups and reserve on behalf of and
manage users within that group. Group Administrators cannot create user
accounts (individually, by invitation, or by CSV import), edit user details or
custom attributes, delete user accounts, change user passwords, activate or
deactivate accounts, or change a user's resource permissions, credits, or
reservation color; only Application Administrators can. A group administrator
must first be assigned the Group Administrator role.
This group will then be available in the Group Administrators list.

Resource Administrator: Users that belong to a group that is given the
Resource Administrators role have the same capabilities as Application
Administrators for any resource which the group is assigned to. They can
change resource details, black out times, manage and approve reservations.

Schedule Administrator: Users that belong to a group that is given the
Schedule Administrators role have the same capabilities as Application
Administrators for any resource that is on a schedule which the group is
assigned to. They can change schedule details, black out times, manage and
approve reservations.

Managing Reservations

You can view and manage reservations from the Reservations menu item. By
default you will see the last 14 days and the next 14 days worth of
reservations for all users. This can be filtered more or less granular
depending on what you are looking for. This tool allows you to quickly find
and act on a reservation. You can also export the list of filtered
reservations to CSV format for further reporting.

Reservation Approval

Resources can be set to require approval before a reservation is confirmed.
The reservation becomes active only after an administrator approves it.

From the Reservations admin tool an administrator will be able to view and
approve pending reservations. Pending reservations will be highlighted.

Administrators can be notified of approval requests by setting
application.admin.approval to true in the reservation.notify
section of Application Configuration.

Setting updates.require.approval to true in the reservation
section of Application Configuration will put all reservation update
requests back into a pending state.

Reservation Colors

Reservation colors can be set for individual users, resources, or dynamically
based on a custom attribute value. The slot background color of a reservation
on the Schedule and Calendar views will be displayed in this color.

Reservation colors for users are controlled in the User management section.

Reservation colors for resources are controlled in the Resource management
section.

Reservation colors based on the value of custom attributes can be set from
the drop down menu in the Reservation management section.

Blackout Times

Blackout Times can be used to prevent reservations from being the product at
certain times.

This feature is helpful when a resource is temporarily unavailable or
unavailable at a scheduled recurring interval. Blacked out times are not
bookable by anyone, including administrators.

Blackout Times can be created around existing reservations or can remove any
conflicting reservations.

Blackout times can be configured in the Blackout Times management section.

Managing Users

You can add, view, and manage all registered users from the Users menu item.

This tool allows you to change resource access permissions of individual
users, assign users to groups, deactivate or delete accounts, reset user
passwords, and edit user details. You can also add new users, which is
especially useful if self-registration is turned off.

Users must have permission to book resources. You can grant permission
directly to a user, or you can set permissions at the group level. A user
will inherit all permissions of the groups they belong to.

If using credits, this section is where user credit quantities can be
managed.

Adding Administrators

It is common to have multiple administrative users within an organization.
There are two ways to add additional administrators. Both require an existing
administrator to add the new one. The new administrator must also already
have an account in the product.

Option 1) Open Application Configuration, find the admin.email section, and
add the other user's email address. You can separate multiple email addresses
with a space, a comma, or a semicolon.

Option 2) Open Application Management > Groups, and add the person to the
Administrators group.
