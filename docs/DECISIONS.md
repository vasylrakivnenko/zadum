# Decision log (ADRs)

Numbered, append-only. Each: context → decision → consequences. Supersede by adding a new entry.

## ADR-001 — Decision catalog + sampled worlds replace an LLM-scored "ranker" (2026-08-22)
**Context.** The original spec had an LLM emit open decisions, scores (consequence × ambiguity × non-derivability) and
implication edges on every call. Unstable node identities, poorly calibrated verbalized uncertainty, and a graph the
code has to trust blind.
**Decision.** A per-archetype **catalog** of decision nodes (stable ids, options, consequence, hard edges, priors) +
a planner call that maps the Sheet onto it and proposes bespoke nodes; **K sampled worlds** (complete consistent
assignments) as the belief; a **deterministic selector** that computes value-of-information over the worlds.
**Consequences.** Ambiguity is measured (disagreement across samples), not self-reported. Implications,
stopping, defaults, lookahead and simulated users all fall out of conditioning on the worlds. The catalog is the
domain-expertise moat and is versioned like code. Cost: catalogs must be authored (LLM-drafted, human-edited).

## ADR-002 — Scoring functional is configurable: risk (default) | weighted_entropy | joint_entropy (2026-08-22)
**Context.** The founder's original intent: information-theoretic selection (split the possibility space evenly,
optimal decision tree). My proposal: consequence-weighted Bayes-risk reduction, because entropy over decision ids
≠ entropy over specs.
**Decision.** Implement all three over the same particle belief; default `risk`; harness compares them.
**Consequences.** Not a debate, an experiment. θ defaults per scoring in `DEFAULT_THETA`.

## ADR-003 — Hard edges → `implied`; soft τ-crossings → `defaulted` + `implied_by` (2026-08-22)
**Context.** With few worlds, soft correlations can be spurious. Claiming "this also decided X" from a spurious
correlation would mislead.
**Decision.** Only catalog hard edges produce status `implied` (confidence 1). Belief crossings of τ=0.9 produce
`defaulted` with confidence and `implied_by`, shown in the toast as "likely", and listed in the defaults review.
Both are never asked again; both correctable.
**Consequences.** Honest toasts; traceability preserved; the defaults pane is the safety net.

## ADR-004 — Soft reweighting (ε=0.05), prior mixing (α≈one virtual world), resample on low ESS (2026-08-22)
**Context.** Sampled worlds are noisy; a user answer that no world predicted must not zero the belief.
**Decision.** Disagreeing worlds keep ε of their weight; distributions mix the catalog prior with pseudo-weight α;
when ESS < 4 we resample conditioned on all fixed decisions and mix 50/50 with survivors (rejuvenation).
**Consequences.** Robust to surprises; contradictions surface as low ESS rather than crashes.

## ADR-005 — Planner-fixed decisions constrain sampling but stay correctable (2026-08-22)
**Decision.** `fixed_by_sheet` → `defaulted` at confidence 0.95; `fixedAssignments()` treats defaulted ≥0.95 as
sampling constraints. They are not asked; they appear in the defaults review.

## ADR-006 — Speculative precompute instead of a forced fast-model card path (2026-08-22)
**Decision.** After dealing a card, generate the likely next card for each option in the background. Dealing uses
the precomputed card if present. Card generation uses the fast tier by default but could use the strong tier.
**Consequences.** <2s render is a property of the pipeline, not of model choice. `card_shown.precomputed` is logged.

## ADR-007 — Joint drafter call (not three parallel list drafters) (2026-08-22)
**Context.** Parallel Nouns/Actions/Rules drafters drift on names.
**Decision.** One structured call drafts all lists + archetypes + assumptions. (N-sample merge is a later option.)

## ADR-008 — Actors and Not-yet are first-class on the one page (2026-08-22)
**Decision.** Sheet = People (actors) + Nouns + Actions + Rules + Not-yet (non_goals) + hidden decision ledger.
Most high-consequence decisions hang off actors; non-goals are what coding agents most need to avoid scope creep.

## ADR-009 — Completeness checks: round-trip + story walkthrough, not only critic-vs-rules (2026-08-22)
**Decision.** `reverse(spec)` → recall per list; `story(spec)` for the user's final recognition-over-recall check.
The critic also reports omissions. Phase `done` requires critic `pass`.

## ADR-010 — Learning lives in versioned data, not weights (v1) (2026-08-22)
**Decision.** Priors, consequence weights, catalog, phrasings, exemplars are data the deterministic core reads;
every event carries catalog/prompt/model versions + experiment arm. See `docs/LEARNING.md`.

## ADR-011 — LLM-facing schemas use the conservative JSON-schema subset (2026-08-22)
**Decision.** Flat objects with every field present (empty string/array instead of optional), enums, arrays,
numbers; no records, no min/max, no recursion. `toUserOps()` converts the flat patch record into typed ops.
**Consequences.** Structured outputs work reliably across models; rich validation happens in core.

## ADR-012 — FileStore default, Postgres opt-in via DATABASE_URL (2026-08-22)
**Decision.** Zero-setup local use; identical semantics in `PgStore` (migrations on connect).

## ADR-013 — Models: strong = Sonnet-class, fast = Haiku-class per product spec; env-overridable (2026-08-22)
**Decision.** `ZADUM_MODEL_STRONG` / `ZADUM_MODEL_FAST`. Consider `claude-opus-5` for compiler/critic where
quality dominates cost.

## ADR-014 — Default scoring is `weighted_entropy`; ranking and stopping are separated (2026-08-22)
**Context.** The founder's core idea is information-theoretic: ask the most discriminative question first, splitting
the possibility space as evenly as possible, scoring cards by how much they reduce uncertainty **about the final
spec**. ADR-002 implemented three criteria; the default was `risk`.
**Decision.** Default is now `weighted_entropy` — expected reduction in Σ cₙ·H(Pₙ): information gain, but over the
spec rather than over decision ids (each decision weighted by how much of the spec depends on it). `joint_entropy`
(pure "halve the world set", the textbook decision-tree split) and `risk` remain first-class and comparable.
Additionally, **ranking and stopping are decoupled**: cards are ordered by `value` (which may include a lookahead
term) but the loop stops on `value1`, the one-step value of asking *this* card now, so θ keeps fixed units.
**Consequences.** The default is the founder's criterion with the right measure. Why not raw `joint_entropy` by
default: it is consequence-blind (a 50/50 split on trivia outscores a 90/10 split on tenancy) and is capped at
log₂(K) bits, so it degrades as particles deplete — visible in the harness, where it stops earliest and recovers
least per card. The catalog's `consequence` weights are the bridge from "uncertainty about decisions" to
"uncertainty about the spec", and they become *measured* once sensitivity analysis lands (docs/LEARNING.md).

## ADR-015 — Two-ply lookahead is available (and cheap) but off by default (2026-08-22)
**Context.** "Like an optimal decision tree" implies lookahead, and the original spec ruled it out on latency
grounds ("no runtime lookahead — latency budget forbids it").
**Decision.** `lookahead: 2` ranks by V₂(n) = V₁(n) + γ·Σₐ P(a)·max_{m≠n} V₁(m | n=a) — the first two plies of the
tree — deepening only the top-`lookaheadTop` (8) one-step candidates. Default stays 1 (greedy).
**Consequences.** The latency objection does not apply: lookahead runs over the particle belief with **no LLM
calls**, so it costs milliseconds. It provably changes the first question when the greedy pick leaves nothing
behind (unit-tested with a constructed 8-world case). It is off by default only until the harness shows a win on
live sessions; `--lookahead 2` and the sweep arm are wired up.

## ADR-016 — θ is an absolute price per question, calibrated by replay (2026-08-22)
**Context.** θ was guessed (0.35–1.9) and, being far below the real value scale (10–90 — the indirect term sums
over every remaining decision), never fired: every harness arm ran to the 12-card cap.
**Decision.** θ stays **absolute** — it is the price of one user tap in the scoring's own units — and is
**calibrated, never guessed**, via off-policy replay: one equal-budget run logs `value1` per card, and
`thetaCurve()` reads off what any θ would have cost and recovered (exact, because the loop is deterministic and
the prefix before the stop is unchanged). `npm run harness -- --sweep` prints the table.
**Consequences.** Defaults are now risk 11.5 / weighted_entropy 30 / joint_entropy 1.66 (mock-calibrated,
2026-08-22 catalogs) and the loop converges at 3.5–7.3 cards instead of always capping. Absolute units make θ
scale with how much is at stake, which is *why* a small app converges in 3 cards and a marketplace needs 9 —
the behaviour the product spec asks for. The cost: θ must be recalibrated when the catalog changes materially or
when moving to live beliefs. `Ranked.share` (value1 ÷ total remaining uncertainty, 0–1) is logged as the
scale-free diagnostic for cross-archetype comparison.

## ADR-017 — Counterfactual gold variants (2026-08-22)
**Context.** A public spec may be recalled from training data, inflating recovery; and one gold file is n=1.
**Decision.** `src/harness/perturb.ts` flips k high-consequence decisions with a seeded PRNG, then repairs
dependents so the hidden truth stays consistent with the catalog's hard edges, and rotates persona/one-liner
variants declared in the gold file. Perturbed truths cannot be memorized.
**Consequences.** One gold → many sessions; `--variants N --flips K` in the harness. Base golds are for priors,
perturbed variants for testing whether cards recover deviations *from* the priors.

## ADR-018 — OpenAI-compatible adapter; provider chosen by env (2026-08-23)
**Context.** The only credential available was an Azure OpenAI key (`gpt-4.1` deployment). The `LLM` interface is
provider-agnostic and ADR-011 schemas fit OpenAI strict `json_schema` exactly.
**Decision.** `src/llm/openai_client.ts` (raw fetch, strict structured outputs, retries on 429/5xx, refusal /
content-filter → typed errors). `ZADUM_PROVIDER=anthropic|azure-openai|openai`, auto-detected from keys; `.env`
auto-loaded (`src/env.ts`). Anthropic remains the default when its key is present.
**Consequences.** The whole pipeline ran live for the first time (Azure gpt-4.1). Effort/thinking knobs are
Anthropic-only; temperature is honoured on OpenAI models.

## ADR-019 — Secondary-archetype nodes are down-weighted (2026-08-23)
**Context.** Live: the drafter tagged `b2b-invoicing` + `crud-saas`; the planner kept 61 nodes; the first card was
a generic "table vs board" question on an invoicing app.
**Decision.** Nodes from non-primary archetype catalogs get `consequence × secondaryArchetypeWeight` (0.5).
**Consequences.** Domain-specific decisions outrank generic ones; the planner prompt should also learn primary vs
secondary (next). Tunable on the harness.

## ADR-020 — Soft implications need p ≥ 0.95 and a ≥ 0.10 rise (2026-08-23)
**Context.** Live beliefs are concentrated (ESS ≈ 11/12 worlds). One answer down-weighting 5 dissenting worlds to
5% pushed 15–23 correlated nodes over τ=0.9 — particle depletion dressed up as implication. A soft implication
removes a node from the askable set, so spurious ones cost recovery.
**Decision.** `softImplyTau` 0.95 and `minImplyDelta` 0.10 for the `defaulted`+`implied_by` status; τ=0.9 still
governs "derivable, don't ask". Hard edges unchanged.
**Consequences.** Fewer, more credible "likely" toasts; near-certain nodes simply stay open (never worth asking)
and default at the end. Watch ESS: if cascades persist, raise K or soften ε (harness).

## ADR-021 — θ recalibration is driven by live equal-budget sessions (2026-08-23)
**Context.** Mock-calibrated θ=50 stopped a live session after one card (value1 60 → remaining ≈21).
**Decision.** Calibrate from live `--theta 0` sessions (12 cards, `value1` logged per card) and `npm run learn`
/ harness replay; ship θ only with the catalog version and provider it was measured on.

## ADR-022 — Live sweep (n=3) recalibrates all three θ defaults; ordering is inconclusive (2026-08-23)
**Context.** ADR-021 recalibrated `weighted_entropy` from a single live session. A full sweep (4 arms × 3 golds ×
2 run modes, Azure OpenAI gpt-4.1) shows the mock-derived defaults for `risk` (14) and `joint_entropy` (1.5) were
ALSO wrong — both stopped after 1–3 cards live — and `weighted_entropy`'s n=1 estimate (10) was itself too low on
this larger sample (ran to the 12-card cap for only +8pp recovery past card 4).
**Decision.** `DEFAULT_THETA` → `{ risk: 7, weighted_entropy: 24, joint_entropy: 1.25 }`, each read off the
"best θ inside the 3–9 card band" from `thetaCurve()` replay (docs/EVALS.md has the full table). Lookahead 2
is NOT given its own shipped default (it shares `weighted_entropy`'s θ, which under-stops it — the doc and the
`DEFAULT_THETA` comment both flag that `--lookahead 2` needs separate calibration before real use).
**Consequences — the ordering question is still open.** The same sweep's equal-budget ORDERING table puts all
four criteria within ~1pp AUC (66–67%) on this gold set. This is NOT evidence for or against the founder's
information-theoretic hypothesis (weighted_entropy/joint_entropy) versus the risk-based alternative — n=3 is
too thin to separate ~1pp differences from LLM-call noise. Recorded as inconclusive rather than picking a
"winner"; re-run with more archetypes/gold variants (booking, marketplace golds are the natural next step)
before drawing a conclusion either way. θ must be recalibrated again whenever that larger sweep runs.

## ADR-023 — Gold set expanded to booking and marketplace; select golds by id, never by array order (2026-08-23)
**Context.** ADR-022's ORDERING result (all 4 scoring criteria within 1pp) was n=3 sessions of the SAME gold
(invoicing + 2 counterfactual variants) — real archetype diversity, not just perturbations, is needed to trust
that finding either way. Adding gold files also broke a latent assumption: `harness.test.ts` took `golds[0]`
from `loadGolds()`, which does not sort — alphabetical `fs.readdir` order put the new `booking-salon.json`
before `invoicing-bookkeeping.json`, silently swapping which gold invoicing-specific tests ran against.
**Decision.** Added `booking-salon.json` (booking, 49/49 nodes) and `marketplace-services.json` (marketplace,
49/49 nodes), each independently verified against zero `perturbGold` conflicts across multiple seeds (built by
two parallel agents against the same catalog-consistency contract). Fixed `harness.test.ts` to select the
invoicing gold by `id` via a `loadInvoicingGold()` helper — tests that depend on `invoicingMockHandlers`
producing sensible output must never rely on gold array position again.
**Consequences.** Gold set is now 3 archetypes deep, mock-verified end to end (`npm run harness -- --mock
--gold src/harness/gold`). ADR-022's ordering question is not yet re-settled — that needs a live run across
all three, still pending (cost/time, not a blocker).

## ADR-024 — Recovery, not name/rule recall, is the trustworthy metric across archetypes (2026-08-23)
**Context.** Running the baseline comparison (Spec Kit, DLAI-SDD) across all 3 golds (invoicing/booking/
marketplace) confirmed our engine wins recovery on every archetype (mean 72.7% vs 60.7% vs 58.3%, and on
booking a same-budget 70% vs 59% head-to-head). It also confirmed the token-cost gap between the two baselines
is systematic (90–105× on every gold), and exposed a metric weakness beyond the rules-recall one from ADR
work earlier: actor/noun recall (`normName`, singular/plural only, no synonym handling) swung 0–100% based on
vocabulary luck, not real quality — "Homeowner"/"Customer", "Service provider"/"Pro" score as total misses.
**Decision.** Document `recovery` (closed-set decision ids, immune to synonym ambiguity) as the trustworthy
number in every report; treat actor/noun/rule recall as a lower bound only, pending an embedding- or
LLM-judge-based match. No code change — this is an interpretation rule for reading the eval outputs.
**Consequences.** Future dashboards/summaries should lead with recovery, not the recall columns. An
embedding-based `draftRecall`/`draftRecallFromLists` upgrade is now a documented want, not required to trust
the recovery numbers already gathered.

## ADR-025 — θ calibration confirmed across real archetype diversity; ordering remains inconclusive (2026-08-23)
**Context.** ADR-022 calibrated θ from n=3 sessions of ONE gold (invoicing + 2 counterfactual variants) — real
archetype diversity, not just perturbations, was the explicitly flagged follow-up needed to trust it. Ran the
sweep again across the newly-built `booking-salon` and `marketplace-services` golds plus `invoicing-bookkeeping`.
**Decision.** No `DEFAULT_THETA` change: all three shipped values land within ~0.3pp of their own best-band
picks on this independent, more diverse sample (risk 7→73% vs best-band 7.0→73%; weighted_entropy 24→74% vs
27.5→74%; joint_entropy 1.25→70% vs 1.3→70%). ADR-022's calibration holds.
**Consequences.** The ORDERING question (which scoring criterion is best) remains inconclusive — now on
stronger evidence: three different apps, not one gold's noise, agree the four criteria are within ~1pp AUC of
each other. Read as a real finding: for this catalog, selection-criterion choice matters far less than catalog/
drafter quality — which is why tonight's improvement work (rule bank, multi-option cards) targets those levers.

## ADR-026 — Cards show up to 4 options, not always exactly 2 (2026-08-23)
**Context.** User feedback mid-session: a card and a Spec Kit/DLAI-SDD question already count as one interaction
step each in every comparison (`docs/EVALS.md`) — so a card forced to binary when a node genuinely has 3-4 live
possibilities is throwing away information at no savings in step count. The plumbing already supported N options
almost everywhere (`CardOutSchema.options` is an unbounded array, `CARD_SYSTEM`'s prompt already said "for EACH
provided option id"); only `orchestrator.ts`'s `generateCard` hardcoded `topOptions(ranked.dist, 2)`, plus the
CLI's input handling and footer text, and the `SIM_USER_SYSTEM`/baseline-comment "two options" framing.
**Decision.** `SelectorConfig.maxCardOptions` (default 4). Cards show `min(node.options.length,
maxCardOptions)` options by belief, clamped to at least 2. CLI accepts `1`..`N` and states the live count.
Verified live on a mock session: nodes with 3-4 real options (payments_in_app, identity_provider, platform, ...)
now surface all of them instead of being clamped to the top 2 — a permanent regression test asserts at least one
card in a full session exceeds 2 options, not just that the plumbing compiles.
**Consequences.** More bits per interaction step at the SAME step cost (Product Principle 5's efficiency engine,
now literally: implication propagation was the first lever, richer cards are the second). Selector math
(value/entropy/risk) is unaffected — it already computed over the full node distribution regardless of how many
options a card displays; only the UI-facing top-K changed. Web UI needed no change (`.map()` over `card.options`
was already option-count-agnostic). Cost: `precomputeNext` may now speculatively generate up to 4 follow-up
cards instead of 2 (still bounded, still fire-and-forget, concurrency-limited at 2).

## ADR-027 — Rule bank: retrieval-grounded rule suggestions from the mined corpus (2026-08-23)
**Context.** ADR-024's baseline comparison found ALL THREE systems (ours, Spec Kit, DLAI-SDD) reproduced NONE
of the gold author's specific rules on ANY of three golds — the one Sheet list nothing in the pipeline actively
elicits (cards settle catalog decisions; rules are pure drafter luck, with no feedback loop). This is retrieval's
best-scoped use in this codebase: `corpus/` (106 real specs, already collected) + stage-2 concept extraction
(already run, `ConceptExtraction.rules`) already hold the raw material. No live web search needed.
**Decision.** Three new pieces: (1) `src/mining/rule_bank.ts` — one LLM call per archetype clusters all
extracted rules into ≤20 generalized PATTERNS (`catalogs/rule-bank/<archetype>.json`), twice-removed from any
source document's exact text (stage 2 already restated each rule in its own words) — safe regardless of source
license, same reasoning as `concept-priors.json`. (2) `src/engine/rule_augment.ts` + a new `augmentRules` LLM
function — given the draft Sheet + the archetype's patterns, suggest rules the draft is missing; deterministic
dedup (near-literal jaccard backstop + the model's own prompted "skip what's covered, even worded differently"
instruction as primary defense) turns survivors into `add_rule` ops, applied as a `rule_bank` commit. Runs in
Engine.createProject, in PARALLEL with planning (independent LLM calls over the same draft sheet). A missing
or corrupt bank is a silent no-op, never a blocker. (3) Ships as the default — not experimental — given the
evidence below.
**Consequences — measured, not assumed.** A live A/B on the invoicing gold (`--rule-bank-dir <empty>` vs the
real bank), scored by the new LLM-judge metric (ADR-028): rules recall **0% → 80%** (4 of 5 gold rules matched)
with zero measurable change to decision-level `recovery` (68-74% both ways) or added latency (the LLM call runs
parallel to planning, ~3s). One added rule was materially the gold's exact intended invariant ("invoice numbers
must be unique and sequential"). One quality nit observed live: a suggested rule about cross-firm data isolation
was phrased for a multi-tenant assumption the drafted Sheet doesn't explicitly state — not wrong, but a case for
the augmentation prompt to be more conservative about scope-fit in a future pass, not a blocker to shipping.
**Also fixed en route**: a circular ESM dependency (`mining/rule_bank.ts`'s CLI → dynamic import →
`engine/bootstrap.js` → `orchestrator.js` → `engine/rule_bank.js` → back into `mining/rule_bank.js`) that
deadlocked Node's top-level-await resolution — same class of bug `mining/concepts.ts`/`concepts_mock.ts` hit
earlier; fixed by extracting schema-only types into `mining/rule_bank_schema.ts` with zero further imports.

## ADR-028 — LLM-judge semantic recall: the fix ADR-024 called for, now built and proven necessary (2026-08-23)
**Context.** ADR-024 flagged that lexical (`normName`/Jaccard) matching can't see synonyms or verbose paraphrase,
and recommended treating recall/rules columns as a lower bound. Tonight that limitation stopped being abstract:
the SAME A/B above showed lexical rules recall flat at 0%→0% (undetected improvement) while manual inspection
showed the rule bank clearly added the gold's intended rule — the benchmark was blind to a real, working feature.
**Decision.** `src/harness/judge.ts`: one LLM call per list (actors/nouns/rules/non_goals) does bipartite
semantic matching — for each gold item, is there ANY produced item that means the same thing, any wording?
Confidence-gated (≥0.5), best-match-wins per gold item, defensive against out-of-range indices. `runGold`'s
new opt-in `judge` flag (`--judge` in the harness CLI) computes `semantic_draft_recall` alongside the existing
lexical `draft_recall`, run in parallel with the card loop (no added latency) — opt-in because it costs 4 extra
LLM calls per gold, kept off the default path.
**Consequences.** On the SAME A/B: judge rules recall 0%→80% (matching manual inspection); judge nouns recall
was ALSO higher than lexical even without the rule bank (57% vs 29%), confirming the synonym-blindness ADR-024
predicted was costing real signal on ordinary drafts, not just this feature's rules. This is a proxy, not ground
truth (docs/LEARNING.md's "LLM-as-judge" role) — not validated against a human anchor set this session (an
honest limitation, not a hidden one). Per-item match detail (`JudgeRecallResult.detail`) is computed but not yet
persisted to harness result JSON — a follow-up, not a blocker. Every prior number in docs/EVALS.md computed with
lexical recall should be re-read per ADR-024's rule: it is a lower bound, and tonight shows the gap can be large.

## ADR-029 — Thoroughness levels: one user-facing dial, honestly uncalibrated (2026-08-23)
**Context.** User explicitly floated "granularity levels" as a direction worth considering during tonight's
autonomous pass. Several existing knobs (θ, maxCards, compile best-of-N, critic repair loops) already trade
speed against settledness/quality but require separately setting 2-4 flags to move together sensibly.
**Decision.** `src/core/thoroughness.ts`: a pure preset table (`quick`/`standard`/`thorough`) + resolver
functions, wired into the CLI (`--thoroughness`, plus `new`/`cards`/`compile`'s existing flags). `standard`
reproduces today's shipped defaults exactly (regression-tested). An explicit `--theta`/`--candidates`/
`--critic-loops` still wins over the preset, matching `resolveConfig`'s established "explicit beats computed"
rule. Lower priority than the rule bank (this session's other two features address gaps the night's own evals
had just measured; this one is a UX convenience with no evals finding behind it) — built anyway since the user
asked for it directly and it was cheap and low-risk relative to the other two.
**Consequences.** Shipped with an explicit, honest calibration caveat in the code (mirroring `DEFAULT_THETA`'s
own): the theta multipliers (quick 1.4×, thorough 0.55×) are a first-pass heuristic verified only by direct
probe to not be degenerate (confirmed "quick" asks real cards on an unresolved belief, and correctly asks zero
more when a prior edit already left the design >80% settled) — not live-harness-calibrated the way the main
scoring thetas were. Recalibrate the same way (docs/EVALS.md "Calibrating θ") before trusting exact behavior.

## ADR-030 — Correctness review: patch atomicity, comparison keys, θ merging, and two rule violations (2026-08-23)
**Context.** A full read-through of the codebase (concept + bug review, session 1g) found ten defects, four
reproduced by script. They were edge-path and consistency issues, not structural — but three of them silently
corrupted user-visible state and two contradicted the dogfood rules in CLAUDE.md.

**Decisions.**
1. **Patch ops are all-or-nothing.** `modify_action` resolved `actor` and wrote it before validating `object`,
   so a *rejected* op still moved the action to a different actor. Both references are now resolved before any
   mutation. The invariant this protects is Rule 1/2's: the Sheet is exactly the sum of `applied` ops.
2. **`normName` is a canonical comparison KEY, not a display singular.** It mis-collapsed two whole classes of
   noun: `expenses→expens` vs `expense→expense` (every silent-e stem: house, case, license, purchase, phase),
   and `status→statu` vs `statuses→status` (every `-us` singular). Real duplicate nouns therefore slipped past
   dedup and lexical recall undercounted matches. `-ses` is genuinely ambiguous in English (`bus|es` vs
   `hous|es`) and no suffix rule separates them without a lexicon — so both spellings are instead collapsed
   onto a shared key by also dropping a trailing silent "e". Verified: 29 plural pairs collapse, 23 distinct
   business nouns stay distinct. Callers only ever compare keys, never display them (checked: all 24 uses).
3. **θ follows the EFFECTIVE scoring (`mergeConfig`).** The CLI computed θ from the CLI-side scoring and passed
   it on *every* invocation, and `Engine.load()` spread it over the stored session config — so a project created
   with `--scoring risk` (θ 7) and resumed with a bare `cards <id>` was judged against weighted_entropy's θ 24
   and stopped after one card. θ is scoring-specific and calibrated in that scoring's own units, so carrying it
   across a scoring change is meaningless. The CLI now passes θ only when `--theta` was given, and thoroughness
   travels as a *multiplier* (`EngineOptions.thetaMultiplier`) applied to the effective scoring's calibrated
   default after the merge — the resolved-θ-at-the-edge design could not be correct when the scoring comes from
   the stored session rather than this run's flags.
4. **`resolveConfig` ignores explicitly-undefined keys.** `{...partial}` re-applied `theta: undefined` over the
   computed default, and `value1 < undefined` is false forever — the loop could then only stop at the cap. No
   caller triggered it; it was one `{theta: opts.theta}` away.
5. **Rule 3's "unless contradicted by a later user action" is now implemented.** A hard edge demanding a
   different option than a decision already carried was skipped whenever that decision was `implied`, so
   changing your mind left the stale consequence standing and the spec shipped two contradictory decisions.
   Policy now: a *derived* value (implied/defaulted/skipped) loses to the newer user action and is re-implied;
   a value the *user themselves* resolved wins, and the collision is reported (`Implied.contradictions`, the
   `implications_applied` event, CLI warning, web labels) rather than silently dropped. `delegated` is left
   alone — consequence 0, and `delegated → implied` is not a legal transition.
6. **The card preview shares the real implication predicate.** `also_sets` previewed with HARD conditioning at
   the looser τ=0.9 while the engine really applies soft ε-conditioning at `softImplyTau` 0.95 with a
   `minImplyDelta` rise (ADR-020). Measured on the mock invoicing belief: the old predicate previewed **71**
   settlements for one card where the engine settles **none** — the UI slices to 6, so every card showed six
   fabricated "this also settles …" promises. ADR-020 tightened the real path and missed its preview.
7. **Rule 7 binds every preset.** `thorough` shipped `maxCards: 20` against a rule CLAUDE.md calls an invariant
   and ARCHITECTURE says is asserted in tests (the test asserted the violation instead). `thorough` now buys
   depth with a lower θ only, clamped to `MAX_CARDS_HARD_CAP` = 12. Raising the ceiling is a real product
   change needing the explicit user-continuation flow ("the next question settles very little — keep going?")
   and its own ADR — not a bigger number in a preset table.
8. **Rule 6: a failing spec is delivered as an unmistakable draft.** The bundle used to be written and the
   files handed over with no marking when the critic still failed after its repair passes; only the `done`
   phase was withheld. Throwing the compile away helps nobody, so `spec.md` and `AGENTS.md` are now stamped
   with the verdict and the surviving violations, and `compile-report.json` records `critic_passed`. The
   judgment call: "must pass before delivery" is enforced as "must be impossible to mistake for passing".

**Also fixed:** exact undo (re-added decisions went through `add_decision`, which carries no
`rationale`/`implied_by`; options added after a snapshot were never removed — new `remove_decision_option` op);
`joint_entropy` credited options no particle holds with perfect certainty (empty particle set ⇒ zero entropy),
now falls back to the unchanged belief, which is what soft conditioning really does; `precomputeNext`'s
"still open" guard tested node membership (always true) instead of decision status; compile events used the
wall clock instead of the injected one; the artifact index was a non-atomic read-modify-write; the
OpenAI-compatible adapter never retried a truncated body (now does — but NOT a schema mismatch, which is
deterministic under `strict: true`); and a per-tenant Azure endpoint shipped as everyone's default (now
required; the local `.env` was updated so the live setup keeps working).

**Consequences.** 191 tests green (was 152), typecheck clean, mock demo end-to-end unchanged. The selector
touch (item: `joint_entropy` fallback) was harness-gated per the working agreement: `npm run harness -- --mock`
is **byte-identical** to the pre-fix baseline — same asked-node sequences, same 53% AUC — confirming it guards
a degenerate case without shifting behaviour on beliefs where every option has particle support. θ needs no
recalibration. Items 5 and 6 change what the user sees mid-session, so they are worth watching in the first
live run.

## ADR-031 — Multi-model evals: a model registry, an Anthropic-over-Foundry adapter, and a reasoning-token floor (2026-08-23)
**Context.** The first thesis-test run used gpt-4.1 as both the coding agent and the judge — "the same family
judging itself" was its biggest stated weakness (docs/EVALS.md). Fixing it needs several models addressable at
once, which `llmFromEnv()` cannot express: it resolves ONE provider into a strong/fast pair.

**Decisions.**
1. **`src/llm/registry.ts` — a flat routing table, not auto-detection.** A model id maps to the endpoint that
   actually serves it (`gpt-4.1` → the original Azure resource; `gpt-4o`/`Kimi-K2.5` → AI Foundry's
   OpenAI-compatible route; `claude-*-4-*` → Foundry's `/anthropic` route; `claude-sonnet-5`/`opus-5` →
   Anthropic direct). Which deployment lives behind which resource is deployment configuration and cannot be
   inferred from a model name, so it is written down. `npm run models` reports availability and sends every
   configured model a real STRUCTURED request — a pass means the schema plumbing works, not just that the
   endpoint answers.
2. **`src/llm/anthropic_foundry.ts` gets strict JSON via forced tool use.** `AnthropicLLM` uses first-party
   structured outputs (`output_config` + `zodOutputFormat`), which a Foundry-hosted deployment does not
   necessarily expose. Declaring one tool whose `input_schema` is the zod schema and forcing `tool_choice`
   works on any Anthropic-Messages endpoint. ADR-011's conservative schema subset meant zero schema work.
   Verified against the official Python SDK's own source: `AnthropicFoundry` sends
   `{"x-api-key": key, "api-key": key}`, exactly what this adapter sends.
3. **A per-deployment `minCompletionTokens` floor.** Kimi K2.5 is a reasoning deployment: it emits
   `reasoning_content` that counts against the completion budget, so a caller's modest `maxTokens` returns
   `finish_reason: "length"` with empty content (it failed `npm run models` at 200 tokens and passed at 4096).
   The floor is a property of the deployment, so it is configured in the route table and applied by the
   adapter — not pushed onto every call site.
4. **The thesis harness crosses agent models × arms** with ONE independent judge for every trial, prints a
   pooled table (does the bundle help regardless of which model reads it?) beside the per-model breakdown, and
   warns when the judge is also an agent.

**Credential lesson, recorded because it cost a cycle.** The Foundry resource key is a DIFFERENT credential
from `AZURE_API_KEY`, even inside one subscription — Azure issues keys per resource. Every auth variant with
the wrong key returned 401 ("invalid subscription key or wrong API endpoint"), which reads like an endpoint
bug and is not one; `/anthropic/messages` → 404 vs `/anthropic/v1/messages` → 401 was the tell that the route
was right and the credential wrong. This repo's `.env` already had the right key under `LLM2_API_KEY`; the
registry accepts that name and `FOUNDRY_API_KEY` as an alias, and `missingCredential` names the distinction
explicitly so the next person does not repeat it.

**Consequences.** Five deployments verified working end to end (gpt-4.1, gpt-4o, Kimi K2.5, Claude Opus 4.8,
Claude Sonnet 4.6), 13 adapter/registry tests, and the thesis matrix can now be judged by a model from a
different family than any agent under test.

