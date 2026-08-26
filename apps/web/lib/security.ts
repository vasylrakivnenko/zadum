/**
 * Small, vendor-neutral security layer for the hosted MVP.
 *
 * A random browser credential is signed with ZADUM_AUTH_SECRET and kept in an HttpOnly cookie. Its hash is
 * the stable project owner id. This is anonymous authentication: it isolates browsers without requiring an
 * account provider. Clearing the cookie loses access, so a future account system should map this owner id to
 * a durable account rather than changing project ownership semantics.
 */
import "@engine/env"; // ZADUM_AUTH_SECRET lives in .env: load it here, never by luck of another module's import order.
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const AUTH_COOKIE = "zadum_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export class SecurityError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export interface AuthContext {
  ownerId: string;
  /** Present only when this request created a new browser credential. */
  setCookie?: string;
}

declare global {
  // eslint-disable-next-line no-var
  var __zadumDevAuthSecret: string | undefined;
  // eslint-disable-next-line no-var
  var __zadumRateBuckets: Map<string, { count: number; resetAt: number }> | undefined;
}

const authCache = new WeakMap<Request, AuthContext>();

function secret(): string {
  const configured = process.env.ZADUM_AUTH_SECRET?.trim();
  if (configured) {
    if (configured.length < 32) throw new SecurityError(500, "ZADUM_AUTH_SECRET must be at least 32 characters");
    return configured;
  }
  if (process.env.NODE_ENV === "production") throw new SecurityError(500, "ZADUM_AUTH_SECRET is required in production");
  globalThis.__zadumDevAuthSecret ??= randomBytes(32).toString("base64url");
  return globalThis.__zadumDevAuthSecret;
}

function sign(token: string): string {
  return createHmac("sha256", secret()).update(token).digest("base64url");
}

function validCredential(value: string): string | null {
  const dot = value.indexOf(".");
  if (dot <= 0 || value.indexOf(".", dot + 1) !== -1) return null;
  const token = value.slice(0, dot);
  const supplied = value.slice(dot + 1);
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token) || !/^[A-Za-z0-9_-]{40,64}$/.test(supplied)) return null;
  const expected = sign(token);
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b) ? token : null;
}

function cookieValue(req: Request): string | undefined {
  const cookie = req.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName === AUTH_COOKIE) {
      try {
        return decodeURIComponent(rest.join("="));
      } catch {
        return undefined; // malformed attacker-controlled cookie: replace it, never turn it into a 500
      }
    }
  }
  return undefined;
}

function suppliedCredential(req: Request): { value?: string; fromBearer: boolean } {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return { value: auth.slice(7).trim(), fromBearer: true };
  return { value: cookieValue(req), fromBearer: false };
}

function ownerId(token: string): string {
  return `usr_${createHash("sha256").update(`zadum-owner:${token}`).digest("base64url").slice(0, 24)}`;
}

/** Validate an existing cookie/bearer value without minting a new identity (for server-rendered pages). */
export function ownerForCredential(value: string | undefined): string | null {
  if (!value) return null;
  const token = validCredential(value);
  return token ? ownerId(token) : null;
}

export function authenticate(req: Request): AuthContext {
  const cached = authCache.get(req);
  if (cached) return cached;
  const supplied = suppliedCredential(req);
  let token = supplied.value ? validCredential(supplied.value) : null;
  if (supplied.fromBearer && !token) throw new SecurityError(401, "invalid bearer credential");
  let setCookie: string | undefined;
  if (!token) {
    token = randomBytes(32).toString("base64url");
    const value = `${token}.${sign(token)}`;
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    setCookie = `${AUTH_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}${secure}`;
  }
  const context: AuthContext = { ownerId: ownerId(token), ...(setCookie ? { setCookie } : {}) };
  authCache.set(req, context);
  return context;
}

/**
 * The identity `authenticate()` already established for this request, or undefined if it never ran.
 * Callers downstream of route() must use this rather than re-authenticating: a second authenticate() on a
 * different Request object would mint a *different* identity whose cookie is never sent to the browser.
 */
export function cachedAuth(req: Request): AuthContext | undefined {
  return authCache.get(req);
}

/** SameSite=Lax is the first CSRF barrier; matching Origin protects JSON mutations when browsers send it. */
export function enforceSameOrigin(req: Request): void {
  if (req.headers.get("sec-fetch-site") === "cross-site") throw new SecurityError(403, "cross-origin request rejected");
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return;
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) throw new SecurityError(403, "cross-origin request rejected");
}

export interface RateInfo {
  remaining: number;
  resetAt: number;
}

/** Carries the counters with it: the call that throws never returns, so the 429 has no other source for them. */
export class RateLimitError extends SecurityError {
  constructor(
    public readonly rate: RateInfo,
    public readonly retryAfterSec: number,
  ) {
    super(429, `too many requests; try again in ${retryAfterSec} seconds`);
  }
}

interface Limit {
  name: string;
  max: number;
  windowMs: number;
}

function positiveEnv(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/**
 * Which limit a request falls under, matched on the path *suffix*: a deployment may carry a basePath
 * (`/app/api/projects`) or a proxy may add a trailing slash, and neither may quietly downgrade project
 * creation — the LLM-spend guard — to the generic write limit. Exported so the classification is testable.
 */
export function limitFor(req: Request): Limit {
  const path = new URL(req.url).pathname;
  if (req.method === "POST" && /(?:^|\/)api\/projects\/?$/.test(path)) return { name: "create", max: positiveEnv("ZADUM_RATE_CREATE", 5), windowMs: 10 * 60_000 };
  if (/\/(compile|refine|evidence|verification|gaps)(?:\/|$)/.test(path)) return { name: "expensive", max: positiveEnv("ZADUM_RATE_EXPENSIVE", 20), windowMs: 60_000 };
  if (req.method === "GET" || req.method === "HEAD") return { name: "read", max: positiveEnv("ZADUM_RATE_READ", 300), windowMs: 60_000 };
  return { name: "write", max: positiveEnv("ZADUM_RATE_WRITE", 120), windowMs: 60_000 };
}

/**
 * The client IP, or null when nothing trustworthy identifies it.
 *
 * `x-forwarded-for` / `x-real-ip` are attacker-supplied unless a proxy that *overwrites* them sits in front,
 * so they are read only when the deployment says one does (ZADUM_TRUST_PROXY=1). Guessing is worse than
 * admitting we do not know: a spoofable key turns a per-IP limit into no limit at all.
 */
function clientIp(req: Request): string | null {
  if (!/^(1|true|yes)$/i.test(process.env.ZADUM_TRUST_PROXY?.trim() ?? "")) return null;
  const ip = req.headers.get("x-real-ip")?.trim() || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return ip && ip.length <= 64 ? ip : null;
}

/**
 * The bucket a request counts against.
 *
 * `authenticate()` mints a fresh identity for every credential-less request, so an owner id only identifies a
 * caller when the request actually *presented* one — keying on a newly minted id gives every anonymous client
 * its own empty bucket (no limit at all) and leaks a map entry per request. When neither a credential nor a
 * trusted IP identifies the caller, nothing tells two callers apart, so they share one bucket; `shared` marks
 * that, because a shared bucket is a process-wide cap and has to be sized like one.
 */
function actorFor(req: Request, auth: AuthContext, limit: Limit): { key: string; shared: boolean } {
  const ip = clientIp(req);
  // Creation is the spend guard, so prefer the IP there: clearing a cookie does not change it.
  if (limit.name === "create" && ip) return { key: `ip:${ip}`, shared: false };
  if (!auth.setCookie) return { key: `usr:${auth.ownerId}`, shared: false };
  if (ip) return { key: `ip:${ip}`, shared: false };
  return { key: "shared", shared: true };
}

/**
 * With the keys above the live set is (real owners + real IPs + 1), so a map this large means something
 * pathological: sweep what has expired, and drop the rest rather than grow until the process dies.
 */
function sweep(buckets: Map<string, { count: number; resetAt: number }>, now: number): void {
  if (buckets.size <= 5_000) return;
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  if (buckets.size > 50_000) buckets.clear();
}

export function enforceRateLimit(req: Request, auth: AuthContext, now = Date.now()): RateInfo {
  const limit = limitFor(req);
  const actor = actorFor(req, auth, limit);
  // The shared bucket holds every caller we cannot tell apart, so it is a process-wide backstop rather than a
  // per-caller limit; sizing it like one would lock out real first-time visitors on a proxy-less deployment.
  const max = actor.shared ? limit.max * positiveEnv("ZADUM_RATE_SHARED_FACTOR", 20) : limit.max;
  const key = `${limit.name}:${actor.key}`;
  const buckets = (globalThis.__zadumRateBuckets ??= new Map());
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) bucket = { count: 0, resetAt: now + limit.windowMs };
  bucket.count += 1;
  buckets.set(key, bucket);
  sweep(buckets, now);
  if (bucket.count > max) throw new RateLimitError({ remaining: 0, resetAt: bucket.resetAt }, Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)));
  return { remaining: max - bucket.count, resetAt: bucket.resetAt };
}

export function applySecurityHeaders(res: Response, auth: AuthContext, rate?: RateInfo): Response {
  if (auth.setCookie) res.headers.append("set-cookie", auth.setCookie);
  res.headers.set("cache-control", "no-store");
  res.headers.set("x-content-type-options", "nosniff");
  if (rate) {
    res.headers.set("x-ratelimit-remaining", String(rate.remaining));
    res.headers.set("x-ratelimit-reset", String(Math.ceil(rate.resetAt / 1000)));
  }
  return res;
}

/** Test hook: avoids one test suite consuming another one's process-global quota. */
export function resetRateLimits(): void {
  globalThis.__zadumRateBuckets?.clear();
}
