/** Shared provenance gate for every learning estimator. Safe default: real user sessions only. */
import type { ProjectRecord } from "../core/session.js";
import type { Store } from "../store/store.js";

export type ProjectOrigin = NonNullable<ProjectRecord["origin"]>;
export const DEFAULT_LEARNING_ORIGINS: readonly ProjectOrigin[] = ["user"];

/**
 * A project written before origins existed carries no `origin` at all on the file store, while Postgres
 * backfilled the same rows to "legacy" (migration 0002). Reading a missing origin as "legacy" keeps the two
 * stores answering the same question, and keeps `--include-origin legacy` able to reach the data it exists
 * to recover.
 */
export function originOf(p: Pick<ProjectRecord, "origin">): ProjectOrigin {
  return p.origin ?? "legacy";
}

export async function learningProjectIds(
  store: Store,
  origins: readonly ProjectOrigin[] = DEFAULT_LEARNING_ORIGINS,
): Promise<string[]> {
  const allowed = new Set(origins);
  return (await store.listProjects())
    .filter((p) => allowed.has(originOf(p)))
    .map((p) => p.id)
    .sort();
}

/**
 * `--include-origin` *adds* to the default user-only population, as its name and docs/LEARNING.md promise.
 * Replacing it would let `--include-origin experiment` silently fit priors on harness runs alone — a
 * wrong-population estimate that looks exactly like a successful run.
 */
export function parseLearningOrigins(value: string): ProjectOrigin[] {
  const valid: ProjectOrigin[] = ["user", "mock", "experiment", "legacy"];
  const requested = value.split(",").map((s) => s.trim()).filter(Boolean);
  if (!requested.length) throw new Error("--include-origin needs at least one origin");
  const bad = requested.filter((x) => !valid.includes(x as ProjectOrigin));
  if (bad.length) throw new Error(`unknown learning origin(s): ${bad.join(", ")} (expected ${valid.join("|")})`);
  return [...new Set([...DEFAULT_LEARNING_ORIGINS, ...(requested as ProjectOrigin[])])];
}
