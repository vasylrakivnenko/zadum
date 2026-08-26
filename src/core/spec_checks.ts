/**
 * Deterministic spec checks — the gate that runs BEFORE (and independently of) the LLM critic.
 *
 * A live compile once scored a 51KB spec 10/10 with zero violations while the spec duplicated seven
 * headings, shipped an enum ending in "etc.", never defined the formula for its single most important
 * number, never said what a valid import file looks like, and cited two decisions the user had personally
 * answered without implementing either. Every check below is calibrated against one of those real defects.
 *
 * `high` findings gate delivery in src/engine/compile.ts, so untraced_decision (a missing citation —
 * bookkeeping) is medium, while unimplemented_decision (a settled answer with nothing in the spec that
 * could satisfy it) is high.
 *
 * Pure and deterministic, per CLAUDE.md: no IO, no LLM, no clock, no randomness. Text + structure only.
 * Findings are sorted high → medium → low, then by code; generation order is document order, and the
 * sort is stable, so the output is byte-identical for identical input.
 */
import type { Sheet } from "./sheet.js";
import { bestMatch } from "./textmatch.js";

export interface SpecFinding {
  code: string;
  severity: "high" | "medium" | "low";
  /** Heading the finding sits under, when identifiable. */
  section?: string;
  /** Names the offender and quotes the evidence. */
  message: string;
  /** What to change. */
  fix_hint: string;
}

/** One heading and the text under it, up to the next heading. `index` 0 is the pre-heading preamble. */
export interface SpecSection {
  index: number;
  /** 1–6 for `#`–`######`; 0 for the preamble before the first heading. */
  level: number;
  /** Heading text with the `#`s stripped ("" for the preamble). */
  heading: string;
  /** Everything between this heading and the next one (the heading line itself is NOT included). */
  body: string;
  /** 1-based line number of the heading line (0 for the preamble). */
  line: number;
  /** Ancestor headings outermost-first, including this one — for scoping checks to a region. */
  path: string[];
}

const HEADING_RE = /^(#{1,6})[ \t]+(.*)$/;
const FENCE_RE = /^\s*(?:```|~~~)/;
/** Trace marker as the compiler emits it: `⟨src: d:record_views, r4, n:Category⟩`. */
const TRACE_MARKER_RE = /⟨[^⟩]*⟩/g;
const LEDGER_TRACE_KEY_RE = /ledger|default|non_?goals/i;
/** A header cell that marks a table as a decision table: `| Decision | Answer | How settled | Confidence |`. */
const DECISION_COLUMN_RE = /^(?:decisions?|confidence|how settled|settled)$/i;

/**
 * Split the spec into sections once; every check works off this (nothing re-scans the whole document).
 * Headings inside fenced code blocks are ignored. Exported because the compiler reuses it.
 */
export function splitSections(spec: string): SpecSection[] {
  const lines = spec.split(/\r?\n/);
  const sections: SpecSection[] = [];
  const stack: { level: number; heading: string }[] = [];
  let cur = { level: 0, heading: "", line: 0, path: [] as string[], body: [] as string[] };
  let fenced = false;

  const flush = () => {
    sections.push({ index: sections.length, level: cur.level, heading: cur.heading, body: cur.body.join("\n"), line: cur.line, path: cur.path });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (FENCE_RE.test(line)) fenced = !fenced;
    const m = fenced ? null : HEADING_RE.exec(line);
    if (!m) {
      cur.body.push(line);
      continue;
    }
    flush();
    const level = m[1]!.length;
    const heading = m[2]!.trim().replace(/\s+#+\s*$/, ""); // closed ATX: "## Title ##"
    while (stack.length && stack[stack.length - 1]!.level >= level) stack.pop();
    const path = [...stack.map((s) => s.heading), heading];
    stack.push({ level, heading });
    cur = { level, heading, line: i + 1, path, body: [] };
  }
  flush();
  return sections;
}

const SEV_ORDER: Record<SpecFinding["severity"], number> = { high: 0, medium: 1, low: 2 };

/**
 * Run every deterministic check over a compiled spec.
 *
 * `traces` (the compiler's per-section {anchor, sources[]} record) is used only to ENRICH findings —
 * it never grants coverage. A trace records what the compiler *meant* to derive a section from; the
 * gate cares about what the spec text actually depends on, and a decision that reached nothing but a
 * heading annotation has still been propagated nowhere.
 */
export function checkSpec(
  spec: string,
  sheet: Sheet,
  traces?: Record<string, { anchor: string; sources: string[] }[]>,
): SpecFinding[] {
  const sections = splitSections(spec);
  const findings: SpecFinding[] = [
    ...checkUntracedDecisions(sections, sheet, traces),
    ...checkUnknownTraceIds(sections, sheet),
    ...checkUnimplementedDecisions(sections, sheet),
    ...checkDuplicateHeadings(sections),
    ...checkProseInTableCells(sections),
    ...checkEnumPlaceholders(sections),
    ...checkUntestableAssertions(sections, sheet),
    ...checkMatrixRows(sections, sheet),
    ...checkComputedFields(sections),
    ...checkImportContract(spec, sheet),
    ...checkLifecycleStatesAgainstEnums(sections),
  ];
  return findings.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
}

// ---------------------------------------------------------------------------------------------------
// 1. untraced_decision — a settled decision the spec never cites. Advisory: a missing citation is a
//    bookkeeping failure, and the compiler writes citations in three syntaxes, so this is medium.
// ---------------------------------------------------------------------------------------------------

/** Prefixes of the OTHER Sheet lists (see LIST_PREFIX): `n:n1` is a noun, never a decision. */
const NON_DECISION_PREFIX_RE = /^[nrpga]:/;

/**
 * Decision ids cited anywhere outside the decision tables. The compiler emits three marker syntaxes,
 * all of which are real citations, and a marker on a section HEADING counts as much as one in the body:
 *   ⟨src: d:record_views⟩ · ⟨src: n:n1, x5⟩ · ⟨src: record_assignment:multi_assignee_watchers⟩
 * Ids are compared whole, so `record_search` never satisfies `record_views`.
 */
function citedDecisionIds(sections: SpecSection[]): Set<string> {
  const cited = new Set<string>();
  for (const s of sections) {
    for (const marker of withoutDecisionTables(`${s.heading}\n${s.body}`).matchAll(TRACE_MARKER_RE)) {
      for (const raw of marker[0].replace(/^⟨|⟩$/g, "").split(/[,;\s]+/)) {
        const token = raw.replace(/^src:/i, "").trim();
        if (token === "" || NON_DECISION_PREFIX_RE.test(token)) continue;
        const m = /^(?:d:)?([A-Za-z_][A-Za-z0-9_]*)(?::[A-Za-z0-9_]+)?$/.exec(token);
        if (m) cited.add(m[1]!);
      }
    }
  }
  return cited;
}

/**
 * A `d:` marker naming something that is not a decision on the Sheet.
 *
 * The compiler drifts into citing the chosen OPTION id instead of the decision id — `⟨src: d:recurring_records⟩`
 * where `recurring_scheduled` is the decision and `recurring_records` merely its answer. Measured across four
 * compiles of one project the real markers stayed pinned at 46 while the bogus ones went 1 → 1 → 12 → 24, so
 * the spec looked steadily better traced while its citations were becoming meaningless. It also hides the
 * decision: the body cites something, the decision itself reads as uncited, and `untraced_decision` fires.
 *
 * Advisory: a wrong citation degrades traceability without making the prose wrong.
 */
function checkUnknownTraceIds(sections: SpecSection[], sheet: Sheet): SpecFinding[] {
  const known = new Set(sheet.decisions.map((d) => d.id));
  if (!known.size) return [];
  // option id -> the decision it belongs to, so the fix can name the id that was meant
  const byOption = new Map<string, string>();
  for (const d of sheet.decisions) for (const o of d.options) if (!byOption.has(o.id)) byOption.set(o.id, d.id);

  // Only EXPLICIT `d:` citations. A bare id in a marker is ambiguous — `⟨src: a1, n2, x3⟩` mixes an action,
  // a noun and a decision — so a bare unknown token is not evidence of a wrong decision reference, while
  // `d:` is an unambiguous claim to name one.
  const cited = new Set<string>();
  for (const s2 of sections) {
    for (const marker of withoutDecisionTables(`${s2.heading}\n${s2.body}`).matchAll(TRACE_MARKER_RE)) {
      for (const raw of marker[0].replace(/^⟨|⟩$/g, "").split(/[,;\s]+/)) {
        const m = /^d:([A-Za-z_][A-Za-z0-9_]*)$/.exec(raw.replace(/^src:/i, "").trim());
        if (m) cited.add(m[1]!);
      }
    }
  }
  // Ids belonging to the Sheet's other lists: `d:n1` is a mislabelled noun, not an invented decision.
  const otherLists = new Set<string>([
    ...sheet.nouns.map((n) => n.id),
    ...sheet.actors.map((a) => a.id),
    ...sheet.actions.map((a) => a.id),
    ...sheet.rules.map((r) => r.id),
    ...sheet.non_goals.map((g) => g.id),
  ]);

  const findings: SpecFinding[] = [];
  for (const id of [...cited].sort()) {
    if (known.has(id) || otherLists.has(id)) continue;
    const owner = byOption.get(id);
    findings.push({
      code: "unknown_trace_id",
      severity: "medium",
      message: owner
        ? `the spec cites ⟨src: d:${id}⟩, but "${id}" is the chosen OPTION of decision "${owner}", not a decision id — so nothing in the ledger is actually traced by it.`
        : `the spec cites ⟨src: d:${id}⟩, but no decision with that id exists on the Sheet.`,
      fix_hint: owner
        ? `Write ⟨src: d:${owner}⟩. A trace marker names the decision; the option it settled on is already in the ledger.`
        : `Cite a decision that exists, or drop the marker. Every id in a ⟨src: …⟩ must come from the Sheet.`,
    });
  }
  return findings;
}

function checkUntracedDecisions(
  sections: SpecSection[],
  sheet: Sheet,
  traces?: Record<string, { anchor: string; sources: string[] }[]>,
): SpecFinding[] {
  // The ledger and the defaulted-decisions table list every decision by construction, so a mention
  // there can never be coverage.
  const cited = citedDecisionIds(sections);

  const findings: SpecFinding[] = [];
  for (const d of sheet.decisions) {
    const checked = d.status === "resolved" || (d.status === "defaulted" && d.consequence >= 3);
    if (!checked || cited.has(d.id)) continue;

    const claimed = claimedBy(traces, d.id);
    const answer = d.chosen ? ` as "${d.chosen}"` : "";
    const asked = d.question || d.topic;
    const claim = claimed ? ` The compile trace claims "${claimed}" derives from it, but that reference never reached the spec.` : "";
    findings.push({
      code: "untraced_decision",
      severity: "medium",
      section: claimed,
      message:
        `decision "${d.id}" is ${d.status}${answer} (${truncate(asked, 90)}) but nothing outside the decision tables cites it — ` +
        `no ⟨src: …⟩ marker names "${d.id}" in any form (d:${d.id}, ${d.id}, or ${d.id}:${d.chosen ?? "<option>"}).${claim}`,
      fix_hint:
        `This decision was settled but nothing in the spec depends on it — either implement it (state the behaviour it dictates ` +
        `on a rule, data-model field, matrix row or scenario, and mark that line ⟨src: d:${d.id}⟩) or re-open it.`,
    });
  }
  return findings;
}

// ---------------------------------------------------------------------------------------------------
// 1b. unimplemented_decision — the user personally answered, and the answer is nowhere in the spec.
//     A trace marker is a claim, not an implementation: the real compile cited d:record_views on two
//     journey headings while the spec contained no saved view, no personal view, nothing. Gating.
// ---------------------------------------------------------------------------------------------------

/** Function words and generic nouns/verbs that say nothing about WHICH option was chosen. */
const LABEL_STOPWORDS = new Set(
  ("a an the and or but of in on at to for with without by from as into per via plus each every all any both this that these those it its their they you your we our" +
    " is are be been was were do does done get gets got use used uses using make makes made have has had can may might must should will would need needs let lets" +
    " thing things way ways stuff item items other others same above below only just more most less new old one two three first second no none not never yes optional etc")
    .split(" "),
);

/**
 * An answer that removes scope rather than adding any. There is no content it could have put in the spec,
 * so word presence can prove nothing about it and its absence would be a false alarm every time.
 * "Nobody — people check the app" (record_watchers) reached the gate as a high finding before `nobody`
 * was here: the spec is *supposed* to say nothing about notifying watchers.
 */
const NEGATIVE_LABEL_RE = /^\s*(?:no|none|never|not|nothing|nobody|no-one|no one|nowhere)\b/i;

function checkUnimplementedDecisions(sections: SpecSection[], sheet: Sheet): SpecFinding[] {
  const body = bodyWordSet(sections);
  const chunks = bodyChunks(sections);
  const findings: SpecFinding[] = [];

  for (const d of sheet.decisions) {
    if (d.status !== "resolved" || !d.chosen) continue;
    const chosen = d.options.find((o) => o.id === d.chosen);
    const label = chosen?.label ?? "";
    // A "No" answer removes scope; there is no content it could have added, so word presence can't
    // verify it (and its absence would be a false alarm every time).
    if (label === "" || NEGATIVE_LABEL_RE.test(label) || /^(?:none|no)$/i.test(d.chosen)) continue;

    // What makes THIS answer different from the ones the user did not pick.
    const rivals = new Set<string>();
    for (const o of d.options) if (o.id !== d.chosen) for (const w of contentWords(o.label)) rivals.add(w);
    const distinctive = [...new Set(contentWords(label))].filter((w) => !hasWord(rivals, w));
    if (distinctive.length === 0) continue;

    // Word membership is only the prefilter. It is noisy in BOTH directions: on the live artifact
    // `record_views` ("saved personal and shared views") scored 3 of its 4 words present on three unrelated
    // usages — "the change is saved", "shared pool", "user views the report" — so counting missing words
    // cannot say whether the answer was implemented. Nothing missing still means nothing to report.
    const missing = distinctive.filter((w) => !hasWord(body, w));
    if (missing.length === 0) continue;

    // The verdict comes from the calibrated paraphrase matcher: is there any PROSE in the spec that reads
    // like this answer? See UNIMPLEMENTED_* for how the two bands were chosen.
    const near = bestMatch(label, chunks, { threshold: 0 });
    const score = near?.score ?? 0;
    if (score >= UNIMPLEMENTED_PARTIAL) continue;
    const gating = score < UNIMPLEMENTED_ABSENT;
    const nearest = near && score > 0 ? ` The nearest thing the spec says is "${truncate(chunks[near.index] ?? "", 90)}".` : "";
    findings.push({
      code: gating ? "unimplemented_decision" : "partially_implemented_decision",
      severity: gating ? "high" : "medium",
      message: gating
        ? `the user answered "${truncate(d.question || d.topic, 70)}" with "${truncate(label, 70)}", but no prose in the spec ` +
          `corresponds to that answer (best match ${score.toFixed(2)}); it never mentions ${missing.map((w) => `"${w}"`).join(", ")} ` +
          `— the citation ⟨src: d:${d.id}⟩ is a claim, not an implementation.${nearest}`
        : `the user answered "${truncate(d.question || d.topic, 70)}" with "${truncate(label, 70)}", and the spec covers it only ` +
          `loosely (best match ${score.toFixed(2)}): it never mentions ${missing.map((w) => `"${w}"`).join(", ")}.${nearest}`,
      fix_hint: gating
        ? `Give "${truncate(label, 60)}" somewhere to live: an entity or field, a matrix row, a rule with a test, or a scenario. ` +
          `If the answer is genuinely out of scope for v1, move it to the non-goals and re-open the decision.`
        : `Check by hand whether the answer is really built. This band holds both real gaps and answers the spec ` +
          `implements in different words, so it is reported rather than enforced.`,
    });
  }
  return findings;
}

/**
 * Below this, no prose in the spec resembles the chosen answer — gating.
 * At or above UNIMPLEMENTED_PARTIAL the answer is covered well enough to stay silent; in between it is
 * reported without gating.
 *
 * Calibrated by hand-labelling every resolved decision on two real specs (the 2026-08-25 live compile and its
 * replay): 11 points, 4 unimplemented, 7 implemented. Excluding table ROWS from the chunk set was what made
 * them separable — a permissions row ("View Financial Record | ✓ | ✓") is a verdict, not an implementation,
 * and matching against one is how a matrix row masqueraded as a saved-views feature. The observed spread:
 *
 *   unimplemented: 0.000, 0.299, 0.309, 0.323      implemented: 0.330, 0.350, 0.489, 0.722, 0.790, 0.871, 0.953
 *
 * They separate perfectly, but by 0.007 on 11 points — far too thin a margin to gate a compile on. So the
 * gate is set at 0.30, where the evidence is unambiguous, and the 0.30–0.45 band is reported as
 * `partially_implemented_decision` instead. That deliberately demotes one true finding (the replay's
 * `recurring_scheduled`, 0.323) rather than risk blocking a good compile on a 2% difference.
 */
const UNIMPLEMENTED_ABSENT = 0.3;
const UNIMPLEMENTED_PARTIAL = 0.45;

/**
 * The spec's prose, one line per chunk, for paraphrase matching. Decision tables are dropped wholesale and
 * every other table ROW too: a row is a verdict, not a sentence, and its cells match anything.
 */
function bodyChunks(sections: SpecSection[]): string[] {
  const out: string[] = [];
  for (const s of sections) {
    for (const raw of stripTraces(withoutDecisionTables(`${s.heading}\n${s.body}`)).split("\n")) {
      if (/^\s*\|/.test(raw)) continue;
      const t = raw.replace(/^[\s>#*\-]+/, "").trim();
      if (t.length >= 15) out.push(t);
    }
  }
  return out;
}

/** Every word of the spec outside its decision tables, trace markers removed (a marker is not prose). */
function bodyWordSet(sections: SpecSection[]): Set<string> {
  const words = new Set<string>();
  for (const s of sections) {
    for (const w of stripTraces(withoutDecisionTables(`${s.heading}\n${s.body}`)).toLowerCase().split(/[^a-z0-9]+/)) {
      if (w.length > 1) words.add(w);
    }
  }
  return words;
}

function contentWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !LABEL_STOPWORDS.has(w));
}

/** Membership with simple singular/plural tolerance — no stemmer to disagree with itself. */
function hasWord(set: Set<string>, w: string): boolean {
  if (set.has(w)) return true;
  const forms = [`${w}s`, `${w}es`];
  if (w.endsWith("ies")) forms.push(`${w.slice(0, -3)}y`);
  if (w.endsWith("es")) forms.push(w.slice(0, -2));
  if (w.endsWith("s")) forms.push(w.slice(0, -1));
  return forms.some((f) => set.has(f));
}

/**
 * Everything in `text` except the rows of its decision tables.
 *
 * A decision table lists every decision by construction, so it can never be evidence that the spec
 * DEPENDS on one. Which table that is has to be decided structurally, from the header row — not from
 * the heading above it. The compiler's own "Non-goals & defaulted decisions" section matched a
 * title-based rule and swallowed properly cited prose sitting in it; a model can emit those words in a
 * heading at any time. Prose and bullets always count, whatever the heading says.
 */
function withoutDecisionTables(text: string): string {
  const lines = text.split("\n");
  const kept: string[] = [];
  for (let i = 0; i < lines.length; ) {
    if (!isTableRow(lines[i]!)) {
      kept.push(lines[i]!);
      i++;
      continue;
    }
    let end = i; // the run of consecutive rows == one table
    while (end < lines.length && isTableRow(lines[end]!)) end++;
    if (!splitCells(lines[i]!).some((c) => DECISION_COLUMN_RE.test(stripTraces(c).trim()))) kept.push(...lines.slice(i, end));
    i = end;
  }
  return kept.join("\n");
}

function isTableRow(line: string): boolean {
  const t = line.trim();
  return t.startsWith("|") && t.indexOf("|", 1) >= 0;
}

function splitCells(row: string): string[] {
  return row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split(/(?<!\\)\|/)
    .map((c) => c.trim());
}

/** The section the compiler *claimed* derives from this decision, if any (excluding the ledger tables). */
function claimedBy(traces: Record<string, { anchor: string; sources: string[] }[]> | undefined, id: string): string | undefined {
  if (!traces) return undefined;
  for (const key of Object.keys(traces)) {
    if (LEDGER_TRACE_KEY_RE.test(key)) continue;
    for (const entry of traces[key] ?? []) {
      if (entry.sources.some((s) => s.trim() === `d:${id}`)) return entry.anchor;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------------------------------
// 2. duplicate_heading — the assembler emits a heading and the model emits its own.
// ---------------------------------------------------------------------------------------------------

const HEADING_STOPWORDS = new Set(["and", "the", "a", "an", "of", "for", "to", "in", "on"]);

/** Lowercase, "&"→"and", non-alphanumerics dropped, stopwords dropped, leading list numbering dropped. */
function headingTokens(heading: string): string[] {
  return stripTraces(heading)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/^\s*\d+[.)]\s*/, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0 && !HEADING_STOPWORDS.has(t));
}

function checkDuplicateHeadings(sections: SpecSection[]): SpecFinding[] {
  const heads = sections.filter((s) => s.level > 0);
  const keys = heads.map((s) => headingTokens(s.heading));
  const findings: SpecFinding[] = [];
  const reported = new Set<number>(); // index into `heads`

  const push = (i: number, message: string, fix_hint: string) => {
    if (reported.has(i)) return;
    reported.add(i);
    findings.push({ code: "duplicate_heading", severity: "low", section: sectionName(heads[i]!), message, fix_hint });
  };

  for (let i = 0; i < heads.length; i++) {
    const key = keys[i]!.join(" ");
    if (key === "") continue;
    // Exact repeat: only when the two share a parent, or are immediately adjacent. Repeating an entity
    // name as a sub-heading under a different parent (Data model / Lifecycles) is legitimate.
    for (let j = 0; j < i; j++) {
      if (keys[j]!.join(" ") !== key) continue;
      if (parentOf(heads[j]!) !== parentOf(heads[i]!) && j !== i - 1) continue;
      push(
        i,
        `heading "${truncate(heads[i]!.heading, 80)}" (line ${heads[i]!.line}) repeats "${truncate(heads[j]!.heading, 80)}" (line ${heads[j]!.line}).`,
        "One heading per section: delete the assembler's or the model's copy and merge the two bodies.",
      );
      break;
    }
    // Near-duplicate: an immediately following heading that only adds words ("Actors & permissions"
    // then "Actors × Permissions Matrix").
    if (i > 0 && !reported.has(i)) {
      const prev = keys[i - 1]!;
      const cur = keys[i]!;
      const sameStart = prev.length > 0 && cur.length > 0 && prev[0] === cur[0];
      if (sameStart && cur.join(" ") !== prev.join(" ") && (isSubset(prev, cur) || isSubset(cur, prev))) {
        push(
          i,
          `heading "${truncate(heads[i]!.heading, 80)}" (line ${heads[i]!.line}) restates the heading immediately above it, ` +
            `"${truncate(heads[i - 1]!.heading, 80)}" (line ${heads[i - 1]!.line}).`,
          "Two headings in a row naming the same section: keep one and put the content under it.",
        );
      }
    }
    // A second `#` — the document already has a title; every later h1 breaks the outline.
    if (heads[i]!.level === 1 && i > 0) {
      push(
        i,
        `h1 heading "${truncate(heads[i]!.heading, 80)}" (line ${heads[i]!.line}) appears after the document title "${truncate(heads[0]!.heading, 60)}".`,
        "Only the document title is an h1; demote this to the level of the section it belongs to.",
      );
    }
  }
  return findings;
}

function parentOf(s: SpecSection): string {
  return s.path.slice(0, -1).join(" › ");
}

function isSubset(a: string[], b: string[]): boolean {
  const set = new Set(b);
  return a.every((t) => set.has(t));
}

// ---------------------------------------------------------------------------------------------------
// 3. prose_in_table_cell — a matrix cell is a verdict, not a paragraph.
// ---------------------------------------------------------------------------------------------------

const MAX_CELL = 80;
const SECOND_SENTENCE_RE = /\.\s+[A-Z]/;

function checkProseInTableCells(sections: SpecSection[]): SpecFinding[] {
  const findings: SpecFinding[] = [];
  for (const s of sections) {
    // Decision-table rows quote whole questions by construction; every other table is a contract.
    for (const row of tableRows(withoutDecisionTables(s.body))) {
      for (const cell of row.cells) {
        const bare = stripTraces(cell).trim();
        if (bare.length === 0) continue;
        const tooLong = bare.length > MAX_CELL;
        const twoSentences = SECOND_SENTENCE_RE.test(bare);
        if (!tooLong && !twoSentences) continue;
        findings.push({
          code: "prose_in_table_cell",
          severity: "medium",
          section: sectionName(s),
          message:
            `table cell in row "${truncate(row.cells[0] ?? "", 40)}" holds ${tooLong ? `${bare.length} characters of prose` : "a second sentence"}: ` +
            `"${truncate(bare, 120)}".`,
          fix_hint: "A matrix cell is a verdict (✓ / ✗ / a single value); move the explanation to a footnote under the table.",
        });
      }
    }
  }
  return findings;
}

/** Rows of every markdown table in a body, separator rows dropped. */
function tableRows(body: string): { cells: string[] }[] {
  const rows: { cells: string[] }[] = [];
  for (const raw of body.split("\n")) {
    const t = raw.trim();
    if (!t.startsWith("|") || t.indexOf("|", 1) < 0) continue;
    if (/^\|[\s|:-]*\|$/.test(t) && t.includes("-")) continue; // |---|:--:|
    rows.push({ cells: splitCells(t) });
  }
  return rows;
}

// ---------------------------------------------------------------------------------------------------
// 4. enum_placeholder — an enum with "etc." cannot be implemented or tested.
// ---------------------------------------------------------------------------------------------------

const PLACEHOLDER_RE = /\betc\b\.?|\.\.\.|…|\bor similar\b|\band so on\b|\bTBD\b/i;
const ENUM_DECL_RE = /\benum\b\s*[:(]/i;
const FIELD_BULLET_RE = /^\s*[-*+]\s+(?:\*\*(?<bold>[^*]+)\*\*|`(?<code>[^`]+)`|(?<plain>[A-Za-z][A-Za-z0-9 _/]{0,40}?))\s*:\s+.*$/;

function checkEnumPlaceholders(sections: SpecSection[]): SpecFinding[] {
  const findings: SpecFinding[] = [];
  for (const s of sections) {
    for (const line of s.body.split("\n")) {
      const segments: string[] = [];
      const decl = ENUM_DECL_RE.exec(line);
      if (decl) segments.push(line.slice(decl.index));
      if (FIELD_BULLET_RE.test(line)) {
        // A field bullet whose type is spelled as a parenthesised option list.
        for (const g of line.matchAll(/\(([^()]*)\)/g)) if (g[1]!.includes(",")) segments.push(g[1]!);
      }
      const offender = segments.find((seg) => PLACEHOLDER_RE.test(seg));
      if (offender === undefined) continue;
      const token = PLACEHOLDER_RE.exec(offender)![0];
      findings.push({
        code: "enum_placeholder",
        severity: "medium",
        section: sectionName(s),
        message: `enum / option list is left open with "${token}": "${truncate(line.trim(), 120)}".`,
        fix_hint: 'An enum with "etc." cannot be implemented or tested; list every member explicitly.',
      });
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------------------------------
// 5. untestable_assertion — a rule that hedges itself out of testability.
// ---------------------------------------------------------------------------------------------------

const TEST_LINE_RE = /^\s*(?:\*\*Test:?\*\*|Test:)/i;
const RULE_LINE_RE = /^\s*(?:\*\*Rule:?\*\*|Rule:)/i;
const RULEISH_SECTION_RE = /rule|invariant|test|verif|scenario|acceptance/i;
const BULLET_RE = /^\s*(?:[-*+]\s+|\d+[.)]\s+)/;
/** "…deduplicated by file name, size, or content hash" — a criterion with alternatives is not a criterion. */
const CRITERION_OR_RE = /\b(?:by|using|based on|matching(?: on)?|identified by|keyed on)\b[^.;)]{0,80},[^.;)]{0,40}\bor\b/i;
/** Words that introduce the expected outcome of a test — " or " AFTER one of these is ambiguity. */
const EXPECTATION_RE = /\b(?:verif\w*|ensur\w*|expect\w*|assert\w*|confirm\w*|check\w*|should|shall|must|results? in)\b/i;
const APPROVER_RE = /\b(admin|administrator|owner|approver|manager|supervisor|lead)\b/i;
const DEFAULT_STATED_RE = /\bdefaults?\b|\binitially\b|\b\d+\s*(?:ms|seconds?|minutes?|hours?|days?|weeks?|months?)\b/i;

const HEDGES: { probe: RegExp; label: string; ok?: (line: string) => boolean }[] = [
  { probe: /\bunless policy\b/i, label: "unless policy" },
  { probe: /\bas appropriate\b/i, label: "as appropriate" },
  { probe: /\bif applicable\b/i, label: "if applicable" },
  { probe: /\bwhere feasible\b/i, label: "where feasible" },
  { probe: /\bwith approval\b/i, label: "with approval" }, // suppressed when the line names an approver
  { probe: /\bconfigurable\b/i, label: "configurable", ok: (l) => DEFAULT_STATED_RE.test(l) },
];

function checkUntestableAssertions(sections: SpecSection[], sheet: Sheet): SpecFinding[] {
  const actorNames = sheet.actors.map((a) => a.name).filter((n) => n.length > 1);
  const namesApprover = (line: string) => APPROVER_RE.test(line) || actorNames.some((n) => line.toLowerCase().includes(n.toLowerCase()));
  const findings: SpecFinding[] = [];

  for (const s of sections) {
    const ruleish = s.path.some((h) => RULEISH_SECTION_RE.test(h));
    for (const line of s.body.split("\n")) {
      const isTest = TEST_LINE_RE.test(line);
      const isRule = RULE_LINE_RE.test(line);
      if (!isTest && !isRule && !(ruleish && BULLET_RE.test(line))) continue;
      const text = stripTraces(line).trim();
      const push = (why: string, fix_hint: string) =>
        findings.push({
          code: "untestable_assertion",
          severity: "medium",
          section: sectionName(s),
          message: `${why}: "${truncate(text, 120)}".`,
          fix_hint,
        });

      // " or " only makes a test untestable when it splits the EXPECTED OUTCOME ("ensure it is rejected
      // or auto-generated"). "Try to create, update, or import …" enumerates inputs and is fine, so the
      // disjunction must follow an expectation word inside the same clause — a miss beats a false alarm.
      const ambiguous = isTest ? orBetweenOutcomes(text) : null;
      if (ambiguous !== null) {
        findings.push({
          code: "untestable_assertion",
          severity: "medium",
          section: sectionName(s),
          message: `test alternates between outcomes, so no single assertion can be written: "${truncate(ambiguous, 120)}".`,
          fix_hint: "Name the one expected outcome; split the alternatives into separate tests.",
        });
      }
      if ((isTest || isRule) && CRITERION_OR_RE.test(text)) {
        push("matching criterion offers alternatives, so two implementations can both satisfy it", "Name the single criterion (one of them), or specify the exact combination.");
      }
      for (const h of HEDGES) {
        if (!h.probe.test(text)) continue;
        if (h.label === "with approval" ? namesApprover(text) : (h.ok?.(text) ?? false)) continue;
        const fix =
          h.label === "with approval"
            ? "Name the approver (which role must approve) in the rule itself."
            : h.label === "configurable"
              ? "State the default value and its unit in the rule itself; the setting can still be configurable."
              : "State the single rule that always applies — a hedge cannot be turned into a test.";
        push(`rule hedges with "${h.label}", so it cannot be tested`, fix);
      }
    }
  }
  return findings;
}

/** The clause where " or " follows an expectation word, or null. */
function orBetweenOutcomes(text: string): string | null {
  for (const clause of text.split(/[.;:—–]+/)) {
    const m = / or /i.exec(clause);
    if (m && EXPECTATION_RE.test(clause.slice(0, m.index))) return clause;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------
// 6. missing_matrix_row — an action absent from the permission contract has undefined permissions.
// ---------------------------------------------------------------------------------------------------

const MATRIX_SECTION_RE = /actors|permission/i;

function checkMatrixRows(sections: SpecSection[], sheet: Sheet): SpecFinding[] {
  if (sheet.actions.length === 0) return [];
  const matrix = sections.filter((s) => s.path.some((h) => MATRIX_SECTION_RE.test(h)));
  const labels: string[] = [];
  let matrixHeading: string | undefined;
  for (const s of matrix) {
    const rows = tableRows(s.body);
    if (rows.length > 0 && matrixHeading === undefined) matrixHeading = sectionName(s);
    for (const r of rows) labels.push(stemTokens(stripTraces(r.cells[0] ?? "")).join(" "));
  }

  if (labels.length === 0) {
    return [
      {
        code: "missing_matrix_row",
        severity: "medium",
        message:
          `the spec has no actors × permissions table, so none of the ${sheet.actions.length} Sheet actions ` +
          `(e.g. "${truncate(describeAction(sheet, sheet.actions[0]!), 80)}") has a stated permission.`,
        fix_hint: "The matrix is the permission contract; add one row per Sheet action with a verdict per actor.",
      },
    ];
  }

  const findings: SpecFinding[] = [];
  for (const a of sheet.actions) {
    const noun = sheet.nouns.find((n) => n.id === a.object);
    const verb = stemTokens(a.verb);
    const nounTokens = stemTokens(noun?.name ?? a.object);
    const covered = labels.some((l) => {
      const words = l.split(" ");
      return verb.every((v) => words.includes(v)) && containsRun(words, nounTokens);
    });
    if (covered) continue;
    findings.push({
      code: "missing_matrix_row",
      severity: "medium",
      section: matrixHeading,
      message: `Sheet action ${a.id} ("${truncate(describeAction(sheet, a), 100)}") has no row in the actors × permissions matrix.`,
      fix_hint: "The matrix is the permission contract; an action missing from it has undefined permissions — add a row with a verdict for every actor.",
    });
  }
  return findings;
}

function describeAction(sheet: Sheet, a: Sheet["actions"][number]): string {
  const actor = sheet.actors.find((x) => x.id === a.actor)?.name ?? a.actor;
  const noun = sheet.nouns.find((n) => n.id === a.object)?.name ?? a.object;
  return `${actor} ${a.verb} ${noun}`;
}

function containsRun(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0) return false;
  for (let i = 0; i + needle.length <= haystack.length; i++) {
    if (needle.every((w, k) => haystack[i + k] === w)) return true;
  }
  return false;
}

function stemTokens(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(stemWord);
}

/** Crude singular/plural fold — enough to match "uploads"/"Upload", "Categories"/"Category". */
function stemWord(w: string): string {
  if (w.length > 4 && w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && w.endsWith("ses")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("es")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

// ---------------------------------------------------------------------------------------------------
// 7. computed_field_without_formula — the product's core number with no arithmetic behind it.
// ---------------------------------------------------------------------------------------------------

const DATA_MODEL_SECTION_RE = /data model|schema|entities/i;
const COMPUTED_NAME_RE = /^(?:total|net|sum|count|avg|average|balance|subtotal|profit)\b/i;
const COMPUTED_SUFFIX_RE = /(?:profit|total)$/i;

/** One finding per entity block, however many of its fields are unexplained — this severity gates a
 *  compile, and "Summary Report has no arithmetic" is one defect, not three. */
function checkComputedFields(sections: SpecSection[]): SpecFinding[] {
  const findings: SpecFinding[] = [];
  for (const s of sections) {
    if (!s.path.some((h) => DATA_MODEL_SECTION_RE.test(h))) continue;
    const offenders: { name: string; line: string }[] = [];
    for (const line of s.body.split("\n")) {
      const m = FIELD_BULLET_RE.exec(line);
      if (!m) continue;
      const name = (m.groups?.bold ?? m.groups?.code ?? m.groups?.plain ?? "").trim();
      if (name === "" || !(COMPUTED_NAME_RE.test(name) || COMPUTED_SUFFIX_RE.test(name))) continue;
      if (hasFormulaFor(s.body, name)) continue;
      offenders.push({ name, line: truncate(stripTraces(line).trim(), 120) });
    }
    if (offenders.length === 0) continue;
    const entity = sectionName(s) ?? "this entity";
    const names = offenders.map((o) => `"${o.name}"`).join(", ");
    const first = offenders[0]!;
    findings.push({
      code: "computed_field_without_formula",
      severity: "high",
      section: sectionName(s),
      message:
        `computed field${offenders.length > 1 ? "s" : ""} ${names} on ${entity} ${offenders.length > 1 ? "are" : "is"} declared with no formula ` +
        `anywhere in the ${entity} block: "${first.line}".`,
      fix_hint:
        `State the formula and the sign convention for ${offenders.length > 1 ? "each" : `"${first.name}"`} ` +
        `(e.g. "${first.name} = Σ income − Σ expenses; expenses are stored positive"), and say which records are in scope.`,
    });
  }
  return findings;
}

const FORMULA_WORD_RE = /Σ|\bsum of\b|\bcalculated as\b|\bderived as\b|\bcomputed as\b|\bequals\b/i;

/** A formula inside the enclosing entity block: "X = …", or Σ / "sum of" / "calculated as" naming X. */
function hasFormulaFor(body: string, name: string): boolean {
  const nameRe = new RegExp(escapeRe(name), "i");
  for (const line of body.split("\n")) {
    if (!nameRe.test(line)) continue;
    const eq = line.indexOf("=");
    if (eq > 0 && nameRe.test(line.slice(0, eq))) return true;
    if (FORMULA_WORD_RE.test(line)) return true;
  }
  return false;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------------------------------
// 8. missing_import_contract — the app imports spreadsheets and never says what a valid file is.
// ---------------------------------------------------------------------------------------------------

const IMPORT_WORD_RE = /spreadsheet|csv|excel|xlsx|import|upload/i;

const IMPORT_EVIDENCE: { label: string; probe: RegExp }[] = [
  { label: "required headers", probe: /\bheaders?\b/i },
  { label: "per-column types", probe: /\bcolumns?\b/i },
  { label: "which worksheet", probe: /\b(?:sheet name|worksheet|tab name)\b/i },
  { label: "date/number/currency formats", probe: /\b(?:date|time|number|decimal|currency|amount)\s+format\b/i },
  { label: "file encoding", probe: /\bencoding\b|\bUTF-?8\b/i },
  { label: "delimiter", probe: /\bdelimiter\b|\b(?:comma|semicolon|tab)-separated\b/i },
  { label: "accepted extensions", probe: /\.(?:xlsx|xls|csv|tsv)\b/i },
  { label: "how text resolves to an entity", probe: /\b(?:match|matched|matches|resolve|resolves|resolved|map|maps|mapped|look ?up)\b[^.\n]{0,60}\b(?:existing|categor|entit|by name|account)\b/i },
  { label: "whether the original file is retained", probe: /\b(?:original|uploaded|source)\s+file\b[^.\n]{0,100}\b(?:retain|kept|keep|stored|store|discard|delete|purge)\b/i },
];

const MIN_IMPORT_EVIDENCE = 3;

function checkImportContract(spec: string, sheet: Sheet): SpecFinding[] {
  const trigger = importTrigger(sheet);
  if (!trigger) return [];
  const present = IMPORT_EVIDENCE.filter((e) => e.probe.test(spec));
  if (present.length >= MIN_IMPORT_EVIDENCE) return [];
  const missing = IMPORT_EVIDENCE.filter((e) => !present.some((p) => p.label === e.label)).map((e) => e.label);
  return [
    {
      code: "missing_import_contract",
      severity: "high",
      message:
        `the Sheet calls for a file import (${truncate(trigger, 90)}) but the spec never says what a valid file looks like — ` +
        `it states only ${present.length} of the ${IMPORT_EVIDENCE.length} import facts (missing: ${missing.slice(0, 5).join(", ")}).`,
      fix_hint:
        "Add an import contract: the required column headers, accepted file formats/extensions, the type and format of each column, " +
        "how a text column resolves to an existing entity, what happens to unmatched or malformed rows, and whether the original file is retained.",
    },
  ];
}

/** What on the Sheet demands an import contract, quoted for the finding — or "" if nothing does. */
function importTrigger(sheet: Sheet): string {
  const d = sheet.decisions.find((x) => x.id === "data_import");
  if (d && d.chosen) {
    const label = d.options.find((o) => o.id === d.chosen)?.label ?? "";
    if (IMPORT_WORD_RE.test(d.chosen) || IMPORT_WORD_RE.test(label)) {
      return `decision data_import = "${d.chosen}"${label ? ` (${label})` : ""}`;
    }
  }
  for (const n of sheet.nouns) {
    const hay = [n.name, ...(n.fields_hint ?? []), n.description ?? ""].join(" ");
    if (IMPORT_WORD_RE.test(hay)) return `noun "${n.name}" (${[n.name, ...(n.fields_hint ?? [])].join(", ")})`;
  }
  return "";
}

// ---------------------------------------------------------------------------------------------------
// shared helpers
// ---------------------------------------------------------------------------------------------------

/** The heading a finding sits under, with the compiler's trace marker stripped. */
function sectionName(s: SpecSection): string | undefined {
  const h = stripTraces(s.heading).trim();
  return h === "" ? undefined : h;
}

function stripTraces(s: string): string {
  return s.replace(TRACE_MARKER_RE, "");
}

function truncate(s: string, n: number): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length <= n ? flat : `${flat.slice(0, n - 1)}…`;
}

/** Repair-hint block for a compiler retry prompt — mirrors formatIRFindings in spec_ir.ts. */
export function formatSpecFindings(findings: SpecFinding[]): string {
  if (findings.length === 0) return "No structural findings.";
  return [
    "STRUCTURAL FINDINGS in the compiled spec (fix every one, then re-emit the affected sections):",
    ...findings.map((f) => `- [${f.severity}] ${f.code}${f.section ? ` in "${f.section}"` : ""}: ${f.message} Fix: ${f.fix_hint}`),
  ].join("\n");
}

// ---------------------------------------------------------------------------------------------------
// 11. lifecycle_state_not_in_enum — a state the lifecycle section names that the entity's persisted
//     status enum has no room for. HIGH: it is not a wording slip, it is a schema the builder cannot
//     implement. Found on a live Opus spec, twice in one document:
//
//       Period  data model `status enum(open, closed)`   ·  lifecycle "starts in `empty` … 3 states"
//       User    data model `status enum(invited, active)` ·  lifecycle "… deactivated"
//
//     The critic did catch a sibling defect on that run (the Account Line lifecycle contradicting R-6)
//     and correctly failed the spec — but ADR-039's whole lesson is that the critic is not a gate. An
//     LLM noticing something once is not the same as it being checked, and these two it did not notice.
//     Mechanical, cross-section, and cheap: parse the enums, parse the state names, compare the sets.
// ---------------------------------------------------------------------------------------------------


/**
 * The entity name a data-model heading denotes. Real headings carry the compiler's trace markers and
 * parenthetical qualifiers — `### Period ⟨src: n:n4⟩`, `### Revenue Figure (derived) ⟨src: n:n5⟩` — and the
 * first version of this check silently matched nothing because it stripped only the parentheses. It scored
 * zero findings on a spec with two real ones, which is the failure mode a "0 findings" result always deserves
 * suspicion for.
 */
function entityFromHeading(heading: string): string {
  return heading
    .replace(/⟨[^⟩]*⟩/g, " ")
    .replace(/\s*\(.*?\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** `| status | enum(open, closed) | …` → the option set, per entity heading. Ignores non-status enums. */
function statusEnumsByEntity(sections: SpecSection[]): Map<string, { states: Set<string>; raw: string }> {
  const out = new Map<string, { states: Set<string>; raw: string }>();
  for (const sec of sections) {
    const entity = entityFromHeading(sec.heading);
    if (!entity) continue;
    for (const line of sec.body.split("\n")) {
      // TWO syntaxes, both observed in live specs from the same compiler on the same model:
      //   | status | enum(open, closed) | …            (paren form)
      //   | status | Enum: draft, finalized, reviewed | (colon form)
      // The section writer is an LLM writing prose, so it is not consistent about this. The first version of
      // this check handled only the paren form and therefore scored 0 on a spec whose judge had just reported
      // two enum-vs-lifecycle contradictions — the defect was there, the parser simply could not see it.
      const m = /^\s*\|\s*status\s*\|\s*(?:enum\s*\(([^)]*)\)|Enum\s*:\s*([^|]*))\s*\|/i.exec(line);
      if (!m) continue;
      const raw = (m[1] ?? m[2] ?? "").trim();
      if (!raw) continue;
      const states = new Set(
        raw
          .split(",")
          .map((x) => x.trim().replace(/^[`'"]|[`'"]$/g, "").toLowerCase())
          .filter(Boolean),
      );
      if (states.size) out.set(entity.toLowerCase(), { states, raw });
    }
  }
  return out;
}

/**
 * State names a lifecycle section attributes to an entity. Two shapes the compiler actually emits:
 *   "Each Period starts in `empty` and moves through 3 states."
 *   a transition table or list whose cells hold `backticked` state names
 * Only backticked tokens are taken, because prose words are not state names and guessing would produce
 * false highs on the one check severe enough to block delivery.
 */
function lifecycleStatesByEntity(sections: SpecSection[]): Map<string, { states: Set<string>; section: string }> {
  const out = new Map<string, { states: Set<string>; section: string }>();
  for (const sec of sections) {
    const intro = /Each\s+([A-Z][\w ]*?)\s+starts in\s+`([^`]+)`/g;
    // Every intro position first, so each entity's block can be bounded by the NEXT entity's intro rather
    // than by a fixed window. A fixed window was the first implementation and it silently attributed the
    // User lifecycle's states (`invited`, `active`, `deactivated`) to Period, which would have reported a
    // clean spec as having three orphan states — a false HIGH on the one check severe enough to block a
    // delivery. Bleeding between blocks is the failure mode to design out, not to tune a constant for.
    const intros: { entity: string; start: number; first: string }[] = [];
    let m: RegExpExecArray | null;
    while ((m = intro.exec(sec.body))) intros.push({ entity: m[1]!.trim().toLowerCase(), start: m.index, first: m[2]!.trim().toLowerCase() });
    for (const [i, it] of intros.entries()) {
      const end = intros[i + 1]?.start ?? sec.body.length;
      const found = out.get(it.entity) ?? { states: new Set<string>(), section: sec.heading };
      found.states.add(it.first);
      for (const t of sec.body.slice(it.start, end).matchAll(/`([a-z][a-z0-9_]{2,30})`/g)) found.states.add(t[1]!.toLowerCase());
      out.set(it.entity, found);
    }
  }
  return out;
}

/** Words that appear backticked in lifecycle prose but are not states — kept explicit and small. */
const NOT_A_STATE = new Set(["null", "true", "false", "now", "id", "yes", "no", "status", "enum", "archived_at", "archived_by", "created_at", "updated_at"]);

export function checkLifecycleStatesAgainstEnums(sections: SpecSection[]): SpecFinding[] {
  const enums = statusEnumsByEntity(sections);
  if (enums.size === 0) return [];
  const lifecycles = lifecycleStatesByEntity(sections);
  const findings: SpecFinding[] = [];
  for (const [entity, life] of lifecycles) {
    const declared = enums.get(entity);
    if (!declared) continue; // no persisted status column: the lifecycle may live in another field
    const orphans = [...life.states].filter((st) => !declared.states.has(st) && !NOT_A_STATE.has(st) && !st.includes("_at") && !st.includes("_by")).sort();
    if (!orphans.length) continue;
    findings.push({
      code: "lifecycle_state_not_in_enum",
      severity: "high",
      section: life.section,
      message:
        `${entity} lifecycle uses state${orphans.length === 1 ? "" : "s"} ${orphans.map((o) => `\`${o}\``).join(", ")} ` +
        `but the data model declares status enum(${declared.raw}) — ${orphans.length === 1 ? "that state has" : "those states have"} nowhere to be stored.`,
      fix_hint:
        `Either add ${orphans.map((o) => `\`${o}\``).join(", ")} to ${entity}'s status enum, or move ${orphans.length === 1 ? "it" : "them"} onto whichever entity really holds that stage (a pre-persistence state usually belongs to a staging record, not to the persisted row).`,
    });
  }
  return findings.sort((a, b) => (a.message < b.message ? -1 : 1));
}
