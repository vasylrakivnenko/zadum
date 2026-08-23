# Catalog mining from a spec corpus

Offline tooling (`src/mining/`) that turns a corpus of real specifications into reviewable catalog data.
It emits versioned JSON a human folds into `catalogs/*.json`; it never touches the runtime (ADR-010's shape).

    npm run mine -- --corpus <dir> [--out dir] [--n 3] [--min-df 2] [--band 0.2,0.8] [--limit 40]
                    [--spec <compiled-spec.md> --archetype <id>]

Corpus layout: `<corpus>/<archetype>/*.md`, or a `manifest.json` of `{file, archetype, id}`.

## The idea: document frequency IS the prior, entropy IS the node test

For a term appearing in fraction **DF** of an archetype's specs:

| DF in archetype | meaning | action |
|---|---|---|
| ~0.5 | maximum-entropy axis — half these apps do it, half don't | **decision node candidate** (~1 bit) |
| >0.8 | everyone does it | coverage checklist item / default with a strong prior |
| <0.2 | almost nobody | non-goal candidate, or `applies_to` exclusion |

This is the card-selection criterion applied one level up, to catalog construction. Corpus DF drops straight
into the `prior` field the selector already mixes with sampled worlds at pseudo-weight α — no architecture
change, just data replacing hand-set numbers.

## Why 1–3-grams, reported by role rather than blended
- **n=1 saturates.** "payment" is in ~every invoicing spec (DF≈1): useless as an axis, ideal for the coverage
  check. Unigrams therefore drive `coverageTerms` / `specCoverage`.
- **n=2,3 carry the signal.** "partial payment", "credit note", "purchase order" sit near DF≈0.5. Multiword
  grams get a small length bonus in `Candidate.score` because they are likelier to name a real decision.

Four filters keep an all-n-gram list from drowning in fragments:
1. **boundary stopwords** rejected ("of the", "the invoice"); stopwords are *not* stripped first, which would
   create false adjacencies.
2. **internal connectives/copulas** rejected ("booking is confirmed", "calendar and create") while
   prepositions survive ("payment on account").
3. **phraseness (PMI ≥ 1)** for n≥2 — real collocations only.
4. **subsumption** — drop a short gram whose DF matches a longer one containing it ("credit" vs "credit note").
   Non-destructive: full statistics are kept.

## Outputs
| file | use |
|---|---|
| `node-candidates.json` | decision axes per archetype, ranked by entropy × distinctiveness |
| `catalog-gaps.json` | candidates no existing node covers — the holes in our catalog |
| `node-relevance.json` | per node, how much this archetype's corpus mentions it → `applies_to` / not_applicable candidates |
| `coverage.json` | near-universal terms per archetype → the omission checklist |
| `report.json` | everything, incl. c-TF-IDF (BERTopic-style class TF-IDF) tops |

## Known limits (do not oversell this)
- **No polarity.** "no multi-currency" and "full multi-currency" are identical to a bag of words, so this sets
  *node existence and relevance*, never option-level priors. Those need the polarity-aware LLM extraction pass
  (stage 2: spec → normalized concept ids, then DF over concepts instead of words).
- **No paraphrase.** Lexically distinct restatements of the same rule are missed — weakest exactly on Rules,
  the most valuable list. Embeddings, not TF-IDF, for that.
- **Residual verb-phrase noise** ("issue a credit", "book an appointment") survives filtering; it thins out as
  the corpus grows but a POS/noun-phrase filter would be the real fix.
- **Frequency ≠ consequence.** Timezone handling is rare and catastrophic. Consequence weights must come from
  sensitivity analysis, never word counts.
- **Survivorship bias.** Mature open-source products are feature-rich; priors mined from them skew toward
  over-asking for small businesses. Quantified here, not fixed here.

## Stage 3 — rule bank (`npm run mine:rules -- --extractions <stage2-file> [--mock]`)
Clusters every rule stage 2 extracted (`ConceptExtraction.rules`, already restated in the model's own words —
twice-removed from any source document's text, safe regardless of source license) into ≤20 generalized PATTERNS
per archetype, written to `catalogs/rule-bank/<archetype>.json`. Built specifically to answer a gap the live
evals found (docs/EVALS.md "Rule bank + LLM-judge metric"): every system tested reproduced 0% of any gold's
specific rules, because nothing in any pipeline actively elicits them. Read at draft time by
`src/engine/rule_augment.ts` (`Engine.createProject`) to suggest — never write — rules the draft may be missing;
deduped deterministically and by the augmentation LLM's own prompted judgment before becoming `add_rule` ops.
Live result: rules recall (LLM-judge) 0%→80% on the invoicing gold with no cost to decision recovery. Ships as
the default behavior, not experimental. Run once per archetype whenever stage 2 is re-run on a larger corpus;
each archetype's bank is independent and the whole pipeline degrades gracefully (silent no-op) for any archetype
without a mined bank yet.

## Stage 2 — polarity-aware concept extraction (`npm run mine:concepts -- --corpus <dir> [--mock]`)
`src/mining/concepts.ts`: an LLM call per spec extracts catalog decisions WITH their chosen option (polarity) plus
new concepts the catalog lacks; deterministic aggregation → per-archetype option fractions → pasteable `prior`
hints (Laplace-smoothed) and `new-concepts.json`. Mock path works end to end; real extraction needs credentials.

## First real run (2026-08-23, corpus/ 106 specs, Azure gpt-4.1, `mining-results/*-concept-priors.json`)
Stage 1 on the real corpus surfaced sensible axes and catalog gaps (e-commerce: *product variant* 50%, *category
tree* GAP; booking: *timezone* 45% GAP, *time slot*; invoicing: *draft invoice* 50%, *based on timesheet*).
Stage 2 produced option-level fractions per archetype for most catalog nodes, e.g. b2b-invoicing (8 specs):
invoice_numbering sequential 88% · invoice_edit_after_send locked 86% · partial_payments allowed 71% ·
currencies multi 71% · taxes per_line 83% · recurring_invoices yes 57% · credit_notes 80% · estimates yes 60%;
booking (11): booking_who_books customers_no_account 67% · booking_confirmation instant 67% · slot capacity
group 71% · buffers none 86%. New-concept candidates include purchase_order_reference (n=2) and many n=1 items.
**Read with the survivorship caveat**: the corpus over-represents mature, feature-rich products (multi-currency
71% is what products *support*, not what a 3-person firm *wants*). Use these as the population prior for the
archetype, to be shrunk toward real user answers as sessions accumulate (Loop B) — not as truth.
Next: review `concept-priors.json` hints → `prior` fields in `catalogs/*.json` (bump versions), promote n≥2 new
concepts to nodes, then recalibrate θ.

## Status
Stages 1, 2, and 3 implemented, tested against a synthetic fixture corpus, and run once on the real corpus (`src/mining/fixtures/corpus`, 7 tiny docs, engineered
distributions — no evidence about real archetypes). **The real corpus does not exist yet**: collecting it is the
blocker, see `docs/EVALS.md` → "Sources for gold".
