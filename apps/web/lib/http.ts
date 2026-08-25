/** Route Handler helpers: JSON responses, body parsing, error → status mapping. */
import { NextResponse } from "next/server";
import type { ErrorResponse } from "./types";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export type Params<K extends string> = { params: Promise<Record<K, string>> };

export function ok<T>(data: T, status = 200): NextResponse<T> {
  return NextResponse.json(data, { status });
}

function statusFor(message: string): number {
  const m = message.toLowerCase();
  if (m.includes("not found") || m.includes("missing snapshot")) return 404;
  // "no pending verification probe …" (a stale story check) and "no compiled spec.md artifact — compile
  // first" are both the caller asking for something out of order, not a server fault.
  if (m.includes("no card is pending") || m.includes("no pending verification") || m.includes("no compiled spec") || m.includes("not on decision") || m.includes("use undolast") || m.includes("rejected") || m.includes("required") || m.includes("invalid")) return 400;
  return 500;
}

/** Wrap a handler so thrown errors become `{ error }` with a sensible status. */
export function route<A extends unknown[]>(fn: (...args: A) => Promise<Response>): (...args: A) => Promise<Response> {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      const status = err instanceof HttpError ? err.status : statusFor(err.message);
      if (status >= 500) console.error("[zadum-web]", err);
      const body: ErrorResponse = { error: err.message };
      return NextResponse.json(body, { status });
    }
  };
}

/** Parse a JSON body as a string-keyed record (empty object when there is no body). */
export async function readBody(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (!text.trim()) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new HttpError(400, "invalid JSON body");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new HttpError(400, "invalid JSON body: expected an object");
  return parsed as Record<string, unknown>;
}

export function str(body: Record<string, unknown>, key: string, required: true): string;
export function str(body: Record<string, unknown>, key: string, required?: false): string | undefined;
export function str(body: Record<string, unknown>, key: string, required = false): string | undefined {
  const v = body[key];
  if (v === undefined || v === null || v === "") {
    if (required) throw new HttpError(400, `${key} is required`);
    return undefined;
  }
  if (typeof v !== "string") throw new HttpError(400, `${key} must be a string`);
  return v;
}

export function bool(body: Record<string, unknown>, key: string, required: true): boolean;
export function bool(body: Record<string, unknown>, key: string, required?: false): boolean | undefined;
export function bool(body: Record<string, unknown>, key: string, required = false): boolean | undefined {
  const v = body[key];
  if (v === undefined || v === null) {
    if (required) throw new HttpError(400, `${key} is required`);
    return undefined;
  }
  if (typeof v !== "boolean") throw new HttpError(400, `${key} must be true or false`);
  return v;
}

/** A nested object field (e.g. a story check's `correction`), as a string-keyed record. */
export function obj(body: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const v = body[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "object" || Array.isArray(v)) throw new HttpError(400, `${key} must be an object`);
  return v as Record<string, unknown>;
}

export function num(body: Record<string, unknown>, key: string): number | undefined {
  const v = body[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "number" || !Number.isFinite(v)) throw new HttpError(400, `${key} must be a number`);
  return v;
}
