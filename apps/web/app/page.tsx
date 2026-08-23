"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { Toast, type ToastData } from "@/components/Toast";
import { api, errorMessage } from "@/lib/client";

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
          <input type="text" value={oneLiner} onChange={(e) => setOneLiner(e.target.value)} placeholder="an invoicing app for small bookkeeping firms" autoFocus disabled={busy} />
          {showExtra ? (
            <textarea value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Paste anything you have — a doc, an email, a spreadsheet export, notes…" rows={6} disabled={busy} />
          ) : (
            <button type="button" className="btn ghost" onClick={() => setShowExtra(true)} style={{ alignSelf: "flex-start" }}>
              + paste anything you have (optional)
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
