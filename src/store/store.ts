/** Persistence boundary. Everything the engine keeps goes through this interface. */
import type { Sheet } from "../core/sheet.js";
import type { Commit } from "../core/commit.js";
import type { SessionState, ZEvent, ProjectRecord, Artifact } from "../core/session.js";

export interface Store {
  readonly kind: "file" | "postgres" | "memory";
  createProject(p: ProjectRecord): Promise<void>;
  updateProject(p: ProjectRecord): Promise<void>;
  getProject(id: string): Promise<ProjectRecord | null>;
  listProjects(): Promise<ProjectRecord[]>;

  appendCommit(c: Commit): Promise<void>;
  listCommits(projectId: string): Promise<Commit[]>;
  getLatestSheet(projectId: string): Promise<Sheet | null>;
  getSheetVersion(projectId: string, version: number): Promise<Sheet | null>;

  saveSession(s: SessionState): Promise<void>;
  getSession(projectId: string): Promise<SessionState | null>;

  appendEvent(e: ZEvent): Promise<void>;
  listEvents(projectId: string): Promise<ZEvent[]>;

  saveArtifact(a: Artifact): Promise<void>;
  listArtifacts(projectId: string): Promise<Artifact[]>;

  close(): Promise<void>;
}
