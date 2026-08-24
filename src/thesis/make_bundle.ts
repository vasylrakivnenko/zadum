/**
 * Compiles a real bundle for a gold, so the thesis test runs against artifacts the product actually produces
 * (not hand-written stand-ins). Same path a user takes: draft → decision cards → defaults → compile, with the
 * harness's simulated user answering from the gold's hidden truth.
 *
 * Usage: tsx src/thesis/make_bundle.ts <gold-id> [outDir]
 */
import path from "node:path";
import { buildEngine } from "../engine/bootstrap.js";
import { compileProject } from "../engine/compile.js";
import { loadGolds, truthText } from "../harness/run.js";

const goldId = process.argv[2] ?? "booking-salon";
const outDir = process.argv[3] ?? `out/thesis/${goldId}/bundle`;
const golds = await loadGolds(path.resolve("src/harness/gold"));
const gold = golds.find((g) => g.id === goldId);
if (!gold) throw new Error(`gold ${goldId} not found (have: ${golds.map((g) => g.id).join(", ")})`);

const { engine, store } = await buildEngine({ engine: { precompute: false } });
const id = `thesis_${goldId.replace(/[^a-z0-9]+/gi, "-")}`;
console.log(`[${goldId}] drafting…`);
const t0 = Date.now();
await engine.createProject(gold.one_liner, { id });

let res = await engine.startCards(id);
let n = 0;
while (res.kind === "card" && n < 12) {
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
