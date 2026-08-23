/**
 * MockLLM handler for fn "concept_extract" — a deterministic stand-in for the polarity-aware extraction so the
 * stage-2 pipeline (prompt → schema → aggregation → hints → CLI) runs end to end without credentials.
 *
 * It reads the rendered prompt exactly as the model would (catalog nodes + document are in `req.user`) and
 * applies simple lexical heuristics with polarity:
 *   - an option "matches" when its content tokens (from its id/label) all occur in one sentence, and either the
 *     option is specific enough on its own (≥ 2 tokens, e.g. "credit note") or the sentence also names the node;
 *   - options with no content tokens of their own ("yes", "allowed", "both") are the node's affirmative option:
 *     they match when a sentence names the node without negation;
 *   - a sentence naming the node with a negation ("no X", "not X", "without X", "not supported", "out of scope")
 *     selects the node's negative option ("none", "no", "not_allowed", "nothing") when it has one.
 * Where a real model reads meaning ("settle in instalments" ⇒ partial payments allowed), this only matches
 * words, so it under-extracts and never paraphrases. It exists to exercise plumbing, not to produce priors.
 */
import type { MockHandler } from "../llm/client.js";
import { normToken, STOPWORDS } from "./ngrams.js";
import type { ConceptExtraction } from "./concepts.js";

// Value imports from concepts.ts are deliberately avoided: the CLI there dynamically imports this module while
// its own top-level await is pending, and a static back-edge would deadlock ESM evaluation. The prompt format
// is therefore mirrored here; `concepts.test.ts` pins the two renderers/parsers against each other.
const DOC_MARKER = "DOCUMENT:\n";

/** Parses the `renderNodesForExtraction` block: "- id: question\n  options: a=\"A\" | b=\"B\"". */
export function parseNodesFromPrompt(user: string): { id: string; options: { id: string; label: string }[] }[] {
  const out: { id: string; options: { id: string; label: string }[] }[] = [];
  const lines = user.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = /^- ([a-z0-9_]+): (.*)$/.exec(lines[i]!);
    const optLine = lines[i + 1] ?? "";
    if (!m || !optLine.startsWith("  options: ")) continue;
    out.push({ id: m[1]!, options: [...optLine.matchAll(/([a-z0-9_]+)="([^"]*)"/g)].map((x) => ({ id: x[1]!, label: x[2]! })) });
  }
  return out;
}

/** Words that appear in option ids but name no concept ("yes", "only", "both" …). */
const GENERIC = new Set(["yes", "no", "none", "not", "nothing", "allowed", "only", "both", "other", "app", "tool", "tools", "based", "like", "style", "via", "too", "first", "plus", "ours", "fixed", "simple", "detailed", "standard"]);
const NEGATION = new Set(["no", "not", "without", "never", "cannot", "can't", "won't", "don't", "doesn't", "isn't", "aren't", "nor", "excluded", "unsupported"]);
const NEGATIVE_PHRASES = ["not supported", "out of scope", "not needed", "not required", "not in scope", "no support for", "will not", "do not", "does not"];
const NEGATIVE_OPTION = /^(none|no|nothing|not_.*|never_.*)$/;

interface Sentence {
  raw: string;
  tokens: Set<string>;
  negated: boolean;
}

function contentTokens(text: string): string[] {
  return [...new Set(text.toLowerCase().split(/[^a-z0-9']+/).map(normToken).filter((t) => t.length > 1 && !STOPWORDS.has(t) && !GENERIC.has(t)))];
}

/** Raw sentences are kept for evidence quotes; tokens are normalized like stage 1 so singulars/plurals agree. */
export function splitSentences(text: string): Sentence[] {
  return text
    .replace(/^\s{0,3}#{1,6}\s+.*$/gm, "") // headings are titles, not statements
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((raw) => {
      const lower = raw.toLowerCase();
      const words = lower.split(/[^a-z0-9']+/).filter(Boolean);
      const tokens = new Set(words.map(normToken));
      const negated = words.some((w) => NEGATION.has(w)) || NEGATIVE_PHRASES.some((p) => lower.includes(p));
      return { raw, tokens, negated };
    });
}

/** Token present, allowing a stem match ("automatically" ⊇ "auto", "recorded" ⊇ "record") for longer tokens. */
function has(tokens: Set<string>, t: string): boolean {
  if (tokens.has(t)) return true;
  if (t.length < 4) return false;
  for (const x of tokens) if (x.length > t.length && x.startsWith(t)) return true;
  return false;
}
const hasAll = (tokens: Set<string>, ts: string[]) => ts.length > 0 && ts.every((t) => has(tokens, t));

export interface MockDecision {
  node_id: string;
  option_id: string;
  confidence: number;
  evidence: string;
}

/** The heuristic core, exported so tests can pin its polarity behaviour directly. */
export function mockDecide(nodes: { id: string; options: { id: string; label: string }[] }[], text: string): MockDecision[] {
  const sentences = splitSentences(text);
  const out: MockDecision[] = [];
  for (const node of nodes) {
    const nodeKey = contentTokens(node.id);
    const negativeOption = node.options.find((o) => NEGATIVE_OPTION.test(o.id));
    let best: MockDecision | null = null;
    let bestSpecificity = -1;
    for (const o of node.options) {
      if (NEGATIVE_OPTION.test(o.id)) continue;
      const idTokens = contentTokens(o.id);
      const labelTokens = contentTokens(o.label);
      for (const s of sentences) {
        let hit: { conf: number; spec: number } | null = null;
        if (idTokens.length >= 2 && hasAll(s.tokens, idTokens)) hit = { conf: 0.85, spec: idTokens.length + 1 };
        else if (idTokens.length >= 1 && hasAll(s.tokens, idTokens) && nodeKey.some((t) => has(s.tokens, t))) hit = { conf: 0.8, spec: idTokens.length };
        else if (idTokens.length === 0 && hasAll(s.tokens, nodeKey)) hit = { conf: 0.7, spec: 0 }; // affirmative option ("yes", "allowed")
        else if (labelTokens.length >= 2 && hasAll(s.tokens, labelTokens) && nodeKey.some((t) => has(s.tokens, t))) hit = { conf: 0.65, spec: labelTokens.length };
        if (!hit) continue;
        // a negated sentence is evidence for the negative option, not this one
        if (s.negated) {
          if (negativeOption && !best) {
            best = { node_id: node.id, option_id: negativeOption.id, confidence: 0.75, evidence: s.raw.slice(0, 200) };
            bestSpecificity = -0.5;
          }
          continue;
        }
        if (hit.spec > bestSpecificity) {
          best = { node_id: node.id, option_id: o.id, confidence: hit.conf, evidence: s.raw.slice(0, 200) };
          bestSpecificity = hit.spec;
        }
      }
    }
    // node named with negation and nothing positive found → negative option
    if (!best && negativeOption) {
      const neg = sentences.find((s) => s.negated && hasAll(s.tokens, nodeKey));
      if (neg) best = { node_id: node.id, option_id: negativeOption.id, confidence: 0.75, evidence: neg.raw.slice(0, 200) };
    }
    if (best) out.push(best);
  }
  return out;
}

/** Phrases that name decisions our catalogs may lack; only reported when no catalog node's id covers them. */
const NEW_CONCEPT_PHRASES: { phrase: RegExp; concept: string; value: string; why: string; coveredBy: string[] }[] = [
  { phrase: /purchase order/i, concept: "purchase_order_reference", value: "yes", why: "Clients that require a PO number reject invoices without one.", coveredBy: ["purchase_order"] },
  { phrase: /\bdeposit/i, concept: "deposit_required", value: "yes", why: "Whether money is taken up front changes the booking/invoice flow.", coveredBy: ["deposits"] },
  { phrase: /\breceipt/i, concept: "receipt_download", value: "yes", why: "Payers often need a receipt document distinct from the invoice.", coveredBy: ["receipts"] },
  { phrase: /text message|\bsms\b/i, concept: "sms_reminders", value: "yes", why: "SMS needs a provider and phone numbers on record.", coveredBy: ["sms"] },
  { phrase: /\bcancel/i, concept: "cancellation_policy", value: "yes", why: "Cancellation windows and penalties must be defined or disputes follow.", coveredBy: ["cancellation"] },
  { phrase: /block time|time off/i, concept: "staff_time_off", value: "yes", why: "Availability must exclude blocked time or double bookings occur.", coveredBy: ["time_off", "availability"] },
  { phrase: /\btemplate/i, concept: "invoice_templates", value: "yes", why: "Templates change how invoices are authored.", coveredBy: ["branding", "customization"] },
];

const ACTOR_WORDS = ["client", "customer", "staff", "firm", "business", "stylist", "owner", "admin", "accountant", "vendor", "manager", "user"];
const RULE_CUES = /\b(must|may|cannot|only|until|within|up to|forfeits|required|allowed|not)\b/i;

export function mockExtract(user: string): ConceptExtraction {
  const at = user.indexOf(DOC_MARKER);
  const text = at >= 0 ? user.slice(at + DOC_MARKER.length) : user;
  const nodes = parseNodesFromPrompt(at >= 0 ? user.slice(0, at) : user);
  const decisions = mockDecide(nodes, text);
  const sentences = splitSentences(text);
  const nodeIds = nodes.map((n) => n.id);

  const new_concepts: ConceptExtraction["new_concepts"] = [];
  for (const c of NEW_CONCEPT_PHRASES) {
    if (nodeIds.some((id) => c.coveredBy.some((k) => id.includes(k)))) continue;
    const s = sentences.find((x) => c.phrase.test(x.raw));
    if (s) new_concepts.push({ concept: c.concept, value: c.value, evidence: s.raw.slice(0, 200), why_it_matters: c.why });
  }

  const all = new Set(sentences.flatMap((s) => [...s.tokens]));
  const actors = ACTOR_WORDS.filter((a) => all.has(a));
  const freq = new Map<string, number>();
  for (const s of sentences) for (const t of s.tokens) if (t.length > 2 && !STOPWORDS.has(t) && !GENERIC.has(t) && !NEGATION.has(t) && t !== "every" && !ACTOR_WORDS.includes(t)) freq.set(t, (freq.get(t) ?? 0) + 1);
  const nouns = [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6)
    .map(([t]) => t);
  const rules = sentences.filter((s) => RULE_CUES.test(s.raw) && !s.negated).map((s) => s.raw).slice(0, 8);
  const non_goals = sentences.filter((s) => s.negated).map((s) => s.raw).slice(0, 5);
  return { decisions, new_concepts, actors, nouns, rules, non_goals };
}

export const conceptMockHandlers: Record<string, MockHandler> = {
  concept_extract: (req) => mockExtract(req.user),
};
