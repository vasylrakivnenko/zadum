import { getEngine } from "@/lib/engine";
import { HttpError, route, type Params } from "@/lib/http";

export const dynamic = "force-dynamic";

/** GET /api/projects/[id]/artifacts/[name] → artifact content as text. */
export const GET = route(async (_req: Request, { params }: Params<"id" | "name">) => {
  const { id, name } = await params;
  const h = await getEngine();
  const artifacts = await h.store.listArtifacts(id);
  const art = artifacts.find((a) => a.name === name);
  if (!art) throw new HttpError(404, `artifact not found: ${name}`);
  const type = name.endsWith(".json") ? "application/json" : "text/markdown";
  return new Response(art.content, { status: 200, headers: { "content-type": `${type}; charset=utf-8` } });
});
