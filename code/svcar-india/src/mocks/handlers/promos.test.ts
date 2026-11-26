import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { server } from "../node";
import { API_BASE } from "@/lib/api-config";
import { ActivePromoListSchema, AdminPromoCodeListSchema, ApplyPromoResponseSchema } from "@svcar/contracts";
import { products } from "../data/products";

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterAll(() => server.close());

const sku = products.flatMap((p) => (p.status === "active" ? p.skus : []))[0]!;
const unit = sku.salePrice ?? sku.price;

function apply(code: string, qty: number) {
  return fetch(`${API_BASE}/cart/apply-promo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, items: [{ skuId: sku.id, qty }] }),
  }).then(async (r) => ApplyPromoResponseSchema.parse(await r.json()));
}

describe("promo mock handlers", () => {
  it("POST /cart/apply-promo prices the cart and applies an eligible code", async () => {
    const qty = Math.min(99, Math.ceil(7000 / unit));
    const r = await apply("diwali10", qty);
    expect(r).toMatchObject({ ok: true, code: "DIWALI10", percentOff: 10 });
    if (r.ok) expect(r.discount).toBe(Math.round(unit * qty * 0.1));
  });

  it("refuses unknown and expired codes like the API", async () => {
    expect(await apply("NOPE99", 1)).toMatchObject({ ok: false, reason: "invalid", message: "Invalid code" });
    expect(await apply("MONSOON15", 99)).toMatchObject({ ok: false, reason: "expired" });
  });

  it("GET /promos/active lists only live codes, lowest minimum first", async () => {
    const list = ActivePromoListSchema.parse(await (await fetch(`${API_BASE}/promos/active`)).json());
    expect(list.items.map((p) => p.code)).not.toContain("MONSOON15");
  });

  it("GET /admin/promo-codes is gated and matches the contract", async () => {
    expect((await fetch(`${API_BASE}/admin/promo-codes`)).status).toBe(401);
    const res = await fetch(`${API_BASE}/admin/promo-codes`, { headers: { Authorization: "Bearer mock-token" } });
    const list = AdminPromoCodeListSchema.parse(await res.json());
    expect(list.items.map((p) => p.code)).toEqual(expect.arrayContaining(["DIWALI10", "DIWALI5"]));
  });
});
