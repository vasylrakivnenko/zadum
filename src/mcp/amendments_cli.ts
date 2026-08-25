#!/usr/bin/env node
/**
 * The owner's side of the amendment queue — the human in the loop, without needing the web app.
 *
 *   npx tsx src/mcp/amendments_cli.ts <project-id>                       list pending amendments
 *   npx tsx src/mcp/amendments_cli.ts <project-id> --all                 list every amendment and its verdict
 *   npx tsx src/mcp/amendments_cli.ts <project-id> --approve <id>        apply it to the Sheet (patcher → commit)
 *   npx tsx src/mcp/amendments_cli.ts <project-id> --reject <id> --reason "..."
 *   ... plus [--mock] (scripted LLM, no credentials) and [--data-dir <dir>].
 *
 * `--approve` is the ONLY path in this codebase that lets a coding agent's words reach the Design Sheet, and it
 * runs them through `engine.applyUserEdit` — the same patcher/commit path as an edit the owner types. Rejections
 * are kept, not deleted: a rejected amendment is a labeled example of an agent misreading the contract, which
 * docs/LEARNING.md ranks above almost anything else we log. Written with plain argv parsing (no commander
 * subcommand tree) because it is four flags and belongs next to the MCP server it guards.
 */
import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildEngine } from "../engine/bootstrap.js";
import { MockLLM } from "../llm/client.js";
import { invoicingMockHandlers } from "../llm/mock_fixtures.js";
import { withMcpMockHandlers } from "./check_task.js";
import { approveAmendment, listAmendments, rejectAmendment, type Amendment, type AmendmentStatus } from "./amendments.js";

const USAGE = `usage: npx tsx src/mcp/amendments_cli.ts <project-id> [--approve <id>] [--reject <id> --reason "..."] [--all] [--status pending|approved|rejected] [--mock] [--data-dir <dir>]`;

export interface CliArgs {
  projectId: string;
  approve?: string;
  reject?: string;
  reason?: string;
  status?: AmendmentStatus | "all";
  mock: boolean;
  dataDir?: string;
}

const VALUE_FLAGS = ["--approve", "--reject", "--reason", "--status", "--data-dir"] as const;

export function parseArgs(argv: string[]): CliArgs {
  const values: Record<string, string> = {};
  const positional: string[] = [];
  let mock = false;
  let all = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--mock") mock = true;
    else if (a === "--all") all = true;
    else if ((VALUE_FLAGS as readonly string[]).includes(a)) {
      const v = argv[++i];
      // a flag as the value means the real value was forgotten (`--approve --mock` must not queue up "--mock"
      // as an amendment id and report "unknown amendment: --mock")
      if (v === undefined || v.startsWith("--")) throw new Error(`${a} needs a value`);
      values[a] = v;
    } else if (a.startsWith("--")) throw new Error(`unknown flag ${a}`);
    else positional.push(a);
  }
  const projectId = positional[0];
  if (!projectId) throw new Error("a project id is required");
  const status = values["--status"];
  if (status && !["pending", "approved", "rejected"].includes(status)) throw new Error(`unknown --status "${status}"`);
  const out: CliArgs = { projectId, mock };
  if (values["--approve"]) out.approve = values["--approve"];
  if (values["--reject"]) out.reject = values["--reject"];
  if (values["--reason"]) out.reason = values["--reason"];
  if (values["--data-dir"]) out.dataDir = values["--data-dir"];
  if (all) out.status = "all";
  else if (status) out.status = status as AmendmentStatus;
  if (out.approve && out.reject) throw new Error("--approve and --reject are mutually exclusive");
  return out;
}

const ago = (iso: string, now = Date.now()): string => {
  const ms = now - Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  return hrs < 48 ? `${hrs}h ago` : `${Math.round(hrs / 24)}d ago`;
};

/** One amendment, readable: who / when / what / where it stands. */
export function formatAmendment(a: Amendment, now = Date.now()): string {
  const mark = a.status === "pending" ? "•" : a.status === "approved" ? "✓" : "✗";
  const lines = [`${mark} ${a.id}  ${a.status.toUpperCase()}  —  ${a.proposed_by}, ${ago(a.proposed_at, now)}  (sheet v${a.sheet_version_at_proposal})`];
  for (const l of a.text.trim().split("\n")) lines.push(`    ${l}`);
  if (a.rationale) lines.push(`    why: ${a.rationale}`);
  if (a.result) lines.push(`    applied: ${a.result.applied_ops} op(s) → sheet v${a.result.sheet_version}${a.result.applied.length ? ` (${a.result.applied.join(", ")})` : ""}`);
  if (a.reason) lines.push(`    rejected because: ${a.reason}`);
  return lines.join("\n");
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  let args: CliArgs;
  try {
    args = parseArgs(argv);
  } catch (e) {
    console.error(`error: ${(e as Error).message}\n${USAGE}`);
    return 2;
  }
  const { engine, store } = await buildEngine({
    ...(args.mock ? { mock: true, llm: new MockLLM(withMcpMockHandlers(invoicingMockHandlers)) } : {}),
    ...(args.dataDir ? { dataDir: args.dataDir } : {}),
    engine: { precompute: false },
  });
  try {
    if (!(await store.getProject(args.projectId))) {
      console.error(`error: unknown project: ${args.projectId}`);
      return 1;
    }
    if (args.approve) {
      const a = await approveAmendment(engine, args.projectId, args.approve);
      console.log(`approved ${a.id} — ${a.result!.applied_ops} op(s) applied, Sheet is now v${a.result!.sheet_version}`);
      if (a.result!.applied_ops === 0) console.log(`  (nothing applied: ${a.result!.notes || "the patcher produced no valid ops"})`);
      for (const r of a.result!.rejected) console.log(`  rejected op ${r.op}: ${r.error}`);
      return 0;
    }
    if (args.reject) {
      const a = await rejectAmendment(store, args.projectId, args.reject, args.reason);
      console.log(`rejected ${a.id}${a.reason ? ` — ${a.reason}` : ""} (the Sheet is untouched; the record is kept as learning signal)`);
      return 0;
    }
    const status = args.status === "all" ? undefined : (args.status ?? "pending");
    const list = await listAmendments(store, args.projectId, status);
    if (!list.length) {
      console.log(status ? `no ${status} amendments for ${args.projectId}` : `no amendments for ${args.projectId}`);
      return 0;
    }
    console.log(`${list.length} ${status ?? "total"} amendment(s) for ${args.projectId}:\n`);
    for (const a of list) console.log(formatAmendment(a) + "\n");
    if (list.some((a) => a.status === "pending")) console.log(`approve:  npx tsx src/mcp/amendments_cli.ts ${args.projectId} --approve <id>\nreject:   npx tsx src/mcp/amendments_cli.ts ${args.projectId} --reject <id> --reason "..."`);
    return 0;
  } catch (e) {
    console.error(`error: ${(e as Error).message}`);
    return 1;
  } finally {
    await store.close();
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain)
  main().then(
    (code) => process.exit(code),
    (e: Error) => {
      console.error(`fatal: ${e.stack ?? e}`);
      process.exit(1);
    },
  );
