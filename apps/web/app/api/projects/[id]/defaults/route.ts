import { getEngine } from "@/lib/engine";
import { ok, route, type Params } from "@/lib/http";
import { retryRead } from "@/lib/state";

export const dynamic = "force-dynamic";

/** GET /api/projects/[id]/defaults → current assumed decisions, riskiest first. */
export const GET = route(async (_req: Request, { params }: Params<"id">) => {
  const { id } = await params;
  const h = await getEngine();
  const [defaults, state] = await Promise.all([retryRead(() => h.engine.getDefaults(id)), retryRead(() => h.engine.getState(id))]);
  return ok({ defaults, phase: state.session.phase });
});
