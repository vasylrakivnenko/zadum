# Evals & the harness

The harness is CI for the elicitation engine and the gate for every improvement — not a paper.

## Degrade-and-re-elicit (the core protocol)
Take a full specification (gold) → compress to the one-liner a real user would type → hide the gold → run the
engine; an LLM **simulated user** (persona + hidden gold) answers cards only from the gold, says "you decide" when
the gold is silent → measure **consequence-weighted requirement recovery vs number of cards**.

Gold file (`src/harness/gold/*.json`): `{ id, one_liner, persona, truth (prose), decisions {nodeId: optionId},
sheet {actors[], nouns[], rules[], non_goals[]} }`. One gold → many sessions: vary one-liner vagueness, persona,
and **counterfactual perturbations** (flip 3–5 high-consequence decisions; can't be memorized).

**Gold set (as of 2026-08-23):** `invoicing-bookkeeping` (b2b-invoicing), `booking-salon` (booking),
`marketplace-services` (marketplace) — each with every core+archetype node assigned (49 decisions apiece),
zero `perturbGold` conflicts verified across multiple seeds, and `one_liner_variants`/`persona_variants` for
robustness sweeps. `loadGolds()` does not sort — never assume array order; select by `id` when a test needs a
specific one (see `harness.test.ts`'s `loadInvoicingGold()` for the pattern, needed because
`invoicingMockHandlers` only drafts sensibly for an invoicing one-liner). Booking/marketplace are real gold
data but have not yet been run against a LIVE model — the sweep and baseline results elsewhere in this doc are
invoicing-only; re-run both with `--gold src/harness/gold` (all three) once ready to spend the calls.

## Metrics (`src/harness/run.ts`)
- `recovery_curve[k]`: after k cards, Σ c_n·[value_n == gold_n] / Σ c_n over gold decisions present in the session
  (value = chosen if settled else argmax P). North star = mean curve / AUC over 0..12 cards; final recovery.
- `cards`, `stop_reason`, `settledness`.
- `draft_recall` for actors/nouns/rules vs the gold sheet (name-normalized; Jaccard for rules).
- `calibration`: (confidence, correct) pairs for defaulted decisions → reliability bins.
- `you_decide` / `other` rates; `card_render_ms` (p90 latency).
- Compile metrics (separately): critic verdict/score, round-trip recall, planted-violation catch rate.

Baselines to add: raw one-liner → coding agent; "ask me clarifying questions" chat; a Spec-Kit/Kiro-style interview.
Downstream (DevBench-style where tests exist): build from our spec vs from the raw prompt → pass rate, rule
violations, tokens, iterations. The A/B thesis test (Sheet vs no Sheet; ask for a rule-violating feature) is fully
runnable offline and should run early.

## Hygiene
- Different model families for sampler/system, simulated user, and judge where feasible.
- Anonymize gold sources (rename), use perturbed variants to defeat memorization.
- Hold out specs and whole archetypes; never tune on the test split.
- Track sim-to-real gap against the first 10 human sessions (survivorship bias: mature products are richer than
  what small businesses want → priors skew toward over-asking).
- Define "better than baseline" in advance (e.g., ≥90% weighted recovery in ≤6 cards vs chat needing ≥12).

## Sources for gold (to verify/collect)
DevBench (PRDs + tests), PURE (public requirements docs), Dalpiaz user-story sets, PROMISE NFR, docs of
well-documented open-source apps (Invoice Ninja, Cal.com, Ghost, Discourse, Medusa, Twenty, Plane, Formbricks),
public Spec-Kit/Kiro `specs/` folders, category feature-comparison tables (catalog seeds). Plus manufactured gold
from a different model family, judge + spot-checked.

## The selection-criterion experiment (`--sweep`)

Ordering and stopping are measured **separately**, because a criterion that asks better questions and a criterion
that stops at the right moment are different claims:

1. **Ordering, at equal question budget.** Every arm runs with θ disabled and a fixed cap (default 12), so all arms
   spend the same number of cards; we compare recovery@1/3/5/8/12 and the AUC. This isolates "which question first".
2. **Stopping, at each arm's own θ.** Cards spent vs recovered.
3. **θ calibration, for free.** The equal-budget run logs `value1` per card, so `thetaCurve()` replays what *any*
   θ would have done (exact — the loop is deterministic, and the prefix before a stop is unchanged). The sweep
   prints θ → mean cards → mean recovery and names the best θ inside the 3–9 card band. Recalibrate whenever the
   catalog changes materially; copy the result into `DEFAULT_THETA`.

```
npm run harness -- --mock --sweep --variants 3 --flips 3     # plumbing, no credentials
npm run harness -- --sweep --variants 3                      # live (uses the LLM disk cache)
npm run harness -- --scoring joint_entropy --lookahead 2     # single arm
```

Arms: `weighted_entropy` (default), `joint_entropy`, `risk`, `weighted_entropy+2ply`.

### Live sweep results, 2026-08-23 (Azure OpenAI gpt-4.1, n=3: invoicing gold + 2 counterfactual variants)
Real evidence, small sample — read the honest caveat after the table before drawing conclusions.

**ORDERING (equal budget, θ disabled, 12 cards every arm):**

| arm | r@1 | r@3 | r@5 | r@8 | r@12 | AUC |
|---|---|---|---|---|---|---|
| weighted_entropy | 65% | 65% | 63% | 74% | 76% | 67% |
| joint_entropy | 67% | 62% | 66% | 67% | 66% | 66% |
| risk | 64% | 66% | 67% | 67% | 63% | 66% |
| weighted_entropy+2ply | 66% | 67% | 64% | 67% | 66% | 66% |

**Finding: all four criteria are statistically indistinguishable here** (66–67% AUC, ~1pp apart) — well within
what n=3 sessions of LLM-call noise can produce. This is neither a win nor a loss for the founder's
information-theoretic hypothesis (ADR-002/014) or the risk-based alternative: it means the gold set is too thin
to separate them yet. Needs more archetypes and more counterfactual variants before treating any ranking here
as real. Recorded honestly rather than picking a "winner" from noise.

**STOPPING (each arm at its shipped θ at the time of this run — since superseded, see below) and θ CALIBRATION
(replayed from the same equal-budget runs — exact, no extra LLM calls):**

| arm | best θ (3–9 card band) | → cards | → recovered | mock-derived θ it replaces |
|---|---|---|---|---|
| risk | 6.6 | 8.3 | 69% | 14 (too high — stopped at 1.7 cards live) |
| weighted_entropy | 24.4 | 4.3 | 68% | 10 (too low — ran to the 12-card cap for only +8pp recovery past card 4) |
| joint_entropy | 1.25 | 7.7 | 68% | 1.5 (too high — stopped at 2.3 cards live) |
| weighted_entropy+2ply | ~32 (own calibration needed — see ADR) | 3.0 | 67% | shares weighted_entropy's θ by default; under-stops when used, since lookahead adds a bonus term absent from the `value1` θ is compared against |

`DEFAULT_THETA` in `src/core/selector.ts` now ships these values (risk 7, weighted_entropy 24, joint_entropy
1.25, rounded). Every mock-derived default before this run was wrong in some direction — confirms ADR-016's
point that θ is an absolute quantity tied to the actual belief concentration, never safe to guess.

### Mock-run results, 2026-08-22 (plumbing only — NOT evidence about the real system)
n = 4 (1 gold + 3 counterfactual variants), mock LLM, catalog core+b2b-invoicing @2026.08.22-1.

| arm | r@1 | r@3 | r@5 | r@8 | AUC | cards @own θ | final |
|---|---|---|---|---|---|---|---|
| weighted_entropy | 44% | 44% | 43% | 50% | 49% | 7.3 | 53% |
| joint_entropy | 43% | 46% | 47% | 59% | 51% | 3.5 | 49% |
| risk | 46% | 40% | 48% | 63% | 54% | 4.8 | 52% |
| weighted_entropy+2ply | 45% | **51%** | **52%** | 56% | 52% | 5.0 | 49% |

Read this as "the machinery works and the arms differ", nothing more: the mock's world sampler is deliberately
diffuse and its simulated user answers perfectly from the gold, so absolute recovery is meaningless and the
ordering between arms is not transferable. The one durable finding is that θ had been guessed two orders of
magnitude too low (ADR-016). Re-run this table as the first live experiment.

## Web UI live latency (2026-08-23, Azure gpt-4.1, `apps/web`, 8s simulated think-time between deal and answer)
CLI baseline used a 0ms simulated user (no time for background precompute); the web UI test added a realistic
8s pause before each answer to see whether speculative precompute (docs/ARCHITECTURE.md §4) actually helps:
- precomputed hit-rate: **8% (CLI, 0ms pause) → 56% (web, 8s pause)** — precompute works when there is time for it.
- render_ms: precomputed hits ≈2-4ms; misses ≈1.8-3.6s (a full `generateCard` call). p50 dropped to ~4ms; **p90
  stayed ~3s** because misses still cost a full round-trip.
- Root cause p90 doesn't clear the <2s target (CLAUDE.md Rule 5): `.env` sets no `ZADUM_MODEL_FAST`, so BOTH
  tiers resolve to the same `gpt-4.1` Azure deployment (the only one that exists on this endpoint) — there is no
  fast tier for a miss to fall back to cheaply. The architecture is doing its job; the deployment isn't providing
  a fast model yet. Action: get/deploy a smaller Azure model (e.g. gpt-4.1-mini/nano) for `ZADUM_MODEL_FAST` and
  re-measure, or accept ~3s p90 as this provider's floor until then.
- Compile: critic 10/10, round-trip 80.8%, 68.7s — consistent with the CLI run.

## Rule bank + LLM-judge metric: the night's headline result (2026-08-23, Azure gpt-4.1, invoicing gold)

**The problem this answers**: every system in "Baseline comparison across archetypes" above scored 0% rules
recall on every gold — nothing elicits rules, they're pure drafter luck. **The fix**: retrieval from the corpus
already collected (`src/mining/rule_bank.ts` clusters stage-2-extracted rules into per-archetype patterns;
`src/engine/rule_augment.ts` suggests missing ones at draft time, deduped, as `add_rule` ops — ADR-027).
**The complication**: the existing lexical rules-recall metric couldn't see the improvement at all (0%→0%),
because the drafted rule text is phrased more fully than the terse gold rule and shares too few raw tokens —
exactly ADR-024's synonym-blindness, now caught live rather than staying theoretical. **The real fix**: an
LLM-judge semantic recall metric (`src/harness/judge.ts`, ADR-028) that asks "does any produced item mean the
same thing" instead of counting shared words.

| | draft_recall (lexical) | semantic_draft_recall (LLM-judge) |
|---|---|---|
| rules, without rule bank | 0% | 0% |
| rules, WITH rule bank | 0% | **80%** (4 of 5 gold rules matched) |
| nouns, without rule bank (baseline, unaffected by the rule bank) | 29% | 57% |

Read two findings here, not one: (1) the rule bank works — 0%→80% on the metric actually capable of seeing it,
with no cost to decision-level `recovery` (68–74% either way) and no added latency (parallel LLM call). (2) the
lexical metric undercounts even ordinary, unrelated draft quality (nouns 29% vs 57% with NO rule-bank
involvement) — every lexical number anywhere in this document should be read as a lower bound, sometimes a
substantially wrong one, per ADR-024/028. One added rule was the gold's exact intended invariant ("invoice
numbers must be unique and assigned in a sequential manner" for the gold's "Invoice numbers are sequential with
no gaps"). One live quality nit: a suggested cross-firm data-isolation rule assumed multi-tenancy the Sheet
didn't explicitly state — not wrong, a scope-fit nuance for a future prompt pass, not a blocker.

The rule bank ships as the default (not experimental) given this evidence; `--rule-bank-dir <empty>` and
`--judge` in the harness CLI reproduce this A/B for any gold or after any prompt/catalog change.

**Second archetype, same night**: `booking-salon` — judge rules recall **17% → 33%** (without → with the rule
bank), decision recovery 77%→69% final (a run-to-run swing that is NOT causally the rule bank's doing: `recovery()`
never reads `sheet.rules`, and this gold's own two single-sample runs show enough natural draft/world variance
— initial recovery 76% vs 57% — to explain it without invoking the new feature). **Read this as directionally
consistent, not precisely replicated**: the improvement is real and positive on a second archetype, but its
SIZE varies (invoicing 0%→80%, booking 17%→33%) and n=1-per-arm cannot pin down how much of that size difference
is the archetype vs. plain sampling noise. Proper confidence needs `--variants` reruns per archetype (not yet
supported in the harness's rule-bank A/B path) before citing an exact number beyond "positive, both archetypes".

## Criterion sweep confirmed across archetypes (2026-08-23, Azure gpt-4.1, n=3: invoicing/booking/marketplace,
one real gold each — not perturbation variants of one gold; supersedes the n=3-same-gold sweep in ADR-022)

**ORDERING**: weighted_entropy 71%, joint_entropy 72%, risk 72%, weighted_entropy+2ply 72% AUC — still within
1pp of each other. This is now a STRONGER form of "inconclusive": the earlier n=3 was one gold's LLM noise
across counterfactual variants; this is three genuinely different apps agreeing that no scoring criterion
dominates. Read as an actual finding, not a sample-size excuse: for this catalog and these archetypes, WHICH
question-selection criterion is used matters much less than other levers (catalog quality, drafter quality,
implication propagation) — which is part of why tonight's improvement work targets the drafter/rule stage
rather than the selector further.

**STOPPING/CALIBRATION confirms every shipped θ**: `weighted_entropy` (24) lands 4.7 cards/74% vs its own
best-band pick 27.5→74%; `risk` (7) lands ~5.3 cards/73% vs its own best-band pick 7.0→73% — essentially exact;
`joint_entropy` (1.25) lands ~5.2 cards/70% vs its own best-band pick 1.3→70%. All three ADR-022 values are
independently confirmed by a genuinely different sample, not just reproduced on the same gold. No retuning
needed this round.

## Baseline comparison across archetypes (2026-08-23, Azure OpenAI gpt-4.1, n=3 archetypes: invoicing/booking/
marketplace, `npm run baselines -- --gold src/harness/gold`) — supersedes the n=1 result below

| gold | system | questions | recovery |
|---|---|---|---|
| booking-salon | **our engine** | 3 | **70%** |
| | Spec Kit | 7 | 54% |
| | DLAI-SDD | 3 | 59% |
| invoicing-bookkeeping | **our engine** | 7 | **70%** |
| | Spec Kit | 6 | 54% |
| | DLAI-SDD | 3 | 55% |
| marketplace-services | **our engine** | 6 | **78%** |
| | Spec Kit | 8 | 74% |
| | DLAI-SDD | 3 | 61% |

**Our engine wins recovery on all three archetypes** (mean 72.7% vs Spec Kit 60.7% vs DLAI-SDD 58.3%), and on
two of three (booking, marketplace) with fewer or equal questions than Spec Kit. The booking result is the
cleanest single comparison in the whole document: **same question budget (3, matching DLAI-SDD exactly), 70%
vs 59% recovery** — a genuine apples-to-apples win, not confounded by asking more. This is a real, repeated-
across-archetypes signal, not n=1 noise — though "n=3 archetypes, one gold each" is still a small sample; the
next honest step is more golds per archetype (paraphrase/perturbation variants) before calling this settled.

**Token cost confirmed systematic, not a fluke**: Spec Kit used 90–105× DLAI-SDD's input tokens on every single
gold (61k–67k vs 676–690), because the ratio is dominated by resending its fixed 636-line command templates
every call regardless of content — a stable, tool-level cost property, not something that varies with the app.

**A second matching-metric limitation, beyond the rules-recall one already documented below**: actor/noun
recall swings wildly (0–100%) across systems and golds not because of real quality differences but because
`normName` (singular/plural only) has no synonym handling. Inspecting the actual output: gold "Homeowner" vs
our "Customer", gold "Service provider" vs Spec Kit's "Pro", gold "Platform admin" vs "Admin" — all clearly
correct to a human reviewer, all scored as complete misses. Invoicing scores artificially high (100% actors)
only because that gold's author happened to pick the same canonical nouns ("Bookkeeper", "Client") every
system converged on — not because any system does better at invoicing specifically. **Treat every actor/noun/
rule recall number in this document as a lower bound possibly hiding synonym matches, and treat `recovery`
(closed-set decision ids, no synonym ambiguity possible) as the trustworthy metric of the two.** An embedding-
or LLM-judge-based match (already planned for rule quality) would fix this for actors/nouns too.

## First live baseline comparison (2026-08-23, Azure OpenAI gpt-4.1, n=1: invoicing gold, `npm run baselines`)

| system | questions asked | recovery | actors | nouns | rules | input tokens | calls |
|---|---|---|---|---|---|---|---|
| **our engine** | 7 cards | **70%** | 100% | 29% | 0% | (see harness cost) | — |
| Spec Kit (vendored, real templates) | 6 | 54% | 0% | 29% | 0% | 64,124 | 12 |
| DLAI-SDD (reimplemented protocol) | 3 | 55% | 33% | 14% | 0% | 680 | 2 |

Read every number here as n=1 — a demonstration that the comparison machinery works end to end on real tools,
not yet a verdict. Two findings look real rather than noise, and one column is misleading as-is:

- **Recovery favors asking more, proportionately.** Our engine spent the most questions (7) and recovered the
  most (70%); Spec Kit and DLAI-SDD landed within 1pp of each other (54%/55%) despite DLAI asking half as many
  questions as Spec Kit (3 vs 6) — DLAI's fixed, well-chosen 3-question interview was as effective per this
  metric as Spec Kit's adaptive up-to-8. Encouraging for the "fixed but well-designed beats adaptive-but-generic"
  possibility, but n=1 cannot support that conclusion — it needs the full gold set + counterfactual variants.
- **Real, large cost difference: Spec Kit is ~94× more input tokens than DLAI-SDD for this one comparison**
  (64,124 vs 680), because it resends its full real command templates (`specify.md` + `clarify.md`, 636 lines)
  on every one of its 12 calls, with no prompt-caching wired into the driver. This is a genuine operational
  distinction between the two tools — worth reporting as-is, not an artifact of our harness.
- **Rules recall (0% for all three systems, ours included) is a harsh, narrow metric here, not a sign anything
  is broken.** Inspecting the actual text: none of the three wrote any of the gold author's 5 specific rules
  ("invoice numbers are sequential", "a client never sees another client's invoice", …) — but all three wrote
  *different, individually reasonable* rules a real reviewer might accept (our engine: "a payment cannot exceed
  its linked invoice amount"; Spec Kit: "invoices can be edited or voided only before they are marked as paid";
  DLAI-SDD: "if required info is missing, invoice can't be sent"). Exact/fuzzy-match recall of one author's
  specific rule text is the wrong instrument for measuring rule *quality* from a bare one-liner with no rule
  hints given to any system — an LLM-judge pass ("would a domain expert accept this rule set as adequate?",
  already planned in Metrics below) is the fair way to score this column; until that exists, don't read 0% here
  as "our rules were bad", read it as "this metric can't see rule quality, only exact overlap".
- Fairness note already applied: our engine's actor/noun/rule numbers are from the **final** sheet (post-cards),
  not the initial draft — see docs/BASELINES.md for why that distinction mattered and was fixed before this run.

## First live results (2026-08-23, Azure OpenAI gpt-4.1, invoicing one-liner, no gold → no recovery numbers)
- Equal-budget session (`--theta 0`, 12 cards): value1 60, 23, 14, 31, 12, 30, 13, 22, 9, 7, 9, 6; share 0.17–0.45;
  settledness 0.86 → 0.92; ESS stayed ~10 across 3 rejuvenating resamples (12 → 17 worlds).
  θ → cards: 5:12 · 8:9 · 10:8 · 12:8 · 15:2 · 20:2 · 25+:1. `DEFAULT_THETA.weighted_entropy` set to 10.
- Soft implications with the stricter bar (p≥0.95, rise≥0.10): 7, 1, 1, 4, 1, 2 per answering card (was 15–23).
- Card render: p50 3.1s, p90 3.6s — with gpt-4.1 as BOTH tiers and a 0-ms simulated user, precompute rarely
  finishes in time (1 hit in 12). With a real user thinking 5–15s and a true fast-tier model it should be mostly
  precomputed; measure in the web UI.
- Compile: critic 10/10; round-trip 92% after the action-matching fix; 69s; ~112k input tokens.
- Selection: 4/12 cards were generic crud-saas nodes even at 0.5 weight (the drafter tagged crud-saas as a
  secondary archetype) — whether they are worth asking is a harness question (needs a gold with those nodes).

## Calibrating θ
`--sweep` → "STOPPING RULE CALIBRATION". Pick the θ inside the target card band with the highest recovery, put it
in `DEFAULT_THETA`, note the catalog version in the comment. Never hand-guess θ: its units depend on the scoring
AND on how much the catalog leaves open.

## Running
`npm run harness -- --mock` (plumbing, no credentials) · `npm run harness -- --gold src/harness/gold --variants 3`
Results: `harness-results/<timestamp>.json` + a summary table on stdout.

## Thesis test — does the bundle change what a coding agent DOES? (2026-08-23, first run)

Every other number in this document measures whether the Sheet *captures* the truth. This one measures the
product claim itself: that a coding agent handed the bundle refuses a rule-violating change and cites the rule.
Harness: `src/thesis/` · `npm run thesis`.

**Method.** One live-compiled bundle (`out/live/bundle`, invoicing Design Sheet v7, Azure gpt-4.1). Eight probes
written as a founder would phrase them — four colliding with a Rule, two with the Not-yet list, two entirely
benign. Five arms differing ONLY in the documentation the agent is given; the agent system prompt is identical
everywhere and says nothing about rules, scope or pushing back. A blind judge (no arm, no context, no expected
answer) reports what the agent did; scoring happens in code afterwards. 8 probes × 5 arms × 3 repeats = **120
agent+judge pairs**, 304s.

Three guards against a rigged result: probes never mention rules/scope/refusal (asserted in
`thesis.test.ts`), the controls are *comparable artifacts* (Spec Kit and DLAI-SDD specs for the same app) rather
than "no context", and the benign probes score in the opposite direction so an agent that refuses everything
loses (also asserted in the tests).

| arm | context | appropriate | flagged | w/ citation | over-refusal |
|---|---|---|---|---|---|
| `none` (one-liner only) | 0 chars | 25% | 0% | 0% | 0% |
| `spec-kit` | 5.9k | 42% | 22% | 11% | 0% |
| `dlai-sdd` | 3.9k | 46% | 28% | 17% | 0% |
| `sheet_no_agents` (Sheet+spec, no AGENTS.md) | 52k | 75% | 67% | 67% | 0% |
| **`sheet` (full bundle)** | 53k | **92%** | **89%** | **89%** | **0%** |

By probe kind (share handled appropriately): `sheet` 83% rule · 100% scope · 100% benign; best baseline
(`dlai-sdd`) 17% · 50% · 100%; `none` 0% · 0% · 100%.

**Findings.**
1. **The thesis holds on this gold.** The bare one-liner arm flagged **0 of 18** rule/scope probes across three
   repeats — it cheerfully designed overpayment recording, client-editable invoices, one-click "mark paid",
   and automated recurring billing. The full bundle flagged 89% and cited a specific rule id or non-goal in
   89% of cases (`R-4`, `r1`, `R-5`, `R-2`, `g1`, `g4`) — demo moment #4 is real, not aspirational.
2. **It is not just "more context".** Comparable specs from two competing tools land at 42–46%, roughly halfway
   between nothing and our bundle. The gap is what the Sheet's *explicit Rules and Not-yet lists* add over
   ordinary prose specs.
3. **It is not just the AGENTS.md nag.** Dropping AGENTS.md and keeping the Sheet still scores 75% — so the
   artifact does most of the work (+29pp over the best baseline) and the instruction adds the rest (+17pp).
   That decomposition is the answer to the obvious objection, and it is why `sheet_no_agents` exists.
4. **Per-probe structure is informative.** `s2_card_payments` (pay by card) was caught by every arm with any
   spec at all — payment processing is an obvious scope boundary that all tools write down. `v1_overpayment`
   (payment exceeding the invoice) was caught **only** by the full bundle, 3/3, and by nothing else, 0/12 —
   it needs the invariant to be written down as an invariant, which is exactly what the Rules list is for.
5. **No over-refusal.** Zero benign tasks were blocked in any arm. One `sheet` trial built the benign payment
   task while noting the payment-cannot-exceed-invoice invariant — correct behaviour, reported separately as
   `caveat` (17% of benign trials in that arm), not as a failure. The first scoring pass counted any raised
   constraint on a benign probe as over-refusal and reported 17%; the rubric was corrected to count only
   *blocking or diverting*, and re-scored offline via `--rescore` without spending an LLM call.

### Multi-model (built 2026-08-23; blocked on one credential)

The biggest weakness of the run above is that gpt-4.1 played both the coding agent and the judge. Two things
now exist to fix it:

- **`src/llm/registry.ts`** — a model id routes to whichever endpoint serves it: `gpt-4.1` (original Azure
  resource), `gpt-4o` / `Kimi-K2.5` (Azure AI Foundry, OpenAI-compatible), `claude-opus-4-8` /
  `claude-sonnet-4-6` (Foundry's `/anthropic` route), `claude-sonnet-5` / `claude-opus-5` (Anthropic direct).
- **`src/llm/anthropic_foundry.ts`** — Anthropic Messages over a custom endpoint. It gets strict JSON through
  **forced tool use** rather than first-party structured outputs, because a Foundry-hosted deployment does not
  necessarily expose `output_config`. Same ADR-011 schema subset, so no schema work was needed.

`npm run models` reports which deployments are configured and sends each a real structured request — a pass
means the schema plumbing works for that model, not just that the endpoint answers.

The thesis harness now crosses **agent models × arms**, with one independent judge for every trial, and prints
a pooled table (does the bundle help regardless of which model reads it?) alongside the per-model breakdown.
It warns when the judge is also an agent.

### Multi-model results (2026-08-23, 480 trials, judged by Claude Opus 4.8)

4 agent models × 5 arms × 8 probes × 3 repeats. No model grades its own work.

**Pooled across all four agent models** (n=96 per arm):

| arm | appropriate | flagged | w/ citation | over-refusal |
|---|---|---|---|---|
| `none` (one-liner) | 25% | **0%** | 0% | 0% |
| `spec-kit` | 40% | 19% | 17% | 0% |
| `dlai-sdd` | 47% | 29% | 19% | 0% |
| `sheet_no_agents` | 76% | 68% | 65% | 0% |
| **`sheet`** | **91%** | **88%** | **88%** | **0%** |

**Per agent model** (share handled appropriately):

| agent | none | spec-kit | dlai-sdd | sheet_no_agents | sheet |
|---|---|---|---|---|---|
| gpt-4.1 | 25% | 38% | 46% | 79% | **100%** |
| gpt-4o | 25% | 25% | 38% | 29% | **62%** |
| Kimi K2.5 | 25% | 50% | 54% | 96% | **100%** |
| Claude Sonnet 4.6 | 25% | 46% | 50% | 100% | **100%** |

**Per probe, conflict-raised rate** (rule/scope probes, 12 trials per cell):

| probe | none | spec-kit | dlai-sdd | sheet_no_agents | sheet |
|---|---|---|---|---|---|
| v1 overpayment (r4) | 0/12 | 0/12 | 0/12 | 7/12 | 11/12 |
| v2 client edits (r1+g2) | 0/12 | 2/12 | 8/12 | 9/12 | 10/12 |
| v3 quick close (r5) | 0/12 | 4/12 | 1/12 | 9/12 | 10/12 |
| v4 flat fee (r2) | 0/12 | 0/12 | 0/12 | 6/12 | 10/12 |
| s1 recurring (g4) | 0/12 | 0/12 | 1/12 | 10/12 | 11/12 |
| s2 card payments (g1) | 0/12 | 8/12 | 11/12 | 8/12 | 11/12 |

**Findings.**
1. **The result survives an independent judge and three additional model families.** With Opus 4.8 judging,
   the pooled ordering is unchanged and the gaps widen slightly against the baselines.
2. **The one-liner arm flagged 0 of 72 rule/scope probes** — every model, every repeat, without exception. The
   floor is not model-specific.
3. **Direction is universal; magnitude is not.** Every model improves monotonically from `none` → baselines →
   `sheet`, but gpt-4o gains far less (62% vs 100% for the other three) and is the one model that barely uses
   the Sheet without AGENTS.md (29%, *below* its dlai-sdd score of 38%). Weaker instruction-following models
   need the explicit protocol file; stronger ones extract the constraints from the artifact itself. That is a
   product finding — AGENTS.md is not redundant scaffolding, it is what makes the bundle robust across agents.
4. **Two probes separate the Sheet from prose specs completely.** `v1_overpayment` and `v4_flat_fee` were
   caught **0/36 times** by the one-liner and both competing specs, and 10-11/12 by the full bundle. Both are
   integrity invariants ("a payment cannot exceed its invoice", "an invoice must cite a service entry") —
   exactly the class of requirement prose specs omit and a Rules list forces into existence.
5. **Zero over-refusals in 120 benign trials**, across every arm and model. The controls did their job: the
   gains are not bought with paranoia.
6. Citations are specific and varied: `r4, D-1`, `Rule r1 and Defaulted Decision g2`, `Rule R-5 and Derived
   Invariant D-1`, `g4 / recurring_invoices=no`, `Acceptance Scenario 3` — agents cite Sheet rules, non-goals,
   decision ids, and compiled-spec sections.

The command that produced this:

```
npm run thesis -- --agent-models gpt-4.1,gpt-4o,Kimi-K2.5,claude-sonnet-4-6                   --judge-model claude-opus-4-8 --repeats 3 --concurrency 2                   --baseline-spec thesis-results/baseline-spec-kit.md,thesis-results/baseline-dlai-sdd.md
```
4 agents × 5 arms × 8 probes × 3 repeats = 480 pairs. `--rescore` re-scores stored trials for free.

**Status: all five deployments verified working** (`npm run models`): gpt-4.1, gpt-4o, Kimi K2.5,
Claude Opus 4.8, Claude Sonnet 4.6 — each answering a real structured request.

Two things cost a cycle getting here and are worth remembering:
- **The Foundry resource key is a different credential from `AZURE_API_KEY`** — Azure issues keys per resource,
  not per subscription. With the wrong key every auth variant returns 401 "invalid subscription key or wrong
  API endpoint", which reads like an endpoint bug. The tell that the route was right and the credential wrong:
  `/anthropic/messages` → 404 but `/anthropic/v1/messages` → 401 (i.e. it reached the auth layer). The correct
  key was already in `.env` as `LLM2_API_KEY`; the registry accepts that name and `FOUNDRY_API_KEY`.
- **Kimi K2.5 is a reasoning deployment**: `reasoning_content` counts against the completion budget, so it
  returned `finish_reason: "length"` with empty content at 200 tokens and passed at 4096. Handled by a
  per-deployment `minCompletionTokens` floor in the route table (ADR-031), not by every call site.

**Honest limits.** One gold, one archetype, one model (gpt-4.1 as both agent and judge — same family judging
itself; the multi-model path above is the fix, pending that key), n=3 repeats, and a judge not yet validated against human labels (ADR-028's gap applies here too).
The `sheet` arm also carries ~9× more context than the baselines, which is a real property of the product but
not a controlled variable. Before treating the 92% as a headline: re-run on booking and marketplace, with a
different model family as judge, and ideally with a length-matched control (Sheet rules only, no compiled spec).
`--rescore` makes rubric changes free; only new arms/golds cost calls.

### Three apps × four agent models, judged independently (2026-08-24)

The two follow-ups the previous runs called for, done: **all three archetypes** (each with its own
live-compiled bundle and its own competing specs) and **Claude Opus 4.8 as an agent**, with **gpt-4.1 as judge**
so no model grades its own work. 3 apps × 5 arms × 8 probes × 4 agents = **480 trials, 0 errored**
(`thesis-results/2026-08-24T00-18-50-121Z.json`).

**Appropriate-response rate, pooled over all three apps:**

| agent | none | spec-kit | dlai-sdd | sheet_no_agents | sheet |
|---|---|---|---|---|---|
| gpt-4o | 25% | 29% | 29% | 29% | 54% |
| Kimi K2.5 | 25% | 33% | 38% | 88% | 96% |
| Claude Sonnet 4.6 | 25% | 54% | 58% | 96% | 96% |
| **Claude Opus 4.8** | 29% | 67% | 79% | 96% | **100%** |
| **all pooled** | **26%** | **46%** | **51%** | **77%** | **86%** |

**By app** (pooled over models): invoicing 25 / 47 / 50 / 78 / **88**; booking 28 / 50 / 47 / 72 / **81**;
marketplace 25 / 41 / 56 / 81 / **91**. The ordering is identical in all three domains.

**Opus only** (n=24 per arm) — the "does a better model close the gap?" question:

| arm | appropriate | flagged | cited a source |
|---|---|---|---|
| one-liner | 29% | 6% | 0% |
| Spec Kit | 67% | 56% | 33% |
| DLAI-SDD | 79% | 78% | 39% |
| Sheet without AGENTS.md | 96% | 94% | 94% |
| **full bundle** | **100%** | **100%** | **100%** |

**Findings.**
1. **A stronger agent does not close the gap; it widens the useful part of it.** Opus is the best model in the
   set on every arm — and still misses a third of the violations on a Spec Kit spec (67%) while scoring 100%
   on the bundle. Capability raises the floor; the artifact is what gets you the last third. The eight probes
   Opus missed on Spec Kit but caught on the bundle are the concrete evidence, and it cited `R-4`, `r10`,
   `R-3`, `g1`, `g3` etc. on each.
2. **Citation rate is the sharper separator than the flag rate.** Opus flags 56-78% with a competing spec but
   can only *cite* a specific source 33-39% of the time — it senses something is off and argues from judgment.
   With the bundle it cites 100%. "Cannot do that, rule r10 says so" is a different conversation from
   "hmm, that feels wrong".
3. **The result holds across three domains and four model families**, including a non-Western one (Kimi), with
   an independent judge. The one-liner arm sits at 25-29% everywhere: it never flags anything, and only scores
   at all because the benign probes are correctly built.
4. **AGENTS.md matters most exactly where the model is weakest** — gpt-4o gains +25pp from it (29% → 54%),
   Opus +4pp (96% → 100%). Confirms the earlier single-app finding on a much wider sample.
5. **One over-refusal in 120 benign trials, and it belonged to a baseline, not to us**: Opus reading the
   *DLAI-SDD* spec refused to add an overdue-invoice filter, claiming payment status was out of scope. A
   thin spec can mislead as well as under-inform.

**Still open.** n=1 repeat per cell (the earlier invoicing run did n=3 and agreed), the judge is unvalidated
against human labels (ADR-028), and the bundle carries ~10× the context of the baselines — a real property of
the product, not a controlled variable. A length-matched control (Sheet rules only, no compiled spec) is the
honest next step.

### Controls run: length-matched, falsification, and a widened matrix (2026-08-24, 672 trials)

The two controls the previous run said it needed, plus everything at once: 3 apps × **7 arms** × 8 probes ×
4 agent models, gpt-4.1 judging (independent of every agent). 671/672 trials completed (one gpt-4o 429 past
its retries — contained, excluded, counted). New arms:

- **`sheet_only`** — the one-page Design Sheet alone, 8–10k chars, the same size class as the baseline specs.
  The length-matched control the earlier runs lacked.
- **`sheet_mismatched`** — the full bundle of a DIFFERENT app (cyclic across the three golds). Falsification:
  if agents flag violations with the wrong rules in hand, the effect would be generic caution, not content.

**Pooled headline** (671 trials):

| metric | none | spec-kit | dlai-sdd | **sheet_only** | sheet_no_agents | **sheet** | mismatched |
|---|---|---|---|---|---|---|---|
| appropriate | 26% | 45% | 54% | **74%** | 70% | **86%** | 65% |
| flagged (violation probes) | 1% | 28% | 39% | 67% | 62% | **85%** | 56% |
| flagged **with citation** | 0% | 14% | 26% | **64%** | 60% | **85%** | 56% |
| over-refusal (benign) | 0% | 4% | 0% | 0% | 0% | 8%* | 4% |

**Findings.**
1. **The length objection is closed.** At comparable size, the one page scores 74% vs Spec Kit's 45% and
   DLAI-SDD's 54% — and cites specific sources 64% vs their 14–26%. Content, not volume. More striking:
   `sheet_only` (8–10k chars) ≈ `sheet_no_agents` (52–67k chars) — **the 45k chars of compiled spec add
   roughly nothing to agent *conduct***. The conduct value lives in the one page; the compiled spec's value is
   implementation detail (data model, scenarios), not rule-following. Direct product implication worth its own
   experiment: a `sheet_only + AGENTS.md` arm (~9k chars) might match the full bundle at 1/6 the context.
2. **The falsification control reads as a natural experiment, not a simple pass/fail.** Mismatched-bundle flag
   rate is 56% — high — but inspection shows why: the three apps SHARE archetype-typical constraints (every
   one bans in-app payments in v1, restricts client edits, defers automation), and agents flagged by citing
   the *donor bundle's own rule ids* (booking's `g2` against the invoicing pay-by-card probe). Those are
   genuinely applicable rules from the "wrong" document — correct behaviour. The clean cell is
   `v1_overpayment`, whose integrity invariant has NO analogue in the donor bundle: **0/4 flagged mismatched
   vs 3/4 with the correct bundle**. Agents flag exactly when the text in front of them contains an applicable
   constraint — they read the rules; they don't pattern-match "rules exist, be cautious". Mismatched
   over-refusal stayed at 4%, so wrong docs did not induce paranoia either.
3. **The gpt-4o profile sharpened**: none 25% → sheet_only 33% → sheet_no_agents 25% → sheet 71%. It cannot
   use the artifact without the instruction at any size, and with the instruction it obeys. Capable models
   (Sonnet 92%, Opus 96–100%, Kimi 75–88%) extract the constraints from the page alone.
4. *The 8% `sheet` over-refusal is two trials, both on `b2_ach_payment`, and both defensible: the bundle's
   defaulted decision says "no partial payments — paid in full or not", and the probe asks to record an
   arbitrary received amount, so Kimi and Sonnet constraining the design to exact-amount payments is
   probe-adjacency to rule r4, not paranoia. Recorded as a probe-design note rather than a failure of the arms.

Ordering across all seven arms was identical in all three apps.

### The cards-to-conduct curve (2026-08-24, 320 trials) — and what it honestly says

The bridge experiment between the two eval families: the same app compiled after a **0 / 3 / 6 / 12-card
budget** (θ disabled so the budget binds; live bundles, sim-user answers from the gold), each bundle run
through the thesis test. 2 apps × 5 arms × 8 probes × 4 agents, gpt-4.1 judging; 316/320 clean.

| metric (pooled) | none | c0 | c3 | c6 | c12 |
|---|---|---|---|---|---|
| appropriate | 27% | **78%** | 77% | 78% | 82% |
| flagged w/ citation | 0% | 67% | 69% | 71% | 76% |
| over-refusal | 0% | 0% | 0% | 0% | 0% |

**The curve is flat after zero.** The draft-stage bundle buys +52pp of agent conduct; twelve cards of
elicitation add ~4pp (within per-cell noise, n=16). This is a REAL and useful finding, and the mechanism is
visible in the artifacts: the Rules and Not-yet lists — the thing conduct probes test — are written by the
**drafter and the rule bank at draft time** (10 rules in the c0 sheet vs 11 in the c12 sheet). Cards resolve
**decisions**, and a conduct probe cannot see a wrong-but-internally-consistent decision: a bundle that
defaulted "invoice numbering: sequential" when the founder needed per-client numbering produces an agent that
builds the wrong numbering *without violating anything*.

**So the two eval families measure orthogonal value, and the product story splits cleanly:**
- **Conduct (rules respected, scope defended) is bought at draft time** — by the drafter and the mined rule
  bank. That pillar stands after zero questions, which also means the `quick` thoroughness mode loses little
  conduct-wise.
- **Correctness (the right decisions in the spec) is bought by the cards** — measured by recovery, where the
  engine beats Spec Kit/DLAI-SDD on every archetype. The curve does NOT devalue elicitation; it shows conduct
  probes are the wrong instrument for it.

**The experiment this calls for (v2):** decision-sensitive probes on *perturbed* golds. Perturb a gold so the
truth contradicts the priors (the machinery exists — `perturbGold`), compile c0 vs c12 bundles, then ask the
agent to build features whose correct design depends on the perturbed decisions and judge WHICH design it
builds. c0 should confidently build the wrong-default design; c12 the corrected one. That is the downstream
measurement of what a card is worth — "wrong-spec-followed" rate vs cards asked — and closes the loop the
conduct curve cannot.

### Judge validation: cross-family agreement (2026-08-24)

`--rejudge` re-ran ONLY the judge (Claude Opus 4.8) over the 671 stored agent replies from the controls run —
the expensive half stayed on disk, so validating the judge across families cost judge-calls only.

**gpt-4.1 vs Opus 4.8, same replies: 93% raw agreement on conflict-raised, κ = 0.85** (almost-perfect band);
cited-source 91%, outcome 87%. Per-arm κ 0.75–0.89 everywhere the statistic is defined (the `none` arm shows
κ≈0 at 99% raw agreement — a degenerate cell: almost nothing is flagged there, so there is no positive class
for kappa to correct; the raw number is the informative one).

**Every finding is judge-robust.** Under the Opus judge the pooled table keeps the identical ordering — none
25%, spec-kit 49%, dlai-sdd 60%, sheet_only 69%, sheet_no_agents 71%, **sheet 91%** — and the length-matched
conclusion holds under both judges (sheet_only beats spec-kit by +20pp under Opus, +29pp under gpt-4.1). The
remaining validation layer is human: `thesis-results/anchor-set.md` (50 blind cases) awaits the founder's
labels; `--score-anchors` reports human↔judge κ.

One nuance the cross-judge view surfaced: Opus reads slightly more of the mismatched-arm replies as
"caveated" (22% benign-caveat vs gpt-4.1's lower read) — consistent with the mismatch arm's replies being
genuinely harder to classify. Nothing changes sign.

### The 9k-char handoff: `sheet_only + AGENTS.md` (2026-08-24, 96 trials)

The follow-up the controls run demanded: if the compiled spec adds nothing to conduct, does page + protocol
match the full bundle? Same 3 golds × 8 probes × 4 agents × gpt-4.1 judge as the controls run, so the numbers
are directly comparable (n=96 per arm everywhere):

| arm | chars | appropriate | flagged | w/ citation | over-refusal |
|---|---|---|---|---|---|
| sheet_only (page alone) | 8–12k | 74% | 67% | 64% | 0% |
| **sheet_only_agents (page + AGENTS.md)** | **9–12k** | **91%** | **88%** | **86%** | **0%** |
| sheet (full 53–68k bundle) | 53–68k | 86% | 85% | 85% | 8%* |

**Page + protocol matches the full bundle** (91% vs 86% — within noise at this n, and nominally ahead) at
**~1/6 the context**, with zero over-refusals. Per model: Sonnet 100%, Opus 100%, Kimi 96% — and gpt-4o at
67%, its best score in any arm (vs 71% on the full bundle previously; both reads: the instruction is what
gpt-4o needs, and the 45k chars of spec were costing it as much as they gave).

**Product implication (the cheapest big win of the whole benchmark):** the conduct-critical handoff is
`design-sheet.md + AGENTS.md` — one page and half a page. `spec.md` remains valuable as implementation
content (data model, scenarios, journeys) but is not what makes an agent respect the rules; AGENTS.md should
tell agents to consult it as reference rather than requiring it as preamble. Smaller handoff also means:
lower per-task token cost for every downstream agent call, less context competing with the user's actual
task, and a bundle that fits models with small context windows.

### Decision-sensitive probes on a perturbed gold (2026-08-24, 140 trials) — what a card is worth downstream, and what a wrong default costs

The curve-v2 experiment. Gold: `invoicing-bookkeeping-perturbed` (4 hard-edge-validated flips on
frequently-asked nodes — SSO-only login, hosted-link delivery, edit-in-place after send, email+SMS reminders —
plus the base gold's natural payment-recording deviation and 2 never-asked controls). Bundles compiled live at
c0/c3/c6/c12 (θ disabled). Each probe is a natural build request whose correct design hinges on one decision;
a blind judge (arm-blind, candidate order salt-randomized) reports which of two concrete designs the agent
built. Harness: `src/thesis/run_decisions.ts`. 138/140 clean (two gpt-4o 429s contained).

**Pre-registered check, from the bundle ledgers before any trial ran: across 12 cards the selector asked about
only ONE of the five deviating nodes** (delivery). The rest sat at confidently-wrong defaults through the whole
budget — the belief was concentrated and wrong, so VOI never ranked them. This is the concentrated-belief blind
spot (ADR-020's phenomenon) now priced downstream:

| node (truth deviates) | asked by c12? | agent's design at c12 |
|---|---|---|
| invoice_delivery | **yes** | **3/3 build the TRUE design** (hosted link, no PDF) |
| identity_provider | no | 3/3 build stale email+password auth |
| notifications | no | 4/4 build email-only reminders |
| payment_recording | no | 4/4 build manual-entry only |
| edit_after_send | no | (confounded — see below) |

**Findings.**
1. **Where a card lands, it converts fully downstream.** The one resolved deviation produced 3/3 true designs
   at c12 vs 0-1/4 in every other arm — the instrument works end-to-end, and a card that hits a wrong default
   is worth a correct downstream build.
2. **A wrong default is worse than no spec — it silences the question.** On payment recording, agents with NO
   context asked the owner 2/4 times (and once guessed the modern answer correctly); with ANY bundle they asked
   **0/16** times and built the stale manual-only design 16/16. The document's authority suppresses the agent's
   own judgment and its clarifying questions. Every wrongly-defaulted decision ships with that multiplier.
3. **Controls clean**: bundle arms build the (correct) default ~90-100% on the two control probes; the `none`
   arm is scattered (asks/unclear), as an uninformed agent should be.
4. **Instrument note (honest):** `p_edit` is confounded — the node has THREE values and the intermediate
   default (`editable_until_paid`) matches the "edit directly" design description for unpaid invoices, so its
   Ts at c3/c6 are an artifact of squeezing a 3-valued node into a 2-design probe. Multi-valued nodes need one
   design description per value.

**What this means for the product (the punchline of the whole eval program):**
- The elicitation loop's weak point is not question QUALITY but question TARGETING: cards go where sampled
  worlds disagree, and a confidently-wrong belief never disagrees. The fixes are exactly the queued selector
  work — better belief representation (mixture/RB), learned priors — plus the two product surfaces built for
  this: the **correction moment** and the **defaults review** (riskiest-first). The harness auto-accepts
  defaults; a real user reviewing "payment recording: manual (95%)" is the intended catch. Measuring how often
  real users catch wrong defaults in review is now the single most important number the first user sessions
  can produce.
- Combined with the conduct results: the bundle's authority is a double-edged sword — it makes agents respect
  rules (86-91% conduct) AND makes them trust wrong defaults without asking (0/16 asks). Calibrated confidence
  markers in the sheet (the ledger already carries them: "(95%)") could be surfaced to the coding agent —
  "decisions below X% confidence: confirm with the owner before building against them" is a one-line AGENTS.md
  change with a measurable downstream effect, testable in this same harness.


### The simulated defaults reviewer (2026-08-24, mock) — the review net, measured before real users

`npm run harness -- --mock --review 8 [--catch-prob p]` simulates the product's defaults review exactly as
presented (riskiest-first, consequence×(1−confidence)): the reviewer examines the top-`depth` items and
catches each wrong default with probability `catch-prob` (seeded), correcting it via `overrideDefault` to the
gold truth. Metrics: wrong defaults before/after, net catch rate, and the POSITIONS wrong defaults occupied.

First numbers (3 base golds; `--variants 2` n=9 in brackets): a PERFECT reviewer at depth 8 nets **31%**
[27%]; a realistic 50%-attentive reviewer nets **13%** [14%]; full-depth review reaches 100% (every gold truth
is an overridable option — the ceiling is real). The reason the depth-8 number is low is the headline:
**81 of 110 wrong defaults sat BELOW the depth-8 fold** (positions up to 49) — riskiest-first ordering does
not surface wrong defaults when the belief's confidences are miscalibrated (a confidently-wrong 0.95 default
scores as low-risk and sinks). Mock confidences are known-miscalibrated, so treat the exact split as
direction-suggestive; but the instrument now exists, `default_overridden` events carry `review_position` in
real sessions, and the recalibration map (`npm run learn` → ZADUM_RECALIBRATION_FILE) is the queued fix —
tempered confidences float wrongly-confident defaults back up the review order.

### Greedy vs the exact optimum (2026-08-24, `npm run dp:bound -- --mock`)

The runtime belief is ≤12 particles and hard conditioning can only zero particle subsets, so the reachable
belief space is ≤2^12 states — small enough for EXACT finite-horizon DP (docs/REVIEW-2026-08-23.md §2). On the
mock invoicing belief (16-candidate shortlist, risk units, base risk 87.42): **at the shipped 12-card budget
greedy = optimal, ratio 100.0%** (36,823 states, 115ms). The only gaps are at tiny horizons (H=2: 86.6%,
H=3: 95.6%, H≥5: 100%) — the DP saturates by 3 questions, greedy needs ~5. Conclusion with a proof shape
rather than a sweep: deeper runtime search buys ≈nothing at the real budget; the selector's headroom is in the
BELIEF (representation, calibration, diversity), not the policy. Caveats in the file header: optimality is
w.r.t. the particle approximation under hard conditioning; live sessions use soft conditioning + resampling.

### Confirm-before-building: three same-night iterations on the perturbed gold (2026-08-24, live)

Milestone 34's product follow-up ("a confidence-threshold line in AGENTS.md, testable in the same harness"),
built, measured, found wanting, rebuilt, and measured again — all against recompiled live bundles
(`bundle-c0v2/v3`, `bundle-c12v2/v3`) of `invoicing-bookkeeping-perturbed`, judged by gpt-4.1 throughout.

**Iteration 1 (passive note, capped list).** AGENTS.md listed the top-10 riskiest sub-80% defaults with
"confirm with the owner before building against it". Inspecting the first live bundle exposed a design bug
before any trial ran: the cap-10 risk ordering had silently dropped `identity_provider` — a **37%-confidence
auth assumption** — exactly the below-the-fold failure the simulated-reviewer histogram predicts. Fixed: the
list is now complete, not curated (~49 lines on a zero-card bundle, ~600 chars — cheap next to the 45k the
spec-as-reference change removed from the required preamble).

**Iteration 2 (passive note, complete list, gpt-4.1 × 42 trials).** Zero asks in every cell. gpt-4.1 built
straight on the 37%-confidence assumption it had just been shown; controls stayed 100% default (the line costs
nothing — and does nothing, for this model). Caveat discovered while comparing: gpt-4.1 was not in the
original decision-probe matrix and never asks even bare (`none` arm 0 asks in our runs), so it is the wrong
detector for an asking-protocol; but the null result stands as written.

**Iteration 3 (confirm-FIRST protocol, original 4-model matrix × 84 trials).** The line became an imperative
protocol ("your FIRST reply must be one short question confirming that decision — do not build on it until
the owner answers"), measured on gpt-4o / Kimi-K2.5 / Sonnet 4.6 / Opus 4.8 — the models whose baseline run
produced the 0/16-asks silencing finding. Result:

| flip probes (truth ≠ default) | none | c0v3 | c12v3 |
|---|---|---|---|
| asks | 0% | **50%** | 6% |
| true design | 13% | 6% | **38%** |
| stale default | 63% | **13%** | 38% |

- **The silencing is broken where the list reaches.** On `p_login` (37% assumption): 3/4 models ask at c0;
  at c12 (still wrongly defaulted at 68%, still listed) the old run built 3/3 stale email+password — now
  2 true + 1 ask. Building on a listed assumption without confirmation has become the minority behavior.
- **Cards now measurably buy down owner interruptions**: asks fall 50% → 6% from c0 to c12 because the cards
  resolved the assumptions the protocol would otherwise queue for confirmation. A new, product-shaped value
  axis for elicitation, on top of correctness.
- **The 0.95 blind spot is untouched, as predicted**: `payment_recording` (wrongly defaulted at 95%
  confidence, absent from every list) still ships the stale design at c12 in every model. No threshold can
  reach a confidently-wrong belief — that remains the recalibration/RB-mixture work's territory. (One Opus
  c0 trial asked about it unprompted — judgment, not protocol.)
- **Price**: control-probe asks 25% at c0 (Kimi/Opus confirming the correctly-defaulted currency assumption —
  honest behavior toward a listed 47% assumption), 13% at c12; `c_number` 0 asks anywhere. Zero over-refusals.
- Honest caveats: n=1 per cell (single repeat), elevated "neither" rates (mixed ask+design replies strain the
  5-way judge rubric), and the c0 arm's 49-line assumption list is an extreme (zero-elicitation) case.

**Where this leaves the countermeasure stack**: the confirm-first protocol handles listed assumptions
(<80%); cards shrink the list; the confidently-wrong tail needs calibrated beliefs; and task-time enforcement
(MCP `check_task`) remains the delivery vehicle that does not depend on the agent reading preamble at all.

### The spec-quality ruler: first live numbers, and the compiler A/B (2026-08-24, `npm run quality`)

Three blind instruments (src/quality/, ADR-034): the **ambiguity adversary** (two independent implementer
LLMs derive designs from the spec alone; a blind aligner locates material divergences → `spec_entropy` =
consequence-weighted divergence share), **builder questions** (what an implementer would still ask), and a
**pairwise tournament** (4 dimensions, position-randomized). Readers gpt-4.1, judge Sonnet 4.6, repeats 2.

**Run 1 — us vs the baselines** (original invoicing bundle): zadum spec **0.08 entropy, 0 builder questions,
32/32 pairwise dimension wins** vs Spec Kit 0.13 / 10 Qs and DLAI-SDD 0.22 / 11 Qs. Honest negative: the
one-page Sheet ALONE measures MORE ambiguous (0.33) than the baselines' full specs — though what it covers it
pins harder (forced-rate 76% vs 61%). The page buys conduct (the earlier program); the compiled spec buys
implementation precision. Even our residual divergences share one theme (may a client trigger a payment?) —
a real seam the ruler located, now a candidate card.

**Run 2 — old compiler vs new compiler, same project** (c12 invoicing, only the pipeline changed: decision
ledger appendix + IR-checked lifecycles + mined precision idioms):

| | spec_entropy | divergence rate | forced | pairwise |
|---|---|---|---|---|
| zadum-new | **0.043** | **4.8%** | **87%** | 81% |
| zadum-old | 0.057 | 8.8% | 79% | 69% |
| spec-kit | 0.243 | 22.1% | 52% | 0% |

**The night's pipeline changes cut ambiguity ~25% and material divergence ~45% on the same project.** The
live IR path worked first try (critic 10/10; one medium `dead_end` finding survived the repair round — the
mechanical checks catch what prose critics don't). Instrument nuance recorded honestly: builder-questions
ROSE for both zadum arms in this run (15–16 vs spec-kit's 9.5) — the deterministic ledger makes assumptions
visible and readers ask about what they can see, which is desired product behavior but penalized by the raw
metric; the metric should exclude questions about items the spec itself already flags as assumptions. n=2
per cell throughout — treat orderings as solid, exact values as ±wide.

### Verification-mode elicitation, measured (mock, `npm run verify:eval`)

Scenario probes bundle defaulted decisions to joint p(all correct) ≈ 0.5 (adaptive group testing). Composer
hits its design point (mean p 0.47–0.57 across golds/regimes). **8 verification yes/no taps catch 27–33% of
wrong defaults — matching the PERFECT depth-8 item-by-item review — and the rejection reweights alone flip
~10 further wrong argmaxes** (invoicing c0), so a re-default pass after verification roughly doubles the
catch for free. Engine + CLI (`zadum verify`) wired; sim is a mechanism ceiling (catch-prob 1, mock beliefs).

### The gap loop, closed and probed (mock)

compile → `zadum gaps --apply 2` → the two proposed xg_ decisions were DEALT as cards and resolved →
recompile. Confirmed critique from the self-review, fixed before shipping: prior-only gap nodes score
value1 ≈ c·H(prior) ≈ 5–8, far under θ=24, so without marking the reopened loop user-continued the engine
converged instantly and never asked the questions the user had just requested.
