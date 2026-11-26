import { http, HttpResponse } from "msw";
import { API_BASE } from "@/lib/api-config";
import { computeTotals } from "@/lib/checkout";
import { normalizePromoCode, type AdminPromoCode } from "@svcar/contracts";
import { MOCK_TOKEN, settings as mockSettings } from "../data/settings";
import { products } from "../data/products";
import {
  addMockPromo,
  evaluateMockPromo,
  findMockPromo,
  findMockPromoById,
  listMockPromos,
  liveCheck,
  removeMockPromo,
} from "../data/promos";

const A = API_BASE;
const isAdmin = (request: Request) => request.headers.get("Authorization") === `Bearer ${MOCK_TOKEN}`;
const unauthorized = () => HttpResponse.json({ error: "Unauthorized" }, { status: 401 });
const CODE_RE = /^[A-Z0-9_-]{3,32}$/;

/** Price SKU ids + quantities from the mock catalogue, like the API does. */
function priceLines(items: { skuId: number; qty: number }[]) {
  const lines: { price: number; qty: number }[] = [];
  for (const it of items) {
    const product = products.find((p) => p.skus.some((s) => s.id === it.skuId));
    const sku = product?.skus.find((s) => s.id === it.skuId);
    if (product && sku && product.status === "active") lines.push({ price: sku.salePrice ?? sku.price, qty: it.qty });
  }
  return lines;
}

/** The mock checkout's promo step: discount for a code, or the 422 body the API sends. */
export function mockOrderPromo(code: string | undefined, subtotal: number) {
  if (!code) return { ok: true as const, code: null, discount: 0 };
  const r = evaluateMockPromo(normalizePromoCode(code), subtotal);
  return r.ok
    ? { ok: true as const, code: r.code, discount: r.discount }
    : { ok: false as const, body: { error: "promo_invalid", reason: r.reason, message: r.message } };
}

/** Mirrors POST /cart/apply-promo, GET /promos/active and /admin/promo-codes. */
export const promoHandlers = [
  http.post(`${A}/cart/apply-promo`, async ({ request }) => {
    const body = (await request.json().catch(() => null)) as { code?: unknown; items?: unknown } | null;
    const items = Array.isArray(body?.items) ? (body.items as { skuId: number; qty: number }[]) : null;
    if (typeof body?.code !== "string" || !items || items.length === 0) {
      return HttpResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const lines = priceLines(items);
    const subtotal = computeTotals(lines, mockSettings).subtotal;
    const r = evaluateMockPromo(normalizePromoCode(body.code), subtotal);
    if (!r.ok) return HttpResponse.json({ ...r, subtotal });
    const totals = computeTotals(lines, mockSettings, r.discount);
    return HttpResponse.json({ ...r, discount: totals.discount, subtotal, total: totals.total });
  }),

  http.get(`${A}/promos/active`, () =>
    HttpResponse.json({
      items: listMockPromos()
        .filter((p) => liveCheck(p) === null)
        .sort((a, b) => a.minSubtotal - b.minSubtotal)
        .map((p) => ({
          code: p.code,
          percentOff: p.percentOff,
          minSubtotal: p.minSubtotal,
          maxDiscount: p.maxDiscount,
          endsAt: p.endsAt,
        })),
    }),
  ),

  http.get(`${A}/admin/promo-codes`, ({ request }) =>
    isAdmin(request) ? HttpResponse.json({ items: listMockPromos() }) : unauthorized(),
  ),

  http.post(`${A}/admin/promo-codes`, async ({ request }) => {
    if (!isAdmin(request)) return unauthorized();
    const b = (await request.json().catch(() => ({}))) as Partial<AdminPromoCode>;
    const code = normalizePromoCode(String(b.code ?? ""));
    const pct = Number(b.percentOff);
    if (!CODE_RE.test(code) || !Number.isInteger(pct) || pct < 1 || pct > 90) {
      return HttpResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    if (findMockPromo(code)) {
      return HttpResponse.json({ error: "Code exists", message: `${code} already exists.` }, { status: 409 });
    }
    const row = addMockPromo({
      code,
      percentOff: pct,
      minSubtotal: Number(b.minSubtotal ?? 0),
      maxDiscount: b.maxDiscount ?? null,
      startsAt: b.startsAt ?? null,
      endsAt: b.endsAt ?? null,
      active: b.active ?? true,
      usageLimit: b.usageLimit ?? null,
    });
    return HttpResponse.json(row, { status: 201 });
  }),

  http.patch(`${A}/admin/promo-codes/:id`, async ({ request, params }) => {
    if (!isAdmin(request)) return unauthorized();
    const row = findMockPromoById(Number(params.id));
    if (!row) return HttpResponse.json({ error: "Not Found" }, { status: 404 });
    const b = (await request.json().catch(() => ({}))) as Partial<AdminPromoCode>;
    if ("code" in b) return HttpResponse.json({ error: "Invalid request" }, { status: 400 });
    Object.assign(row, b);
    return HttpResponse.json(row);
  }),

  http.delete(`${A}/admin/promo-codes/:id`, ({ request, params }) => {
    if (!isAdmin(request)) return unauthorized();
    return removeMockPromo(Number(params.id))
      ? new HttpResponse(null, { status: 204 })
      : HttpResponse.json({ error: "Not Found" }, { status: 404 });
  }),
];
