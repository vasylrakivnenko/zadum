# Decision catalogs

One JSON per archetype plus `core.json` (applies to every app). Schema: `src/core/catalog.ts` (`CatalogSchema`).

- `id` — stable node id (never rename; add a new node instead). Used as the Sheet decision id.
- `options[].implies` — **hard** logical edges (choosing X forces Y). Applied deterministically after every answer
  and used to repair sampled worlds. Soft correlations are learned from the worlds, not written here.
- `consequence` 0–5 — blast radius if defaulted wrong. v1 hand-set; to be replaced by measured sensitivity
  (flip node → recompile → spec diff size) + observed post-session edit cost.
- `prior` — v1 hand-set; mixed with sampled worlds at pseudo-weight `alpha`; to be replaced by learned
  population priors (counts per archetype/node/option from real sessions).
- `applies_to` — archetype ids; empty = all.

Archetype ids in use (node counts): `core` (27), `b2b-invoicing` (22), `booking` (22), `marketplace` (22),
`e-commerce` (20), `crud-saas` (16). Planned: `content-site`, `internal-dashboard`, `community`, `portfolio-landing`,
`other` (core only).

Archetype catalogs add only archetype-specific decisions; generic concerns (auth, tenancy, notifications, payments,
attachments, import/export, deletion, ...) stay in `core.json` and are reached via `implies` edges from archetype
options (e.g. an option that needs customer login implies `external_access=portal`). `src/engine/catalogs.test.ts`
checks merge cleanliness, global id uniqueness, priors, and edge targets for every catalog.

Catalog changes are versioned (bump `version`) and every session event carries the catalog version. Current
catalog version: **`2026.08.23-1`** (`core.json` itself is unchanged and stays at `2026.08.22-1` — see below).

## Learned from corpus (2026-08-23)

`corpus/mining/2026-08-23-concept-priors.json` and `-new-concepts.json` are stage-2 output of `src/mining/concepts.ts`
run on the 106-doc real corpus (see `docs/MINING.md` "First real run"). That corpus **skews toward mature,
feature-rich open-source products** (Odoo, Medusa, Cal.com, Metabase, ...), so its option fractions are not a
population prior for small/simple businesses — they are one input, folded in gently:

**Blending rule** — for every catalog node with a mined hint where `evidence_n >= 4` and `coverage >= 0.5` (i.e.
the concept-extraction LLM pass actually reached at least half of that archetype's specs and saw the node at least
4 times), the hand-set `prior` was replaced by a 50/50 blend:

    blended[option] = 0.5 * existing_prior[option] + 0.5 * mined_fraction[option]   (then renormalized to sum 1, rounded to 3dp)

If a node had no `prior` field, the "existing" side of the blend is uniform over its options. Nodes below the
`evidence_n >= 4` / `coverage >= 0.5` bar were **left untouched** — there isn't enough signal to justify moving
off the hand-set number. `question`, `options`, `implies`, `sections`, `tags`, and `consequence` were never
touched; only `prior` values changed on existing nodes.

**New nodes** — `corpus/mining/2026-08-23-new-concepts.json` lists decisions the catalog doesn't yet have,
mined per-archetype with example spec text and observed counts. Entries with `count >= 2` (and a couple of `n=1`
entries judged clearly real, materially different, and not vertical-specific noise — see per-catalog notes below)
were promoted to new nodes. Every new node's `prior` is Laplace(+0.5)-smoothed from the observed option counts and
then **capped so no option exceeds 0.9** — a single document (or two) is real evidence that the *decision axis*
exists, but not enough to be near-certain about which option is typical. `booking`, `marketplace`, and `crud-saas`
are already at the top of the node-count range `src/engine/catalogs.test.ts` hard-codes for them, so no new nodes
were added there even where a plausible candidate existed (see "Skipped" below) — only `b2b-invoicing` and
`e-commerce` had headroom.

### Priors updated (blended), per catalog

Full before/after tables with `evidence_n` are in the session report; in short:

| catalog | nodes with a blended prior |
|---|---|
| `b2b-invoicing` | `invoicing_model`, `invoice_numbering`, `invoice_edit_after_send`, `payment_recording`, `partial_payments`, `taxes`, `currencies`, `recurring_invoices`, `overdue_reminders`, `estimates`, `credit_notes`, `expenses`, `time_tracking`, `invoice_delivery`, `accounting_sync`, `invoice_statuses`, `branding`, `deposits` (18 of 19 pre-existing nodes) |
| `booking` | `booking_who_books`, `booking_resource_model`, `booking_service_catalog`, `booking_availability_rules`, `booking_buffers`, `booking_slot_capacity`, `booking_recurring`, `booking_confirmation`, `booking_calendar_sync` (9 of 22) |
| `marketplace` | `mp_supply_type`, `mp_seller_onboarding`, `mp_listing_approval`, `mp_listing_visibility`, `mp_buyer_accounts`, `mp_pricing_control`, `mp_transaction_mode`, `mp_payment_flow`, `mp_fee_model`, `mp_reviews`, `mp_discovery`, `mp_fulfilment`, `mp_seller_dashboard`, `mp_taxonomy_control` (14 of 22) |
| `e-commerce` | `shop_goods_type`, `shop_product_variants`, `shop_inventory`, `shop_storefront_access`, `shop_checkout_accounts`, `shop_shipping`, `shop_tax`, `shop_discounts`, `shop_payment_methods`, `shop_order_lifecycle`, `shop_returns`, `shop_currency`, `shop_reviews`, `shop_abandoned_cart`, `shop_gift_cards`, `shop_wholesale`, `shop_fulfilment` (17 of 19) |
| `crud-saas` | `record_activity_feed`, `record_views`, `record_templates` (3 of 16 — this archetype had the fewest specs extracted by stage 2) |

Nodes not listed for a catalog (e.g. `booking_no_show`, `booking_time_zones`, most `record_*` nodes) fell below
`evidence_n >= 4` or `coverage >= 0.5` and kept their v1 hand-set prior unchanged.

### New nodes added

| catalog | node id | why |
|---|---|---|
| `b2b-invoicing` | `invoice_po_reference` | `purchase_order_reference_on_invoices`, count = 2 in new-concepts.json — a real, materially different decision (does an invoice carry/validate the client's PO number?) not covered by any existing node. |
| `b2b-invoicing` | `invoice_discounts` | `discounts_line_and_global`, count = 1 but the catalog had **no** discount node at all for invoices (unlike `e-commerce`'s `shop_discounts`) — a near-universal invoicing feature, judged a real gap rather than noise. |
| `b2b-invoicing` | `payment_terms` | `payment_terms`, count = 1 but a near-universal invoicing concept (net terms / due-on-receipt) with no existing node covering it; it also sharpens the basis for `overdue_reminders`/`late_fees`. |
| `e-commerce` | `shop_category_structure` | corroborated from two directions: stage-1's `catalog-gaps` explicitly flags `"category tree"` (df 0.3, no nearest node) in `2026-08-23-stage1-report.json`, and stage 2's new-concepts.json has a cluster of related `count=1` entries (`category_hierarchy`, `category_multistore_root`, `product_category_assignments_dynamic_or_explicit`, ...) all pointing at the same missing axis: is the catalog flat, single-level, or a multi-assign tree? |

`b2b-invoicing` went from 19 → 22 nodes (catalog-test range `[15,25]`); `e-commerce` went from 19 → 20 nodes
(range `[16,20]`, now at the top of that range).

### Skipped as noise (or as out of budget)

- Every other `count=1` entry in `new-concepts.json` for every archetype — the large majority are vertical-specific
  one-offs from a single mature product (Italian e-invoicing rules, IoT wearables, camp/clinic scheduling, dataset
  marketplaces, ...) rather than decisions a typical app in that archetype needs to make. Per `docs/MINING.md`
  "Known limits", frequency in a survivorship-biased corpus of feature-rich products is not the same as a real gap.
- `booking`, `marketplace`, `crud-saas` had **zero** `count >= 2` new-concept entries, so no node there crossed
  even the low bar for consideration — consistent with `booking`/`marketplace`/`crud-saas` already being at their
  catalog-test node-count ceiling, so this didn't force a hard tradeoff.
- Within `b2b-invoicing`, plausible-but-thinner `count=1` candidates (`milestone_invoicing`, `down_payment_types`,
  `quote_validity_period`, `write_off_underpayment`) were left out: each is a refinement of an existing node
  (`invoicing_model`, `deposits`, `estimates`, `partial_payments` respectively) rather than a new decision axis.
- The EU/Italy e-invoicing/VAT cluster (`vat_number_required_for_business_customers`, `reverse_charge_mechanism_support`,
  `vat_validation_using_vies`, `fiscal_code_required_for_italy`, `structured_electronic_invoice`, ...) is real and
  regulatory-relevant, but every entry is `count=1` from what looks like a single Italy/EU-focused product; it needs
  its own polarity-aware pass (jurisdiction as a first-class axis) rather than one hurried node, so it was left for
  a future mining round.
