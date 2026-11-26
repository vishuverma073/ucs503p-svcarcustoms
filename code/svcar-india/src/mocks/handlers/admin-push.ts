import { http, HttpResponse } from "msw";
import { API_BASE } from "@/lib/api-config";
import { MOCK_TOKEN } from "../data/settings";

const A = API_BASE;

/**
 * A real-format VAPID public key whose private half was thrown away: the mock
 * only needs something PushManager would accept. (In mock mode the admin service
 * worker isn't registered, so nothing ever subscribes with it.)
 */
export const MOCK_VAPID_PUBLIC_KEY =
  "BNF_a_qxO9vGEdoWmpROie6-vZ1Xd_ENh9GMHYYVnkWZs-oZ2Snpp9IzDoWetmKxSki3nCeVlokiCpNoHVtMTHI";

interface MockSub {
  id: number;
  endpoint: string;
  notifyOrders: boolean;
  notifyLeads: boolean;
}

const subs = new Map<string, MockSub>();
let seq = 0;

function gate(request: Request): Response | null {
  if (request.headers.get("Authorization") !== `Bearer ${MOCK_TOKEN}`) {
    return HttpResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

/** Mirrors /admin/push/* of the API (lib/admin-push.ts + routes/admin/push.ts). */
export const adminPushHandlers = [
  http.get(`${A}/admin/push/public-key`, ({ request }) => {
    const denied = gate(request);
    if (denied) return denied;
    return HttpResponse.json({ enabled: true, publicKey: MOCK_VAPID_PUBLIC_KEY });
  }),

  http.post(`${A}/admin/push/subscribe`, async ({ request }) => {
    const denied = gate(request);
    if (denied) return denied;
    const body = (await request.json().catch(() => null)) as {
      subscription?: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
      notifyOrders?: unknown;
      notifyLeads?: unknown;
    } | null;
    const endpoint = body?.subscription?.endpoint;
    const keys = body?.subscription?.keys;
    if (
      typeof endpoint !== "string" ||
      !endpoint.startsWith("https://") ||
      typeof keys?.p256dh !== "string" ||
      typeof keys?.auth !== "string"
    ) {
      return HttpResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const existing = subs.get(endpoint);
    const row: MockSub = {
      id: existing?.id ?? ++seq,
      endpoint,
      notifyOrders: typeof body?.notifyOrders === "boolean" ? body.notifyOrders : (existing?.notifyOrders ?? true),
      notifyLeads: typeof body?.notifyLeads === "boolean" ? body.notifyLeads : (existing?.notifyLeads ?? true),
    };
    subs.set(endpoint, row);
    return HttpResponse.json({ ok: true, enabled: true, id: row.id, notifyOrders: row.notifyOrders, notifyLeads: row.notifyLeads });
  }),

  http.post(`${A}/admin/push/unsubscribe`, async ({ request }) => {
    const denied = gate(request);
    if (denied) return denied;
    const body = (await request.json().catch(() => null)) as { endpoint?: unknown } | null;
    if (typeof body?.endpoint !== "string") return HttpResponse.json({ error: "Invalid request" }, { status: 400 });
    const removed = subs.delete(body.endpoint) ? 1 : 0;
    return HttpResponse.json({ ok: true, removed });
  }),

  http.post(`${A}/admin/push/test`, ({ request }) => {
    const denied = gate(request);
    if (denied) return denied;
    const results = [...subs.values()].map((s) => ({
      id: s.id,
      endpointHost: new URL(s.endpoint).host,
      ok: true,
      statusCode: 201,
      removed: false,
    }));
    return HttpResponse.json({
      enabled: true,
      attempted: results.length,
      sent: results.length,
      removed: 0,
      failed: 0,
      results,
    });
  }),
];

/** Test helper. */
export function __resetMockPushSubs() {
  subs.clear();
}
