/**
 * Minimal MCP (Model Context Protocol) server over stdio — the AGENTS.md protocol ("if a task changes the
 * design, update the Sheet first") as an API for coding agents. Zero dependencies: JSON-RPC 2.0 with
 * newline-delimited JSON framing (one message per line; the simpler of MCP's two stdio framings — no
 * Content-Length headers), protocol version 2024-11-05, tools capability only.
 *
 * Rule 1 (CLAUDE.md) extends to coding agents: nothing here writes the Sheet directly. `propose_amendment`
 * goes through `engine.applyUserEdit` → patcher → validated patch ops → commit, exactly like a human edit.
 *
 * Event choices (EventType in src/core/session.ts is a closed union we must not edit):
 *  - `check_task` appends an "llm_call" event — honest: the tool IS one structured LLM call, and the
 *    payload's fn/verdict fields carry the learning signal.
 *  - `record_event` has no fitting EventType (an agent's free-form note is none of the listed moments), so
 *    rather than mislabel it, notes are appended to an `agent-events.jsonl` artifact through the store's own
 *    artifact surface (kind "other") — append-only in spirit, portable across File/Memory/Pg stores.
 *
 * Error contract: every failure becomes a JSON-RPC error response (unknown method -32601, bad params -32602,
 * tool execution failure -32000 with the tool name in `data`); the process never crashes on a bad request.
 */
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { z } from "zod";
import { renderSheetMarkdown } from "../core/render.js";
import type { Artifact } from "../core/session.js";
import type { Sheet } from "../core/sheet.js";
import { PROMPTS_VERSION } from "../llm/prompts.js";
import { MockLLM } from "../llm/client.js";
import { invoicingMockHandlers } from "../llm/mock_fixtures.js";
import { buildEngine } from "../engine/bootstrap.js";
import type { Engine } from "../engine/orchestrator.js";
import { checkTask, withMcpMockHandlers } from "./check_task.js";

export const PROTOCOL_VERSION = "2024-11-05";
export const SERVER_INFO = { name: "zadum", version: "0.1.0" };

// ---------- JSON-RPC types ----------

export interface JsonRpcMessage {
  jsonrpc?: "2.0";
  id?: number | string | null;
  method?: string;
  params?: unknown;
}
export type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: number | string | null; result: unknown }
  | { jsonrpc: "2.0"; id: number | string | null; error: { code: number; message: string; data?: unknown } };

const ok = (id: number | string | null, result: unknown): JsonRpcResponse => ({ jsonrpc: "2.0", id, result });
const err = (id: number | string | null, code: number, message: string, data?: unknown): JsonRpcResponse => ({
  jsonrpc: "2.0",
  id,
  error: { code, message, ...(data !== undefined ? { data } : {}) },
});

// ---------- tool argument schemas (zod validates; the JSON Schema below is what agents see) ----------

const GetSheetArgs = z.object({ project_id: z.string().min(1) });
const CheckTaskArgs = z.object({ project_id: z.string().min(1), task: z.string().min(1) });
const ProposeAmendmentArgs = z.object({ project_id: z.string().min(1), text: z.string().min(1) });
const RecordEventArgs = z.object({ project_id: z.string().min(1), note: z.string().min(1), payload: z.record(z.string(), z.unknown()).optional() });

const pid = { type: "string", description: "zadum project id" };
export const TOOLS = [
  {
    name: "get_sheet",
    description:
      "The project's Design Sheet (the source of truth for what to build) as markdown, plus a JSON decision ledger with per-decision status and confidence. Read this before starting any task.",
    inputSchema: { type: "object", properties: { project_id: pid }, required: ["project_id"] },
  },
  {
    name: "check_task",
    description:
      "Check a proposed coding task against the Sheet's Rules, Not-yet list, and recorded decisions before doing it. Returns conflicts (with Sheet ids and severity), a verdict, and advice.",
    inputSchema: { type: "object", properties: { project_id: pid, task: { type: "string", description: "the coding task you intend to do, in one or two sentences" } }, required: ["project_id", "task"] },
  },
  {
    name: "propose_amendment",
    description:
      "Propose a design change in plain language. The change is applied to the Sheet as validated patch ops (never raw writes) and committed; do this BEFORE writing code that changes the design.",
    inputSchema: { type: "object", properties: { project_id: pid, text: { type: "string", description: "the design change, in plain language" } }, required: ["project_id", "text"] },
  },
  {
    name: "record_event",
    description: "Record a free-form note about this agent session (a decision made, a surprise, a question) so it becomes learning signal for the project.",
    inputSchema: {
      type: "object",
      properties: { project_id: pid, note: { type: "string" }, payload: { type: "object", description: "optional structured details" } },
      required: ["project_id", "note"],
    },
  },
] as const;

// ---------- tool implementations ----------

async function loadSheet(engine: Engine, projectId: string): Promise<Sheet> {
  const sheet = await engine.store.getLatestSheet(projectId);
  if (!sheet) throw new Error(`unknown project: ${projectId}`);
  return sheet;
}

function decisionLedger(sheet: Sheet) {
  return sheet.decisions.map((d) => ({
    id: d.id,
    topic: d.topic,
    status: d.status,
    chosen: d.chosen ?? null,
    chosen_label: d.chosen ? d.options.find((o) => o.id === d.chosen)?.label ?? d.chosen : null,
    // resolved = the user's own answer; the ledger reports it at full confidence so agents can rank what to trust
    confidence: d.confidence ?? (d.status === "resolved" ? 1 : 0),
    consequence: d.consequence,
  }));
}

/** Tags for events emitted outside a session context (same shape Engine.emit produces). */
function versionTags(engine: Engine) {
  return { catalog: engine.catalogs.version, prompts: PROMPTS_VERSION, models: { ...engine.llm.models } };
}

const text = (t: string) => ({ type: "text" as const, text: t });

async function callTool(engine: Engine, name: string, args: unknown): Promise<{ content: { type: "text"; text: string }[] }> {
  switch (name) {
    case "get_sheet": {
      const a = GetSheetArgs.parse(args);
      const sheet = await loadSheet(engine, a.project_id);
      const md = renderSheetMarkdown(sheet, { showIds: true, showDecisions: true, showOpenDecisions: true });
      return { content: [text(md), text(JSON.stringify({ decisions: decisionLedger(sheet) }, null, 2))] };
    }
    case "check_task": {
      const a = CheckTaskArgs.parse(args);
      const sheet = await loadSheet(engine, a.project_id);
      const res = await checkTask(engine.llm, sheet, a.task);
      await engine.store.appendEvent({
        id: randomUUID(),
        project_id: a.project_id,
        ts: new Date().toISOString(),
        type: "llm_call",
        payload: { fn: "mcp_check_task", via: "mcp", task: a.task, verdict: res.data.verdict, conflicts: res.data.conflicts, model: res.model, latency_ms: res.latency_ms, usage: res.usage },
        tags: versionTags(engine),
      });
      return { content: [text(JSON.stringify(res.data, null, 2))] };
    }
    case "propose_amendment": {
      const a = ProposeAmendmentArgs.parse(args);
      await loadSheet(engine, a.project_id); // clean "unknown project" before the LLM call
      const r = await engine.applyUserEdit(a.project_id, a.text); // Rule 1: patcher → validated ops → commit
      return {
        content: [
          text(
            JSON.stringify(
              { applied: r.applied, rejected: r.rejected.map((x) => ({ op: x.op.op, error: x.error })), dropped: r.dropped, notes: r.notes, sheet_version: r.version, implied: r.implied },
              null,
              2,
            ),
          ),
        ],
      };
    }
    case "record_event": {
      const a = RecordEventArgs.parse(args);
      await loadSheet(engine, a.project_id);
      const line = JSON.stringify({ ts: new Date().toISOString(), note: a.note, ...(a.payload ? { payload: a.payload } : {}) });
      const prev = (await engine.store.listArtifacts(a.project_id)).find((x) => x.name === "agent-events.jsonl");
      const artifact: Artifact = { project_id: a.project_id, name: "agent-events.jsonl", kind: "other", content: (prev?.content ?? "") + line + "\n", created_at: prev?.created_at ?? new Date().toISOString() };
      await engine.store.saveArtifact(artifact);
      return { content: [text(JSON.stringify({ recorded: true, where: "artifact agent-events.jsonl" }))] };
    }
    default:
      throw new McpError(-32602, `unknown tool: ${name}`);
  }
}

class McpError extends Error {
  constructor(
    public readonly code: number,
    message: string,
  ) {
    super(message);
  }
}

// ---------- message dispatch (pure over the engine; the stdio loop below is the only IO) ----------

export async function handleMessage(engine: Engine, msg: JsonRpcMessage): Promise<JsonRpcResponse | null> {
  const id = msg.id ?? null;
  const isRequest = msg.id !== undefined && msg.id !== null;
  try {
    switch (msg.method) {
      case "initialize":
        return ok(id, { protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: SERVER_INFO });
      case "notifications/initialized":
      case "notifications/cancelled":
        return null; // notifications get no response
      case "ping":
        return ok(id, {});
      case "tools/list":
        return ok(id, { tools: TOOLS });
      case "tools/call": {
        const p = msg.params as { name?: string; arguments?: unknown } | undefined;
        if (!p?.name) return err(id, -32602, "tools/call requires params.name");
        try {
          return ok(id, await callTool(engine, p.name, p.arguments ?? {}));
        } catch (e) {
          if (e instanceof McpError) return err(id, e.code, e.message);
          if (e instanceof z.ZodError) return err(id, -32602, `invalid arguments for ${p.name}: ${e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
          return err(id, -32000, (e as Error).message, { tool: p.name });
        }
      }
      default:
        return isRequest ? err(id, -32601, `method not found: ${msg.method}`) : null; // unknown notifications are ignored
    }
  } catch (e) {
    // last-resort guard: a handler bug must produce an error response, never kill the server
    return isRequest ? err(id, -32603, (e as Error).message) : null;
  }
}

// ---------- stdio loop ----------

export async function serveStdio(engine: Engine, input: NodeJS.ReadableStream = process.stdin, output: NodeJS.WritableStream = process.stdout): Promise<void> {
  const rl = createInterface({ input, terminal: false });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let msg: JsonRpcMessage;
    try {
      msg = JSON.parse(line) as JsonRpcMessage;
    } catch {
      output.write(JSON.stringify(err(null, -32700, "parse error: messages are newline-delimited JSON")) + "\n");
      continue;
    }
    const res = await handleMessage(engine, msg);
    if (res) output.write(JSON.stringify(res) + "\n");
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const mock = argv.includes("--mock");
  const di = argv.indexOf("--data-dir");
  const dataDir = di >= 0 ? argv[di + 1] : undefined; // else buildEngine falls back to ZADUM_DATA_DIR / .zadum
  const { engine } = await buildEngine({
    ...(mock ? { mock: true, llm: new MockLLM(withMcpMockHandlers(invoicingMockHandlers)) } : {}),
    ...(dataDir ? { dataDir } : {}),
    engine: { precompute: false }, // a stdio server answers requests; no speculative card work
  });
  // stdout is the protocol channel — everything human goes to stderr
  process.stderr.write(`zadum MCP server on stdio (${mock ? "mock" : "live"} LLM); newline-delimited JSON-RPC\n`);
  await serveStdio(engine);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain)
  main().catch((e) => {
    process.stderr.write(`fatal: ${(e as Error).stack ?? e}\n`);
    process.exit(1);
  });
