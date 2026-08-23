## Generating invites {#invites}

Invite links can be generated and shared with other people, and some servers require invites in order to register for an account. When generating an invite link, you can set the max uses to limit how many times a certain link is used, or how long it has been active. Invite links can be deactivated at any time.

Go to **Preferences**   **Invite people** to generate invite links.

## Follows and followers {#relationships}

Within settings, you can find a relationship manager that lets you filter and sort through the profiles that you are connected to, based on different criteria:

* **Relationship:** whether a profile is following you, followed by you, or mutually following each other.
* **Account status:** whether a profile is currently marked as redirected or not.
* **Account activity:** whether a profile has posted in the past month or not.

You can select certain users to unfollow, or to remove from your followers, by checking the boxes and clicking the corresponding button in the table header.

## Account settings {#account}

From the account settings, you can change your email address, set a new password, revoke active sessions or authorized apps, and enable two-factor authentication.

## Featured links on your profile {#featured}

### Featured hashtags {#featured-tags}

You can choose to feature certain hashtags that you use often. Go to **Preferences**   **Edit profile**   **Featured hashtags** to manage which hashtags you are currently featuring. Once featured, a link to the hashtag will be shown on your profile, with the date of the last time it was used in a status, as well as the total number of statuses in which it was used.

## Pinned posts {#pinned}

You can choose to feature up to 5 of your own public posts at the top of your profile. Go to the status dropdown menu and click "Pin on profile". When you pin a post, it will appear at the top of your "posts" tab, before all other chronological status updates.

## Profile directory {#directory}

The profile directory shows all accounts that have opted into being shown in the directory, and can be used to quickly find profiles that you may be interested in following.

The profile directory can be sorted either by recent activity (the most recently published status), or by new arrivals (the most recently created accounts). The directory can also be filtered to show only local accounts, or to show all known accounts that your website is aware of.

Profiles appear as cards that include a user's display name, address, account bio, and some brief stats such as how many posts they've published, how many followers they have, and the time of their last published status.

## Filtering posts {#filters}

It is possible to filter statuses for specific keywords and phrases so that they can be hidden automatically.

To create or manage your filters, go to **Preferences**   **Filters**. The "Add new filter" button will let you create a new filter, and existing filters can be edited or deleted. Your existing filters will be summarized in a table.

### Keyword or phrase {#filter-phrase}

This is the string that will be matched. The keyword will be searched for in any status's content, including CW, media descriptions, and poll options.

### Expire after {#filter-expire}

Optionally only apply the filter for a limited amount of time. Expired filters are not automatically deleted, but can be reactivated by setting a new expiry date (or changing it back to "never" expire).

### Filter contexts {#filter-context}

Choose where the filter will be applied:

* Home timeline and lists = matching statuses will be removed from your home feed and lists
* Notifications = matching notifications will not be shown
* Public timelines = matching statuses will not appear in local/federated timelines
* Conversations = matching statuses will be hidden in threads and detailed views
* Profiles = matching statuses will be hidden in profile views

### Hide completely {#filter-hide}

Filtering is usually done client-side, so that disabling a filter will cause filtered statuses to be visible again. However, if you enable "Hide completely", any matching statuses will disappear completely and will never be delivered to your home or notifications.

### Whole word {#filter-whole}

Filters normally apply to any status that contains the included characters, regardless of whether they are in the middle of a word. Enabling "whole word" will only apply the filter if the keyword is surrounded by spaces or other non-alphanumeric characters.

## User-level actions {#blocking-and-muting}

### Hiding boosts {#hide-boosts}

If you hide boosts from someone, you won’t see their boosts in your home feed. This option only appears on users who you are currently following.

### Quote posts

If your post is quoted by another user in an unwanted way, you can remove your quoted post.

### Muting {#mute}

When muting, you have the option to mute notifications from them or not. Muting without muting notifications hides the user from your view:

* You won’t see the user in your home feed
* You won’t see other people boosting the user
* You won’t see other people mentioning the user
* You won’t see the user in public timelines

If you choose to also mute notifications from them, you will additionally not see notifications from that user.

Mutes can also have an optional duration, after which they will expire.

The user has no way of knowing they have been muted.

### Blocking {#block}

Blocking hides a user from your view:

* If you were following the user you unfollow them
* You won’t see the user in your home feed
* You won’t see other people boosting the user
* You won’t see other people mentioning the user
* You won’t see the user in public timelines
* You won’t see notifications from that user

Additionally, on the blocked user’s side:

* The user is forced to unfollow you
* The user cannot follow you
* The user won’t see other people’s boosts of you
* The user won’t see you in public timelines

If you and the blocked user are on the same server, the blocked user will not be able to view your posts on your profile while logged in.

### Hiding an entire server {#block-domain}

If you block an entire server:

* You will not see posts from that server on the public timelines
* You won’t see other people’s boosts of that server in your home feed
* You won’t see notifications from that server
* You will lose any followers that you might have had on that server

## Reporting problematic content to moderators {#report}

If you see a status or user that is violating the rules of your website, you can report that user to your site's moderators. Clicking the "report" option on the user dropdown or status dropdown will open the report modal. Here, you can (and should) add a note about why you are reporting this account. You can attach certain problematic statuses for additional context on why you are reporting the account, and if their conduct is violating the rules of the remote website, you can also choose to forward the report to their site's moderators.

## Summary

If your current server is going to shut down, has changed policies, is not being maintained, or for whatever other reason is no longer working for you, you can migrate your account to a new server and preserve much of your account content and relationships.

Follow these steps to migrate accounts:

1. Create a new the product account on another server. Try to choose one that you think will work for you long term, or make your own.
2. Set up the new account with your profile, bio, avatar and header, etc. This is not strictly necessary from a technical perspective, but it will help anyone who encounters it trust that it really is you. You may want to send out a post from the new account announcing the move as well.
3. From the old account, export a list of people you follow. If you are following people who require approval for followers, they will have to re-approve you.
4. From the new account, import that just-exported list of people you follow (and any other lists you exported).
5. Create an alias from the old to new account. From the new account, go to Preferences > Account and find “Moving from a different account”. Click “create an account alias”. Enter your old account handle and click “Create alias”.

   You haven't changed anything yet, you have only prepared. Pause at this point and see if you have anything in your old account you will need access to, such as notifications and DMs. Once you proceed to the next step you will no longer have access to your old account.

6. Redirect your old account to your new account. In your old account, go to Preferences > Account, find “Moving to a different account” and click “configure it here”. Enter your new account handle and your old account password (because this is on the old account server) and click "Move followers". If you see an error like “not an alias of this account”, make sure you have completed the "alias" step above. You may need to wait up to 24 hours and try again.

At this point your old account will no longer be accessible to you and your server will begin notifying the people who follow you of your new handle (they will be automatically switched to follow your new account). If you have enough followers, it may batch these requests up, so you may see new followers appear on your new account gradually as that happens.

## Exporting your information {#export}

At any time you want, you can go to Settings   Import and export   Export and download a CSV file for your current followed accounts, your currently created lists, your currently blocked accounts, your currently muted accounts, and your currently blocked domains. Your following, blocking, muting, and domain-blocking lists can be imported at Settings   Import and export   Import, where they can either be merged or overwritten.

Requesting an archive of your posts and media can be done once every 7 days, and can be downloaded in Activity Streams 2.0 JSON format. the product currently does not support importing posts or media due to technical limitations, but your archive can be viewed by any software that understands how to parse Activity Streams 2.0 documents.

## Redirecting or moving your profile {#migration}

From the bottom of Settings   Account, you can find options related to account redirection or migration.

### Profile redirect {#redirect}

Redirecting your account disables posting from that account and displays a "profile moved" notice indicating your new account. Anyone viewing your profile can see this notice and will know to follow you at your new account. Following redirected accounts is not possible. The redirect can be canceled at any time.

### Profile move {#move}

Moving your account is the same as redirecting your account, but it will also irreversibly force everyone to unfollow your current account and follow your new account, if their software supports the Move activity. Your posts will not be moved, due to technical limitations. There is also a 30-day cooldown period in which you cannot migrate again, so be very careful before using this option!

While moving your profile should automatically move your followers over, it does not automatically transfer your follows, blocks, mutes, or bookmarks. Those can be imported from previously exported CSV files.

### Account aliases {#aliases}

Profile moves can only be initiated when your two accounts have been aliased. Account aliases are currently not used for anything other than profile moves, where you will need to set your old account as an alias of your new account before initiating the move. Setting aliases is harmless and reversible on its own.

## Deleting your account {#delete}

From the bottom of Settings   Account, you can find the form to delete your account. Deleting your account is irreversible, and will cause both your profile and username to become forever unusable.

## Browsing Content in Live Feeds {#timelines}

To allow you to discover potentially interesting content, the product provides a way to browse all public posts. There is no global shared state between all servers, so there is no way to browse _all_ public posts. When you browse **Live Feeds > Other Servers**, you see public posts from across the fediverse. Your server shows posts it knows about through various methods. Most posts come from accounts that other users on your server follow.

You can also filter the Live Feeds to view only public posts created on your server.

## Interacting with Posts {#actions}

You can perform quick actions on a post directly from the timeline, or you can click on the post to load an expanded view that shows extra information, such as a full timestamp, interaction counts, and threaded replies, if any. The following actions can be performed on a post:

* **Reply** to a post by clicking the arrow icon. Your post will show up in the thread below the post you are replying to.
* **Boost** a post by clicking the cycled-arrow icon. The post will be reshared on your profile.
* **Quote** a post by choosing this option from the **Boost** button menu. Learn more about Quote posts.
* **Favourite** a post by clicking the star icon. The post will be added to your favourites list, and a favourite notification will be delivered to its author.
* **Bookmark** a post by clicking the ribbon icon. The post will be privately added to your bookmarks list without generating a notification.
* Access a **menu** of additional options by clicking the ellipsis icon.

### Fetching Replies {#fetching-replies}

When a status is expanded[^expanded], if enabled, your server will attempt to fetch any replies that it does not already know about from other servers. This process checks each server in the conversation thread to gather any missing replies, which may take some time, especially for posts with many replies or when viewing a post for the first time on your server. Try refreshing the page after a few moments if you suspect you aren't seeing all replies.[^retrigger]

Some replies won't be fetched. These include followers-only posts,private mentions, and posts from servers that require authorization. The only exception is if you or someone on your server already follows the author.

By searching for a post and then expanding it, you can effectively "import" a tree of replies to your instance, helping you and others on your server meet new people and other fediverse creatures!

## Notifications {#notifications}

When other people interact with you or your posts, you will receive a notification depending on the type of the event. Your notifications column allows you to view all notifications in the same stream, or to filter for specific types of notifications:

* **Mentions:** received when someone has mentioned you in a post.
* **Favourites:** received when someone has favourited one of your posts.
* **Boosts:** received when someone has boosted one of your posts.
* **Polls:** Received when a poll that you have voted in or created has ended.
* **Statuses:** Received when a user you have enabled notifications for posts a status.
* **Follows:** Received when someone has followed your profile.

When unread notifications are present, a checkmark will appear in the column header. Clicking this checkmark will mark notifications as read.

## Following Profiles {#follow}

When you see someone in your app's interface (e.g. the web interface on your home server, or your mobile app), you can simply click "follow." It works the same way whether they're on your server or another server.

If you come across someone’s public profile hosted on a different server and you're not in your own app's interface, there’s an obstacle: That server sees you as just another anonymous visitor. Not to worry! You can copy the URL of that profile, or of one of their posts, and then paste that URL into the search function.

If you are visiting a public page on another the product site, see Using the product outside of your site.

## Enabling Notifications {#bell}

If you are following someone, you also have the option to receive a notification every time they post. To opt into this functionality, click the bell icon.

## Search {#search}

the product's basic search allows logged-in users to find posts containing a specific hashtag, or to load a user or status directly if they know the URL or address. Searching for a term will show profiles whose username or display name contains that term, as well as hashtags that match or contain that term. Searching for a remote post or account's full URL will cause the server to fetch it if it is not already in the database so it can be viewed locally.

Admins may optionally install full-text search. the product’s full-text search allows logged-in users to find results from their own posts, their favourites, their bookmarks, and their mentions. Full-text search is limited for safety reasons. You can't search for any text across the entire database. This prevents people from searching for controversial terms to find and harass others.

The following operators are supported:

* **"exact phrases"** will try to find the term inside the quote marks. This allows looking only for direct matches, such as `"look at my cluckers"` to find posts explicitly telling you to look at someone's cluckers.
* **-exclude** will exclude the term prepended by a minus sign. This allows filtering out certain terms, such as `animals -cats` to find posts about animals without posts about cats.
* **+include** will include the term after the plus sign. This allows searching for multiple terms that must be included, such as `cat +dog` to find posts about both cats and dogs.

The following `prefix:value` pairs are also supported:

* `has:` (`media`, `poll`, `embed`) - posts that contain the specified attachment type
* `is:` (`reply`, `sensitive`) - posts that are either a reply or marked sensitive.
* `language:` (`{language_code}`) - posts made in a specific language, indicated by its ISO 639-1 language code
* `from:` (`@{username}`, `@{username}@{domain}`, `me`) - posts from a specified author
* `before:` (`{date}`) - posts created before an ISO8601 formatted date, e.g. "`2025-03-01`". If the account has a timezone set, searches using their local timezone - otherwise in UTC.
* `after:` (`{date}`) - posts created after an ISO8601 formatted date
* `during:` (`{date}`) - posts created during an ISO8601 formatted date
* `in:` (`library`, `public`) - `library` is the collection of posts that you have interacted with in some way: favourited, reblogged, bookmarked, etc. `public` is the global full text search index. The default is to search both, if this option is omitted.

Each can be used in combination with a text search, for example to find all posts from yourself about cryptids, you could search for `from:me "cryptids"`.

Prefixes can be combined, though they are combined with `AND`, so e.g. one can't search for all posts from multiple languages.

Prefixes can be negated with `-` as with string queries, so one can search for posts from anyone else about cryptids like `-from:me "cryptids"`.

## Private Mentions {#private}

In the product, private mentions are just posts that have the "mention only" visibility selected. Visibility can be selected per-post, which allows changing the privacy level later in a thread. The private mentions column currently shows a list of all conversations containing a mention only post. Clicking on a conversation will load the associated thread.

## List Timelines {#lists}

Lists are subsets of your home timeline. You can create a list, give it a name, and add users that you follow to that list.
