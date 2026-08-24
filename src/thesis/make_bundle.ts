/**
 * Compiles a real bundle for a gold, so the thesis test runs against artifacts the product actually produces
 * (not hand-written stand-ins). Same path a user takes: draft → decision cards → defaults → compile, with the
 * harness's simulated user answering from the gold's hidden truth.
 *
 * Usage: tsx src/thesis/make_bundle.ts <gold-id> [outDir] [maxCards]
 *
 * When maxCards is given explicitly, θ is disabled (theta: -1, so the selector never self-stops) and the card
 * BUDGET is what binds — this is for the cards-to-conduct curve experiment, where budgets past the natural
 * stopping point must still differ. maxCards = 0 skips the card loop entirely (draft → defaults → compile).
 * Without the arg, behavior is exactly the historical default (calibrated θ, cap 12), so existing bundles
 * remain reproducible.
 */
import path from "node:path";
import { buildEngine } from "../engine/bootstrap.js";
import { compileProject } from "../engine/compile.js";
import { loadGolds, truthText } from "../harness/run.js";

const goldId = process.argv[2] ?? "booking-salon";
const outDir = process.argv[3] ?? `out/thesis/${goldId}/bundle`;
const maxCardsArg = process.argv[4];
// argv[5]: directory of gold files (default the repo harness set) — lets perturbed golds live outside src/.
const goldDir = process.argv[5] ?? "src/harness/gold";
const maxCards = maxCardsArg === undefined ? 12 : Number(maxCardsArg);
if (!Number.isInteger(maxCards) || maxCards < 0 || maxCards > 12) throw new Error(`maxCards must be an integer 0..12, got ${maxCardsArg}`);
const golds = await loadGolds(path.resolve(goldDir));
const gold = golds.find((g) => g.id === goldId);
if (!gold) throw new Error(`gold ${goldId} not found (have: ${golds.map((g) => g.id).join(", ")})`);

const { engine, store } = await buildEngine({
  engine: maxCardsArg === undefined ? { precompute: false } : { precompute: false, config: { theta: -1 } },
});
const id = `thesis_${goldId.replace(/[^a-z0-9]+/gi, "-")}${maxCardsArg === undefined ? "" : `-c${maxCards}`}`;
console.log(`[${goldId}] drafting…`);
const t0 = Date.now();
await engine.createProject(gold.one_liner, { id });

let res = maxCards > 0 ? await engine.startCards(id) : ({ kind: "stop" } as const);
let n = 0;
while (res.kind === "card" && n < maxCards) {
  const sim = await engine.fns.simUser({ card: res.card, persona: gold.persona, truth: truthText(gold) });
  const a = sim.data;
  const ans =
    a.kind === "option" && res.card.options.some((o) => o.option_id === a.option_id)
      ? await engine.answerCard(id, { kind: "option", option_id: a.option_id, think_ms: 1000 })
      : a.kind === "other" && a.text
        ? await engine.answerCard(id, { kind: "other", text: a.text, think_ms: 1500 })
        : await engine.answerCard(id, { kind: "you_decide", think_ms: 800 });
  n += 1;
  console.log(`  card ${n}: ${res.card.node_id} → ${ans.answer.kind}${ans.answer.option_id ? ` (${ans.answer.option_id})` : ""}`);
  res = ans.next;
}
await engine.finishCards(id);
await engine.acceptDefaults(id);
console.log(`[${goldId}] compiling…`);
const c = await compileProject(engine, id, { outDir, story: true, roundTrip: true });
console.log(`[${goldId}] critic ${c.critic.verdict} (score ${c.critic.score}) · round-trip ${((c.roundtrip?.recall.overall ?? 0) * 100).toFixed(0)}% · ${n} cards · ${((Date.now() - t0) / 1000).toFixed(0)}s → ${outDir}`);
await store.close();
