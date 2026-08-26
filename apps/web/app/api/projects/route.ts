import { getEngine } from "@/lib/engine";
import { ok, readBody, requestAuth, route, str } from "@/lib/http";
import { projectState } from "@/lib/state";
import type { CreateResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

/** POST /api/projects {one_liner, extra_context?} → draft a Design Sheet. */
export const POST = route(async (req: Request) => {
  const body = await readBody(req);
  const one_liner = str(body, "one_liner", true).trim();
  const extra_context = str(body, "extra_context")?.trim();
  const h = await getEngine();
  const { ownerId } = requestAuth(req);
  const r = await h.engine.createProject(one_liner, { owner_id: ownerId, origin: h.mock ? "mock" : "user", ...(extra_context ? { extra_context } : {}) });
  const state = await projectState(h, r.project.id);
  const res: CreateResponse = { project: state.project, sheet: r.sheet, assumptions: r.draft.assumptions.map((a) => a.text) };
  return ok(res, 201);
});

/** GET /api/projects → this browser's projects, most recently updated first (the store's own order). */
export const GET = route(async (req: Request) => {
  const h = await getEngine();
  return ok({ projects: await h.store.listProjects(requestAuth(req).ownerId) });
});
