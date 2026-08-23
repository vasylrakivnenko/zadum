# External baselines — Spec Kit and the DeepLearning.AI SDD course flow

Two more arms for `docs/EVALS.md`'s "Baselines to add" list, beyond our own scoring-criterion sweep: real
spec-driven-development tools, run through the same degrade-and-re-elicit protocol (`src/harness/run.ts`) so
recovery-vs-questions is comparable. This document is the design + the exact contract `src/baselines/*.ts`
implements against — read it before touching that code.

## Why two, and why they're not run the same way

They differ enough that a single driver shape would flatten a real difference worth reporting:

| | **Spec Kit** (`github/spec-kit`) | **DLAI SDD course** (`https-deeplearning-ai/sc-spec-driven-development-files`) |
|---|---|---|
| Questioning | adaptive, sequential: up to 3 during `/specify` (only if genuinely ambiguous), up to 5 more during `/clarify`, one at a time, MC-or-short | **fixed**: exactly 3, always, in one batch (Scope / Decisions / Context) — never more, never fewer |
| Output | one `spec.md` (requirements + user stories + acceptance criteria) | three files: `requirements.md`, `plan.md`, `validation.md` |
| Designed for | a fresh feature from a one-liner (our exact use case) | an incremental feature *within an already-scaffolded project* (constitution/mission/tech-stack already exist) — adapted here to treat the whole app as one feature, see below |
| License | MIT | none published (all rights reserved by default) |

That license difference is the reason the two drivers are built differently, not a detail:

- **Spec Kit → vendored verbatim.** `src/baselines/vendor/spec-kit/{specify,clarify}.md` are exact copies of
  `templates/commands/{specify,clarify}.md` at tag `v1.0.1` (MIT, see `vendor/spec-kit/LICENSE` and `NOTICE.md`).
  The baseline runs the actual command text a real user's AI agent would follow — maximum fidelity, and legally
  clean because MIT permits verbatim copying with attribution.
- **DLAI course → reimplemented from the documented procedure, not copied.** The repo has no LICENSE file, so
  its prompt/skill text (`skills/feature-spec/SKILL.md`) is not ours to redistribute. What is fair game is the
  *procedure* it documents — a fixed 3-question interview across named categories, producing three named
  files with described sections — because a workflow's steps are facts, not the copyrightable expression of
  them. `src/baselines/dlai_sdd.ts` uses ONLY the paraphrased system prompts below (my own wording), cites the
  source and retrieval date, and copies zero lines of their file. If DLAI publish a license later that permits
  it, vendoring their actual skill file the way we did Spec Kit's would be the better fidelity upgrade.

## Adapting DLAI's flow to a from-scratch one-liner

The real `feature-spec` skill assumes `specs/mission.md`, `specs/tech-stack.md`, and `specs/roadmap.md` already
exist (it's built for the *next* feature in an established project, e.g. "Video06_Feature_Specification" starts
from a repo that already has a constitution). We don't have that scaffolding, and building it would be a
different, larger comparison (constitution-writing is its own step in their course). The adaptation: treat the
**whole app** as the one feature being spec'd, skip the roadmap/mission lookup, and run the fixed 3-question
interview directly against the one-liner. This is noted as an adaptation, not silently smoothed over, in every
report the runner produces.

## Shared contract (`src/baselines/types.ts`, `src/baselines/sim_user.ts` — already built)

- `Baseline.run(llm, { one_liner, extra_context?, simUser, maxQuestions }) → BaselineResult` — see the interface
  for exact field types. A driver must never invent its own simulated-user prompt; call the provided `simUser`.
- `BaselineQuestion = { id, question, kind: "mc"|"short", options: string[] }` — free-form, not our catalog's
  node/option shape. `BaselineSimUser` answers from the same hidden gold truth `src/harness/run.ts` uses.
- Every LLM call a driver makes uses the ADR-011 conservative schema subset (flat objects, all fields present —
  `""`/`[]` instead of optional, enums, no `.optional()`/records/min-max) — same discipline as `src/llm/functions.ts`.
- `maxQuestions` is a hard cap the DRIVER enforces in code (never rely on the model to self-limit, even though
  both real tools also claim a cap in their own instructions — same reasoning as our own selector's `maxCards`).

## `src/baselines/spec_kit.ts` — exact wire format

Four LLM functions, all tier `"strong"`. System prompt = the vendored file's raw text (imported via `fs.readFileSync`
against `import.meta.url`, same pattern as `engine/catalogs.ts`'s `DEFAULT_CATALOG_DIR`) with a short **driver-authored
framing paragraph prepended** (not part of the vendored text) explaining: this is a simulation with no real
filesystem/git — skip directory creation, hook blocks, and checklist files; respond only in the given JSON shape;
skip anything about branches/hooks/extensions entirely.

1. **`speckit_specify_draft`** (effort `"medium"`) — user: the one-liner (+ extra_context). Schema:
   `{ spec_markdown: string, clarification_count: number, clarifications: [{ id, question, option_a, option_b, option_c }] }`
   (`clarification_count` must equal `clarifications.length`; cap at `min(3, maxQuestions)` — Spec Kit's own
   documented limit is 3). Empty option strings ("") mean fewer than 3 options offered.
2. If `clarification_count > 0`: call `simUser({id, question, kind:"mc", options: [a,b,c].filter(non-empty)})` for
   each, **in order**, then **`speckit_specify_finalize`** (effort `"medium"`) — user: one-liner + draft +
   the resolved Q&A — schema `{ spec_markdown: string }` (markers replaced, no more `[NEEDS CLARIFICATION]`).
3. Loop up to `min(5, maxQuestions - questionsSoFar)` times:
   a. **`speckit_clarify_ask`** (effort `"low"`) — user: current spec + prior Q&A this phase — schema
      `{ done: boolean, question: string, kind: "mc"|"short", option_a, option_b, option_c, option_d: string }`.
      Stop the loop when `done`.
   b. `simUser(...)` with the filtered non-empty options.
   c. **`speckit_clarify_apply`** (effort `"low"`) — user: current spec + the Q&A just received — schema
      `{ updated_spec_markdown: string }`. This becomes the new "current spec" for the next iteration.
- Result: `files: [{ name: "spec.md", content: finalSpec }]`, `spec_text = finalSpec`, `questions` = every
  Q&A from both phases in the order asked.

## `src/baselines/dlai_sdd.ts` — exact wording and wire format (own words, per the licensing note above)

Two LLM functions, tier `"strong"`. Use these system prompts VERBATIM (they are our own text, safe to use as-is):

**`dlai_interview`** (effort `"medium"`), system:
> "You are helping someone plan a new software feature using a lightweight, three-question spec-driven
> interview method (inspired by, but not copied from, a published course workflow: DeepLearning.AI's
> 'Spec-Driven Development with Coding Agents', built with JetBrains). The method always asks exactly three
> questions in a single batch, one from each of these fixed categories, before writing anything:
> 1. Scope — what the feature collects, exposes, or does: fields, behaviour, data shape.
> 2. Decisions — key choices that shape the build: what gets stored, who can see what, how input is checked,
>    the overall interaction pattern.
> 3. Context — tone, constraints, or anything else that shapes the spec: writing style, technical limits, open
>    questions.
> Each question must be answerable with EITHER 2-4 short multiple-choice options OR a short free-text phrase.
> Write exactly three questions, one per category, given the one-line app description below. Return JSON only."

User: the one-liner (+ extra_context). Schema (three fixed named questions, not an array — the method is always
exactly three, so this is more robust than an array a model might miscount):
```
{ scope_question, scope_kind: "mc"|"short", scope_option_a, scope_option_b, scope_option_c: string,
  decisions_question, decisions_kind, decisions_option_a, decisions_option_b, decisions_option_c: string,
  context_question, context_kind, context_option_a, context_option_b, context_option_c: string }
```
Then call `simUser` three times, in Scope → Decisions → Context order (filter empty option strings). If
`maxQuestions < 3`, keep only the first `maxQuestions` in that same order (drop Context first, then Decisions)
and record which were skipped in the driver's own notes — don't call the model for a dropped question.

**`dlai_write_spec`** (effort `"medium"`), system:
> "Given the app description and the three answers below (Scope, Decisions, Context — some may be missing if
> skipped), write the app's specification as three short documents, following this lightweight spec-driven
> method: a requirements.md (Scope: what is and is not included; Decisions: choices made and why; Context: tone
> and constraints), a plan.md (numbered task groups appropriate to building this, each with numbered sub-tasks),
> and a validation.md (automated checks expected to pass; a manual walkthrough of behaviour and edge cases; a
> tone check if there is user-facing copy; a definition of done). Return JSON only."

Schema: `{ requirements_markdown: string, plan_markdown: string, validation_markdown: string }`.
Result: `files` = the three named files (requirements.md first), `spec_text` = their concatenation with
requirements.md first (it's the primary source for scoring), `questions` = the (up to) three Q&A in order.

## Testing (both drivers)

Use `MockLLM` (see `src/llm/mock_fixtures.ts` for the established pattern: parse the rendered prompt back out of
`req.user`/`req.system`, return deterministic plausible data) — no network, no vendored-file dependency at test
time beyond reading the real vendored files (that's fine, they're static repo assets). Cover: the question cap is
enforced even if the model tries to ask more; the Spec Kit `clarify` loop stops on `done` and also stops at the
hard cap; the DLAI driver always asks exactly 3 unless `maxQuestions` forces fewer; `spec_text`/`files` are
well-formed; usage/latency are aggregated correctly across every call made.

## What ties it together (`src/baselines/run.ts` — NOT part of either driver's task, built separately)

For each gold (`src/harness/run.ts`'s `Gold` type): build one `BaselineSimUser` bound to that gold's
persona/truth (`makeBaselineSimUser`), run our own engine (`runGold`, already built) AND both baselines, then
score every baseline's `spec_text` the same way: `reverse()` (`src/llm/functions.ts`) for actor/noun/rule/non_goal
recall (exactly the round-trip check compile already does), and `extractConcepts()` (`src/mining/concepts.ts`)
against the gold's archetype catalog nodes for decision-level recovery (the same formula as
`src/harness/run.ts`'s `recovery()`, computed from the extraction's decisions instead of a Sheet). Prints a
three-way table: our engine vs Spec Kit vs DLAI-SDD, on recovery, questions asked, and draft/rule recall.

**Fairness note:** our engine's actor/noun/rule recall is scored from the FINAL sheet (post-cards, post-defaults)
via `engine.getState()`, not `SessionMetrics.draft_recall` (which the harness deliberately computes from the
*initial draft only*, as its own separate draft-quality KPI). Scoring our draft against a baseline's fully
refined output would compare our weakest stage to their best — an early bug in this file, caught and fixed
2026-08-23 before trusting the first live numbers.

## Status
Built and run live 2026-08-23: vendored assets + shared contract, both drivers (23 unit tests across
`spec_kit.test.ts`/`dlai_sdd.test.ts`), `run.ts` (23 tests, plus a fairness fix caught before trusting the first
numbers — see below), and a completed first live comparison on Azure OpenAI gpt-4.1 (n=1, invoicing gold) —
full results and the honest caveats in docs/EVALS.md "First live baseline comparison". `npm run baselines --
[--mock] [--gold dir] [--max-questions N] [--baselines spec-kit,dlai-sdd]`.

**Fixed before trusting the numbers:** `compareOne()` initially scored our own engine's actor/noun/rule recall
from `SessionMetrics.draft_recall` — the harness's *initial-draft-only* KPI — while baselines were scored on
their fully-refined output. Fixed to score our engine's post-session sheet via `engine.getState()` instead (see
"What ties it together" below). On this run's actual data the fix was a no-op (the card loop never touched the
actor/noun/rule lists in this particular session), but it was a real correctness bug in the comparison, not a
hypothetical one, and would matter whenever a session's free-text answers do add/rename a noun or rule.

Run against all 3 golds (invoicing/booking/marketplace) 2026-08-23 — see docs/EVALS.md "Baseline comparison
across archetypes" for the full table. Our engine wins recovery on every archetype; the ~94× token-cost gap
confirmed systematic (90–105× on all three, not an invoicing fluke) — a prompt-caching pass on the Spec Kit
driver (it resends its full templates on every one of 12 calls) is the next concrete improvement to make there.
Next: counterfactual variants per archetype once `src/baselines/run.ts` supports `--variants` (currently
harness-only), to move past "n=3 archetypes, one gold each".
