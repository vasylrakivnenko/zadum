/**
 * Selector regression gate for CI: the mock harness must reproduce the committed baseline EXACTLY — same
 * asked-node sequences per gold, same AUC. This mechanizes the working agreement that selector changes are
 * decided by the harness, never by argument: any diff here means selector-visible behavior changed and the
 * change must either be reverted or (if intentional and harness-won) the baseline regenerated with
 * `npm run harness:baseline` and justified in the commit.
 *
 *   npm run harness:check      — compare a fresh mock run against scripts/mock-harness-baseline.json
 *   npm run harness:baseline   — regenerate the baseline from a fresh mock run (deliberate changes only)
 */
import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

const BASELINE = path.resolve("scripts/mock-harness-baseline.json");

interface Baseline {
  auc_0_12: number;
  golds: Record<string, string[]>;
}

async function freshRun(): Promise<Baseline> {
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "harness-reg-"));
  execFileSync("npx", ["tsx", "src/harness/run.ts", "--mock", "--out", out], { stdio: "pipe" });
  const files = (await fs.readdir(out)).filter((f) => f.endsWith(".json"));
  if (files.length !== 1) throw new Error(`expected exactly one results file, got: ${files.join(", ")}`);
  const d = JSON.parse(await fs.readFile(path.join(out, files[0]!), "utf8")) as {
    summary: { auc_0_12: number };
    results: { gold_id: string; asked_nodes: string[] }[];
  };
  return { auc_0_12: Math.round(d.summary.auc_0_12 * 1e6) / 1e6, golds: Object.fromEntries(d.results.map((r) => [r.gold_id, r.asked_nodes])) };
}

const mode = process.argv[2] ?? "check";
const fresh = await freshRun();

if (mode === "baseline") {
  await fs.writeFile(BASELINE, JSON.stringify(fresh, null, 2) + "\n");
  console.log(`baseline written: ${BASELINE} (AUC ${fresh.auc_0_12})`);
  process.exit(0);
}

const base = JSON.parse(await fs.readFile(BASELINE, "utf8")) as Baseline;
const problems: string[] = [];
if (fresh.auc_0_12 !== base.auc_0_12) problems.push(`AUC drifted: baseline ${base.auc_0_12} → fresh ${fresh.auc_0_12}`);
for (const [gold, asked] of Object.entries(base.golds)) {
  const got = fresh.golds[gold];
  if (!got) problems.push(`gold ${gold} missing from fresh run`);
  else if (JSON.stringify(got) !== JSON.stringify(asked)) problems.push(`asked-node sequence changed for ${gold}:\n  baseline: ${asked.join(",")}\n  fresh:    ${got.join(",")}`);
}
for (const gold of Object.keys(fresh.golds)) if (!base.golds[gold]) problems.push(`new gold ${gold} not in baseline (regenerate deliberately)`);

if (problems.length) {
  console.error(`SELECTOR REGRESSION — mock harness diverged from the committed baseline:\n${problems.map((p) => `  · ${p}`).join("\n")}`);
  console.error(`\nIf this change is intentional and harness-justified: npm run harness:baseline, commit it with the rationale.`);
  process.exit(1);
}
console.log(`harness regression check OK (AUC ${fresh.auc_0_12}, ${Object.keys(base.golds).length} golds byte-identical)`);
