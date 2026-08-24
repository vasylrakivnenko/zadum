/**
 * Scripted handlers so the quality harness's plumbing (order randomization, mapping-back, metric arithmetic,
 * error containment, CLI) can be tested and demoed without credentials.
 *
 * Behaviour is keyed off marker strings embedded in test spec texts:
 *   MOCK_PRECISE           — both readers derive the identical design; no builder questions
 *   MOCK_VAGUE             — the readers diverge on two aspects; builder asks 3 questions (2 blocking)
 *   MOCK_ERROR_IMPLEMENTER — the implementer call throws (error-containment path)
 *   MOCK_ERROR_BUILDER     — the builder call throws
 *   MOCK_ERROR_PAIRWISE    — the pairwise call throws
 *
 * The mock aligner does the real work of a fixture: it PARSES the FIRST/SECOND derivation blocks it is shown
 * (the same rendered format the live aligner sees) and reports first_decision/second_decision faithfully from
 * the presented order — so tests can verify that alignDerivations maps FIRST/SECOND back to reader A/B
 * correctly under both salt-coin outcomes.
 */
import type { MockHandler } from "../llm/client.js";

interface ParsedAspect {
  aspect: string;
  decision: string;
}

function parseBlock(block: string): ParsedAspect[] {
  const out: ParsedAspect[] = [];
  for (const m of block.matchAll(/^\d+\. \[(.+?)\] (.+) \((?:forced|chose)\)$/gm)) {
    out.push({ aspect: m[1]!, decision: m[2]! });
  }
  return out;
}

export const qualityMockHandlers: Record<string, MockHandler> = {
  quality_implementer: (req) => {
    const user = req.user;
    if (/MOCK_ERROR_IMPLEMENTER/.test(user)) throw new Error("mock implementer failure");
    const second = /reader2/.test(req.cacheSalt ?? "");
    if (/MOCK_PRECISE/.test(user)) {
      return {
        aspects: [
          { aspect: "invoice numbering", decision: "sequential integers per year", forced: true },
          { aspect: "auth", decision: "email plus password", forced: true },
          { aspect: "deletion", decision: "soft delete with audit trail", forced: true },
        ],
      };
    }
    if (/MOCK_VAGUE/.test(user)) {
      return {
        aspects: [
          { aspect: "invoice numbering", decision: second ? "random UUID identifiers" : "sequential integers per year", forced: false },
          { aspect: "auth", decision: "email plus password", forced: true },
          { aspect: "deletion", decision: second ? "hard delete immediately" : "soft delete with audit trail", forced: false },
          ...(second ? [] : [{ aspect: "reminders", decision: "daily digest email", forced: false }]),
        ],
      };
    }
    return { aspects: [{ aspect: "core", decision: "basic crud", forced: false }] };
  },

  quality_aligner: (req) => {
    const user = req.user;
    const firstBlock = user.split("DERIVATION SECOND:")[0] ?? "";
    const secondBlock = user.split("DERIVATION SECOND:")[1] ?? "";
    const first = parseBlock(firstBlock);
    const second = parseBlock(secondBlock);
    const bySlug = new Map<string, { f?: string; s?: string }>();
    for (const a of first) bySlug.set(a.aspect, { f: a.decision });
    for (const a of second) bySlug.set(a.aspect, { ...(bySlug.get(a.aspect) ?? {}), s: a.decision });
    const pairs = [...bySlug.entries()].map(([aspect, { f, s }]) => {
      if (f === undefined || s === undefined) {
        return { aspect, first_decision: f ?? "", second_decision: s ?? "", verdict: "unmatched" as const, consequence: 1, note: "" };
      }
      if (f === s) return { aspect, first_decision: f, second_decision: s, verdict: "agree" as const, consequence: 2, note: "" };
      return { aspect, first_decision: f, second_decision: s, verdict: "diverge_material" as const, consequence: 4, note: `different builds for ${aspect}` };
    });
    return { pairs };
  },

  quality_builder: (req) => {
    const user = req.user;
    if (/MOCK_ERROR_BUILDER/.test(user)) throw new Error("mock builder failure");
    if (/MOCK_VAGUE/.test(user)) {
      return {
        questions: [
          { q: "How should invoices be numbered?", category: "data_model", blocking: true },
          { q: "Can a sent invoice be edited?", category: "lifecycle", blocking: true },
          { q: "What happens on overpayment?", category: "edge_case", blocking: false },
        ],
      };
    }
    return { questions: [] };
  },

  quality_pairwise: (req) => {
    const user = req.user;
    if (/MOCK_ERROR_PAIRWISE/.test(user)) throw new Error("mock pairwise failure");
    const firstBlock = user.split("SPECIFICATION SECOND:")[0] ?? "";
    const secondBlock = user.split("SPECIFICATION SECOND:")[1] ?? "";
    const firstPrecise = /MOCK_PRECISE/.test(firstBlock);
    const secondPrecise = /MOCK_PRECISE/.test(secondBlock);
    const winner = firstPrecise === secondPrecise ? "tie" : firstPrecise ? "first" : "second";
    const dim = { winner, evidence: "mock evidence" };
    return {
      completeness_edge_cases: dim,
      unambiguity: dim,
      implementability: dim,
      internal_consistency: dim,
    };
  },
};
