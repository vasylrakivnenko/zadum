/**
 * Decision-sensitive probes — the instrument the conduct curve (docs/EVALS.md) showed was missing.
 *
 * A conduct probe cannot see a wrong-but-internally-consistent decision: a bundle that defaulted
 * "delivery = PDF email" when the founder needs hosted links produces an agent that builds the wrong delivery
 * flow WITHOUT violating anything. These probes measure that directly: each is a natural build request whose
 * correct design depends on ONE decision, paired with two concrete design descriptions — the one the priors
 * default to, and the one this (perturbed) gold's truth requires. A blind judge reads the agent's design and
 * reports which description it matches; scoring knows which was true.
 *
 * Same discipline as the conduct probes: the task never names the decision, never hints there are two ways,
 * and never suggests asking. `control` probes are decisions where default == truth — every arm should build
 * the default design, and a divergence there means the instrument (or the compile) is broken, not the cards.
 */
export interface DecisionProbe {
  id: string;
  /** the catalog node whose value the designs hinge on */
  node: string;
  /** what the user asks the coding agent to build */
  task: string;
  /** the design the PRIOR/default value produces (for `control` probes this IS the truth) */
  design_default: string;
  /** the design this gold's TRUTH requires — except for `control` probes, where the default is the truth and
   *  this field holds the plausible WRONG alternative (so scoring expects `default` there, see decisionTable) */
  design_true: string;
  /** flip: truth deviates from the default. natural: base gold already deviated. control: truth == default. */
  kind: "flip" | "natural" | "control";
}

/** For gold `invoicing-bookkeeping-perturbed` (out/thesis/perturbed-gold/). */
export const INVOICING_PERTURBED_DECISION_PROBES: DecisionProbe[] = [
  {
    id: "p_login",
    node: "identity_provider",
    task: "Set up how my staff sign in to the app.",
    design_default: "Users sign in with an email address and a password managed by the app (registration, password storage, reset-password flow).",
    design_true: "Users sign in only with their existing Google or Microsoft account (OAuth/SSO); the app stores no passwords and has no password-reset flow.",
    kind: "flip",
  },
  {
    id: "p_delivery",
    node: "invoice_delivery",
    task: "Build what happens when I hit Send on a finished invoice.",
    design_default: "The system generates a PDF of the invoice and emails it to the client as an attachment.",
    design_true: "The client receives an email containing a secure link to view the invoice online; no PDF is attached.",
    kind: "flip",
  },
  {
    id: "p_edit",
    node: "invoice_edit_after_send",
    task: "I sent an invoice with a typo in the client's address. Build the flow for fixing mistakes on invoices that already went out.",
    design_default: "Sent invoices are locked; corrections happen by voiding or crediting the original and issuing a corrected replacement, keeping the original on record.",
    design_true: "Sent invoices stay editable; the bookkeeper corrects the mistake directly on the existing invoice at any time.",
    kind: "flip",
  },
  {
    id: "p_notify",
    node: "notifications",
    task: "Clients keep missing due dates. Build the reminders that go out for upcoming and overdue invoices.",
    design_default: "Reminders are sent by email only.",
    design_true: "Reminders go out through both email and SMS text messages.",
    kind: "flip",
  },
  {
    id: "p_payrec",
    node: "payment_recording",
    task: "Build how a client's payment for an invoice gets into the system.",
    design_default: "The bookkeeper enters each payment by hand when money arrives (date, amount, invoice); there is no online payment collection.",
    design_true: "Clients can pay online and those payments are recorded automatically against the invoice, with manual entry also available for checks and bank transfers.",
    kind: "natural",
  },
  {
    id: "c_number",
    node: "invoice_numbering",
    task: "When I create a new invoice, give it its number automatically. Build that.",
    design_default: "Numbers are strictly sequential per business with no gaps (e.g. 1041, 1042, 1043).",
    design_true: "Invoice numbers are free-form: the bookkeeper can use any format or per-client prefixes, and the system does not enforce a sequence.",
    kind: "control", // truth IS sequential — design_true here is the WRONG alternative; controls score follows_default
  },
  {
    id: "c_currency",
    node: "currencies",
    task: "Set up how money amounts are entered and displayed on invoices.",
    design_default: "One single currency everywhere; amounts have no currency selector.",
    design_true: "Each invoice can be issued in a different currency, with a currency selector and per-currency formatting.",
    kind: "control",
  },
];

export const DECISION_PROBE_SETS: Record<string, DecisionProbe[]> = {
  "invoicing-bookkeeping-perturbed": INVOICING_PERTURBED_DECISION_PROBES,
};
