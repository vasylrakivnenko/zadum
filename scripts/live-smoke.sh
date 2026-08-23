#!/usr/bin/env bash
# Live smoke test — the first thing to run with real credentials (ANTHROPIC_API_KEY in .env or env).
# Exercises the full flow on the real LLM with the disk cache on, then runs the criterion sweep to
# recalibrate theta. Safe to re-run: cached calls are free.
set -euo pipefail
cd "$(dirname "$0")/.."
ONE_LINER="${1:-an invoicing app for small bookkeeping firms}"
OUT="out/live-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT"
echo "== 1/5 draft + plan + worlds"
npm run -s zadum -- --cache new "$ONE_LINER" --id live1 2>&1 | tee "$OUT/1-new.log"
echo "== 2/5 correction moment"
npm run -s zadum -- --cache edit live1 "Clients log into a portal to see and pay their invoices" 2>&1 | tee "$OUT/2-edit.log"
echo "== 3/5 cards (auto-answered)"
npm run -s zadum -- --cache cards live1 --auto 2>&1 | tee "$OUT/3-cards.log"
echo "== 4/5 accept defaults + compile"
npm run -s zadum -- --cache accept live1 2>&1 | tee "$OUT/4-accept.log"
npm run -s zadum -- --cache compile live1 --out "$OUT/bundle" 2>&1 | tee "$OUT/4-compile.log"
echo "== 4b equal-budget session for theta calibration (theta 0 = never converge; use --theta 0, commander misparses -1)"
npm run -s zadum -- --cache new "$ONE_LINER" --id live_budget 2>&1 | tail -2 | tee "$OUT/4b-new.log"
npm run -s zadum -- --cache --theta 0 cards live_budget --auto 2>&1 | tee "$OUT/4b-budget-cards.log"
echo "== 5/5 criterion sweep + theta calibration (3 counterfactual variants)"
npm run -s harness -- --sweep --variants 3 --flips 3 2>&1 | tee "$OUT/5-sweep.log"
echo
echo "Done. Logs + bundle in $OUT. Events: npm run zadum -- events live1 | grep card_shown   (check render_ms p90 < 2000)"
echo "Next: copy the best theta per scoring from 5-sweep.log into DEFAULT_THETA (src/core/selector.ts)."
