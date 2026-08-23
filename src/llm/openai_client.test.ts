import { describe, it, expect } from "vitest";
import { z } from "zod";
import { OpenAICompatLLM, toStrictJsonSchema, openAICompatFromEnv } from "./openai_client.js";
import { LLMError } from "./client.js";
import { DraftSchema, PatchOutSchema } from "./functions.js";

const schema = z.object({ name: z.string(), n: z.number(), kind: z.enum(["a", "b"]) });

function fakeFetch(responses: { status: number; body: unknown }[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const r = responses.shift() ?? { status: 500, body: { error: { message: "exhausted" } } };
    return new Response(typeof r.body === "string" ? r.body : JSON.stringify(r.body), { status: r.status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { impl, calls };
}

const ok = (content: unknown, extra: Record<string, unknown> = {}) => ({
  status: 200,
  body: { model: "gpt-4.1-2025-04-14", choices: [{ message: { content: JSON.stringify(content) }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 5, prompt_tokens_details: { cached_tokens: 4 } }, ...extra },
});

function client(f: ReturnType<typeof fakeFetch>, extra: Partial<ConstructorParameters<typeof OpenAICompatLLM>[0]> = {}) {
  return new OpenAICompatLLM({ baseUrl: "https://ldl.openai.azure.com/openai/v1/", apiKey: "k", models: { strong: "gpt-4.1", fast: "gpt-4.1" }, fetchImpl: f.impl, sleep: async () => {}, ...extra });
}

describe("toStrictJsonSchema", () => {
  it("emits the strict subset for our LLM-facing schemas", () => {
    for (const s of [schema, DraftSchema, PatchOutSchema]) {
      const js = toStrictJsonSchema(s) as { $schema?: string; additionalProperties?: boolean; required?: string[]; properties: Record<string, unknown> };
      expect(js.$schema).toBeUndefined();
      expect(js.additionalProperties).toBe(false);
      expect(js.required).toEqual(Object.keys(js.properties));
    }
    const patch = toStrictJsonSchema(PatchOutSchema) as { properties: { ops: { items: { required: string[]; additionalProperties: boolean } } } };
    expect(patch.properties.ops.items.additionalProperties).toBe(false);
    expect(patch.properties.ops.items.required.length).toBe(16);
  });
});

describe("OpenAICompatLLM", () => {
  it("sends a strict json_schema request and parses the reply", async () => {
    const f = fakeFetch([ok({ name: "x", n: 1, kind: "a" })]);
    const res = await client(f).structured({ fn: "drafter", tier: "strong", system: "S", user: "U", schema, temperature: 0.3, maxTokens: 123 });
    expect(res.data).toEqual({ name: "x", n: 1, kind: "a" });
    expect(res.model).toBe("gpt-4.1-2025-04-14");
    expect(res.usage).toEqual({ input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 4, cache_creation_input_tokens: 0 });
    expect(f.calls[0]!.url).toBe("https://ldl.openai.azure.com/openai/v1/chat/completions");
    const body = JSON.parse(f.calls[0]!.init.body as string);
    expect(body.model).toBe("gpt-4.1");
    expect(body.temperature).toBe(0.3);
    expect(body.max_completion_tokens).toBe(123);
    expect(body.response_format.type).toBe("json_schema");
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.response_format.json_schema.name).toBe("drafter");
    expect(body.messages[0]).toEqual({ role: "system", content: "S" });
    const headers = f.calls[0]!.init.headers as Record<string, string>;
    expect(headers["api-key"]).toBe("k");
    expect(headers.Authorization).toBe("Bearer k");
  });

  it("retries 429/5xx with backoff then succeeds; does not retry 4xx", async () => {
    const f = fakeFetch([{ status: 429, body: { error: { message: "slow down" } } }, { status: 503, body: "oops" }, ok({ name: "y", n: 2, kind: "b" })]);
    const res = await client(f).structured({ fn: "card", tier: "fast", system: "S", user: "U", schema });
    expect(res.data.name).toBe("y");
    expect(f.calls.length).toBe(3);
    const g = fakeFetch([{ status: 400, body: { error: { message: "bad schema" } } }]);
    await expect(client(g).structured({ fn: "card", tier: "fast", system: "S", user: "U", schema })).rejects.toMatchObject({ code: "api" });
    expect(g.calls.length).toBe(1);
  });

  it("surfaces refusals, content filters, and schema failures as typed errors", async () => {
    const refused = fakeFetch([{ status: 200, body: { choices: [{ message: { content: null, refusal: "no" }, finish_reason: "stop" }] } }]);
    await expect(client(refused).structured({ fn: "x", tier: "fast", system: "S", user: "U", schema })).rejects.toMatchObject({ code: "refusal" });
    const filtered = fakeFetch([{ status: 200, body: { choices: [{ message: { content: "{}" }, finish_reason: "content_filter" }] } }]);
    await expect(client(filtered).structured({ fn: "x", tier: "fast", system: "S", user: "U", schema })).rejects.toMatchObject({ code: "refusal" });
    const bad = fakeFetch([ok({ name: "x", n: "not a number", kind: "a" })]);
    const err = await client(bad).structured({ fn: "x", tier: "fast", system: "S", user: "U", schema }).catch((e) => e as LLMError);
    expect(err).toBeInstanceOf(LLMError);
    expect((err as LLMError).code).toBe("parse");
  });

  it("builds from env for Azure and OpenAI", () => {
    const az = openAICompatFromEnv({ AZURE_API_KEY: "a", ZADUM_PROVIDER: "azure-openai" });
    expect(az.name).toBe("azure-openai");
    expect(az.models).toEqual({ strong: "gpt-4.1", fast: "gpt-4.1" });
    const oa = openAICompatFromEnv({ OPENAI_API_KEY: "o", ZADUM_PROVIDER: "openai", ZADUM_MODEL_FAST: "gpt-4.1-mini" });
    expect(oa.name).toBe("openai-compat");
    expect(oa.models.fast).toBe("gpt-4.1-mini");
    expect(() => openAICompatFromEnv({ ZADUM_PROVIDER: "openai" })).toThrow(/no API key/);
  });
});
