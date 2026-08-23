Appointments

the product's Appointments app is a self-service scheduling app that simplifies the process of booking
meetings, consultations, or services. Integrated with the product's suite of business apps, it allows
companies to automate appointment scheduling, reduce manual coordination, and provide a seamless
experience for clients. Appointments can be linked to calendars, CRM opportunities, employee
schedules, and more, making it an ideal tool for service-based businesses seeking efficiency and
organization.

Configuration

The Appointments app allows for new appointments to be scheduled based on the availability of
users, or the availability of *resources*, such as meeting rooms or seating areas. To create a new
resource, or manage existing resources, navigate to Appointments --> Configuration
--> Resources. This opens a list of the available resources in the database, as well as their
individual capacity.

Resources

Click New to create a new resource. On the blank record, enter a Name for
the new resource. In the Capacity field, enter the maximum number of people the resource
can accommodate. Then, confirm the Timezone for this resource.

If desired, select one or more Linked Resource from the drop-down. This option
designates one or more resources that can be used in combination to handled a bigger demand.

Lastly, add a Description for this resource. The contents of the Description
tab are visible to customers when booking an appointment online.

Resource capacity

When booking an appointment based on resource availability, the website only displays capacity up to
`12`. This occurs even if the resource has a higher capacity. To avoid this, a new *System
Parameter* needs to be added to the database.

First, ensure that developer mode is enabled. Then, navigate to the

In the Key field, enter `appointment.resource_max_capacity_allowed`. In the

Appointment type configuration

Before appointments can be scheduled or booked, an appointment type must be created. Navigate to the

enter an Appointment Title, then set a Duration for this appointment type.

Next, set a Pre-Booking Time. This is the minimum amount of time between when an
appointment can be booked and when the appointment can begin. If the Pre-Booking Time is
`1` hour, appointments must be booked *at least* `1` hour in advance.

Select a Scheduling Window:

- Select Available now to allow customers to book an appointment immediately. Use the

  appointments. For example, if `14` is entered, customers cannot book anything more than 14 days
  from the current date.
- Select Within a date range to limit bookings to a specific range of dates. After
  selecting this option, click the From and to fields, and use the calendar
  pop-up window to customize the date and time range.

Update the Allow Cancelling field to limit the amount of time before an appointment
where a customer can cancel. If this setting is enabled, customers are unable to cancel within the
designated time frame.

Next, designate whether this appointment type is based on Users or

one or more Users in the drop-down. If it is based on resources, select one or more Resources in the drop-down.

Selecting Resources in the Availability on field reveals the

based on the capacity of the resources selected.

Choose an Assignment Method by selecting the appropriate radio button:

 - Pick User/Resource then Time: customers select from a list of available
   users/resources, then select an open time slot.
 - Select Time then User/Resource: customers choose a date and time, then select from
   the list of available users/resources.
 - Select Time then auto-assign: customers select a time slot and are automatically
   assigned a user/resource.

Schedule tab

The Schedule tab is used to outline when this appointment type is to be made available.
The settings define the time slots shown on the booking page.

Click Add a line to create a new time frame. Select a day of the week from the

fields. Click the fa-trash-o (trash) icon to delete an entry. Multiple entries
can be included for a single day.

Options tab

The Options tab is used to customize the display options for this appointment, as well
as notification settings for customers and users.

The Front-End Display field determines how the appointment is presented on the website
to customers. Select the Show Pictures radio button to publish the default pictures of
the user or resources for this appointment on the website.

The Timezone and Location fields automatically populate for resource
appointments, based on where the resource is located. For user-based appointments, the

automatically generated. If this should not be an online meeting, select a different option in the

Tick the Manual Confirmation checkbox to require approval before a meeting is accepted.
If this feature is enabled, the appointment time slot is still considered *reserved* until it is
confirmed or rejected. Leave this checkbox blank to automatically accept meetings created from this
appointment.

The Create Opportunities feature adds an opportunity to the
CRM app for each scheduled appointment, which is assigned to the responsible user. Tick the

The Reminders field is used to set how customers are to be contacted before the
appointment time. Select one or more options from the drop-down, based on the communication method,
and the time frame.

Tick the Allow Guests checkbox to grant customers the ability to add additional guests
when registering for an appointment.

Questions tab

The Questions tab can be used to prompt customers for additional information while they
are booking an appointment. Click Add a line to add a new question.

On the Create Questions pop-up window, enter the Question, then choose an

Tick the Mandatory Answer checkbox to require customers to answer this question before
they are allowed to book an appointment. Click Save & New to add another question, or

Messages tab

The Messages tab is used by the business to provide additional information to customers
regarding this appointment type.

In the Introduction Message field, add a short description of the appointment type. This
can include the topic of the appointment, a meeting agenda, or an introduction to the users
responsible for the meeting.

The Extra Message on Confirmation is displayed to a customer after they have booked a
meeting. Add any additional information here that the customer should be aware of. This can include
parking information, last minute rules, or additional instructions.

Publishing an appointment

When an appointment is ready to publish, click the Go to Website smart button at the top
of the record. Then, slide the fa-toggle-off Unpublished icon to

Create opportunities from appointments

When creating a new appointment type in the Appointments application, users have the option to
create new *opportunities* with information from new bookings. This option captures information from
scheduled appointments and creates opportunities in the CRM app.

Configuration

Navigate to the Appointments app dashboard. Click New to create a new
appointment type. To edit an existing appointment type, click

menu, then click fa-pencil Edit.

On the appointment type record, click the Options tab, and tick the Create
Opportunities checkbox.

Add questions

The Questions tab allows users to add questions to the
appointment booking page. When customers are booking an appointment slot, they are prompted to
answer these questions. The information provided by customers is available in the new
opportunity. Adding questions to the appointment type is optional. However,
the additional information captured by the questions can be useful later in the sales pipeline.

Viewing the new opportunity

To view opportunities created from appointments, navigate to the CRM app dashboard.
If necessary, remove any filters from the search bar. Then, click the Kanban card for the
appropriate opportunity to open it.

The contact information from the appointment is added to the opportunity record. The answers the
customer provided to the optional questions are included in the Internal Notes tab. The
scheduled appointment is listed in the *Chatter* of the record, and can be edited from there.

Google reserve integration

Google Reserve lets customers book appointments directly from Google Search, Google Maps, and the
Google Assistant. By connecting the product Appointments to Google Reserve, bookings are added directly
into the product without customers needing to visit the company website.

Configuration

First, navigate to the Apps application. Then, remove the Apps filter from
the search bar and type in `Google`. Click Install on the Appointment Google
Reserve module.

Next, navigate to the Appointments application. Open an existing appointment type,
or click New to create a new one. Then click the

Click the Google Reserve Merchant field, and select an option from the drop-down, or
click Create to open the Create Google Reserve Merchant form.

On the form, enter all required information. The business address must match exactly what
appears on Google Maps. Click Save & Close.

Once the new merchant has been created, click Synchronize with Google Reserve. The
initial synchronization can take up to 24 hours to propagate to Google's systems.

Calendar

the product Calendar is a scheduling app that allows users to integrate a company's business flow into
a single management platform. By integrating with the other apps in the product's ecosystem, Calendar
allows users to schedule and organize meetings, schedule events, plan employee appraisals,
coordinate projects, and more.

Upon opening the Calendar app, users have an overview of their current meetings.
The selected view option appears as a Day, Week, Month, or

disable Show weekends.

Sync third-party calendars

Users can sync the product with existing Outlook and/or Google calendars, by heading to Calendar app --> Configuration -->
Settings. From here, enter Client ID and Client Secret. There is also an
option to pause synchronization by ticking the checkbox, or automating synchronization by keeping it
blank.

Once the desired configurations are complete, click Save before moving on.

Events created in synced calendars automatically appear across the integrated platforms.

Create activities from chatter

Instantly create new meetings anywhere in the product through an individual record's chatter, like in a
CRM opportunity card or task in the Project app.

From the chatter, click on the Activity button. In the Schedule Activity
pop-up window, select the desired Activity Type, which populates a set of buttons,
depending on the activity.

Activities that involve other schedules, like Meeting or Call for Demo, link
to the Calendar app. Select one of these activities to link to the Calendar app, then hit

Plan an event

To put an event on the calendar, open the Calendar app, and click into the target
date. On the New Event pop-up window that appears, start by adding the event title.

The target date auto-populates in the Start field. This can be changed by clicking into
the date section, and selecting a date from the calendar. For multi-day events, select the end date
in the second field, then click Apply.

Tick the All Day checkbox if there is no specific start or end time.

For events with specific start and stop times, ensure the All Day checkbox is unticked
to enable time selection. With the All Day checkbox unticked, time selections appear in
the Start field.

The signed-in user auto-populates as the first attendee. Additional Attendees can be
added or created from here, as well.

For virtual meetings, copy and paste the URL into the space provided in the Videocall
URL field. Or, click fa-plus Video to create a link.

Next, either create the event by clicking Save & Close, or select More
Options to further configure the event.

The Description field allows users to add additional information and details about the
meeting.

Click More Options to navigate to the meeting form, which provides additional
configurations for the event:

- Duration: Define the length of the meeting in hours, or toggle the

- Organizer: This is defaulted to the current the product user. Select a new one from existing
  users, or create and edit a new user.
- Tags: Add tags to the event, like `Customer Meeting` or `Internal Meeting`. These can
  be searched and filtered in the Calendar app when organizing multiple events.
- Calendar description: Add additional information or details about the meeting.
- Reminders: Select notification options to send to attendees. Choose a default
  notification, or configure new reminders.
- Recurrent: Tick the checkbox to create a recurring meeting. Once selected, this opens
  new fields:

  - Repeat: Select the recurring period of this meeting. Depending on what type of
    recurrence has been selected, a subsequent field appears, in which users can indicate when the
    meeting should recur. For example, if Monthly is selected as the Repeat
    option, a new field appears, in which the user decides on what Day of Month the
    meeting should recur.
  - Until: Select the limited Number of repetitions this meeting should
    recur, the End date of when the recurrences should stop, or if the meetings should
    recur Forever.
  - Timezone: Select the timezone for which this meeting time is specified.

Coordinate with teams' availability

When scheduling an event for multiple users, on the Calendar app dashboard, tick the checkbox
next to Attendees to view team members' availability. Tick (or untick) the checkbox next
to listed users to show (or hide) individual calendars.

Share Availabilities

On the Calendar app main dashboard, click the Share button at the top of the page,
then select Specific Slots from the drop-down. Next, click and drag to select the
available times and dates on the calendar to add them as options in the invitation.

Once availability has been selected, click fa-clipboard Copy Link to copy a
sharable link to the clipboard. Or, click fa-cog Configure icon button to
navigate to the associated appointment.

On the Share Availabilities form, enter an Appointment Title. Confirm the correct
user is selected in the Users field. To add a meeting room to the appointment, click the

In the Video Link field, select the type of video call link that will be used for the
generated appointments. If this field is left blank, no meeting URLs will be created.

To allow attendees to invite others to the event, tick the Allow invitations checkbox.

Add a message in the Introduction Message field. This is used as a description for the
event. Add a message to the Extra Message on Confirmation field to be displayed after
the appointment is booked.

Click fa-clipboard Save & Copy Link. To futher customize the appointment, click
the fa-expand (expand) icon at the top of the pop-up window.

Click the Preview button to see how the appointment link looks for attendees.

Optionally, configure the following tabs:

- calendar/appointment-schedule
- calendar/appointment-questions
- calendar/appointment-messages
- calendar/appointment-options

Once the configurations are finished, click the Share button to generate a link to send
directly, or click Publish to publish the appointment selection on the connected the product
website.

Availabilites tab

In the Availabilites tab of the appointment form, time slots can be managed. The target
date and time populate as the first time slots.

To add a new time slot, click Add a line. Click into the new blank space under the

Repeat under the new blank space under To to select and enter the new target end date
and time.

Questions tab

In the Questions tab, add questions for the attendee to answer when confirming their
meeting. Click Add a line to configure a Question. Then select a

meeting. Click Add a line to configure a Question. Then select an

To learn how to create more comprehensive questionnaires, head to the Survey app documentation
on creating and configuring data-capturing questions.

Communication tab

In the Introduction Page field of the Communication tab, add additional
meeting information to appear on the invitation.

Information added to the Confirmation Page field appears once the meeting is confirmed.

Under the *Emails & SMS* heading, click the Reminders field to add one or more methods
of reminding attendees about the appointment. Under the Booking Email field, and

or cancelling meetings.

Options tab

The Options tab provides additional configurations:

- Allow invitations: Tick the checkbox to allow attendees to invite guests.
- Auto Confirm: Only shown if Resources has been selected in the

  selected resource(s)' total capacity to create a manual confirmation requirement to finalize the
  meeting.
- Display pictures: Tick the checkbox to display user or resource images across the
  entire booking flow.
- Create Opportunity: When this is selected, each scheduled appointment creates a new
  CRM opportunity.
- Up-front Payment: Tick the checkbox to require users to pay before confirming their
  booking. Once this is ticked, a link appears to oi-arrow-right Configure
  Payment Providers, which enables online payments.
- Website: Specify which website this meeting invitation will be published on.
- Schedule: Select Weekly or Flexible scheduling.
- Allow Bookings: set a minimum hour window to ensure appointments are confirmed a
  specified amount of time in advance. For example, set `01:00` to require attendees to confirm at
  least one hour before their appointment time.
- Cancellation: set a maximum hour window before the appointment that attendees are able
  to cancel.
- Timezone: This defaults to the company's timezone selected in the Settings app. To
  change the timezone, select the desired option from the drop-down menu.