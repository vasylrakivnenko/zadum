import { describe, it, expect, beforeAll } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { MemoryStore } from "../store/file_store.js";
import { MockLLM, type LLMRequest } from "../llm/client.js";
import { invoicingMockHandlers } from "../llm/mock_fixtures.js";
import { loadCatalogs } from "../engine/catalogs.js";
import { Engine } from "../engine/orchestrator.js";
import { handleMessage, PROTOCOL_VERSION, TOOLS, type JsonRpcResponse } from "./server.js";
import { withMcpMockHandlers, mockCheckTask, renderCheckTaskInput, CheckTaskOutSchema } from "./check_task.js";

// Same isolation as orchestrator.test.ts: an empty rule-bank dir so results don't depend on whether
// catalogs/rule-bank/*.json has been mined on disk.
let emptyRuleBankDir: string;
async function makeEngine() {
  const store = new MemoryStore();
  const llm = new MockLLM(withMcpMockHandlers(invoicingMockHandlers));
  const catalogs = await loadCatalogs();
  const engine = new Engine(store, llm, catalogs, { precompute: false, ruleBankDir: emptyRuleBankDir });
  return { store, llm, engine };
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
function firstText(res: JsonRpcResponse | null): string {
  return result(res).content[0].text as string;
}

describe("MCP handshake and tool listing", () => {
  it("initialize returns the protocol version, tools capability, and serverInfo", async () => {
    const { engine } = await makeEngine();
    const r = result(await handleMessage(engine, req(1, "initialize", { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "test", version: "0" } })));
    expect(r.protocolVersion).toBe("2024-11-05");
    expect(r.capabilities).toEqual({ tools: {} });
    expect(r.serverInfo.name).toBe("zadum");
  });

  it("notifications/initialized gets no response; unknown methods error without crashing", async () => {
    const { engine } = await makeEngine();
    expect(await handleMessage(engine, { jsonrpc: "2.0", method: "notifications/initialized" })).toBeNull();
    const bad = await handleMessage(engine, req(2, "resources/list"));
    expect(bad && "error" in bad && bad.error.code).toBe(-32601);
  });

  it("tools/list exposes the four tools with input schemas", async () => {
    const { engine } = await makeEngine();
    const r = result(await handleMessage(engine, req(3, "tools/list")));
    expect(r.tools.map((t: any) => t.name)).toEqual(["get_sheet", "check_task", "propose_amendment", "record_event"]);
    for (const t of r.tools) expect(t.inputSchema.required).toContain("project_id");
    expect(r.tools).toEqual(TOOLS);
  });
});

describe("tools against a mock project", () => {
  it("get_sheet returns the rendered markdown plus a decision ledger with confidence", async () => {
    const { engine } = await makeEngine();
    await engine.createProject("an invoicing app for small bookkeeping firms", { id: "m1" });
    const res = await handleMessage(engine, req(10, "tools/call", { name: "get_sheet", arguments: { project_id: "m1" } }));
    const md = firstText(res);
    expect(md).toContain("# Design Sheet — an invoicing app");
    expect(md).toContain("## What must never happen");
    expect(md).toContain("## Decisions"); // showDecisions
    const ledger = JSON.parse(result(res).content[1].text);
    expect(ledger.decisions.length).toBeGreaterThan(10);
    const tenancy = ledger.decisions.find((d: any) => d.id === "tenancy");
    expect(tenancy.status).toBe("defaulted"); // fixed_by_sheet in the mock plan
    expect(tenancy.confidence).toBeGreaterThanOrEqual(0.95);
    for (const d of ledger.decisions) {
      expect(d).toHaveProperty("topic");
      expect(d).toHaveProperty("consequence");
      expect(typeof d.confidence).toBe("number");
    }
  });

  it("propose_amendment goes through the patcher (Rule 1) and commits", async () => {
    const { engine, store } = await makeEngine();
    await engine.createProject("an invoicing app for small bookkeeping firms", { id: "m2" });
    const before = (await store.getLatestSheet("m2"))!;
    const res = await handleMessage(engine, req(11, "tools/call", { name: "propose_amendment", arguments: { project_id: "m2", text: "Rename Service to Offering." } }));
    const out = JSON.parse(firstText(res));
    expect(out.applied.some((o: any) => o.op === "modify_noun")).toBe(true);
    expect(out.sheet_version).toBe(before.version + 1);
    const after = (await store.getLatestSheet("m2"))!;
    expect(after.nouns.map((n) => n.name)).toContain("Offering");
    expect(after.nouns.map((n) => n.name)).not.toContain("Service");
    // the change is a commit, not a raw write
    const commits = await store.listCommits("m2");
    expect(commits.at(-1)!.source.kind).toBe("user_edit");
  });

  it("check_task flags a rule-touching task, returns ok on an unrelated one, and logs an llm_call event", async () => {
    const { engine, store } = await makeEngine();
    await engine.createProject("an invoicing app for small bookkeeping firms", { id: "m3" });
    const conflictRes = await handleMessage(engine, req(12, "tools/call", { name: "check_task", arguments: { project_id: "m3", task: "Let bookkeepers edit the amounts of a sent invoice in place" } }));
    const conflict = CheckTaskOutSchema.parse(JSON.parse(firstText(conflictRes)));
    expect(conflict.verdict).toBe("conflict");
    expect(conflict.conflicts.length).toBeGreaterThan(0);
    expect(conflict.conflicts[0]!.rule_id).toMatch(/^[rg]\d+$/);

    const okRes = await handleMessage(engine, req(13, "tools/call", { name: "check_task", arguments: { project_id: "m3", task: "Refactor the logging module naming" } }));
    expect(CheckTaskOutSchema.parse(JSON.parse(firstText(okRes))).verdict).toBe("ok");

    const events = await store.listEvents("m3");
    const calls = events.filter((e) => e.type === "llm_call");
    expect(calls.length).toBe(2);
    expect(calls[0]!.payload.fn).toBe("mcp_check_task");
    expect(calls[0]!.payload.verdict).toBe("conflict");
    expect(calls[0]!.tags.prompts).toBeTruthy(); // versions-tagged like every other event
  });

  it("record_event appends notes to the agent-events.jsonl artifact (no fake EventType)", async () => {
    const { engine, store } = await makeEngine();
    await engine.createProject("an invoicing app for small bookkeeping firms", { id: "m4" });
    result(await handleMessage(engine, req(14, "tools/call", { name: "record_event", arguments: { project_id: "m4", note: "started the payments feature" } })));
    result(await handleMessage(engine, req(15, "tools/call", { name: "record_event", arguments: { project_id: "m4", note: "spec ambiguity found", payload: { file: "src/pay.ts" } } })));
    const art = (await store.listArtifacts("m4")).find((a) => a.name === "agent-events.jsonl")!;
    const lines = art.content.trim().split("\n").map((l) => JSON.parse(l));
    expect(lines.length).toBe(2);
    expect(lines[0].note).toBe("started the payments feature");
    expect(lines[1].payload.file).toBe("src/pay.ts");
    // and the typed event stream stays honest: no event was appended for these notes
    expect((await store.listEvents("m4")).filter((e) => e.type === "llm_call").length).toBe(0);
  });

  it("unknown project, unknown tool, and bad arguments come back as JSON-RPC errors", async () => {
    const { engine } = await makeEngine();
    const noProject = await handleMessage(engine, req(20, "tools/call", { name: "get_sheet", arguments: { project_id: "nope" } }));
    expect(noProject && "error" in noProject && noProject.error.code).toBe(-32000);
    expect(noProject && "error" in noProject && noProject.error.message).toContain("unknown project");
    const noTool = await handleMessage(engine, req(21, "tools/call", { name: "compile_everything", arguments: {} }));
    expect(noTool && "error" in noTool && noTool.error.code).toBe(-32602);
    const badArgs = await handleMessage(engine, req(22, "tools/call", { name: "check_task", arguments: { project_id: "x" } }));
    expect(badArgs && "error" in badArgs && badArgs.error.code).toBe(-32602);
  });
});

describe("mock check_task handler plumbing", () => {
  it("parses the rendered prompt, not canned data", async () => {
    const { engine, store } = await makeEngine();
    await engine.createProject("an invoicing app for small bookkeeping firms", { id: "m5" });
    const sheet = (await store.getLatestSheet("m5"))!;
    const user = renderCheckTaskInput(sheet, "Add multi-currency invoices support");
    const out = mockCheckTask({ fn: "mcp_check_task", tier: "strong", system: "", user, schema: CheckTaskOutSchema } as LLMRequest<unknown>);
    expect(out.verdict).toBe("conflict"); // "Multi-currency invoices" is on the Not-yet list
    expect(out.conflicts.some((c) => c.rule_id.startsWith("g"))).toBe(true);
  });
});
