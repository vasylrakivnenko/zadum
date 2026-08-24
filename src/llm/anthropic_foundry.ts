/**
 * Anthropic Messages API over a custom endpoint (Azure AI Foundry's `/anthropic` route, or any compatible
 * host) for the `LLM` interface.
 *
 * Why not reuse `AnthropicLLM`: that one calls `client.messages.parse` with `output_config` + `zodOutputFormat`
 * — first-party structured outputs, which a Foundry-hosted deployment does not necessarily expose. Forced
 * **tool use** is the portable way to get strict JSON out of any Anthropic-Messages endpoint: declare one tool
 * whose `input_schema` is our zod schema, then `tool_choice` that tool, and the model must fill it in. Same
 * conservative JSON-schema subset as ADR-011, so no schema work is needed.
 *
 * Auth: Foundry accepts the resource key as `x-api-key` (the Anthropic header) — `api-key` is also sent, since
 * some Azure fronts expect that instead and an extra header is harmless.
 */
import { z } from "zod";
import { LLMError, type LLM, type LLMRequest, type LLMResponse, type ModelConfig } from "./client.js";
import { toStrictJsonSchema } from "./openai_client.js";

export interface AnthropicFoundryOptions {
  /** e.g. "https://<resource>.services.ai.azure.com/anthropic" */
  baseUrl: string;
  apiKey: string;
  models: ModelConfig;
  anthropicVersion?: string;
  timeoutMs?: number;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

interface AnthropicMessage {
  content?: { type: string; input?: unknown; text?: string }[];
  stop_reason?: string;
  model?: string;
  usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
  error?: { message?: string; type?: string };
  type?: string;
}

const TOOL_NAME = "emit_result";

export class AnthropicFoundryLLM implements LLM {
  readonly name: string;
  readonly models: ModelConfig;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  constructor(private readonly opts: AnthropicFoundryOptions) {
    this.name = /azure/i.test(opts.baseUrl) ? "anthropic-foundry" : "anthropic-compat";
    this.models = opts.models;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async structured<T>(req: LLMRequest<T>): Promise<LLMResponse<T>> {
    const model = req.tier === "strong" ? this.models.strong : this.models.fast;
    const url = `${this.opts.baseUrl.replace(/\/+$/, "")}/v1/messages`;
    const body = {
      model,
      max_tokens: req.maxTokens ?? (req.tier === "strong" ? 16_000 : 4_096),
      system: req.system,
      messages: [{ role: "user", content: req.user }],
      tools: [{ name: TOOL_NAME, description: "Return the result in this exact structure.", input_schema: toStrictJsonSchema(req.schema) }],
      tool_choice: { type: "tool", name: TOOL_NAME },
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    };
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-api-key": this.opts.apiKey,
      "api-key": this.opts.apiKey,
      "anthropic-version": this.opts.anthropicVersion ?? "2023-06-01",
    };

    const maxRetries = this.opts.maxRetries ?? 3;
    const t0 = Date.now();
    let lastErr: LLMError | null = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs ?? 180_000);
      let res: Response;
      try {
        res = await this.fetchImpl(url, { method: "POST", headers, body: JSON.stringify(body), signal: controller.signal });
      } catch (e) {
        clearTimeout(timer);
        lastErr = new LLMError("api", `${req.fn}: network error: ${(e as Error).message}`, req.fn);
        if (attempt < maxRetries) await this.sleep(backoff(attempt));
        continue;
      }
      clearTimeout(timer);
      const text = await res.text();
      let json: AnthropicMessage = {};
      try {
        json = JSON.parse(text) as AnthropicMessage;
      } catch {
        /* non-JSON error body */
      }
      if (res.status === 429 || res.status >= 500) {
        lastErr = new LLMError("api", `${req.fn}: HTTP ${res.status} ${json.error?.message ?? text.slice(0, 200)}`, req.fn);
        if (attempt < maxRetries) await this.sleep(backoff(attempt));
        continue;
      }
      if (!res.ok) throw new LLMError("api", `${req.fn}: HTTP ${res.status} ${json.error?.message ?? text.slice(0, 200)}`, req.fn);
      if (json.stop_reason === "refusal") throw new LLMError("refusal", `${req.fn}: model refused`, req.fn);
      const toolUse = json.content?.find((c) => c.type === "tool_use");
      if (!toolUse) {
        // A model that answered in prose instead of calling the tool is a transient sampling failure.
        lastErr = new LLMError("parse", `${req.fn}: no tool_use block (stop_reason=${json.stop_reason})`, req.fn);
        if (attempt < maxRetries) {
          await this.sleep(backoff(attempt));
          continue;
        }
        throw lastErr;
      }
      // Retried, unlike the OpenAI adapter's schema failures. There, `strict: true` json_schema is a provider
      // GUARANTEE, so a mismatch is deterministic and retrying only burns tokens. Anthropic's `input_schema` is
      // a strong hint the model follows almost always — a dropped field is sampling variance, and re-rolling
      // fixes it. (Observed live: one Claude call omitted a required `plan` array out of ~120.)
      const parsed = req.schema.safeParse(toolUse.input);
      if (!parsed.success) {
        lastErr = new LLMError("parse", `${req.fn}: output failed schema: ${parsed.error.message.slice(0, 300)}`, req.fn);
        if (attempt < maxRetries) {
          await this.sleep(backoff(attempt));
          continue;
        }
        throw lastErr;
      }
      return {
        data: parsed.data,
        model: json.model ?? model,
        latency_ms: Date.now() - t0,
        usage: {
          input_tokens: json.usage?.input_tokens ?? 0,
          output_tokens: json.usage?.output_tokens ?? 0,
          cache_read_input_tokens: json.usage?.cache_read_input_tokens ?? 0,
          cache_creation_input_tokens: json.usage?.cache_creation_input_tokens ?? 0,
        },
        cached: false,
      };
    }
    throw lastErr ?? new LLMError("api", `${req.fn}: failed`, req.fn);
  }
}

function backoff(attempt: number): number {
  return 1000 * 2 ** attempt;
}

/** Typed re-export so callers can build a one-model instance without repeating the tier plumbing. */
export function anthropicFoundry(baseUrl: string, apiKey: string, model: string, extra: Partial<AnthropicFoundryOptions> = {}): AnthropicFoundryLLM {
  return new AnthropicFoundryLLM({ baseUrl, apiKey, models: { strong: model, fast: model }, ...extra });
}

/** Small helper for tests/mocks that need a zod schema round-tripped through the tool shape. */
export function toolInputSchema(schema: z.ZodType): Record<string, unknown> {
  return toStrictJsonSchema(schema);
}
