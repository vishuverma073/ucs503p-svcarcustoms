import { Hono, type Context } from "hono";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { DbClient } from "../../db/client.js";
import { adminPushSubscriptions } from "../../db/schema.js";
import { makeRequireAdmin } from "../../middleware/auth.js";
import {
  buildTestPushPayload,
  getVapidConfig,
  sendToSubscriptions,
  TEST_PUSH_TTL_SECONDS,
} from "../../lib/admin-push.js";
import type { AppEnv } from "../../lib/types.js";

/**
 * Admin push subscriptions — the "Enable notifications" card in Admin → Settings.
 *
 *   GET  /admin/push/public-key   → { enabled, publicKey? }
 *   POST /admin/push/subscribe    → upsert this device (by endpoint) for the caller
 *   POST /admin/push/unsubscribe  → forget this device
 *   POST /admin/push/test         → push a test notification to the caller's devices
 *
 * The sending itself lives in lib/admin-push.ts. When VAPID keys are not
 * configured every endpoint answers `enabled: false` (503 for the ones that
 * need it) instead of failing.
 */

/** Push services the browsers we support hand out. Anything else is refused. */
const PUSH_SERVICE_HOSTS = [
  "fcm.googleapis.com", // Chrome, Edge (Android), Samsung Internet, Opera, Brave
  "android.googleapis.com",
  "push.services.mozilla.com", // Firefox
  "push.apple.com", // Safari / iPhone home-screen apps (web.push.apple.com)
  "notify.windows.com", // Edge on Windows
];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_SERVICE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

const SubscriptionSchema = z.object({
  endpoint: z
    .string()
    .max(2048)
    .refine(isAllowedPushEndpoint, { message: "Unsupported push service" }),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(16).max(256),
    auth: z.string().min(8).max(128),
  }),
});

const SubscribeSchema = z.object({
  subscription: SubscriptionSchema,
  notifyOrders: z.boolean().optional(),
  notifyLeads: z.boolean().optional(),
});

const UnsubscribeSchema = z.object({ endpoint: z.string().min(1).max(2048) });

const DISABLED = { enabled: false as const, error: "push_disabled" };

/** 503 "push not configured" — an expected state, so it's logged at warn, not error. */
function pushDisabled(c: Context<AppEnv>) {
  c.set("expectedFailure", true);
  return c.json(DISABLED, 503);
}

export function makeAdminPushRouter(db: DbClient) {
  const router = new Hono<AppEnv>();
  router.use("*", makeRequireAdmin(db));

  router.get("/public-key", (c) => {
    const cfg = getVapidConfig();
    return c.json(cfg ? { enabled: true, publicKey: cfg.publicKey } : { enabled: false });
  });

  router.post("/subscribe", async (c) => {
    if (!getVapidConfig()) return pushDisabled(c);
    const parsed = SubscribeSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Invalid request", issues: parsed.error.flatten() }, 400);
    }
    const { subscription, notifyOrders, notifyLeads } = parsed.data;
    const adminUserId = c.get("adminUserId")!;
    const userAgent = (c.req.header("User-Agent") ?? "").slice(0, 300) || null;

    // Same endpoint again (re-sync, toggles changed, or another admin signed in
    // on this device): update in place — one row per device.
    const update: Partial<typeof adminPushSubscriptions.$inferInsert> = {
      adminUserId,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      userAgent,
      lastError: null,
    };
    if (notifyOrders !== undefined) update.notifyOrders = notifyOrders;
    if (notifyLeads !== undefined) update.notifyLeads = notifyLeads;

    const [row] = await db
      .insert(adminPushSubscriptions)
      .values({
        adminUserId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        userAgent,
        notifyOrders: notifyOrders ?? true,
        notifyLeads: notifyLeads ?? true,
      })
      .onConflictDoUpdate({ target: adminPushSubscriptions.endpoint, set: update })
      .returning({
        id: adminPushSubscriptions.id,
        notifyOrders: adminPushSubscriptions.notifyOrders,
        notifyLeads: adminPushSubscriptions.notifyLeads,
      });

    return c.json({
      ok: true,
      enabled: true,
      id: row?.id ?? null,
      notifyOrders: row?.notifyOrders ?? notifyOrders ?? true,
      notifyLeads: row?.notifyLeads ?? notifyLeads ?? true,
    });
  });

  router.post("/unsubscribe", async (c) => {
    const parsed = UnsubscribeSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Invalid request", issues: parsed.error.flatten() }, 400);
    }
    const removed = await db
      .delete(adminPushSubscriptions)
      .where(
        and(
          eq(adminPushSubscriptions.endpoint, parsed.data.endpoint),
          eq(adminPushSubscriptions.adminUserId, c.get("adminUserId")!),
        ),
      )
      .returning({ id: adminPushSubscriptions.id });
    return c.json({ ok: true, removed: removed.length });
  });

  router.post("/test", async (c) => {
    if (!getVapidConfig()) return pushDisabled(c);
    const subs = await db
      .select({
        id: adminPushSubscriptions.id,
        endpoint: adminPushSubscriptions.endpoint,
        p256dh: adminPushSubscriptions.p256dh,
        auth: adminPushSubscriptions.auth,
      })
      .from(adminPushSubscriptions)
      .where(eq(adminPushSubscriptions.adminUserId, c.get("adminUserId")!));
    const summary = await sendToSubscriptions(db, subs, buildTestPushPayload(), { ttl: TEST_PUSH_TTL_SECONDS });
    return c.json({
      enabled: true,
      attempted: summary.attempted,
      sent: summary.sent,
      removed: summary.removed,
      failed: summary.failed,
      results: summary.results,
    });
  });

  return router;
}
