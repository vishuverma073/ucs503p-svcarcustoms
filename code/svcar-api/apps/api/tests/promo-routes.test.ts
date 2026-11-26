import { describe, expect, it } from "vitest";

process.env.JWT_ACCESS_SECRET = "test-access-secret-at-least-32-chars-long!!";
process.env.JWT_ADMIN_SECRET = "test-admin-secret-at-least-32-chars-long!!";
process.env.NODE_ENV = "test"; // PayU stub mode + rate limits off

import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { createApp } from "../src/app.js";
import { signAccess, signAdminAccess } from "../src/lib/jwt.js";
import { markOrderPaid } from "../src/lib/mark-paid.js";
import { carts, orders, promoCodes, users } from "../src/db/schema.js";
import type { PromoRow } from "../src/lib/promo.js";
import type { DbClient } from "../src/db/client.js";

const dialect = new PgDialect();
const USER_ID = "11111111-1111-1111-1111-111111111111";
const ADMIN_ID = "fb354b9c-6c05-4379-8f2c-4c59962d4761";

const DIWALI10: PromoRow = {
  id: 1,
  code: "DIWALI10",
  percentOff: 10,
  minSubtotal: "7000.00",
  maxDiscount: null,
  startsAt: new Date("2026-01-01T00:00:00Z"),
  endsAt: new Date("2099-01-01T00:00:00Z"),
  active: true,
  usageLimit: null,
  usedCount: 3,
  createdAt: new Date("2026-10-20T00:00:00Z"),
};
const EXPIRED: PromoRow = { ...DIWALI10, id: 2, code: "OLD10", endsAt: new Date("2025-01-01T00:00:00Z") };

const SKU = {
  id: 10,
  skuCode: "BK-1",
  price: "4000.00",
  salePrice: null,
  dimensionValues: null,
  stock: null,
  product: { name: "Body kit", status: "active", images: [{ url: "/a.png" }] },
};

interface State {
  promos?: PromoRow[];
  skus?: unknown[];
  user?: unknown;
  cart?: { id: string };
  items?: unknown[];
}

/** Fake db: answers each table, and records inserts / updates. */
function makeDb(state: State, log: { inserted: { table: unknown; values: any }[]; updated: { table: unknown; set: any }[] }) {
  const promos = state.promos ?? [];
  const insert = (table: unknown) => ({
    values: (values: any) => {
      log.inserted.push({ table, values });
      return Object.assign(Promise.resolve(), {
        returning: async () => [{ ...DIWALI10, id: 9, ...values, usedCount: 0, createdAt: new Date() }],
      });
    },
  });
  return {
    select: () => ({
      from: (table: unknown) => {
        const rows = () => {
          if (table === promoCodes) return promos;
          if (table === users) return state.user ? [state.user] : [{ id: ADMIN_ID, email: "a@b.com", isAdmin: true }];
          if (table === carts) return state.cart ? [state.cart] : [];
          return [];
        };
        return {
          // Promo lookups filter by code; the fake answers by the code in the WHERE.
          where: (cond: SQL) => {
            const params = dialect.sqlToQuery(cond).params;
            const filtered = () =>
              table === promoCodes && !params.includes(true)
                ? promos.filter((p) => params.includes(p.code) || params.includes(p.id))
                : rows();
            return {
              limit: async () => filtered(),
              orderBy: async () => rows().filter((p: any) => p.active !== false),
            };
          },
          orderBy: async () => rows(),
        };
      },
    }),
    query: {
      skus: { findMany: async () => state.skus ?? [] },
      cartItems: { findMany: async () => state.items ?? [] },
    },
    insert,
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({ insert }),
    update: (table: unknown) => ({
      set: (set: any) => {
        log.updated.push({ table, set });
        const returning = async () =>
          table === orders ? [{ id: "o1", promoCode: "DIWALI10" }] : [{ ...DIWALI10, ...set }];
        return { where: () => Object.assign(Promise.resolve(), { returning }) };
      },
    }),
    delete: () => ({ where: () => ({ returning: async () => [DIWALI10] }) }),
  } as unknown as DbClient;
}

const newLog = () => ({ inserted: [] as { table: unknown; values: any }[], updated: [] as { table: unknown; set: any }[] });

function post(app: ReturnType<typeof createApp>, path: string, body: unknown, headers: Record<string, string> = {}) {
  return app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const ADDRESS = {
  fullName: "Asha Verma",
  phone: "9876543210",
  line1: "123 Test St",
  city: "Delhi",
  state: "Delhi",
  pincode: "110001",
};

describe("POST /cart/apply-promo", () => {
  it("prices the cart on the server and returns the discount", async () => {
    const app = createApp({ db: makeDb({ promos: [DIWALI10], skus: [SKU] }, newLog()) });
    const res = await post(app, "/cart/apply-promo", { code: " diwali10 ", items: [{ skuId: 10, qty: 2, price: 1 }] });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({
      ok: true,
      code: "DIWALI10",
      percentOff: 10,
      discount: 800,
      subtotal: 8000,
      total: 7200,
      message: "DIWALI10 applied — you save ₹800",
    });
  });

  it("says how much more to add below the minimum", async () => {
    const app = createApp({ db: makeDb({ promos: [DIWALI10], skus: [SKU] }, newLog()) });
    const body = await (await post(app, "/cart/apply-promo", { code: "DIWALI10", items: [{ skuId: 10, qty: 1 }] })).json();
    expect(body).toEqual({
      ok: false,
      code: "DIWALI10",
      reason: "min_subtotal",
      message: "Add ₹3,000 more to use DIWALI10",
      subtotal: 4000,
      shortBy: 3000,
    });
  });

  it("refuses unknown and expired codes with a reason", async () => {
    const app = createApp({ db: makeDb({ promos: [DIWALI10, EXPIRED], skus: [SKU] }, newLog()) });
    const items = [{ skuId: 10, qty: 3 }];
    expect(await (await post(app, "/cart/apply-promo", { code: "NOPE99", items })).json()).toMatchObject({
      ok: false,
      reason: "invalid",
      message: "Invalid code",
    });
    expect(await (await post(app, "/cart/apply-promo", { code: "old10", items })).json()).toMatchObject({
      ok: false,
      reason: "expired",
      message: "Code expired",
    });
  });

  it("400 on a malformed body", async () => {
    const app = createApp({ db: makeDb({}, newLog()) });
    expect((await post(app, "/cart/apply-promo", { code: "X", items: [] })).status).toBe(400);
  });
});

describe("GET /promos/active", () => {
  it("lists only live codes", async () => {
    const app = createApp({ db: makeDb({ promos: [DIWALI10, EXPIRED, { ...DIWALI10, id: 3, code: "FULL", usageLimit: 3 }] }, newLog()) });
    const res = await app.request("/promos/active");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      items: [{ code: "DIWALI10", percentOff: 10, minSubtotal: 7000, maxDiscount: null, endsAt: "2099-01-01T00:00:00.000Z" }],
    });
  });
});

describe("orders with a promo code", () => {
  it("guest: stores the code + discount and charges PayU the discounted total", async () => {
    const log = newLog();
    const app = createApp({ db: makeDb({ promos: [DIWALI10], skus: [SKU] }, log) });
    const res = await post(app, "/guest-checkout/orders", {
      items: [{ skuId: 10, qty: 2 }],
      email: "asha@example.com",
      address: ADDRESS,
      promoCode: "diwali10",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    // 2 × ₹4,000 = ₹8,000 − ₹800 = ₹7,200 (delivery free above ₹5,000).
    expect(body).toMatchObject({ totalAmount: 720000, amount: 720000, discountAmount: 80000, promoCode: "DIWALI10" });
    expect(body.payu.params.amount).toBe("7200.00");
    const order = log.inserted.find((i) => i.table === orders)?.values;
    expect(order).toMatchObject({ subtotal: "8000", discount: "800", total: "7200", promoCode: "DIWALI10" });
  });

  it("guest COD: the 15% advance is taken from the discounted total", async () => {
    const app = createApp({ db: makeDb({ promos: [DIWALI10], skus: [SKU] }, newLog()) });
    const body = (await (
      await post(app, "/guest-checkout/orders", {
        items: [{ skuId: 10, qty: 2 }],
        email: "asha@example.com",
        address: ADDRESS,
        paymentMethod: "cod",
        promoCode: "DIWALI10",
      })
    ).json()) as Record<string, any>;
    expect(body).toMatchObject({ totalAmount: 720000, amount: 108000, remainingAmount: 612000 });
    expect(body.payu.params.amount).toBe("1080.00");
  });

  it("guest: an ineligible code is refused (422), never charged at full price", async () => {
    const log = newLog();
    const app = createApp({ db: makeDb({ promos: [DIWALI10, EXPIRED], skus: [SKU] }, log) });
    const below = await post(app, "/guest-checkout/orders", {
      items: [{ skuId: 10, qty: 1 }],
      email: "asha@example.com",
      address: ADDRESS,
      promoCode: "DIWALI10",
    });
    expect(below.status).toBe(422);
    expect(await below.json()).toEqual({
      error: "promo_invalid",
      reason: "min_subtotal",
      message: "Add ₹3,000 more to use DIWALI10",
    });
    const expired = await post(app, "/guest-checkout/orders", {
      items: [{ skuId: 10, qty: 2 }],
      email: "asha@example.com",
      address: ADDRESS,
      promoCode: "OLD10",
    });
    expect(expired.status).toBe(422);
    expect(log.inserted.some((i) => i.table === orders)).toBe(false);
  });

  it("signed-in: applies the code to the server cart", async () => {
    const log = newLog();
    const app = createApp({
      db: makeDb(
        {
          promos: [DIWALI10],
          user: { id: USER_ID, name: "Asha", email: "asha@example.com", phone: null },
          cart: { id: "c1" },
          items: [{ id: 1, skuId: 10, qty: 2, sku: SKU }],
        },
        log,
      ),
    });
    const res = await post(
      app,
      "/checkout/order",
      { address: { line1: "1 St", city: "Delhi", state: "DL", pincode: "110001", phone: "9876543210" }, promoCode: "DIWALI10" },
      { Authorization: `Bearer ${await signAccess({ sub: USER_ID, isAdmin: false })}` },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ totalAmount: 720000, discountAmount: 80000, promoCode: "DIWALI10" });
    expect(log.inserted.find((i) => i.table === orders)?.values).toMatchObject({ promoCode: "DIWALI10", discount: "800" });
  });

  it("without a code nothing changes", async () => {
    const log = newLog();
    const app = createApp({ db: makeDb({ skus: [SKU] }, log) });
    const body = (await (
      await post(app, "/guest-checkout/orders", { items: [{ skuId: 10, qty: 2 }], email: "a@b.co", address: ADDRESS })
    ).json()) as Record<string, any>;
    expect(body).toMatchObject({ totalAmount: 800000, discountAmount: 0, promoCode: null });
    expect(log.inserted.find((i) => i.table === orders)?.values).toMatchObject({ promoCode: null, discount: "0" });
  });
});

describe("markOrderPaid", () => {
  it("counts the promo use once, on the pending→paid transition", async () => {
    const log = newLog();
    const won = await markOrderPaid(makeDb({}, log), { id: "o1", paymentMethod: "prepaid", userId: null }, {
      mihpayid: "m1",
      advancePaid: 7200,
    });
    expect(won).toBe(true);
    const bump = log.updated.find((u) => u.table === promoCodes);
    expect(bump).toBeTruthy();
    expect(Object.keys(bump!.set)).toEqual(["usedCount"]);
  });
});

describe("/admin/promo-codes", () => {
  const auth = async () => ({ Authorization: `Bearer ${await signAdminAccess({ sub: ADMIN_ID })}` });

  it("401 without an admin token", async () => {
    const res = await createApp({ db: makeDb({}, newLog()) }).request("/admin/promo-codes");
    expect(res.status).toBe(401);
  });

  it("lists codes with their use counts", async () => {
    const res = await createApp({ db: makeDb({ promos: [DIWALI10] }, newLog()) }).request("/admin/promo-codes", {
      headers: await auth(),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ items: [{ id: 1, code: "DIWALI10", percentOff: 10, minSubtotal: 7000, usedCount: 3 }] });
  });

  it("creates a code (uppercased)", async () => {
    const log = newLog();
    const res = await post(
      createApp({ db: makeDb({}, log) }),
      "/admin/promo-codes",
      { code: "newyear15", percentOff: 15, minSubtotal: 5000, endsAt: "2027-01-02T00:00:00+05:30" },
      await auth(),
    );
    expect(res.status).toBe(201);
    expect(log.inserted.find((i) => i.table === promoCodes)?.values).toMatchObject({
      code: "NEWYEAR15",
      percentOff: 15,
      minSubtotal: "5000",
      active: true,
    });
  });

  it("toggles a code off and refuses a backwards window", async () => {
    const log = newLog();
    const app = createApp({ db: makeDb({ promos: [DIWALI10] }, log) });
    const off = await app.request("/admin/promo-codes/1", {
      method: "PATCH",
      headers: { ...(await auth()), "Content-Type": "application/json" },
      body: JSON.stringify({ active: false }),
    });
    expect(off.status).toBe(200);
    expect(log.updated.find((u) => u.table === promoCodes)?.set).toEqual({ active: false });

    const bad = await app.request("/admin/promo-codes/1", {
      method: "PATCH",
      headers: { ...(await auth()), "Content-Type": "application/json" },
      body: JSON.stringify({ endsAt: "2025-01-01T00:00:00Z" }),
    });
    expect(bad.status).toBe(400);
  });

  it("deletes a code", async () => {
    const res = await createApp({ db: makeDb({ promos: [DIWALI10] }, newLog()) }).request("/admin/promo-codes/1", {
      method: "DELETE",
      headers: await auth(),
    });
    expect(res.status).toBe(204);
  });
});
