import crypto from "node:crypto";
import { createMiddleware } from "hono/factory";
import type { Context } from "hono";
import { rateLimit } from "../lib/ratelimit.js";
import type { AppEnv } from "../lib/types.js";
import { log } from "../lib/logger.js";

/**
 * Trusted client IP for rate-limiting.
 *
 * Fly's edge sets `Fly-Client-IP` to the real client address, so trust that
 * first. NEVER trust the LEFTMOST `X-Forwarded-For` value — the client sends it
 * verbatim, so an attacker rotates it to get a fresh per-IP budget every request
 * and defeats every anti-abuse limit (OTP mail-bombing, login brute force). Only
 * as a fallback (non-Fly/dev) do we take the LAST XFF hop, which the trusted
 * proxy appended, not the attacker-supplied head.
 */
export function clientIp(c: Context): string {
  // The storefront proxies /auth/* through its own server, so for those calls
  // Fly-Client-IP is the storefront host's address, shared by every customer.
  // The proxy forwards the visitor's address in x-client-ip, signed with a
  // shared secret; honour it only when the secret matches.
  const forwarded = proxiedClientIp(c);
  if (forwarded) return forwarded;
  const flyIp = c.req.header("fly-client-ip")?.trim();
  if (flyIp) return flyIp;
  const realIp = c.req.header("x-real-ip")?.trim();
  if (realIp) return realIp;
  const xff = c.req.header("x-forwarded-for");
  if (xff) {
    const hops = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (hops.length) return hops[hops.length - 1]!; // last hop = appended by our proxy
  }
  return "unknown";
}

/**
 * Per-IP budget for PUBLIC, unauthenticated endpoints. These accept writes with no
 * credentials, so without a per-IP ceiling a single client can flood Postgres (or,
 * for OTP, burn real email spend and our sender reputation).
 */
export function ipRateLimit(name: string, limit: number, windowSec: number) {
  return createMiddleware<AppEnv>(async (c, next) => {
    let allowed = true;
    let retryAfterSeconds = 0;
    try {
      ({ allowed, retryAfterSeconds } = await rateLimit(`${name}:ip:${clientIp(c)}`, limit, windowSec));
    } catch (err) {
      // rateLimit already falls back to memory on Upstash errors; this is a last
      // line of defence so a limiter bug never 500s a public endpoint.
      log("error", "ip_rate_limit_failed_open", { name, error: (err as Error)?.message ?? String(err) });
    }
    if (!allowed) {
      c.header("Retry-After", String(retryAfterSeconds));
      return c.json({ error: "Too many requests" }, 429);
    }
    await next();
  });
}

function proxiedClientIp(c: Context): string | null {
  const secret = process.env.AUTH_PROXY_SECRET;
  const given = c.req.header("x-proxy-secret");
  const ip = c.req.header("x-client-ip")?.trim();
  if (!secret || secret.length < 32 || !given || !ip) return null;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return ip.slice(0, 64);
}
