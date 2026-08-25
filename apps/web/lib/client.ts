/** Browser-side fetch helpers for the /api routes. Throws Error(message) on non-2xx. */
import type { AnswerResponse, CompileResponse, CreateResponse, DealResult, DefaultItem, EditResponse, EvidenceResponse, GapsResponse, OverrideResponse, Phase, ProjectState, SpecFeedback, SpecRefineResponse, SpecResponse, StoryCorrectResponse, StoryResponse, UndoResponse, VerificationAnswerResponse, VerificationResponse } from "./types";

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg = typeof data === "object" && data !== null && "error" in data && typeof (data as { error: unknown }).error === "string" ? (data as { error: string }).error : `${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  return data as T;
}

const post = <T>(path: string, body?: unknown) => call<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

export const api = {
  createProject: (one_liner: string, extra_context?: string) => post<CreateResponse>("/api/projects", { one_liner, ...(extra_context ? { extra_context } : {}) }),
  state: (id: string) => call<ProjectState>(`/api/projects/${id}`),
  edit: (id: string, text: string) => post<EditResponse>(`/api/projects/${id}/edit`, { text }),
  startCards: (id: string) => post<{ deal: DealResult; state: ProjectState }>(`/api/projects/${id}/cards/start`),
  continueCards: (id: string) => post<{ deal: DealResult; state: ProjectState }>(`/api/projects/${id}/cards/continue`),
  answer: (id: string, body: { kind: "option" | "you_decide" | "skip" | "other"; option_id?: string; text?: string; think_ms?: number }) => post<AnswerResponse>(`/api/projects/${id}/cards/answer`, body),
  undo: (id: string) => post<UndoResponse>(`/api/projects/${id}/cards/undo`),
  finishCards: (id: string) => post<{ defaults: DefaultItem[] }>(`/api/projects/${id}/cards/finish`),
  defaults: (id: string) => call<{ defaults: DefaultItem[]; phase: Phase }>(`/api/projects/${id}/defaults`),
  override: (id: string, node: string, option: string) => post<OverrideResponse>(`/api/projects/${id}/defaults/override`, { node, option }),
  accept: (id: string) => post<{ ok: true }>(`/api/projects/${id}/defaults/accept`),
  compile: (id: string) => post<CompileResponse>(`/api/projects/${id}/compile`, {}),
  artifacts: (id: string) => call<{ bundle: { name: string; kind: string; created_at: string }[] }>(`/api/projects/${id}/compile`),
  story: (id: string) => call<StoryResponse>(`/api/projects/${id}/story`),
  storyCorrect: (id: string, text: string) => post<StoryCorrectResponse>(`/api/projects/${id}/story/correct`, { text }),
  /** story checks: fetch a round, answer one, then fetch again — the round is recomposed from the new belief. */
  verification: (id: string, max?: number) => call<VerificationResponse>(`/api/projects/${id}/verification${max ? `?max=${max}` : ""}`),
  answerVerification: (id: string, body: { probe_id: string; ok: boolean; correction?: { node_id: string; option_id: string } }) => post<VerificationAnswerResponse>(`/api/projects/${id}/verification/answer`, body),
  gaps: (id: string) => call<GapsResponse>(`/api/projects/${id}/gaps`),
  applyGaps: (id: string, apply: number) => post<GapsResponse>(`/api/projects/${id}/gaps`, { apply }),
  evidence: (id: string, text: string) => post<EvidenceResponse>(`/api/projects/${id}/evidence`, { text }),
  /** the compiled spec + the frame the workspace needs (critic verdict, versions, staleness) */
  spec: (id: string) => call<SpecResponse>(`/api/projects/${id}/spec`),
  /** edits and comments → Sheet patches → (unless recompile:false) a freshly compiled spec */
  refineSpec: (id: string, body: SpecFeedback) => post<SpecRefineResponse>(`/api/projects/${id}/spec/refine`, body),
};

/** A plain href — the browser downloads it because the route sets content-disposition. */
export function specDownloadUrl(id: string, name = "spec.md"): string {
  return `/api/projects/${id}/spec/download?name=${encodeURIComponent(name)}`;
}

export function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
