import { getEngine } from "@/lib/engine";
import { ok, route, type Params } from "@/lib/http";
import { projectState } from "@/lib/state";

export const dynamic = "force-dynamic";

/**
 * POST /api/projects/[id]/cards/continue → "keep going" after a converged soft stop: deal the next card
 * ignoring θ (the user has re-priced their own tap). The 12-card session cap and no_open still bind.
 */
export const POST = route(async (_req: Request, { params }: Params<"id">) => {
  const { id } = await params;
  const h = await getEngine();
  const deal = await h.engine.continueCards(id);
  const state = await projectState(h, id);
  return ok({ deal, state: { ...state, card: deal } });
});
