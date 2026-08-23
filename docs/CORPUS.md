# Spec corpus (`corpus/`) — what was collected and how

Real-world requirements/feature documents for the catalog miner (`npm run mine -- --corpus corpus`, see
`docs/MINING.md`). Collected 2026-08-22 with an ad-hoc fetch+clean pipeline (not checked in; described below).
`corpus/manifest.json` is the source of truth for provenance: one entry per document with `source_url`,
`license`, `retrieved`, `notes`.

## Summary

106 documents, ~240k words, 1.6 MB. Every document is plain markdown/text, 600–3,400 words (cap 20 KB),
product names replaced with "the product" in the body (real name only in the manifest).

| archetype | docs | words | composition |
|---|---|---|---|
| b2b-invoicing | 8 | 24.6k | Invoice Ninja, SolidInvoice, ERPNext (accounts), Odoo (customer invoices; sales invoicing+subscriptions), Lago, Kill Bill, Alf.io invoicing config |
| booking | 11 | 22.8k | Cal.com (in-repo feature spec; README), Easy!Appointments, Hi.Events, pretix (order lifecycle/domain model), Alf.io (events), LibreBooking, Rallly, Odoo appointments, Dalpiaz g12 camp user stories, PROMISE project 3 (class scheduling) |
| marketplace | 8 | 20.9k | Sharetribe (listings/search; transactions/payments), Medusa marketplace/B2B recipes, Vendure multi-vendor guide, Dokan readme, Cocorico, Mercur, Dalpiaz g14 data hub |
| e-commerce | 10 | 27.6k | Medusa commerce modules, Vendure core concepts, Spree (developer concepts; admin user guide), Odoo eCommerce, Shopware concepts, Saleor developer docs, PrestaShop user docs, PURE "Gamma-J web store" SRS, PROMISE project 8 (movie store) |
| crud-saas | 9 | 24.7k | Twenty CRM, Formbricks, Documenso, listmonk, OpenProject, Zammad (user docs), Dalpiaz g13/g22/g19 user stories |
| internal-dashboard | 15 | 35.7k | Metabase (dashboards; permissions), Redash, Superset, Appsmith, ToolJet, Dalpiaz g03/g16/g11, DevBench people-management PRD, PURE CCTNS / voucher system / PHIN outbreak mgmt / LIS, PROMISE project 4 |
| community | 8 | 19.2k | Flarum, Mastodon user guide, Lemmy, Zulip help, NodeBB, Dalpiaz g10/g21/g28 |
| content-site | 9 | 21.8k | Payload CMS, Hugo content management, Odoo website/blog, Wagtail, Dalpiaz g23/g25/g27/g05/g02 (repository / open-data publishing sites) |
| portfolio-landing | 1 | 2.2k | PURE "Get Real" outreach-website SRS only — see "not included" |
| other | 27 | 40.2k | 12 DevBench PRDs (tools/libraries), 6 Dalpiaz sets that fit no archetype, 6 PURE SRSs (password manager, video search, game, CDN peering, HVAC, e-procurement), 3 PROMISE projects |

## How documents were produced

1. **Select pages.** For each open-source product, the user-guide / concepts / feature pages were hand-picked from the
   repo tree (GitHub trees API); install/deploy/API-reference/changelog pages were excluded by path. Datasets
   (DevBench, Dalpiaz, PURE, PROMISE) were downloaded whole and one file per project/spec was used.
2. **Clean.** YAML/TOML front matter, MDX `import`/`export`, JSX/HTML tags, fenced code blocks, images,
   link targets and bare URLs, Docusaurus admonition fences, table rulers removed; RST directives/roles and
   heading underlines stripped; AsciiDoc attributes/blocks stripped; PURE XML tags → headings/text; PROMISE
   `.arff` rows grouped by project id into `- (CLASS) sentence` lines. Multiple pages from one product were
   concatenated in reading order.
3. **Anonymize.** Product names (and obvious aliases) replaced case-insensitively with "the product".
   Residual leaks remain inside code identifiers and config keys that survived cleaning (e.g. `cocorico_sms`,
   `WAGTAIL_FRONTEND_LOGIN_URL`, `@medusajs/...`) and in a few third-party product mentions; check the manifest
   notes if this matters for an LLM pass.
4. **Cap / floor.** Cut at 20,000 bytes on a paragraph boundary; dropped anything under 600 words after
   cleaning. No header line is added (it would inflate DF for "product documentation"-type n-grams).

Archetype assignment is by the collector's judgement of the *dominant* use case; borderline calls are noted
in the per-document `notes` (e.g. event ticketing → booking, digital-repository user stories → content-site,
PROMISE project 3 class scheduling → booking).

## Sources (every document)

| file | source | licence | words | notes |
|---|---|---|---|---|
| `b2b-invoicing/invoicing-a-user-guide.md` | https://github.com/invoiceninja/invoiceninja.github.io (docs/user-guide) | Elastic License 2.0 (docs repo points to main-repo licence; ELv2 permits copying/redistribution with limits) — flagged, not OSI | 3307 | Invoice Ninja v5 user guide; invoices, quotes, recurring, payments, credits, purchase orders, clients, products, expenses, portal |
| `b2b-invoicing/invoicing-b-solid.md` | https://github.com/solidinvoice/solidinvoice/tree/3.1.x/docs/docs | MIT | 3311 | SolidInvoice docs: invoices, statuses, overdue, reminders, clients, credit, currency, recurring schedules, taxes, companies |
| `b2b-invoicing/invoicing-c-erp-accounts.md` | https://github.com/frappe/erpnext_documentation (v13 user manual, accounts/selling) | MIT | 3373 | ERPNext v13 manual: sales invoice, payment entry, credit/debit notes, payment terms, dunning, subscription, quotation, sales order, customer |
| `b2b-invoicing/invoicing-d-odoo-customer-invoices.md` | https://github.com/odoo/documentation/tree/19.0/content/applications/finance/accounting | CC-BY-SA-4.0 | 3221 | Odoo 19 accounting docs: customer invoices, payment terms, credit notes, cash discounts/rounding, sequences, e-invoicing, payments, follow-ups |
| `b2b-invoicing/invoicing-e-odoo-sales-invoicing.md` | https://github.com/odoo/documentation/tree/19.0/content/applications/sales | CC-BY-SA-4.0 | 3260 | Odoo 19 sales docs: invoicing policies, down payments, milestones, pro-forma, time & materials, subscriptions (renewals, closing, upsell, automatic payments). Same product as invoicing-d but a distinct subsystem. |
| `b2b-invoicing/invoicing-f-usage-billing.md` | https://github.com/getlago/lago-docs/tree/main/docs/guide | unknown — no LICENSE file in docs repo (Lago itself is AGPL-3.0); text copied provisionally, flagged for review | 3301 | Lago usage-based billing guide: billable metrics, plans, charges, subscriptions, customers, coupons, add-ons, invoicing, grace period, payments, credit notes, prepaid credits |
| `b2b-invoicing/invoicing-g-subscription-billing.md` | https://github.com/killbill/killbill-docs/tree/v3/userguide | Apache-2.0 | 3129 | Kill Bill subscription & payment user guides: accounts, catalog, plans, subscriptions, invoices, payments, overdue |
| `b2b-invoicing/invoicing-h-event-tickets-invoicing.md` | https://github.com/alfio-event/alf.io/tree/main/website/content/en/docs/Configuration | GPL-3.0 | 1678 | Alf.io invoice/payment configuration: invoice numbering, VAT, reverse charge, bank transfer, offline payments |
| `booking/booking-a-scheduling-spec.md` | https://github.com/calcom/cal.com/tree/main/specs/cancellation-reason-requirement | MIT | 770 | Cal.com in-repo feature spec (design/decisions/implementation) for booking cancellation-reason requirement |
| `booking/booking-b-scheduling-readme.md` | https://github.com/calcom/cal.com/blob/main/README.md | MIT | 2958 | Cal.com README feature description |
| `booking/booking-c-appointments.md` | https://github.com/alextselegidis/easyappointments | GPL-3.0 | 1458 | Easy!Appointments README + FAQ + calendar sync docs |
| `booking/booking-d-event-ticketing-features.md` | https://github.com/HiEventsDev/hi.events/blob/develop/FEATURES.md | AGPL-3.0 (with attribution clause) | 2662 | Hi.Events README feature list + backend domain/database-schema docs: events, tickets, orders, attendees, check-in, promo codes |
| `booking/booking-e-ticket-shop-domain.md` | https://github.com/pretix/pretix/tree/master/doc | AGPL-3.0 (with exceptions) | 1706 | pretix order lifecycle + domain model + permission docs: events, items, quotas, orders, positions, vouchers, check-ins |
| `booking/booking-f-event-management.md` | https://github.com/alfio-event/alf.io/tree/main/website/content/en/docs | GPL-3.0 | 739 | Alf.io concepts, event setup, reservations, groups, attendee data, check-in |
| `booking/booking-g-resource-reservation.md` | https://github.com/LibreBooking/app/tree/develop/docs/source | GPL-3.0 | 3186 | LibreBooking (Booked fork) resource scheduling: resources, schedules, reservations, quotas, approval, admin |
| `booking/booking-h-meeting-polls.md` | https://github.com/lukevella/rallly/tree/main/apps/docs | AGPL-3.0 | 3228 | Rallly meeting-poll scheduling docs: create/invite/schedule, participants, spaces, seats, billing |
| `booking/booking-i-odoo-appointments.md` | https://github.com/odoo/documentation/tree/19.0/content/applications/productivity | CC-BY-SA-4.0 | 2805 | Odoo 19 appointments & calendar docs: appointment types, availability, resources, reminders |
| `booking/booking-j-camp-userstories.md` | https://data.mendeley.com/datasets/7zbk8zsd8y/1 (g12-camperplus), mirror github.com/daffahilmyf/requirement-generator | CC BY 4.0 (Mendeley Data, Dalpiaz 2018) | 1397 | Dalpiaz user-story set g12: camp registration/management system |
| `marketplace/marketplace-a-listings-search.md` | https://github.com/sharetribe/flex-docs/tree/master/src/docs | Apache-2.0 | 3270 | Sharetribe concepts: listings, search, approval, availability/inventory, seats, users, extended data |
| `marketplace/marketplace-b-transactions-payments.md` | https://github.com/sharetribe/flex-docs/tree/master/src/docs | Apache-2.0 | 3008 | Sharetribe concepts: transaction process, payments, payouts, commissions, messages, reviews. Same product as marketplace-a, distinct subsystem. |
| `marketplace/marketplace-c-recipe.md` | https://github.com/medusajs/medusa/tree/develop/www/apps/resources/app/recipes | MIT | 2835 | Medusa marketplace/B2B/digital-product recipes: vendors, orders split per vendor, payouts |
| `marketplace/marketplace-d-multivendor-howto.md` | https://github.com/vendure-ecommerce/vendure/tree/master/docs/docs/guides | GPL-3.0 (Vendure Community Edition) | 2532 | Vendure multi-vendor marketplace guide + channels + roles |
| `marketplace/marketplace-e-wp-multivendor.md` | https://github.com/getdokan/dokan/blob/develop/readme.txt | GPL-2.0-or-later (WordPress plugin readme header) | 2971 | Dokan multivendor marketplace plugin readme: vendor dashboards, commissions, withdrawals, shipping, reviews, store support |
| `marketplace/marketplace-f-services-marketplace.md` | https://github.com/Cocolabs-SAS/cocorico | MIT | 1705 | Cocorico service/rental marketplace: listings, bookings, prices & fees, time units, emails, cron jobs |
| `marketplace/marketplace-g-medusa-marketplace-oss.md` | https://github.com/mercurjs/mercur | MIT | 2700 | Mercur open-source marketplace (Medusa-based) README/docs |
| `marketplace/marketplace-i-datahub-userstories.md` | https://data.mendeley.com/datasets/7zbk8zsd8y/1 (g14-datahub) | CC BY 4.0 (Mendeley Data, Dalpiaz 2018) | 1841 | Dalpiaz g14: data hub/publishing platform user stories (data marketplace-like: publishers, consumers, datasets) |
| `e-commerce/ecommerce-a-commerce-modules.md` | https://github.com/medusajs/medusa/tree/develop/www/apps/resources/app/commerce-modules | MIT | 3092 | Medusa commerce module overviews: cart, order, product, customer, payment, pricing, promotion, inventory, fulfillment, region, sales channel, tax |
| `e-commerce/ecommerce-b-core-concepts.md` | https://github.com/vendure-ecommerce/vendure/tree/master/docs/docs/guides/core-concepts | GPL-3.0 (Vendure Community Edition) | 3146 | Vendure core concepts: products, collections, facets, customers, orders, cart, payment, shipping, promotions, stock, taxes, pricing, zones |
| `e-commerce/ecommerce-c-spree-concepts.md` | https://github.com/spree/spree/tree/main/docs/developer/core-concepts | BSD-3-Clause | 2771 | Spree core concepts: orders, products, inventory, payments, shipments, promotions, taxes, pricing, customers, store credits |
| `e-commerce/ecommerce-d-spree-user-guide.md` | https://github.com/spree/spree/tree/main/docs/user | BSD-3-Clause | 3219 | Spree admin user guide: orders, customers, products, pricing how-tos. Same product as ecommerce-c, different audience (admin vs developer). |
| `e-commerce/ecommerce-e-odoo-ecommerce.md` | https://github.com/odoo/documentation/tree/19.0/content/applications/websites/ecommerce | CC-BY-SA-4.0 | 1881 | Odoo 19 eCommerce docs: checkout, order handling, shipping, products, design |
| `e-commerce/ecommerce-f-shopware-concepts.md` | https://github.com/shopware/docs/tree/main/concepts/commerce | unknown — no LICENSE file found in docs repo; text copied provisionally, flagged for review | 2833 | Shopware commerce concepts: catalog, categories, products, sales channels, cart, orders, payments, documents |
| `e-commerce/ecommerce-g-saleor-developer.md` | https://github.com/saleor/saleor-docs/tree/main/docs/developer | BSD-3-Clause (per LICENSE, excluding icons) | 2902 | Saleor developer docs: checkout, orders, products, payments, discounts, channels, gift cards, stock allocation, taxes |
| `e-commerce/ecommerce-i-prestashop.md` | https://github.com/PrestaShop/user-documentation-en | CC-BY-SA-4.0 (README) | 3419 | PrestaShop user documentation: catalog, orders, customers |
| `crud-saas/crud-a-crm.md` | https://github.com/twentyhq/twenty/tree/main/packages/twenty-docs | AGPL-3.0 (with commercial exceptions for some files) | 3159 | Twenty CRM docs: objects/fields, views, pipelines, workflows, permissions, calendar & email |
| `crud-saas/crud-b-surveys.md` | https://github.com/formbricks/formbricks/tree/main/docs | AGPL-3.0 (docs outside ee/) | 3054 | Formbricks survey platform: logic, quotas, links, targeting, orgs/teams/roles |
| `crud-saas/crud-c-esign.md` | https://github.com/documenso/documenso/tree/main/apps/docs/content/docs/users | AGPL-3.0 | 2996 | Documenso e-signature user docs: documents, recipients, fields, templates, organisations, teams, preferences |
| `crud-saas/crud-d-newsletter.md` | https://github.com/knadh/listmonk/tree/master/docs/docs/content | AGPL-3.0 | 2786 | listmonk mailing list manager: lists, subscribers, campaigns, segmentation, roles, templates, bounces |
| `crud-saas/crud-e-project-mgmt.md` | https://github.com/opf/openproject/tree/dev/docs/user-guide | GPL-3.0 | 3309 | OpenProject user guide: work packages, projects, members/roles, time & costs, notifications, meetings |
| `crud-saas/crud-f-helpdesk.md` | https://github.com/zammad/zammad-user-documentation | AGPL-3.0 | 3148 | Zammad helpdesk user docs: tickets, ticket actions, macros, search, text modules |
| `crud-saas/crud-g-planning-poker-userstories.md` | https://data.mendeley.com/datasets/7zbk8zsd8y/1 (g13-planningpoker) | CC BY 4.0 (Mendeley Data, Dalpiaz 2018) | 1457 | Dalpiaz g13: planning poker estimation tool user stories |
| `crud-saas/crud-h-dmp-tool-userstories.md` | https://data.mendeley.com/datasets/7zbk8zsd8y/1 (g22-rdadmp) | CC BY 4.0 (Mendeley Data, Dalpiaz 2018) | 2250 | Dalpiaz g22: research data management plan tool user stories |
| `crud-saas/crud-i-alfred-userstories.md` | https://data.mendeley.com/datasets/7zbk8zsd8y/1 (g19-alfred) | CC BY 4.0 (Mendeley Data, Dalpiaz 2018) | 2509 | Dalpiaz g19: personal assistant / marketplace-for-apps (older adults) user stories |
| `internal-dashboard/dash-a-bi-questions-dashboards.md` | https://github.com/metabase/metabase/tree/master/docs | AGPL-3.0 | 3389 | Metabase docs: dashboards, filters, subscriptions, actions, collections, models, metrics |
| `internal-dashboard/dash-b-bi-permissions.md` | https://github.com/metabase/metabase/tree/master/docs | AGPL-3.0 | 3130 | Metabase permissions & people/groups docs. Same product as dash-a, distinct subsystem. |
| `internal-dashboard/dash-c-query-dashboards.md` | https://github.com/getredash/website/tree/master/src/pages/kb/user-guide | BSD-2-Clause | 3276 | Redash user guide: queries, parameters, schedules, dashboards, sharing, alerts, users/groups/permissions, visualizations |
| `internal-dashboard/dash-d-superset.md` | https://github.com/apache/superset/tree/master/docs/docs/using-superset | Apache-2.0 | 3137 | Superset user docs: dashboards, charts, exploring data, exports, embedding |
| `internal-dashboard/dash-e-internal-tools-builder.md` | https://github.com/appsmithorg/appsmith-docs/tree/main/website/docs | Apache-2.0 | 3042 | Appsmith internal-tool builder docs: UI, dynamic widgets, actions, access control roles |
| `internal-dashboard/dash-f-lowcode-concepts.md` | https://github.com/ToolJet/ToolJet/tree/main/docs/docs | AGPL-3.0 | 1871 | ToolJet low-code internal tool concepts: components, data sources, queries, events, pages, permissions, sharing |
| `internal-dashboard/dash-g-permit-system-userstories.md` | https://data.mendeley.com/datasets/7zbk8zsd8y/1 (g03-loudoun) | CC BY 4.0 (Mendeley Data, Dalpiaz 2018) | 1579 | Dalpiaz g03: county land-development permitting/inspection system user stories (internal staff + applicants) |
| `internal-dashboard/dash-h-mis-userstories.md` | https://data.mendeley.com/datasets/7zbk8zsd8y/1 (g16-mis) | CC BY 4.0 (Mendeley Data, Dalpiaz 2018) | 1536 | Dalpiaz g16: management information system user stories |
| `internal-dashboard/dash-i-nsf-site-userstories.md` | https://data.mendeley.com/datasets/7zbk8zsd8y/1 (g11-nsf) | CC BY 4.0 (Mendeley Data, Dalpiaz 2018) | 1755 | Dalpiaz g11: agency website/content publishing & reporting user stories |
| `internal-dashboard/dash-j-people-management-prd.md` | https://github.com/open-compass/DevBench/blob/main/benchmark_data/cpp/people_management/docs/PRD.md | Apache-2.0 | 847 | DevBench PRD: people/employee management system (CLI) |
| `community/community-a-forum-admin.md` | https://github.com/flarum/docs/tree/main/docs | MIT | 3204 | Flarum forum docs: admin dashboard, discussions, tags, extensions, mail |
| `community/community-b-social-user-guide.md` | https://github.com/mastodon/documentation/tree/main/content/en/user | GFDL-1.3 | 3283 | Mastodon user guide: signup, posting, profiles, follows, discoverability, moderation, preferences |
| `community/community-c-link-aggregator.md` | https://github.com/LemmyNet/lemmy-docs/tree/main/src | AGPL-3.0 | 2916 | Lemmy docs: communities, posts, votes, ranking, moderation, federation |
| `community/community-d-team-chat-help.md` | https://github.com/zulip/zulip/tree/main/starlight_help/src/content/docs | Apache-2.0 | 3183 | Zulip help center: channels, topics, users, permissions, guests, moderation, invites |
| `community/community-f-scrum-membership-userstories.md` | https://data.mendeley.com/datasets/7zbk8zsd8y/1 (g10-scrumalliance) | CC BY 4.0 (Mendeley Data, Dalpiaz 2018) | 2566 | Dalpiaz g10: membership organisation website (profiles, certification, community, events) |
| `community/community-g-event-camp-userstories.md` | https://data.mendeley.com/datasets/7zbk8zsd8y/1 (g21-badcamp) | CC BY 4.0 (Mendeley Data, Dalpiaz 2018) | 1898 | Dalpiaz g21: community conference website (sessions, sponsors, registration) |
| `community/community-h-citizen-science-userstories.md` | https://data.mendeley.com/datasets/7zbk8zsd8y/1 (g28-zooniverse) | CC BY 4.0 (Mendeley Data, Dalpiaz 2018) | 1060 | Dalpiaz g28: citizen-science project-builder community platform |
| `community/community-i-nodebb.md` | https://github.com/NodeBB/docs | MIT | 1128 | NodeBB forum docs |
| `content-site/content-a-headless-cms.md` | https://github.com/payloadcms/payload/tree/main/docs | MIT | 2680 | Payload CMS docs: collections, globals, localization, access control, admin, uploads, versions/drafts, preview |
| `content-site/content-b-static-site-content.md` | https://github.com/gohugoio/hugoDocs/tree/master/content/en/content-management | Apache-2.0 (hugoDocs LICENSE) | 3013 | Hugo content management: sections, taxonomies, menus, multilingual, related content, summaries, comments, URLs |
| `content-site/content-c-odoo-website-blog.md` | https://github.com/odoo/documentation/tree/19.0/content/applications/websites | CC-BY-SA-4.0 | 3092 | Odoo 19 website & blog docs: pages, menus, SEO, multi-website, translations, blog |
| `content-site/content-d-cms-user-docs.md` | https://github.com/wagtail/wagtail/tree/main/docs | BSD-3-Clause | 3110 | Wagtail CMS docs: pages tree, images, documents, snippets, permissions, privacy, workflow |
| `content-site/content-e-archives-userstories.md` | https://data.mendeley.com/datasets/7zbk8zsd8y/1 (g23-archivesspace) | CC BY 4.0 (Mendeley Data, Dalpiaz 2018) | 875 | Dalpiaz g23: archives public-interface user stories (publishing collections to researchers) |
| `content-site/content-f-repository-userstories.md` | https://data.mendeley.com/datasets/7zbk8zsd8y/1 (g25-duraspace) | CC BY 4.0 (Mendeley Data, Dalpiaz 2018) | 2015 | Dalpiaz g25: digital repository platform user stories (submit, curate, publish content) |
| `content-site/content-g-culrepo-userstories.md` | https://data.mendeley.com/datasets/7zbk8zsd8y/1 (g27-culrepo) | CC BY 4.0 (Mendeley Data, Dalpiaz 2018) | 3324 | Dalpiaz g27: university library repository user stories (deposit, discovery, access) |
| `content-site/content-h-openspending-userstories.md` | https://data.mendeley.com/datasets/7zbk8zsd8y/1 (g05-openspending) | CC BY 4.0 (Mendeley Data, Dalpiaz 2018) | 1644 | Dalpiaz g05: open-data publishing/visualisation site user stories |
| `content-site/content-i-federal-spending-userstories.md` | https://data.mendeley.com/datasets/7zbk8zsd8y/1 (g02-federalspending) | CC BY 4.0 (Mendeley Data, Dalpiaz 2018) | 2091 | Dalpiaz g02: federal spending transparency site user stories (data publishing, search, API) |
| `other/other-devbench-logistic-system.md` | https://github.com/open-compass/DevBench/tree/main/benchmark_data (logistic_system/PRD.md) | Apache-2.0 | 1618 | DevBench PRD: logistics/shipping management system (CLI) |
| `other/other-devbench-login-registration.md` | https://github.com/open-compass/DevBench/tree/main/benchmark_data (login-registration/PRD.md) | Apache-2.0 | 616 | DevBench PRD: login/registration web app |
| `other/other-devbench-actor-relationship-game.md` | https://github.com/open-compass/DevBench/tree/main/benchmark_data (Actor_relationship_game/PRD.md) | Apache-2.0 | 655 | DevBench PRD: actor-relationship game |
| `other/other-devbench-hone.md` | https://github.com/open-compass/DevBench/tree/main/benchmark_data (hone/PRD.md) | Apache-2.0 | 1020 | DevBench PRD: CSV-to-JSON conversion tool |
| `other/other-devbench-stocktrends.md` | https://github.com/open-compass/DevBench/tree/main/benchmark_data (stocktrends/PRD.md) | Apache-2.0 | 1041 | DevBench PRD: stock trend analysis library |
| `other/other-devbench-graph-cpp.md` | https://github.com/open-compass/DevBench/tree/main/benchmark_data (graph-cpp/PRD.md) | Apache-2.0 | 852 | DevBench PRD: graph library |
| `other/other-devbench-lice.md` | https://github.com/open-compass/DevBench/tree/main/benchmark_data (lice/PRD.md) | Apache-2.0 | 804 | DevBench PRD: licence generator CLI |
| `other/other-devbench-textcnn.md` | https://github.com/open-compass/DevBench/tree/main/benchmark_data (TextCNN/PRD.md) | Apache-2.0 | 836 | DevBench PRD: text classification model |
| `other/other-devbench-image-similarity.md` | https://github.com/open-compass/DevBench/tree/main/benchmark_data (image-similarity/PRD.md) | Apache-2.0 | 822 | DevBench PRD: image similarity tool |
| `other/other-devbench-java-heap.md` | https://github.com/open-compass/DevBench/tree/main/benchmark_data (java_heap/PRD.md) | Apache-2.0 | 786 | DevBench PRD: heap data structure |
| `other/other-devbench-redis-cache.md` | https://github.com/open-compass/DevBench/tree/main/benchmark_data (redis-cache/PRD.md) | Apache-2.0 | 699 | DevBench PRD: redis cache library |
| `other/other-devbench-xlsx2csv.md` | https://github.com/open-compass/DevBench/tree/main/benchmark_data (xlsx2csv/PRD.md) | Apache-2.0 | 697 | DevBench PRD: xlsx to csv converter |
| `other/other-userstories-g04-recycling.md` | https://data.mendeley.com/datasets/7zbk8zsd8y/1 (g04-recycling) | CC BY 4.0 (Mendeley Data, Dalpiaz 2018) | 1298 | Dalpiaz g04-recycling: recycling facility locator app |
| `other/other-userstories-g08-frictionless.md` | https://data.mendeley.com/datasets/7zbk8zsd8y/1 (g08-frictionless) | CC BY 4.0 (Mendeley Data, Dalpiaz 2018) | 1746 | Dalpiaz g08-frictionless: data package tooling |
| `other/other-userstories-g17-cask.md` | https://data.mendeley.com/datasets/7zbk8zsd8y/1 (g17-cask) | CC BY 4.0 (Mendeley Data, Dalpiaz 2018) | 1627 | Dalpiaz g17-cask: data application platform |
| `other/other-userstories-g18-neurohub.md` | https://data.mendeley.com/datasets/7zbk8zsd8y/1 (g18-neurohub) | CC BY 4.0 (Mendeley Data, Dalpiaz 2018) | 2208 | Dalpiaz g18-neurohub: neuroscience lab data hub |
| `other/other-userstories-g24-unibath.md` | https://data.mendeley.com/datasets/7zbk8zsd8y/1 (g24-unibath) | CC BY 4.0 (Mendeley Data, Dalpiaz 2018) | 1469 | Dalpiaz g24-unibath: university research data archive |
| `other/other-userstories-g26-racdam.md` | https://data.mendeley.com/datasets/7zbk8zsd8y/1 (g26-racdam) | CC BY 4.0 (Mendeley Data, Dalpiaz 2018) | 2122 | Dalpiaz g26-racdam: research data access/management |
| `e-commerce/pure-0000-gamma-j.md` | https://zenodo.org/records/1414117 (requirements-xml.zip) | CC BY 4.0 (Zenodo record 1414117, PURE dataset) | 2698 | PURE: SRS for a small-business web store (catalog, cart, checkout, accounts, admin) |
| `portfolio-landing/pure-2007-get-real-0.2.md` | https://zenodo.org/records/1414117 (requirements-xml.zip) | CC BY 4.0 (Zenodo record 1414117, PURE dataset) | 2181 | PURE: SRS for a promotional/outreach website (content pages, navigation, contact, updates) |
| `internal-dashboard/pure-0000-cctns.md` | https://zenodo.org/records/1414117 (requirements-xml.zip) | CC BY 4.0 (Zenodo record 1414117, PURE dataset) | 2903 | PURE: functional requirements for a crime & criminal tracking system (case registration, search, reports) |
| `internal-dashboard/pure-2005-microcare.md` | https://zenodo.org/records/1414117 (requirements-xml.zip) | CC BY 4.0 (Zenodo record 1414117, PURE dataset) | 3171 | PURE: SRS for a voucher maintenance/management system (data entry, masters, reports) |
| `internal-dashboard/pure-2005-phin.md` | https://zenodo.org/records/1414117 (requirements-xml.zip) | CC BY 4.0 (Zenodo record 1414117, PURE dataset) | 2866 | PURE: outbreak management functional requirements (case/contact management, reporting) |
| `internal-dashboard/pure-2010-blitdraft.md` | https://zenodo.org/records/1414117 (requirements-xml.zip) | CC BY 4.0 (Zenodo record 1414117, PURE dataset) | 1537 | PURE: laboratory information system rewrite requirements |
| `other/pure-2009-peppol-approved.md` | https://zenodo.org/records/1414117 (requirements-xml.zip) | CC BY 4.0 (Zenodo record 1414117, PURE dataset) | 2304 | PURE: pan-European e-procurement (virtual company dossier) requirements |
| `other/pure-2008-keepass.md` | https://zenodo.org/records/1414117 (requirements-xml.zip) | CC BY 4.0 (Zenodo record 1414117, PURE dataset) | 3280 | PURE: SRS for a password manager |
| `other/pure-2009-video-search.md` | https://zenodo.org/records/1414117 (requirements-xml.zip) | CC BY 4.0 (Zenodo record 1414117, PURE dataset) | 2041 | PURE: SRS for a video search engine |
| `other/pure-2003-qheadache.md` | https://zenodo.org/records/1414117 (requirements-xml.zip) | CC BY 4.0 (Zenodo record 1414117, PURE dataset) | 1970 | PURE: SRS for a puzzle game |
| `other/pure-2008-peering.md` | https://zenodo.org/records/1414117 (requirements-xml.zip) | CC BY 4.0 (Zenodo record 1414117, PURE dataset) | 2644 | PURE: SRS for CDN peering infrastructure |
| `other/pure-1998-themas.md` | https://zenodo.org/records/1414117 (requirements-xml.zip) | CC BY 4.0 (Zenodo record 1414117, PURE dataset) | 3057 | PURE: SRS for an HVAC energy management system |
| `booking/promise-project03.md` | https://zenodo.org/records/268542 (nfr.arff, grouped by project id) | CC BY 4.0 (Zenodo record 268542, PROMISE NFR dataset) | 1855 | PROMISE project 3: nursing-program class/clinical scheduling system (requirement sentences labelled FR/NFR, grouped by project) |
| `internal-dashboard/promise-project04.md` | https://zenodo.org/records/268542 (nfr.arff, grouped by project id) | CC BY 4.0 (Zenodo record 268542, PROMISE NFR dataset) | 1682 | PROMISE project 4: disputes case-management application (requirement sentences labelled FR/NFR, grouped by project) |
| `other/promise-project05.md` | https://zenodo.org/records/268542 (nfr.arff, grouped by project id) | CC BY 4.0 (Zenodo record 268542, PROMISE NFR dataset) | 1232 | PROMISE project 5: insurance estimate / recycled parts lookup (requirement sentences labelled FR/NFR, grouped by project) |
| `other/promise-project06.md` | https://zenodo.org/records/268542 (nfr.arff, grouped by project id) | CC BY 4.0 (Zenodo record 268542, PROMISE NFR dataset) | 1598 | PROMISE project 6: database-backed server product (requirement sentences labelled FR/NFR, grouped by project) |
| `e-commerce/promise-project08.md` | https://zenodo.org/records/268542 (nfr.arff, grouped by project id) | CC BY 4.0 (Zenodo record 268542, PROMISE NFR dataset) | 1663 | PROMISE project 8: movie streaming store with prepaid cards (requirement sentences labelled FR/NFR, grouped by project) |
| `other/promise-project10.md` | https://zenodo.org/records/268542 (nfr.arff, grouped by project id) | CC BY 4.0 (Zenodo record 268542, PROMISE NFR dataset) | 1125 | PROMISE project 10: battleship game (requirement sentences labelled FR/NFR, grouped by project) |

Dataset-level licences: DevBench — Apache-2.0 (github.com/open-compass/DevBench); Dalpiaz user-story sets —
CC BY 4.0 (Mendeley Data 10.17632/7zbk8zsd8y.1, text mirrored from github.com/daffahilmyf/requirement-generator);
PURE — CC BY 4.0 (Zenodo 1414117, `requirements-xml.zip`, 18 XML docs of the 79 PDFs); PROMISE NFR — CC BY 4.0
(Zenodo 268542, `nfr.arff`).

### Licence flags (review before redistribution)
- **Invoice Ninja docs** (`invoicing-a-user-guide`): docs repo has no LICENSE; README defers to the main repo,
  which is Elastic License 2.0. ELv2 permits copying/redistribution (not OSI). Copied and flagged.
- **Lago docs** (`invoicing-f-usage-billing`): no LICENSE in `getlago/lago-docs` (product is AGPL-3.0).
  Copied provisionally and flagged — delete if strictness is required.
- **Shopware docs** (`ecommerce-f-shopware-concepts`): no LICENSE in `shopware/docs`. Copied provisionally and flagged.
- CC-BY-SA-4.0 sources (Odoo documentation, PrestaShop user docs) carry share-alike; GFDL-1.3 (Mastodon docs)
  requires attribution — all recorded in the manifest.
- AGPL/GPL documentation (Metabase, pretix, Hi.Events, Twenty, Formbricks, Documenso, listmonk, OpenProject,
  Zammad, Lemmy, ToolJet, Vendure, Alf.io, Easy!Appointments, LibreBooking, Rallly, Discourse, Frappe HR) — excerpts redistributed with attribution.

## Considered and NOT included (and why)
- **nopCommerce docs** — no licence in docs repo (product under nopCommerce Public License): URL only, not copied.
- **Ghost docs** (`TryGhost/docs`) — LICENSE says closed-source/not for distribution. Not copied.
- **Outline** (BSL 1.1), **Akaunting** (BSL 1.1, docs not in repo), **NocoDB** (mixed licence) — skipped.
- **Cal.com docs repo** (`calcom/docs`), **InvoiceShelf/docs**, **Plane docs** (`makeplane/docs`), **Bagisto docs**,
  **Directus docs**, **Sylius docs** — no LICENSE file found; not copied (Cal.com content taken from the MIT main repo instead).
- **Sharetribe Go** (`sharetribe/sharetribe`) — Sharetribe Community Public Licence; the Apache-2.0 `flex-docs` used instead.
- **Crater** — README/docs not in repo (404); **Easy!Appointments** docs are install-focused (README+FAQ used).
- **Discourse** — only an admin quick-start in-repo (315 words after cleaning; below floor). **Hi.Events FEATURES.md** is empty upstream (README + backend domain docs used).
- **Open Food Network**, **Frappe HR doctype READMEs**, DevBench `listen-now-frontend` / `ArXiv_digest` / `idcenter`
  — below the 600-word floor after cleaning.
- **Kiro / Spec Kit `specs/` folders on GitHub** — a code search found dozens, but nearly all are dev tools/CLIs/infra
  (hammerkit, oscar, argus…), each under its own licence; only Cal.com's in-repo spec matched an archetype. Not pursued further.
- **Wikipedia "comparison of X software"** — tabular feature matrices, not prose; low value for n-gram mining. Not used.
- **PURE PDFs** (61 of 79 docs only as PDF/DOC) — not converted; only the 18 XML-converted docs used, and only 12 of those
  (the rest are rail/telescope/defence systems).
- **portfolio-landing**: no open-source product documents its requirements the way a landing/portfolio site needs;
  only one SRS (PURE "Get Real") fits. The archetype is effectively unsupported by this corpus.

## Known biases and limits
- **Survivorship / maturity bias.** Most documents are feature docs of mature open-source products (Odoo, Medusa,
  Metabase, Spree…). They are far richer than what a small business needs; DF priors mined from them will skew
  toward over-asking. The academic sets (Dalpiaz, PURE, PROMISE) partially counterbalance with small, messy real specs.
- **Same-product splits.** Several products contribute more than one document: Odoo (5 docs across invoicing ×2,
  booking, e-commerce, content-site), Sharetribe ×2 and Metabase ×2 (same archetype, distinct subsystems), Spree ×2
  (developer vs admin docs), Medusa, Vendure and Alf.io ×2 each across archetypes. Noted in manifest `notes`; treat DF
  in those archetypes as slightly product-correlated.
- **Genre mix.** Product docs ("click New to…"), user stories ("As a X I want…"), SRS ("the system shall…"), PRDs.
  The miner's residual verb-phrase noise ("want to post", "able to see") visibly comes from the user-story genre.
- **Developer-docs leakage.** Some e-commerce/marketplace docs are developer-facing (Medusa modules, Saleor, Spree
  concepts) and mention implementation terms (modules, workflows, tokens).
- **"other" is a grab-bag** dominated by DevBench tool/library PRDs; useful as a contrast class, not as an archetype.
- **Small n.** 8–15 docs per archetype: DF resolution is ~10%, so "DF≈0.5" candidates are noisy; raise `--min-df` with care.
- **Stale dates.** PURE/PROMISE documents are 1998–2010; Dalpiaz 2018; product docs current as of retrieval.

## Reproducing / extending
The pipeline (a Python script with a config list of `{repo, branch, paths, names, licence}`) lived in the session
scratchpad and is easy to re-create from the manifest: each entry's `source_url` names the repo/paths and the
cleaning steps above are deterministic. To add a document: put markdown under `corpus/<archetype>/`, append a manifest
entry (the miner reads the manifest when present, otherwise the directory layout).

## First run of the miner on this corpus (2026-08-22)
`npm run mine -- --corpus corpus --min-df 2 --limit 15` → `corpus: 106 docs · b2b-invoicing=8 booking=11 marketplace=8
e-commerce=10 crud-saas=9 internal-dashboard=15 community=8 content-site=9 other=27 portfolio-landing=1`.
Plausible decision-axis candidates already surface — b2b-invoicing: *draft invoice* (DF 50%), *future invoice*,
*cancel/clone/confirm the invoice*, *balance due date*, *based on timesheet*; e-commerce: *customer group* (50%),
*product variant* (50%), *draft order*, *shipping method/address*, *gift card*, *free shipping*, *category tree* (GAP);
booking: *time slot*, *require approval*, *event type*, *timezone* (45%, GAP), *end date* (GAP), *organizer* (GAP);
marketplace: *split the order / order into multiple*, *stripe connect*, *vendor can manage*, *booking request*.
Community/content-site/crud-saas lists are dominated by user-story verb phrases ("want to post", "able to see") —
the POS/noun-phrase filter noted in `docs/MINING.md` is now the obvious next step. Output written to `mining-results/`.
