"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Toast, type ToastData } from "@/components/Toast";
import { api, errorMessage } from "@/lib/client";
import type { GapCandidate } from "@/lib/types";

/**
 * "Tighten the spec": the compiler marks every line it had to guess at, and those guesses cluster into the
 * questions nobody asked. Listing them closes the loop — spec guesses become decision cards, and the next
 * spec has fewer of them.
 *
 * Honest constraint: the engine adds the top N of its own ranked list (`candidates.slice(0, apply)`), not an
 * arbitrary set of ids. So the checkboxes select freely, but the button says exactly how many from the top
 * will be added and names the ones that come along for the ride.
 */
export function TightenSpec({ id }: { id: string }) {
  const router = useRouter();
  const [candidates, setCandidates] = useState<GapCandidate[] | null>(null);
  const [gapCount, setGapCount] = useState(0);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<null | "look" | "apply">(null);
  const [toast, setToast] = useState<ToastData | null>(null);

  async function look() {
    setBusy("look");
    setToast(null);
    try {
      const r = await api.gaps(id);
      setCandidates(r.candidates);
      setGapCount(r.gaps.length);
      setPicked(new Set(r.candidates.slice(0, 3).map((c) => c.id)));
      if (!r.candidates.length) setToast({ kind: "ok", text: "Nothing worth asking — the plan did not have to guess at anything that matters." });
    } catch (e) {
      setToast({ kind: "error", text: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  }

  // The engine takes a count from the top of the ranked list, so the deepest pick sets how many get added.
  const depth = candidates ? lastPickedIndex(candidates, picked) + 1 : 0;
  const alsoIncluded = candidates ? candidates.slice(0, depth).filter((c) => !picked.has(c.id)) : [];

  async function apply() {
    if (!depth) return;
    setBusy("apply");
    try {
      const r = await api.applyGaps(id, depth);
      if (!r.applied.length) {
        setToast({ kind: "warn", text: "Those were already covered — nothing new to ask." });
        return;
      }
      router.push(`/p/${id}/cards`);
    } catch (e) {
      setToast({ kind: "error", text: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="tighten" id="tighten">
      <div className="spread">
        <div>
          <h3>Tighten the spec</h3>
          <p className="small muted">Where the plan had to guess, it says so. Here is what it guessed at — pick anything you would rather decide yourself and we will ask you about it.</p>
        </div>
        {candidates === null && (
          <button className="btn" disabled={busy !== null} onClick={() => void look()}>
            {busy === "look" ? <span className="spinner" /> : null}
            {busy === "look" ? "Reading the plan…" : "Show me the guesses"}
          </button>
        )}
      </div>

      {candidates !== null && candidates.length > 0 && (
        <>
          <p className="small muted">
            The plan guessed in {gapCount} place{gapCount === 1 ? "" : "s"}; those come down to {candidates.length} question{candidates.length === 1 ? "" : "s"}, most consequential first.
          </p>
          <ul className="gaplist">
            {candidates.map((c) => (
              <li key={c.id}>
                <label>
                  <input type="checkbox" checked={picked.has(c.id)} disabled={busy !== null} onChange={() => setPicked(toggle(picked, c.id))} />
                  <span>
                    <span className="q">{c.question}</span>
                    <span className="opts">{c.options.map((o) => o.label).join(" · ")}</span>
                    <span className="why">
                      Why we are asking: {c.rationale}
                      {c.section ? ` (from “${c.section}”)` : ""}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="row">
            <button className="btn primary" disabled={busy !== null || depth === 0} onClick={() => void apply()}>
              {busy === "apply" ? <span className="spinner" /> : null}
              {depth ? `Ask me these (${depth})` : "Pick at least one"}
            </button>
            {alsoIncluded.length > 0 && (
              <span className="small muted">
                These are ranked, and we work down the list — so {alsoIncluded.length} above your last pick {alsoIncluded.length === 1 ? "comes" : "come"} too: {alsoIncluded.map((c) => c.topic || c.question).join(", ")}.
              </span>
            )}
            {alsoIncluded.length === 0 && depth > 0 && <span className="small muted">This takes you back to the cards; the spec recompiles after.</span>}
          </div>
        </>
      )}
      <Toast toast={toast} />
    </div>
  );
}

function toggle(set: Set<string>, id: string): Set<string> {
  const next = new Set(set);
  if (!next.delete(id)) next.add(id);
  return next;
}

function lastPickedIndex(candidates: GapCandidate[], picked: Set<string>): number {
  let last = -1;
  candidates.forEach((c, i) => {
    if (picked.has(c.id)) last = i;
  });
  return last;
}
