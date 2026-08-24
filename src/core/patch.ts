/**
 * Patch operations — the ONLY way the Sheet changes.
 * The LLM (patcher/drafter) proposes ops; this module validates and applies them deterministically.
 * Rule 1: the model never writes Sheet state directly.
 */
import { z } from "zod";
import {
  type Sheet,
  type Decision,
  type DecisionStatus,
  RuleKind,
  DecisionStatus as DecisionStatusSchema,
  DecisionOptionSchema,
  byIdOrName,
  cloneSheet,
} from "./sheet.js";
import { idAllocator, normName } from "./ids.js";

const ref = z.string().min(1).describe("id or exact name of an existing item");

/** Ops the patcher LLM may emit (user-facing edits). */
export const UserPatchOpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add_actor"), name: z.string().min(1), description: z.string().optional() }),
  z.object({ op: z.literal("modify_actor"), ref, name: z.string().optional(), description: z.string().optional() }),
  z.object({ op: z.literal("remove_actor"), ref }),
  z.object({
    op: z.literal("add_noun"),
    name: z.string().min(1),
    description: z.string().optional(),
    fields_hint: z.array(z.string()).optional(),
    example: z.string().optional(),
  }),
  z.object({
    op: z.literal("modify_noun"),
    ref,
    name: z.string().optional(),
    description: z.string().optional(),
    fields_hint: z.array(z.string()).optional(),
    example: z.string().optional(),
  }),
  z.object({ op: z.literal("remove_noun"), ref }),
  z.object({
    op: z.literal("add_action"),
    actor: ref,
    verb: z.string().min(1),
    object: ref,
    description: z.string().optional(),
    example: z.string().optional(),
  }),
  z.object({
    op: z.literal("modify_action"),
    ref,
    actor: ref.optional(),
    verb: z.string().optional(),
    object: ref.optional(),
    description: z.string().optional(),
    example: z.string().optional(),
  }),
  z.object({ op: z.literal("remove_action"), ref }),
  z.object({ op: z.literal("add_rule"), text: z.string().min(1), kind: RuleKind.optional(), example: z.string().optional() }),
  z.object({ op: z.literal("modify_rule"), ref, text: z.string().optional(), kind: RuleKind.optional(), example: z.string().optional() }),
  z.object({ op: z.literal("remove_rule"), ref }),
  z.object({ op: z.literal("add_non_goal"), text: z.string().min(1) }),
  z.object({ op: z.literal("remove_non_goal"), ref }),
  z.object({
    op: z.literal("resolve_decision"),
    id: z.string(),
    chosen: z.string().describe("option id or option label"),
    rationale: z.string().optional(),
  }),
  z.object({ op: z.literal("add_decision_option"), id: z.string(), option: DecisionOptionSchema }),
]);
export type UserPatchOp = z.infer<typeof UserPatchOpSchema>;

/** Full op set including system-only ops (engine, undo, planner). */
export const PatchOpSchema = z.discriminatedUnion("op", [
  ...UserPatchOpSchema.options,
  z.object({ op: z.literal("set_archetypes"), archetypes: z.array(z.string()) }),
  z.object({ op: z.literal("set_one_liner"), one_liner: z.string() }),
  z.object({
    op: z.literal("add_decision"),
    id: z.string(),
    topic: z.string(),
    question: z.string(),
    options: z.array(DecisionOptionSchema).min(1),
    consequence: z.number().min(0).max(5).optional(),
    status: DecisionStatusSchema.optional(),
    chosen: z.string().optional(),
    confidence: z.number().min(0).max(1).optional(),
  }),
  z.object({
    op: z.literal("set_decision"),
    id: z.string(),
    chosen: z.string().optional(),
    status: DecisionStatusSchema,
    confidence: z.number().min(0).max(1).optional(),
    rationale: z.string().optional(),
    implied_by: z.string().optional(),
    consequence: z.number().min(0).max(5).optional(),
  }),
  z.object({ op: z.literal("reopen_decision"), id: z.string(), reason: z.string().optional() }),
  // explicit-id variants used by diff/undo so ids round-trip exactly
  z.object({ op: z.literal("add_actor_with_id"), id: z.string(), name: z.string(), description: z.string().optional() }),
  z.object({
    op: z.literal("add_noun_with_id"),
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    fields_hint: z.array(z.string()).optional(),
    example: z.string().optional(),
  }),
  z.object({
    op: z.literal("add_action_with_id"),
    id: z.string(),
    actor: z.string(),
    verb: z.string(),
    object: z.string(),
    description: z.string().optional(),
    example: z.string().optional(),
  }),
  z.object({ op: z.literal("add_rule_with_id"), id: z.string(), text: z.string(), kind: RuleKind.optional(), example: z.string().optional() }),
  z.object({ op: z.literal("add_non_goal_with_id"), id: z.string(), text: z.string() }),
  z.object({ op: z.literal("remove_decision"), id: z.string() }),
  // the exact inverse of add_decision_option, so undo can restore an option list byte-for-byte
  z.object({ op: z.literal("remove_decision_option"), id: z.string(), option_id: z.string() }),
]);
export type PatchOp = z.infer<typeof PatchOpSchema>;

export class PatchError extends Error {
  constructor(
    public readonly code:
      | "not_found"
      | "duplicate"
      | "invalid_ref"
      | "invalid_option"
      | "invalid_transition"
      | "id_taken"
      | "invalid",
    message: string,
    public readonly op?: PatchOp,
  ) {
    super(message);
    this.name = "PatchError";
  }
}

export interface ApplyContext {
  /** provenance stamped on created/modified items, e.g. 'draft', 'card:c3', 'user_edit:<commitId>' */
  source: string;
  /** strict: throw on first invalid op; otherwise skip invalid ops and report them */
  strict?: boolean;
}

export interface ApplyResult {
  sheet: Sheet;
  applied: PatchOp[];
  rejected: { op: PatchOp; error: string; code: PatchError["code"] }[];
  /** ops the engine performed automatically (e.g., removing actions whose noun was removed) */
  cascaded: PatchOp[];
}

/** Apply a batch of ops to a Sheet. Pure: returns a new Sheet; never mutates the input. Version is NOT bumped here (commits do that). */
export function applyPatch(input: Sheet, ops: PatchOp[], ctx: ApplyContext): ApplyResult {
  const sheet = cloneSheet(input);
  const applied: PatchOp[] = [];
  const rejected: ApplyResult["rejected"] = [];
  const cascaded: PatchOp[] = [];
  for (const op of ops) {
    try {
      applyOne(sheet, op, ctx.source, cascaded);
      applied.push(op);
    } catch (e) {
      if (e instanceof PatchError) {
        if (ctx.strict) throw e;
        rejected.push({ op, error: e.message, code: e.code });
      } else throw e;
    }
  }
  return { sheet, applied, rejected, cascaded };
}

const ALLOWED_TRANSITIONS: Record<DecisionStatus, DecisionStatus[]> = {
  open: ["resolved", "implied", "defaulted", "delegated", "skipped"],
  resolved: ["resolved"], // change of mind via explicit user edit; cards never re-ask (Rule 3)
  implied: ["resolved", "implied", "defaulted"],
  defaulted: ["resolved", "implied", "defaulted", "delegated"],
  delegated: ["resolved"],
  skipped: ["resolved", "implied", "defaulted", "delegated"],
};

function applyOne(s: Sheet, op: PatchOp, source: string, cascaded: PatchOp[]): void {
  switch (op.op) {
    case "set_one_liner":
      s.one_liner = op.one_liner;
      return;
    case "set_archetypes":
      s.archetypes = [...new Set(op.archetypes.map((a) => a.trim()).filter(Boolean))];
      return;

    case "add_actor":
    case "add_actor_with_id": {
      assertNoDuplicateName(s.actors, op.name, op);
      const id = "id" in op ? takeId(s, op.id, op) : idAllocator("p", allIds(s))();
      s.actors.push({ id, name: op.name.trim(), ...(op.description ? { description: op.description } : {}), source });
      return;
    }
    case "modify_actor": {
      const a = byIdOrName(s.actors, op.ref) ?? notFound("actor", op.ref, op);
      if (op.name !== undefined && normName(op.name) !== normName(a.name)) assertNoDuplicateName(s.actors, op.name, op);
      if (op.name !== undefined) a.name = op.name.trim();
      setOpt(a, "description", op.description);
      a.source = source;
      return;
    }
    case "remove_actor": {
      const a = byIdOrName(s.actors, op.ref) ?? notFound("actor", op.ref, op);
      s.actors = s.actors.filter((x) => x.id !== a.id);
      for (const act of s.actions.filter((x) => x.actor === a.id)) {
        cascaded.push({ op: "remove_action", ref: act.id });
      }
      s.actions = s.actions.filter((x) => x.actor !== a.id);
      return;
    }

    case "add_noun":
    case "add_noun_with_id": {
      assertNoDuplicateName(s.nouns, op.name, op);
      const id = "id" in op ? takeId(s, op.id, op) : idAllocator("n", allIds(s))();
      s.nouns.push({
        id,
        name: op.name.trim(),
        ...(op.description ? { description: op.description } : {}),
        fields_hint: op.fields_hint ?? [],
        ...(op.example ? { example: op.example } : {}),
        source,
      });
      return;
    }
    case "modify_noun": {
      const n = byIdOrName(s.nouns, op.ref) ?? notFound("noun", op.ref, op);
      if (op.name !== undefined && normName(op.name) !== normName(n.name)) assertNoDuplicateName(s.nouns, op.name, op);
      if (op.name !== undefined) n.name = op.name.trim();
      setOpt(n, "description", op.description);
      if (op.fields_hint !== undefined) n.fields_hint = op.fields_hint;
      setOpt(n, "example", op.example);
      n.source = source;
      return;
    }
    case "remove_noun": {
      const n = byIdOrName(s.nouns, op.ref) ?? notFound("noun", op.ref, op);
      s.nouns = s.nouns.filter((x) => x.id !== n.id);
      for (const act of s.actions.filter((x) => x.object === n.id)) {
        cascaded.push({ op: "remove_action", ref: act.id });
      }
      s.actions = s.actions.filter((x) => x.object !== n.id);
      return;
    }

    case "add_action":
    case "add_action_with_id": {
      const actor = byIdOrName(s.actors, op.actor) ?? invalidRef("actor", op.actor, op);
      const noun = byIdOrName(s.nouns, op.object) ?? invalidRef("noun", op.object, op);
      const verb = op.verb.trim();
      if (s.actions.some((x) => x.actor === actor.id && x.object === noun.id && normName(x.verb) === normName(verb)))
        throw new PatchError("duplicate", `action already exists: ${actor.name} ${verb} ${noun.name}`, op);
      const id = "id" in op ? takeId(s, op.id, op) : idAllocator("a", allIds(s))();
      s.actions.push({
        id,
        actor: actor.id,
        verb,
        object: noun.id,
        ...(op.description ? { description: op.description } : {}),
        ...(op.example ? { example: op.example } : {}),
        source,
      });
      return;
    }
    case "modify_action": {
      const a = s.actions.find((x) => x.id === op.ref) ?? findActionByPhrase(s, op.ref) ?? notFound("action", op.ref, op);
      // Resolve BOTH references before touching the action: an op that is going to be rejected must leave no
      // trace, or the Sheet stops being the sum of `applied` ops (Rule 1/2).
      const newActor = op.actor !== undefined ? (byIdOrName(s.actors, op.actor) ?? invalidRef("actor", op.actor, op)).id : undefined;
      const newObject = op.object !== undefined ? (byIdOrName(s.nouns, op.object) ?? invalidRef("noun", op.object, op)).id : undefined;
      if (newActor !== undefined) a.actor = newActor;
      if (newObject !== undefined) a.object = newObject;
      if (op.verb !== undefined) a.verb = op.verb.trim();
      setOpt(a, "description", op.description);
      setOpt(a, "example", op.example);
      a.source = source;
      return;
    }
    case "remove_action": {
      const a = s.actions.find((x) => x.id === op.ref) ?? findActionByPhrase(s, op.ref) ?? notFound("action", op.ref, op);
      s.actions = s.actions.filter((x) => x.id !== a.id);
      return;
    }

    case "add_rule":
    case "add_rule_with_id": {
      const text = op.text.trim();
      if (s.rules.some((r) => normName(r.text) === normName(text))) throw new PatchError("duplicate", `rule already exists: ${text}`, op);
      const id = "id" in op ? takeId(s, op.id, op) : idAllocator("r", allIds(s))();
      s.rules.push({ id, text, kind: op.kind ?? "other", ...(op.example ? { example: op.example } : {}), source });
      return;
    }
    case "modify_rule": {
      const r = s.rules.find((x) => x.id === op.ref) ?? s.rules.find((x) => normName(x.text) === normName(op.ref)) ?? notFound("rule", op.ref, op);
      if (op.text !== undefined) r.text = op.text.trim();
      if (op.kind !== undefined) r.kind = op.kind;
      setOpt(r, "example", op.example);
      r.source = source;
      return;
    }
    case "remove_rule": {
      const r = s.rules.find((x) => x.id === op.ref) ?? s.rules.find((x) => normName(x.text) === normName(op.ref)) ?? notFound("rule", op.ref, op);
      s.rules = s.rules.filter((x) => x.id !== r.id);
      return;
    }

    case "add_non_goal":
    case "add_non_goal_with_id": {
      const text = op.text.trim();
      if (s.non_goals.some((g) => normName(g.text) === normName(text))) throw new PatchError("duplicate", `non-goal already exists: ${text}`, op);
      const id = "id" in op ? takeId(s, op.id, op) : idAllocator("g", allIds(s))();
      s.non_goals.push({ id, text, source });
      return;
    }
    case "remove_non_goal": {
      const g = s.non_goals.find((x) => x.id === op.ref) ?? s.non_goals.find((x) => normName(x.text) === normName(op.ref)) ?? notFound("non_goal", op.ref, op);
      s.non_goals = s.non_goals.filter((x) => x.id !== g.id);
      return;
    }

    case "add_decision": {
      if (s.decisions.some((d) => d.id === op.id)) throw new PatchError("id_taken", `decision id taken: ${op.id}`, op);
      const d: Decision = {
        id: op.id,
        topic: op.topic,
        question: op.question,
        options: op.options,
        status: op.status ?? "open",
        consequence: op.consequence ?? 3,
        source,
      };
      if (op.chosen !== undefined) d.chosen = resolveOption(d, op.chosen, op);
      if (op.confidence !== undefined) d.confidence = op.confidence;
      s.decisions.push(d);
      return;
    }
    case "add_decision_option": {
      const d = s.decisions.find((x) => x.id === op.id) ?? notFound("decision", op.id, op);
      if (d.options.some((o) => o.id === op.option.id || normName(o.label) === normName(op.option.label)))
        throw new PatchError("duplicate", `option exists on ${d.id}: ${op.option.label}`, op);
      d.options.push(op.option);
      return;
    }
    case "resolve_decision": {
      const d = s.decisions.find((x) => x.id === op.id) ?? notFound("decision", op.id, op);
      assertTransition(d, "resolved", op);
      d.chosen = resolveOption(d, op.chosen, op);
      d.status = "resolved";
      d.confidence = 1;
      if (op.rationale) d.rationale = op.rationale;
      delete d.implied_by;
      d.source = source;
      return;
    }
    case "set_decision": {
      const d = s.decisions.find((x) => x.id === op.id) ?? notFound("decision", op.id, op);
      if (op.status === "open") {
        delete d.chosen;
        delete d.confidence;
        delete d.implied_by;
      } else {
        assertTransition(d, op.status, op);
        if (op.chosen !== undefined) d.chosen = resolveOption(d, op.chosen, op);
        if (op.confidence !== undefined) d.confidence = op.confidence;
        if (op.implied_by !== undefined) d.implied_by = op.implied_by;
      }
      d.status = op.status;
      if (op.rationale !== undefined) d.rationale = op.rationale;
      if (op.consequence !== undefined) d.consequence = op.consequence;
      d.source = source;
      return;
    }
    case "reopen_decision": {
      const d = s.decisions.find((x) => x.id === op.id) ?? notFound("decision", op.id, op);
      d.status = "open";
      delete d.chosen;
      delete d.confidence;
      delete d.implied_by;
      if (op.reason) d.rationale = `reopened: ${op.reason}`;
      d.source = source;
      return;
    }
    case "remove_decision_option": {
      const d = s.decisions.find((x) => x.id === op.id) ?? notFound("decision", op.id, op);
      if (!d.options.some((o) => o.id === op.option_id)) throw new PatchError("invalid_option", `decision ${d.id} has no option ${op.option_id}`, op);
      if (d.options.length <= 1) throw new PatchError("invalid", `decision ${d.id} must keep at least one option`, op);
      if (d.chosen === op.option_id) throw new PatchError("invalid", `option ${op.option_id} is the chosen value of ${d.id}`, op);
      d.options = d.options.filter((o) => o.id !== op.option_id);
      return;
    }
    case "remove_decision": {
      if (!s.decisions.some((x) => x.id === op.id)) notFound("decision", op.id, op);
      s.decisions = s.decisions.filter((x) => x.id !== op.id);
      return;
    }
    default: {
      const _exhaustive: never = op;
      throw new PatchError("invalid", `unknown op ${JSON.stringify(_exhaustive)}`);
    }
  }
}

/** Optional string fields: undefined = leave as is, "" = clear, otherwise set. (Lets diffs/undo round-trip.) */
function setOpt<T extends object, K extends keyof T>(obj: T, key: K, value: string | undefined) {
  if (value === undefined) return;
  if (value === "") delete obj[key];
  else (obj as Record<K, unknown>)[key] = value;
}

function assertTransition(d: Decision, to: DecisionStatus, op: PatchOp) {
  if (!ALLOWED_TRANSITIONS[d.status].includes(to))
    throw new PatchError("invalid_transition", `decision ${d.id}: ${d.status} -> ${to} not allowed`, op);
}

function resolveOption(d: Decision, chosen: string, op: PatchOp): string {
  const c = chosen.trim();
  const o = d.options.find((x) => x.id === c) ?? d.options.find((x) => x.label.toLowerCase() === c.toLowerCase());
  if (!o) throw new PatchError("invalid_option", `decision ${d.id} has no option "${chosen}" (have: ${d.options.map((x) => x.id).join(", ")})`, op);
  return o.id;
}

function assertNoDuplicateName(list: { name: string }[], name: string, op: PatchOp) {
  if (list.some((x) => normName(x.name) === normName(name))) throw new PatchError("duplicate", `already exists: ${name}`, op);
}

function allIds(s: Sheet): string[] {
  return [...s.actors, ...s.nouns, ...s.actions, ...s.rules, ...s.non_goals, ...s.decisions].map((x) => x.id);
}

function takeId(s: Sheet, id: string, op: PatchOp): string {
  if (allIds(s).includes(id)) throw new PatchError("id_taken", `id taken: ${id}`, op);
  return id;
}

function notFound(kind: string, ref: string, op: PatchOp): never {
  throw new PatchError("not_found", `${kind} not found: ${ref}`, op);
}
function invalidRef(kind: string, ref: string, op: PatchOp): never {
  throw new PatchError("invalid_ref", `${kind} reference not found: ${ref}`, op);
}

/** "bookkeeper sends invoice" → matching action, for LLM patches that reference actions by phrase. */
function findActionByPhrase(s: Sheet, phrase: string) {
  const p = normName(phrase);
  return s.actions.find((a) => {
    const actor = s.actors.find((x) => x.id === a.actor)?.name ?? a.actor;
    const noun = s.nouns.find((x) => x.id === a.object)?.name ?? a.object;
    return normName(`${actor} ${a.verb} ${noun}`) === p || normName(`${a.verb} ${noun}`) === p;
  });
}
