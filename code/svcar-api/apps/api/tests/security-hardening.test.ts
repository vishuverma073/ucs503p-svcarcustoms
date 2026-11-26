import { afterEach, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";

process.env.NODE_ENV = "test";
process.env.JWT_ACCESS_SECRET = "test-access-secret-at-least-32-chars-long!!";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret-at-least-32-chars-long!";
process.env.JWT_ADMIN_SECRET = "test-admin-secret-at-least-32-chars-long!!";
process.env.LOG_LEVEL = "debug"; // skip the admin-record cache

import { Hono } from "hono";
import { createApp } from "../src/app.js";
import { issuedBeforePasswordChange, signAccess, signAdminAccess, signRefresh } from "../src/lib/jwt.js";
import { findOrderForPayuTxn, markOrderPaid } from "../src/lib/mark-paid.js";
import { clientIp } from "../src/middleware/ip-rate-limit.js";
import { UploadError, uploadImage } from "../src/lib/storage.js";
import type { DbClient } from "../src/db/client.js";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const json = (body: unknown, token?: string) => ({
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  },
  body: JSON.stringify(body),
});

/** select → one fixed row; update(...).returning → that row with the patch applied. */
function userDb(user: Record<string, unknown>, writes: Record<string, unknown>[] = []): DbClient {
  return {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [user] }) }) }),
    update: () => ({
      set: (vals: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => {
            writes.push(vals);
            return [{ ...user, ...vals }];
          },
        }),
      }),
    }),
  } as unknown as DbClient;
}

describe("H1 — /auth/password/set can't be used to take an account (or the admin panel)", () => {
  const base = { id: USER_ID, email: "a@example.com", phone: null, name: null, createdAt: new Date() };

  it("403 for an admin account — admin passwords never change from the storefront", async () => {
    const writes: Record<string, unknown>[] = [];
    const db = userDb({ ...base, isAdmin: true, passwordHash: bcrypt.hashSync("old-password", 4) }, writes);
    const token = await signAccess({ sub: USER_ID, isAdmin: true });
    const res = await createApp({ db }).request(
      "/auth/password/set",
      json({ password: "new-password-1", currentPassword: "old-password" }, token),
    );
    expect(res.status).toBe(403);
    expect(writes).toHaveLength(0);
  });

  it("400 when changing an existing password without the current one", async () => {
    const writes: Record<string, unknown>[] = [];
    const db = userDb({ ...base, isAdmin: false, passwordHash: bcrypt.hashSync("old-password", 4) }, writes);
    const token = await signAccess({ sub: USER_ID, isAdmin: false });
    const res = await createApp({ db }).request("/auth/password/set", json({ password: "new-password-1" }, token));
    expect(res.status).toBe(400);
    expect(writes).toHaveLength(0);
  });

  it("422 (not 401, which would sign the customer out) on a wrong current password", async () => {
    const writes: Record<string, unknown>[] = [];
    const db = userDb({ ...base, isAdmin: false, passwordHash: bcrypt.hashSync("old-password", 4) }, writes);
    const token = await signAccess({ sub: USER_ID, isAdmin: false });
    const res = await createApp({ db }).request(
      "/auth/password/set",
      json({ password: "new-password-1", currentPassword: "wrong" }, token),
    );
    expect(res.status).toBe(422);
    expect(writes).toHaveLength(0);
  });

  it("first-time set (no password yet) works, stamps passwordChangedAt, re-issues the refresh cookie", async () => {
    const writes: Record<string, unknown>[] = [];
    const db = userDb({ ...base, isAdmin: false, passwordHash: null }, writes);
    const token = await signAccess({ sub: USER_ID, isAdmin: false });
    const res = await createApp({ db }).request("/auth/password/set", json({ password: "new-password-1" }, token));
    expect(res.status).toBe(200);
    expect(writes[0]?.passwordChangedAt).toBeInstanceOf(Date);
    expect(res.headers.get("set-cookie")).toMatch(/refresh_token=/);
  });

  it("rejects passwords shorter than 8", async () => {
    const db = userDb({ ...base, isAdmin: false, passwordHash: null });
    const token = await signAccess({ sub: USER_ID, isAdmin: false });
    const res = await createApp({ db }).request("/auth/password/set", json({ password: "short1" }, token));
    expect(res.status).toBe(400);
  });
});

describe("L4 — a password change ends older sessions", () => {
  it("issuedBeforePasswordChange compares at whole seconds", () => {
    const changed = new Date("2026-10-07T10:00:00.700Z");
    expect(issuedBeforePasswordChange(Math.floor(changed.getTime() / 1000) - 1, changed)).toBe(true);
    expect(issuedBeforePasswordChange(Math.floor(changed.getTime() / 1000), changed)).toBe(false);
    expect(issuedBeforePasswordChange(1, null)).toBe(false);
  });

  it("refresh with a token older than the last password change → 401", async () => {
    const token = await signRefresh({ sub: USER_ID, jti: "pre-change" });
    const db = userDb({
      id: USER_ID,
      email: "a@example.com",
      phone: null,
      name: null,
      isAdmin: false,
      passwordHash: null,
      passwordChangedAt: new Date(Date.now() + 5_000),
    });
    const res = await createApp({ db }).request("/auth/refresh", {
      method: "POST",
      headers: { Cookie: `refresh_token=${token}` },
    });
    expect(res.status).toBe(401);
  });

  it("admin token older than the admin's password change → 401", async () => {
    const token = await signAdminAccess({ sub: USER_ID });
    const db = userDb({
      id: USER_ID,
      email: "a@example.com",
      name: "A",
      isAdmin: true,
      passwordChangedAt: new Date(Date.now() + 5_000),
    });
    const res = await createApp({ db }).request("/admin/settings", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
  });
});

describe("M3 — only live products can be bought", () => {
  function cartDb(row: { status: string; stock: number | null } | null): DbClient {
    return {
      select: () => ({
        from: () => ({
          innerJoin: () => ({ where: () => ({ limit: async () => (row ? [{ id: 10, ...row }] : []) }) }),
        }),
      }),
    } as unknown as DbClient;
  }

  it("404 when the SKU belongs to a draft product", async () => {
    const token = await signAccess({ sub: USER_ID, isAdmin: false });
    const res = await createApp({ db: cartDb({ status: "draft", stock: null }) }).request(
      "/me/cart/items",
      json({ skuId: 10, qty: 1 }, token),
    );
    expect(res.status).toBe(404);
  });

  it("409 when asking for more than is in stock", async () => {
    const token = await signAccess({ sub: USER_ID, isAdmin: false });
    const res = await createApp({ db: cartDb({ status: "active", stock: 1 }) }).request(
      "/me/cart/items",
      json({ skuId: 10, qty: 2 }, token),
    );
    expect(res.status).toBe(409);
  });

  it("400 on qty above the per-line cap", async () => {
    const token = await signAccess({ sub: USER_ID, isAdmin: false });
    const res = await createApp({ db: cartDb({ status: "active", stock: null }) }).request(
      "/me/cart/items",
      json({ skuId: 10, qty: 100 }, token),
    );
    expect(res.status).toBe(400);
  });
});

describe("L5 — PayU callbacks resolve the right order and credit it once", () => {
  const ORDER = { id: "o1", orderNumber: "SV0000000001", status: "pending", paymentMethod: "prepaid", userId: null };
  function lookupDb(order: unknown): DbClient {
    return {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => (order ? [order] : []) }) }) }),
    } as unknown as DbClient;
  }

  it("finds the order for a retry txnid even after payu_txn_id moved on", async () => {
    const o = await findOrderForPayuTxn(lookupDb(ORDER), { txnid: "SV0000000001-r123", udf1: "SV0000000001" });
    expect(o?.orderNumber).toBe("SV0000000001");
  });

  it("refuses a txnid that doesn't belong to the order named in udf1", async () => {
    const o = await findOrderForPayuTxn(lookupDb(ORDER), { txnid: "SVOTHERORDER", udf1: "SV0000000001" });
    expect(o).toBeNull();
  });

  it("markOrderPaid is a no-op when another callback already won the pending→paid update", async () => {
    const db = {
      update: () => ({ set: () => ({ where: () => ({ returning: async () => [] }) }) }),
    } as unknown as DbClient;
    // No select/insert on the mock: reaching the event log or cart cleanup would throw.
    expect(await markOrderPaid(db, ORDER as never, { mihpayid: "m1", advancePaid: 10 })).toBe(false);
  });
});

describe("M1 — client IP behind the storefront proxy", () => {
  afterEach(() => {
    delete process.env.AUTH_PROXY_SECRET;
  });
  const SECRET = "proxy-secret-that-is-at-least-32-characters";
  async function ipOf(headers: Record<string, string>) {
    const app = new Hono();
    app.get("/", (c) => c.text(clientIp(c)));
    const res = await app.request("/", { headers });
    return res.text();
  }

  it("uses x-client-ip only when the proxy secret matches", async () => {
    process.env.AUTH_PROXY_SECRET = SECRET;
    expect(await ipOf({ "fly-client-ip": "76.76.21.1", "x-proxy-secret": SECRET, "x-client-ip": "49.36.1.2" })).toBe(
      "49.36.1.2",
    );
    expect(await ipOf({ "fly-client-ip": "76.76.21.1", "x-proxy-secret": "wrong", "x-client-ip": "1.2.3.4" })).toBe(
      "76.76.21.1",
    );
  });

  it("ignores x-client-ip entirely when no secret is configured", async () => {
    expect(await ipOf({ "fly-client-ip": "76.76.21.1", "x-proxy-secret": "", "x-client-ip": "1.2.3.4" })).toBe(
      "76.76.21.1",
    );
  });
});

describe("L6 — uploads are sniffed, not trusted", () => {
  it("rejects an SVG even when labelled image/png", async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    await expect(uploadImage({ name: "x.png", type: "image/png", data: svg.buffer as ArrayBuffer })).rejects.toBeInstanceOf(
      UploadError,
    );
  });
});
