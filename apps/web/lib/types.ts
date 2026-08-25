/** Wire types shared by the Route Handlers and the client pages (types only — erased at build). */
import type { Sheet, Decision } from "@engine/core/sheet";
import type { Phase } from "@engine/core/session";
import type { DealResult, DefaultItem } from "@engine/engine/orchestrator";
import type { CriticOut, StoryOut } from "@engine/llm/functions";
import type { RoundTripReport } from "@engine/engine/compile";
import type { GapCandidate, SpecGap } from "@engine/engine/gap_parse";

export type { Sheet, Decision, DealResult, DefaultItem, Phase, CriticOut, StoryOut, RoundTripReport, GapCandidate, SpecGap };

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

/**
 * One point on the information-gain curve: a card that was dealt, with how much of the remaining
 * uncertainty it stood to settle (`share`, 0–1) and the settledness at the moment it was shown.
 * Coarse by design — the belief behind it is 12 sampled worlds, so bars, never a smooth line.
 */
export interface CurvePoint {
  card_index: number;
  card_id: string;
  node: string;
  topic: string;
  share: number;
  settledness: number;
  answered: boolean;
}

/**
 * How much story-checking is left to do: `pending` scenarios already composed and awaiting an answer,
 * `checkable` assumed decisions that a scenario could still be composed over. Both zero → the panel has
 * nothing to offer and the page goes straight to the assumed-decisions list.
 */
export interface VerificationSummary {
  pending: number;
  checkable: number;
}

export interface ProjectState {
  project: ProjectSummary;
  sheet: Sheet;
  assumptions: string[];
  session: { phase: Phase; cards: number; answers: number; last_stop_reason: string | null; settledness: number };
  card: DealResult | null; // pending card, or the stop result once the loop ended; null before cards start
  decided: DecidedEntry[]; // most recent first
  curve: CurvePoint[]; // cards in deal order (undo-safe: only cards still in the session)
  verification: VerificationSummary; // story checks available / awaiting an answer
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
  /** the Sheet changed while sections compiled — the spec reflects an older version and phase is not done */
  stale: boolean;
}

/** GET /api/projects/[id]/story — the compiled "day in the life" walkthrough, parsed from story.md. */
export interface StoryResponse {
  title: string;
  steps: string[];
  checks: string[];
  compiled_at: string;
}

/** POST /api/projects/[id]/story/correct — same shape as an edit: what got applied/implied. */
export type StoryCorrectResponse = EditResponse;

/**
 * One story check: a short scenario that bundles several assumed decisions whose joint odds of all being
 * right sit near 50/50 — the most informative thing a person can be asked to skim and confirm.
 */
export interface VerificationProbe {
  id: string;
  scenario: string;
  p_all_correct: number;
  nodes: { node_id: string; question: string; answer_label: string }[];
}

/** GET /api/projects/[id]/verification — the current round of story checks (recomposed on every call). */
export interface VerificationResponse {
  probes: VerificationProbe[];
}

/** POST /api/projects/[id]/verification/answer — one verdict; `defaults` comes back refreshed. */
export interface VerificationAnswerResponse {
  implied: ImpliedLabels;
  confirmed: { node: string; topic: string; label: string }[];
  sheet_version: number;
  defaults: DefaultItem[];
}

/**
 * GET/POST /api/projects/[id]/gaps — the places the compiled spec had to guess, clustered into candidate
 * questions. `applied` is non-empty only for the POST that adds them back to the card loop.
 */
export interface GapsResponse {
  gaps: SpecGap[];
  candidates: GapCandidate[];
  applied: string[];
}

/** One thing the evidence moved: a decision whose most likely answer shifted (or firmed up). */
export interface ShiftLabel {
  node: string;
  topic: string;
  from: string;
  to: string;
  p_from: number;
  p_to: number;
}

/** POST /api/projects/[id]/evidence — belief-only: never touches the Sheet (Rule 1). */
export interface EvidenceResponse {
  shifts: ShiftLabel[];
  ess_before: number;
  ess_after: number;
  state: ProjectState;
}

export interface ErrorResponse {
  error: string;
}

/* ---- spec workspace (/p/[id]/spec) ---------------------------------------------------------------- */

/**
 * GET /api/projects/[id]/spec — the compiled spec plus everything the workspace needs to frame it.
 * `has_spec:false` (with `markdown:""`) is the ordinary pre-compile state, not an error.
 */
export interface SpecResponse {
  markdown: string;
  artifacts: string[];
  sheet_version: number;
  /** the Sheet version `spec.md` was compiled from, from compile-report.json (null when nothing compiled) */
  compiled_version: number | null;
  /** the Sheet has moved past the compiled version — the spec on screen is behind the design */
  stale: boolean;
  critic: { verdict: string; score: number } | null;
  has_spec: boolean;
}

/** One piece of feedback on the spec: free text, optionally anchored to a passage the user selected. */
export interface SpecComment {
  quote?: string;
  text: string;
}

/** POST /api/projects/[id]/spec/refine — the request body. */
export interface SpecFeedback {
  edited?: string;
  comments?: SpecComment[];
  /** recompile after applying the feedback (default true) */
  recompile?: boolean;
}

/** What the system understood from the feedback, before anything was applied to the Sheet. */
export interface SpecExtraction {
  wrong_assumptions: { node: string; was: string; should_be?: string; why: string }[];
  missing_elements: { kind: "actor" | "noun" | "action" | "rule" | "non_goal"; text: string }[];
  confirmed_elements: string[];
  new_questions: { id: string; question: string }[];
}

/** Engine.refineFromSpecFeedback's result (landing in src/engine/orchestrator.ts in parallel). */
export interface SpecRefineResult {
  extraction: SpecExtraction;
  version: number;
  applied: unknown[];
  rejected: { error: string }[];
  /** decision ids reopened because the feedback contradicted an earlier answer */
  reopened: string[];
  /** new open decisions created from `extraction.new_questions` */
  added_decisions: string[];
  notes: string;
}

/**
 * POST /api/projects/[id]/spec/refine — the refinement, plus the recompile it triggered.
 * `recompiled` is null when the caller opted out, or when the ledger gate refused the compile: in that case
 * `blocked` carries the engine's message and the feedback is still saved on the Sheet.
 */
export interface SpecRefineResponse extends Omit<SpecRefineResult, "applied"> {
  recompiled: { markdown: string; critic: { verdict: string; score: number }; stale: boolean } | null;
  blocked?: string;
}
