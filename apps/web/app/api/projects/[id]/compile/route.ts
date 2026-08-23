import { compileProject } from "@engine/engine/compile";
import { getEngine } from "@/lib/engine";
import { ok, readBody, num, route, type Params } from "@/lib/http";
import { retryRead } from "@/lib/state";
import type { CompileResponse } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // compile may take a minute with a live model

/** POST /api/projects/[id]/compile {candidates?} → spec bundle; critic must pass before phase becomes done. */
export const POST = route(async (req: Request, { params }: Params<"id">) => {
  const { id } = await params;
  const body = await readBody(req);
  const candidates = num(body, "candidates");
  const h = await getEngine();
  const r = await compileProject(h.engine, id, { ...(candidates ? { candidates } : {}), story: true, roundTrip: true });
  const state = await retryRead(() => h.engine.getState(id));
  const res: CompileResponse = { bundle: r.bundle.map((b) => b.name), critic: r.critic, critic_rounds: r.critic_rounds, roundtrip: r.roundtrip, story: r.story, latency_ms: r.latency_ms, sheet_version: r.sheet_version, phase: state.session.phase };
  return ok(res);
});

/** GET /api/projects/[id]/compile → last compile summary from stored artifacts (if any). */
export const GET = route(async (_req: Request, { params }: Params<"id">) => {
  const { id } = await params;
  const h = await getEngine();
  const artifacts = await h.store.listArtifacts(id);
  return ok({ bundle: artifacts.map((a) => ({ name: a.name, kind: a.kind, created_at: a.created_at })) });
});
