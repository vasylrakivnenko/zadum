import { getEngine } from "@/lib/engine";
import { ok, readBody, route, str, type Params } from "@/lib/http";
import { labelImplied, projectState } from "@/lib/state";
import type { EditResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

/** POST /api/projects/[id]/edit {text} → plain-English correction → patch ops → commit. */
export const POST = route(async (req: Request, { params }: Params<"id">) => {
  const { id } = await params;
  const text = str(await readBody(req), "text", true).trim();
  const h = await getEngine();
  const r = await h.engine.applyUserEdit(id, text);
  const state = await projectState(h, id);
  const res: EditResponse = { version: r.version, applied: r.applied.length, rejected: r.rejected.map((x) => x.error), dropped: r.dropped.length, notes: r.notes, implied: labelImplied(state.sheet, r.implied), state };
  return ok(res);
});
