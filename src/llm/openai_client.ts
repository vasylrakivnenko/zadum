/**
 * OpenAI-compatible chat-completions adapter for the `LLM` interface (Azure OpenAI v1 endpoint, OpenAI, or any
 * compatible server). Structured outputs via `response_format: { type: "json_schema", strict: true }`.
 *
 * Why raw fetch: one endpoint, one shape, zero new dependencies. Our LLM-facing zod schemas are already in the
 * strict subset (ADR-011), and zod 4's `toJSONSchema` emits `additionalProperties:false` + all-required, so the
 * only transform needed is stripping `$schema`.
 *
 * Provider differences vs AnthropicLLM that matter here: no prompt caching control (Azure caches automatically on
 * long stable prefixes), `effort` is ignored (gpt-4.1 has no reasoning knob), temperature IS honoured,
 * and refusals surface as `message.refusal` or `finish_reason: "content_filter"`.
 */
import { z } from "zod";
import { LLMError, type LLM, type LLMRequest, type LLMResponse, type ModelConfig } from "./client.js";

export interface OpenAICompatOptions {
  /** e.g. "https://ldl.openai.azure.com/openai/v1" or "https://api.openai.com/v1" */
  baseUrl: string;
  apiKey: string;
  models: ModelConfig;
  /** header style: Azure accepts `api-key`, OpenAI wants `Authorization: Bearer` — we send both unless told otherwise */
  authStyle?: "both" | "bearer" | "api-key";
  timeoutMs?: number;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
  /** sleep for retry backoff — injectable for tests */
  sleep?: (ms: number) => Promise<void>;
}

/** Strip keys strict mode rejects; assert the shape our ADR-011 discipline guarantees. */
export function toStrictJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const js = z.toJSONSchema(schema) as Record<string, unknown>;
  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    const o = node as Record<string, unknown>;
    delete o.$schema;
    delete o.default;
    if (o.type === "object" && o.properties && typeof o.properties === "object") {
      const props = o.properties as Record<string, unknown>;
      o.required = Object.keys(props);
      o.additionalProperties = false;
      for (const v of Object.values(props)) walk(v);
    }
    if (o.items) walk(o.items);
    for (const k of ["anyOf", "oneOf", "allOf"]) if (Array.isArray(o[k])) for (const v of o[k] as unknown[]) walk(v);
  };
  walk(js);
  return js;
}

interface ChatCompletion {
  choices?: { message?: { content?: string | null; refusal?: string | null }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
  model?: string;
  error?: { message?: string; code?: string; type?: string };
}

export class OpenAICompatLLM implements LLM {
  readonly name: string;
  readonly models: ModelConfig;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  constructor(private readonly opts: OpenAICompatOptions) {
    this.name = /azure/i.test(opts.baseUrl) ? "azure-openai" : "openai-compat";
    this.models = opts.models;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async structured<T>(req: LLMRequest<T>): Promise<LLMResponse<T>> {
    const model = req.tier === "strong" ? this.models.strong : this.models.fast;
    const url = `${this.opts.baseUrl.replace(/\/+$/, "")}/chat/completions`;
    const body = {
      model,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.user },
      ],
      max_completion_tokens: req.maxTokens ?? (req.tier === "strong" ? 16_000 : 4_096),
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      response_format: { type: "json_schema", json_schema: { name: safeName(req.fn), strict: true, schema: toStrictJsonSchema(req.schema) } },
    };
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const style = this.opts.authStyle ?? "both";
    if (style !== "bearer") headers["api-key"] = this.opts.apiKey;
    if (style !== "api-key") headers.Authorization = `Bearer ${this.opts.apiKey}`;

    const maxRetries = this.opts.maxRetries ?? 2;
    const t0 = Date.now();
    let lastErr: LLMError | null = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs ?? 120_000);
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
      let json: ChatCompletion = {};
      try {
        json = JSON.parse(text) as ChatCompletion;
      } catch {
        /* non-JSON error body */
      }
      if (res.status === 429 || res.status >= 500) {
        lastErr = new LLMError("api", `${req.fn}: HTTP ${res.status} ${json.error?.message ?? text.slice(0, 200)}`, req.fn);
        if (attempt < maxRetries) await this.sleep(backoff(attempt));
        continue;
      }
      if (!res.ok) throw new LLMError("api", `${req.fn}: HTTP ${res.status} ${json.error?.message ?? text.slice(0, 200)}`, req.fn);
      const choice = json.choices?.[0];
      if (!choice) throw new LLMError("parse", `${req.fn}: empty choices`, req.fn);
      if (choice.message?.refusal || choice.finish_reason === "content_filter") {
        throw new LLMError("refusal", `${req.fn}: model refused (${choice.finish_reason ?? "refusal"}): ${choice.message?.refusal ?? ""}`.trim(), req.fn);
      }
      const content = choice.message?.content;
      if (!content) throw new LLMError("parse", `${req.fn}: no content (finish_reason=${choice.finish_reason})`, req.fn);
      let raw: unknown;
      try {
        raw = JSON.parse(content);
      } catch {
        throw new LLMError("parse", `${req.fn}: content is not JSON (finish_reason=${choice.finish_reason})`, req.fn);
      }
      const parsed = req.schema.safeParse(raw);
      if (!parsed.success) throw new LLMError("parse", `${req.fn}: output failed schema: ${parsed.error.message.slice(0, 300)}`, req.fn);
      return {
        data: parsed.data,
        model: json.model ?? model,
        latency_ms: Date.now() - t0,
        usage: {
          input_tokens: json.usage?.prompt_tokens ?? 0,
          output_tokens: json.usage?.completion_tokens ?? 0,
          cache_read_input_tokens: json.usage?.prompt_tokens_details?.cached_tokens ?? 0,
          cache_creation_input_tokens: 0,
        },
        cached: false,
      };
    }
    throw lastErr ?? new LLMError("api", `${req.fn}: failed`, req.fn);
  }
}

function safeName(fn: string): string {
  return fn.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) || "output";
}
function backoff(attempt: number): number {
  return 500 * 2 ** attempt;
}

/** Build from environment: ZADUM_PROVIDER=azure-openai|openai; AZURE_API_KEY / AZURE_OPENAI_ENDPOINT; OPENAI_API_KEY / OPENAI_BASE_URL. */
export function openAICompatFromEnv(env: NodeJS.ProcessEnv = process.env): OpenAICompatLLM {
  const provider = (env.ZADUM_PROVIDER ?? "").toLowerCase();
  const azure = provider === "azure-openai" || (!provider && !!env.AZURE_API_KEY);
  const baseUrl = azure ? env.AZURE_OPENAI_ENDPOINT?.trim() || "https://ldl.openai.azure.com/openai/v1" : env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1";
  const apiKey = azure ? env.AZURE_API_KEY : env.OPENAI_API_KEY;
  if (!apiKey) throw new LLMError("api", `no API key for provider ${azure ? "azure-openai (AZURE_API_KEY)" : "openai (OPENAI_API_KEY)"}`);
  const defaultModel = azure ? "gpt-4.1" : "gpt-4.1";
  return new OpenAICompatLLM({
    baseUrl,
    apiKey,
    models: { strong: env.ZADUM_MODEL_STRONG?.trim() || defaultModel, fast: env.ZADUM_MODEL_FAST?.trim() || defaultModel },
    authStyle: azure ? "api-key" : "bearer",
  });
}
