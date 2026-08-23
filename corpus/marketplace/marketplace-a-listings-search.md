In the product, you can manage the available stock or inventory of a
listing via the stock-related features in the Marketplace API and the
Integration API. With those APIs, you can determine the available stock
(quantity) of any given listing as well as add to and subtract from it.
Additions to stock will mostly be determined by providers, as they
restock the items they sell. Stock subtractions, on the other hand, will
mostly happen as part of transactions, as buyers on your marketplace
make purchases.

This article describes the product stock management features on a
high level. We also have
a more technical article about stock management.

## How do you determine the initial available stock or increase the available stock of a listing?

With the stock-related APIs, you add to the available stock of a listing
by creating a stock adjustment. This is an API
call that you make through one of our APIs that lets your the product
marketplace know that you have increased the quantity of available stock
for one of your listings. This adjustment could be done directly through
the marketplace UI or a third-party integration using the corresponding
API calls.

## How do you remove or decrease the available stock of a listing?

Most of the time, a listing's available stock will decrease because
people purchase units via transactions. The stock-related transaction
process actions allow defining your transaction process so that when a
transaction is initiated, a stock reservation is made as well, for
example. This prevents your users from purchasing more units than are
available.

If the transaction completes, the purchased units are removed from the
inventory permanently. If the transaction is cancelled, the units are
released back to the inventory and other users will be able to purchase
them. Find out more about
transaction process actions related to stock reservations.

You can also connect your the product marketplace with third-party
systems to further manage stock. If units are bought through another
site or system, you can sync this information with the Integration API
and adjust your stock accordingly.

Finally, providers could manually adjust their inventory directly from
the marketplace interface. Similar to how they would add inventory.

## Can listings be closed automatically if there is no stock left?

Yes! This feature can be built into your the product marketplace app with
relative ease, even though it is not part of the default template.
Furthermore, even if you don’t have a system in place that would close
the listings automatically, users will not be able to purchase more
units than are available, giving you peace of mind that no
double-purchases of the same stock will happen.

## How to manage the number of seats or spaces for an event or a class?

If you are looking to manage the number of spaces in an event, you
should take a look at the seats feature. With seats, you can manage the
number of available spaces in a given event at a given time. Seats are
tied to booking availability management.

In the product, you can manage the capacity of an event or space within a
specific timeframe with seats. Seats is a fundamental feature for
marketplaces that provide events, rentals, or services that can be
booked by multiple people at the same time. Seats allow you to define
the specific number of people that book the same time slot in an event,
space, or service.

If there are seats available in a specific time slot, the listing can
still be booked by as many people as seats are available. Once all the
seats are taken, the time slot becomes unavailable.

This article describes seat management on a high level. If you want to
learn how to manage seats from a technical perspective, visit the API
references for
Marketplace API
or
Integration API.

## How do you define the available seats for a listing?

You define the available seats for any given time slot of a listing via
the
availability plan or availability exceptions
of a listing. If the number of seats is set to 0, the listing will not
be available at that time.

In our the product Web Template, the default seat availability of any
particular bookable listing is one. Providers set the availability plan
and exceptions of their listing during listing creation. Users determine
when their listing is available and when it’s not within the timeframes
your marketplace offers: hourly, daily, or custom length. When modifying
the template, you or your developers can enable more than one seat per
time slot, either in general or for specific dates and times.

If your marketplace listings happen at a specific time or place instead
of at a repeated interval (e.g. concerts or events), you can set the
listing availability to be blocked by default. Providers can then create
availability exceptions to open availability for the day(s) of their
event and the desired number of seats. To set availability as blocked by
default, you need to set an availability plan with 0 seats across the
board.

Some examples:

- You can set multiple available spaces for the same sauna for every
  night.
- You can set available beds in a hostel room.
- You can set the maximum number of people that can participate in a
  yoga class depending on the day.
- You can determine the number of screens that can participate in an
  online cooking class.

## How do you decrease the available seats of a listing?

Most of the time, a listing's available seats will decrease through
bookings via transactions. The
booking-related transaction process actions
allow defining your transaction process so that when a transaction is
initiated, a seat reservation is made as well. This prevents your users
from booking more seats than are available.

If the transaction completes, the seats are removed from the listing’s
or timeslot’s availability. If the transaction is cancelled, the seats
are released and other users will be able to book them. Find out more
about
availability related transaction actions.

You can also connect your the product marketplace with third-party
systems to further manage seats. If bookings are made through another
system, you can sync this information using the Integration API and
adjust listing availability plans accordingly or override the plan with
an exception.

Finally, providers could manually reduce the number of seats or block
their availability entirely for a specific time slot (date or hour)
directly from the marketplace interface. Similar to how they would
determine their initial availability.

Finally, providers could manually adjust their inventory directly from
the marketplace interface. Similar to how they would add inventory.

## Can listings be searched by available spots?

Yes! Listing search can be modified so that available seats are taken
into account. It's possible to search for listings that have desired
number of seats available on specific dates or times. For example:

- Find listings that have 2 seats available on next Friday.
- Find listings that have 5 seats available for two hours some time next
  week.

If a marketplace uses availability-based listing search, then listings
that don’t have enough spots available will be automatically filtered
out, even though they are available for a lower number of people in the
same timeframe.

## Can I manage stock or inventory of a listing with seats?

If you are looking to manage the stock or inventory of a listing, you
should take a look at
stock management in the product.

This article explains the basics of extended data. If you want to get
technical instead, check out the
Extended data API Reference.

## Why extended data?

Extended data is the product feature that allows you to customize your
user, listing, and transaction data. Your marketplace has its own unique
offering and requires specific data that other marketplaces do not.
Maybe you’re building a marketplace for cooking classes and want to ask
chefs how many years of experience they have. Or perhaps you’re building
a summer cottage rental community and want your providers to define the
amenities of their cottage. Extended data gives you the freedom to
determine exactly what information you want your users to provide on
your marketplace and how. However, the possibilities of extended data do
not end there!

Extended data can be customized to different use-cases to fit your exact
needs: in addition to collecting the information you need from your
users in the form you choose, it allows you to display featured
listings, have different user types, build custom search functionality,
and much more.

With extended data, you can build integrations with third-party
services, such as a subscription payment system or SMS notification
software. You can also have extended data that is only revealed at a
specific point in a transaction. Or maybe you want more control over how
search results on your marketplace are prioritized and sorted? For all
these customizations, extended data is your friend.

The possibilities you have with extended data are vast. In the next
section, we’ll discuss each type of extended data in more detail and
offer examples of what they can be used for.

## Types of extended data

There are six possible types of extended data, defined by who can edit
and view them. Five out of these are available in the product at this
time. They are _public data_, _protected data_, and _private data_, as
well as _public metadata_ and _protected metadata_.

In the following sections, “author” means the user who created the
listing or profile in question. “Operator” refers to both the
marketplace owner and the Integration API. The marketplace operators and
the Integration API have access to view and edit all of the data types.

### Access to edit

Extended _data_ can be written and edited by listing or user profile
authors in your frontend application. _Metadata_ can be written and
edited only by marketplace operators.

### Access to view

Public data and public metadata can be viewed by everyone with access to
your marketplace. Protected data is private by default, but can be
viewed at a certain point during a transaction process by members of
that transaction. Protected metadata is visible to the participants of
the transaction. Private data can only be viewed by the listing or user
profile authors themselves.

We can also organize the data types by placing them in a table.

              Data                                                       Metadata

  Public      editing: author, operator – viewing: all users             editing: operator – viewing: all users
  Protected   editing: author, operator – viewing: transaction members   editing: operator – viewing: transaction members
  Private     editing: author, operator – viewing: author, operator      not available

In order to determine what type of extended data you want to collect on
your marketplace, you need to answer the following questions:

- What information do you want to collect about your users and listings
  and during transactions?
- Who can write and edit that information?
- What information do you want to display and to whom?

In the next section, we’ll explore how different types of extended data
are shown on your marketplace and Console and offer examples of the
possibilities the different types of extended data provide.

## Using extended data

### 1. Public data

Public data is information that is visible to all users of your
marketplace and can be written and edited by listing authors or user
profile owners. It can help your customers make purchasing decisions,
let your customers know important details about your sellers, or be used
as search filters and parameters and to sort search results. Public data
allows you to customize your public listing and user information to fit
your needs exactly!

Let’s look at listing public data in action. Here is a listing from an
imaginary bike rental marketplace, Biketribe.

Further public data you might want to collect could be website links or
relevant social media handles in user profiles. Public data can be any
type of information you believe will be important for your buyers to
have or your sellers to share to get the most out of your marketplace.

### 2. Protected data

Protected data is information that can be revealed at specific points of
the transaction process. It can only be seen by the parties taking part
in the transaction, meaning the provider, customer, and the marketplace
operator. After a cooking class booking is confirmed, you might want to
request the customer to provide information on any dietary restrictions.
Or maybe you only want to reveal a provider's phone number or address
after payment has been confirmed to guarantee your users do not bypass
your payment system. These cases can be handled with protected data.

Other examples of protected data could be a link to the provider’s Zoom
page or a link to download a digital file the buyer has purchased. Or
maybe your marketplace is for car rentals, and you want the customer to
provide photos of the rented vehicle before and after the rental period.
All these and more can all be included as protected data.

### 3. Private data

Private data can only be edited and viewed by those who created the
listing or user profile in question and marketplace operators. It is
similar to protected data but is not intended to be revealed during the
transaction process. Private data can be used to collect and store
information about users or listings that is important for marketplace
operators but does not need to or should not be revealed to other users.

Private data is especially useful in third-party integrations. You can
store an ID from an external service to user or listing private data and
connect it to services such as SMS notifications with Twilio or sync the
provider’s schedule with Google Calendar!

As a further example – even though you may not want your customers and
providers to be able to contact each other outside of your platform, you
might still want to be able to call them yourself. A user’s phone number
can be saved in their private data for these situations.

Private data can also be used if you want the provider to give specific
information for your listing approval process. Maybe you run a
marketplace for graphic designers and want to verify their experience
with past employers or check their portfolio before publishing a
listing. Contact details of previous employers and links to online
portfolios could be included as private data.

### 4. Public metadata

Public metadata is visible to all users, but only the operator and the
Integration API can edit it.

Typical use-cases for metadata are featured listings or premium users.
You may want to curate listings that get this extra visibility yourself
or offer it as a paid service, so using public data, which the users can
edit themselves, is not an option. This is where metadata comes into
play. Like public data, public metadata can be used as search filters
and parameters and in sorting search results.

In addition to featured listings, other ways to use public metadata
could be to distinguish verified users from regular ones or highlight
Gold members who are part of your highest subscription tier. Maybe you
want to waive the marketplace commission for them. Based on the user’s
subscription information saved in their metadata, you can trigger a
transaction process with or without a commission fee. Or maybe you want
to establish one-time payments for users to get to promote their
listings on your landing page: data of such payments can be saved in
public metadata. You can use this metadata to always display featured
listings first in relevant search results, for example.

### 5. Protected metadata

Transactions can also have metadata. It can only be seen by the
transaction members as it is tied to the transaction. An example of
transaction metadata could be a unique Zoom link to where an online
service will take place.

This metadata can be written into the transaction by the Integration API
at a specific point of the transaction, or it can be added in Console by
the operator. You can also configure the transaction process to update
transaction metadata.

## Getting started with extended data

Extended data is a powerful feature that allows you to customize your
marketplace’s offering, whether services, rentals, or products, to your
exact needs. It helps you collect the information you require from your
users and enables additional functionality together with the transaction
process and through the Integration API. Extended data also plays a
vital role in search result sorting and filtering.

To get started with extended data, you should decide what information
you want to collect about your users and listings or what is important
for users to know during transactions. Next, you should think about who
has access to edit that information. Finally, you should consider
whether you want to display this information to everyone, select users,
or just to yourself. Through extended data, the product can support a
multitude of different kinds of listings, monetization models, user
profiles, and so on. You can create the exact data structure you need
for your marketplace.

Listings can have three types of extended data: public, private, and
metadata. This article gives an overview of using these different
extended data types.

Listing public data fields can be configured in Console using
assets. the product Web Template has the
capability to read the asset-based public data fields and display the
necessary components when editing and viewing a listing.

## Viewing and modifying listing extended data

Public data and metadata are visible to everyone – in other words, they
are available when querying listings through the
public listing endpoints
in Marketplace API. Public data and metadata can be used, for instance,
to distinguish different types of listings from each other, or to allow
marketplace users to filter and search for specific features on a
listing. Operators can use metadata to categorise listings to regular
and premium, for instance.

On the other hand, listing private data is available through the
ownListing endpoints
in Marketplace API and
listing endpoints
in Integration API.

Private data can be used to allow the listing author to make private
notes on the listing, since the information is not visible for the
general marketplace audience.

The listing's author can modify the listing's public and private data
through the
ownListing
create and update endpoints. An operator can modify all listing extended
data, either through
Integration API
or in the product Console.

## Search and filtering

How users search and filter listings is a vital part of their experience
in your marketplace. A smooth search experience allows them to find the
listings they’re interested in effortlessly, and the right filters help
them narrow down results to a selection that best fits their needs.
Extended data helps you build the custom search and filtering experience
your marketplace needs.

Listings can be searched by keyword or location using the product’s
powerful built-in search feature.
In addition to this, you can use listing public extended data and
metadata to create a variety of different types of filters; for example,
a filter can be a slider with a range of values or a checkbox group. You
can also specify how listings are prioritized and sorted in the results.
Extended data is not available for search or sorting by default, which
means you are in control of building your own, unique search experience.

When planning your search experience, think about the following
questions: Do you want the extended data in any given field to be
searchable? Do you want it to be a filter as well as a search parameter?
What kind of filter should it be? Which extended data should be
prioritized in search results?
