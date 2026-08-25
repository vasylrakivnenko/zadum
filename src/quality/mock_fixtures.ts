/**
 * Scripted handlers so the quality harness's plumbing (order randomization, mapping-back, metric arithmetic,
 * error containment, CLI) can be tested and demoed without credentials.
 *
 * Behaviour is keyed off marker strings embedded in test spec texts:
 *   MOCK_PRECISE           — both readers derive the identical design; no builder questions
 *   MOCK_LEDGER            — a spec that DECLARES its assumptions: readers agree (entropy 0), but the builder
 *                            asks 4 questions — MORE raw questions than the vague spec — of which only 1 is a
 *                            genuine gap. The fixture that proves the taxonomy fixes the raw count's inversion.
 *   MOCK_VAGUE             — the readers diverge on two aspects; builder asks 3 questions (2 blocking), all
 *                            genuine gaps
 *   MOCK_ERROR_IMPLEMENTER — the implementer call throws (error-containment path)
 *   MOCK_ERROR_BUILDER     — the builder call throws
 *   MOCK_ERROR_CLASSIFIER  — question classification (pass 2) throws; the raw questions must survive
 *   MOCK_ERROR_PAIRWISE    — the pairwise call throws
 *
 * The mock aligner does the real work of a fixture: it PARSES the FIRST/SECOND derivation blocks it is shown
 * (the same rendered format the live aligner sees) and reports first_decision/second_decision faithfully from
 * the presented order — so tests can verify that alignDerivations maps FIRST/SECOND back to reader A/B
 * correctly under both salt-coin outcomes. The mock classifier likewise parses the numbered question list and
 * labels each question AGAINST THE SPEC BLOCK it is shown, so the same question text can be a genuine gap in
 * one spec and a flagged assumption in another — exactly the distinction the live instrument must draw.
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

const DETERMINED = /MOCK_PRECISE|MOCK_LEDGER/;

export const qualityMockHandlers: Record<string, MockHandler> = {
  quality_implementer: (req) => {
    const user = req.user;
    if (/MOCK_ERROR_IMPLEMENTER/.test(user)) throw new Error("mock implementer failure");
    const second = /reader2/.test(req.cacheSalt ?? "");
    if (DETERMINED.test(user)) {
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
    if (/MOCK_LEDGER/.test(user)) {
      // The ledger makes assumptions visible, so a diligent reader asks about them: MORE questions than the
      // vague spec, and the raw count would rank this good spec last.
      return {
        questions: [
          { q: "Which identity provider should sign-in use?", category: "permissions", blocking: true },
          { q: "Should late fees compound monthly?", category: "lifecycle", blocking: false },
          { q: "How should invoices be numbered?", category: "data_model", blocking: false },
          { q: "What happens when a payment is reversed after reconciliation?", category: "edge_case", blocking: true },
        ],
      };
    }
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

  quality_question_classifier: (req) => {
    const user = req.user;
    const specBlock = user.split("THE QUESTIONS:")[0] ?? "";
    const questionBlock = user.split("THE QUESTIONS:")[1] ?? "";
    if (/MOCK_ERROR_CLASSIFIER/.test(specBlock)) throw new Error("mock classifier failure");
    const ledger = /MOCK_LEDGER/.test(specBlock);
    const labels = [...questionBlock.matchAll(/^(\d+)\. (.+)$/gm)].map((m) => {
      const index = Number(m[1]);
      const q = m[2]!;
      // Labels are a property of the SPEC, not of the question text: "how should invoices be numbered?" is a
      // genuine gap against the vague spec and an answered question against the ledger spec.
      if (ledger && /identity provider|late fees/i.test(q))
        return { index, label: "flagged_assumption" as const, evidence: "assumed · 37% confidence" };
      if (ledger && /numbered/i.test(q)) return { index, label: "answered_in_spec" as const, evidence: "sequential integers per year" };
      return { index, label: "genuine_gap" as const, evidence: "" };
    });
    return { labels };
  },

  quality_pairwise: (req) => {
    const user = req.user;
    if (/MOCK_ERROR_PAIRWISE/.test(user)) throw new Error("mock pairwise failure");
    const firstBlock = user.split("SPECIFICATION SECOND:")[0] ?? "";
    const secondBlock = user.split("SPECIFICATION SECOND:")[1] ?? "";
    const firstDetermined = DETERMINED.test(firstBlock);
    const secondDetermined = DETERMINED.test(secondBlock);
    const winner = firstDetermined === secondDetermined ? "tie" : firstDetermined ? "first" : "second";
    // flat fields, matching PairwiseOutSchema (nested objects were exactly what the live judge got wrong)
    return {
      completeness_edge_cases_winner: winner,
      completeness_edge_cases_evidence: "mock evidence",
      unambiguity_winner: winner,
      unambiguity_evidence: "mock evidence",
      implementability_winner: winner,
      implementability_evidence: "mock evidence",
      internal_consistency_winner: winner,
      internal_consistency_evidence: "mock evidence",
    };
  },
};
