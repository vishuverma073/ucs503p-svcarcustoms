import { Hono } from "hono";
import { sql } from "drizzle-orm";
import type { DbClient } from "../db/client.js";
import { cached } from "../lib/cache.js";
import type { AppEnv } from "../lib/types.js";

/**
 * Public lifetime visit counter for the storefront footer.
 *
 * This deliberately reads the SAME table the admin Store Analytics dashboard
 * reads (`analytics_events`, written by the storefront's AnalyticsTracker on
 * every route change). It used to be a standalone Upstash INCR counter, which
 * meant the footer and the admin dashboard were two unrelated numbers that
 * could never be reconciled — and with Upstash unconfigured the counter fell
 * back to an in-process integer that silently reset to zero on every deploy.
 *
 * One source of truth, two honest views of it:
 *   footer → lifetime distinct visitors (no range)
 *   admin  → the same events, windowed to the selected range
 */
const LIFETIME_VISITORS = sql`select count(distinct visitor_id)::int as total from analytics_events`;

export function makeMetricsRouter(db: DbClient) {
  const router = new Hono<AppEnv>();

  /** count(distinct …) over a growing table — cached so footer renders stay cheap. */
  async function lifetimeVisitors(): Promise<number> {
    const { value } = await cached("metrics:visits:lifetime", 60, async () => {
      const raw = await db.execute(LIFETIME_VISITORS);
      const rows = (Array.isArray(raw) ? raw : (raw as { rows?: unknown[] }).rows ?? []) as {
        total?: number | string;
      }[];
      return Number(rows[0]?.total ?? 0);
    });
    return value;
  }

  // GET /metrics/visits — lifetime distinct visitors.
  router.get("/visits", async (c) => {
    c.header("Cache-Control", "no-store");
    return c.json({ total: await lifetimeVisitors() });
  });

  // POST /metrics/visits — kept so older storefront bundles keep working.
  // The visit itself is recorded by the analytics beacon (POST /analytics/track),
  // so there is nothing to increment here; this just returns the same total.
  router.post("/visits", async (c) => {
    c.header("Cache-Control", "no-store");
    return c.json({ total: await lifetimeVisitors() });
  });

  return router;
}
