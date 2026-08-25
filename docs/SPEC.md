# Design Sheet — Product Specification (revised 2026-08-22)

This is the founder's spec, revised with the accepted outcomes of the concept review. Where this document and the
code disagree, fix one of them and log it in `docs/DECISIONS.md`.

## 1. What we are building

A tool that lets **non-technical people** produce a rigorous software specification without authoring one.
One line in → the AI drafts a one-page **Design Sheet** → the user corrects it in plain English → an adaptive
**decision-card** loop (typically 3–9 taps) settles only what can't be safely defaulted → a defaults review →
the Sheet compiles into a coding-agent-ready spec bundle → the Sheet persists as the living source of truth the
coding agent re-reads before every task.

**Thesis.** People can't author requirements from a blank page, but anyone can spot what's wrong in a list about
their own business. Authoring becomes reviewing. Design is source code; spec is IR; code is machine code.

**North star.** Consequence-weighted requirement recovery per question (area under recovery-vs-cards), with
calibrated defaults, subject to never asking what the user already said. "Fewest questions" alone is gameable by
overconfidence; recovery × calibration is not.

## 2. The Design Sheet (one page)

| List | Public label | What compiles from it |
|---|---|---|
| Actors | People | permissions matrix, tenancy/auth decisions |
| Nouns | Things it keeps track of | data model, glossary |
| Actions | What people do | permissions, state machines, journeys, acceptance scenarios |
| Rules | What must never happen | invariants, negative tests, critic checks |
| Non-goals | Not yet | scope guard for the coding agent |

Hidden: the **decision ledger** (every decision with status, chosen option, confidence, provenance). Every line
on the page carries provenance (`draft`, `card:c3`, `user_edit:…`, `implied:…`). Concrete example on every line.

## 3. Principles

1. AI proposes, the deterministic core disposes. The model never writes state.
2. Not an agent: a state machine calling the LLM at fixed points.
3. Cards are phrased as consequences, never concepts.
4. Ask only what can't be safely defaulted; defaults are visible and one-tap correctable.
5. Implication propagation before ranking; show it ("this also decided ✓✓✓").
6. Dynamic stopping (value threshold), hard cap 12, user can stop anytime.
7. Selection is information-theoretic over sampled worlds: ask the card that most reduces consequence-weighted
   uncertainty about the spec (`weighted_entropy`, ADR-014). Two-ply lookahead exists and costs milliseconds
   (no LLM calls); it is enabled only when the harness shows it wins.
8. State = persistent artifact; every change is a commit.
9. Minimal tools: none in v1.
10. Latency: cards <2s p90 (speculative precompute); compile may take a minute.
11. Evals from day one; every tunable has an estimator and a human-behavior signal.
12. Vocabulary: "Design Sheet", "decision cards". Never "quiz", never "gamified".

## 4. User flow (v1)

1. **Input** — one line; optionally paste anything (doc, email, spreadsheet export) as extra context.
2. **Draft** — one joint call → Sheet v1 (+ archetypes + 3–5 inline assumptions phrased as consequences).
3. **Correction moment** — "Here's what I understood — correct me." Plain-English edits → patch ops → commits.
4. **Cards** — split screen: card left, Sheet growing right. Each: one sentence of context, up to four concrete
   futures (as many as the decision genuinely has live possibilities, never padded), plus "you decide", "skip",
   "something else", undo. After each tap: implication toast. A card and one Spec Kit/DLAI-SDD-style question
   both count as one interaction step in every comparison — a richer card extracts more per step, not more steps.
5. **Defaults review** — every assumed decision, riskiest first (consequence × (1 − confidence)), one-tap corrections.
6. **Compile** — spec.md + design-sheet.md + design-sheet.json + AGENTS.md + compile-report.json + story.md.
   Critic must pass; round-trip recall reported.
7. **Walkthrough** — "a day in the life" story from the spec; the user's final recognition check.
8. **Read and refine the spec** — the spec in the browser (`/p/<id>/spec`, or `zadum refine`), rendered, editable,
   with comments anchored to whatever passage reads wrong. Corrections never edit the spec text — that would be
   overwritten by the next compile — they are read for intent and land on the **Sheet** as patch ops, then it
   recompiles. What the feedback meant is classified into four lists (wrong assumption / missing element /
   confirmed / new question); a choice the feedback opens becomes an OPEN decision to ask, never a fresh guess,
   and a correction that contradicts an earlier answer reopens that answer (ADR-037).
9. **Handoff** — download the bundle; AGENTS.md carries the change protocol ("update the Sheet first, then code").

## 5. Architecture

See `docs/ARCHITECTURE.md`. Summary: catalog + planner → sampled worlds → deterministic VOI selector → patch/commit
core → compile with critic/round-trip/story → events for learning. TypeScript, no frameworks, Postgres or files.

## 6. Demo moments

1. Correction moment (one line → three lists in ~10s → fix a wrong assumption before any code).
2. Visible causality (each tap grows the Sheet; toast shows 3–5 decisions settling).
3. Traceability (⟨src: …⟩ markers: click a spec line → the card/edit that caused it).
4. A/B (same prompt, two coding agents; the Sheet-equipped one refuses a rule-violating feature and cites the rule).
5. Walkthrough (the story catches what the lists missed).

## 7. Out of scope for v1

RL card policy, runtime MCTS, evolutionary search, formal methods, orchestration frameworks, opening books,
Rules → executable property tests (flagship v2), accounts beyond minimum, multi-user collaboration, fine-tuning.

## 8. Build order (status in `docs/STATUS.md`)

1. Deterministic core (schema, patches, commits, store) + events ✅
2. Catalog + worlds + selector + stopping ✅
3. LLM layer + engine + CLI ✅ (mock-tested; live smoke pending credentials)
4. Compile + critic + round-trip + story + bundle ✅ (mock-tested)
5. Harness: gold sheets, simulated user, metrics (plumbing ✅; real gold corpus next)
6. Web UI (split-screen cards) — next
7. Learning loops B/C (priors from events, phrasing bandit, exemplars, catalog promotion) — after first sessions
