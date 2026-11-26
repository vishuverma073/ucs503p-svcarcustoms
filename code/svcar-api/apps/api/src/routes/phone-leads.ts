import { Hono } from "hono";
import { and, eq, gte } from "drizzle-orm";
import { CreatePhoneLeadRequestSchema } from "@svcar/contracts";
import type { DbClient } from "../db/client.js";
import { phoneLeads } from "../db/schema.js";
import { ipRateLimit } from "../middleware/ip-rate-limit.js";
import { queueLeadPush } from "../lib/admin-push.js";
import type { AppEnv } from "../lib/types.js";

/** A number already received within this window is acknowledged but not stored again. */
export const PHONE_LEAD_DEDUPE_MS = 24 * 60 * 60 * 1000;

/**
 * Public phone-lead capture — the storefront's "Need help finding the right
 * part?" popup. No login. The shopper must tick consent (`consent: true`);
 * the number is stored as the bare 10-digit mobile.
 *
 * The browser calls this directly (like /newsletter and /guest-checkout), so the
 * per-IP limit sees the shopper's own address rather than a shared relay's.
 */
export function makePhoneLeadsRouter(db: DbClient) {
  const router = new Hono<AppEnv>();
  // Unauthenticated write — a person submits this once; 5 per 10 minutes per IP
  // leaves room for typos while stopping anyone filling the table.
  router.use("*", ipRateLimit("phone-lead", 5, 600));

  // POST /phone-leads
  router.post("/", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = CreatePhoneLeadRequestSchema.safeParse(body);
    if (!parsed.success) {
      const field = parsed.error.issues[0]?.path[0];
      const error = field === "phone" ? "invalid_phone" : field === "consent" ? "consent_required" : "invalid_request";
      return c.json({ error }, 400);
    }
    const { phone, pagePath, visitorId } = parsed.data;

    // Same number in the last 24h: answer exactly as for a new one (so the
    // response says nothing about which numbers we hold), but don't store a copy.
    const since = new Date(Date.now() - PHONE_LEAD_DEDUPE_MS);
    const [recent] = await db
      .select({ id: phoneLeads.id })
      .from(phoneLeads)
      .where(and(eq(phoneLeads.phone, phone), gte(phoneLeads.createdAt, since)))
      .limit(1);

    if (!recent) {
      // A failed write is NOT swallowed (unlike the WhatsApp click beacon): the
      // shopper is told it didn't go through, and onError alerts us.
      const storedPath = pagePath && pagePath.startsWith("/") ? pagePath : null;
      const [row] = await db
        .insert(phoneLeads)
        .values({
          phone,
          source: "popup",
          pagePath: storedPath,
          visitorId: visitorId || null,
        })
        .returning({ id: phoneLeads.id });
      // Phone alert for the admins — only for a new row, never for the 24h
      // repeat. Fire-and-forget: the shopper's response doesn't wait for it.
      if (row) queueLeadPush(db, { id: row.id, phone, pagePath: storedPath });
    }
    return c.json({ ok: true as const });
  });

  return router;
}
