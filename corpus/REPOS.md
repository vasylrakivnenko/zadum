# Repository corpus (`corpus/repos.json`) — what was collected and how

336 real, license-vetted, commit-pinned GitHub **application** repositories, stratified across the eight
catalog archetypes, for the evidence-mining pipeline (`npm run mine:corpus`, `npm run label -- --doc-type repo`).
Collected 2026-08-25 with the `gh` CLI only; nothing was cloned.

`corpus/repos.json` is the source of truth. Each row is a superset of `ManifestEntry` (`src/mining/label.ts`),
so existing loaders keep working: `file` is `""` (these are repositories, not spec documents), and `id`,
`archetype`, `source_url`, `license`, `notes` carry the same meaning as in `corpus/manifest.json`. The extra
fields are `owner`, `name`, `commit` (40-hex), `default_branch`, `stars`, `pushed_at`, `primary_language`.

**Every row is pinned to a commit.** `commit` is the head of the default branch at collection time, read from
`GET /repos/{owner}/{name}/commits/{default_branch}`. There are no placeholders: a repository whose SHA could
not be resolved was dropped, because `artifactId()` (`src/mining/corpus.ts`) pins provenance to a commit and
`repo:owner/name@HEAD` is not a reproducible claim.

## Method

1. **Search.** 470 `gh search repos` queries: ~120 `--topic` queries (`invoicing`, `billing`, `accounting`,
   `erp`, `pos`, `booking`, `scheduling`, `appointment-scheduling`, `reservation`, `hotel-management`,
   `restaurant-reservation`, `clinic`, `salon`, `coworking`, `event-booking`, `room-booking`, `ecommerce`,
   `shopping-cart`, `online-store`, `headless-commerce`, `marketplace`, `multivendor`, `classifieds`,
   `auction`, `rental`, `gig-economy`, `food-delivery`, `peer-to-peer`, `crm`, `helpdesk`, `hrms`,
   `project-management`, `inventory-management`, `subscription-billing`, `timesheet`, `double-entry`,
   `admin-panel`, `business-intelligence`, `analytics`, `forum`, `social-network`, `fediverse`, `cms`,
   `headless-cms`, `blog`, `newsletter`, …) plus a 256-cell **language × theme** matrix over php, python, ruby,
   typescript, javascript, go, java, c#, elixir, rust, kotlin, scala, perl, clojure, groovy, dart, plus
   gap-directed keyword queries for the four scarce archetypes. 6,780 distinct repositories were pooled.
2. **Screen by description.** Rule 1 of the brief applied by hand to the pooled descriptions: dropped
   `awesome-*` lists, tutorials, course companions, boilerplate/starters/templates, UI kits and component
   libraries, SDKs/API clients/wrappers, mobile UI mock-ups, single-file generators, docs-only repos, and
   product clones. Anything that plausibly contains routes, a DB schema, auth, payment or job code survived.
3. **Verify every survivor over the API.** `GET /repos/{owner}/{name}` for `fork`, `archived`,
   `license.spdx_id`, `stargazers_count`, `pushed_at`, `language`, `default_branch`, then one call for the head
   SHA. 398 repositories were verified this way; 20 more 404'd (renamed away, moved off GitHub, or misremembered
   names) and were dropped rather than guessed at. **Nothing in `repos.json` comes from recall** — every field
   is a value the API returned.
4. **Resolve `NOASSERTION` licences by reading the licence file.** GitHub reports `NOASSERTION` for ~50 of these
   repositories because a clause was added or the repo is dual-licensed. For each, `GET /repos/{o}/{n}/license`
   was decoded and read, and the core licence recorded (e.g. Odoo → `LGPL-3.0`, Metabase → `AGPL-3.0`,
   PostHog/Chatwoot/Rocket.Chat/SigNoz → `MIT` with a commercial `ee/` directory, Vendure → `GPL-3.0`,
   PrestaShop → `OSL-3.0`). Repositories whose licence has **no SPDX identifier** were dropped even when the
   licence is well known and published — see the drop table.
5. **Assign archetypes by what the app does**, from its description/README, never from the query that found it.
   Where a repo genuinely spans two archetypes the dominant one is recorded and the other named in `notes`
   (e.g. Dolibarr → `b2b-invoicing`, "ERP/CRM … overlaps crud-saas"; ERPNext/Odoo → `crud-saas`, noted as
   overlapping invoicing; OpenEMR → `crud-saas`, noted as overlapping booking).
6. **Deduplicate** by lowercased `owner/name`, and by product: only one repo per product survives, preferring
   the side that holds schema + routes (`invoiceninja/invoiceninja` over `invoiceninja.github.io`,
   `aimeos/aimeos-laravel` over `aimeos-core`/`-symfony`/`-typo3`, `crmeb/CRMEB` over `crmeb/crmeb_java`,
   `eclipse-openvsx/openvsx` over its deployment repo).

Renamed repositories are recorded under their **current** canonical name, since that is what the API resolved
and what a clone will fetch: `calcom/cal.com` → `calcom/cal.diy`, `librebooking/app` → `LibreBooking/librebooking`,
`vendure-ecommerce/vendure` → `vendurehq/vendure`, `snipe/snipe-it` → `grokability/snipe-it`,
`salesagility/SuiteCRM` → `SuiteCRM/SuiteCRM`, `taigaio/taiga` → `kaleidos-ventures/taiga`,
`horilla-opensource/horilla` → `horilla/horilla-hr`, `crater-invoice/crater` → `crater-invoice-inc/crater`,
`revoltchat/backend` → `stoatchat/stoatchat`, `mindstellar/Osclass` → `mindstellar/shopclass`.

## Per-archetype counts

| archetype | repos | target | languages present |
|---|---|---|---|
| `b2b-invoicing` | 39 | 34 | PHP, TypeScript, Ruby, Java, Go, Python, JavaScript, Perl, C# |
| `booking` | 46 | 34 | PHP, TypeScript, Python, Java, JavaScript, Ruby, Elixir, Kotlin, C++, Vue |
| `e-commerce` | 47 | 34 | PHP, TypeScript, Java, JavaScript, Python, Ruby, C#, Go, C++, Vue, PLpgSQL, CSS |
| `marketplace` | 34 | 34 | TypeScript, PHP, Ruby, Java, Python, JavaScript, Rust, Go, Dart, CSS, Blade |
| `crud-saas` | 73 | 36 | PHP, TypeScript, Python, Ruby, Java, Go, Perl, Vue, Clojure, Dart, Groovy, C# |
| `internal-dashboard` | 24 | 22 | TypeScript, Python, PHP, Go, Java, Clojure, Elixir, JavaScript |
| `community` | 36 | 14 | PHP, Ruby, TypeScript, Java, Go, Rust, Python, Elixir, Scala, C#, JavaScript |
| `content-site` | 37 | 14 | PHP, TypeScript, Python, JavaScript, C#, Java, Go, Elixir, Ruby |
| **total** | **336** | 204 | |

## Licence histogram

| SPDX | n |
|---|---|
| AGPL-3.0 | 98 |
| MIT | 90 |
| GPL-3.0 | 46 |
| Apache-2.0 | 41 |
| GPL-2.0 | 17 |
| BSD-3-Clause | 12 |
| MPL-2.0 | 8 |
| OSL-3.0 | 6 |
| BSD-2-Clause | 4 |
| BUSL-1.1 | 3 |
| LGPL-3.0 | 3 |
| LGPL-2.1 | 2 |
| AAL, EPL-1.0, EPL-2.0, EUPL-1.2, Elastic-2.0, Unlicense | 1 each |

Copyleft dominates (AGPL-3.0 + GPL-\* + LGPL-\* = 169 of 336). That is fine for this pipeline — only bounded
digests, sha256 hashes, metadata and ≤200-character quotes ever leave ingestion; code is never redistributed
(`src/mining/corpus.ts` rule 1).

**Four rows are source-available, not OSI-approved**, and are flagged in their `notes`:
`invoiceninja/invoiceninja` (Elastic-2.0), `akaunting/akaunting`, `dotCMS/core`, `outline/outline` (BUSL-1.1).
All four have SPDX identifiers and permit copying; drop them if strictness is required.

## Language histogram

| language | n | | language | n |
|---|---|---|---|---|
| PHP | 94 | | Perl | 4 |
| TypeScript | 63 | | CSS | 3 |
| Python | 38 | | C++ | 3 |
| Java | 29 | | HTML | 3 |
| JavaScript | 27 | | Clojure | 2 |
| Ruby | 18 | | Dart | 2 |
| Go | 16 | | Blade | 1 |
| C# | 12 | | Groovy | 1 |
| Vue | 7 | | Kotlin | 1 |
| Rust | 6 | | PLpgSQL | 1 |
| Elixir | 5 | | | |

Non-JS/TS/PHP/Ruby/Python accounts for 78 of 336 rows (23 %). This is deliberate: `REPO_CLASSIFIERS` in
`src/mining/condense.ts` was written against a JS/TS/PHP/Ruby/Python corpus, so Go, Java, C#, Elixir, Rust,
Kotlin, Scala, Clojure, Perl, Groovy, C++, Dart and PLpgSQL rows are in the corpus specifically to find out
whether the file-locus classifiers fire on them. If a whole language yields empty digests, that is a finding,
and it can only be observed if the language is present.

## Drops, and why

| reason | n | examples |
|---|---|---|
| screened out by description before any API call | ~6,400 of the 6,780 pooled | awesome-lists, tutorials, boilerplate, UI kits, SDKs, API clients, Flutter/RN UI mock-ups, product clones, docs sites, single-file invoice/PDF generators, Odoo `OCA/*` addon collections |
| repository not found (renamed away, moved off GitHub, misremembered name) | 20 | `framasoft/mobilizon`, `gancio/gancio`, `superseriousbusiness/gotosocial` (all moved to Framagit/Codeberg), `wcvendors/wcvendors`, `vanilla/vanilla`, `yclas/yclas`, `karrot-dev/karrot`, `dualcube/dc-woocommerce-multi-vendor` |
| no detectable licence (`license: null`) | 9 | `woocommerce/woocommerce`, `tryton/tryton`, `metasfresh/metasfresh`, `getdokan/dokan`, `phpipam/phpipam`, `apostrophecms/apostrophe`, `BroadleafCommerce/BroadleafCommerce`, `liberapay/liberapay.com`, `movabletype/movabletype` |
| licence file present but **no SPDX identifier** | 13 | `directus/directus` (MSCL-1.0), `nocodb/nocodb` (Sustainable Use 1.0), `nocobase/nocobase`, `nopSolutions/nopCommerce` (NPL-4.0), `sharetribe/sharetribe` (Sharetribe CPL), `VirtoCommerce/vc-platform`, `flipt-io/flipt` (FCL-1.0), `coopcycle/coopcycle-web` (Coopyleft), `bookwyrm-social/bookwyrm` (ACSL-1.4), `timescale/timescaledb`, `InvoicePlane/InvoicePlane` (trademark notice only), `teamhanko/hanko`, `Dokploy/dokploy` |
| archived | 7 | `apache/ofbiz`, `matrix-org/synapse`, `OpenBazaar/openbazaar-go`, `fossasia/open-event-server`, `thedevdojo/voyager`, `Peppermint-Lab/peppermint`, `frappe/drive` |
| fork | 2 | `friendica/friendica`, `openware/peatio` |
| repo name would trip the ingest documentation gate (`/(docs?\|documentation\|handbook\|wiki\|guides?)$/`) | 4 real apps + 14 docs repos | apps: `dokuwiki/dokuwiki`, `requarks/wiki`, `wikimedia/mediawiki`, `Matterwiki/Matterwiki`; docs repos: the 14 documentation sites in `corpus/manifest.json` (see below) |
| verified but not an application | 9 | `supabase/supabase`, `appwrite/appwrite`, `zitadel/zitadel`, `coolify/coolify`, `juspay/hyperswitch` (a payment processor, not an invoicing app), `CommunitySolidServer`, `eclipse-openvsx/openvsx` (a registry with no seller/commission side — no honest archetype), `snowdriftcoop/snowdrift` (self-declared outdated mirror), `medusajs/medusa-eats` (official example app) |
| declared discontinued upstream | 1 | `reactioncommerce/reaction` ("Project has been discontinued") |
| near-duplicate of a kept repo / archetype already over target | ~18 | `aimeos/aimeos-core`, `crmeb/crmeb_java`, `EclipseFdn/open-vsx.org`, plus 16 good `content-site`/`community` repos not needed at 37/36 rows (`gollum/gollum`, `area17/twill`, `Notifuse/notifuse`, `agnitas-org/openemm`, `silverstripe/silverstripe-cms`, `firestormforum/firestorm`, `linezero/NETCoreBBS`, …) |

## The star / recency floor actually used

The brief's preference was ≥100 stars and `pushed_at` within ~3 years. What was used:

- **Recency:** 335 of 336 rows were pushed within 3 years (since 2023-08); 322 within 2 years. The single
  exception is `Cocolabs-SAS/cocorico` (last push 2021-10), kept because `marketplace` is the scarce archetype
  and Cocorico is a genuine multi-vendor service-marketplace codebase. 14 rows are older than 12 months.
- **Stars:** median 1,733; 306 rows are ≥100 stars. **30 rows are below 100 stars and 15 below 50**, with a
  minimum of 11 (`CHTJonas/roombooking`). Every one of them says so in `notes` (`"relaxed: 27 stars"`,
  `"relaxed: last push 2024-12"`), so the relaxation is visible in the data rather than hidden here.
  107 rows carry a `relaxed:` note in total (this also covers repos in the 100–1,000 star band that are small
  or single-purpose enough to be worth flagging).
- Nearly all relaxations are concentrated in `marketplace`, `booking` and `b2b-invoicing`. `marketplace` in
  particular could not be filled to 34 without them: real, licensed, non-archived, multi-seller applications on
  GitHub are scarce, and the archetype was reached only by counting job boards, real-estate listing portals,
  peer-to-peer exchanges, food-delivery-with-vendors platforms, crowdfunding/fiscal-host platforms, a food
  co-op ordering system and one Spree multi-vendor extension (`spree/spree_multi_vendor`, flagged in `notes` as
  an extension rather than a standalone app). The star floor, not the licence rule or the "real app" rule, is
  what was relaxed.

## Relationship to `corpus/manifest.json`

`corpus/manifest.json` (untouched) is a **spec-document** corpus: 106 markdown documents, 44 of which name a
GitHub repository. Many of those 44 are documentation sites (`odoo/documentation`, `saleor/saleor-docs`,
`mastodon/documentation`, `invoiceninja/invoiceninja.github.io`, …) — correct as spec-doc sources, wrong as
application repositories, and they would be gated out at repo ingest.

So the 44 were carried over **by product, not by URL**: wherever a manifest row pointed at a docs repo, this
corpus points at the same product's application repo instead (`odoo/documentation` → `odoo/odoo`,
`getlago/lago-docs` → `getlago/lago`, `zammad/zammad-user-documentation` → `zammad/zammad`, and 15 more).
**39 of the 44 manifest products are represented here.** The five that are not:

- `daffahilmyf/requirement-generator` and `open-compass/DevBench` — dataset/benchmark mirrors, not applications.
- `gohugoio/hugoDocs` — Hugo is a static-site generator, i.e. a tool, excluded by rule 1.
- `sharetribe/flex-docs` — the application repo `sharetribe/sharetribe` is under the bespoke Sharetribe
  Community Public Licence (no SPDX id), so it was dropped.
- `getdokan/dokan` — no detectable licence on the current repository.

Archetype assignments from the manifest were kept, with three deliberate re-assignments where the manifest
entry described a *documentation subsystem* rather than the product: `open-compass/DevBench`'s
`internal-dashboard` row disappears with the repo; `getredash/website` → `getredash/redash` stays
`internal-dashboard`; and `frappe/erpnext_documentation` (manifest: `b2b-invoicing`) becomes
`frappe/erpnext` → **`crud-saas`**, because ERPNext as an application is a full ERP and only one of its modules
is invoicing (noted in the row). Likewise `odoo/documentation` (manifest: `b2b-invoicing`) becomes
`odoo/odoo` → **`crud-saas`** for the same reason.

## Known biases and limits

- **⚠ Survivorship / maturity bias — GitHub open source is NOT our target user population.** This restates the
  warning already in `docs/MINING.md` and `src/mining/corpus.ts` rule 4, because it is the single most
  important caveat on anything mined from this corpus. Open-source applications that accumulate stars are
  mature, feature-rich, multi-currency, multi-tenant, permission-heavy products built over years by developer
  communities. Our actual users are small businesses describing a one-page app. **Every rate computed from
  these 336 repositories is a rate *in this corpus*, not a population rate**, and priors mined from it will
  skew systematically toward over-asking: a feature that 60 % of these codebases implement may be irrelevant
  to 95 % of the people the product is for. A population claim needs a different sample (real customer briefs),
  and the corpus cannot supply one.
- **Developer-tooling gravity.** Even after excluding libraries and SDKs, GitHub over-represents domains
  developers build for themselves: self-hosting, hosting/billing panels, observability consoles, crypto
  exchanges, fediverse servers. `internal-dashboard` and `community` are the archetypes most affected.
- **Language ≠ implementation weight.** `primary_language` is GitHub's guess for the whole repository. Several
  rows are polyglot monorepos (`gz-yami/mall4j` is listed JavaScript but is a Java backend; `bettershop/LaikeTui`
  is listed PLpgSQL) and a handful of full-stack apps are listed as `HTML`, `CSS` or `Blade`. Treat the
  histogram as indicative.
- **Small/relaxed tail.** ~15 rows below 50 stars are small single-developer applications (a theatre room
  booking system, a clinic queue app, a Czech contractor invoicing tool). They are real applications, which is
  why they are here — they are arguably *closer* to the target population than the flagship products — but
  they are also thin, and their digests will carry less evidence per row.
- **Same-organisation clusters.** Frappe contributes 7 rows (erpnext, hrms, helpdesk, crm, lms, gameplan,
  books), `aelassas` 3 (bookcars, movinin, wexcommerce), `enatega` 2, `atrocore` 2, `siam1026` 2, `frappe`-based
  POS 1. Treat evidence in those archetypes as slightly organisation-correlated.
- **Chinese-language mall/admin cluster** in `e-commerce` and `internal-dashboard` (CRMEB, mall4j, shopxo,
  macrozheng/mall, litemall, LaikeTui, JeecgBoot, eladmin, ruoyi-vue-pro, zero-admin). These are real,
  large, feature-rich applications, but their READMEs and comments are largely Chinese, which may affect the
  labeller's quote extraction.
- **Head-of-branch pinning.** `commit` is the default-branch head on 2026-08-25, not a release tag. Re-running
  the collector produces different SHAs, and therefore different `artifact_id`s and `digest_hash`es. That is
  the intended behaviour (a re-run is visibly a different observation), but it means this file must be treated
  as a dated snapshot.

## Reproducing / extending

The collection was `gh` CLI plus `jq` — no checked-in script. To add a repository:

```sh
gh api repos/{owner}/{name} \
  --jq '[.full_name,.default_branch,(.license.spdx_id//"NULL"),.stargazers_count,.pushed_at,.language,.fork,.archived] | @tsv'
gh api repos/{owner}/{name}/commits/{default_branch} --jq .sha
```

then append a row to `corpus/repos.json` with `file: ""`, `id` = `<owner>-<name>` lowercased with
non-alphanumerics collapsed to `-`, and an archetype from the eight in `catalogs/`. Drop it if the licence is
null or has no SPDX id, if it is a fork or archived, if the SHA does not resolve, or if the name ends in
`docs`/`documentation`/`handbook`/`wiki`/`guide(s)` or `.github.io`.

Invariants the file satisfies (worth re-checking after any edit):

```sh
node -e 'const r=require("./corpus/repos.json");
  console.log(r.length, new Set(r.map(x=>x.owner+"/"+x.name)).size, new Set(r.map(x=>x.id)).size);
  console.log("bad commit", r.filter(x=>!/^[0-9a-f]{40}$/.test(x.commit)).length);
  console.log("null licence", r.filter(x=>!x.license).length);'
```
