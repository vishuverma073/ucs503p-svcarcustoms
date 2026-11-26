import { sql } from "drizzle-orm";
import type { DbClient } from "../db/client.js";

/**
 * Which products are actually selling, ranked.
 *
 * Every unit sold decays by half every HALF_LIFE_DAYS, so the list re-sorts
 * itself as orders come in — no cron, no stored rank column, no weekly job to
 * forget to run. A fixed "last 7 days" window was the other option, but it has
 * a cliff: a product that sold well on day 8 drops to zero overnight, and a
 * quiet week empties the section entirely. Decay degrades instead of falling
 * off, which matters most while order volume is still low.
 *
 * Anything older than WINDOW_DAYS is skipped outright — at a 14-day half-life
 * a 90-day-old sale is worth ~1% of a fresh one, so reading further back costs
 * query time to change nothing.
 */
export const HALF_LIFE_DAYS = 14;
export const WINDOW_DAYS = 90;

/**
 * Order states that count as a real sale.
 *
 * "pending" is an order that was never paid — usually an abandoned checkout —
 * and "cancelled"/"refunded" are sales that were taken back. Counting any of
 * them would let an abandoned cart or a returned item push a product onto the
 * home page.
 */
const SOLD_STATUSES = ["paid", "confirmed", "shipped", "delivered"] as const;

export type SalesRank = { id: number; units: number; score: number };

/**
 * Products ranked by decayed units sold, best first.
 *
 * Joins through skus, so a line whose sku_id was nulled out (the product was
 * deleted after the order) drops out rather than ranking a product that no
 * longer exists. Archived and draft products are excluded too — they can't be
 * bought, so they have no business on the home page.
 */
export async function salesRank(db: DbClient, limit: number): Promise<SalesRank[]> {
  const rows = await db.execute<{ id: number; units: number; score: number }>(sql`
    SELECT
      s.product_id AS id,
      SUM(oi.qty)::int AS units,
      SUM(
        oi.qty * POWER(
          0.5,
          EXTRACT(EPOCH FROM (NOW() - o.created_at)) / (${HALF_LIFE_DAYS}::float8 * 86400)
        )
      )::float8 AS score
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    JOIN skus s ON s.id = oi.sku_id
    JOIN products p ON p.id = s.product_id
    WHERE o.status IN ('paid', 'confirmed', 'shipped', 'delivered')
      AND o.created_at > NOW() - MAKE_INTERVAL(days => ${WINDOW_DAYS}::int)
      AND p.status = 'active'
    GROUP BY s.product_id
    ORDER BY score DESC, units DESC, MAX(o.created_at) DESC, s.product_id ASC
    LIMIT ${limit}
  `);

  // `> 0`, not just isInteger: ids arrive as strings from the driver and
  // Number(null) is 0, which would otherwise pass as a legitimate product id.
  return (rows as unknown as { id: number; units: number; score: number }[])
    .map((r) => ({ id: Number(r.id), units: Number(r.units), score: Number(r.score) }))
    .filter((r) => Number.isInteger(r.id) && r.id > 0);
}

/**
 * Admin pins first, then whatever is selling, capped at `limit`.
 *
 * Pins win because they're a deliberate merchandising call — a new kit we want
 * pushed has no sales history yet, and waiting for the ranking to notice it
 * defeats the point. A pinned product that also ranks isn't listed twice.
 */
export function mergeBestsellerIds(pinned: number[], ranked: number[], limit: number): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const id of [...pinned, ...ranked]) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length === limit) break;
  }
  return out;
}

/** Ordered product ids for the bestsellers rail. Empty means nothing has sold. */
export async function bestsellerProductIds(db: DbClient, limit: number): Promise<number[]> {
  const pinnedRows = await db.execute<{ id: number }>(sql`
    SELECT id FROM products
    WHERE status = 'active' AND is_bestseller = true
    ORDER BY id ASC
    LIMIT ${limit}
  `);
  const pinned = (pinnedRows as unknown as { id: number }[])
    .map((r) => Number(r.id))
    .filter((n) => Number.isInteger(n) && n > 0);

  if (pinned.length >= limit) return pinned.slice(0, limit);

  const ranked = await salesRank(db, limit);
  return mergeBestsellerIds(
    pinned,
    ranked.map((r) => r.id),
    limit,
  );
}
