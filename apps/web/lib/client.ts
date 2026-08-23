/** Browser-side fetch helpers for the /api routes. Throws Error(message) on non-2xx. */
import type { AnswerResponse, CompileResponse, CreateResponse, DealResult, DefaultItem, EditResponse, OverrideResponse, Phase, ProjectState, UndoResponse } from "./types";

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
  answer: (id: string, body: { kind: "option" | "you_decide" | "skip" | "other"; option_id?: string; text?: string; think_ms?: number }) => post<AnswerResponse>(`/api/projects/${id}/cards/answer`, body),
  undo: (id: string) => post<UndoResponse>(`/api/projects/${id}/cards/undo`),
  finishCards: (id: string) => post<{ defaults: DefaultItem[] }>(`/api/projects/${id}/cards/finish`),
  defaults: (id: string) => call<{ defaults: DefaultItem[]; phase: Phase }>(`/api/projects/${id}/defaults`),
  override: (id: string, node: string, option: string) => post<OverrideResponse>(`/api/projects/${id}/defaults/override`, { node, option }),
  accept: (id: string) => post<{ ok: true }>(`/api/projects/${id}/defaults/accept`),
  compile: (id: string) => post<CompileResponse>(`/api/projects/${id}/compile`, {}),
  artifacts: (id: string) => call<{ bundle: { name: string; kind: string; created_at: string }[] }>(`/api/projects/${id}/compile`),
};

export function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
