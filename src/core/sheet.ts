/**
 * The Design Sheet — the single human-facing artifact. One page, five lists:
 * People (actors), Nouns, Actions, Rules, Not-yet (non-goals), plus the decision ledger.
 * Zod schemas are the source of truth; `Sheet` is a plain JSON value (a snapshot per commit).
 */
import { z } from "zod";

/** Provenance of an item: 'draft' | 'card:<cardId>' | 'user_edit:<commitId>' | 'implied:<decisionId>' | 'default' | 'prior' | 'system' | 'story:<commitId>' */
export const SourceSchema = z.string().min(1);

export const ActorSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  source: SourceSchema,
});
export type Actor = z.infer<typeof ActorSchema>;

export const NounSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  fields_hint: z.array(z.string()).default([]),
  example: z.string().optional(),
  source: SourceSchema,
});
export type Noun = z.infer<typeof NounSchema>;

export const ActionSchema = z.object({
  id: z.string(),
  actor: z.string().min(1), // actor id
  verb: z.string().min(1),
  object: z.string().min(1), // noun id
  description: z.string().optional(),
  example: z.string().optional(),
  source: SourceSchema,
});
export type Action = z.infer<typeof ActionSchema>;

export const RuleKind = z.enum(["access", "state", "integrity", "scope", "other"]);
export type RuleKind = z.infer<typeof RuleKind>;

export const RuleSchema = z.object({
  id: z.string(),
  text: z.string().min(1),
  kind: RuleKind.default("other"),
  example: z.string().optional(),
  source: SourceSchema,
});
export type Rule = z.infer<typeof RuleSchema>;

export const NonGoalSchema = z.object({
  id: z.string(),
  text: z.string().min(1),
  source: SourceSchema,
});
export type NonGoal = z.infer<typeof NonGoalSchema>;

export const DecisionStatus = z.enum([
  "open", // unresolved; may be asked
  "resolved", // user answered a card or edited explicitly
  "implied", // derived from another decision (hard edge or belief crossing tau)
  "defaulted", // silently defaulted at confidence >= tau, or accepted in defaults review
  "delegated", // user said "you decide" — default accepted, never asked again
  "skipped", // user snoozed; not asked again this session, defaulted at the end
]);
export type DecisionStatus = z.infer<typeof DecisionStatus>;

export const DecisionOptionSchema = z.object({ id: z.string(), label: z.string() });

export const DecisionSchema = z.object({
  id: z.string(), // == catalog node id (or bespoke node id "x1"...)
  topic: z.string(),
  question: z.string(), // internal phrasing; cards are phrased separately as consequences
  options: z.array(DecisionOptionSchema).min(1),
  chosen: z.string().optional(), // option id
  status: DecisionStatus.default("open"),
  confidence: z.number().min(0).max(1).optional(), // belief max P at time status was set
  consequence: z.number().min(0).max(5).default(3),
  rationale: z.string().optional(),
  implied_by: z.string().optional(), // decision id that implied this one
  source: SourceSchema,
});
export type Decision = z.infer<typeof DecisionSchema>;

export const SheetSchema = z.object({
  project_id: z.string(),
  version: z.number().int().min(0),
  one_liner: z.string(),
  archetypes: z.array(z.string()).default([]),
  actors: z.array(ActorSchema).default([]),
  nouns: z.array(NounSchema).default([]),
  actions: z.array(ActionSchema).default([]),
  rules: z.array(RuleSchema).default([]),
  non_goals: z.array(NonGoalSchema).default([]),
  decisions: z.array(DecisionSchema).default([]),
});
export type Sheet = z.infer<typeof SheetSchema>;

export function emptySheet(project_id: string, one_liner: string): Sheet {
  return SheetSchema.parse({ project_id, version: 0, one_liner });
}

export type ListName = "actors" | "nouns" | "actions" | "rules" | "non_goals" | "decisions";
export const LIST_PREFIX: Record<ListName, string> = {
  actors: "p",
  nouns: "n",
  actions: "a",
  rules: "r",
  non_goals: "g",
  decisions: "d",
};

export function findActor(sheet: Sheet, ref: string): Actor | undefined {
  return byIdOrName(sheet.actors, ref);
}
export function findNoun(sheet: Sheet, ref: string): Noun | undefined {
  return byIdOrName(sheet.nouns, ref);
}
export function findDecision(sheet: Sheet, id: string): Decision | undefined {
  return sheet.decisions.find((d) => d.id === id);
}

/** Resolve a reference by id first, then by case-insensitive name (LLM patches often use names). */
export function byIdOrName<T extends { id: string; name: string }>(list: T[], ref: string): T | undefined {
  const r = ref.trim();
  return list.find((x) => x.id === r) ?? list.find((x) => x.name.toLowerCase() === r.toLowerCase());
}

/** Deep-clone via JSON (Sheets are plain JSON by construction). */
export function cloneSheet(sheet: Sheet): Sheet {
  return JSON.parse(JSON.stringify(sheet)) as Sheet;
}
