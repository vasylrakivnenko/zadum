/**
 * Rule bank — stage 3 of catalog mining.
 *
 * Motivation (2026-08-23 live evals, ADR-024/EVALS.md "Baseline comparison across archetypes"): on every one of
 * three golds, our engine, Spec Kit, AND the DLAI-SDD flow independently failed to reproduce any of the gold
 * author's specific rules — the one list nothing in the pipeline actively elicits. Cards settle catalog
 * DECISIONS; rules are entirely drafter-guessed, once, with no feedback loop. This is the highest-leverage gap
 * the evals surfaced.
 *
 * The fix is retrieval, not more drafting luck: real specs of an archetype (`corpus/`, already collected and
 * concept-extracted in stage 2 — `ConceptExtraction.rules`) repeatedly state the SAME handful of invariants in
 * different words ("every invoice belongs to exactly one client" / "an invoice must be linked to a customer
 * account"). One LLM call per archetype clusters those into a short list of generalized PATTERNS — not verbatim
 * quotes (stage 2 already restated each rule in its own words, so a pattern is twice-removed from any source
 * text — safe regardless of the source document's license, same reasoning as `concept-priors.json`). That list
 * becomes `catalogs/rule-bank/<archetype>.json`, read at draft time by `src/engine/rule_augment.ts` to suggest
 * (never write) rules the drafter may have missed.
 *
 * Offline tooling in the spirit of ADR-010: reviewable JSON, human-editable, the runtime only ever reads it.
 * CLI: npm run mine:rules -- --extractions <stage2-extractions.json> [--out catalogs/rule-bank] [--mock]
 */
import { z } from "zod";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { LLM, LLMResponse } from "../llm/client.js";
import { RulePatternSchema, RuleBankSchema, type RulePattern, type RuleBank } from "./rule_bank_schema.js";

export { RulePatternSchema, RuleBankSchema, type RulePattern, type RuleBank };

// ---------- LLM clustering ----------

export const ClusterRulesOutSchema = z.object({
  patterns: z.array(z.object({ pattern: z.string(), kind: z.enum(["access", "state", "integrity", "scope", "other"]), frequency_estimate: z.number(), example_phrasing: z.string() })),
});
export type ClusterRulesOut = z.infer<typeof ClusterRulesOutSchema>;

export const CLUSTER_RULES_SYSTEM = `You read a large list of rules extracted from many different real software specifications of the same kind of app (one rule per line, duplicates across documents expected). Your job is to find the RECURRING PATTERNS — invariants that keep showing up, phrased differently by different authors — and generalize each into ONE reusable pattern statement.

Rules for output:
- Merge near-duplicates ("every invoice belongs to exactly one client" / "an invoice must be linked to a customer account") into a single generalized pattern, phrased for THIS kind of app in general, not tied to any one document's wording.
- Only include a pattern if it recurs (appears in substantially the same form more than once) OR is an obviously important invariant for this kind of app even if stated once (e.g. a security/data-isolation rule). Do not include one-off implementation trivia.
- kind: access (who may see/do something), state (order of events / lifecycle), integrity (data/number consistency), scope (what's in/out of bounds), other.
- frequency_estimate 1-5: how often you saw something like this across the input (5 = in nearly every document, 1 = seen once but important).
- example_phrasing: a short, natural phrasing of the pattern (your own words, not copied from the input).
- Return at most 20 patterns, ordered by frequency_estimate descending then importance. Return JSON only.`;

export function renderRulesForClustering(archetype: string, rules: string[]): string {
  return [`ARCHETYPE: ${archetype}`, `RULES (${rules.length} total, from multiple documents):`, ...rules.map((r) => `- ${r}`)].join("\n");
}

export async function clusterRules(llm: LLM, input: { archetype: string; rules: string[] }): Promise<LLMResponse<ClusterRulesOut>> {
  return llm.structured({
    fn: "cluster_rules",
    tier: "strong",
    system: CLUSTER_RULES_SYSTEM,
    user: renderRulesForClustering(input.archetype, input.rules),
    schema: ClusterRulesOutSchema,
    effort: "medium",
    maxTokens: 6000,
  });
}

// ---------- building a RuleBank from stage-2 extraction records ----------

/** Minimal shape read from a stage-2 `*-extractions.json` file (see src/mining/concepts.ts's ExtractionRecord). */
export interface ExtractionLike {
  archetype: string;
  data: { rules: string[] } | null;
}

export function rulesByArchetype(extractions: ExtractionLike[]): { archetype: string; rules: string[]; docs: number }[] {
  const byArchetype = new Map<string, { rules: string[]; docs: number }>();
  for (const e of extractions) {
    if (!e.data) continue;
    const bucket = byArchetype.get(e.archetype) ?? { rules: [], docs: 0 };
    bucket.rules.push(...e.data.rules.filter((r) => r.trim().length > 0));
    bucket.docs += 1;
    byArchetype.set(e.archetype, bucket);
  }
  return [...byArchetype.entries()].map(([archetype, v]) => ({ archetype, ...v }));
}

const BANK_VERSION = "2026.08.23-1";

export async function buildRuleBank(llm: LLM, archetype: string, rules: string[], docs: number): Promise<RuleBank> {
  const res = await clusterRules(llm, { archetype, rules });
  const patterns: RulePattern[] = res.data.patterns
    .slice(0, 20)
    .map((p, i) => ({ id: `${archetype.replace(/[^a-z0-9]+/g, "_")}_${i + 1}`, pattern: p.pattern, kind: p.kind, frequency_estimate: Math.max(1, Math.min(5, Math.round(p.frequency_estimate))), example_phrasing: p.example_phrasing }));
  return { archetype, version: BANK_VERSION, source_docs: docs, patterns };
}

// ---------- CLI ----------
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const flag = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const extractionsFile = flag("--extractions");
  if (!extractionsFile) {
    console.error("usage: npm run mine:rules -- --extractions <stage2-extractions.json> [--out catalogs/rule-bank] [--mock] [--min-docs 2]");
    process.exit(1);
  }
  const outDir = flag("--out") ?? "catalogs/rule-bank";
  const mock = args.includes("--mock");
  const minDocs = Number(flag("--min-docs") ?? 2);

  const raw = JSON.parse(await fs.readFile(extractionsFile, "utf8")) as { extractions: ExtractionLike[] };
  const groups = rulesByArchetype(raw.extractions).filter((g) => g.docs >= minDocs);
  console.log(`${groups.length} archetype(s) with >= ${minDocs} docs: ${groups.map((g) => `${g.archetype}(${g.docs})`).join(", ")}`);

  let llm: LLM;
  if (mock) {
    const { MockLLM } = await import("../llm/client.js");
    const { clusterRulesMockHandlers } = await import("./rule_bank_mock.js");
    llm = new MockLLM(clusterRulesMockHandlers);
  } else {
    const { buildEngine } = await import("../engine/bootstrap.js");
    const { MemoryStore } = await import("../store/file_store.js");
    llm = (await buildEngine({ mock: false, cache: true, store: new MemoryStore() })).llm;
  }

  await fs.mkdir(outDir, { recursive: true });
  for (const g of groups) {
    const t0 = Date.now();
    const bank = await buildRuleBank(llm, g.archetype, g.rules, g.docs);
    const file = path.join(outDir, `${g.archetype}.json`);
    await fs.writeFile(file, JSON.stringify(bank, null, 2) + "\n");
    console.log(`  ${g.archetype.padEnd(20)} ${g.rules.length} raw rules from ${g.docs} docs -> ${bank.patterns.length} patterns (${Date.now() - t0}ms) -> ${file}`);
    for (const p of bank.patterns.slice(0, 5)) console.log(`    [${p.frequency_estimate}] (${p.kind}) ${p.pattern}`);
  }
}
