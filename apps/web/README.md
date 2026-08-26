# zadum web — the Design Sheet UI

Next.js (App Router) front end for the zadum engine. One line in → Design Sheet → decision cards (split screen)
→ defaults review → compiled spec bundle. The engine is imported **straight from `../../src`** (no build step);
all engine calls happen server-side in Route Handlers through one lazily-created `Engine` singleton
(`lib/engine.ts`).

## Run

```bash
cd apps/web
npm install
ZADUM_MOCK=1 npm run dev          # no API key needed: scripted MockLLM (invoicing fixtures)
# open http://localhost:3000
```

With a live model: `ANTHROPIC_API_KEY=… npm run dev` (or an `ant auth login` profile; the engine loads the repo-root
`.env` too). `npm run build && npm start` for production. `npm run typecheck` runs `tsc --noEmit`.

For production, set a stable `ZADUM_AUTH_SECRET` of at least 32 characters. The MVP uses a signed, HttpOnly
browser session: projects are private to that browser session, including every artifact and mutation route.
Clearing the cookie loses access until a future account/recovery layer is added. Requests are also rate-limited;
the defaults below are per running web process.

**Set `ZADUM_TRUST_PROXY=1` when — and only when — a reverse proxy that overwrites `x-forwarded-for` sits in
front of the app.** `x-forwarded-for` / `x-real-ip` are attacker-supplied otherwise, and a spoofable key turns a
per-IP limit into no limit at all, so without the flag those headers are ignored. Callers that no key can tell
apart (no valid session cookie, no trusted IP) then share one bucket, sized `ZADUM_RATE_SHARED_FACTOR` × the
limit: a process-wide backstop rather than a per-caller limit. Configure the proxy flag to get real per-visitor
limits on the creation route, which is the LLM-spend guard.

Projects created before ownership metadata was introduced are intentionally not exposed through the web app.
They remain available to the local CLI/store and are tagged as legacy data rather than silently assigned to the
first browser that asks for them.

The dev/build scripts pass `--webpack`: the engine is ESM TypeScript with `.js` import specifiers, which webpack
maps back to `.ts` via `experimental.extensionAlias` (Turbopack does not resolve them — see `next.config.ts`).

## Environment variables

| var | default | meaning |
|---|---|---|
| `ZADUM_MOCK` | unset | `1` → `MockLLM`, no credentials, deterministic scripted answers |
| `ZADUM_DATA_DIR` | `../../.zadum` (relative to `apps/web`) | `FileStore` root (projects, commits, sessions, events, artifacts) |
| `ZADUM_CATALOG_DIR` | `../../catalogs` | decision catalogs |
| `ZADUM_LLM_CACHE` | unset | `1` → wrap the live LLM in `CachedLLM` (replays) |
| `DATABASE_URL` | unset | use `PgStore` instead of files (handled by `buildEngine`) |
| `ZADUM_AUTH_SECRET` | random in development; **required in production** | signs anonymous browser credentials used for project ownership |
| `ZADUM_TRUST_PROXY` | unset | `1` → read `x-forwarded-for`/`x-real-ip`; only set it behind a proxy that overwrites them |
| `ZADUM_RATE_CREATE` | `5` per 10 min/IP (or session) | project-creation limit — the LLM-spend guard |
| `ZADUM_RATE_EXPENSIVE` | `20` per min/session | compile/refine/evidence/verification/gap limit |
| `ZADUM_RATE_WRITE`, `ZADUM_RATE_READ` | `120`, `300` per min/session | other API limits |
| `ZADUM_RATE_SHARED_FACTOR` | `20` | multiplier for the one bucket shared by callers nothing identifies |
| `ANTHROPIC_API_KEY`, `ZADUM_MODEL_*` | — | live model config (see `src/llm/client.ts`) |

## Route map

Pages

| path | screen |
|---|---|
| `/` | one-line input (+ optional "paste anything you have") → creates a project |
| `/p/[id]` | **Sheet view** — "Here's what I understood — correct me": five lists with examples, inline assumptions, plain-English correction box, "Looks right — start cards" |
| `/p/[id]/cards` | **Split screen** — card left (context sentence, two scenario buttons, You decide / Skip / Something else… / Undo, "about N more · design X% settled"), Sheet right with a "Decided" strip (most recent first) and an implication toast after every tap; stop state → defaults review |
| `/p/[id]/defaults` | **Defaults review** — assumed decisions riskiest first (topic, chosen label, confidence, consequence, why), one-tap override select, "Accept all & compile" → critic verdict/score, round-trip recall, story walkthrough, bundle links |
| `/p/[id]/artifacts/[name]` | one bundle file (`spec.md`, `design-sheet.md`, `design-sheet.json`, `AGENTS.md`, `compile-report.json`, `story.md`) as preformatted text |

API (JSON; errors are `{ error }` with 4xx/5xx)

| method + path | engine call | body → result |
|---|---|---|
| `POST /api/projects` | `createProject` | `{one_liner, extra_context?}` → `{project, sheet, assumptions}` |
| `GET /api/projects` | `store.listProjects` | → `{projects}` |
| `GET /api/projects/[id]` | `getState` + `currentCard` | → `{project, sheet, assumptions, session{phase,cards,answers,last_stop_reason,settledness}, card, decided}` |
| `POST /api/projects/[id]/edit` | `applyUserEdit` | `{text}` → `{version, applied, rejected, dropped, notes, implied, state}` |
| `POST /api/projects/[id]/cards/start` | `startCards` | → `{deal, state}` |
| `POST /api/projects/[id]/cards/answer` | `answerCard` | `{kind: option\|you_decide\|skip\|other, option_id?, text?, think_ms?}` → `{implied, sheet_version, next, state}` |
| `POST /api/projects/[id]/cards/undo` | `undoLast` | → `{restored, state}` |
| `POST /api/projects/[id]/cards/finish` | `finishCards` | → `{defaults}` (riskiest first) |
| `GET /api/projects/[id]/defaults` | `getDefaults` | → `{defaults, phase}` |
| `POST /api/projects/[id]/defaults/override` | `overrideDefault` | `{node, option}` → `{version, implied, defaults}` |
| `POST /api/projects/[id]/defaults/accept` | `acceptDefaults` | → `{ok, phase}` |
| `POST /api/projects/[id]/compile` | `compileProject` | `{candidates?}` → `{bundle[], critic, critic_rounds, roundtrip, story, latency_ms, sheet_version, phase}` |
| `GET /api/projects/[id]/compile` | `store.listArtifacts` | → `{bundle[{name,kind,created_at}]}` |
| `GET /api/projects/[id]/artifacts/[name]` | `store.listArtifacts` | → artifact content as `text/markdown` / `application/json` |

`implied` is labelled for people: `{hard: [{node, topic, label}], soft: [{node, topic, label, p}]}`.

## Layout

```
apps/web/
  next.config.ts        externalDir + extensionAlias(.js→.ts) + serverExternalPackages
  tsconfig.json         paths: @/* → ./*, @engine/* → ../../src/*
  lib/engine.ts         getEngine(): lazily built Engine singleton (globalThis-cached across HMR)
  lib/state.ts          projectState(): wire-level state (sheet, card, decided list, assumptions); labelImplied(); retryRead()
  lib/http.ts           route() error mapping, readBody(), str()/num() validation
  lib/types.ts          wire types shared with the client (type-only imports from the engine)
  lib/client.ts         fetch wrappers for the pages
  components/           TopBar, SheetView (+ diffSheetIds), Toast (+ impliedText)
  app/                  pages + app/api/** Route Handlers
```

Notes

- All `/api/projects` handlers go through the central security wrapper, in this order: same-origin check (before
  any identity is minted, so a rejected cross-origin probe gets no cookie), signed session, rate limit, owner
  check. A project owned by another session returns 404. `lib/ownership.ts#ownedProject` is the single owner
  rule; server-rendered pages call it too rather than re-implementing the comparison.
- The engine's speculative precompute saves `session.json` in the background and `FileStore` writes are not atomic,
  so a read can land mid-write; `lib/state.ts#retryRead` retries `SyntaxError`s a few times.
- Mock mode always plays the invoicing fixtures regardless of the one-liner.
