import { describe, expect, it, vi } from "vitest";

process.env.NODE_ENV = "test";
process.env.JWT_ADMIN_SECRET = "test-admin-secret-at-least-32-chars-long!!";
process.env.LOG_LEVEL = "debug";

import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { createApp } from "../src/app.js";
import { signAdminAccess } from "../src/lib/jwt.js";
import type { DbClient } from "../src/db/client.js";

const dialect = new PgDialect();

const SKUS = [
  { id: 7, price: "6999.00", salePrice: "6499.00", stock: 3, product: { status: "active" } },
  { id: 8, price: "4999.00", salePrice: null, stock: null, product: { status: "active" } },
  { id: 9, price: "100.00", salePrice: null, stock: 5, product: { status: "archived" } },
];

function dbWith(seen: string[] = []): DbClient {
  return {
    query: {
      skus: {
        findMany: async ({ where }: { where: SQL }) => {
          const { sql, params } = dialect.sqlToQuery(where);
          seen.push(sql);
          return SKUS.filter((s) => (params as number[]).includes(s.id));
        },
      },
    },
  } as unknown as DbClient;
}

const check = (db: DbClient, body: unknown, ip = "10.1.1.1") =>
  createApp({ db }).request("/cart/price-check", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": ip },
    body: JSON.stringify(body),
  });

describe("POST /cart/price-check", () => {
  it("returns today's price, sale price, unit price (sale ?? price), stock and availability; never cached", async () => {
    const seen: string[] = [];
    const res = await check(dbWith(seen), { skuIds: [7, 8, 9, 404, 7] });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({
      items: [
        { skuId: 7, price: 6999, salePrice: 6499, unitPrice: 6499, stock: 3, available: true },
        { skuId: 8, price: 4999, salePrice: null, unitPrice: 4999, stock: null, available: true },
        { skuId: 9, price: 100, salePrice: null, unitPrice: 100, stock: 5, available: false },
      ],
      missing: [404],
    });
    expect(seen[0]).toMatch(/"skus"\."id" in \(\$1, \$2, \$3, \$4\)/); // de-duplicated ids
  });

  it("needs no sign-in, but rejects a malformed body", async () => {
    for (const body of [{}, { skuIds: [] }, { skuIds: [0] }, { skuIds: ["7"] }, { skuIds: Array.from({ length: 51 }, (_, i) => i + 1) }]) {
      expect((await check(dbWith(), body)).status, JSON.stringify(body)).toBe(400);
    }
  });
});

describe("GET /admin/orders/stats paidRevenue", () => {
  it("adds money actually received next to the existing totals", async () => {
    const ADMIN_ID = "fb354b9c-6c05-4379-8f2c-4c59962d4761";
    const queries: string[] = [];
    const db = {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: ADMIN_ID, email: "a@b.com", name: "A", isAdmin: true }] }) }) }),
      execute: async (q: SQL) => {
        queries.push(dialect.sqlToQuery(q).sql);
        return [
          { status: "pending", cnt: 2, revenue: "9000.00", paid_revenue: "0" },
          { status: "paid", cnt: 2, revenue: "16497.00", paid_revenue: "6129.70" }, // prepaid 4299 + COD advance 1830.70
          { status: "cancelled", cnt: 1, revenue: "500.00", paid_revenue: "0" },
        ];
      },
    } as unknown as DbClient;
    const res = await createApp({ db }).request("/admin/orders/stats?range=today", {
      headers: { Authorization: `Bearer ${await signAdminAccess({ sub: ADMIN_ID })}` },
    });
    const json = await res.json();
    expect(json).toMatchObject({ totalOrders: 5, totalRevenue: 25497, paidRevenue: 6129.7 });
    // Paid = paid/confirmed/shipped/delivered only; COD counts its advance until the balance is collected.
    expect(queries[0]).toMatch(/status in \('paid','confirmed','shipped','delivered'\)/);
    expect(queries[0]).toMatch(/payment_method = 'cod' and payment_status <> 'paid' then advance_paid else total/);
  });
});

describe("expected 503s are logged at warn", () => {
  it("push not configured → 503 logged as warn, not error", async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    const ADMIN_ID = "fb354b9c-6c05-4379-8f2c-4c59962d4761";
    const db = {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: ADMIN_ID, email: "a@b.com", name: "A", isAdmin: true }] }) }) }),
    } as unknown as DbClient;
    const lines: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((l: unknown) => void lines.push(String(l)));
    const res = await createApp({ db }).request("/admin/push/test", {
      method: "POST",
      headers: { Authorization: `Bearer ${await signAdminAccess({ sub: ADMIN_ID })}` },
    });
    spy.mockRestore();
    expect(res.status).toBe(503);
    const line = JSON.parse(lines.find((l) => l.includes('"msg":"request"'))!);
    expect(line).toMatchObject({ level: "warn", status: 503, path: "/admin/push/test" });
  });
});
