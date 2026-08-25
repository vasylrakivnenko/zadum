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

## ADR-032 — Benchmark controls, judge validation, and the cards-to-conduct split (2026-08-24)
**Context.** The thesis test's remaining objections were: (a) the bundle carries ~10× the baselines' context;
(b) maybe any rules-list induces caution regardless of content; (c) the judge was unvalidated; (d) recovery's
link to downstream conduct was assumed, not measured.

**Decisions.**
1. **`sheet_only` arm** — the one page alone, length-matched to the baseline specs. Result: 74% vs Spec Kit's
   45% at comparable size, and ≈ `sheet_no_agents` at 1/6 the context — the compiled spec adds ~nothing to
   agent CONDUCT (its value is implementation content). Follow-up queued: `sheet_only + AGENTS.md`.
2. **`sheet_mismatched` arm** — the full bundle of a different app (cyclic), as falsification. Interpretation
   rule recorded here because the raw number misleads: the three apps share archetype-typical constraints, so
   agents flagging via the DONOR's own rule ids (booking's `g2` against a pay-by-card probe) are behaving
   correctly on genuinely applicable text. The clean falsification cells are probes with NO donor analogue —
   there the flag rate collapsed (0/4 vs 3/4 with the right bundle). Verdict: models read the rules; they do
   not pattern-match "rules exist, be cautious".
3. **Judge validation is two-layered and cheap**: `--rejudge` re-runs judge-only over stored agent replies
   (the expensive half stays on disk) and reports Cohen's κ per arm; `--anchor-sample`/`--score-anchors`
   produce and score a blind 50-case human anchor set. Rubric changes stay free via `--rescore`.
4. **Per-provider concurrency** (`keyedLimiter`): the in-flight limit is per endpoint, not global — a
   4-provider matrix runs ~3× faster at the same per-provider pressure. One global limit had been sized for
   Azure's TPM window and idled every other endpoint.
5. **The cards-to-conduct curve separates the product's two value axes.** Bundles compiled at 0/3/6/12-card
   budgets (θ disabled so the budget binds) show conduct is bought at DRAFT time (+52pp at zero cards — the
   drafter and rule bank write the Rules/Not-yet lists) while cards add ~4pp conduct. Cards buy decision
   CORRECTNESS, which conduct probes structurally cannot see (a wrong-but-consistent spec violates nothing).
   Consequence: recovery remains the metric for elicitation; conduct is the metric for the artifact; the v2
   experiment (decision-sensitive probes on perturbed golds) is specified in docs/EVALS.md.

**Consequences.** 671+316 clean trials in the two runs; per-trial error containment proved out (5 provider
hiccups contained, zero runs lost). Split-tier fast model (`ZADUM_FAST_MODEL`, ADR-031's registry reused)
built and latency-measured by a parallel agent — gpt-4o serves cards under 2s warm, pending a quality check.


## ADR-033 — The overnight build: contract layer, soft stop, review instrumentation, and four parallel teams (2026-08-24)
**Context.** The eval program (ADR-032, milestones 28–34) had outrun the product: the conduct-critical handoff
was proven to be ~9k chars, a wrongly-defaulted decision was proven to silence downstream agents (asks 2/4 →
0/16), and the flywheel's top-ranked signal (post-session edits through a hosted Sheet, LEARNING.md #1) had no
transport. This pass implemented the whole approved roadmap in one night — four parallel agents on disjoint
file sets (mcp+drift / selector+DP / harness+learning / web), the conflict-heavy core done serially.

**Decisions.**
1. **AGENTS.md is the protocol; spec.md is REFERENCE** (the 9k-handoff finding shipped): agents read the page
   in full and consult the spec as needed. AGENTS.md now also lists, riskiest-first, every defaulted decision
   below a confidence threshold (`CompileOptions.confirmBelow`, default 0.8) with the instruction to CONFIRM
   before building against them — the direct countermeasure to the silencing finding, measurable in
   `run_decisions.ts`. The threshold's known blind spot is recorded honestly: concentrated-wrong beliefs
   default at 0.95 (payment_recording did) and sail past any threshold — that is the recalibration/RB-mixture
   work's job, not the line's.
2. **Rules → runnable test stubs** (`sheet-tests.ts` in every bundle): deterministic generation, `it.todo`
   per rule (+ negative stubs for access rules) and per action, names prefixed with stable Sheet ids. No LLM:
   exactness of ids beats fluency. SPEC §7's "flagship v2" gets its v0 shape as a bundle artifact.
3. **Soft stop**: `converged` is a recommendation, not a guillotine. `Engine.continueCards` sets a persisted
   `user_continued` flag — θ ignored for the REST of the loop (the user re-priced their own tap), Rule 7's cap
   and `no_open` untouched. CLI and web both offer it; the web adds the settledness meter + coarse per-card
   share bars (deliberately quantized — 12 particles don't support a smooth line).
4. **Story correction wired** (`Engine.applyStoryCorrection`, CLI `story`, web story page): same Rule-1 patch
   path as user edits, own commit source + `story_corrected` event so learning can attribute what the
   walkthrough catches that the lists missed.
5. **MCP server** (`npm run mcp`, zero-dep JSON-RPC/stdio): get_sheet (page + ledger with confidences),
   check_task (one structured critic call), propose_amendment (= applyUserEdit — Rule 1 extends to coding
   agents), record_event (append-only artifact, not a mislabeled typed event). Inbound only; Rule 8 intact.
   Drift check (`npm run drift`): reverse-compile given docs, diff vs the Sheet via roundTripReport, nonzero
   exit under `--min` recall — the CI-shaped answer to Sheet staleness.
6. **Review instrumentation, simulated and real**: the harness gained `--review [depth] --catch-prob p`
   (simulated defaults reviewer, seeded) + `--noise p` (mis-tap stress) + `--with-context` (extra-context A/B
   with a real invoice artifact in the invoicing gold); `default_overridden` events now carry
   `review_position`. First mock numbers: net catch 31% at depth 8 even with a PERFECT reviewer, because
   **81/110 wrong defaults sat below the fold** — riskiest-first ordering does not surface them when
   confidences are miscalibrated. Instrument-ready; the live number is the one that matters.
7. **Loop B wired behind flags, selector untouched**: ZADUM_PRIORS_FILE (mixWithCatalog at createProject),
   ZADUM_RECALIBRATION_FILE (PAV-isotonic reliability map from `npm run learn`, applied to REPORTED
   confidences only — defaults, soft implications, you_decide; τ/θ application deliberately deferred to its
   own harness gate), ZADUM_CONTRARIAN (last sampler batch prompted to coherent minority worlds — OFF until a
   live A/B, because the mock baseline proved even its prompt text reshuffles sequences via the mock's
   prompt-hash seeding). Phrasing arms live: `Card.phrasing_arm` set deterministically per (project, node)
   over PHRASING_ARMS ("base", "moment"), so the bandit finally has >1 arm.
8. **CI + a selector regression gate** (`.github/workflows/ci.yml`, `npm run harness:check`): the mock harness
   must reproduce a committed baseline (asked sequences + AUC) byte-identically; deliberate changes regenerate
   it via `npm run harness:baseline` with rationale. The gate caught its first real drift within an hour of
   existing (the contrarian prompt, → decision 7's OFF default).
9. **EC² scoring arm + exact subset-DP bound** (survey items 4): `--scoring ec2` (decision-region edge-cutting,
   consequence ≥3 regions, θ=0.05 loudly UNCALIBRATED) and `npm run dp:bound` — exact optimum over particle
   subsets. Headline: **greedy = optimal at H=12 (100.0%) on the mock invoicing belief** (gap only at H=2-3);
   the "should we search deeper" question now has a proof-shaped answer, not a recurring sweep.

**Consequences.** 280 root + 10 web tests green; mock demo, typecheck, and the new gate all pass; the
confidence-line effect was measured live the same night (see docs/EVALS.md). RB-mixture belief remains the
top queued algorithmic item — deliberately NOT attempted overnight: it swaps the belief representation under
everything above and deserves its own session with θ recalibration.

## ADR-034 — Spec quality as the objective: the ruler, verification-mode elicitation, the fractal catalog, and IR-first compilation (2026-08-24)
**Context.** The eval program proved the bundle beats public baselines on conduct and recovery; the founder
raised the target: write MUCH better specs — more detail, more precision — while keeping the
most-discriminative-question principle. The trap identified first: an LLM can pad unlimited plausible detail,
and our own findings show agents TRUST confidently-written wrong text (0/16 asks). So "better" was defined as
**more true, decision-relevant, grounded detail per unit of user effort**, and a ruler was built before any
optimization. Four parallel agents (quality ruler / verify core+eval / spec IR / gap parser+idiom miner) on
new-file-only lanes; all shared-file wiring done serially.

**Decisions.**
1. **The ruler before the work** (`src/quality/`, `npm run quality`): (a) the ambiguity adversary — two
   independent implementer LLMs derive designs from the spec alone; a blind aligner locates material
   divergences → `spec_entropy` (consequence-weighted divergence share; 0 = fully determined). Every material
   divergence IS a located imprecision = a next discriminative question. (b) builder-questions — what an
   implementer would still have to ask. (c) blind pairwise tournament on 4 dimensions. First live numbers
   (gpt-4.1 readers, Sonnet judge, n=2): **zadum spec 0.08 entropy / 0 builder questions / 32-of-32 pairwise
   wins vs Spec Kit 0.13 / 10 Qs and DLAI-SDD 0.22 / 11 Qs**; honest negative — the one-page Sheet ALONE is
   more ambiguous (0.33) than the baselines' full specs, though what it covers it pins harder (forced-rate
   76% vs 61%): the page buys conduct, the compiled spec buys implementation precision. Even zadum's two
   residual divergences share one theme (can a client trigger a payment?) — a real seam, now visible.
2. **Verification-mode elicitation** (`core/verify.ts`, engine `getVerification`/`answerVerification`, CLI
   `verify`): when the belief is concentrated and mostly right, verification beats interrogation — scenario
   probes bundle defaulted decisions to JOINT p(correct) ≈ 0.5 (adaptive group testing, the batched
   generalization of binary search), rendered as one concrete story to confirm or correct. Accept = k weak
   confirmations (ε 0.2, deliberately milder than a card answer's ε); reject = "at least one is wrong"
   reweight + a Rule-1 resolution of the named decision. Mock eval (`npm run verify:eval`): probes land at
   mean p 0.47–0.57; **8 verification taps catch 27–33% of wrong defaults — matching the PERFECT depth-8
   review — and rejection reweights alone flip ~10 more wrong argmaxes** (a free re-default pass would
   roughly double the catch). New commit source "verification"; events verification_shown/answered.
3. **The fractal catalog** (schema `requires: [{node, options[]}]`, ALL-of entries, OR within one): child
   nodes stay sampled + defaulted always, but become ASKABLE only when the parent is settled at user grade
   (resolved/implied — details of an unconfirmed assumption are never asked before the assumption). Pilot: 6
   invoicing children (link expiry/access, reminder schedule, late-fee basis, credit-note numbering,
   recurring-failure handling), two multi-parent. Mock baseline deliberately regenerated (AUC 53%→56%);
   live θ recalibration flagged. Edge-case closure: an 8-class taxonomy (deletion-with-dependents,
   concurrency, idempotency, rounding, time boundaries, partial failure, permission escalation,
   lifecycle-backwards) now feeds the planner's bespoke pass.
4. **The spec carries a complete deterministic Decision ledger** (compile appendix): every decision with
   answer, provenance, confidence — no LLM writes it, so stated detail cannot be hallucinated detail.
5. **IR-first compilation pilot** (`core/spec_ir.ts`): lifecycles are emitted as typed data → 9 mechanical
   checks (unknown actor/entity, dangling refs, unreachable states, terminal exits, dead ends, silent
   nondeterminism…) → one findings-driven repair round → deterministic rendering. Best-of-N doesn't apply to
   this section (the checker replaces the critic-pick). `ir_findings` land in compile-report.json.
6. **Gap mining closes the loop** (`gap_parse.ts`, engine `mineSpecGaps`, CLI `gaps [--apply N]`): every
   ⟨src: default⟩ the compiler confesses is parsed, clustered by one LLM call into candidate decisions
   (xg_*), and `--apply` commits them open, joins them to the belief (prior-only, α-mix makes them askable),
   and reopens the card loop: spec gaps → new discriminative questions → tighter spec.
7. **Evidence absorption** (`core/evidence.ts`, `absorbEvidence`, CLI `evidence`, ZADUM_EVIDENCE=1 for
   auto-on-context): LLM-as-likelihood-function — one utterance/artifact scores every world's fit
   (quantized buckets, floor 0.25 keeps support) and reweights the whole belief, so cards are never spent on
   what evidence already answered. Rule 1 untouched: evidence moves the belief, never the Sheet.
8. **Precision idioms mined from strong corpus specs** (`mine:idioms`, catalogs/exemplars/): licence-vetted,
   ≥2-doc patterns (bounded_window, explicit_default, state_transition_rule, must_never_invariant,
   permission_matrix…) injected as a style block into every compile section — imitate the PRECISION, never
   the content.

**Consequences.** 363 root tests (was 280) + web 10; typecheck clean; mock demo green end-to-end through the
IR path; regression gate regenerated once, deliberately, for the catalog change. Live before/after ruler A/B
of the new compiler recorded in docs/EVALS.md. Queued next: per-section IR expansion (permissions matrix is
the obvious second), verification in the web UI, a second reader family for builder-questions, and
canonicalizing section/edge-case pattern names in the idiom miner.

## ADR-035 — Fourth-pass self-critique: belief hygiene, per-sitting budgets, the guided flow, and the interaction planner (2026-08-24)
**Context.** A fourth review pass, aimed at the two overnight builds and at the PRODUCT they created, verified
eleven issues by scripted probe or citation before proposing anything. Three were real defects in machinery
shipped hours earlier; two were product gaps that would have hit the first real user in their first session;
the rest were trust, metric-honesty, and the last step of the discriminative-question idea.

**Decisions.**
1. **Verification must not eat the belief it depends on.** Measured: six accepted story checks drove ESS
   5.98 → 1.01 (minEss 4) — a flat accept-ε made one 6-node accept six times the evidence of a 1-node accept,
   and `answerVerification` lacked the rejuvenation guard `answerCard` has. Fixed both: accept-ε is now the
   k-th root (total weight a scenario can strip is bounded regardless of bundle size) and the ESS resample
   guard runs after every verification answer. Re-measured: ESS stays 4.45–10.25 over the same six accepts.
2. **Rule 7 caps a SITTING, not a lifetime** (`round_base`, `round_max_cards`). Measured: a user who spent
   all 12 cards, compiled, then asked for the spec's own gaps got `STOP max_cards` — the questions they had
   explicitly requested were never asked and shipped as silent 50% assumptions. Gap-apply now opens a round
   capped at the number of questions the user asked for, never above Rule 7's 12.
3. **Gated children are conditioned, not stranded.** Measured: resolving a parent in the defaults review left
   its child frozen at a default computed while the parent pointed elsewhere. Two fixes: `propagateResolution`
   reopens stale never-asked children whose `requires` a resolution newly satisfies (reported as `unlocked`),
   and `finishCards` defaults every gated child from the belief CONDITIONED on its settled parents — the joint
   structure was already in the particles; using it makes child assumptions coherent by construction.
4. **The product got a guided flow** (`src/engine/advisor.ts`, `zadum next`, and a hint at the end of every
   command). Eight interactions had accumulated with no path between them, and the best new instrument
   (story checks) appeared in no hint anywhere. The advisor is pure and deterministic over a state snapshot —
   the same recommendation renders in the CLI and (next) the web rail — and it always names ONE next action
   with a reason. Ordering rules that matter: a coding agent's pending amendment outranks everything (it is
   blocking someone else); an explicit `accept` is respected rather than looped back into checks; a stale
   spec is flagged ahead of any new work.
5. **Web parity shipped** — verification, gap mining, and evidence now have routes and surfaces (story-check
   panel above the defaults table, "Tighten the spec", evidence box beside the correction box), 21 web tests.
6. **The correction moment does double duty**: `applyUserEdit`/`applyStoryCorrection` now also absorb the
   text as belief evidence (behind ZADUM_EVIDENCE) — patch ops for what is explicit, likelihood reweight for
   what is implied. Never fails an edit if absorption errors.
7. **One vocabulary, one mechanism for narrative confirmation**: the walkthrough's "Please confirm" items are
   now composed by the same 0.5-targeted group-testing machinery as interactive story checks (deterministic,
   no extra LLM call). Self-caught during the build: at the interactive `maxSize` of 6 the static bullets
   became six-clause run-ons nobody would answer honestly — capped to 2 for written checks.
8. **MCP amendments are queued, not applied** (`src/mcp/amendments.ts`, `npm run amendments`): a coding agent
   proposing a Sheet change stages it; only owner approval writes. Rule 1 was already honored mechanically —
   this closes the *authority* hole. Approved/rejected amendments are the flywheel's top-ranked signal, kept
   with enough context to learn from.
9. **`mineSpecGaps` takes ids, not just a count** — a checkbox UI means "exactly these"; a prefix silently
   pulled unchecked candidates along (found by the web agent, fixed in the engine).
10. **The ruler's builder-questions metric now separates "spec is ambiguous" from "reader didn't read"**
    (two-pass: flagged_assumption › answered_in_spec › genuine_gap, headline = genuine gaps), plus repeats
    defaulting to 4, `--reader-models a,b` for cross-family readers, per-repeat spread, `--seed`, and a CI
    self-check (`npm run quality:ci`). Live: the reversal reproduced — our specs rank LAST on raw question
    count and FIRST on genuine gaps, with `flagged` separating cleanly (6.0/5.5 vs 1.0/0.0). Two consequences
    recorded honestly: the ruler's own `saltCoin` was parity-of-character-sum (presentation order was never
    randomized — fixed, avalanche-tested), and under the better conditions **the compiler A/B's −25% claim is
    withdrawn pending a same-conditions re-run** (cross-family readers raised entropy everywhere; the two
    specs now overlap). The us-vs-baselines gap is unaffected and large.
11. **The unified interaction planner** (`src/core/planner.ts`, `zadum plan`, `Engine.planNext`): cards,
    story checks and review taps ranked on ONE consequence-weighted bits-equivalent scale, with explicit,
    harness-tunable conversion factors (review taps discounted by attention — a skim is not an answer).
    Advisory only: it does not drive the card loop until the harness's `--mix` arm says it should. This is the
    most-discriminative-question principle taken to its end — the most discriminative INTERACTION.

**Consequences.** Root tests 364 → 400+; the three defect fixes each carry the probe that found them as a
regression test. Deliberately NOT done: renaming `story.md` (blast radius across web, thesis harness and
artifact kinds for a naming win); wiring the planner into `deal` (needs the harness gate).

## ADR-036 — The external review: consistency as a gate, provenance as the lock, and honest metrics (2026-08-25)

**Context.** The founder asked an outside reviewer for a critical read. They returned six claims. Per the
working agreement (verify before believing), every claim was reproduced by a scripted probe BEFORE any fix:
(1) a normal 5-card mock session compiled with a hard-edge contradiction in its settled ledger; (2) after a
9-card session, 17 of 27 sampling constraints were pure belief guesses (soft implications write confidence ≥
softImplyTau = 0.95 *by construction*, and the lock filter was confidence-only); (3) undoing a card reverted
the whole sheet snapshot, deleting an edit made after the answer; (4) a project with 69 open decisions
compiled successfully and was marked done, and compile never re-checked the sheet version it read ~70s
earlier; (5) `recovery()` skipped gold decisions the session never surfaced — an empty design scored 1.0;
(6) the web app has no access control. All six confirmed.

**Decisions.**
1. **Consistency is certified jointly, not assumed locally** (claim 1). Each subsystem was locally consistent
   (answers propagate hard edges; worlds are repaired) but the FINAL ledger was never checked as a whole —
   and per-node marginal argmax over a mixed particle set is jointly inconsistent. `finishCards` now settles
   open decisions one at a time in consequence order, propagating hard edges as each default lands
   (`defaultOps`): an edge-forced value is taken as forced (rationale `follows from X=y`), otherwise the
   likeliest option that contradicts nothing wins. `ledgerConflicts` (core/catalog.ts) is the pure
   certification, and compile REFUSES a contradictory ledger. Alternative rejected: repairing conflicts at
   compile time (silent mutation of settled decisions at the least-visible moment).
2. **Provenance, not confidence, locks a sampling constraint** (claim 2). `fixedAssignments` fixes
   user-grade statuses always, and a `defaulted` decision only at `source === "plan"` (the planner's
   fixed_by_sheet — ADR-005's documented intent). Structural because every `set_decision` re-stamps
   `source`. The measured effect of freeing 17 pseudo-constraints: the same mock session asks 12 cards
   instead of 9 — uncertainty that was frozen is now askable and resampleable, which is exactly the
   confidently-wrong blind spot's feeding loop cut.
3. **Undo is selective when history moved on** (claim 3). With no foreign commits after the answer, undo is
   the exact snapshot revert it always was. With foreign commits (edits, story corrections, verifications,
   gap plans), the revert target is "history minus this card": the snapshot with foreign ops replayed on top
   (best-effort; ops the missing answer invalidates are skipped), so later work survives. Belief:
   snapshot restore + conditionSoft replay for foreign resolutions (order-free — per-world products);
   evidence/verify reweights are knowingly not replayed.
4. **Compile gates: unfinished, contradictory, stale** (claim 4). Refuses open/skipped decisions and ledger
   conflicts (CLI `--draft` / web `draft:true` compiles anyway, stamped DRAFT, 409 on the gate otherwise);
   re-reads the sheet version before writing artifacts — if it moved, the spec is stamped STALE, the report
   records both versions, and `markDone` is skipped (the advisor's stale-spec rule then steers to a
   recompile). No long lock: a compile takes ~a minute live and holding the project lock that long would
   block every edit. `acceptDefaults` re-defaults anything a review override reopened, so the compiling
   phase never legitimately starts with open decisions.
5. **The metric counts what's missing** (claim 5). Every gold decision now enters `recovery()`'s denominator
   (node consequence, fallback 3); absent-from-design counts as wrong; empty design vs non-empty gold = 0.
   Mock baseline regenerated: honest AUC 0.367 (was 0.560). All pre-2026-08-25 recovery/AUC numbers are
   upper bounds (EVALS honesty note); orderings likely stand, absolutes must be re-derived.
6. **Auth stays with the deploy item** (claim 6): agreed and already documented; per-project token +
   ownership middleware + rate limits ship with hosting, not before.

**Fallout fixed en route.** Verification probes now test the LEDGER's chosen option
(`ComposeOptions.chosen`), not the belief argmax — a consistency-forced default can differ from the
marginal, and a story-check acceptance must confirm what the Sheet actually assumes (found by the web smoke
suite: `confirmed=[]` on such a probe). The accept path likewise refreshes confidence for the confirmed
option itself (floored at its previous value) instead of vetoing the user's acceptance with the marginal.

**Consequences.** Root tests 413 → 426 (+21 web); every claim's probe is now a regression test. The freed
constraints and joint defaulting shift selector-visible behavior — the baseline regen is deliberate and the
θ recalibration queue (live) inherits one more reason to run.

## ADR-037 — Contradictions are resolved when they happen: reopen the contradicted answer (2026-08-25)

**Context.** ADR-036 #1 made contradictions impossible to *compile* (joint defaulting + `ledgerConflicts` +
the compile gate), but a contradictory pair of USER answers could still be *accepted* into the ledger: the
engine kept the earlier resolved answer, reported the collision, and relied on the user to notice the blocked
compile and manually align. Two lesser leaks: the contradicted decision, being `resolved`, did not even
appear in the defaults-review list the error message pointed at; and a `delegated` ("you decide") value
contradicted by a later answer was skipped silently — a conflict only the compile gate would ever surface.

**Decision.** Take Rule 3 at its word — "a resolved decision is never asked again *unless contradicted by a
later user action*". When a later user action's hard edge demands a different option than an earlier
RESOLVED decision holds, the engine does not silently flip the explicit answer and does not keep the
contradiction either: it **reopens** the earlier decision (collision still recorded and logged), reopens the
now-stale decisions that answer had implied (unless the new propagation re-derives them), and lets the
normal machinery finish the job — the question is re-askable; `finishCards`/`acceptDefaults` otherwise
settle it as a forced default consistent with the newer answer ("follows from …"). `delegated` values carry
no user opinion, so they are re-derived directly (reopen → implied; the transition table forbids
delegated → implied in one step). The ledger is therefore never contradictory through any engine path; the
compile gate remains as a pure backstop for data written outside them (verified by a raw-commit test).

**Alternatives rejected.** (a) Later answer silently wins (flip the earlier resolution to `implied`):
overwrites an explicit user statement on the strength of a catalog edge — the edge might be what's wrong.
(b) Earlier answer stands, compile blocks (the ADR-036 interim): correct but adversarial UX — the user
discovers the conflict at the furthest point from where they caused it, and the review list couldn't even
show it. (c) A dedicated conflict-card UI: better long-term, but reopening already routes the question into
every existing surface (cards, review, planNext) with zero new UI.

**Consequences.** A contradiction now self-heals end to end (test: override → contradiction → finish →
accept → clean compile, no manual step). One learning-side nuance is documented in the population-priors
test: "finally defaulted" no longer implies "never touched" — an answered decision can be reopened by a
contradiction and re-defaulted, and its card answer remains a legitimate observation. Root tests 426 → 428.

## ADR-038 — The spec workspace, the refine loop, and consistency by construction (2026-08-25)

**Context.** Three asks landed together: a UI a non-technical owner would enjoy, an editable spec in the
browser with a refine step and a `.md` download, and the evidence-layer labelling work run on Opus via Azure.
Three agents worked disjoint file sets (spec workspace / design system / labelling) while the engine changes
were done serially. Integrating them exposed three real consistency defects that no test had covered.

**Decisions.**

1. **A correction to the spec lands on the SHEET, never on the spec text** (`Engine.refineFromSpecFeedback`).
   Editing `spec.md` is pointless — the next compile overwrites it — so an edit or comment is read for INTENT
   and applied as patch ops through the ordinary Rule-1 path. Edits are diffed in code first
   (`core/textdiff.ts`): a compiled spec runs ~45k characters and re-sending both versions would cost ~25k
   tokens and bury a three-line correction, so only changed hunks with context are sent. Feedback is
   classified four ways — wrong assumption (with the correction when given), missing element, confirmed,
   new question. A choice the feedback OPENS becomes an open decision (`xr_…`) and a new card round, never a
   fresh guess; compile then refuses until it is answered, which is the honest outcome rather than an error.
   Surfaces: `/p/<id>/spec` and `zadum refine`. Live-verified against gpt-4.1, which caught a prompt gap: the
   model emitted `add_action` against a noun the Sheet did not have, an op the patch layer rejects silently —
   the extraction would have shown a change that never happened. Op-mechanics discipline was added to the
   prompt; the live run then applied 2 ops with 0 rejected.

2. **The refine loop is the flywheel's best signal** (docs/LEARNING.md §0). `spec_refined` carries the
   human-readable extraction AND machine-readable `corrections` (node + the *validated* option id, since the
   extraction holds labels that learning cannot key on), with a new `refinement` observation source. Nothing
   else in the product produces a labelled miss and its fix in the same breath, on a document the owner had a
   real reason to read carefully.

3. **Worlds are hard-consistent by construction** (`core/worlds.resolveAssignment`). `repairAssignment`
   propagates hard edges but never overwrites, so forcing `fixed` constraints on top of a repaired sample left
   worlds that violate hard edges — **971 surviving violations across 39 real sampling calls**. Those
   impossible worlds carried weight in every marginal the selector, the defaults and the soft implications
   read. Values are now taken in priority order (certain first), each placed only if free and consistent, each
   propagating its own edges as it lands. Measured after: 0/12. It also *improved* the benchmark
   (mock AUC 0.367 → 0.380), so the baseline was regenerated deliberately.

4. **A decision that cannot arise is dropped, not answered.** When every option of a decision contradicts what
   the design already settled, defaulting the argmax anyway wrote a contradiction the owner could never fix in
   review — every choice offered was impossible — and compile then refused, stranding the session. Measured:
   with `payments_in_app = none`, every option of `payment_recording` implies that payments happen. Such a
   decision is now removed (`remove_decision`, reported as `not_applicable`) — the planner's own
   `not_applicable` verdict, reached later. Worlds do the same by leaving the cell unassigned, which is why
   worlds are no longer complete by construction and downstream reads a missing value as "no opinion".
   This is a catalog gap as much as an engine one: `payment_recording` wants a "no payments taken" option or a
   `requires` gate. Recorded, not silently patched — that change is harness-gated.

5. **Hard edges are directional, so consistency needs a backward sweep.** `propagateHard` walks forward from
   what was just settled, so answering a decision that is the TARGET of an edge left the SOURCE standing with
   a value implying something else. Found by a subagent's live UI testing (correcting `payments_in_app` to
   `none` in a story check while `payment_recording=online_auto` stood). After the forward pass, the projected
   ledger is now checked as a whole and any offending source is reopened — reported as a contradiction when the
   user had answered it themselves. The newest user action wins (Rule 3); the compile gate stays a backstop.

6. **A live experiment must not be reachable by accident.** `npm run detectability -- --help` started a full
   paid labelling run because nothing validated arguments. Unknown flags and `--help` now exit before any
   model is constructed, and the usage text states the measured cost.

**Consequences.** Root tests 428 → 509, web 21 → 29; every defect above carries the probe that found it as a
regression test. Worlds are no longer complete by construction — a deliberate, documented semantic change.
The mock demo now runs the refine loop, so CI covers the headline feature end to end.
