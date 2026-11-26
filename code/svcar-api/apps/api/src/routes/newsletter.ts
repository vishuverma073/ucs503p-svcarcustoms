import { Hono } from "hono";
import { z } from "zod";
import type { DbClient } from "../db/client.js";
import { subscribers } from "../db/schema.js";
import { ipRateLimit } from "../middleware/ip-rate-limit.js";
import type { AppEnv } from "../lib/types.js";

// Every field is length-capped: this endpoint is public and unauthenticated, so
// uncapped strings let anyone write arbitrarily large rows into the DB.
const SubscribeSchema = z.object({
  email: z.string().email().max(254),
  name: z.string().max(120).optional(),
  phone: z.string().max(20).optional(),
  source: z.string().max(60).optional(),
});

/** Public newsletter signup (storefront footer). */
export function makeNewsletterRouter(db: DbClient) {
  const router = new Hono<AppEnv>();
  // Unauthenticated write — cap per IP (email is upserted, so each unique address
  // would otherwise create an unbounded number of rows).
  router.use("*", ipRateLimit("newsletter", 10, 60 * 60));

  // POST /newsletter/subscribe — idempotent upsert on email.
  router.post("/subscribe", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const parsed = SubscribeSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "A valid email is required" }, 400);
    }
    const { email, name, phone, source } = parsed.data;
    await db
      .insert(subscribers)
      .values({
        email: email.trim().toLowerCase(),
        name: name?.trim() || null,
        phone: phone?.trim() || null,
        source: source || "footer",
        status: "active",
      })
      .onConflictDoUpdate({
        target: subscribers.email,
        // Re-subscribing flips an unsubscribed row back to active.
        set: { status: "active" },
      });
    return c.json({ subscribed: true });
  });

  return router;
}
