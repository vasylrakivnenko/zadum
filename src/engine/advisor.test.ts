import { describe, it, expect } from "vitest";
import { nextAction, formatNextAction, type AdvisorSnapshot } from "./advisor.js";
import { emptySheet, type Sheet, type Decision } from "../core/sheet.js";
import type { SessionState, Phase } from "../core/session.js";
import { DEFAULT_SELECTOR_CONFIG } from "../core/selector.js";

const decision = (id: string, over: Partial<Decision> = {}): Decision => ({
  id,
  topic: id,
  question: `${id}?`,
  options: [
    { id: "a", label: "A" },
    { id: "b", label: "B" },
  ],
  status: "open",
  consequence: 3,
  source: "plan",
  ...over,
});

function snap(over: { phase?: Phase; decisions?: Decision[]; artifacts?: string[]; version?: number; compiledVersion?: number; pendingAmendments?: number; gapCount?: number; refinements?: number; answers?: SessionState["answers"] } = {}): AdvisorSnapshot {
  const sheet: Sheet = { ...emptySheet("p1", "an invoicing app"), version: over.version ?? 2, decisions: over.decisions ?? [] };
  const session = {
    project_id: "p1",
    phase: over.phase ?? "correcting",
    config: DEFAULT_SELECTOR_CONFIG,
    belief: { nodes: [], worlds: [], alpha: 0.08 },
    cards: [],
    answers: over.answers ?? [],
    precomputed: {},
    consequence_override: {},
    history: [],
    resample_count: 0,
    versions: { catalog: "c", prompts: "p", models: { strong: "s", fast: "f" } },
    created_at: "t",
    updated_at: "t",
  } as SessionState;
  return {
    sheet,
    session,
    artifacts: over.artifacts ?? [],
    ...(over.compiledVersion !== undefined ? { compiledVersion: over.compiledVersion } : {}),
    ...(over.pendingAmendments !== undefined ? { pendingAmendments: over.pendingAmendments } : {}),
    ...(over.gapCount !== undefined ? { gapCount: over.gapCount } : {}),
    ...(over.refinements !== undefined ? { refinements: over.refinements } : {}),
  };
}

describe("advisor — the guided flow", () => {
  it("opens at the correction moment on a fresh draft", () => {
    const n = nextAction(snap({ phase: "correcting", decisions: [decision("d1")] }));
    expect(n.kind).toBe("correct_draft");
    expect(n.command).toContain("edit p1");
    expect(n.because.length).toBeGreaterThan(20); // a guided flow owes the user a reason
  });

  it("recommends cards while questions are open, counting them", () => {
    const n = nextAction(snap({ phase: "cards", decisions: [decision("d1"), decision("d2"), decision("d3", { status: "resolved", chosen: "a" })] }));
    expect(n.kind).toBe("answer_cards");
    expect(n.headline).toContain("2 questions");
  });

  it("prefers story checks over the itemized review when assumptions are shaky", () => {
    const n = nextAction(snap({ phase: "cards", decisions: [decision("d1", { status: "defaulted", chosen: "a", confidence: 0.4 })] }));
    expect(n.kind).toBe("story_checks");
    expect(n.alternatives.map((a) => a.kind)).toContain("review_defaults");
  });

  it("respects an explicit accept: after acceptDefaults it builds, it does not loop back to checks", () => {
    // Regression: `accept` sets phase=compiling, but the risky-assumption rule fired first and pushed the
    // user back into the checks they had just dismissed.
    const n = nextAction(snap({ phase: "compiling", decisions: [decision("d1", { status: "defaulted", chosen: "a", confidence: 0.3 })] }));
    expect(n.kind).toBe("compile");
  });

  it("flags a stale spec ahead of anything else post-compile", () => {
    const n = nextAction(snap({ phase: "done", artifacts: ["spec.md", "story.md"], version: 9, compiledVersion: 6, decisions: [] }));
    expect(n.kind).toBe("recompile");
    expect(n.because).toContain("v9");
    expect(n.because).toContain("v6");
  });

  it("puts a coding agent's pending amendment above everything — it is blocking someone else", () => {
    const n = nextAction(snap({ phase: "cards", pendingAmendments: 2, decisions: [decision("d1")] }));
    expect(n.kind).toBe("review_amendments");
    expect(n.headline).toContain("2 changes");
    expect(n.command).toContain("amendments_cli");
  });

  it("ends at done when everything is settled, current, mined, and the spec has been looked at", () => {
    const n = nextAction(snap({ phase: "done", artifacts: ["spec.md"], version: 5, compiledVersion: 5, gapCount: 0, refinements: 1, answers: [{ card_id: "c1", node_id: "n1", kind: "other", at: "t" }] }));
    expect(n.kind).toBe("done");
  });

  it("sends the owner to read the compiled spec before calling it done", () => {
    // The spec is what the coding agent builds from; a correction there lands on the Sheet and survives the
    // next compile, so "never read it" must not be a state the guided flow walks past.
    const base = { phase: "done" as const, artifacts: ["spec.md"], version: 5, compiledVersion: 5, gapCount: 0, answers: [{ card_id: "c1", node_id: "n1", kind: "other" as const, at: "t" }] };
    const unread = nextAction(snap(base));
    expect(unread.kind).toBe("review_spec");
    expect(unread.command).toContain("refine");
    // a stale spec still outranks it — never review a document the design has moved past
    expect(nextAction(snap({ ...base, version: 6 })).kind).toBe("recompile");
    // and once corrected, the flow moves on
    expect(nextAction(snap({ ...base, refinements: 1, gapCount: 2 })).kind).toBe("mine_gaps");
  });

  it("never recommends more than three alternatives, and renders one screen", () => {
    const n = nextAction(snap({ phase: "cards", decisions: [decision("d1")] }));
    expect(n.alternatives.length).toBeLessThanOrEqual(3);
    const text = formatNextAction(n);
    expect(text).toContain(n.headline);
    expect(text).toContain(n.command);
    expect(text.split("\n").length).toBeLessThan(12);
  });
});
