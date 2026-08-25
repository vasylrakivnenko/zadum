# zadum — Design Sheet

**TurboTax for AI coding.** You type one line about the app you want. The AI drafts a one-page Design Sheet
(People, Nouns, Actions, Rules, Not-yet). You fix what's wrong in plain English. A few decision cards — each
a choice between two concrete futures — settle what can't be safely defaulted. A rigorous spec compiles, and
your coding agent re-reads the Sheet before every task.

Then you read the compiled spec, correct anything that reads wrong, and download it. Corrections land on the
Sheet — the source of truth — so they survive the next rebuild instead of being written over.

- Product spec: `docs/SPEC.md` · Architecture: `docs/ARCHITECTURE.md` · Status/resume: `docs/STATUS.md`
- Run: `npm install && npm run zadum -- demo --mock` (no API key) or `npm run zadum -- new "<one-liner>"`
- Web UI: `npm run dev --prefix apps/web` → the Sheet, the cards, and the spec workspace at `/p/<id>/spec`
- Lost? `npm run zadum -- next <id>` always names the one next thing to do
- Test: `npm test`
