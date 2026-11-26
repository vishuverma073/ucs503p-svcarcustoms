import { http, HttpResponse } from "msw";
import { API_BASE } from "@/lib/api-config";
import { MOCK_TOKEN } from "../data/settings";
import {
  addSimulatedOrder,
  deleteMockAdminOrder,
  findMockAdminOrder,
  listMockAdminOrders,
  nextMockEventId,
  patchMockAdminOrder,
  type MockAdminOrder,
} from "../data/admin-orders";

const A = API_BASE;

function gate(request: Request): Response | null {
  if (request.headers.get("Authorization") !== `Bearer ${MOCK_TOKEN}`) {
    return HttpResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

/** Same presets as the API (routes/admin/orders.ts). */
const RANGE_DAYS: Record<string, number | null> = { today: 1, "7d": 7, "30d": 30, "90d": 90, "12m": 365, all: null };
function rangeStart(range: string | null): number {
  const d = RANGE_DAYS[range ?? "12m"] ?? 365;
  return d == null ? 0 : Date.now() - d * 86_400_000;
}

const STATUS_EVENTS = new Set(["paid", "confirmed", "shipped", "delivered", "cancelled", "refunded"]);
const EVENT_TYPES = new Set(["placed", "out_for_delivery", "note", ...STATUS_EVENTS]);

function listItem(o: MockAdminOrder) {
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    total: o.total,
    paymentMethod: o.paymentMethod,
    paymentStatus: o.paymentStatus,
    advanceAmount: o.advanceAmount,
    advancePaid: o.advancePaid,
    remainingAmount: o.remainingAmount,
    status: o.status,
    itemCount: o.items.reduce((s, it) => s + it.qty, 0),
    createdAt: o.createdAt,
  };
}

/** Mirrors /admin/orders* of the API (list, stats, detail, timeline, COD, delete). */
export const adminOrderHandlers = [
  http.get(`${A}/admin/orders/stats`, ({ request }) => {
    const denied = gate(request);
    if (denied) return denied;
    const range = new URL(request.url).searchParams.get("range") ?? "12m";
    const since = rangeStart(range);
    const statusCounts: Record<string, number> = {};
    let totalOrders = 0;
    let totalRevenue = 0;
    let paidRevenue = 0;
    let pendingOrders = 0;
    let completedOrders = 0;
    for (const o of listMockAdminOrders()) {
      if (Date.parse(o.createdAt) < since) continue;
      statusCounts[o.status] = (statusCounts[o.status] ?? 0) + 1;
      totalOrders++;
      if (o.status !== "cancelled" && o.status !== "refunded") totalRevenue += o.total;
      // Same rule as the API: received money only; COD counts its advance until collected.
      if (["paid", "confirmed", "shipped", "delivered"].includes(o.status)) {
        paidRevenue += o.paymentMethod === "cod" && o.paymentStatus !== "paid" ? o.advancePaid : o.total;
      }
      if (["pending", "paid", "confirmed", "shipped"].includes(o.status)) pendingOrders++;
      if (o.status === "delivered") completedOrders++;
    }
    return HttpResponse.json({ range, totalOrders, totalRevenue, paidRevenue, pendingOrders, completedOrders, statusCounts });
  }),

  http.get(`${A}/admin/orders`, ({ request }) => {
    const denied = gate(request);
    if (denied) return denied;
    const sp = new URL(request.url).searchParams;
    const status = sp.get("status");
    const q = (sp.get("q") ?? "").trim().toLowerCase();
    const range = sp.get("range");
    const since = range && range !== "all" ? rangeStart(range) : 0;
    const items = listMockAdminOrders()
      .filter((o) => !status || o.status === status)
      .filter((o) => Date.parse(o.createdAt) >= since)
      .filter(
        (o) =>
          !q ||
          o.orderNumber.toLowerCase().includes(q) ||
          o.customerPhone.replace(/\D/g, "").includes(q.replace(/\D/g, "") || "\u0000") ||
          o.customerName.toLowerCase().includes(q),
      )
      .map(listItem);
    return HttpResponse.json({ items, nextCursor: null });
  }),

  http.get(`${A}/admin/orders/:id`, ({ request, params }) => {
    const denied = gate(request);
    if (denied) return denied;
    const o = findMockAdminOrder(String(params.id));
    if (!o) return HttpResponse.json({ error: "Not Found" }, { status: 404 });
    const { events: _events, ...detail } = o;
    void _events;
    return HttpResponse.json(detail);
  }),

  http.get(`${A}/admin/orders/:id/events`, ({ request, params }) => {
    const denied = gate(request);
    if (denied) return denied;
    const o = findMockAdminOrder(String(params.id));
    if (!o) return HttpResponse.json({ events: [] });
    const events = [...o.events].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    return HttpResponse.json({ events });
  }),

  http.post(`${A}/admin/orders/:id/events`, async ({ request, params }) => {
    const denied = gate(request);
    if (denied) return denied;
    const body = (await request.json().catch(() => null)) as
      | { eventType?: string; note?: string; occurredAt?: string }
      | null;
    if (!body?.eventType || !EVENT_TYPES.has(body.eventType) || (body.note && body.note.length > 500)) {
      return HttpResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const o = findMockAdminOrder(String(params.id));
    if (!o) return HttpResponse.json({ error: "Not Found" }, { status: 404 });
    const at = body.occurredAt && !Number.isNaN(Date.parse(body.occurredAt)) ? body.occurredAt : new Date().toISOString();
    const event = { id: nextMockEventId(), eventType: body.eventType, note: body.note ?? null, createdAt: at };
    patchMockAdminOrder(o.id, {
      events: [...o.events, event],
      ...(STATUS_EVENTS.has(body.eventType) ? { status: body.eventType } : {}),
    });
    return HttpResponse.json(event, { status: 201 });
  }),

  http.post(`${A}/admin/orders/:id/collect-cod`, ({ request, params }) => {
    const denied = gate(request);
    if (denied) return denied;
    const o = findMockAdminOrder(String(params.id));
    if (!o) return HttpResponse.json({ error: "Not Found" }, { status: 404 });
    if (o.paymentMethod !== "cod") return HttpResponse.json({ error: "Order is not COD" }, { status: 409 });
    if (o.paymentStatus !== "partially_paid") {
      return HttpResponse.json({ error: "COD balance is not awaiting collection" }, { status: 409 });
    }
    patchMockAdminOrder(o.id, { paymentStatus: "paid", remainingAmount: 0 });
    return HttpResponse.json({ ok: true });
  }),

  http.delete(`${A}/admin/orders/:id`, ({ request, params }) => {
    const denied = gate(request);
    if (denied) return denied;
    const o = findMockAdminOrder(String(params.id));
    if (!o) return HttpResponse.json({ error: "Not Found" }, { status: 404 });
    if (o.paymentStatus === "paid" || o.paymentStatus === "partially_paid") {
      return HttpResponse.json(
        { error: "order_paid", message: `${o.orderNumber} has taken payment — cancel or refund it instead.` },
        { status: 409 },
      );
    }
    deleteMockAdminOrder(o.id);
    return new HttpResponse(null, { status: 204 });
  }),

  // Mock-only (no such API route): drop in a new paid order "just now", so the
  // live dashboard / orders list and the new-row highlight can be tried.
  http.post(`${A}/admin/__mock/orders`, async ({ request }) => {
    const denied = gate(request);
    if (denied) return denied;
    const body = (await request.json().catch(() => null)) as { method?: "prepaid" | "cod" } | null;
    const order = addSimulatedOrder({ method: body?.method === "cod" ? "cod" : "prepaid" });
    return HttpResponse.json(listItem(order), { status: 201 });
  }),
];
