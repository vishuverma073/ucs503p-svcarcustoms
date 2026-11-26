import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

process.env.NODE_ENV = "test";
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

// web-push is mocked for sending only; key validation (getVapidHeaders) and key
// generation stay real so the config checks exercise the actual library.
const mocks = vi.hoisted(() => ({ sendNotification: vi.fn() }));
vi.mock("web-push", async (importOriginal) => {
  const actual = (await importOriginal()) as { default: Record<string, unknown> };
  return { default: { ...actual.default, sendNotification: mocks.sendNotification } };
});

import webpush from "web-push";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import {
  buildLeadPushPayload,
  buildOrderPushPayload,
  flushAdminPushes,
  formatIndianMobile,
  formatInr,
  getVapidConfig,
  notifyNewLead,
  notifyOrderPaid,
  queueOrderPaidPush,
  sendToAdmins,
} from "../src/lib/admin-push.js";
import { markOrderPaid } from "../src/lib/mark-paid.js";
import { adminPushSubscriptions } from "../src/db/schema.js";
import type { DbClient } from "../src/db/client.js";

const dialect = new PgDialect();
const VAPID = webpush.generateVAPIDKeys();

function enablePush() {
  process.env.VAPID_PUBLIC_KEY = VAPID.publicKey;
  process.env.VAPID_PRIVATE_KEY = VAPID.privateKey;
  process.env.VAPID_SUBJECT = "mailto:owner@example.com";
}
function disablePush() {
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  delete process.env.VAPID_SUBJECT;
}

interface SubRow {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  notifyOrders: boolean;
  notifyLeads: boolean;
  isAdmin: boolean;
}

const SUBS: SubRow[] = [
  { id: 1, endpoint: "https://fcm.googleapis.com/fcm/send/a", p256dh: "pa", auth: "aa", notifyOrders: true, notifyLeads: true, isAdmin: true },
  { id: 2, endpoint: "https://fcm.googleapis.com/fcm/send/b", p256dh: "pb", auth: "ab", notifyOrders: true, notifyLeads: false, isAdmin: true },
  { id: 3, endpoint: "https://web.push.apple.com/c", p256dh: "pc", auth: "ac", notifyOrders: false, notifyLeads: true, isAdmin: true },
  // Opted into everything, but the account is no longer an admin.
  { id: 4, endpoint: "https://fcm.googleapis.com/fcm/send/d", p256dh: "pd", auth: "ad", notifyOrders: true, notifyLeads: true, isAdmin: false },
];

const ORDER = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  orderNumber: "SV0000000042",
  customerName: "Asha Verma",
  paymentMethod: "prepaid",
  total: "12198.00",
  advancePaid: "12198.00",
  items: [{ productName: "Virtus M4 spoiler (ABS)" }, { productName: "LED DRL" }],
};

interface Calls {
  selects: string[];
  updates: { id: number; set: Record<string, unknown> }[];
  deletes: number[];
  findFirst: number;
  paidUpdates: number;
}

/**
 * Fake db. The subscription query's WHERE is rendered to SQL and evaluated the
 * way Postgres would for our two opt-in columns + the is_admin join, so the
 * opt-in filter is tested against the real condition the module builds.
 */
function makeDb(opts: { subs?: SubRow[]; order?: unknown; failSelect?: boolean; wonOnce?: boolean } = {}, calls?: Calls) {
  const c: Calls = calls ?? { selects: [], updates: [], deletes: [], findFirst: 0, paidUpdates: 0 };
  let won = false;
  const idOf = (cond: SQL) => Number(dialect.sqlToQuery(cond).params.at(-1));
  const db = {
    select: () => ({
      from: (table: unknown) => {
        if (table !== adminPushSubscriptions) {
          // mark-paid's cart lookup (only for signed-in orders).
          return { where: () => ({ limit: async () => [] }) };
        }
        return {
          innerJoin: () => ({
            where: async (cond: SQL) => {
              if (opts.failSelect) throw new Error("db down");
              const { sql } = dialect.sqlToQuery(cond);
              c.selects.push(sql);
              const col = /"notify_orders"/.test(sql) ? "notifyOrders" : /"notify_leads"/.test(sql) ? "notifyLeads" : null;
              if (!col || !/"is_admin"/.test(sql)) throw new Error(`unexpected subscription query: ${sql}`);
              return (opts.subs ?? SUBS).filter((s) => s[col] && s.isAdmin);
            },
          }),
        };
      },
    }),
    update: (table: unknown) => ({
      set: (set: Record<string, unknown>) => ({
        where: (cond: SQL) => {
          if (table === adminPushSubscriptions) {
            c.updates.push({ id: idOf(cond), set });
            return Promise.resolve();
          }
          // mark-paid's guarded pending → paid update.
          c.paidUpdates++;
          const first = opts.wonOnce ? !won : true;
          won = true;
          return Object.assign(Promise.resolve(), { returning: async () => (first ? [{ id: ORDER.id }] : []) });
        },
      }),
    }),
    delete: () => ({
      where: async (cond: SQL) => {
        c.deletes.push(idOf(cond));
      },
    }),
    insert: () => ({ values: async () => {} }),
    query: {
      orders: {
        findFirst: async () => {
          c.findFirst++;
          return opts.order === undefined ? ORDER : opts.order;
        },
      },
    },
  };
  return { db: db as unknown as DbClient, calls: c };
}

beforeEach(() => {
  mocks.sendNotification.mockReset();
  mocks.sendNotification.mockResolvedValue({ statusCode: 201, body: "", headers: {} });
  enablePush();
});
afterEach(async () => {
  await flushAdminPushes();
  disablePush();
});

describe("payloads", () => {
  it("prepaid order: ₹ total + number in the title, name · Prepaid · first item + N more", () => {
    expect(
      buildOrderPushPayload({ ...ORDER, total: 12198, advancePaid: 12198, items: ORDER.items }),
    ).toEqual({
      title: "New order ₹12,198 · SV0000000042",
      body: "Asha Verma · Prepaid · Virtus M4 spoiler (ABS) + 1 more",
      url: `/admin/orders/${ORDER.id}`,
      tag: `order-${ORDER.id}`,
      kind: "order",
    });
  });

  it("COD order shows the advance actually paid; single item has no '+ N more'", () => {
    const p = buildOrderPushPayload({
      ...ORDER,
      paymentMethod: "cod",
      total: 122000,
      advancePaid: 18300,
      items: [{ productName: "Akrapovic-style exhaust" }],
    });
    expect(p.title).toBe("New order ₹1,22,000 · SV0000000042");
    expect(p.body).toBe("Asha Verma · COD advance ₹18,300 paid · Akrapovic-style exhaust");
  });

  it("missing customer name and no items still read cleanly", () => {
    const p = buildOrderPushPayload({ ...ORDER, customerName: "", total: 99.5, advancePaid: 0, items: [] });
    expect(p.title).toBe("New order ₹99.50 · SV0000000042");
    expect(p.body).toBe("Customer · Prepaid");
  });

  it("lead: +91 formatted number, page path (or / when unknown); tag = row id, never the number", () => {
    expect(buildLeadPushPayload({ id: 57, phone: "9876543210", pagePath: "/product/led-tail-lamp" })).toEqual({
      title: "New lead: +91 98765 43210",
      body: "From /product/led-tail-lamp",
      url: "/admin/phone-leads",
      tag: "lead-57",
      kind: "lead",
    });
    expect(buildLeadPushPayload({ id: 58, phone: "9876543210", pagePath: null }).body).toBe("From /");
  });

  it("the admin_push_sent log line carries no phone digits", async () => {
    const lines: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((l: unknown) => void lines.push(String(l)));
    const { db } = makeDb({ subs: [SUBS[0]!] });
    await sendToAdmins(db, "lead", buildLeadPushPayload({ id: 77, phone: "9876543210", pagePath: "/" }));
    spy.mockRestore();
    const sent = lines.find((l) => l.includes("admin_push_sent"))!;
    expect(sent).toContain('"tag":"lead-77"');
    expect(sent).not.toMatch(/98765|43210/);
  });

  it("formatters", () => {
    expect(formatInr(4299)).toBe("₹4,299");
    expect(formatInr(1829.7)).toBe("₹1,829.70");
    expect(formatInr(122000)).toBe("₹1,22,000");
    expect(formatIndianMobile("+91 98765-43210")).toBe("+91 98765 43210");
    expect(formatIndianMobile("12345")).toBe("12345");
  });
});

describe("VAPID config", () => {
  it("disabled when any value is missing", () => {
    disablePush();
    expect(getVapidConfig()).toBeNull();
    process.env.VAPID_PUBLIC_KEY = VAPID.publicKey;
    process.env.VAPID_PRIVATE_KEY = VAPID.privateKey;
    expect(getVapidConfig()).toBeNull();
  });

  it("disabled (not thrown) for a bad subject or a malformed key", () => {
    process.env.VAPID_SUBJECT = "owner@example.com"; // no mailto:
    expect(getVapidConfig()).toBeNull();
    enablePush();
    process.env.VAPID_PUBLIC_KEY = "not-a-key";
    expect(getVapidConfig()).toBeNull();
  });

  it("enabled with a real key pair", () => {
    expect(getVapidConfig()).toEqual({
      publicKey: VAPID.publicKey,
      privateKey: VAPID.privateKey,
      subject: "mailto:owner@example.com",
    });
  });
});

describe("sendToAdmins", () => {
  it("orders go only to admin devices that opted into orders", async () => {
    const { db } = makeDb();
    const summary = await sendToAdmins(db, "order", buildLeadPushPayload({ id: 1, phone: "9876543210", pagePath: "/" }));
    const endpoints = mocks.sendNotification.mock.calls.map((c) => c[0].endpoint);
    expect(endpoints.sort()).toEqual([SUBS[0]!.endpoint, SUBS[1]!.endpoint].sort());
    expect(summary).toMatchObject({ enabled: true, attempted: 2, sent: 2, failed: 0, removed: 0 });
  });

  it("leads go only to admin devices that opted into leads", async () => {
    const { db } = makeDb();
    await sendToAdmins(db, "lead", buildLeadPushPayload({ id: 1, phone: "9876543210", pagePath: "/" }));
    const endpoints = mocks.sendNotification.mock.calls.map((c) => c[0].endpoint);
    expect(endpoints.sort()).toEqual([SUBS[0]!.endpoint, SUBS[2]!.endpoint].sort());
  });

  it("sends the encrypted-payload JSON + high urgency, a TTL and a short timeout; records success", async () => {
    const { db, calls } = makeDb({ subs: [SUBS[0]!] });
    const payload = buildLeadPushPayload({ id: 2, phone: "9876543210", pagePath: "/shop" });
    await sendToAdmins(db, "lead", payload);
    const [sub, body, options] = mocks.sendNotification.mock.calls[0]!;
    expect(sub).toEqual({ endpoint: SUBS[0]!.endpoint, keys: { p256dh: "pa", auth: "aa" } });
    expect(JSON.parse(body)).toMatchObject({ ...payload, ts: expect.any(Number) });
    expect(options).toMatchObject({
      vapidDetails: { publicKey: VAPID.publicKey, privateKey: VAPID.privateKey, subject: "mailto:owner@example.com" },
      urgency: "high",
      TTL: 86400,
      timeout: 5000,
    });
    expect(calls.updates).toEqual([{ id: 1, set: { lastSuccessAt: expect.any(Date), lastError: null } }]);
  });

  it("404/410 from the push service deletes that subscription; others still get it", async () => {
    mocks.sendNotification.mockImplementation(async (sub: { endpoint: string }) => {
      if (sub.endpoint === SUBS[1]!.endpoint) throw Object.assign(new Error("Gone"), { statusCode: 410, body: "expired" });
      return { statusCode: 201 };
    });
    const { db, calls } = makeDb();
    const summary = await sendToAdmins(db, "order", buildOrderPushPayload({ ...ORDER, total: 1, advancePaid: 1 }));
    expect(calls.deletes).toEqual([2]);
    expect(summary).toMatchObject({ attempted: 2, sent: 1, removed: 1, failed: 0 });
    expect(summary.results.find((r) => r.id === 2)).toMatchObject({ ok: false, removed: true, statusCode: 410 });
  });

  it("other failures record last_error, keep the row, and never throw", async () => {
    mocks.sendNotification.mockRejectedValue(Object.assign(new Error("Bad"), { statusCode: 500, body: "boom" }));
    const { db, calls } = makeDb({ subs: [SUBS[0]!] });
    const summary = await sendToAdmins(db, "order", buildOrderPushPayload({ ...ORDER, total: 1, advancePaid: 1 }));
    expect(calls.deletes).toEqual([]);
    expect(calls.updates).toEqual([{ id: 1, set: { lastError: "HTTP 500: boom" } }]);
    expect(summary).toMatchObject({ sent: 0, failed: 1, removed: 0 });
  });

  it("a network error / timeout (no status code) is retried once, then a failure — never a throw", async () => {
    mocks.sendNotification.mockRejectedValue(new Error("socket hang up"));
    const { db } = makeDb({ subs: [SUBS[0]!] });
    const summary = await sendToAdmins(db, "lead", buildLeadPushPayload({ id: 1, phone: "9876543210", pagePath: "/" }));
    expect(summary.results[0]).toMatchObject({ ok: false, statusCode: null, error: "socket hang up" });
    expect(mocks.sendNotification).toHaveBeenCalledTimes(2);
  });

  it("a transient failure that succeeds on the retry counts as sent", async () => {
    mocks.sendNotification
      .mockRejectedValueOnce(Object.assign(new Error("Bad gateway"), { statusCode: 502 }))
      .mockResolvedValueOnce({ statusCode: 201 });
    const { db, calls } = makeDb({ subs: [SUBS[0]!] });
    const summary = await sendToAdmins(db, "order", buildOrderPushPayload({ ...ORDER, total: 1, advancePaid: 1 }));
    expect(summary).toMatchObject({ sent: 1, failed: 0 });
    expect(mocks.sendNotification).toHaveBeenCalledTimes(2);
    expect(calls.updates[0]!.set).toMatchObject({ lastError: null });
  });

  it("4xx answers (other than 404/410) are final — no retry", async () => {
    mocks.sendNotification.mockRejectedValue(Object.assign(new Error("Forbidden"), { statusCode: 403, body: "vapid mismatch" }));
    const { db } = makeDb({ subs: [SUBS[0]!] });
    const summary = await sendToAdmins(db, "order", buildOrderPushPayload({ ...ORDER, total: 1, advancePaid: 1 }));
    expect(summary).toMatchObject({ failed: 1 });
    expect(mocks.sendNotification).toHaveBeenCalledTimes(1);
  });

  it("a database failure is logged, not thrown", async () => {
    const { db } = makeDb({ failSelect: true });
    await expect(sendToAdmins(db, "order", buildTestLike())).resolves.toMatchObject({ sent: 0 });
    expect(mocks.sendNotification).not.toHaveBeenCalled();
  });

  it("disabled push does nothing and touches no table", async () => {
    disablePush();
    const db = new Proxy({}, { get: () => { throw new Error("db touched"); } }) as unknown as DbClient;
    await expect(sendToAdmins(db, "order", buildTestLike())).resolves.toMatchObject({ enabled: false, attempted: 0 });
    await expect(notifyOrderPaid(db, ORDER.id)).resolves.toBeNull();
    await expect(notifyNewLead(db, { id: 3, phone: "9876543210", pagePath: "/" })).resolves.toBeNull();
  });
});

function buildTestLike() {
  return buildLeadPushPayload({ id: 1, phone: "9876543210", pagePath: "/" });
}

describe("order-paid trigger", () => {
  it("sends the order payload to the order opt-ins", async () => {
    const id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const { db } = makeDb({ order: { ...ORDER, id } });
    const summary = await notifyOrderPaid(db, id);
    expect(summary).toMatchObject({ sent: 2 });
    const body = JSON.parse(mocks.sendNotification.mock.calls[0]![1]);
    expect(body).toMatchObject({
      title: "New order ₹12,198 · SV0000000042",
      body: "Asha Verma · Prepaid · Virtus M4 spoiler (ABS) + 1 more",
      url: `/admin/orders/${id}`,
    });
  });

  it("exactly once per order even if asked twice", async () => {
    const id = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const { db, calls } = makeDb({ order: { ...ORDER, id } });
    await notifyOrderPaid(db, id);
    await notifyOrderPaid(db, id);
    expect(calls.findFirst).toBe(1);
    expect(mocks.sendNotification).toHaveBeenCalledTimes(2); // 2 opted-in devices, once each
  });

  it("PayU return + webhook racing: markOrderPaid lets one through, one alert goes out", async () => {
    const id = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const { db, calls } = makeDb({ order: { ...ORDER, id }, wonOnce: true });
    const order = { id, paymentMethod: "prepaid", userId: null };
    const results = await Promise.all([
      markOrderPaid(db, order, { mihpayid: "p1", advancePaid: 12198 }),
      markOrderPaid(db, order, { mihpayid: "p1", advancePaid: 12198 }),
    ]);
    await flushAdminPushes();
    expect(results.sort()).toEqual([false, true]);
    expect(calls.paidUpdates).toBe(2);
    expect(calls.findFirst).toBe(1);
    expect(mocks.sendNotification).toHaveBeenCalledTimes(2);
  });

  it("markOrderPaid does not wait for the push (fire-and-forget)", async () => {
    const id = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    const pending: (() => void)[] = [];
    mocks.sendNotification.mockImplementation(
      () => new Promise((r) => pending.push(() => r({ statusCode: 201 }))),
    );
    const { db } = makeDb({ order: { ...ORDER, id } });
    const won = await markOrderPaid(db, { id, paymentMethod: "prepaid", userId: null }, { mihpayid: null, advancePaid: 1 });
    expect(won).toBe(true);
    // The push is still in flight (unresolved) while markOrderPaid has returned.
    await vi.waitFor(() => expect(mocks.sendNotification).toHaveBeenCalledTimes(2));
    expect(pending).toHaveLength(2);
    pending.forEach((release) => release());
    await flushAdminPushes();
  });

  it("a failing order lookup never escapes the queue", async () => {
    const id = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    const { db } = makeDb();
    (db as unknown as { query: { orders: { findFirst: () => Promise<never> } } }).query.orders.findFirst = async () => {
      throw new Error("db down");
    };
    expect(() => queueOrderPaidPush(db, id)).not.toThrow();
    await expect(flushAdminPushes()).resolves.toBeUndefined();
    expect(mocks.sendNotification).not.toHaveBeenCalled();
  });
});
