/**
 * `npm run graph:validate` / `npm run graph:report` — the two operations a human performs on a design graph
 * that do NOT involve rebuilding it.
 *
 * They are separate from `npm run mine:graph` (which computes statistics and writes a graph) on purpose:
 * validating and reading a graph must be possible without the matrix that produced it, because the graph is
 * the artifact that gets reviewed, checked into a branch, and argued about. A reviewer needs to be able to
 * run the checks on a file someone handed them.
 *
 * `validate` is the gate that enforces the two rules a graph file could otherwise quietly break:
 *   - every probability is a NUMBER in [0,1] (spec rule 5), and
 *   - no HARD relation carries a learned status (spec rule 11) — a `hard_implies` edge with
 *     `status: "candidate"` is a statistical association wearing the costume of a law, and it is refused.
 * It exits non-zero on any issue, so it works in CI.
 *
 * `report` renders the human-readable view: logical rules, statistical associations, the three flavours of
 * "not estimable", the Simpson's-paradox warnings ABOVE the pooled numbers they invalidate, and the hard-edge
 * proposals that a human — never this program — may choose to promote.
 */
import path from "node:path";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import { helpRequested, parseFlags, UsageError } from "../cli/flags.js";
import {
  buildDesignGraph,
  hardCandidates,
  isHard,
  loadDesignGraph,
  renderGraphReport,
  SOFT_RELATIONS,
  validateGraph,
  type DesignGraph,
  type HardCandidate,
} from "./design_graph.js";

export const GRAPH_CLI_USAGE = `graph — validate or report on a design graph

  npm run graph:validate -- --graph <graph.json> [--strict]
  npm run graph:report   -- --graph <graph.json> [--candidates <graph-candidates.json>] [--out <file.md>]

  --graph       the graph file to read (default: the newest mining-results/*graph.json)
  --candidates  hard-edge proposals written alongside the graph
  --strict      also fail when a soft edge carries no support count
  --out         write the rendered report to a file as well as stdout`;

const GRAPH_FLAGS = { value: ["--graph", "--candidates", "--out"], boolean: ["--strict"] } as const;

/** Newest `*graph.json` under a results directory — the convenience default, never a silent surprise. */
export async function findLatestGraph(dir: string): Promise<string | null> {
  const entries = await fs.readdir(dir).catch(() => [] as string[]);
  const candidates = entries.filter((f) => f.endsWith("graph.json")).sort();
  return candidates.length ? path.join(dir, candidates[candidates.length - 1]!) : null;
}

export interface GraphSummary {
  edges: number;
  hard: number;
  soft: number;
  unknown: number;
  pooled: number;
  simpsons_warnings: number;
  elements: number;
  archetypes: string[];
  source_kinds: string[];
}

/** A quick shape summary, printed by both subcommands so an operator always sees what they are looking at. */
export function summarizeGraph(graph: DesignGraph): GraphSummary {
  const archetypes = new Set<string>();
  const sourceKinds = new Set<string>();
  let hard = 0;
  let soft = 0;
  let unknown = 0;
  let pooled = 0;
  let warnings = 0;
  for (const e of graph.edges) {
    if (isHard(e.relation)) hard += 1;
    else if (SOFT_RELATIONS.has(e.relation)) soft += 1;
    else unknown += 1;
    if (e.archetype === null && e.source_kind === null) pooled += 1;
    if (e.simpsons_warning) warnings += 1;
    if (e.archetype) archetypes.add(e.archetype);
    if (e.source_kind) sourceKinds.add(e.source_kind);
  }
  return {
    edges: graph.edges.length,
    hard,
    soft,
    unknown,
    pooled,
    simpsons_warnings: warnings,
    elements: graph.elements.length,
    archetypes: [...archetypes].sort(),
    source_kinds: [...sourceKinds].sort(),
  };
}

/** Extra checks beyond the structural ones in `validateGraph`, kept here because they are policy, not shape. */
export function strictIssues(graph: DesignGraph): string[] {
  const out: string[] = [];
  for (const e of graph.edges) {
    if (!SOFT_RELATIONS.has(e.relation)) continue;
    if (e.eligible_n <= 0) out.push(`${e.from} → ${e.to}: soft edge with no support count`);
    if (e.ci95 === null) out.push(`${e.from} → ${e.to}: soft edge with no confidence interval`);
    if (e.eligible_n > 0 && e.eligible_n < graph.thresholds.softMinN)
      out.push(`${e.from} → ${e.to}: soft edge on ${e.eligible_n} rows, below the graph's own softMinN of ${graph.thresholds.softMinN}`);
  }
  return out;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const argv = process.argv.slice(2);
  const sub = argv[0];
  const rest = argv.slice(1);
  if (helpRequested(argv) || (sub !== "validate" && sub !== "report")) {
    console.log(GRAPH_CLI_USAGE);
    process.exit(sub === undefined || helpRequested(argv) ? 0 : 2);
  }

  let flags;
  try {
    flags = parseFlags(rest, GRAPH_FLAGS);
  } catch (e) {
    console.error(`${(e as Error).message}\n\n${GRAPH_CLI_USAGE}`);
    process.exit(2);
  }

  const explicit = flags.value("--graph");
  const file = explicit ?? (await findLatestGraph(path.resolve(here, "../../mining-results")));
  if (!file) {
    console.error(`no graph file given and none found in mining-results/\n\n${GRAPH_CLI_USAGE}`);
    process.exit(2);
  }

  let graph: DesignGraph;
  try {
    graph = await loadDesignGraph(file);
  } catch (e) {
    console.error(`${file}: ${(e as Error).message}`);
    process.exit(1);
  }

  // Validate against the real catalogs when they load, so an edge naming a node that no longer exists is
  // caught. A graph is allowed to outlive a catalog edit — but not silently.
  let nodeIndex: Map<string, Set<string>> | undefined;
  try {
    const { loadCatalogs } = await import("../engine/catalogs.js");
    const { catalogNodeIndex } = await import("../mining/lexicon.js");
    const loaded = await loadCatalogs();
    nodeIndex = catalogNodeIndex(loaded.catalogs);
    if (graph.catalog_version && graph.catalog_version !== loaded.version) {
      console.log(`note: graph was built against catalog ${graph.catalog_version}, current is ${loaded.version}`);
    }
  } catch {
    console.log("note: catalogs could not be loaded — element keys checked for shape only");
  }

  const s = summarizeGraph(graph);
  console.log(`${file}`);
  console.log(`  design graph ${graph.version} · catalog ${graph.catalog_version || "?"} · matrix ${graph.matrix_version || "?"}`);
  console.log(`  ${s.edges} edges: ${s.hard} logical · ${s.soft} statistical · ${s.unknown} not estimable (${s.pooled} pooled, ${s.simpsons_warnings} Simpson-flagged)`);
  console.log(`  ${s.elements} element statistics · archetypes: ${s.archetypes.join(", ") || "none"} · source kinds: ${s.source_kinds.join(", ") || "none"}`);

  if (sub === "validate") {
    const issues = validateGraph(graph, nodeIndex);
    const extra = flags.has("--strict") ? strictIssues(graph) : [];
    if (!issues.length && !extra.length) {
      console.log("\ngraph valid: every probability numeric and in range, no learned edge claiming a hard relation");
      process.exit(0);
    }
    console.error(`\n${issues.length + extra.length} problem(s):`);
    for (const i of issues) console.error(`  - ${i.where}: ${i.problem}`);
    for (const i of extra) console.error(`  - strict: ${i}`);
    process.exit(1);
  }

  // report
  let candidates: HardCandidate[] = [];
  const candidateFile = flags.value("--candidates");
  if (candidateFile) {
    candidates = JSON.parse(await fs.readFile(candidateFile, "utf8")) as HardCandidate[];
  } else {
    // no candidates file: re-derive nothing (we have no PairStats here) and say so rather than inventing
    candidates = hardCandidates([], graph.thresholds);
  }
  const rendered = renderGraphReport({ graph, candidates, simpsons: [] });
  const warnings = graph.edges.filter((e) => e.simpsons_warning);
  const body = warnings.length
    ? `${rendered}\n\n## ⚠ pooled edges carrying a Simpson's warning: ${warnings.length}\n${warnings.map((e) => `  ${e.from} → ${e.to}: ${e.simpsons_warning}`).join("\n")}\n`
    : rendered;
  console.log(`\n${body}`);
  if (!candidateFile) console.log("\n(no --candidates file given: the hard-rule proposal section reflects only what this graph file carries)");
  const out = flags.value("--out");
  if (out) {
    await fs.writeFile(out, `${body}\n`);
    console.log(`\nwritten ${out}`);
  }
  void buildDesignGraph;
}
