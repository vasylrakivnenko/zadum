import { getEngine } from "@/lib/engine";
import { HttpError, num, ok, readBody, route, type Params } from "@/lib/http";
import type { GapsResponse } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET /api/projects/[id]/gaps?max=n → every place the compiled spec confessed a guess, clustered into
 * candidate questions, ranked. Read-only: nothing is added to the Sheet until the POST below.
 */
export const GET = route(async (req: Request, { params }: Params<"id">) => {
  const { id } = await params;
  const raw = Number(new URL(req.url).searchParams.get("max"));
  const max = Number.isInteger(raw) && raw > 0 ? Math.min(raw, 12) : 8;
  const h = await getEngine();
  const res: GapsResponse = await h.engine.mineSpecGaps(id, { max });
  return ok(res);
});

/**
 * POST /api/projects/[id]/gaps {apply, max?} → add the TOP `apply` candidates as open decisions and reopen
 * the card loop. Note the engine takes a prefix (`candidates.slice(0, apply)`), not a set of ids: the caller
 * chooses how far down the ranked list to go, and the UI says so in as many words.
 */
export const POST = route(async (req: Request, { params }: Params<"id">) => {
  const { id } = await params;
  const body = await readBody(req);
  const apply = num(body, "apply");
  if (apply === undefined || !Number.isInteger(apply) || apply < 1) throw new HttpError(400, "apply must be a whole number of candidates, 1 or more");
  const max = num(body, "max");
  const h = await getEngine();
  const res: GapsResponse = await h.engine.mineSpecGaps(id, { apply, max: max && max > 0 ? Math.min(max, 12) : 8 });
  return ok(res);
});
