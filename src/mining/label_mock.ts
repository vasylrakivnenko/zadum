/**
 * MockLLM handler for fn "evidence_label" — a deterministic stand-in for the Opus labeller so the whole
 * evidence pipeline (condense → prompt → schema → rules → report) runs end to end with no credentials.
 *
 * It reads the rendered prompt exactly as the model does (available loci, then the artifact, then the feature
 * list with declared loci — the artifact-first order the real labeller uses so the prefix can be cached) and
 * applies lexical cues:
 *   - a feature is `present` when a single line of the artifact contains enough of its cue tokens; the
 *     evidence is that line, verbatim, so the substring check in `applyEvidenceRules` passes for real;
 *   - otherwise it is `absent`, and — deliberately — it reports **every locus the feature declares**, not
 *     just the ones this artifact has. Real models over-claim exactly like this, and it means the mock run
 *     exercises rule 1 (unavailable loci → downgrade) instead of pre-satisfying it;
 *   - a feature with no declared loci at all comes back `unobserved`.
 * Where a real model reads meaning ("Route::post('/refund')" ⇒ refunds exist), this only matches words. It
 * exists to exercise plumbing, not to produce evidence.
 *
 * Value imports from label.ts are avoided on purpose: the CLI there dynamically imports this module while its
 * own top-level await is pending, and a static back-edge would deadlock ESM evaluation (same reasoning as
 * concepts_mock.ts). The prompt format is mirrored here and `label.test.ts` pins the two against each other.
 */
import type { MockHandler, LLMRequest } from "../llm/client.js";
import { normToken, STOPWORDS } from "./ngrams.js";

const ARTIFACT_MARKER = "===== ARTIFACT =====\n";
const AVAILABLE_MARKER = "AVAILABLE LOCI";
/** Mirrors `label.ts`'s `FEATURES_MARKER`, preceded by the `\n\n` that `renderLabelPrompt` joins with. */
const QUESTION_SEAM = "\n\nFEATURES TO JUDGE (";

export interface ParsedPrompt {
  docType: string;
  available: string[];
  features: { id: string; category: string; label: string; loci: string[] }[];
  artifact: string;
}

/**
 * Inverse of `renderLabelPrompt` — the mock reads the prompt the same way the model does.
 *
 * Follows the 2026-08-26 reordering: `header · ARTIFACT · FEATURES TO JUDGE`, i.e. the cacheable prefix
 * first and the per-batch question last. The seam is found with `lastIndexOf`, because an artifact is
 * arbitrary source text and may itself contain the words "FEATURES TO JUDGE (" — the question block is
 * always the final one. `label.test.ts` pins this against the real renderer.
 */
export function parseLabelPrompt(user: string): ParsedPrompt {
  const seam = user.lastIndexOf(QUESTION_SEAM);
  // +2 skips the "\n\n" the renderer joined with, so `stable` is byte-exactly `renderLabelPrefix(digest)`.
  const stable = seam >= 0 ? user.slice(0, seam) : user;
  const question = seam >= 0 ? user.slice(seam + 2) : user;

  const at = stable.indexOf(ARTIFACT_MARKER);
  const head = at >= 0 ? stable.slice(0, at) : stable;
  const artifact = at >= 0 ? stable.slice(at + ARTIFACT_MARKER.length) : "";
  const docType = /^DOCUMENT TYPE: (.+)$/m.exec(head)?.[1]?.trim() ?? "";

  const available: string[] = [];
  let inAvailable = false;
  for (const line of head.split("\n")) {
    if (line.startsWith(AVAILABLE_MARKER)) {
      inAvailable = true;
      continue;
    }
    if (inAvailable) {
      const m = /^ {2}- ([a-z_]+)$/.exec(line);
      if (m) available.push(m[1]!);
      else if (line.trim()) inAvailable = false;
    }
  }

  const features: ParsedPrompt["features"] = [];
  const lines = question.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = /^- ([a-z0-9_]+) \[([a-z0-9_]+)\] (.+)$/.exec(lines[i]!);
    if (!m) continue;
    const lociLine = /^ {4}loci that would reveal it: (.*)$/.exec(lines[i + 1] ?? "");
    if (!lociLine) continue;
    features.push({
      id: m[1]!,
      category: m[2]!,
      label: m[3]!,
      loci: lociLine[1]!.split(",").map((s) => s.trim()).filter(Boolean),
    });
  }
  return { docType, available, features, artifact };
}

/** Words that carry no feature identity ("the", "a", but also lexicon filler like "app" or "own"). */
const FILLER = new Set(["app", "own", "one", "each", "any", "all", "some", "more", "than", "into", "with", "without", "inside", "only", "just", "several", "named", "people", "person", "thing", "things", "real", "look", "looks", "kind", "sort"]);

export function cueTokens(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .map(normToken)
        .filter((t) => t.length > 3 && !STOPWORDS.has(t) && !FILLER.has(t)),
    ),
  ];
}

const MAX_EVIDENCE_CHARS = 200;

export interface MockLabel {
  feature_id: string;
  verdict: "present" | "absent" | "unobserved";
  evidence: string;
  loci_checked: string[];
}

/**
 * The heuristic core, exported so tests can pin it directly. `minHits` cue tokens must co-occur on one line;
 * a single long, distinctive token ("subscription", "waitlist") is enough on its own.
 */
export function mockLabelFeatures(parsed: ParsedPrompt, opts: { minHits?: number } = {}): MockLabel[] {
  const minHits = opts.minHits ?? 2;
  const lines = parsed.artifact.split("\n").map((l) => l.trim()).filter((l) => l.length > 7 && l.length < 400);
  const lineTokens = lines.map((l) => new Set(cueTokens(l)));
  return parsed.features.map((f) => {
    const cues = [...new Set([...cueTokens(f.id), ...cueTokens(f.label)])];
    let bestLine = -1;
    let bestHits = 0;
    for (let i = 0; i < lines.length; i++) {
      const tokens = lineTokens[i]!;
      let hits = 0;
      let distinctive = false;
      for (const c of cues) {
        if (!tokens.has(c)) continue;
        hits += 1;
        if (c.length >= 8) distinctive = true;
      }
      const score = distinctive ? Math.max(hits, minHits) : hits;
      if (score >= minHits && score > bestHits) {
        bestHits = score;
        bestLine = i;
      }
    }
    if (bestLine >= 0) return { feature_id: f.id, verdict: "present" as const, evidence: lines[bestLine]!.slice(0, MAX_EVIDENCE_CHARS), loci_checked: f.loci.filter((l) => parsed.available.includes(l)) };
    if (!f.loci.length) return { feature_id: f.id, verdict: "unobserved" as const, evidence: "", loci_checked: [] };
    // deliberately over-claims: reports every declared locus, available here or not, so rule 1 has work to do
    return { feature_id: f.id, verdict: "absent" as const, evidence: "", loci_checked: f.loci };
  });
}

export function mockLabelBatch(user: string): { labels: MockLabel[] } {
  return { labels: mockLabelFeatures(parseLabelPrompt(user)) };
}

/**
 * The real labeller splits its user turn into a cacheable `userPrefix` (header + artifact) and a varying
 * `user` (the feature list). Rejoining them exactly as `renderLabelPrompt` does keeps this mock reading the
 * same bytes the model reads, and keeps it working for callers that pass the whole prompt as `user`.
 */
export const labelMockHandlers: Record<string, MockHandler> = {
  evidence_label: (req: LLMRequest<unknown>) => mockLabelBatch(req.userPrefix ? `${req.userPrefix}\n\n${req.user}` : req.user),
};
