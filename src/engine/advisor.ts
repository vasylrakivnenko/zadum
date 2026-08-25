/**
 * "What should I do next?" — the guided-flow brain.
 *
 * The product grew to eight distinct interactions (draft → correct → cards → story checks → defaults review →
 * compile → walkthrough → gap mining → amendments) and every one of them is a separate command. A tool whose
 * pitch is "TurboTax for AI coding" cannot require the user to know which of eight steps is next: TurboTax's
 * whole trick is that it always shows exactly one next thing. This module derives that one thing from state.
 *
 * Pure and deterministic given a snapshot: the CLI and the web rail both render the same recommendation, and
 * it is testable without an engine.
 */
import type { Sheet } from "../core/sheet.js";
import type { SessionState } from "../core/session.js";

export type NextActionKind =
  | "correct_draft"
  | "answer_cards"
  | "story_checks"
  | "review_defaults"
  | "accept_defaults"
  | "compile"
  | "walkthrough"
  | "review_spec"
  | "mine_gaps"
  | "review_amendments"
  | "recompile"
  | "done";

export interface NextAction {
  kind: NextActionKind;
  /** one line, in the user's language — what to do and why it is worth doing */
  headline: string;
  /** the CLI command that does it (project id already substituted) */
  command: string;
  /** why this is next, in one sentence — the "because" a guided flow owes the user */
  because: string;
  /** other things that are legal right now, in the same shape (never more than 3) */
  alternatives: { kind: NextActionKind; headline: string; command: string }[];
}

export interface AdvisorSnapshot {
  sheet: Sheet;
  session: SessionState;
  /** names of stored artifacts (spec.md present ⇒ compiled at least once) */
  artifacts: string[];
  /** sheet version at the last compile, if known (from the compile-report artifact or events) */
  compiledVersion?: number;
  /** amendments proposed by coding agents awaiting the owner (MCP queue) */
  pendingAmendments?: number;
  /** gap candidates known to be minable from the last compile (optional; the CLI can pass 0 to skip) */
  gapCount?: number;
  /** how many times the owner has corrected the compiled spec (`spec_refined` events); 0/undefined = never read it */
  refinements?: number;
}

const cmd = (id: string, tail: string) => `npm run zadum -- ${tail.replace("<id>", id)}`;

/**
 * The recommendation. Ordering is the product's own funnel — cheapest-and-most-valuable first — with two
 * rules that matter: never recommend a step whose input is stale (recompile before walking through an
 * out-of-date story), and never recommend more work when the design is settled enough to ship.
 */
export function nextAction(s: AdvisorSnapshot): NextAction {
  const id = s.sheet.project_id;
  const d = s.sheet.decisions;
  const open = d.filter((x) => x.status === "open").length;
  const risky = d.filter((x) => x.status === "defaulted" && (x.confidence ?? 1) < 0.8).length;
  const compiled = s.artifacts.includes("spec.md");
  const stale = compiled && s.compiledVersion !== undefined && s.sheet.version > s.compiledVersion;
  const phase = s.session.phase;

  const alt = (...xs: { kind: NextActionKind; headline: string; command: string }[]) => xs.slice(0, 3);
  const A = {
    cards: { kind: "answer_cards" as const, headline: "Answer a few decision cards", command: cmd(id, "cards <id>") },
    checks: { kind: "story_checks" as const, headline: "Run story checks over the assumptions", command: cmd(id, "verify <id>") },
    review: { kind: "review_defaults" as const, headline: "Review the assumptions we made", command: cmd(id, "defaults <id>") },
    compile: { kind: "compile" as const, headline: "Compile the spec bundle", command: cmd(id, "compile <id> --out ./out/<id>".replace("<id>", id)) },
    gaps: { kind: "mine_gaps" as const, headline: "Tighten the spec where it had to guess", command: cmd(id, "gaps <id>") },
    edit: { kind: "correct_draft" as const, headline: "Correct anything that reads wrong", command: cmd(id, 'edit <id> "…"') },
  };

  // 1. An agent is waiting on the owner: it proposed a change to the contract.
  if (s.pendingAmendments) {
    return {
      kind: "review_amendments",
      headline: `Review ${s.pendingAmendments} change${s.pendingAmendments > 1 ? "s" : ""} a coding agent proposed`,
      command: `npx tsx src/mcp/amendments_cli.ts ${id}`,
      because: "A coding agent hit something the Design Sheet did not cover and asked for a change — nothing is applied until you approve it.",
      alternatives: alt(A.review, A.checks),
    };
  }

  // 2. The correction moment: the draft exists and the user has not corrected anything yet.
  if (phase === "drafting" || (phase === "correcting" && !s.session.answers.length && s.sheet.version <= 2)) {
    return {
      kind: "correct_draft",
      headline: "Read the Design Sheet and correct anything that reads wrong",
      command: cmd(id, 'edit <id> "clients never log in; we email invoices"'),
      because: "Everything downstream is built on this page — a correction now is worth ten later, and it is the cheapest moment to make one.",
      alternatives: alt(A.cards),
    };
  }

  // 3. Open questions worth asking.
  if (open > 0 && (phase === "correcting" || phase === "cards")) {
    return {
      kind: "answer_cards",
      headline: `Answer decision cards (${open} question${open > 1 ? "s" : ""} still open)`,
      command: cmd(id, "cards <id>"),
      because: "These are the choices we cannot safely guess for you; each one settles several others.",
      alternatives: alt(A.checks, A.edit),
    };
  }

  // 4. Accepting the defaults is the user saying "I'm done reviewing" — respect it and move to the build
  // rather than looping them back into checks they just dismissed.
  if (phase === "compiling" && !compiled) {
    return {
      kind: "compile",
      headline: "Compile the spec bundle for your coding agent",
      command: A.compile.command,
      because: "You accepted the assumptions — this turns the Design Sheet into a specification, a one-page contract, and agent instructions.",
      alternatives: alt(A.checks, A.review),
    };
  }

  // 5. Risky assumptions on the table: story checks first (one tap covers several), then the itemized review.
  if (risky > 0 && !compiled) {
    return {
      kind: "story_checks",
      headline: `Check ${risky} assumption${risky > 1 ? "s" : ""} we are not sure about`,
      command: cmd(id, "verify <id>"),
      because: "Each check is one short story covering several assumptions at once — the fastest way to catch a wrong guess before it reaches the spec.",
      alternatives: alt(A.review, A.compile),
    };
  }

  if (phase === "defaults_review" && !compiled) {
    return {
      kind: "accept_defaults",
      headline: "Accept the assumptions and build the spec",
      command: cmd(id, "accept <id>"),
      because: "The open questions are settled and the risky assumptions have been looked at — the design is ready to compile.",
      alternatives: alt(A.review, A.checks),
    };
  }

  // 6. Compile, or recompile when the Sheet moved since the last one.
  if (!compiled) {
    return {
      kind: "compile",
      headline: "Compile the spec bundle for your coding agent",
      command: A.compile.command,
      because: "The design is settled enough to turn into a specification, a Design Sheet page, and agent instructions.",
      alternatives: alt(A.checks, A.review),
    };
  }
  if (stale) {
    return {
      kind: "recompile",
      headline: "Recompile — the Design Sheet changed since the last spec",
      command: A.compile.command,
      because: `The Sheet is at v${s.sheet.version} but the spec was built from v${s.compiledVersion}; your coding agent is reading stale instructions.`,
      alternatives: alt(A.gaps, A.review),
    };
  }

  // 7. Post-compile: the walkthrough (recognition check), then gap mining (the tightening loop).
  if (s.artifacts.includes("story.md") && !s.session.answers.some((a) => a.kind === "other")) {
    return {
      kind: "walkthrough",
      headline: "Read the walkthrough and confirm it matches your business",
      command: cmd(id, "show <id>"),
      because: "A day-in-the-life story catches what lists miss; the confirm items point at the assumptions most worth a second look.",
      alternatives: alt(A.gaps, A.review),
    };
  }
  // 8. The spec is current and the owner has never corrected it. This is the moment the whole flow was for:
  // read the thing your coding agent will build from, and fix what reads wrong — on the Sheet, so it sticks.
  if (!s.refinements) {
    return {
      kind: "review_spec",
      headline: "Read the spec and correct anything that reads wrong",
      command: cmd(id, 'refine <id> "what reads wrong"'),
      because: "This is the document your coding agent builds from. A correction here lands on the Design Sheet, so it survives the next rebuild instead of being written over.",
      alternatives: alt(A.gaps, A.review),
    };
  }

  if (s.gapCount === undefined || s.gapCount > 0) {
    return {
      kind: "mine_gaps",
      headline: "Tighten the spec where it had to guess",
      command: cmd(id, "gaps <id>"),
      because: "The compiler marks every place it had to assume something; turning those into a few questions makes the next spec sharper.",
      alternatives: alt(A.review, A.checks),
    };
  }

  return {
    kind: "done",
    headline: "You're done — hand the bundle to your coding agent",
    command: `open out/${id}/AGENTS.md`,
    because: "Every question is settled, the assumptions have been checked, and the spec is current with the Design Sheet.",
    alternatives: alt(A.gaps, A.edit),
  };
}

/** One-screen rendering for the CLI. */
export function formatNextAction(n: NextAction): string {
  const L = [`\n→ ${n.headline}`, `  ${n.because}`, "", `  ${n.command}`];
  if (n.alternatives.length) {
    L.push("", "  or:");
    for (const a of n.alternatives) L.push(`    ${a.headline.padEnd(46)} ${a.command}`);
  }
  return L.join("\n");
}
