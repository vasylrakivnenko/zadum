Store credits allow you to add funds directly to a customer’s account. Unlike gift cards, store credits are tied to a specific customer and cannot be transferred. They are commonly used for refunds, compensation, or loyalty rewards.

In more advanced use cases, store credits can serve as the primary payment method - particularly in B2B scenarios where customers operate on prepaid balances or agreed credit thresholds that they draw from over time.

## How to Issue Store Credits

To issue store credits, navigate to **Customers** in the admin dashboard.

Find and click on the customer to open their profile page.

You can issue store credit in two ways:
- Click the **three-dot menu** in the top right corner and select **Add Store Credit**
- Or click **Add Store Credit** directly from the analytics section at the top of the customer profile

Clicking on either of these will redirect you to the store credit creation form.

## Configure the Store Credit

Complete the following fields:
- **Amount**  - The value of the store credit
- **Currency** - Select the currency (if your store supports multiple currencies)
- **Memo** - Optional internal note explaining the reason for issuing the credit

Click **Create** to assign the credit. The balance will immediately be available to the customer and visible in the **Store Credits** section of the customer profile.

## Edit Store Credits

To edit a store credit assignment:

1. Navigate to the customer profile
2. Scroll to the **Store Credits** section
3. Click on a store credit assignment to be redirected to that credit’s form
4. Click **Edit** in the Details section
5. Modify the store credit assignment as necessary and click **Update**

## Delete Store Credits

To remove a store credit:

1. Navigate to the customer profile
2. Scroll to the **Store Credits** section
3. Click on a store credit assignment to be redirected to that credit’s form
4. Click the **three-dot menu** in the top-right corner
5. Click **Delete** from the menu

Deleting store credit will permanently remove the assigned balance from the customer’s account.

Depending on your business model, you might need to manually create customer accounts—for example, when processing phone or in-person orders, handling wholesale clients, or migrating data from another platform.

This ensures customer details are accurately recorded in the system, enabling better order tracking, personalized service, and targeted marketing.

## Create a New Customer

To a create a new customer, navigate to **Customers** in the admin dashboard.

Click **New Customer** in the top-right corner to open the creation form.

Fill in the following customer fields:

- Email
- First Name
- Last Name
- Phone Number (optional)
- Tags (optional)

Tags help you categorize and segment customers based on purchasing behavior or account type, and can improve filtering, reporting, and personalization.

Once you’ve filled in the required fields, click **Create**, and you’ll be redirected to the customer’s profile page.

From here, you can add additional customer details and manage everything related to the customer - including their orders, store credit, gift cards, and more.

## Add Shipping Address

To add the customer’s shipping address, follow these steps:

1. Locate the **Shipping Address** section of the customer’s profile
2. Click **Add** to open the address form
3. Fill in the customers shipping details and click **Create**

Once created, you’ll be able to preview the customer’s shipping address.

If your store has the Google Maps API connected, a map will appear alongside the saved address, pinpointing the customer's location. This can help visually confirm the accuracy of the address.

## Add Billing Address

By default the billing address is set to **Same as Shipping Address**.

To use a different billing address:

1. Click **Edit** under the **Billing Address** section.
2. Select **Add New Address**, enter the billing address, and click **Create**.

## Customer Login Access

In order for the customer to access their account, they must initiate a password reset on the storefront using the email address tied to their profile.

Customer Groups let you segment your customers into defined lists, which can then be used to personalize pricing, limit access to promotions, or power other business rules.

## Why use Customer Groups?

On their own, groups are just lists. The value comes from what you attach to them — and how the product uses group membership to automatically personalise what each buyer sees.

**Pricing tiers** — By pairing a customer group with a Price List, every member of that group automatically sees their correct prices the moment they log in. The Price List can override base prices across your entire catalog, or just on specific products. You can have as many groups and price lists as you need — one per customer tier, one per named account, or one per region — and the product applies the right one without any manual work. When you add a new customer to a group, they inherit the pricing immediately.

**Exclusive promotions** — Promotion rules can be restricted to specific customer groups, so a discount code or automatic offer only applies to the customers it's meant for. Useful for loyalty rewards, trade-only offers, or onboarding incentives for new wholesale accounts.

**Single storefront, multiple experiences** — Because pricing and promotions are tied to the buyer's account rather than to separate stores or URLs, retail and trade customers can shop side by side on the same storefront. Public visitors see standard prices; logged-in trade buyers see theirs. No duplicate stores to maintain, no separate login portals to manage.

### Example: Wholesale, Dealer, and VIP tiers

An industrial supplier runs three buyer types from a single storefront:

- **Wholesale** — registered trade buyers who see a standard wholesale price across the catalog
- **Dealer** — authorized dealers with a deeper discount tier and access to exclusive product bundles
- **VIP** — high-volume accounts with individually negotiated pricing

Each group has its own Price List. When a buyer logs in, the product checks their group membership and applies the correct prices automatically.

For a full walkthrough of this setup, see Set Up Wholesale Pricing.

## Create a Customer Group

To create a new customer group, navigate to **Customers → Customer Groups** in the admin dashboard.

Here you'll see an overview of all existing customer groups, including the number of customers in each.

Click the **New Customer Group** button in the top right to begin setup.

## Add Group Details

In the creation form, add:

- **Name** — This is how the group will appear in admin interfaces
- **Description** — Use this field to describe the purpose of the group, e.g. "North America wholesale buyers" or "Early access testers" (optional)

Click **Create** to save the new group.

## Add Customers to the Group

Once the group is created, you'll be taken to its detail view.

To add customers to the group, click the **Add Customers** button, and a side panel will open where you can search and select customers to add.

Check the boxes next to the customers you want to add, then click **Add Selected**.

That's all there is to it — your customer group is now ready to use in price lists, promotions, and more.

## Remove Customers from a Group

To remove customers from a group, select the checkboxes next to the customers you want to remove, then click **Remove from Group** in the actions menu at the bottom of the screen.

## Next Steps

- Price Lists — create pricing rules that target specific customer groups
- Set Up Wholesale Pricing — step-by-step guide to building wholesale pricing tiers with customer groups

The Customer Profile gives you a complete view of a customer’s activity, order history, and account details - all in one place. It helps you better understand purchasing behavior, identify high-value customers, and provide faster, more personalized support.

## Accessing a Customer Profile

To access a customer’s profile, navigate to **Customers** in the admin dashboard.

Find the customer you’d like to review (use search and filters if needed), and click on the customer’s name to open their profile.

The profile page is divided into several sections, each providing important information about the customer.

## User Analytics

At the top of the page, you’ll see a summary of key customer metrics:

- Total Amount Spent
- Number of Orders
- Average Order Value
- Store Credits
  - Shows the value of store credits the customer has available
  - You can assign store credits here by clicking **Add Store Credit**
- Created At date, i.e., when they became a customer

These metrics give you a quick snapshot of the customer’s engagement and lifetime value.

## Details

This section contains core account information, including:

- Email address
- Phone number
- First and last name
- Email marketing opt-in status
- Assigned Customer Groups 
- Customer tags

You can use **tags** and **customer groups** to segment customers for promotions, pricing rules, or internal organization.

## Addresses

### **Shipping Address**

This section displays the customer’s default shipping address.

If a Google Maps API key is connected, a map preview with a pinned location will also be shown.

### **Billing Address**

Displays the billing address or indicates **“Same as shipping address”** if that option is selected.

## Internal Note

The Internal Note section displays any notes added by admins related to the customer.

These notes are not visible to the customer and can be used to:

- Document special agreements or pricing arrangements
- Flag account concern
- Record support interactions
- Add context for other team members

Internal notes help ensure your team has the full picture when assisting the customer.

## Last Order Placed

This section shows a summary of the most recent order placed by the customer.

You can click the order number (e.g., R394161122) to see the full order details page.

## Orders

The Orders subsection displays a full list of all completed orders associated with the customer.

You can:

- Search within the customer’s orders
- Apply filters
- Sort and select which columns to display

This makes it easy to quickly find specific transactions.

## Draft Orders

Draft Orders include:

- Abandoned carts
- Admin-created orders that are not yet completed
- Orders without attached payments

This section is useful for following up on incomplete purchases or manually created orders.

## Gift Cards

Displays all gift cards assigned to the customer, including:

- Current balance
- Amount used
- Currency
- Status

For more information on issuing gift cards, please refer to our Issuing Gift Cards article.

## Store Credits

Displays any store credit assigned to the customer, along with usage history.

Store credits are commonly used for refunds, loyalty rewards, or manual adjustments. 

In more advanced use cases, store credits may function as the primary payment method - especially in B2B environments where companies maintain a prepaid balance or approved credit limit and settle invoices periodically.

To learn more about store credits, please refer to our Assigning Store Credits article.

In summary, the Customer Profile gives you a centralized view of everything related to a customer - making it easier to support them, reward loyalty, and resolve issues quickly.

You may need to edit a customer’s profile to correct contact details, update addresses, manage tags, or adjust account-related settings. This is especially common when handling phone orders, B2B accounts, or customer support requests.

## How to Edit a Customer

To edit a customer, navigate to **Customers** in the admin dashboard.

Find and click the customer you’d like to update to open their **Customer Profile** page.

From here, there are several sections of the customer profile that you may edit when necessary.

## Contact Details

In the **Details** section, click **Edit** to open the edit form and modify:

- Email address
- Phone number
- First and last name
- Email marketing opt-in / opt-out status
- Tags
- Customer Group (if applicable)

Click **Save** to apply your changes.

## Shipping Address

In the **Shipping Address** section, click **Edit** to reveal the address editor form, and update the customer’s default shipping address as required.

Updating the shipping address in the customer profile does not change the address on existing or outstanding orders. To modify an order’s shipping address, edit the order directly from the **Orders** tab.

## Billing Address

In the **Billing Address** section, click **Edit** to modify the customer’s default billing address.

You’ll then be able to choose between:

- **Same as shipping address**, or
- **Add a new address**

Selecting **Add a new address** will reveal the address form, where you can enter the updated billing details. Click **Update** to apply your changes.

As with shipping addresses, updating the billing address here will not affect existing orders.

## Internal Notes

The **Internal Note** section allows admins to leave private notes about a customer (for example, special handling instructions, account context, or support history).

To add or update an internal note:

1. Click **Edit** in the Internal Note section
2. Enter your note
3. Click **Save**

Internal notes are only visible to admins and are never shown on the storefront.

## Issue Gift Cards

You can issue a gift card directly from the customer profile.

Click the **three-dot menu** in the top right corner and select **Add Gift Card**.

For detailed instructions, refer to the Issue a Gift Card support article.

## Issue Store Credits

You can also assign store credit to a customer account.

Either:

- Click the **three-dot menu** and **Add Store Credit**, or
- Use the **Add Store Credit** button in the analytics section at the top of the profile.

For step-by-step guidance, see the Issue Store Credits support article.

In the product you can, export your customer database for reporting, segmentation, or integration with external tools such as email marketing platforms or CRM systems.

Doing so can make it easier to analyze trends, review engagement, and manage customer relationships outside of the product when needed.

## How to Export Customers

To export customers, navigate to **Customers** in the admin dashboard.

From here you may optionally apply filters and export the records you require.

### Apply Filters

If you want to export a specific segment rather than your entire customer list, apply filters before exporting.

You can use the **Filters** button to narrow results by fields such as:

- Email marketing (opt-in status)
- Location
- Created at / Updated at
- First Name
- Last Name
- Tags

To learn more about filters, refer to our Searching Customers article.

If no filters are applied, the export will include all customers, regardless of your choice in the next step.

### Export

Once your desired view is set, click **Export** in the top-right corner.

You’ll be prompted to confirm whether you want to export:

- **Filtered records** (only the customers currently shown), or
- **All records**

After confirming, a CSV file will be generated and sent to the email address associated with your admin account.

Using filters before exporting allows you to create targeted customer lists for campaigns, reporting, or operational needs.

Gift cards are prepaid balances that can be redeemed like cash on future purchases. They’re commonly used for promotions, customer service gestures, loyalty rewards, or as products sold directly to customers.

In the product, you can issue gift cards to individual customers or generate them in bulk for later distribution. This guide covers how to issue a gift card to a specific customer.

## How to Issue a Gift Card

To issue a gift card, navigate to **Customers** in the admin dashboard.

Find and click the customer who should receive the gift card to open their customer profile.

Click the **three-dot menu** in the top right corner, and select **Add a Gift Card**.

You’ll be redirected to the gift card creation form.

## Configure the Gift Card

Complete the following fields:

- **Code** - Leave blank to have the product automatically generate a unique code, or enter one manually.
- **Amount** - The value of the gift card.
- **Currency** - Select the currency the gift card should be issued in.
- **Expires At** - Optional expiration date. Leave blank for a non-expiring gift card.

Click **Create** to issue the gift card. It will immediately appear in the customer’s **Gift Cards** section.

## Edit a Gift Card

To modify a gift card:

1. Go to the customer’s profile
2. Scroll to the **Gift Cards** subsection
3. Click on the gift card to be redirected that gift card's form
4. Click **Edit** in the Settings section 
5. Make your changes and click **Update**

## Delete a Gift Card

To delete a gift card:

1. Go to the customer’s profile
2. Scroll to the **Gift Cards** subsection
3. Click on the gift card to be redirected to that gift card's form
4. Click **three-dot menu** in the top-right corner
5. Click **Delete**

Quickly finding the right customer is essential for providing efficient support, reviewing order history, updating account details, or managing marketing preferences.

the product’s updated table view makes it easy to search, sort, and filter customer records with precision.

## How to Search for Customers

To search for customers, navigate to **Customers** in the admin dashboard.

At the top of the page, you’ll find the search bar along with sorting, column, and filter controls.

## Search Bar

Use the search bar to quickly locate a customer by:

- Email address
- First name
- Last name

Results update based on your query, helping you find specific profiles instantly.

## Sorting & Columns

The new table interface allows you to customize how customer data is displayed.

### **Sort**

Click on the **Sort by** dropdown to select the field you like to sort by, and select whether you’d like the results to be in ascending or descending order.

### **Columns**

Use the column selector to choose which fields are visible in your table view. This allows you to tailor the layout based on what information is most relevant to your workflow.

## Filters

For more advanced searches, click **Filters** to build custom filter rules.

You can create filter groups using **AND** / **OR** logic and apply conditions using the following operators:

- equals
- does not equal
- greater than
- greater than or equal
- less than
- less than or equal
- is any of
- is none of
- is empty
- is not empty

### **Available Filter Fields**

You can filter customers by:

- Email marketing (opted in or not)
- Location
- Created at
- Updated at
- First Name
- Last Name
- Tags

Multiple filters can be combined to narrow down results - for example, finding customers who have opted into email marketing and were created within a specific timeframe.

When you sell to customers in different countries, you'll want each customer to see prices in their local currency. In the product, this involves two steps: creating a Market for each currency, then setting a base price in that currency on your products.

In this guide, we'll walk through a common scenario — a US-based store adding a German market so customers in Germany can browse and buy in EUR.

This guide covers multi-currency pricing — different currencies for different regions. If you need different prices within the same currency across regions (e.g., separate EUR prices for Germany, France, and Spain), see Set Up Multi-Region Pricing instead.

## Prerequisites
