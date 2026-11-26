import { Hono } from "hono";
import { and, eq, isNotNull } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { AdminLoginRequestSchema } from "@svcar/contracts";
import type { DbClient } from "../../db/client.js";
import { users } from "../../db/schema.js";
import { signAdminAccess } from "../../lib/jwt.js";
import { logAudit } from "../../lib/audit.js";
import { rateLimit, resetRateLimit } from "../../lib/ratelimit.js";
import type { AppEnv } from "../../lib/types.js";
import { clientIp } from "../../middleware/ip-rate-limit.js";

// A valid-format hash compared against when no user matches, so response timing
// doesn't leak whether the email exists.
const DUMMY_HASH = bcrypt.hashSync("svcar-no-such-user-placeholder", 10);

// Login brute-force budgets (per 15 minutes).
const EMAIL_LIMIT = 10;
const IP_LIMIT = 30;
const LOGIN_WINDOW_SEC = 15 * 60;

export function makeAdminAuthRouter(db: DbClient) {
  const router = new Hono<AppEnv>();

  router.post("/login", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = AdminLoginRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Invalid request", issues: parsed.error.flatten() }, 400);
    }
    const { email, password } = parsed.data;

    // Brute-force protection. This MUST gate before the password compare: checking
    // it afterwards (and only on failure) made the limit cosmetic — a correct guess
    // still returned a token no matter how many attempts preceded it. We consume a
    // token up-front and refund it on success (below), so a real admin is never
    // locked out by their own earlier typos. 10/email + 30/IP per 15m.
    const ip = clientIp(c);
    const emailKey = `admin-login:email:${email.toLowerCase()}`;
    const ipKey = `admin-login:ip:${ip}`;
    const [byEmail, byIp] = await Promise.all([
      rateLimit(emailKey, EMAIL_LIMIT, LOGIN_WINDOW_SEC),
      rateLimit(ipKey, IP_LIMIT, LOGIN_WINDOW_SEC),
    ]);
    if (!byEmail.allowed || !byIp.allowed) {
      const retry = Math.max(byEmail.retryAfterSeconds, byIp.retryAfterSeconds);
      c.header("Retry-After", String(retry));
      return c.json({ error: "Too many attempts. Try again later." }, 429);
    }

    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.email, email), eq(users.isAdmin, true), isNotNull(users.passwordHash)))
      .limit(1);

    // Always run a compare (constant-ish time); return one generic 401 either way
    // so we don't distinguish "no such user" from "wrong password".
    const ok = bcrypt.compareSync(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) {
      if (user) {
        await logAudit(db, {
          actorUserId: user.id,
          action: "admin.login.failure",
          resourceType: "user",
          resourceId: user.id,
          changes: { after: { ip } },
        });
      }
      return c.json({ error: "Invalid email or password" }, 401);
    }

    // Genuine login — refund this email's budget so legitimate use is unaffected.
    await resetRateLimit(emailKey, EMAIL_LIMIT, LOGIN_WINDOW_SEC);

    const accessToken = await signAdminAccess({ sub: user.id });

    await logAudit(db, {
      actorUserId: user.id,
      action: "admin.login.success",
      resourceType: "user",
      resourceId: user.id,
    });

    return c.json({
      accessToken,
      admin: { id: user.id, email: user.email!, name: user.name, isAdmin: true as const },
    });
  });

  return router;
}
