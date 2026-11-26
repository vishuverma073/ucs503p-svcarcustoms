import { Hono } from "hono";
import { inArray } from "drizzle-orm";
import { z } from "zod";
import { ApplyPromoRequestSchema, normalizePromoCode, type ApplyPromoResponse } from "@svcar/contracts";
import type { DbClient } from "../db/client.js";
import { skus } from "../db/schema.js";
import { ipRateLimit } from "../middleware/ip-rate-limit.js";
import { loadPricingConfig, mergeLines } from "../lib/place-order.js";
import { calculatePricing } from "../lib/pricing.js";
import { evaluatePromo, findPromo } from "../lib/promo.js";
import type { AppEnv } from "../lib/types.js";

/**
 * POST /cart/price-check — current price, sale price and stock for the SKUs in
 * a shopper's cart (read-only, no login).
 *
 * A guest's cart lives in the browser with the price it had when it was added.
 * The storefront calls this on /cart and /checkout (and right before Pay) so
 * the page always shows what the order will actually charge — the same
 * `salePrice ?? price` rule buildOrderLines uses. Never cached: product GETs are
 * CDN/browser-cacheable for a minute, which is exactly the staleness this
 * endpoint exists to avoid.
 */
const PriceCheckSchema = z.object({
  skuIds: z.array(z.number().int().positive()).min(1).max(50),
});

export function makeCartPricesRouter(db: DbClient) {
  const router = new Hono<AppEnv>();
  // Called on cart/checkout views and once per Pay tap; generous but bounded.
  router.use("*", ipRateLimit("cart-price-check", 120, 60));

  router.post("/price-check", async (c) => {
    const parsed = PriceCheckSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Invalid request" }, 400);
    const ids = [...new Set(parsed.data.skuIds)];

    const rows = await db.query.skus.findMany({
      where: inArray(skus.id, ids),
      columns: { id: true, price: true, salePrice: true, stock: true },
      with: { product: { columns: { status: true } } },
    });

    const items = rows.map((r) => {
      const price = Number(r.price);
      const salePrice = r.salePrice === null ? null : Number(r.salePrice);
      return {
        skuId: r.id,
        price,
        salePrice,
        /** What an order charges per unit right now. */
        unitPrice: salePrice ?? price,
        stock: r.stock,
        available: r.product?.status === "active",
      };
    });
    const found = new Set(rows.map((r) => r.id));
    c.header("Cache-Control", "no-store");
    return c.json({ items, missing: ids.filter((id) => !found.has(id)) });
  });

  /**
   * POST /cart/apply-promo — would this code apply to this cart, and what would
   * it take off? Public (guests use it too). The cart is SKU ids + quantities;
   * the subtotal is priced here with the same `salePrice ?? price` rule as the
   * order, so the discount shown is the discount charged. Lines that can't be
   * bought (gone / not active) are left out — the order refuses those anyway.
   *
   * Every outcome a shopper can cause (unknown code, expired, below the
   * minimum…) is a 200 with `ok: false` and a message to show; only a
   * malformed body is a 400. A tighter limit than price-check on top of the
   * router's, so codes can't be guessed at speed.
   */
  router.post("/apply-promo", ipRateLimit("cart-apply-promo", 30, 60), async (c) => {
    const parsed = ApplyPromoRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Invalid request" }, 400);
    const wanted = mergeLines(parsed.data.items);

    const rows = await db.query.skus.findMany({
      where: inArray(
        skus.id,
        wanted.map((w) => w.skuId),
      ),
      columns: { id: true, price: true, salePrice: true },
      with: { product: { columns: { status: true } } },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const lines = wanted.flatMap((w) => {
      const sku = byId.get(w.skuId);
      if (!sku || sku.product?.status !== "active") return [];
      return [{ unitPrice: Number(sku.salePrice ?? sku.price), qty: w.qty }];
    });

    const config = await loadPricingConfig(db);
    const subtotal = calculatePricing(lines, config).subtotal;
    const typed = normalizePromoCode(parsed.data.code);
    const result = evaluatePromo(typed, await findPromo(db, typed), subtotal);

    c.header("Cache-Control", "no-store");
    if (!result.ok) {
      const body: ApplyPromoResponse = {
        ok: false,
        code: result.code,
        reason: result.reason,
        message: result.message,
        subtotal,
        ...(result.shortBy !== undefined ? { shortBy: result.shortBy } : {}),
      };
      return c.json(body);
    }
    const priced = calculatePricing(lines, config, result.discount);
    const body: ApplyPromoResponse = {
      ok: true,
      code: result.code,
      percentOff: result.percentOff,
      discount: priced.discount,
      subtotal: priced.subtotal,
      total: priced.total,
      message: result.message,
    };
    return c.json(body);
  });

  return router;
}
