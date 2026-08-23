/** Sheet → human-readable markdown (the one page the user reads; also shipped as design-sheet.md). */
import type { Sheet, Decision } from "./sheet.js";

export interface RenderOptions {
  showIds?: boolean;
  showDecisions?: boolean; // include the decision ledger
  showOpenDecisions?: boolean;
}

export function renderSheetMarkdown(sheet: Sheet, opts: RenderOptions = {}): string {
  const id = (x: string) => (opts.showIds ? ` \`${x}\`` : "");
  const L: string[] = [];
  L.push(`# Design Sheet — ${sheet.one_liner}`);
  L.push(`_v${sheet.version}${sheet.archetypes.length ? ` · ${sheet.archetypes.join(", ")}` : ""}_`);
  L.push("");
  L.push("## People");
  for (const a of sheet.actors) L.push(`- **${a.name}**${a.description ? ` — ${a.description}` : ""}${id(a.id)}`);
  L.push("");
  L.push("## Things it keeps track of");
  for (const n of sheet.nouns) {
    const bits = [n.description, n.fields_hint.length ? `fields: ${n.fields_hint.join(", ")}` : "", n.example ? `e.g. ${n.example}` : ""].filter(Boolean);
    L.push(`- **${n.name}**${bits.length ? ` — ${bits.join(" · ")}` : ""}${id(n.id)}`);
  }
  L.push("");
  L.push("## What people do");
  for (const a of sheet.actions) {
    const actor = sheet.actors.find((x) => x.id === a.actor)?.name ?? a.actor;
    const noun = sheet.nouns.find((x) => x.id === a.object)?.name ?? a.object;
    L.push(`- ${actor} **${a.verb}** ${noun}${a.example ? ` — e.g. ${a.example}` : ""}${id(a.id)}`);
  }
  L.push("");
  L.push("## What must never happen");
  for (const r of sheet.rules) L.push(`- ${r.text}${r.example ? ` — e.g. ${r.example}` : ""} _(${r.kind})_${id(r.id)}`);
  L.push("");
  L.push("## Not yet (out of scope for v1)");
  for (const g of sheet.non_goals) L.push(`- ${g.text}${id(g.id)}`);
  if (opts.showDecisions) {
    L.push("");
    L.push("## Decisions");
    const settled = sheet.decisions.filter((d) => d.status !== "open");
    for (const d of settled) L.push(`- ${decisionLine(d)}`);
    if (opts.showOpenDecisions) {
      const open = sheet.decisions.filter((d) => d.status === "open");
      if (open.length) {
        L.push("");
        L.push(`_Still open (${open.length}):_ ${open.map((d) => d.topic).join(", ")}`);
      }
    }
  }
  return L.join("\n") + "\n";
}

export function decisionLine(d: Decision): string {
  const chosen = d.chosen ? d.options.find((o) => o.id === d.chosen)?.label ?? d.chosen : "—";
  const mark = d.status === "resolved" ? "✓" : d.status === "implied" ? "⇒" : d.status === "delegated" ? "↪" : d.status === "defaulted" ? "≈" : "·";
  const conf = d.confidence !== undefined && d.status !== "resolved" ? ` (${Math.round(d.confidence * 100)}%)` : "";
  const via = d.status === "resolved" ? ` — ${d.source}` : d.implied_by ? ` — because of ${d.implied_by}` : "";
  return `${mark} **${d.topic}**: ${chosen}${conf} _[${d.status}]_${via}`;
}
