/**
 * Load `.env` (repo root and/or cwd) into process.env using Node's built-in loader — no dependency.
 * Existing environment variables win over the file (same semantics as dotenv). Missing files are fine.
 * Imported for its side effect by `engine/bootstrap.ts`, i.e. by every CLI and the harness.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const candidates = [path.resolve(process.cwd(), ".env"), path.resolve(here, "..", ".env")];
for (const file of new Set(candidates)) {
  try {
    process.loadEnvFile(file);
  } catch {
    // ENOENT or unreadable: ignore — credentials may come from the environment or an `ant auth login` profile
  }
}

export const envLoaded = true;
