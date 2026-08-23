import { getEngine } from "@/lib/engine";
import { ok, route, type Params } from "@/lib/http";

export const dynamic = "force-dynamic";

/** POST /api/projects/[id]/defaults/accept → phase → compiling. */
export const POST = route(async (_req: Request, { params }: Params<"id">) => {
  const { id } = await params;
  const h = await getEngine();
  await h.engine.acceptDefaults(id);
  return ok({ ok: true, phase: "compiling" });
});
