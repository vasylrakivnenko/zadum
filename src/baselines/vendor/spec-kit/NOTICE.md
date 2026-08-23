# Vendored from GitHub Spec Kit

`specify.md` and `clarify.md` in this directory are copied verbatim from
[github/spec-kit](https://github.com/github/spec-kit), tag `v1.0.1`,
`templates/commands/{specify,clarify}.md`. They are MIT-licensed (see `LICENSE`,
copied from the same tag) — copyright GitHub, Inc. Retrieved 2026-08-23.

They are used unmodified as the system prompt driving `src/baselines/spec_kit.ts`,
so our baseline runs the actual command text a real Spec Kit user's AI agent would
follow, not our paraphrase of it. Do not edit these files by hand — if Spec Kit
ships a new version, re-fetch and re-vendor, bump the tag noted here and in
`docs/BASELINES.md`, and re-run the baseline comparison.

Everything outside this `vendor/` directory is original code.
