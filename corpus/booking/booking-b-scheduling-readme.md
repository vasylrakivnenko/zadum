> [!WARNING]
> Use at your own risk. Cal.diy is the open source community edition of the product and it is intended for users who want to self-host their own Cal.diy instance. It is strictly recommended for personal, non-production use. Please review all installation and configuration steps carefully. Self-hosting requires advanced knowledge of server administration, database management, and securing sensitive data. Proceed only if you are comfortable with these responsibilities.

> [!TIP]
> For any commercial and enterprise-ready scheduling infrastructure, use the product, not Cal.diy; hosted by us or get invited to on-prem enterprise access here:

  Cal.diy

    The community-driven, open-source scheduling platform.

    GitHub

    Issues

    Contributing

## About Cal.diy

**Cal.diy** is the community-driven, fully open-source scheduling platform — a fork of the product with all enterprise/commercial code removed.

Cal.diy is **100% MIT-licensed** with no proprietary "Enterprise Edition" features. It's designed for individuals and self-hosters who want full control over their scheduling infrastructure without any commercial dependencies.

### What's different from the product?

- **No enterprise features** — Teams, Organizations, Insights, Workflows, SSO/SAML, and other EE-only features have been removed
- **No license key required** — Everything works out of the box, no the product account or license needed
- **100% open source** — The entire codebase is licensed under MIT, no "Open Core" split
- **Community-maintained** — Contributions are welcome and go directly into this project (see CONTRIBUTING.md)

> **Note:** Cal.diy is a self-hosted project. There is no hosted/managed version. You run it on your own infrastructure.

### Built With

- Next.js
- tRPC
- React.js
- Tailwind CSS
- Prisma.io
- Daily.co

## Getting Started

To get a local copy up and running, please follow these simple steps.

### Prerequisites

Here’s what you need to run Cal.diy.

- Node.js (Version: >=18.x)
- PostgreSQL (Version: >=13.x)
- Yarn _(recommended)_

> If you want to enable any of the available integrations, you may want to obtain additional credentials for each one. More details on this can be found below under the integrations section.

## Development

### Setup

1. Clone the repo (or fork

   > If you are on Windows, run the following command in Git Bash with admin privileges:
   > `git clone -c core.symlinks=true

2. Go to the project folder

3. Install packages with yarn

4. Set up your `.env` file

   - Duplicate `.env.example` to `.env`
   - Use `openssl rand -base64 32` to generate a key and add it under `NEXTAUTH_SECRET` in the `.env` file.
   - Use `openssl rand -base64 24` to generate a key and add it under `CALENDSO_ENCRYPTION_KEY` in the `.env` file.

 > **Windows users:** Replace the `packages/prisma/.env` symlink with a real copy to avoid a Prisma error (`unexpected character / in variable name`):
 >
 >

5. Set up Node
   If your Node version does not meet the project's requirements as instructed by the docs, "nvm" (Node Version Manager) allows using Node at the version required by the project:

   You first might need to install the specific version and then use it:

   You can install nvm from here.

#### Quick start with `yarn dx`

> - **Requires Docker and Docker Compose to be installed**
> - Will start a local Postgres instance with a few test users - the credentials will be logged in the console

**Default credentials created:**

  Email   Password   Role

  `free@example.com`   `free`   Free user
  `pro@example.com`   `pro`   Pro user
  `trial@example.com`   `trial`   Trial user
  `admin@example.com`   `ADMINadmin2022!`   Admin user
  `onboarding@example.com`   `onboarding`   Onboarding incomplete

You can use any of these credentials to sign in at

> **Tip**: To view the full list of seeded users and their details, run `yarn db-studio` and visit

#### Development tip

1. Add `export NODE_OPTIONS="--max-old-space-size=16384"` to your shell script to increase the memory limit for the node process. Alternatively, you can run this in your terminal before running the app. Replace 16384 with the amount of RAM you want to allocate to the node process.

2. Add `NEXT_PUBLIC_LOGGER_LEVEL={level}` to your .env file to control the logging verbosity for all tRPC queries and mutations.\
   Where {level} can be one of the following:

   `0` for silly \
   `1` for trace \
   `2` for debug \
   `3` for info \
   `4` for warn \
   `5` for error \
   `6` for fatal

   When you set `NEXT_PUBLIC_LOGGER_LEVEL={level}` in your .env file, it enables logging at that level and higher. Here's how it works:

   The logger will include all logs that are at the specified level or higher. For example: \

   - If you set `NEXT_PUBLIC_LOGGER_LEVEL=2`, it will log from level 2 (debug) upwards, meaning levels 2 (debug), 3 (info), 4 (warn), 5 (error), and 6 (fatal) will be logged. \
   - If you set `NEXT_PUBLIC_LOGGER_LEVEL=3`, it will log from level 3 (info) upwards, meaning levels 3 (info), 4 (warn), 5 (error), and 6 (fatal) will be logged, but level 2 (debug) and level 1 (trace) will be ignored. \

for Logger level to be set at info, for example.

#### Gitpod Setup

1. Click the button below to open this project in Gitpod.

2. This will open a fully configured workspace in your browser with all the necessary dependencies already installed.

#### Manual setup

1. Configure environment variables in the `.env` file. Replace ``, ``, ``, and `` with their applicable values

   If you don't know how to configure the DATABASE_URL, then follow the steps here to create a quick local DB

   1. Download and install PostgreSQL locally (if you don't have it already).

   2. Create your own local db by executing `createDB `

   3. Now open your psql shell with the DB you created: `psql -h localhost -U postgres -d `

   4. Inside the psql shell execute `\conninfo`. And you will get the following info.

   5. Now extract all the info and add it to your DATABASE_URL. The url would look something like this
      `postgresql://postgres:postgres@localhost:5432/Your-DB-Name`. The port is configurable and does not have to be 5432.

   If you don't want to create a local DB. Then you can also consider using services like railway.app, Northflank or render.

   - Setup postgres DB with railway.app
   - Setup postgres DB with Northflank
   - Setup postgres DB with render

2. Copy and paste your `DATABASE_URL` from `.env` to `.env.appStore`.

3. Set up the database using the Prisma schema (found in `packages/prisma/schema.prisma`)

   In a development environment, run:

   In a production environment, run:

  **Note for Windows/PowerShell users:** If running the database deployment scripts fails with an error stating `Environment variable not found: DATABASE_DIRECT_URL`, Turbo might be failing to inject the root `.env` variables. You can bypass this by executing the commands directly from the prisma package directory in PowerShell:

4. Run mailhog to view emails sent during development

   > **_NOTE:_** Required when `E2E_TEST_MAILHOG_ENABLED` is "1"

5. Run (in development mode)

#### Setting up your first user

##### Approach 1

1. Open Prisma Studio to look at or modify the database content:

1. Click on the `User` model to add a new user record.
1. Fill out the fields `email`, `username`, `password`, and set `metadata` to empty `{}` (remembering to encrypt your password with BCrypt) and click `Save 1 Record` to create your first user.
   > New users are set on a `TRIAL` plan by default. You might want to adjust this behavior to your needs in the `packages/prisma/schema.prisma` file.
1. Open a browser to  and login with your just created, first user.

##### Approach 2

Seed the local db by running

The above command will populate the local db with dummy users.

### E2E-Testing

Be sure to set the environment variable `NEXTAUTH_URL` to the correct value. If you are running locally, as the documentation within `.env.example` mentions, the value should be `

#### Resolving issues

##### E2E test browsers not installed

Run `npx playwright install` to download test browsers and resolve the error below when running `yarn test-e2e`:

### Upgrading from earlier versions

1. Pull the current version:

1. Check if dependencies got added/updated/removed

1. Apply database migrations by running one of the following commands:

   In a development environment, run:

   (This can clear your development database in some cases)

   In a production environment, run:

1. Check for `.env` variables changes

1. Start the server. In a development environment, just do:

   For a production build, run for example:

1. Enjoy the new version.

## Deployment

### Docker

The Docker image can be found on DockerHub at

**Note for ARM Users**: Use the {version}-arm suffix for pulling images. Example: `docker pull the product/cal.diy:v5.6.19-arm`.

#### Requirements

Make sure you have `docker` & `docker compose` installed on the server / system. Both are installed by most docker utilities, including Docker Desktop and Rancher Desktop.

Note: `docker compose` without the hyphen is now the primary method of using docker-compose, per the Docker documentation.

#### Running Cal.diy with Docker Compose

1. Clone the repository

2. Change into the directory

3. Prepare your configuration: Rename `.env.example` to `.env` and then update `.env`

   Most configurations can be left as-is, but for configuration options see Important Run-time variables below.

   **Required Secret Keys**

   Before starting, you must generate secure values for `NEXTAUTH_SECRET` and `CALENDSO_ENCRYPTION_KEY`. Using the default `secret` placeholder in production is a security risk.

   Generate `NEXTAUTH_SECRET` (cookie encryption key):

   Generate `CALENDSO_ENCRYPTION_KEY` (must be 32 bytes for AES256):

   Update your `.env` file with these values:

   **Push Notifications (VAPID Keys)**
   If you see an error like:

   This means your environment variables for Web Push are missing.
   You must generate and set `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`.

   Generate them with:

   Then update your `.env` file:

   Do **not** commit real keys to `.env.example` — only placeholders.

   Update the appropriate values in your .env file, then proceed.

4. (optional) Pre-Pull the images by running the following command:

5. Start Cal.diy via docker compose

   To run the complete stack, which includes a local Postgres database, Cal.diy web app, and Prisma Studio:

   To run Cal.diy web app and Prisma Studio against a remote database, ensure that DATABASE_URL is configured for an available database and run:

   To run only the Cal.diy web app, ensure that DATABASE_URL is configured for an available database and run:

   **Note: to run in attached mode for debugging, remove `-d` from your desired run command.**

6. Open a browser to  or your defined NEXT_PUBLIC_WEBAPP_URL. The first time you run Cal.diy, a setup wizard will initialize. Define your first user, and you're ready to go!

   **Note for first-time setup (Calendar integration)**: During the setup wizard, you may encounter a "Connect your Calendar" step that appears to be required. If you do not wish to connect a calendar at this time, you can skip this step by navigating directly to the dashboard at `/event-types`. Calendar integrations can be added later from the Settings > Integrations page.

#### Updating Cal.diy

1. Stop the Cal.diy stack

2. Pull the latest changes

3. Update env vars as necessary.
4. Re-start the Cal.diy stack

#### Building from source with Docker

1. Clone the repository

2. Change into the directory

3. Rename `.env.example` to `.env` and then update `.env`

   For configuration options see Build-time variables below. Update the appropriate values in your .env file, then proceed.

4. Build the Cal.diy docker image:

   Note: Due to application configuration requirements, an available database is currently required during the build process.

   a) If hosting elsewhere, configure the `DATABASE_URL` in the .env file, and skip the next step

   b) If a local or temporary database is required, start a local database via docker compose.

5. Build Cal.diy via docker compose (DOCKER_BUILDKIT=0 must be provided to allow a network bridge to be used at build time. This requirement will be removed in the future)

6. Start Cal.diy via docker compose

   To run the complete stack, which includes a local Postgres database, Cal.diy web app, and Prisma Studio:

   To run Cal.diy web app and Prisma Studio against a remote database, ensure that DATABASE_URL is configured for an available database and run:

   To run only the Cal.diy web app, ensure that DATABASE_URL is configured for an available database and run:

   **Note: to run in attached mode for debugging, remove `-d` from your desired run command.**

7. Open a browser to  or your defined NEXT_PUBLIC_WEBAPP_URL. The first time you run Cal.diy, a setup wizard will initialize. Define your first user, and you're ready to go!

#### Configuration

##### Important Run-time variables

These variables must also be provided at runtime

  Variable   Description   Required   Default

  DATABASE_URL   database url with credentials - if using a connection pooler, this setting should point there   required   `postgresql://unicorn_user:magical_password@database:5432/calendso`
  NEXT_PUBLIC_WEBAPP_URL   Base URL of the site. NOTE: if this value differs from the value used at build-time, there will be a slight delay during container start (to update the statically built files).   optional   `
  NEXTAUTH_URL   Location of the auth server. By default, this is the Cal.diy docker instance itself.   optional   `{NEXT_PUBLIC_WEBAPP_URL}/api/auth`
  NEXTAUTH_SECRET   Cookie encryption key. Must match build variable. Generate with: `openssl rand -base64 32`   required   `secret`
  CALENDSO_ENCRYPTION_KEY   Authentication encryption key (32 bytes for AES256). Must match build variable. Generate with: `openssl rand -base64 24`   required   `secret`

##### Build-time variables

If building the image yourself, these variables must be provided at the time of the docker build, and can be provided by updating the .env file. Currently, if you require changes to these variables, you must follow the instructions to build and publish your own image.

  Variable   Description   Required   Default

  DATABASE_URL   database url with credentials - if using a connection pooler, this setting should point there   required   `postgresql://unicorn_user:magical_password@database:5432/calendso`
  MAX_OLD_SPACE_SIZE   Needed for Nodejs/NPM build options   required   4096
  NEXTAUTH_SECRET   Cookie encryption key   required   `secret`
  CALENDSO_ENCRYPTION_KEY   Authentication encryption key   required   `secret`
  NEXT_PUBLIC_WEBAPP_URL   Base URL injected into static files   optional   `
  NEXT_PUBLIC_WEBSITE_TERMS_URL   custom URL for terms and conditions website   optional
  NEXT_PUBLIC_WEBSITE_PRIVACY_POLICY_URL   custom URL for privacy policy website   optional
  CALCOM_TELEMETRY_DISABLED   Allow Cal.diy to collect anonymous usage data (set to `1` to disable)   optional

#### Troubleshooting

##### SSL edge termination

If running behind a load balancer which handles SSL certificates, you will need to add the environmental variable `NODE_TLS_REJECT_UNAUTHORIZED=0` to prevent requests from being rejected. Only do this if you know what you are doing and trust the services/load-balancers directing traffic to your service.

##### Failed to commit changes: Invalid 'prisma.user.create()'

Certain versions may have trouble creating a user if the field `metadata` is empty. Using an empty json object `{}` as the field value should resolve this issue. Also, the `id` field will autoincrement, so you may also try leaving the value of `id` as empty.

##### CLIENT_FETCH_ERROR

If you experience this error, it may be the way the default Auth callback in the server is using the WEBAPP_URL as a base url. The container does not necessarily have access to the same DNS as your local machine, and therefore needs to be configured to resolve to itself. You may be able to correct this by configuring `NEXTAUTH_URL= to help the backend loop back to itself.

### Railway

You can deploy Cal.diy on Railway. The team at Railway also have a detailed blog post on deploying on their platform.

### Northflank

You can deploy Cal.diy on Northflank. The team at Northflank also have a detailed blog post on deploying on their platform.

### Vercel

Currently Vercel Pro Plan is required to be able to Deploy this application with Vercel, due to limitations on the number of serverless functions on the free plan.

### Render

### Elestio

## License

Cal.diy is fully open source, licensed under the MIT License.

Unlike the product's "Open Core" model, Cal.diy has **no commercial/enterprise code**. The entire codebase is available under the same open-source license.

## Enabling Content Security Policy

- Set CSP_POLICY="non-strict" env variable, which enables Strict CSP except for `unsafe-inline` in `style-src`. If you have custom changes in your instance, you may need to modify your code to make it CSP-compatible. Currently, strict CSP is enabled only on the login page. On other SSR pages, it is enabled in report-only mode to detect potential issues. It is not yet supported on SSG pages.

## Integrations

### Obtaining the Google API Credentials

1. Open Google API Console. If you don't have a project in your Google Cloud subscription, you'll need to create one before proceeding further. Under Dashboard pane, select Enable APIS and Services.
2. In the search box, type calendar and select the Google Calendar API search result.
3. Enable the selected API.
4. Next, go to the OAuth consent screen from the side pane. Select the app type (Internal or External) and enter the basic app details on the first page.
5. In the second page on Scopes, select Add or Remove Scopes. Search for Calendar.event and select the scope with scope value `.../auth/calendar.events`, `.../auth/calendar.readonly` and select Update.
6. In the third page (Test Users), add the Google account(s) you'll be using. Make sure the details are correct on the last page of the wizard and your consent screen will be configured.
7. Now select Credentials from the side pane and then select Create Credentials. Select the OAuth Client ID option.
8. Select Web Application as the Application Type.
9. Under Authorized redirect URI's, select Add URI and then add the URI `/api/integrations/googlecalendar/callback` and `/api/auth/callback/google` replacing Cal.diy URL with the URI at which your application runs.
10. The key will be created and you will be redirected back to the Credentials page. Select the newly generated client ID under OAuth 2.0 Client IDs.
11. Select Download JSON. Copy the contents of this file and paste the entire JSON string in the `.env` file as the value for `GOOGLE_API_CREDENTIALS` key.

#### _Adding google calendar to Cal.diy App Store_

After adding Google credentials, you can now add the Google Calendar app to the App Store.
You can repopulate the App Store by running

You will need to complete a few more steps to activate Google Calendar App.
Make sure to complete section "Obtaining the Google API Credentials". After that do the
following

1. Add extra redirect URL `/api/auth/callback/google`
1. Under 'OAuth consent screen', click "PUBLISH APP"

### Obtaining Microsoft Graph Client ID and Secret
