import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

process.env.NODE_ENV = "test";
process.env.JWT_ADMIN_SECRET = "test-admin-secret-at-least-32-chars-long!!";
// Skip the admin-middleware cache so each test's fake admin row is read.
process.env.LOG_LEVEL = "debug";
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

const mocks = vi.hoisted(() => ({ sendNotification: vi.fn() }));
vi.mock("web-push", async (importOriginal) => {
  const actual = (await importOriginal()) as { default: Record<string, unknown> };
  return { default: { ...actual.default, sendNotification: mocks.sendNotification } };
});

import webpush from "web-push";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { createApp } from "../src/app.js";
import { signAdminAccess } from "../src/lib/jwt.js";
import { flushAdminPushes } from "../src/lib/admin-push.js";
import { isAllowedPushEndpoint } from "../src/routes/admin/push.js";
import { adminPushSubscriptions, phoneLeads, users } from "../src/db/schema.js";
import type { DbClient } from "../src/db/client.js";

const ADMIN_ID = "fb354b9c-6c05-4379-8f2c-4c59962d4761";
const VAPID = webpush.generateVAPIDKeys();
const dialect = new PgDialect();

const SUB = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc:APA91b-device-1",
  expirationTime: null,
  keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" },
};

interface Store {
  rows: Record<string, unknown>[];
  inserts: { table: unknown; values: Record<string, unknown>; set?: Record<string, unknown> }[];
  deletes: string[];
  popupRecent: unknown[];
}

/** Fake db covering the admin middleware lookup, the push table and phone_leads. */
function makeDb(store: Store, opts: { admin?: boolean } = {}): DbClient {
  const adminRow = opts.admin === false ? null : { id: ADMIN_ID, email: "a@b.com", name: "A", isAdmin: true };
  return {
    select: () => ({
      from: (table: unknown) => {
        if (table === users) return { where: () => ({ limit: async () => (adminRow ? [adminRow] : []) }) };
        if (table === phoneLeads) return { where: () => ({ limit: async () => store.popupRecent }) };
        if (table === adminPushSubscriptions) {
          return {
            // /admin/push/test: the caller's own devices.
            where: async (cond: SQL) => {
              const { params } = dialect.sqlToQuery(cond);
              return store.rows.filter((r) => r.adminUserId === params[0]);
            },
            // lib/admin-push sendToAdmins: opted-in devices of admins.
            innerJoin: () => ({ where: async () => store.rows.filter((r) => r.notifyLeads) }),
          };
        }
        throw new Error("unexpected table");
      },
    }),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        const rec: Store["inserts"][number] = { table, values };
        store.inserts.push(rec);
        const done = Promise.resolve();
        return Object.assign(done, {
          returning: async () => [{ id: 4242 }],
          onConflictDoUpdate: ({ set }: { set: Record<string, unknown> }) => {
            rec.set = set;
            const existing = store.rows.find((r) => r.endpoint === values.endpoint);
            const row = existing ? Object.assign(existing, set) : { id: store.rows.length + 1, ...values };
            if (!existing) store.rows.push(row);
            return { returning: async () => [{ id: row.id, notifyOrders: row.notifyOrders, notifyLeads: row.notifyLeads }] };
          },
        });
      },
    }),
    update: () => ({ set: () => ({ where: async () => {} }) }),
    delete: () => ({
      where: (cond: SQL) => {
        const q = dialect.sqlToQuery(cond);
        store.deletes.push(q.sql);
        const [endpoint, adminUserId] = q.params;
        const gone = store.rows.filter((r) => r.endpoint === endpoint && r.adminUserId === adminUserId);
        store.rows = store.rows.filter((r) => !gone.includes(r));
        return Object.assign(Promise.resolve(), { returning: async () => gone.map((r) => ({ id: r.id })) });
      },
    }),
  } as unknown as DbClient;
}

const newStore = (): Store => ({ rows: [], inserts: [], deletes: [], popupRecent: [] });

async function call(db: DbClient, method: string, path: string, body?: unknown, auth = true) {
  const headers: Record<string, string> = { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0 (Linux; Android 14) Chrome/130" };
  if (auth) headers.Authorization = `Bearer ${await signAdminAccess({ sub: ADMIN_ID })}`;
  return createApp({ db }).request(`/admin/push${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function enablePush() {
  process.env.VAPID_PUBLIC_KEY = VAPID.publicKey;
  process.env.VAPID_PRIVATE_KEY = VAPID.privateKey;
  process.env.VAPID_SUBJECT = "mailto:owner@example.com";
}

beforeEach(() => {
  mocks.sendNotification.mockReset();
  mocks.sendNotification.mockResolvedValue({ statusCode: 201 });
  enablePush();
});
afterEach(async () => {
  await flushAdminPushes();
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  delete process.env.VAPID_SUBJECT;
});

describe("/admin/push guard", () => {
  it("401 without an admin token, 403 for a non-admin", async () => {
    for (const [method, path] of [
      ["GET", "/public-key"],
      ["POST", "/subscribe"],
      ["POST", "/unsubscribe"],
      ["POST", "/test"],
    ] as const) {
      const res = await call(makeDb(newStore()), method, path, method === "POST" ? {} : undefined, false);
      expect(res.status, path).toBe(401);
    }
    const res = await call(makeDb(newStore(), { admin: false }), "GET", "/public-key");
    expect(res.status).toBe(403);
  });
});

describe("GET /admin/push/public-key", () => {
  it("returns the VAPID public key when configured", async () => {
    const res = await call(makeDb(newStore()), "GET", "/public-key");
    expect(await res.json()).toEqual({ enabled: true, publicKey: VAPID.publicKey });
  });

  it("says enabled:false (200) when the keys are missing", async () => {
    delete process.env.VAPID_PRIVATE_KEY;
    const res = await call(makeDb(newStore()), "GET", "/public-key");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ enabled: false });
  });
});

describe("POST /admin/push/subscribe", () => {
  it("stores this device for the signed-in admin with its opt-ins", async () => {
    const store = newStore();
    const res = await call(makeDb(store), "POST", "/subscribe", { subscription: SUB, notifyOrders: true, notifyLeads: false });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, enabled: true, id: 1, notifyOrders: true, notifyLeads: false });
    expect(store.inserts[0]!.values).toEqual({
      adminUserId: ADMIN_ID,
      endpoint: SUB.endpoint,
      p256dh: SUB.keys.p256dh,
      auth: SUB.keys.auth,
      userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/130",
      notifyOrders: true,
      notifyLeads: false,
    });
  });

  it("same endpoint again upserts (one row per device) and only changes the toggles sent", async () => {
    const store = newStore();
    const db = makeDb(store);
    await call(db, "POST", "/subscribe", { subscription: SUB });
    const res = await call(db, "POST", "/subscribe", { subscription: SUB, notifyLeads: false });
    expect(await res.json()).toMatchObject({ notifyOrders: true, notifyLeads: false });
    expect(store.rows).toHaveLength(1);
    expect(store.inserts[1]!.set).not.toHaveProperty("notifyOrders");
    expect(store.inserts[1]!.set).toMatchObject({ notifyLeads: false, adminUserId: ADMIN_ID, lastError: null });
  });

  it("400 for a malformed body or a push service we don't know", async () => {
    const db = makeDb(newStore());
    for (const body of [
      {},
      { subscription: { ...SUB, keys: {} } },
      { subscription: { ...SUB, endpoint: "https://evil.example/collect" } },
      { subscription: { ...SUB, endpoint: "http://fcm.googleapis.com/fcm/send/x" } },
      { subscription: SUB, notifyOrders: "yes" },
    ]) {
      const res = await call(db, "POST", "/subscribe", body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });

  it("503 push_disabled when VAPID is not configured", async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    const res = await call(makeDb(newStore()), "POST", "/subscribe", { subscription: SUB });
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ enabled: false, error: "push_disabled" });
  });
});

describe("POST /admin/push/unsubscribe", () => {
  it("removes only the caller's row for that endpoint", async () => {
    const store = newStore();
    const db = makeDb(store);
    await call(db, "POST", "/subscribe", { subscription: SUB });
    const res = await call(db, "POST", "/unsubscribe", { endpoint: SUB.endpoint });
    expect(await res.json()).toEqual({ ok: true, removed: 1 });
    expect(store.rows).toHaveLength(0);
    expect(store.deletes[0]).toMatch(/"endpoint" = \$1 and "admin_push_subscriptions"\."admin_user_id" = \$2/);
  });

  it("400 without an endpoint", async () => {
    const res = await call(makeDb(newStore()), "POST", "/unsubscribe", {});
    expect(res.status).toBe(400);
  });
});

describe("POST /admin/push/test", () => {
  it("pushes to the caller's devices and reports each one", async () => {
    const store = newStore();
    const db = makeDb(store);
    await call(db, "POST", "/subscribe", { subscription: SUB });
    await call(db, "POST", "/subscribe", { subscription: { ...SUB, endpoint: "https://web.push.apple.com/QGx-iphone" } });
    mocks.sendNotification.mockImplementation(async (s: { endpoint: string }) => {
      if (s.endpoint.includes("apple")) throw Object.assign(new Error("Gone"), { statusCode: 410 });
      return { statusCode: 201 };
    });
    const res = await call(db, "POST", "/test");
    const json = await res.json();
    expect(json).toMatchObject({ enabled: true, attempted: 2, sent: 1, removed: 1, failed: 0 });
    expect(json.results).toEqual([
      { id: 1, endpointHost: "fcm.googleapis.com", ok: true, statusCode: 201, removed: false },
      { id: 2, endpointHost: "web.push.apple.com", ok: false, statusCode: 410, removed: true, error: "gone" },
    ]);
    const body = JSON.parse(mocks.sendNotification.mock.calls[0]![1]);
    expect(body).toMatchObject({ kind: "test", url: "/admin/settings", title: "SV Admin notifications are on" });
    expect(mocks.sendNotification.mock.calls[0]![2]).toMatchObject({ TTL: 300 });
  });

  it("no devices yet → attempted 0", async () => {
    const res = await call(makeDb(newStore()), "POST", "/test");
    expect(await res.json()).toMatchObject({ enabled: true, attempted: 0, results: [] });
  });

  it("503 when push is disabled", async () => {
    delete process.env.VAPID_SUBJECT;
    const res = await call(makeDb(newStore()), "POST", "/test");
    expect(res.status).toBe(503);
  });
});

describe("new phone lead → admin push", () => {
  const post = (db: DbClient, body: unknown) =>
    createApp({ db }).request("/phone-leads", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": `10.9.${Math.floor(Math.random() * 250)}.1` },
      body: JSON.stringify(body),
    });

  it("a new number is stored and pushed to lead opt-ins", async () => {
    const store = newStore();
    store.rows.push({ id: 7, adminUserId: ADMIN_ID, ...SUB, p256dh: SUB.keys.p256dh, auth: SUB.keys.auth, notifyLeads: true });
    const res = await post(makeDb(store), { phone: "+91 98765 43210", pagePath: "/product/drl", consent: true });
    expect(res.status).toBe(200);
    await flushAdminPushes();
    expect(mocks.sendNotification).toHaveBeenCalledTimes(1);
    expect(JSON.parse(mocks.sendNotification.mock.calls[0]![1])).toMatchObject({
      title: "New lead: +91 98765 43210",
      body: "From /product/drl",
      url: "/admin/phone-leads",
      tag: "lead-4242", // the phone_leads row id — never the number
    });
  });

  it("the 24h repeat of a number (no new row) sends nothing", async () => {
    const store = newStore();
    store.popupRecent = [{ id: 41 }];
    store.rows.push({ id: 7, adminUserId: ADMIN_ID, endpoint: SUB.endpoint, p256dh: "p", auth: "a", notifyLeads: true });
    const res = await post(makeDb(store), { phone: "9876543210", pagePath: "/", consent: true });
    expect(res.status).toBe(200);
    await flushAdminPushes();
    expect(store.inserts).toHaveLength(0);
    expect(mocks.sendNotification).not.toHaveBeenCalled();
  });
});

describe("isAllowedPushEndpoint", () => {
  it("accepts the browser push services, rejects everything else", () => {
    for (const ok of [
      "https://fcm.googleapis.com/fcm/send/x",
      "https://updates.push.services.mozilla.com/wpush/v2/x",
      "https://web.push.apple.com/QGx",
      "https://wns2-par02p.notify.windows.com/w/?token=x",
    ]) {
      expect(isAllowedPushEndpoint(ok), ok).toBe(true);
    }
    for (const bad of [
      "http://fcm.googleapis.com/fcm/send/x",
      "https://fcm.googleapis.com.evil.com/x",
      "https://evilfcm.googleapis.com.example/x",
      "https://user:pw@fcm.googleapis.com/x",
      "https://localhost:8080/x",
      "not a url",
    ]) {
      expect(isAllowedPushEndpoint(bad), bad).toBe(false);
    }
  });
});
