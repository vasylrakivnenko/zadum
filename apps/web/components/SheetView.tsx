"use client";
import type { DecidedEntry, Sheet } from "@/lib/types";

const MARK: Record<string, string> = { resolved: "✓", implied: "⇒", defaulted: "≈", delegated: "↪", skipped: "·", open: "?" };
const VIA: Record<string, string> = { card_answer: "card", implication: "implied", user_edit: "your edit", plan: "from the description", default: "defaulted", defaults_review: "review", undo: "undo" };
/** What each mark in the decided list means, spelled out once so the column is readable at a glance. */
const LEGEND: { status: string; word: string }[] = [
  { status: "resolved", word: "you chose" },
  { status: "implied", word: "follows from that" },
  { status: "defaulted", word: "assumed" },
  { status: "delegated", word: "left to us" },
  { status: "skipped", word: "skipped" },
];

export interface SheetViewProps {
  sheet: Sheet;
  decided?: DecidedEntry[];
  /** ids of Sheet items / decisions touched by the latest action — drawn emphasised */
  fresh?: ReadonlySet<string>;
  title?: string;
}

/** The one page: People / Things it keeps track of / What people do / What must never happen / Not yet. */
export function SheetView({ sheet, decided, fresh, title }: SheetViewProps) {
  const actorName = (id: string) => sheet.actors.find((a) => a.id === id)?.name ?? id;
  const nounName = (id: string) => sheet.nouns.find((n) => n.id === id)?.name ?? id;
  const cls = (id: string, source: string) => [fresh?.has(id) ? "fresh" : "", source !== "draft" && source !== "plan" ? "grown" : ""].filter(Boolean).join(" ");
  return (
    <section className="panel sheet">
      <div className="spread">
        <h2>{title ?? "Design Sheet"}</h2>
        <span className="muted small tnum">
          v{sheet.version}
          {sheet.archetypes.length ? ` · ${sheet.archetypes.join(", ")}` : ""}
        </span>
      </div>
      <div className="lists">
        <List title="People" count={sheet.actors.length} empty="nobody yet">
          {sheet.actors.map((a) => (
            <li key={a.id} className={cls(a.id, a.source)}>
              <strong>{a.name}</strong>
              {a.description ? <span className="ex"> — {a.description}</span> : null}
            </li>
          ))}
        </List>
        <List title="Things it keeps track of" count={sheet.nouns.length} empty="nothing yet">
          {sheet.nouns.map((n) => (
            <li key={n.id} className={cls(n.id, n.source)}>
              <strong>{n.name}</strong>
              {n.description ? <span className="ex"> — {n.description}</span> : null}
              {n.example ? <span className="ex"> · e.g. {n.example}</span> : null}
            </li>
          ))}
        </List>
        <List title="What people do" count={sheet.actions.length} empty="no actions yet">
          {sheet.actions.map((a) => (
            <li key={a.id} className={cls(a.id, a.source)}>
              {actorName(a.actor)} <strong>{a.verb}</strong> {nounName(a.object)}
              {a.example ? <span className="ex"> — e.g. {a.example}</span> : null}
            </li>
          ))}
        </List>
        <List title="What must never happen" count={sheet.rules.length} empty="no rules yet">
          {sheet.rules.map((r) => (
            <li key={r.id} className={cls(r.id, r.source)}>
              {r.text}
              {r.example ? <span className="ex"> — e.g. {r.example}</span> : null}
              <span className="kind">({r.kind})</span>
            </li>
          ))}
        </List>
        <List title="Not yet" count={sheet.non_goals.length} empty="nothing ruled out yet">
          {sheet.non_goals.map((g) => (
            <li key={g.id} className={cls(g.id, g.source)}>
              {g.text}
            </li>
          ))}
        </List>
      </div>
      {decided && decided.length > 0 && (
        <div className="decided">
          <h3>Decided ({decided.length})</h3>
          <div className="legend" aria-hidden="true">
            {LEGEND.map((l) => (
              <span key={l.status}>
                <span className={`mark ${l.status}`}>{MARK[l.status]}</span>
                {l.word}
              </span>
            ))}
          </div>
          <ul>
            {decided.map((d) => (
              <li key={d.id} className={fresh?.has(d.id) ? "fresh" : ""} title={`${statusWord(d.status)}${d.via ? ` · ${VIA[d.via] ?? d.via}` : ""}`}>
                <span className={`mark ${d.status}`} aria-hidden="true">
                  {MARK[d.status] ?? "·"}
                </span>
                <span>
                  <span className="topic">{d.topic} → </span>
                  {d.label}
                </span>
                <span className="conf" title={d.status === "resolved" ? "how it was decided" : "how sure we are"}>
                  {d.status === "resolved" ? VIA[d.via] ?? d.via : d.confidence !== null ? `${Math.round(d.confidence * 100)}%` : statusWord(d.status)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function statusWord(status: string): string {
  return LEGEND.find((l) => l.status === status)?.word ?? status;
}

function List({ title, count, empty, children }: { title: string; count: number; empty: string; children: React.ReactNode[] }) {
  return (
    <div className="list">
      <h3>
        {title}
        {count > 0 ? <span className="count">{count}</span> : null}
      </h3>
      {children.length ? <ul>{children}</ul> : <div className="empty">{empty}</div>}
    </div>
  );
}

/** Ids of items that are new or changed between two Sheet versions (for the "fresh" emphasis). */
export function diffSheetIds(prev: Sheet | null, next: Sheet): Set<string> {
  const out = new Set<string>();
  if (!prev) return out;
  const lists = ["actors", "nouns", "actions", "rules", "non_goals"] as const;
  for (const l of lists) {
    const before = new Map(prev[l].map((x) => [x.id, JSON.stringify(x)]));
    for (const x of next[l]) if (before.get(x.id) !== JSON.stringify(x)) out.add(x.id);
  }
  const beforeD = new Map(prev.decisions.map((d) => [d.id, `${d.status}:${d.chosen ?? ""}`]));
  for (const d of next.decisions) if (d.status !== "open" && beforeD.get(d.id) !== `${d.status}:${d.chosen ?? ""}`) out.add(d.id);
  return out;
}
