import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { and, desc, eq, gt, isNull, lt, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import {
  OtpSendRequestSchema,
  OtpSendResponseSchema,
  OtpVerifyRequestSchema,
  OtpVerifyResponseSchema,
  PasswordLoginRequestSchema,
  PasswordSetRequestSchema,
} from "@svcar/contracts";
import type { DbClient } from "../db/client.js";
import { otpCodes, users } from "../db/schema.js";
import { generateOtp, hashOtp, verifyOtp } from "../lib/otp.js";
import { claimGuestOrders } from "../lib/claim-guest-orders.js";
import { sendOtpEmail } from "../lib/email.js";
import { checkOtpLimit, rateLimit } from "../lib/ratelimit.js";
import { isDevAuthBypass } from "../lib/dev-bypass.js";
import { REFRESH_TTL, issuedBeforePasswordChange, signAccess, signRefresh, verifyRefresh } from "../lib/jwt.js";
import { isJtiRevoked, revokeJti } from "../lib/token-revocation.js";
import { clientIp } from "../middleware/ip-rate-limit.js";
import { requireAuth } from "../middleware/auth.js";
import type { AppEnv } from "../lib/types.js";

/** Constant-time-ish placeholder so unknown/passwordless emails cost the same as
 * a real bcrypt compare (avoids revealing which accounts have a password). */
const DUMMY_PW_HASH = bcrypt.hashSync("svcar-no-password-placeholder", 10);

type UserRow = typeof users.$inferSelect;
/** Public user shape returned in every auth session response. */
function userResponse(u: UserRow) {
  return {
    id: u.id,
    email: u.email,
    phone: u.phone,
    name: u.name,
    isAdmin: u.isAdmin,
    hasPassword: u.passwordHash != null,
  };
}

/**
 * Cookie attributes for the refresh token. Read at call time (not frozen at
 * import) so `--env-file` load order and per-test env mutation can't change the
 * answer — same reasoning as config/brand.ts.
 *
 * On SameSite: in production the storefront (www.svcarcustoms.in) and this API
 * (*.fly.dev) are different SITES, so every `credentials:"include"` call the
 * storefront makes to /auth/refresh is a CROSS-SITE request — and browsers
 * withhold a `Lax` cookie on those, silently. That left the in-memory access
 * token as the entire session, so any full page load signed the customer out;
 * most visibly the return from PayU, which re-enters the site from a third
 * party. `None` (which the spec pairs with `Secure`) is what keeps the session
 * alive. Once this API is served from api.svcarcustoms.in — same site as the
 * storefront — set COOKIE_SAMESITE=Lax to get the stricter default back.
 */
export function refreshCookieOpts() {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    // HTTPS-only in production; relaxed for local http so the cookie (and thus
    // session-restore on reload) works in dev. Browsers reject Secure cookies on
    // http://localhost.
    secure: isProd,
    sameSite: (process.env.COOKIE_SAMESITE ?? (isProd ? "None" : "Lax")) as "Strict" | "Lax" | "None",
    path: "/auth",
  } as const;
}

const OTP_TTL_SECONDS = 300;
const MAX_ATTEMPTS = 5;

export function makeAuthRouter(db: DbClient) {
  const router = new Hono<AppEnv>();

  // POST /auth/otp/send — generate, hash+store, dispatch (stub in dev).
  router.post("/otp/send", async (c) => {
    const parsed = OtpSendRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Invalid request", issues: parsed.error.flatten() }, 400);
    }
    const { email } = parsed.data;

    // Per-IP ceiling in addition to the per-email budget below: checkOtpLimit keys
    // only on the address, so rotating it resets the budget on every request —
    // letting one client mail-bomb arbitrary victims and burn real email spend.
    const byIp = await rateLimit(`otp-send:ip:${clientIp(c)}`, 15, 60 * 60);
    if (!byIp.allowed) {
      c.header("Retry-After", String(byIp.retryAfterSeconds));
      return c.json({ error: "Too many OTP requests", retryAfterSeconds: byIp.retryAfterSeconds }, 429);
    }

    const limit = await checkOtpLimit(email);
    if (!limit.allowed) {
      c.header("Retry-After", String(limit.retryAfterSeconds));
      return c.json({ error: "Too many OTP requests", retryAfterSeconds: limit.retryAfterSeconds }, 429);
    }

    const code = generateOtp();
    const codeHash = await hashOtp(code);
    await db.insert(otpCodes).values({
      email,
      codeHash,
      expiresAt: new Date(Date.now() + OTP_TTL_SECONDS * 1000),
    });

    await sendOtpEmail(email, code);

    const body: Record<string, unknown> = OtpSendResponseSchema.parse({
      ok: true,
      expiresInSeconds: OTP_TTL_SECONDS,
    });
    // Dev convenience: email is stubbed locally, so echo the code in the response
    // to make manual login testing painless. Gated by the dev-auth bypass so it
    // can never be exposed in production (see lib/dev-bypass.ts).
    if (isDevAuthBypass()) body.devCode = code;
    return c.json(body);
  });

  // POST /auth/otp/verify — check code, consume OTP, upsert user, issue JWTs.
  router.post("/otp/verify", async (c) => {
    const parsed = OtpVerifyRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Invalid request", issues: parsed.error.flatten() }, 400);
    }
    const { email, code } = parsed.data;

    // Throttle BEFORE any compare, on every request. Counting only failures let
    // a burst of parallel guesses all reach bcrypt, and a correct one always won.
    for (const [key, limit] of [
      [`otp-verify:${email}`, 10],
      [`otp-verify:ip:${clientIp(c)}`, 30],
    ] as const) {
      const rl = await rateLimit(key, limit, 900);
      if (!rl.allowed) {
        c.header("Retry-After", String(rl.retryAfterSeconds));
        return c.json({ error: "Too many attempts", retryAfterSeconds: rl.retryAfterSeconds }, 429);
      }
    }

    const [row] = await db
      .select()
      .from(otpCodes)
      .where(and(eq(otpCodes.email, email), isNull(otpCodes.consumedAt), gt(otpCodes.expiresAt, new Date())))
      .orderBy(desc(otpCodes.id))
      .limit(1);
    if (!row) return c.json({ error: "OTP expired or not found" }, 401);

    // Claim an attempt atomically. A read-then-write counter let concurrent
    // requests all see the same stale `attempts` and blow past MAX_ATTEMPTS.
    const [claimed] = await db
      .update(otpCodes)
      .set({ attempts: sql`${otpCodes.attempts} + 1` })
      .where(and(eq(otpCodes.id, row.id), isNull(otpCodes.consumedAt), lt(otpCodes.attempts, MAX_ATTEMPTS)))
      .returning({ id: otpCodes.id });
    if (!claimed) {
      await db.update(otpCodes).set({ consumedAt: new Date() }).where(eq(otpCodes.id, row.id));
      return c.json({ error: "Too many attempts" }, 429);
    }

    if (!(await verifyOtp(code, row.codeHash))) {
      return c.json({ error: "Invalid OTP" }, 401);
    }

    // Consume exactly once: a second request racing with the same correct code
    // finds consumed_at already set and gets nothing back.
    const [consumed] = await db
      .update(otpCodes)
      .set({ consumedAt: new Date() })
      .where(and(eq(otpCodes.id, row.id), isNull(otpCodes.consumedAt)))
      .returning({ id: otpCodes.id });
    if (!consumed) return c.json({ error: "OTP expired or not found" }, 401);

    const [user] = await db
      .insert(users)
      .values({ email })
      .onConflictDoUpdate({ target: users.email, set: { email } })
      .returning();

    await claimGuestOrders(db, user!.id, email);

    const accessToken = await signAccess({ sub: user!.id, isAdmin: user!.isAdmin });
    const refreshToken = await signRefresh({ sub: user!.id, jti: crypto.randomUUID() });

    setCookie(c, "refresh_token", refreshToken, { ...refreshCookieOpts(), maxAge: REFRESH_TTL });

    return c.json(OtpVerifyResponseSchema.parse({ accessToken, user: userResponse(user!) }));
  });

  // POST /auth/password/login — email + password sign-in (once a password is set).
  router.post("/password/login", async (c) => {
    const parsed = PasswordLoginRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Invalid request" }, 400);
    const { email, password } = parsed.data;

    const rl = await rateLimit(`pw-login:${email}`, 10, 900); // 10 tries / 15 min / email
    if (!rl.allowed) {
      c.header("Retry-After", String(rl.retryAfterSeconds));
      return c.json({ error: "Too many attempts", retryAfterSeconds: rl.retryAfterSeconds }, 429);
    }

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user || !user.passwordHash) {
      await bcrypt.compare(password, DUMMY_PW_HASH); // equalize timing
      // 403 → the storefront tells the user to sign in with a one-time code instead.
      return c.json({ error: "No password set for this account" }, 403);
    }
    if (!(await bcrypt.compare(password, user.passwordHash))) {
      return c.json({ error: "Incorrect password" }, 401);
    }
    await claimGuestOrders(db, user.id, email);

    const accessToken = await signAccess({ sub: user.id, isAdmin: user.isAdmin });
    const refreshToken = await signRefresh({ sub: user.id, jti: crypto.randomUUID() });
    setCookie(c, "refresh_token", refreshToken, { ...refreshCookieOpts(), maxAge: REFRESH_TTL });
    return c.json(OtpVerifyResponseSchema.parse({ accessToken, user: userResponse(user) }));
  });

  // POST /auth/password/set — set/change the signed-in customer's password.
  //
  // Admin accounts are refused: `password_hash` is also what /admin/auth/login
  // checks, so letting a customer session write it would turn any stolen
  // storefront session (or an OTP for the admin's inbox) into admin access.
  // Admin passwords change via scripts/set-admin-password.ts. A change (as
  // opposed to a first-time set) needs the current password.
  router.post("/password/set", requireAuth, async (c) => {
    const parsed = PasswordSetRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Invalid request", issues: parsed.error.flatten() }, 400);
    }
    const userId = c.get("userId")!;
    const [existing] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!existing) return c.json({ error: "User not found" }, 404);
    if (existing.isAdmin) {
      return c.json({ error: "Admin passwords can't be changed from the storefront" }, 403);
    }
    if (existing.passwordHash) {
      const current = parsed.data.currentPassword;
      if (!current) return c.json({ error: "Current password is required" }, 400);
      const rl = await rateLimit(`pw-change:${userId}`, 5, 900);
      if (!rl.allowed) {
        c.header("Retry-After", String(rl.retryAfterSeconds));
        return c.json({ error: "Too many attempts", retryAfterSeconds: rl.retryAfterSeconds }, 429);
      }
      // 422, not 401: the storefront treats any 401 as an expired session and
      // would sign the customer out over a mistyped password.
      if (!(await bcrypt.compare(current, existing.passwordHash))) {
        return c.json({ error: "Current password is incorrect" }, 422);
      }
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    const [user] = await db
      .update(users)
      .set({ passwordHash, passwordChangedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    if (!user) return c.json({ error: "User not found" }, 404);

    // Every other session was signed out by passwordChangedAt; re-issue this
    // one's refresh cookie so the customer who made the change stays signed in.
    const refreshToken = await signRefresh({ sub: user.id, jti: crypto.randomUUID() });
    setCookie(c, "refresh_token", refreshToken, { ...refreshCookieOpts(), maxAge: REFRESH_TTL });
    return c.json(userResponse(user));
  });

  // POST /auth/refresh — exchange the refresh cookie for a new access token (rotates refresh).
  router.post("/refresh", async (c) => {
    const token = getCookie(c, "refresh_token");
    if (!token) return c.json({ error: "Missing refresh token" }, 401);

    let payload: { sub: string; jti: string; iat: number };
    try {
      payload = await verifyRefresh(token);
    } catch {
      return c.json({ error: "Invalid refresh token" }, 401);
    }

    // A token whose jti was blacklisted on logout can no longer be exchanged,
    // even though it hasn't reached its 30-day expiry yet.
    if (await isJtiRevoked(payload.jti)) {
      return c.json({ error: "Refresh token revoked" }, 401);
    }

    const [user] = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
    if (!user) return c.json({ error: "User not found" }, 401);
    if (issuedBeforePasswordChange(payload.iat, user.passwordChangedAt)) {
      return c.json({ error: "Session ended by a password change" }, 401);
    }

    const accessToken = await signAccess({ sub: user.id, isAdmin: user.isAdmin });
    const rotated = await signRefresh({ sub: user.id, jti: crypto.randomUUID() });
    setCookie(c, "refresh_token", rotated, { ...refreshCookieOpts(), maxAge: REFRESH_TTL });

    return c.json(OtpVerifyResponseSchema.parse({ accessToken, user: userResponse(user) }));
  });

  // POST /auth/logout — clear the refresh cookie and blacklist its jti so a
  // leaked-but-unexpired refresh token can't be reused.
  router.post("/logout", async (c) => {
    const token = getCookie(c, "refresh_token");
    if (token) {
      try {
        const { jti } = await verifyRefresh(token);
        await revokeJti(jti, REFRESH_TTL);
      } catch {
        // Already invalid/expired — nothing worth blacklisting.
      }
    }
    // Same attributes it was written with — a cross-site clear that doesn't
    // carry Secure/SameSite=None is dropped by the browser, leaving the cookie.
    const { path, secure, sameSite } = refreshCookieOpts();
    deleteCookie(c, "refresh_token", { path, secure, sameSite });
    return c.json({ ok: true });
  });

  return router;
}
