/**
 * Commits: every Sheet change is a commit holding the ops, their provenance, and a full snapshot.
 * History is append-only. Undo = a new commit whose ops revert to an earlier snapshot (diffSheets).
 */
import { z } from "zod";
import { SheetSchema, type Sheet, type Decision } from "./sheet.js";
import { PatchOpSchema, type PatchOp, applyPatch, type ApplyResult, ALLOWED_TRANSITIONS } from "./patch.js";

export const CommitSourceKind = z.enum([
  "draft",
  "plan", // decision nodes added by the planner
  "rule_bank", // rules suggested by matching the draft against mined patterns from real specs of this archetype
  "user_edit",
  "card_answer",
  "implication",
  "default",
  "defaults_review",
  "verification", // scenario check accepted/corrected (group-testing elicitation)
  "story_correction",
  "system",
  "undo",
]);
export type CommitSourceKind = z.infer<typeof CommitSourceKind>;

export const CommitSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  version: z.number().int(),
  parent_version: z.number().int(),
  ops: z.array(PatchOpSchema),
  cascaded: z.array(PatchOpSchema).default([]),
  rejected: z.array(z.object({ op: PatchOpSchema, error: z.string(), code: z.string() })).default([]),
  source: z.object({ kind: CommitSourceKind, ref: z.string().optional() }),
  message: z.string(),
  created_at: z.string(),
  sheet: SheetSchema,
});
export type Commit = z.infer<typeof CommitSchema>;

export interface MakeCommitOptions {
  id: string;
  source: { kind: CommitSourceKind; ref?: string };
  message: string;
  now: string; // ISO timestamp (injected for determinism)
  strict?: boolean;
  /** provenance string stamped on items; defaults to `${kind}:${ref}` or kind */
  itemSource?: string;
}

/** Apply ops to `prev` and wrap the result in a commit. Returns null commit if nothing applied (and not strict). */
export function makeCommit(prev: Sheet, ops: PatchOp[], opts: MakeCommitOptions): { commit: Commit | null; result: ApplyResult } {
  const itemSource = opts.itemSource ?? (opts.source.ref ? `${opts.source.kind}:${opts.source.ref}` : opts.source.kind);
  const result = applyPatch(prev, ops, { source: itemSource, strict: opts.strict });
  if (result.applied.length === 0) return { commit: null, result };
  const sheet: Sheet = { ...result.sheet, version: prev.version + 1 };
  const commit: Commit = {
    id: opts.id,
    project_id: prev.project_id,
    version: sheet.version,
    parent_version: prev.version,
    ops: result.applied,
    cascaded: result.cascaded,
    rejected: result.rejected,
    source: opts.source,
    message: opts.message,
    created_at: opts.now,
    sheet,
  };
  return { commit, result: { ...result, sheet } };
}

/** Ops that transform sheet `a` into sheet `b` (by id). Used for undo/revert and round-trip diffs. */
export function diffSheets(a: Sheet, b: Sheet): PatchOp[] {
  const ops: PatchOp[] = [];
  if (a.one_liner !== b.one_liner) ops.push({ op: "set_one_liner", one_liner: b.one_liner });
  if (JSON.stringify(a.archetypes) !== JSON.stringify(b.archetypes)) ops.push({ op: "set_archetypes", archetypes: b.archetypes });

  // removals first (actions before their actors/nouns to avoid cascades changing semantics)
  for (const x of a.actions) if (!b.actions.some((y) => y.id === x.id)) ops.push({ op: "remove_action", ref: x.id });
  for (const x of a.actors) if (!b.actors.some((y) => y.id === x.id)) ops.push({ op: "remove_actor", ref: x.id });
  for (const x of a.nouns) if (!b.nouns.some((y) => y.id === x.id)) ops.push({ op: "remove_noun", ref: x.id });
  for (const x of a.rules) if (!b.rules.some((y) => y.id === x.id)) ops.push({ op: "remove_rule", ref: x.id });
  for (const x of a.non_goals) if (!b.non_goals.some((y) => y.id === x.id)) ops.push({ op: "remove_non_goal", ref: x.id });
  for (const x of a.decisions) if (!b.decisions.some((y) => y.id === x.id)) ops.push({ op: "remove_decision", id: x.id });

  // adds / modifies
  for (const y of b.actors) {
    const x = a.actors.find((z) => z.id === y.id);
    if (!x) ops.push({ op: "add_actor_with_id", id: y.id, name: y.name, ...(y.description ? { description: y.description } : {}) });
    else if (x.name !== y.name || x.description !== y.description)
      ops.push({ op: "modify_actor", ref: y.id, name: y.name, description: y.description ?? "" });
  }
  for (const y of b.nouns) {
    const x = a.nouns.find((z) => z.id === y.id);
    if (!x)
      ops.push({
        op: "add_noun_with_id",
        id: y.id,
        name: y.name,
        ...(y.description ? { description: y.description } : {}),
        fields_hint: y.fields_hint,
        ...(y.example ? { example: y.example } : {}),
      });
    else if (
      x.name !== y.name ||
      x.description !== y.description ||
      JSON.stringify(x.fields_hint) !== JSON.stringify(y.fields_hint) ||
      x.example !== y.example
    )
      ops.push({
        op: "modify_noun",
        ref: y.id,
        name: y.name,
        description: y.description ?? "",
        fields_hint: y.fields_hint,
        example: y.example ?? "",
      });
  }
  for (const y of b.actions) {
    const x = a.actions.find((z) => z.id === y.id);
    if (!x)
      ops.push({
        op: "add_action_with_id",
        id: y.id,
        actor: y.actor,
        verb: y.verb,
        object: y.object,
        ...(y.description ? { description: y.description } : {}),
        ...(y.example ? { example: y.example } : {}),
      });
    else if (x.actor !== y.actor || x.verb !== y.verb || x.object !== y.object || x.description !== y.description || x.example !== y.example)
      ops.push({
        op: "modify_action",
        ref: y.id,
        actor: y.actor,
        verb: y.verb,
        object: y.object,
        description: y.description ?? "",
        example: y.example ?? "",
      });
  }
  for (const y of b.rules) {
    const x = a.rules.find((z) => z.id === y.id);
    if (!x) ops.push({ op: "add_rule_with_id", id: y.id, text: y.text, kind: y.kind, ...(y.example ? { example: y.example } : {}) });
    else if (x.text !== y.text || x.kind !== y.kind || x.example !== y.example)
      ops.push({ op: "modify_rule", ref: y.id, text: y.text, kind: y.kind, example: y.example ?? "" });
  }
  for (const y of b.non_goals) {
    if (!a.non_goals.some((z) => z.id === y.id)) ops.push({ op: "add_non_goal_with_id", id: y.id, text: y.text });
  }
  for (const y of b.decisions) {
    const x = a.decisions.find((z) => z.id === y.id);
    // Re-adding a decision goes through `open` and then one `set_decision`, rather than adding it in its final
    // status directly: `add_decision` carries no rationale/implied_by (so an undo used to silently drop the
    // provenance of an implied decision), and `open → <status>` is legal for every status while e.g.
    // `delegated → delegated` is not. Restoring is then just the normal status transition.
    const restore = (d: Decision): PatchOp => ({
      op: "set_decision",
      id: d.id,
      status: d.status,
      ...(d.chosen ? { chosen: d.chosen } : {}),
      ...(d.confidence !== undefined ? { confidence: d.confidence } : {}),
      ...(d.rationale !== undefined ? { rationale: d.rationale } : {}),
      ...(d.implied_by !== undefined ? { implied_by: d.implied_by } : {}),
      consequence: d.consequence,
    });
    if (!x) {
      ops.push({ op: "add_decision", id: y.id, topic: y.topic, question: y.question, options: y.options, consequence: y.consequence, status: "open" });
      if (y.status !== "open") ops.push(restore(y));
    } else if (!sameDecision(x, y)) {
      for (const o of y.options) if (!x.options.some((p) => p.id === o.id)) ops.push({ op: "add_decision_option", id: y.id, option: o });
      if (y.status === "open") ops.push({ op: "reopen_decision", id: y.id });
      else {
        // A restore whose direct transition the table forbids (e.g. resolved → skipped, when an undo crosses a
        // user edit that resolved a previously-skipped decision) goes through `open` first: open → any status
        // is legal, so the undo can't be silently part-rejected.
        if (!ALLOWED_TRANSITIONS[x.status].includes(y.status)) ops.push({ op: "reopen_decision", id: y.id });
        ops.push(restore(y));
      }
      // after the status is back (so the target's `chosen` is in place), drop options the target never had
      for (const o of x.options) if (!y.options.some((p) => p.id === o.id)) ops.push({ op: "remove_decision_option", id: y.id, option_id: o.id });
    }
  }
  return ops;
}

function sameDecision(x: Decision, y: Decision): boolean {
  return (
    x.status === y.status &&
    x.chosen === y.chosen &&
    x.confidence === y.confidence &&
    x.rationale === y.rationale &&
    x.implied_by === y.implied_by &&
    x.consequence === y.consequence &&
    JSON.stringify(x.options) === JSON.stringify(y.options)
  );
}

/** Ops that revert `current` back to `target` (an earlier snapshot). */
export function revertOps(current: Sheet, target: Sheet): PatchOp[] {
  return diffSheets(current, target);
}
