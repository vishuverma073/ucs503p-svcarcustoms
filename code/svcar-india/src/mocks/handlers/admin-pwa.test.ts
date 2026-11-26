import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { server } from "../node";
import { API_BASE } from "@/lib/api-config";
import { __resetMockAdminOrders } from "../data/admin-orders";
import { __resetMockPushSubs, MOCK_VAPID_PUBLIC_KEY } from "./admin-push";

const AUTH = { Authorization: "Bearer mock-token", "Content-Type": "application/json" };
const SUB = {
  endpoint: "https://fcm.googleapis.com/fcm/send/mock-device",
  keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u", auth: "tBHItJI5svbpez7KI4CCXg" },
};

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterAll(() => server.close());
beforeEach(() => {
  __resetMockAdminOrders();
  __resetMockPushSubs();
});

const post = (path: string, body?: unknown) =>
  fetch(`${API_BASE}${path}`, { method: "POST", headers: AUTH, body: body === undefined ? undefined : JSON.stringify(body) });

describe("mock /admin/push/*", () => {
  it("is gated like the API", async () => {
    expect((await fetch(`${API_BASE}/admin/push/public-key`)).status).toBe(401);
    expect((await fetch(`${API_BASE}/admin/push/test`, { method: "POST" })).status).toBe(401);
  });

  it("public key → subscribe (upsert) → test → unsubscribe", async () => {
    const key = await (await fetch(`${API_BASE}/admin/push/public-key`, { headers: AUTH })).json();
    expect(key).toEqual({ enabled: true, publicKey: MOCK_VAPID_PUBLIC_KEY });

    const sub = await (await post("/admin/push/subscribe", { subscription: SUB, notifyLeads: false })).json();
    expect(sub).toMatchObject({ ok: true, enabled: true, notifyOrders: true, notifyLeads: false });
    const again = await (await post("/admin/push/subscribe", { subscription: SUB, notifyOrders: false })).json();
    expect(again).toMatchObject({ id: sub.id, notifyOrders: false, notifyLeads: false });

    const test = await (await post("/admin/push/test")).json();
    expect(test).toMatchObject({ enabled: true, attempted: 1, sent: 1 });
    expect(test.results[0]).toMatchObject({ endpointHost: "fcm.googleapis.com", ok: true, statusCode: 201 });

    expect(await (await post("/admin/push/unsubscribe", { endpoint: SUB.endpoint })).json()).toEqual({ ok: true, removed: 1 });
    expect((await (await post("/admin/push/test")).json()).attempted).toBe(0);
  });

  it("rejects a malformed subscription", async () => {
    expect((await post("/admin/push/subscribe", { subscription: { endpoint: "nope" } })).status).toBe(400);
  });
});

describe("mock /admin/orders/*", () => {
  it("lists seeded orders newest first with stats", async () => {
    const list = await (await fetch(`${API_BASE}/admin/orders?range=12m`, { headers: AUTH })).json();
    expect(list.items.length).toBeGreaterThanOrEqual(4);
    const times = list.items.map((o: { createdAt: string }) => o.createdAt);
    expect([...times].sort().reverse()).toEqual(times);
    const stats = await (await fetch(`${API_BASE}/admin/orders/stats?range=12m`, { headers: AUTH })).json();
    expect(stats.totalOrders).toBe(list.items.length);
  });

  it("walks a paid order Confirm → Ship (with note) → Delivered", async () => {
    const id = "00000000-0000-4000-8000-000000000003";
    const detail = async () => (await fetch(`${API_BASE}/admin/orders/${id}`, { headers: AUTH })).json();
    expect((await detail()).status).toBe("paid");

    expect((await post(`/admin/orders/${id}/events`, { eventType: "confirmed" })).status).toBe(201);
    expect((await detail()).status).toBe("confirmed");
    await post(`/admin/orders/${id}/events`, { eventType: "shipped", note: "Courier: Delhivery · Tracking: 123" });
    await post(`/admin/orders/${id}/events`, { eventType: "delivered" });
    expect((await detail()).status).toBe("delivered");

    const { events } = await (await fetch(`${API_BASE}/admin/orders/${id}/events`, { headers: AUTH })).json();
    expect(events.map((e: { eventType: string }) => e.eventType)).toEqual(
      expect.arrayContaining(["placed", "paid", "confirmed", "shipped", "delivered"]),
    );
    expect(events.find((e: { eventType: string }) => e.eventType === "shipped").note).toBe("Courier: Delhivery · Tracking: 123");
  });

  it("refuses an unknown event type and deleting a paid order", async () => {
    const id = "00000000-0000-4000-8000-000000000003";
    expect((await post(`/admin/orders/${id}/events`, { eventType: "teleported" })).status).toBe(400);
    expect((await fetch(`${API_BASE}/admin/orders/${id}`, { method: "DELETE", headers: AUTH })).status).toBe(409);
  });

  it("mock-only simulate endpoint adds a fresh paid order at the top", async () => {
    const created = await (await post("/admin/__mock/orders", {})).json();
    const list = await (await fetch(`${API_BASE}/admin/orders?range=today`, { headers: AUTH })).json();
    expect(list.items[0].id).toBe(created.id);
    expect(list.items[0].status).toBe("paid");
  });
});

describe("mock PATCH /admin/products/:id keeps SKU rows (like the API)", () => {
  it("price-only edit keeps every SKU id; a removed SKU goes, a new one gets a fresh id", async () => {
    const get = async () => (await fetch(`${API_BASE}/admin/products/1`, { headers: AUTH })).json();
    const before = await get();
    const ids = before.skus.map((s: { id: number }) => s.id);
    const patch = async (skus: unknown[]) =>
      (await fetch(`${API_BASE}/admin/products/1`, { method: "PATCH", headers: AUTH, body: JSON.stringify({ skus }) })).json();

    const repriced = before.skus.map((s: { price: number }, i: number) => (i === 0 ? { ...s, price: s.price + 100 } : s));
    const after = await patch(repriced);
    expect(after.skus.map((s: { id: number }) => s.id)).toEqual(ids);
    expect(after.skus[0].price).toBe(before.skus[0].price + 100);

    const [, ...rest] = after.skus;
    const changed = await patch([...rest, { skuCode: "MOCK-NEW", price: 10, salePrice: null, dimensionValues: {} }]);
    expect(changed.skus.slice(0, rest.length).map((s: { id: number }) => s.id)).toEqual(ids.slice(1));
    expect(ids).not.toContain(changed.skus.at(-1).id);
  });
});

describe("mock /admin/orders/stats paidRevenue", () => {
  it("counts money received only: no unpaid orders, COD = advance until collected", async () => {
    const stats = await (await fetch(`${API_BASE}/admin/orders/stats?range=today`, { headers: AUTH })).json();
    const { items } = await (await fetch(`${API_BASE}/admin/orders?range=today`, { headers: AUTH })).json();
    type Row = { status: string; total: number; paymentMethod: string; paymentStatus: string; advancePaid: number };
    const expected = (items as Row[])
      .filter((o) => ["paid", "confirmed", "shipped", "delivered"].includes(o.status))
      .reduce((s, o) => s + (o.paymentMethod === "cod" && o.paymentStatus !== "paid" ? o.advancePaid : o.total), 0);
    expect(stats.paidRevenue).toBe(expected);
    expect((items as Row[]).some((o) => o.status === "pending")).toBe(true);
    expect(stats.paidRevenue).toBeLessThan(stats.totalRevenue);
  });
});
