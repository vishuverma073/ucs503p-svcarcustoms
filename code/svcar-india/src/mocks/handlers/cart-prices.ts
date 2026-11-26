import { http, HttpResponse } from "msw";
import { API_BASE } from "@/lib/api-config";
import { products } from "../data/products";

/** Mirrors POST /cart/price-check: today's price for each cart SKU (no login). */
export const cartPriceHandlers = [
  http.post(`${API_BASE}/cart/price-check`, async ({ request }) => {
    const body = (await request.json().catch(() => null)) as { skuIds?: unknown } | null;
    const ids = Array.isArray(body?.skuIds) ? body.skuIds : null;
    if (!ids || ids.length === 0 || ids.length > 50 || !ids.every((n) => Number.isInteger(n) && (n as number) > 0)) {
      return HttpResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const wanted = new Set(ids as number[]);
    const items = [];
    for (const p of products) {
      for (const s of p.skus) {
        if (!wanted.has(s.id)) continue;
        items.push({
          skuId: s.id,
          price: s.price,
          salePrice: s.salePrice,
          unitPrice: s.salePrice ?? s.price,
          stock: s.stock ?? null,
          available: p.status === "active",
        });
      }
    }
    const found = new Set(items.map((i) => i.skuId));
    return HttpResponse.json({ items, missing: [...wanted].filter((id) => !found.has(id)) });
  }),
];
