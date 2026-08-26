import { describe, expect, it } from "vitest";
import { llmFromEnv, withFastTierFromEnv } from "./bootstrap.js";

/**
 * These assert the ONE thing about provider selection that had a real defect: the engine could not reach the
 * best model available on the account. `llmFromEnv` had no `foundry-anthropic` branch, so with AZURE_API_KEY
 * set the product silently ran on gpt-4.1 while the offline mining tools ran on Opus 4.8.
 */
describe("llmFromEnv model selection", () => {
  const foundry = { FOUNDRY_API_KEY: "k", FOUNDRY_ENDPOINT: "https://example.services.ai.azure.com" };

  it("ZADUM_MODEL reaches a Foundry-hosted Anthropic model — the case that was unreachable", () => {
    const llm = llmFromEnv({ ...foundry, ZADUM_MODEL: "claude-opus-4-8" } as NodeJS.ProcessEnv);
    expect(llm.models.strong).toBe("claude-opus-4-8");
  });

  it("ZADUM_MODEL wins over ZADUM_PROVIDER and over a present AZURE_API_KEY", () => {
    const llm = llmFromEnv({
      ...foundry,
      AZURE_API_KEY: "az",
      AZURE_OPENAI_ENDPOINT: "https://example.openai.azure.com/openai/v1",
      ZADUM_PROVIDER: "azure-openai",
      ZADUM_MODEL: "claude-opus-4-8",
    } as NodeJS.ProcessEnv);
    expect(llm.models.strong).toBe("claude-opus-4-8");
  });

  it("without ZADUM_MODEL the previous behaviour is unchanged", () => {
    const llm = llmFromEnv({ ANTHROPIC_API_KEY: "sk-x" } as NodeJS.ProcessEnv);
    expect(llm.name).toContain("anthropic");
  });

  it("trims and ignores an empty ZADUM_MODEL rather than throwing", () => {
    const llm = llmFromEnv({ ANTHROPIC_API_KEY: "sk-x", ZADUM_MODEL: "   " } as NodeJS.ProcessEnv);
    expect(llm.name).toContain("anthropic");
  });

  it("still composes with the fast-tier split", () => {
    const base = llmFromEnv({ ...foundry, ZADUM_MODEL: "claude-opus-4-8" } as NodeJS.ProcessEnv);
    const split = withFastTierFromEnv(base, { ...foundry, ZADUM_FAST_MODEL: "claude-sonnet-4-6" } as NodeJS.ProcessEnv);
    expect(split.models.strong).toBe("claude-opus-4-8");
    expect(split.models.fast).toBe("claude-sonnet-4-6");
  });
});
