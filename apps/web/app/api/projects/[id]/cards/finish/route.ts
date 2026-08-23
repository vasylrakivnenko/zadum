import { getEngine } from "@/lib/engine";
import { ok, route, type Params } from "@/lib/http";

export const dynamic = "force-dynamic";

/** POST /api/projects/[id]/cards/finish → default every remaining decision; returns the review list (riskiest first). */
export const POST = route(async (_req: Request, { params }: Params<"id">) => {
  const { id } = await params;
  const h = await getEngine();
  const defaults = await h.engine.finishCards(id);
  return ok({ defaults });
});
