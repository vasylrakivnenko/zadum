import { getEngine } from "@/lib/engine";
import { ok, route, type Params } from "@/lib/http";
import { projectState } from "@/lib/state";

export const dynamic = "force-dynamic";

/** GET /api/projects/[id] → project, Sheet, session summary, current card (if any), decided list. */
export const GET = route(async (_req: Request, { params }: Params<"id">) => {
  const { id } = await params;
  const h = await getEngine();
  return ok(await projectState(h, id));
});
