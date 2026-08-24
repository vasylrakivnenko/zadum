/**
 * Drift check: do the project's documents still say what the Design Sheet says?
 *
 * Reads the given files (a README, a spec excerpt, AGENTS.md — anything prose), runs the engine's `reverse`
 * function to reconstruct the Sheet those documents imply, and diffs it against the project's actual Sheet
 * with `roundTripReport`. Missing items (in the Sheet, absent from the docs) are likely doc drift; extra
 * items (in the docs, not the Sheet) are likely decisions someone made without recording them — the exact
 * failure mode the Sheet exists to prevent.
 *
 * CLI: tsx src/check/drift.ts <project-id> <file...> [--mock] [--data-dir d] [--min 0.7]
 * Exit codes: 0 pass, 1 overall recall below --min, 2 usage/setup error. CI-friendly.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildEngine } from "../engine/bootstrap.js";
import { roundTripReport, type RoundTripReport } from "../engine/compile.js";
import type { Engine } from "../engine/orchestrator.js";

export interface DriftResult {
  project_id: string;
  report: RoundTripReport;
  min: number;
  pass: boolean;
}

export async function driftCheck(engine: Engine, projectId: string, docText: string, min = 0.7): Promise<DriftResult> {
  const sheet = await engine.store.getLatestSheet(projectId);
  if (!sheet) throw new Error(`unknown project: ${projectId}`);
  const rev = await engine.fns.reverse({ spec: docText });
  const report = roundTripReport(sheet, rev.data);
  return { project_id: projectId, report, min, pass: report.recall.overall >= min };
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function formatDrift(r: DriftResult): string {
  const L: string[] = [];
  const rec = r.report.recall;
  L.push(`Drift check — project ${r.project_id}`);
  L.push("");
  L.push("Recall (how much of the Sheet the docs still state):");
  for (const [kind, v] of [["actors", rec.actors], ["nouns", rec.nouns], ["actions", rec.actions], ["rules", rec.rules], ["non-goals", rec.non_goals]] as const)
    L.push(`  ${kind.padEnd(9)} ${pct(v)}`);
  L.push(`  ${"OVERALL".padEnd(9)} ${pct(rec.overall)} (threshold ${pct(r.min)})`);
  if (r.report.missing.length) {
    L.push("");
    L.push(`Missing from the docs (${r.report.missing.length}) — in the Sheet but not written down; likely doc drift:`);
    for (const m of r.report.missing) L.push(`  - [${m.kind}] ${m.item}`);
  }
  if (r.report.extra.length) {
    L.push("");
    L.push(`In the docs but not the Sheet (${r.report.extra.length}) — likely un-recorded decisions; amend the Sheet first:`);
    for (const e of r.report.extra) L.push(`  - [${e.kind}] ${e.item}`);
  }
  L.push("");
  L.push(r.pass ? "PASS — docs and Sheet agree well enough." : "FAIL — overall recall is below the threshold.");
  return L.join("\n");
}

/** The CLI body, factored so tests can drive it without spawning a process. Returns the exit code. */
export async function runDriftCli(argv: string[], out: (line: string) => void = (l) => console.log(l)): Promise<number> {
  const flag = (name: string) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const mock = argv.includes("--mock");
  const positional = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--data-dir" && argv[i - 1] !== "--min");
  const [projectId, ...files] = positional;
  if (!projectId || files.length === 0) {
    out("usage: tsx src/check/drift.ts <project-id> <file...> [--mock] [--data-dir d] [--min 0.7]");
    return 2;
  }
  const min = Number(flag("--min") ?? 0.7);
  if (!(min >= 0 && min <= 1)) {
    out(`--min must be in [0,1], got ${flag("--min")}`);
    return 2;
  }
  try {
    const dataDir = flag("--data-dir");
    const { engine, store } = await buildEngine({ ...(mock ? { mock: true } : {}), ...(dataDir ? { dataDir } : {}), engine: { precompute: false } });
    // one reverse call over the concatenation: the docs jointly describe one app, and per-file recall would
    // punish a reasonable split (rules in README, entities in docs/data.md)
    const texts = await Promise.all(files.map(async (f) => `<!-- file: ${f} -->\n${await fs.readFile(f, "utf8")}`));
    const r = await driftCheck(engine, projectId, texts.join("\n\n"), min);
    out(formatDrift(r));
    await store.close();
    return r.pass ? 0 : 1;
  } catch (e) {
    out(`drift check failed: ${(e as Error).message}`);
    return 2;
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) runDriftCli(process.argv.slice(2)).then((code) => (process.exitCode = code));
