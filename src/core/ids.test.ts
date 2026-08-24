import { describe, it, expect } from "vitest";
import { nextId, idAllocator, normName, slug } from "./ids.js";

describe("normName", () => {
  // Regression: the previous implementation stripped "-es" from every "-ses" word ("expenses" → "expens",
  // never matching "expense" → "expense") and stripped the "s" off "-us" singulars ("status" → "statu",
  // never matching "statuses" → "status"). Real duplicate nouns slipped past dedup and lexical recall
  // undercounted matches wherever the vocabulary happened to end that way.
  const plurals: [string, string][] = [
    ["expense", "expenses"],
    ["house", "houses"],
    ["license", "licenses"],
    ["case", "cases"],
    ["status", "statuses"],
    ["bus", "buses"],
    ["class", "classes"],
    ["address", "addresses"],
    ["business", "businesses"],
    ["invoice", "invoices"],
    ["box", "boxes"],
    ["batch", "batches"],
    ["dish", "dishes"],
    ["policy", "policies"],
    ["category", "categories"],
    ["client", "clients"],
    ["appointment", "appointments"],
    ["note", "notes"],
    ["tie", "ties"],
    ["Invoice Line", "Invoice Lines"],
    ["staff member", "staff members"],
  ];
  it.each(plurals)("collapses %s / %s onto one key", (singular, plural) => {
    expect(normName(singular)).toBe(normName(plural));
  });

  it("keeps genuinely different business nouns apart", () => {
    const words = ["invoice", "client", "payment", "quota", "quote", "expense", "estimate", "status", "state", "role", "rule", "booking", "book", "service", "server", "price", "prize", "case", "cash", "bus", "business"];
    expect(new Set(words.map(normName)).size).toBe(words.length);
  });

  it("still normalizes case and whitespace", () => {
    expect(normName("  INVOICE  ")).toBe(normName("invoice"));
    expect(normName("Staff   Member")).toBe(normName("staff member"));
  });
});

describe("ids", () => {
  it("allocates readable ids without collisions", () => {
    expect(nextId("n", ["n1", "n3"])).toBe("n4");
    const next = idAllocator("a", ["a1"]);
    expect([next(), next()]).toEqual(["a2", "a3"]);
  });
  it("slugs names", () => {
    expect(slug("Invoice Line!")).toBe("invoice-line");
  });
});
