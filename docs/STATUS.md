# STATUS — resume here

_Last updated: 2026-08-24 (session 1i, the overnight roadmap build — ADR-033, four parallel agents + core.
See milestones 35–42 and the 1i session-log entry). Next session: start at "Next steps" below._

## TL;DR
Core workflow + architecture of Design Sheet is built and green: `npm test` → **280 tests / 27 files** (+10 web
smoke tests in `apps/web`, `npm test --prefix apps/web`) pass (incl. a
Postgres round-trip when `DATABASE_URL` is set), `npm run typecheck` clean, `npm run zadum -- --mock demo` runs the
whole flow without credentials, and **the live LLM path works end to end on Azure OpenAI gpt-4.1** (draft 47s,
edit, cards, compile 69s with critic 10/10). See "Live findings" below — they drove three fixes and show θ must be
recalibrated on live beliefs (mock-calibrated θ stops after 1 card live).

Provider: `ZADUM_PROVIDER=azure-openai|openai|anthropic` (auto-detected from keys in `.env`, which is auto-loaded).
Only a `gpt-4.1` deployment exists on the Azure endpoint; both tiers use it.

**Selection is information-theoretic by default** (the founder's core idea): `weighted_entropy` — expected
reduction in consequence-weighted entropy about the spec. `joint_entropy` (pure "halve the possibility space")
and `risk` are switchable (`--scoring`), two-ply lookahead is available (`--lookahead 2`), and
`npm run harness -- --sweep` compares them at equal question budget and calibrates θ. See ADR-014…017.

| # | Milestone | State |
|---|-----------|-------|
| 42 | **Confirm-first protocol, live, 3 iterations** (EVALS "Confirm-before-building"): passive note = inert; imperative confirm-FIRST on the original 4-model matrix → flip-probe **asks 0% → 50%** at c0, stale defaults 63%→13%; cards buy down asks (50%→6% at c12); the 0.95-confidence blind spot untouched (as predicted — recalibration/RB territory) | ✅ run (126 live trials + 2×2 recompiles) |
| 41 | **CI + selector regression gate**: `.github/workflows/ci.yml`; `npm run harness:check` compares the mock harness against a committed baseline (asked sequences + AUC, byte-exact); caught its first real drift within an hour | ✅ |
| 40 | **EC² scoring arm** (`--scoring ec2`, θ UNCALIBRATED) + **exact subset-DP optimality bound** (`npm run dp:bound`): greedy = optimal at H=12 (100.0%) on mock invoicing; gap only at H=2–3 | ✅ built + run |
| 39 | **MCP server** (`npm run mcp`: get_sheet/check_task/propose_amendment/record_event — Rule 1 extends to coding agents) + **drift check** (`npm run drift`: reverse-compile docs vs Sheet, CI-friendly exit codes) | ✅ built (15 tests) |
| 38 | **Loop B wired behind flags**: ZADUM_PRIORS_FILE (mixWithCatalog), ZADUM_RECALIBRATION_FILE (PAV reliability map → reported confidences only), ZADUM_CONTRARIAN (minority-worlds sampler batch, OFF pending live A/B), phrasing arms live (`Card.phrasing_arm`, 2 arms) | ✅ |
| 37 | **Review instrumentation**: harness `--review/--catch-prob/--noise/--with-context` (sim defaults reviewer, mis-tap stress, extra-context A/B w/ real invoice artifact); `default_overridden` carries `review_position`. Mock finding: **81/110 wrong defaults below the depth-8 fold** — riskiest-first does not surface them under miscalibrated confidence | ✅ built + first mock numbers |
| 36 | **Soft stop + story step + web curve**: `Engine.continueCards` (persisted; θ re-priced, Rule 7 intact), `applyStoryCorrection` (+ CLI `story`, web story page), settledness meter + coarse share bars, extra-context textarea, 10 web smoke tests | ✅ |
| 35 | **The contract handoff shipped** (ADR-033): AGENTS.md = protocol w/ spec-as-REFERENCE + confirm-below-80% list of risky defaults; `sheet-tests.ts` in every bundle (it.todo per rule/action, stable ids) | ✅ live-measured (milestone 42) |
| 0 | Repo scaffold, docs (CLAUDE.md, SPEC, ARCHITECTURE, DECISIONS, LEARNING, EVALS) | ✅ |
| 1 | Deterministic core: Sheet schema, patch ops + apply, commits + diff/undo, FileStore/MemoryStore | ✅ tested |
| 2 | Decision catalogs (core 27 nodes + b2b-invoicing 20 nodes), worlds, selector (3 scorings + 2-ply lookahead, calibrated θ), hard edges, stopping | ✅ tested |
| 3 | LLM layer: `AnthropicLLM` (messages.parse + zod), `MockLLM`, `CachedLLM`; 10 structured functions + prompts (v2026.08.22-1) | ✅ written · ⚠️ never run live |
| 4 | Engine: createProject (draft→plan→worlds), applyUserEdit, card loop (deal/answer/undo, implications, resample, speculative precompute), defaults review, events | ✅ tested (mock) |
| 5 | CLI: new/show/edit/cards/defaults/override/accept/compile/history/events/projects/demo | ✅ (mock demo run) |
| 6 | Compile: 3 waves, best-of-N (critic picks), critic repair loop, round-trip recall, story, bundle (spec.md, design-sheet.md/.json, AGENTS.md, compile-report.json, story.md) | ✅ tested (mock) |
| 7 | Postgres store + migrations (`npm run db:migrate`) | ✅ tested (local DB `zadum_test`) |
| 8 | Eval harness: gold format, simulated user, recovery@k curves, counterfactual variants, criterion sweep, θ calibration by replay | ✅ plumbing (1 gold + variants, mock) |
| 9 | Catalog miner (`src/mining/`): 1–3-gram corpus stats → node candidates / catalog gaps / node relevance / coverage checklist (`npm run mine`) | ✅ tested; run on the real corpus |
| 10 | **Real corpus**: `corpus/` — 106 specs / 10 archetypes, licence-tracked manifest, `docs/CORPUS.md` | ✅ (3 licence-uncertain docs flagged; portfolio-landing has 1 doc) |
| 11 | Stage-2 concept extraction (`npm run mine:concepts`): polarity-aware decisions per spec → option-level prior hints, new concepts | ✅ run live on all 106 specs → `mining-results/*-concept-priors.json` (review → catalog priors) |
| 12 | Catalogs: booking 22, marketplace 22, e-commerce 19, crud-saas 16 (+ core 27, b2b-invoicing 19) with validation test | ✅ |
| 13 | Learning loop B (`src/learning/`, `npm run learn`): population priors (shrinkage), calibration/ECE, θ replay, phrasing bandit | ✅ estimators; not wired into the engine (harness-gated) |
| 14 | Web UI `apps/web` (Next.js, split-screen cards, defaults review, compile + artifacts; mock flow verified) | ✅ v1 · no tests · traceability click-through not wired |
| 15 | OpenAI-compatible LLM adapter (`src/llm/openai_client.ts`, strict json_schema) + provider selection | ✅ tested live on Azure |
| 16 | Live criterion sweep (n=3, 4 arms) — see docs/EVALS.md; all 3 θ defaults recalibrated (ADR-022); ordering inconclusive at this sample size | ✅ |
| 17 | External baselines (`src/baselines/`): Spec Kit driver (vendored MIT templates) + DLAI-SDD driver (reimplemented protocol, license-clean) + comparison runner (`npm run baselines`) — see docs/BASELINES.md | ✅ built (23 tests) + first live comparison run (n=1) — see docs/EVALS.md |
| 18 | Gold set expanded: `booking-salon` (booking) + `marketplace-services` (marketplace), each 49/49 nodes assigned, 0 `perturbGold` conflicts verified | ✅ built + mock-verified + run live |
| 19 | Live baseline comparison across all 3 archetypes: our engine wins recovery on every gold (72.7% mean vs 60.7%/58.3%); Spec Kit's 90–105× token-cost gap confirmed systematic | ✅ — see docs/EVALS.md, ADR-024 |
| 20 | Live 3-archetype criterion sweep (invoicing/booking/marketplace, real archetype diversity not just perturbations) | ✅ confirmed all θ, ordering still inconclusive (ADR-025) |
| 21 | **Multi-option cards**: up to 4 options per card (was always 2), same step-count as before (ADR-026) | ✅ live-verified, regression-tested |
| 22 | **Rule bank** (`src/mining/rule_bank.ts` + `src/engine/rule_augment.ts`): mines archetype rule patterns from the corpus, suggests missing rules at draft time — the fix for the "0% rules recall everywhere" finding | ✅ shipped as default; live A/B: rules recall 0%→80% (ADR-027) |
| 23 | **LLM-judge semantic recall** (`src/harness/judge.ts`): the metric fix ADR-024 called for and this session's own rule-bank A/B proved necessary | ✅ built, `--judge` flag; not yet validated against a human anchor set (ADR-028) |
| 34 | **Decision-sensitive probes on perturbed gold** (140 trials, `src/thesis/run_decisions.ts`): selector asked only 1/5 deviating nodes in 12 cards (concentrated-belief blind spot, priced downstream); where a card landed, 3/3 agents built the TRUE design; **a wrong default silences the agent's questions (asks 2/4 → 0/16)**. Product follow-ups: confidence-threshold line in AGENTS.md; measure wrong-default catch-rate in real defaults reviews | ✅ run |
| 33 | **The 9k handoff**: `sheet_only + AGENTS.md` (page + protocol, no compiled spec) scores **91% vs the full 53k bundle's 86%** at ~1/6 the context, 0 over-refusals; gpt-4o's best arm too. Conduct-critical handoff = one page + half a page | ✅ run |
| 32 | **Judge validated across families**: Opus 4.8 re-judged all 671 stored replies — 93% agreement, **κ 0.85**; identical arm ordering under both judges. Human anchor set still awaiting founder labels | ✅ run |
| 31 | **Cards-to-conduct curve** (320 trials): draft+rule-bank buys +52pp of agent conduct at ZERO cards; cards add ~4pp — conduct is bought at draft time, correctness by the cards (orthogonal value; see EVALS "curve"). v2 experiment defined: decision-sensitive probes on perturbed golds | ✅ run |
| 30 | **Controls run** (672 trials, 7 arms): length-matched `sheet_only` (8–10k chars) scores 74% vs Spec Kit 45% — content not volume; `sheet_mismatched` falsification: flag rate collapses to 0/4 exactly where the donor bundle lacks an analogous rule. Per-provider concurrency (`keyedLimiter`), `--rejudge` cross-judge κ, blind 50-case human anchor set generated (`thesis-results/anchor-set.md` — **awaiting the founder's labels**) | ✅ run |
| 29 | **Split-tier fast model** (`src/llm/split_tier.ts`, `ZADUM_FAST_MODEL`): fast tier can run on a different deployment; gpt-4o serves cards 1.4–1.8s warm (vs gpt-4.1 1.7–2.1s); p90 claim needs a wider sample + card-quality check before default | ✅ built + measured (n small) |
| 28 | **Thesis test across 3 archetypes × 4 agent models, independent judge** (480 trials, 0 errors): pooled one-liner 26% / Spec Kit 46% / DLAI-SDD 51% / bundle 86%. **Opus 4.8: Spec Kit 67% vs bundle 100%** — a stronger agent does not close the gap | ✅ run |
| 27 | **Multi-model evals**: registry + Anthropic-over-Foundry adapter (forced tool use) + `npm run models`; 5 deployments verified. **480-trial thesis matrix, 4 agent families judged by Opus 4.8: one-liner 25% / competing specs 40-47% / bundle 91%, 0 over-refusals** (ADR-031) | ✅ run |
| 26 | **Thesis test** (`src/thesis/`, `npm run thesis`): does the bundle change what a coding agent DOES? 5 arms × 8 implicit probes × 3 repeats, live. **Bare one-liner flags 0/18 rule violations; full bundle 89% with citations; competing specs 22–28%** — see docs/EVALS.md "Thesis test" | ✅ first run (1 gold) |
| 25 | **Correctness review** (session 1g): 10 defects found by a full read-through, 4 reproduced by script; all fixed with regression tests (ADR-030). Selector touch harness-gated: mock harness byte-identical to baseline | ✅ 191 tests green |
| 24 | **Thoroughness levels** (`src/core/thoroughness.ts`, `--thoroughness quick\|standard\|thorough`): bonus feature per the user's explicit request; `standard` regression-tested to exactly match prior defaults | ✅ built; presets honestly uncalibrated (ADR-029) |

## How to resume
1. `npm install && npm test && npm run typecheck`.
2. No credentials: `npm run zadum -- --mock demo --out out/demo` (look at `out/demo/spec.md`, `AGENTS.md`).
3. With credentials (`export ANTHROPIC_API_KEY=…` or `ant auth login`): run the **live smoke test** (Next steps #1).
4. Read `docs/ARCHITECTURE.md` §4 (selector) before touching `src/core/selector.ts` / `src/core/worlds.ts`.

## Live findings (2026-08-23, Azure gpt-4.1, project `live1` in .zadum)
- Draft+plan+12 worlds: 47s; compile: 69s, ~112k input tokens; critic pass 10/10; story good; round-trip
  actions 38% → matching was too strict (fixed: actor/object by name, verb by stem).
- Planner kept 61 catalog nodes + 4 bespoke and marked only `payments_in_app` not applicable; the drafter tagged
  `b2b-invoicing` + `crud-saas`, so generic crud nodes competed with invoicing ones — the FIRST card was
  "table vs board view". Fix: secondary-archetype nodes get consequence × `secondaryArchetypeWeight` (0.5).
- Real worlds are far more concentrated than the mock's (ESS 10.5/12; most nodes ≥0.9 agreement). Consequences:
  (a) θ=50 (mock-calibrated) stopped after **1 card at 86% settled** → θ must be recalibrated live (an
  equal-budget run `--theta -1 cards <id> --auto` logs `value1` per card; `npm run learn` / harness replay the curve);
  (b) one answer "implied" 23 nodes that were already at ~0.89 → soft implications now require a ≥0.10 rise
  (`minImplyDelta`, ADR-020) *and* ≥0.95 max P (`softImplyTau`).
- Sampler emitted 26 repairs / 6 hard-edge conflicts across 12 worlds — the repair path is earning its keep;
  consider feeding conflicts back into the sampler prompt.

## Autonomous overnight pass (2026-08-23, unattended per explicit user request)

User asked, before going to sleep: review the finished 3-archetype sweep, find the highest-leverage
improvements, implement them without waiting for approval, run at least 3 self-critique/refinement cycles,
consider granularity levels / agentic orchestration / retrieval. What was built, and why THIS over the
alternatives:

- **Chosen**: (1) multi-option cards — user's own mid-session instruction ("cards are great UX, but getting
  most information with fewer steps is more important"); (2) a corpus-grounded rule bank — the single
  highest-leverage gap the night's own evals had just surfaced (0% rules recall, everywhere, always); (3) an
  LLM-judge semantic metric — became necessary mid-cycle-2 when the rule bank's real improvement turned out to
  be invisible to the existing lexical metric. All three are retrieval/UX-scoped, not agentic-orchestration
  scoped — see "Considered and not built" below for why.
- **Considered and not built**: full agentic tool-use loops for individual pipeline components (drafter,
  compiler) — would violate Product Principle 2 ("not an autonomous agent") without evidence any component
  needs open-ended iteration rather than the existing fixed critique-refine loops (compile already has one);
  live web search / general RAG — the rule bank achieves the retrieval value using data already collected and
  license-vetted, with no runtime network dependency or reliability risk; "granularity levels" (thoroughness
  presets) — a reasonable idea, not started, noted in Next steps below as it did not rise above the rule bank
  in urgency.
- **Three real self-critique/refinement cycles, each catching a genuine problem before it shipped**:
  1. Built the rule bank + tests → the tests immediately caught the dedup mechanism sharing ADR-024's own
     lexical-matching blindness (couldn't catch realistic paraphrased near-duplicates) → fixed by honestly
     scoping the deterministic check to near-literal duplicates and documenting the LLM's own prompted judgment
     as the primary defense; also fixed an unrelated templated-mock-text bug the same test run exposed.
  2. Ran it live end-to-end → hit a circular ESM dependency (same class of bug `mining/concepts.ts` hit earlier
     this session) that silently deadlocked the CLI → fixed by extracting a schema-only module; then a live
     draft inspection showed genuinely good output (one added rule was materially the gold's own intended
     invariant) with one minor scope-fit nit noted, not blocking.
  3. Tried to MEASURE cycle 2's live win on the harness → the existing lexical rules-recall metric showed
     0%→0%, completely blind to a real improvement → built the LLM-judge metric specifically to settle this →
     re-ran the same A/B → 0%→80%, proving the feature works and the old metric couldn't see it.
- Also fixed in passing: a mass test regression (17 failures) from the live rule-bank mining run writing real
  files into the default `catalogs/rule-bank/` path, which every existing mock test then silently started
  reading; fixed by adding the missing mock handler and decoupling unrelated engine tests via an explicit empty
  temp `ruleBankDir` override, so tests no longer depend on incidental repo state.
- **Second archetype validation**: re-ran the rule-bank A/B on `booking-salon` — rules recall 17%→33% (direction
  confirmed, magnitude smaller/noisier than invoicing's 0%→80%; honestly flagged as n=1-per-arm, not precise).
- **Bonus 4th item**: thoroughness levels (`quick`/`standard`/`thorough`), the user's other explicit suggestion —
  built, tested (`standard` reproduces prior defaults exactly), shipped with an honest "not live-calibrated yet"
  caveat matching how `DEFAULT_THETA` itself was treated before its own harness-replay calibration.
- **153/153 tests green** at the end of this pass (up from 121 at the start of it).

## Correctness review (2026-08-23, session 1g)

A full read-through (concept + bug review) found ten defects — edge-path and consistency issues, not structural.
Four were reproduced by script before fixing. Full rationale and the judgment calls in **ADR-030**; the headline
items:

- **State corruption:** `modify_action` mutated the Sheet on ops it then *rejected*; `normName` failed to
  collapse two whole classes of plural (`expense(s)`, `status(es)`), so duplicate nouns slipped past dedup.
- **Silent mis-stopping:** the CLI passed a θ computed from the *CLI-side* scoring on every invocation, so
  resuming a `--scoring risk` project with a bare `cards <id>` judged risk-scale values against
  weighted_entropy's θ and stopped after one card. θ now follows the effective scoring (`mergeConfig`), and
  thoroughness travels as a multiplier rather than a resolved number.
- **Two dogfood rules were being violated in code:** `thorough` shipped `maxCards: 20` against Rule 7's 12 (and
  the test asserted the violation); a spec that failed its critic was delivered unmarked against Rule 6.
- **Rule 3's "unless contradicted by a later user action" was unimplemented:** changing your mind left the old
  hard-edge consequence standing, so the spec could ship two contradictory decisions.
- **The card toast was fiction:** measured on the mock invoicing belief, the `also_sets` preview promised **71**
  settlements for one card where the engine settles **none** (the UI shows 6). ADR-020 tightened the real
  implication path in the live-findings pass and missed its preview, which still used hard conditioning at the
  looser τ.

Verification: 191 tests green (was 152), typecheck clean, `--mock demo` end-to-end unchanged, and
`npm run harness -- --mock` byte-identical to the pre-fix baseline (same asked-node sequences, same 53% AUC) —
so the one selector-touching fix guards a degenerate case without shifting normal behaviour. **θ needs no
recalibration.** The contradiction reporting and the honest toast change what the user sees mid-session, so both
are worth watching in the first live run.

## Next steps (in order, refreshed 2026-08-24 after the overnight build)

A. **First real users** — now genuinely unblocked: hosted deploy + minimal auth for `apps/web` (the only
   missing pieces; flow, story step, soft stop, latency plumbing all exist). The single most important number
   real sessions produce: wrong-default catch-rate in the review (`default_overridden.review_position` is
   already logged; the simulated reviewer predicts the ordering has a below-the-fold hole).
B. **RB-mixture belief** (survey top-5 #1) — its own session: the DP bound proved policy search is closed
   (greedy=optimal at H=12), so ALL remaining selector headroom is belief representation/calibration; θ
   recalibration afterwards. The recalibration estimator needs gold-truth-scored harness data first (gap above).
C. **MCP server in a real agent session** — point Claude Code / any MCP client at `npm run mcp`, dogfood
   get_sheet/check_task/propose_amendment on a real repo; `check_task` is the queued delivery vehicle for
   assumption-confirmation (the confirm-first preamble alone was insufficient for gpt-4.1 — EVALS).
D. **Founder labels for the anchor set** (~15 min; blocks quoting any judge number externally).
E. Live A/Bs queued behind the harness: ZADUM_CONTRARIAN on/off (belief diversity), ec2 θ sweep, phrasing
   bandit's first real rewards, extra-context A/B live (`--with-context` — the invoice artifact is in the
   invoicing gold), `quick`/`thorough` θ-multiplier calibration (ADR-029, still open).

## Next steps (older list, pre-1i — items not yet subsumed)

0. ~~**Commit and push** + fix the review defects~~ — **done** (session 1g, ADR-030).
   ~~**Run the A/B thesis test**~~ — **done** (session 1g), then re-run across 4 agent model families with an
   independent judge (Opus 4.8), 480 trials: the one-liner arm flags **0 of 72** rule/scope violations while
   the bundle flags 88% with citations, competing specs 19-29%, zero over-refusals (docs/EVALS.md). **Next for
   it:** re-run on booking + marketplace golds, add a length-matched control, and validate the judge against a
   small human-labelled anchor set before quoting 91% externally.
   The strategic constraint is no longer engineering: the product thesis (a Sheet-equipped coding agent refuses
   a rule-violating change and cites the rule) has **never been tested**, and there are still **zero real user
   sessions**, so the learning flywheel — the moat — is not spinning. Those are now the top two items:
   **(a) run the A/B thesis test** (was #9 below; ~a day with bundles you can already compile), then
   **(b) first real users** (web polish: fast-tier deployment for <2s p90 cards, traceability click-through,
   and the information-gain curve with recommend-and-default-accept stopping).
0-b. **Fresh follow-ups from the 2026-08-24 controls/curve runs** (in rough order of value):
   (a) label `thesis-results/anchor-set.md` (~15 min, founder) then `npm run thesis -- --score-anchors …` —
   closes the judge-validation gap; (b) ~~`sheet_only + AGENTS.md` arm~~ — **done: 91% vs full bundle's 86% at 1/6 the context** (milestone 33);
   the follow-through is a compile-output decision: ship AGENTS.md pointing at spec.md as REFERENCE rather
   than required preamble; (c) ~~decision-sensitive probes on perturbed golds~~ — **done** (milestone 34); new follow-ups it spawned:
   a confidence-threshold line in AGENTS.md ("confirm decisions below X% before building against them"),
   testable in the same harness, and per-value design descriptions for multi-valued nodes (p_edit confound);
   (d) card-quality check for `ZADUM_FAST_MODEL=gpt-4o` before making the fast tier default.
1. **Extend the rule bank + judge validation to booking/marketplace golds** (`npm run mine:rules` already
   produced banks for both — see `catalogs/rule-bank/`). Tonight's 0%→80% result is n=1 (invoicing only); the
   next real question is whether it holds elsewhere. Also: validate the judge metric against a small human-
   labeled anchor set (ADR-028's honest gap) before trusting it beyond same-gold before/after A/Bs.
2. **Rule-bank prompt refinement**: the one live scope-fit nit from ADR-027 (a suggested cross-firm isolation
   rule assumed multi-tenancy the Sheet didn't state) — worth a small `AUGMENT_RULES_SYSTEM` tightening pass,
   re-validated the same way (live A/B + judge), not a blocker to the current default-on behavior.
3. **Calibrate thoroughness presets live** (ADR-029): built and shipped, but the theta multipliers are an
   uncalibrated first pass (verified not-degenerate by direct probe only). Same harness-replay treatment as
   `DEFAULT_THETA` (docs/EVALS.md "Calibrating θ") would make "quick"/"thorough" behavior trustworthy in
   absolute terms, not just directionally sensible.
4. **Baseline comparison past n=3-archetypes-one-gold-each** (ADR-024/025 finding): `--variants` support in
   `src/baselines/run.ts` (currently harness-only); a prompt-caching pass on the Spec Kit driver (90–105×
   DLAI-SDD's tokens, confirmed systematic); the raw-one-liner / generic-clarifying-chat baselines not built.
5. **Planner prompt**: tell it the primary vs secondary archetype and to exclude generic nodes that duplicate a
   domain-specific one (PROMPTS_VERSION bump); consider `secondaryArchetypeWeight` vs prompt on the harness.
6. **Web UI** (`apps/web`): wire traceability click-through (⟨src⟩ → card/edit) and the story-correction step;
   add a smoke test; deploy a real fast-tier Azure model (e.g. gpt-4.1-mini) so precompute actually clears the
   <2s p90 target — see docs/EVALS.md "Web UI live latency" for why the current single-deployment setup can't;
   the multi-option cards feature (ADR-026) needs zero web UI changes (already option-count-agnostic) but is
   worth a manual click-through to confirm the 3-4-button layout looks right.
7. **Wire Loop B into the engine** behind a flag (`mixWithCatalog` at `Engine.createProject`), gated on a
   harness win; set `Card.phrasing_arm` so the bandit gets >1 arm.
8. Fold `mining-results/*concept-priors.json`'s remaining hints (beyond what's already folded into catalogs
   2026-08-23-1, see catalogs/README.md "Learned from corpus") into more catalogs as they're built.
9. A/B thesis test: hand-written Sheet + AGENTS.md vs none → coding agent asked for a rule-violating feature.

## Known gaps / caveats (2026-08-24 additions)
- **recalibration.json is not yet epistemically usable**: the current event corpus is dominated by simulated
  sessions (perfect sim answers) and auto-accepted defaults (scored "correct" by construction), so the fitted
  map says the belief is UNDER-confident (87–100% everywhere) — the opposite of the live truth. Fit it from
  real review data, or extend the estimator to score harness defaults against gold truth (the harness knows
  the answer; `--review` runs already generate honest override events).
- **θ for `--scoring ec2` is a guess** (0.05); sweep before any live use. `ZADUM_CONTRARIAN` ships OFF until a
  live A/B re-validates θ and belief concentration under the new sampler prompt.
- **The confirm-first protocol is measured on one gold at n=1/cell** (5 models total across iterations,
  invoicing-perturbed only) — strong direction (asks 0%→50% where the list reaches), but it cannot reach
  confidently-wrong (≥80%) defaults, and gpt-4.1 ignores it entirely; MCP `check_task` at task time remains
  the enforcement path that doesn't depend on the agent reading preamble.
- CI runs mock-only; the harness gate (`npm run harness:check`) must be regenerated deliberately
  (`npm run harness:baseline`) whenever a selector-visible change is harness-justified.

## Known gaps / caveats
- **θ is live-confirmed across 2 independent samples** (risk 7 / weighted_entropy 24 / joint_entropy 1.25 —
  ADR-022, reconfirmed ADR-025). Still an absolute price per question: recalibrate after any material catalog
  change (one equal-budget harness run gives the whole curve, ADR-016). `weighted_entropy+2ply` still shares
  weighted_entropy's θ and is NOT separately calibrated — recalibrate before using `--lookahead 2` for anything
  but experiments.
- **Lexical recall (draft_recall) is a confirmed-unreliable lower bound, not a real measurement** (ADR-024,
  reconfirmed harder by ADR-027/028's 0%→0%-vs-0%→80% gap). Prefer `--judge`'s `semantic_draft_recall` for
  anything about rules/actor/noun QUALITY; lexical is fine only for exact-phrasing regression checks.
- Mock sampler has strong spurious persona correlations and its simulated user answers perfectly from the gold,
  so mock recovery numbers are meaningless in absolute terms; only the plumbing is being tested there.
- Every existing engine/harness test that constructs an `Engine` with `invoicingMockHandlers` and does NOT
  override `ruleBankDir` will now silently exercise the real `catalogs/rule-bank/b2b-invoicing.json` (mined
  2026-08-23) — the mock's `augment_rules: () => ({ additions: [] })` keeps this harmless, but a new mock
  fixture set for another archetype will need the same handler if that archetype's bank exists.
- `fixed_by_sheet` (planner) → defaulted @0.95 and used as sampling constraints (ADR-005) — revisit if the planner
  over-fixes.
- Card generation uses the fast tier (Haiku) with `temperature 0.7`; speculative precompute is on by default in the
  Engine but off in tests. Precompute writes `session.precomputed` under the per-project lock.
- `PatchOut` flat-record schema (ADR-011) is verbose; if Anthropic structured outputs accept `.optional()` via the
  zod helper, this can be simplified later.
- No web UI, no auth, no hosting of the Sheet for post-session edits yet (the strongest learning signal).
- `harness-results/`, `out/`, `.zadum/` are git-ignored. Repo initialized but **nothing committed yet** (by request).

## Session log
- 2026-08-24 s1i (overnight, unattended per explicit user request): the whole strategic roadmap implemented in
  one pass — ADR-033 records every decision. Four parallel agents on disjoint file sets (MCP+drift / EC²+DP /
  harness+learning / web) + the conflict-heavy core (compile, orchestrator, prompts, CLI, CI) done serially.
  Shipped: contract handoff (spec-as-REFERENCE + confirm-first protocol + `sheet-tests.ts`), soft stop
  (`continueCards`), story correction step (engine+CLI+web), MCP server, drift check, simulated defaults
  reviewer + answer noise + extra-context A/B, PAV recalibration (reported-confidence only, behind env flag),
  learned-priors flag, phrasing arms, contrarian sampler (OFF pending live A/B), EC² arm (θ uncalibrated),
  subset-DP bound (greedy=optimal at H=12), CI + selector regression gate (caught its first real drift the
  hour it was born), review-position instrumentation. Live measurements the same night: recompiled perturbed
  c0/c12 bundles + 3 decision-probe runs — see EVALS "Confirm-before-building". Self-critique cycle: 3
  confirmed critiques fixed (capped confirm list dropped a 37%-confidence auth decision — live-confirmed;
  bin-level recalibration reader coarsened identity maps — code-confirmed + regression-tested; passive
  confirm wording inert for gpt-4.1 — live-measured, replaced by the confirm-first protocol and re-measured).
  280 root + 10 web tests green; harness gate byte-identical.
- 2026-08-24 s1h: second correctness review (fresh eyes over core + the uncommitted thesis/split-tier work) → 8
  findings, all fixed with regression tests; 231 → 235 tests, typecheck clean, mock demo green. Two confirmed
  bugs: (1) **undo burned Rule-7 slots** — answering auto-deals the follow-up card, and `undoLast` left it in
  `session.cards`, so the re-answer pushed its node again (repro'd: 3 entries for 1 answered question; each
  undo permanently cost a card slot and drifted `card_index`); fixed by revoking cards dealt after the undone
  answer. (2) **`add_decision_option` never reached the belief** — `belief.nodes` is fixed at planning time, so
  a patch-added option could never be shown, sampled, or defaulted, and answering with it threw; fixed with
  `syncAddedOptions` on both patch paths (user edit + "other" card answer). Minors: `modify_action` now runs
  `add_action`'s duplicate guard; `remaining_estimate`/`top` no longer count the pending card's own node;
  `diffSheets` routes transition-table-forbidden restores through `reopen` (undo across resolved→skipped no
  longer part-fails); thesis `--rescore`/`--rejudge` match probes by (gold, id) instead of bare id; anchor
  sampling uses a seeded Fisher-Yates instead of `sort(() => r()-0.5)`; `DecisionProbe.design_true` doc now
  states the control-probe convention. Mock harness re-run: same asked-node sequences, same 53% AUC — selector
  untouched, **θ needs no recalibration**.
- 2026-08-23 s1g: full correctness review of the whole codebase + a parallel creative technology survey
  (belief representation, exact tree/DP, ML-on-corpus, search, neuro-symbolic — see docs/REVIEW-2026-08-23.md).
  Ten defects found, all fixed with regression tests; 152 → 191 tests. Reviewed the "one big model trained on
  GitHub" idea and recorded why the corpus/matrix route feeds the existing engine instead (REVIEW doc §3).
- 2026-08-22 s1: concept review (3 rounds) → ADR-001…013; built milestones 0–8; 24 tests green; mock demo + mock
  harness run end to end. Live LLM untested (no credentials in the session).
- 2026-08-23 s1e: catalog-priors agent folded 106-spec mining results into 5 catalogs (61 reblended priors, 4
  new nodes, versions → 2026.08.23-1); web-latency agent measured precompute live (8%→56% hit-rate with a
  realistic pause, p90 still ~3s — needs a real fast-tier deployment); live criterion sweep (n=3, 4 arms) ran to
  completion — recalibrated ALL THREE θ defaults (ADR-022), found ordering inconclusive at this sample size;
  built external baselines (Spec Kit vendored MIT drivers + a license-clean DLAI-SDD reimplementation +
  comparison runner) via two more parallel agents, 46 new tests; first live baseline comparison in progress.
  121 tests green before the baseline work, growing with each piece.
- 2026-08-23 s1d: five parallel agents → real corpus (106 specs), stage-2 concept extraction, 4 catalogs (+79 nodes),
  Next.js web UI, learning-loop-B estimators. OpenAI-compatible adapter + provider selection; `.env` auto-load;
  FileStore atomic writes. FIRST LIVE RUN (Azure gpt-4.1) end to end; findings above → implication delta guard,
  secondary-archetype weight, action matching. 91 tests green.
- 2026-08-22 s1c: catalog miner added (1–3-grams, PMI + subsumption + fragment filters, c-TF-IDF, DF-entropy
  band → node candidates, catalog gaps, coverage checklist). 48 tests green. Real corpus still missing.
- 2026-08-22 s1b: information-theoretic selection made the default (ADR-014), two-ply lookahead added (ADR-015),
  θ turned into a replay-calibrated quantity after the sweep showed every arm capping at 12 cards (ADR-016),
  counterfactual gold variants added (ADR-017). 33 tests green; loop now converges at 3.5–7.3 cards on mock.
