import { http, HttpResponse } from "msw";
import { API_BASE } from "@/lib/api-config";
import type { AdminPhoneLeadList } from "@svcar/contracts";
import { MOCK_TOKEN } from "../data/settings";
import { allOrders } from "../data/orders";
import {
  addMockPhoneLead,
  listMockPhoneLeads,
  seededLeadOrders,
  type MockLeadOrder,
} from "../data/phone-leads";

const A = API_BASE;
const DAY = 24 * 60 * 60 * 1000;

/** Same rule as the API: "+91 98765 43210" / "098765…" → 10 digits, else null. */
function mobile10(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const digits = raw.replace(/\D/g, "");
  const ten = digits.length > 10 && /^(91|0)/.test(digits) ? digits.slice(-10) : digits;
  return /^[6-9]\d{9}$/.test(ten) ? ten : null;
}

const key = (v: string) => v.replace(/\D/g, "").slice(-10);

// Storefront order statuses → the API's order_status values the admin shows.
const API_STATUS: Record<string, string> = {
  created: "pending",
  failed: "pending",
  paid: "paid",
  shipped: "shipped",
  delivered: "delivered",
  cancelled: "cancelled",
};

function leadOrders(): MockLeadOrder[] {
  const placed = allOrders().map((o) => ({
    id: String(o.id),
    orderNumber: o.orderNumber,
    name: o.address.fullName,
    phone: o.address.phone,
    status: API_STATUS[o.status] ?? o.status,
    paymentStatus: o.paymentStatus,
    total: o.totals.total,
    createdAt: o.createdAt,
  }));
  return [...seededLeadOrders, ...placed];
}

/** Mirrors GET /admin/phone-leads: one row per 10-digit number, newest activity first. */
function buildList(limit = 500): AdminPhoneLeadList {
  type Row = AdminPhoneLeadList["items"][number];
  const rows = new Map<string, Row>();
  const row = (phone: string): Row => {
    let r = rows.get(phone);
    if (!r) {
      r = { phone, name: "", sources: [], lastActivityAt: new Date(0).toISOString(), popup: null, order: null };
      rows.set(phone, r);
    }
    return r;
  };

  for (const l of listMockPhoneLeads()) {
    const r = row(key(l.phone));
    const newer = !r.popup || l.createdAt > r.popup.lastAt;
    r.popup = {
      count: (r.popup?.count ?? 0) + 1,
      lastAt: newer ? l.createdAt : r.popup!.lastAt,
      lastPagePath: newer ? (l.pagePath ?? "") : r.popup!.lastPagePath,
    };
    if (!r.sources.includes("popup")) r.sources.push("popup");
    if (l.createdAt > r.lastActivityAt) r.lastActivityAt = l.createdAt;
  }

  for (const o of leadOrders()) {
    const phone = key(o.phone);
    if (!phone) continue;
    const r = row(phone);
    const newer = !r.order || o.createdAt >= r.order.latestAt;
    r.order = {
      count: (r.order?.count ?? 0) + 1,
      latestOrderId: newer ? o.id : r.order!.latestOrderId,
      latestOrderNumber: newer ? o.orderNumber : r.order!.latestOrderNumber,
      latestStatus: newer ? o.status : r.order!.latestStatus,
      latestPaymentStatus: newer ? o.paymentStatus : r.order!.latestPaymentStatus,
      latestTotal: newer ? o.total : r.order!.latestTotal,
      latestAt: newer ? o.createdAt : r.order!.latestAt,
    };
    if (newer) r.name = o.name || r.name;
    if (!r.sources.includes("order")) r.sources.push("order");
    if (o.createdAt > r.lastActivityAt) r.lastActivityAt = o.createdAt;
  }

  const all = [...rows.values()]
    .map((r) => ({ ...r, sources: (["popup", "order"] as const).filter((s) => r.sources.includes(s)) }))
    .sort((a, b) => (a.lastActivityAt < b.lastActivityAt ? 1 : -1));
  return {
    items: all.slice(0, limit),
    totals: {
      phones: all.length,
      popupPhones: all.filter((r) => r.popup).length,
      orderPhones: all.filter((r) => r.order).length,
      bothPhones: all.filter((r) => r.popup && r.order).length,
      popupSubmissions: all.reduce((s, r) => s + (r.popup?.count ?? 0), 0),
      orders: all.reduce((s, r) => s + (r.order?.count ?? 0), 0),
    },
    limit,
    truncated: all.length > limit,
  };
}

export const phoneLeadHandlers = [
  // ── Public: the storefront popup (no login) ──
  http.post(`${A}/phone-leads`, async ({ request }) => {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const phone = mobile10(body?.phone);
    if (!phone) return HttpResponse.json({ error: "invalid_phone" }, { status: 400 });
    if (body?.consent !== true) return HttpResponse.json({ error: "consent_required" }, { status: 400 });

    const since = new Date(Date.now() - DAY).toISOString();
    const recent = listMockPhoneLeads().some((l) => l.phone === phone && l.createdAt >= since);
    if (!recent) {
      const pagePath = typeof body?.pagePath === "string" && body.pagePath.startsWith("/") ? body.pagePath : null;
      addMockPhoneLead({ phone, pagePath, createdAt: new Date().toISOString() });
    }
    return HttpResponse.json({ ok: true });
  }),

  // ── Admin: popup numbers + order phones, merged per number ──
  http.get(`${A}/admin/phone-leads`, ({ request }) => {
    if (request.headers.get("Authorization") !== `Bearer ${MOCK_TOKEN}`) {
      return HttpResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    return HttpResponse.json(buildList());
  }),
];
