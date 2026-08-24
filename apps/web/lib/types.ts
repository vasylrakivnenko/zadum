/** Wire types shared by the Route Handlers and the client pages (types only — erased at build). */
import type { Sheet, Decision } from "@engine/core/sheet";
import type { Phase } from "@engine/core/session";
import type { DealResult, DefaultItem } from "@engine/engine/orchestrator";
import type { CriticOut, StoryOut } from "@engine/llm/functions";
import type { RoundTripReport } from "@engine/engine/compile";

export type { Sheet, Decision, DealResult, DefaultItem, Phase, CriticOut, StoryOut, RoundTripReport };

export interface ProjectSummary {
  id: string;
  one_liner: string;
  phase: Phase;
  latest_version: number;
  created_at: string;
  updated_at: string;
}

/** A settled decision, phrased for people: topic → chosen label. */
export interface DecidedEntry {
  id: string;
  topic: string;
  label: string;
  status: Decision["status"];
  via: string; // commit source kind: card_answer | implication | user_edit | plan | default | defaults_review
  confidence: number | null;
}

/** What an answer/edit also decided, with labels. */
export interface ImpliedLabels {
  hard: { node: string; topic: string; label: string }[];
  soft: { node: string; topic: string; label: string; p: number }[];
  /** hard edges this answer implies that clash with a decision the user already resolved: their answer stands */
  contradictions: { node: string; topic: string; label: string; had: string }[];
}

export interface ProjectState {
  project: ProjectSummary;
  sheet: Sheet;
  assumptions: string[];
  session: { phase: Phase; cards: number; answers: number; last_stop_reason: string | null; settledness: number };
  card: DealResult | null; // pending card, or the stop result once the loop ended; null before cards start
  decided: DecidedEntry[]; // most recent first
}

export interface CreateResponse {
  project: ProjectSummary;
  sheet: Sheet;
  assumptions: string[];
}

export interface EditResponse {
  version: number;
  applied: number;
  rejected: string[];
  dropped: number;
  notes: string;
  implied: ImpliedLabels;
  state: ProjectState;
}

export interface AnswerResponse {
  implied: ImpliedLabels;
  sheet_version: number;
  next: DealResult;
  state: ProjectState;
}

export interface UndoResponse {
  restored: DealResult | null;
  state: ProjectState;
}

export interface OverrideResponse {
  version: number;
  implied: ImpliedLabels;
  defaults: DefaultItem[];
}

export interface CompileResponse {
  bundle: string[];
  critic: CriticOut;
  critic_rounds: number;
  roundtrip: RoundTripReport | null;
  story: StoryOut | null;
  latency_ms: number;
  sheet_version: number;
  phase: Phase;
}

export interface ErrorResponse {
  error: string;
}
