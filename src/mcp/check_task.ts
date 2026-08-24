/**
 * `check_task`: does a proposed coding task conflict with the Sheet's Rules / Not-yet list / recorded
 * decisions? Defined here (not in src/llm/functions.ts) because it is MCP-surface only — the engine's own
 * fixed call points must stay exactly the ten functions the orchestrator uses. Same conventions though:
 * flat zod schema in the conservative JSON-schema subset, system prompt in CRITIC_SYSTEM's style, and the
 * MockLLM handler parses the same rendered prompt text the real model sees.
 */
import { z } from "zod";
import type { LLM, LLMRequest, LLMResponse, MockHandler } from "../llm/client.js";
import { sheetToText } from "../llm/functions.js";
import type { Sheet } from "../core/sheet.js";

export const CheckTaskOutSchema = z.object({
  conflicts: z.array(
    z.object({
      rule_id: z.string(), // Sheet rule id (r*), non-goal id (g*), or decision id it conflicts with
      why: z.string(),
      severity: z.enum(["high", "medium", "low"]),
    }),
  ),
  verdict: z.enum(["ok", "conflict"]),
  advice: z.string(),
});
export type CheckTaskOut = z.infer<typeof CheckTaskOutSchema>;

export const MCP_CHECK_TASK_SYSTEM = `You are a strict reviewer of a proposed coding task against a Design Sheet. The Sheet is the source of truth for the app being built; the task comes from a coding agent about to write code. Check:
1. conflicts: places where doing the task would violate or weaken a Rule, build something on the Not-yet (out of scope) list, or contradict a recorded decision (resolved, implied, defaulted, or delegated). Cite the Sheet id (rule id, non-goal id, or decision id), quote why, and rate severity: high = security/data-leak/money or reversing a user-resolved decision; medium = wrong lifecycle, permission, or scope; low = wording or a low-confidence default worth confirming.
2. verdict: "conflict" if any conflict was found, else "ok".
3. advice: one or two sentences for the coding agent — how to proceed, or what to propose as a Sheet amendment first (the Sheet is amended before the code, never after).
Do not invent conflicts the Sheet does not support; a task the Sheet is merely silent on is "ok". Be concrete and cite ids. Return JSON only.`;

export function renderCheckTaskInput(sheet: Sheet, task: string): string {
  return `DESIGN SHEET:\n${sheetToText(sheet, { withDecisions: true })}\n\nPROPOSED CODING TASK:\n${task}`;
}

export async function checkTask(llm: LLM, sheet: Sheet, task: string): Promise<LLMResponse<CheckTaskOut>> {
  return llm.structured({
    fn: "mcp_check_task",
    tier: "strong",
    system: MCP_CHECK_TASK_SYSTEM,
    user: renderCheckTaskInput(sheet, task),
    schema: CheckTaskOutSchema,
    effort: "medium",
    maxTokens: 3000,
  });
}

/**
 * Scripted handler for `--mock` runs and tests: flags a conflict when the task shares enough content words
 * with a Sheet rule or non-goal (a crude stand-in for "the task touches what this rule protects"), so tests
 * exercise the real prompt-rendering plumbing rather than a canned verdict.
 */
export function mockCheckTask(req: LLMRequest<unknown>): CheckTaskOut {
  const task = (req.user.split("PROPOSED CODING TASK:")[1] ?? "").toLowerCase();
  const taskTokens = new Set(task.replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((t) => t.length > 3));
  const conflicts: CheckTaskOut["conflicts"] = [];
  const scan = (re: RegExp, severity: "high" | "medium") => {
    for (const m of req.user.matchAll(re)) {
      const id = m[1]!;
      const text = m[2]!.toLowerCase();
      const overlap = text.replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((t) => t.length > 3 && taskTokens.has(t));
      if (overlap.length >= 2) conflicts.push({ rule_id: id, why: `task touches: ${overlap.join(", ")}`, severity });
    }
  };
  scan(/^- \[(r\d+)\] \(\w+\) (.+?)(?: — e\.g\..*)?$/gm, "high"); // rules
  scan(/^- \[(g\d+)\] (.+)$/gm, "medium"); // non-goals
  return {
    conflicts,
    verdict: conflicts.length ? "conflict" : "ok",
    advice: conflicts.length ? "Propose a Sheet amendment first; the Sheet is amended before the code." : "No conflict found; proceed.",
  };
}

/** invoicing mock set + the MCP-only function, for `server.ts --mock` and the tests. */
export function withMcpMockHandlers(base: Record<string, MockHandler>): Record<string, MockHandler> {
  return { ...base, mcp_check_task: (req) => mockCheckTask(req) };
}
