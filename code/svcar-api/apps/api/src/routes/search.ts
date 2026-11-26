import { Hono } from "hono";
import { inArray, sql } from "drizzle-orm";
import { SearchPageSchema, SearchQuerySchema } from "@svcar/contracts";
import type { DbClient } from "../db/client.js";
import { products } from "../db/schema.js";
import { toListItem } from "./products.js";
import type { AppEnv } from "../lib/types.js";

/**
 * Full-text product search over the generated search_vector, ranked by ts_rank.
 * Paginated by rank offset: `limit` (default 20, at most 50) and `cursor` (the
 * previous page's `nextCursor`). The id cursor of GET /products can't be used
 * here because relevance order has no key to seek on.
 */
export function makeSearchRouter(db: DbClient) {
  const router = new Hono<AppEnv>();

  // GET /search?q=&limit=&cursor= — empty/missing q returns an empty result
  // (200), not an error; a bad limit/cursor falls back to the defaults.
  router.get("/", async (c) => {
    const { q: rawQ, limit, cursor } = SearchQuerySchema.parse(c.req.query());
    // Cap length to bound the FTS query cost (the value is already parameterized,
    // so this is about resource use, not injection).
    const q = rawQ?.trim().slice(0, 100);
    if (!q) return c.json(SearchPageSchema.parse({ items: [], nextCursor: null }));

    // One row past the page says whether a next page exists. `id` breaks rank
    // ties so the same product can't land on two consecutive pages.
    const ranked = await db.execute<{ id: number }>(sql`
      SELECT id FROM products
      WHERE status = 'active' AND search_vector @@ websearch_to_tsquery('english', ${q})
      ORDER BY ts_rank(search_vector, websearch_to_tsquery('english', ${q})) DESC, id ASC
      LIMIT ${limit + 1} OFFSET ${cursor}
    `);
    const rankedIds = (ranked as unknown as { id: number }[]).map((r) => Number(r.id));
    const hasMore = rankedIds.length > limit;
    const ids = rankedIds.slice(0, limit);
    if (ids.length === 0) return c.json(SearchPageSchema.parse({ items: [], nextCursor: null }));

    const rows = await db.query.products.findMany({
      where: inArray(products.id, ids),
      with: {
        skus: { columns: { price: true, salePrice: true, dimensionValues: true } },
        images: { columns: { url: true, sortOrder: true } },
        dimensions: {
          columns: { name: true, sortOrder: true },
          with: { values: { columns: { value: true, sortOrder: true } } },
        },
      },
    });

    // Preserve ts_rank ordering from the FTS query.
    const byId = new Map(rows.map((r) => [r.id, r]));
    const items = ids
      .map((id) => byId.get(id))
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
      .map((p) => toListItem(p, p.skus, p.images, p.dimensions));
    const nextCursor = hasMore ? cursor + ids.length : null;

    return c.json(SearchPageSchema.parse({ items, nextCursor }));
  });

  return router;
}
