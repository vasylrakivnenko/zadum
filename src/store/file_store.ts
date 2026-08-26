/**
 * FileStore — zero-setup persistence: one directory per project under <dataDir>/projects/<id>/
 *   project.json, commits.jsonl (append-only), sheet.json (latest snapshot), session.json, events.jsonl, artifacts/
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Store } from "./store.js";
import type { Sheet } from "../core/sheet.js";
import { CommitSchema, type Commit } from "../core/commit.js";
import type { SessionState, ZEvent, ProjectRecord, Artifact } from "../core/session.js";

export class FileStore implements Store {
  readonly kind = "file" as const;
  constructor(public readonly dataDir: string) {}

  private pdir(id: string) {
    return path.join(this.dataDir, "projects", id);
  }
  private async ensure(id: string) {
    await fs.mkdir(path.join(this.pdir(id), "artifacts"), { recursive: true });
  }
  private async readJson<T>(file: string): Promise<T | null> {
    try {
      return JSON.parse(await fs.readFile(file, "utf8")) as T;
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }
  /** Atomic write (tmp + rename): readers never observe a half-written file even while background
   *  precompute saves the session concurrently. */
  private async writeJsonAtomic(file: string, data: unknown) {
    const tmp = `${file}.${randomUUID().slice(0, 8)}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2));
    await fs.rename(tmp, file);
  }
  private async readJsonl<T>(file: string): Promise<T[]> {
    const raw = await fs.readFile(file, "utf8").catch((e: NodeJS.ErrnoException) => {
      if (e.code === "ENOENT") return "";
      throw e;
    });
    return raw
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l) as T);
  }

  async createProject(p: ProjectRecord) {
    await this.ensure(p.id);
    await this.writeJsonAtomic(path.join(this.pdir(p.id), "project.json"), p);
  }
  async updateProject(p: ProjectRecord) {
    await this.createProject(p);
  }
  async getProject(id: string) {
    return this.readJson<ProjectRecord>(path.join(this.pdir(id), "project.json"));
  }
  async listProjects(ownerId?: string) {
    const root = path.join(this.dataDir, "projects");
    const ids = await fs.readdir(root).catch(() => [] as string[]);
    const out: ProjectRecord[] = [];
    for (const id of ids) {
      const p = await this.getProject(id);
      if (p && (ownerId === undefined || p.owner_id === ownerId)) out.push(p);
    }
    return out.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }

  async appendCommit(c: Commit) {
    await this.ensure(c.project_id);
    CommitSchema.parse(c);
    await fs.appendFile(path.join(this.pdir(c.project_id), "commits.jsonl"), JSON.stringify(c) + "\n");
    await this.writeJsonAtomic(path.join(this.pdir(c.project_id), "sheet.json"), c.sheet);
  }
  async listCommits(projectId: string) {
    return this.readJsonl<Commit>(path.join(this.pdir(projectId), "commits.jsonl"));
  }
  async getLatestSheet(projectId: string) {
    return this.readJson<Sheet>(path.join(this.pdir(projectId), "sheet.json"));
  }
  async getSheetVersion(projectId: string, version: number) {
    const commits = await this.listCommits(projectId);
    return commits.find((c) => c.version === version)?.sheet ?? null;
  }

  async saveSession(s: SessionState) {
    await this.ensure(s.project_id);
    await this.writeJsonAtomic(path.join(this.pdir(s.project_id), "session.json"), s);
  }
  async getSession(projectId: string) {
    return this.readJson<SessionState>(path.join(this.pdir(projectId), "session.json"));
  }

  async appendEvent(e: ZEvent) {
    await this.ensure(e.project_id);
    await fs.appendFile(path.join(this.pdir(e.project_id), "events.jsonl"), JSON.stringify(e) + "\n");
  }
  async listEvents(projectId: string) {
    return this.readJsonl<ZEvent>(path.join(this.pdir(projectId), "events.jsonl"));
  }

  async saveArtifact(a: Artifact) {
    await this.ensure(a.project_id);
    await fs.writeFile(path.join(this.pdir(a.project_id), "artifacts", a.name), a.content);
    const metaFile = path.join(this.pdir(a.project_id), "artifacts", "_index.json");
    const idx = (await this.readJson<Omit<Artifact, "content">[]>(metaFile)) ?? [];
    const { content: _c, ...meta } = a;
    await this.writeJsonAtomic(metaFile, [...idx.filter((x) => x.name !== a.name), meta]);
  }
  async listArtifacts(projectId: string) {
    const dir = path.join(this.pdir(projectId), "artifacts");
    const idx = (await this.readJson<Omit<Artifact, "content">[]>(path.join(dir, "_index.json"))) ?? [];
    const out: Artifact[] = [];
    for (const m of idx) {
      const content = await fs.readFile(path.join(dir, m.name), "utf8").catch(() => "");
      out.push({ ...m, content });
    }
    return out;
  }

  async close() {}
}

/** In-memory store for tests (same semantics, no disk). */
export class MemoryStore implements Store {
  readonly kind = "memory" as const;
  projects = new Map<string, ProjectRecord>();
  commits = new Map<string, Commit[]>();
  sessions = new Map<string, SessionState>();
  events = new Map<string, ZEvent[]>();
  artifacts = new Map<string, Artifact[]>();
  async createProject(p: ProjectRecord) {
    this.projects.set(p.id, p);
  }
  async updateProject(p: ProjectRecord) {
    this.projects.set(p.id, p);
  }
  async getProject(id: string) {
    return this.projects.get(id) ?? null;
  }
  async listProjects(ownerId?: string) {
    return [...this.projects.values()]
      .filter((p) => ownerId === undefined || p.owner_id === ownerId)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }
  async appendCommit(c: Commit) {
    CommitSchema.parse(c);
    this.commits.set(c.project_id, [...(this.commits.get(c.project_id) ?? []), c]);
  }
  async listCommits(id: string) {
    return this.commits.get(id) ?? [];
  }
  async getLatestSheet(id: string) {
    const cs = this.commits.get(id) ?? [];
    return cs.length ? cs[cs.length - 1]!.sheet : null;
  }
  async getSheetVersion(id: string, v: number) {
    return (this.commits.get(id) ?? []).find((c) => c.version === v)?.sheet ?? null;
  }
  async saveSession(s: SessionState) {
    this.sessions.set(s.project_id, JSON.parse(JSON.stringify(s)));
  }
  async getSession(id: string) {
    return this.sessions.get(id) ?? null;
  }
  async appendEvent(e: ZEvent) {
    this.events.set(e.project_id, [...(this.events.get(e.project_id) ?? []), e]);
  }
  async listEvents(id: string) {
    return this.events.get(id) ?? [];
  }
  async saveArtifact(a: Artifact) {
    this.artifacts.set(a.project_id, [...(this.artifacts.get(a.project_id) ?? []).filter((x) => x.name !== a.name), a]);
  }
  async listArtifacts(id: string) {
    return this.artifacts.get(id) ?? [];
  }
  async close() {}
}
