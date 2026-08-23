/**
 * The structured LLM functions (stateless, pure over their inputs). Each = (system prompt, rendered input, zod schema).
 * LLM-facing schemas stay in the conservative JSON-schema subset (flat objects, all fields present, enums,
 * arrays, strings, numbers) — rich validation happens in core code afterwards.
 */
import { z } from "zod";
import type { LLM, LLMResponse } from "./client.js";
import * as P from "./prompts.js";
import type { Sheet, Decision } from "../core/sheet.js";
import type { NodeDef } from "../core/catalog.js";
import type { UserPatchOp } from "../core/patch.js";
import type { Card } from "../core/session.js";

// ---------- output schemas ----------

export const DraftSchema = z.object({
  archetypes: z.array(z.string()),
  actors: z.array(z.object({ name: z.string(), description: z.string() })),
  nouns: z.array(z.object({ name: z.string(), description: z.string(), fields_hint: z.array(z.string()), example: z.string() })),
  actions: z.array(z.object({ actor: z.string(), verb: z.string(), object: z.string(), example: z.string() })),
  rules: z.array(z.object({ text: z.string(), kind: z.enum(["access", "state", "integrity", "scope", "other"]), example: z.string() })),
  non_goals: z.array(z.object({ text: z.string() })),
  assumptions: z.array(z.object({ text: z.string() })),
});
export type Draft = z.infer<typeof DraftSchema>;

export const PlanSchema = z.object({
  not_applicable: z.array(z.object({ id: z.string(), why: z.string() })),
  bespoke: z.array(
    z.object({
      id: z.string(),
      topic: z.string(),
      question: z.string(),
      options: z.array(z.object({ id: z.string(), label: z.string() })),
      consequence: z.number(),
      rationale: z.string(),
    }),
  ),
  consequence_adjustments: z.array(z.object({ id: z.string(), consequence: z.number(), why: z.string() })),
  fixed_by_sheet: z.array(z.object({ id: z.string(), option: z.string(), why: z.string() })),
});
export type Plan = z.infer<typeof PlanSchema>;

export const WorldsOutSchema = z.object({
  worlds: z.array(
    z.object({
      persona: z.string(),
      weight: z.number(),
      assignment: z.array(z.object({ node: z.string(), option: z.string() })),
    }),
  ),
});
export type WorldsOut = z.infer<typeof WorldsOutSchema>;

export const CardOutSchema = z.object({
  context: z.string(),
  options: z.array(z.object({ option_id: z.string(), scenario: z.string() })),
  also_sets: z.array(z.string()),
});
export type CardOut = z.infer<typeof CardOutSchema>;

const OP_NAMES = [
  "add_actor",
  "modify_actor",
  "remove_actor",
  "add_noun",
  "modify_noun",
  "remove_noun",
  "add_action",
  "modify_action",
  "remove_action",
  "add_rule",
  "modify_rule",
  "remove_rule",
  "add_non_goal",
  "remove_non_goal",
  "resolve_decision",
  "add_decision_option",
] as const;

/** Flat op record for the LLM; unused fields are "" / []. Converted to UserPatchOp by toUserOps(). */
export const PatchOutSchema = z.object({
  ops: z.array(
    z.object({
      op: z.enum(OP_NAMES),
      ref: z.string(),
      name: z.string(),
      description: z.string(),
      fields_hint: z.array(z.string()),
      example: z.string(),
      actor: z.string(),
      verb: z.string(),
      object: z.string(),
      text: z.string(),
      kind: z.enum(["access", "state", "integrity", "scope", "other", ""]),
      id: z.string(),
      chosen: z.string(),
      rationale: z.string(),
      option_id: z.string(),
      option_label: z.string(),
    }),
  ),
  notes: z.string(),
});
export type PatchOut = z.infer<typeof PatchOutSchema>;

export function toUserOps(out: PatchOut): { ops: UserPatchOp[]; dropped: { op: string; reason: string }[] } {
  const ops: UserPatchOp[] = [];
  const dropped: { op: string; reason: string }[] = [];
  const s = (v: string) => (v && v.trim().length ? v.trim() : undefined);
  for (const o of out.ops) {
    try {
      switch (o.op) {
        case "add_actor":
          ops.push({ op: "add_actor", name: need(o.name, "name"), ...(s(o.description) ? { description: o.description } : {}) });
          break;
        case "modify_actor":
          ops.push({ op: "modify_actor", ref: need(o.ref, "ref"), ...(s(o.name) ? { name: o.name } : {}), ...(s(o.description) ? { description: o.description } : {}) });
          break;
        case "remove_actor":
          ops.push({ op: "remove_actor", ref: need(o.ref, "ref") });
          break;
        case "add_noun":
          ops.push({
            op: "add_noun",
            name: need(o.name, "name"),
            ...(s(o.description) ? { description: o.description } : {}),
            ...(o.fields_hint.length ? { fields_hint: o.fields_hint } : {}),
            ...(s(o.example) ? { example: o.example } : {}),
          });
          break;
        case "modify_noun":
          ops.push({
            op: "modify_noun",
            ref: need(o.ref, "ref"),
            ...(s(o.name) ? { name: o.name } : {}),
            ...(s(o.description) ? { description: o.description } : {}),
            ...(o.fields_hint.length ? { fields_hint: o.fields_hint } : {}),
            ...(s(o.example) ? { example: o.example } : {}),
          });
          break;
        case "remove_noun":
          ops.push({ op: "remove_noun", ref: need(o.ref, "ref") });
          break;
        case "add_action":
          ops.push({
            op: "add_action",
            actor: need(o.actor, "actor"),
            verb: need(o.verb, "verb"),
            object: need(o.object, "object"),
            ...(s(o.description) ? { description: o.description } : {}),
            ...(s(o.example) ? { example: o.example } : {}),
          });
          break;
        case "modify_action":
          ops.push({
            op: "modify_action",
            ref: need(o.ref, "ref"),
            ...(s(o.actor) ? { actor: o.actor } : {}),
            ...(s(o.verb) ? { verb: o.verb } : {}),
            ...(s(o.object) ? { object: o.object } : {}),
            ...(s(o.description) ? { description: o.description } : {}),
            ...(s(o.example) ? { example: o.example } : {}),
          });
          break;
        case "remove_action":
          ops.push({ op: "remove_action", ref: need(o.ref, "ref") });
          break;
        case "add_rule":
          ops.push({ op: "add_rule", text: need(o.text, "text"), ...(o.kind ? { kind: o.kind } : {}), ...(s(o.example) ? { example: o.example } : {}) });
          break;
        case "modify_rule":
          ops.push({ op: "modify_rule", ref: need(o.ref, "ref"), ...(s(o.text) ? { text: o.text } : {}), ...(o.kind ? { kind: o.kind } : {}), ...(s(o.example) ? { example: o.example } : {}) });
          break;
        case "remove_rule":
          ops.push({ op: "remove_rule", ref: need(o.ref, "ref") });
          break;
        case "add_non_goal":
          ops.push({ op: "add_non_goal", text: need(o.text, "text") });
          break;
        case "remove_non_goal":
          ops.push({ op: "remove_non_goal", ref: need(o.ref, "ref") });
          break;
        case "resolve_decision":
          ops.push({ op: "resolve_decision", id: need(o.id, "id"), chosen: need(o.chosen, "chosen"), ...(s(o.rationale) ? { rationale: o.rationale } : {}) });
          break;
        case "add_decision_option":
          ops.push({ op: "add_decision_option", id: need(o.id, "id"), option: { id: need(o.option_id, "option_id"), label: need(o.option_label, "option_label") } });
          break;
      }
    } catch (e) {
      dropped.push({ op: o.op, reason: (e as Error).message });
    }
  }
  return { ops, dropped };
  function need(v: string, field: string): string {
    const t = s(v);
    if (!t) throw new Error(`missing ${field}`);
    return t;
  }
}

export const SECTIONS = [
  "overview",
  "actors_permissions",
  "data_model",
  "state_machines",
  "rules_invariants",
  "acceptance_scenarios",
  "journeys",
  "non_goals_defaults",
  "glossary",
] as const;
export type SectionId = (typeof SECTIONS)[number];

export const SectionOutSchema = z.object({
  markdown: z.string(),
  traces: z.array(z.object({ anchor: z.string(), sources: z.array(z.string()) })),
});
export type SectionOut = z.infer<typeof SectionOutSchema>;

export const CriticOutSchema = z.object({
  violations: z.array(
    z.object({ rule_id: z.string(), severity: z.enum(["high", "medium", "low"]), where: z.string(), why: z.string(), fix_hint: z.string() }),
  ),
  omissions: z.array(z.object({ item: z.string(), kind: z.enum(["actor", "noun", "action", "rule", "non_goal"]), why: z.string() })),
  score: z.number(),
  verdict: z.enum(["pass", "fail"]),
});
export type CriticOut = z.infer<typeof CriticOutSchema>;

export const ReverseOutSchema = z.object({
  actors: z.array(z.object({ name: z.string(), description: z.string() })),
  nouns: z.array(z.object({ name: z.string(), description: z.string(), fields_hint: z.array(z.string()) })),
  actions: z.array(z.object({ actor: z.string(), verb: z.string(), object: z.string() })),
  rules: z.array(z.object({ text: z.string(), kind: z.enum(["access", "state", "integrity", "scope", "other"]) })),
  non_goals: z.array(z.object({ text: z.string() })),
});
export type ReverseOut = z.infer<typeof ReverseOutSchema>;

export const StoryOutSchema = z.object({
  title: z.string(),
  steps: z.array(z.string()),
  checks: z.array(z.string()),
});
export type StoryOut = z.infer<typeof StoryOutSchema>;

export const SimAnswerSchema = z.object({
  kind: z.enum(["option", "you_decide", "other"]),
  option_id: z.string(),
  text: z.string(),
  reasoning: z.string(),
});
export type SimAnswer = z.infer<typeof SimAnswerSchema>;

export const AugmentRulesOutSchema = z.object({
  additions: z.array(z.object({ text: z.string(), kind: z.enum(["access", "state", "integrity", "scope", "other"]), rationale: z.string(), based_on_pattern_id: z.string() })),
});
export type AugmentRulesOut = z.infer<typeof AugmentRulesOutSchema>;

// ---------- rendering inputs ----------

export function sheetToText(sheet: Sheet, opts: { withDecisions?: boolean; withIds?: boolean } = {}): string {
  const ids = opts.withIds ?? true;
  const L: string[] = [];
  L.push(`ONE-LINER: ${sheet.one_liner}`);
  if (sheet.archetypes.length) L.push(`ARCHETYPES: ${sheet.archetypes.join(", ")}`);
  L.push("ACTORS:");
  for (const a of sheet.actors) L.push(`- ${ids ? `[${a.id}] ` : ""}${a.name}${a.description ? ` — ${a.description}` : ""}`);
  L.push("NOUNS:");
  for (const n of sheet.nouns)
    L.push(
      `- ${ids ? `[${n.id}] ` : ""}${n.name}${n.description ? ` — ${n.description}` : ""}${n.fields_hint.length ? ` (fields: ${n.fields_hint.join(", ")})` : ""}${n.example ? ` e.g. ${n.example}` : ""}`,
    );
  L.push("ACTIONS:");
  for (const a of sheet.actions) {
    const actor = sheet.actors.find((x) => x.id === a.actor)?.name ?? a.actor;
    const noun = sheet.nouns.find((x) => x.id === a.object)?.name ?? a.object;
    L.push(`- ${ids ? `[${a.id}] ` : ""}${actor} ${a.verb} ${noun}${a.example ? ` — e.g. ${a.example}` : ""}`);
  }
  L.push("RULES:");
  for (const r of sheet.rules) L.push(`- ${ids ? `[${r.id}] ` : ""}(${r.kind}) ${r.text}${r.example ? ` — e.g. ${r.example}` : ""}`);
  L.push("NON-GOALS (not in v1):");
  for (const g of sheet.non_goals) L.push(`- ${ids ? `[${g.id}] ` : ""}${g.text}`);
  if (opts.withDecisions) {
    L.push("DECISIONS:");
    for (const d of sheet.decisions) {
      const chosen = d.chosen ? d.options.find((o) => o.id === d.chosen)?.label ?? d.chosen : "(open)";
      L.push(`- [${d.id}] ${d.question} → ${chosen} [${d.status}${d.confidence !== undefined ? ` ${(d.confidence * 100).toFixed(0)}%` : ""}]`);
    }
  }
  return L.join("\n");
}

export function nodesToText(nodes: NodeDef[]): string {
  return nodes
    .map((n) => `- ${n.id} (${n.topic}; consequence ${n.consequence}): ${n.question}\n  options: ${n.options.map((o) => `${o.id}="${o.label}"`).join(" | ")}`)
    .join("\n");
}

export function decisionsToText(decisions: Decision[]): string {
  return decisions
    .map((d) => {
      const chosen = d.chosen ? `${d.chosen} ("${d.options.find((o) => o.id === d.chosen)?.label ?? d.chosen}")` : "(open)";
      const opts = d.options.map((o) => `${o.id}="${o.label}"`).join(" | ");
      return `- ${d.id} [${d.status}${d.confidence !== undefined ? ` ${(d.confidence * 100).toFixed(0)}%` : ""}] ${d.question} → ${chosen}\n  options: ${opts}${d.rationale ? `\n  rationale: ${d.rationale}` : ""}`;
    })
    .join("\n");
}

export function renderPatternsForAugment(patterns: { id: string; pattern: string; frequency_estimate: number; example_phrasing: string }[]): string {
  return patterns.map((p) => `- [${p.id}] (seen in ${p.frequency_estimate}/5 of similar apps) ${p.pattern} — e.g. "${p.example_phrasing}"`).join("\n");
}

// ---------- functions ----------

export interface Fns {
  draft(input: { one_liner: string; extra_context?: string; archetypes: readonly string[] }): Promise<LLMResponse<Draft>>;
  plan(input: { sheet: Sheet; nodes: NodeDef[] }): Promise<LLMResponse<Plan>>;
  sampleWorlds(input: { sheet: Sheet; nodes: NodeDef[]; fixed: Record<string, string>; count: number; batch: number; batches: number }): Promise<LLMResponse<WorldsOut>>;
  card(input: { sheet: Sheet; node: NodeDef; options: { option_id: string; label: string; p: number }[]; also_sets: string[]; prior_answers: string[] }): Promise<LLMResponse<CardOut>>;
  patch(input: { sheet: Sheet; decisions: Decision[]; text: string }): Promise<LLMResponse<PatchOut>>;
  compileSection(input: { sheet: Sheet; section: SectionId; decisions: Decision[]; prior_sections: string }): Promise<LLMResponse<SectionOut>>;
  critique(input: { spec: string; sheet: Sheet }): Promise<LLMResponse<CriticOut>>;
  reverse(input: { spec: string }): Promise<LLMResponse<ReverseOut>>;
  story(input: { spec: string; sheet: Sheet }): Promise<LLMResponse<StoryOut>>;
  simUser(input: { card: Card; persona: string; truth: string }): Promise<LLMResponse<SimAnswer>>;
  augmentRules(input: { sheet: Sheet; patterns: { id: string; pattern: string; frequency_estimate: number; example_phrasing: string }[] }): Promise<LLMResponse<AugmentRulesOut>>;
}

export function makeFns(llm: LLM): Fns {
  return {
    draft: ({ one_liner, extra_context, archetypes }) =>
      llm.structured({
        fn: "drafter",
        tier: "strong",
        system: P.DRAFTER_SYSTEM,
        user: [`ALLOWED ARCHETYPES: ${archetypes.join(", ")}`, `ONE-LINER: ${one_liner}`, extra_context ? `ADDITIONAL CONTEXT FROM THE USER:\n${extra_context}` : ""].filter(Boolean).join("\n\n"),
        schema: DraftSchema,
        effort: "medium",
        maxTokens: 6000,
      }),

    plan: ({ sheet, nodes }) =>
      llm.structured({
        fn: "planner",
        tier: "strong",
        system: P.PLANNER_SYSTEM,
        user: `DESIGN SHEET:\n${sheetToText(sheet)}\n\nCATALOG NODES:\n${nodesToText(nodes)}`,
        schema: PlanSchema,
        effort: "medium",
        maxTokens: 6000,
      }),

    sampleWorlds: ({ sheet, nodes, fixed, count, batch, batches }) =>
      llm.structured({
        fn: "sampler",
        tier: "strong",
        system: P.SAMPLER_SYSTEM,
        user: [
          `DESIGN SHEET:\n${sheetToText(sheet)}`,
          `FIXED DECISIONS (must hold in every world):\n${Object.entries(fixed).map(([k, v]) => `- ${k} = ${v}`).join("\n") || "(none)"}`,
          `DECISION NODES:\n${nodesToText(nodes)}`,
          `Produce ${count} distinct worlds. This is batch ${batch + 1} of ${batches}; batches should explore different plausible user types (batch ${batch + 1}: ${BATCH_HINTS[batch % BATCH_HINTS.length]}).`,
        ].join("\n\n"),
        schema: WorldsOutSchema,
        effort: "medium",
        maxTokens: 8000,
        temperature: 1,
        cacheSalt: `batch${batch}`,
      }),

    card: ({ sheet, node, options, also_sets, prior_answers }) =>
      llm.structured({
        fn: "card",
        tier: "fast",
        system: P.CARD_SYSTEM,
        user: [
          `THE APP (context only):\n${sheetToText(sheet, { withIds: false })}`,
          prior_answers.length ? `ALREADY DECIDED:\n${prior_answers.map((a) => `- ${a}`).join("\n")}` : "",
          `DECISION: ${node.question} (topic: ${node.topic})${node.ask_hint ? `\nHINT: ${node.ask_hint}` : ""}`,
          `OPTIONS TO PHRASE (use these option_ids exactly):\n${options.map((o) => `- ${o.option_id}: ${o.label}`).join("\n")}`,
          `WHAT ELSE THIS SETTLES (raw):\n${also_sets.map((a) => `- ${a}`).join("\n") || "(nothing else)"}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
        schema: CardOutSchema,
        maxTokens: 1200,
        temperature: 0.7,
      }),

    patch: ({ sheet, decisions, text }) =>
      llm.structured({
        fn: "patcher",
        tier: "fast",
        system: P.PATCHER_SYSTEM,
        user: `DESIGN SHEET:\n${sheetToText(sheet)}\n\nDECISIONS:\n${decisionsToText(decisions)}\n\nUSER SAYS:\n${text}`,
        schema: PatchOutSchema,
        maxTokens: 3000,
        temperature: 0,
      }),

    compileSection: ({ sheet, section, decisions, prior_sections }) =>
      llm.structured({
        fn: `compile_${section}`,
        tier: "strong",
        system: P.COMPILER_SYSTEM,
        user: [
          `SECTION TO WRITE: ${section}`,
          `DESIGN SHEET:\n${sheetToText(sheet)}`,
          `DECISION LOG:\n${decisionsToText(decisions)}`,
          prior_sections ? `SECTIONS ALREADY WRITTEN (for consistency; do not repeat):\n${prior_sections}` : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
        schema: SectionOutSchema,
        effort: "high",
        maxTokens: 8000,
      }),

    critique: ({ spec, sheet }) =>
      llm.structured({
        fn: "critic",
        tier: "strong",
        system: P.CRITIC_SYSTEM,
        user: `DESIGN SHEET:\n${sheetToText(sheet, { withDecisions: true })}\n\nSPECIFICATION:\n${spec}`,
        schema: CriticOutSchema,
        effort: "high",
        maxTokens: 6000,
      }),

    reverse: ({ spec }) =>
      llm.structured({
        fn: "reverse",
        tier: "strong",
        system: P.REVERSE_SYSTEM,
        user: `SPECIFICATION:\n${spec}`,
        schema: ReverseOutSchema,
        effort: "medium",
        maxTokens: 6000,
      }),

    story: ({ spec, sheet }) =>
      llm.structured({
        fn: "story",
        tier: "strong",
        system: P.STORY_SYSTEM,
        user: `DESIGN SHEET:\n${sheetToText(sheet, { withIds: false })}\n\nSPECIFICATION:\n${spec}`,
        schema: StoryOutSchema,
        effort: "medium",
        maxTokens: 3000,
      }),

    simUser: ({ card, persona, truth }) =>
      llm.structured({
        fn: "sim_user",
        tier: "strong",
        system: P.SIM_USER_SYSTEM,
        user: [
          `YOUR PERSONA: ${persona}`,
          `HIDDEN REQUIREMENTS (the truth about the app you want):\n${truth}`,
          `CARD (decision id: ${card.node_id}):\n${card.context}\n${card.options.map((o) => `- ${o.option_id}: ${o.scenario}`).join("\n")}`,
        ].join("\n\n"),
        schema: SimAnswerSchema,
        effort: "low",
        maxTokens: 600,
      }),

    augmentRules: ({ sheet, patterns }) =>
      llm.structured({
        fn: "augment_rules",
        tier: "strong",
        system: P.AUGMENT_RULES_SYSTEM,
        user: [`DRAFT SHEET:\n${sheetToText(sheet)}`, `REFERENCE PATTERNS FROM SIMILAR REAL APPS:\n${renderPatternsForAugment(patterns)}`].join("\n\n"),
        schema: AugmentRulesOutSchema,
        effort: "medium",
        maxTokens: 3000,
      }),
  };
}

const BATCH_HINTS = [
  "lean toward the simplest, most common setups (solo or very small business, low tech appetite)",
  "lean toward established small businesses with staff and some process",
  "lean toward demanding users who want automation, integrations and history",
  "mix: one of each kind",
];
