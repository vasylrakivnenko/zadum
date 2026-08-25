import { getEngine } from "@/lib/engine";
import { ok, readBody, route, str, type Params } from "@/lib/http";
import { labelShifts, projectState } from "@/lib/state";
import type { EvidenceResponse } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/projects/[id]/evidence {text} → reweight what we think is likely from a pasted artifact.
 *
 * Belief only: unlike /edit this never writes a line of the Sheet (Rule 1), so the response reports what
 * MOVED rather than what changed — each shift labelled through the Sheet's decisions so it reads as
 * "topic: old answer → new answer".
 */
export const POST = route(async (req: Request, { params }: Params<"id">) => {
  const { id } = await params;
  const text = str(await readBody(req), "text", true).trim();
  const h = await getEngine();
  const r = await h.engine.absorbEvidence(id, text);
  const state = await projectState(h, id);
  const res: EvidenceResponse = { shifts: labelShifts(state.sheet, r.shifts), ess_before: r.ess_before, ess_after: r.ess_after, state };
  return ok(res);
});
