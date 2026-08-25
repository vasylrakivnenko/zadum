"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { Toast, impliedText, type ToastData } from "@/components/Toast";
import { api, errorMessage } from "@/lib/client";
import type { Phase, StoryCorrectResponse, StoryResponse } from "@/lib/types";

/**
 * The walkthrough: a "day in the life" story compiled from the spec — the user's final recognition check.
 * Each "please confirm" line can be challenged in one plain-English sentence; corrections go back into the
 * Design Sheet the same way an edit does, and the spec can then be recompiled.
 */
export default function StoryPage() {
  const { id } = useParams<{ id: string }>();
  const [oneLiner, setOneLiner] = useState<string | undefined>();
  const [phase, setPhase] = useState<Phase | undefined>();
  const [story, setStory] = useState<StoryResponse | null>(null);
  const [missing, setMissing] = useState(false);
  const [toast, setToast] = useState<ToastData | null>(null);
  const [openCheck, setOpenCheck] = useState<number | null>(null); // index into checks; -1 = the general box
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState<Set<number>>(new Set());
  const [corrected, setCorrected] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await api.state(id);
        if (cancelled) return;
        setOneLiner(s.project.one_liner);
        setPhase(s.session.phase);
      } catch (e) {
        if (!cancelled) setToast({ kind: "error", text: errorMessage(e) });
      }
      try {
        const st = await api.story(id);
        if (!cancelled) setStory(st);
      } catch {
        if (!cancelled) setMissing(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  function openBox(i: number) {
    setOpenCheck((cur) => (cur === i ? null : i));
    setText("");
  }

  async function submitCorrection() {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const r: StoryCorrectResponse = await api.storyCorrect(id, text.trim());
      const also = impliedText(r.implied);
      const head = r.applied ? `Got it — ${r.applied} change${r.applied === 1 ? "" : "s"} went into your Design Sheet.` : `Nothing changed — ${r.notes}`;
      const rej = r.rejected.length ? ` ${r.rejected.length} could not be applied: ${r.rejected.join("; ")}.` : "";
      const tail = r.applied ? " Recompile below so the spec and story pick it up." : "";
      setToast({ kind: r.applied ? "ok" : "warn", text: `${head}${rej}${also ? ` ${also}.` : ""}${tail}` });
      if (r.applied) setCorrected(true);
      setOpenCheck(null);
      setText("");
    } catch (e) {
      setToast({ kind: "error", text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  const correctionForm = (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submitCorrection();
      }}
    >
      <input type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Say what actually happens — e.g. 'the client pays before we file, not after'" autoFocus disabled={busy} />
      <button type="submit" className="btn" disabled={busy || !text.trim()}>
        {busy ? <span className="spinner" /> : null} Fix it
      </button>
    </form>
  );

  return (
    <>
      <TopBar id={id} oneLiner={oneLiner} phase={phase} current="compile" />
      <main className="page narrow">
        <div className="stack">
          {missing ? (
            <section className="panel stack">
              <h2>No walkthrough yet.</h2>
              <p className="muted">The story appears after the spec compiles.</p>
              <p>
                <Link href={`/p/${id}/defaults`} className="btn primary">
                  Go to the assumptions review →
                </Link>
              </p>
            </section>
          ) : !story ? (
            <p className="muted">
              <span className="spinner" /> Loading the walkthrough…
            </p>
          ) : (
            <>
              <section className="panel stack">
                <h2>{story.title}</h2>
                <p className="muted">A day in the life, told from your spec. Read it like a story about your own business — if any moment feels wrong, say so and it goes straight back into the Design Sheet.</p>
                <ol className="story-steps">
                  {story.steps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
                <div>
                  <button className="btn ghost" onClick={() => openBox(-1)} disabled={busy}>
                    Something in the story is wrong →
                  </button>
                  {openCheck === -1 && (
                    <ul className="checks" style={{ marginTop: 8 }}>
                      <li>{correctionForm}</li>
                    </ul>
                  )}
                </div>
              </section>
              {story.checks.length > 0 && (
                <section className="panel stack">
                  <h3>Please confirm</h3>
                  <p className="muted small">These are the moments the spec leans on most. Confirm each, or tell us what really happens.</p>
                  <ul className="checks">
                    {story.checks.map((c, i) => (
                      <li key={i} className={confirmed.has(i) ? "confirmed" : ""}>
                        <div className="spread">
                          <span>{c}</span>
                          <span className="row" style={{ flex: "none" }}>
                            <button
                              className="btn ghost"
                              disabled={busy}
                              onClick={() =>
                                setConfirmed((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(i)) next.delete(i);
                                  else next.add(i);
                                  return next;
                                })
                              }
                            >
                              {confirmed.has(i) ? "✓ confirmed" : "That's right"}
                            </button>
                            <button className="btn ghost" disabled={busy} onClick={() => openBox(i)}>
                              That&apos;s wrong →
                            </button>
                          </span>
                        </div>
                        {openCheck === i && correctionForm}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <Toast toast={toast} />
              <div className="row">
                {corrected ? (
                  <Link href={`/p/${id}/defaults`} className="btn primary">
                    Recompile the spec →
                  </Link>
                ) : (
                  <Link href={`/p/${id}/spec`} className="btn">
                    ← back to the spec
                  </Link>
                )}
                <Link href={`/p/${id}/artifacts/${encodeURIComponent("story.md")}`} className="btn ghost">
                  story.md
                </Link>
              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
}
