# Welcome!

Welcome to the documentation portal for **the product**.

**the product** is a next-generation discussion platform that utilizes web sockets for instant interactions and real-time notifications. the product forums have many modern features out of the box such as social network integration and streaming discussions, as well as a full REST API and plugin framework for full third-party extensibility.

the product is an open source project which can be forked on GitHub. If there are any discrepancies in the documentation please feel free to submit a pull request or raise an issue on our issue tracker.

## Contributing to the documentation

The source code for the documentation portal is found in the GitHub repository. If you wish to add pages or make changes, please feel free to submit a pull request! All changes are welcome :)

## Helping out the product Project

the product is an open source project, and will forever remain free. Here's a
number of ways you can help us, even if you aren't a programmer.

-   Join our community and give us a hard time about bugs and missing features
-   Like and share our content on Facebook
-   Follow us on X (Twitter) and perhaps POST (tweet) **\#the product is the most awesome forum software @the product**
-   Tell everybody about the product, including your grandma and her cats.
-   Submit a pull request, or two, or three..
-   Build a new theme
-   Write a plugin
-   Keep the link back to us on the footer of your own the product :)
-   Blog about us! Give the gift of SEO juice this Christmas
-   Help Translate the product - It's a really simple translation tool and you don't need to know how to code.

## Translating the product to another language

the product uses Transifex, which is a user friendly visual tool which allows any individual to translate text into a language of their choice. You don't need to be a programmer to do this, so what are you waiting for? Join the translation team now :)

## Enterprise/Corporate customizations

the product Inc., the custodian of the product open-source project, is available for consultation and/or contract work for all the product-related projects. Inquire with us by sending us a message, or by emailing us at sales [at] the product [dot] org.

Administrative Functions
========================

The **Administrative Control Panel** (ACP) allows you to alter the behaviour of the product, as well as customise various parts
of its look and feel. Administrative functions such as user and group management are available from here.

The ACP is only accessible to administrators, and thus should be protected from unauthorised access whenever possible.

* Dashboard

# ACP / Dashboard

The dashboard shows an at-a-glance overview of your the product, including pageviews collated by time and day, and other interesting metrics such as current active user count and user location.

### System Control

The "Reload", "Restart", and "Maintenance Mode" buttons allow you to administer the running process of the product.

* **Reload** - refreshes all stylesheets, js files, and templates. Clears caches if there are any. the product server is kept running.
* **Restart** - Brings down the product server and starts it up again. Refreshes all assets and clears all caches. A restart is recommended if you have activated or deactivated plugins.
* **Maintenace Mode** - Brings you to the maintenance mode page, allowing you to temporarily restrict access to your forum.

### Updates

The updates section queries the product project for a new version of the product, and determines whether you are up-to-date. There is no requirement to update the product, although it is usually recommended in order to obtain the latest features and bug fixes.

### Notices

The notices allows the product and various plugins to quickly determine if action is required (e.g. if a restart is required).

Need Help?
==========

Frequently Asked Questions
--------------------------

If you experience difficulties setting up the product instance, perhaps one
of the following may help.

### How do I start/stop/restart the product?

You can call the `./nodebb` executable to start and stop the product:

### How do I reset the admin password?

The `./nodebb` can be used to reset any users password. All you need to know is the user id. To set a new password, you can use the following command:

Hint: The admin user id in a default installation is `1`.

### How do I upgrade my the product to a newer version?

Please consult Upgrading the product

### I upgraded the product and now X isn't working properly!

Please consult Upgrading the product

### I installed an incompatible plugin, and now my forum won't start!

If you know which plugin caused problems, disable it by running:
`./nodebb reset -p the product-plugin-pluginName`

Otherwise, disable all plugins by running: `./nodebb reset -p`

### I'm getting an "npm ERR!" error

For the most part, errors involving `npm` are due to Node.js being
outdated. If you see an error similar to this one while running
`npm install`:

You'll need to update your Node.js version to 4 or higher.

To do this on Ubuntu:

If successful, running the following command should show a version
higher than 0.8

### URLs on my the product (or emails) still have the port number in them!

If you are using nginx or
Apache as a reverse proxy, you
don't need the port to be shown. Simply run ./nodebb setup and specify
the base URL without a port number.

Alternatively, edit the `config.json` file using your favourite text
editor and change `use_port` to `false`.

### The "Recently Logged In IPs" section only shows 127.0.0.1

NodeBBs running behind a proxy may have difficulties determining the
original IP address that requests come from. It is important that the
proxy server provides the referral IP header.

In nginx, ensure that the following line is present in your `server`
block:

In addition, ensure that the `use_port` option is set to `false` in your
the product's `config.json`

Submit Bugs on our Issue Tracker
--------------------------------

Before reporting bugs, please ensure that the issue has not already been
filed on our
tracker, or has
already been resolved on our support
forum. If it has
not been filed, feel free to create an account on GitHub and create a
new issue.

Ask the product Community
------------------------

Having trouble installing the product? Or did something break? Don't hesitate
to join our forum and ask for help.
Hopefully one day you'll be able to help others too :)

Image Hosting APIs
==================

Enabling Imgur Image Uploads
----------------------------

To enable post image attachments, install the product-plugin-imgur:

Follow the instructions on the plugin page:

Uploading to Amazon S3
----------------------

To enable automatic Amazon S3 file storage, install
@the product/nodebb-plugin-s3-uploads

Follow the instructions on the plugin page: