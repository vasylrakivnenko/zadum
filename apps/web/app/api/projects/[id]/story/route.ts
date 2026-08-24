import { getEngine } from "@/lib/engine";
import { HttpError, ok, route, type Params } from "@/lib/http";
import { parseStory } from "@/lib/story";
import type { StoryResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/projects/[id]/story → the compiled "day in the life" walkthrough, parsed from the story.md
 * artifact (its format is deterministic: `# title`, numbered steps, `## Please confirm`, `- checks`).
 */
export const GET = route(async (_req: Request, { params }: Params<"id">) => {
  const { id } = await params;
  const h = await getEngine();
  const artifacts = await h.store.listArtifacts(id);
  const art = artifacts.find((a) => a.name === "story.md");
  if (!art) throw new HttpError(404, "story not found — compile the spec first");
  return ok<StoryResponse>({ ...parseStory(art.content), compiled_at: art.created_at });
});
