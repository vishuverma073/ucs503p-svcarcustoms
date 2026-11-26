import { describe, expect, it } from "vitest";

process.env.JWT_ADMIN_SECRET = "test-admin-secret-at-least-32-chars-long!!";
// The admin middleware caches the user lookup per id unless LOG_LEVEL is debug —
// without this the non-admin case below poisons the cache for the rest.
process.env.LOG_LEVEL = "debug";

import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { createApp } from "../src/app.js";
import { signAdminAccess } from "../src/lib/jwt.js";
import {
  mergePhoneLeads,
  phoneKey,
  type OrderGroupRow,
  type PopupGroupRow,
} from "../src/routes/admin/phone-leads.js";
import type { DbClient } from "../src/db/client.js";

const ADMIN_ID = "fb354b9c-6c05-4379-8f2c-4c59962d4761";
const dialect = new PgDialect();

/** Fake db: the admin lookup, plus each grouped query answered by the table it reads. */
function mockDb(opts: { admin?: boolean; popup?: PopupGroupRow[]; orders?: OrderGroupRow[] } = {}, seen: string[] = []) {
  const adminRow =
    opts.admin === false ? null : { id: ADMIN_ID, email: "a@b.com", name: "A", isAdmin: true };
  return {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => (adminRow ? [adminRow] : []) }) }),
    }),
    execute: async (q: SQL) => {
      const text = dialect.sqlToQuery(q).sql;
      seen.push(text);
      if (/from phone_leads/.test(text)) return opts.popup ?? [];
      if (/from orders/.test(text)) return opts.orders ?? [];
      throw new Error(`unexpected query: ${text}`);
    },
  } as unknown as DbClient;
}

const token = () => signAdminAccess({ sub: ADMIN_ID });

const POPUP: PopupGroupRow[] = [
  // Popup + order (the order used "+91 …" spelling): must merge into one row.
  { phone: "9876543210", popup_count: 2, last_popup_at: "2026-10-21 09:00:00+00", last_popup_page: "/product/drl" },
  // Popup only.
  { phone: "9123456789", popup_count: 1, last_popup_at: new Date("2026-10-22T08:00:00Z"), last_popup_page: "/" },
];
const ORDERS: OrderGroupRow[] = [
  {
    phone: "9876543210",
    order_count: "3",
    last_order_at: "2026-10-21 12:30:00+00",
    name: "Asha Verma",
    latest_order_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    latest_order_number: "SV0000000001",
    latest_status: "paid",
    latest_payment_status: "paid",
    latest_total: "4299.00",
  },
  // Order only, oldest activity.
  {
    phone: "8000000001",
    order_count: 1,
    last_order_at: "2026-10-01 10:00:00+00",
    name: "Ravi K",
    latest_order_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    latest_order_number: "SV0000000002",
    latest_status: "pending",
    latest_payment_status: "pending",
    latest_total: 1999,
  },
];

describe("GET /admin/phone-leads", () => {
  it("401 without a token", async () => {
    const res = await createApp({ db: mockDb() }).request("/admin/phone-leads");
    expect(res.status).toBe(401);
  });

  it("403 for a non-admin token", async () => {
    const res = await createApp({ db: mockDb({ admin: false }) }).request("/admin/phone-leads", {
      headers: { Authorization: `Bearer ${await token()}` },
    });
    expect(res.status).toBe(403);
  });

  it("one merged row per number, newest activity first, with totals", async () => {
    const seen: string[] = [];
    const res = await createApp({ db: mockDb({ popup: POPUP, orders: ORDERS }, seen) }).request(
      "/admin/phone-leads",
      { headers: { Authorization: `Bearer ${await token()}` } },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    const body = (await res.json()) as any;

    // Both sources were read, each grouped by the normalised 10-digit number.
    expect(seen).toHaveLength(2);
    for (const q of seen) expect(q).toMatch(/right\(regexp_replace\(.*'\[\^0-9\]', '', 'g'\), 10\)/);

    expect(body.items.map((r: any) => r.phone)).toEqual(["9123456789", "9876543210", "8000000001"]);
    expect(body.items[0]).toEqual({
      phone: "9123456789",
      name: null,
      sources: ["popup"],
      lastActivityAt: "2026-10-22T08:00:00.000Z",
      popup: { count: 1, lastAt: "2026-10-22T08:00:00.000Z", lastPagePath: "/" },
      order: null,
    });
    expect(body.items[1]).toEqual({
      phone: "9876543210",
      name: "Asha Verma",
      sources: ["popup", "order"],
      lastActivityAt: "2026-10-21T12:30:00.000Z",
      popup: { count: 2, lastAt: "2026-10-21T09:00:00.000Z", lastPagePath: "/product/drl" },
      order: {
        count: 3,
        latestOrderId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        latestOrderNumber: "SV0000000001",
        latestStatus: "paid",
        latestPaymentStatus: "paid",
        latestTotal: 4299,
        latestAt: "2026-10-21T12:30:00.000Z",
      },
    });
    expect(body.items[2]).toMatchObject({ phone: "8000000001", sources: ["order"], popup: null, name: "Ravi K" });
    expect(body.totals).toEqual({
      phones: 3,
      popupPhones: 2,
      orderPhones: 2,
      bothPhones: 1,
      popupSubmissions: 3,
      orders: 4,
    });
    expect(body).toMatchObject({ limit: 500, truncated: false });
  });

  it("empty store → empty list, zero totals", async () => {
    const res = await createApp({ db: mockDb() }).request("/admin/phone-leads", {
      headers: { Authorization: `Bearer ${await token()}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.items).toEqual([]);
    expect(body.totals.phones).toBe(0);
  });
});

describe("mergePhoneLeads", () => {
  it("normalises spellings so +91 / 0-prefixed order phones meet the popup number", () => {
    expect(phoneKey("+91 98765 43210")).toBe("9876543210");
    expect(phoneKey("098765-43210")).toBe("9876543210");
    expect(phoneKey(null)).toBe("");

    const out = mergePhoneLeads(
      [{ phone: "9876543210", popup_count: 1, last_popup_at: "2026-10-20T00:00:00Z", last_popup_page: "/shop" }],
      [{ ...ORDERS[0]!, phone: "+91 98765 43210" }],
    );
    expect(out.items).toHaveLength(1);
    expect(out.items[0]!.sources).toEqual(["popup", "order"]);
  });

  it("skips rows with no digits at all", () => {
    const out = mergePhoneLeads([], [{ ...ORDERS[0]!, phone: "" }]);
    expect(out.items).toEqual([]);
  });

  it("keeps the latest order's details when two spellings of one number arrive as separate groups", () => {
    const out = mergePhoneLeads(
      [],
      [
        { ...ORDERS[0]!, phone: "9876543210", order_count: 1, last_order_at: "2026-10-01T00:00:00Z", name: "Old Name", latest_order_id: "old-id", latest_order_number: "OLD" },
        { ...ORDERS[0]!, phone: "+919876543210", order_count: 2, last_order_at: "2026-10-05T00:00:00Z", name: "New Name", latest_order_id: "new-id", latest_order_number: "NEW" },
      ],
    );
    expect(out.items[0]).toMatchObject({
      name: "New Name",
      order: { count: 3, latestOrderId: "new-id", latestOrderNumber: "NEW" },
    });
  });

  it("caps the list at the limit and says so", () => {
    const popup: PopupGroupRow[] = Array.from({ length: 5 }, (_, i) => ({
      phone: `90000000${String(i).padStart(2, "0")}`,
      popup_count: 1,
      last_popup_at: `2026-10-0${i + 1}T00:00:00Z`,
      last_popup_page: "/",
    }));
    const out = mergePhoneLeads(popup, [], 3);
    expect(out.items.map((r) => r.phone)).toEqual(["9000000004", "9000000003", "9000000002"]);
    expect(out).toMatchObject({ limit: 3, truncated: true });
    expect(out.totals.phones).toBe(5);
  });
});
