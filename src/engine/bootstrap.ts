/** Wires store + LLM + catalogs into an Engine from env/flags. */
import "../env.js"; // loads .env before anything reads process.env
import path from "node:path";
import { AnthropicLLM, CachedLLM, MockLLM, modelConfigFromEnv, type LLM } from "../llm/client.js";
import { openAICompatFromEnv } from "../llm/openai_client.js";
import { SplitTierLLM } from "../llm/split_tier.js";
import { credentialsFromEnv, makeModel } from "../llm/registry.js";
import { invoicingMockHandlers } from "../llm/mock_fixtures.js";
import { FileStore } from "../store/file_store.js";
import type { Store } from "../store/store.js";
import { loadCatalogs } from "./catalogs.js";
import { Engine, type EngineOptions } from "./orchestrator.js";

export interface BootstrapOptions {
  mock?: boolean;
  cache?: boolean;
  dataDir?: string;
  catalogDir?: string;
  engine?: EngineOptions;
  store?: Store;
  llm?: LLM;
}

export async function buildEngine(opts: BootstrapOptions = {}): Promise<{ engine: Engine; store: Store; llm: LLM }> {
  const dataDir = opts.dataDir ?? process.env.ZADUM_DATA_DIR ?? ".zadum";
  let store: Store | undefined = opts.store;
  if (!store) {
    if (process.env.DATABASE_URL) {
      const { PgStore } = await import("../store/pg_store.js");
      store = await PgStore.connect(process.env.DATABASE_URL);
    } else store = new FileStore(dataDir);
  }
  let llm: LLM;
  if (opts.llm) llm = opts.llm;
  else if (opts.mock) llm = new MockLLM(invoicingMockHandlers);
  else llm = withFastTierFromEnv(llmFromEnv());
  const cache = opts.cache ?? process.env.ZADUM_LLM_CACHE === "1";
  if (cache && !opts.mock) llm = new CachedLLM(llm, path.join(dataDir, "llm-cache"));
  const catalogs = await loadCatalogs(opts.catalogDir);
  const ruleBankDir = opts.engine?.ruleBankDir ?? process.env.ZADUM_RULE_BANK_DIR;
  // Loop B plug-ins, both harness-gated opt-ins (docs/LEARNING.md): learned population priors and the
  // reported-confidence recalibration map, each a JSON file produced by `npm run learn`.
  const priors = await readJsonEnvFile(process.env.ZADUM_PRIORS_FILE);
  const recal = await readJsonEnvFile(process.env.ZADUM_RECALIBRATION_FILE);
  // ZADUM_GRAPH_FILE — the design graph (docs/MINING.md stage 4), the third harness-gated opt-in and the
  // most invasive of the three, since it reweights the sampled worlds the selector reasons over. Parsed
  // through `DesignGraphSchema` rather than trusted as JSON: a graph is a file a human may have hand-edited
  // while promoting a candidate, and a malformed one must fail here rather than silently skew a belief.
  const graphRaw = await readJsonEnvFile(process.env.ZADUM_GRAPH_FILE);
  const designGraph = graphRaw ? (await import("../learning/design_graph.js")).DesignGraphSchema.parse(graphRaw) : null;
  const engine = new Engine(store, llm, catalogs, {
    ...opts.engine,
    ...(ruleBankDir ? { ruleBankDir } : {}),
    ...(priors && !opts.engine?.populationPriors ? { populationPriors: priors as never } : {}),
    ...(recal && !opts.engine?.recalibration ? { recalibration: recal as never } : {}),
    ...(designGraph && !opts.engine?.designGraph ? { designGraph } : {}),
    ...(process.env.ZADUM_CONTRARIAN === "1" && opts.engine?.contrarianSampling === undefined ? { contrarianSampling: true } : {}),
    ...(process.env.ZADUM_EVIDENCE === "1" && opts.engine?.evidenceOnContext === undefined ? { evidenceOnContext: true } : {}),
  });
  return { engine, store, llm };
}

async function readJsonEnvFile(file: string | undefined): Promise<unknown | null> {
  if (!file?.trim()) return null;
  const { promises: fs } = await import("node:fs");
  return JSON.parse(await fs.readFile(file.trim(), "utf8")) as unknown;
}

/**
 * ZADUM_FAST_MODEL=<registry id> (e.g. gpt-4o) sends the fast tier to that deployment via the model registry,
 * leaving the strong tier on the provider's own model. Needed for Rule 5 (<2s p90 card render): a provider
 * resource with only strong-class deployments can't serve fast-tier calls fast enough. Unset → `base`
 * unchanged. Applied inside the engine bootstrap only (before CachedLLM, which must stay outermost so cache
 * keys see the split tiers' real model ids); `llmFromEnv()` itself is untouched for its other callers.
 */
export function withFastTierFromEnv(base: LLM, env: NodeJS.ProcessEnv = process.env): LLM {
  const fastId = env.ZADUM_FAST_MODEL?.trim();
  if (!fastId) return base;
  return new SplitTierLLM(base, makeModel(fastId, credentialsFromEnv(env)));
}

/**
 * Provider selection. `ZADUM_MODEL` wins outright, then explicit `ZADUM_PROVIDER`
 * (anthropic | azure-openai | openai); otherwise Anthropic when its credentials are present, else Azure
 * OpenAI when AZURE_API_KEY is present, else Anthropic (it may still pick up an `ant auth login` profile).
 * Credentials are loaded from .env by src/env.ts.
 *
 * **ZADUM_MODEL exists because the engine could not reach the best model on the account.** The mining tools
 * call `makeModel(id)` and so can use anything in `src/llm/registry.ts` — including `claude-opus-4-8` on
 * Azure AI Foundry. `llmFromEnv` had no `foundry-anthropic` branch at all, so the PRODUCT silently ran on
 * gpt-4.1 whenever AZURE_API_KEY was present, while the offline tooling ran on Opus. That is the wrong way
 * round: the drafter, the critic and the compiler are where model quality reaches the user.
 *
 * Naming a MODEL rather than adding a provider is deliberate — a provider alone does not say which
 * deployment, and `makeModel` already resolves provider, endpoint and credentials from one id. It also
 * composes with `ZADUM_FAST_MODEL`, so a session can put the strong tier on Opus and the fast tier on
 * something cheap for Rule 5's <2s card latency.
 */
export function llmFromEnv(env: NodeJS.ProcessEnv = process.env): LLM {
  const modelId = env.ZADUM_MODEL?.trim();
  if (modelId) return makeModel(modelId, credentialsFromEnv(env));
  const provider = (env.ZADUM_PROVIDER ?? "").toLowerCase();
  if (provider === "azure-openai" || provider === "openai") return openAICompatFromEnv(env);
  if (provider === "anthropic") return new AnthropicLLM(modelConfigFromEnv(env));
  if (env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN) return new AnthropicLLM(modelConfigFromEnv(env));
  if (env.AZURE_API_KEY || env.OPENAI_API_KEY) return openAICompatFromEnv(env);
  return new AnthropicLLM(modelConfigFromEnv(env));
}
