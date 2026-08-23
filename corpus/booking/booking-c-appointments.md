the product

    A powerful, self-hosted appointment scheduling platform built for flexibility.

  Why the product •
  Features •
  Quick Start •
  Installation •
  License

---

  Looking for advanced capabilities?
  Explore premium features and professional services at
  the product.org/premium.

---

## 🚀 Why the product

**the product** is an open-source scheduling system that gives you full control over your booking workflow.

It is designed to adapt to your business — whether you need simple appointment booking or more advanced scheduling logic.

**Key advantages:**

- Fully self-hosted — your data stays under your control
- Highly customizable and flexible
- Integrates with your existing website and database
- Free for both personal and commercial use

---

## ✨ Features

Built to support a wide range of scheduling needs:

- Appointment and customer management
- Service and provider organization
- Working plans and booking rules
- Google Calendar synchronization
- Email notification system
- Multi-language interface
- Self-hosted deployment
- Active open-source community

---

## ⚡ Quick Start (Development)

Clone and run the project locally using the provided Docker Compose environment:

`

Then open a second terminal and enter the application container:

Inside the container, install dependencies:

Start the development watcher:

Build production assets:

> Note: Works on Windows (WSL recommended), macOS, and Linux using Docker Compose.

---

## 🏗️ Installation (Production)

### Requirements

* Apache or Nginx
* PHP 8.2+
* MySQL database

### Steps

1. Create a database (or use an existing one)
2. Upload the `the product` folder to your server
3. Ensure the `storage` directory is writable
4. Rename `config-sample.php` to `config.php`
5. Update configuration values
6. Open the application in your browser and follow the setup wizard

Once completed, the system is ready to use.

---

## 📚 Resources

* Website:
* Issues:
* Support Group:
* Discord:

---

## 📜 License

* Code: GPL v3.0
* Content: CC BY 3.0

---

## 👤 Author

* Website:
* GitHub:
* Twitter:

---

## 🔥 More Projects

* Plainpad · Self-Hosted Note Taking
* Clientverse · CRM Application
* Timecrack · Time Tracking

# FAQ

## How do I check that my server has Apache, PHP, and MySQL installed?

the product needs three things on your server: **Apache** (the web server), **PHP** (the programming language), and **MySQL** (the database). You also need the PHP **curl** extension and the Apache **mod_rewrite** module enabled.

**Two ways to check:**

1. **Ask your hosting company** — they can confirm what's installed.
2. **Create a test file** — make a file called `phpinfo.php` in your website's root folder with this content:

   Then open ` in your browser. It will show everything installed on your server. **Delete this file when you're done** for security reasons.

## How do I create a Google Calendar API key?

See the Google Calendar Sync guide for detailed step-by-step instructions.

## The Installation Page Is Not Working

This usually happens for one of two reasons:

**1. Wrong config settings**

Open `config.php` and double-check:

- `BASE_URL` is set to your exact installation URL (e.g. `
- Your database name, username, and password are correct

**2. Server is blocking requests**

Some hosting providers need an `.htaccess` fix. Create or edit the `.htaccess` file in your installation folder and add:

If that doesn't work, check the **Apache error log** and the **browser console** (press F12 → Console tab) for error messages. Contact your hosting company with those details.

## The Booking Page Won't Show Any Available Hours

**If no hours appear at all:**

This is usually a server issue. Check the Apache error log and browser console (F12 → Console) for errors. Contact your hosting company with the details you find.

**If you see "There are no available appointment hours for the selected date":**

This often happens because the **default working plan includes breaks** that don't leave enough room for your service. For example, if your service lasts 3–4 hours but there are lunch breaks in between, no slot is long enough.

**Fix:** Go to **Users** → **Providers**, select the provider, and adjust their working plan. Remove or shorten breaks so there's enough continuous time for your services.

## Installing on a Subdomain Doesn't Show Available Hours

If the product is on a subdomain like ` make sure `BASE_URL` in `config.php` uses the **subdomain URL** — not the folder path.

**Correct:** `BASE_URL = '

**Wrong:** `BASE_URL = '

Using the wrong URL causes a browser security error that blocks the booking page from loading appointment hours.

## How Do I Change the Time Slot Interval?

By default, available appointment times are shown every **15 minutes** (e.g. 9:00, 9:15, 9:30…). You can change this from the backend service settings by editing the **Slot Interval (Minutes)** field.

## I'm Getting a Timezone Warning

If you see an error like `DateTime::__construct(): It is not safe to rely on the system's timezone settings...`, it means PHP doesn't have a timezone set.

**Fix:** Open your `php.ini` file and set the timezone:

Use your own timezone from the PHP timezone list.

If you can't edit `php.ini`, add this line to the top of `index.php`:

## How Do I Use Caddy Instead of Apache?

If you prefer Caddy as your web server:

1. Install Caddy
2. Install PHP-FPM: `sudo apt install php-fpm`
3. Set up the product in a folder (e.g. `/var/www/html/easyappointments`)
4. Add this to `/etc/caddy/Caddyfile`:

5. Restart Caddy: `sudo systemctl restart caddy.service`

*This document applies to the product v1.6.0.*

Back

# Google Calendar Sync

the product can sync appointments with Google Calendar in both directions. When a provider links their Google Calendar, any changes made in either system will be reflected in the other.

## What You Need

- A working the product installation with at least one service and provider set up.
- A Google account.

## Step 1: Create Google API Credentials

You need to tell Google that your the product installation is allowed to access calendar data.

1. Go to the Google Cloud Console and **create a new project** (or select an existing one).
2. In the project dashboard, go to **APIs & Services** > **Library** and search for **Google Calendar API**. Click on it and press **Enable**.
3. Go to **APIs & Services** > **Credentials** and click **Create Credentials** > **OAuth client ID**.
4. If prompted, fill in the **OAuth consent screen** information first.
5. Select **Web Application** as the application type and give it a name.
6. Under **Authorized JavaScript origins**, add your domain (just the domain, e.g. `
7. Under **Authorized redirect URIs**, add:

   Replace `your-domain.com/easyappointments` with your actual installation URL.
8. Click **Create**. Google will show you a **Client ID** and **Client Secret** — copy both.

## Step 2: Configure Credentials in the product

You can now configure the Google **Client ID** and **Client Secret** directly from the product user interface (Backend **Settings** → **Google Calendar** section).

As an alternative, you can still define them in `config.php`:

## Step 3: Link a Provider's Google Calendar

1. Log in to the product backend and go to the **Calendar** page.
2. Select a provider and click **Enable Sync**.
3. A Google sign-in window will appear. Log in with the provider's Google account and grant permission.
4. The sync is now active!

## Good to Know

- Sync is triggered from the product backend or whenever appointments change.
- Each provider can only be linked to **one** Google Calendar account.
- Recurring events are supported during sync, but they cannot be created or managed directly from the product.

## Useful Links

- Google Calendar API Docs
- E!A Support Group

*This document applies to the product v1.6.0.*

Back

# CalDAV Calendar Sync

This guide explains how to set up a local CalDAV server (Baikal) for testing calendar sync with the product.

> **Note:** This guide uses the Docker development setup from `docker-compose.yml`.

## Setting Up Baikal

Baikal is a free, self-hosted calendar server. In the Docker setup, it runs at

### First-Time Setup

1. Open  in your browser.
2. You'll see a setup form. Fill it in:
   - **Time zone:** Choose your local time zone (must match the product).
   - **WebDAV authentication type:** Select **Basic**.
   - **Admin password:** Set something simple like `admin` for local testing.
3. On the next page, keep the default settings and submit.

### Create a Test User

1. After setup, go to **Users and resources** in Baikal.
2. Create a new user (e.g. username: `testuser`, password: `testpass`).

## Connecting the product to Baikal

1. In the product, go to the **Calendar** page.
2. Click **Enable Sync** → **CalDAV**.
3. Enter the following:
   - **URL:** ` (replace `testuser` with your Baikal username)
   - **Username:** `testuser`
   - **Password:** `testpass`

That's it — your appointments will now sync with the Baikal CalDAV server.

*This document applies to the product v1.6.0.*

Back