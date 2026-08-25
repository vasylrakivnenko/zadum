/**
 * Scripted MockLLM handlers that play a coherent invoicing app end to end — no credentials needed.
 * Used by `zadum demo --mock` and the engine tests. Handlers parse the rendered prompt inputs
 * (the same text the real model sees) so they exercise the real plumbing.
 */
import type { LLMRequest, MockHandler } from "./client.js";
import type { Draft, Plan, WorldsOut, CardOut, PatchOut, SpecFeedbackOut, SectionOut, CriticOut, ReverseOut, StoryOut, SimAnswer } from "./functions.js";

/** Tiny deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Parse the `nodesToText` block: "- id (topic; consequence N): question\n  options: a="A" | b="B"". */
export function parseNodes(user: string): { id: string; options: string[] }[] {
  const out: { id: string; options: string[] }[] = [];
  const lines = user.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = /^- ([a-z0-9_]+) \(.*; consequence [\d.]+\): /.exec(lines[i]!);
    if (m) {
      const optLine = lines[i + 1] ?? "";
      const options = [...optLine.matchAll(/([a-z0-9_]+)="/g)].map((x) => x[1]!);
      out.push({ id: m[1]!, options });
    }
  }
  return out;
}

export const invoicingDraft: Draft = {
  archetypes: ["b2b-invoicing", "crud-saas"],
  actors: [
    { name: "Bookkeeper", description: "Staff at the bookkeeping firm who prepare and send invoices" },
    { name: "Firm owner", description: "Runs the bookkeeping firm; sees everything" },
    { name: "Client", description: "A business the firm does bookkeeping for; receives and pays invoices" },
  ],
  nouns: [
    { name: "Client", description: "A business the firm bills", fields_hint: ["name", "billing email", "address", "payment terms"], example: "Acme Corp, net 30" },
    { name: "Invoice", description: "A bill sent to a client", fields_hint: ["number", "client", "line items", "total", "due date", "status"], example: "Invoice #1042 for Acme, $1,200, due Apr 2, sent" },
    { name: "Line item", description: "One billed service on an invoice", fields_hint: ["description", "quantity", "unit price", "tax"], example: "Monthly bookkeeping, 1 × $1,200" },
    { name: "Payment", description: "Money received against an invoice", fields_hint: ["amount", "date", "method", "invoice"], example: "$1,200 by bank transfer on Mar 28" },
    { name: "Service", description: "A reusable thing the firm sells", fields_hint: ["name", "default price", "tax rate"], example: "Monthly bookkeeping, $1,200" },
  ],
  actions: [
    { actor: "Bookkeeper", verb: "creates", object: "Invoice", example: "Dana drafts March's invoice for Acme" },
    { actor: "Bookkeeper", verb: "sends", object: "Invoice", example: "Dana emails invoice #1042 to Acme" },
    { actor: "Bookkeeper", verb: "records", object: "Payment", example: "Dana marks #1042 paid after the transfer arrives" },
    { actor: "Client", verb: "pays", object: "Invoice", example: "Acme pays #1042" },
    { actor: "Firm owner", verb: "reviews", object: "Invoice", example: "The owner checks overdue invoices on Monday" },
    { actor: "Bookkeeper", verb: "manages", object: "Client", example: "Dana updates Acme's billing email" },
    { actor: "Firm owner", verb: "manages", object: "Service", example: "The owner raises the monthly bookkeeping price" },
  ],
  rules: [
    { text: "A client never sees another client's invoice", kind: "access", example: "Acme's link never opens Zeta's invoice" },
    { text: "An invoice cannot be sent twice", kind: "state", example: "Clicking send again on #1042 does nothing" },
    { text: "A sent invoice's amounts never change; corrections use a credit note", kind: "integrity", example: "#1042 stays $1,200; a credit note fixes the typo" },
    { text: "Invoice numbers are sequential with no gaps", kind: "integrity", example: "#1042 is followed by #1043" },
    { text: "Only the firm owner can delete a client", kind: "access", example: "Dana can archive Acme but not delete it" },
  ],
  non_goals: [{ text: "Payroll" }, { text: "Full double-entry accounting" }, { text: "Multi-currency invoices" }],
  assumptions: [
    { text: "The firm bills its own clients (it does not send invoices on behalf of clients)" },
    { text: "Clients receive invoices by email and do not log in" },
    { text: "Payments are recorded by hand when money arrives" },
  ],
};

export const invoicingPlan: Plan = {
  not_applicable: [
    { id: "public_facing", why: "internal tool plus emails; nothing public" },
    { id: "offline", why: "office/web use only" },
  ],
  bespoke: [
    {
      id: "x1",
      topic: "who can send",
      question: "Who may send an invoice to a client?",
      options: [
        { id: "any_bookkeeper", label: "Any bookkeeper" },
        { id: "owner_approval", label: "Only after the owner approves" },
      ],
      consequence: 4,
      rationale: "changes permissions and lifecycle",
    },
  ],
  consequence_adjustments: [{ id: "payments_in_app", consequence: 5, why: "payments are central to invoicing" }],
  fixed_by_sheet: [{ id: "tenancy", option: "single_org", why: "one bookkeeping firm" }],
};

function sampler(req: LLMRequest<unknown>, call: number): WorldsOut {
  const nodes = parseNodes(req.user);
  const m = /Produce (\d+) distinct worlds/.exec(req.user);
  const count = m ? Number(m[1]) : 4;
  const batch = Number(/batch (\d+) of/.exec(req.user)?.[1] ?? 1) - 1;
  const fixed: Record<string, string> = {};
  for (const line of req.user.split("\n")) {
    const f = /^- ([a-z0-9_]+) = ([a-z0-9_]+)$/.exec(line.trim());
    if (f) fixed[f[1]!] = f[2]!;
  }
  const r = rng(hash(req.user) + call * 7919);
  const worlds: WorldsOut["worlds"] = [];
  for (let w = 0; w < count; w++) {
    // persona axis: 0 = simple solo, 1 = small firm, 2 = demanding
    const persona = (batch + w) % 3;
    const assignment: { node: string; option: string }[] = [];
    for (const n of nodes) {
      let opt: string;
      if (fixed[n.id]) opt = fixed[n.id]!;
      else {
        // bias: simple personas pick earlier options; demanding pick later
        const bias = persona === 0 ? 0.15 : persona === 1 ? 0.5 : 0.85;
        const idx = Math.min(n.options.length - 1, Math.floor(Math.max(0, Math.min(0.999, bias + (r() - 0.5) * 0.7)) * n.options.length));
        opt = n.options[idx]!;
      }
      assignment.push({ node: n.id, option: opt });
    }
    // coherence: portal ⇒ multi_user; online payments
    const get = (id: string) => assignment.find((a) => a.node === id);
    if (get("external_access")?.option === "portal") {
      const ua = get("user_accounts");
      if (ua) ua.option = "multi_user";
      const cps = get("client_portal_scope");
      if (cps && cps.option === "none") cps.option = "view_act";
    }
    if (get("payment_recording")?.option === "online_auto" || get("payment_recording")?.option === "both") {
      const p = get("payments_in_app");
      if (p) p.option = "collect_online";
    }
    worlds.push({ persona: ["solo bookkeeper, keeps it simple", "small firm with 3 staff", "growing firm wanting automation"][persona]!, weight: persona === 0 ? 5 : persona === 1 ? 4 : 2, assignment });
  }
  return { worlds };
}

function card(req: LLMRequest<unknown>): CardOut {
  const block = req.user.split("OPTIONS TO PHRASE")[1] ?? "";
  const opts = [...block.matchAll(/^- ([a-z0-9_]+): (.+)$/gm)].map((m) => ({ option_id: m[1]!, label: m[2]! }));
  const q = /DECISION: (.+?) \(topic/.exec(req.user)?.[1] ?? "This decision";
  const also = [...(req.user.split("WHAT ELSE THIS SETTLES (raw):")[1] ?? "").matchAll(/^- (.+)$/gm)].map((m) => m[1]!);
  return {
    context: `Think about a typical week at the firm — ${q.replace(/\?$/, "").toLowerCase()}.`,
    options: opts.map((o) => ({ option_id: o.option_id, scenario: `You ${o.label.charAt(0).toLowerCase()}${o.label.slice(1)}.` })),
    also_sets: also.slice(0, 4),
  };
}

function patcher(req: LLMRequest<unknown>): PatchOut {
  // the engine prefixes "other" answers with the card's question/options — strip it so heuristics only see the user's words
  const text = (req.user.split("USER SAYS:")[1] ?? "").trim().toLowerCase().replace(/^\(answering the question[^)]*\)\s*/, "");
  const blank = { ref: "", name: "", description: "", fields_hint: [] as string[], example: "", actor: "", verb: "", object: "", text: "", kind: "" as const, id: "", chosen: "", rationale: "", option_id: "", option_label: "" };
  const ops: PatchOut["ops"] = [];
  if (/portal|log ?in|login/.test(text)) ops.push({ ...blank, op: "resolve_decision", id: "external_access", chosen: "portal", rationale: "user says clients log in" });
  if (/by email|never log/.test(text) && !/portal/.test(text)) ops.push({ ...blank, op: "resolve_decision", id: "external_access", chosen: "none" });
  const rename = /rename (.+?) to (.+?)(\.|$)/.exec(text);
  if (rename) ops.push({ ...blank, op: "modify_noun", ref: cap(rename[1]!), name: cap(rename[2]!) });
  const rule = /add (?:a )?rule:? (.+?)(\.|$)/.exec(text);
  if (rule) ops.push({ ...blank, op: "add_rule", text: cap(rule[1]!), kind: "other" });
  const remove = /remove (?:the )?(?:noun )?(.+?)(\.|$)/.exec(text);
  if (remove && !/rule/.test(remove[1]!)) ops.push({ ...blank, op: "remove_noun", ref: cap(remove[1]!) });
  const addNoun = /add (?:a |the )?(?:noun )?called (.+?)(\.|$)/.exec(text);
  if (addNoun) ops.push({ ...blank, op: "add_noun", name: cap(addNoun[1]!), description: "added by user" });
  if (/recurring/.test(text)) ops.push({ ...blank, op: "resolve_decision", id: "recurring_invoices", chosen: "yes" });
  if (/approv/.test(text)) ops.push({ ...blank, op: "resolve_decision", id: "x1", chosen: "owner_approval" });
  return { ops, notes: ops.length ? `understood ${ops.length} change(s)` : "nothing actionable" };
  function cap(s: string) {
    const t = s.trim();
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
}

/**
 * Spec feedback (the refine loop). Keyed off marker words in the diff + comments so a test can drive each of
 * the four classifications deterministically: "wrong"/"not true"/"we don't" → a wrong assumption on the named
 * decision, "we also"/"missing" → a missing element, "correct"/"right" → a confirmation, "?" → a new question.
 */
function specFeedback(req: LLMRequest<unknown>): SpecFeedbackOut {
  const feedback = req.user.split("THE OWNER'S EDITS TO THE SPEC (diff):")[1] ?? req.user.split("THE OWNER'S COMMENTS:")[1] ?? "";
  const text = feedback.toLowerCase();
  const blank = { ref: "", name: "", description: "", fields_hint: [] as string[], example: "", actor: "", verb: "", object: "", text: "", kind: "" as const, id: "", chosen: "", rationale: "", option_id: "", option_label: "" };
  const ops: SpecFeedbackOut["ops"] = [];
  const wrong: SpecFeedbackOut["wrong_assumptions"] = [];
  const missing: SpecFeedbackOut["missing_elements"] = [];
  const confirmed: string[] = [];
  const questions: SpecFeedbackOut["new_questions"] = [];
  if (/never log|don't log|do not log|no portal/.test(text)) {
    wrong.push({ node: "external_access", should_be: "none", why: "the owner says clients never log in" });
    ops.push({ ...blank, op: "resolve_decision", id: "external_access", chosen: "none", rationale: "corrected on the spec" });
  }
  const trigger = /we also|missing|forgot/.exec(text);
  if (trigger) {
    // the thing they name is the capitalized phrase after the trigger ("we also track a Purchase order" →
    // "Purchase order"); indices line up because `text` is `feedback` lowercased, not reshaped
    const rest = feedback.slice(trigger.index + trigger[0].length);
    const name = /\b([A-Z][a-z]{2,}(?: [a-z]{2,})?)\b/.exec(rest)?.[1] ?? "Purchase order";
    missing.push({ kind: "noun", text: name });
    ops.push({ ...blank, op: "add_noun", name, description: "added from spec feedback" });
  }
  if (/refund/.test(text)) questions.push({ topic: "refunds", question: "Who can issue a refund?", option_a: "Only the owner", option_b: "Anyone on the team" });
  if (/correct|that's right|looks right|confirm/.test(text)) confirmed.push("payments_in_app");
  return { ops, wrong_assumptions: wrong, missing_elements: missing, confirmed_elements: confirmed, new_questions: questions, notes: `understood ${ops.length} change(s)` };
}

function section(req: LLMRequest<unknown>): SectionOut {
  const sec = /SECTION TO WRITE: (\w+)/.exec(req.user)?.[1] ?? "section";
  const sheetBlock = (req.user.split("DESIGN SHEET:")[1] ?? "").split("\n\nDECISION LOG:")[0] ?? "";
  const pick = (label: string) => {
    const m = new RegExp(`${label}:\\n([\\s\\S]*?)(?:\\n[A-Z][A-Z -]+\\(?[^\\n]*:\\n|$)`).exec(sheetBlock + "\n");
    return (m?.[1] ?? "").split("\n").filter((l) => l.startsWith("- "));
  };
  const ids = (lines: string[]) => lines.map((l) => /\[(\w+)\]/.exec(l)?.[1]).filter(Boolean) as string[];
  const L: string[] = [];
  const traces: SectionOut["traces"] = [];
  switch (sec) {
    case "overview":
      L.push(`An invoicing app for a bookkeeping firm: staff create and send invoices, clients pay, the owner oversees. ⟨src: default⟩`);
      break;
    case "actors_permissions": {
      const acts = pick("ACTIONS");
      L.push("| Actor | Action | Object |", "|---|---|---|");
      for (const a of acts) {
        const id = /\[(\w+)\]/.exec(a)?.[1] ?? "";
        const body = a.replace(/^- \[\w+\] /, "").split(" — ")[0]!;
        const parts = body.split(" ");
        L.push(`| ${parts[0]} | ${parts.slice(1, -1).join(" ")} | ${parts.at(-1)} | ⟨src: a:${id}⟩`);
      }
      traces.push({ anchor: "permissions table", sources: ids(acts).map((i) => `a:${i}`) });
      break;
    }
    case "data_model": {
      const nouns = pick("NOUNS");
      for (const n of nouns) {
        const id = /\[(\w+)\]/.exec(n)?.[1] ?? "";
        L.push(`### ${n.replace(/^- \[\w+\] /, "").split(" — ")[0]} ⟨src: n:${id}⟩`, n.replace(/^- \[\w+\] /, ""));
      }
      traces.push({ anchor: "entities", sources: ids(nouns).map((i) => `n:${i}`) });
      break;
    }
    case "rules_invariants": {
      const rules = pick("RULES");
      for (const r of rules) {
        const id = /\[(\w+)\]/.exec(r)?.[1] ?? "";
        L.push(`- R-${id}: ${r.replace(/^- \[\w+\] \(\w+\) /, "")} — verify with a negative test. ⟨src: r:${id}⟩`);
      }
      traces.push({ anchor: "rules", sources: ids(rules).map((i) => `r:${i}`) });
      break;
    }
    case "glossary": {
      for (const n of [...pick("ACTORS"), ...pick("NOUNS")]) L.push(`- ${n.replace(/^- \[\w+\] /, "")}`);
      break;
    }
    case "non_goals_defaults": {
      for (const g of pick("NON-GOALS \\(not in v1\\)")) L.push(`- Out of scope: ${g.replace(/^- \[\w+\] /, "")}`);
      L.push("", "Defaulted decisions are listed in the decision log. ⟨src: default⟩");
      break;
    }
    default:
      L.push(`(${sec}) derived from the Sheet. ⟨src: default⟩`);
  }
  // machine-readable echo so the mock reverse can round-trip
  L.push("", `<!-- sheet-echo ${sec}\n${sheetBlock.trim()}\n-->`);
  return { markdown: L.join("\n"), traces };
}

function critic(req: LLMRequest<unknown>): CriticOut {
  const spec = req.user.split("SPECIFICATION:")[1] ?? "";
  const sheet = req.user.split("SPECIFICATION:")[0] ?? "";
  const rules = [...sheet.matchAll(/^- \[(r\d+)\] \((\w+)\) (.+?)(?: — e\.g\.|$)/gm)];
  const omissions: CriticOut["omissions"] = [];
  for (const r of rules) if (!spec.includes(r[3]!.slice(0, 30))) omissions.push({ item: r[1]!, kind: "rule", why: "rule text not found in spec" });
  const violations: CriticOut["violations"] = /PLANTED VIOLATION/.test(spec) ? [{ rule_id: "r1", severity: "high", where: "planted", why: "planted violation marker present", fix_hint: "remove it" }] : [];
  const verdict = violations.length || omissions.length ? "fail" : "pass";
  return { violations, omissions, score: verdict === "pass" ? 8.5 : 4, verdict };
}

function reverse(req: LLMRequest<unknown>): ReverseOut {
  const echo = /<!-- sheet-echo \w+\n([\s\S]*?)-->/.exec(req.user)?.[1] ?? "";
  const pick = (label: string) => {
    const m = new RegExp(`${label}:\\n([\\s\\S]*?)(?:\\n[A-Z][A-Z -]+\\(?[^\\n]*:\\n|$)`).exec(echo + "\n");
    return (m?.[1] ?? "").split("\n").filter((l) => l.startsWith("- ")).map((l) => l.replace(/^- \[\w+\] /, ""));
  };
  return {
    actors: pick("ACTORS").map((l) => ({ name: l.split(" — ")[0]!, description: l.split(" — ")[1] ?? "" })),
    nouns: pick("NOUNS").map((l) => ({ name: l.split(" — ")[0]!.split(" (fields")[0]!, description: "", fields_hint: [] })),
    actions: pick("ACTIONS").map((l) => {
      const parts = l.split(" — ")[0]!.split(" ");
      return { actor: parts[0]!, verb: parts.slice(1, -1).join(" "), object: parts.at(-1)! };
    }),
    rules: pick("RULES").map((l) => ({ text: l.replace(/^\(\w+\) /, "").split(" — e.g.")[0]!, kind: "other" as const })),
    non_goals: pick("NON-GOALS \\(not in v1\\)").map((l) => ({ text: l })),
  };
}

function story(): StoryOut {
  return {
    title: "A Monday at the firm",
    steps: [
      "Dana (bookkeeper) creates March's invoice for Acme: monthly bookkeeping, $1,200.",
      "Dana sends it; Acme's AP clerk gets an email.",
      "Acme pays by bank transfer; Dana records the payment and #1042 shows Paid.",
      "Bob from Acme tries to open Zeta's invoice link — it doesn't work.",
      "The owner reviews overdue invoices and sends a reminder to Zeta.",
    ],
    checks: ["Is it right that clients never log in?", "Is it right that only the owner can delete a client?"],
  };
}

function simUser(req: LLMRequest<unknown>): SimAnswer {
  const truth = (req.user.split("HIDDEN REQUIREMENTS")[1] ?? "").split("CARD (decision id:")[0] ?? "";
  const cardBlock = req.user.split("CARD (decision id:")[1] ?? "";
  const nodeId = /^\s*([a-z0-9_]+)\)/.exec(cardBlock)?.[1] ?? "";
  const opts = [...cardBlock.matchAll(/^- ([a-z0-9_]+): (.+)$/gm)].map((m) => m[1]!);
  const known = new RegExp(`^- ${nodeId} = ([a-z0-9_]+)$`, "m").exec(truth)?.[1];
  if (known && opts.includes(known)) return { kind: "option", option_id: known, text: "", reasoning: "known decision" };
  if (known && !opts.includes(known)) return { kind: "other", option_id: "", text: `I want: ${known.replace(/_/g, " ")}`, reasoning: "truth says something else" };
  return { kind: "you_decide", option_id: "", text: "", reasoning: "truth silent" };
}

export const invoicingMockHandlers: Record<string, MockHandler> = {
  drafter: () => invoicingDraft,
  planner: () => invoicingPlan,
  // Real rule-bank files now exist under catalogs/rule-bank/ (mined 2026-08-23) and are picked up by
  // Engine.createProject for any b2b-invoicing/booking/marketplace project unless a test overrides
  // ruleBankDir — so every existing mock test needs a handler for this fn even though it isn't testing the
  // rule bank itself. Empty additions: the safest default, and dedicated coverage lives in
  // src/engine/rule_augment.test.ts (which uses temp rule-bank dirs to exercise real suggestions).
  augment_rules: () => ({ additions: [] }),
  sampler: (req, i) => sampler(req, i),
  card: (req) => card(req),
  patcher: (req) => patcher(req),
  spec_feedback: (req) => specFeedback(req),
  // neutral likelihoods: evidence absorption becomes a no-op unless a test overrides this handler
  world_likelihoods: (req) => ({
    likelihoods: [...req.user.matchAll(/^- ([\w.]+): /gm)].map((m) => ({ world_id: m[1]!, fit: "neutral" as const })),
  }),
  verify_scenario: (req) => {
    const bundle = [...req.user.matchAll(/^- ([\w.]+) · (.+?) · (.+)$/gm)];
    return {
      scenario: `It's Tuesday morning at the firm. ${bundle.map((m) => `${m[3]!.replace(/\.$/, "")}.`).join(" ")}`,
      coverage: bundle.map((m) => ({ node_id: m[1]!, where: m[3]!.slice(0, 30) })),
    };
  },
  critic: (req) => critic(req),
  reverse: (req) => reverse(req),
  story: () => story(),
  sim_user: (req) => simUser(req),
  // gap mining (engine/gap_parse.ts). Kept inline rather than importing gapMockHandlers: llm/ importing
  // engine/ would close an ESM cycle through llm/functions — the exact deadlock class hit twice before.
  gap_decisions: () => ({
    candidates: [
      {
        id: "xg_reminder_tone",
        topic: "payments",
        question: "What tone do payment reminders take?",
        options: [{ id: "friendly", label: "Friendly nudge" }, { id: "formal", label: "Formal notice" }],
        consequence: 3,
        rationale: "the spec defaulted the reminder wording",
        section: "Key journeys",
      },
      {
        id: "xg_export_format",
        topic: "records",
        question: "What format do exported records use?",
        options: [{ id: "csv", label: "Spreadsheet (CSV)" }, { id: "pdf", label: "PDF report" }],
        consequence: 2,
        rationale: "the spec defaulted the export format",
        section: "Data model",
      },
    ],
  }),
  // IR-first lifecycles pilot: a small valid machine built from the sheet's own first noun/actor, so the
  // mechanical checks pass and the deterministic renderer exercises the real path in every mock compile.
  compile_state_machines_ir: (req) => {
    const pick = (label: string) => [...((req.user.split(`${label}:\n`)[1] ?? "").split(/\n[A-Z-]+[A-Z -]*:\n/)[0] ?? "").matchAll(/^- \[\w+\] ([^—(\n]+)/gm)].map((m) => m[1]!.trim());
    const noun = pick("NOUNS")[0] ?? "Record";
    const actor = pick("ACTORS")[0] ?? "system";
    return {
      machines: [
        {
          entity: noun,
          states: [
            { id: "draft", label: "Draft", description: "Being prepared" },
            { id: "active", label: "Active", description: "In effect" },
            { id: "closed", label: "Closed", description: "Finished" },
          ],
          initial: "draft",
          terminal: ["closed"],
          transitions: [
            { from: "draft", to: "active", trigger: "it is issued", actor, guard: "", sources: [] },
            { from: "active", to: "closed", trigger: "it completes", actor: "system", guard: "", sources: [] },
          ],
        },
      ],
    };
  },
  compile_overview: (req) => section(req),
  compile_actors_permissions: (req) => section(req),
  compile_data_model: (req) => section(req),
  compile_state_machines: (req) => section(req),
  compile_rules_invariants: (req) => section(req),
  compile_acceptance_scenarios: (req) => section(req),
  compile_journeys: (req) => section(req),
  compile_non_goals_defaults: (req) => section(req),
  compile_glossary: (req) => section(req),
};
