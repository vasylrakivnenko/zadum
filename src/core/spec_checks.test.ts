import { describe, it, expect } from "vitest";
import { checkSpec, splitSections, formatSpecFindings, checkLifecycleStatesAgainstEnums, type SpecFinding } from "./spec_checks.js";
import { SheetSchema, type Sheet } from "./sheet.js";

/** Minimal Sheet; every list defaults to empty, so each test declares only what its check reads. */
function sheetOf(over: Partial<Sheet> = {}): Sheet {
  return SheetSchema.parse({ project_id: "t1", version: 1, one_liner: "test app", ...over });
}

function decision(id: string, over: Partial<Sheet["decisions"][number]> = {}): Sheet["decisions"][number] {
  return {
    id,
    topic: id,
    question: `What about ${id}?`,
    options: [{ id: "yes", label: "Yes" }, { id: "no", label: "No" }],
    chosen: "yes",
    status: "resolved",
    consequence: 3,
    source: "card:c1",
    ...over,
  } as Sheet["decisions"][number];
}

const of = (code: string) => (fs: SpecFinding[]) => fs.filter((f) => f.code === code);
const run = (spec: string, sheet: Sheet = sheetOf(), traces?: Parameters<typeof checkSpec>[2]) => checkSpec(spec, sheet, traces);

describe("splitSections", () => {
  it("splits at every heading, keeps the heading out of the body, and records the ancestor path", () => {
    const s = splitSections(["preamble line", "", "# Title", "intro", "## A", "body a", "### A1", "body a1", "## B", "body b"].join("\n"));
    expect(s.map((x) => x.heading)).toEqual(["", "Title", "A", "A1", "B"]);
    expect(s.map((x) => x.level)).toEqual([0, 1, 2, 3, 2]);
    expect(s[0]!.body).toBe("preamble line\n");
    expect(s[2]!.body.trim()).toBe("body a");
    expect(s[2]!.body).not.toContain("## A");
    expect(s[3]!.path).toEqual(["Title", "A", "A1"]);
    expect(s[4]!.path).toEqual(["Title", "B"]);
    expect(s[1]!.line).toBe(3);
  });

  it("ignores headings inside fenced code blocks", () => {
    const s = splitSections(["# Title", "```md", "## Not a heading", "```", "## Real"].join("\n"));
    expect(s.map((x) => x.heading)).toEqual(["", "Title", "Real"]);
  });
});

// -- 1. untraced_decision -----------------------------------------------------------------------

describe("untraced_decision", () => {
  const sheet = sheetOf({
    decisions: [
      decision("record_views", { status: "resolved", chosen: "saved_custom_views" }),
      decision("localization", { status: "defaulted", consequence: 3 }),
      decision("record_templates", { status: "defaulted", consequence: 1 }),
      decision("still_open", { status: "open", chosen: undefined }),
    ],
  });

  const spec = [
    "# Spec",
    "",
    "## Key journeys",
    "",
    "## 2. Reviewing records",
    "1. Manager opens the list. ⟨src: a5⟩",
    "",
    "## Non-goals & defaulted decisions",
    "",
    "| Decision | Chosen | Reference |",
    "|---|---|---|",
    "| Record Views | saved_custom_views | d:record_views |",
    "| Localization | single_locale | d:localization |",
    "| Record Templates | none | d:record_templates |",
    "",
    "## Decision ledger (complete)",
    "",
    "| Decision | Answer |",
    "|---|---|",
    "| How do people look at records? ⟨src: d:record_views⟩ | Saved views |",
  ].join("\n");

  it("fires medium for a settled decision cited only in the decision tables", () => {
    const fs = of("untraced_decision")(run(spec, sheet));
    expect(fs.map((f) => `${f.severity}:${f.message.match(/"([^"]+)"/)![1]}`)).toEqual(["medium:record_views", "medium:localization"]);
    expect(fs[0]!.message).toContain("d:record_views");
    expect(fs[0]!.fix_hint).toMatch(/either implement it|re-open it/);
  });

  it("skips low-consequence defaults and decisions that are still open", () => {
    const messages = of("untraced_decision")(run(spec, sheet)).map((f) => f.message).join(" ");
    expect(messages).not.toContain("record_templates");
    expect(messages).not.toContain("still_open");
  });

  it("accepts all three citation syntaxes the compiler emits, including on a heading", () => {
    const cited = (marker: string) =>
      of("untraced_decision")(run(["# Spec", "", `## Journey ⟨src: ${marker}⟩`, "1. Manager opens the list."].join("\n"), sheetOf({ decisions: [decision("record_views")] })));
    expect(cited("d:record_views")).toEqual([]); // d:<id>
    expect(cited("n:n1, record_views")).toEqual([]); // bare <id>, alongside a noun ref
    expect(cited("record_views:saved_custom_views")).toEqual([]); // <id>:<option>
    expect(cited("a5, r4")).toHaveLength(1); // nothing that names the decision
  });

  it("matches ids whole, so a neighbouring decision never counts as coverage", () => {
    const sheetTwo = sheetOf({ decisions: [decision("record_views"), decision("record_search")] });
    const fs = of("untraced_decision")(run(["# Spec", "", "## Journey ⟨src: d:record_search⟩", "1. Manager filters the list."].join("\n"), sheetTwo));
    expect(fs).toHaveLength(1);
    expect(fs[0]!.message).toContain("record_views");
  });

  // The exclusion is structural: a decision TABLE never counts as coverage, but prose does — whatever
  // the heading above it says. A title-based rule swallowed the compiler's own
  // "Non-goals & defaulted decisions" section and hid properly cited lines written inside it.
  it("excludes decision-table rows, not sections whose heading merely says 'defaulted decisions'", () => {
    const sheetOne = sheetOf({ decisions: [decision("integrations", { chosen: "some_key_ones" })] });
    const inTable = [
      "# Spec",
      "",
      "## Non-goals & defaulted decisions",
      "",
      "| Decision | Answer | How settled | Confidence |",
      "|---|---|---|---|",
      "| Does it need to connect to other tools? ⟨src: d:integrations⟩ | A few key ones | assumed | 89% |",
    ].join("\n");
    expect(of("untraced_decision")(run(inTable, sheetOne))).toHaveLength(1);

    const inProse = [
      "# Spec",
      "",
      "## Non-goals & defaulted decisions",
      "",
      "- Does it need to connect to other tools? — A few key ones (e.g., accounting, payments, calendar) ⟨src: d:integrations⟩",
    ].join("\n");
    expect(of("untraced_decision")(run(inProse, sheetOne))).toEqual([]);
  });

  it("treats a decision table as one wherever it sits, and leaves every other table alone", () => {
    const sheetOne = sheetOf({ decisions: [decision("record_views")] });
    const mixed = (header: string) => ["# Spec", "", "## Overview", "", "| " + header + " |", "|---|---|", "| Saved views ⟨src: d:record_views⟩ | ✓ |"].join("\n");
    expect(of("untraced_decision")(run(mixed("Decision | Answer"), sheetOne))).toHaveLength(1); // ledger shape anywhere
    expect(of("untraced_decision")(run(mixed("Action / Noun | Manager"), sheetOne))).toEqual([]); // a permissions matrix is a contract
  });

  it("names the section the compile trace claimed the decision fed", () => {
    const traces = {
      journeys: [{ anchor: "Reviewing records", sources: ["a5", "d:record_views"] }],
      non_goals_defaults: [{ anchor: "Table of Defaulted Decisions", sources: ["d:record_views", "d:localization"] }],
    };
    const fs = of("untraced_decision")(run(spec, sheet, traces));
    expect(fs[0]!.section).toBe("Reviewing records"); // the ledger trace key is not treated as coverage
    expect(fs[0]!.message).toContain("never reached the spec");
  });
});

// -- 1a. unknown_trace_id -----------------------------------------------------------------------

describe("unknown_trace_id", () => {
  const recurring = decision("recurring_scheduled", {
    question: "Must anything happen automatically on a schedule?",
    chosen: "recurring_records",
    options: [
      { id: "none", label: "No" },
      { id: "recurring_records", label: "Records get created automatically" },
    ],
  });
  const sheet1 = sheetOf({ decisions: [recurring] });

  it("names the decision when the spec cited its chosen option instead", () => {
    // The real drift: bogus markers grew 1 → 1 → 12 → 24 across four compiles of one project while the real
    // ones stayed pinned at 46, so the spec looked better traced as its citations became meaningless.
    const spec = ["# Spec", "", "## Overview", "", "New periods are opened on a schedule. ⟨src: d:recurring_records⟩"].join("\n");
    const fs = of("unknown_trace_id")(run(spec, sheet1));
    expect(fs).toHaveLength(1);
    expect(fs[0]!.severity).toBe("medium");
    expect(fs[0]!.message).toContain('is the chosen OPTION of decision "recurring_scheduled"');
    expect(fs[0]!.fix_hint).toContain("⟨src: d:recurring_scheduled⟩");
  });

  it("reports an id that is nothing on the Sheet at all", () => {
    const spec = ["# Spec", "", "## Overview", "", "Something happens. ⟨src: d:made_up_node⟩"].join("\n");
    const fs = of("unknown_trace_id")(run(spec, sheet1));
    expect(fs).toHaveLength(1);
    expect(fs[0]!.message).toContain("no decision with that id exists");
  });

  it("is silent on a correct citation and on the other list prefixes", () => {
    const spec = ["# Spec", "", "## Overview", "", "Records are created on a schedule. ⟨src: d:recurring_scheduled, n:n1, r:r1, p:p1, a:a1, g:g1⟩"].join("\n");
    expect(of("unknown_trace_id")(run(spec, sheet1))).toEqual([]);
  });

  // A bogus marker must not silence untraced_decision: the decision really is uncited.
  it("leaves the decision itself reported as untraced", () => {
    const spec = ["# Spec", "", "## Overview", "", "New periods are opened on a schedule. ⟨src: d:recurring_records⟩"].join("\n");
    expect(of("untraced_decision")(run(spec, sheetOf({ decisions: [{ ...recurring, status: "resolved" as const }] })))).toHaveLength(1);
  });
});

// -- 1b. unimplemented_decision -----------------------------------------------------------------

describe("unimplemented_decision", () => {
  const views = decision("record_views", {
    question: "How do people look at their records?",
    chosen: "saved_custom_views",
    options: [
      { id: "list_only", label: "A sortable, filterable list/table" },
      { id: "list_and_board", label: "List plus a board (cards in columns by stage)" },
      { id: "saved_custom_views", label: "All of the above, with saved personal and shared views" },
    ],
  });

  it("fires high when the words that distinguish the chosen answer appear nowhere in the spec", () => {
    const spec = ["# Spec", "", "## Key journeys ⟨src: d:record_views⟩", "", "1. Manager opens a sortable, filterable list of records."].join("\n");
    const fs = of("unimplemented_decision")(run(spec, sheetOf({ decisions: [views] })));
    expect(fs).toHaveLength(1);
    expect(fs[0]!.severity).toBe("high");
    expect(fs[0]!.message).toContain('"saved"');
    expect(fs[0]!.message).toContain("a claim, not an implementation");
    expect(fs[0]!.fix_hint).toContain("non-goals");
  });

  it("is silent once the answer has somewhere to live, and ignores words shared with the rival options", () => {
    const spec = [
      "# Spec",
      "",
      "## Data model",
      "",
      "## Saved View ⟨src: d:record_views⟩",
      "- **Scope**: Enum (\"personal\", \"shared\"), required",
      "",
      "## Key journeys",
      "1. Manager opens a saved view.",
    ].join("\n");
    expect(of("unimplemented_decision")(run(spec, sheetOf({ decisions: [views] })))).toEqual([]);
  });

  // The live mock run's false positive: the answer's words were written in a prose bullet, but the
  // heading above it said "defaulted decisions", so a title-based exclusion made them invisible.
  it("counts prose under a 'defaulted decisions' heading, and only discounts the decision table itself", () => {
    const integrations = decision("integrations", {
      question: "Does it need to connect to other tools?",
      chosen: "some_key_ones",
      options: [
        { id: "none", label: "No" },
        { id: "some_key_ones", label: "A few key ones (accounting, payments, calendar)" },
      ],
    });
    const sheetOne = sheetOf({ decisions: [integrations] });
    const head = ["# Spec", "", "## Non-goals & defaulted decisions", ""];
    const prose = [...head, "- Does it need to connect to other tools? — A few key ones (e.g., accounting, payments, calendar) ⟨src: d:integrations⟩"].join("\n");
    expect(of("unimplemented_decision")(run(prose, sheetOne))).toEqual([]);

    const table = [...head, "| Decision | Answer |", "|---|---|", "| Connect to other tools? | A few key ones (accounting, payments, calendar) |"].join("\n");
    const fs = of("unimplemented_decision")(run(table, sheetOne));
    expect(fs).toHaveLength(1);
    expect(fs[0]!.message).toContain('"calendar"');
  });

  // The reason the gate is not a word count. On the real artifact `record_views` had 3 of its 4 distinctive
  // words "present" — on "the change is saved", "shared pool" and "user views the report", none of which is
  // a saved view. Word membership is only a prefilter; the verdict comes from matching against prose.
  const reporting = decision("reporting", {
    question: "What do people need to see across many records?",
    chosen: "basic_dashboard",
    options: [
      { id: "list_only", label: "Nothing beyond the list itself" },
      { id: "basic_dashboard", label: "A dashboard with totals and counts" },
    ],
  });
  const withProse = (...lines: string[]) => ["# Spec", "", "## Overview ⟨src: d:reporting⟩", "", ...lines].join("\n");

  it("does not gate when the spec says the same thing in different words", () => {
    // One distinctive word of three is missing ("counts"), but the answer plainly has somewhere to live.
    const fs = run(withProse("This is a web-based internal dashboard for the finance team, showing totals for the chosen period."), sheetOf({ decisions: [reporting] }));
    expect(fs.filter((f) => /implemented_decision/.test(f.code))).toEqual([]);
  });

  it("reports a loosely-covered answer as medium, never as a gating finding", () => {
    const fs = run(
      withProse("Managers review the dashboard.", "Accountants upload the monthly spreadsheet and correct rejected rows."),
      sheetOf({ decisions: [reporting] }),
    ).filter((f) => /implemented_decision/.test(f.code));
    expect(fs).toHaveLength(1);
    expect(fs[0]!.code).toBe("partially_implemented_decision");
    expect(fs[0]!.severity).toBe("medium"); // must not gate a compile
    expect(fs[0]!.message).toContain('"counts"');
    expect(fs[0]!.message).toContain("nearest thing the spec says");
    expect(fs[0]!.fix_hint).toContain("reported rather than enforced");
  });

  it("still gates when no prose resembles the answer at all", () => {
    const fs = of("unimplemented_decision")(run(withProse("Accountants upload the monthly spreadsheet and correct any rejected rows."), sheetOf({ decisions: [reporting] })));
    expect(fs).toHaveLength(1);
    expect(fs[0]!.severity).toBe("high");
    expect(fs[0]!.message).toContain("no prose in the spec");
  });

  it.each([["No assignments"], ["Nobody — people check the app"], ["None of the above"], ["Never notify anyone"]])(
    "treats %j as an answer that removes scope, not one to look for in the spec",
    (label) => {
      const d = decision("record_watchers", {
        question: "Who gets told when a record changes?",
        chosen: "off",
        options: [
          { id: "off", label },
          { id: "subscribers", label: "Anyone who follows the record, with per-record subscriptions" },
        ],
      });
      const spec = ["# Spec", "", "## Overview", "", "Accountants upload the monthly spreadsheet and correct rejected rows."].join("\n");
      expect(run(spec, sheetOf({ decisions: [d] })).filter((f) => /implemented_decision/.test(f.code))).toEqual([]);
    },
  );

  it("never fires for an answer that only removes scope, or for a decision the user did not settle", () => {
    const negative = decision("customization", {
      chosen: "fixed",
      options: [
        { id: "fixed", label: "No — everyone gets the same thing" },
        { id: "branding_templates", label: "Branding and templates (logo, colors, wording)" },
      ],
    });
    const defaulted = { ...views, id: "record_views_default", status: "defaulted" as const };
    const spec = "# Spec\n\n## Overview\n\nAn internal dashboard.";
    expect(of("unimplemented_decision")(run(spec, sheetOf({ decisions: [negative, defaulted] })))).toEqual([]);
  });
});

// -- regressions from the live compile that motivated this file ---------------------------------

describe("live compile f9280b97 (spec.md v12)", () => {
  const sheet = sheetOf({
    decisions: [
      decision("recurring_scheduled", {
        question: "Must anything happen automatically on a schedule?",
        chosen: "recurring_records",
        options: [
          { id: "none", label: "No" },
          { id: "reminders_only", label: "Only reminders/notifications" },
          { id: "recurring_records", label: "Records get created automatically (recurring invoices, appointments, reports)" },
        ],
      }),
      decision("record_views", {
        question: "How do people look at their records?",
        chosen: "saved_custom_views",
        options: [
          { id: "list_only", label: "A sortable, filterable list/table" },
          { id: "list_board_calendar", label: "List, board, and calendar/timeline" },
          { id: "saved_custom_views", label: "All of the above, with saved personal and shared views" },
        ],
      }),
      decision("record_assignment", {
        question: "Are records assigned to people with deadlines?",
        chosen: "multi_assignee_watchers",
        options: [
          { id: "none", label: "No assignments" },
          { id: "single_assignee_due", label: "One assignee and an optional due date" },
          { id: "multi_assignee_watchers", label: "Several assignees plus watchers, with due dates and reminders" },
        ],
      }),
      decision("x5", {
        question: "How are time zones and DST applied to dates in financial records and reports?",
        chosen: "org_timezone",
        options: [
          { id: "org_timezone", label: "Use organization/default timezone" },
          { id: "user_timezone", label: "Use each user's timezone" },
          { id: "utc_only", label: "Store/display everything in UTC" },
        ],
      }),
    ],
  });

  // Shapes lifted from the artifact: a heading-only d: citation, a bare id, an id:option pair, and a
  // decision that reaches nothing but the two decision tables.
  const spec = [
    "# Specification — internal dashboard",
    "",
    "## Key journeys",
    "",
    "## 2. Reviewing and Filtering Financial Records ⟨src: a5, d:record_views, d:record_search⟩",
    "1. Manager applies filters to the Financial Records list. ⟨src: a5⟩",
    "",
    "## Data model",
    "",
    "## Financial Record ⟨src: n:n1⟩",
    "- **Date**: Date, required. Stored in the organization/default timezone ⟨src: n:n1, x5⟩",
    "- **Assignees**: List of User IDs (multi-assignee), optional ⟨src: record_assignment:multi_assignee_watchers⟩",
    "- **Watchers**: List of User IDs, optional ⟨src: record_assignment:multi_assignee_watchers⟩",
    "",
    "## Rules & invariants",
    "",
    "**Rule:** A Financial Record supports several assignees and watchers; due dates and reminders are tracked. ⟨src: record_assignment:multi_assignee_watchers⟩",
    "",
    "## Non-goals & defaulted decisions",
    "",
    "| Decision | Chosen | Reference |",
    "|---|---|---|",
    "| Recurring/Scheduled | recurring_records | d:recurring_scheduled |",
    "| Record Views | saved_custom_views | d:record_views |",
    "",
    "## Decision ledger (complete)",
    "",
    "| Decision | Answer |",
    "|---|---|",
    "| Must anything happen automatically on a schedule? ⟨src: d:recurring_scheduled⟩ | Records get created automatically |",
  ].join("\n");

  const untraced = () => of("untraced_decision")(run(spec, sheet)).map((f) => f.message);
  const unimplemented = () => of("unimplemented_decision")(run(spec, sheet)).map((f) => f.message);

  it("recurring_scheduled: reaches only the two decision tables — untraced (medium) AND unimplemented (high)", () => {
    expect(untraced().filter((m) => m.includes("recurring_scheduled"))).toHaveLength(1);
    const fs = of("unimplemented_decision")(run(spec, sheet)).filter((f) => f.message.includes("schedule"));
    expect(fs).toHaveLength(1);
    expect(fs[0]!.severity).toBe("high");
    expect(fs[0]!.message).toContain('"recurring"');
  });

  it("record_views: cited on a journey HEADING, so it is traced — but nothing implements it", () => {
    expect(untraced().filter((m) => m.includes("record_views"))).toEqual([]);
    expect(unimplemented().filter((m) => m.includes("look at their records"))).toHaveLength(1);
  });

  it("record_assignment: the id:option citation counts, and assignees/watchers/reminders are all present", () => {
    expect(untraced().filter((m) => m.includes("record_assignment"))).toEqual([]);
    expect(unimplemented().filter((m) => m.includes("assigned to people"))).toEqual([]);
  });

  it("x5: a bare id inside ⟨src: n:n1, x5⟩ counts, and the timezone answer is implemented", () => {
    expect(untraced().filter((m) => m.includes('"x5"'))).toEqual([]);
    expect(unimplemented().filter((m) => m.includes("time zones"))).toEqual([]);
  });
});

// -- 2. duplicate_heading -----------------------------------------------------------------------

describe("duplicate_heading", () => {
  it("fires low on a repeated heading, an assembler/model pair, and a stray h1", () => {
    const spec = [
      "# Specification — dashboard",
      "",
      "## Overview",
      "",
      "## Overview",
      "text",
      "## Data model",
      "",
      "# Data Model",
      "fields",
      "## Actors & permissions",
      "",
      "## Actors × Permissions Matrix",
      "rows",
      "# Notifications",
      "notes",
    ].join("\n");
    const fs = of("duplicate_heading")(run(spec));
    expect(fs.every((f) => f.severity === "low")).toBe(true);
    expect(fs.map((f) => f.section)).toEqual(["Overview", "Data Model", "Actors × Permissions Matrix", "Notifications"]);
    expect(fs[1]!.message).toContain("Data model");
    expect(fs[2]!.message).toContain("restates the heading immediately above");
    expect(fs[3]!.message).toContain("h1 heading");
  });

  it("is silent on distinct headings and on an entity name reused under a different parent", () => {
    const spec = [
      "# Specification",
      "",
      "## Data model",
      "",
      "### Invoice",
      "fields",
      "## Lifecycles",
      "",
      "### Invoice",
      "states",
      "## Glossary",
      "terms",
    ].join("\n");
    expect(of("duplicate_heading")(run(spec))).toEqual([]);
  });
});

// -- 3. prose_in_table_cell ---------------------------------------------------------------------

describe("prose_in_table_cell", () => {
  const matrix = (verdict: string) =>
    ["# Spec", "", "## Actors & permissions", "", "| Action | Manager | Accountant |", "|---|:--:|:--:|", `| Create Category | ${verdict} | ✗ |`].join("\n");

  it("fires medium on an over-long cell and on a cell holding a second sentence", () => {
    const long = of("prose_in_table_cell")(run(matrix("single approver: Accountants may propose, but Manager must approve creation [per r4]")));
    expect(long).toHaveLength(1);
    expect(long[0]!.severity).toBe("medium");
    expect(long[0]!.message).toContain("single approver: Accountants may propose");
    expect(long[0]!.fix_hint).toContain("footnote");

    const twoSentences = of("prose_in_table_cell")(run(matrix("✓ only. Manager approves.")));
    expect(twoSentences).toHaveLength(1);
    expect(twoSentences[0]!.message).toContain("a second sentence");
  });

  it("is silent on verdict cells and on a long cell inside a decision ledger", () => {
    expect(of("prose_in_table_cell")(run(matrix("✓ (see note 1)")))).toEqual([]);
    const ledger = [
      "# Spec",
      "",
      "## Decision ledger (complete)",
      "",
      "| Decision | Answer |",
      "|---|---|",
      "| Are records assigned to people with deadlines, and who gets told when one changes? | Several assignees plus watchers |",
    ].join("\n");
    expect(of("prose_in_table_cell")(run(ledger))).toEqual([]);
  });
});

// -- 4. enum_placeholder ------------------------------------------------------------------------

describe("enum_placeholder", () => {
  it("fires medium on an enum left open with etc., and on an option list left open with …", () => {
    const spec = [
      "# Spec",
      "",
      "## Data model",
      "",
      '- **Record Type**: Enum ("financial_record", "category", etc.), required ⟨src: default⟩',
      "- **Channel**: one of (email, sms, …)",
    ].join("\n");
    const fs = of("enum_placeholder")(run(spec));
    expect(fs).toHaveLength(2);
    expect(fs[0]!.severity).toBe("medium");
    expect(fs[0]!.message).toContain("Record Type");
    expect(fs[0]!.message).toContain("etc.");
    expect(fs[0]!.fix_hint).toContain("list every member");
  });

  it("is silent on a closed enum and on a parenthetical example that is not an enum", () => {
    const spec = [
      "# Spec",
      "",
      "## Data model",
      "",
      '- **Record Type**: Enum ("financial_record", "category"), required',
      "- **Filters**: JSON blob describing the filters and basis (e.g., category, user), required",
    ].join("\n");
    expect(of("enum_placeholder")(run(spec))).toEqual([]);
  });
});

// -- 5. untestable_assertion --------------------------------------------------------------------

describe("untestable_assertion", () => {
  const rules = (...lines: string[]) => ["# Spec", "", "## Rules & invariants", "", ...lines].join("\n");

  it("fires medium when a test alternates between outcomes", () => {
    const fs = of("untestable_assertion")(run(rules("**Test:** Create a duplicate id; ensure the second insert is rejected or auto-generated with a new UUID.")));
    expect(fs).toHaveLength(1);
    expect(fs[0]!.severity).toBe("medium");
    expect(fs[0]!.message).toContain("rejected or auto-generated");
  });

  it("fires when a matching criterion offers alternatives", () => {
    const fs = of("untestable_assertion")(run(rules("**Rule:** A new upload matching a previously-imported file (by file name, size, or content hash) is deduplicated.")));
    expect(fs).toHaveLength(1);
    expect(fs[0]!.message).toContain("by file name, size, or content hash");
  });

  it("fires on each hedge: unless policy, where feasible, unnamed approver, undefaulted configurable", () => {
    const fs = of("untestable_assertion")(
      run(
        rules(
          "**Rule:** Warn about likely duplicates, but don't block outright unless policy says so.",
          "**Rule:** Undo is allowed for recent (configurable window) changes; past that, only a full manual restore with approval.",
          "- Tests must be covered by integration and (where feasible) unit tests.",
        ),
      ),
    );
    expect(fs.map((f) => f.message.match(/hedges with "([^"]+)"/)![1])).toEqual(["unless policy", "with approval", "configurable", "where feasible"]);
    expect(fs.every((f) => f.severity === "medium")).toBe(true);
    expect(fs.find((f) => f.message.includes("with approval"))!.fix_hint).toContain("Name the approver");
  });

  it("is silent when the alternatives are inputs, the approver is named, and the default is stated", () => {
    const sheet = sheetOf({ actors: [{ id: "p1", name: "Manager", source: "draft" }] });
    const spec = rules(
      "**Test:** Try to import, create, or edit a record with a mandatory field blank — should fail with a validation error.",
      "**Test:** Attempt to alter or delete an audit entry — should fail.",
      "**Rule:** Undo is allowed within a configurable window (default 24 hours); past that, a restore needs approval from the Manager.",
      "**Rule:** Deduplication matches on the SHA-256 content hash.",
    );
    expect(of("untestable_assertion")(run(spec, sheet))).toEqual([]);
  });
});

// -- 6. missing_matrix_row ----------------------------------------------------------------------

describe("missing_matrix_row", () => {
  const sheet = sheetOf({
    actors: [
      { id: "p1", name: "Manager", source: "draft" },
      { id: "p2", name: "Accountant", source: "draft" },
    ],
    nouns: [
      { id: "n1", name: "Financial Record", fields_hint: [], source: "draft" },
      { id: "n4", name: "Upload Session", fields_hint: [], source: "draft" },
    ],
    actions: [
      { id: "a1", actor: "p2", verb: "uploads", object: "n4", source: "draft" },
      { id: "a3", actor: "p2", verb: "edits", object: "n1", source: "draft" },
    ],
  });

  const matrix = (...rows: string[]) => ["# Spec", "", "## Actors × Permissions Matrix", "", "| Action / Noun | Manager | Accountant |", "|---|:--:|:--:|", ...rows].join("\n");

  it("fires medium for a Sheet action with no row in the matrix", () => {
    const fs = of("missing_matrix_row")(run(matrix("| Upload Upload Session (a1 on n4) | ✗ | ✓ |"), sheet));
    expect(fs).toHaveLength(1);
    expect(fs[0]!.severity).toBe("medium");
    expect(fs[0]!.message).toContain("a3");
    expect(fs[0]!.message).toContain("Accountant edits Financial Record");
    expect(fs[0]!.fix_hint).toContain("permission contract");
  });

  it("reports once when the spec has no matrix at all", () => {
    const fs = of("missing_matrix_row")(run("# Spec\n\n## Overview\n\ntext", sheet));
    expect(fs).toHaveLength(1);
    expect(fs[0]!.message).toContain("no actors × permissions table");
  });

  it("is silent when every action has a row, tolerating case and plurals", () => {
    const fs = of("missing_matrix_row")(run(matrix("| Uploading an Upload Session (a1) | ✗ | ✓ |", "| Edit Financial Records (a3 on n1) | ✗ | ✓ |"), sheet));
    expect(fs).toEqual([]);
  });
});

// -- 7. computed_field_without_formula ----------------------------------------------------------

describe("computed_field_without_formula", () => {
  const model = (...fields: string[]) => ["# Spec", "", "# Data Model", "", "## Summary Report ⟨src: n:n2⟩", "", ...fields].join("\n");

  it("fires high once per entity block, naming every unexplained field in it", () => {
    const fs = of("computed_field_without_formula")(
      run(model("- **Date Range**: Start date, End date, required", "- **Total Income**: Decimal, required", "- **Net Profit**: Decimal, required ⟨src: n:n2⟩")),
    );
    expect(fs).toHaveLength(1); // one defect, not one per field
    expect(fs[0]!.severity).toBe("high");
    expect(fs[0]!.message).toContain('"Total Income", "Net Profit"');
    expect(fs[0]!.message).not.toContain("Date Range");
    expect(fs[0]!.section).toBe("Summary Report");
    expect(fs[0]!.fix_hint).toMatch(/formula and the sign convention/);
  });

  it("reports each entity block separately", () => {
    const spec = ["# Spec", "", "# Data Model", "", "## Summary Report", "", "- **Net Profit**: Decimal, required", "", "## Ledger Line", "", "- **Balance**: Decimal, required"].join("\n");
    const fs = of("computed_field_without_formula")(run(spec));
    expect(fs.map((f) => f.section)).toEqual(["Summary Report", "Ledger Line"]);
    expect(fs[0]!.message).toContain("computed field \"Net Profit\"");
  });

  it("is silent when the entity block states the formula, and outside the data model", () => {
    const withFormula = model(
      "- **Total Income**: Decimal, required — Total Income = Σ Amount over records whose Category.Type is income",
      "- **Net Profit**: Decimal, required — Net Profit = Total Income − Total Expenses (expenses stored positive)",
    );
    expect(of("computed_field_without_formula")(run(withFormula))).toEqual([]);
    const prose = ["# Spec", "", "## Overview", "", "- **Net Profit**: the number the owner cares about"].join("\n");
    expect(of("computed_field_without_formula")(run(prose))).toEqual([]);
  });
});

// -- 8. missing_import_contract -----------------------------------------------------------------

describe("missing_import_contract", () => {
  const importSheet = sheetOf({
    decisions: [decision("data_import", { status: "defaulted", chosen: "import_spreadsheet", options: [{ id: "import_spreadsheet", label: "Import from a spreadsheet/CSV once" }] })],
    nouns: [{ id: "n4", name: "Upload Session", fields_hint: ["Date/time", "User", "File name"], source: "draft" }],
  });

  const spec = (...lines: string[]) => ["# Spec", "", "## Key journeys", "", ...lines].join("\n");

  it("fires high when the Sheet imports spreadsheets and the spec never says what a valid file is", () => {
    const fs = of("missing_import_contract")(run(spec('1. The Accountant uploads an Excel file (e.g. "Q2_financials.xlsx").', "2. Rows are parsed and stored."), importSheet));
    expect(fs).toHaveLength(1);
    expect(fs[0]!.severity).toBe("high");
    expect(fs[0]!.message).toContain("data_import");
    expect(fs[0]!.message).toContain("required headers");
    expect(fs[0]!.fix_hint).toContain("how a text column resolves");
  });

  it("is silent once the spec states an import contract", () => {
    const contract = spec(
      "Accepted files: .xlsx or .csv, UTF-8 encoded, comma delimiter, first worksheet only.",
      "Required headers: Date, Category, Amount, Description — one column each.",
      "Date format is ISO-8601; Amount uses a decimal point and no thousands separator.",
      "The Category text column resolves to an existing Category by exact name; unmatched rows are rejected.",
      "The uploaded file is retained for one year.",
    );
    expect(of("missing_import_contract")(run(contract, importSheet))).toEqual([]);
  });

  it("is silent when nothing on the Sheet calls for a file import", () => {
    const noImport = sheetOf({
      decisions: [decision("data_import", { status: "defaulted", chosen: "start_empty", options: [{ id: "start_empty", label: "Start from scratch" }] })],
      nouns: [{ id: "n1", name: "Invoice", fields_hint: ["Amount"], source: "draft" }],
    });
    expect(of("missing_import_contract")(run("# Spec\n\n## Overview\n\ntext", noImport))).toEqual([]);
  });
});

// -- ordering + formatting ----------------------------------------------------------------------

describe("checkSpec", () => {
  it("sorts high → medium → low, then by code", () => {
    const sheet = sheetOf({
      decisions: [decision("record_views", { status: "resolved" })],
      nouns: [{ id: "n2", name: "Summary Report", fields_hint: ["Net profit"], source: "draft" }],
    });
    const spec = [
      "# Spec",
      "",
      "## Overview",
      "",
      "## Overview",
      "",
      "# Data Model",
      "",
      "## Summary Report",
      "",
      "- **Net Profit**: Decimal, required",
      "",
      "## Rules",
      "",
      "**Rule:** Retention is configurable.",
    ].join("\n");
    const fs = run(spec, sheet);
    const sev = fs.map((f) => f.severity);
    expect(sev).toEqual([...sev].sort((a, b) => ({ high: 0, medium: 1, low: 2 })[a] - ({ high: 0, medium: 1, low: 2 })[b]));
    expect(fs[0]!.severity).toBe("high");
    expect(fs.at(-1)!.severity).toBe("low");
    const highs = fs.filter((f) => f.severity === "high").map((f) => f.code);
    expect(highs).toEqual([...highs].sort());
  });

  it("returns nothing for an empty spec and an empty Sheet", () => {
    expect(checkSpec("", sheetOf())).toEqual([]);
  });

  it("formats findings as one actionable line each", () => {
    const fs: SpecFinding[] = [{ code: "enum_placeholder", severity: "medium", section: "Data model", message: "m.", fix_hint: "f." }];
    expect(formatSpecFindings(fs)).toContain('- [medium] enum_placeholder in "Data model": m. Fix: f.');
    expect(formatSpecFindings([])).toBe("No structural findings.");
  });
});

describe("lifecycle_state_not_in_enum", () => {
  const spec = (body: string) => splitSections(body);

  const REAL_SHAPE = `## Data model

### Period ⟨src: n:n4⟩

| Field | Type | Required | Notes |
|---|---|---|---|
| id | UUID | yes | |
| status | enum(open, closed) | yes | Closed locks figures ⟨src: r:r4⟩ |

### User ⟨src: n:n9⟩

| Field | Type | Required | Notes |
|---|---|---|---|
| status | enum(invited, active) | yes | Invited by the Owner |

## Lifecycles (state machines)

Each Period starts in \`empty\` and moves through 3 states.

| From | To | Trigger |
|---|---|---|
| \`empty\` | \`open\` | first upload |
| \`open\` | \`closed\` | Owner closes |

Each User starts in \`invited\` and moves through 3 states.

| From | To | Trigger |
|---|---|---|
| \`invited\` | \`active\` | signs in |
| \`active\` | \`deactivated\` | Owner deactivates |
`;

  it("catches the two defects a live Opus spec actually shipped", () => {
    // Verbatim shape from scenario-results/excel-financials-baseline/spec.md, where an independent Opus judge
    // reported both as contradictions and the deterministic checks had missed them.
    const found = checkLifecycleStatesAgainstEnums(spec(REAL_SHAPE));
    expect(found).toHaveLength(2);
    expect(found.map((f) => f.severity)).toEqual(["high", "high"]);
    const msgs = found.map((f) => f.message).join(" | ");
    expect(msgs).toContain("`empty`");
    expect(msgs).toContain("enum(open, closed)");
    expect(msgs).toContain("`deactivated`");
    expect(msgs).toContain("enum(invited, active)");
  });

  it("says nothing when every lifecycle state has a home in the enum", () => {
    const clean = REAL_SHAPE.replace("enum(open, closed)", "enum(empty, open, closed)").replace("enum(invited, active)", "enum(invited, active, deactivated)");
    expect(checkLifecycleStatesAgainstEnums(spec(clean))).toEqual([]);
  });

  it("strips trace markers and parentheticals from the entity heading", () => {
    // The first version of this check scored ZERO on a spec with two real findings, because it stripped
    // parentheses but not the compiler's `⟨src: …⟩` markers, so no heading ever matched a lifecycle entity.
    // A 0-finding result on a known-bad input is the failure mode this test exists to prevent.
    const withMarkers = REAL_SHAPE.replace("### Period ⟨src: n:n4⟩", "### Period (calendar month) ⟨src: n:n4, d:x7⟩");
    expect(checkLifecycleStatesAgainstEnums(spec(withMarkers))).toHaveLength(2);
  });

  it("ignores an entity with no persisted status column", () => {
    const noStatus = `## Data model

### Snapshot ⟨src: n:n1⟩

| Field | Type | Required | Notes |
|---|---|---|---|
| id | UUID | yes | |

## Lifecycles

Each Snapshot starts in \`fresh\` and moves through 2 states.
`;
    expect(checkLifecycleStatesAgainstEnums(spec(noStatus))).toEqual([]);
  });

  it("does not mistake audit columns or literals for states", () => {
    const noisy = REAL_SHAPE.replace(
      "| \`active\` | \`deactivated\` | Owner deactivates |",
      "| \`active\` | \`active\` | sets \`archived_at\`, \`archived_by\`, \`null\`, \`true\` |",
    );
    const found = checkLifecycleStatesAgainstEnums(spec(noisy));
    // only the Period `empty` finding survives; none of the audit/literal tokens are reported as states
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain("`empty`");
  });

  it("handles the `Enum: a, b, c` syntax as well as `enum(a, b, c)`", () => {
    // The section writer is an LLM and is not consistent: one live spec used the paren form, another used the
    // colon form for the same field. Handling only one meant scoring 0 on a spec whose judge had just
    // reported two enum-vs-lifecycle contradictions — the defect was present, the parser was blind.
    const colon = `## Data model

### Monthly Financials ⟨src: n:n1⟩

| Field | Type | Required | Notes |
|---|---|---|---|
| status | Enum: draft, finalized, reviewed | yes | Lifecycle state ⟨src: r:r3⟩ |

## Lifecycles

Each Monthly Financials starts in \`draft\` and moves through 4 states.

| From | To | Trigger |
|---|---|---|
| \`draft\` | \`ready_to_close\` | lines present |
| \`reviewed\` | \`reopened\` | Owner reopens |
`;
    const found = checkLifecycleStatesAgainstEnums(splitSections(colon));
    expect(found).toHaveLength(1);
    expect(found[0]!.message).toContain("`ready_to_close`");
    expect(found[0]!.message).toContain("`reopened`");
    expect(found[0]!.severity).toBe("high");
  });

  it("ignores a spec with no enums at all rather than flagging everything", () => {
    expect(checkLifecycleStatesAgainstEnums(spec("## Lifecycles\n\nEach Thing starts in `new` and moves through 2 states.\n"))).toEqual([]);
  });
});
