Macros

If you find yourself repeating the same steps frequently, you should use a macro.
In such a macro, your admin can pre-define different ticket actions you
can apply with just a click. As an example, the product ships a
Close & Tag as Spam macro by default. If applied, the user who executes the
macro is assigned as owner, a tag spam is added and the ticket is closed.
It is even possible to run an AI agent within a macro on
demand. Read on to learn how to run macros in two different ways.

On a Single Ticket

The simplest way to apply a macro is to select it from the Update submenu
in the ticket detail view:

In Bulk

To apply a macro to many tickets at the same time:

1. Open a ticket overview or the detailed search
2. Select your desired tickets
3. Drag the tickets to the top and hover over the Run Macro action
4. Drop the tickets on your target macro.

Initial overlay when you start dragging:

Move the mouse to the Run Macro action at the top and you will see the
available macros:

Advanced Search

With the product, you can limit your search to specific attributes.
This allows you to find e.g. tickets with specific key words and states.
Below information will help you to improve your search results.

For instance, you can search for a ticket of a specific customer::

   customer.firstname: John

or::

   customer.lastname: Doe

If you want to run a more complex search, you can use conditions
with () and AND/OR options::

   state.name: open AND (article.from:me OR article.from:somebody)

Available Attributes

   For a more detailed list of available attributes please take a look into our

   <br />

   "number", "1118566", "number:1118566 |br|\ number:11185*", "Search for a ticket number."
   "title", "some title", "title:""some title"" |br|\ title:Printer |br|\ title: ""some ti*""", "If you need to use spaces in the search phrase, use quotes. the product will do an AND-search over the given words. You can also use a single keyword without quotation."
   "created_at", "2018-11-18", "created_at:2018-11-18 |br|\ created_at:[2018-11-15 TO 2018-11-18] |br|\ created_at:>now-1h", "You can either use a simple date, a date-range or >now-xh. Please note that the date format needs to be YYYY-MM-DD"
   "state.name", "new |br|\ open |br|\ closed", "state.name: new |br|\ state.name:new OR open", "You can filter for specific ticket states (and even combine them with an OR). Please note that you need to use the English naming for states, unless you have custom ticket states defined in your instance."
   "article_count", "5 |br|\ [5 TO 10] |br|\ [5 TO \*] |br|\ [\* TO 5]", "article_count:5 |br|\ article_count: [5 TO 10] |br|\ article_count:[5 TO \*] |br|\ article_count:[\* TO 5]", "You can search for tickets with a specific number of articles (you can even search for everything with 5 or more articles or even up to 5 articles, if needed)."
   "article.from", "\*bob\*", "article.from:\*bob\*", "Show all tickets that contain articles from ""Bob""."
   "article.body", "heat |br|\ heat~ |br|\ /joh?n(ath[oa]n)/", "article.body:heat |br|\ article.body:heat~ |br|\ articlebody:/joh?n(ath[oa]n)/", "First example shows every ticket containing the word ""heat"" - you can also use the fuzzy operator ""~"" to search for similar words like e.g. ""head"". the product will also allow you to use regular expressions, where ever the attributes allows it."

Combining Search Phrases

You can combine search phrases by using AND, OR and TO,
depending on the situation and phrases you use. If needed, you can parts of
your search phrase for complex searches with (). This allows you to
combine several phrases with different dependencies (AND/OR). In case you
receive search results that you want to exclude, you can use negation !.
Below are some examples that you could use with this:

   "state.name:(closed OR open) AND (priority.name:""2 normal"" OR tags:feedback)", "Show every ticket that state is either closed or open and has priority normal or the tag feedback."
   "state.name:(closed OR open) AND (priority.name:""2 normal"" OR tags:feedback) AND !(*the product*)", "This gets the same result as above, expect that we don't want the ticket to contain anything matching to ""the product""."
   "owner.email:bob@example.net AND state.name:(open OR new)", "Show tickets from bob@example.net that are either open or new."
   "state.name:pending* AND article_count:[1 TO 5]", "Show everything with any pending state and an article count of 1 to 5."

Some Ticket Attributes and Their Type

Below you can find the most important attributes sorted by ticket and article.

Ticket Attributes

* number: string
* title: string
* group: object (group.name, ...)
* priority: object (priority.name, ...)
* state: object (state.name, ...)
* organization: object (organization.name, ...)
* owner: object (owner.firstname, owner.lastname, owner.email, ...)
* customer: object
  (customer.firstname, customer.lastname, customer.email, ...)
* first_response_at: timestamp
* first_response_in_min: integer (business min till first response)
* close_at: timestamp
* close_in_min: integer (business min till close)
* last_contact_at: timestamp (last contact by customer or agent)
* last_contact_agent_at: timestamp (last contact by agent)
* last_contact_customer_at: timestamp (last contact by customer)
* create_article_type.name: string (email|phone|web|...)
* create_article_sender: string (Customer|Agent|System)
* article_count: integer
* escalation_at: timestamp
* pending_time: timestamp

Article Attributes

* article.from: string
* article.to: string
* article.cc: string
* article.subject: string
* article.body: string
* article.attachment.title: string (filename of attachment)
* article.attachment.content: string (content of attachment)
* article.attachment.content_type: string (MIME type, e.g.
  application\/vnd.oasis.opendocument.spreadsheet; see hint)

  .. hint::

     - If a search for a file type doesn't work, you have to provide the
       MIME type.
     - Make sure to escape the / with a prefixed \.
     - Examples:

       - LibreOffice spreadsheets:
         application\/vnd.oasis.opendocument.spreadsheet
       - LibreOffice text documents: application\/vnd.oasis.opendocument.text
       - MS Excel spreadsheets:
         application\/vnd.openxmlformats-officedocument.wordprocessingml.document
       - MS Word text documents:
         application\/vnd.openxmlformats-officedocument.wordprocessingml.document
       - Plain text files like *.txt* and *.p7s*: text

Suggested Workflows

Sharing Work on a Ticket

Some tickets require attention from more than one agent
(or even more than one department!).
In these cases, there are three ways to assign the work to the right people:

1. If a ticket is really about two different problems,
   you can split it in two,
   then assign each ticket to its respective “group” (department).
2. If you've done all you can on a ticket
   and it's now another agent's (or department's) responsibility,
   reassign it to a new owner (or group).
3. If you just need another agent's input on something, you can @mention
   them. (And if *you* want to get notifications for *someone else's* ticket,
   use the subscribe button.)

Reassigning Tickets

Suppose a call comes into the sales department.
A sales rep takes the call, creates a ticket,
and looks up some prices for the customer.
After recording his notes,
the rep then decides that this ticket needs to be passed onto customer service.

Our sales rep can simply un-assign himself as the owner of the ticket
and re-assign the ticket to the Customer Service group.
*All customer service agents will be notified of the incoming ticket*,
and the first available agent can assign herself
to pick up where the sales rep left off.

@mentions & the Subscribe Button

Now suppose you've reassigned the ticket to customer service.
You won't receive notifications for this ticket anymore,
but maybe this is a really important contract,
and you want to make sure they have an A+ experience from start to finish.

To enable notifications for a ticket that doesn't belong to you,
simply click the Subscribe button at the bottom of the ticket sidebar:

Or, suppose you don't want to reassign the ticket to customer service, you
just have one quick question for them, and then you can take it from there.
To start sending someone else notifications for your own ticket,
type @@ in the message editor and select their name from the pop-up menu.
This will automatically subscribe them to your ticket.

   Check your /extras/user-menu-profile-settings
   to customize how you receive notifications.

   Can't see a ticket, in which a colleague @mentioned you?

   Is the ticket assigned to a group that you don't belong to?
   @mentions and subscriptions only work for tickets that you already have
   access to.

Quickly Assign in Ticket Listings

Within overviews and detailed searches you can run bulk operations on tickets.
This means you can adjust the following ticket information:

- Group
- Owner
- State (with pending time, if applicable)
- Priority

After pressing Confirmation, the product also allows you to provide an internal
or public note in the Comment field which gets added to each of the selected
tickets.

the product doesn't ask for

Bulk action via drop-downs
   .. figure:: /images/advanced/suggested-workflows/bulk-operations-on-ticket-lists.png

      Use the check boxes in ticket listings to select a bunch of tickets.
      Now use below drop-downs to change ticket settings, press confirm and
      provide a note if you'd like.

Bulk action via drag and drop
   You can change owners and groups even faster. Instead of using the drop-downs
   on the bottom of the product, you can drag tickets by pressing and holding
   your mouse button. Doing so triggers an overlay and allows you to drop your
   selection on your desired action or entity. You can select a group, assign
   an owner or run a macro. This functionality is only available in overviews
   and the detailed search page.

   Initial overlay when you start dragging:

   .. figure:: /images/advanced/suggested-workflows/drag-bulk-operation.png

   Move the mouse to the Assign Tickets action at the bottom and you will
   see groups and agents for ticket assignment:

   .. figure:: /images/advanced/suggested-workflows/drag-bulk-operation_assign-owner.png

Text Modules

the product offers so-called text modules. Text modules will help you to improve your
workflow, as you don't have to type your answer on every ticket by hand. You can
simply choose a fitting text module and insert it into the email.
To access available text modules, simply type :: within an article body.
If you found the right text module, just press enter or click with your left
mouse button and the product will insert the module's text at the place your cursor is.

You can either scroll through all modules by using the mouse or arrow keys, type
the name or a keyword (if keywords are set) to find the text module you want to
use.

Text Modules Missing?

You noticed that some text modules don't always appear? Text modules can be tied
to groups: if that's the case, they are only available once the ticket you're
working on has been assigned to the appropriate group. The group dependent text
modules are available immediately when a new group has been selected, you don't
have to click Update. But how do you know which groups go with which text modules?
Ask your administrator!

Text Modules on Ticket Creation

You can use text modules on ticket creation as well. On ticket creation,
our ticket_templates might get handy too.

Customizing Text Modules

Administrators can learn more about customizing text modules

Ticket Actions

In the Basics section you learned how to handle tickets. However, there
are additional actions you can perform:

Create Tickets

When a customer messages you over a channel which is fetched by the product, a ticket
is created automatically (except the product recognizes it as a follow-up, then it
gets added as an article to an existing ticket). However, there might be cases
where you need to create a ticket manually. Examples:

- A customer calls you by phone.
- You receive a paper letter from a customer.
- A customer comes to a physical service desk.
- You proactively have to inform a customer by sending out a message.

In situations like these, you need to create a new ticket manually and click the
+ button at the bottom of the navigation bar. This shows a ticket create
screen where you can add all needed information.

Type

In the ticket create dialog, you can choose from different article types:

- Received Call: for issues initiated by a customer over the phone.
- Outbound Call: for issues initiated by an agent over the phone.
- Send Email: for issues initiated by an agent over email.

When choosing Send Email, the customer receives an email with the title as
subject and the text as email content.

Title

This is the title of a ticket which is shown in many places in the product.
For example this gets displayed in overviews. It is also used as the subject
for email communication. For emails, a ticket identifier is automatically
appended (e.g. Ticket#901234 - I need help!).

Customer

Enter a name or email address of a customer to search for existing accounts.
You can even search for organizations and their members. Select an option from
the autocomplete menu or create a new customer by clicking the
+ Create new Customer button. This opens a dialog where you can provide
all relevant information of the customer. A ticket can only have one customer.

After setting a customer in the ticket create dialog, the customer sidebar
automatically opens. You can see additional customer information including a
hint about the currently opened tickets of the customer.

Text

This is the content section where the currently known details of the issue
gets written down. For the "Send Email" type, this is the content/message of
the email.

Ticket Attributes

As you may know, there are additional ticket attributes such as group, priority
and owner that you can set. If you haven't read ticket-basics yet, check
it out to learn more.

After you provided the relevant information, finally create the ticket with a
click on the Create button. Read on

Find Tickets

There are different ways to find tickets, depending on your use case.

Via Overviews

If you search for new tickets to work on, your first look should be in the
overview section. This section gives you a rough overview. More details are
covered in a separate overview page.

You can either open it by clicking the Overviews button
in the navigation bar or use the keyboard shortcut o. You can think of
overviews as some kind of ticket lists.
By default, there are some built in overviews. For example, there is
an overview called Unassigned & Open Tickets which might be a good starting
point.

- My Assigned Tickets: open tickets in which you are set as owner.
- Unassigned & Open Tickets: open tickets which don't have an owner set.
- My Pending Reached Tickets: tickets in which you are the owner, have
  the *pending reminder* state and the pending reminder time is reached.
- Open Tickets: open tickets.
- Pending Reached Tickets: tickets which have the *pending reminder* state and
  the pending reminder time is reached.
- Escalated Tickets: tickets which are escalated or will escalate in the next
  10 minutes.

Your the product admin may have created additional overviews. These are based on
conditions, which are basically rules, to define which ticket appears in which
overview.

You can adjust the overviews in some aspects:

- Click on a column heading to change the sorting.
- Click and drag column dividers to adjust the column's width.
- Adjust the order of the overviews in your

The need for action is color coded and reflects mainly the
ticket states:

If you spot a circle with a blue/pink gradient, it indicates that an

Ticket priorities are
color-coded as well and help you to distinguish between the different
priorities:

Via Search

If you are looking for a specific ticket, you can use the search. Either click
on the search bar at the top of the left navigation sidebar or use the keyboard
shortcut s.

But the search is not only about tickets. the product also searches for users,
organizations and chat logs. It basically searches for all information which is
stored in the product and which got indexed by Elasticsearch, like:

- Message subject and text
- Names and email addresses
- Text in file attachments
- User and organizations details (like notes, names, etc.)
- Knowledge base articles

After entering a search term, you immediately see a preview of the search
results. These results are separated by type to make sure you won't get lost in
the results. Selecting one of those results will open a new navigation tab
(if not already opened) with the item.

If you press enter or click on Show Search Details, the product displays
a page with the search results:

You can narrow down your search by selecting a
specific object type (e.g. "User") in the tab bar below the search bar. To sort
the results based on the column's values, click on a column header. The sorting
is indicated by an arrow.
Click on the column again to change the sorting from ascending to descending
and back. If you still can't find what you are looking for, have a look at the

for specific attributes like creation date or the ticket owner's email address.

Now that you know how to find tickets, you may want to

Ticket Basics

Introduction

In the product, tickets are used to track customer service requests.
The first time a customer contacts you about something, the product creates a new
ticket. Each message sent between you and the customer is added to that ticket
until the issue is resolved, the customer is happy and the ticket is finally
closed. Such a single message in a ticket is called article. Basically, you
can think of a ticket as a conversation between you and a customer about
a single issue.

If you're completely new to a ticket system and handled your customer requests
with an email client so far, you might think that a ticket system is
complicated. But the opposite is true:

- All emails are now collected in the product (and requests from other channels might
  be as well).
- You and your colleagues can see who is working on which customer request
  ("ticket").
- The state of each request as well as the history (who did what?) is
  transparent.
- There is no duplicate work and nothing gets overlooked.
- You can ask your colleagues directly in the ticket for help in difficult
  cases.
- With the product's intuitive UI, you can focus on what matters: to resolve customer
  issues and answer customer questions.

This means you can work with the product in a similar way as with your email client.
Except that a ticket has additional attributes. Read on to learn more.

Ticket Attributes

In addition to articles, tickets have some additional meta information which are
called attributes. Use the ticket sidebar to view and change ticket
attributes.

To hide the sidebar, click the arrow button → in the top right corner. Click on
one of the tabs to bring it back. The available options depend on your
privileges and the configuration of your system.

It is even possible to create custom fields for tickets (for groups and users
too). You think such a custom field makes sense? Talk with your the product admin,
it can be set up easily
(admins can read more here).

State

The state reflects the current status of a ticket (mainly if a customer
request is resolved or not). Think of it as a representation of progress towards
completion. By default, there are the following states:
