/** The one ownership rule, shared by the API wrapper and the server-rendered pages. */
import type { ProjectRecord } from "@engine/core/session";
import { getEngine } from "./engine";
import { retryRead } from "./state";

/**
 * The project — but only for the browser that created it.
 *
 * A non-owner and a non-existent id give the same answer on purpose: neither may reveal that the other
 * exists. Projects created before ownership metadata have no owner id and are therefore never exposed.
 * Read through retryRead because background precompute writes session/project files outside the request path.
 */
export async function ownedProject(id: string, ownerId: string | null): Promise<ProjectRecord | null> {
  if (!ownerId) return null;
  const h = await getEngine();
  const project = await retryRead(() => h.store.getProject(id));
  return project && project.owner_id === ownerId ? project : null;
}
