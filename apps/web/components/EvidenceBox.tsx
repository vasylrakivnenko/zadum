"use client";
import { useState, type FormEvent } from "react";
import { Toast, type ToastData } from "@/components/Toast";
import { api, errorMessage } from "@/lib/client";
import type { ShiftLabel } from "@/lib/types";

/**
 * Evidence, next to the correction box: a real document says more about how a business works than a
 * paragraph describing it. Unlike a correction this never writes a line of the Design Sheet — it only
 * changes what we assume, so the copy promises exactly that and the result reports what MOVED.
 */
export function EvidenceBox({ id, onAbsorbed }: { id: string; onAbsorbed?: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [shifts, setShifts] = useState<ShiftLabel[] | null>(null);
  const [toast, setToast] = useState<ToastData | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setShifts(null);
    try {
      const r = await api.evidence(id, text.trim());
      setShifts(r.shifts);
      setToast(r.shifts.length ? { kind: "ok", text: `Got it. This changed what we assume about ${r.shifts.length} thing${r.shifts.length === 1 ? "" : "s"}.` } : { kind: "info", text: "Got it — nothing we were assuming moved, so your Sheet reads the same." });
      setText("");
      onAbsorbed?.();
    } catch (err) {
      setToast({ kind: "error", text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel stack">
      <div>
        <h3>Paste anything you have</h3>
        <p className="muted small">An example invoice, an email, a spreadsheet row. We read it to sharpen what we assume about your business, so the questions coming up are better ones. It does not change your Design Sheet — only the corrections above do that.</p>
      </div>
      <form onSubmit={submit} className="stack">
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={"INVOICE 1043 · Acme Bookkeeping\nBill to: Harbour Cafe · Terms: Net 30\nLate fee 1.5% per month · Pay by bank transfer"} rows={4} disabled={busy} aria-label="Paste an example document" />
        <div className="row">
          <button type="submit" className="btn" disabled={busy || !text.trim()}>
            {busy ? <span className="spinner" /> : null}
            {busy ? "Reading…" : "Use this"}
          </button>
        </div>
      </form>
      {shifts !== null && shifts.length > 0 && (
        <div>
          <div className="eyebrow" style={{ marginBottom: "var(--s-2)" }}>
            This changed what we assume about {shifts.length} thing{shifts.length === 1 ? "" : "s"}
          </div>
          <ul className="shifts">
            {shifts.map((s) => (
              <li key={s.node}>
                <span className="topic">{s.topic}</span>
                <span>{s.from === s.to ? `${s.to} — now more likely` : `${s.from} → ${s.to}`}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Toast toast={toast} />
    </section>
  );
}
