import { getEngine } from "@/lib/engine";
import { ok, readBody, route, str, type Params } from "@/lib/http";
import { labelImplied, retryRead } from "@/lib/state";
import type { OverrideResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

/** POST /api/projects/[id]/defaults/override {node, option} → user wins; returns the refreshed list. */
export const POST = route(async (req: Request, { params }: Params<"id">) => {
  const { id } = await params;
  const body = await readBody(req);
  const node = str(body, "node", true);
  const option = str(body, "option", true);
  const h = await getEngine();
  const r = await h.engine.overrideDefault(id, node, option);
  const [defaults, state] = await Promise.all([retryRead(() => h.engine.getDefaults(id)), retryRead(() => h.engine.getState(id))]);
  const res: OverrideResponse = { version: r.version, implied: labelImplied(state.sheet, r.implied), defaults };
  return ok(res);
});
