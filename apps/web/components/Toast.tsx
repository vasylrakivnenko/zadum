"use client";
import type { ImpliedLabels } from "@/lib/types";

export interface ToastData {
  kind: "info" | "ok" | "warn" | "error";
  text: string;
}

export function Toast({ toast }: { toast: ToastData | null }) {
  if (!toast) return null;
  return (
    <div className={`toast ${toast.kind === "info" ? "" : toast.kind}`} role="status">
      {toast.text}
    </div>
  );
}

/** "This also decided: ✓ topic → label · likely: ≈ topic → label" */
export function impliedText(implied: ImpliedLabels): string | null {
  const hard = implied.hard.map((h) => `✓ ${h.topic} → ${h.label}`);
  const soft = implied.soft.map((s) => `≈ ${s.topic} → ${s.label}`);
  if (!hard.length && !soft.length) return null;
  const parts: string[] = [];
  if (hard.length) parts.push(`This also decided: ${hard.join(" · ")}`);
  if (soft.length) parts.push(`${hard.length ? "likely" : "This also made likely"}: ${soft.join(" · ")}`);
  return parts.join(" · ");
}
