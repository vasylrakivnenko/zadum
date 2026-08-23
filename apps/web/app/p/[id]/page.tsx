"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { SheetView, diffSheetIds } from "@/components/SheetView";
import { Toast, impliedText, type ToastData } from "@/components/Toast";
import { api, errorMessage } from "@/lib/client";
import type { ProjectState } from "@/lib/types";

/** The correction moment: "Here's what I understood — correct me." */
export default function SheetPage() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<ProjectState | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastData | null>(null);

  const load = useCallback(async () => {
    try {
      setState(await api.state(id));
    } catch (e) {
      setToast({ kind: "error", text: errorMessage(e) });
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  async function submitEdit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy || !state) return;
    setBusy(true);
    try {
      const r = await api.edit(id, text.trim());
      setFresh(diffSheetIds(state.sheet, r.state.sheet));
      setState(r.state);
      const also = impliedText(r.implied);
      const head = r.applied ? `Applied ${r.applied} change${r.applied === 1 ? "" : "s"}` : `Nothing changed — ${r.notes}`;
      const rej = r.rejected.length ? ` · ${r.rejected.length} could not be applied: ${r.rejected.join("; ")}` : "";
      setToast({ kind: r.applied ? "ok" : "warn", text: `${head}${rej}${also ? ` · ${also.charAt(0).toLowerCase()}${also.slice(1)}` : ""}` });
      setText("");
    } catch (err) {
      setToast({ kind: "error", text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  const cardsStarted = state && state.session.phase !== "correcting" && state.session.phase !== "drafting";

  return (
    <>
      <TopBar id={id} oneLiner={state?.project.one_liner} phase={state?.session.phase} current="sheet" />
      <main className="page">
        {!state ? (
          <p className="muted">Loading…</p>
        ) : (
          <div className="split">
            <div className="stack">
              <section className="panel stack">
                <h2>Here&apos;s what I understood — correct me.</h2>
                <p className="muted">Read the Sheet like a list about your own business. Anything wrong or missing? Say it in plain English; the Sheet updates, nothing is decided behind your back.</p>
                {state.assumptions.length > 0 && (
                  <div>
                    <div className="small muted" style={{ marginBottom: 6 }}>
                      I assumed:
                    </div>
                    <div className="assumptions">
                      {state.assumptions.map((a, i) => (
                        <span key={i}>{a}</span>
                      ))}
                    </div>
                  </div>
                )}
                <form onSubmit={submitEdit} className="stack">
                  <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Clients log into a portal to see and pay their invoices. We never send invoices on behalf of clients." rows={3} disabled={busy} />
                  <div className="row">
                    <button type="submit" className="btn" disabled={busy || !text.trim()}>
                      {busy ? <span className="spinner" /> : null}
                      {busy ? "Applying…" : "Apply correction"}
                    </button>
                    <Link href={`/p/${id}/cards`} className="btn primary">
                      {cardsStarted ? "Continue decision cards →" : "Looks right — start cards →"}
                    </Link>
                  </div>
                </form>
                <Toast toast={toast} />
              </section>
            </div>
            <SheetView sheet={state.sheet} decided={state.decided} fresh={fresh} />
          </div>
        )}
      </main>
    </>
  );
}
