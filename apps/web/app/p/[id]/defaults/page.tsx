"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { TopBar } from "@/components/TopBar";
import { Toast, impliedText, type ToastData } from "@/components/Toast";
import { api, errorMessage, pct } from "@/lib/client";
import type { CompileResponse, DefaultItem, Phase } from "@/lib/types";

const STATUS_WORD: Record<string, string> = { defaulted: "assumed", implied: "follows", delegated: "left to us", skipped: "skipped", resolved: "you chose" };

/** Defaults review: every assumed decision, riskiest first, one-tap correctable; then accept & compile. */
export default function DefaultsPage() {
  const { id } = useParams<{ id: string }>();
  const [oneLiner, setOneLiner] = useState<string | undefined>();
  const [phase, setPhase] = useState<Phase | undefined>();
  const [defaults, setDefaults] = useState<DefaultItem[] | null>(null);
  const [toast, setToast] = useState<ToastData | null>(null);
  const [busyNode, setBusyNode] = useState<string | null>(null);
  const [compiling, setCompiling] = useState(false);
  const [result, setResult] = useState<CompileResponse | null>(null);
  const [artifacts, setArtifacts] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await api.state(id);
        if (cancelled) return;
        setOneLiner(s.project.one_liner);
        setPhase(s.session.phase);
        const needsFinish = s.session.phase === "cards" || s.session.phase === "correcting" || s.session.phase === "drafting";
        const list = needsFinish ? (await api.finishCards(id)).defaults : (await api.defaults(id)).defaults;
        if (cancelled) return;
        setDefaults(list);
        if (needsFinish) setPhase("defaults_review");
        if (s.session.phase === "done" || s.session.phase === "compiling") {
          const a = await api.artifacts(id);
          if (!cancelled) setArtifacts(a.bundle.map((b) => b.name));
        }
      } catch (e) {
        if (!cancelled) setToast({ kind: "error", text: errorMessage(e) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function override(node: string, option: string) {
    setBusyNode(node);
    try {
      const r = await api.override(id, node, option);
      setDefaults(r.defaults);
      const also = impliedText(r.implied);
      setToast({ kind: "ok", text: `Corrected.${also ? ` ${also}` : ""}` });
    } catch (e) {
      setToast({ kind: "error", text: errorMessage(e) });
    } finally {
      setBusyNode(null);
    }
  }

  async function acceptAndCompile() {
    if (compiling) return;
    setCompiling(true);
    setResult(null);
    setToast({ kind: "info", text: "Compiling the spec — sections, critic, round-trip check, walkthrough. This can take a minute with a live model." });
    try {
      await api.accept(id);
      setPhase("compiling");
      const r = await api.compile(id);
      setResult(r);
      setArtifacts(r.bundle);
      setPhase(r.phase);
      setToast(r.critic.verdict === "pass" ? { kind: "ok", text: `Compiled · critic passed (score ${r.critic.score}) in ${(r.latency_ms / 1000).toFixed(1)}s.` } : { kind: "warn", text: `Compiled, but the critic did not pass (score ${r.critic.score}). The bundle is available; review the findings below.` });
    } catch (e) {
      setToast({ kind: "error", text: errorMessage(e) });
    } finally {
      setCompiling(false);
    }
  }

  const resolvedCount = defaults?.filter((d) => d.status === "resolved").length ?? 0;
  const assumed = defaults?.filter((d) => d.status !== "resolved") ?? [];

  return (
    <>
      <TopBar id={id} oneLiner={oneLiner} phase={phase} current={phase === "done" || phase === "compiling" ? "compile" : "defaults"} />
      <main className="page">
        <div className="stack">
          <section className="panel stack">
            <div className="spread">
              <div>
                <h2>What I assumed — riskiest first</h2>
                <p className="muted">
                  Every decision that was not asked got the most likely answer. Correct any of them with one tap; the rest become part of the spec.
                  {resolvedCount ? ` ${resolvedCount} you already decided.` : ""}
                </p>
              </div>
              <div className="row">
                <Link href={`/p/${id}/cards`} className="btn ghost">
                  ← back to cards
                </Link>
                <button className="btn primary" disabled={compiling || !defaults} onClick={acceptAndCompile}>
                  {compiling ? <span className="spinner" /> : null}
                  {compiling ? "Compiling…" : result || phase === "done" ? "Accept all & compile again" : "Accept all & compile"}
                </button>
              </div>
            </div>
            <Toast toast={toast} />
            {!defaults ? (
              <p className="muted">
                <span className="spinner" /> Gathering assumed decisions…
              </p>
            ) : assumed.length === 0 ? (
              <p className="muted">Nothing was assumed — every decision was settled by you.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="deftable">
                  <thead>
                    <tr>
                      <th>Topic</th>
                      <th>Assumed</th>
                      <th>Sure</th>
                      <th>Matters</th>
                      <th>Why</th>
                      <th>Correct</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assumed.map((d) => (
                      <tr key={d.id} className={d.consequence * (1 - d.confidence) >= 2 ? "risky" : ""}>
                        <td>
                          <div>{d.topic}</div>
                          <div className="why">{d.question}</div>
                        </td>
                        <td>
                          <div>{d.chosen_label}</div>
                          <div className="why">{STATUS_WORD[d.status] ?? d.status}</div>
                        </td>
                        <td>{pct(d.confidence)}</td>
                        <td>{"●".repeat(Math.round(d.consequence)).padEnd(5, "○")}</td>
                        <td className="why">{d.why}</td>
                        <td>
                          <select value={d.chosen} disabled={busyNode !== null || compiling} onChange={(e) => void override(d.id, e.target.value)}>
                            {d.options.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                          {busyNode === d.id ? <span className="spinner" style={{ marginLeft: 6 }} /> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {(result || artifacts.length > 0) && (
            <section className="panel stack">
              <h2>Compiled spec</h2>
              {result && (
                <>
                  <div className="row">
                    <span className={`badge ${result.critic.verdict}`}>critic: {result.critic.verdict}</span>
                    <span className="badge">score {result.critic.score}</span>
                    <span className="badge">{result.critic_rounds} round{result.critic_rounds === 1 ? "" : "s"}</span>
                    {result.roundtrip && <span className="badge">round-trip recall {pct(result.roundtrip.recall.overall)}</span>}
                    <span className="badge">{(result.latency_ms / 1000).toFixed(1)}s</span>
                  </div>
                  {result.roundtrip && (
                    <p className="small muted">
                      Recall by list — people {pct(result.roundtrip.recall.actors)} · things {pct(result.roundtrip.recall.nouns)} · actions {pct(result.roundtrip.recall.actions)} · rules {pct(result.roundtrip.recall.rules)} · not yet {pct(result.roundtrip.recall.non_goals)}
                      {result.roundtrip.missing.length ? ` · missing: ${result.roundtrip.missing.map((m) => m.item).join(", ")}` : ""}
                    </p>
                  )}
                  {(result.critic.violations.length > 0 || result.critic.omissions.length > 0) && (
                    <ul className="small">
                      {result.critic.violations.map((v, i) => (
                        <li key={`v${i}`}>
                          violation of {v.rule_id} ({v.severity}) at {v.where}: {v.why}
                        </li>
                      ))}
                      {result.critic.omissions.map((o, i) => (
                        <li key={`o${i}`}>
                          omission: {o.kind} {o.item} — {o.why}
                        </li>
                      ))}
                    </ul>
                  )}
                  {result.story && (
                    <div>
                      <h3 style={{ fontSize: 15 }}>{result.story.title}</h3>
                      <p className="small muted">A day in the life, from the spec — does this look like your business?</p>
                      <ol>
                        {result.story.steps.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ol>
                      {result.story.checks.length > 0 && (
                        <>
                          <div className="small muted">Please confirm:</div>
                          <ul>
                            {result.story.checks.map((c, i) => (
                              <li key={i}>{c}</li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
              <div>
                <div className="small muted" style={{ marginBottom: 6 }}>
                  Bundle
                </div>
                <div className="row">
                  {artifacts.map((name) => (
                    <Link key={name} href={`/p/${id}/artifacts/${encodeURIComponent(name)}`} className="btn">
                      {name}
                    </Link>
                  ))}
                </div>
              </div>
            </section>
          )}
        </div>
      </main>
    </>
  );
}
