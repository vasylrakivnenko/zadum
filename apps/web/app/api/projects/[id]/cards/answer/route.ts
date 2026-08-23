import type { AnswerKind } from "@engine/core/session";
import { getEngine } from "@/lib/engine";
import { HttpError, num, ok, readBody, route, str, type Params } from "@/lib/http";
import { labelImplied, projectState } from "@/lib/state";
import type { AnswerResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

const KINDS: readonly AnswerKind[] = ["option", "you_decide", "other", "skip"];

/** POST /api/projects/[id]/cards/answer {kind, option_id?, text?, think_ms?} → implications + next card. */
export const POST = route(async (req: Request, { params }: Params<"id">) => {
  const { id } = await params;
  const body = await readBody(req);
  const kind = str(body, "kind", true);
  if (!KINDS.includes(kind as AnswerKind)) throw new HttpError(400, `invalid kind: ${kind}`);
  const option_id = str(body, "option_id");
  if (kind === "option" && !option_id) throw new HttpError(400, "option_id is required for kind=option");
  const text = str(body, "text");
  const think_ms = num(body, "think_ms");
  const h = await getEngine();
  const r = await h.engine.answerCard(id, { kind: kind as AnswerKind, ...(option_id ? { option_id } : {}), ...(text ? { text } : {}), ...(think_ms !== undefined ? { think_ms } : {}) });
  const state = await projectState(h, id);
  const res: AnswerResponse = { implied: labelImplied(state.sheet, r.implied), sheet_version: r.sheet_version, next: r.next, state: { ...state, card: r.next } };
  return ok(res);
});
