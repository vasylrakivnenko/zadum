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

---

# Stage 4 — the evidence matrix and the design graph

Stages 1–3 mine WORDS (n-grams, DF, c-TF-IDF). Stage 4 mines DECISIONS. It is a separate pipeline with a
separate epistemology, and the two never share a number: `mine`/`mine:concepts` tell you how a corpus *talks*,
stage 4 tells you what a corpus *decided*. Words cannot express polarity (docs/MINING.md "Known limits");
decisions are polarity by construction.

    corpus manifest / repos
      → npm run mine:corpus     (ingest, pin, digest, hash)          src/mining/corpus.ts
      → npm run label           (LLM labels features)                src/mining/label.ts
      → npm run label:eval      (gold-set precision, consensus)      src/mining/label_eval.ts
      → npm run mine:matrix     (evidence rows → decision rows)      src/mining/matrix.ts
      → npm run mine:elements   (per-element prevalence / IDF)       src/mining/element_stats.ts
      → npm run mine:graph      (co-occurrence → design graph)       src/mining/cooccurrence.ts
      → npm run graph:validate  (the CI gate)                        src/learning/graph_cli.ts
      → npm run graph:report    (the human view)                     src/learning/graph_cli.ts

## The two representations, and why they are separate

| | **Evidence matrix** (`zadum.evidence-row.v1`) | **Decision matrix** (`zadum.decision-row.v1`) |
|---|---|---|
| a row is | one document × one labelling run | one document |
| a column is | a lexicon **feature** (an observable) | a catalog **node** (a decision) |
| a cell is | `present` / `absent` / `unobserved` | `observed` (+option) / `unobserved` / `conflict` |
| answers | "what does this artifact visibly contain?" | "what did this product appear to decide?" |

`stripe_checkout` in a manifest is an *observation*. `payments_in_app = collect_online` is a *decision*.
**The design graph is learned from the decision matrix only** — never from raw words, never from raw repo
features. Collapsing the layers would make the graph learn which libraries people import (the extractor's
vocabulary) rather than which choices people make, and would sever the audit trail from a probability back to
a quote.

## `unobserved` is not `absent` — the rule everything else rests on

Three distinct states, and the code refuses to conflate them:

- **`present`** — positive evidence, with a verbatim quote that is checked to occur in the artifact.
- **`absent`** — a *licensed negative*: a declared witness locus for this feature was in the digest, was
  inspected, and was empty (`label.ts` rules 1–2). Expensive to claim, and enforced in code.
- **`unobserved`** — no observation. **Never a negative, anywhere, ever.**

At the decision layer this becomes `DecisionCell.observable`: was this row ever *eligible* to say anything
about this node? Only eligible rows enter any denominator. A row that could not have observed a node
contributes to **no** count for it — not a positive, and emphatically not an n00. Stated as an arithmetic
invariant that `validatePairStat` checks on every pair:

    n11 + n10 + n01 + n00 === eligible_n

The reasons a cell is unobserved are preserved rather than flattened, because they mean different things:

| reason | meaning |
|---|---|
| `not_askable_in_source` | the artifact type cannot witness this — a repo says nothing about refund *policy* |
| `silent` | the artifact could have shown it and didn't |
| `negative_only` | licensed negatives exist, but nothing positive (see the next rule) |
| `run_disagreement` | repeated runs contradicted each other — a measurement failure, not a property |
| `no_mapped_feature` | the lexicon has no column for this node: **we are blind here** |

## A licensed negative never selects another option

`no_login_at_all` marked `absent` is evidence *against* `user_accounts=none`. It is **not** evidence *for*
`multi_user`, even when `multi_user` is the only other option. Negatives are preserved in
`negative_feature_ids` and used for nothing else. The temptation is strongest exactly where it is most wrong:
a two-option node where "not A" looks like it must mean "B".

## Conflicts are never silently resolved

Two options of one node with positive evidence → `status: "conflict"`, both candidates kept with their quotes,
and an entry in `row.conflicts`. No tie-break, no first-wins, no averaging. A conflict is a fact about the
corpus and usually a signal about the lexicon. The mock end-to-end run over four real invoicing documents
produces six of them (e.g. `invoice_delivery: hosted_link vs pdf_email`) — that is the design working.

## Repeated runs: consensus, never averaging

Agreeing runs are accepted. Disagreeing runs collapse to `unobserved` with reason `run_disagreement`, unless a
configured rule (`--consensus majority --min-agree 0.75`) is satisfied; a tie can never be a majority.
Averaging `present` and `absent` into 0.5 would manufacture a probability out of a failure to measure.

## Probability formulas

Everything is a smoothed count ratio over eligible rows. **No number in this pipeline ever came from a model
saying how confident it was** — the labeller returns discrete verdicts and quotes, and is forbidden to emit
confidence at all (`LABEL_SYSTEM`).

    p(B|A) = smoothed(n11, n11 + n10)
    p(B)   = smoothed(n11 + n01, eligible_n)
    lift   = p(B|A) / p(B)                 (0 when p(B) is 0)
    difference = p(B|A) − p(B)
    ci95   = wilsonInterval(n11, n11 + n10)

Smoothing is a documented Beta prior, default **Jeffreys** (`a = b = 0.5`): the least opinionated proper prior
for a proportion, and it keeps a zero-count cell from asserting `p = 0`. Intervals are **Wilson**, chosen over
the normal approximation precisely because the interesting cells are `k = 0` or `k = n` at small `n` — where
the normal approximation collapses to a point and a small sample becomes a fake impossibility.

Element rarity (`mine:elements`) uses the pinned formula

    idf(element) = ln((eligible_documents + 1) / (observed_documents + 1)) + 1

over the *decision* matrix — unrelated to, and deliberately not merged with, the raw-text c-TF-IDF in
`ngrams.ts`.

## Graph edge semantics

| relation | meaning | where it comes from |
|---|---|---|
| `hard_implies` | A logically FORCES B | authored in `catalogs/*.json` (`implies`) |
| `hard_excludes` | A and B cannot both hold | authored (`excludes`) |
| `equivalent` | both sides are the same decision | authored (`same_as`) |
| `soft_positive` | statistically associated | **learned** |
| `soft_negative` | statistically anti-associated | **learned** |
| `unknown` | not estimable: too little data, or too much unobserved | learned |

`classifyPair()` — the only function turning a statistic into a relation — can return exactly three of these:
`soft_positive`, `soft_negative`, `unknown`. **There is no code path from a number to a hard relation.**
Spec rule 11 is implemented as an impossibility rather than a policy, and `validateGraph()` refuses any graph
containing a hard relation whose status is not `authored`.

## Thresholds (configurable; defaults in `DEFAULT_THRESHOLDS`)

| threshold | default | meaning |
|---|---|---|
| `reportMinN` | 10 | below this a pair is not reported at all |
| `softMinN` | 30 | below this a pair can only be `unknown` ("low support") |
| `hardMinN` | 100 | below this no hard-rule *proposal* is even considered |
| `hardMinLowerBound` | 0.995 | lower confidence bound a hard proposal must clear |

A soft edge additionally requires its 95% interval for `p(B|A)` to **exclude the baseline `p(B)`**. A large
point estimate whose interval straddles the baseline is `unknown`, and the report says why in words.

## Stratification, and Simpson's paradox

Statistics are computed **per archetype and per source kind first**. A pooled aggregate is opt-in (`--pooled`),
is always labelled `archetype: null, source_kind: null`, and any pooled edge whose sign disagrees with one of
its own strata is stamped `simpsons_warning`. `graph:report` prints those warnings **above** the pooled numbers
they invalidate, and `softEdgesFor()` — the runtime accessor — **drops** a Simpson-flagged pooled edge
entirely, because a known-confounded number is worse than no number. Precedence is archetype-scoped over
pooled, always.

Repos and specs are not interchangeable and are never pooled by default: milestone 59 measured
`records_workflow` favouring specs **3.6×** while `integrations_sync` favours repos **2.2×**. Each source is
used only for what it can witness, which the lexicon's `detectable_in` already enforces mechanically.

## Hard-edge approval process

Statistics may **propose**; only a human may **promote**.

1. `hardCandidates()` emits proposals to `graph-candidates.json` — requiring `eligible_n ≥ hardMinN`, **zero**
   observed violations (on raw counts, so one counterexample kills it), and a lower bound ≥ `hardMinLowerBound`.
2. A proposal is never an edge. It carries `status: "candidate"` and the soft relation the data supports.
3. To adopt one, a human edits `catalogs/*.json` (`implies` / `excludes` / `same_as`) and bumps the version.
4. Enforcement then happens where it always has: `propagateHard()` on the catalog, in world repair.

A 100%-in-140-repos association is still not a law. It is a fact about GitHub in 2026.

## Reproducibility and versioning

Every row carries `catalog_version` and `lexicon_version`; every graph additionally carries `matrix_version`,
the label **models** and **prompt versions**, the thresholds it was built with, and `support_row_ids` for each
edge — the audit trail from a probability back to the artifacts that produced it. A row whose versions do not
match is **rejected**, not silently pooled, unless an explicit `MigrationMap` says the two are compatible;
rejected rows are returned and reported, never dropped on the floor. `digestHash` pins each row to the exact
bytes the labeller saw.

## Licence and privacy

`mine:corpus` keeps **only** bounded digests, hashes, metadata and short evidence quotes — raw repository code
is never committed (clones live in gitignored `.cache/repos`). Licence travels on every artifact row. Build
output, vendors, binaries, secrets and generated files are excluded by `condense.ts`'s path pruning. Session
rows are cross-user statistics over decisions, never content. **GitHub does not represent our target
population** — the corpus is mature open-source products, which skew feature-rich (the survivorship caveat
above applies with full force to every number stage 4 produces).

## Runtime: off by default

The graph reaches the engine through `EngineOptions.designGraph`, disabled by default, applied **once** to
newly sampled worlds and never re-applied after an answer (double counting), never deleting a world, and
always losing to a user answer and to hard catalog rules. See docs/LEARNING.md → "Loop B — the design graph".
