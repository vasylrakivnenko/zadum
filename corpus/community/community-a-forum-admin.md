# About the product

the product is a delightfully simple discussion platform for your website. It's fast, free, and easy to use, with all the features you need to run a successful community. It's also extremely extensible, allowing for ultimate customizability.

## Goals

the product is the combined successor of esoTalk and FluxBB. It is designed to be:

* **Fast and simple.** No clutter, no bloat, no complex dependencies. the product is built with PHP so it’s quick and easy to deploy. The interface is powered by Mithril, a performant JavaScript framework with a tiny footprint.

* **Beautiful and responsive.** This is forum software for humans. the product is carefully designed to be consistent and intuitive across platforms, out-of-the-box.

* **Powerful and extensible.** Customize, extend, and integrate the product to suit your community. the product’s architecture is amazingly flexible, with a powerful Extension API.

* **Free and open.** the product is released under the MIT license.

You can read more about our philosophy and values for the product here.

## Help the product Project

the product is free, open source software, maintained and governed by volunteers. We rely on community contributions to help us improve and expand the product.

🧑‍💻 If you're a developer, consider contributing to the product's core or bundled extensions. This is **the** most efficient way to help the product, and your work can have a lot of impact: there are thousands of the product sites out there, with millions of total end users.

🧩 If there's a feature you're missing, or a theme idea you have, writing a custom extension will make the product that much better for you and others.

✒️ If you're experienced in technical writing, your contributions to our documentation could help future users, admins, and developers make the most of the product.

🌐 If you speak multiple languages, you could contribute translations to could help make the product accessible to countless users around the world.

💸 the product Foundation doesn't make money off of the product, but does have bills to pay. Donations via GitHub Sponsors or OpenCollective are always gratefully received. In the past, we've also been able to support some of our core developers financially, so they could work on the product part time. This wouldn't be possible without your financial support.

🧑‍🤝‍🧑 Join our community to talk about the product development, get help with your instance, or just meet cool people! If you're experienced with the product, you can also help out beginners!

🐛 If there's a bug that's bothering you, or a feature idea on your mind, we can't know about it unless you tell us! We track bugs, suggestions, and future development plans via GitHub issues. If there's already an issue open, adding likes and (constructive) additional information can be very helpful!

📣 And if you like the product, please consider blogging/tweeting/talking about it! More people aware of the product leads to more people engaging with the product, and therefore more activity, better extensions, and faster development.

the product wouldn't be possible without our phenomenal community. If you're interested in contributing, see our developer contribution and other contribution docs for more information.

# Admin Dashboard

the product Admin Dashboard is a user-friendly interface for managing your forum.
It is only available to users in the "Admin" group.
To access the Admin dashboard, Click on your **Name** at the at the top right of the screen, and select **Administration**.

The Admin Dashboard has the following sections, being:
- **Dashboard** - Shows the main Admin Dashboard, containing statistics and other relevant information.
- **Basics** - Shows the options to set basic forum details such as Name, Description, and Welcome Banner.
- **Email** - Allows you to configure your E-Mail settings. Refer here for more information.
- **Permissions** - Shows the permissions for each user group, and allows you to configure global and specific scopes.
- **Appearance** - Allows you to customize the forum's colors, branding and add additional CSS for customization.
- **Users** - Provides you with a paginated list of all the users in the forum, and grants you the ability to edit the user or take administrative actions.
- **Advanced** - Allows you to configure advanced settings such as Maintenance Mode, Search drivers, Queue driver, and more.

Apart from the above-mentioned sections, the Admin Dashboard also allows you to manage your Extensions (including the product core extensions such as Tags) under the _Features_ section. Extensions which modify the forum theme, or allow you to use multiple languages are categorized under the _Themes_ and _Languages_ section respectively.

# Configuration File

There is only one place where the product configuration cannot be modified through the product admin dashboard (excluding the database), and that is the `config.php` file located in the root of your the product installation.

This file, though small, contains details that are crucial for your the product installation to work.

If the file exists, it tells the product that it has already been installed.
It also provides the product with database info and more.

Here's a quick overview of what everything means with an example file:

### Configuration via environment variables

Whilst the file based method described here is suitable for most the product installations, scaled the product instances or those deployed via CI/CD will probably benefit from being configured via the environment. Here's an example of how to do this:

This provides the product with the static configuration file it expects, but pulls variables from the environment at runtime.

### Queues

the product ships with support for two queue drivers - `sync` and `database`. Many tasks, or 'jobs' can be offloaded to a separate process in order to improve response times and provide a better user experience.

The only configuration key read from `config.php` is `driver`. Omitting the `queue` block entirely is equivalent to setting `driver` to `sync`.

* `sync` - default behaviour; jobs run immediately inline during the request
* `database` - stores jobs in a dedicated `queue_jobs` database table, which are then processed via the scheduler in a separate process. It is strongly advised that the scheduler is configured to run _every minute_

When the `database` driver is active, additional tuning options (retries, memory limit, timeout, etc.) become available in the admin panel under **Admin > Advanced Settings**.

##### Other queue drivers

Extensions such as FoF Redis provide additional queue drivers. These do not require any `queue` entry in `config.php` — they are configured through their own extension settings.

### Announcements widget

the product displays an announcements widget on the admin dashboard, showing the latest news from the official the product community. This is enabled by default and refreshes weekly in the background.

To disable it, add the following to your `config.php`:

When disabled, the widget is hidden from the dashboard, no outbound requests are made to discuss.the product.org, and the scheduled refresh task is not registered.

### Maintenance modes

the product has a maintenance mode that can be enabled by setting the `offline` key in the `config.php` file to one of the following values:
* `none` - No maintenance mode.
* `high` - No one can access the forum, not even admins.
* `low` - Only admins can access the forum.
* `safe` - Only admins can access the forum, and no extensions are booted.

This can also be configured from the admin panel's advanced settings page:

### FontAwesome

By default the product uses the bundled FontAwesome Free v7 icons. These can be switched out to use either a CDN hosted icon bundle, or a custom kit. See the FontAwesome page for full details on each source.

# Extensions

the product is minimalistic, but it's also highly extensible. In fact, most of the features that ship with the product are actually extensions!

This approach makes the product extremely customizable: You can disable any features you don't need, and install other extensions to make your forum perfect for your community.

For more information on the product's philosophy on what features we include in core, or if you're looking to make your own extension, please see our extension documentation.
This article will focus on managing extensions from a forum admin's perspective.

## Extension Manager

The extension manager is an extension that comes bundled with the product when installed via an archive. It provides a graphical interface for installing and updating both extensions and the product itself.

If you do not have the extension manager installed and you wish to install it, you can do so by running the following command in your the product directory:

The extension manager allows an admin user to install any composer package. Only install the extension manager if you trust all of your forum admins with such permissions.

## Finding Extensions

the product has a wide ecosystem of extensions, most of which are open source and free. The extension manager provides a discovery feature allowing you to search through the available extensions. The extension manager connects to the product.org/extensions. Alternatively, you can visit the Extensions tag on the product's community forums.

## Installing Extensions

### Through the interface

Using the extension manager extension, you can install extensions directly from the admin dashboard. Once you have browsed the list of available extensions from the links above, and found one you want to install, you can install it by entering the extension's composer package name into the extension manager's installation input.

### Through the command line

Just like the product, extensions are installed through Composer, using SSH. To install a typical extension:

1. `cd` to your the product directory. This directory should contain `composer.json`, `the product` files and a `storage` directory (among others). You can check directory contents via `ls -la`.
2. Run `composer require COMPOSER_PACKAGE_NAME:*`. This should be provided by the extension's documentation.

## Updating Extensions

### Through the interface

Using the extension manager extension, you can update extensions directly from the admin dashboard. You can run a check for updates by clicking the "Check for updates" button in the extension manager. If there are updates available, you can update all extensions by clicking the "Global update" button. Or, you can update individual extensions by clicking the "Update" button next to the extension you want to update.

### Through the command line

Follow the instructions provided by extension developers. If you're using `*` as the version string for extensions (as is recommended), running the commands listed in the product upgrade guide should update all your extensions.

## Uninstalling Extensions

### Through the interface

Using the extension manager extension, you can uninstall extensions directly from the admin dashboard. You can uninstall an extension by clicking the "Uninstall" button next to the extension you want to uninstall inside the extension's page.

### Through the command line

Similarly to installation, to remove an extension:

0. If you want to remove all database tables created by the extension, click the "Purge" button in the admin dashboard. See below for more information.
1. `cd` to your the product directory.
2. Run `composer remove COMPOSER_PACKAGE_NAME`. This should be provided by the extension's documentation.

## Managing Extensions

Each individual extension page of the admin dashboard provides a convenient way to manage the extension. You can:

- Enable or disable the extension.
- See the settings provided by the extension, and change them.
- Revert an extension's migrations to remove any database modifications it made (this can be done with the Purge button). This will remove ALL data associated with the extension, and is irreversible. It should only be done when you're removing an extension, and don't plan to install it again. It is also entirely optional.
- See the extension's README, if it has one.
- See the extension's version.
- Uninstall the extension if the extension manager is installed.

## Configuring additional extension repository sources

The extension manager uses `composer` under the hood, and as such, it looks for extension packages in the same places as `composer`. By default, this is Packagist. However, you can configure additional sources for the extension manager to look for extensions in. This is useful if you want to install an extension that is not available on Packagist.

In the admin page of the extension manager, clicking the **Add Repository** button will open a modal where you can enter the name and URL of the repository you want to add. The name is just a label for the repository, and can be anything you want. The URL should be the URL of the repository which depends on the type of repository you want to add.

### Adding a repository from a VCS

If you want to add a repository from a VCS (e.g. GitHub, GitLab, BitBucket, etc), the URL should be the URL of the repository's VCS. For example, if you had a private GitHub repository at ` you would enter that URL into the URL field. If it is a private source, you will need to enter an authentication method through the **New authentication method** button. The token can be generated from your VCS provider's website, and the host should be the domain of the VCS provider (e.g. `github.com`).

### Adding a composer repository

Extiverse provides access to premium extensions. It is a good example of a composer repository. You would specify the URL as ` and the name as `premium`. You would also need to enter an authentication method through the **New authentication method** button. The token can be generated from your the product account's subscriptions page with the Instructions button.

* Type: `HTTP Bearer`
* Host: `the product.org`

The configured repositories and auth methods will be active for both the command line and the admin dashboard. If you configure them from the command line however, you must not include the flag `--global`.

## Installing Non-stable extensions

If for whatever reason you want to install a non-stable extension (e.g. a beta, alpha or RC version) you must first update the **Minimum stability** setting to the wanted stability.

* If you set it to Alpha, you will be able to install alpha, beta, RC (Release Candidate) and stable versions.
* If you set it to Beta, you will be able to install beta, RC and stable versions.
* If you set it to RC, you will be able to install RC and stable versions.
* If you set it to Stable, you will only be able to install stable versions.

# FAQ

### Is the product Stable?

Yes! After 6 years of development, the product **1.0.0** was released, and we are now spearheading the development of the product **2.0**.

### What's next after stable?

We're still working on a formal roadmap. We have a lot of plans and ideas, and look forward to sharing a more thorough milestone with the community.

### Can I donate money to speed up development?

All donations are gratefully received. You can give on GitHub Sponsors or OpenCollective.

However, donations will not directly impact the speed of development on the product. We also encourage users to contribute in other ways, such as contributing code, building extensions, writing documentation, translating the product into other languages, providing help and support on the community forums... and just being a general positive energy around the community!

### Will the product have [insert feature here]? When? Why not?

We would love to build countless features and extensions for the product, but first things first: Our focus is on the essentials and stability.

### Why haven’t you fixed [insert issue here] yet?

Here again, the answer is “first things first”. If we haven’t fixed an issue (or assigned it a milestone) yet, it’s because we’re working on something else that’s just as important. Please be patient; we’ll try to get it done before release. Or if you’re in a hurry, feel free to fix it yourself and contribute to the project!

### Will I be able to migrate my forum to the product?

We don't currently provide official migrators. But we do recommend and support Nitro Porter as a generic import/export tool between community software. Currently it supports Vanilla, vBulletin, SMF, phpBB, PunBB, MyBB, NodeBB, FluxBB, XenForo, bbPress, Drupal and IPBoard.

### How do I join the product team?

> "Through an arcane and arduous ordeal, involving mystic rituals, life threatening peril, and adventures to far off lands where many go and few return." ~ jordanjay29

The real answer is that we generally keep an eye on our community for stand-out members who would make good staff. Honestly, for most of our current staff, what they did before becoming staff wasn't much different from what they do now.

Find a passion and contribute however you feel is best. Then let it take its course. You don't have to have a badge to be respected here.

# Theming

While we've worked hard to make the product as beautiful as we can, each community will probably want to make some tweaks/modifications to fit their desired style.

## Admin Dashboard

The admin dashboard's Appearance page is a great first place to start customizing your forum. Here, you can:

- Select theme colors
- Toggle dark mode and a colored header
- Upload a logo and favicon (icon shown in browser tabs)
- Add HTML for custom headers and footers
- Add custom LESS/CSS to change how elements are displayed

## FontAwesome

the product uses FontAwesome 7 for icons throughout the interface. By default the Free icon set is bundled and served locally, but this can be switched to a CDN or a FontAwesome Kit (which unlocks Pro icons and custom icons) via the advanced settings in the admin dashboard, or directly in config.php.

See the FontAwesome page for full details on configuration options and available icon styles.

## CSS Theming

CSS is a style sheet language that tells browsers how to display elements of a webpage.
It allows us to modify everything from colors to fonts to element size and positioning to animations.
Adding custom CSS can be a great way to modify your the product installation to match a theme.

A CSS tutorial is beyond the scope of this documentation, but there are plenty of great online resources to learn the basics of CSS.

the product actually uses LESS, which makes it easier to write CSS by allowing for variables, conditionals, and functions.

## Extensions

the product's flexible extension system allows you to add, remove, or modify practically any part of the product.
If you want to make substantial theming modifications beyond changing colors/sizes/styles, a custom extension is definitely the way to go.
To learn how to make an extension, check out our extension documentation!

# Email Configuration

Any community needs to send emails to allow for email verification, password resets, notifications, and other communication to users. Configuring your forum to send emails should be one of your first steps as an admin: an incorrect configuration will cause errors when users try to register.

## Available Drivers

the product provides several drivers by default, they are listed and explained below. Developers can also add custom mail drivers through extensions.

### SMTP

This is probably the most commonly used email driver, allowing you to configure a host, port/encryption, username, and password for an external SMTP service. Please note that the encryption field expects either `ssl` or `tls`.

### Mail
