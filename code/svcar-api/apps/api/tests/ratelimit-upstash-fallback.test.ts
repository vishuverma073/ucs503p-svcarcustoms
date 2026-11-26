import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

// Every Upstash limiter call fails, as during an outage or quota exhaustion.
vi.mock("@upstash/ratelimit", () => {
  class Ratelimit {
    static slidingWindow() {
      return {};
    }
    async limit(): Promise<never> {
      throw new Error("ERR max requests limit exceeded");
    }
    async resetUsedTokens(): Promise<void> {}
  }
  return { Ratelimit };
});

process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
process.env.UPSTASH_REDIS_REST_TOKEN = "token";

const { rateLimit, checkOtpLimit } = await import("../src/lib/ratelimit.js");
const { ipRateLimit } = await import("../src/middleware/ip-rate-limit.js");

describe("rate limiting when Upstash throws", () => {
  const prevEnv = process.env.NODE_ENV;
  beforeEach(() => {
    // rateLimit is a no-op under the test runner; exercise the real path.
    process.env.NODE_ENV = "production";
  });
  afterEach(() => {
    process.env.NODE_ENV = prevEnv;
  });

  it("rateLimit falls back to the in-memory window instead of throwing", async () => {
    const first = await rateLimit("t:fallback", 2, 60);
    const second = await rateLimit("t:fallback", 2, 60);
    const third = await rateLimit("t:fallback", 2, 60);
    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(false); // memory limiter still enforces the budget
  });

  it("checkOtpLimit falls back to memory", async () => {
    expect((await checkOtpLimit("9876500001")).allowed).toBe(true);
    expect((await checkOtpLimit("9876500001")).allowed).toBe(false);
  });

  it("ipRateLimit middleware does not 500", async () => {
    const app = new Hono();
    app.post("/x", ipRateLimit("t-mw", 5, 60) as never, (c) => c.json({ ok: true }));
    const res = await app.request("/x", { method: "POST", headers: { "fly-client-ip": "1.2.3.4" } });
    expect(res.status).toBe(200);
  });
});
