# Overview

Billable metrics define how incoming events are aggregated in order to measure consumption. If you want to charge your customers for the use of a particular feature, then you should create the corresponding billable metric.

To add a new billable metric through the user interface:
- Enter its `name`;
- Assign it a `code` which will be used as the name of the event sent from your backend;
- Add a `description` *(optional)*; and
- Select the `aggregation type` which will define how consumption will be measured.

The next section describes the different aggregation types. In addition to this, we have added some examples to help you understand the relationship between incoming events and billable metrics.

# Cadence & Invoicing

Usage-based charges can be billed in arrears (i.e. at the end of the period) or in advance (i.e. each time an event is ingested).

## Charges paid in arrears
If you opt for charges to be settled in arrears, they will be invoiced at the end of the billing period based on the actual usage during that period. This payment option is ideal for usage types like storage, API calls, or compute, where it is more practical to wait until the end of the period before billing. By default, all charges are configured to be billed in arrears.

**API configuration:**

To specify that charges of a plan should be billed in arrears using the API, you can use the `pay_in_advance` argument and set its value to `false`. More information about the plan configuration.

**User interface (UI) configuration:**

Alternatively, you can easily manage the billing settings through the user interface. Within the UI, you will find options to customize the invoice cadence by setting a charge as invoiced in arrears.

## Charges paid in advance
With this payment option, charges are invoiced immediately upon any changes in usage. It is particularly useful for scenarios where you need to bill customers instantly for usage-based actions, such as new user seat or integrations.

You can mark charges as paid in advance for billable metrics based on the `count_agg`, `sum_agg` and `unique_count_agg` aggregation types.

However, charges related to billable metrics based on the `max_agg` and `recurring_count_agg` aggregation types can only be paid in arrears.

**API configuration:**

To specify that charges of a plan should be billed in advance using the API, you can use the `pay_in_advance` argument and set its value to `true`. More information about the plan configuration.

**User interface (UI) configuration:**

Alternatively, you can easily manage the billing settings through the user interface. Within the UI, you will find options to customize the invoice cadence by setting a charge as billed in advance, and thus invoiced immediately upon changes.

You can use the `api/v1/events/estimate_fees` endpoint to estimate fees for charges to be paid in advance (learn more).

# Invoiceable

Only users with a premium license can define whether or not a charge is invoiceable. Please **contact us** to get access to the product Cloud and the product Self-Hosted Premium.

If a charge needs to be paid in advance, you can choose whether or not it generates an invoice.

The `"invoiceable": false` option is particularly relevant for fintech companies that want to charge customers instantly without issuing an invoice. This feature can be useful for banking transactions like ATM withdrawals, FX transfers and other similar scenarios.

By setting the invoiceable parameter to false, you can streamline the payment process, eliminating the step of generating invoices for these specific charges.

# Overview
In addition to the plan price, you have the flexibility to charge your customers based on their usage. This allows you to create charges that align with specific metrics, such as the number of *API calls*, *active users*, *transactions*, *compute time*, and more. These additional charges are directly tied to the billable metrics defined earlier.

## Adding usage-based charges to a plan
To incorporate usage-based charges into a plan, you can utilize existing billable metrics. This enables you to offer "pay-as-you-go" features.

## Key information about usage-based charges
Here are some important details to consider regarding usage-based charges:

### Invoice timing

**Invoicing charges in arrears:** Charges can be settled in arrears, which means they are invoiced at the end of the billing period based on the actual usage. This payment option is particularly beneficial for usage types like *storage*, *API calls*, or *compute*, where it is more practical to wait until the end of the period before billing.

**Invoicing charges in advance:** Alternatively, charges can be paid in advance, providing customers with immediate invoicing. This invoice option is suitable for usage types such as user *seats* or *integrations* that require instant billing upon any changes made.

### Currency of charges
All charges are denominated in the same currency as the plan to ensure consistency and transparency.

### Trial period exclusions
It's important to note that the trial period exclusively applies to the base amount of the plan and does not extend to usage-based charges.

## Number of decimals
the product allows you create charges with up to fifteen decimals (e.g. $0.000123456789123).

Please note that charges are invoiced in `amount_cents`. Therefore, the product automatically rounds prices (e.g. USD 1102 `amount_cents` = $11.02).

## Deleting a charge
You may delete a charge included in a plan associated with existing subscriptions.

If you do so and save the change:
- The charge will be immediately removed from all subscriptions linked to this plan;
- The charge will no longer be included in the current usage of the customers concerned; and
- The charge will be immediately removed from all `draft` invoices associated with these subscriptions.

However, the charge will still be included in all `finalized` invoices associated with these subscriptions.

Deleting a charge does not delete the events associated with the corresponding billable metric. If later you decide to add the charge back into the plan, the events received before the deletion may be taken into account in the billing process (depending on the limits of the billing period).

# Overview
While billable metrics are used to measure customer usage, plans are used to apply prices to this usage.

Defining billiable metrics is not mandatory to create plans. It is possible to create subscription-based plans that don't include usage-based charges.

## Plan structure
1. Basic information:
    - Name;
    - Code;
    - Description;
2. Plan model:
    - Billing interval (e.g. monthly, yearly, weekly);
    - Fixed recurring amount;
    - Currency;
    - Boolean to define whether the plan should be paid in advance;
    - Trial period in days;
3. Additional charges (associated with billable metrics):
    - Charge model (e.g. standard, graduated, percentage, package, volume);
    - Charge amount;
    - Charge paid in arrears or in advance;
    - Charge invoiceable or not; and
    - Charge spending minimum.

You can create plans via the user interface or the API.

# Plan model
The plan model defines **when** and **how much** a customer is charged.

## Plan interval
The plan interval corresponds to the billing period and defines when invoices are generated. In most cases, the charges are also calculated according to the plan interval.

There are several plan intervals:
1. **Weekly**: subscription fees and charges are billed on a weekly basis (Monday to Sunday);
2. **Monthly**: subscription fees and charges are billed on a monthly basis; and
3. **Yearly**: subscription fees are billed on a yearly basis and charges can be billed monthly or annually.

## The base charge amount and its currency
You need to define a **base amount** for each plan (i.e. the subscription fee). This amount is what the customer will pay by subscribing to the plan regardless of their consumption.

This base charge `amount` is recurring, and billed at the end of each billing interval.

## Pay in advance or in arrears
With the product, you can define if the base charge of the Plan is paid **in advance** or **in arrears**.

- If the toggle is `off` (boolean set to FALSE), the Plan is paid for the past period (in arrears).
- If the toggle is `on` (boolean set to TRUE), the Plan is paid upfront (in advance) for the period.

Note that this toggle only affects the base amount of the Plan. Additional charges for per-usage Billable metrics **are always paid in arrears because they are linked to a past consumption of your customers.**

## Trial period (optional)
You may define a trial period for your plan. A trial period is defined as a number days that are not charged to the customer.

Consider the following example:

>You create a monthly plan of $50 that needs to be paid in advance, with a trial period of 5 days.
>
>If the customer's subscription starts on April 1st, then the product will immediately issue an invoice for the period April 6th to April 30th.
>
>Therefore, on April 1st, the system will issue an invoice of $50 x 25 days due / 30 days in April = $41.67.

The trial period applies to the base amount of the plan. Usage-based charges incurred during the trial period remain payable by the customer.

The trial period **only applies to the first plan** associated with the subscription. In case of an upgrade or a downgrade, the trial period of the new plan does not apply.

## Pro-ratas based on subscription date
Obviously, we know that your customers don't necessarily sign up for a Plan at the very begining of each month (or each year). This is why the product automatically applies a pro-rata for the first and the last subscription period of a Plan.

Here is an example:
A `Customer X` signs up for the Plan `Start` (base amount of 10€, with no trial period) on April 15, 2022.
- If the Plan is defined to be `paid in arrears`, this Customer will be charged 5€ for the first month at the end of the period (May 1, 2022).
- If the Plan is defined to be `paid in advance`, this Customer is charged 5€ straight away for the first month (April 15, 2022).

Note that pro-ratas can also be applied in case of **upgrades or downgrades**.

# Subscriptions
A subscription is created when a plan is assigned to a customer. You can assign a plan to a customer at any time (i.e. when the customer record is created or later on).

To assign a plan to a customer through the user interface:
1. Access the **"Customers"** section via the side menu;
2. Select a customer from the list;
3. In the **"Overview"** tab, click **"Add a plan"** on the right;
4. Select a plan (that you can overwrite if needed - see below);
5. Give a name to the subscription (name that will be displayed on the invoice - optional);
6. Set a subscription date (start date of the subscription - see below)
7. Choose whether the subscription should be renewed at the beginning of the period or on its anniversary date (see below); and
8. Click **"Add plan"** to confirm.

The subscription date displayed in the app is based on the organization's timezone.

When a subscription is active, the product will automatically generate invoices for the customer according to the plan model. It will also start monitoring the customer's consumption, which means that you can start pushing events related to this subscription.

## Billing cycles

### Calendar billing period
By default, subscriptions are based on **calendar periods**. Therefore, if you assign a monthly plan to a customer on July 14th:
- The first invoice will be generated for the period July 14th to July 31st;
- The next invoice will be generated for the period August 1st to August 31st; and
- All future invoices will be generated for full calendar months.

When a subscription starts during the month, the subscription fee will be calculated on a **pro rata basis** according to the number of days.

Consider the following example:

>Your customer signs up for the Premium plan ($50 monthly) on August 10th.
>
>There are 22 days left until the end of the month (including August 10th). Therefore, the subscription fee for August is:
>
>22 days x $50 / 31 days = $35.48

### Anniversary billing period
Another option is to use the **anniversary date** of the subscription to define a custom billing period.

For example:

>Your customer signs up for the Premium plan on August 10th.
>
>If you choose to align the billing cycle with the anniversary date of the subscription, the customer will be billed every 10th of the month.
>
>The first billing period will run from August 10th to September 9th.

## Subscription date
By default, the subscription starts the day it is created. However, you can set a subscription date in the past or in the future. The subscription date displayed in the app is based on the organization's timezone.

### Start date in the past
If the start date of the subscription is in the past, the subscription is considered active.

the product will not generate any invoices for past periods already completed.

The invoicing process varies depending on the plan model and billing cycle:
- If the plan includes a subscription fee to be paid in advance, it will be considered as **already paid for the current period**. The next invoice will include the usage-based charges for the current period and the subscription fee for the next period (see example 1 below); and
- If the plan includes a subscription fee to be paid in arrears, it will be **included in the next invoice**, together with the usage-based charges for the current period (see example 2 below).

**Example 1:** Start date in the past and subscription fee to be paid in advance

**Example 2:** Start date in the past and subscription fee to be paid in arrears

### Start date in the future
If the start date of the subscription is in the future, the subscription is considered pending.

The invoicing process varies depending on the plan model and billing cycle:
- If the plan includes a subscription fee to be paid in advance, when the subscription becomes active, the product will automatically generate an **invoice for the subscription fee**. Usage-based charges will be included in the next invoice, generated at the end of the billing period (see example 3 below); and
- If the plan includes a subscription fee to be paid in arrears, when the subscription becomes active, **there will be no invoice**. The subscription fee and usage-based charges will be included in the invoice generated at the end of the billing period (see example 4 below).

**Example 3:** Start date in the future and subscription fee to be paid in advance

**Example 4:** Start date in the future and subscription fee to be paid in arrears

It is possible to update the start date of a pending subscription via the user interface (click the **ellipsis icon**, then **"Edit subscription"**) or via the API.

## Multiple plans
You may create several subscriptions for a customer by assigning them multiple plans. This can be particularly useful if your application allows customers to create different projects or workspaces (e.g. Free plan for Workspace 1, Free plan for Workspace 2, Premium plan for Workspace 3, etc.).

There are some rules to keep in mind when assigning multiple plans to a customer:
1. All plans must be denominated in the same currency; and
2. You must specify the `external_subscription_id` for each event or create batch events.

We recommend that you give each subscription a name when assigning multiple plans to a customer. The subscription names will make it easier to differentiate each plan and will also be displayed on the invoices.

When multiple subscriptions are linked to a customer, the product will automatically consolidate invoices when possible.

                     Month 1   Month 2   Month 3   Month 4   (...)   Month 13

  Plan A (monthly)   $40       $40       $40       $40       (...)   $40
  Plan B (monthly)   $60       $60       $60       $60       (...)   $60
  Plan C (yearly)    $500      -         -         -         (...)   $500
  Total invoice      $600      $100      $100      $100      (...)   $600

It is possible to link to the same customer subscriptions that are based on different billing cycles (e.g. a subscription based on calendar dates and another based on the anniversary date).

## Overwriting a plan
You can use an existing plan as a template to create a new plan for your customer.

When assigning a plan to a customer via the user interface:
1. Select an existing plan;
2. Click **"Overwrite"**, next to the plan name;
3. Choose a name and a code for the new plan;
4. Modify the plan model and charges according to your needs; and
5. Click **"Duplicate plan"** to confirm.

To start a subscription, the currency of the new plan must match the currency associated with the customer.

Overwriting a plan has no impact on the original plan or existing subscriptions.

## Deleting a plan
You may delete a plan linked to existing subscriptions.

If you do so, the subscriptions associated with this plan will be immediately terminated. This action may trigger the generation of invoices and/or credit notes.

After deleting a plan, you can create a new one using the same code.

# Upgrades & Downgrades
To modify an active subscription through the user interface:
1. Go to the **"Customers"** section;
2. Select a customer from the list;
3. Click **"Upgrade/downgrade plan"**;
4. Select the new plan you want to assign to the customer (you can also overwrite an existing plan); and
5. Click **"Change plan"** to save.

You can also terminate a subscription and create a new one via the API (learn more).

## Overview
When modifying a subscription, the product will assess whether the change is an upgrade or a downgrade. The result is determined by the monthly value of the plans (i.e. the base amount as defined in each plan model, calculated on a monthly basis, and excluding charges).

Here are some examples:

  Initial plan model   New plan model   Result      Comments

  $20 per month        $40 per month    Upgrade     $40 > $20
  $20 per month        $15 per month    Downgrade   $15  $20
  $20 per month        $180 per year    Downgrade   $180 / 12 = $15 < $20

In the case of an upgrade, the initial subscription will terminate immediately and the new subscription will start right away. However, in the case of a downgrade, the initial subscription will terminate at the end of the current billing period.

If you upgrade the subscription during the trial period of the initial plan, the customer will lose the remaining days of their trial. To avoid this, you should ensure the new plan also includes a trial period.

## Impact on invoicing
When a subscription terminates, either as part of an upgrade or a downgrade, the product automatically generates a final invoice including **outstanding charges and/or subscription fees** (for plans to be paid in arrears). It may also generate an invoice for the new subscription if the new plan has to be paid in advance.

Subscription fees are calculated on a pro rata basis according to the number of days.

Consider the following example:

>Your customer is on the standard plan (e.g. $20 to be paid in advance each month). Therefore, beginning of May, an invoice of $20 was generated for them.
>
>The customer now wants to switch to the premium plan (e.g. $40 to be paid in advance each month). If you modify their subscription on May 11th, the product will generate a new invoice of $7.10.
>
>There are 21 days left until the end of the month (including May 11th), so the calculation is:
>
>21 days x $40 / 31 days = $27.10 - $20 already invoiced = $7.10

# Customer portal

This feature is only available to users with a premium license. Please **contact us** to get access to the product Cloud and the product Self-Hosted Premium.
