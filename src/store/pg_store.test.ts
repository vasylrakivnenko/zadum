import { describe, it, expect } from "vitest";
import { PgStore } from "./pg_store.js";
import { emptySheet } from "../core/sheet.js";
import { makeCommit } from "../core/commit.js";
import { resolveConfig } from "../core/selector.js";

const url = process.env.DATABASE_URL;
const maybe = url ? describe : describe.skip;

maybe("PgStore (requires DATABASE_URL)", () => {
  it("round-trips projects, commits, sessions, events, artifacts", async () => {
    const store = await PgStore.connect(url!);
    const id = `t_${Date.now()}`;
    await store.createProject({ id, one_liner: "x", phase: "drafting", latest_version: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    const s0 = emptySheet(id, "x");
    const { commit } = makeCommit(s0, [{ op: "add_actor", name: "Owner" }], { id: `${id}_c1`, source: { kind: "draft" }, message: "draft", now: new Date().toISOString(), strict: true });
    await store.appendCommit(commit!);
    expect((await store.getLatestSheet(id))?.actors[0]?.name).toBe("Owner");
    expect((await store.getProject(id))?.latest_version).toBe(1);
    expect((await store.listCommits(id)).length).toBe(1);
    await store.saveSession({ project_id: id, phase: "correcting", config: resolveConfig(), belief: { nodes: [], worlds: [], alpha: 0.08 }, cards: [], answers: [], precomputed: {}, consequence_override: {}, history: [], resample_count: 0, versions: { catalog: "c", prompts: "p", models: { strong: "s", fast: "f" } }, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" });
    expect((await store.getSession(id))?.phase).toBe("correcting");
    await store.appendEvent({ id: `${id}_e1`, project_id: id, ts: new Date().toISOString(), type: "card_shown", payload: { x: 1 }, tags: { catalog: "c", prompts: "p", models: { strong: "s", fast: "f" } } });
    expect((await store.listEvents(id)).length).toBe(1);
    await store.saveArtifact({ project_id: id, name: "spec.md", kind: "spec_md", content: "# hi", created_at: new Date().toISOString() });
    expect((await store.listArtifacts(id))[0]?.content).toBe("# hi");
    await store.close();
  });
});
