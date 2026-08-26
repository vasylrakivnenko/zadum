/**
 * Loop B report: run every statistical estimator over real user projects in a store and print/write results.
 *   npx tsx src/learning/report.ts [--data-dir .zadum] [--out learning-results]
 * (package.json: `"learn": "tsx src/learning/report.ts"`). Uses PgStore when DATABASE_URL is set, else FileStore.
 * Mock, experiment and legacy projects are excluded unless explicitly opted in. No LLM calls; everything here
 * is arithmetic over logged events, sessions and final Sheets.
 */
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Store } from "../store/store.js";
import type { LoadedCatalogs } from "../engine/catalogs.js";
import { mergeCatalogs, type NodeDef } from "../core/catalog.js";
import { collectObservations, populationPriors, topNodesByN, type Observation, type PopulationPriors } from "./population_priors.js";
import { calibrationReport, formatCalibration, cardSamples, defaultSamples, type CalibrationReport, type CalSample } from "./calibration.js";
import { fitRecalibration, formatRecalibration, writeRecalibration, type Recalibration } from "./recalibrate.js";
import { collectTraces, thetaGrid, thetaTable, formatThetaTable, type ThetaPoint } from "./theta_replay.js";
import { rewardFromEvents, updateAll, formatBandit, type BanditState, type RewardSample } from "./phrasing_bandit.js";
import { helpRequested, parseFlags, type Flags } from "../cli/flags.js";
import { learningProjectIds, parseLearningOrigins, type ProjectOrigin } from "./projects.js";

export interface LearningReport {
  projects: number;
  catalog: string;
  observations: Observation[];
  priors: PopulationPriors;
  calibration: CalibrationReport;
  /** isotonic reliability map fitted on cards + defaults samples (the Loop-B fix for the overconcentrated belief) */
  recalibration: Recalibration;
  theta: ThetaPoint[];
  bandit: { state: BanditState; samples: number };
}

/** All catalog nodes across every archetype — the universe population priors are estimated over. */
export function allCatalogNodes(catalogs: LoadedCatalogs): NodeDef[] {
  return mergeCatalogs(catalogs.catalogs, catalogs.archetypes).nodes;
}

export async function runLearning(store: Store, catalogs: LoadedCatalogs, opts: { n0?: number; thetas?: number[]; includeOrigins?: readonly ProjectOrigin[] } = {}): Promise<LearningReport> {
  const ids = await learningProjectIds(store, opts.includeOrigins);
  const nodes = allCatalogNodes(catalogs);
  const observations = await collectObservations(store, ids);
  const priors = populationPriors(observations, nodes, { n0: opts.n0 });
  const calibration = await calibrationReport(store, ids);
  const traces = await collectTraces(store, ids);
  const theta = thetaTable(traces, opts.thetas ?? thetaGrid(traces));
  // bandit: arms live on session cards, so look them up per project
  const samples: RewardSample[] = [];
  // recalibration is fitted on both sample kinds that predict "belief argmax is right": card answers + defaults
  const calSamples: CalSample[] = [];
  for (const id of ids) {
    const [events, session, sheet] = await Promise.all([store.listEvents(id), store.getSession(id), store.getLatestSheet(id)]);
    const armByCard = new Map((session?.cards ?? []).map((c) => [c.id, c.phrasing_arm]));
    samples.push(...rewardFromEvents(events, { armOf: (cardId) => armByCard.get(cardId) }));
    calSamples.push(...cardSamples(id, events), ...defaultSamples(id, events, sheet));
  }
  const recalibration = fitRecalibration(calSamples);
  const state = updateAll({}, samples);
  return { projects: ids.length, catalog: catalogs.version, observations, priors, calibration, recalibration, theta, bandit: { state, samples: samples.length } };
}

function fmtPrior(p: Record<string, number>): string {
  return Object.entries(p)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`)
    .join(", ");
}

export function formatPriors(r: LearningReport, limit = 10): string {
  const L: string[] = [];
  const byProject = new Map<string, number>();
  for (const o of r.observations) byProject.set(o.project_id, (byProject.get(o.project_id) ?? 0) + 1);
  const answers = r.observations.filter((o) => o.source === "answer").length;
  L.push(`POPULATION PRIORS — ${r.observations.length} observations (${answers} answers, ${r.observations.length - answers} overrides) from ${byProject.size} project(s), n0=${r.priors.n0}`);
  L.push(`  global (top ${limit} nodes by n)`);
  for (const t of topNodesByN(r.priors, undefined, limit)) L.push(`    ${t.node.padEnd(28)} n=${String(t.n).padStart(3)}  ${fmtPrior(t.prior)}`);
  for (const a of Object.keys(r.priors.byArchetype).sort()) {
    L.push(`  archetype ${a}`);
    for (const t of topNodesByN(r.priors, a, limit).filter((t) => t.n > 0)) L.push(`    ${t.node.padEnd(28)} n=${String(t.n).padStart(3)}  ${fmtPrior(t.prior)}`);
  }
  return L.join("\n");
}

export function formatReport(r: LearningReport): string {
  return [`LEARNING REPORT · ${r.projects} project(s) · catalog ${r.catalog}`, "", formatPriors(r), "", formatCalibration(r.calibration), "", formatRecalibration(r.recalibration), "", formatThetaTable(r.theta), "", formatBandit(r.bandit.state)].join("\n");
}

export async function writeReport(r: LearningReport, outDir: string): Promise<string[]> {
  await fs.mkdir(outDir, { recursive: true });
  const files: [string, unknown][] = [
    ["population_priors.json", { catalog: r.catalog, n0: r.priors.n0, observations: r.observations.length, byArchetype: r.priors.byArchetype, global: r.priors.global }],
    ["observations.json", r.observations],
    ["calibration.json", r.calibration],
    ["theta_replay.json", r.theta],
    ["bandit.json", r.bandit],
  ];
  const written: string[] = [];
  for (const [name, data] of files) {
    const file = path.join(outDir, name);
    await fs.writeFile(file, JSON.stringify(data, null, 2));
    written.push(file);
  }
  written.push(await writeRecalibration(r.recalibration, outDir)); // recalibration.json — the engine loads this behind a flag
  return written;
}

// ---------- CLI ----------
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  await import("../env.js"); // .env → process.env (DATABASE_URL, ZADUM_DATA_DIR)
  const args = process.argv.slice(2);
  const usage = `learn — estimate priors and calibration from real user sessions only by default\n\n  npm run learn -- [--data-dir <dir>] [--out <dir>] [--n0 N]\n                  [--include-origin mock,experiment,legacy]\n\nUser projects are always included; --include-origin ADDS the sources it names.\nProjects with no recorded origin count as legacy (see docs/LEARNING.md).`;
  if (helpRequested(args)) {
    console.log(usage);
    process.exit(0);
  }
  let flags: Flags;
  try {
    flags = parseFlags(args, { value: ["--data-dir", "--out", "--n0", "--include-origin"] });
  } catch (e) {
    console.error(`${(e as Error).message}\n\n${usage}`);
    process.exit(2);
  }
  const dataDir = flags.value("--data-dir") ?? process.env.ZADUM_DATA_DIR ?? ".zadum";
  const outDir = flags.value("--out", "learning-results");
  const rawN0 = flags.value("--n0");
  const n0 = rawN0 === undefined ? undefined : Number(rawN0);
  if (n0 !== undefined && (!Number.isFinite(n0) || n0 < 0)) throw new Error("--n0 must be a non-negative number");
  const rawOrigins = flags.value("--include-origin");
  const includeOrigins = rawOrigins === undefined ? undefined : parseLearningOrigins(rawOrigins);
  let store: Store;
  if (process.env.DATABASE_URL) {
    const { PgStore } = await import("../store/pg_store.js");
    store = await PgStore.connect(process.env.DATABASE_URL);
  } else {
    const { FileStore } = await import("../store/file_store.js");
    store = new FileStore(dataDir);
  }
  const { loadCatalogs } = await import("../engine/catalogs.js");
  const catalogs = await loadCatalogs();
  try {
    const report = await runLearning(store, catalogs, { n0, includeOrigins });
    console.log(formatReport(report));
    const files = await writeReport(report, outDir);
    console.log(`\nwritten ${files.join(", ")}`);
  } finally {
    await store.close();
  }
}
