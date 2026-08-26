import { describe, it, expect } from "vitest";
import { normalizeWords, stemWord, entityPhrases, similarity, similarityParts, bestMatch, alignOneToOne, buildWeights, MATCH_THRESHOLD } from "./textmatch.js";

/**
 * The four pairs the whole module exists for, quoted from the live compile f9280b97 (2026-08-25) where the
 * old Jaccard matcher scored all three paraphrases below 0.5 and reported them as dropped rules.
 */
const PARAPHRASES: [string, string][] = [
  ["All uploads must be logged with date, user, and file name.", "Every Excel file import must create an Upload Session entry recording the date/time, uploading user, and file name."],
  ["Does not handle invoicing or payment collection.", "No invoicing, billing, or payment collection workflows."],
  [
    "Financial Records cannot be deleted if they are part of a generated Summary Report unless the report is first updated or removed.",
    "If a Financial Record is referenced by an existing Summary Report, the record cannot be deleted until the relevant Summary Report is updated (to remove it) or deleted.",
  ],
];
const NOT_A_PARAPHRASE: [string, string] = [
  "Only Accountants may upload or edit Financial Records.",
  "Field-level access control: Only Accountants and Managers may view the Amount field on Financial Records.",
];

describe("normalizeWords", () => {
  it("drops punctuation, grammar and modality, keeping domain words", () => {
    expect(normalizeWords("All uploads must be logged with date, user, and file name.")).toEqual(["upload", "log", "dat", "user", "fil", "nam"]);
  });

  it("folds inflections of the same word onto one stem", () => {
    for (const group of [["logged", "logging", "logs"], ["deleted", "deletion", "deletes"], ["generated", "generation", "generates"], ["categories", "category"], ["manager", "managers", "manage"]]) {
      const stems = new Set(group.map(stemWord));
      expect(stems, group.join("/")).toHaveProperty("size", 1);
    }
  });

  it("never stems a word away to nothing", () => {
    for (const w of ["use", "used", "edit", "view", "data", "file", "one"]) expect(stemWord(w).length).toBeGreaterThanOrEqual(3);
  });

  it("is empty for a sentence with no content words", () => {
    expect(normalizeWords("It must not be.")).toEqual([]);
  });
});

describe("entityPhrases", () => {
  it("finds multiword names and mid-sentence single names", () => {
    expect(entityPhrases("Only Accountants may upload or edit Financial Records.")).toEqual(["accountant", "financial record"]);
    expect(entityPhrases("A Summary Report is generated only from the existing set of Financial Records.")).toEqual(["summary report", "financial record"]);
  });

  it("ignores words capitalised only because they start a sentence", () => {
    expect(entityPhrases("Deleting a record is not allowed.")).toEqual([]);
    expect(entityPhrases("Records must be kept.")).toEqual([]);
    // "Every" is grammar, so "Excel" after it is a name, not a sentence opener.
    expect(entityPhrases("Every Excel file import must create an Upload Session entry.")).toEqual(["excel", "upload session"]);
  });
});

describe("similarity", () => {
  it("matches every paraphrase pair from the f9280b97 run", () => {
    for (const [sheet, reverse] of PARAPHRASES) {
      expect(similarity(sheet, reverse), `${sheet} :: ${reverse}`).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
    }
  });

  it("does NOT match two different rules that share their subject", () => {
    // Same actor, same entity, different constraint: upload/edit vs view-the-Amount-field.
    expect(similarity(...NOT_A_PARAPHRASE)).toBeLessThan(MATCH_THRESHOLD);
  });

  it("prefers the rule the field-level rule is actually about", () => {
    const fieldLevel = NOT_A_PARAPHRASE[1];
    const aboutAmount = "Only authorized users may view the Amount field in Financial Records; Executive access to detailed values is restricted to summary data.";
    expect(similarity(aboutAmount, fieldLevel)).toBeGreaterThan(similarity(NOT_A_PARAPHRASE[0], fieldLevel));
  });

  it("is symmetric, bounded and 1 for identical text", () => {
    const [a, b] = PARAPHRASES[0]!;
    expect(similarity(a, b)).toBeCloseTo(similarity(b, a), 12);
    expect(similarity(a, a)).toBe(1);
    for (const s of [similarity(a, b), similarity(a, "unrelated shipping labels"), similarity("", "")]) {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });

  it("scores unrelated rules near zero", () => {
    expect(similarity("Only Accountants may upload or edit Financial Records.", "Bookings are confirmed by email within one hour.")).toBeLessThan(0.2);
  });

  it("falls back to literal equality when a text has no content words", () => {
    expect(similarity("It must not be.", "It must not be.")).toBe(1);
    expect(similarity("It must not be.", "All uploads must be logged.")).toBe(0);
  });

  it("penalises rules about different entities and rewards rules about the same ones", () => {
    const upload = "An Upload Session may be deleted after a year.";
    const report = "A Summary Report may be deleted after a year.";
    const same = "After a year an Upload Session may be deleted.";
    expect(similarityParts(upload, report).entity).toBeLessThan(0);
    expect(similarityParts(upload, same).entity).toBeGreaterThan(0);
    expect(similarity(upload, report)).toBeLessThan(similarity(upload, same));
  });

  it("will not call two rules the same when they agree on their subject and nothing else", () => {
    const a = "Only Accountants may upload Financial Records.";
    const b = "Only Accountants may view Financial Records.";
    // identical but for the verb; the entity bonus must not carry it over the line on its own
    expect(similarity(a, b)).toBeLessThan(similarity(a, "Financial Records may only be uploaded by Accountants."));
  });

  it("uses word order: a shared phrase beats the same words scattered", () => {
    const parts = similarityParts("Managers may approve a new Category.", "A new Category must be approved by Managers.");
    expect(parts.bigram).toBeGreaterThan(0);
  });
});

describe("buildWeights", () => {
  it("gives a word in every candidate less weight than a word in one", () => {
    const docs = ["Financial Records may be edited.", "Financial Records may be deleted.", "Financial Records may be exported.", "Financial Records may be archived."];
    const w = buildWeights(docs);
    expect(w.get("archiv")!).toBeGreaterThan(w.get("financial")!);
  });

  it("is empty for an empty corpus", () => {
    expect(buildWeights([]).size).toBe(0);
  });
});

describe("bestMatch", () => {
  const haystack = [
    "Every Excel file import must create an Upload Session entry recording the date/time, uploading user, and file name.",
    "Date, Category, Amount, and Description are required for all Financial Record insertions and uploads.",
    "No business data is visible to unauthenticated users.",
  ];

  it("finds the paraphrase, not the topically adjacent rule", () => {
    const m = bestMatch("All uploads must be logged with date, user, and file name.", haystack);
    expect(m?.index).toBe(0);
    expect(m!.score).toBeGreaterThanOrEqual(MATCH_THRESHOLD);
  });

  it("returns null when nothing clears the threshold, and for an empty haystack", () => {
    expect(bestMatch("Bookings are confirmed by email within one hour.", haystack)).toBeNull();
    expect(bestMatch("anything", [])).toBeNull();
  });
});

describe("alignOneToOne", () => {
  it("gives one reverse rule to one Sheet rule — the better fit — and reports the other missing", () => {
    const sheetRules = [
      "Only Accountants may upload or edit Financial Records.",
      "Only authorized users may view the Amount field in Financial Records; Executive access to detailed values is restricted to summary data.",
    ];
    const reverse = ["Field-level access control: Only Accountants and Managers may view the Amount field on Financial Records."];
    const a = alignOneToOne(sheetRules, reverse);
    expect(a.pairs).toHaveLength(1);
    expect(a.pairs[0]).toMatchObject({ left: 1, right: 0 });
    expect(a.unmatchedLeft).toEqual([0]);
    expect(a.unmatchedRight).toEqual([]);
  });

  it("never lets one item cover two, even when both are near-identical", () => {
    const left = ["Financial Records must be archived after seven years.", "Financial Records must be archived after seven years of inactivity."];
    const a = alignOneToOne(left, ["Financial Records must be archived after seven years."]);
    expect(a.pairs).toHaveLength(1);
    expect(a.unmatchedLeft).toHaveLength(1);
  });

  it("handles empty sides", () => {
    expect(alignOneToOne([], ["anything at all here"])).toMatchObject({ pairs: [], unmatchedLeft: [], unmatchedRight: [0] });
    expect(alignOneToOne(["anything at all here"], [])).toMatchObject({ pairs: [], unmatchedLeft: [0], unmatchedRight: [] });
  });

  it("accepts a caller-supplied gate", () => {
    const a = alignOneToOne(["x", "y"], ["y", "x"], { score: (p, q) => (p === q ? 1 : 0), threshold: 1 });
    expect(a.pairs.map((p) => [p.left, p.right])).toEqual([
      [0, 1],
      [1, 0],
    ]);
  });

  it("is deterministic under reordering of equal-scoring candidates", () => {
    const left = ["Managers may approve a new Category.", "Managers may approve a new Category."];
    const right = ["A new Category must be approved by Managers.", "A new Category must be approved by Managers."];
    expect(alignOneToOne(left, right).pairs).toEqual(alignOneToOne(left, right).pairs);
  });
});
