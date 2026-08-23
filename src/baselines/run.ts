/**
 * Ties the baseline drivers to the harness: for each gold, run our own engine AND every registered baseline
 * through the SAME simulated user (identical persona/hidden-truth, so no side has more information than the
 * other), then score every baseline's produced spec text the same way — see docs/BASELINES.md "What ties it
 * together" for the design. Nothing here is a comparison result until this runs live; see docs/BASELINES.md
 * "Status".
 *
 * CLI: npm run baselines -- [--mock] [--gold <dir|file>] [--out dir] [--baselines spec-kit,dlai-sdd]
 *                           [--max-questions 12]
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { LLM } from "../llm/client.js";
import { extractConcepts, MIN_CONFIDENCE, type ConceptExtraction } from "../mining/concepts.js";
import type { Doc } from "../mining/ngrams.js";
import { normalizePrior, mergeCatalogs, type NodeDef } from "../core/catalog.js";
import { maxOption } from "../core/worlds.js";
import { normName } from "../core/ids.js";
import { loadCatalogs } from "../engine/catalogs.js";
import type { Engine } from "../engine/orchestrator.js";
import { loadGolds, runGold, truthText, draftRecall, type Gold, type SessionMetrics } from "../harness/run.js";
import { makeBaselineSimUser } from "./sim_user.js";
import { specKitBaseline } from "./spec_kit.js";
import { dlaiSdd } from "./dlai_sdd.js";
import type { Baseline, BaselineResult } from "./types.js";

export const ALL_BASELINES: Baseline[] = [specKitBaseline, dlaiSdd];

/**
 * Minimal deterministic handlers for the baseline drivers' own LLM functions, for `--mock` runs and tests.
 * Not a fixture of real tool behavior — just enough shape to exercise the plumbing without credentials.
 */
export function mockBaselineHandlers(): Record<string, import("../llm/client.js").MockHandler> {
  return {
    baseline_sim_user: (req) => {
      const m = /OPTIONS \(reply with one of these, verbatim\):\n1\. (.+)/.exec(req.user as string);
      return { answer: m ? m[1]! : "a short answer", reasoning: "mock" };
    },
    speckit_specify_draft: () => ({ spec_markdown: "# Spec\n\nClients log in to a portal.", clarification_count: 0, clarifications: [] }),
    speckit_specify_finalize: () => ({ spec_markdown: "# Spec (final)\n\nClients log in to a portal." }),
    speckit_clarify_ask: () => ({ done: true, question: "", kind: "short" as const, option_a: "", option_b: "", option_c: "", option_d: "" }),
    speckit_clarify_apply: (req) => ({ updated_spec_markdown: (req.user as string).slice(0, 200) }),
    dlai_interview: () => ({
      scope_question: "What does it track?",
      scope_kind: "short" as const,
      scope_option_a: "",
      scope_option_b: "",
      scope_option_c: "",
      decisions_question: "Who can log in?",
      decisions_kind: "mc" as const,
      decisions_option_a: "Nobody",
      decisions_option_b: "Clients",
      decisions_option_c: "",
      context_question: "Any constraints?",
      context_kind: "short" as const,
      context_option_a: "",
      context_option_b: "",
      context_option_c: "",
    }),
    dlai_write_spec: () => ({ requirements_markdown: "Clients log in to a portal.", plan_markdown: "1. Build it.", validation_markdown: "Check it works." }),
  };
}

/**
 * Same formula as `src/harness/run.ts`'s `recovery()`, adapted to a baseline's flat concept extraction instead
 * of our worlds/Sheet. A node the extraction never addressed falls back to the CATALOG's raw prior argmax —
 * exactly what an unaddressed decision is worth without asking, for either side of the comparison. This is the
 * fairness-defining choice: a baseline is not penalized for silence beyond what our own defaults-on-silence
 * would cost it, and not credited for guessing right by luck beyond what the shared prior already predicts.
 */
export function recoveryFromExtraction(extraction: ConceptExtraction, nodes: NodeDef[], gold: Gold): number {
  const nodeIndex = new Map(nodes.map((n) => [n.id, n]));
  const stated = new Map<string, { option: string; confidence: number }>();
  for (const d of extraction.decisions) {
    if (d.confidence < MIN_CONFIDENCE) continue;
    const cur = stated.get(d.node_id);
    if (!cur || d.confidence > cur.confidence) stated.set(d.node_id, { option: d.option_id, confidence: d.confidence });
  }
  let num = 0;
  let den = 0;
  for (const [nodeId, truth] of Object.entries(gold.decisions)) {
    const node = nodeIndex.get(nodeId);
    if (!node) continue;
    const c = node.consequence;
    if (c <= 0) continue;
    const said = stated.get(nodeId);
    const value = said && node.options.some((o) => o.id === said.option) ? said.option : maxOption(normalizePrior(node.options, node.prior)).option;
    den += c;
    if (value === truth) num += c;
  }
  return den ? num / den : 1;
}

export interface DraftRecall {
  actors: number;
  nouns: number;
  rules: number;
  non_goals: number;
}

/** Same name-normalized / Jaccard matching as `harness/run.ts`'s `draftRecall`, over plain string lists instead of a Sheet. */
export function draftRecallFromLists(got: { actors: string[]; nouns: string[]; rules: string[]; non_goals: string[] }, gold: Gold): DraftRecall {
  const g = gold.sheet;
  if (!g) return { actors: 1, nouns: 1, rules: 1, non_goals: 1 };
  const rec = (have: string[], match: (a: string, b: string) => boolean, list: string[]) => (have.length ? have.filter((h) => list.some((x) => match(h, x))).length / have.length : 1);
  const eq = (a: string, b: string) => normName(a) === normName(b);
  const fuzzy = (a: string, b: string) => jaccard(a, b) >= 0.5;
  return {
    actors: rec(g.actors, eq, got.actors),
    nouns: rec(g.nouns, eq, got.nouns),
    rules: rec(g.rules, fuzzy, got.rules),
    non_goals: rec(g.non_goals, fuzzy, got.non_goals),
  };
}

function jaccard(a: string, b: string): number {
  const tok = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((t) => t.length > 2));
  const A = tok(a);
  const B = tok(b);
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return A.size + B.size - inter ? inter / (A.size + B.size - inter) : 1;
}

/** The raw lists a recall score was computed from — kept alongside the score so a low number is inspectable
 *  after the fact (e.g. "why is rules recall 0%?") without re-running anything. */
export interface RecalledLists {
  actors: string[];
  nouns: string[];
  rules: string[];
  non_goals: string[];
}

export interface OwnResult {
  cards: number;
  recovery: number;
  draft_recall: DraftRecall;
  got: RecalledLists;
}

export interface BaselineScored {
  baseline: string;
  questions: number;
  recovery: number;
  draft_recall: DraftRecall;
  got: RecalledLists;
  extraction_failed: boolean;
  usage: BaselineResult["usage"];
  latency_ms: number;
}

export interface ComparisonRow {
  gold_id: string;
  own: OwnResult;
  baselines: BaselineScored[];
}

/** Score one baseline's output against the gold: extract concepts from its spec text, then reuse the two recall formulas above. */
export async function scoreBaseline(llm: LLM, result: BaselineResult, gold: Gold, nodes: NodeDef[]): Promise<BaselineScored> {
  const doc: Doc = { id: `${gold.id}-${result.baseline}`, archetype: gold.archetypes[0] ?? "other", text: result.spec_text };
  try {
    const extraction = await extractConcepts(llm, { doc, nodes });
    return {
      baseline: result.baseline,
      questions: result.questions.length,
      recovery: recoveryFromExtraction(extraction.data, nodes, gold),
      draft_recall: draftRecallFromLists(extraction.data, gold),
      got: { actors: extraction.data.actors, nouns: extraction.data.nouns, rules: extraction.data.rules, non_goals: extraction.data.non_goals },
      extraction_failed: false,
      usage: result.usage,
      latency_ms: result.latency_ms,
    };
  } catch {
    return {
      baseline: result.baseline,
      questions: result.questions.length,
      recovery: 0,
      draft_recall: { actors: 0, nouns: 0, rules: 0, non_goals: 0 },
      got: { actors: [], nouns: [], rules: [], non_goals: [] },
      extraction_failed: true,
      usage: result.usage,
      latency_ms: result.latency_ms,
    };
  }
}

export async function compareOne(llm: LLM, engine: Engine, gold: Gold, baselines: Baseline[], maxQuestions: number): Promise<ComparisonRow> {
  const catalogs = await loadCatalogs();
  const nodes = mergeCatalogs(catalogs.catalogs, gold.archetypes).nodes;

  const ownMetrics: SessionMetrics = await runGold(engine, gold, { idPrefix: "own" });
  // `SessionMetrics.draft_recall` is deliberately the INITIAL draft, before any cards — the harness's own KPI
  // for draft quality alone. A baseline's spec_text is its fully-refined output, so scoring our draft against
  // it here would be comparing our weakest stage to their best; use the post-session sheet instead, the fair
  // analogue of "what this system finally produced".
  const finalState = await engine.getState(ownMetrics.project_id);
  const own: OwnResult = {
    cards: ownMetrics.cards,
    recovery: ownMetrics.final_recovery,
    draft_recall: draftRecall(finalState.sheet, gold),
    got: {
      actors: finalState.sheet.actors.map((a) => a.name),
      nouns: finalState.sheet.nouns.map((n) => n.name),
      rules: finalState.sheet.rules.map((r) => r.text),
      non_goals: finalState.sheet.non_goals.map((g) => g.text),
    },
  };

  const scored: BaselineScored[] = [];
  for (const b of baselines) {
    const { simUser } = makeBaselineSimUser(llm, { persona: gold.persona, truth: truthText(gold) });
    const result = await b.run(llm, { one_liner: gold.one_liner, simUser, maxQuestions });
    scored.push(await scoreBaseline(llm, result, gold, nodes));
  }
  return { gold_id: gold.id, own, baselines: scored };
}

export function comparisonTable(rows: ComparisonRow[]): string {
  const L: string[] = [];
  const pc = (x: number) => `${Math.round(x * 100)}%`;
  L.push(`${"gold".padEnd(28)} ${"system".padEnd(14)} ${"asked".padStart(6)} ${"recovery".padStart(9)} ${"actors".padStart(7)} ${"nouns".padStart(7)} ${"rules".padStart(7)}`);
  for (const r of rows) {
    L.push(`${r.gold_id.padEnd(28)} ${"our engine".padEnd(14)} ${String(r.own.cards).padStart(6)} ${pc(r.own.recovery).padStart(9)} ${pc(r.own.draft_recall.actors).padStart(7)} ${pc(r.own.draft_recall.nouns).padStart(7)} ${pc(r.own.draft_recall.rules).padStart(7)}`);
    for (const b of r.baselines) {
      const tag = b.extraction_failed ? " (extraction failed)" : "";
      L.push(`${"".padEnd(28)} ${b.baseline.padEnd(14)} ${String(b.questions).padStart(6)} ${pc(b.recovery).padStart(9)} ${pc(b.draft_recall.actors).padStart(7)} ${pc(b.draft_recall.nouns).padStart(7)} ${pc(b.draft_recall.rules).padStart(7)}${tag}`);
    }
  }
  return L.join("\n");
}

// ---------- CLI ----------
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const flag = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const mock = args.includes("--mock");
  const goldPath = flag("--gold") ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "harness", "gold");
  const outDir = flag("--out") ?? "harness-results";
  const maxQuestions = Number(flag("--max-questions") ?? 12);
  const wantedIds = (flag("--baselines") ?? "spec-kit,dlai-sdd").split(",").map((s) => s.trim());
  const baselines = ALL_BASELINES.filter((b) => wantedIds.includes(b.id));
  if (!baselines.length) {
    console.error(`no matching baselines in --baselines (available: ${ALL_BASELINES.map((b) => b.id).join(", ")})`);
    process.exit(1);
  }

  const { buildEngine } = await import("../engine/bootstrap.js");
  const { MemoryStore } = await import("../store/file_store.js");
  const store = new MemoryStore();
  // --mock needs handlers beyond the engine's own fixtures: concept extraction and each baseline's LLM
  // functions. buildEngine's built-in mock path only wires the engine's fixtures, so build the merged mock
  // LLM here and hand it in explicitly; live mode is unaffected (buildEngine picks the real provider).
  let overrideLlm: import("../llm/client.js").LLM | undefined;
  if (mock) {
    const { MockLLM } = await import("../llm/client.js");
    const { invoicingMockHandlers } = await import("../llm/mock_fixtures.js");
    const { conceptMockHandlers } = await import("../mining/concepts_mock.js");
    overrideLlm = new MockLLM({ ...invoicingMockHandlers, ...conceptMockHandlers, ...mockBaselineHandlers() });
  }
  const built = await buildEngine({ mock: false, cache: !mock, store, ...(overrideLlm ? { llm: overrideLlm } : {}), engine: { precompute: false } });
  const llm = built.llm;

  const golds = await loadGolds(goldPath);
  console.log(`comparing our engine vs ${baselines.map((b) => b.id).join(", ")} on ${golds.length} gold(s) · llm ${llm.name} (${llm.models.strong}) · max ${maxQuestions} questions per baseline`);
  const rows: ComparisonRow[] = [];
  for (const gold of golds) {
    const row = await compareOne(llm, built.engine, gold, baselines, maxQuestions);
    rows.push(row);
    console.log(comparisonTable([row]));
  }
  console.log(`\n${comparisonTable(rows)}`);

  await fs.mkdir(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(outDir, `${stamp}-baselines${mock ? "-mock" : ""}.json`);
  await fs.writeFile(file, JSON.stringify({ mock, maxQuestions, baselines: baselines.map((b) => b.id), models: llm.models, rows }, null, 2));
  console.log(`\nwritten ${file}`);
}
