## Configure channel permissions

You can configure the following permissions for each channel,
regardless of its type.

Subscription permissions:

* Who can administer the channel
* Who can subscribe themselves
* Who can subscribe anyone
* Who can unsubscribe anyone

Messaging permissions:

* Who can send messages
* Who can start new topics
* Whether topics are required

Moderation permissions:

* Who can move messages
* Who can resolve topics
* Who can delete messages

For the organization as a whole, you can:

* Restrict channel creation
* Restrict who can subscribe others to channels

Any permission, including whether a channel is private, public, or web-public,
can be modified after the channel is created.

## Private channels

Private channels (indicated by ) are for conversations that should be visible to users who
are specifically granted access. There are two types of private channels in
the product:

* In private channels with **shared history**, new subscribers can access the
  channel's full message history. For example, a newly added team member can get
  ramped up on a secret project by seeing prior discussions.
* In private channels with **protected history**, new subscribers can only see
  messages sent after they join. For example, a new manager would not be able to
  see past discussions regarding their own hiring process or performance management.

Administrators can export messages in private
channels only if granted permission to do
so
by a subscriber.

Users who do not have special permissions (they are not organization
administrators, and have not been granted access to channel metadata) cannot
easily see which private channels exist. They can find out that a channel exists
only by attempting to create a channel with the same name, if they have
permission to create channels. They
can't get any other information about private channels they are not subscribed
to.

  If you create a bot that is allowed to read messages
  in a private channel (e.g., a **generic bot**, *not* an **incoming webhook bot**,
  which is more limited), an administrator can in theory gain access to messages
  in the channel by making themselves the bot's owner.

## Public channels

Public channels (indicated by ) are open to all members of your organization other than
guests. Anyone who is not a guest can:

* See information about the channel, including its name, description, permission
  settings, and subscribers.
* Subscribe or unsubscribe themselves to the channel.
* See all messages and topics, whether or not they are subscribed.

You can configure other permissions for public channels, such as who is allowed
to post.

Guest users can't see public (or private) channels, unless they have been specifically
subscribed to the channel.

## Web-public channels

Web-public channels are indicated with a **globe** () icon.

## Related articles

* User roles
* Guest users
* User groups
* Public access option
* Restrict channel creation
* Configure who can administer a channel

You can restrict who can send messages to a channel. For example,
you can set up an announcement channel where only a specific
group of users can send messages.

  You can also configure who can start new
  topics.

  1. Select a channel.

  1. Under **Messaging permissions**, configure **Who can post to this channel**.

## Related articles

* Configure who can start new topics
* Configure automated notices for channel events
* Channel permissions
* User roles
* User groups
* Set default channels for new users
* Configure who can administer a channel

**Direct messages (DMs)** are conversations with other users that happen outside
of a channel. They are convenient for 1:1 and
small group conversations. Direct messages are private to conversation participants. Administrators may be
able to export your DMs in a corporate
organization, or with your
permission.

If you find yourself frequently conversing with the same person or group, it
often works best to create a private channel for your
conversations. This lets you organize your discussion into topics, and subscribe
or unsubscribe people as needed.

## Send a DM

## View your direct message conversations

There are a few different ways to view your DM conversations.

      To return to the channel list in the left sidebar, click the **back to
      channels** link above the search box.

      1. If the user list in the right sidebar is hidden, click the
         **user list** () icon in
         the upper right to show it.
      1. Click on any user to view your 1:1 DM conversation.

      You can find a user by typing their name in the **Filter users** box at the
      top of the right sidebar.

      1. Click the **New direct message** button at the bottom of the app, or use the
         X keyboard shortcut to open the compose box.
      1. Start typing a user's name in the recipient bar, and select their name from
         the list of suggestions. Continue to add users for a group DM conversation.
      1. Click the highlighted **Go to conversation** () button at the top of the compose box, or use
         the Ctrl + . keyboard shortcut to view that DM
         conversation.

      1. Tap a recent DM conversation to view it.

## Find a direct message conversation

      1. Click the **search** () icon in the top bar to open the search
         box.
      1. Start typing a user's name. You'll be able to select DMs with that user
         from the list of suggestions.
      1. *(optional)* Continue to add users via the search box for a group DM
         conversation.

      You can also type `dm-including` in the search box to find all 1:1 and group
      DM conversations that include a particular user.

## Go to direct message feed

You can see all your direct messages in one place.

## Related articles

* Typing notifications
* Open the compose box

You can add users who should have restricted access to your organization as
**guests**. For example, this may be a good choice for contractors or customers
invited to a company's the product chat.

Guest users **can**:

* View and send messages in channels they have been subscribed to, including
  viewing message history in the same way as other channel subscribers.

Guest users **cannot**:

* See private or public channels, unless they have been specifically subscribed
  to the channel.
* Create new channels or user groups.
* Add or manage bots.
* Add custom emoji.
* Invite users to join the organization.

You can also **configure** other permissions for guest users, such as whether they
can:

* Move or
  edit messages.
* Notify a large number of users with a wildcard
  mention.

the product Cloud plans have special discounted
pricing for guest users.

## Configure guest indicator

      1. Under **Guests**, toggle **Display “(guest)” after names of guest users**.

## Configure warning when composing a DM to a guest

the product can display a warning to let users know when recipients for a direct
message they are composing are guests in your organization. The warning will be
shown as a banner in the compose box on the web and desktop apps.

      1. Under **Guests**, toggle **Warn when composing a DM to a guest**.

## Configure whether guests can see all other users

You can restrict guests' ability to see other users in the organization. If you
do so, guests will be able to see information about other users only in the
following cases:

* The user belongs to a direct message thread with the
  guest.
* The user is subscribed to one or more channels with
  the guest.

When a guest cannot see information about a user, the guest's experience will be
that:

* The user does not appear in the right sidebar.
* The user does not appear in typeahead suggestions, e.g., in the compose box
  and search.
* Otherwise, such a user will be displayed as an **Unknown user** in the product
  app. For example, messages and reactions from a former subscriber of a channel
  will be shown as from an **Unknown user**.
* An **Unknown user**'s user card will not display
  information about that user. However, the guest can still search from all
  messages send by a particular **Unknown user** from that user's card.

In practice, guests should rarely encounter content from an **Unknown user**,
unless users in your organization frequently change their channel subscriptions
or are deactivated.

The only information guests can access about unknown users via the API
is which user IDs exist, and
availability updates for each user ID.

  Self-hosted organizations can disable API access to availability updates
  by configuring
  `CAN_ACCESS_ALL_USERS_GROUP_LIMITS_PRESENCE = True`. For performance reasons,
  this is recommended only for organizations with up to \~100 users.

      1. Under **Guests**, configure **Who can view all other users in the
         organization**.

## Related articles

* User roles
* Invite new users
* Change a user's role
* the product Cloud billing

## Browse and subscribe to channels

Subscribing to a channel makes conversations in that channel appear in your
inbox, recent conversations,
combined feed and left sidebar. The
app tracks your unread messages in subscribed channels, and you'll receive
@-mention notifications only in channels
you're subscribed to.

Everyone other than guests can subscribe to any
public or
web-public channel. Channel
administrators can configure who can
subscribe to private channels.

  There's no need to subscribe to channels where you don't plan to read the
  conversations. You can follow a link to a specific
  conversation
  in any channel you have content access to.

      1. Scroll through the list of channels. You can use the **search box** near the
         top of the menu to filter the list by channel name or description.
      1. Click the **subscribe to channel**
         ()
         icon to the left of a channel to subscribe to it.

      You can click on the icons in the upper right to sort the list of channels
      **by name** (),
      **by number of subscribers** (), or
      **by estimated weekly traffic** ().

      1. Scroll to the bottom of the list of subscribed channels.
      1. Tap **All Channels**.
      1. Scroll through the list of channels.
      1. Use the toggle to the right of the channel name to subscribe to it.

## Related articles

* Introduction to topics
* Create channels
* Channel permissions
* View channel information
* Mute or unmute a channel
* Unsubscribe from a channel
* Configure unread message counters

## When to start a new topic

## How to start a new topic

the product lets you start a new conversation in any channel, no matter where you are.

## What about threads?

Topics in the product fill the role of threads in other chat apps. This
section will help you understand how concepts you might be familiar
with from other applications show up in the product.

### Where are the threads?

In other team chat applications, you might be used to seeing threads
in a small panel on the side of the app. In busy organizations, that
cramped panel is where you may read most of the substantive
discussions.

In the product, you won't see a threads sidebar, because threads appear in the main
message view instead. Threads help keep conversations organized, so the product puts
them front and center.

### How do I find threads?

In other apps, threads generally start from a message in the main channel feed.
That message becomes the key to finding a thread (which can often be tricky to
do).

In the product, there's nothing special about the first message in a thread. Instead,
each thread is labeled with a topic. This makes threads in the product easy to find.
You can:

* See recent threads in each channel you're subscribed to in the left
  sidebar.
* See a list of threads where you have unread messages in your
  inbox.
* Get an overview of all threads with recent messages in recent
  conversations.

### How do I reply?

## Further reading

* Getting started with the product
* Introduction to channels
* Finding a conversation to read
* Reading conversations
* Replying to messages

A **user** is an individual's account within the product
organization. Administrators can
configure how accounts are created in their
organization, and how users will log
in.

the product lets users and organization administrators configure the following
details. This information is summarized in a user's card,
and presented in detail in their profile.

* Profile picture
* Name
* Role in the organization
* Status and availability, and whether
  the account has been deactivated
* Current local time
* Email address, with configurable permissions to view it
* Custom profile fields

Users can also be members of groups, and subscribe to
channels.

## Related articles

* User list
* Status and availability
* User cards
* View someone's profile
* Manage a user
* Bots overview

You can invite users to join your organization by sending out email invitations,
or creating reusable invitation links to share.

Prior to inviting users to your organization, it is recommended that administrators:

* Configure default settings for
  new users.
* Configure a custom welcome message
  for new users.
* Configure the organization language for automated messages and invitation
  emails for your organization.

When you invite users, you can:

* Set the role that they will have when
  they join.
* Configure which channels they will be
  subscribed to. The organization's default
  channels will be preselected.
* Configure which groups they will be added to.
* Customize
  the welcome message.

Organization administrators can
configure who
is allowed to invite users to the organization. You will only see an **Invite
users** menu option if you have permission to invite users.

## Send email invitations

  1. Enter a list of email addresses.
  1. Toggle **Send me a direct message when my invitation is accepted**,
     to receive a notification when an invitation is accepted.
  1. Select when the invitations will expire.
  1. Select what role the users will join as.
  1. Configure which channels they will be subscribed
     to.
  1. Configure which groups they will be added to.
  1. *(optional; administrators only)* Customize the welcome
     message.
  1. Click **Invite**.

  **Note**: As an anti-spam measure, the number of email invitations
  you can send in a day is limited on the product Cloud Free plan. If
  you hit the limit and need to invite more users, consider creating an
  invitation link and sharing it
  with your users directly, or contact support
  to ask for a higher limit.

  **Warning**: When an account is created by accepting an email
  invitation, the user is immediately logged in to their new account.
  Any restrictions on allowed authentication
  methods are not applied.

## Example email invitation

## Create a reusable invitation link

  1. Select **Invitation link**.
  1. Select when the invitation will expire.
  1. Select what role the users will join as.
  1. Configure which channels they will be subscribed
     to.
  1. Configure which groups they will be added to.
  1. *(optional; administrators only)* Customize the welcome
     message.
  1. Click **Create link**.
  1. Copy the link, and send it to anyone you'd like to invite.

## Manage pending invitations

Organization owners can revoke or resend any invitation or reusable
invitation link. Organization administrators can do the same except
for invitations for the organization owners role.

### Revoke an invitation

  1. Select the **Invitations** tab.
  1. Find the invitation you want to revoke.
  1. Click the **revoke** () icon next to the invitation.

### Resend an invitation

  1. Select the **Invitations** tab.
  1. Find the invitation you want to resend.
  1. Click the **resend** () icon next to the invitation.

  **Note:** You can **revoke** both email invitations and invitation links,
  but you can **resend** only email invitations.

## Related articles

* Restrict account creation
* Set default channels for new users
* Configure default new user settings
* Configure a custom welcome message
* Configure organization language for automated messages and invitation emails
* User roles
* User groups
* Joining the product organization

User groups offer a flexible way to manage permissions.

  Learn about channel types and permissions,
  including **public** and **private** channels.

## Manage organization permissions

  1. Review organization permissions, and modify as needed.

## Related articles

* Change a user's role
* User groups
* Channel permissions
* Inviting new users
* the product Cloud billing
* Guest users

the product offers a comprehensive toolkit for moderating communities.

## Prevention

the product has many features designed to simplify moderation by preventing
problematic behavior.

### Manage new users

* Decide whether to allow anyone to create an
  account,
  or require invitations to join.
* Link to a code of conduct in your organization
  description (displayed on the
  registration page) and custom welcome
  message.
* Disallow disposable email
  addresses
  or limit authentication
  methods to increase the
  effort for a bad actor to replace a banned account.
* Add a waiting period before
  new users can take disruptive actions.
* Monitor new users by enabling new user
  announcements.

### Restrict permissions for making changes

* Restrict who can create channels, or
  monitor new channels by enabling new channel
  announcements.
* Restrict who can add custom emoji.
* Restrict who can move messages to another
  channel,
  and set a time
  limit for
  editing topics.
* Restrict who can
  edit
  and
  delete
  messages, and set time limits on message editing and deletion.
* If you are concerned about impersonation, you can prevent users from changing
  their name, or
  require unique
  names.

### Minimize spam

* Configure email visibility
  to prevent off-platform spam.
* Restrict wildcard mentions
  so only moderators can mention everyone in your organization.
* Create a default channel
  for announcements where only admins can
  post.
* Configure who can authorize and start direct
  message conversations.

## Monitoring

* Enable moderation requests to make it easy
  to report problematic messages to community
  moderators.
* Configure alert words to
  get notified when a problematic word or phrase is included in a message.

## Response

The following features are an important part of an organization's
playbook when responding to abuse or spam that is not prevented by the
organization's policy choices.

* Individual users can mute abusive users to stop
  harassment that moderators have not yet addressed, or collapse
  individual messages that they don't want
  to see.
* Ban (deactivate) users
  acting in bad faith. They will not be able to rejoin using the same
  email address, unless their account is reactivated by an
  administrator. You can choose whether to delete the user's name,
  profile picture, and messages they've sent (e.g., their DMs or
  channel messages).
* Investigate behavior by viewing messages sent by a
  user.
* Delete messages,
  archive channels, and
  unsubscribe users from channels.
* Move topics, including between channels, when
  users start conversations in the wrong place.
* Change users' names (e.g., to "Name (Spammer)")
  for users who sent spam direct messages to many community members.
* Deactivate bots or
  deactivate custom emoji.

## Public access option

## the product communities directory

For details on how to get your community listed, see Communities
directory.

## Related articles

* Moving to the product
* Moving from Discord
* Public access option
* Communities directory

This feature mutes a user from your personal perspective, and does not
  automatically notify anyone. To notify moderators about problematic behavior,
  report a message.
