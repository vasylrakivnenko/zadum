/** Loads decision catalogs from disk (catalogs/*.json) and computes a catalog version tag. */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CatalogSchema, type Catalog } from "../core/catalog.js";

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_CATALOG_DIR = path.resolve(here, "../../catalogs");

export interface LoadedCatalogs {
  catalogs: Catalog[];
  version: string; // e.g. "core@2026.08.22-1+b2b-invoicing@2026.08.22-1"
  archetypes: string[]; // archetypes with a dedicated catalog
}

export async function loadCatalogs(dir: string = DEFAULT_CATALOG_DIR): Promise<LoadedCatalogs> {
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  const catalogs: Catalog[] = [];
  for (const f of files) {
    const raw = JSON.parse(await fs.readFile(path.join(dir, f), "utf8"));
    catalogs.push(CatalogSchema.parse(raw));
  }
  const version = catalogs.map((c) => `${c.id}@${c.version}`).join("+");
  const archetypes = catalogs.filter((c) => c.archetype !== "core").map((c) => c.archetype);
  return { catalogs, version, archetypes };
}

/** Archetype vocabulary the drafter may use (dedicated catalogs first, then core-only ones). */
export const KNOWN_ARCHETYPES = [
  "b2b-invoicing",
  "crud-saas",
  "marketplace",
  "booking",
  "content-site",
  "internal-dashboard",
  "e-commerce",
  "community",
  "portfolio-landing",
  "other",
] as const;
