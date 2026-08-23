/** Loads mined rule-bank files (`catalogs/rule-bank/<archetype>.json`) — see src/mining/rule_bank.ts for how they're built. */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// Import the schema-only module, not mining/rule_bank.ts (which dynamically imports back into engine/*
// in its CLI path) — see rule_bank_schema.ts's docstring for why that would deadlock.
import { RuleBankSchema, type RuleBank } from "../mining/rule_bank_schema.js";

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_RULE_BANK_DIR = path.resolve(here, "../../catalogs/rule-bank");

/** Returns null (not an error) when no bank has been mined for this archetype yet — a graceful no-op upstream. */
export async function loadRuleBank(archetype: string, dir: string = DEFAULT_RULE_BANK_DIR): Promise<RuleBank | null> {
  try {
    const raw = JSON.parse(await fs.readFile(path.join(dir, `${archetype}.json`), "utf8"));
    return RuleBankSchema.parse(raw);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}
