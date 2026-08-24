/**
 * Spec-gap parser — turns the compiler's confessed guesses into new decision candidates.
 *
 * The compiler (COMPILER_SYSTEM) marks every line it had to invent with "⟨src: default⟩" (and usually a
 * "(default)" note). Those markers are a free, already-audited list of exactly where the Sheet was silent.
 * `parseSpecGaps` collects them deterministically; `proposeGapDecisions` makes ONE structured LLM call that
 * clusters the gaps and proposes up to `max` NEW decision candidates (id-prefixed "xg_", never colliding with
 * the Sheet's existing decision ids) that would remove the highest-consequence guesses.
 *
 * Defined here (not in src/llm/functions.ts) for the same reason as `src/mcp/check_task.ts`: the engine's own
 * fixed call points must stay exactly the ten functions the orchestrator uses. Same conventions though: flat
 * zod schema in the conservative JSON-schema subset (ADR-011), system prompt in PLANNER_SYSTEM's bespoke-task
 * style, and the MockLLM handler parses the same rendered prompt text the real model sees.
 */
import { z } from "zod";
import type { LLM, LLMRequest, LLMUsage, MockHandler } from "../llm/client.js";
import { sheetToText } from "../llm/functions.js";
import { VOCAB_GUARD } from "../llm/prompts.js";
import type { Sheet } from "../core/sheet.js";

// ---------- deterministic parsing ----------

export interface SpecGap {
  /** nearest preceding "## " heading ("" before the first one) */
  section: string;
  /** the raw spec line the marker sits on, trimmed */
  line: string;
  /** the containing sentence/bullet, trimmed, trace markers stripped — also the dedupe key */
  context: string;
}

/** Both marker spellings the compiler and its mocks emit: "⟨src: default⟩" and "⟨src:default⟩". */
const GAP_MARKER = /⟨src:\s*default⟩/;
/** Any trace marker, for stripping out of the human-readable context. */
const ANY_MARKER = /⟨src:[^⟩]*⟩/g;

/**
 * Scan a compiled spec line by line for compiler guesses. Tracks the current "## " heading, skips the
 * machine-readable `<!-- sheet-echo … -->` blocks the mock compiler appends (and any other HTML comment —
 * echoed Sheet text must never look like a fresh gap), and dedupes identical contexts: the same defaulted
 * sentence repeated across sections is one gap, not many.
 */
export function parseSpecGaps(spec: string): SpecGap[] {
  const out: SpecGap[] = [];
  const seen = new Set<string>();
  let section = "";
  let inComment = false;
  for (const raw of spec.split("\n")) {
    // Visible portion of the line: everything not inside an HTML comment.
    let line = raw;
    if (inComment) {
      const close = line.indexOf("-->");
      if (close < 0) continue;
      line = line.slice(close + 3);
      inComment = false;
    }
    line = line.replace(/<!--[\s\S]*?-->/g, "");
    const open = line.indexOf("<!--");
    if (open >= 0) {
      line = line.slice(0, open);
      inComment = true;
    }

    const heading = /^##\s+(.*)$/.exec(line);
    if (heading) {
      section = heading[1]!.trim();
      continue;
    }
    if (!GAP_MARKER.test(line)) continue;

    // Containing sentence/bullet: a bullet/table row is one item, so its whole body is the context; in prose,
    // the sentence holding the marker — and since the marker usually FOLLOWS the closing period, a marker-only
    // segment means the preceding sentence is the one that was defaulted.
    const trimmed = line.trim();
    const isBullet = /^([-*>]|\d+\.)\s+/.test(trimmed) || trimmed.startsWith("|");
    const body = trimmed.replace(/^([-*>]|\d+\.)\s+/, "").replace(/^\||\|$/g, "");
    let sentence = body;
    if (!isBullet) {
      const segs = body.split(/(?<=[.!?])\s+/);
      const idx = Math.max(0, segs.findIndex((s) => GAP_MARKER.test(s)));
      sentence = segs[idx]!;
      if (!sentence.replace(ANY_MARKER, "").trim() && idx > 0) sentence = segs[idx - 1]!;
    }
    const context =
      sentence
        .replace(ANY_MARKER, "")
        .replace(/\s+/g, " ")
        .replace(/\s+([.!?,;])/g, "$1")
        .replace(/^[\s|]+|[\s|]+$/g, "") || trimmed;
    if (seen.has(context)) continue;
    seen.add(context);
    out.push({ section, line: line.trim(), context });
  }
  return out;
}

// ---------- one structured call: gaps → new decision candidates ----------

export interface GapCandidate {
  id: string;
  topic: string;
  question: string;
  options: { id: string; label: string }[];
  consequence: number;
  rationale: string;
  section: string;
}

/** ADR-011 conservative subset: flat objects, every field present. Rich validation happens after parse. */
export const GapDecisionsOutSchema = z.object({
  candidates: z.array(
    z.object({
      id: z.string(),
      topic: z.string(),
      question: z.string(),
      options: z.array(z.object({ id: z.string(), label: z.string() })),
      consequence: z.number(),
      rationale: z.string(),
      section: z.string(),
    }),
  ),
});
export type GapDecisionsOut = z.infer<typeof GapDecisionsOutSchema>;

export const GAP_DECISIONS_SYSTEM = `You turn a compiled specification's confessed guesses into new decision candidates for the app's owner. You receive the Design Sheet (with its decision ledger) and a list of GAPS — sentences where the spec compiler had to guess a default because the Sheet was silent.
Tasks:
1. Cluster gaps that are really the same underlying product decision; propose ONE candidate per cluster, never one per gap.
2. Propose up to the requested number of NEW decision candidates that would remove the highest-consequence guesses first. Skip any gap an existing decision in the ledger already settles (any status), and skip trivia a default handles safely — an unasked candidate costs the owner a card.
Each candidate: id (snake_case, MUST start with "xg_", e.g. xg_payment_reminders; never reuse an existing decision id), topic (2–4 plain words), question (one sentence a non-technical business owner understands), 2–4 options with snake_case ids and short labels, consequence 1–5 (how much of the app changes if the guess is wrong), rationale (one line naming the gap it closes), section (the spec section the gap came from).
Phrase topic and question as business consequences, not concepts. ${VOCAB_GUARD}
Return JSON only.`;

export const GAPS_MARKER = "GAPS (compiler guesses confessed in the spec):\n";

/** Rendered gap list — shared by the real prompt and the mock handler, like `renderNodesForExtraction`. */
export function renderGapsForPrompt(gaps: SpecGap[]): string {
  return gaps.map((g) => `- [${g.section || "(top)"}] ${g.context}`).join("\n");
}

const ZERO_USAGE: LLMUsage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };

const snake = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

/**
 * ONE structured call proposing new decisions for the given gaps. Post-processing is deterministic and strict:
 * ids are snake_cased and forced to the "xg_" prefix; a candidate whose id collides with an existing
 * `sheet.decisions` id (or an earlier candidate) is DROPPED rather than renamed — the model was told the ids
 * are taken, and silently renaming would detach the id from whatever rationale the model tied to it. Options
 * are deduped by id and clipped to 4; candidates left with fewer than 2 options are dropped; consequence is
 * clamped to 1–5. At most `opts.max` (default 8) candidates survive. With no gaps there is nothing to ask, so
 * no call is made and zero usage is reported.
 */
export async function proposeGapDecisions(
  llm: LLM,
  sheet: Sheet,
  gaps: SpecGap[],
  opts: { max?: number } = {},
): Promise<{ candidates: GapCandidate[]; usage: LLMUsage; model: string }> {
  const max = Math.max(1, opts.max ?? 8);
  if (!gaps.length) return { candidates: [], usage: { ...ZERO_USAGE }, model: llm.models.strong };

  const res = await llm.structured({
    fn: "gap_decisions",
    tier: "strong",
    system: GAP_DECISIONS_SYSTEM,
    user: [`DESIGN SHEET:\n${sheetToText(sheet, { withDecisions: true })}`, `${GAPS_MARKER}${renderGapsForPrompt(gaps)}`, `Propose at most ${max} candidates.`].join("\n\n"),
    schema: GapDecisionsOutSchema,
    effort: "medium",
    maxTokens: 4000,
  });

  const taken = new Set(sheet.decisions.map((d) => d.id));
  const candidates: GapCandidate[] = [];
  for (const c of res.data.candidates) {
    if (candidates.length >= max) break;
    let id = snake(c.id);
    if (!id) continue;
    if (!id.startsWith("xg_")) id = `xg_${id}`;
    if (taken.has(id)) continue;
    taken.add(id);
    const optSeen = new Set<string>();
    const options: GapCandidate["options"] = [];
    for (const o of c.options) {
      const oid = snake(o.id);
      if (!oid || optSeen.has(oid)) continue;
      optSeen.add(oid);
      options.push({ id: oid, label: o.label.trim() || oid });
      if (options.length === 4) break;
    }
    if (options.length < 2) continue;
    candidates.push({
      id,
      topic: c.topic.trim(),
      question: c.question.trim(),
      options,
      consequence: Math.min(5, Math.max(1, Math.round(c.consequence))),
      rationale: c.rationale.trim(),
      section: c.section.trim(),
    });
  }
  return { candidates, usage: res.usage, model: res.model };
}

// ---------- mock ----------

/**
 * Scripted handler for fn "gap_decisions": reads the gap list back out of the rendered prompt (same text the
 * real model sees) and proposes one plausible two-option candidate per gap, so engine tests exercise the real
 * prompt/schema/post-processing plumbing rather than a canned reply. Deliberately naive about collisions and
 * the max — `proposeGapDecisions` must enforce those itself, and the tests pin that it does.
 */
export function mockGapDecisions(req: LLMRequest<unknown>): GapDecisionsOut {
  const block = req.user.split(GAPS_MARKER)[1] ?? "";
  const gaps = [...block.matchAll(/^- \[([^\]]*)\] (.+)$/gm)].map((m) => ({ section: m[1]! === "(top)" ? "" : m[1]!, context: m[2]! }));
  const candidates: GapDecisionsOut["candidates"] = gaps.map((g) => {
    const words = g.context
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .slice(0, 3);
    return {
      id: `xg_${words.join("_") || "gap"}`,
      topic: words.join(" ") || "spec gap",
      question: `The plan currently assumes: "${g.context}" Is that right for your business?`,
      options: [
        { id: "keep_as_assumed", label: "Keep it as assumed" },
        { id: "work_differently", label: "It should work differently" },
      ],
      consequence: 3,
      rationale: `closes the guess "${g.context.slice(0, 80)}"`,
      section: g.section,
    };
  });
  return { candidates };
}

export const gapMockHandlers: Record<string, MockHandler> = {
  gap_decisions: (req) => mockGapDecisions(req),
};
