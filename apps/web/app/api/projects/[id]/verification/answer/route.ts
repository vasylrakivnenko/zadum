import { getEngine } from "@/lib/engine";
import { bool, HttpError, obj, ok, readBody, route, str, type Params } from "@/lib/http";
import { labelImplied, labelNodes, retryRead } from "@/lib/state";
import type { VerificationAnswerResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/projects/[id]/verification/answer {probe_id, ok, correction?: {node_id, option_id}}
 *
 * "That's right" mildly confirms every assumption the scenario bundled; pointing at the wrong part resolves
 * that one decision to the option the user picked (a full commit, with implications propagated). The refreshed
 * defaults list rides along so the review table below the panel stays in step.
 */
export const POST = route(async (req: Request, { params }: Params<"id">) => {
  const { id } = await params;
  const body = await readBody(req);
  const probe_id = str(body, "probe_id", true);
  const verdict = bool(body, "ok", true);
  const rawCorrection = obj(body, "correction");
  const correction = rawCorrection ? { node_id: str(rawCorrection, "node_id", true), option_id: str(rawCorrection, "option_id", true) } : undefined;
  if (verdict && correction) throw new HttpError(400, "a correction is only meaningful when ok is false");

  const h = await getEngine();
  const r = await h.engine.answerVerification(id, { probe_id, ok: verdict, ...(correction ? { correction } : {}) });
  const [defaults, state] = await Promise.all([retryRead(() => h.engine.getDefaults(id)), retryRead(() => h.engine.getState(id))]);
  const res: VerificationAnswerResponse = { implied: labelImplied(state.sheet, r.implied), confirmed: labelNodes(state.sheet, r.confirmed), sheet_version: r.sheet_version, defaults };
  return ok(res);
});
