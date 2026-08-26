# Small-application corpus (`corpus/repos-small.json`) — what was collected and how

**This file is the small-scale counterpart to `corpus/repos.json`, built to correct that corpus's skew toward
mature platforms.** `corpus/repos.json` holds 336 real applications, but when their kept text was measured,
186 of them (57 %) came out over 2M tokens — Odoo, Magento 2, Grafana, Discourse, ERPNext — and only 6 were
under 100k. `docs/MINING.md` already warned that "the corpus over-represents mature, feature-rich products, so
priors mined from them skew toward over-asking for small businesses"; the size measurement showed we had built
exactly that corpus. Mining priors from Magento teaches the system what a mature commerce platform contains,
which is the opposite of what a 3-person bookkeeping firm is commissioning.

So: **150 small, real applications**, deliberately selected at the size and ambition of what a small business
would actually commission — a barbershop reservation page, a clinic appointment system, a stock tracker for one
shop, a club membership register. Collected 2026-08-26 with the `gh` CLI only; **nothing was cloned**.

Row schema is byte-identical to `corpus/repos.json` (a superset of `ManifestEntry` in `src/mining/label.ts`):
`file` is `""`, `id` is `<owner>-<name>` lowercased with non-alphanumeric runs collapsed to `-`, and every row
carries `owner`, `name`, a 40-hex `commit`, `default_branch`, `license`, `stars`, `pushed_at`,
`primary_language`, `notes`. Existing loaders need no changes; `corpus/repos.json` and `corpus/manifest.json`
were not touched.

## The size target, and the proxies actually used

The goal was repositories whose total source is roughly **50k–600k tokens** (≈200 KB–2.4 MB of text). Tokens
cannot be measured without cloning, so three cheap proxies were used — and, critically, **`gh search repos`
exposes `size` both as a `--size` filter and as a returned JSON field**, so the primary proxy was available at
search time and cost no extra API calls.

| proxy | threshold used | why |
|---|---|---|
| repo disk size (`size`, KB) | **searched** `--size "200..50000"`; **preferred** 1,000–40,000; **hard reject** > 80,000 | the brief's primary proxy; the 50,000 search ceiling meant nothing over 80,000 ever entered the pool |
| stars | **searched** `--stars "30..2500"` (first pass `50..2000`); kept 40 as the working floor | a 20k-star project is almost always huge. Popularity was *not* chased — a 60-star app that does one job is the target |
| description shape | one named job ("simple invoicing app", "barber shop booking system") over platform language ("enterprise ERP", "extensible framework", "all-in-one suite") | applied by hand; see the drop table |
| recency | last push ≥ 2022-01 | kept the tail alive without admitting dead code |

**Resulting size distribution of the 150 rows** (disk KB, from the API):

| min | p25 | median | p75 | p90 | max |
|---|---|---|---|---|---|
| 479 | 1,953 | **4,325** | 9,332 | 18,499 | 45,086 |

131 of 150 sit inside the preferred 1,000–40,000 KB band; 18 are under 1,000 KB (small but real — a Rails
forum, a Go POS API, a Vue CRM); **1 is over 40,000 KB** (`simpleinvoices/simpleinvoices`, 45,086 KB, flagged in
its `notes`). Nothing is over 80,000 KB. For comparison, the median row here is roughly three orders of
magnitude smaller than the >2M-token half of `corpus/repos.json`.

⚠ **Disk size is a proxy, not a measurement.** It includes images, vendored assets, `.git` objects and test
fixtures, so a 20 MB repo can be 40k tokens of kept text and a 900 KB repo can be 200k. The token counts are
unknown until `npm run mine:corpus` clones these and `condenseRepo` reports `approx_tokens`. **That run is the
actual test of whether this corpus hits the 50k–600k window** — this file only claims the selection was biased
hard toward small, not that the target was met.

## Method

1. **Search.** 278 distinct `gh search repos` queries in three passes: a 160-query keyword pass at depth 60
   (`"invoice management system"`, `"salon booking system"`, `"gym membership management"`, `"laundry management
   system"`, `"pharmacy management system"`, `"hostel booking"`, `"event ticketing"`, …), a 118-query broad pass
   at depth 200–300 (`invoice`, `appointment`, `pos system`, `inventory management`, `helpdesk`, `job board`,
   `forum`, `cms`, …), and one licence-filtered pass that was abandoned once it became clear `gh search repos
   --license a,b,c` **ANDs** the qualifiers and therefore returns almost nothing. Every query carried
   `--archived=false --include-forks=false` plus the size and star filters above, so forks, archived repos and
   oversized repos never entered the pool. 167 queries returned at least one row; **4,673 distinct
   repositories** were pooled.
2. **Mechanical filters** (scripted, over the search JSON): drop anything already in `corpus/repos.json`, any
   `license: null`, any licence GitHub reports as `other` (no SPDX id), and any name matching
   `MIRROR_NAME_HEURISTICS` from `src/mining/corpus.ts` — including the documentation gate
   `/(docs?|documentation|handbook|wiki|guides?)$/` and `.github.io`. 2,329 survived.
3. **Description screen** (scripted, then by hand): drop tutorial/course/bootcamp companions, boilerplate and
   starters, templates and scaffolds, "built to demonstrate", UI kits and admin *themes*, SDKs, API clients and
   wrappers, plugins/extensions for a host product, and product clones. Then bucket by archetype keywords.
   1,925 bucketed, 1,259 left after the size/star/recency floors.
4. **Hand screen, one archetype at a time.** Rule 1 of the corpus brief applied by reading every one of the
   1,259 descriptions: *does this plausibly contain routes, a DB schema, auth code, maybe payment code* — the
   things `REPO_CLASSIFIERS` in `src/mining/condense.ts` actually reads? This is where the large majority of
   drops happened, and the drop table below names the categories.
5. **Verify every survivor over the API.** `GET /repos/{o}/{n}` for `fork`, `archived`, `license.spdx_id`,
   `stargazers_count`, `pushed_at`, `language`, `size`, `default_branch`, then
   `GET /repos/{o}/{n}/commits?per_page=1` for the head SHA. 260 repositories were verified this way; **all 260
   passed** — no 404s, no null licences, no forks, no archived repos, and every SHA resolved. **Nothing here
   comes from recall.**
6. **Trim to the archetype targets.** 110 verified surplus rows were dropped, preferring, within each
   archetype: in-band size, one-job descriptions, domain diversity (so `crud-saas` is not six library systems),
   and at most one repo per owner. 150 rows shipped.

**Every row is pinned to a commit** — the default-branch head on 2026-08-26, read from the API, because
`artifactId()` pins provenance to a commit and `repo:owner/name@HEAD` is not a reproducible claim.

## Per-archetype counts

| archetype | rows | target | median KB | languages present |
|---|---|---|---|---|
| `b2b-invoicing` | 22 | 22 | 3,753 | PHP, TypeScript, Ruby, Python, Go, Vue, JavaScript, C#, HTML |
| `booking` | 26 | 26 | 5,716 | PHP, TypeScript, JavaScript, C#, Python, Java, HTML, CSS |
| `e-commerce` | 24 | 24 | 6,285 | PHP, TypeScript, JavaScript, Python, Go, Java, Vue, Jinja, HTML, CSS |
| `marketplace` | 18 | 18 | 6,660 | TypeScript, JavaScript, PHP, Python, Ruby, Clojure, HTML, CSS |
| `crud-saas` | 26 | 26 | 2,295 | PHP, TypeScript, Python, C#, Ruby, Go, Vue, Blade, HTML |
| `internal-dashboard` | 16 | 16 | 3,422 | TypeScript, PHP, Python, Vue, JavaScript, Haskell, SCSS |
| `community` | 10 | 10 | 1,319 | TypeScript, PHP, Ruby, Go, C#, Vue, Python, OCaml |
| `content-site` | 8 | 8 | 2,324 | PHP, TypeScript, Go |
| **total** | **150** | 150 | 4,325 | |

Every target was met. `marketplace` was the hardest and is the one to distrust: see "Known biases" below.

## Licence histogram

| SPDX | n |
|---|---|
| MIT | 104 |
| GPL-3.0 | 17 |
| Apache-2.0 | 12 |
| AGPL-3.0 | 11 |
| Unlicense | 2 |
| BSD-3-Clause, LGPL-3.0, MPL-2.0, MulanPSL-2.0 | 1 each |

**This is the inverse of `corpus/repos.json`, and it is a finding, not an accident.** There, copyleft dominated
(AGPL-3.0 + GPL-\* + LGPL-\* = 169 of 336, AGPL-3.0 alone 98). Here permissive dominates: MIT alone is 104 of
150 (69 %), and AGPL-3.0 is 11. Small single-author apps ship MIT; mature multi-vendor products that need a
commercial-hosting moat ship AGPL. The licence field is therefore itself a maturity signal, and any analysis
that stratifies by licence across the two corpora will be confounded by it.

All 150 licences carry an SPDX identifier and all 150 are OSI-approved or public-domain-equivalent — there is
no BUSL/Elastic/source-available tail here, unlike the four flagged rows in `corpus/repos.json`.
`MulanPSL-2.0` (one row, `yeshuang2/campus-second-hands`) is a real SPDX id but an unusual one; drop it if
strictness is required.

## Language histogram

| language | n | | language | n |
|---|---|---|---|---|
| PHP | 36 | | Vue | 6 |
| TypeScript | 34 | | CSS | 6 |
| JavaScript | 19 | | Java | 2 |
| Python | 12 | | Blade | 2 |
| Go | 8 | | Clojure, Haskell, Jinja, OCaml, SCSS | 1 each |
| C# | 7 | | | |
| HTML | 7 | | | |
| Ruby | 6 | | | |

PHP + TypeScript + JavaScript = 89 of 150 (59 %). This is more JS/TS/PHP-heavy than `corpus/repos.json` (which
carried 78 non-JS/TS/PHP/Ruby/Python rows specifically to stress-test the file-locus classifiers) and it is a
real loss of coverage: **Java (2), Elixir (0), Rust (0), Kotlin (0), Scala (0), Perl (0), Dart (0)** are absent
or near-absent. Two causes, both worth knowing: small business apps on GitHub really are mostly Laravel,
Next.js and Django; and the *hand screen deliberately rejected* Java/Kotlin/Dart/Swift candidates, because at
this size band they are overwhelmingly Swing/JavaFX/WPF desktop apps and Flutter/Compose mobile UIs with no
routes and no server schema — the `REPO_CLASSIFIERS` loci would come back empty. If cross-language coverage
matters more than smallness, take it from `corpus/repos.json`; this corpus cannot supply it.

`primary_language` is GitHub's guess for the whole repository, so the seven `HTML`, six `CSS`, two `Blade`, one
`Jinja` and one `SCSS` rows are full-stack apps mislabelled by asset volume. Treat the histogram as indicative.

## Star and recency distribution

| | value |
|---|---|
| stars: min / median / max | **40 / 136 / 2,251** |
| rows below 100 stars | 62 (41 %) |
| rows below 50 stars | 17 (11 %) |
| rows above 2,000 stars | 2 (`mrvautin/expressCart` 2,251 and `Hasnayeen/invobook` 2,236 — the only two over the search band) |
| last push: oldest / newest | 2022-02 / 2026-08 |
| pushed within 12 months | 74 |
| pushed within 2 years | 96 |
| pushed within 3 years | 121 |

Compare `corpus/repos.json`: median **1,733** stars, 306 of 336 rows at ≥100. Median stars here are **12.7×
lower**, which is the intended effect — star count was used as a size proxy, not as a quality bar. Every
relaxation is visible in the data rather than hidden in this file: **17 rows carry `relaxed: N stars`** and
**54 carry `relaxed: last push YYYY-MM`** (i.e. older than 2024-08) in their `notes`.

29 rows are older than 2 years. That is a deliberate trade: a 2022 Symfony job board or a 2023 PHP barbershop
reservation system is still a faithful sample of *what a small business commissions*, and freshness matters less
here than shape.

## Student and hobby projects

**22 rows are flagged in `notes` as `student project`, `hobby project`, `college mini project` or
`freelance client project`**, so the population is visible in the data rather than asserted here. Examples:
`Varshithvhegde/car_rental_project` ("College Mini Project"),
`pjborowiecki/ARKA-Veterinary-Clinic-Page-and-Appointment-Booking-System` (a real paid freelance job for one
clinic), `MehaRima/online_ambulance_booking_service`, `SfisoNxumalo/KpWaterBillingSystem`,
`yeshuang2/campus-second-hands`, `israelias/thrifthub`.

These are the rows to *keep*, not apologise for. A university team's clinic appointment system is far closer to
our target user's ambition than Odoo is, and it was judged on "is this a working app with a schema and routes",
not on polish. The flag is there so that any rate computed over this corpus can be recomputed with the
student/hobby rows excluded, and the two numbers compared — if a prior moves a lot, it was an artefact of
project maturity rather than of the domain.

## Drops, and why

4,673 pooled → 150 shipped. 4,523 drops:

| stage | reason | n | examples / notes |
|---|---|---|---|
| mechanical | **no detectable licence** (`license: null`) | **1,885** | by far the largest single reason, and the defining constraint at this size band: small single-author apps very often ship no LICENSE file at all. 40 % of the entire pool died here |
| mechanical | licence present but **no SPDX id** (GitHub reports `other`) | 306 | bespoke/modified licences, `LICENSE` files containing only a copyright line |
| mechanical | name trips `MIRROR_NAME_HEURISTICS` | 106 | `*-template`, `*-example`, `*-demo`, `awesome-*`, `*-docs`, `*.github.io` |
| mechanical | already in `corpus/repos.json` | 47 | deduped by lowercased `owner/name`; final overlap is **0** |
| mechanical | fork / archived / size > 80,000 KB | 0 | excluded at search time by `--include-forks=false --archived=false --size "200..50000"`, so none ever entered the pool |
| description | tutorial, course, bootcamp or book companion; boilerplate, starter, template, scaffold; "built to demonstrate"; SDK / API client / wrapper; plugin or extension for a host product; product clone | 297 | `gvolpe/pfps-shopping-cart` (book), `shamahoque/mern-*` (book), `bradtraversy/support-desk` (YouTube course), `AlvaroIsrael/gobarber-app` (bootcamp), `temporalio/reference-app-orders-go` (reference app) |
| description | no archetype keyword matched | 107 | genuinely out of scope |
| floors | under 400 KB, over 60,000 KB, under 40 stars, or last push before 2022-01 | 666 | |
| **hand screen** | **not an application** — the big one, 999 drops across these categories: | **999** | |
| | · PDF/receipt *generators* and invoice *libraries* rather than invoicing apps | | `strzibny/invoice_printer`, `maaslalani/invoice` (CLI), `num-num/ubl-invoice`, `premium-minds/billy` ("invoicing engine"), `contributte/invoice` |
| | · OCR / document-extraction pipelines that matched "invoice" or "receipt" | | `invoice-x/invoice2data`, `ReceiptManager/receipt-parser-legacy`, `sifter-ai/sifter`, dozens of RAG "knowledge base" repos that matched `content-site` |
| | · desktop-only apps (Swing, JavaFX, WPF, .NET MAUI, Qt, Electron) — no routes, no HTTP layer | | `harismuneer/Library-Management-System-JAVA`, `zjxi/HospitalManagementSystem-WPF`, `dragotin/kraft`, `russkyc/groomwise`, `piratuks/invoice-builder` |
| | · mobile-only apps and UI mock-ups (Flutter, Jetpack Compose, SwiftUI) with no server schema | | `Spikeysanju/Expenso`, `sameersyd/Expenso-iOS`, `MonsieurZbanowanYY/*-UI-Flutter`, `SinaSys/flutter_ecommerce_app` |
| | · **admin-dashboard UI kits and themes** — the dominant pollutant in `internal-dashboard`; a dashboard *template* has no schema and no auth | | `themesberg/*`, `creativetimofficial/*`, `themekita/Atlantis-Lite`, `puikinsh/notika`, `shadcndashboard/shadcndashboard`, `flatlogic/angular-material-dashboard`, `roketid/windmill-*` |
| | · frameworks, platforms, builders, ERPs and "suites" — the exact end of the distribution this corpus exists to avoid | | `basetool-ai/basetool`, `trysourcetool/sourcetool`, `Ivy-Interactive/Ivy-Framework`, `compose-dev/compose`, `hypertool/hypertool`, `aviabird/angularspree`, `avored/framework`, `uvdesk/core-framework`, `ozma-io/ozma`, `iDempiere-micro/erpjs`, `notrinos/NotrinosERP`, `shyamsitaula/samarium`, `lsfusion-solutions/mycompany`, `meteroid-oss/meteroid`, `gorkem-bwl/atlas`, `be-BOP-io-SA/be-BOP` |
| | · addons for a host platform (ERPNext/Frappe, Odoo/OCA, WooCommerce, WordPress, Flarum, TYPO3, SilverStripe, Spree/Solidus, Sylius) | | `navariltd/utility-billing`, `OCA/account-invoicing`, `wpovernight/woocommerce-pdf-invoices-*`, `Beveren-Software-Inc/KLiK_PoS`, `alextselegidis/easyappointments-wordpress`, `FriendsOfFlarum/*`, `Sylius/InvoicingPlugin` |
| | · frontend-only repos whose backend is Shopify/Strapi/Firebase-hosted elsewhere | | `lakshman-chaudhary/stay-booker-*-frontend`, `rashidshamloo/clothing-store`, `mokuappio/serverless-invoices` |
| | · self-declared dead or clones | | `ikismail/ShoppingCart` ("PROJECT IS NOT MAINTAINED"), `youhusky/Food_Ordering_System` ("Maybe Deprecated"), `copona/copona` (OpenCart derivative), `zhuzhiqiang18/Second-hand-mall` (Xianyu clone) |
| | · **query-collision noise** — searching `spa` matched Apache **Spark**, single-page-**SPA** routers and `Spa`ce/`Spa`m/`Spa`rse repos; `marketplace` matched ~40 *Claude Code / VS Code plugin marketplaces*; "knowledge base" matched the entire RAG ecosystem | | this is a lesson for the next scrape: the short domain words are unusable as standalone queries |
| verification | lost at the API step | **0** | all 260 verified candidates passed |
| trim | verified surplus over archetype targets | 110 | e.g. 36 good `b2b-invoicing` candidates for 22 slots; dropped for size, one-job clarity, domain diversity and one-repo-per-owner |

## Known biases and limits

- **⚠ GitHub is still not our real user population — only closer to it.** This corpus fixes *size*, not
  *provenance*. These are still open-source repositories written by developers who chose to publish, not briefs
  written by small businesses who commissioned software. Every rate computed from these 150 repositories is a
  rate *in this corpus*, not a population rate. What has changed is the direction of the error: `repos.json`
  systematically over-asks (a feature 60 % of mature platforms implement may be irrelevant to 95 % of our
  users), while this corpus should over-ask far less and may now *under*-represent things real businesses do
  need (multi-user permissions, tax handling, audit trails) because a solo developer's weekend app skips them.
  **Neither corpus can settle a population question; the two of them bracket it.** A population claim still
  needs real customer briefs.
- **Evidence density will be lower per row.** `corpus/repos.json` warned that its ~15 sub-50-star rows "are
  also thin, and their digests will carry less evidence per row". Here that tail *is* the corpus: median 4.3 MB
  and median 136 stars means thinner digests, fewer witness loci per repo, and more rows where a locus is
  simply absent. Expect `available_loci` counts to drop and `blocked_reason`/empty-digest rates to rise
  relative to the big corpus. **Absence of a locus in a small app is weak evidence of absence in the domain**
  — it is at least as likely to mean "one developer had not got to it yet".
- **The 40 % unlicensed loss is not random.** The rule that killed 1,885 of 4,673 pooled repos correlates with
  exactly the population we want: the smaller and more amateur the project, the less likely it carries a
  LICENSE file. So this corpus is the *licensed* subset of small apps, which skews toward developers who have
  published before and know the conventions — a second, quieter maturity filter sitting on top of the size
  filter. It cannot be removed without breaking corpus rule 2.
- **Archetype assignment is single-label and lossy at this size.** Small apps blur categories more than large
  ones: a barbershop site is booking + content-site, a restaurant app is booking + e-commerce, a POS is
  e-commerce + internal-dashboard, a school system is crud-saas + booking + invoicing. The dominant job was
  recorded and the overlap named in `notes` where it mattered, but the label carries less information here
  than in `repos.json`.
- **`marketplace` is the weakest archetype and the honest finding of this scrape.** GitHub has very few small,
  licensed, non-archived, genuinely multi-seller applications. The 18 rows were reached only by counting job
  boards (5), multi-vendor storefronts (5), a multi-vendor thrift store, a peer-to-peer rental app, a campus
  second-hand exchange, a freelancing market, a digital-goods market, a generic buy/sell app, a Clojure
  marketplace and a Nostr market — and the *searchable term* is now dominated by AI-tooling plugin marketplaces
  (~40 in the pool) and NFT contracts. Treat marketplace evidence as thin and heterogeneous.
- **`internal-dashboard` is mostly developer-tooling gravity.** Four of 16 rows are analytics dashboards *for
  AI coding tools* (`Claud-ometer`, `cc-lens`, `agentgraphed`, and `hakatime` for coding time) and three are
  admin UIs for a developer product (`meilisearch-ui`, `meilisync-admin`, `netbirdio/dashboard`). GitHub simply
  does not host the small-business internal dashboard — that thing lives in a spreadsheet. This is the
  archetype whose priors should be trusted least.
- **`content-site` is thin at 8 rows** and half of it is small CMSes rather than the sites a small business
  wants. "Knowledge base" as a query term is now entirely captured by the RAG/LLM ecosystem, which cost this
  archetype most of its natural search surface.
- **Same-owner and same-domain clusters.** At most one repo per owner survived the trim, with four deliberate
  exceptions, each flagged in both rows' `notes`: `pjborowiecki` (a veterinary booking app and a restaurant
  table-booking app, both real client work), `jairiidriss` (a barbershop site and a restaurant site),
  `nafiesl` (a bookkeeping app and a freelancer PM tool), `manjurulhoque` (an appointment system and a store).
  Domain clustering is the bigger risk: `crud-saas` still holds 5 CRMs and 3 helpdesks, `e-commerce` holds 9
  POS systems, and `booking` holds 3 hotel systems and 3 car-rental systems. Evidence within an archetype is
  domain-correlated, so a "60 % of booking apps do X" figure may be reporting on three hotel codebases.
- **Language coverage regressed on purpose.** See the language histogram: Java, Kotlin, Rust, Elixir, Scala,
  Perl and Dart are absent or near-absent, partly because desktop/mobile candidates in those languages were
  rejected as not-web-applications. If `REPO_CLASSIFIERS` needs cross-language stress-testing, that must come
  from `corpus/repos.json`.
- **Chinese- and Indonesian-language clusters.** A handful of rows (`zchengo/crm`, `Chien-W/*`,
  `weijiang1994/university-bbs`, `yeshuang2/campus-second-hands`, `eddy8/LightCMS`, `Wscats/cms`,
  `haxorsprogramming/Nadha-Laundry`, `bagussatoto/*`, `aryadwiputra/*`, `rezadrian01/Kasirku`) have non-English
  READMEs and comments, which affects the labeller's quote extraction the same way the Chinese mall/admin
  cluster does in `repos.json`.
- **Head-of-branch pinning.** `commit` is the default-branch head on 2026-08-26, not a release tag. Re-running
  the collector produces different SHAs, therefore different `artifact_id`s and `digest_hash`es. That is
  intended — a re-run is visibly a different observation — but it makes this file a dated snapshot.

## Reproducing / extending

`gh` CLI plus `jq` and two throwaway node scripts; no checked-in collector. The one non-obvious detail worth
recording: `gh search repos` exposes `size` as **both** a filter and a JSON field, so size-first collection
needs no per-repo API call —

```sh
gh search repos "appointment booking system" \
  --stars "30..2500" --size "200..50000" --archived=false --include-forks=false --limit 200 \
  --json fullName,description,stargazersCount,size,license,pushedAt,language,defaultBranch,isFork,isArchived
```

and `--license a,b,c` **ANDs** the qualifiers (`license:mit license:apache-2.0` matches nothing), so licence
must be filtered client-side or one licence per query. The search API allows 30 requests/minute and 1,000
results per query (100 per page), so `--limit 300` costs three requests; pace at ~6.5 s per query.

To add a repository:

```sh
gh api repos/{owner}/{name} \
  --jq '[.full_name,.default_branch,(.license.spdx_id//"NULL"),.stargazers_count,.pushed_at,.language,.size,.fork,.archived] | @tsv'
gh api "repos/{owner}/{name}/commits?per_page=1" --jq '.[0].sha'
```

Drop it if the licence is null or has no SPDX id, if it is a fork or archived, if the SHA does not resolve, if
`size` > 80,000 KB, if the name ends in `docs`/`documentation`/`handbook`/`wiki`/`guide(s)` or `.github.io`, or
if it is already in `corpus/repos.json`.

Invariants this file satisfies (re-check after any edit):

```sh
node -e 'const r=require("./corpus/repos-small.json"), big=require("./corpus/repos.json");
  const seen=new Set(big.map(x=>x.owner+"/"+x.name));
  console.log("rows",r.length,"unique",new Set(r.map(x=>x.owner+"/"+x.name)).size,
              "ids",new Set(r.map(x=>x.id)).size,
              "overlap",r.filter(x=>seen.has(x.owner+"/"+x.name)).length);
  console.log("bad commit",r.filter(x=>!/^[0-9a-f]{40}$/.test(x.commit)).length,
              "null licence",r.filter(x=>!x.license).length);'
# → rows 150 unique 150 ids 150 overlap 0 / bad commit 0 null licence 0
```
