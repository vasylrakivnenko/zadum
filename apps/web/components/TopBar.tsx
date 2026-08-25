import { Fragment } from "react";
import Link from "next/link";
import type { Phase } from "@/lib/types";

/**
 * Where you are in the flow: Design Sheet → Decision cards → Assumptions → Spec.
 * `current` names the screen; `phase` (from the engine) says how far the session has actually got, so a
 * step behind the current phase reads as done even when you have navigated back to it.
 */
const STEPS: { key: string; n: number; label: string; phases: Phase[]; aliases?: string[]; href: (id: string) => string }[] = [
  { key: "sheet", n: 1, label: "Design Sheet", phases: ["drafting", "correcting"], href: (id) => `/p/${id}` },
  { key: "cards", n: 2, label: "Decision cards", phases: ["cards"], href: (id) => `/p/${id}/cards` },
  { key: "defaults", n: 3, label: "Assumptions", phases: ["defaults_review"], href: (id) => `/p/${id}/defaults` },
  { key: "spec", n: 4, label: "Spec", phases: ["compiling", "done", "failed"], aliases: ["compile", "artifacts", "story"], href: (id) => `/p/${id}/spec` },
];

export function TopBar({ id, oneLiner, phase, current }: { id?: string; oneLiner?: string; phase?: Phase; current?: string }) {
  const idx = phase ? STEPS.findIndex((s) => s.phases.includes(phase)) : -1;
  return (
    <header className="topbar">
      <Link href="/" className="brand">
        Design Sheet
      </Link>
      <span className="oneliner" title={oneLiner ?? undefined}>
        {oneLiner ?? ""}
      </span>
      {id && (
        <nav className="steps" aria-label="Progress">
          {STEPS.map((s, i) => {
            const active = s.key === current || (current !== undefined && s.aliases?.includes(current) === true);
            const done = !active && i < idx;
            return (
              <Fragment key={s.key}>
                {i > 0 && (
                  <span className="sep" aria-hidden="true">
                    ›
                  </span>
                )}
                <Link
                  href={s.href(id)}
                  className={`step${active ? " active" : done ? " done" : ""}`}
                  aria-current={active ? "step" : undefined}
                  aria-label={`Step ${s.n}: ${s.label}${done ? " (done)" : ""}`}
                  title={s.label}
                >
                  {/* both spans are decorative: narrow screens hide the label, so the accessible name lives on the link */}
                  <span className="n" aria-hidden="true">
                    {s.n}
                  </span>
                  <span className="label" aria-hidden="true">
                    {s.label}
                  </span>
                </Link>
              </Fragment>
            );
          })}
        </nav>
      )}
    </header>
  );
}
