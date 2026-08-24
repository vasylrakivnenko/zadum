/** Generates a competing tool's spec for the same gold, so the thesis test has a fair (not "no context") control. */
import { promises as fs } from "node:fs";
import path from "node:path";
import { llmFromEnv } from "../engine/bootstrap.js";
import { loadGolds, truthText } from "../harness/run.js";
import { makeBaselineSimUser } from "../baselines/sim_user.js";
import { specKitBaseline } from "../baselines/spec_kit.js";
import { dlaiSdd } from "../baselines/dlai_sdd.js";

const which = process.argv[2] ?? "dlai-sdd";
const goldId = process.argv[3] ?? "invoicing-bookkeeping";
const out = process.argv[4] ?? `thesis-results/baseline-${which}-${goldId}.md`;
const baseline = which === "spec-kit" ? specKitBaseline : dlaiSdd;
const llm = llmFromEnv();
const golds = await loadGolds(path.resolve("src/harness/gold"));
const gold = golds.find((g) => g.id === goldId);
if (!gold) throw new Error(`gold ${goldId} not found`);
const { simUser } = makeBaselineSimUser(llm, { persona: gold.persona, truth: truthText(gold) });
console.error(`[${which}] generating spec for ${goldId}…`);
const t0 = Date.now();
const res = await baseline.run(llm, { one_liner: gold.one_liner, simUser, maxQuestions: 12 });
await fs.mkdir(path.dirname(out), { recursive: true });
await fs.writeFile(out, res.spec_text);
console.error(`[${which}] ${res.spec_text.length} chars, ${res.questions.length} questions, ${((Date.now() - t0) / 1000).toFixed(0)}s, ${res.usage.input_tokens} in / ${res.usage.output_tokens} out → ${out}`);
