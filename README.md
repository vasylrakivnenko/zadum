# zadum — Design Sheet

**TurboTax for AI coding.** You type one line about the app you want. The AI drafts a one-page Design Sheet
(People, Nouns, Actions, Rules, Not-yet). You fix what's wrong in plain English. A few decision cards — each
a choice between two concrete futures — settle what can't be safely defaulted. A rigorous spec compiles, and
your coding agent re-reads the Sheet before every task.

- Product spec: `docs/SPEC.md` · Architecture: `docs/ARCHITECTURE.md` · Status/resume: `docs/STATUS.md`
- Run: `npm install && npm run zadum -- demo --mock` (no API key) or `npm run zadum -- new "<one-liner>"`
- Test: `npm test`
