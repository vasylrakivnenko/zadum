/**
 * The only door to the LLM. Every call is a stateless structured function: (system, user, schema) -> parsed JSON.
 *  - AnthropicLLM: real calls via @anthropic-ai/sdk `messages.parse` + zodOutputFormat (strict JSON schema).
 *  - MockLLM: scripted responses for tests and `--mock` demos (no credentials needed).
 *  - CachedLLM: disk cache keyed by (fn, model, system, user, schema) for deterministic replays.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";

export type Tier = "strong" | "fast";
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface LLMRequest<T> {
  fn: string;
  tier: Tier;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  maxTokens?: number;
  effort?: Effort;
  /** only honored on models that still accept sampling params (e.g. Haiku 4.5) */
  temperature?: number;
  /** extra bytes mixed into the cache key (e.g. sample index) so identical prompts can yield distinct cached samples */
  cacheSalt?: string;
}

export interface LLMUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

export interface LLMResponse<T> {
  data: T;
  model: string;
  latency_ms: number;
  usage: LLMUsage;
  cached: boolean;
}

export interface LLM {
  readonly name: string;
  readonly models: ModelConfig;
  structured<T>(req: LLMRequest<T>): Promise<LLMResponse<T>>;
}

export interface ModelConfig {
  strong: string;
  fast: string;
}

/** Defaults follow the product spec: strong = Sonnet-class, fast = Haiku-class. Override via env. */
export function modelConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ModelConfig {
  return {
    strong: env.ZADUM_MODEL_STRONG?.trim() || "claude-sonnet-5",
    fast: env.ZADUM_MODEL_FAST?.trim() || "claude-haiku-4-5",
  };
}

export class LLMError extends Error {
  constructor(
    public readonly code: "refusal" | "parse" | "api" | "mock_missing",
    message: string,
    public readonly fn?: string,
  ) {
    super(message);
    this.name = "LLMError";
  }
}

/** Models on which `thinking: {type: "adaptive"}` is the on-mode (4.6+ family). */
export function supportsAdaptiveThinking(model: string): boolean {
  return /claude-(fable-5|mythos-5|opus-5|sonnet-5|opus-4-[678]|sonnet-4-6)/.test(model);
}
/** Models that reject temperature/top_p/top_k (4.7+ and the 5 family). */
export function rejectsSampling(model: string): boolean {
  return /claude-(fable-5|mythos-5|opus-5|sonnet-5|opus-4-[78])/.test(model);
}

export class AnthropicLLM implements LLM {
  readonly name = "anthropic";
  private client: Anthropic;
  constructor(
    public readonly models: ModelConfig = modelConfigFromEnv(),
    opts: { client?: Anthropic; timeoutMs?: number } = {},
  ) {
    this.client = opts.client ?? new Anthropic({ timeout: opts.timeoutMs ?? 120_000, maxRetries: 2 });
  }

  async structured<T>(req: LLMRequest<T>): Promise<LLMResponse<T>> {
    const model = req.tier === "strong" ? this.models.strong : this.models.fast;
    const adaptive = supportsAdaptiveThinking(model);
    const t0 = Date.now();
    const params: Parameters<typeof this.client.messages.parse>[0] = {
      model,
      max_tokens: req.maxTokens ?? (req.tier === "strong" ? 16_000 : 4_096),
      system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: req.user }],
      output_config: {
        format: zodOutputFormat(req.schema),
        ...(adaptive && req.effort ? { effort: req.effort } : {}),
      },
      ...(adaptive ? { thinking: { type: "adaptive" } } : {}),
      ...(!rejectsSampling(model) && req.temperature !== undefined ? { temperature: req.temperature } : {}),
    };
    let res;
    try {
      res = await this.client.messages.parse(params);
    } catch (e) {
      if (e instanceof Anthropic.APIError) throw new LLMError("api", `${req.fn}: ${e.status} ${e.message}`, req.fn);
      throw e;
    }
    if (res.stop_reason === "refusal") {
      throw new LLMError("refusal", `${req.fn}: model refused (${res.stop_details?.category ?? "unknown"})`, req.fn);
    }
    if (!res.parsed_output) {
      throw new LLMError("parse", `${req.fn}: no parseable structured output (stop_reason=${res.stop_reason})`, req.fn);
    }
    return {
      data: res.parsed_output as T,
      model: res.model,
      latency_ms: Date.now() - t0,
      usage: {
        input_tokens: res.usage.input_tokens,
        output_tokens: res.usage.output_tokens,
        cache_read_input_tokens: res.usage.cache_read_input_tokens ?? 0,
        cache_creation_input_tokens: res.usage.cache_creation_input_tokens ?? 0,
      },
      cached: false,
    };
  }
}

export type MockHandler = (req: LLMRequest<unknown>, callIndex: number) => unknown;

/** Scripted LLM: handlers keyed by fn name return plain data (validated against the request schema). */
export class MockLLM implements LLM {
  readonly name = "mock";
  readonly calls: { fn: string; tier: Tier; user: string; system: string }[] = [];
  private counts = new Map<string, number>();
  constructor(
    private handlers: Record<string, MockHandler>,
    public readonly models: ModelConfig = { strong: "mock-strong", fast: "mock-fast" },
    private latencyMs = 0,
  ) {}
  async structured<T>(req: LLMRequest<T>): Promise<LLMResponse<T>> {
    const h = this.handlers[req.fn];
    if (!h) throw new LLMError("mock_missing", `MockLLM: no handler for fn "${req.fn}"`, req.fn);
    const idx = this.counts.get(req.fn) ?? 0;
    this.counts.set(req.fn, idx + 1);
    this.calls.push({ fn: req.fn, tier: req.tier, user: req.user, system: req.system });
    const raw = await h(req as LLMRequest<unknown>, idx);
    const parsed = req.schema.safeParse(raw);
    if (!parsed.success) throw new LLMError("parse", `MockLLM(${req.fn}): handler output failed schema: ${parsed.error.message}`, req.fn);
    if (this.latencyMs) await new Promise((r) => setTimeout(r, this.latencyMs));
    return {
      data: parsed.data,
      model: req.tier === "strong" ? this.models.strong : this.models.fast,
      latency_ms: this.latencyMs,
      usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      cached: false,
    };
  }
}

/** Disk cache wrapper: deterministic replays and cheaper harness runs. */
export class CachedLLM implements LLM {
  readonly name: string;
  readonly models: ModelConfig;
  constructor(
    private inner: LLM,
    private dir: string,
  ) {
    this.name = `cached(${inner.name})`;
    this.models = inner.models;
  }
  private key<T>(req: LLMRequest<T>): string {
    const model = req.tier === "strong" ? this.models.strong : this.models.fast;
    const schema = JSON.stringify(z.toJSONSchema(req.schema));
    return createHash("sha256")
      .update([req.fn, model, req.system, req.user, schema, req.effort ?? "", String(req.temperature ?? ""), req.cacheSalt ?? ""].join("\n"))
      .digest("hex");
  }
  async structured<T>(req: LLMRequest<T>): Promise<LLMResponse<T>> {
    const file = path.join(this.dir, `${req.fn}.${this.key(req)}.json`);
    try {
      const hit = JSON.parse(await fs.readFile(file, "utf8")) as LLMResponse<T>;
      return { ...hit, cached: true, latency_ms: 0 };
    } catch {
      // cache miss
    }
    const res = await this.inner.structured(req);
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(file, JSON.stringify(res));
    return res;
  }
}

/** Run async tasks with bounded concurrency (fan-outs: world sampling, compile sections). */
export async function parallelMap<A, B>(items: A[], limit: number, fn: (a: A, i: number) => Promise<B>): Promise<B[]> {
  const out: B[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return out;
}
