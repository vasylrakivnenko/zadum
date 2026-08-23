import { getEngine } from "@/lib/engine";
import { ok, route, type Params } from "@/lib/http";
import { projectState } from "@/lib/state";

export const dynamic = "force-dynamic";

/** POST /api/projects/[id]/cards/start → first (or pending) card, or a stop result. */
export const POST = route(async (_req: Request, { params }: Params<"id">) => {
  const { id } = await params;
  const h = await getEngine();
  const deal = await h.engine.startCards(id);
  const state = await projectState(h, id);
  return ok({ deal, state: { ...state, card: deal } });
});
