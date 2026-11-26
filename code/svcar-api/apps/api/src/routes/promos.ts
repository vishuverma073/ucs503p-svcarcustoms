import { Hono } from "hono";
import { asc, eq } from "drizzle-orm";
import type { ActivePromoList } from "@svcar/contracts";
import type { DbClient } from "../db/client.js";
import { promoCodes } from "../db/schema.js";
import { ipRateLimit } from "../middleware/ip-rate-limit.js";
import { promoLiveCheck, toActivePromo } from "../lib/promo.js";
import type { AppEnv } from "../lib/types.js";

/**
 * GET /promos/active — the codes a shopper can use right now (active, inside
 * their window, not used up), lowest minimum first, for the storefront's
 * suggestion chips and the cart's "Add ₹X more" hint. Public, no login.
 *
 * Cached for a minute at the edge: a code switched off in the admin can still
 * be suggested for that minute, but applying it re-checks live, so it can't be
 * used.
 */
export function makePromosRouter(db: DbClient) {
  const router = new Hono<AppEnv>();
  router.use("*", ipRateLimit("promos-active", 120, 60));

  router.get("/active", async (c) => {
    const rows = await db
      .select()
      .from(promoCodes)
      .where(eq(promoCodes.active, true))
      .orderBy(asc(promoCodes.minSubtotal), asc(promoCodes.id));
    const now = new Date();
    const body: ActivePromoList = {
      items: rows.filter((r) => promoLiveCheck(r, now) === null).map(toActivePromo),
    };
    c.header("Cache-Control", "public, max-age=60, stale-while-revalidate=120");
    return c.json(body);
  });

  return router;
}
