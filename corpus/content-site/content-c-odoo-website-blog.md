Blog

the product Blog lets you manage blog pages and posts, and customize them with the website builder.

Blog posts

To create a blog post, click New on the website builder and click Blog Post.
Select a blog, define a Blog Post Title, and click

To publish a post, toggle the Unpublished switch in the top-right corner of the page.

To delete a blog post, go to Website --> Site --> Blog post. Select the blog
post to delete, click fa-cog Actions, and fa-trash-o Delete.

Customize blog posts

To customize the layout of all blog posts, open one and click Edit --> Style.
Under the Blog page section, different options can be used to customize the posts:

- Layout: display the title inside or above the cover.
- Increase Readability: adjust or not the posts' formatting for better reading comfort.
- Sidebar: display or hide a sidebar that can contain several elements:

  - Archive: allow visitors to view all posts from a specific month by selecting it.
  - Author: display the post author.
  - Blog List: display links to all blog pages.
  - Share Links: add clickable icons that link to your social network profiles and a
    subscription field for your newsletter.
  - Tags: create or select existing tags and display them on the post.

- Breadcrumb: display the breadcrumb trail.
- Bottom: click the Next Article to hide or display the next post at the
  end of the page, and click Comments to enable or disable visitors' comments.

To add tags or customize the cover of a specific post, click the cover and use the following
settings under the Blog Post Cover section:

- Tags
- Background: add an image by clicking the os-camera (camera) icon,
  or use a background color by clicking the fa-ban (None) icon and selecting a
  color.

- Size: select the size of the cover (Full screen, Half screen,
  or Fit text).
- Filter Intensity: choose the cover filter's intensity
  (Low, Medium, High) or disable it by selecting

After applying the desired changes, click Save.

Tags

Tags let visitors filter blog posts that share a specific tag. They are displayed at the bottom of
each post.

To create a tag, go to Website --> Configuration --> Tags and click

- Name
- Category
- Color
- Used in: to apply tags to existing blog posts, click Add a line.

Add and create tags directly from posts by clicking Edit --> Style and
selecting the post's cover. Under Tags, click Choose a record..., and select
or create a tag by writing a new name.

Tag category

Tag categories let you organize tags displayed on the sidebar into groups.

To create tag categories, go to Website --> Configuration --> Tag Categories
and click New.

Blog landing pages

To create multiple blogs, go to Website --> Configuration --> Blogs and click

The Blog menu gathers all the blogs and their posts.

Customize blog landing pages

To customize the blog landing pages, go to Edit --> Style and use the available
options as desired.

- Top Banner: display or hide the page's banner:

  - Full-width: make the banner use the page's full-width or display a condensed banner.
- Layout: display blog posts as a grid or as a list.
- Cards: display blog posts with or without the *card* effect.
- Increase Readability: enlarge or not the blog posts' size for better reading comfort .
- Sidebar: display or hide a sidebar that contains an *about us* section, and, depending
  on the options selected:

  - Archives: allow visitors to view all posts from a specific month by selecting it.
  - Follow Us: add clickable icons that link to your social network profiles and a
    subscription field for your newsletter.
  - Tags List: allow visitors to view all blog posts that share a specific tag by
    selecting it.

- Posts List: select Cover to display the posts' covers or select

- Author: display the posts' authors.
- Comments/Views Stats: display or hide the number of comments and views for each post.
- Teaser & Tags: display the posts' first sentences and tags.

After applying the desired changes, click Save.

Website

the product Website offers a user-friendly platform for creating and managing your website. It includes
various tools and features to help you design, publish, and maintain web pages without needing
advanced technical skills. You can easily customize layouts, add multimedia content, and integrate
with other the product apps to expand your website's functionality.

Cookies bar

Cookies are small text files sent to your device when you visit a website. They are processed
and stored by your browser and record visitor information like login details, preferences, and
browsing history. Essential cookies are necessary for the website to function, while
optional cookies are used to analyze behavior or display ads.

Data protection laws require notifying visitors about data collection methods and purposes.
Cookies bar fulfill this obligation by informing visitors on their first visit and allowing them
to decide whether to store all or only essential cookies on their device.

Configuration

To add a cookies bar on your website, go to Website --> Configuration -->
Settings and enable Cookies Bar in the Tracking & SEO section. This
activates Block tracking 3rd-party services by default, including social media, video
hosting platforms, and Google services. Click Add domains to the block list to include
other external websites. These services remain blocked on your website until visitors accept
optional cookies.

Cookies policy

When you enable the cookies bar for your website, the product creates the Cookie Policy page
(`/cookie-policy`) containing a list of cookies set by default, with their purpose and examples.

Edit the Cookies policy page

To access it, click the Cookie Policy hyperlink in the cookies bar or open the page from

To adapt the content of the page according to your needs, click the Edit button.

Customization

To adapt the display of the cookies bar on your website, click Edit on the website
editor, go to the Invisible Elements section at the bottom of the panel, and click

cookies bar, and enable Backdrop to gray out the page in the background when the cookies
bar is displayed on the screen.

Click anywhere in the building block to further customize the appearance of the cookies bar using

To edit the contents of the cookies bar (i.e., the consent message), click directly in the building
block.

Domain names

Domain names serve as easily recognizable labels for online locations such as websites, translating
difficult-to-remember numerical IP addresses into readable, memorable web addresses.

<../../../../administration/odoo_sh>` databases use a subdomain of the `the product.com` domain by default
(e.g., `mycompany.the product.com`).

However, you can register a free domain name on the product Online or

Register a free domain name

To register a one-year free domain name for the product Online database:

#. Open the database manager.
#. Click the database name and select fa-globe Domain Names.
#. Search for the desired domain name and check its availability.
#. Select the desired domain name, fill in the Domain Owner form, and click

   .. important::
      A verification email from `noreply@domainnameverification.net` will be sent to the email
      address provided. Verifying the email address is necessary to keep the domain active and
      receive the renewal quote before expiration.

#. Finally, map the domain name to your the product website.

DNS records

To manage a free domain name's DNS (domain name system) records:

#. Open the database manager.
#. Click the database name and select fa-globe Domain Names.
#. Click DNS.

Subdomains

Adding a subdomain label to a free domain name (e.g., `subdomain.yourdomain.com`) allows

received on an alias <domain-name/register/mailbox/subdomain>` (e.g.,
`email@subdomain.yourdomain.com`).

To create a subdomain, add a CNAME record:

#. Open the database manager.
#. Click the database name and select fa-globe Domain Names.
#. Click DNS.
#. Click Add DNS record and select CNAME.

   - Name: enter the desired subdomain label (e.g., `subdomain`).
   - Content: enter original database domain with a period at the end (e.g.,
     `mycompany.the product.com.`).

#. Click Add record.

Mailbox

The free domain name does not include a mailbox. However, there are two options for linking it
to a mailbox.

Use a subdomain

Create a dedicated subdomain (for example, mail.mydomain.com) to route incoming emails
directly to your the product database via DNS records.

Use an external email provider

To use an external email provider, it is necessary to add an MX record:

#. Open the database manager.
#. Click the database name and select fa-globe Domain Names.
#. Click DNS.
#. Click Add DNS record and select MX.
#. Fill in the Name, Content, and Priority fields according to
   the external email provider.

Google Workspace

To use a free domain name with Gmail, register for Google Workspace.

During the registration process, select Set up using your existing domain when asked to

asked What's your business's domain name?.

Domain ownership verification

#. Sign in to Google Workspace. When asked to verify you own your domain, click Switch to
   manual verification.

   .. image:: domain_names/workspace-verify-switch.png

#. Select `gandi.net` as the Domain host and click Continue.

   .. image:: domain_names/workspace-verify-domain.png

#. Copy the content of the Value field under TXT record. Leave the window
   open.

   .. image:: domain_names/workspace-verify-code.png

#. Add a TXT record.

   #. Open the database manager.
   #. Click the database name and select fa-globe Domain Names.
   #. Click DNS.
   #. Click Add DNS record and select TXT.
   #. Enter `@` in the Name field, paste the Value provided by Google in the

   .. image:: domain_names/workspace-txt.png

#. Go back to Google Workspace, tick the box at the bottom, and click Confirm.

Redirect emails to Gmail

#. Open the database manager.
#. Click the database name and select fa-globe Domain Names.
#. Click DNS.
#. Click Add DNS record and select MX.
#. Enter `@` in the Name field, `1` in the Priority field,
   `smtp.google.com.` in the Content field, and click Add record.

   .. image:: domain_names/workspace-mx.png

#. Open the Google Workspace Admin console, click

Configure an existing domain name

If you already own a domain name, you can use it for your the product website.

Add a CNAME record

Adding a CNAME record to forward your domain name to the address of your the product database is required.

The specific instructions depend on your DNS hosting service.

Redirect a naked domain

To let visitors use your naked domain name (a domain name without any subdomains or prefixes)
(`yourdomain.com`), creating a 301 redirect (a permanent redirect from one URL to another)
to `www.yourdomain.com` is required:

- from ` to ` and
- from ` to `

The specific instructions depend on your DNS hosting service. However, not all of them offer to
redirect a naked domain to HTTPS. If you encounter any issues, we recommend using Cloudflare.

Using Cloudflare to secure and redirect a naked domain

#. Sign up and log in to Cloudflare.
#. Enter your domain name on Cloudflare's dashboard and
   select Quick scan for DNS records.
#. Choose a plan (the free plan is sufficient).
#. Follow Cloudflare's instructions and recommendations to complete the activation.
#. Add a CNAME record to redirect your naked domain (`yourdomain.com`) to the `www` subdomain (e.g.,
   `www.yourdomain.com`) by clicking DNS in the navigation menu, then clicking the

   - Type: select `CNAME`.
   - Name: enter `@` (or `yourdomain.com`).
   - Target: enter `www.` + `yourdomain.com`, e.g., `www.yourdomain.com`.
   - Proxy status: toggle the option on (Proxied).
   - Click Save.

   .. image:: domain_names/cloudflare-cname-www.png

#. Add another second CNAME record to redirect the `www` subdomain (e.g., `www.yourdomain.com`) to
   your database address (e.g., `mycompany.the product.com`) using the following configuration:

   - Type: select `CNAME`.
   - Name: enter `www.` followed by your domain name, e.g., `www.yourdomain.com`.
   - Target: enter your database's address as defined at its creation e.g.,
     `mycompany.the product.com`
   - Proxy status: toggle the option off (DNS only).
   - Click Save.

   .. image:: domain_names/cloudflare-cname-db.png

#. Define a redirect rule to permanently redirect (301) your naked domain (e.g., `yourdomain.com`)
   to both ` and ` by going to Rules --> Overview --> Create rule
   --> Redirect Rule. On that page:

   - Enter any Rule name.
   - Under the If incoming requests match... section, select Custom filter
     expression and use the following configuration:

     - Field: select `Hostname`.
     - Operator: select `equals`.
     - Value: enter your domain name, e.g., `yourdomain.com`.

   - Under the Then... section, use the following configuration:

     - Type: select `Dynamic`.
     - Expression: enter the following expression `concat("
       http.request.uri.path)`, replacing `yourdomain.com` with your domain name.
     - Status code: select `301`.
     - Preserve query string: enable the option by ticking the box.

   - Click Deploy.

   .. image:: domain_names/cloudflare-redirect-rule.png

#. Go to SSL/TLS --> Overview --> Configure and ensure the encryption mode is set
   to Full.

   .. image:: domain_names/cloudflare-encryption.png

Map a domain name to the product database

SSL encryption (HTTPS protocol)

SSL encryption allows visitors to navigate a website over a secure connection, indicated by the
* protocol at the beginning of a web address rather than the non-secure *
protocol.

the product generates a separate SSL certificate for each domain mapped to a database using Let's Encrypt's certificate authority and ACME protocol. Any CAA records configured for the domain must allow
Let's Encrypt, otherwise certificate generation may fail.

Web base URL of a database

The *web base URL* or root URL of a database affects your main website address and all the links
sent to your customers (e.g., quotations, portal links, etc.).

To make your custom domain name the *web base URL* of your database, access your database using your
custom domain name and log in as an administrator (a user part of the Settings access right
group under Administration).

Map a domain name to the product website

Go to Website --> Configuration --> Settings. If you have multiple websites, select
the one you want to configure. In the Domain field, enter the URL of your website (e.g.,
` and Save.

Subdomains

Adding a subdomain label to a domain name (e.g., `subdomain.yourdomain.com`) allows creating

#. Add a CNAME record to forward your subdomain (e.g., `subdomain.yourdomain.com`) to the address of
   your the product database (e.g., `mycompany.the product.com`).
#. Map the subdomain to your the product database.
#. Map the subdomain to your the product website.

Multiple websites

the product allows you to create multiple websites from the same database.
This can be useful, for example, if you have multiple brands operating under your organization, or
if you want to create separate websites for different products/services or audiences.

Creating another website

Creating multiple websites requires having *at least* one domain name.
Different alternatives exist, but before creating another website, you should either

- Register a domain name for free with the product for your first website,
  then, for your second website, either:

  - Use a subdomain of your free the product domain name.
  - Use a domain name you purchased.

- Use a domain name you purchased for your first website, then, for
  your second website, either:

  - Use a subdomain of your purchased domain name.
  - Use a domain name you purchased.
  - Register a domain name for free with the product.

Once it is time to map your second domain name's address to your second the product website, you can `create <../../website_creation>` it and map it
directly by entering the second website's address in the Website Domain field (e.g.,
` or `

Website-specific configuration

Most website settings are website-specific. To access the settings of a website, go to

website selection drop-down at the top left of the settings page.

eCommerce features

eCommerce features such as products, eCommerce categories, pricelists, discounts, payment providers,
etc., can be restricted to a specific website.

Customer accounts

To allow your customers to use the same account on all of your websites, go to

Accounts`.

Pricing

Products can be priced differently based on the website using pricelists. To do so:

#. Go to Website --> Configuration --> Settings.
#. Scroll down to the Shop - Products section and select the Pricelists
   option Multiple prices per product.
#. Click Pricelists to define new pricelists or edit existing ones.
#. Select the pricelist or click New to create a new one, then select the

Content availability across websites

By default, most records (products, courses, forum posts, etc.) created from the frontend are
displayed on all websites. To restrict the content to a single website, search for the

For example, for products, go to eCommerce --> Products, select a product, open the

Website pages

To modify the website on which a page is published, proceed as follows:

#. Go to Website --> Site --> Pages.
#. Open the search panel and select the website on which the page is currently published.

   .. image:: multi_website/website-pages-search.png

#. Tick the check box next to the page(s) you want to change.
#. Click the Website field and select the website, or empty it to publish the page on
   all websites.

Reporting

Each website has its own analytics. To switch between websites, use
the buttons in the top right corner.

Other reporting data, such as eCommerce dashboard data, online sales analyses, and visitors, can be
grouped by website by opening the search panel and selecting Group by --> Website.

Forms spam protection

reCAPTCHA v3 <website/spam_protection/google-recaptcha>` protect website forms against spam and
abuse. They attempt to distinguish between human and bot submissions using non-interactive
challenges based on telemetry and visitor behavior.

Cloudflare Turnstile configuration

On Cloudflare

#. Create or log in
   to a Cloudflare account.
#. In the dashboard's navigation sidebar, go to Application security --> Turnstile.
#. On the Overview page, click fa-plus Add widget.
#. Add a Widget name to easily identify it.
#. Click fa-plus Add Hostnames, enter a custom hostname (e.g., *example.com* or
   *subdomain.example.com*), then click Add twice.
#. Select a Widget Mode:

   - The Managed mode is recommended, as it allows Turnstile to prompt visitors to
     confirm they are human when necessary.

     .. image:: spam_protection/turnstile-human.png

   - For the Non-interactive and Invisible modes, visitors are never
     prompted to interact. In Non-interactive mode, a loading widget can be displayed to
     warn visitors that Turnstile protects the form; however, the widget is not supported by the product.

     .. note::
        If the Turnstile check fails, visitors are not able to submit the form, and the following
        error message is displayed:

        .. image:: spam_protection/turnstile-error.png

#. Click Create.

The generated keys are then displayed. Leave the page open for convenience, as copying the keys in
the product is required next.

On the product

#. From the database dashboard, open the Settings app. Under Integrations, enable

#. Open the Cloudflare Turnstile page, copy the

#. Open the Cloudflare Turnstile page, copy the Secret Key, and paste it into the

#. Click Save.

reCAPTCHA v3 configuration

On Google
