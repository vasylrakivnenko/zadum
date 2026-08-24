import { describe, it, expect } from "vitest";
import { z } from "zod";
import { AnthropicFoundryLLM } from "./anthropic_foundry.js";
import { LLMError } from "./client.js";
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

const toolOk = (input: unknown) => ({ status: 200, body: { model: "claude-x", stop_reason: "tool_use", content: [{ type: "tool_use", name: "emit_result", input }], usage: { input_tokens: 10, output_tokens: 5 } } });

function client(f: ReturnType<typeof fakeFetch>) {
  return new AnthropicFoundryLLM({ baseUrl: "https://r.services.ai.azure.com/anthropic", apiKey: "k", models: { strong: "claude-opus-4-8", fast: "claude-sonnet-4-6" }, fetchImpl: f, sleep: async () => {} });
}

describe("AnthropicFoundryLLM", () => {
  it("gets strict JSON via forced tool use, not first-party structured outputs", async () => {
    const f = fakeFetch([toolOk({ answer: "Paris", n: 1 })]);
    const res = await client(f).structured({ fn: "ping", tier: "strong", system: "S", user: "U", schema });
    expect(res.data).toEqual({ answer: "Paris", n: 1 });
    expect(res.usage.input_tokens).toBe(10);
    const body = JSON.parse(f.calls[0]!.init.body as string);
    expect(f.calls[0]!.url).toBe("https://r.services.ai.azure.com/anthropic/v1/messages");
    expect(body.model).toBe("claude-opus-4-8");
    expect(body.tool_choice).toEqual({ type: "tool", name: "emit_result" });
    expect(body.tools[0].input_schema.required).toEqual(["answer", "n"]);
    expect(body.tools[0].input_schema.additionalProperties).toBe(false);
    expect(body.system).toBe("S");
    // both auth header styles: Azure fronts differ on which they accept
    const headers = f.calls[0]!.init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("k");
    expect(headers["api-key"]).toBe("k");
    expect(headers["anthropic-version"]).toBeTruthy();
  });

  it("picks the deployment for the requested tier", async () => {
    const f = fakeFetch([toolOk({ answer: "a", n: 0 })]);
    await client(f).structured({ fn: "card", tier: "fast", system: "S", user: "U", schema });
    expect(JSON.parse(f.calls[0]!.init.body as string).model).toBe("claude-sonnet-4-6");
  });

  it("retries 429/5xx and a prose answer, but not a 4xx", async () => {
    const f = fakeFetch([{ status: 429, body: { error: { message: "slow" } } }, toolOk({ answer: "ok", n: 2 })]);
    expect((await client(f).structured({ fn: "x", tier: "strong", system: "S", user: "U", schema })).data.n).toBe(2);
    expect(f.calls.length).toBe(2);
    // answered in prose instead of calling the tool → transient, retried
    const prose = fakeFetch([{ status: 200, body: { content: [{ type: "text", text: "Paris!" }], stop_reason: "end_turn" } }, toolOk({ answer: "ok", n: 3 })]);
    expect((await client(prose).structured({ fn: "x", tier: "strong", system: "S", user: "U", schema })).data.n).toBe(3);
    expect(prose.calls.length).toBe(2);
    const bad = fakeFetch([{ status: 401, body: { error: { message: "Access denied" } } }]);
    await expect(client(bad).structured({ fn: "x", tier: "strong", system: "S", user: "U", schema })).rejects.toMatchObject({ code: "api" });
    expect(bad.calls.length).toBe(1);
  });

  it("retries a schema mismatch — Anthropic tool use is a strong hint, not a strict guarantee", async () => {
    // Observed live: one Claude call in ~120 dropped a required array field. Unlike OpenAI `strict: true`
    // json_schema (a provider guarantee, where a mismatch is deterministic), re-rolling fixes this.
    const f = fakeFetch([toolOk({ answer: "x" }), toolOk({ answer: "ok", n: 7 })]);
    expect((await client(f).structured({ fn: "x", tier: "strong", system: "S", user: "U", schema })).data.n).toBe(7);
    expect(f.calls.length).toBe(2);
    // still fails cleanly once the retries are spent
    const always = fakeFetch([toolOk({ answer: "x", n: "not a number" })]);
    const err = await client(always).structured({ fn: "x", tier: "strong", system: "S", user: "U", schema }).catch((e) => e as LLMError);
    expect((err as LLMError).code).toBe("parse");
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
