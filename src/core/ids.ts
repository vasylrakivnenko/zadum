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

/** Normalized name for duplicate detection ("Invoice" ~ "invoices" ~ " INVOICE "). */
export function normName(s: string): string {
  let n = s.trim().toLowerCase().replace(/\s+/g, " ");
  if (n.endsWith("ies")) n = n.slice(0, -3) + "y";
  else if (n.endsWith("ses") || n.endsWith("xes") || n.endsWith("ches") || n.endsWith("shes")) n = n.slice(0, -2);
  else if (n.endsWith("s") && !n.endsWith("ss")) n = n.slice(0, -1);
  return n;
}
