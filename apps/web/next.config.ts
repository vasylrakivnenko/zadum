import type { NextConfig } from "next";
import path from "node:path";

// The engine lives in ../../src and is imported straight from source (no build step).
const repoRoot = path.resolve(process.cwd(), "../..");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Don't write AGENTS.md / CLAUDE.md into apps/web.
  agentRules: false,
  experimental: {
    // Allow importing files outside apps/web (the engine source).
    externalDir: true,
    // The engine is ESM TypeScript with `.js` import specifiers (NodeNext); map them back to `.ts` (webpack).
    extensionAlias: { ".js": [".ts", ".tsx", ".js"] },
  },
  // Turbopack: same root so ../../src and the root node_modules resolve when running without --webpack.
  turbopack: { root: repoRoot },
  outputFileTracingRoot: repoRoot,
  // IO-heavy packages used by the engine stay as Node requires instead of being bundled.
  serverExternalPackages: ["@anthropic-ai/sdk", "postgres"],
};

export default nextConfig;
