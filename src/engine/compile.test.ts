/**
 * The deterministic half of the compile pipeline: what the assembler does to a section before it lands in
 * spec.md, and what counts as the Sheet having moved under a compile. Every case here is a defect that
 * actually shipped in the 2026-08-25 live compile of "internal dashboard based on our excel files".
 */
import { describe, expect, it } from "vitest";
import { blockingReasons, repairTargets, sectionBody, sheetFingerprint, stripDecisionTable } from "./compile.js";
import type { Sheet } from "../core/sheet.js";

function sheet(over: Partial<Sheet> = {}): Sheet {
  return {
    version: 1,
    one_liner: "an invoicing app for small bookkeeping firms",
    archetypes: ["b2b-invoicing"],
    actors: [{ id: "p1", name: "Bookkeeper", source: "draft" }],
    nouns: [{ id: "n1", name: "Invoice", fields_hint: ["Amount", "Due date"], source: "draft" }],
    actions: [{ id: "a1", actor: "p1", verb: "sends", object: "n1", source: "draft" }],
    rules: [{ id: "r1", text: "A sent invoice can never be edited.", kind: "state", source: "draft" }],
    non_goals: [{ id: "g1", text: "No payroll.", source: "draft" }],
    decisions: [
      { id: "deletion", topic: "deleting", question: "What happens on delete?", options: [{ id: "soft_delete", label: "It's archived and can be restored" }], chosen: "soft_delete", status: "defaulted", confidence: 0.95, consequence: 3 },
    ],
    ...over,
  } as Sheet;
}

describe("sectionBody", () => {
  // Seven heading pairs shipped in one live compile: the assembler writes "## Data model" and the model
  // opens with "# Data Model" of its own.
  it.each([
    ["Overview", "## Overview"],
    ["Data model", "# Data Model"],
    ["Rules & invariants", "# Rules and Invariants"],
    ["Non-goals", "# Non-Goals"],
    ["Key journeys", "# Key User Journeys"],
    ["Actors & permissions", "## Actors × Permissions Matrix"],
    ["Glossary", "## Glossary"],
  ])("drops the model's own heading for %s", (title, emitted) => {
    const out = sectionBody(title, `${emitted}\n\nThe body.`);
    expect(out).toBe("The body.");
  });

  it("keeps a heading that is not the section's own", () => {
    expect(sectionBody("Data model", "## Invoice\n\nFields…")).toBe("### Invoice\n\nFields…");
  });

  it("demotes stray h1/h2 to h3 so no section can outrank the document title", () => {
    const out = sectionBody("Data model", "# Data Model\n\n# Invoice\n\ntext\n\n## Client\n\nmore");
    expect(out).toBe("### Invoice\n\ntext\n\n### Client\n\nmore");
  });

  it("leaves headings inside fenced code alone", () => {
    const out = sectionBody("Overview", "## Overview\n\n```sh\n# not a heading\n```");
    expect(out).toBe("```sh\n# not a heading\n```");
  });

  it("is a no-op on a section that already emits body content", () => {
    expect(sectionBody("Overview", "Just prose.\n")).toBe("Just prose.");
  });
});

describe("stripDecisionTable", () => {
  // The model wrote a 50-row table headed "not explicitly discussed in the Design Sheet" that listed all
  // seven decisions the owner had personally answered. The real ledger is rendered by code, below.
  it("removes a model-written defaults table with its heading and lead-in", () => {
    const body = [
      "## Explicit Non-Goals",
      "",
      "- No payroll.",
      "",
      "## Table of Defaulted Decisions",
      "The following implementation choices were **not explicitly discussed** and have been defaulted as shown.",
      "",
      "| Decision | Chosen Option | Confidence |",
      "|---|---|---|",
      "| Identity Provider | magic_link | 100% |",
      "| Roles | owner_staff | 95% |",
    ].join("\n");
    const out = stripDecisionTable(body);
    expect(out).toContain("No payroll.");
    expect(out).not.toContain("magic_link");
    expect(out).not.toContain("Table of Defaulted Decisions");
    expect(out).not.toContain("not explicitly discussed");
    expect(out).toContain("rendered below");
  });

  it("leaves a table that is not a decision table", () => {
    const body = "| Action | Bookkeeper |\n|---|---|\n| Send invoice | ✓ |";
    expect(stripDecisionTable(body)).toBe(body);
  });
});

describe("sheetFingerprint", () => {
  it("ignores a confidence bump that changes no answer", () => {
    // The live regression: a background story check raised three confidences from 95% to 97%, the version
    // counter moved, and a good spec was stamped STALE — leaving the project stranded short of done.
    const before = sheet();
    const after = sheet({ version: 13, decisions: [{ ...before.decisions[0]!, confidence: 0.97 }] });
    expect(sheetFingerprint(after)).toBe(sheetFingerprint(before));
  });

  it("notices a changed answer, a changed status, and a crossed confirm-first bar", () => {
    const before = sheet();
    const answer = sheet({ decisions: [{ ...before.decisions[0]!, chosen: "hard_delete" }] });
    const status = sheet({ decisions: [{ ...before.decisions[0]!, status: "resolved" }] });
    // 0.95 → 0.7 crosses confirmBelow: the decision joins AGENTS.md's confirm-first list, so the bundle changes.
    const bar = sheet({ decisions: [{ ...before.decisions[0]!, confidence: 0.7 }] });
    expect(sheetFingerprint(answer)).not.toBe(sheetFingerprint(before));
    expect(sheetFingerprint(status)).not.toBe(sheetFingerprint(before));
    expect(sheetFingerprint(bar)).not.toBe(sheetFingerprint(before));
  });

  it("notices a changed rule, noun, action, actor or non-goal", () => {
    const before = sheetFingerprint(sheet());
    expect(sheetFingerprint(sheet({ rules: [{ id: "r1", text: "A sent invoice may be edited.", kind: "state", source: "draft" }] }))).not.toBe(before);
    expect(sheetFingerprint(sheet({ nouns: [{ id: "n1", name: "Invoice", fields_hint: ["Amount"], source: "draft" }] }))).not.toBe(before);
    expect(sheetFingerprint(sheet({ actions: [{ id: "a1", actor: "p1", verb: "voids", object: "n1", source: "draft" }] }))).not.toBe(before);
    expect(sheetFingerprint(sheet({ actors: [{ id: "p1", name: "Accountant", source: "draft" }] }))).not.toBe(before);
    expect(sheetFingerprint(sheet({ non_goals: [{ id: "g1", text: "No payroll or benefits.", source: "draft" }] }))).not.toBe(before);
  });

  it("is order-independent and ignores the version counter alone", () => {
    const a = sheet({ version: 12 });
    const b = sheet({ version: 99, rules: [...a.rules].reverse(), decisions: [...a.decisions].reverse() });
    expect(sheetFingerprint(b)).toBe(sheetFingerprint(a));
  });
});

describe("blockingReasons", () => {
  const pass = { verdict: "pass" as const, score: 10, violations: [], omissions: [] };
  const clean = { critic: pass, findings: [], roundtrip: null, stale: false, open: 0, conflicts: [] };

  it("lets a clean compile through", () => {
    expect(blockingReasons(clean)).toEqual([]);
  });

  it("blocks on a high mechanical finding even when the critic says pass", () => {
    // The live failure this exists for: critic verdict "pass", score 10, zero violations, on a spec with six
    // contradictions between the Sheet's own inviolable Rules. An LLM verdict cannot be the only gate.
    const reasons = blockingReasons({ ...clean, findings: [{ code: "terminal_with_escape_prose", severity: "high", message: "m", fix_hint: "f" }] });
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toContain("terminal_with_escape_prose");
  });

  it("ignores medium and low findings", () => {
    expect(blockingReasons({ ...clean, findings: [{ code: "x", severity: "medium", message: "m", fix_hint: "f" }, { code: "y", severity: "low", message: "m", fix_hint: "f" }] })).toEqual([]);
  });

  it("blocks a spec that does not round-trip back to its own Sheet", () => {
    const rt = { recall: { actors: 1, nouns: 1, actions: 1, rules: 0.2, non_goals: 0, overall: 0.56 }, missing: [], extra: [] };
    expect(blockingReasons({ ...clean, roundtrip: rt })[0]).toMatch(/56% recall/);
    expect(blockingReasons({ ...clean, roundtrip: { ...rt, recall: { ...rt.recall, overall: 0.95 } } })).toEqual([]);
  });

  it("names every reason, so the banner can state all of them", () => {
    expect(
      blockingReasons({
        critic: { ...pass, verdict: "fail" as const, score: 3 },
        findings: [{ code: "c", severity: "high", message: "m", fix_hint: "f" }],
        roundtrip: null,
        stale: true,
        open: 2,
        conflicts: [{ node: "a", have: "x", want: "y", because: "b=c" }],
      }),
    ).toHaveLength(5);
  });
});

describe("repairTargets", () => {
  it("maps findings back to the sections a repair round should re-run", () => {
    expect(repairTargets([{ code: "c", severity: "high", message: "m", fix_hint: "f", machine: "Invoice" }])).toEqual(["state_machines"]);
    expect(repairTargets([{ code: "c", severity: "high", message: "m", fix_hint: "f", section: "data_model" }])).toEqual(["data_model"]);
    expect(repairTargets([{ code: "c", severity: "high", message: "m", fix_hint: "f", section: "## Actors & permissions" }])).toEqual(["actors_permissions"]);
  });

  it("returns each section once, in document order, and ignores what it cannot place", () => {
    expect(
      repairTargets([
        { code: "a", severity: "high", message: "m", fix_hint: "f", section: "glossary" },
        { code: "b", severity: "high", message: "m", fix_hint: "f", section: "overview" },
        { code: "c", severity: "high", message: "m", fix_hint: "f", section: "overview" },
        { code: "d", severity: "high", message: "m", fix_hint: "f", section: "nowhere at all" },
      ]),
    ).toEqual(["overview", "glossary"]);
  });
});
