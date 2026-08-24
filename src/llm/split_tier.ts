/**
 * Route the two tiers to two different provider LLMs. A single provider instance points both tiers at one
 * endpoint (an Azure resource has the deployments it has — `registry.ts` makeModel is explicitly
 * single-model), which is why card latency misses Rule 5 when the only deployment is a strong-class model:
 * the fast tier needs a genuinely fast deployment, possibly on a different resource. Composing two LLMs here
 * keeps endpoint routing out of every client and every call site.
 */
import type { LLM, LLMRequest, LLMResponse, ModelConfig } from "./client.js";

export class SplitTierLLM implements LLM {
  readonly name: string;
  readonly models: ModelConfig;
  constructor(
    private readonly strong: LLM,
    private readonly fast: LLM,
  ) {
    this.name = `split(${strong.name}/${fast.name})`;
    // Each delegate serves only its own tier, so only that half of its ModelConfig is meaningful here.
    this.models = { strong: strong.models.strong, fast: fast.models.fast };
  }

  structured<T>(req: LLMRequest<T>): Promise<LLMResponse<T>> {
    return (req.tier === "fast" ? this.fast : this.strong).structured(req);
  }
}
