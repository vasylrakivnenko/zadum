"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { SheetView, diffSheetIds } from "@/components/SheetView";
import { Toast, impliedText, type ToastData } from "@/components/Toast";
import { api, errorMessage, pct } from "@/lib/client";
import type { CurvePoint, DealResult, ProjectState } from "@/lib/types";

type Busy = null | "start" | "answer" | "undo" | "continue";
/** Rule 7: never more than 12 cards per session — the remaining estimate is capped accordingly. */
const MAX_CARDS = 12;

/** The split screen: card on the left, the Sheet growing on the right. */
export default function CardsPage() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<ProjectState | null>(null);
  const [deal, setDeal] = useState<DealResult | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<ToastData | null>(null);
  const [busy, setBusy] = useState<Busy>("start");
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherText, setOtherText] = useState("");
  const shownAt = useRef<number>(Date.now());

  const showDeal = useCallback((d: DealResult | null) => {
    setDeal(d);
    setOtherOpen(false);
    setOtherText("");
    shownAt.current = Date.now();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await api.startCards(id);
        if (cancelled) return;
        setState(r.state);
        showDeal(r.deal);
      } catch (e) {
        if (!cancelled) setToast({ kind: "error", text: errorMessage(e) });
      } finally {
        if (!cancelled) setBusy(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, showDeal]);

  async function answer(body: { kind: "option" | "you_decide" | "skip" | "other"; option_id?: string; text?: string }) {
    if (busy || !state) return;
    setBusy("answer");
    try {
      const r = await api.answer(id, { ...body, think_ms: Date.now() - shownAt.current });
      const ids = diffSheetIds(state.sheet, r.state.sheet);
      for (const h of r.implied.hard) ids.add(h.node);
      for (const s of r.implied.soft) ids.add(s.node);
      setFresh(ids);
      setState(r.state);
      showDeal(r.next);
      const also = impliedText(r.implied);
      setToast(also ? { kind: "ok", text: also } : body.kind === "skip" ? { kind: "info", text: "Skipped — it will be defaulted and shown in the review." } : body.kind === "you_decide" ? { kind: "info", text: "Left to us — the most likely option is used and it will not be asked again." } : { kind: "info", text: "Settled." });
    } catch (e) {
      setToast({ kind: "error", text: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  }

  async function undo() {
    if (busy) return;
    setBusy("undo");
    try {
      const r = await api.undo(id);
      setState(r.state);
      setFresh(new Set());
      if (r.restored) {
        showDeal(r.restored);
        setToast({ kind: "info", text: "Undone — the previous card is back." });
      } else setToast({ kind: "warn", text: "Nothing to undo." });
    } catch (e) {
      setToast({ kind: "error", text: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  }

  /** "Keep going" after a converged soft stop: deal the next card anyway (still capped at 12). */
  async function keepGoing() {
    if (busy) return;
    setBusy("continue");
    try {
      const r = await api.continueCards(id);
      setState(r.state);
      showDeal(r.deal);
      if (r.deal.kind === "stop") setToast({ kind: "info", text: "There really is nothing more worth asking — everything else is safely assumed." });
    } catch (e) {
      setToast({ kind: "error", text: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  }

  const canUndo = (state?.session.answers ?? 0) > 0;
  const phase = state?.session.phase;

  return (
    <>
      <TopBar id={id} oneLiner={state?.project.one_liner} phase={phase} current="cards" />
      <main className="page">
        <div className="split">
          <section className="panel card">
            {!state || (!deal && busy === "start") ? (
              <p className="muted">
                <span className="spinner" /> Preparing the first card…
              </p>
            ) : phase === "defaults_review" || phase === "compiling" || phase === "done" ? (
              <div className="stop">
                <h2>Decision cards are finished.</h2>
                <p className="muted">{state.session.cards} cards answered · {pct(state.session.settledness)} of the design settled.</p>
                <p style={{ marginTop: 16 }}>
                  <Link href={`/p/${id}/defaults`} className="btn primary">
                    Review defaults →
                  </Link>
                </p>
              </div>
            ) : deal?.kind === "card" ? (
              <>
                <div className="small muted">Decision card {state.session.cards}</div>
                <p className="context">{deal.card.context}</p>
                <div className="options">
                  {deal.card.options.map((o, i) => (
                    <button key={o.option_id} className="btn big" disabled={busy !== null} onClick={() => answer({ kind: "option", option_id: o.option_id })}>
                      {busy === "answer" ? <span className="spinner" /> : <span className="muted">{i + 1}</span>}
                      <span>{o.scenario}</span>
                    </button>
                  ))}
                </div>
                <div className="secondary">
                  <button className="btn ghost" disabled={busy !== null} onClick={() => answer({ kind: "you_decide" })}>
                    You decide
                  </button>
                  <button className="btn ghost" disabled={busy !== null} onClick={() => answer({ kind: "skip" })}>
                    Skip
                  </button>
                  <button className="btn ghost" disabled={busy !== null} onClick={() => setOtherOpen((v) => !v)}>
                    Something else…
                  </button>
                  <button className="btn ghost" disabled={busy !== null || !canUndo} onClick={undo}>
                    {busy === "undo" ? <span className="spinner" /> : null} Undo
                  </button>
                </div>
                {otherOpen && (
                  <form
                    className="stack"
                    style={{ marginTop: 10 }}
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (otherText.trim()) void answer({ kind: "other", text: otherText.trim() });
                    }}
                  >
                    <textarea value={otherText} onChange={(e) => setOtherText(e.target.value)} placeholder="Say it in your own words — e.g. 'only the owner can, and only after month end'" rows={2} autoFocus disabled={busy !== null} />
                    <div className="row">
                      <button type="submit" className="btn" disabled={busy !== null || !otherText.trim()}>
                        Use this
                      </button>
                    </div>
                  </form>
                )}
                {deal.card.also_sets.length > 0 && <div className="also">Answering also settles: {deal.card.also_sets.join(" · ")}</div>}
                <SettleMeter settledness={deal.settledness} note={`about ${Math.min(deal.remaining_estimate, Math.max(0, MAX_CARDS - state.session.cards))} more worth asking`} />
                <GainBars curve={state.curve} />
              </>
            ) : deal?.kind === "stop" && deal.reason === "converged" ? (
              <div className="stop">
                <h2>Good stopping point.</h2>
                <p className="muted">The next question would settle very little — everything that matters is settled or safely assumed.</p>
                <SettleMeter settledness={deal.settledness} note={`${state.session.cards} cards answered`} center />
                <GainBars curve={state.curve} />
                <div className="row" style={{ justifyContent: "center", marginTop: 16 }}>
                  <Link href={`/p/${id}/defaults`} className="btn primary">
                    Stop here (recommended) →
                  </Link>
                  <button className="btn" disabled={busy !== null} onClick={keepGoing}>
                    {busy === "continue" ? <span className="spinner" /> : null} Keep going
                  </button>
                  <button className="btn ghost" disabled={busy !== null || !canUndo} onClick={undo}>
                    Undo last answer
                  </button>
                </div>
              </div>
            ) : deal?.kind === "stop" ? (
              <div className="stop">
                <h2>No more cards</h2>
                <p className="muted">
                  {stopReason(deal.reason)} · {state.session.cards} cards
                </p>
                <SettleMeter settledness={deal.settledness} note={deal.reason === "max_cards" ? "everything left will be assumed and shown for review" : `${state.session.answers} answers`} center />
                <GainBars curve={state.curve} />
                <div className="row" style={{ justifyContent: "center", marginTop: 16 }}>
                  <Link href={`/p/${id}/defaults`} className="btn primary">
                    Review what was assumed →
                  </Link>
                  <button className="btn ghost" disabled={busy !== null || !canUndo} onClick={undo}>
                    Undo last answer
                  </button>
                </div>
              </div>
            ) : (
              <p className="muted">No card.</p>
            )}
            <div style={{ marginTop: 14 }}>
              <Toast toast={toast} />
            </div>
          </section>
          {state && <SheetView sheet={state.sheet} decided={state.decided} fresh={fresh} />}
        </div>
      </main>
    </>
  );
}

/** The big, non-technical progress statement: "Your design is 87% settled." */
function SettleMeter({ settledness, note, center }: { settledness: number; note?: string; center?: boolean }) {
  return (
    <div className={`settle${center ? " center" : ""}`}>
      <div className="settle-line">
        Your design is <strong>{pct(settledness)}</strong> settled{note ? <span className="muted"> · {note}</span> : null}
      </div>
      <div className="meter big">
        <div style={{ width: pct(settledness) }} />
      </div>
    </div>
  );
}

/**
 * Per-card marginal bars: how much each answered card stood to settle, as coarse steps (the belief behind
 * the numbers is 12 sampled worlds — bars, deliberately not a smooth line).
 */
function GainBars({ curve }: { curve: CurvePoint[] }) {
  const answered = curve.filter((p) => p.answered);
  if (answered.length === 0) return null;
  const max = Math.max(...answered.map((p) => p.share), 0.0001);
  return (
    <div className="gainbars">
      <div className="small muted">What each card settled</div>
      {answered.map((p) => {
        const level = Math.max(1, Math.ceil((p.share / max) * 5)); // 5 coarse steps
        return (
          <div key={p.card_id} className="gainrow" title={`card ${p.card_index}: ${p.topic}`}>
            <span className="gainlabel">{p.topic}</span>
            <span className="gaintrack">
              <span className="gainbar" style={{ width: `${level * 20}%` }} />
            </span>
          </div>
        );
      })}
      <div className="small muted faint">Rough shares — each bar is how much of the remaining open ground that card covered.</div>
    </div>
  );
}

function stopReason(reason: string): string {
  if (reason === "converged") return "everything that mattered is settled or safely defaulted";
  if (reason === "max_cards") return "that was the 12th card — a session never asks more than 12";
  if (reason === "no_open") return "nothing left to ask";
  return reason.replace(/_/g, " ");
}
