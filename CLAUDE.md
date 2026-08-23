# zadum — Design Sheet ("TurboTax for AI coding")

Read this first, then `docs/STATUS.md` (where we are + how to resume), then `docs/ARCHITECTURE.md`.
Product intent lives in `docs/SPEC.md`; the reasoning behind non-obvious choices in `docs/DECISIONS.md`;
the learning/flywheel design in `docs/LEARNING.md`; the eval harness in `docs/EVALS.md`.

## What this is
A deterministic state machine that calls an LLM at fixed points to turn a one-line app description into a
one-page **Design Sheet** (People / Nouns / Actions / Rules / Not-yet) that a non-technical person reviews,
an adaptive **decision-card** loop that asks only what can't be safely defaulted, and a compiler that turns
the Sheet into a coding-agent-ready spec bundle. Public vocabulary: "Design Sheet", "decision cards".
Never "quiz", never "gamified".

## Rules this codebase must enforce (dogfood rules — also tested)
1. The LLM never writes to the Sheet. It proposes patch ops; `src/core/patch.ts` validates and applies them.
2. Every Sheet change is a commit (`src/core/commit.ts`); history is append-only, undo = new commit.
3. A resolved or implied decision is never asked again (unless contradicted by a later user action).
4. A card is never shown when the decision is derivable (P ≥ τ) or below the value threshold θ.
5. Card render latency < 2s p90 (speculative precompute of next cards).
6. The compiled spec must pass the critic against all Rules before delivery.
7. Never more than 12 cards per session.
8. No external tools (search / code-exec / MCP) are called by the engine in v1.

## Conventions
- TypeScript, ESM (`"type": "module"`, NodeNext). Run TS directly with `tsx`; tests with `vitest`.
- `src/core/**` is pure and deterministic: no IO, no LLM, no clocks/randomness except injected.
- All LLM calls go through `src/llm/client.ts` (`LLM` interface). `MockLLM` for tests/`--mock`, `CachedLLM`
  for replays. Structured outputs via `client.messages.parse` + `zodOutputFormat`.
- All persistence goes through `src/store/store.ts` (`Store` interface): `FileStore` (default) / `PgStore`.
- Orchestration is ~one loop and two fan-outs in `src/engine/orchestrator.ts`. No agent frameworks.
- Every user-visible or learning-relevant moment appends an event (`src/engine/events.ts`) tagged with
  catalog/prompt/model versions.

## Working agreements for coding sessions
- Before any task: re-read the Rules above. After any milestone: update `docs/STATUS.md` (done / next /
  gaps) so an interrupted session can resume.
- Run `npm test` and `npm run typecheck` before declaring a step done.
- Selector changes (scoring, θ, lookahead) are decided by the harness, never by argument:
  `npm run harness -- --mock --sweep --variants 3` (or without `--mock` for live). θ is calibrated from the
  replay table, never hand-picked.
- Keep the Sheet one page and the public vocabulary intact.
- Don't commit unless asked.
