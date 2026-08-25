import { compileProject } from "@engine/engine/compile";
import { getEngine } from "@/lib/engine";
import { HttpError, bool, ok, readBody, route, str, type Params } from "@/lib/http";
import type { SpecComment, SpecRefineResponse } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // the refine is one LLM call; the recompile behind it can take a minute

/** `comments: [{quote?, text}]` — hand-parsed because `obj()` rejects arrays. */
function readComments(body: Record<string, unknown>): SpecComment[] {
  const raw = body["comments"];
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new HttpError(400, "comments must be an array");
  return raw.map((c, i) => {
    if (typeof c !== "object" || c === null || Array.isArray(c)) throw new HttpError(400, `comments[${i}] must be an object`);
    const rec = c as Record<string, unknown>;
    const text = rec["text"];
    if (typeof text !== "string" || !text.trim()) throw new HttpError(400, `comments[${i}].text is required`);
    const quote = rec["quote"];
    if (quote !== undefined && quote !== null && typeof quote !== "string") throw new HttpError(400, `comments[${i}].quote must be a string`);
    return { text: text.trim(), ...(typeof quote === "string" && quote.trim() ? { quote: quote.trim() } : {}) };
  });
}

/**
 * POST /api/projects/[id]/spec/refine {edited?, comments?, recompile?} → what the system understood, what it
 * changed, and (unless the caller opted out) the freshly compiled spec.
 *
 * Refinement can reopen decisions: feedback that contradicts an earlier answer puts the question back on the
 * table, and the ledger gate then refuses to compile. That is a real, expected path — the refinement itself
 * is already committed, so the response reports `blocked` with `recompiled:null` instead of failing, and the
 * UI sends the user to the cards to answer what was reopened.
 */
export const POST = route(async (req: Request, { params }: Params<"id">) => {
  const { id } = await params;
  const body = await readBody(req);
  const edited = str(body, "edited");
  const comments = readComments(body);
  const recompile = bool(body, "recompile") ?? true;
  if (!edited && comments.length === 0) throw new HttpError(400, "an edited spec or at least one comment is required");

  const h = await getEngine();
  const r = await h.engine.refineFromSpecFeedback(id, { ...(edited ? { edited } : {}), ...(comments.length ? { comments } : {}) });

  let recompiled: SpecRefineResponse["recompiled"] = null;
  let blocked: string | undefined;
  if (recompile) {
    try {
      const c = await compileProject(h.engine, id, { story: true, roundTrip: true });
      recompiled = { markdown: c.spec, critic: { verdict: c.critic.verdict, score: c.critic.score }, stale: c.stale };
    } catch (e) {
      if (!(e instanceof Error) || !e.message.startsWith("cannot compile:")) throw e;
      blocked = e.message;
    }
  }

  const res: SpecRefineResponse = {
    extraction: r.extraction,
    version: r.version,
    reopened: r.reopened,
    added_decisions: r.added_decisions,
    notes: r.notes,
    rejected: r.rejected.map((x) => ({ error: x.error })), // the PatchOp behind a rejection is engine-internal
    recompiled,
    ...(blocked ? { blocked } : {}),
  };
  return ok(res);
});
