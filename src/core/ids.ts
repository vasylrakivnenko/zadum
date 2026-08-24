/**
 * Deterministic, human-readable ids for Sheet items (n1, n2, a1, r1, ...).
 * Core code never uses randomness; callers that need opaque ids (commits, events) use crypto.randomUUID.
 */
export function nextId(prefix: string, existing: Iterable<string>): string {
  let max = 0;
  const re = new RegExp(`^${prefix}(\\d+)$`);
  for (const id of existing) {
    const m = re.exec(id);
    if (m) {
      const n = Number(m[1]);
      if (n > max) max = n;
    }
  }
  return `${prefix}${max + 1}`;
}

/** Allocate several ids in sequence without collisions. */
export function idAllocator(prefix: string, existing: Iterable<string>): () => string {
  const seen = new Set(existing);
  return () => {
    const id = nextId(prefix, seen);
    seen.add(id);
    return id;
  };
}

export function slug(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Canonical comparison KEY for duplicate detection ("Invoice" ~ "invoices" ~ " INVOICE ").
 *
 * The output is deliberately NOT a display singular — it is a key both spellings collapse onto, and callers
 * only ever compare two keys (never show one). That distinction is what makes this correct where a
 * "singularizer" cannot be: "-ses" is genuinely ambiguous in English ("statuses"→status needs -es stripped,
 * "houses"→house needs only -s), and no suffix rule can separate `bus|es` from `hous|es` without a lexicon.
 * Collapsing a trailing silent "e" as well sidesteps the ambiguity entirely: house/houses and status/statuses
 * both land on a shared key, whichever branch they took.
 *
 * Words ending in "us" (status, bonus, campus) are left alone — they are singular, and their plural "-uses"
 * reaches the same key through the "-es" branch. The earlier implementation got both of these wrong:
 * "expenses"→"expens" vs "expense"→"expense", and "status"→"statu" vs "statuses"→"status", so real duplicate
 * nouns slipped past dedup and lexical recall undercounted matches.
 */
export function normName(s: string): string {
  let n = s.trim().toLowerCase().replace(/\s+/g, " ");
  if (n.endsWith("ies") && n.length > 4) n = n.slice(0, -3) + "y";
  else if (n.endsWith("s") && !n.endsWith("ss") && !n.endsWith("us")) n = n.slice(0, n.endsWith("es") ? -2 : -1);
  if (n.endsWith("e")) n = n.slice(0, -1);
  return n;
}
