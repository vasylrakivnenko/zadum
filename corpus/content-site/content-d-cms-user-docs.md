# Accessibility considerations

Accessibility for CMS-driven websites is a matter of modeling content appropriately, creating accessible templates, and authoring accessible content with readability and accessibility guidelines in mind.

the product generally puts developers in control of content modeling and front-end markup, but there are a few areas to be aware of nonetheless, and ways to help authors be aware of readability best practices.
Note there is much more to building accessible websites than we cover here – see our list of accessibility resources for more information.

(content_modeling)=

## Content modeling

As part of defining your site’s models, here are areas to pay special attention to:

### Alt text for images

Wherever an image is used, the content editor should be able to mark the image as decorative or provide a context-specific text alternative. The image embed in our rich text editor supports this behavior. the product 6.3 added `ImageBlock` to provide this behavior for images within StreamFields.

the product 6.3 also added an optional `description` field to the product image model and to custom image models inheriting from `the product.images.models.AbstractImage`. Text in that field will be offered as the default alt text when inserting images in rich text or using ImageBlock. If the description field is empty, the title field will be used instead. If you would like to customize this behavior, override the `default_alt_text` property in your image model.

### Embeds title

Missing embed titles are common failures in accessibility audits of the product websites. In some cases, the product embeds’ iframe doesn’t have a `title` attribute set. This is often a problem with OEmbed providers.
This is very problematic for screen reader users, who rely on the title to understand what the embed is, and whether to interact with it or not.

If your website relies on embeds that have missing titles, make sure to either:

-   Add the OEmbed _title_ field as a `title` on the `iframe`.
-   Add a custom mandatory Title field to your embeds, and add it as the `iframe`’s `title`.

### Available heading levels

the product makes it very easy for developers to control which heading levels should be available for any given content, via rich text features or custom StreamField blocks.
In both cases, take the time to restrict what heading levels are available so the pages’ document outline is more likely to be logical and sequential. Consider using the following restrictions:

-   Disallow `h1` in rich text. There should only be one `h1` tag per page, which generally maps to the page’s `title`.
-   Limit heading levels to `h2` for the main content of a page. Add `h3` only if deemed necessary. Avoid other levels as a general rule.
-   For content that is displayed in a specific section of the page, limit heading levels to those directly below the section’s main heading.

If managing headings via StreamField, make sure to apply the same restrictions there.

### Bold and italic formatting in rich text

By default, the product stores its bold formatting as a `b` tag, and italic as `i` (#4665). While those tags don’t necessarily always have correct semantics (`strong` and `em` are more ubiquitous), there isn’t much consequence for screen reader users, as by default screen readers do not announce content differently based on emphasis.

If this is a concern to you, you can change which tags are used when saving content with rich text format converters. In the future, rich text rewrite handlers should also support this being done without altering the storage format (#4223).

### TableBlock

Screen readers will use row and column headers to announce the context of each table cell. Please encourage editors to set row headers and/or column headers as appropriate for their table.

Always add a Caption, so screen reader users navigating the site’s tables get an overview of the table content before it is read.

(accessibility_in_templates)=

## Accessibility in templates

Here are common gotchas to be aware of to make the site’s templates as accessible as possible.

### Alt text in templates

See the content modeling section above. Additionally, make sure to customize images’ alt text, either setting it to the relevant field, or to an empty string for decorative images, or images where the alt text would be a repeat of other content.
Even when your images have alt text coming directly from the image model, you still need to decide whether there should be alt text for the particular context the image is used in. For example, avoid alt text in listings where the alt text just repeats the listing items’ title.

### Empty heading tags

In both rich text and custom StreamField blocks, it’s easy for editors to create a heading block but not add any content to it. The built-in content checker will highlight empty headings so editors can find and fix them. If you need stricter enforcement:

-   Add validation rules to those fields, making sure the page can’t be saved with the empty headings, for example by using the StreamField `CharBlock` which is required by default.
-   Consider adding similar validation rules for rich text fields.

Alternately, you can hide empty heading blocks with CSS:

### Forms

The Form builder uses Django’s forms API. Here are considerations specific to forms in templates:

-   Avoid rendering helpers such as `as_table`, `as_ul`, `as_p`, which can make forms harder to navigate for screen reader users or cause HTML validation issues.
-   Make sure to visually distinguish required and optional fields.
-   Take the time to group related fields together in `fieldset`, with an appropriate `legend`, in particular for radios and checkboxes.
-   If relevant, use the appropriate `autocomplete` and `autocapitalize` attributes.
-   For Date and Datetime fields, make sure to display the expected format or an example value (see Django ticket #32340). Or use input type="date".
-   For Number fields, consider whether `input type="number"` really is appropriate, or whether there may be better alternatives such as inputmode.

Make sure to test your forms’ implementation with assistive technologies, and review official W3C guidance on accessible forms development for further information.

(authoring_accessible_content)=

## Authoring accessible content

A number of built-in tools and additional resources are available to help create accessible content.

(built_in_content_checker)=

### Built-in content checker

the product includes an content checker built into the user bar and editing views supporting previews. The checker can help authors create more accessible websites following best practices and accessibility standards like WCAG.

The checker is based on the Axe testing engine and scans the loaded page for errors.

By default, the checker includes the following rules to find common issues in authored content:

-   `button-name`: `` elements must always have a text label.
-   `empty-heading`: This rule checks for headings with no text content. Empty headings are confusing to screen readers users and should be avoided.
-   `empty-table-header`: Table header text should not be empty
-   `frame-title`: `` elements must always have a text label.
-   `heading-order`: This rule checks for incorrect heading order. Headings should be ordered in a logical and consistent manner, with the main heading (h1) followed by subheadings (h2, h3, etc.).
-   `input-button-name`: `` button elements must always have a text label.
-   `link-name`: `` link elements must always have a text label.
-   `p-as-heading`: This rule checks for paragraphs that are styled as headings. Paragraphs should not be styled as headings, as they don’t help users who rely on headings to navigate content.
-   `alt-text-quality`: A custom rule ensures that image alt texts don't contain anti-patterns like file extensions and underscores.
-   `empty-meta-description`: An SEO-focused rule to make sure meta description tags always contain content when present.

To customize how the checker is run (such as what rules to test), you can define a custom subclass of {class}`~the product.admin.userbar.ContentCheckerItem` and override the attributes to your liking. Then, swap the instance of the default `ContentCheckerItem` with an instance of your custom class via the `construct_wagtail_userbar` hook.

For example, Axe's `p-as-heading` rule evaluates combinations of font weight, size, and italics to decide if a paragraph is acting as a heading visually. Depending on your heading styles, you might want Axe to rely only on font weight to flag short, bold paragraphs as potential headings.

(custom_content_checks)=

### Custom content checks

You can also implement custom checks. This can be useful to enforce more advanced accessibility checks, or other best practices unrelated to accessibility. This requires configuration via hooks, and registration of any client-side check evaluation via the `window.the product.userbar.registerCheck` API.

First, we will configure our custom `ContentCheckerItem` to add this check. We need to:

- Add a new Axe check via `get_axe_custom_checks`.
- Create a new rule that uses this check with `get_axe_custom_rules`.
- Provide helpful content for the rule with `get_axe_messages`.
- Configure our userbar item to load the JS file containing the check.

For custom checks, the `id` is mandatory and should be unique. `options` is optional and can be used to pass additional parameters to the check function. Here, we configure which link text patterns to flag. For the custom rule, the `selector` defines that it will flag element text on all anchor elements, regardless of where they appear on the page. The rule’s `any` lists all of the checks that it will run.

In the `custom-checks.js` file, we implement the JavaScript function that will evaluate page contents, and register it. The `registerCheck` method takes two arguments: the check identifier and the evaluation function.

### Environment-specific checks

The checks you run in production should be restricted to issues your content editors can fix themselves; warnings about things out of their control will only teach them to ignore all warnings. However, it may be useful for you to run additional checks in your development environment.

The `ContentCheckerItem` class accepts an `in_editor` argument, which is set to `True` when it is instantiated within the page editor. This allows you to customize the Axe configuration based on whether Axe is being run in the page editor or your site's frontend. For example, to change the `allowedOrigins` property in the Axe spec to allow cross-domain iframe communication when the accessibility checker is loaded in a headless frontend.

#### ContentCheckerItem reference

The following is the reference documentation for the `ContentCheckerItem` class:

### the product-accessibility

the product-accessibility is a third-party package which adds tota11y to the product previews.
This makes it easy for authors to run basic accessibility checks – validating the page’s heading outline, or link text.

### help_text and HelpPanel

Occasional the product users may not be aware of your site’s content guidelines, or best practices of writing for the web. Use fields’ `help_text` and `HelpPanel` (see Panel types).

### Readability

Readability is fundamental to accessibility. One of the ways to improve text content is to have a clear target for reading level / reading age, which can be assessed with the product-readinglevel as a score displayed in rich text fields.

(accessibility_resources)=

### prefers-reduced-motion

Some users, such as those with vestibular disorders, may prefer a more static version of your site. You can respect this preference by using the `prefers-reduced-motion` media query in your CSS.

Note that `prefers-reduced-motion` is only applied for users who enabled this setting in their operating system or browser. This feature is supported by Chrome, Safari and Firefox. For more information on reduced motion, see the MDN Web Docs.

## Accessibility resources

We focus on considerations specific to the product websites, but there is much more to accessibility. Here are valuable resources to learn more, for developers but also designers and authors:

-   W3C Accessibility Fundamentals
-   The A11Y Project
-   US GSA – Accessibility for Teams
-   UK GDS – Dos and don’ts on designing for accessibility
-   Accessibility Developer Guide

(private_pages)=

# Private pages

Users with publish permission on a page can set it to be private by clicking the 'Privacy' control in the top right corner of the page explorer or editing interface. This sets a restriction on who is allowed to view the page and its subpages. Several different kinds of restrictions are available:

-   **Accessible to any logged-in users:** The user must log in to view the page. All user accounts are granted access, regardless of permission level.
-   **Accessible with a shared password:** The user must enter the given shared password to view the page. This is appropriate for situations where you want to share a page with a trusted group of people, but giving them individual user accounts would be overkill. The same password is shared between all users, and this works independently of any user accounts that exist on the site.
-   **Accessible to users in specific groups:** The user must be logged in, and a member of one or more of the specified groups, in order to view the page.

You can disable shared password for pages using `WAGTAIL_PRIVATE_PAGE_OPTIONS`.

Any existing shared password usage will remain active but will not be viewable by the user within the admin, these can be removed in the Django shell as follows.

(private_collections)=

## Private collections (restricting documents)

Similarly, documents can be made private by placing them in a collection with appropriate privacy settings (see: ).

You can also disable shared password for collections (which will impact document links) using `WAGTAILDOCS_PRIVATE_COLLECTION_OPTIONS`.

Any existing shared password usage will remain active but will not be viewable within the admin, these can be removed in the Django shell as follows.

(login_page)=

## Setting up a login page

Private pages and collections (restricting documents) work on the product out of the box - the site implementer does not need to do anything to set them up.

However, the default "login" and "password required" forms are only bare-bones HTML pages, and site implementers may wish to replace them with a page customized to their site design.

The basic login page can be customized by setting `WAGTAIL_FRONTEND_LOGIN_TEMPLATE` to the path of a template you wish to use:

the product uses Django's standard `django.contrib.auth.views.LoginView` view here, and so the context variables available on the template are as detailed in Django's login view documentation.

If the stock Django login view is not suitable - for example, you wish to use an external authentication system, or you are integrating the product into an existing Django site that already has a working login view - you can specify the URL of the login view via the `WAGTAIL_FRONTEND_LOGIN_URL` setting:

To integrate the product into a Django site with an existing login mechanism, setting `WAGTAIL_FRONTEND_LOGIN_URL = LOGIN_URL` will usually be sufficient.

(set_default_page_privacy)=

## Setting the default privacy restriction

You can modify the default privacy restriction of a page by overriding the {meth}`~the product.models.AbstractPage.get_default_privacy_setting` method for the page. This could be done to make a page type require login by default, but it can also be used for more complex configurations, such as adjusting the default privacy setting based on the user or using an auto-generated shared password.

The method must return a dictionary with at least a `type` key. The value must be one of the following values for {class}`~the product.models.PageViewRestriction`'s {attr}`~the product.models.PageViewRestriction.restriction_type`:

-   `BaseViewRestriction.NONE` - No restrictions
-   `BaseViewRestriction.PASSWORD` - Password protected (requires additional `password` key in the dictionary)
-   `BaseViewRestriction.GROUPS` - Group restricted (requires additional `groups` key with list of Group objects)
-   `BaseViewRestriction.LOGIN` - Login required

## Setting up a global "password required" page

By setting `WAGTAIL_PASSWORD_REQUIRED_TEMPLATE` in your Django settings file, you can specify the path of a template which will be used for all "password required" forms on the site (except for page types that specifically override it - see below):

This template will receive the same set of context variables that the blocked page would pass to its own template via `get_context()` - including `page` to refer to the page object itself - plus the following additional variables (which override any of the page's own context variables of the same name):

-   **form** - A Django form object for the password prompt; this will contain a field named `password` as its only visible field. Several hidden fields may also be present, so the page must loop over `form.hidden_fields` if not using one of Django's rendering helpers such as `form.as_p`.
-   **action_url** - The URL that the password form should be submitted to, as a POST request.

A basic template suitable for use as `WAGTAIL_PASSWORD_REQUIRED_TEMPLATE` might look like this:

Password restrictions on documents use a separate template, specified through the setting `WAGTAILDOCS_PASSWORD_REQUIRED_TEMPLATE`; this template also receives the context variables `form` and `action_url` as described above.

## Setting a "password required" page for a specific page type

The attribute `password_required_template` can be defined on a page model to use a custom template for the "password required" view, for that page type only. For example, if a site had a page type for displaying embedded videos along with a description, it might choose to use a custom "password required" template that displays the video description as usual but shows the password form in place of the video embed.

## Privacy settings on page aliases

If an alias is created of a page that has a privacy restriction set on it, that restriction will also apply to the alias in its new location, and any descendants of it. Privacy restrictions set on an ancestor of an aliased page do not apply to the alias; instead, the alias follows any privacy restriction rules set on its own ancestors. In this way, the alias behaves in the same way that would be seen from a page being copied to a new location (along with all privacy restrictions directly defined on it).

(pages_theory)=

# Theory

## Introduction to trees

If you're unfamiliar with trees as an abstract data type, you might want to review the concepts involved>).

As a web developer, though, you probably already have a good understanding of trees as filesystem directories or paths. the product pages can create the same structure, as each page in the tree has its own URL path, like so:

the product admin interface uses the tree to organize content for editing, letting you navigate up and down levels in the tree through its Explorer menu. This method of organization is a good place to start in thinking about your own the product models.

### Nodes and leaves

It might be handy to think of the `Page`-derived models you want to create as being one of two node types: parents and leaves. the product isn't prescriptive in this approach, but it's a good place to start if you're not experienced in structuring your own content types.

#### Nodes

Parent nodes on the product tree probably want to organize and display a browseable index of their descendants. A blog, for instance, needs a way to show a list of individual posts.
