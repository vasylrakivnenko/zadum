/**
 * Server-only: one lazily-initialized Engine for the whole Next.js process.
 * Stored on globalThis so dev-mode HMR does not create a second FileStore / LLM client.
 */
import path from "node:path";
import { buildEngine } from "@engine/engine/bootstrap";
import type { Engine } from "@engine/engine/orchestrator";
import type { Store } from "@engine/store/store";

export interface EngineHandle {
  engine: Engine;
  store: Store;
  mock: boolean;
}

declare global {
  // eslint-disable-next-line no-var
  var __zadumEngine: Promise<EngineHandle> | undefined;
}

function resolveDir(envValue: string | undefined, fallback: string): string {
  return path.resolve(process.cwd(), envValue ?? fallback);
}

async function create(): Promise<EngineHandle> {
  const mock = process.env.ZADUM_MOCK === "1";
  const dataDir = resolveDir(process.env.ZADUM_DATA_DIR, "../../.zadum");
  // catalogs.ts derives its default from import.meta.url, which a bundler rewrites; pass it explicitly.
  const catalogDir = resolveDir(process.env.ZADUM_CATALOG_DIR, "../../catalogs");
  const { engine, store } = await buildEngine({
    mock,
    dataDir,
    catalogDir,
    cache: process.env.ZADUM_LLM_CACHE === "1",
    engine: { log: (line) => console.log(`[engine] ${line}`) },
  });
  console.log(`[zadum-web] engine ready · mock=${mock} · data=${dataDir}`);
  return { engine, store, mock };
}

export function getEngine(): Promise<EngineHandle> {
  if (!globalThis.__zadumEngine) {
    globalThis.__zadumEngine = create().catch((e: unknown) => {
      globalThis.__zadumEngine = undefined; // allow a retry on the next request
      throw e;
    });
  }
  return globalThis.__zadumEngine;
}
