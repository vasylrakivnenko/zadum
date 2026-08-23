There's an indirect way to set an Alert based on multiple columns of a query:

Your query can implement the alert logic and return a boolean value for the
Alert to trigger on. Something like:

    SELECT CASE WHEN drafts_count > 10000 AND archived_count > 5000 THEN 1 ELSE 0 END
    FROM (
    SELECT sum(CASE WHEN is_archived THEN 1 ELSE 0 END) AS archived_count,
    sum(CASE WHEN is_draft THEN 1 ELSE 0 END) AS drafts_count
    FROM queries) data

This query will return 1 when drafts_count > 10000 and archived_count > 5000\.
Then you can configure the alert to trigger when the value is 1.

# Intro

Whenever an Alert triggers, it sends a blob of related data (called the Alert Template) to its designated **Alert Destinations**. Destinations can use this blob of data to fire off emails, Slack messages, or custom web hooks. You can set up new Alert Destinations from the settings screen.

Only Admins can add new alert destinations. Destinations are available to all users once configured.

# Add A New Alert Destination

There are a few types of destinations to choose from:

- Email
- Slack
- PagerDuty
- Mattermost
- Google Hangouts Chat
- HipChat
- ChatWork
- Generic WebHook

The default destination for any alert is the email address for the user who created it. If you made an alert and need to be notified by email then you don't need to setup a new Alert Destination. Instead, toggle the switch beside your email address on the alert setup screen.

To configure one, select it from **Create a New Alert Destination** dialogue and follow its prompts.

## PagerDuty

First you need to obtain the PagerDuty Integration Key from your PagerDuty console.

Services > Service Details > Integrations

If you don't have an API v2 Integration yet, you need to create it.

After obtaining the Integration Key:

1. Open "Alert Destinations" tab in the settings screen, and click on "+ New Alert Destination".
2. In the form that opens pick "PagerDuty" as the type.
3. The mandatory fields are Name and Integration Key.
4. You add this new destination for any alert that you want to trigger PagerDuty incident.

## Slack

1. Open "Alert Destinations" tab in the settings screen, and click on "+ New Alert Destination".
2. In the form that opens pick "Slack" as the type.
3. Set the name, channel, etc. and provide a "Slack Webhook URL", which you can create here: . If the Webhook target is a channel in the channel field make sure to prefix the channel name with `#` (i.e. `#marketing`). If the destination is a direct message to a user, prefix it with `@` (i.e. `@smartguy`).
4. You add this new destination for any alert that you want to be sent to Slack.

the product alerts can notify you when your queries match some arbitrary criteria. If you wish to modify the notification message, click the "Edit" button at the top of the alert page.

Next to the setting labeled "Template", click the dropdown and select "Custom template".
A box will appear, consisting of input fields for subject and body.

Any static content is valid, and you can also incorporate some built-in template variables:

- `ALERT_STATUS` - The evaluated alert status (string).
- `ALERT_CONDITION` - The alert condition operator (string).
- `ALERT_THRESHOLD` - The alert threshold (string or number).
- `ALERT_NAME` - The alert name (string).
- `ALERT_URL` - The alert page url (string).
- `QUERY_NAME` - The correlated query name (string).
- `QUERY_URL` - The correlated query page url (string).
- `QUERY_RESULT_VALUE` - The query result value (string or number).
- `QUERY_RESULT_ROWS` - The query result rows (value array).
- `QUERY_RESULT_COLS` - The query result columns (string array).
- `QUERY_RESULT_TABLE` - Query results formatted as two dimensional array of values.

An example subject, for instance, could be:
`Alert "" changed status to `

Click the "Preview" toggle button to preview the rendered result and save your changes by clicking the "Save" button.

The preview is useful for verifying that template variables get rendered correctly. It is not an accurate representation of the eventual notification content, as each alert destinations can display notifications differently.

To return to the default the product message templates, reselect "Default template" at any time.

the product alerts notify you when a field returned by a **Scheduled
Query** meets a
threshold. Use them to monitor your business. Or integrate them with tools like
Zapier or IFTTT to kickoff workflows such as user onboarding or support tickets.
Alerts complement scheduled queries, but their criteria are checked after every
execution.

For information on alerts prior to the product V9, see our
**Legacy Alerts doc**.

A query schedule is not required but is _highly recommended_ for alerts. If you
add an alert to a non-scheduled query you will be notified only if a user
executes the query manually and the alert criteria are met.

Alerts don't work for queries with parameters.

To see a list of current Alerts, click **Alerts** on the navbar. By default, they
are sorted in reverse chronological order by the **Created At** column. You can
reorder the list by clicking the column headings.

- **Name** shows the string name of each alert. You can change this at any time.
- **Created By** shows the user that created this Alert.
- **State** shows whether the Alert status is `UNKNOWN`, `TRIGGERED`, or `OK`.

# Usage

Click the **Create** button in the navbar and then click **New Alert**.

Search for a target query. If you don't see the one you want, make sure it is
published and does not use parameters.

Use the settings panel to configure your alert.

- The **Value column** dropdown controls which field of your query result will
  be evaluated.
- The **Condition** dropdown controls the logical operation to be applied.
- The **Threshold** text input will be compared against the _Value column_
  using the _Condition_ you specify.

If a target query returns multiple records, the product Alerts only see the first
one. As you change the Value Column setting, the current value of that field in
the top row is shown beneath it.

Next, adjust how many notifications to receive while your alert is triggered.
There are three options:

- **Just Once** means a notification will fire any time the alert status changes
  from `OK` to `TRIGGERED`.
- **Each time alert is evaluated** means a notification will fire whenever the
  alert status is `TRIGGERED` regardless of its status as of the previous
  evaluation.
- **At most every** lets you set a minimum interval between notifications. It
  splits the difference between _Just Once_ and _Each time alert is evaluated_.
  This choice lets you avoid notification spam for alerts that trigger often.

Regardless of which notification setting you pick here, you will receive a
notification whenever the status goes from `OK` to `TRIGGERED` or from
`TRIGGERED` to `OK`. The schedule settings above only impact how many
notifications you will receive if the status remains `TRIGGERED` from one
execution to the next.

Finally, pick a **Template**. The default template is a message with links to
the Alert configuration screen and the Query screen. Many users will want to
include more specific information about the Alert. To do this you can Customize
The Alert
Template.

When you're finished, click **Create Alert** and then choose an Alert
Destination.
If you skip this step you will not be notified when the alert is triggered.

## Muting Alerts

You can temporarily mute an alert's notifications without deleting the alert entirely. Just click the vertical ellipsis (`⋮`) menu and choose _Mute Notifications_.

To resume notifications again, click the vertical ellipsis menu and choose _Unmute Notifications_.

# Alert Statuses

- `TRIGGERED` means that on the most recent execution, the _Value Column_ in
  your target query met the _Condition_ and _Threshold_ you configured. If your
  alert checks whether "cats" is above 1500, your alert will be triggered as
  long as "cats" is above 1500.
- `OK` means that on the most recent query execution, the _Value Column_ did not
  meet the _Condition_ and _Threshold_ you configured. This doesn't mean that
  the Alert was not triggered previously. If your "cats" value is now 1470 your
  alert will show as OK.
- `UNKNOWN` means the product does not have enough data to evaluate the alert
  criteria. You will see this status immediately after creating your Alert until
  the query has executed. You will also see this status if there was no data in
  the query result or if the most recent query result doesn't include the _Value
  Column_ you configured.

# Notification Frequency

the product sends notifications to your chosen Alert Destinations whenever it detects
that the Alert status has changed from `OK` to `TRIGGERED` or vice versa.
Consider this example where an Alert is configured on a query that is scheduled
to run once daily. The daily status of the Alert appears in the table below.
Prior to Monday the alert status was `OK`.

  Day         Alert Status

  Monday      OK
  Tuesday     OK
  Wednesday   TRIGGERED
  Thursday    TRIGGERED
  Friday      TRIGGERED
  Saturday    TRIGGERED
  Sunday      OK

If the notification frequency is set to _Just Once_, the product would send a
notification on Wednesday when the status changed from `OK` to `TRIGGERED` and
again on Sunday when it switches back. It will not send alerts on Thursday,
Friday, or Saturday unless you specifically configure it to do so because the
Alert status did not change between executions on those days.

# Creating a Dashboard

A dashboard lets you combine visualizations and text boxes that provide context with your data.

You can create a new dashboard with the **Create** button from the main navigation menu:

After naming your dashboard, you can add widgets from existing query visualizations or by writing commentary with a text box. Start by clicking the **Add Widget** button.

Search existing queries or pick a recent one from the pre-populated list:

## Dashboard URLs

When you create a dashboard, the product automatically assigns it an `id` number and a URL `slug`. The slug is based on the name of the dashboard. For example a dashboard named "Account Overview" could have this URL:

`

If you change the dashboard name to "Account Over (Old)", the URL will update to:

`

The dashboard can also be reached using the `/dashboard` endpoint (notice this is singular), which accepts _either_ an ID or a slug:

- `
- `

Dashboard ids are guaranteed to be unique. But multiple dashboards may use the same name (and therefore `slug`). If a user visits `/dashboard/account-overview` and more than one dashboard exists with that slug, they will be redirected to the earliest created dashboard with that slug.

# Picking Visualizations

By default, query results are shown in a table. At the moment it's not possible to create a new visualization from the "Add Widget" menu, so you'll need to open the query and add the visualization there beforehand (instructions).

# Adding Text Boxes

Add a text box to your dashboard using the `Text Box` tab on the **Add Widget** dialog. You can style the text boxes in your dashboards using Markdown.

You can include static images on your dashboards within your markdown-formatted text boxes. Just use markdown image syntax:``

# Dashboard Filters

When queries have filters you need to apply filters at the dashboard level as well. Setting your dashboard filters flag will cause the filter to be applied to all Queries.

1\. Open dashboard settings:

2\. Check the "Use Dashboard Level Filters" checkbox:

# Managing Dashboard Permissions

By default, dashboards can only be modified by the user who created them and members of the Admin group. But the product includes experimental support to share edit permissions with non-Admin users. An Admin in your organization needs to enable it first. Open your organization settings and check the "Enable experimental multiple owners support"

Now the Dashboard options menu includes a `Manage Permissions` option. Clicking on it it will open a dialog where you can add other users as editors to your dashboard.

Please note that currently the users you add won't receive a notification, so you will need to notify them manually.

# Dashboard Refresh

Even large dashboards should load quickly because they fetch their data from a cache that renews whenever a query runs. But if you haven't run the queries recently, your dashboard might be stale. It could even mix old data with new if some queries ran more recently than others.

To force a refresh, click the Refresh button on the upper-right of the dashboard editor. This runs all the dashboard queries and updates its visualizations.

If you want this to happen periodically you can activate Automatic Dashboard Refresh from the UI by clicking the dropdown pictured below. Or you can pass a `refresh` query string variable with your dashboard URL. **The allowed refresh intervals are expressed in seconds**: 60, 300, 600, 1800, 3600, 43200, and 86400.

Automatic Dashboard Refresh occurs as part of the product frontend application. Your refresh schedule is only in-effect as long as a logged-in user has the dashboard open in their browser. To guarantee that your queries are executed regularly (which is important for alerts), you should use a Scheduled Query instead.

On public dashboards there is no Refresh button. You can add `refresh` to the query string. And for dashboards with parameters you can trigger a refresh by changing a parameter value and clicking **Apply Changes**.

the product users write a lot of queries and dashboards! Favorites and Tagging are here to make finding them easy as your collection of queries and dashboards grows from a few hundred to a few thousand.

## Favorites

You can favorite a dashboard or query by clicking the star to the left of its title anywhere in the product. The star will turn yellow to indicate success. Your favorites are displayed at several places in the product. They appear on the homepage, in the navbar dropdown menus and as filters in the query or dashboard list views.

## Tagging

You can tag queries and queries by subject matter, location, user or any parameter that is meaningful to your organization. Tags are added from the query editor or the dashboard editor. Hover your mouse on the query or dashboard title and an `+Add Tag` button will appear. In the modal that appears you can select as many tags as you need. The modal will suggest previously-used tags as you type. Hit `Save` when you're finished or `Esc` to abort tagging.

It's important to have predictable taxonomy for your tags. Consistency in this area makes using the product an even nicer experience and helps bring new users onboard. So we recommend that your team have an internal discussion about the tag hierarchy that will be most benefecial to your organization.

Your tags will appear on the Dashboard and Query list views on the righthand side. Click any tag to filter the list view instantly. Click a second time to remove the filter. `Shift + Click` to select multiple filters.

the product makes it easy to share your dashboards. Just click the `Publish` button on the upper right of the dashboard editor. Any logged-in member of your organization with adequate permissions can see your dashboard once it has been published. You can also share published dashboards with external users by clicking the share icon in the upper-right. A modal appears where you can generate a secret link to share safely outside your organization. External users can see the dashboard widgets but will not be able to navigate within the product application or view the underlying queries.

You can revoke access to a dashboard for external users by toggling `Allow public access`. This will break any links to this dashboard that were shared previously. If you toggle the switch again a new secret link will be generated.

Admins can globally disable all public URLs by setting the environment variable `REDASH_DISABLE_PUBLIC_URLS` to `"true"`.

## Dashboard Permissions

A logged-in user will only see dashboard widgets derived from data sources to which the user has access. Users who can view a dashboard widget can also view the underlying query. Should you need to share a dashboard within your organization while also restricting access to the underlying data source, there are two options:

1. Give your restricted users access using the secret link method described above
2. Create a custom data source for the restricted employees and configure permissions at the database level

You can read more about the product's permissions model here.

## Embedding Dashboards

Some users embed their dashboards outside of the product using iframes. the product provides a `Full Screen` view to improve this experience. Full screen mode removes everything but the widget UI. Just click the full screen button to the right of the `Refresh` button. Then copy the URL from your browser into your iframe embed code. Embedding a dashboard in this way will require users to be logged-in to the product. To embed the product for external users you can use the secret link method described above. Secret links to the product dashboards are full screen by default.

Beginning with the product V8, an embedded dashboard may use parameters. But _any user_ can modify them, which makes the product the wrong tool for embedded analytics. Only share dashboards with trusted stakeholders.

# How to download a query result

Visit any query page and click the vertical ellipsis (`⋮`) button beneath the results pane. Then choose to download a CSV, TSV, or Excel file. This action downloads the current query result.

# How to get latest results via the API

Visit any query page and click the horizontal ellipsis (`…`) above the query editor. Then choose **Show API Key**. The links in the modal that appears always point to the latest query result. You can choose between CSV and JSON formats to be returned by the API call.

It's not shown in the interface, but you can also get the Excel format by changing the file type suffix from `json`/`csv` to `xlsx`.

The latest results API is not supported for queries that use parameters.

the product users write a lot of queries and dashboards! Favorites and Tagging are here to make finding them easy as your collection of queries and dashboards grows from a few hundred to a few thousand.

## Favorites

You can favorite a dashboard or query by clicking the star to the left of its title anywhere in the product. The star will turn yellow to indicate success. Your favorites are displayed at several places in the product. They appear on the homepage, in the navbar dropdown menus and as filters in the query or dashboard list views.

## Tagging

You can tag queries and queries by subject matter, location, user or any parameter that is meaningful to your organization. Tags are added from the query editor or the dashboard editor. Hover your mouse on the query or dashboard title and an `+Add Tag` button will appear. In the modal that appears you can select as many tags as you need. The modal will suggest previously-used tags as you type. Hit `Save` when you're finished or `Esc` to abort tagging.

It's important to have predictable taxonomy for your tags. Consistency in this area makes using the product an even nicer experience and helps bring new users onboard. So we recommend that your team have an internal discussion about the tag hierarchy that will be most benefecial to your organization.

Your tags will appear on the Dashboard and Query list views on the righthand side. Click any tag to filter the list view instantly. Click a second time to remove the filter. `Shift + Click` to select multiple filters.
