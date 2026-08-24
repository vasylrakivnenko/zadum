/**
 * Model registry: turn a model id into an `LLM`, routed to whichever endpoint actually serves it.
 *
 * The evals need to cross MODELS with experiment arms (a judge from a different family than the agent; the
 * same probes run against several agent models), which the single `llmFromEnv()` instance cannot express —
 * it resolves one provider with a strong/fast pair. This is deliberately a flat table rather than clever
 * auto-detection: which deployment lives behind which Azure resource is deployment configuration, not
 * something to infer from a model name.
 *
 * Credentials, all from `.env` (see `.env.example`):
 *   AZURE_API_KEY + AZURE_OPENAI_ENDPOINT   — the original resource (gpt-4.1)
 *   LLM2_API_KEY (or FOUNDRY_API_KEY)       — the AI Foundry resource (gpt-4o, Kimi, Claude via /anthropic)
 *   FOUNDRY_ENDPOINT                        — its base URL (defaults to the project's Foundry resource)
 *   ANTHROPIC_API_KEY                       — Anthropic direct (claude-sonnet-5, claude-opus-5, …)
 * A Foundry resource key is NOT the same key as the original OpenAI resource's, even in one subscription.
 */
import { AnthropicLLM, type LLM, type ModelConfig } from "./client.js";
import { OpenAICompatLLM } from "./openai_client.js";
import { AnthropicFoundryLLM } from "./anthropic_foundry.js";

export type Provider = "azure-openai" | "foundry-openai" | "foundry-anthropic" | "anthropic";

export interface ModelRoute {
  id: string;
  provider: Provider;
  /** what it is, for eval reports */
  label: string;
  family: string;
  /**
   * Emits reasoning tokens that count against the completion budget, so small `maxTokens` values return
   * `finish_reason: "length"` with empty content. Sets a floor on the request (see `minCompletionTokens`).
   */
  reasoning?: boolean;
}

/** Every model the evals may name. Adding a deployment = adding a row. */
export const MODEL_ROUTES: ModelRoute[] = [
  { id: "gpt-4.1", provider: "azure-openai", label: "GPT-4.1 (Azure, original resource)", family: "openai" },
  { id: "gpt-4o", provider: "foundry-openai", label: "GPT-4o (Azure AI Foundry)", family: "openai" },
  { id: "Kimi-K2.5", provider: "foundry-openai", label: "Kimi K2.5 (Azure AI Foundry)", family: "moonshot", reasoning: true },
  { id: "claude-opus-4-8", provider: "foundry-anthropic", label: "Claude Opus 4.8 (Azure AI Foundry)", family: "anthropic" },
  { id: "claude-sonnet-4-6", provider: "foundry-anthropic", label: "Claude Sonnet 4.6 (Azure AI Foundry)", family: "anthropic" },
  { id: "claude-sonnet-5", provider: "anthropic", label: "Claude Sonnet 5 (Anthropic direct)", family: "anthropic" },
  { id: "claude-opus-5", provider: "anthropic", label: "Claude Opus 5 (Anthropic direct)", family: "anthropic" },
  { id: "claude-fable-5", provider: "anthropic", label: "Claude Fable 5 (Anthropic direct)", family: "anthropic" },
];

/** Enough headroom for a reasoning trace plus the answer; measured against Kimi K2.5, which spends 40-80 tokens thinking on a trivial prompt and far more on a real one. */
export const REASONING_TOKEN_FLOOR = 4096;

export const DEFAULT_FOUNDRY_ENDPOINT = "https://ai-vasyl-0670.services.ai.azure.com";

export function routeFor(modelId: string): ModelRoute | undefined {
  return MODEL_ROUTES.find((m) => m.id.toLowerCase() === modelId.toLowerCase());
}

export interface Credentials {
  azureKey?: string;
  azureEndpoint?: string;
  foundryKey?: string;
  foundryEndpoint?: string;
  anthropicKey?: string;
}

export function credentialsFromEnv(env: NodeJS.ProcessEnv = process.env): Credentials {
  return {
    ...(env.AZURE_API_KEY ? { azureKey: env.AZURE_API_KEY } : {}),
    ...(env.AZURE_OPENAI_ENDPOINT ? { azureEndpoint: env.AZURE_OPENAI_ENDPOINT.trim() } : {}),
    // LLM2_API_KEY is this repo's existing name for the AI Foundry resource key; FOUNDRY_API_KEY is accepted
    // as a clearer alias. It is a DIFFERENT credential from AZURE_API_KEY (different Azure resource).
    ...(env.FOUNDRY_API_KEY || env.LLM2_API_KEY ? { foundryKey: env.FOUNDRY_API_KEY || env.LLM2_API_KEY } : {}),
    foundryEndpoint: (env.FOUNDRY_ENDPOINT ?? DEFAULT_FOUNDRY_ENDPOINT).trim().replace(/\/+$/, ""),
    ...(env.ANTHROPIC_API_KEY ? { anthropicKey: env.ANTHROPIC_API_KEY } : {}),
  };
}

/** What a route needs, and whether it is present — drives the availability report and clear errors. */
export function missingCredential(route: ModelRoute, c: Credentials): string | null {
  switch (route.provider) {
    case "azure-openai":
      return c.azureKey && c.azureEndpoint ? null : "AZURE_API_KEY + AZURE_OPENAI_ENDPOINT";
    case "foundry-openai":
    case "foundry-anthropic":
      return c.foundryKey ? null : "LLM2_API_KEY (or FOUNDRY_API_KEY) — the AI Foundry resource key, NOT the same as AZURE_API_KEY";
    case "anthropic":
      return c.anthropicKey ? null : "ANTHROPIC_API_KEY";
  }
}

/** Build a single-model `LLM` (both tiers point at the same deployment — evals name one model at a time). */
export function makeModel(modelId: string, c: Credentials = credentialsFromEnv()): LLM {
  const route = routeFor(modelId);
  if (!route) throw new Error(`unknown model "${modelId}". Known: ${MODEL_ROUTES.map((m) => m.id).join(", ")}`);
  const missing = missingCredential(route, c);
  if (missing) throw new Error(`model "${modelId}" needs ${missing} in .env`);
  const models: ModelConfig = { strong: route.id, fast: route.id };
  switch (route.provider) {
    case "azure-openai":
      return new OpenAICompatLLM({ baseUrl: c.azureEndpoint!, apiKey: c.azureKey!, models, authStyle: "api-key" });
    case "foundry-openai":
      return new OpenAICompatLLM({ baseUrl: `${c.foundryEndpoint}/openai/v1`, apiKey: c.foundryKey!, models, authStyle: "api-key", ...(route.reasoning ? { minCompletionTokens: REASONING_TOKEN_FLOOR } : {}) });
    case "foundry-anthropic":
      return new AnthropicFoundryLLM({ baseUrl: `${c.foundryEndpoint}/anthropic`, apiKey: c.foundryKey!, models });
    case "anthropic":
      return new AnthropicLLM(models);
  }
}

export interface Availability {
  route: ModelRoute;
  ready: boolean;
  missing: string | null;
}

export function availability(c: Credentials = credentialsFromEnv()): Availability[] {
  return MODEL_ROUTES.map((route) => {
    const missing = missingCredential(route, c);
    return { route, ready: !missing, missing };
  });
}

export function availabilityTable(rows: Availability[]): string {
  return rows
    .map((r) => `  ${r.ready ? "✓" : "·"} ${r.route.id.padEnd(20)} ${r.route.family.padEnd(10)} ${r.ready ? "ready" : `needs ${r.missing}`}`)
    .join("\n");
}
