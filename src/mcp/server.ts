/**
 * Minimal MCP (Model Context Protocol) server over stdio — the AGENTS.md protocol ("if a task changes the
 * design, update the Sheet first") as an API for coding agents. Zero dependencies: JSON-RPC 2.0 with
 * newline-delimited JSON framing (one message per line; the simpler of MCP's two stdio framings — no
 * Content-Length headers), protocol version 2024-11-05, tools capability only.
 *
 * Rule 1 (CLAUDE.md) extends to coding agents: nothing here writes the Sheet. It is stronger than Rule 1 now —
 * `propose_amendment` does not write the Sheet even through the patcher. It STAGES the proposal on an
 * amendment queue (./amendments.ts) and the project's owner approves or rejects it; approval is the only path
 * to `engine.applyUserEdit`. Before this, any connected coding agent could rewrite the contract the business
 * owner is supposed to control — validated patch ops, but no human in the loop.
 *
 * That gate is also the flywheel's best data: docs/LEARNING.md ranks post-session edits as source of truth #1,
 * and approved-vs-rejected agent amendments are exactly that, labeled — an approved one is a real post-session
 * edit, a rejected one is a labeled example of an agent misreading the contract.
 *
 * Event choices (EventType in src/core/session.ts is a closed union we must not edit):
 *  - `check_task` appends an "llm_call" event — honest: the tool IS one structured LLM call, and the
 *    payload's fn/verdict fields carry the learning signal.
 *  - `record_event` has no fitting EventType (an agent's free-form note is none of the listed moments), so
 *    rather than mislabel it, notes are appended to an `agent-events.jsonl` artifact through the store's own
 *    artifact surface (kind "other") — append-only in spirit, portable across File/Memory/Pg stores.
 *  - `propose_amendment` / `list_amendments` likewise fabricate no ZEvent: the queue is the `amendments.json`
 *    artifact and each transition appends a line to the same `agent-events.jsonl` trail. Only approval emits
 *    real typed events, via `applyUserEdit`, because only then was an edit really applied.
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
import type { Sheet } from "../core/sheet.js";
import { PROMPTS_VERSION } from "../llm/prompts.js";
import { MockLLM } from "../llm/client.js";
import { invoicingMockHandlers } from "../llm/mock_fixtures.js";
import { buildEngine } from "../engine/bootstrap.js";
import type { Engine } from "../engine/orchestrator.js";
import { checkTask, withMcpMockHandlers } from "./check_task.js";
import { amendmentSummary, appendAgentEvent, listAmendments, queueAmendment } from "./amendments.js";

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
const ProposeAmendmentArgs = z.object({
  project_id: z.string().min(1),
  text: z.string().min(1),
  proposed_by: z.string().optional(),
  rationale: z.string().optional(),
});
const ListAmendmentsArgs = z.object({ project_id: z.string().min(1), status: z.enum(["pending", "approved", "rejected"]).optional() });
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
      "Propose a design change in plain language. The proposal is QUEUED for the project's owner to approve or reject — it does NOT change the Sheet. Do not assume the Sheet changed, and do not write code that depends on the change until the owner approves it (re-read get_sheet to confirm). Propose BEFORE writing code that changes the design.",
    inputSchema: {
      type: "object",
      properties: {
        project_id: pid,
        text: { type: "string", description: "the design change, in plain language the owner can judge" },
        rationale: { type: "string", description: "optional: why the change is needed (what you hit in the code)" },
        proposed_by: { type: "string", description: "optional: who is proposing, e.g. your agent/tool name (default \"coding agent\")" },
      },
      required: ["project_id", "text"],
    },
  },
  {
    name: "list_amendments",
    description:
      "List amendments proposed for this project and where each one stands: pending (waiting on the owner), approved (applied to the Sheet), or rejected (with the owner's reason). Use it to check whether a proposal of yours has been decided.",
    inputSchema: {
      type: "object",
      properties: { project_id: pid, status: { type: "string", enum: ["pending", "approved", "rejected"], description: "optional filter; omit for all" } },
      required: ["project_id"],
    },
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
      const sheet = await loadSheet(engine, a.project_id); // clean "unknown project" first
      // Staged, not applied: the owner's approval is the only path to the Sheet (see ./amendments.ts).
      const am = await queueAmendment(engine.store, a.project_id, {
        text: a.text,
        ...(a.rationale ? { rationale: a.rationale } : {}),
        ...(a.proposed_by ? { proposed_by: a.proposed_by } : {}),
        sheet_version: sheet.version,
      });
      return {
        content: [
          text(
            JSON.stringify(
              {
                queued: true,
                applied: false,
                sheet_changed: false,
                amendment_id: am.id,
                status: am.status,
                sheet_version: sheet.version, // unchanged
                message:
                  "QUEUED for the project owner, not applied. The Design Sheet is unchanged and this proposal may be rejected. Do not assume the change is in effect: keep building to the current Sheet, and check list_amendments (or re-read get_sheet) before relying on it.",
              },
              null,
              2,
            ),
          ),
        ],
      };
    }
    case "list_amendments": {
      const a = ListAmendmentsArgs.parse(args);
      await loadSheet(engine, a.project_id);
      const list = await listAmendments(engine.store, a.project_id, a.status);
      return { content: [text(JSON.stringify({ count: list.length, amendments: list.map(amendmentSummary) }, null, 2))] };
    }
    case "record_event": {
      const a = RecordEventArgs.parse(args);
      await loadSheet(engine, a.project_id);
      await appendAgentEvent(engine.store, a.project_id, { ts: new Date().toISOString(), note: a.note, ...(a.payload ? { payload: a.payload } : {}) });
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
