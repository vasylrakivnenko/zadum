import Link from "next/link";
import type { Phase } from "@/lib/types";

const STEPS: { key: string; label: string; phases: Phase[]; href: (id: string) => string }[] = [
  { key: "sheet", label: "1 Design Sheet", phases: ["drafting", "correcting"], href: (id) => `/p/${id}` },
  { key: "cards", label: "2 Decision cards", phases: ["cards"], href: (id) => `/p/${id}/cards` },
  { key: "defaults", label: "3 Defaults", phases: ["defaults_review"], href: (id) => `/p/${id}/defaults` },
  { key: "compile", label: "4 Spec", phases: ["compiling", "done", "failed"], href: (id) => `/p/${id}/defaults` },
];

export function TopBar({ id, oneLiner, phase, current }: { id?: string; oneLiner?: string; phase?: Phase; current?: string }) {
  const idx = phase ? STEPS.findIndex((s) => s.phases.includes(phase)) : -1;
  return (
    <header className="topbar">
      <Link href="/" className="brand">
        Design Sheet
      </Link>
      <span className="oneliner">{oneLiner ?? ""}</span>
      {id && (
        <nav className="steps">
          {STEPS.map((s, i) => (
            <Link key={s.key} href={s.href(id)}>
              <span className={s.key === current ? "active" : i < idx ? "done" : ""}>{s.label}</span>
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
