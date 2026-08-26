import { describe, it, expect } from "vitest";
import { z } from "zod";
import { AnthropicFoundryLLM, signalsMissingStructuredOutputs } from "./anthropic_foundry.js";
import { LLMError, type ModelConfig } from "./client.js";
import { OpenAICompatLLM } from "./openai_client.js";
import { MODEL_ROUTES, availability, makeModel, missingCredential, routeFor, type Credentials } from "./registry.js";

const schema = z.object({ answer: z.string(), n: z.number() });

function fakeFetch(responses: { status: number; body: unknown }[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  let i = 0;
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init! });
    const r = responses[Math.min(i++, responses.length - 1)]!;
    return new Response(typeof r.body === "string" ? r.body : JSON.stringify(r.body), { status: r.status });
  }) as unknown as typeof fetch;
  return Object.assign(impl, { calls });
}

/** A fetch that throws (aborted request / DNS failure) `times` times, then answers. */
function flakyFetch(times: number, then: { status: number; body: unknown }) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init! });
    if (calls.length <= times) throw Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
    return new Response(JSON.stringify(then.body), { status: then.status });
  }) as unknown as typeof fetch;
  return Object.assign(impl, { calls });
}

/** 200 in the PRIMARY shape: structured outputs put the JSON in the text of a `text` block. */
const sOk = (data: unknown, extra: Record<string, unknown> = {}) => ({
  status: 200,
  body: { model: "claude-x", stop_reason: "end_turn", stop_details: null, content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data) }], usage: { input_tokens: 10, output_tokens: 5 }, ...extra },
});
/** 200 in the FALLBACK shape: forced tool use puts the JSON in `tool_use.input`. */
const toolOk = (input: unknown) => ({ status: 200, body: { model: "claude-x", stop_reason: "tool_use", content: [{ type: "tool_use", name: "emit_result", input }], usage: { input_tokens: 10, output_tokens: 5 } } });
/** The 400 a host that predates structured outputs returns (field-path, then complaint). */
const noStructuredOutputs = { status: 400, body: { type: "error", error: { type: "invalid_request_error", message: "output_config: Extra inputs are not permitted" } } };

function client(f: typeof fetch, models: ModelConfig = { strong: "claude-opus-4-8", fast: "claude-sonnet-4-6" }) {
  return new AnthropicFoundryLLM({ baseUrl: "https://r.services.ai.azure.com/anthropic", apiKey: "k", models, fetchImpl: f, sleep: async () => {} });
}
const bodyOf = (f: { calls: { init: RequestInit }[] }, i = 0) => JSON.parse(f.calls[i]!.init.body as string);
/** every key name anywhere in a value — used to prove `name` is nowhere inside `output_config.format` */
function keysDeep(v: unknown, out: string[] = []): string[] {
  if (Array.isArray(v)) for (const x of v) keysDeep(x, out);
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) (out.push(k), keysDeep(x, out));
  return out;
}

describe("AnthropicFoundryLLM — first-party structured outputs (primary path)", () => {
  it("asks for structured outputs, never tools, and never a `name` inside output_config.format", async () => {
    const f = fakeFetch([sOk({ answer: "Paris", n: 1 })]);
    const c = client(f);
    const res = await c.structured({ fn: "ping", tier: "strong", system: "S", user: "U", schema });
    expect(res.data).toEqual({ answer: "Paris", n: 1 });
    expect(res.usage.input_tokens).toBe(10);
    expect(c.outputMode).toBe("structured");

    const body = bodyOf(f);
    expect(f.calls[0]!.url).toBe("https://r.services.ai.azure.com/anthropic/v1/messages");
    expect(body.model).toBe("claude-opus-4-8");
    expect(body.system).toBe("S");
    // primary path: output_config, and NOT the forced-tool-use shape
    expect(body.output_config.format.type).toBe("json_schema");
    expect(body.output_config.format.schema.required).toEqual(["answer", "n"]);
    expect(body.output_config.format.schema.additionalProperties).toBe(false);
    expect(body.tools).toBeUndefined();
    expect(body.tool_choice).toBeUndefined();
    // the exact HTTP 400 this endpoint returns is `output_config.format.name: Extra inputs are not
    // permitted`, so assert on the SERIALIZED body that no `name` key exists anywhere under it. `parse`
    // (zodOutputFormat's helper function) must likewise not survive JSON.stringify.
    expect(Object.keys(body.output_config.format)).toEqual(["type", "schema"]);
    expect(keysDeep(body.output_config)).not.toContain("name");
    expect(keysDeep(body.output_config)).not.toContain("parse");
    // both auth header styles: Azure fronts differ on which they accept
    const headers = f.calls[0]!.init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("k");
    expect(headers["api-key"]).toBe("k");
    expect(headers["anthropic-version"]).toBeTruthy();
  });

  it("mirrors AnthropicLLM on thinking/effort/sampling per model", async () => {
    // claude-opus-4-8: adaptive thinking is the on-mode, and sampling params are rejected outright (400).
    const strong = fakeFetch([sOk({ answer: "a", n: 1 })]);
    await client(strong).structured({ fn: "x", tier: "strong", system: "S", user: "U", schema, effort: "medium", temperature: 0.3 });
    expect(bodyOf(strong).thinking).toEqual({ type: "adaptive" });
    expect(bodyOf(strong).output_config.effort).toBe("medium");
    expect(bodyOf(strong).temperature).toBeUndefined();

    // claude-haiku-4-5: no adaptive thinking, no `effort`, but temperature IS honoured.
    const old = fakeFetch([sOk({ answer: "a", n: 1 })]);
    await client(old, { strong: "claude-haiku-4-5", fast: "claude-haiku-4-5" }).structured({ fn: "x", tier: "strong", system: "S", user: "U", schema, effort: "medium", temperature: 0.3 });
    expect(bodyOf(old).thinking).toBeUndefined();
    expect(bodyOf(old).output_config.effort).toBeUndefined();
    expect(bodyOf(old).output_config.format.type).toBe("json_schema");
    expect(bodyOf(old).temperature).toBe(0.3);
  });

  it("picks the deployment for the requested tier", async () => {
    const f = fakeFetch([sOk({ answer: "a", n: 0 })]);
    await client(f).structured({ fn: "card", tier: "fast", system: "S", user: "U", schema });
    expect(bodyOf(f).model).toBe("claude-sonnet-4-6");
  });

  it("reads the JSON out of the text block even when thinking blocks come first", async () => {
    const f = fakeFetch([sOk({ answer: "Paris", n: 4 }, { content: [{ type: "thinking", thinking: "" }, { type: "text", text: '{"answer":"Paris","n":4}' }] })]);
    expect((await client(f).structured({ fn: "x", tier: "strong", system: "S", user: "U", schema })).data.n).toBe(4);
  });

  it("schema-validates the parsed JSON as strictly as it validated tool input", async () => {
    // Parses as JSON, violates the schema → the same LLMError("parse") the tool-use path raised.
    const bad = fakeFetch([sOk({ answer: "x", n: "not a number" })]);
    const err = await client(bad).structured({ fn: "x", tier: "strong", system: "S", user: "U", schema }).catch((e) => e as LLMError);
    expect((err as LLMError).code).toBe("parse");
    expect((err as LLMError).message).toMatch(/failed schema/);
    // A transient miss (dropped field) is re-rolled, exactly as on the fallback path.
    const flaky = fakeFetch([sOk({ answer: "x" }), sOk({ answer: "ok", n: 7 })]);
    expect((await client(flaky).structured({ fn: "x", tier: "strong", system: "S", user: "U", schema })).data.n).toBe(7);
    expect(flaky.calls.length).toBe(2);
  });

  it("retries 429/5xx, a non-JSON body and a network abort, but not a 4xx", async () => {
    const f = fakeFetch([{ status: 429, body: { error: { message: "slow" } } }, sOk({ answer: "ok", n: 2 })]);
    expect((await client(f).structured({ fn: "x", tier: "strong", system: "S", user: "U", schema })).data.n).toBe(2);
    expect(f.calls.length).toBe(2);
    // answered in prose instead of emitting JSON → transient, retried
    const prose = fakeFetch([sOk("Paris!"), sOk({ answer: "ok", n: 3 })]);
    expect((await client(prose).structured({ fn: "x", tier: "strong", system: "S", user: "U", schema })).data.n).toBe(3);
    expect(prose.calls.length).toBe(2);
    // timeout/abort: the request carries an AbortSignal, and a thrown abort is retried
    const aborted = flakyFetch(2, sOk({ answer: "ok", n: 5 }));
    expect((await client(aborted).structured({ fn: "x", tier: "strong", system: "S", user: "U", schema })).data.n).toBe(5);
    expect(aborted.calls.length).toBe(3);
    expect(aborted.calls[0]!.init.signal).toBeInstanceOf(AbortSignal);
    const bad = fakeFetch([{ status: 401, body: { error: { message: "Access denied" } } }]);
    await expect(client(bad).structured({ fn: "x", tier: "strong", system: "S", user: "U", schema })).rejects.toMatchObject({ code: "api" });
    expect(bad.calls.length).toBe(1);
  });

  it("turns stop_reason=refusal into LLMError(refusal) with the category, without retrying", async () => {
    const f = fakeFetch([{ status: 200, body: { stop_reason: "refusal", stop_details: { type: "refusal", category: "cyber" }, content: [] } }]);
    const err = await client(f).structured({ fn: "draft", tier: "strong", system: "S", user: "U", schema }).catch((e) => e as LLMError);
    expect((err as LLMError).code).toBe("refusal");
    expect((err as LLMError).message).toMatch(/refused \(cyber\)/);
    expect(f.calls.length).toBe(1);
    // no stop_details (older host): still a refusal, category unknown
    const bare = fakeFetch([{ status: 200, body: { stop_reason: "refusal", content: [] } }]);
    await expect(client(bare).structured({ fn: "draft", tier: "strong", system: "S", user: "U", schema })).rejects.toMatchObject({ code: "refusal" });
    expect(bare.calls.length).toBe(1);
  });
});

describe("AnthropicFoundryLLM — forced tool use (retained fallback)", () => {
  it("downgrades once when the host rejects output_config, and still gets strict JSON", async () => {
    const f = fakeFetch([noStructuredOutputs, toolOk({ answer: "Paris", n: 1 })]);
    const c = client(f);
    const res = await c.structured({ fn: "ping", tier: "strong", system: "S", user: "U", schema });
    expect(res.data).toEqual({ answer: "Paris", n: 1 });
    expect(res.usage.input_tokens).toBe(10);
    expect(c.outputMode).toBe("tool_use");
    expect(f.calls.length).toBe(2);

    expect(bodyOf(f, 0).output_config).toBeDefined(); // the probe
    const body = bodyOf(f, 1); // the fallback: unchanged pre-2026-08 shape
    expect(f.calls[1]!.url).toBe("https://r.services.ai.azure.com/anthropic/v1/messages");
    expect(body.model).toBe("claude-opus-4-8");
    expect(body.tool_choice).toEqual({ type: "tool", name: "emit_result" });
    expect(body.tools[0].input_schema.required).toEqual(["answer", "n"]);
    expect(body.tools[0].input_schema.additionalProperties).toBe(false);
    expect(body.system).toBe("S");
    expect(body.output_config).toBeUndefined();
    expect(body.thinking).toBeUndefined();
    const headers = f.calls[1]!.init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("k");
    expect(headers["api-key"]).toBe("k");
    expect(headers["anthropic-version"]).toBeTruthy();
  });

  it("memoises the downgrade: later calls go straight to tool use, no second probe", async () => {
    const f = fakeFetch([noStructuredOutputs, toolOk({ answer: "a", n: 1 }), toolOk({ answer: "b", n: 2 })]);
    const c = client(f);
    await c.structured({ fn: "one", tier: "strong", system: "S", user: "U", schema });
    expect(f.calls.length).toBe(2);
    expect((await c.structured({ fn: "two", tier: "strong", system: "S", user: "U", schema })).data.n).toBe(2);
    expect(f.calls.length).toBe(3); // one request, not two — the probe is not repeated
    expect(bodyOf(f, 2).output_config).toBeUndefined();
    expect(bodyOf(f, 2).tool_choice).toEqual({ type: "tool", name: "emit_result" });
    expect(c.outputMode).toBe("tool_use");
    // and a third call is still a single request
    await c.structured({ fn: "three", tier: "strong", system: "S", user: "U", schema });
    expect(f.calls.length).toBe(4);
  });

  it("does NOT downgrade on a 400 that is about our request rather than the feature", async () => {
    for (const message of ["prompt is too long: 250000 tokens > 200000 maximum", "output_config.format.schema.properties.n: Input should be a valid object"]) {
      const f = fakeFetch([{ status: 400, body: { type: "error", error: { message } } }]);
      const c = client(f);
      const err = await c.structured({ fn: "x", tier: "strong", system: "S", user: "U", schema }).catch((e) => e as LLMError);
      expect((err as LLMError).code).toBe("api");
      expect((err as LLMError).message).toContain(message);
      expect(f.calls.length).toBe(1); // surfaced, not silently re-sent
      expect(c.outputMode).toBe("undetermined"); // mode untouched
    }
  });

  it("retries a prose answer and a schema mismatch on the fallback path too", async () => {
    // Observed live: one Claude call in ~120 dropped a required array field. Unlike OpenAI `strict: true`
    // json_schema (a provider guarantee, where a mismatch is deterministic), re-rolling fixes this.
    const f = fakeFetch([noStructuredOutputs, toolOk({ answer: "x" }), toolOk({ answer: "ok", n: 7 })]);
    expect((await client(f).structured({ fn: "x", tier: "strong", system: "S", user: "U", schema })).data.n).toBe(7);
    expect(f.calls.length).toBe(3); // probe + two tool-use attempts: the downgrade did not spend a retry
    // answered in prose instead of calling the tool → transient, retried
    const prose = fakeFetch([noStructuredOutputs, { status: 200, body: { content: [{ type: "text", text: "Paris!" }], stop_reason: "end_turn" } }, toolOk({ answer: "ok", n: 3 })]);
    expect((await client(prose).structured({ fn: "x", tier: "strong", system: "S", user: "U", schema })).data.n).toBe(3);
    expect(prose.calls.length).toBe(3);
    // still fails cleanly once the retries are spent
    const always = fakeFetch([noStructuredOutputs, toolOk({ answer: "x", n: "not a number" })]);
    const err = await client(always).structured({ fn: "x", tier: "strong", system: "S", user: "U", schema }).catch((e) => e as LLMError);
    expect((err as LLMError).code).toBe("parse");
  });
});

describe("signalsMissingStructuredOutputs", () => {
  it("fires only when the host says it does not know the FIELD", () => {
    // the shape this Foundry front actually returns (verified 2026-08-25)
    expect(signalsMissingStructuredOutputs("output_config: Extra inputs are not permitted")).toBe(true);
    expect(signalsMissingStructuredOutputs("output_config.format.name: Extra inputs are not permitted")).toBe(true);
    // other plausible phrasings from other Anthropic-compatible hosts
    expect(signalsMissingStructuredOutputs("output_config is not supported on this deployment")).toBe(true);
    expect(signalsMissingStructuredOutputs("Unexpected keyword argument 'output_config'")).toBe(true);
    expect(signalsMissingStructuredOutputs("unknown field: output_format")).toBe(true);
    // our bug, not their gap — must surface
    expect(signalsMissingStructuredOutputs("prompt is too long: 250000 tokens > 200000 maximum")).toBe(false);
    expect(signalsMissingStructuredOutputs("output_config.format.schema.properties: Input should be valid")).toBe(false);
    expect(signalsMissingStructuredOutputs("max_tokens: Extra inputs are not permitted")).toBe(false);
    expect(signalsMissingStructuredOutputs("Access denied due to invalid subscription key")).toBe(false);
  });
});

describe("model registry", () => {
  const full: Credentials = { azureKey: "a", azureEndpoint: "https://old.openai.azure.com/openai/v1", foundryKey: "f", foundryEndpoint: "https://r.services.ai.azure.com", anthropicKey: "x" };

  it("routes each model to the endpoint that actually serves it", () => {
    expect(routeFor("gpt-4.1")!.provider).toBe("azure-openai");
    expect(routeFor("gpt-4o")!.provider).toBe("foundry-openai");
    expect(routeFor("Kimi-K2.5")!.provider).toBe("foundry-openai");
    expect(routeFor("claude-opus-4-8")!.provider).toBe("foundry-anthropic");
    expect(routeFor("claude-sonnet-5")!.provider).toBe("anthropic");
    expect(routeFor("nope")).toBeUndefined();
    expect(makeModel("gpt-4o", full)).toBeInstanceOf(OpenAICompatLLM);
    expect(makeModel("claude-opus-4-8", full)).toBeInstanceOf(AnthropicFoundryLLM);
    expect(makeModel("Kimi-K2.5", full)).toBeInstanceOf(OpenAICompatLLM);
  });

  it("knows the Foundry key is a different credential from the original Azure key", () => {
    // The whole reason the first multi-model attempt 401'd: same subscription, different resource, different key.
    const onlyAzure: Credentials = { azureKey: "a", azureEndpoint: "https://old.openai.azure.com/openai/v1", foundryEndpoint: "https://r.services.ai.azure.com" };
    expect(missingCredential(routeFor("gpt-4.1")!, onlyAzure)).toBeNull();
    expect(missingCredential(routeFor("gpt-4o")!, onlyAzure)).toMatch(/FOUNDRY_API_KEY/);
    expect(() => makeModel("gpt-4o", onlyAzure)).toThrow(/FOUNDRY_API_KEY/);
    expect(availability(onlyAzure).filter((r) => r.ready).map((r) => r.route.id)).toEqual(["gpt-4.1"]);
    expect(availability(full).every((r) => r.ready)).toBe(true);
  });

  it("keeps ids unique so an eval can name a model unambiguously", () => {
    expect(new Set(MODEL_ROUTES.map((m) => m.id)).size).toBe(MODEL_ROUTES.length);
  });
});

describe("max_tokens truncation is diagnosed, not reported as a JSON bug", () => {
  it("names the budget and the thinking-shares-it trap", async () => {
    // The exact shape that killed a live compile: adaptive thinking ate a 6,000-token critic budget and the
    // JSON stopped mid-string. The old message was "Unterminated string in JSON at position 350", which sent
    // the reader looking for a grammar bug instead of a budget.
    const truncated = {
      model: "claude-opus-4-8",
      stop_reason: "max_tokens",
      content: [{ type: "text", text: '{"verdict":"fail","violations":["the spec says invoices are locked' }],
      usage: { input_tokens: 10, output_tokens: 6000 },
    };
    const fetchImpl = (async () => new Response(JSON.stringify(truncated), { status: 200, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
    const llm = new AnthropicFoundryLLM({ baseUrl: "https://x/anthropic", apiKey: "k", models: { strong: "claude-opus-4-8", fast: "claude-opus-4-8" }, fetchImpl, maxRetries: 0, sleep: async () => {} });
    await expect(
      llm.structured({ fn: "critic", tier: "strong", system: "s", user: "u", schema: z.object({ verdict: z.string() }) }),
    ).rejects.toThrow(/hit max_tokens and the JSON is truncated/);
    await expect(
      llm.structured({ fn: "critic", tier: "strong", system: "s", user: "u", schema: z.object({ verdict: z.string() }) }),
    ).rejects.toThrow(/thinking tokens are drawn from the same allowance/);
  });
});
