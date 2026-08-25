import { getEngine } from "@/lib/engine";
import { HttpError, route, type Params } from "@/lib/http";
import { retryRead } from "@/lib/state";

export const dynamic = "force-dynamic";

/** The one-liner as a filename-safe stem: "an invoicing app for firms" → "an-invoicing-app-for-firms". */
function slugify(text: string): string {
  const s = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return s || "design-sheet";
}

/**
 * GET /api/projects/[id]/spec/download?name=spec.md → the artifact as a file the browser saves.
 *
 * Same bytes as /artifacts/[name], but with a content-disposition naming the file after the project, so the
 * spec lands in the user's Downloads folder recognisably instead of as a tab full of markdown. `name` is
 * validated against the stored artifact list — this route never reads anything else.
 */
export const GET = route(async (req: Request, { params }: Params<"id">) => {
  const { id } = await params;
  const name = new URL(req.url).searchParams.get("name") || "spec.md";
  const h = await getEngine();
  const artifacts = await h.store.listArtifacts(id);
  const art = artifacts.find((a) => a.name === name);
  if (!art) throw new HttpError(404, `artifact not found: ${name}`);
  const project = await retryRead(() => h.store.getProject(id));
  const filename = `${slugify(project?.one_liner ?? "")}-${name}`;
  const type = name.endsWith(".json") ? "application/json" : name.endsWith(".ts") ? "text/plain" : "text/markdown";
  return new Response(art.content, {
    status: 200,
    headers: {
      "content-type": `${type}; charset=utf-8`,
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
});
