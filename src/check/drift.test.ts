import { describe, it, expect, beforeAll } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { MemoryStore } from "../store/file_store.js";
import { MockLLM } from "../llm/client.js";
import { invoicingMockHandlers } from "../llm/mock_fixtures.js";
import { loadCatalogs } from "../engine/catalogs.js";
import { Engine } from "../engine/orchestrator.js";
import { sheetToText } from "../llm/functions.js";
import type { Sheet } from "../core/sheet.js";
import { driftCheck, formatDrift, runDriftCli } from "./drift.js";

// Empty rule-bank dir (same trick as orchestrator.test.ts) so the drafted Sheet is byte-stable regardless
// of whether catalogs/rule-bank/*.json has been mined on this machine.
let emptyRuleBankDir: string;
beforeAll(async () => {
  emptyRuleBankDir = await fs.mkdtemp(path.join(os.tmpdir(), "no-rule-bank-"));
});

async function makeProject(id: string) {
  const store = new MemoryStore();
  const llm = new MockLLM(invoicingMockHandlers);
  const catalogs = await loadCatalogs();
  const engine = new Engine(store, llm, catalogs, { precompute: false, ruleBankDir: emptyRuleBankDir });
  await engine.createProject("an invoicing app for small bookkeeping firms", { id, origin: "experiment" });
  const sheet = (await store.getLatestSheet(id))!;
  return { engine, store, sheet };
}

// The mock `reverse` handler reconstructs a sheet from a `<!-- sheet-echo … -->` comment (the same
// machine-readable echo the mock compiler embeds in spec sections), so a "document" for these tests is the
// Sheet's own prompt rendering wrapped in that block — full for agreement, edited for drift.
const asDoc = (sheetText: string) => `# Project README\n\nPeople build invoices here.\n\n<!-- sheet-echo readme\n${sheetText}\n-->`;

describe("driftCheck", () => {
  it("a doc that states the whole Sheet scores ~full recall and passes", async () => {
    const { engine, sheet } = await makeProject("d1");
    const r = await driftCheck(engine, "d1", asDoc(sheetToText(sheet)), 0.7);
    expect(r.pass).toBe(true);
    expect(r.report.recall.overall).toBeGreaterThan(0.9);
    expect(r.report.recall.rules).toBe(1);
    expect(r.report.missing.length).toBe(0);
  });

  it("a doc missing the rules reports them as missing and fails a strict threshold", async () => {
    const { engine, sheet } = await makeProject("d2");
    // simulate doc drift: every rule dropped from the document
    const truncated = sheetToText(sheet)
      .split("\n")
      .filter((l, i, all) => {
        const rulesStart = all.indexOf("RULES:");
        const nonGoalsStart = all.indexOf("NON-GOALS (not in v1):");
        return !(i > rulesStart && i < nonGoalsStart);
      })
      .join("\n");
    const r = await driftCheck(engine, "d2", asDoc(truncated), 0.9);
    expect(r.pass).toBe(false);
    expect(r.report.recall.rules).toBe(0);
    const missingRules = r.report.missing.filter((m) => m.kind === "rule");
    expect(missingRules.length).toBe(sheet.rules.length);
    expect(missingRules.map((m) => m.item)).toContain("A client never sees another client's invoice");
    // untouched kinds are unaffected
    expect(r.report.recall.actors).toBe(1);
  });

  it("a doc that invents an actor reports it as extra (an un-recorded decision)", async () => {
    const { engine, sheet } = await makeProject("d3");
    const withExtra = sheetToText(sheet).replace("ACTORS:", "ACTORS:\n- [p9] Auditor — reviews the books quarterly");
    const r = await driftCheck(engine, "d3", asDoc(withExtra), 0.7);
    expect(r.pass).toBe(true); // recall is about the Sheet's items; extras don't lower it
    expect(r.report.extra.some((e) => e.kind === "actor" && e.item === "Auditor")).toBe(true);
  });

  it("unknown project throws cleanly", async () => {
    const { engine } = await makeProject("d4");
    await expect(driftCheck(engine, "nope", "anything")).rejects.toThrow(/unknown project/);
  });
});

describe("formatDrift", () => {
  it("renders recall per kind, both drift directions, and the verdict", async () => {
    const { engine, sheet } = await makeProject("d5");
    const doc = asDoc(sheetToText(sheet).split("\n").filter((l) => !l.includes("Payroll")).join("\n").replace("ACTORS:", "ACTORS:\n- [p9] Auditor — reviews quarterly"));
    const r = await driftCheck(engine, "d5", doc, 0.99);
    const text = formatDrift(r);
    expect(text).toContain("OVERALL");
    expect(text).toContain("Missing from the docs");
    expect(text).toContain("[non_goal] Payroll");
    expect(text).toContain("un-recorded decisions");
    expect(text).toContain("[actor] Auditor");
    expect(text).toContain("FAIL");
  });
});

describe("runDriftCli (mock engine, file store in a temp dir)", () => {
  it("runs end to end: exit 0 on agreement, 1 below --min, 2 on usage errors", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "zadum-drift-"));
    // build the project through the same bootstrap path the CLI will use (FileStore under --data-dir);
    // ruleBankDir is pinned via env-free option by constructing the doc from whatever Sheet resulted
    const { buildEngine } = await import("../engine/bootstrap.js");
    const { engine, store } = await buildEngine({ mock: true, dataDir: tmp, engine: { precompute: false, ruleBankDir: emptyRuleBankDir } });
    await engine.createProject("an invoicing app for small bookkeeping firms", { id: "cli1", origin: "experiment" });
    const sheet = (await store.getLatestSheet("cli1")) as Sheet;
    const goodDoc = path.join(tmp, "README.md");
    await fs.writeFile(goodDoc, asDoc(sheetToText(sheet)));
    const badDoc = path.join(tmp, "stale.md");
    await fs.writeFile(badDoc, asDoc("ACTORS:\n- [p1] Bookkeeper\nNOUNS:\nACTIONS:\nRULES:\nNON-GOALS (not in v1):"));

    const lines: string[] = [];
    const log = (l: string) => lines.push(l);
    expect(await runDriftCli(["cli1", goodDoc, "--mock", "--data-dir", tmp], log)).toBe(0);
    expect(lines.join("\n")).toContain("PASS");

    lines.length = 0;
    expect(await runDriftCli(["cli1", badDoc, "--mock", "--data-dir", tmp, "--min", "0.7"], log)).toBe(1);
    expect(lines.join("\n")).toContain("FAIL");
    expect(lines.join("\n")).toContain("Missing from the docs");

    lines.length = 0;
    expect(await runDriftCli(["cli1"], log)).toBe(2); // no files
    lines.length = 0;
    expect(await runDriftCli(["cli1", goodDoc, "--mock", "--data-dir", tmp, "--min", "nope"], log)).toBe(2);
  });
});
