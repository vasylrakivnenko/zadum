import { getEngine } from "@/lib/engine";
import { ok, route, type Params } from "@/lib/http";
import type { VerificationResponse } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // one scenario is one LLM call; a round is a handful

/**
 * GET /api/projects/[id]/verification?max=n → the current round of story checks.
 *
 * Each scenario bundles several assumed decisions whose joint odds of all being right sit near 50/50, so a
 * single "that's right" carries the most information a skim can carry. The round is recomposed from the
 * current belief on every call — after any answer, ask again rather than walking a stale list.
 */
export const GET = route(async (req: Request, { params }: Params<"id">) => {
  const { id } = await params;
  const raw = Number(new URL(req.url).searchParams.get("max"));
  const maxProbes = Number.isInteger(raw) && raw > 0 ? Math.min(raw, 6) : 3;
  const h = await getEngine();
  const r = await h.engine.getVerification(id, { maxProbes });
  const res: VerificationResponse = { probes: r.probes };
  return ok(res);
});
