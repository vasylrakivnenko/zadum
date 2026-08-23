/** Wires store + LLM + catalogs into an Engine from env/flags. */
import "../env.js"; // loads .env before anything reads process.env
import path from "node:path";
import { AnthropicLLM, CachedLLM, MockLLM, modelConfigFromEnv, type LLM } from "../llm/client.js";
import { openAICompatFromEnv } from "../llm/openai_client.js";
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
  else llm = llmFromEnv();
  const cache = opts.cache ?? process.env.ZADUM_LLM_CACHE === "1";
  if (cache && !opts.mock) llm = new CachedLLM(llm, path.join(dataDir, "llm-cache"));
  const catalogs = await loadCatalogs(opts.catalogDir);
  const ruleBankDir = opts.engine?.ruleBankDir ?? process.env.ZADUM_RULE_BANK_DIR;
  const engine = new Engine(store, llm, catalogs, { ...opts.engine, ...(ruleBankDir ? { ruleBankDir } : {}) });
  return { engine, store, llm };
}

/**
 * Provider selection. Explicit `ZADUM_PROVIDER` wins (anthropic | azure-openai | openai); otherwise Anthropic when
 * its credentials are present, else Azure OpenAI when AZURE_API_KEY is present, else Anthropic (it may still pick up
 * an `ant auth login` profile). Credentials are loaded from .env by src/env.ts.
 */
export function llmFromEnv(env: NodeJS.ProcessEnv = process.env): LLM {
  const provider = (env.ZADUM_PROVIDER ?? "").toLowerCase();
  if (provider === "azure-openai" || provider === "openai") return openAICompatFromEnv(env);
  if (provider === "anthropic") return new AnthropicLLM(modelConfigFromEnv(env));
  if (env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN) return new AnthropicLLM(modelConfigFromEnv(env));
  if (env.AZURE_API_KEY || env.OPENAI_API_KEY) return openAICompatFromEnv(env);
  return new AnthropicLLM(modelConfigFromEnv(env));
}
