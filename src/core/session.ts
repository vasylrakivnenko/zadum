/**
 * Session state (the engine's belief + card loop bookkeeping) and event types.
 * Pure types; persisted as JSON by the store. The Sheet lives in commits, not here.
 */
import type { Belief } from "./worlds.js";
import type { SelectorConfig } from "./selector.js";

export type Phase = "drafting" | "correcting" | "cards" | "defaults_review" | "compiling" | "done" | "failed";

export interface CardOption {
  option_id: string;
  label: string; // catalog label (internal)
  scenario: string; // consequence-phrased future the user can picture
}

export interface Card {
  id: string;
  node_id: string;
  context: string; // one sentence of context
  options: CardOption[];
  also_sets: string[]; // plain-language list of what answering settles
  created_at: string;
  model?: string;
  latency_ms?: number;
  phrasing_arm?: string; // bandit arm id (learning loop B)
  precomputed?: boolean;
}

export type AnswerKind = "option" | "you_decide" | "other" | "skip" | "undo";

export interface Answer {
  card_id: string;
  node_id: string;
  kind: AnswerKind;
  option_id?: string;
  text?: string; // for "other"
  at: string;
  think_ms?: number;
}

export interface SessionVersions {
  catalog: string;
  prompts: string;
  models: { strong: string; fast: string };
  arm?: string; // experiment arm
}

export interface SessionState {
  project_id: string;
  phase: Phase;
  config: SelectorConfig;
  belief: Belief;
  cards: Card[];
  answers: Answer[];
  pending_card?: Card;
  /** key `${pending_card.id}:${option_id}` → speculatively generated next card */
  precomputed: Record<string, Card>;
  /** per-session consequence overrides (e.g., "you decide" → 0) */
  consequence_override: Record<string, number>;
  /** belief snapshots taken before each answer, for undo */
  history: { card_id: string; worlds: Belief["worlds"]; consequence_override: Record<string, number>; sheet_version: number }[];
  resample_count: number;
  versions: SessionVersions;
  last_stop_reason?: string;
  created_at: string;
  updated_at: string;
}

export type EventType =
  | "project_created"
  | "draft_created"
  | "rules_augmented"
  | "plan_created"
  | "worlds_sampled"
  | "edit_applied"
  | "card_shown"
  | "card_answered"
  | "implications_applied"
  | "card_loop_stopped"
  | "default_set"
  | "default_overridden"
  | "defaults_accepted"
  | "compile_started"
  | "compile_section"
  | "critic_result"
  | "roundtrip_result"
  | "compile_done"
  | "story_corrected"
  | "llm_call"
  | "error";

export interface ZEvent {
  id: string;
  project_id: string;
  ts: string;
  type: EventType;
  payload: Record<string, unknown>;
  tags: SessionVersions & { phase?: Phase };
}

export interface ProjectRecord {
  id: string;
  one_liner: string;
  created_at: string;
  updated_at: string;
  phase: Phase;
  latest_version: number;
}

export interface Artifact {
  project_id: string;
  name: string; // file name, e.g. spec.md
  kind: "spec_md" | "sheet_md" | "sheet_json" | "agents_md" | "report_json" | "story_md" | "other";
  content: string;
  created_at: string;
  meta?: Record<string, unknown>;
}
