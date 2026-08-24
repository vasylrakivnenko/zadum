/**
 * `npm run models` — which deployments are configured, and do they actually work?
 *
 * Sends the smallest possible STRUCTURED request through the same `LLM.structured` path the evals use, so a
 * pass here means the schema/tool plumbing works for that model, not merely that the endpoint answers. Run it
 * after adding any credential.
 */
import "../env.js";
import { z } from "zod";
import { availability, availabilityTable, credentialsFromEnv, makeModel, MODEL_ROUTES } from "./registry.js";

const PingSchema = z.object({ answer: z.string(), confident: z.boolean() });

export async function checkModel(id: string): Promise<{ id: string; ok: boolean; ms: number; detail: string }> {
  const t0 = Date.now();
  try {
    const llm = makeModel(id);
    const res = await llm.structured({
      fn: "ping",
      tier: "strong",
      system: "You answer with a single word and structured output.",
      user: "What is the capital of France? Set confident to true.",
      schema: PingSchema,
      maxTokens: 200,
    });
    const ok = /paris/i.test(res.data.answer);
    return { id, ok, ms: Date.now() - t0, detail: ok ? `"${res.data.answer}" · ${res.usage.input_tokens}+${res.usage.output_tokens} tok` : `unexpected answer "${res.data.answer}"` };
  } catch (e) {
    return { id, ok: false, ms: Date.now() - t0, detail: (e as Error).message.slice(0, 160) };
  }
}

const isMain = process.argv[1]?.endsWith("check.ts") || process.argv[1]?.endsWith("check.js");
if (isMain) {
  const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const rows = availability(credentialsFromEnv());
  console.log("CONFIGURED MODELS\n");
  console.log(availabilityTable(rows));
  const ready = rows.filter((r) => r.ready && (only.length === 0 || only.includes(r.route.id)));
  const blocked = rows.filter((r) => !r.ready);
  if (blocked.length) {
    console.log(`\nNOT USABLE YET (${blocked.length}):`);
    const byNeed = new Map<string, string[]>();
    for (const b of blocked) byNeed.set(b.missing!, [...(byNeed.get(b.missing!) ?? []), b.route.id]);
    for (const [need, ids] of byNeed) console.log(`  ${ids.join(", ")}\n    → set ${need}`);
  }
  if (!ready.length) {
    console.log("\nnothing to test.");
    process.exit(0);
  }
  console.log(`\nLIVE STRUCTURED-OUTPUT TEST (${ready.length} model${ready.length > 1 ? "s" : ""})\n`);
  const results = await Promise.all(ready.map((r) => checkModel(r.route.id)));
  for (const r of results) console.log(`  ${r.ok ? "OK  " : "FAIL"} ${r.id.padEnd(20)} ${`${(r.ms / 1000).toFixed(1)}s`.padStart(6)}  ${r.detail}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} working${failed ? ` · ${failed} failing` : ""}`);
  process.exit(failed ? 1 : 0);
}
