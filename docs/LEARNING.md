# Learning from experience (the flywheel)

Goal: the system is measurably better after every session. Stance: **in v1 learning lives in versioned data
structures the deterministic core reads, not in model weights.** Every tunable has (a) an estimator and (b) a
human-behavior signal; every change is an experiment gated by the harness.

## Sources of truth (ranked by how true they are)
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
| B. Statistical | priors, consequence weights, θ/ε/τ, phrasings, catalog pruning | counts, bandits, replay — pure arithmetic | **estimators built** (`src/learning/`, `npm run learn`); not yet wired into the engine (harness-gated) |
| C. Semantic | catalog nodes, prompts, exemplars, archetypes | LLM proposes diffs → harness + replay must win → versioned promotion | corpus mining built (`docs/MINING.md`); proposal loop todo |

## Estimators — implemented in `src/learning/` (report: `npm run learn -- [--data-dir .zadum] [--out dir]`)
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
