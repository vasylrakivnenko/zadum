import { describe, it, expect } from "vitest";
import { THOROUGHNESS_PRESETS, isThoroughness, thoroughnessSelectorOverrides, thoroughnessCompileOverrides } from "./thoroughness.js";
import { DEFAULT_THETA } from "./selector.js";

describe("isThoroughness", () => {
  it("accepts exactly the three levels", () => {
    expect(isThoroughness("quick")).toBe(true);
    expect(isThoroughness("standard")).toBe(true);
    expect(isThoroughness("thorough")).toBe(true);
    expect(isThoroughness("Quick")).toBe(false);
    expect(isThoroughness("")).toBe(false);
    expect(isThoroughness("max")).toBe(false);
  });
});

describe("thoroughnessSelectorOverrides", () => {
  it("standard reproduces today's shipped defaults exactly (no behavior change for existing callers)", () => {
    for (const scoring of ["risk", "weighted_entropy", "joint_entropy"] as const) {
      const o = thoroughnessSelectorOverrides("standard", scoring);
      expect(o.theta).toBe(DEFAULT_THETA[scoring]);
      expect(o.maxCards).toBe(12);
    }
  });

  it("quick raises theta (stops sooner) and lowers the card cap; thorough does the opposite", () => {
    for (const scoring of ["risk", "weighted_entropy", "joint_entropy"] as const) {
      const quick = thoroughnessSelectorOverrides("quick", scoring);
      const standard = thoroughnessSelectorOverrides("standard", scoring);
      const thorough = thoroughnessSelectorOverrides("thorough", scoring);
      expect(quick.theta).toBeGreaterThan(standard.theta);
      expect(thorough.theta).toBeLessThan(standard.theta);
      expect(quick.maxCards).toBeLessThan(standard.maxCards);
      expect(thorough.maxCards).toBeGreaterThan(standard.maxCards);
    }
  });

  it("never exceeds the hard cap-worthy range (thorough stays reasonable, quick stays >= 1)", () => {
    for (const level of ["quick", "standard", "thorough"] as const) {
      const o = thoroughnessSelectorOverrides(level, "weighted_entropy");
      expect(o.maxCards).toBeGreaterThanOrEqual(1);
      expect(o.maxCards).toBeLessThanOrEqual(24);
      expect(o.theta).toBeGreaterThan(0);
    }
  });

  it("an explicit theta always wins over the preset, at every level", () => {
    for (const level of ["quick", "standard", "thorough"] as const) {
      const o = thoroughnessSelectorOverrides(level, "risk", 999);
      expect(o.theta).toBe(999);
    }
  });
});

describe("thoroughnessCompileOverrides", () => {
  it("standard reproduces today's compile defaults (candidates 1, criticLoops 1)", () => {
    expect(thoroughnessCompileOverrides("standard")).toEqual({ candidates: 1, criticLoops: 1 });
  });

  it("thorough asks for more candidates and more repair loops than quick", () => {
    const quick = thoroughnessCompileOverrides("quick");
    const thorough = thoroughnessCompileOverrides("thorough");
    expect(thorough.candidates).toBeGreaterThan(quick.candidates);
    expect(thorough.criticLoops).toBeGreaterThanOrEqual(quick.criticLoops);
  });
});

describe("THOROUGHNESS_PRESETS", () => {
  it("has exactly the three levels with positive, sane values", () => {
    expect(Object.keys(THOROUGHNESS_PRESETS).sort()).toEqual(["quick", "standard", "thorough"]);
    for (const p of Object.values(THOROUGHNESS_PRESETS)) {
      expect(p.thetaMultiplier).toBeGreaterThan(0);
      expect(p.maxCards).toBeGreaterThan(0);
      expect(p.compileCandidates).toBeGreaterThanOrEqual(1);
      expect(p.criticLoops).toBeGreaterThanOrEqual(1);
    }
  });
});
