import { describe, expect, it } from "vitest";

process.env.JWT_ACCESS_SECRET = "test-access-secret-at-least-32-chars-long!!";
process.env.NODE_ENV = "test"; // forces PayU stub mode (deterministic dummy salt)

import { createApp } from "../src/app.js";
import { contactMatches, hashGuestToken } from "../src/routes/guest-checkout.js";
import { orderEvents, orders } from "../src/db/schema.js";
import type { DbClient } from "../src/db/client.js";

interface State {
  skus?: unknown[];
  order?: unknown;
  events?: unknown[];
}

/** Fake db: records every insert so tests can see exactly what was written. */
function makeDb(state: State, inserted: { table: unknown; values: any }[] = []): DbClient {
  const insert = (table: unknown) => ({
    values: async (values: unknown) => {
      inserted.push({ table, values });
    },
  });
  return {
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: async () => (table === orders && state.order ? [state.order] : []),
          orderBy: async () => (table === orderEvents ? (state.events ?? []) : []),
        }),
      }),
    }),
    query: {
      skus: { findMany: async () => state.skus ?? [] },
      orders: { findFirst: async () => state.order },
    },
    insert,
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({ insert }),
    update: () => ({
      set: () => ({ where: () => Object.assign(Promise.resolve(), { returning: async () => [{ id: "x" }] }) }),
    }),
    delete: () => ({ where: async () => {} }),
  } as unknown as DbClient;
}

const SKU = {
  id: 10,
  skuCode: "LAV-1",
  price: "1500.00",
  salePrice: null,
  dimensionValues: { Size: "18x16" },
  stock: null,
  product: { name: "Lavender Sink", status: "active", images: [{ url: "/a.png" }] },
};
const ADDRESS = {
  fullName: "Asha Verma",
  phone: "9876543210",
  line1: "123 Test St",
  city: "Delhi",
  state: "Delhi",
  pincode: "110001",
};
const ORDER_BODY = {
  items: [{ skuId: 10, qty: 2 }],
  email: "Asha@Example.com",
  address: ADDRESS,
};

function post(app: ReturnType<typeof createApp>, path: string, body: unknown) {
  return app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /guest-checkout/orders", () => {
  it("needs no sign-in: places the order and returns a PayU handoff + guest token", async () => {
    const inserted: { table: unknown; values: any }[] = [];
    const res = await post(createApp({ db: makeDb({ skus: [SKU] }, inserted) }), "/guest-checkout/orders", ORDER_BODY);

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    // Priced from the DB: 2 × ₹1,500 + ₹99 shipping = ₹3,099.
    expect(body).toMatchObject({ amount: 309900, totalAmount: 309900, provider: "payu", currency: "INR" });
    expect(body.payu?.params?.txnid).toBe(body.orderNumber);
    expect(typeof body.guestToken).toBe("string");

    const order = inserted.find((i) => i.table === orders)?.values;
    expect(order).toMatchObject({
      userId: null,
      customerName: "Asha Verma",
      customerPhone: "9876543210",
      customerEmail: "asha@example.com",
      status: "pending",
    });
    // Only the hash of the token is stored.
    expect(order.guestTokenHash).toBe(hashGuestToken(body.guestToken));
    expect(order.guestTokenHash).not.toContain(body.guestToken);
  });

  it("ignores any price the client sends", async () => {
    const res = await post(createApp({ db: makeDb({ skus: [SKU] }) }), "/guest-checkout/orders", {
      ...ORDER_BODY,
      items: [{ skuId: 10, qty: 2, price: 1 }],
      totalAmount: 1,
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as Record<string, any>).totalAmount).toBe(309900);
  });

  it("merges repeated lines for the same SKU", async () => {
    const inserted: { table: unknown; values: any }[] = [];
    const res = await post(createApp({ db: makeDb({ skus: [SKU] }, inserted) }), "/guest-checkout/orders", {
      ...ORDER_BODY,
      items: [
        { skuId: 10, qty: 1 },
        { skuId: 10, qty: 1 },
      ],
    });
    expect(res.status).toBe(200);
    const lines = inserted.find((i) => i.table !== orders && Array.isArray(i.values))?.values;
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ skuId: 10, qty: 2 });
  });

  it("charges the 15% advance for COD", async () => {
    const res = await post(createApp({ db: makeDb({ skus: [SKU] }) }), "/guest-checkout/orders", {
      ...ORDER_BODY,
      paymentMethod: "cod",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(body).toMatchObject({ paymentMethod: "cod", totalAmount: 309900, amount: 46485, remainingAmount: 263415 });
  });

  it("400 without a valid email or mobile", async () => {
    const app = createApp({ db: makeDb({ skus: [SKU] }) });
    expect((await post(app, "/guest-checkout/orders", { ...ORDER_BODY, email: "nope" })).status).toBe(400);
    expect(
      (await post(app, "/guest-checkout/orders", { ...ORDER_BODY, address: { ...ADDRESS, phone: "12345" } })).status,
    ).toBe(400);
    expect((await post(app, "/guest-checkout/orders", { ...ORDER_BODY, items: [] })).status).toBe(400);
  });

  it("400 when a SKU no longer exists", async () => {
    const res = await post(createApp({ db: makeDb({ skus: [] }) }), "/guest-checkout/orders", ORDER_BODY);
    expect(res.status).toBe(400);
  });

  it("409 when there isn't enough stock", async () => {
    const res = await post(createApp({ db: makeDb({ skus: [{ ...SKU, stock: 1 }] }) }), "/guest-checkout/orders", ORDER_BODY);
    expect(res.status).toBe(409);
  });
});

const TOKEN = "a".repeat(32);
const PENDING = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  orderNumber: "SV0000000000",
  userId: null,
  guestTokenHash: hashGuestToken(TOKEN),
  total: "3099.00",
  status: "pending",
  paymentMethod: "prepaid",
  customerName: "Asha Verma",
  customerEmail: "asha@example.com",
  customerPhone: "9876543210",
};

describe("POST /guest-checkout/orders/:orderNumber/pay", () => {
  it("200 → fresh PayU handoff with the right token", async () => {
    const res = await post(createApp({ db: makeDb({ order: PENDING }) }), "/guest-checkout/orders/SV0000000000/pay", {
      token: TOKEN,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(body).toMatchObject({ orderNumber: "SV0000000000", amount: 309900, provider: "payu" });
  });

  it("404 with a wrong or missing token", async () => {
    const app = createApp({ db: makeDb({ order: PENDING }) });
    expect((await post(app, "/guest-checkout/orders/SV0000000000/pay", { token: "b".repeat(32) })).status).toBe(404);
    expect((await post(app, "/guest-checkout/orders/SV0000000000/pay", {})).status).toBe(404);
  });

  it("a guest order claimed by a later sign-in still answers to its token", async () => {
    const res = await post(
      createApp({ db: makeDb({ order: { ...PENDING, userId: "11111111-1111-1111-1111-111111111111" } }) }),
      "/guest-checkout/orders/SV0000000000/pay",
      { token: TOKEN },
    );
    expect(res.status).toBe(200);
  });

  it("accepts the order's email or mobile instead of the token (Track order page)", async () => {
    const app = createApp({ db: makeDb({ order: PENDING }) });
    for (const contact of ["asha@example.com", "ASHA@Example.com", "9876543210", "+91 98765 43210"]) {
      expect((await post(app, "/guest-checkout/orders/SV0000000000/pay", { contact })).status).toBe(200);
    }
  });

  it("404 when the email or mobile doesn't match the order", async () => {
    const app = createApp({ db: makeDb({ order: PENDING }) });
    for (const contact of ["someone@example.com", "9876543211", "hello"]) {
      expect((await post(app, "/guest-checkout/orders/SV0000000000/pay", { contact })).status).toBe(404);
    }
  });

  it("409 when the order is already paid", async () => {
    const res = await post(
      createApp({ db: makeDb({ order: { ...PENDING, status: "paid" } }) }),
      "/guest-checkout/orders/SV0000000000/pay",
      { token: TOKEN },
    );
    expect(res.status).toBe(409);
  });
});

describe("POST /guest-checkout/orders/:orderNumber", () => {
  const ORDER = {
    ...PENDING,
    createdAt: new Date("2026-10-18T10:00:00Z"),
    subtotal: "3000.00",
    shippingFee: "99.00",
    gstAmount: "458.00",
    shippingAddress: ADDRESS,
    razorpayPaymentId: null,
    paymentStatus: "pending",
    advanceAmount: "3099.00",
    advancePaid: "0",
    remainingAmount: "0",
    items: [
      {
        productName: "Lavender Sink",
        skuCode: "LAV-1",
        variantLabel: "18x16",
        imageUrl: "/a.png",
        unitPrice: "1500.00",
        qty: 2,
        lineTotal: "3000.00",
      },
    ],
  };
  const EVENTS = [{ id: 1, eventType: "placed", note: null, createdAt: new Date("2026-10-18T10:00:00Z") }];

  it("returns the order and its timeline for the right token", async () => {
    const res = await post(createApp({ db: makeDb({ order: ORDER, events: EVENTS }) }), "/guest-checkout/orders/SV0000000000", {
      token: TOKEN,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(body.order).toMatchObject({ orderNumber: "SV0000000000", total: 3099, itemCount: 2, status: "pending" });
    expect(body.order.shippingAddress).toMatchObject({ city: "Delhi", pincode: "110001" });
    expect(body.events).toEqual([{ id: 1, eventType: "placed", note: null, createdAt: "2026-10-18T10:00:00.000Z" }]);
  });

  it("404 with a wrong token", async () => {
    const res = await post(createApp({ db: makeDb({ order: ORDER }) }), "/guest-checkout/orders/SV0000000000", {
      token: "b".repeat(32),
    });
    expect(res.status).toBe(404);
  });

  it("returns the order for its mobile number, from any device, and 404 for another", async () => {
    const app = createApp({ db: makeDb({ order: ORDER, events: EVENTS }) });
    const ok = await post(app, "/guest-checkout/orders/sv0000000000", { contact: "98765 43210" });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as Record<string, any>).order.orderNumber).toBe("SV0000000000");
    expect((await post(app, "/guest-checkout/orders/SV0000000000", { contact: "9123456789" })).status).toBe(404);
  });
});

describe("signed-in checkout is unchanged", () => {
  it("POST /checkout/order still requires a session", async () => {
    const res = await createApp({ db: makeDb({}) }).request("/checkout/order", { method: "POST" });
    expect(res.status).toBe(401);
  });
});

describe("contactMatches", () => {
  const order = { customerEmail: "asha@example.com", customerPhone: "9876543210" };
  it("matches the email case-insensitively and the mobile with or without +91 / 0", () => {
    expect(contactMatches(" Asha@Example.com ", order)).toBe(true);
    expect(contactMatches("+91-98765-43210", order)).toBe(true);
    expect(contactMatches("09876543210", order)).toBe(true);
  });
  it("rejects anything else, including a missing email on the order", () => {
    expect(contactMatches("asha@example.org", order)).toBe(false);
    expect(contactMatches("98765", order)).toBe(false);
    expect(contactMatches("asha@example.com", { ...order, customerEmail: null })).toBe(false);
  });
});
