/**
 * Rules beat assumptions — applied to the decision ledger, not only to the compiled spec.
 *
 * The Sheet's Rules are inviolable, and the compiler already checks the *spec* against them. Nothing checked
 * the *ledger*: on a live run an access rule and a silently-defaulted decision stood side by side saying
 * opposite things, and the ledger is what a coding agent reads as settled fact.
 *
 *   r1  (access) "Only Accountants may upload or edit Financial Records."
 *   d:record_edit_rights [defaulted 92%] -> "Only its owner/assignee and admins; others just view"
 *
 *   r6  (access) "Only authorized users may view the Amount field ...; Executive access ... is restricted ..."
 *   d:record_ownership   [defaulted 93%] -> "Everyone in the team sees everything"
 *
 * Neither is a hard-edge contradiction — the catalog has no edge between a rule and a node, and it cannot:
 * rules are free text. So this is a deliberately narrow textual check, and it is ADVISORY. It never rewrites
 * an answer: a defaulted one belongs in the owner's next review, and a resolved one is the owner's own word,
 * which Rule 3 says stands until they change it.
 */
import type { Sheet } from "./sheet.js";

export interface LedgerFinding {
  code: "rule_contradicts_default" | "rule_contradicts_answer";
  severity: "high" | "medium" | "low";
  rule_id: string;
  decision_id: string;
  message: string;
  fix_hint: string;
}

/** Permission verbs that mean the same thing for the purpose of "who may do this". */
const VERB_FAMILIES: string[][] = [
  ["view", "views", "see", "sees", "read", "reads", "access", "accesses", "visible", "viewable"],
  ["edit", "edits", "change", "changes", "update", "updates", "modify", "modifies", "correct", "corrects"],
  ["create", "creates", "add", "adds", "upload", "uploads", "import", "imports"],
  ["delete", "deletes", "remove", "removes", "archive", "archives"],
  ["approve", "approves", "sign", "signs", "authorize", "authorizes"],
  ["export", "exports", "download", "downloads"],
];

/** A rule that hands a capability to a named few. Anything broader in the ledger is worth a second look. */
const RESTRICTIVE = /\b(only|cannot|can not|must not|may not|never|restricted|prohibited|forbidden|no one|nobody)\b/i;

/** An answer that hands the same capability to everyone. */
const UNIVERSAL = /\b(everyone|anyone|all users|all staff|all members|any user|any member|every user|every member|whole team|team-wide|public)\b/i;

/** Principal sets an answer can name that are not people on the Sheet. */
const GENERIC_PRINCIPALS = /\b(owner|owners|assignee|assignees|admin|admins|administrator|administrators|creator|creators|author|authors)\b/i;

/** A decision that is explicitly about who may do something — not merely one whose answer mentions people. */
const WHO_MAY = /\bwho (can|may|is allowed|are allowed|should be able)\b/i;

function words(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/** Sheets name an actor "Accountant" and rules say "Accountants" — match them anyway. */
function stems(s: string): Set<string> {
  return new Set(words(s).map((w) => (w.length > 3 ? w.replace(/e?s$/, "") : w)));
}

/** The verb families a piece of text touches. */
function families(text: string): Set<number> {
  const ws = new Set(words(text));
  const out = new Set<number>();
  VERB_FAMILIES.forEach((fam, i) => {
    if (fam.some((v) => ws.has(v))) out.add(i);
  });
  return out;
}

/** Index of the view/see/read family in VERB_FAMILIES. */
const VIEW_FAMILY = 0;
/** "view-only" / "read-only" GRANT viewing while withholding everything else. */
const VIEW_GRANTED_RE = /\b(?:view|read)[\s-]only\b/i;

/**
 * The families a rule actually withholds.
 *
 * "Budgets are view-only to Executives; only Finance Managers update targets" restricts *updating* and
 * explicitly *permits* viewing — but it contains both "view" and "only", so a naive read called it a
 * restriction on seeing and flagged "Everyone in the team sees everything" as a contradiction. It is not.
 */
function restrictedFamilies(ruleText: string): Set<number> {
  const fams = families(ruleText);
  if (VIEW_GRANTED_RE.test(ruleText)) fams.delete(VIEW_FAMILY);
  return fams;
}

function shares(a: Set<number>, b: Set<number>): boolean {
  for (const x of a) if (b.has(x)) return true;
  return false;
}

/**
 * Settled decisions that grant more than a restrictive access rule allows.
 *
 * Two arms, both deliberately narrow — a first, looser version fired six times on one real Sheet and only two
 * were real ("the same fields for everyone" and "anyone @mentioned" are not permission grants; an answer's
 * question must not be allowed to supply the verb its answer lacks):
 *
 *   A. the answer names EVERYONE and carries a permission verb itself, in a family the rule restricts.
 *      "Everyone in the team sees everything" against "Only authorized users may view the Amount field".
 *   B. the decision explicitly asks WHO MAY do something, the rule answers that for named people on the
 *      Sheet, and the answer hands it instead to a generic principal set the Sheet has no actor for.
 *      "Only its owner/assignee and admins" against "Only Accountants may upload or edit".
 *
 * At most one finding per decision: the first restrictive rule that catches it, in Sheet order. Two rules
 * flagging the same answer is one problem, not two.
 */
export function ruleContradictions(sheet: Sheet): LedgerFinding[] {
  const actorStems = new Set(sheet.actors.flatMap((a) => [...stems(a.name)]));
  const out: LedgerFinding[] = [];
  const seen = new Set<string>();
  for (const rule of sheet.rules) {
    if (rule.kind !== "access" || !RESTRICTIVE.test(rule.text)) continue;
    const ruleFams = restrictedFamilies(rule.text);
    if (!ruleFams.size) continue;
    const ruleStems = stems(rule.text);
    const ruleNamesAnActor = sheet.actors.some((a) => [...stems(a.name)].some((w) => ruleStems.has(w)));
    for (const d of sheet.decisions) {
      if (!d.chosen || d.status === "open" || d.status === "skipped" || seen.has(d.id)) continue;
      const label = d.options.find((o) => o.id === d.chosen)?.label ?? "";
      if (!label) continue;
      // Arm A: the verb must be in the ANSWER. Letting the question supply it turns every "…or can admins
      // add their own?" into a permission grant.
      const universal = UNIVERSAL.test(label) && shares(ruleFams, families(label));
      // Arm B: a generic principal set only counts when the decision is asking who may act and the rule
      // already answered that for real people — otherwise "an admin invites them" reads as a contradiction.
      const foreign =
        WHO_MAY.test(d.question) &&
        GENERIC_PRINCIPALS.test(label) &&
        ruleNamesAnActor &&
        ![...stems(label)].some((w) => actorStems.has(w)) &&
        shares(ruleFams, families(`${d.question} ${label}`));
      if (!universal && !foreign) continue;
      seen.add(d.id);
      const answered = d.status === "resolved";
      const how = answered ? "answered" : `assumed${d.confidence !== undefined ? ` at ${Math.round(d.confidence * 100)}%` : ""}`;
      out.push({
        code: answered ? "rule_contradicts_answer" : "rule_contradicts_default",
        severity: answered ? "high" : "medium",
        rule_id: rule.id,
        decision_id: d.id,
        message: `${rule.id} (${rule.kind}) says "${rule.text}" but decision ${d.id} is ${how} as "${label}" (${d.question}) — the ledger grants what the rule withholds.`,
        fix_hint: answered
          ? `The owner answered this themselves, so the rule and the answer genuinely disagree: put it back to them and change one of the two. Do not resolve it by picking a side.`
          : `Rules beat assumptions: override ${d.id} in the defaults review so it agrees with ${rule.id}, or reword ${rule.id} if the assumption is what you meant.`,
      });
    }
  }
  const rank = (f: LedgerFinding) => (f.severity === "high" ? 0 : f.severity === "medium" ? 1 : 2);
  return out.sort((a, b) => rank(a) - rank(b) || a.rule_id.localeCompare(b.rule_id) || a.decision_id.localeCompare(b.decision_id));
}
