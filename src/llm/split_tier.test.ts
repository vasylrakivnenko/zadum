import { describe, it, expect } from "vitest";
import { z } from "zod";
import { SplitTierLLM } from "./split_tier.js";
import type { LLM, LLMRequest, LLMResponse } from "./client.js";
import { withFastTierFromEnv } from "../engine/bootstrap.js";

const schema = z.object({ ok: z.boolean() });

/** Minimal LLM stub that records which instance served each call. */
function stub(name: string, models: { strong: string; fast: string }): LLM & { served: string[] } {
  const served: string[] = [];
  return {
    name,
    models,
    served,
    async structured<T>(req: LLMRequest<T>): Promise<LLMResponse<T>> {
      served.push(req.fn);
      return {
        data: { ok: true } as T,
        model: req.tier === "strong" ? models.strong : models.fast,
        latency_ms: 1,
        usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        cached: false,
      };
    },
  };
}

describe("SplitTierLLM", () => {
  it("delegates by tier: strong requests to the strong LLM, fast to the fast LLM", async () => {
    const strong = stub("prov-a", { strong: "big-model", fast: "big-model" });
    const fast = stub("prov-b", { strong: "small-model", fast: "small-model" });
    const split = new SplitTierLLM(strong, fast);

    const s = await split.structured({ fn: "draft", tier: "strong", system: "S", user: "U", schema });
    const f = await split.structured({ fn: "card", tier: "fast", system: "S", user: "U", schema });

    expect(strong.served).toEqual(["draft"]);
    expect(fast.served).toEqual(["card"]);
    expect(s.model).toBe("big-model");
    expect(f.model).toBe("small-model");
  });

  it("reports each delegate's own tier in models, and a composed name", () => {
    const split = new SplitTierLLM(stub("prov-a", { strong: "big", fast: "big" }), stub("prov-b", { strong: "small", fast: "small" }));
    expect(split.models).toEqual({ strong: "big", fast: "small" });
    expect(split.name).toBe("split(prov-a/prov-b)");
  });
});

describe("withFastTierFromEnv (bootstrap wiring)", () => {
  it("returns the base LLM untouched when ZADUM_FAST_MODEL is unset", () => {
    const base = stub("prov", { strong: "m", fast: "m" });
    expect(withFastTierFromEnv(base, {})).toBe(base);
    expect(withFastTierFromEnv(base, { ZADUM_FAST_MODEL: "  " })).toBe(base);
  });

  it("splits the fast tier onto the registry model when set", () => {
    const base = stub("prov", { strong: "gpt-4.1", fast: "gpt-4.1" });
    // gpt-4o routes to the Foundry resource; a fake key is enough to construct (no network at build time).
    const llm = withFastTierFromEnv(base, { ZADUM_FAST_MODEL: "gpt-4o", LLM2_API_KEY: "k" });
    expect(llm).not.toBe(base);
    expect(llm.name).toMatch(/^split\(prov\//);
    expect(llm.models).toEqual({ strong: "gpt-4.1", fast: "gpt-4o" });
  });

  it("fails loudly on an unknown model id rather than silently keeping one deployment", () => {
    const base = stub("prov", { strong: "m", fast: "m" });
    expect(() => withFastTierFromEnv(base, { ZADUM_FAST_MODEL: "nope-9000", LLM2_API_KEY: "k" })).toThrow(/unknown model/);
  });
});
