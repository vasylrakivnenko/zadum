/**
 * PgStore — Postgres persistence. Same semantics as FileStore; full Sheet snapshot per commit (sheet_versions),
 * append-only decisions/events. Migrations are idempotent and run on connect().
 */
import postgres from "postgres";
import type { Store } from "./store.js";
import type { Sheet } from "../core/sheet.js";
import { CommitSchema, type Commit } from "../core/commit.js";
import type { SessionState, ZEvent, ProjectRecord, Artifact } from "../core/session.js";

export const MIGRATIONS: { id: string; sql: string }[] = [
  {
    id: "0001_init",
    sql: `
    create table if not exists zadum_migrations (id text primary key, applied_at timestamptz not null default now());
    create table if not exists projects (
      id text primary key,
      one_liner text not null,
      phase text not null,
      latest_version int not null default 0,
      created_at timestamptz not null,
      updated_at timestamptz not null
    );
    create table if not exists commits (
      id text primary key,
      project_id text not null references projects(id) on delete cascade,
      version int not null,
      parent_version int not null,
      source_kind text not null,
      source_ref text,
      message text not null,
      ops jsonb not null,
      cascaded jsonb not null default '[]'::jsonb,
      rejected jsonb not null default '[]'::jsonb,
      sheet jsonb not null,
      created_at timestamptz not null,
      unique (project_id, version)
    );
    create index if not exists commits_project_idx on commits(project_id, version);
    create table if not exists sessions (
      project_id text primary key references projects(id) on delete cascade,
      state jsonb not null,
      updated_at timestamptz not null
    );
    create table if not exists events (
      id text primary key,
      project_id text not null references projects(id) on delete cascade,
      ts timestamptz not null,
      type text not null,
      payload jsonb not null,
      tags jsonb not null
    );
    create index if not exists events_project_idx on events(project_id, ts);
    create index if not exists events_type_idx on events(type);
    create table if not exists artifacts (
      project_id text not null references projects(id) on delete cascade,
      name text not null,
      kind text not null,
      content text not null,
      meta jsonb,
      created_at timestamptz not null,
      primary key (project_id, name)
    );
    `,
  },
];

export class PgStore implements Store {
  readonly kind = "postgres" as const;
  private constructor(private sql: postgres.Sql) {}

  static async connect(url: string): Promise<PgStore> {
    const sql = postgres(url, { max: 5, onnotice: () => undefined });
    const store = new PgStore(sql);
    await store.migrate();
    return store;
  }

  async migrate() {
    await this.sql.unsafe(`create table if not exists zadum_migrations (id text primary key, applied_at timestamptz not null default now())`);
    const done = new Set((await this.sql<{ id: string }[]>`select id from zadum_migrations`).map((r) => r.id));
    for (const m of MIGRATIONS) {
      if (done.has(m.id)) continue;
      await this.sql.begin(async (tx) => {
        await tx.unsafe(m.sql);
        await tx`insert into zadum_migrations (id) values (${m.id})`;
      });
    }
  }

  async createProject(p: ProjectRecord) {
    await this.sql`insert into projects (id, one_liner, phase, latest_version, created_at, updated_at)
      values (${p.id}, ${p.one_liner}, ${p.phase}, ${p.latest_version}, ${p.created_at}, ${p.updated_at})
      on conflict (id) do update set one_liner = excluded.one_liner, phase = excluded.phase, latest_version = excluded.latest_version, updated_at = excluded.updated_at`;
  }
  async updateProject(p: ProjectRecord) {
    await this.createProject(p);
  }
  async getProject(id: string) {
    const rows = await this.sql<ProjectRow[]>`select * from projects where id = ${id}`;
    return rows[0] ? toProject(rows[0]) : null;
  }
  async listProjects() {
    const rows = await this.sql<ProjectRow[]>`select * from projects order by created_at`;
    return rows.map(toProject);
  }

  async appendCommit(c: Commit) {
    CommitSchema.parse(c);
    await this.sql.begin(async (tx) => {
      await tx`insert into commits (id, project_id, version, parent_version, source_kind, source_ref, message, ops, cascaded, rejected, sheet, created_at)
        values (${c.id}, ${c.project_id}, ${c.version}, ${c.parent_version}, ${c.source.kind}, ${c.source.ref ?? null}, ${c.message},
                ${tx.json(c.ops as unknown as postgres.JSONValue)}, ${tx.json(c.cascaded as unknown as postgres.JSONValue)}, ${tx.json(c.rejected as unknown as postgres.JSONValue)},
                ${tx.json(c.sheet as unknown as postgres.JSONValue)}, ${c.created_at})`;
      await tx`update projects set latest_version = greatest(latest_version, ${c.version}), updated_at = now() where id = ${c.project_id}`;
    });
  }
  async listCommits(projectId: string) {
    const rows = await this.sql<CommitRow[]>`select * from commits where project_id = ${projectId} order by version`;
    return rows.map(toCommit);
  }
  async getLatestSheet(projectId: string) {
    const rows = await this.sql<{ sheet: Sheet }[]>`select sheet from commits where project_id = ${projectId} order by version desc limit 1`;
    return rows[0]?.sheet ?? null;
  }
  async getSheetVersion(projectId: string, version: number) {
    const rows = await this.sql<{ sheet: Sheet }[]>`select sheet from commits where project_id = ${projectId} and version = ${version}`;
    return rows[0]?.sheet ?? null;
  }

  async saveSession(s: SessionState) {
    await this.sql`insert into sessions (project_id, state, updated_at) values (${s.project_id}, ${this.sql.json(s as unknown as postgres.JSONValue)}, ${s.updated_at})
      on conflict (project_id) do update set state = excluded.state, updated_at = excluded.updated_at`;
  }
  async getSession(projectId: string) {
    const rows = await this.sql<{ state: SessionState }[]>`select state from sessions where project_id = ${projectId}`;
    return rows[0]?.state ?? null;
  }

  async appendEvent(e: ZEvent) {
    await this.sql`insert into events (id, project_id, ts, type, payload, tags) values (${e.id}, ${e.project_id}, ${e.ts}, ${e.type}, ${this.sql.json(e.payload as postgres.JSONValue)}, ${this.sql.json(e.tags as unknown as postgres.JSONValue)})`;
  }
  async listEvents(projectId: string) {
    const rows = await this.sql<EventRow[]>`select * from events where project_id = ${projectId} order by ts`;
    return rows.map((r) => ({ id: r.id, project_id: r.project_id, ts: new Date(r.ts).toISOString(), type: r.type as ZEvent["type"], payload: r.payload, tags: r.tags }));
  }

  async saveArtifact(a: Artifact) {
    await this.sql`insert into artifacts (project_id, name, kind, content, meta, created_at) values (${a.project_id}, ${a.name}, ${a.kind}, ${a.content}, ${this.sql.json((a.meta ?? null) as postgres.JSONValue)}, ${a.created_at})
      on conflict (project_id, name) do update set kind = excluded.kind, content = excluded.content, meta = excluded.meta, created_at = excluded.created_at`;
  }
  async listArtifacts(projectId: string) {
    const rows = await this.sql<ArtifactRow[]>`select * from artifacts where project_id = ${projectId} order by name`;
    return rows.map((r) => ({ project_id: r.project_id, name: r.name, kind: r.kind as Artifact["kind"], content: r.content, created_at: new Date(r.created_at).toISOString(), ...(r.meta ? { meta: r.meta } : {}) }));
  }

  async close() {
    await this.sql.end({ timeout: 5 });
  }
}

interface ProjectRow { id: string; one_liner: string; phase: string; latest_version: number; created_at: Date; updated_at: Date }
interface CommitRow { id: string; project_id: string; version: number; parent_version: number; source_kind: string; source_ref: string | null; message: string; ops: Commit["ops"]; cascaded: Commit["cascaded"]; rejected: Commit["rejected"]; sheet: Sheet; created_at: Date }
interface EventRow { id: string; project_id: string; ts: Date; type: string; payload: Record<string, unknown>; tags: ZEvent["tags"] }
interface ArtifactRow { project_id: string; name: string; kind: string; content: string; meta: Record<string, unknown> | null; created_at: Date }

function toProject(r: ProjectRow): ProjectRecord {
  return { id: r.id, one_liner: r.one_liner, phase: r.phase as ProjectRecord["phase"], latest_version: r.latest_version, created_at: new Date(r.created_at).toISOString(), updated_at: new Date(r.updated_at).toISOString() };
}
function toCommit(r: CommitRow): Commit {
  return {
    id: r.id,
    project_id: r.project_id,
    version: r.version,
    parent_version: r.parent_version,
    ops: r.ops,
    cascaded: r.cascaded,
    rejected: r.rejected,
    source: { kind: r.source_kind as Commit["source"]["kind"], ...(r.source_ref ? { ref: r.source_ref } : {}) },
    message: r.message,
    created_at: new Date(r.created_at).toISOString(),
    sheet: r.sheet,
  };
}
