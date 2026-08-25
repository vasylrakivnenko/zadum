/**
 * The amendment queue: an agent's proposal must never reach the Sheet on its own, and the owner's approval
 * must be the only thing that moves it. Same fixtures as mcp.test.ts (MemoryStore + MockLLM + real catalogs)
 * so the patcher plumbing on the approval path is the real one.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { MemoryStore } from "../store/file_store.js";
import { MockLLM } from "../llm/client.js";
import { invoicingMockHandlers } from "../llm/mock_fixtures.js";
import { loadCatalogs } from "../engine/catalogs.js";
import { Engine } from "../engine/orchestrator.js";
import { handleMessage, type JsonRpcResponse } from "./server.js";
import { withMcpMockHandlers } from "./check_task.js";
import { AMENDMENTS_ARTIFACT, approveAmendment, listAmendments, queueAmendment, rejectAmendment } from "./amendments.js";
import { formatAmendment, parseArgs } from "./amendments_cli.js";

let emptyRuleBankDir: string;
async function makeEngine(projectId: string) {
  const store = new MemoryStore();
  const llm = new MockLLM(withMcpMockHandlers(invoicingMockHandlers));
  const catalogs = await loadCatalogs();
  const engine = new Engine(store, llm, catalogs, { precompute: false, ruleBankDir: emptyRuleBankDir });
  await engine.createProject("an invoicing app for small bookkeeping firms", { id: projectId });
  return { store, engine };
}

beforeAll(async () => {
  emptyRuleBankDir = await fs.mkdtemp(path.join(os.tmpdir(), "no-rule-bank-"));
});

function req(id: number, method: string, params?: unknown) {
  return { jsonrpc: "2.0" as const, id, method, ...(params !== undefined ? { params } : {}) };
}
function result(res: JsonRpcResponse | null): any {
  expect(res).not.toBeNull();
  expect(res && "error" in res ? (res as any).error : undefined).toBeUndefined();
  return (res as any).result;
}
const firstJson = (res: JsonRpcResponse | null) => JSON.parse(result(res).content[0].text);

const RENAME = "Rename Service to Offering.";

describe("propose_amendment stages; nothing else writes the Sheet", () => {
  it("queues a pending record and leaves the Sheet version untouched", async () => {
    const { engine, store } = await makeEngine("a1");
    const before = (await store.getLatestSheet("a1"))!;
    const out = firstJson(
      await handleMessage(engine, req(1, "tools/call", { name: "propose_amendment", arguments: { project_id: "a1", text: RENAME, rationale: "the code calls it an Offering", proposed_by: "claude-code" } })),
    );
    expect(out.queued).toBe(true);
    expect(out.applied).toBe(false);
    expect(out.amendment_id).toMatch(/^[0-9a-f]{8}$/);

    expect((await store.getLatestSheet("a1"))!.version).toBe(before.version);

    const queue = await listAmendments(store, "a1");
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      id: out.amendment_id,
      status: "pending",
      text: RENAME,
      rationale: "the code calls it an Offering",
      proposed_by: "claude-code",
      sheet_version_at_proposal: before.version,
    });
    expect(Date.parse(queue[0]!.proposed_at)).not.toBeNaN();
    expect(queue[0]!.result).toBeUndefined();
  });

  it("defaults proposed_by, persists through the amendments.json artifact, and leaves an append-only trail", async () => {
    const { engine, store } = await makeEngine("a2");
    await handleMessage(engine, req(2, "tools/call", { name: "propose_amendment", arguments: { project_id: "a2", text: "Add a Reminder noun." } }));
    const art = (await store.listArtifacts("a2")).find((a) => a.name === AMENDMENTS_ARTIFACT)!;
    expect(art.kind).toBe("other");
    const parsed = JSON.parse(art.content);
    expect(parsed.format).toBe(1);
    expect(parsed.amendments[0].proposed_by).toBe("coding agent");
    expect(art.meta).toMatchObject({ total: 1, pending: 1, approved: 0, rejected: 0 });

    const trail = (await store.listArtifacts("a2")).find((a) => a.name === "agent-events.jsonl")!;
    const lines = trail.content.trim().split("\n").map((l) => JSON.parse(l));
    expect(lines).toHaveLength(1);
    expect(lines[0].kind).toBe("amendment_queued");
    // and no ZEvent was fabricated for the proposal (EventType has no honest member for it)
    const events = await store.listEvents("a2");
    expect(events.some((e) => e.type === "edit_applied")).toBe(false);
  });

  it("list_amendments returns the queue and filters by status", async () => {
    const { engine, store } = await makeEngine("a3");
    const one = firstJson(await handleMessage(engine, req(3, "tools/call", { name: "propose_amendment", arguments: { project_id: "a3", text: RENAME } })));
    firstJson(await handleMessage(engine, req(4, "tools/call", { name: "propose_amendment", arguments: { project_id: "a3", text: "Drop the reminders feature." } })));
    await rejectAmendment(store, "a3", one.amendment_id, "we still call it a Service");

    const all = firstJson(await handleMessage(engine, req(5, "tools/call", { name: "list_amendments", arguments: { project_id: "a3" } })));
    expect(all.count).toBe(2);
    const pending = firstJson(await handleMessage(engine, req(6, "tools/call", { name: "list_amendments", arguments: { project_id: "a3", status: "pending" } })));
    expect(pending.count).toBe(1);
    expect(pending.amendments[0].text).toBe("Drop the reminders feature.");
    const rejected = firstJson(await handleMessage(engine, req(7, "tools/call", { name: "list_amendments", arguments: { project_id: "a3", status: "rejected" } })));
    expect(rejected.amendments[0]).toMatchObject({ id: one.amendment_id, status: "rejected", reason: "we still call it a Service" });
  });
});

describe("owner-side approval is the only path to the Sheet", () => {
  it("approveAmendment applies via the patcher, commits, and records the outcome", async () => {
    const { engine, store } = await makeEngine("a4");
    const before = (await store.getLatestSheet("a4"))!;
    const queued = await queueAmendment(store, "a4", { text: RENAME, sheet_version: before.version });

    const decided = await approveAmendment(engine, "a4", queued.id);
    expect(decided.status).toBe("approved");
    expect(decided.decided_at).toBeTruthy();
    expect(decided.text).toBe(RENAME); // the record keeps what was asked for, verbatim
    expect(decided.result!.applied_ops).toBeGreaterThan(0);
    expect(decided.result!.applied).toContain("modify_noun");

    const after = (await store.getLatestSheet("a4"))!;
    expect(after.version).toBe(before.version + 1);
    expect(decided.result!.sheet_version).toBe(after.version);
    expect(after.nouns.map((n) => n.name)).toContain("Offering");
    // Rule 2: a commit, not a raw write — and Rule 1's patcher path, same as a human edit
    expect((await store.listCommits("a4")).at(-1)!.source.kind).toBe("user_edit");

    // the queue reflects the verdict, and the trail got its append-only line
    expect((await listAmendments(store, "a4", "pending"))).toHaveLength(0);
    const trail = (await store.listArtifacts("a4")).find((a) => a.name === "agent-events.jsonl")!;
    expect(trail.content).toContain("amendment_approved");
  });

  it("rejectAmendment leaves the Sheet untouched and keeps the record as learning signal", async () => {
    const { engine, store } = await makeEngine("a5");
    const before = (await store.getLatestSheet("a5"))!;
    const commits = (await store.listCommits("a5")).length;
    const queued = await queueAmendment(store, "a5", { text: RENAME, sheet_version: before.version, proposed_by: "some agent" });

    const decided = await rejectAmendment(store, "a5", queued.id, "  the owner calls it a Service  ");
    expect(decided.status).toBe("rejected");
    expect(decided.reason).toBe("the owner calls it a Service");
    expect(decided.result).toBeUndefined();

    const after = (await store.getLatestSheet("a5"))!;
    expect(after.version).toBe(before.version);
    expect(after.nouns.map((n) => n.name)).not.toContain("Offering");
    expect((await store.listCommits("a5")).length).toBe(commits);
    // kept, not deleted: text + proposer + both timestamps survive the decision
    const kept = (await listAmendments(store, "a5"))[0]!;
    expect(kept).toMatchObject({ text: RENAME, proposed_by: "some agent", status: "rejected" });
    expect(Date.parse(kept.decided_at!)).toBeGreaterThanOrEqual(Date.parse(kept.proposed_at));
  });

  it("unknown and already-decided ids error cleanly, without touching the Sheet", async () => {
    const { engine, store } = await makeEngine("a6");
    const before = (await store.getLatestSheet("a6"))!;
    await expect(approveAmendment(engine, "a6", "deadbeef")).rejects.toThrow(/unknown amendment: deadbeef/);
    await expect(rejectAmendment(store, "a6", "deadbeef")).rejects.toThrow(/unknown amendment/);

    const queued = await queueAmendment(store, "a6", { text: RENAME, sheet_version: before.version });
    await approveAmendment(engine, "a6", queued.id);
    const applied = (await store.getLatestSheet("a6"))!.version;

    await expect(approveAmendment(engine, "a6", queued.id)).rejects.toThrow(/already approved/);
    await expect(rejectAmendment(store, "a6", queued.id)).rejects.toThrow(/already approved/);
    expect((await store.getLatestSheet("a6"))!.version).toBe(applied); // no double-apply
  });

  it("concurrent proposals do not lose each other (serialized read-modify-write)", async () => {
    const { store } = await makeEngine("a7");
    const v = (await store.getLatestSheet("a7"))!.version;
    await Promise.all([1, 2, 3, 4, 5].map((n) => queueAmendment(store, "a7", { text: `change ${n}`, sheet_version: v })));
    const list = await listAmendments(store, "a7");
    expect(list).toHaveLength(5);
    expect(new Set(list.map((a) => a.id)).size).toBe(5);
  });
});

describe("JSON-RPC error paths still behave", () => {
  it("unknown project, bad status, and missing text come back as errors", async () => {
    const { engine } = await makeEngine("a8");
    const noProject = await handleMessage(engine, req(30, "tools/call", { name: "list_amendments", arguments: { project_id: "nope" } }));
    expect(noProject && "error" in noProject && noProject.error.code).toBe(-32000);
    const badStatus = await handleMessage(engine, req(31, "tools/call", { name: "list_amendments", arguments: { project_id: "a8", status: "maybe" } }));
    expect(badStatus && "error" in badStatus && badStatus.error.code).toBe(-32602);
    const noText = await handleMessage(engine, req(32, "tools/call", { name: "propose_amendment", arguments: { project_id: "a8" } }));
    expect(noText && "error" in noText && noText.error.code).toBe(-32602);
  });
});

describe("owner CLI", () => {
  it("parses flags and rejects contradictory ones", () => {
    expect(parseArgs(["p1"])).toEqual({ projectId: "p1", mock: false });
    expect(parseArgs(["p1", "--approve", "ab12cd34", "--mock", "--data-dir", "/tmp/d"])).toEqual({ projectId: "p1", mock: true, approve: "ab12cd34", dataDir: "/tmp/d" });
    expect(parseArgs(["p1", "--reject", "x", "--reason", "no"])).toMatchObject({ reject: "x", reason: "no" });
    expect(parseArgs(["p1", "--all"]).status).toBe("all");
    expect(() => parseArgs([])).toThrow(/project id/);
    expect(() => parseArgs(["p1", "--approve", "a", "--reject", "b"])).toThrow(/mutually exclusive/);
    expect(() => parseArgs(["p1", "--status", "soon"])).toThrow(/unknown --status/);
    expect(() => parseArgs(["p1", "--approve"])).toThrow(/needs a value/);
    expect(() => parseArgs(["p1", "--approve", "--mock"])).toThrow(/needs a value/); // a forgotten id must not become one
    expect(() => parseArgs(["p1", "--verbose"])).toThrow(/unknown flag/);
  });

  it("renders a pending amendment readably", async () => {
    const { store } = await makeEngine("a9");
    const a = await queueAmendment(store, "a9", { text: RENAME, sheet_version: 1, proposed_by: "claude-code", rationale: "code says Offering" });
    const out = formatAmendment(a);
    expect(out).toContain(a.id);
    expect(out).toContain("PENDING");
    expect(out).toContain("claude-code");
    expect(out).toContain(RENAME);
    expect(out).toContain("code says Offering");
  });
});
