

## Page bundles

the product supports page-relative images and other resources packaged into `Page Bundles`.

These terms are connected, and you also need to read about page resources and image processing to get the full picture.

The file tree above shows three bundles. Note that the home page bundle cannot contain other content pages, although other files (images etc.) are allowed.

## Organization of content source

In the product, your content should be organized in a manner that reflects the rendered website.

While the product supports content nested at any level, the top levels (i.e. `content/`) are special in the product and are considered the content type used to determine layouts etc. To read more about sections, including how to nest them, see sections.

Without any additional configuration, the following will automatically work:

## Path breakdown in the product

The following demonstrates the relationships between your content organization and the output URL structure for your the product website when it renders. These examples assume you are using pretty URLs, which is the default behavior for the product. The examples also assume a key-value of `baseURL = " in your project configuration.

### Index pages: `_index.md`

`_index.md` has a special role in the product. It allows you to add front matter and content to `home`, `section`, `taxonomy`, and `term` pages.

> [!NOTE]
> Access the content and metadata within an `_index.md` file by invoking the `GetPage` method on a `Site` or `Page` object.

You can create one `_index.md` for your home page and one in each of your content sections, taxonomies, and terms. The following shows typical placement of an `_index.md` that would contain content and front matter for a `posts` section list page on the product website:

At build, this will output to the following destination with the associated values:

The sections can be nested as deeply as you want. The important thing to understand is that to make the section tree fully navigational, at least the lower-most section must include a content file. (i.e. `_index.md`).

### Single pages in sections

Single content files in each of your sections will be rendered by a page template. Here is an example of a single `post` within `posts`:

When the product builds your site, the content will be output to the following destination:

## Paths explained

The following concepts provide more insight into the relationship between your project's organization and the default the product behavior when building output for the website.

### `section`

A default content type is determined by the section in which a content item is stored. `section` is determined by the location within the project's `content` directory. `section` cannot be specified or overridden in front matter.

### `slug`

The `slug` is the last segment of the URL path, defined by the file name and optionally overridden by a `slug` value in front matter. See URL management for details.

### `path`

A content's `path` is determined by the section's path to the file. The file `path`:

- Is based on the path to the content's location AND
- Does not include the slug

### `url`

The `url` is the entire URL path, defined by the file path and optionally overridden by a `url` value in front matter. See URL management for details.

## Overview

The example above has two top-level sections: articles and products. None of the directories under articles are sections, while all of the directories under products are sections. A section within a section is a known as a nested section or subsection.

## Explanation

Sections and non-sections behave differently.

  Sections Non-sections
:-- :-: :-:
Directory names become URL segments :heavy_check_mark: :heavy_check_mark:
Have logical ancestors and descendants :heavy_check_mark: :x:
Have list pages :heavy_check_mark: :x:

With the file structure from the example above:

1. The list page for the articles section includes all articles, regardless of directory structure; none of the subdirectories are sections.
1. The articles/2022 and articles/2023 directories do not have list pages; they are not sections.
1. The list page for the products section, by default, includes product-1 and product-2, but not their descendant pages. To include descendant pages, use the `RegularPagesRecursive` method instead of the `Pages` method in the _section_ template.
1. All directories in the products section have list pages; each directory is a section.

## Template selection

the product has a defined lookup order to determine which template to use when rendering a page. The lookup rules consider the top-level section name; subsection names are not considered when selecting a template.

With the file structure from the example above:

Content directory Section template
:-- :--
`content/products` `layouts/products/section.html`
`content/products/product-1` `layouts/products/section.html`
`content/products/product-1/benefits` `layouts/products/section.html`

Content directory Page template
:-- :--
`content/products` `layouts/products/page.html`
`content/products/product-1` `layouts/products/page.html`
`content/products/product-1/benefits` `layouts/products/page.html`

If you need to use a different template for a subsection, specify `type` and/or `layout` in front matter.

## Ancestors and descendants

A section has one or more ancestors (including the home page), and zero or more descendants. With the file structure from the example above:

The content file (benefit-1.md) has four ancestors: benefits, product-1, products, and the home page. This logical relationship allows us to use the `Parent` and `Ancestors` methods to traverse the site structure.

For example, use the `Ancestors` method to render breadcrumb navigation.

With this CSS:

the product renders this, where each breadcrumb is a link to the corresponding page:

## What is a taxonomy?

the product includes support for user-defined groupings of content called **taxonomies**. Taxonomies are classifications of logical relationships between content.

### Definitions

Taxonomy
: A categorization that can be used to classify content

Term
: A key within the taxonomy

Value
: A piece of content assigned to a term

## Example taxonomy: movie website

Let's assume you are making a website about movies. You may want to include the following taxonomies:

- Actors
- Directors
- Studios
- Genre
- Year
- Awards

Then, in each of the movies, you would specify terms for each of these taxonomies (i.e., in the front matter of each of your movie content files). From these terms, the product would automatically create pages for each Actor, Director, Studio, Genre, Year, and Award, with each listing all of the Movies that matched that specific Actor, Director, Studio, Genre, Year, and Award.

### Movie taxonomy organization

To continue with the example of a movie site, the following demonstrates content relationships from the perspective of the taxonomy:

From the perspective of the content, the relationships would appear differently, although the data and labels used are the same:

### Assign terms in front matter

Continuing with the example above, assign the terms for each movie in its front matter. Use the plural name of each taxonomy as the field name, and assign the terms as an array, even when a movie has only one term for a given taxonomy:

title = 'Unbreakable'
actors = ['Bruce Willis','Samuel L. Jackson']
directors = ['M. Night Shyamalan']

Each term is a string, and a taxonomy is a flat list of terms rather than a nested data structure. To associate additional data with a term, create a page for the term as described in Metadata.

### Default destinations

When taxonomies are used the product will automatically create both a page listing all the taxonomy's terms and individual pages with lists of content associated with each term. For example, a `categories` taxonomy declared in your configuration and used in your content front matter will create the following pages:

- A single page at `example.com/categories/` that lists all the terms within the taxonomy
- Individual taxonomy list pages (e.g., `/categories/development/`) for each of the terms that shows a listing of all pages marked as part of that taxonomy within any content file's front matter

## Configuration

See configure taxonomies.

## Assign terms to content

To assign one or more terms to a page, create a front matter field using the plural name of the taxonomy, then add terms to the corresponding array. For example:

title = 'Example'
tags = ['Tag A','Tag B']
categories = ['Category A','Category B']

## Taxonomic weight

Assign a taxonomic weight using a front matter key named `[taxonomy_name]_weight`.

title = 'Organic Chemistry'
weight = 10
tags_weight = 1000
tags = ['chemistry','science']

With the front matter above, the `organic-chemistry` page will float towards the top of the list on section and home pages, and it will sink towards the bottom of the list on the `chemistry` and `science` term pages.

## Metadata

Display metadata about each term by creating a corresponding branch bundle in the `content` directory.

For example, create an `authors` taxonomy:

[taxonomies]
author = 'authors'

Then create content with one branch bundle for each term:

Then add front matter to each term page:

title = 'John Smith'
affiliation = 'University of Chicago'

Then create a _taxonomy_ template specific to the `authors` taxonomy:

In the example above we list each author including their affiliation and portrait.

Or create a _term_ template specific to the `authors` taxonomy:

In the example above we display the author including their affiliation and portrait, then a list of associated content.

## Overview

To create a menu for your site:

1. Define the menu entries
1. Localize each entry
1. Render the menu with a template

Create multiple menus, either flat or nested. For example, create a main menu for the header, and a separate menu for the footer.

There are three ways to define menu entries:

1. Automatically
1. In front matter
1. In your project configuration

> [!NOTE]
> Although you can use these methods in combination when defining a menu, the menu will be easier to conceptualize and maintain if you use one method throughout the site.

## Define automatically

To automatically define a menu entry for each top-level section of your site, enable the section pages menu in your project configuration.

sectionPagesMenu = 'main'

This creates a menu structure that you can access with `site.Menus.main` in your templates. See menu templates for details.

## Define in front matter

To add a page to the "main" menu:

title = 'About'
menus = 'main'

Access the entry with `site.Menus.main` in your templates. See menu templates for details.

To add a page to the "main" and "footer" menus:

title = 'Contact'
menus = ['main','footer']

Access the entry with `site.Menus.main` and `site.Menus.footer` in your templates. See menu templates for details.

> [!NOTE]
> The configuration key in the examples above is `menus`. The `menu` (singular) configuration key is an alias for `menus`.

### Properties

Use these properties when defining menu entries in front matter:

### Example

This front matter menu entry demonstrates some of the available properties:

title = 'Software'
[menus.main]
parent = 'Products'
weight = 20
pre = ''
[menus.main.params]
class = 'center'

Access the entry with `site.Menus.main` in your templates. See menu templates for details.

## Define in project configuration

See configure menus.

## Localize

the product provides two methods to localize your menu entries. See multilingual.

## Render

See menu templates.

## Configuration

See configure languages.

## Translate your content

There are two ways to manage your content translations. Both ensure each page is assigned a language and is linked to its counterpart translations.

### Translation by file name

Considering the following example:

1. `/content/about.en.md`
1. `/content/about.fr.md`

The first file is assigned the English language and is linked to the second.
The second file is assigned the French language and is linked to the first.

Their language is assigned according to the language code added as a suffix to the file name.

By having the same path and base file name, the content pieces are linked together as translated pages.

> [!NOTE]
> The language code in a file name must be lowercase. For example, use `about.en-us.md` instead of `about.en-US.md`.

> [!NOTE]
> If a file has no language code, it will be assigned the default language.

### Translation by content directory

This system uses different content directories for each of the languages. Each language's `content` directory is set using the `contentDir` parameter.

[languages.en]
contentDir = 'content/english'
label = "English"
weight = 10

[languages.fr]
contentDir = 'content/french'
label = "Français"
weight = 20

The value of `contentDir` can be any valid path -- even absolute path references. The only restriction is that the content directories cannot overlap.

Considering the following example in conjunction with the configuration above:

1. `/content/english/about.md`
1. `/content/french/about.md`

The first file is assigned the English language and is linked to the second.
The second file is assigned the French language and is linked to the first.

Their language is assigned according to the `content` directory they are placed in.

By having the same path and basename (relative to their language `content` directory), the content pieces are linked together as translated pages.

### Bypassing default linking

Any pages sharing the same `translationKey` set in front matter will be linked as translated pages regardless of basename or location.

Considering the following example:

1. `/content/about-us.en.md`
1. `/content/om.nn.md`
1. `/content/presentation/a-propos.fr.md`

translationKey: "about"

By setting the `translationKey` front matter parameter to `about` in all three pages, they will be linked as translated pages.

### Localizing permalinks

Because paths and file names are used to handle linking, all translated pages will share the same URL (apart from the language subdirectory).

To localize URLs:

- For a regular page, set either `slug` or `url` in front matter
- For a section page, set `url` in front matter

For example, a French translation can have its own localized slug.

title: A Propos
slug: "a-propos"

At render, the product will build both `/about/` and `/fr/a-propos/` without affecting the translation link.

### Page bundles

To avoid the burden of having to duplicate files, each Page Bundle inherits the resources of its linked translated pages' bundles except for the content files (Markdown files, HTML files etc.).

Therefore, from within a template, the page will have access to the files from all linked pages' bundles.

If, across the linked bundles, two or more files share the same basename, only one will be included and chosen as follows:

- File from current language bundle, if present.
- First file found across bundles by order of language `Weight`.

> [!NOTE]
> Page Bundle resources follow the same language assignment logic as content files, both by file name (`image.jpg`, `image.fr.jpg`) and by directory (`english/about/header.jpg`, `french/about/header.jpg`).

## Translation of strings

See the `lang.Translate` function.

## Localization

The following localization examples assume your project's primary language is English, with translations to French and German.

defaultContentLanguage = 'en'

[languages]
[languages.en]
contentDir = 'content/en'
label = 'English'
weight = 1
[languages.fr]
contentDir = 'content/fr'
label = 'Français'
weight = 2
[languages.de]
contentDir = 'content/de'
label = 'Deutsch'
weight = 3

### Dates

With this front matter:

date = 2021-11-03T12:34:56+01:00

And this template code:

The rendered page displays:

Language Value
:-- :--
English Wednesday, November 3, 2021
Français mercredi 3 novembre 2021
Deutsch Mittwoch, 3. November 2021

See `time.Format` for details.

### Currency

With this template code:

The rendered page displays:

Language Value
:-- :--
English $512.50
Français 512,50 $US
Deutsch 512,50 $

See lang.FormatCurrency and lang.FormatAccounting for details.

### Numbers

With this template code:

The rendered page displays:

Language Value
:-- :--
English 512.50
Français 512,50
Deutsch 512,50

See lang.FormatNumber and lang.FormatNumberCustom for details.

### Percentages

With this template code:

The rendered page displays:

Language Value
:-- :--
English 512.50%
Français 512,50 %
Deutsch 512,50 %

See lang.FormatPercent for details.

## Menus

Localization of menu entries depends on how you define them:

- When you define menu entries automatically using the section pages menu, you must use translation tables to localize each entry.
- When you define menu entries in front matter, they are already localized based on the front matter itself. If the front matter values are insufficient, use translation tables to localize each entry.
- When you define menu entries in your project configuration, you must create language-specific menu entries under each language key. If the names of the menu entries are insufficient, use translation tables to localize each entry.

### Create language-specific menu entries

#### Method 1 -- Use a single configuration file

For a simple menu with a small number of entries, use a single configuration file. For example:

[languages.de]
label = 'Deutsch'
locale = 'de-DE'
weight = 1

[[languages.de.menus.main]]
name = 'Produkte'
pageRef = '/products'
weight = 10

[[languages.de.menus.main]]
name = 'Leistungen'
pageRef = '/services'
weight = 20

[languages.en]
label = 'English'
locale = 'en-US'
weight = 2

[[languages.en.menus.main]]
name = 'Products'
pageRef = '/products'
weight = 10

[[languages.en.menus.main]]
name = 'Services'
pageRef = '/services'
weight = 20

#### Method 2 -- Use a configuration directory

With a more complex menu structure, create a configuration directory and split the menu entries into multiple files, one file per language. For example:

[[main]]
name = 'Produkte'
pageRef = '/products'
weight = 10
[[main]]
name = 'Leistungen'
pageRef = '/services'
weight = 20

[[main]]
name = 'Products'
pageRef = '/products'
weight = 10
[[main]]
name = 'Services'
pageRef = '/services'
weight = 20

### Use translation tables

When rendering the text that appears in menu each entry, the example menu template does this:

It queries the translation table for the current language using the menu entry's `identifier` and returns the translated string. If the translation table does not exist, or if the `identifier` key is not present in the translation table, it falls back to `name`.

The `identifier` depends on how you define menu entries:

- If you define the menu entry automatically using the section pages menu, the `identifier` is the page's `.Section`.
- If you define the menu entry in your project configuration or in front matter, set the `identifier` property to the desired value.

For example, if you define menu entries in project configuration:

[[menus.main]]
  identifier = 'products'
  name = 'Products'
  pageRef = '/products'
  weight = 10
[[menus.main]]
  identifier = 'services'
  name = 'Services'
  pageRef = '/services'
  weight = 20

Create corresponding entries in the translation tables:

products = 'Produkte'
services = 'Leistungen'

## Missing translations

If a string does not have a translation for the current language, the product will use the value from the default language. If no default value is set, an empty string will be shown.
