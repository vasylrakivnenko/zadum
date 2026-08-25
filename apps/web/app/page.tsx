"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { Toast, type ToastData } from "@/components/Toast";
import { api, errorMessage } from "@/lib/client";

/** Three real one-liners, so it is obvious what a good one looks like. */
const EXAMPLES = ["an invoicing app for small bookkeeping firms", "a booking app for a two-chair barber shop", "an internal tool for tracking repair jobs"];

export default function Home() {
  const router = useRouter();
  const [oneLiner, setOneLiner] = useState("");
  const [extra, setExtra] = useState("");
  const [showExtra, setShowExtra] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastData | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!oneLiner.trim() || busy) return;
    setBusy(true);
    setToast({ kind: "info", text: "Drafting your Design Sheet…" });
    try {
      const r = await api.createProject(oneLiner.trim(), extra.trim() || undefined);
      router.push(`/p/${r.project.id}`);
    } catch (err) {
      setToast({ kind: "error", text: errorMessage(err) });
      setBusy(false);
    }
  }

  return (
    <>
      <TopBar />
      <main className="page narrow">
        <div className="hero">
          <h1>Describe the app you want in one line.</h1>
          <p>We draft a one-page Design Sheet, you correct it in plain English, a few decision cards settle what matters, and a coding-agent-ready spec compiles.</p>
        </div>
        <form onSubmit={submit} className="stack">
          <input type="text" value={oneLiner} onChange={(e) => setOneLiner(e.target.value)} placeholder={EXAMPLES[0]} autoFocus disabled={busy} aria-label="Describe the app you want in one line" />
          <div className="examples">
            <span className="lead">For example:</span>
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" className="example" disabled={busy} onClick={() => setOneLiner(ex)}>
                {ex}
              </button>
            ))}
          </div>
          {showExtra ? (
            <textarea value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Paste anything you have — an example invoice, a spreadsheet, an email, notes… It helps the first draft get your business right." rows={6} disabled={busy} autoFocus aria-label="Anything you already have" />
          ) : (
            <button type="button" className="btn ghost" onClick={() => setShowExtra(true)} style={{ alignSelf: "flex-start" }}>
              + Paste anything you have (an example invoice, a spreadsheet, an email — optional)
            </button>
          )}
          <div className="row">
            <button type="submit" className="btn primary" disabled={busy || !oneLiner.trim()}>
              {busy ? <span className="spinner" /> : null}
              {busy ? "Drafting…" : "Start"}
            </button>
            <span className="muted small">About 10 seconds. You will review before anything is decided.</span>
          </div>
          <Toast toast={toast} />
        </form>
      </main>
    </>
  );
}
