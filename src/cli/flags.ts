/**
 * The one hand-rolled flag parser for the small `npm run …` entry points (the main CLI uses commander).
 *
 * `report.ts` and `label.ts` each grew their own copy of this loop with different rules — one knew about
 * boolean flags and one did not, one threw at ESM top level and one exited 2 with a usage banner — so every
 * new flag had to be added twice, in two forms. One parser, one set of messages, one exit path.
 */

/** A usage mistake by the operator, not a fault: mains print the banner and exit 2. */
export class UsageError extends Error {}

export interface FlagSpec {
  /** Flags that consume the next argv entry as their value. */
  value: readonly string[];
  /** Flags that are simply present or absent. */
  boolean?: readonly string[];
}

export interface Flags {
  /** The value of a value-flag, or undefined when it was not passed. */
  value(name: string): string | undefined;
  value(name: string, fallback: string): string;
  /** Whether a boolean flag was passed. */
  has(name: string): boolean;
}

export function helpRequested(argv: readonly string[]): boolean {
  return argv.includes("--help") || argv.includes("-h");
}

export function parseFlags(argv: readonly string[], spec: FlagSpec): Flags {
  const values = new Set(spec.value);
  const booleans = new Set(spec.boolean ?? []);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (booleans.has(a)) continue;
    if (!a.startsWith("--")) throw new UsageError(`unexpected argument ${a}`);
    if (!values.has(a)) throw new UsageError(`unknown argument ${a}`);
    const v = argv[i + 1];
    if (v === undefined || v.startsWith("--")) throw new UsageError(`${a} needs a value`);
    i += 1; // skip the value: it is not a flag
  }
  const value = ((name: string, fallback?: string) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1]! : fallback;
  }) as Flags["value"];
  return { value, has: (name: string) => argv.includes(name) };
}
