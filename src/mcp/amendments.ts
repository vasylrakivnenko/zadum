/**
 * The amendment queue — the human-in-the-loop gate between a coding agent and the Design Sheet.
 *
 * WHY THIS EXISTS. Rule 1 (CLAUDE.md) says the LLM never writes the Sheet: it proposes patch ops that
 * `src/core/patch.ts` validates. `propose_amendment` honored that mechanically — but it called
 * `engine.applyUserEdit` straight through, so ANY connected coding agent could rewrite the contract the
 * business owner is supposed to own, with no human in the loop. Mechanically safe, politically wrong: the
 * Sheet is the owner's, and "user edit" must mean a user. So an agent's proposal is now STAGED here, and the
 * owner's approval is the ONLY path that writes the Sheet.
 *
 * WHY IT'S ALSO THE FLYWHEEL'S BEST DATA. docs/LEARNING.md ranks post-session edits through the change
 * protocol as source of truth #1. An approved amendment is exactly that — a real post-session edit, labeled
 * with who asked for it and what it did to the Sheet. A REJECTED one is even rarer and better: a labeled
 * example of a coding agent misreading the contract (a card that was misunderstood, a default that read as
 * permission, a rule the drafter never wrote down). Both are only worth anything if the record survives the
 * decision, so every amendment keeps its full text, rationale, proposer, both timestamps, the verdict, the
 * rejection reason, and the sheet version before and after.
 *
 * STORAGE CHOICE. `EventType` in src/core/session.ts is a closed union and this change may not edit that file,
 * so there is no honest typed event for "amendment queued" — inventing one by mislabeling (`edit_applied` for
 * something that was NOT applied) would corrupt the very stream the learning loop reads. Instead:
 *   - the queue itself is an artifact, `amendments.json` (kind "other"), read-modify-written as a whole list.
 *     Artifacts upsert by (project_id, name) in all three stores (File / Memory / Pg), so it is portable and
 *     needs no schema change. It is mutable by design — a status flips in place — which is what makes the
 *     second half necessary:
 *   - every state transition (queued / approved / rejected) also appends one line to `agent-events.jsonl`,
 *     the same append-only artifact `record_event` already uses. That is the audit trail: amendments.json says
 *     what the queue is NOW, the jsonl says what happened and when, and nothing overwrites history.
 * The typed event stream stays honest: no ZEvent is fabricated for a proposal. `approveAmendment` produces
 * real `edit_applied` events, but only because `engine.applyUserEdit` genuinely applied an edit.
 *
 * CONCURRENCY. Read-modify-write of a whole list is racy in principle. Writes here are serialized per project
 * through an in-process promise chain, which covers the real topology (one stdio server process, sequential
 * JSON-RPC lines). Two processes writing at once (server + CLI approving simultaneously) can still lose an
 * update; the fix if that ever matters is a store-level append surface, not a lock here.
 */
import { randomUUID } from "node:crypto";
import type { Artifact } from "../core/session.js";
import type { Store } from "../store/store.js";
import type { Engine } from "../engine/orchestrator.js";

export const AMENDMENTS_ARTIFACT = "amendments.json";
export const AGENT_EVENTS_ARTIFACT = "agent-events.jsonl";
export const AMENDMENTS_FORMAT_VERSION = 1;

export type AmendmentStatus = "pending" | "approved" | "rejected";

/** What was applied when the owner approved — kept for learning (LEARNING.md source #1). */
export interface AmendmentResult {
  /** Sheet version after the edit (equals `sheet_version_at_proposal` when nothing applied). */
  sheet_version: number;
  applied_ops: number;
  /** op kinds only; the full ops live in the commit history, this is the summary a report can group by */
  applied: string[];
  rejected: { op: string; error: string }[];
  dropped: { op: string; reason: string }[];
  notes: string;
}

export interface Amendment {
  id: string;
  project_id: string;
  /** the proposed design change, in the agent's own plain language — verbatim, never normalized */
  text: string;
  rationale?: string;
  proposed_by: string;
  proposed_at: string;
  /** Sheet version the agent was looking at; a later version means it proposed against a stale contract */
  sheet_version_at_proposal: number;
  status: AmendmentStatus;
  decided_at?: string;
  /** free-form: the owner's reason for rejecting (the labeled part of a negative example) */
  reason?: string;
  result?: AmendmentResult;
}

// ---------- artifact read/write ----------

interface AmendmentsFile {
  format: number;
  amendments: Amendment[];
}

async function readFile(store: Store, projectId: string): Promise<{ list: Amendment[]; created_at?: string }> {
  const art = (await store.listArtifacts(projectId)).find((a) => a.name === AMENDMENTS_ARTIFACT);
  if (!art) return { list: [] };
  try {
    const parsed = JSON.parse(art.content) as AmendmentsFile;
    return { list: Array.isArray(parsed.amendments) ? parsed.amendments : [], created_at: art.created_at };
  } catch {
    // a corrupt queue must not brick the server; treat it as empty but keep the old artifact's birthday
    return { list: [], created_at: art.created_at };
  }
}

async function writeFile(store: Store, projectId: string, list: Amendment[], created_at?: string): Promise<void> {
  const body: AmendmentsFile = { format: AMENDMENTS_FORMAT_VERSION, amendments: list };
  const artifact: Artifact = {
    project_id: projectId,
    name: AMENDMENTS_ARTIFACT,
    kind: "other",
    content: JSON.stringify(body, null, 2) + "\n",
    created_at: created_at ?? new Date().toISOString(),
    meta: {
      total: list.length,
      pending: list.filter((a) => a.status === "pending").length,
      approved: list.filter((a) => a.status === "approved").length,
      rejected: list.filter((a) => a.status === "rejected").length,
    },
  };
  await store.saveArtifact(artifact);
}

/** Append one line to the shared append-only agent trail (also used by `record_event`). */
export async function appendAgentEvent(store: Store, projectId: string, entry: Record<string, unknown>): Promise<void> {
  const prev = (await store.listArtifacts(projectId)).find((a) => a.name === AGENT_EVENTS_ARTIFACT);
  const artifact: Artifact = {
    project_id: projectId,
    name: AGENT_EVENTS_ARTIFACT,
    kind: "other",
    content: (prev?.content ?? "") + JSON.stringify(entry) + "\n",
    created_at: prev?.created_at ?? new Date().toISOString(),
  };
  await store.saveArtifact(artifact);
}

/** Per-project write serialization (see CONCURRENCY in the header). */
const chains = new Map<string, Promise<unknown>>();
function serialized<T>(projectId: string, fn: () => Promise<T>): Promise<T> {
  const prev = chains.get(projectId) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  chains.set(
    projectId,
    next.catch(() => undefined),
  );
  return next;
}

// ---------- reads ----------

/** The queue, newest first. `status` filters; omit it for everything. */
export async function listAmendments(store: Store, projectId: string, status?: AmendmentStatus): Promise<Amendment[]> {
  const { list } = await readFile(store, projectId);
  const filtered = status ? list.filter((a) => a.status === status) : list;
  return [...filtered].sort((a, b) => (a.proposed_at < b.proposed_at ? 1 : a.proposed_at > b.proposed_at ? -1 : 0));
}

export async function getAmendment(store: Store, projectId: string, id: string): Promise<Amendment | null> {
  const { list } = await readFile(store, projectId);
  return list.find((a) => a.id === id) ?? null;
}

// ---------- the agent side: stage, never apply ----------

export interface QueueInput {
  text: string;
  proposed_by?: string;
  rationale?: string;
  /** the Sheet version the proposer was looking at */
  sheet_version: number;
  now?: string;
  id?: string;
}

/**
 * Stage an agent's proposal. Deliberately does NOT touch the Sheet — no patcher, no commit, no LLM call.
 * The Sheet moves only in `approveAmendment`.
 */
export async function queueAmendment(store: Store, projectId: string, input: QueueInput): Promise<Amendment> {
  return serialized(projectId, async () => {
    const { list, created_at } = await readFile(store, projectId);
    const amendment: Amendment = {
      id: input.id ?? shortId(),
      project_id: projectId,
      text: input.text,
      ...(input.rationale ? { rationale: input.rationale } : {}),
      proposed_by: input.proposed_by?.trim() || "coding agent",
      proposed_at: input.now ?? new Date().toISOString(),
      sheet_version_at_proposal: input.sheet_version,
      status: "pending",
    };
    await writeFile(store, projectId, [...list, amendment], created_at);
    await appendAgentEvent(store, projectId, {
      ts: amendment.proposed_at,
      kind: "amendment_queued",
      amendment_id: amendment.id,
      proposed_by: amendment.proposed_by,
      text: amendment.text,
      sheet_version: input.sheet_version,
    });
    return amendment;
  });
}

/** 8 hex chars: short enough to retype into the CLI, wide enough for a per-project queue. */
export function shortId(): string {
  return randomUUID().replace(/-/g, "").slice(0, 8);
}

// ---------- the owner side: the only path that writes the Sheet ----------

class AmendmentError extends Error {}

function decidable(list: Amendment[], id: string): Amendment {
  const a = list.find((x) => x.id === id);
  if (!a) throw new AmendmentError(`unknown amendment: ${id}`);
  if (a.status !== "pending") throw new AmendmentError(`amendment ${id} is already ${a.status}${a.decided_at ? ` (at ${a.decided_at})` : ""}`);
  return a;
}

/**
 * Owner approves: the text goes through `engine.applyUserEdit` — patcher → validated ops → commit, exactly
 * like a human edit typed into the CLI, because at this point it IS one: a human decided it.
 */
export async function approveAmendment(engine: Engine, projectId: string, amendmentId: string): Promise<Amendment> {
  const store = engine.store;
  // Read-and-check first so an unknown/decided id never reaches the Sheet; the apply happens outside the
  // serialized section (it is a long LLM call) and the record is re-read before writing.
  decidable((await readFile(store, projectId)).list, amendmentId);
  const target = (await getAmendment(store, projectId, amendmentId))!;

  const r = await engine.applyUserEdit(projectId, target.text);

  return serialized(projectId, async () => {
    const { list, created_at } = await readFile(store, projectId);
    const current = decidable(list, amendmentId);
    const decided: Amendment = {
      ...current,
      status: "approved",
      decided_at: new Date().toISOString(),
      result: {
        sheet_version: r.version,
        applied_ops: r.applied.length,
        applied: r.applied.map((op) => op.op),
        rejected: r.rejected.map((x) => ({ op: x.op.op, error: x.error })),
        dropped: r.dropped,
        notes: r.notes,
      },
    };
    await writeFile(store, projectId, list.map((a) => (a.id === amendmentId ? decided : a)), created_at);
    await appendAgentEvent(store, projectId, {
      ts: decided.decided_at,
      kind: "amendment_approved",
      amendment_id: amendmentId,
      proposed_by: decided.proposed_by,
      text: decided.text,
      sheet_version: r.version,
      applied_ops: r.applied.length,
    });
    return decided;
  });
}

/** Owner rejects: nothing touches the Sheet. The record is kept — a rejected amendment is training data. */
export async function rejectAmendment(store: Store, projectId: string, amendmentId: string, reason?: string): Promise<Amendment> {
  return serialized(projectId, async () => {
    const { list, created_at } = await readFile(store, projectId);
    const current = decidable(list, amendmentId);
    const decided: Amendment = {
      ...current,
      status: "rejected",
      decided_at: new Date().toISOString(),
      ...(reason?.trim() ? { reason: reason.trim() } : {}),
    };
    await writeFile(store, projectId, list.map((a) => (a.id === amendmentId ? decided : a)), created_at);
    await appendAgentEvent(store, projectId, {
      ts: decided.decided_at,
      kind: "amendment_rejected",
      amendment_id: amendmentId,
      proposed_by: decided.proposed_by,
      text: decided.text,
      ...(decided.reason ? { reason: decided.reason } : {}),
    });
    return decided;
  });
}

/** Compact view for the MCP `list_amendments` response and the CLI listing. */
export function amendmentSummary(a: Amendment) {
  return {
    id: a.id,
    status: a.status,
    text: a.text,
    ...(a.rationale ? { rationale: a.rationale } : {}),
    proposed_by: a.proposed_by,
    proposed_at: a.proposed_at,
    sheet_version_at_proposal: a.sheet_version_at_proposal,
    ...(a.decided_at ? { decided_at: a.decided_at } : {}),
    ...(a.reason ? { reason: a.reason } : {}),
    ...(a.result ? { result: a.result } : {}),
  };
}
