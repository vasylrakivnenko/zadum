/** Server-only: builds the wire-level ProjectState from the engine + store. */
import type { Sheet } from "@engine/core/sheet";
import type { SessionState } from "@engine/core/session";
import type { Commit } from "@engine/core/commit";
import { settledness } from "@engine/core/selector";
import type { ZEvent } from "@engine/core/session";
import type { EngineHandle } from "./engine";
import type { CurvePoint, DecidedEntry, ImpliedLabels, ProjectState, ProjectSummary } from "./types";

type RawImplied = {
  hard: { node: string; option: string }[];
  soft: { node: string; option: string; p: number }[];
  contradictions: { node: string; had: string; wants: string; because: string }[];
};

/**
 * FileStore writes are atomic (tmp + rename), so a mid-write read should be impossible — but background
 * precompute writes session.json outside the request path, and a retry on a malformed parse costs nothing
 * next to a 500. Kept as belt-and-braces for non-atomic stores and partial-write edge cases.
 */
export async function retryRead<T>(fn: () => Promise<T>, tries = 5, delayMs = 30): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (!(e instanceof SyntaxError) || i >= tries - 1) throw e;
      await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
    }
  }
}

export async function projectState(h: EngineHandle, id: string): Promise<ProjectState> {
  const { sheet, session, project, commits } = await retryRead(() => h.engine.getState(id));
  const [card, events] = await Promise.all([retryRead(() => h.engine.currentCard(id)), retryRead(() => h.store.listEvents(id))]);
  const summary: ProjectSummary = { id: project.id, one_liner: project.one_liner, phase: project.phase, latest_version: project.latest_version, created_at: project.created_at, updated_at: project.updated_at };
  const settled = currentSettledness(sheet, session);
  const stopped = !card && session.last_stop_reason && session.phase !== "correcting" && session.phase !== "drafting";
  return {
    project: summary,
    sheet,
    assumptions: draftAssumptions(events),
    session: { phase: session.phase, cards: session.cards.length, answers: session.answers.length, last_stop_reason: session.last_stop_reason ?? null, settledness: settled },
    card: card ?? (stopped ? { kind: "stop", reason: session.last_stop_reason ?? "stopped", settledness: settled } : null),
    decided: decidedEntries(sheet, commits),
    curve: gainCurve(sheet, session, events),
  };
}

function draftAssumptions(events: ZEvent[]): string[] {
  const draft = events.find((e) => e.type === "draft_created");
  const a = draft?.payload["assumptions"];
  return Array.isArray(a) ? a.filter((x): x is string => typeof x === "string") : [];
}

/**
 * The information-gain curve: for every card still in the session (undo pops cards, so the session list is
 * the truth), the `share` of remaining uncertainty it stood to settle, from its `card_shown` event.
 */
function gainCurve(sheet: Sheet, session: SessionState, events: ZEvent[]): CurvePoint[] {
  const shown = new Map<string, ZEvent>();
  for (const e of events) if (e.type === "card_shown" && typeof e.payload["card_id"] === "string") shown.set(e.payload["card_id"] as string, e);
  const answered = new Set(session.answers.map((a) => a.card_id));
  const out: CurvePoint[] = [];
  session.cards.forEach((card, i) => {
    const ev = shown.get(card.id);
    const share = ev ? num(ev.payload["share"]) : null;
    if (share === null) return; // pre-curve sessions or missing event: skip rather than fake a bar
    out.push({
      card_index: i + 1,
      card_id: card.id,
      node: card.node_id,
      topic: sheet.decisions.find((d) => d.id === card.node_id)?.topic ?? card.node_id,
      share,
      settledness: (ev ? num(ev.payload["settledness"]) : null) ?? 0,
      answered: answered.has(card.id),
    });
  });
  return out;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Mirrors Engine.allDecisionIds (private): the decisions the progress meter is computed over. */
function currentSettledness(sheet: Sheet, session: SessionState): number {
  const nodeIds = new Set(session.belief.nodes.map((n) => n.id));
  const ids = sheet.decisions.filter((d) => nodeIds.has(d.id) && d.status !== "resolved" && d.status !== "implied" && d.status !== "delegated").map((d) => d.id);
  if (!session.belief.worlds.length) return 0;
  return settledness(session.belief, ids, session.consequence_override);
}

/** Settled decisions ordered by the commit that last touched them, most recent first. */
export function decidedEntries(sheet: Sheet, commits: Commit[]): DecidedEntry[] {
  const seen = new Set<string>();
  const out: DecidedEntry[] = [];
  for (let i = commits.length - 1; i >= 0; i--) {
    const c = commits[i]!;
    for (const op of [...c.ops].reverse()) {
      if (op.op !== "resolve_decision" && op.op !== "set_decision") continue;
      if (seen.has(op.id)) continue;
      const d = sheet.decisions.find((x) => x.id === op.id);
      if (!d || d.status === "open") continue;
      seen.add(op.id);
      out.push({ id: d.id, topic: d.topic, label: labelOf(sheet, d.id, d.chosen), status: d.status, via: c.source.kind, confidence: d.confidence ?? null });
    }
  }
  return out;
}

function labelOf(sheet: Sheet, nodeId: string, optionId: string | undefined): string {
  if (!optionId) return "—";
  const d = sheet.decisions.find((x) => x.id === nodeId);
  return d?.options.find((o) => o.id === optionId)?.label ?? optionId;
}

function topicOf(sheet: Sheet, nodeId: string): string {
  return sheet.decisions.find((x) => x.id === nodeId)?.topic ?? nodeId;
}

export function labelImplied(sheet: Sheet, implied: RawImplied): ImpliedLabels {
  return {
    hard: implied.hard.map((h) => ({ node: h.node, topic: topicOf(sheet, h.node), label: labelOf(sheet, h.node, h.option) })),
    soft: implied.soft.map((s) => ({ node: s.node, topic: topicOf(sheet, s.node), label: labelOf(sheet, s.node, s.option), p: s.p })),
    contradictions: (implied.contradictions ?? []).map((c) => ({ node: c.node, topic: topicOf(sheet, c.node), label: labelOf(sheet, c.node, c.wants), had: labelOf(sheet, c.node, c.had) })),
  };
}
