import { describe, it, expect } from "vitest";
import { changedHunks, renderHunks } from "./textdiff.js";

const lines = (...xs: string[]) => xs.join("\n");

describe("changedHunks", () => {
  it("finds nothing in identical texts", () => {
    expect(changedHunks("a\nb\nc", "a\nb\nc")).toEqual([]);
  });

  it("reports a single-line replacement with context", () => {
    const before = lines("one", "two", "three", "four", "five");
    const after = lines("one", "two", "THREE", "four", "five");
    const h = changedHunks(before, after);
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ line: 3, removed: ["three"], added: ["THREE"], context_before: ["one", "two"], context_after: ["four", "five"] });
  });

  it("separates two distant edits into two hunks", () => {
    const before = lines("a", "b", "c", "d", "e", "f", "g", "h", "i", "j");
    const after = lines("a", "B", "c", "d", "e", "f", "g", "h", "I", "j");
    const h = changedHunks(before, after);
    expect(h).toHaveLength(2);
    expect(h[0]!.added).toEqual(["B"]);
    expect(h[1]!.added).toEqual(["I"]);
    expect(h[1]!.line).toBe(9);
  });

  it("handles pure insertion and pure deletion", () => {
    const ins = changedHunks(lines("a", "b"), lines("a", "new", "b"));
    expect(ins).toHaveLength(1);
    expect(ins[0]).toMatchObject({ added: ["new"], removed: [] });
    const del = changedHunks(lines("a", "gone", "b"), lines("a", "b"));
    expect(del).toHaveLength(1);
    expect(del[0]).toMatchObject({ added: [], removed: ["gone"] });
  });

  it("is stable on a realistic spec edit (a rule reworded, a line deleted)", () => {
    const before = lines("# Spec", "", "## Rules", "- r1: invoices are sequential ⟨src: d:x⟩", "- r2: clients may not edit ⟨src: d:y⟩", "", "## Data model", "Invoice: id, total");
    const after = lines("# Spec", "", "## Rules", "- r1: invoice numbers never repeat ⟨src: d:x⟩", "", "## Data model", "Invoice: id, total");
    const h = changedHunks(before, after);
    expect(h).toHaveLength(1);
    expect(h[0]!.removed).toEqual(["- r1: invoices are sequential ⟨src: d:x⟩", "- r2: clients may not edit ⟨src: d:y⟩"]);
    expect(h[0]!.added).toEqual(["- r1: invoice numbers never repeat ⟨src: d:x⟩"]);
  });

  it("degrades to one replace-everything hunk on a wholesale rewrite", () => {
    const before = Array.from({ length: 2500 }, (_, i) => `old ${i}`).join("\n");
    const after = Array.from({ length: 2500 }, (_, i) => `new ${i}`).join("\n");
    const h = changedHunks(before, after);
    expect(h).toHaveLength(1);
    expect(h[0]!.removed).toHaveLength(2500);
    expect(h[0]!.added).toHaveLength(2500);
  });
});

describe("renderHunks", () => {
  it("renders unified-diff-ish text and caps its size", () => {
    const h = changedHunks(lines("a", "b", "c"), lines("a", "B", "c"));
    const out = renderHunks(h);
    expect(out).toContain("@@ line 2 @@");
    expect(out).toContain("- b");
    expect(out).toContain("+ B");
    const many = changedHunks(Array.from({ length: 400 }, (_, i) => `l${i}`).join("\n"), Array.from({ length: 400 }, (_, i) => (i % 2 ? `l${i}` : `L${i}`)).join("\n"));
    const capped = renderHunks(many, 500);
    expect(capped.length).toBeLessThan(800);
    expect(capped).toMatch(/further change\(s\) not shown/);
  });
});
