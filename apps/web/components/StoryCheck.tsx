"use client";
import { useCallback, useEffect, useState } from "react";
import { Toast, impliedText, type ToastData } from "@/components/Toast";
import { api, errorMessage } from "@/lib/client";
import type { DefaultItem, Sheet, VerificationProbe } from "@/lib/types";

/**
 * The story check: the gentlest instrument on the page, so it sits above the long assumed-decisions list.
 *
 * Each scenario bundles several assumptions whose joint odds of all being right sit near 50/50, so one
 * "That's right" settles several at once and one "Something's off" localizes the wrong one. After every
 * answer the round is recomposed from the moved belief, so the next story is the next most useful one.
 */

/** Rounds are recomposed adaptively and the engine always returns its closest bundle, so the panel — not the
 *  engine — decides when enough is enough. Six is well past the point of diminishing returns for one sitting. */
const MAX_CHECKS = 6;

interface Props {
  id: string;
  sheet: Sheet;
  /** a correction resolves a decision, so the assumed list below has to be re-rendered from the response */
  onDefaults: (defaults: DefaultItem[]) => void;
}

export function StoryCheck({ id, sheet, onDefaults }: Props) {
  const [probes, setProbes] = useState<VerificationProbe[] | null>(null);
  const [index, setIndex] = useState(0);
  const [picking, setPicking] = useState(false);
  const [openNode, setOpenNode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastData | null>(null);
  const [confirmed, setConfirmed] = useState(0);
  const [corrected, setCorrected] = useState(0);
  const [answered, setAnswered] = useState(0);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [done, setDone] = useState(false);

  const load = useCallback(
    async (already: Set<string>) => {
      const r = await api.verification(id, 3);
      // Same assumptions coming back around means there is nothing new left to check (the engine always
      // returns its closest bundle rather than nothing), so stop instead of asking the same story twice.
      const fresh = r.probes.filter((p) => !already.has(signature(p)));
      setProbes(fresh);
      setIndex(0);
      setPicking(false);
      setOpenNode(null);
      if (!fresh.length) setDone(true);
    },
    [id],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await load(new Set());
      } catch (e) {
        if (!cancelled) {
          setProbes([]);
          setDone(true);
          setToast({ kind: "error", text: errorMessage(e) });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const probe = done ? undefined : probes?.[index];

  async function after(probeAnswered: VerificationProbe) {
    const already = new Set(seen).add(signature(probeAnswered));
    setSeen(already);
    const n = answered + 1;
    setAnswered(n);
    if (n >= MAX_CHECKS) {
      setDone(true);
      return;
    }
    await load(already);
  }

  async function accept() {
    if (!probe || busy) return;
    setBusy(true);
    try {
      await api.answerVerification(id, { probe_id: probe.id, ok: true });
      setConfirmed((c) => c + probe.nodes.length);
      setToast({ kind: "ok", text: `Good — that settles ${probe.nodes.length} assumption${probe.nodes.length === 1 ? "" : "s"}.` });
      await after(probe);
    } catch (e) {
      setToast({ kind: "error", text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  async function correct(nodeId: string, optionId: string) {
    if (!probe || busy) return;
    setBusy(true);
    try {
      const r = await api.answerVerification(id, { probe_id: probe.id, ok: false, correction: { node_id: nodeId, option_id: optionId } });
      onDefaults(r.defaults);
      setCorrected((c) => c + 1);
      const also = impliedText(r.implied);
      setToast({ kind: "ok", text: `Fixed — thank you.${also ? ` ${also}` : ""}` });
      await after(probe);
    } catch (e) {
      setToast({ kind: "error", text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  function skip() {
    if (!probes) return;
    setPicking(false);
    setOpenNode(null);
    if (index + 1 < probes.length) setIndex(index + 1);
    else setDone(true);
  }

  function again() {
    setDone(false);
    setAnswered(0);
    setProbes(null);
    void load(seen).catch((e: unknown) => {
      setProbes([]);
      setDone(true);
      setToast({ kind: "error", text: errorMessage(e) });
    });
  }

  if (probes === null) {
    return (
      <section className="panel stack">
        <h2>Does this sound right?</h2>
        <p className="muted">
          <span className="spinner" /> Writing a short story from what we assumed…
        </p>
      </section>
    );
  }

  if (!probe) {
    return (
      <section className="panel stack">
        <div className="spread">
          <h2>Does this sound right?</h2>
          {confirmed + corrected > 0 && <button className="btn ghost" onClick={again}>Check a few more</button>}
        </div>
        <p className="muted">{summary(confirmed, corrected)}</p>
        <Toast toast={toast} />
      </section>
    );
  }

  return (
    <section className="panel stack storycheck">
      <div className="spread">
        <div>
          <h2>Does this sound right?</h2>
          <p className="muted">One short story, built from the answers we assumed on your behalf. Read it like a normal week at your business. If it matches, one tap settles all of it.</p>
        </div>
        <span className="badge" title="how sure we are that every assumption in this story is right">{Math.round(probe.p_all_correct * 100)}% sure</span>
      </div>

      <blockquote className="scenario">{probe.scenario}</blockquote>

      <div className="small muted">{picking ? "Which part reads wrong?" : "That story assumes:"}</div>
      <ul className="bundle">
        {probe.nodes.map((n) => (
          <li key={n.node_id}>
            {picking ? (
              <>
                <button type="button" className="bundlerow" disabled={busy} onClick={() => setOpenNode(openNode === n.node_id ? null : n.node_id)} aria-expanded={openNode === n.node_id}>
                  <span>{n.question}</span>
                  <span className="answer">{n.answer_label}</span>
                  <span className="chev">{openNode === n.node_id ? "▾" : "›"}</span>
                </button>
                {openNode === n.node_id && (
                  <div className="bundleopts">
                    <div className="small muted">What happens instead?</div>
                    {optionsFor(sheet, n.node_id).map((o) => (
                      <button key={o.id} type="button" className="btn" disabled={busy} onClick={() => void correct(n.node_id, o.id)}>
                        {o.label}
                        {o.id === currentChoice(sheet, n.node_id) ? " (what we assumed)" : ""}
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="bundlerow static">
                <span>{n.question}</span>
                <span className="answer">{n.answer_label}</span>
              </div>
            )}
          </li>
        ))}
      </ul>

      <div className="row">
        <button className="btn primary" disabled={busy} onClick={() => void accept()}>
          {busy ? <span className="spinner" /> : null}
          That&apos;s right
        </button>
        <button className="btn" disabled={busy} onClick={() => setPicking(!picking)}>
          {picking ? "← never mind, it reads fine" : "Something’s off →"}
        </button>
        <button className="btn ghost" disabled={busy} onClick={skip}>
          Not sure — skip
        </button>
        {confirmed + corrected > 0 && <span className="small muted">{summary(confirmed, corrected)}</span>}
      </div>
      <Toast toast={toast} />
    </section>
  );
}

/** "3 assumptions confirmed, 1 corrected." — the one line left behind when the checks run out. */
function summary(confirmed: number, corrected: number): string {
  if (!confirmed && !corrected) return "Nothing here needs a story check — what we assumed is either already confirmed or too settled to doubt. The full list is below.";
  const parts = [`${confirmed} assumption${confirmed === 1 ? "" : "s"} confirmed`];
  parts.push(`${corrected} corrected`);
  return `${parts.join(", ")}. Everything else is in the list below.`;
}

/** The node set is the identity of a story check: the same assumptions re-bundled is the same question. */
function signature(p: VerificationProbe): string {
  return p.nodes
    .map((n) => n.node_id)
    .sort()
    .join("|");
}

function optionsFor(sheet: Sheet, nodeId: string): { id: string; label: string }[] {
  return sheet.decisions.find((d) => d.id === nodeId)?.options ?? [];
}

function currentChoice(sheet: Sheet, nodeId: string): string | undefined {
  return sheet.decisions.find((d) => d.id === nodeId)?.chosen;
}
