/** Parse the story.md artifact (deterministic format: `# title`, numbered steps, `## Please confirm`, `- checks`). */
export function parseStory(md: string): { title: string; steps: string[]; checks: string[] } {
  const lines = md.split("\n");
  let title = "A day in the life";
  const steps: string[] = [];
  const checks: string[] = [];
  let inChecks = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("# ") && !line.startsWith("## ")) title = line.slice(2).trim();
    else if (line.startsWith("## ")) inChecks = /confirm/i.test(line);
    else if (inChecks && line.startsWith("- ")) checks.push(line.slice(2).trim());
    else {
      const m = /^\d+\.\s+(.*)$/.exec(line);
      if (m && m[1]) steps.push(m[1]);
    }
  }
  return { title, steps, checks };
}
