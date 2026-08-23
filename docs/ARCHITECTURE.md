# Architecture

_How the system is built. Read after `docs/STATUS.md`. Product intent: `docs/SPEC.md`. Why: `docs/DECISIONS.md`._

## 1. Shape

A **deterministic state machine** that calls an LLM at fixed points. The LLM proposes (drafts, worlds, card
phrasings, patch ops, spec sections, critiques); deterministic code disposes (validates, applies, scores,
selects, stops, persists). No agent frameworks. Orchestration = one loop (cards) + two fan-outs (worlds, compile).

```
one-liner ──► drafter ──► Sheet v1 ──► planner ──► decisions (catalog ∩ applicable + bespoke)
                                                   └─► sampler ×M (parallel) ──► K worlds  ┐
                                                                                            │ belief
  correction moment: text ──► patcher ──► ops ──► commit ──► (resolutions reweight belief) ◄┘
                                                     ▼
  ┌──────────── CARD LOOP (Engine.deal / answerCard) ───────────────────────────────────────┐
  │ open = decisions with status 'open'                                                      │
  │ rank by value-of-asking over worlds (weighted_entropy | joint_entropy | risk; 1 or 2 ply) │
  │ stop if value1 < θ | cards ≥ 12 | user done      → else card = precomputed ?? generate   │
  │ answer → resolve_decision commit → hard edges (catalog) → belief reweight (ε)            │
  │        → soft crossings of τ become defaulted+implied_by → implication commit → toast    │
  │        → ESS < minEss ? resample worlds (rejuvenate) : continue → speculative precompute │
  └──────────────────────────────────────────────────────────────────────────────────────────┘
                                                     ▼
  defaults review: every non-resolved decision → defaulted(argmax P, confidence) · override = resolve
                                                     ▼
  compile: 3 waves of sections (parallel) → best-of-N (critic picks) → assemble spec.md → critic vs Sheet
           (repair loop) → round-trip (spec → Sheet' → recall) → story walkthrough → bundle
```

## 2. Modules (src/)

| Path | Role | Purity |
|---|---|---|
| `core/sheet.ts` | Zod schema of the Sheet (actors, nouns, actions, rules, non_goals, decisions) | pure |
| `core/patch.ts` | Patch ops (user-facing + system) and `applyPatch` with validation, cascades, transitions | pure |
| `core/commit.ts` | `makeCommit` (snapshot per commit), `diffSheets`/`revertOps` (undo, round-trip diff) | pure |
| `core/catalog.ts` | Catalog schema, `mergeCatalogs`, `NodeDef`, hard-edge `propagateHard` (fixpoint) | pure |
| `core/worlds.ts` | Belief = nodes + weighted worlds; `distribution` (mixed with prior α), soft/hard conditioning, ESS, repair | pure |
| `core/selector.ts` | `valueOfAsking` / `valueWithLookahead`, `rankOpen`, `decideNext` (stopping), `resolveConfig`, `impliedByUpdate`, `settledness` | pure |
| `core/session.ts` | Session/Card/Answer/Event/Project/Artifact types | types |
| `core/render.ts` | Sheet → markdown (the one page) | pure |
| `core/ids.ts` | readable ids (`n1`, `a3`), `normName` for duplicate detection | pure |
| `llm/client.ts` | `LLM` interface; `AnthropicLLM` (`messages.parse` + `zodOutputFormat`), `MockLLM`, `CachedLLM`, `parallelMap` | IO |
| `llm/prompts.ts` | All prompt texts + `PROMPTS_VERSION` | data |
| `llm/functions.ts` | The 10 structured functions + output schemas + input renderers (`sheetToText`, `nodesToText`) | IO via LLM |
| `llm/mock_fixtures.ts` | Scripted handlers playing an invoicing app (tests, `--mock` demo) | data |
| `store/store.ts` | `Store` interface | — |
| `store/file_store.ts` | `FileStore` (`.zadum/projects/<id>/…`) and `MemoryStore` | IO |
| `store/pg_store.ts` | `PgStore` + idempotent migrations (projects, commits, sessions, events, artifacts) | IO |
| `engine/catalogs.ts` | Load `catalogs/*.json`, catalog version tag, `KNOWN_ARCHETYPES` | IO |
| `engine/orchestrator.ts` | `Engine`: createProject, sampleWorlds, applyUserEdit, startCards/answerCard/undoLast, finishCards/overrideDefault/acceptDefaults, events | IO |
| `engine/compile.ts` | `compileProject`: waves, best-of-N, critic loop, round-trip report, story, bundle | IO |
| `engine/bootstrap.ts` | `buildEngine({mock, cache, dataDir})` from env/flags | IO |
| `cli/index.ts` | commander CLI (`new/show/edit/cards/defaults/override/accept/compile/history/events/projects/demo`) | IO |
| `harness/run.ts` | Simulated-user harness: recovery curves, `sweep` (criterion comparison), `thetaCurve` (θ calibration by replay) | IO |
| `harness/perturb.ts` | Counterfactual gold variants (seeded flips + hard-edge repair) | pure |
| `mining/ngrams.ts` | Corpus stats over 1–3-grams: DF/entropy band, PMI, c-TF-IDF, coverage (see `docs/MINING.md`) | pure |
| `mining/mine.ts` | Corpus loader, catalog-gap confrontation, node relevance, CLI (`npm run mine`) | IO |
| `mining/concepts.ts` | Stage 2: polarity-aware concept extraction (LLM) → option-level prior hints, new concepts (`npm run mine:concepts`) | IO via LLM |
| `mining/rule_bank.ts` / `rule_bank_schema.ts` | Stage 3: clusters extracted rules into per-archetype patterns (`npm run mine:rules`) → `catalogs/rule-bank/*.json` | IO via LLM |
| `engine/rule_bank.ts` | Loads a mined rule bank for one archetype (graceful null if unmined) | IO |
| `engine/rule_augment.ts` | Turns bank patterns + a draft Sheet into deduped `add_rule` ops via the `augmentRules` LLM fn | IO via LLM |
| `harness/judge.ts` | LLM-judge semantic recall (actors/nouns/rules/non_goals) — the fix for lexical matching's synonym-blindness (ADR-024/028) | IO via LLM |
| `core/thoroughness.ts` | `quick`/`standard`/`thorough` presets → SelectorConfig/CompileOptions overrides (ADR-029) | pure |
| `learning/*.ts` | Loop B estimators over events: population priors (shrinkage), calibration/ECE, θ replay, phrasing bandit; `npm run learn` | pure + IO loaders |
| `env.ts` | Native `.env` loading (imported by bootstrap) | IO |
| `apps/web/` | Next.js split-screen UI over the Engine via route handlers (own package.json) | IO |

## 3. Data model

**Sheet** (one JSON value, snapshot per commit): `project_id, version, one_liner, archetypes[], actors[], nouns[],
actions[] (actor id, verb, object noun id), rules[] (kind access|state|integrity|scope|other), non_goals[],
decisions[]`. Every item carries `source` provenance: `draft`, `plan`, `card:<cardId>`, `user_edit:<commitId>`,
`implied:<decisionId>`, `default`, `defaults_review`, `undo`.

**Decision** (`id` = catalog node id or bespoke `x…`): `topic, question, options[], chosen?, status, confidence?,
consequence, rationale?, implied_by?`. Status machine (enforced in `patch.ts`):
`open → resolved|implied|defaulted|delegated|skipped`; `defaulted|implied|skipped → resolved` (user wins);
`resolved → resolved` only via explicit user edit (cards never re-ask — Rule 3); any → `open` only via `reopen_decision`.

**Commit**: `id, project_id, version, parent_version, ops[], cascaded[], rejected[], source{kind,ref}, message,
created_at, sheet (full snapshot)`. Undo = new commit with `revertOps(current, target)`; history is never destroyed.

**Session** (engine belief + bookkeeping, not part of the Sheet): `phase, config (SelectorConfig), belief {nodes,
worlds, alpha}, cards[], answers[], pending_card, precomputed{nodeId→Card}, consequence_override{}, history[]
(belief snapshots for undo), resample_count, versions {catalog, prompts, models, arm}`.

**Event** (append-only, the learning substrate): `type, payload, tags {catalog, prompts, models, arm, phase}`.
Types: project_created, draft_created, plan_created, worlds_sampled, edit_applied, card_shown (value, maxP, dist,
precomputed, render_ms), card_answered (kind, option, think_ms), implications_applied (hard, soft), card_loop_stopped,
default_set, default_overridden (before/after), defaults_accepted, compile_*, critic_result, roundtrip_result.

## 4. The selector (the heart)

Belief: `K` worlds (complete assignments node→option) with weights `w` (Σw = 1). For node n,
`P_n(a) = (Σ_i w_i[world_i[n]=a] + α·prior_n(a)) / (Σ_i w_i + α)` — α (default 0.08 ≈ one virtual world) regularizes
toward the catalog prior (later: learned population prior).

**Scoring** (`SelectorConfig.scoring`) — what "uncertainty about the final spec" means. All three run over the same
particles; `weighted_entropy` is the default (ADR-014):

| scoring | `value1(n)` | notes |
|---|---|---|
| `weighted_entropy` | `cₙ·H(Pₙ)` + `[Σ_m c_m H(P_m) − Σₐ P(a)·Σ_m c_m H(P_m∣n=a)]` | information gain weighted by how much spec hangs on each decision |
| `joint_entropy` | `H(w) − Σₐ P(a)·H(w∣a)` | mutual information with world identity: "halve the possibility space"; consequence-blind, capped at log₂K |
| `risk` | `cₙ(1−max Pₙ)` + expected drop in `Σ_m c_m(1−max P_m)` | decision-theoretic; units are "expected rework" |

**Lookahead** (`lookahead: 1|2`, ADR-015). `V₂(n) = V₁(n) + γ·Σₐ P(a)·max_{m≠n} V₁(m∣n=a)` — the first two plies of
the optimal decision tree, computed over the particles with **no LLM calls** (milliseconds). Only the top
`lookaheadTop` (8) one-step candidates are deepened. Default 1; `--lookahead 2` and a sweep arm are wired.

**Ranking vs stopping are separate.** `Ranked.value` orders cards (with the lookahead term when enabled);
`Ranked.value1` is what θ is compared against, so θ means the same thing at any search depth.

**θ is an absolute price per question, calibrated by replay** (ADR-016). Values scale with how much is still open,
so a small app converges in ~3 cards and a big one needs ~9 — the intended behaviour. Never guess θ: one
equal-budget harness run logs `value1` per card and `thetaCurve()` replays what any θ would have cost and
recovered. Current defaults (mock-calibrated 2026-08-22): risk 11.5 · weighted_entropy 30 · joint_entropy 1.66.
`Ranked.share` = `value1 ÷ total remaining uncertainty` (0–1) is the scale-free diagnostic, logged on every card.

**Stopping**: `cards ≥ 12`, no open nodes, or `value1 < θ`. Ties: value desc, consequence desc, id asc (deterministic).

**Answer `n=a`**: `w_i ← w_i·(1 if world_i[n]=a else ε)` (ε = 0.05, soft because samples are noisy), renormalize.
Hard edges from the catalog (`propagateHard`) → status `implied` (confidence 1). Open nodes whose `max P` crossed
τ (0.9) → status `defaulted` with `implied_by` (shown in the toast as "likely", correctable in review).
`ESS = 1/Σw²` < `minEss` (4) → resample: new worlds conditioned on all fixed decisions, mixed 50/50 with survivors.
"You decide" sets `consequence_override[n] = 0` (drops out of the objective, never asked again).
`settledness = 1 − expectedError / Σc` over non-resolved decisions — the progress meter.

Speculative precompute: after dealing a card, for each option compute the hypothetical belief and the node that
would be asked next; generate those cards in the background (`precomputed[nodeId]`). Dealing uses them if present.
This is what makes <2s render achievable with a strong model.

Hot-path note: `nodeIndex()` in `worlds.ts` memoizes node lookup on the `nodes` array identity, since VOI search
re-creates Belief objects (`{...b, worlds}`) thousands of times per rank.

## 5. The LLM functions (all stateless, strict JSON via `messages.parse` + `zodOutputFormat`)

| fn | tier | in → out |
|---|---|---|
| `drafter` | strong | one-liner (+context, allowed archetypes) → actors, nouns, actions, rules, non_goals, archetypes, assumptions |
| `planner` | strong | Sheet + catalog nodes → not_applicable, bespoke nodes (≤8), consequence adjustments, fixed_by_sheet |
| `sampler` | strong ×M | Sheet + fixed + nodes + batch hint → m worlds (persona, weight, assignment) |
| `card` | fast | node + top-2 options + also-sets + app context → context sentence + 2 scenarios + also_sets |
| `patcher` | fast | Sheet + decisions + user text → flat ops (→ `toUserOps` → `UserPatchOp[]`) |
| `compile_<section>` | strong | Sheet + decision log + prior sections → markdown + traces (⟨src: …⟩ markers) |
| `critic` | strong | spec + Sheet → violations, omissions, score, verdict |
| `reverse` | strong | spec → Sheet' lists (round-trip) |
| `story` | strong | spec + Sheet → day-in-the-life steps + checks |
| `sim_user` | strong | card + persona + hidden truth → option / you_decide / other (harness) |

Models: `strong` = `claude-sonnet-5`, `fast` = `claude-haiku-4-5` by default (`ZADUM_MODEL_*` env). On 4.6+ models
thinking is adaptive and `effort` is set per function; temperature is only sent to models that accept it.
LLM-facing schemas use the conservative JSON-schema subset (flat objects, all fields present, enums, arrays).
The Sheet/catalog text is rendered identically for the model and for the mock, so the mock exercises real plumbing.

## 6. Compile

Waves (for consistency without serializing): [overview, data_model, actors_permissions, glossary] → [state_machines,
rules_invariants, journeys] → [acceptance_scenarios, non_goals_defaults]. Best-of-N per section (critic scores each
candidate; N=1 default). Critic on the assembled spec; on `fail`, one repair pass re-writes sections with the findings
as context. Round-trip: `reverse(spec)` → recall per list (name-normalized / Jaccard ≥ 0.5 for rules). Story
walkthrough for the user's final sanity check. Bundle: `spec.md`, `design-sheet.md` (+decision ledger),
`design-sheet.json`, `AGENTS.md` (coding-agent stanza incl. change protocol), `compile-report.json`, `story.md`.

## 7. Invariants enforced in code/tests (dogfood rules)

1. LLM never writes the Sheet → only `applyPatch` mutates (`patch.test.ts`, engine tests).
2. Every change is a commit with a snapshot (`commit.ts`; `FileStore.appendCommit` / `PgStore` append-only).
3. Resolved/implied never re-asked → only `status === 'open'` is askable (`orchestrator.test.ts` asserts no repeats).
4. No card when derivable → nodes at `max P ≥ τ` have ~0 value and are filtered by θ; test asserts `maxP < 0.9`.
5. <2s render → precompute + fast model; `card_shown.render_ms` is logged for p90 tracking.
6. Critic must pass → `compileProject` loops; phase `done` only on pass.
7. ≤12 cards → `decideNext` hard cap; test asserts.
8. No external tools → the engine imports nothing but the Anthropic SDK for LLM calls.

## 8. The rule bank (retrieval, scoped tightly)

The one place this codebase does retrieval: `Engine.createProject` runs `augmentRules` (parallel with planning)
against `catalogs/rule-bank/<primary archetype>.json` (mined offline from the corpus, `docs/MINING.md` stage 3).
The LLM only ever proposes `add_rule` text; `rule_augment.ts` dedupes deterministically (near-literal Jaccard,
0.5 threshold — a backstop, not the primary defense) before anything reaches `applyPatch`. Committed as a
`rule_bank`-sourced commit, logged as a `rules_augmented` event (patterns considered, suggested, added, deduped).
Live-validated: rules recall (LLM-judge) 0%→80% on the invoicing gold, no cost to decision recovery or latency
(docs/EVALS.md). A missing/corrupt bank is a silent no-op — this is an enhancement layer, never a dependency.

## 9. Running

```
npm test · npm run typecheck
npm run zadum -- --mock demo --out out/demo          # whole flow, no credentials
npm run zadum -- new "an invoicing app for small bookkeeping firms"   # needs ANTHROPIC_API_KEY or `ant auth login`
npm run zadum -- edit <id> "clients log into a portal"
npm run zadum -- cards <id>            # interactive; `cards <id> --auto` to auto-answer
npm run zadum -- compile <id> --out out/<id> --candidates 3
npm run zadum -- --scoring joint_entropy --lookahead 2 cards <id>   # try another selection criterion
npm run harness -- --mock --sweep --variants 3     # compare criteria + calibrate θ
npm run mine:rules -- --extractions <stage2-file>  # (re)build the rule bank from mined corpus rules
npm run harness -- --gold <g> --judge                          # LLM-judge semantic recall alongside lexical
npm run harness -- --gold <g> --rule-bank-dir <empty-dir>       # A/B the rule bank
DATABASE_URL=postgres://localhost/zadum npm run db:migrate   # Postgres instead of the file store
```
