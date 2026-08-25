import Link from "next/link";
import { notFound } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { getEngine } from "@/lib/engine";
import { retryRead } from "@/lib/state";

export const dynamic = "force-dynamic";

/** Renders one compiled artifact (spec.md, design-sheet.md, AGENTS.md, story.md, …) as preformatted text. */
export default async function ArtifactPage({ params }: { params: Promise<{ id: string; name: string }> }) {
  const { id, name: rawName } = await params;
  const name = decodeURIComponent(rawName);
  const h = await getEngine();
  const [artifacts, project] = await Promise.all([h.store.listArtifacts(id), retryRead(() => h.store.getProject(id))]);
  const art = artifacts.find((a) => a.name === name);
  if (!art || !project) notFound();
  return (
    <>
      <TopBar id={id} oneLiner={project.one_liner} phase={project.phase} current="compile" />
      <main className="page">
        <div className="artifact-head">
          <div className="spread">
            <div>
              <h2>{name}</h2>
              <p className="small muted">The raw file, exactly as it will be handed to a coding agent.</p>
            </div>
            <div className="row">
              <Link href={`/p/${id}/defaults`} className="btn ghost">
                ← Assumptions
              </Link>
              <a className="btn ghost" href={`/api/projects/${id}/artifacts/${encodeURIComponent(name)}`} target="_blank" rel="noreferrer">
                Download ↗
              </a>
              {name === "spec.md" && (
                <Link href={`/p/${id}/defaults#tighten`} className="btn">
                  Tighten the spec →
                </Link>
              )}
              <Link href={`/p/${id}/spec`} className="btn primary">
                Back to the spec →
              </Link>
            </div>
          </div>
          <div className="filerow">
            {artifacts.map((a) => (
              <Link key={a.name} href={`/p/${id}/artifacts/${encodeURIComponent(a.name)}`} className={`btn ${a.name === name ? "primary" : ""}`} aria-current={a.name === name ? "page" : undefined}>
                {a.name}
              </Link>
            ))}
          </div>
        </div>
        <pre className="artifact">{art.content}</pre>
      </main>
    </>
  );
}
