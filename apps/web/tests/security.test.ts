import { beforeEach, describe, expect, it } from "vitest";
import { AUTH_COOKIE, RateLimitError, SecurityError, authenticate, enforceRateLimit, enforceSameOrigin, limitFor, ownerForCredential, resetRateLimits } from "@/lib/security";

process.env.ZADUM_AUTH_SECRET = "test-only-auth-secret-that-is-at-least-32-characters";

function credential(setCookie: string): string {
  const first = setCookie.split(";", 1)[0]!;
  return decodeURIComponent(first.slice(`${AUTH_COOKIE}=`.length));
}

/** One browser's credential, reused: requests carrying it are the ones authenticate() does not re-mint. */
const browser = credential(authenticate(new Request("http://test.local/api/projects")).setCookie!);

function returning(url: string, init?: RequestInit): Request {
  const headers = new Headers(init?.headers);
  headers.set("cookie", `${AUTH_COOKIE}=${encodeURIComponent(browser)}`);
  return new Request(url, { ...init, headers });
}

beforeEach(() => {
  resetRateLimits();
  delete process.env.ZADUM_TRUST_PROXY;
});

describe("web security", () => {
  it("keeps a stable owner in a signed HttpOnly cookie", () => {
    const first = authenticate(new Request("http://test.local/api/projects"));
    expect(first.setCookie).toContain("HttpOnly");
    expect(first.setCookie).toContain("SameSite=Lax");
    const value = credential(first.setCookie!);
    const second = authenticate(new Request("http://test.local/api/projects", { headers: { cookie: `${AUTH_COOKIE}=${encodeURIComponent(value)}` } }));
    expect(second.ownerId).toBe(first.ownerId);
    expect(ownerForCredential(value)).toBe(first.ownerId);
    const replacement = value.endsWith("x") ? "y" : "x";
    expect(ownerForCredential(`${value.slice(0, -1)}${replacement}`)).toBeNull();
    expect(second.setCookie).toBeUndefined();
  });

  it("rejects an invalid bearer credential", () => {
    expect(() => authenticate(new Request("http://test.local/api/projects", { headers: { authorization: "Bearer tampered" } }))).toThrow(SecurityError);
    expect(authenticate(new Request("http://test.local/api/projects", { headers: { cookie: `${AUTH_COOKIE}=%zz` } })).setCookie).toContain(`${AUTH_COOKIE}=`);
  });

  it("rejects cross-origin mutations", () => {
    const req = new Request("https://zadum.test/api/projects", { method: "POST", headers: { origin: "https://attacker.test" } });
    expect(() => enforceSameOrigin(req)).toThrow(/cross-origin/);
    const costlyGet = new Request("https://zadum.test/api/projects/p/verification", { headers: { "sec-fetch-site": "cross-site" } });
    expect(() => enforceSameOrigin(costlyGet)).toThrow(/cross-origin/);
  });

  it("classifies real request paths, basePath and trailing slash included", () => {
    const post = (url: string) => limitFor(new Request(url, { method: "POST" }));
    // The create limit is the LLM-spend guard: a deployment prefix or a proxy's trailing slash must not
    // silently downgrade it to the 120/min write limit.
    expect(post("https://zadum.test/api/projects").name).toBe("create");
    expect(post("https://zadum.test/api/projects/").name).toBe("create");
    expect(post("https://zadum.test/app/api/projects").name).toBe("create");
    expect(post("https://zadum.test/api/projects/p1/cards/answer").name).toBe("write");
    expect(limitFor(new Request("https://zadum.test/api/projects")).name).toBe("read");
    for (const p of ["compile", "refine", "evidence", "verification", "gaps"]) {
      expect(post(`https://zadum.test/api/projects/p1/${p}`).name).toBe("expensive");
    }
    expect(post("https://zadum.test/api/projects/p1/spec/refine").name).toBe("expensive");
  });

  it("limits repeated project creation by client IP behind a trusted proxy", () => {
    process.env.ZADUM_TRUST_PROXY = "1";
    const auth = authenticate(new Request("http://test.local/api/projects"));
    const make = (ip: string) => new Request("http://test.local/api/projects", { method: "POST", headers: { "x-real-ip": ip } });
    for (let i = 0; i < 5; i++) expect(enforceRateLimit(make("203.0.113.10"), auth, 1_000).remaining).toBe(4 - i);
    expect(() => enforceRateLimit(make("203.0.113.10"), auth, 1_000)).toThrow(/too many requests/);
    expect(enforceRateLimit(make("203.0.113.11"), auth, 1_000).remaining).toBe(4); // a different IP is a different bucket
  });

  it("ignores forwarding headers when no proxy is trusted", () => {
    const auth = authenticate(new Request("http://test.local/api/projects"));
    // Spoofing a fresh IP per request must not mint a fresh bucket per request, or the create limit — and
    // with it the LLM-spend cap — is bypassed by anyone who can set a header.
    for (let i = 0; i < 5; i++) enforceRateLimit(new Request("http://test.local/api/projects", { method: "POST", headers: { "x-forwarded-for": `1.2.3.${i}` } }), auth, 1_000);
    const buckets = [...(globalThis.__zadumRateBuckets ?? new Map()).keys()];
    expect(buckets).toEqual(["create:shared"]);
  });

  it("counts a credential-less caller against the shared bucket, not a fresh one each time", () => {
    // authenticate() mints an identity for every credential-less request, so keying on it would give each
    // request an empty bucket (no limit at all) and leak a map entry per request.
    for (let i = 0; i < 30; i++) {
      const req = new Request("http://test.local/api/projects/p1/verification");
      enforceRateLimit(req, authenticate(req), 1_000);
    }
    expect([...(globalThis.__zadumRateBuckets ?? new Map()).keys()]).toEqual(["expensive:shared"]);
  });

  it("gives a returning browser its own bucket", () => {
    const req = () => returning("http://test.local/api/projects/p1/verification");
    const first = req();
    const info = enforceRateLimit(first, authenticate(first), 1_000);
    expect(info.remaining).toBe(19); // ZADUM_RATE_EXPENSIVE default 20
    const second = req();
    expect(enforceRateLimit(second, authenticate(second), 1_000).remaining).toBe(18); // same owner, same bucket
    expect([...(globalThis.__zadumRateBuckets ?? new Map()).keys()][0]).toMatch(/^expensive:usr:usr_/);
  });

  it("carries the counters and the wait on the 429 itself", () => {
    const auth = authenticate(new Request("http://test.local/api/projects"));
    const make = () => new Request("http://test.local/api/projects/p1/compile", { method: "POST" });
    let thrown: unknown;
    try {
      // shared bucket = expensive (20) × ZADUM_RATE_SHARED_FACTOR (20)
      for (let i = 0; i < 401; i++) enforceRateLimit(make(), auth, 1_000);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(RateLimitError);
    const err = thrown as RateLimitError;
    // The throwing call never returns, so a 429 can only report remaining/reset/retry-after from the error.
    expect(err.status).toBe(429);
    expect(err.rate.remaining).toBe(0);
    expect(err.rate.resetAt).toBe(61_000);
    expect(err.retryAfterSec).toBe(60);
  });
});
