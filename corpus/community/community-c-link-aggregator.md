# Introduction

the product is a selfhosted, federated social link aggregation and discussion forum. It consists of many different communities which are focused on different topics. Users can post text, links or images and discuss it with others. Voting helps to bring the most interesting items to the top. There are strong moderation tools to keep out spam and trolls. All this is completely free and open, not controlled by any company. This means that there is no advertising, tracking, or secret algorithms.

Federation is a form of decentralization. Instead of a single central service that everyone uses, there are multiple services that any number of people can use.

A the product website can operate alone. Just like a traditional website, people sign up on it, post messages, upload pictures and talk to each other. Unlike a traditional website, the product instances can interoperate, letting their users communicate with each other; just like you can send an email from your Gmail account to someone from Outlook, Fastmail, Proton Mail, or any other email provider, as long as you know their email address, you can mention or message anyone on any website using their address.

the product uses a standardized, open protocol to implement federation which is called ActivityPub. Any software that likewise implements federation via ActivityPub can seamlessly communicate with the product, just like the product instances communicate with one another.

The fediverse ("federated universe") is the name for all instances that can communicate with each other over ActivityPub and the World Wide Web. That includes all the product servers, but also other implementations:

- Mastodon (microblogging)
- PeerTube (videos)
- Friendica (multi-purpose)
- and many more!

In practical terms: Imagine if you could follow a Facebook group from your Reddit account and comment on its posts without leaving your account. If Facebook and Reddit were federated services that used the same protocol, that would be possible. With the product account, you can communicate with any other compatible instance, even if it is not running on the product. All that is necessary is that the software support the same subset of the ActivityPub protocol.

Unlike proprietary services, anyone has the complete freedom to run, examine, inspect, copy, modify, distribute, and reuse the product source code. Just like how users of the product can choose their service provider, you as an individual are free to contribute features to the product or publish a modified version of the product that includes different features. These modified versions, also known as software forks, are required to also uphold the same freedoms as the original the product project. Because the product is libre software that respects your freedom, personalizations are not only allowed but encouraged.

You can contribute to this documentation in the git repository.

This page is adapted from Mastodon documentation under CC BY-SA 4.0.

# Getting Started

## Choosing an Instance

If you are used to sites like Reddit, then the product works in a fundamentally different way. Instead of a single website like reddit.com, there are many different websites (called _instances_). These are operated by different people, have different topics and rules. Nevertheless, posts created in one instance can directly be seen by users who are registered on another. Its basically like email, but for social media.

This means before using the product and registering an account, you need to pick an instance. For this you can browse the instance list and look for one that matches your topics of interest. You can also see if the rules match your expectations, and how many users there are. It is better to avoid very big or very small instances. But don't worry too much about this choice, you can always create another account on a different instance later.

**Instance List**

## Registration

Once you choose an instance, it's time to create your account. To do this, click _sign up_ in the top right of the page, or click the top right button on mobile to open a menu with _sign up_ link.

On the signup page you need to enter a few things:

- **Username**: How do you want to be called? This name can not be changed and is unique within an instance. Later you can also set a _displayname_ which can be freely changed. If your desired username is taken, consider choosing a different instance where it is still available.
- **Email**: Your email address. This is used for password resets and notifications (if enabled). Providing an email address is usually optional, but admins may choose to make it mandatory. In this case you will have to wait for a confirmation mail and click the link after completing this form.
- **Password**: The password for logging in to your account. Make sure to choose a long and unique password which isn't used on any other website.
- **Verify password**: Repeat the same password from above to ensure that it was entered correctly.

There are also a few optional fields, which you may need to fill in depending on the instance configuration:

- **Question/Answer**: Instance admins can set an arbitrary question which needs to be answered in order to create an account. This is often used to prevent spam bots from signing up. After submitting the form, you will need to wait for some time until the answer is approved manually before you can login.
- **Code**: A captcha which is easy to solve for humans but hard for bots. Enter the letters and numbers that you see in the text box, ignoring uppercase or lowercase. Click the refresh button if you are unable to read a character. The _play_ button plays an audio version of the captcha.
- **Show NSFW content**: Here you can choose if content that is "not safe for work" (or adult-only) should be shown.

When you are done, press the _sign up_ button.

It depends on the instance configuration when you can login and start using the account. In case the email is mandatory, you need to wait for the confirmation email and click the link first. In case "Question/Answer" is present, you need to wait for an admin to manually review and approve your registration. If you have problems with the registration, try to get in contact with the admin for support. You can also choose a different instance to sign up if your primary choice does not work.

## Following Communities

After logging in to your new account, its time to follow communities that you are interested in. For this you can click on the _communities_ link at the top of the page (on mobile, you need to click the menu icon on the top right first). You will see a list of communities which can be filtered by subscribed, local or all. Local communities are those which are hosted on the same site where you are signed in, while _all_ also contains federated communities from other instances. In any case you can directly subscribe to communities with the right-hand subscribe link. Or click on the community name to browse the community first, see what its posted and what the rules are before subscribing.

Another way to find communities to subscribe to is by going to the front page and browsing the posts. If there is something that interests you, click on the post title to see more details and comments. Here you can subscribe to the community in the right-hand sidebar, or by clicking the "sidebar" button on mobile.

These previous ways will only show communities that are already known to the instance. Especially if you joined a small or inactive the product instance, there will be few communities to discover. You can find more communities by browsing different the product instances, or using the product Explorer. When you found a community that you want to follow, enter its URL (e.g. ` or the identifier (e.g. `!main@feddit.org`) into the search field of your own the product instance. the product will then fetch the community from its original instance, and allow you to interact with it. The same method also works to fetch users, posts or comments from other instances.

## Setting up Your Profile

Before you start posting, its a good idea to provide some details about yourself. Open the top-right menu and go to "settings". Here the following settings are available for your public profile:

- **Displayname**: An alternative username which can be changed at any time
- **Bio**: Long description of yourself, can be formatted with Markdown
- **Matrix User**: Your username on the decentralized Matrix chat
- **Avatar**: Profile picture that is shown next to all your posts
- **Banner**: A header image for your profile page

On this page you can also change the email and password. Additionally there are many other settings available, which allow customizing of your browsing experience:

- **Blocks** (tab at top of the page): Here you can block users and communities, so that their posts will be hidden.
- **Interface language**: Which language the user interface should use.
- **Languages**: Select the languages that you speak to see only content in these languages. This is a new feature and many posts don't specify a language yet, so be sure to select "Undetermined" to see them.
- **Theme**: You can choose between different color themes for the user interface. Instance admins can add more themes.
- **Type**: Which timeline you want to see by default on the front page; only posts from communities that you subscribe to, posts in local communities, or all posts including federated.
- **Sort type**: How posts and comments should be sorted by default. See Votes and Ranking for details.
- **Show NSFW content**: Whether or not you want to see content that is "not safe for work" (or adult-only).
- **Show Scores**: Whether the number of upvotes and downvotes should be visible.
- **Show Avatars**: Whether profile pictures of other users should be shown.
- **Bot Account**: Enable this if you are using a script or program to create posts automatically
- **Show Bot Accounts**: Disable this to hide posts that were created by bot accounts.
- **Show Read Posts**: If this is disabled, posts that you already viewed are not shown in listings anymore. Useful if you want to find new content easily, but makes it difficult to follow ongoing discussion under existing posts.
- **Show Notifications for New Posts**: Enable this to receive a popup notification for each new post that is created.
- **Send notifications to Email**: Enable to receive notifications about new comment replies and private messages to your email address.

## Start Posting

Finally its time to start posting! To do this it is always a good idea to read the community rules in the sidebar (below the _Subscribe_ button). When you are ready, go to a post and type your comment in the box directly below for a top-level reply. You can also write a nested reply to an existing comment, by clicking the left-pointing arrow.

Other than commenting on existing posts, you can also create new posts. To do this, click the button _Create a post_ in the sidebar. Here you can optionally supply an external link or upload an image. The title field is mandatory and should describe what you are posting. The body is again optional, and gives space for long texts. You can also embed additional images here. The _Community_ dropdown below allows choosing a different community to post in. With _NSFW_, posts can be marked as "not safe for work". Finally you can specify the language that the post is written in, and then click on _Create_.

One more possibility is to write private messages to individual users. To do this, simply visit a user profile and click _Send message_. You will be notified about new private messages and comment replies with the bell icon in the top right.

# Media

## Text

The main type of content in the product is text which can be formatted with Markdown. Refer to the table below for supported formatting rules. the product user interface also provides buttons for formatting, so it's not necessary to remember all of it. You can also follow the interactive CommonMark tutorial to get started.

  Type                                                                                       Or                                                                               … to Get

  \*Italic\*                                                                                 \_Italic\_                                                                       _Italic_
  \*\*Bold\*\*                                                                               \_\_Bold\_\_                                                                     **Bold**
  \# Heading 1                                                                               Heading 1  =========                                                         Heading 1
  \## Heading 2                                                                              Heading 2 ---------                                                          Heading 2
  \Link\                                                                     \[Link\]\[1\]⋮ \[1\]:                                        Link
  !\Image\                                                               !\[Image\]\[1\]⋮ \[1\]:
  Example\^\[Footnote\]                                                                                                                                                       Example[1]⋮Footnote ↩︎
  \> Blockquote                                                                                                                                                               Blockquote
  \* List \* List \* List                                                            \- List \- List \- List                                              ListListList
  1\. One 2\. Two 3\. Three                                                          1) One2) Two3) Three                                                     OneTwoThree
  Horizontal Rule \---                                                                   Horizontal Rule\*\*\*                                                        Horizontal Rule
  \`Inline code\` with backticks                                                                                                                                              `Inline code` with backticks
  \`\`\`\# code block print '3 backticks or'print 'indent 4 spaces' \`\`\`   ····\# code block····print '3 backticks or'····print 'indent 4 spaces'   # code blockprint '3 backticks or'print 'indent 4 spaces'
  ::: spoiler hidden or nsfw stuff_a bunch of spoilers here_:::                                                                                                        hidden or nsfw stuff a bunch of spoilers here
  Some \~subscript\~ text                                                                                                                                                     Some subscript text
  Some \^superscript\^ text                                                                                                                                                   Some superscript text
  \~\~Strikethrough\~\~                                                                                                                                                       Some ~~removed~~ text
  \{Ruby\ text\}                                                                                                                                                              Rubytext

CommonMark Tutorial

## Images and Video

the product also allows sharing of images and videos. To upload an image, go to the _Create post_ page and click the little image icon under the _URL_ field. This allows you to select a local image. If you made a mistake, a popup message allows you to delete the image. The same image button also allows uploading of videos in .gif format. Instead of uploading a local file, you can also simply paste the URL of an image or video from another website.

Note that this functionality is not meant to share large images or videos, because that would require too many server resources. Instead, upload them on another platform like PeerTube or Pixelfed, and share the link on the product.

## Torrents

Since the product doesn't host large videos or other media, users can share files using BitTorrent links. In BitTorrent, files are shared not by a single user, but by _many users_ at the same time. This makes file sharing efficient, fast, and reliable, as long as several sources are sharing the files.

the product supports posting torrent magnet links (links that start with `magnet:`) in the post _URL_ field, or as Markdown links within comments. You can get a magnet link by clicking _copy magnet link_ in your torrent app.

With this, the product can serve as an alternative to centralized media-centric services like YouTube and Spotify.

### How to Watch Torrents

#### Beginner

To easily stream videos and audio on the product, you can use any of the following apps. After clicking on a torrent link in the product, a dialog will pop up asking you to open the link in the app.

- Stremio (Desktop, Android)
- PikaTorrent
- WebTorrent Desktop (Desktop)
- Popcorn Time (Desktop)

#### Advanced

For those who would like to help share files, you can use any of the following torrent clients:

- qBittorrent (Desktop)
- Deluge (Desktop)
- Transmission (Desktop)
- LibreTorrent (Android)

Many of these support _streaming_ videos. To do this, make sure you check _sequential download_, wait for enough of the download to complete, then click to open the video file.

If you'd like, you can also set up a media server to view this content on any device. Some good options are:

- Jellyfin (Movies, TV, Music, Audiobooks)
- Navidrome (Music)
- audiobookshelf (Audiobooks)

# Votes and Ranking

## Posts

the product uses a voting system to sort post listings. On the left side of each post there are _up_ and _down_ arrows, which let you _upvote_ or _downvote_ it. You can upvote posts that you like so that more users will see them, or downvote posts so that they are less likely to be seen. Each post receives a score which is the number of upvotes minus the number of downvotes.

### Sorting Posts

When browsing the front page or a community, you can choose between the following sort types for posts:

  Sort               Description

  Active (default)   Calculates a rank based on the score and time of the latest comment, with decay over time
  Hot                Like active, but uses time when the post was published
  Scaled             Like hot, but gives a boost to less active communities
  Controversial      Shows most controversial posts (many up and downvotes)
  New                Shows most recent posts first
  Old                Shows oldest posts first
  Most Comments      Shows posts with highest number of comments first
  New Comments       Bumps posts to the top when they are created or receive a new reply, analogous to the sorting of traditional forums
  Top Day            Highest scoring posts during the last 24 hours
  Top Week           Highest scoring posts during the last 7 days
  Top Month          Highest scoring posts during the last 30 days
  Top Year           Highest scoring posts during the last 12 months
  Top All Time       Highest scoring posts of all time

## Comments

Comments are by default arranged in a hierarchy which shows at a glance who it is replying to. Top-level comments which reply directly to a post are on the very left, not indented at all. Comments that are responding to top-level comments are indented one level and each further level of indentation means that the comment is deeper in the conversation. With this layout, it is always easy to see the context for a given comment, by simply scrolling up to the next comment which is indented one level less.

### Sorting Comments
