/** Mock handler for `cluster_rules` — deterministic, plausible clustering for tests and `--mock` runs. */
import type { LLMRequest, MockHandler } from "../llm/client.js";
import type { ClusterRulesOut } from "./rule_bank.js";

function mockCluster(user: string): ClusterRulesOut {
  const archetype = /^ARCHETYPE: (.+)$/m.exec(user)?.[1] ?? "unknown";
  const rules = [...user.matchAll(/^- (.+)$/gm)].map((m) => m[1]!);
  // group by rough keyword buckets so the mock produces >1 pattern and respects frequency ordering deterministically
  const buckets = new Map<string, string[]>();
  for (const r of rules) {
    const key = r.toLowerCase().split(/\s+/).find((w) => w.length > 5) ?? "misc";
    buckets.set(key, [...(buckets.get(key) ?? []), r]);
  }
  const patterns = [...buckets.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 20)
    .map(([key, group]) => ({
      pattern: `Pattern for ${archetype}: consistent handling of ${key}`,
      kind: "other" as const,
      frequency_estimate: Math.min(5, group.length),
      example_phrasing: group[0]!,
    }));
  return { patterns };
}

export const clusterRulesMockHandlers: Record<string, MockHandler> = {
  cluster_rules: (req: LLMRequest<unknown>) => mockCluster(req.user),
};
