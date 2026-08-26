# Learning from experience (the flywheel)

Goal: the system is measurably better after every session. Stance: **in v1 learning lives in versioned data
structures the deterministic core reads, not in model weights.** Every tunable has (a) an estimator and (b) a
human-behavior signal; every change is an experiment gated by the harness.

## Sources of truth (ranked by how true they are)
0. **Spec refinement** (`Engine.refineFromSpecFeedback`, `spec_refined` events — built 2026-08-25, ADR-038).
   The owner reads the compiled spec and corrects it; the correction is classified into four labelled lists —
   `wrong_assumptions` (a miss WITH its correction attached), `missing_elements`, `confirmed_elements`,
   `new_questions` — and applied to the Sheet as patch ops. This outranks everything below it: no other moment
   in the product produces a labelled miss and its fix in the same breath, on a document the owner had a real
   reason to read carefully. Feeds the same observation store as §2 (`collectObservations`), and is the row
   source the design-graph work needs (rows = completed sessions, not just corpus documents).
1. **Post-session edits** via the change protocol (AGENTS.md: "update the Sheet first"). An edit to a *defaulted*
   decision = the prior was wrong; to an *asked* one = the card was misunderstood; a new noun/rule = draft/catalog
   omission. → keep the Sheet hosted (coding agent reads through us) so these flow back. (Not built yet.)
2. **In-session behavior** — events already logged: `default_overridden` (prior wrong), `card_answered`
   (kind/undo/other/think_ms), `edit_applied` (draft supervision), story corrections (to add), `card_shown`
   (value, maxP, dist, render_ms).
3. **LLM-as-judge** — proxy only: best-of-N selection, card pre-screen, harness scoring. Pairwise > absolute,
   randomized position, a different model family where feasible, re-validated against a human anchor set.
   **Built 2026-08-23**: `src/harness/judge.ts`'s `semanticRecall` — bipartite semantic matching for
   actors/nouns/rules/non_goals, replacing/supplementing lexical `draftRecall` (ADR-024/028). Not yet validated
   against a human anchor set (an honest gap, not a hidden one) — the next step before trusting it beyond a
   before/after A/B on the same gold, which is the use it has been proven correct for so far.
4. **Simulated users** — the harness (`src/harness`), validated against real sessions (track the sim-to-real gap).

## Three loops by timescale
| Loop | What learns | Mechanism | Status |
|---|---|---|---|
| A. In-session | each output | best-of-N + critic, round-trip, story; (todo: card/draft pre-screen rubric) | partly built |
| B. Statistical | priors, consequence weights, θ/ε/τ, phrasings, catalog pruning, **joint structure (design graph)** | counts, bandits, replay — pure arithmetic | **estimators built** (`src/learning/`, `npm run learn`); design graph built (`npm run mine:graph`); neither wired on by default (harness-gated) |
| C. Semantic | catalog nodes, prompts, exemplars, archetypes | LLM proposes diffs → harness + replay must win → versioned promotion | corpus mining built (`docs/MINING.md`); proposal loop todo |

## Estimators — implemented in `src/learning/` (report: `npm run learn -- [--data-dir .zadum] [--out dir]`)

Every project is tagged `user`, `mock`, `experiment`, or `legacy`. Reports use only `user` projects by default;
this prevents demos and benchmarks from silently changing production priors. An operator can deliberately add
other sources with `--include-origin experiment` (or `mock`/`legacy`) for a named analysis: the flag **adds** to
the user population rather than replacing it, so it can never quietly fit priors on harness runs alone. A
project written before origins existed counts as `legacy` on both stores — the file store records no origin at
all, Postgres backfilled the column to `'legacy'` (migration 0002) — so `--include-origin legacy` reaches the
same projects either way.

- `population_priors.ts`: observations = card answers + default overrides (never our own defaults); shrinkage
  catalog → global → archetype with pseudo-count n0; `mixWithCatalog()` is the plug-in point for
  `Engine.createProject` (deliberately not wired yet — gate it on a harness win).
- `calibration.ts`: reliability bins, Brier, ECE for (a) belief argmax vs user answer per card and (b) defaulted
  decisions later overridden.
- `theta_replay.ts`: what any θ would have cost on logged sessions (+ `mean_wrong_defaults`).
- `phrasing_bandit.ts`: Thompson sampling over `Card.phrasing_arm` (nothing sets arms yet → single arm).

## Estimators (design notes, in order)
- **Population priors**: counts per (archetype, node, option) from `card_answered`/`default_overridden`/final sheet
  → `P = (1−λ)·P_worlds + λ·P_pop`, `λ = n/(n+n0)`, hierarchical shrinkage global → archetype → user. Replace the
  catalog `prior` field with the learned estimate; keep α mixing. Monitor calibration (reliability diagram: when
  `confidence` says 90%, is the eventual answer/override consistent 90% of the time?).
- **Consequence weights**: (1) offline sensitivity — flip each node in a reference world, recompile, measure
  normalized spec diff; (2) observed — post-session churn caused by fixing a wrongly-defaulted node. Combine.
- **θ / ε / τ / scoring**: replay logged sessions counterfactually (the core is deterministic and `card_shown`
  logs `dist`); choose the setting minimizing cards + λ·overrides.
- **Card phrasing bandit**: arms per node (`phrasing_arm` on Card), Thompson sampling; reward = answered without
  undo/other/skip, not contradicted later, think_ms under p75.
- **Drafter exemplars**: retrieve final Sheets of similar past apps as few-shots (public gold sheets have no privacy
  issue; user Sheets need abstraction/opt-in). KPI: draft acceptance rate (drafted lines surviving to final Sheet).
- **Catalog evolution**: promote recurring bespoke nodes (same node in ≥m sessions with real disagreement); demote
  nodes with ~zero entropy and no overrides (stop sampling them); split archetypes when final Sheets cluster.
- **Critic self-test**: planted-violation specs → catch rate, continuously.

## Loop B — the design graph (evidence matrix → soft priors)

Built 2026-08-25. The estimators above learn **marginals** (what fraction of invoicing apps lock a sent
invoice). The design graph learns **joint structure** (given online payments, how often do webhooks appear) —
which is what the sampled-worlds belief actually needs, because a world is a joint assignment and a marginal
prior cannot express "these two go together".

Pipeline and semantics: **docs/MINING.md → "Stage 4 — the evidence matrix and the design graph"**. The parts
that matter to learning:

- **Rows are decisions, not words.** Two layers are kept apart on purpose: an *evidence row* records what an
  artifact visibly contains (lexicon features), a *decision row* records what it appears to have decided
  (catalog nodes). The graph is learned from the second only.
- **Row sources, ranked exactly as §"Sources of truth" ranks them.** `session` rows (a real owner answered a
  real card, or corrected a default, or corrected the compiled spec) are the strongest and the scarcest;
  `spec_doc` and `repo` rows are inferred and plentiful. They are **never pooled by default** — statistics are
  produced per source kind and per archetype first, and a pooled view is opt-in and Simpson-checked.
  Untouched defaults are still not evidence: counting them would let the priors confirm themselves, and would
  let the graph learn its own output. Same Goodhart guardrail, one layer up.
- **`unobserved` is not `absent`.** A row that could not have observed a node contributes to no count for it.
  Every denominator is built from `DecisionCell.observable`, and the invariant
  `n11+n10+n01+n00 = eligible_n` is checked on every pair.
- **No verbalised confidence.** Every probability is a smoothed count ratio (Jeffreys) with a Wilson interval.
  This repo already measured its own verbalised-confidence pipeline as not yet epistemically usable; the graph
  does not reintroduce it through the side door.
- **Learned edges never become laws.** `classifyPair()` can emit only `soft_positive`, `soft_negative` or
  `unknown`; hard relations are read from the catalog and validated to carry `status: "authored"`. Statistics
  propose hard rules into a separate candidates file; a human promotes one by editing the catalog.

### How it reaches the runtime (harness-gated, OFF by default)

`EngineOptions.designGraph`, following the exact precedent of `populationPriors` and `recalibration`:

1. sample worlds as today → 2. repair with hard catalog rules as today → 3. apply the soft graph likelihood
**once**, to newly sampled worlds only → 4. normalize → 5. the existing selector runs unchanged.

Four invariants, each with a test: a user answer **dominates** the graph; the likelihood is **never re-applied**
after an answer (double counting); a soft edge **never deletes a world** (weights shrink, never reach zero);
and with no graph the belief is **byte-identical** to today. Edge influence is shrunk by support (`n/(n+n0)`)
and clamped, so one thin-sample edge cannot dominate a world set.

The graph is not enabled by default until: no hard-constraint regressions, no baseline regression, tested on
held-out data, and a harness graph-on/graph-off arm shows a measurable improvement or no material harm. Same
bar the rule bank cleared (ADR-027), same bar `contrarianSampling` has not yet cleared.

### First real numbers (2026-08-26) — and why there are almost none

150 small repos labelled live by Opus 4.8, aggregated into decision rows, run through the co-occurrence
statistics and the graph builder. At **production thresholds the graph emits zero soft edges** and reports 122
pairs as "low support". That is the intended answer, not a failure: `softMinN = 30` requires ~30 rows inside a
single (archetype × source kind) stratum, and 42 rows spread over eight archetypes cannot reach it.

Lowering `softMinN` to 10 to see the machinery work surfaces a first, semantically plausible edge:

    identity_provider=magic_link  →  invite_flow=invite_by_admin
    soft_positive · p(B|A) 0.750 · p(B) 0.167 · lift 4.50 · n 14 · 95% CI [0.207, 1.000]

Magic-link auth going with admin-issued invites rather than open self-signup is exactly the kind of joint
structure marginal priors cannot express — which is the whole reason the graph exists. It is also n=14 with an
interval reaching 1.000, POOLED rather than archetype-scoped, and only visible below the shipped threshold. It
is an existence proof of the pipeline, not a finding about the world.

Two structural facts the first real matrix surfaced, both recorded rather than acted on:

- **`negative_only` is 54% of unobserved cells.** The labeller produces a licensed `absent`, rule 5 correctly
  refuses to let it select a different option, and the evidence is then used for nothing. A self-critique of
  the obvious fix (elect the surviving option when all others are eliminated) rejected it: the mechanism needs
  the option set to be exhaustive AND exclusive, and the same run independently showed it is neither. Worse,
  elimination onto a `none` option would re-derive the banned "apps like this don't do X" prior per row. The
  surviving idea is far weaker — treat it as an ask-me-first signal that settles nothing — and it is not built.
- **Conflicts are catalog feedback.** 29 conflicts on 42 rows, led by `identity_provider`
  (`email_password` vs `google_microsoft`): real apps support several login methods while the catalog models
  one exclusive choice. The honest `conflict` status surfaced a modelling error instead of silently picking a
  side. Not changed at n=2-of-14 — the same evidentiary bar this layer demands of everything else.

### Rationale text is a product feature, not a debug view

Because every edge carries support counts and an interval, a default can explain itself in the owner's terms:
*"Webhooks are included because 31 of 41 comparable, observable projects with online payments also used them.
Estimated probability 0.76, 95% interval 0.61–0.87."* `explainEdge()` hedges explicitly below a support floor
and never renders a missing interval as a range — an unsupported statistic presented as certainty is worse
than no explanation.

## Loop C — improvement proposals (weekly job, later)
Inputs: failure clusters (high-override defaults, high-"other" cards, high-edit drafts, story corrections,
round-trip losses, post-session edits). An LLM writes structured proposals (new node / default / phrasing arm /
prompt change). Each runs on the harness + shadow replay; promoted only if it wins without regression; every
promotion is a versioned catalog/prompt commit with rationale. Same principle as the product: AI proposes, the
deterministic gate disposes.

## Guardrails
Goodhart (optimize human signals; judges are proxies) · unguided self-refinement degrades — every refine step needs
a verifier · attribution (every event tagged with catalog/prompt/model versions + arm) · sim-to-real gap tracked ·
privacy (statistics cross-user OK; content needs abstraction/opt-in) · hold-out by spec and by archetype.

## Flywheel ladder
n≈10: Loop A + hand-tuned catalog · n≈100: population priors, bandit, exemplars, first promotions ·
n≈1,000: priors dominate, consequence calibrated by real edits, θ tuned by replay, opening books from real sessions ·
n≈10,000+: fine-tune card/compiler on preference data, learned selector off-policy, data-driven archetypes.
