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
        <div className="spread" style={{ marginBottom: 14 }}>
          <h2>{name}</h2>
          <div className="row">
            {artifacts.map((a) => (
              <Link key={a.name} href={`/p/${id}/artifacts/${encodeURIComponent(a.name)}`} className={`btn ${a.name === name ? "primary" : ""}`}>
                {a.name}
              </Link>
            ))}
            <a className="btn ghost" href={`/api/projects/${id}/artifacts/${encodeURIComponent(name)}`} target="_blank" rel="noreferrer">
              raw ↗
            </a>
            <Link href={`/p/${id}/defaults`} className="btn ghost">
              ← back
            </Link>
          </div>
        </div>
        <pre className="artifact">{art.content}</pre>
      </main>
    </>
  );
}
