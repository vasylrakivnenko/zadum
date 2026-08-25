"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { TopBar } from "@/components/TopBar";
import { Markdown, headings as extractHeadings } from "@/components/Markdown";
import { api, errorMessage, specDownloadUrl } from "@/lib/client";
import type { Phase, SpecFeedback, SpecRefineResponse, SpecResponse } from "@/lib/types";
import s from "@/app/p/[id]/spec/spec.module.css";

/** One piece of feedback the user has parked, waiting to be sent with the next refine. */
interface Note {
  id: string;
  quote?: string;
  text: string;
}

const KIND_LABEL: Record<string, string> = { actor: "person", noun: "thing", action: "action", rule: "rule", non_goal: "not yet" };

/**
 * The last step of the product: the compiled spec, read the way a document is read, with three ways to push
 * back on it — select a passage and suggest a change, add a general comment, or edit the markdown directly —
 * and one button that feeds all of it back through the Sheet and recompiles.
 *
 * The refinement is deliberately not a chat. Everything the user says is turned into an explicit extraction
 * ("here is what we understood"), because feedback on a spec is feedback on the *design*: it can contradict
 * an answer given earlier, which reopens a decision, which stops the recompile until it is answered again.
 */
export function SpecWorkspace({ id }: { id: string }) {
  const [data, setData] = useState<SpecResponse | null>(null);
  const [oneLiner, setOneLiner] = useState<string | undefined>();
  const [phase, setPhase] = useState<Phase | undefined>();
  const [loadError, setLoadError] = useState<string | null>(null);

  const [mode, setMode] = useState<"read" | "edit">("read");
  const [draft, setDraft] = useState("");
  const [notes, setNotes] = useState<Note[]>([]);
  const [composer, setComposer] = useState<{ quote?: string; text: string } | null>(null);
  const [sel, setSel] = useState<{ text: string; x: number; y: number } | null>(null);
  const [showTraces, setShowTraces] = useState(true);

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SpecRefineResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState("");

  const docRef = useRef<HTMLDivElement | null>(null);
  const rangeRef = useRef<Range | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  const markdown = data?.markdown ?? "";
  const dirty = mode === "edit" ? draft.trim() !== markdown.trim() : false;
  const canRefine = (dirty || notes.length > 0) && !busy;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [spec, state] = await Promise.all([api.spec(id), api.state(id)]);
        if (cancelled) return;
        setData(spec);
        setDraft(spec.markdown);
        setOneLiner(state.project.one_liner);
        setPhase(state.session.phase);
      } catch (e) {
        if (!cancelled) setLoadError(errorMessage(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  /* ---- select a passage → a floating "Suggest a change" ---- */
  const readSelection = useCallback(() => {
    const w = typeof window === "undefined" ? null : window.getSelection();
    const clear = () => {
      rangeRef.current = null;
      setSel(null);
    };
    if (!w || w.isCollapsed || w.rangeCount === 0) return clear();
    const range = w.getRangeAt(0);
    const node = range.commonAncestorContainer;
    const el = node.nodeType === 1 ? (node as Element) : node.parentElement;
    // quote the sentence, not the ⟨src: …⟩ chips inside it — those are ours, not the user's words
    const frag = range.cloneContents();
    frag.querySelectorAll("[data-trace]").forEach((n) => n.remove());
    const text = (frag.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!el || !docRef.current?.contains(el) || text.length < 3) return clear();
    rangeRef.current = range;
    const r = range.getBoundingClientRect();
    setSel({ text, x: r.left + r.width / 2, y: r.top });
  }, []);

  useEffect(() => {
    if (mode !== "read") return;
    const later = () => window.setTimeout(readSelection, 0);
    // the button follows the passage while the page scrolls, rather than blinking out from under the cursor
    const onScroll = () => {
      const r = rangeRef.current;
      if (!r) return;
      const rect = r.getBoundingClientRect();
      setSel((cur) => (cur ? { ...cur, x: rect.left + rect.width / 2, y: rect.top } : cur));
    };
    document.addEventListener("mouseup", later);
    document.addEventListener("keyup", later);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mouseup", later);
      document.removeEventListener("keyup", later);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [mode, readSelection]);

  /* ---- table of contents ---- */
  const toc = useMemo(() => extractHeadings(markdown).filter((h) => h.level <= 2 && h.text), [markdown]);

  useEffect(() => {
    if (mode !== "read" || toc.length === 0 || typeof IntersectionObserver === "undefined") return;
    const els = toc.map((h) => document.getElementById(h.id)).filter((e): e is HTMLElement => e !== null);
    if (!els.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        const seen = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const first = seen[0];
        if (first) setActive(first.target.id);
      },
      { rootMargin: "-110px 0px -70% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [toc, mode, markdown]);

  function openComposer(quote?: string) {
    setComposer({ text: "", ...(quote ? { quote } : {}) });
    setSel(null);
    window.setTimeout(() => composerRef.current?.focus(), 0);
  }

  function addNote() {
    const c = composer;
    if (!c || !c.text.trim()) return;
    setNotes((prev) => [...prev, { id: `${Date.now()}-${prev.length}`, text: c.text.trim(), ...(c.quote ? { quote: c.quote } : {}) }]);
    setComposer(null);
  }

  async function refine() {
    if (!canRefine) return;
    setBusy(true);
    setResult(null);
    setError(null);
    try {
      const body: SpecFeedback = {
        ...(dirty ? { edited: draft } : {}),
        ...(notes.length ? { comments: notes.map((n) => ({ text: n.text, ...(n.quote ? { quote: n.quote } : {}) })) } : {}),
      };
      const r = await api.refineSpec(id, body);
      setResult(r);
      if (r.recompiled) {
        // the server is the truth for the frame (critic, versions, staleness) — re-read rather than guess
        const fresh = await api.spec(id);
        setData(fresh);
        setDraft(fresh.markdown);
        setNotes([]);
        setMode("read");
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (loadError)
    return (
      <>
        <TopBar id={id} current="compile" />
        <div className={s.centered}>
          <h2>That spec could not be loaded</h2>
          <p className={s.err}>{loadError}</p>
          <Link href={`/p/${id}`} className="btn">
            ← back to the Design Sheet
          </Link>
        </div>
      </>
    );

  if (!data)
    return (
      <>
        <TopBar id={id} oneLiner={oneLiner} phase={phase} current="compile" />
        <div className={s.centered}>
          <p className="muted">
            <span className="spinner" /> Loading the spec…
          </p>
        </div>
      </>
    );

  if (!data.has_spec)
    return (
      <>
        <TopBar id={id} oneLiner={oneLiner} phase={phase} current="compile" />
        <div className={s.centered}>
          <h2>No spec yet</h2>
          <p>The spec is compiled from the Design Sheet once you have looked over the assumptions we made for you. It takes about a minute, and you land right back here.</p>
          <Link href={`/p/${id}/defaults`} className="btn primary">
            Review the assumptions →
          </Link>
        </div>
      </>
    );

  const needAnswers = (result?.reopened.length ?? 0) + (result?.added_decisions.length ?? 0);

  return (
    <>
      <TopBar id={id} oneLiner={oneLiner} phase={phase} current="compile" />

      <div className={s.bar}>
        <div className={s.toggle} role="group" aria-label="Reading mode">
          <button type="button" aria-pressed={mode === "read"} onClick={() => setMode("read")}>
            Read
          </button>
          <button
            type="button"
            aria-pressed={mode === "edit"}
            onClick={() => {
              setSel(null);
              setMode("edit");
            }}
          >
            Edit
          </button>
        </div>
        <div className={s.barStatus}>
          {data.critic && <span className={`badge ${data.critic.verdict === "pass" ? "pass" : "fail"}`}>critic: {data.critic.verdict}</span>}
          {data.critic && <span className="badge">score {data.critic.score}</span>}
          <span className="badge">Sheet v{data.sheet_version}</span>
          {data.stale ? (
            <span className={s.stale} title={`the spec was compiled from Sheet v${data.compiled_version}, and the Sheet has moved since`}>
              ⚠ Stale — compiled from v{data.compiled_version}
            </span>
          ) : (
            <span>compiled from v{data.compiled_version ?? data.sheet_version}</span>
          )}
        </div>
        <div className={s.barActions}>
          <button type="button" className="btn ghost" aria-pressed={showTraces} onClick={() => setShowTraces((v) => !v)} title="⟨src: …⟩ markers point back at the Sheet items each line came from">
            {showTraces ? "Hide traces" : "Show traces"}
          </button>
          <button type="button" className="btn primary" disabled={!canRefine} onClick={() => void refine()} title={canRefine ? "Send your comments and edits back through the Design Sheet" : "Add a comment or edit the spec first"}>
            {busy ? <span className="spinner" /> : null}
            {busy ? "Rewriting…" : `Refine${notes.length || dirty ? ` (${notes.length + (dirty ? 1 : 0)})` : ""}`}
          </button>
          <a className="btn" href={specDownloadUrl(id)} download>
            Download .md
          </a>
        </div>
      </div>

      <div className={s.layout}>
        <nav className={s.toc} aria-label="Sections">
          <div className={s.tocTitle}>Contents</div>
          <ul>
            {toc.map((h) => (
              <li key={h.id}>
                <a href={`#${h.id}`} className={`${h.level > 1 ? s.tocDeep : ""} ${active === h.id ? s.tocActive : ""}`.trim()} aria-current={active === h.id ? "location" : undefined}>
                  {h.text}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className={s.doc}>
          {mode === "read" ? (
            <div ref={docRef}>
              <Markdown text={markdown} className={s.prose} showTraces={showTraces} />
            </div>
          ) : (
            <>
              <div className={s.editorHint}>
                <span>Raw markdown. Anything you change here is read as an intent to change the design — it goes back through the Design Sheet, not straight into the file.</span>
                {dirty && <span className="badge">edited</span>}
              </div>
              <label className="small muted" htmlFor="spec-editor">
                spec.md
              </label>
              <textarea id="spec-editor" className={s.editor} value={draft} spellCheck={false} onChange={(e) => setDraft(e.target.value)} />
              <div className={s.composerRow} style={{ marginTop: 10 }}>
                <button type="button" className="btn ghost" disabled={!dirty} onClick={() => setDraft(markdown)}>
                  Revert edits
                </button>
              </div>
            </>
          )}
        </div>

        <aside className={s.side}>
          <section className={s.card}>
            <div className={s.cardTitle}>
              <span>Your comments</span>
              <span className={s.count}>{notes.length}</span>
            </div>
            {notes.length === 0 && !composer && <p className={s.empty}>Select any sentence in the spec to suggest a change to it, or add a general comment.</p>}
            {notes.length > 0 && (
              <ul className={s.comments}>
                {notes.map((n) => (
                  <li key={n.id} className={s.comment}>
                    <div className={s.commentBody}>
                      {n.quote && <div className={s.quote}>“{n.quote.length > 220 ? `${n.quote.slice(0, 220)}…` : n.quote}”</div>}
                      <div>{n.text}</div>
                    </div>
                    <button type="button" className={s.remove} aria-label={`Remove comment: ${n.text.slice(0, 40)}`} onClick={() => setNotes((prev) => prev.filter((x) => x.id !== n.id))}>
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {composer ? (
              <div className={s.composer}>
                {composer.quote && (
                  <div className={s.quote}>
                    “{composer.quote.length > 220 ? `${composer.quote.slice(0, 220)}…` : composer.quote}”{" "}
                    <button type="button" className={s.remove} aria-label="Drop the quoted passage" onClick={() => setComposer({ text: composer.text })}>
                      ×
                    </button>
                  </div>
                )}
                <label className="small muted" htmlFor="spec-comment">
                  {composer.quote ? "What should this say instead?" : "What should we change?"}
                </label>
                <textarea
                  id="spec-comment"
                  ref={composerRef}
                  value={composer.text}
                  placeholder={composer.quote ? "e.g. clients pay by card too, not just bank transfer" : "e.g. the owner should be the only one who can void an invoice"}
                  onChange={(e) => setComposer({ ...composer, text: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) addNote();
                    if (e.key === "Escape") setComposer(null);
                  }}
                />
                <div className={s.composerRow}>
                  <button type="button" className="btn primary" disabled={!composer.text.trim()} onClick={addNote}>
                    Add comment
                  </button>
                  <button type="button" className="btn ghost" onClick={() => setComposer(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="btn" onClick={() => openComposer()}>
                + Add a comment
              </button>
            )}
          </section>

          {(busy || result || error) && (
            <section className={s.card} aria-live="polite">
              <div className={s.cardTitle}>
                <span>Refinement</span>
              </div>
              {busy && (
                <p className={s.working}>
                  <span className="spinner" /> Rewriting the spec — reading your feedback into the Design Sheet, then recompiling. This can take a minute.
                </p>
              )}
              {error && <p className={s.err}>{error}</p>}
              {result && !busy && <RefineResult id={id} r={result} needAnswers={needAnswers} />}
            </section>
          )}
        </aside>
      </div>

      {sel && mode === "read" && (
        <div className={s.floater} style={{ left: sel.x, top: sel.y }}>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => openComposer(sel.text)}>
            ✎ Suggest a change
          </button>
        </div>
      )}
    </>
  );
}

/** "Here is what we understood" — the four extraction lists, then what still needs the user. */
function RefineResult({ id, r, needAnswers }: { id: string; r: SpecRefineResponse; needAnswers: number }) {
  const e = r.extraction;
  const nothing = e.wrong_assumptions.length + e.missing_elements.length + e.confirmed_elements.length + e.new_questions.length === 0;
  return (
    <div className={s.result}>
      {needAnswers > 0 && (
        <div className={s.callout}>
          <span>
            <strong>
              {needAnswers} question{needAnswers === 1 ? "" : "s"} need{needAnswers === 1 ? "s" : ""} your answer
            </strong>{" "}
            before the spec can be compiled again — your feedback either raised something new or contradicted an earlier answer.
          </span>
          <Link href={`/p/${id}/cards`} className="btn primary">
            Answer them →
          </Link>
        </div>
      )}
      {r.blocked && (
        <div className={s.blocked}>
          <strong>Your feedback is saved.</strong> We did not recompile yet: {r.blocked.replace(/^cannot compile:\s*/, "")}
        </div>
      )}
      {nothing && <p className={s.empty}>Nothing in that feedback changed the design — the spec stands as it is.</p>}

      {e.wrong_assumptions.length > 0 && (
        <div className={s.group}>
          <div className={s.groupTitle}>We had this wrong</div>
          <ul>
            {e.wrong_assumptions.map((w, i) => (
              <li key={i} className={s.wrong}>
                <span className={s.was}>{w.was}</span>
                {w.should_be ? (
                  <>
                    <span className={s.arrow}>→</span>
                    <strong>{w.should_be}</strong>
                  </>
                ) : null}
                <span className={s.why}>
                  {w.node} · {w.why}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {e.missing_elements.length > 0 && (
        <div className={s.group}>
          <div className={s.groupTitle}>Added to the Design Sheet</div>
          <ul>
            {e.missing_elements.map((m, i) => (
              <li key={i} className={s.added}>
                <span className={s.kind}>{KIND_LABEL[m.kind] ?? m.kind}</span>
                {m.text}
              </li>
            ))}
          </ul>
        </div>
      )}

      {e.confirmed_elements.length > 0 && (
        <div className={s.group}>
          <div className={s.groupTitle}>Confirmed as-is</div>
          <ul>
            {e.confirmed_elements.map((c, i) => (
              <li key={i} className={s.good}>
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}

      {e.new_questions.length > 0 && (
        <div className={s.group}>
          <div className={s.groupTitle}>New questions raised</div>
          <ul>
            {e.new_questions.map((q) => (
              <li key={q.id}>{q.question}</li>
            ))}
          </ul>
        </div>
      )}

      {r.rejected.length > 0 && (
        <div className={s.group}>
          <div className={s.groupTitle}>Could not be applied</div>
          <ul>
            {r.rejected.map((x, i) => (
              <li key={i}>{x.error}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="small muted">
        Design Sheet v{r.version}
        {r.recompiled ? ` · recompiled · critic ${r.recompiled.critic.verdict} (${r.recompiled.critic.score})` : ""}
        {r.notes ? ` · ${r.notes}` : ""}
      </p>
    </div>
  );
}
