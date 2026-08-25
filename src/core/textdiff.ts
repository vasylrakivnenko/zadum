/**
 * Minimal line diff — what the user CHANGED in a compiled spec, not the whole document.
 *
 * A compiled spec runs ~45k characters. Sending the before and after texts to a model to work out the intent
 * would cost ~25k tokens and bury a three-line correction in noise. A user edit is almost always a few local
 * changes, so the deterministic thing to do is extract the changed hunks with a little context and send only
 * those. Pure, no IO, no randomness — house rules for src/core.
 */

export interface Hunk {
  /** 1-based line number in the ORIGINAL text where this hunk starts (0 when the hunk is a pure insertion at the top) */
  line: number;
  /** unchanged lines immediately before the change */
  context_before: string[];
  removed: string[];
  added: string[];
  /** unchanged lines immediately after the change */
  context_after: string[];
}

/** Above this many lines on either side of the trimmed middle, the LCS table is not worth building. */
const LCS_LIMIT = 2000;

/**
 * Changed hunks between two texts. Common prefix and suffix are trimmed first (a spec edit touches a few
 * lines, so this usually leaves a tiny middle), then an LCS alignment over what is left. If the remaining
 * middle is enormous on both sides — a wholesale rewrite rather than an edit — it is reported as one
 * replace-everything hunk instead of spending time aligning two unrelated documents.
 */
export function changedHunks(before: string, after: string, context = 2): Hunk[] {
  const a = before.split("\n");
  const b = after.split("\n");
  let lo = 0;
  while (lo < a.length && lo < b.length && a[lo] === b[lo]) lo++;
  let hi = 0;
  while (hi < a.length - lo && hi < b.length - lo && a[a.length - 1 - hi] === b[b.length - 1 - hi]) hi++;
  const midA = a.slice(lo, a.length - hi);
  const midB = b.slice(lo, b.length - hi);
  if (!midA.length && !midB.length) return [];
  if (midA.length > LCS_LIMIT && midB.length > LCS_LIMIT) {
    return [{ line: lo + 1, context_before: a.slice(Math.max(0, lo - context), lo), removed: midA, added: midB, context_after: a.slice(a.length - hi, a.length - hi + context) }];
  }

  // LCS alignment over the middle, then group adjacent del/add runs into hunks.
  const ops = alignLines(midA, midB);
  const hunks: Hunk[] = [];
  let ia = 0; // index into midA
  let i = 0;
  while (i < ops.length) {
    if (ops[i]!.kind === "same") {
      ia++;
      i++;
      continue;
    }
    const startA = ia;
    const removed: string[] = [];
    const added: string[] = [];
    while (i < ops.length && ops[i]!.kind !== "same") {
      const op = ops[i]!;
      if (op.kind === "del") {
        removed.push(op.line);
        ia++;
      } else added.push(op.line);
      i++;
    }
    const absStart = lo + startA; // 0-based index in `a`
    hunks.push({
      line: absStart + 1,
      context_before: a.slice(Math.max(0, absStart - context), absStart),
      removed,
      added,
      context_after: a.slice(absStart + removed.length, absStart + removed.length + context),
    });
  }
  return hunks;
}

type Op = { kind: "same" | "del" | "add"; line: string };

function alignLines(a: string[], b: string[]): Op[] {
  const n = a.length;
  const m = b.length;
  // dp[i][j] = LCS length of a[i:] and b[j:], flattened
  const dp = new Int32Array((n + 1) * (m + 1));
  const at = (i: number, j: number) => dp[i * (m + 1) + j]!;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * (m + 1) + j] = a[i] === b[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
    }
  }
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ kind: "same", line: a[i]! });
      i++;
      j++;
    } else if (at(i + 1, j) >= at(i, j + 1)) {
      ops.push({ kind: "del", line: a[i]! });
      i++;
    } else {
      ops.push({ kind: "add", line: b[j]! });
      j++;
    }
  }
  for (; i < n; i++) ops.push({ kind: "del", line: a[i]! });
  for (; j < m; j++) ops.push({ kind: "add", line: b[j]! });
  return ops;
}

/** Hunks rendered for a prompt: unified-diff-ish, compact, deterministic. */
export function renderHunks(hunks: Hunk[], maxChars = 6000): string {
  const blocks = hunks.map((h) => {
    const L = [`@@ line ${h.line} @@`];
    for (const c of h.context_before) L.push(`  ${c}`);
    for (const r of h.removed) L.push(`- ${r}`);
    for (const x of h.added) L.push(`+ ${x}`);
    for (const c of h.context_after) L.push(`  ${c}`);
    return L.join("\n");
  });
  const out: string[] = [];
  let total = 0;
  for (const b of blocks) {
    if (total + b.length > maxChars) {
      out.push(`… ${blocks.length - out.length} further change(s) not shown`);
      break;
    }
    out.push(b);
    total += b.length;
  }
  return out.join("\n\n");
}
