# Concepts

## Subscriber

A subscriber is a recipient identified by an e-mail address and name. Subscribers receive e-mails that are sent from the product. A subscriber can be added to any number of lists. Subscribers who are not a part of any lists are considered *orphan* records.

### Attributes

Attributes are arbitrary properties attached to a subscriber in addition to their e-mail and name. They are represented as a JSON map. It is not necessary for all subscribers to have the same attributes. Subscribers can be queried and segmented into lists based on their attributes, and the attributes can be inserted into the e-mails sent to them. For example:

### Subscription statuses

A subscriber can be added to one or more lists, and each such relationship can have one of these statuses.

  Status           Description

  `unconfirmed`    The subscriber was added to the list directly without their explicit confirmation. Nonetheless, the subscriber will receive campaign messages sent to single opt-in campaigns.
  `confirmed`      The subscriber confirmed their subscription by clicking on 'accept' in the confirmation e-mail. Only confirmed subscribers in opt-in lists will receive campaign messages send to the list.
  `unsubscribed`   The subscriber is unsubscribed from the list and will not receive any campaign messages sent to the list.

### Segmentation

Segmentation is the process of filtering a large list of subscribers into a smaller group based on arbitrary conditions, primarily based on their attributes. For instance, if an e-mail needs to be sent subscribers who live in a particular city, given their city is described in their attributes, it's possible to quickly filter them out into a new list and e-mail them. Learn more.

## List

A list (or a _mailing list_) is a collection of subscribers grouped under a name, for instance, _clients_. Lists are used to organise subscribers and send e-mails to specific groups. A list can be single opt-in or double opt-in. Subscribers added to double opt-in lists have to explicitly accept the subscription by clicking on the confirmation e-mail they receive. Until then, they do not receive campaign messages.

## Campaign

A campaign is an e-mail (or any other kind of messages) that is sent to one or more lists.

## Transactional message

A transactional message is an arbitrary message sent to a subscriber using the transactional message API. For example a welcome e-mail on signing up to a service; an order confirmation e-mail on purchasing an item; a password reset e-mail when a user initiates an online account recovery process.

## Template

A template is a re-usable HTML design that can be used across campaigns and when sending arbitrary transactional messages. Most commonly, templates have standard header and footer areas with logos and branding elements, where campaign content is inserted in the middle. the product supports Go template expressions that lets you create powerful, dynamic HTML templates. Learn more.

## Messenger

the product supports multiple custom messaging backends in additional to the default SMTP e-mail backend, enabling not just e-mail campaigns, but arbitrary message campaigns such as SMS, FCM notifications etc. A *Messenger* is a web service that accepts a campaign message pushed to it as a JSON request, which the service can in turn broadcast as SMS, FCM etc. Learn more.

## Tracking pixel

The tracking pixel is a tiny, invisible image that is inserted into an e-mail body to track e-mail views. This allows measuring the read rate of e-mails. While this is exceedingly common in e-mail campaigns, it carries privacy implications and should be used in compliance with rules and regulations such as GDPR. It is possible to track reads anonymously without associating an e-mail read to a subscriber.

## Click tracking

It is possible to track the clicks on every link that is sent in an e-mail. This allows measuring the clickthrough rates of links in e-mails. While this is exceedingly common in e-mail campaigns, it carries privacy implications and should be used in compliance with rules and regulations such as GDPR. It is possible to track link clicks anonymously without associating an e-mail read to a subscriber.

## Bounce

A bounce occurs when an e-mail that is sent to a recipient "bounces" back for one of many reasons including the recipient address being invalid, their mailbox being full, or the recipient's e-mail service provider marking the e-mail as spam. the product can automatically process such bounce e-mails that land in a configured POP mailbox, or via APIs of SMTP e-mail providers such as AWS SES and Sengrid. Based on settings, subscribers returning bounced e-mails can either be blocklisted or deleted automatically. Learn more.

# Querying and segmenting subscribers

the product allows the writing of partial Postgres SQL expressions to query, filter, and segment subscribers.

## Database fields

These are the fields in the subscriber database that can be queried.

  Field                      Description

  `subscribers.uuid`         The randomly generated unique ID of the subscriber
  `subscribers.email`        E-mail ID of the subscriber
  `subscribers.name`         Name of the subscriber
  `subscribers.status`       Status of the subscriber (`enabled`, `disabled`, `blocklisted`)
  `subscribers.attribs`      Map of arbitrary attributes represented as JSON. Accessed via the `->` and `->>` Postgres operator.
  `subscribers.created_at`   Timestamp when the subscriber was first added
  `subscribers.updated_at`   Timestamp when the subscriber was modified

## Sample attributes

Here's a sample JSON map of attributes assigned to an imaginary subscriber.

## Sample SQL query expressions

#### Find a subscriber by e-mail

#### Find a subscriber by name

#### Multiple conditions

#### Querying subscribers who viewed the campaign email

#### Querying attributes

#### Querying nested attributes

To learn how to write SQL expressions to do advancd querying on JSON attributes, refer to the Postgres JSONB documentation.

the product supports (>= v4.0.0) creating systems users with granular permissions to various features, including list-specific permissions. Users can login with a username and password, or via an OIDC (OpenID Connect) handshake if an auth provider is connected. Various permissions can be grouped into "user roles", which can be assigned to users. List-specific permissions can be grouped into "list roles".

## User roles

A user role is a collection of user related permissions. User roles are attached to user accounts. User roles can be managed in `Admin -> Users -> User roles` The permissions are described below.

  Group         Permission                Description

  lists         lists:get_all             Get details of all lists
                lists:manage_all          Create, update, and delete all lists
  subscribers   subscribers:get           Get individual subscriber details
                subscribers:get_all       Get all subscribers and their details
                subscribers:manage        Add, update, and delete subscribers
                subscribers:import        Import subscribers from external files
                subscribers:sql_query     Run raw SQL queries on subscriber data.**WARNING:**This permission allows execution of arbitrary SQL expressions and SQL functions. While it is readonly on the table data, it allows querying of all lists and subscribers directly from the database superceding individual list and subscriber permissions. Raw SQL expressions make it possible to obtain Postgres database configuration and potentially interact with other Postgres system features. Give this permission ONLY to trusted users. Learn more.
                tx:send                   Send transactional messages to subscribers
  campaigns     campaigns:get             Get and view campaigns belonging to permitted lists
                campaigns:get_all         Get and view campaigns across all lists
                campaigns:get_analytics   Access campaign performance metrics
                campaigns:manage          Create, update, and delete campaigns belonging to permitted lists
                campaigns:manage_all      Create, update, and delete campaigns across all lists
                campaigns:send            Start, schedule, pause, resume, and cancel campaigns. This is independent of manage permissions. This is required to send a campaign, even with `campaigns:manage_all`
  bounces       bounces:get               Get email bounce records
                bounces:manage            Process and handle bounced emails
                webhooks:post_bounce      Receive bounce notifications via webhook
  media         media:get                 Get uploaded media files
                media:manage              Upload, update, and delete media
  templates     templates:get             Get email templates
                templates:manage          Create, update, and delete templates
  users         users:get                 Get system user accounts
                users:manage              Create, update, and delete user accounts **WARNING:**This permission allows creation of users with any role, including Super Admin. This permission should only be given to Super Admin level accounts
                roles:get                 Get user roles and permissions
                roles:manage              Create and modify user roles
  settings      settings:get              Get system settings
                settings:manage           Modify system configuration
                settings:maintain         Perform system maintenance tasks

## List roles

A list role is a collection of permissions assigned per list. Each list can be assigned a view (read) or manage (update) permission. List roles are attached to user accounts. Only the lists defined in a list role is accessible by the user, be it on the admin UI or via API calls. Do note that the `lists:get_all` and `lists:manage_all` permissions in user roles override all per-list permissions.

## API users

A user account can be of two types, a regular user or an API user. API users are meant for intertacting with the product APIs programmatically. Unlike regular user accounts that have custom passwords or OIDC for authentication, API users get an automatically generated secret token.

## `subscribers:sql_query`

This permission allowers users to write and execute arbitrary SQL queries on the database. Although it is executed as a read-only transaction disallowing changing of data in the database tables, it allows querying of all lists, subscribers and other data directly from the database superceding individual list and subscriber permissions.

Raw SQL expressions also make it possible to obtain Postgres database configuration and potentially interact with other Postgres system features. Give this permission ONLY to trusted users.

If this permission is being assigned to many users, it is highly recommended that you create a custom Postgres role disallowing any privileged operations. For example:

# Templating

A template is a re-usable HTML design that can be used across campaigns and transactional messages. Most commonly, templates have standard header and footer areas with logos and branding elements, where campaign content is inserted in the middle.

the product supports Go template expressions that lets you create powerful, dynamic HTML templates. It also integrates 100+ useful Sprig template functions.

!!! Warning
    Sprig template functions are powerful and Turing-complete, allowing programming of complex behaviour in templates. This means that it is also possible to program undesired behaviour, such as overloading memory on the host by concatenating large strings in a loop. Ensure that templating (campaigns, templates) permissions are given only to trusted users.

## Campaign templates
Campaign templates are used in an e-mail campaigns. These template are created and managed on the UI under `Campaigns -> Templates`, and are selected when creating new campaigns.

## Transactional templates
Transactional templates are used for sending arbitrary transactional messages using the transactional API. These template are created and managed on the UI under `Campaigns -> Templates`.

## Template expressions

There are several template functions and expressions that can be used in campaign and template bodies. They are written in the form ``, that is, an expression between double curly braces ``. Template expressions are supported in:

- Campaign body and alt body
- Campaign subject
- Campaign headers
- Transactional message body and alt body
- Transactional message subject

### Subscriber fields

  Expression                      Description

  ``        The randomly generated unique ID of the subscriber
  ``       E-mail ID of the subscriber
  ``        Name of the subscriber
  ``   First name of the subscriber (automatically extracted from the name)
  ``    Last name of the subscriber (automatically extracted from the name)
  ``      Status of the subscriber (enabled, disabled, blocklisted)
  ``     Map of arbitrary attributes. Fields can be accessed with `.`, eg: `.Subscriber.Attribs.city`
  ``   Timestamp when the subscriber was first added
  ``   Timestamp when the subscriber was modified

### Campaigns

  Expression              Description

  ``        The randomly generated unique ID of the campaign
  ``        Internal name of the campaign
  ``     E-mail subject of the campaign
  ``   The e-mail address from which the campaign is being sent

### Functions

  Function                               Description

  ``              Prints the current datetime for the given format expressed as a Go date layout
  ``   Takes a URL and generates a tracking URL over it. For use in campaign bodies and templates.
  `           Shorthand for `TrackLink`. Eg: `Link`
  ``                      Inserts a single tracking pixel. Should only be used once, ideally in the template footer.
  ``                 Unsubscription and Manage preferences URL. Ideal for use in the template footer.
  `?manage=true`     Direct URL to Manage Preferences page.
  ``                     URL to view the hosted version of an e-mail message.
  ``                       URL to the double opt-in confirmation page.
  ``        Add any HTML code as it is.

### Sprig functions
the product integrates the Sprig library that offers 100+ utility functions for working with strings, numbers, dates etc. that can be used in templating. Refer to the Sprig documentation for the full list of functions.

### Example template

The expression `` should appear exactly once in every template denoting the spot where an e-mail's content is inserted. Here's a sample HTML e-mail that has a fixed header and footer that inserts the content in the middle.

!!! info
    For use with plaintext campaigns, create a template with no HTML content and just the placeholder ``

### Example campaign body

Campaign bodies can be composed using the built-in WYSIWYG editor or as raw HTML documents. Assuming that the subscriber has a set of attributes defined, this example shows how to render those values in a campaign.

The above example uses an `if` condition to show one of two messages depending on the value of a subscriber attribute. Many such dynamic expressions are possible with Go templating expressions.

## System templates
System templates are used for rendering public user-facing pages such as the subscription management page, and in automatically generated system e-mails such as the opt-in confirmation e-mail. These are bundled into the product but can be customized by copying the static directory locally, and passing its path to the product with the `./listmonk --static-dir=your/custom/path` flag.

You can fetch the static files with:
`mkdir -p /home/ubuntu/listmonk/static ; wget -O -    tar xz -C /home/ubuntu/listmonk/static --strip=2 "the product-master/static"`

Docker example, binary example.

### Public pages

  /static/public/

  `index.html`               Base template with the header and footer that all pages use.
  `home.html`                Landing page on the root domain with the login button.
  `message.html`             Generic success / failure message page.
  `optin.html`               Opt-in confirmation page.
  `subscription.html`        Subscription management page with options for data export and wipe.
  `subscription-form.html`   List selection and subscription form page.

To edit the appearance of the public pages using CSS and Javascript, head to Settings > Appearance > Public:

### System e-mails

  /static/email-templates/

  `base.html`                        Base template with the header and footer that all system generated e-mails use.
  `campaign-status.html`             E-mail notification that is sent to admins on campaign start, completion etc.
  `import-status.html`               E-mail notification that is sent to admins on finish of an import job.
  `subscriber-data.html`             E-mail that is sent to subscribers when they request a full dump of their private data.
  `subscriber-optin.html`            Automatic opt-in confirmation e-mail that is sent to an unconfirmed subscriber when they are added.
  `subscriber-optin-campaign.html`   E-mail content that's inserted into a campaign body when starting an opt-in campaign from the lists page.
  `default.tpl`                      Default campaign template that is created in Campaigns -> Templates when the product is first installed. This is not used after that.

!!! info
    To turn system e-mail templates to plaintext, remove `` from base.html and remove all HTML tags from the templates while retaining the Go templating code.

# Bounce processing

Enable bounce processing in Settings -> Bounces. POP3 bounce scanning and APIs only become available once the setting is enabled.

## POP3 bounce mailbox
Configure the bounce mailbox in Settings -> Bounces. Either the "From" e-mail that is set on a campaign (or in settings) should have a POP3 mailbox behind it to receive bounce e-mails, or you should configure a dedicated POP3 mailbox and add that address as the `Return-Path` (envelope sender) header in Settings -> SMTP -> Custom headers box. For example:

Some mail servers may also return the bounce to the `Reply-To` address, which can also be added to the header settings.

### Bounce classification
the product applies a series of heuristics looking for keywords in the bounced mail body to guess if it is a 'soft' bounce or a 'hard' bounce. For instance, 4.x.x and 5.x.x error status codes, common strings such as "mailbox not found" etc. If none of the heuristics match, then the bounce mail is considered to be 'soft' by default.

## Webhook API
The bounce webhook API can be used to record bounce events with custom scripting. This could be by reading a mailbox, a database, or mail server logs.

  Method   Endpoint           Description

  `POST`   /webhooks/bounce   Record a bounce event.

  Name              Type     Required   Description

  subscriber_uuid   string              The UUID of the subscriber. Either this or `email` is required.
  email             string              The e-mail of the subscriber. Either this or `subscriber_uuid` is required.
  campaign_uuid     string              UUID of the campaign for which the bounce happened.
  source            string   Yes        A string indicating the source, eg: `api`, `my_script` etc.
  type              string   Yes        `hard` or `soft` bounce. Currently, this has no effect on how the bounce is treated.
  meta              string              An optional escaped JSON string with arbitrary metadata about the bounce event.

## External webhooks
the product supports receiving bounce webhook events from the following SMTP providers.
