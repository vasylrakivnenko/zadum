/**
 * Anthropic Messages API over a custom endpoint (Azure AI Foundry's `/anthropic` route, or any compatible
 * host) for the `LLM` interface.
 *
 * **First-party structured outputs are the primary path.** This file used to force tool use unconditionally,
 * on the documented assumption that a Foundry-hosted deployment does not expose `output_config`. That
 * assumption is stale. Verified live on 2026-08-25 against
 * `https://ai-vasyl-0670.services.ai.azure.com/anthropic` with `claude-opus-4-8`: a POST carrying
 * `output_config: { format: { type: "json_schema", schema } }` returns HTTP 200 with the JSON object in a
 * normal `text` block, and the response carries `stop_details` and `usage.output_tokens_details` — i.e. this
 * front speaks the *current* Messages API surface, not a 2024 subset. So the request is now built the way
 * `AnthropicLLM` builds it (`zodOutputFormat` + `output_config`, `thinking: {type:"adaptive"}` and `effort`
 * where the model supports them, no sampling params where the model rejects them); only the transport differs.
 *
 * Two traps this file has to remember:
 *   - **Never put `name` inside `output_config.format`.** Doing so is HTTP 400
 *     `output_config.format.name: Extra inputs are not permitted` — the opposite of OpenAI's
 *     `response_format.json_schema`, which *requires* a name (see `openai_client.ts`). `zodOutputFormat()`
 *     emits exactly `{type, schema}`, so it is used as-is rather than hand-rolled: one less way to regress,
 *     and the schema stays byte-identical to what `AnthropicLLM` sends for the same zod type.
 *   - **The JSON arrives as text.** There is no `parsed_output` on the wire — that is an SDK convenience of
 *     `messages.parse`. We `JSON.parse` the `text` block (skipping `thinking` blocks, which come first when
 *     adaptive thinking is on) and re-validate through the zod schema, exactly as strictly as the old code
 *     validated `tool_use.input`.
 *
 * **Forced tool use is the retained fallback.** The only reason this client exists is portability across
 * Anthropic-Messages-compatible hosts, and a different Foundry resource — or an older deployment behind the
 * same one — may still predate structured outputs. So a 400 saying the *feature* is unknown (see
 * `signalsMissingStructuredOutputs`) downgrades to the old shape: one tool whose `input_schema` is our zod
 * schema, `tool_choice` pinned to it, so the model must fill it in. That decision is **memoised on the
 * instance**, so the probe costs at most one wasted request per process rather than one per call. A 400 for
 * any other reason (a bad schema, a prompt that is too long) is surfaced, never silently downgraded —
 * mistaking our own bug for a missing feature would hide it behind a permanently degraded request shape.
 * `outputMode` reports which path is live, so a caller or a test can assert it.
 *
 * Auth: Foundry accepts the resource key as `x-api-key` (the Anthropic header) — `api-key` is also sent, since
 * some Azure fronts expect that instead and an extra header is harmless.
 */
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { LLMError, rejectsSampling, supportsAdaptiveThinking, userContent, type LLM, type LLMRequest, type LLMResponse, type ModelConfig } from "./client.js";
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
  /** populated only when `stop_reason === "refusal"`; `null` otherwise */
  stop_details?: { type?: string; category?: string | null; explanation?: string | null } | null;
  model?: string;
  usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
  error?: { message?: string; type?: string };
  type?: string;
}

const TOOL_NAME = "emit_result";

/** Which request shape this instance is using. `undetermined` until the first call resolves it. */
export type FoundryOutputMode = "structured" | "tool_use" | "undetermined";

/** Complaints that mean "I do not know this field", as opposed to "this field's value is wrong". */
const FIELD_NOT_RECOGNISED =
  /extra inputs are not permitted|not permitted|unrecogni[sz]ed|unknown (field|parameter|argument|key|propert)|unexpected (keyword|field|parameter|propert)|not supported|unsupported|no such (field|parameter)/i;

/**
 * Does this 400 mean the HOST cannot do structured outputs — the only 400 allowed to downgrade us to tool
 * use — or does it mean our request was bad?
 *
 * The Foundry front reports rejected fields as `<path>: <complaint>`; the observed shape (2026-08-25) is
 * `output_config.format.name: Extra inputs are not permitted`. So the test is two-part: the message must name
 * the field (`output_config`, the deprecated `output_format`, or a bare `format` path), *and* the complaint
 * must be about the field not being recognised. A complaint about what is inside our schema
 * (`output_config.format.schema…`) is our bug and is explicitly excluded: downgrading on it would send the
 * same broken schema as a tool `input_schema` and then blame the host forever.
 */
export function signalsMissingStructuredOutputs(message: string): boolean {
  if (/output_config\.format\.schema/i.test(message)) return false;
  const namesTheField = /output_config|output_format|(^|[\s"'`(])format\s*[.:]/i.test(message);
  return namesTheField && FIELD_NOT_RECOGNISED.test(message);
}

type Extracted = { ok: true; value: unknown } | { ok: false; why: string };

/**
 * Structured-output shape: the JSON is the text of a `text` block, after any `thinking` blocks.
 *
 * The `max_tokens` case gets its own message because the generic one cost real debugging time. A live compile
 * died with `critic: structured output was not JSON: Unterminated string in JSON at position 350`, which reads
 * like a grammar or encoding bug. It was neither: the critic's budget was 6,000 tokens, and **adaptive
 * thinking spends the same `max_tokens` allowance as the answer**, so on Opus a long spec left no room to
 * finish the JSON. A truncated response is not a parse problem, it is a budget problem, and the error should
 * say which knob to turn.
 */
function fromStructuredOutput(json: AnthropicMessage): Extracted {
  const block = json.content?.find((c) => c.type === "text" && typeof c.text === "string");
  if (!block || block.text === undefined) return { ok: false, why: `no text block (stop_reason=${json.stop_reason})` };
  try {
    return { ok: true, value: JSON.parse(block.text) };
  } catch (e) {
    if (json.stop_reason === "max_tokens") {
      return {
        ok: false,
        why:
          `response hit max_tokens and the JSON is truncated (${block.text.length} chars emitted) — raise this function's maxTokens. ` +
          `Note that thinking tokens are drawn from the same allowance, so a budget tuned on a non-thinking model is too small here.`,
      };
    }
    // A preamble the grammar let through, or malformed output: transient sampling failure, so retried.
    return { ok: false, why: `structured output was not JSON (stop_reason=${json.stop_reason}): ${(e as Error).message.slice(0, 120)}` };
  }
}

/** Fallback shape: the JSON is the `input` of the forced `tool_use` block. */
function fromToolUse(json: AnthropicMessage): Extracted {
  const block = json.content?.find((c) => c.type === "tool_use");
  // A model that answered in prose instead of calling the tool is a transient sampling failure.
  return block ? { ok: true, value: block.input } : { ok: false, why: `no tool_use block (stop_reason=${json.stop_reason})` };
}

export class AnthropicFoundryLLM implements LLM {
  readonly name: string;
  readonly models: ModelConfig;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  /** Memoised for the instance's lifetime: the capability probe is paid at most once per process. */
  private mode: FoundryOutputMode = "undetermined";
  constructor(private readonly opts: AnthropicFoundryOptions) {
    this.name = /azure/i.test(opts.baseUrl) ? "anthropic-foundry" : "anthropic-compat";
    this.models = opts.models;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  /** Observability: which request shape is live. `undetermined` until a call has resolved it. */
  get outputMode(): FoundryOutputMode {
    return this.mode;
  }

  private requestBody<T>(req: LLMRequest<T>, model: string, toolUse: boolean): Record<string, unknown> {
    const common = {
      model,
      max_tokens: req.maxTokens ?? (req.tier === "strong" ? 16_000 : 4_096),
      system: req.system,
      // A `userPrefix` becomes two text blocks with a cache breakpoint on the stable one (`userContent`), so
      // a large repeated artifact is read from cache instead of re-billed. Deliberately part of `common`:
      // both request shapes need it, and `cache_control` on a message content block is not a
      // structured-outputs-era field — the pre-2026-08 forced-tool-use body accepts it too.
      messages: [{ role: "user", content: userContent(req) }],
      // Same gate as `AnthropicLLM`: 4.7+ and the 5 family reject temperature/top_p/top_k with a 400, so a
      // caller's temperature is dropped rather than turned into an error. That is a property of the MODEL,
      // not of the host, so it applies to the fallback shape too.
      ...(!rejectsSampling(model) && req.temperature !== undefined ? { temperature: req.temperature } : {}),
    };
    if (toolUse) {
      // Deliberately the pre-2026-08 body, unchanged: this path exists for hosts that predate the current
      // Messages surface, so it must not acquire newer knobs (`thinking`, `effort`) they may also reject.
      return {
        ...common,
        tools: [{ name: TOOL_NAME, description: "Return the result in this exact structure.", input_schema: toStrictJsonSchema(req.schema) }],
        tool_choice: { type: "tool", name: TOOL_NAME },
      };
    }
    const adaptive = supportsAdaptiveThinking(model);
    return {
      ...common,
      // No `name` key inside `format` — see the header. `zodOutputFormat` returns `{type, schema, parse}`;
      // `parse` is a function and so is dropped by `JSON.stringify`, leaving exactly the accepted shape.
      output_config: { format: zodOutputFormat(req.schema), ...(adaptive && req.effort ? { effort: req.effort } : {}) },
      ...(adaptive ? { thinking: { type: "adaptive" } } : {}),
    };
  }

  async structured<T>(req: LLMRequest<T>): Promise<LLMResponse<T>> {
    const model = req.tier === "strong" ? this.models.strong : this.models.fast;
    const url = `${this.opts.baseUrl.replace(/\/+$/, "")}/v1/messages`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-api-key": this.opts.apiKey,
      "api-key": this.opts.apiKey,
      "anthropic-version": this.opts.anthropicVersion ?? "2023-06-01",
    };

    const maxRetries = this.opts.maxRetries ?? 3;
    const t0 = Date.now();
    let lastErr: LLMError | null = null;
    // `attempt` counts retries of the SAME request shape. The one-time structured-output downgrade below
    // deliberately spends neither an attempt nor a backoff: the request was valid, the host just can't serve it.
    let attempt = 0;
    const again = async (): Promise<boolean> => {
      if (attempt >= maxRetries) return false;
      await this.sleep(backoff(attempt++));
      return true;
    };

    for (;;) {
      const toolUse = this.mode === "tool_use";
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs ?? 180_000);
      let res: Response;
      try {
        res = await this.fetchImpl(url, { method: "POST", headers, body: JSON.stringify(this.requestBody(req, model, toolUse)), signal: controller.signal });
      } catch (e) {
        clearTimeout(timer);
        lastErr = new LLMError("api", `${req.fn}: network error: ${(e as Error).message}`, req.fn);
        if (await again()) continue;
        break;
      }
      clearTimeout(timer);
      const text = await res.text();
      let json: AnthropicMessage = {};
      try {
        json = JSON.parse(text) as AnthropicMessage;
      } catch {
        /* non-JSON error body */
      }
      const detail = json.error?.message ?? text.slice(0, 200);
      if (res.status === 429 || res.status >= 500) {
        lastErr = new LLMError("api", `${req.fn}: HTTP ${res.status} ${detail}`, req.fn);
        if (await again()) continue;
        break;
      }
      if (!res.ok) {
        // The one 400 that is not fatal: this host has never heard of structured outputs. Downgrade, remember
        // it for the lifetime of this instance, and re-send as forced tool use. `!toolUse` makes this
        // unreachable a second time, so there is exactly one probe and no loop.
        if (res.status === 400 && !toolUse && signalsMissingStructuredOutputs(detail)) {
          this.mode = "tool_use";
          continue;
        }
        throw new LLMError("api", `${req.fn}: HTTP ${res.status} ${detail}`, req.fn);
      }
      if (json.stop_reason === "refusal") {
        throw new LLMError("refusal", `${req.fn}: model refused (${json.stop_details?.category ?? "unknown"})`, req.fn);
      }
      const extracted = toolUse ? fromToolUse(json) : fromStructuredOutput(json);
      if (!extracted.ok) {
        lastErr = new LLMError("parse", `${req.fn}: ${extracted.why}`, req.fn);
        if (await again()) continue;
        break;
      }
      // Retried, unlike the OpenAI adapter's schema failures. There, `strict: true` json_schema is a provider
      // GUARANTEE, so a mismatch is deterministic and retrying only burns tokens. Anthropic's `input_schema`
      // is a strong hint the model follows almost always — a dropped field is sampling variance, and
      // re-rolling fixes it. (Observed live: one Claude call omitted a required `plan` array out of ~120.)
      // Structured outputs are stricter still, but the same re-roll costs nothing when they hold.
      const parsed = req.schema.safeParse(extracted.value);
      if (!parsed.success) {
        lastErr = new LLMError("parse", `${req.fn}: output failed schema: ${parsed.error.message.slice(0, 300)}`, req.fn);
        if (await again()) continue;
        break;
      }
      if (!toolUse) this.mode = "structured";
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
