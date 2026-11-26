import crypto from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

process.env.JWT_ACCESS_SECRET = "test-access-secret-at-least-32-chars-long!!";
process.env.NODE_ENV = "test"; // forces PayU stub mode (deterministic dummy salt)

import { createApp } from "../src/app.js";
import { signAccess } from "../src/lib/jwt.js";
import {
  buildPayuRequest,
  verifyPayuResponse,
  computePayuResponseHash,
  isPayuPending,
  isPayuStub,
  verifyPayuPayments,
} from "../src/lib/payu.js";
import { users, carts, addresses, orders } from "../src/db/schema.js";
import type { DbClient } from "../src/db/client.js";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const USER = { id: USER_ID, phone: "+919350529717", name: "Asha", email: "asha@example.com" };

interface State {
  user?: unknown;
  cart?: { id: string };
  address?: unknown;
  order?: unknown;
  items?: unknown[];
}

function makeDb(state: State): DbClient {
  return {
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          limit: async () => {
            if (table === users) return state.user ? [state.user] : [];
            if (table === carts) return state.cart ? [state.cart] : [];
            if (table === addresses) return state.address ? [state.address] : [];
            if (table === orders) return state.order ? [state.order] : [];
            return [];
          },
        }),
      }),
    }),
    query: { cartItems: { findMany: async () => state.items ?? [] } },
    transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ insert: () => ({ values: async () => {} }) }),
    update: () => ({
      set: () => ({ where: () => Object.assign(Promise.resolve(), { returning: async () => [{ id: "x" }] }) }),
    }),
    delete: () => ({ where: async () => {} }),
  } as unknown as DbClient;
}

const cartItem = {
  id: 1,
  skuId: 10,
  qty: 2,
  sku: {
    id: 10,
    skuCode: "LAV-1",
    price: "1500.00",
    salePrice: null,
    dimensionValues: { Size: "18x16" },
    stock: null,
    product: { name: "Lavender Sink", status: "active", images: [{ url: "/a.png" }] },
  },
};
const ADDRESS = { line1: "123 Test St", city: "Delhi", state: "DL", pincode: "110001" };

async function token(sub = USER_ID) {
  return signAccess({ sub, isAdmin: false });
}

afterEach(() => {
  delete process.env.PAYMENT_PROVIDER;
  delete process.env.ENABLE_DEV_AUTH_BYPASS;
});

describe("lib/payu", () => {
  it("is in stub mode under NODE_ENV=test", () => {
    expect(isPayuStub()).toBe(true);
  });

  it("buildPayuRequest emits the hosted-page fields + a hash", () => {
    const { paymentUrl, params } = buildPayuRequest({
      txnid: "SV0000000001",
      amount: "3099.00",
      productinfo: "Order SV0000000001",
      firstname: "Asha",
      email: "asha@example.com",
      phone: "+919350529717",
      surl: "https://api.example.com/payments/payu/return",
      furl: "https://api.example.com/payments/payu/return",
      udf1: "SV0000000001",
    });
    expect(paymentUrl).toContain("payu.in");
    expect(params.txnid).toBe("SV0000000001");
    expect(params.amount).toBe("3099.00");
    expect(params.hash).toMatch(/^[0-9a-f]{128}$/); // sha512 hex
  });

  it("verifyPayuResponse accepts a correctly-computed reverse hash", () => {
    const fields = {
      status: "success",
      txnid: "SV0000000001",
      amount: "3099.00",
      productinfo: "Order SV0000000001",
      firstname: "Asha",
      email: "asha@example.com",
      udf1: "SV0000000001",
    };
    const hash = computePayuResponseHash(fields);
    expect(verifyPayuResponse({ ...fields, hash })).toBe(true);
    expect(verifyPayuResponse({ ...fields, hash: "0".repeat(128) })).toBe(false);
  });

  it("rejects a mock_* hash unless the dev-auth bypass is on", () => {
    const fields = { status: "success", txnid: "SV1", amount: "10.00", hash: "mock_abc" };
    expect(verifyPayuResponse(fields)).toBe(false);
    process.env.ENABLE_DEV_AUTH_BYPASS = "1";
    expect(verifyPayuResponse(fields)).toBe(true);
  });
});

describe("isPayuPending", () => {
  it("is true for PayU's pending status, false for success/failure", () => {
    expect(isPayuPending({ status: "pending", unmappedstatus: "pending" })).toBe(true);
    expect(isPayuPending({ status: "success", unmappedstatus: "captured" })).toBe(false);
    expect(isPayuPending({ status: "failure", unmappedstatus: "failed" })).toBe(false);
    expect(isPayuPending({ status: "failure", unmappedstatus: "userCancelled" })).toBe(false);
  });

  it("falls back to unmappedstatus only when status is neither success nor failure", () => {
    expect(isPayuPending({ status: "", unmappedstatus: "in progress" })).toBe(true);
    expect(isPayuPending({ status: "failure", unmappedstatus: "pending" })).toBe(false);
    expect(isPayuPending({ status: "", unmappedstatus: "bounced" })).toBe(false);
  });
});

describe("verifyPayuPayments (Verify Payment API)", () => {
  const KEYS = ["NODE_ENV", "PAYU_MERCHANT_KEY", "PAYU_MERCHANT_SALT", "PAYU_MODE"] as const;
  const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  function live() {
    // Leave stub mode: real-looking creds, not NODE_ENV=test.
    process.env.NODE_ENV = "development";
    process.env.PAYU_MERCHANT_KEY = "testkey";
    process.env.PAYU_MERCHANT_SALT = "testsalt";
  }

  function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }

  it("POSTs key/command/var1/hash = sha512(key|command|var1|salt) to the test host", async () => {
    live();
    const details = { SV1: { txnid: "SV1", status: "success", amt: "10.00" }, "SV1-r5": { status: "Not Found" } };
    const fetchMock = vi.fn(async () => jsonResponse({ status: 1, transaction_details: details }));
    const out = await verifyPayuPayments(["SV1", "SV1-r5"], fetchMock as unknown as typeof fetch);

    expect(out).toEqual(details);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://test.payu.in/merchant/postservice.php?form=2");
    expect(init.method).toBe("POST");
    const body = new URLSearchParams(init.body as string);
    expect(body.get("key")).toBe("testkey");
    expect(body.get("command")).toBe("verify_payment");
    expect(body.get("var1")).toBe("SV1|SV1-r5");
    const expected = crypto.createHash("sha512").update("testkey|verify_payment|SV1|SV1-r5|testsalt").digest("hex");
    expect(body.get("hash")).toBe(expected);
    expect(body.has("salt")).toBe(false); // the salt never leaves the server
  });

  it("uses info.payu.in when PAYU_MODE=live", async () => {
    live();
    process.env.PAYU_MODE = "live";
    const fetchMock = vi.fn(async () => jsonResponse({ transaction_details: { SV1: { status: "failure" } } }));
    await verifyPayuPayments(["SV1"], fetchMock as unknown as typeof fetch);
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(
      "https://info.payu.in/merchant/postservice.php?form=2",
    );
  });

  it("throws on an HTTP error or a body without transaction_details (e.g. bad hash)", async () => {
    live();
    const httpError = vi.fn(async () => new Response("oops", { status: 502 }));
    await expect(verifyPayuPayments(["SV1"], httpError as unknown as typeof fetch)).rejects.toThrow(/502/);
    const badHash = vi.fn(async () => jsonResponse({ status: 0, msg: "Invalid Hash." }));
    await expect(verifyPayuPayments(["SV1"], badHash as unknown as typeof fetch)).rejects.toThrow(/Invalid Hash/);
  });

  it("makes no request in stub mode and reports every txnid Not Found", async () => {
    const fetchMock = vi.fn();
    const out = await verifyPayuPayments(["SV1"], fetchMock as unknown as typeof fetch);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(out.SV1?.status).toBe("Not Found");
  });
});

describe("POST /checkout/order (PAYMENT_PROVIDER=payu)", () => {
  it("returns a PayU handoff instead of a Razorpay one", async () => {
    process.env.PAYMENT_PROVIDER = "payu";
    const res = await createApp({
      db: makeDb({ user: USER, cart: { id: "c1" }, items: [cartItem] }),
    }).request("/checkout/order", {
      method: "POST",
      headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ address: ADDRESS }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(body.provider).toBe("payu");
    expect(body.amount).toBe(309900);
    expect(body.razorpayOrderId).toBeUndefined();
    expect(body.payu?.paymentUrl).toContain("payu.in");
    expect(body.payu?.params?.txnid).toBe(body.orderNumber);
    expect(body.payu?.params?.hash).toMatch(/^[0-9a-f]{128}$/);
  });
});

describe("POST /payments/payu/return", () => {
  const order = {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    orderNumber: "SV0000000001",
    userId: USER_ID,
    payuTxnId: "SV0000000001",
    status: "pending",
    total: "3099.00", // must match the callback `amount` (server-side amount check)
  };

  function form(fields: Record<string, string>) {
    return new URLSearchParams(fields).toString();
  }

  it("303-redirects to the success page and marks the order paid on a valid hash", async () => {
    const fields = {
      status: "success",
      txnid: "SV0000000001",
      amount: "3099.00",
      productinfo: "Order SV0000000001",
      firstname: "Asha",
      email: "asha@example.com",
      udf1: "SV0000000001",
      mihpayid: "payu_123",
    };
    const hash = computePayuResponseHash(fields);
    const res = await createApp({ db: makeDb({ order, cart: { id: "c1" } }) }).request(
      "/payments/payu/return",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form({ ...fields, hash }),
      },
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("/order-confirmation/SV0000000001");
    expect(res.headers.get("location")).not.toContain("status=failed");
  });

  it("valid hash but amount \u2260 order total \u2192 not marked paid (tamper backstop)", async () => {
    const fields = {
      status: "success",
      txnid: "SV0000000001",
      amount: "1.00", // order total is 3099.00
      productinfo: "Order SV0000000001",
      firstname: "Asha",
      email: "asha@example.com",
      udf1: "SV0000000001",
      mihpayid: "payu_amt_2",
    };
    const hash = computePayuResponseHash(fields); // a genuinely valid hash
    let updates = 0;
    const db = makeDb({ order, cart: { id: "c1" } });
    (db as unknown as { update: () => unknown }).update = () => ({
      set: () => ({ where: async () => { updates += 1; } }),
    });
    const res = await createApp({ db }).request("/payments/payu/return", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form({ ...fields, hash }),
    });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("status=failed");
    expect(updates).toBe(0); // order left pending \u2014 never credited
  });

  it("303-redirects to the failure page on a bad hash", async () => {
    const res = await createApp({ db: makeDb({ order }) }).request("/payments/payu/return", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form({ status: "success", txnid: "SV0000000001", hash: "0".repeat(128) }),
    });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("/order-confirmation/SV0000000001?status=failed");
  });

  it("303-redirects to the failure page when PayU reports a non-success status", async () => {
    const fields = {
      status: "failure",
      txnid: "SV0000000001",
      amount: "3099.00",
      productinfo: "Order SV0000000001",
      firstname: "Asha",
      email: "asha@example.com",
      udf1: "SV0000000001",
    };
    const hash = computePayuResponseHash(fields);
    const res = await createApp({ db: makeDb({ order }) }).request("/payments/payu/return", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form({ ...fields, hash }),
    });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("/order-confirmation/SV0000000001?status=failed");
  });

  it("303-redirects to the pending page (not failed) when PayU reports pending, without crediting", async () => {
    const fields = {
      status: "pending",
      unmappedstatus: "pending",
      txnid: "SV0000000001",
      amount: "3099.00",
      productinfo: "Order SV0000000001",
      firstname: "Asha",
      email: "asha@example.com",
      udf1: "SV0000000001",
    };
    const hash = computePayuResponseHash(fields);
    let updates = 0;
    const db = makeDb({ order });
    (db as unknown as { update: () => unknown }).update = () => {
      updates += 1;
      return { set: () => ({ where: async () => {} }) };
    };
    const res = await createApp({ db }).request("/payments/payu/return", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form({ ...fields, hash }),
    });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("/order-confirmation/SV0000000001?status=pending");
    expect(updates).toBe(0); // stays pending until the webhook / reconcile confirms it
  });
});
