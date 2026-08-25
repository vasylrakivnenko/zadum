import { getEngine } from "@/lib/engine";
import { ok, route, type Params } from "@/lib/http";
import { retryRead } from "@/lib/state";
import type { SpecResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

/** compile-report.json, read for only the three fields the workspace frames the spec with. */
function readReport(content: string | undefined): { sheet_version: number | null; critic: { verdict: string; score: number } | null; stale: boolean } {
  const empty = { sheet_version: null, critic: null, stale: false };
  if (!content) return empty;
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return empty; // a half-written or older report must never take the page down
  }
  if (typeof parsed !== "object" || parsed === null) return empty;
  const r = parsed as Record<string, unknown>;
  const c = typeof r["critic"] === "object" && r["critic"] !== null ? (r["critic"] as Record<string, unknown>) : null;
  return {
    sheet_version: typeof r["sheet_version"] === "number" ? r["sheet_version"] : null,
    critic: c && typeof c["verdict"] === "string" ? { verdict: c["verdict"], score: typeof c["score"] === "number" ? c["score"] : 0 } : null,
    stale: r["stale"] === true,
  };
}

/**
 * GET /api/projects/[id]/spec → the compiled spec.md plus the frame the workspace reads it in: which
 * artifacts exist, which Sheet version it was compiled from, whether the Sheet has moved past it, and what
 * the critic said. Nothing compiled yet is an ordinary state (`has_spec:false`), never an error.
 */
export const GET = route(async (_req: Request, { params }: Params<"id">) => {
  const { id } = await params;
  const h = await getEngine();
  const [artifacts, state] = await Promise.all([h.store.listArtifacts(id), retryRead(() => h.engine.getState(id))]);
  const spec = artifacts.find((a) => a.name === "spec.md");
  const report = readReport(artifacts.find((a) => a.name === "compile-report.json")?.content);
  // the report is authoritative; the artifact's own meta.sheet_version is the fallback for older bundles
  const metaVersion = typeof spec?.meta?.["sheet_version"] === "number" ? (spec.meta["sheet_version"] as number) : null;
  const compiled = report.sheet_version ?? metaVersion;
  const sheetVersion = state.sheet.version;
  const res: SpecResponse = {
    markdown: spec?.content ?? "",
    artifacts: artifacts.map((a) => a.name),
    sheet_version: sheetVersion,
    compiled_version: compiled,
    stale: compiled !== null && (sheetVersion > compiled || report.stale),
    critic: report.critic,
    has_spec: !!spec,
  };
  return ok(res);
});
