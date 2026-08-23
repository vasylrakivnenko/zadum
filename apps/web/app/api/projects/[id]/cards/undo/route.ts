import { getEngine } from "@/lib/engine";
import { ok, route, type Params } from "@/lib/http";
import { projectState } from "@/lib/state";
import type { UndoResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

/** POST /api/projects/[id]/cards/undo → reverts the last answer; the undone card is pending again. */
export const POST = route(async (_req: Request, { params }: Params<"id">) => {
  const { id } = await params;
  const h = await getEngine();
  const restored = await h.engine.undoLast(id);
  const state = await projectState(h, id);
  const res: UndoResponse = { restored, state };
  return ok(res);
});
