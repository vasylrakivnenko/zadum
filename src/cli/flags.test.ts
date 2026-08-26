import { describe, expect, it } from "vitest";
import { helpRequested, parseFlags, UsageError } from "./flags.js";

const SPEC = { value: ["--out", "--limit"], boolean: ["--all", "--mock"] } as const;

describe("cli flags", () => {
  it("reads values and presence, with fallbacks", () => {
    const f = parseFlags(["--out", "dir", "--all"], SPEC);
    expect(f.value("--out")).toBe("dir");
    expect(f.value("--limit")).toBeUndefined();
    expect(f.value("--limit", "10")).toBe("10");
    expect(f.has("--all")).toBe(true);
    expect(f.has("--mock")).toBe(false);
  });

  it("rejects unknown flags, stray words and missing values the same way for every entry point", () => {
    // The point of the shared parser: label.ts and report.ts used to disagree about all three of these.
    expect(() => parseFlags(["--wat"], SPEC)).toThrow(UsageError);
    expect(() => parseFlags(["--wat"], SPEC)).toThrow(/unknown argument --wat/);
    expect(() => parseFlags(["stray"], SPEC)).toThrow(/unexpected argument stray/);
    expect(() => parseFlags(["--out"], SPEC)).toThrow(/--out needs a value/);
    expect(() => parseFlags(["--out", "--all"], SPEC)).toThrow(/--out needs a value/);
  });

  it("consumes a flag's value rather than reading it as a flag", () => {
    // "dir" is --out's value, not a stray word; "--all" after it is still a real boolean flag.
    const f = parseFlags(["--out", "dir", "--all"], SPEC);
    expect(f.value("--out")).toBe("dir");
    expect(f.has("--all")).toBe(true);
    expect(() => parseFlags(["--out", "dir", "stray"], SPEC)).toThrow(/unexpected argument stray/);
  });

  it("recognises the help flags", () => {
    expect(helpRequested(["--help"])).toBe(true);
    expect(helpRequested(["-h"])).toBe(true);
    expect(helpRequested(["--out", "dir"])).toBe(false);
  });
});
