import { describe, expect, it } from "vitest";

process.env.NODE_ENV = "test"; // PayU stub mode (deterministic dummy salt)

// [Razorpay disabled — PayU-only project] This file previously tested the
// /webhooks/razorpay route, which has been removed. It now covers the live
// PayU server-to-server webhook (/webhooks/payu).
import { createApp } from "../src/app.js";
import { computePayuResponseHash } from "../src/lib/payu.js";
import type { DbClient } from "../src/db/client.js";

interface Counters {
  updates: number;
  lastSet?: Record<string, unknown>;
}

function makeDb(order: unknown, counters: Counters): DbClient {
  return {
    select: () => ({
      from: () => ({ where: () => ({ limit: async () => (order ? [order] : []) }) }),
    }),
    update: () => ({
      set: (vals: Record<string, unknown>) => ({
        // Awaitable as-is, and supports .returning() for the guarded
        // pending→paid update in lib/mark-paid.ts.
        where: () => {
          counters.updates++;
          counters.lastSet = vals;
          return Object.assign(Promise.resolve(), { returning: async () => [{ id: "x" }] });
        },
      }),
    }),
    insert: () => ({ values: async () => {} }),
    delete: () => ({ where: async () => {} }),
  } as unknown as DbClient;
}

const BASE_ORDER = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  orderNumber: "SV0000000001",
  userId: "11111111-1111-1111-1111-111111111111",
  status: "pending",
  total: "3099.00", // must match the callback `amount` (server-side amount check)
};

function form(fields: Record<string, string>) {
  return new URLSearchParams(fields).toString();
}

async function post(db: DbClient, fields: Record<string, string>) {
  return createApp({ db }).request("/webhooks/payu", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form(fields),
  });
}

describe("POST /webhooks/payu", () => {
  it("401 on an invalid hash", async () => {
    const counters: Counters = { updates: 0 };
    const res = await post(makeDb({ ...BASE_ORDER, payuTxnId: "SV0000000001-r6" }, counters), {
      status: "success",
      txnid: "SV0000000001-r6",
      mihpayid: "payu_bad_1",
      hash: "0".repeat(128),
    });
    expect(res.status).toBe(401);
    expect(counters.updates).toBe(0);
  });

  it("success + valid hash → marks the order paid", async () => {
    const counters: Counters = { updates: 0 };
    const fields = {
      status: "success",
      txnid: "SV0000000001-r1",
      amount: "3099.00",
      productinfo: "Order SV0000000001",
      firstname: "Asha",
      email: "asha@example.com",
      udf1: "SV0000000001",
      mihpayid: "payu_ok_1",
    };
    const hash = computePayuResponseHash(fields);
    const order = { ...BASE_ORDER, payuTxnId: "SV0000000001-r1" };
    const res = await post(makeDb(order, counters), { ...fields, hash });
    expect(res.status).toBe(200);
    expect(counters.updates).toBe(1);
    expect(counters.lastSet).toMatchObject({ status: "paid" });
  });

  it("accepts only the 15% COD advance and leaves the order partially paid", async () => {
    const counters: Counters = { updates: 0 };
    const fields = {
      status: "success",
      txnid: "SV0000000001-r2",
      amount: "1500.00",
      productinfo: "COD advance for SV0000000001",
      firstname: "Asha",
      email: "asha@example.com",
      udf1: "SV0000000001",
      mihpayid: "payu_cod_1",
    };
    const hash = computePayuResponseHash(fields);
    const order = { ...BASE_ORDER, total: "10000.00", paymentMethod: "cod", payuTxnId: "SV0000000001-r2" };
    const res = await post(makeDb(order, counters), { ...fields, hash });
    expect(res.status).toBe(200);
    expect(counters.lastSet).toMatchObject({
      status: "paid",
      paymentStatus: "partially_paid",
      advancePaid: "1500",
    });
  });

  it("duplicate callback → 200 and no second state change", async () => {
    const counters: Counters = { updates: 0 };
    const fields = {
      status: "success",
      txnid: "SV0000000001-r3",
      amount: "3099.00",
      productinfo: "Order SV0000000001",
      firstname: "Asha",
      email: "asha@example.com",
      udf1: "SV0000000001",
      mihpayid: "payu_dup_1",
    };
    const hash = computePayuResponseHash(fields);
    const order = { ...BASE_ORDER, payuTxnId: "SV0000000001-r3" };
    const first = await post(makeDb(order, counters), { ...fields, hash });
    const second = await post(makeDb(order, counters), { ...fields, hash });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(counters.updates).toBe(1); // second request short-circuited
  });

  it("valid hash but amount ≠ order total → NOT marked paid (tamper backstop)", async () => {
    const counters: Counters = { updates: 0 };
    const fields = {
      status: "success",
      txnid: "SV0000000001-r4",
      amount: "1.00", // attacker paid ₹1 for a ₹3099 order
      productinfo: "Order SV0000000001",
      firstname: "Asha",
      email: "asha@example.com",
      udf1: "SV0000000001",
      mihpayid: "payu_amt_1",
    };
    const hash = computePayuResponseHash(fields); // a genuinely valid hash
    const order = { ...BASE_ORDER, payuTxnId: "SV0000000001-r4" }; // total 3099.00
    const res = await post(makeDb(order, counters), { ...fields, hash });
    expect(res.status).toBe(200);
    expect(counters.updates).toBe(0); // order left pending — never credited
  });

  it("non-success status → 200 with no state change", async () => {
    const counters: Counters = { updates: 0 };
    const fields = {
      status: "failure",
      txnid: "SV0000000001-r5",
      amount: "3099.00",
      productinfo: "Order SV0000000001",
      firstname: "Asha",
      email: "asha@example.com",
      udf1: "SV0000000001",
    };
    const hash = computePayuResponseHash(fields);
    const order = { ...BASE_ORDER, payuTxnId: "SV0000000001-r5" };
    const res = await post(makeDb(order, counters), { ...fields, hash });
    expect(res.status).toBe(200);
    expect(counters.updates).toBe(0);
  });
});

describe("shouldAlertHashFailure (Slack noise limiter)", () => {
  it("pages at most once per IP per 10 min, and caps distinct IPs per window", async () => {
    const { shouldAlertHashFailure } = await import("../src/routes/webhooks.js");
    const t0 = Date.parse("2030-01-01T00:00:00Z");
    expect(shouldAlertHashFailure("9.9.9.1", t0)).toBe(true);
    expect(shouldAlertHashFailure("9.9.9.1", t0 + 60_000)).toBe(false);
    for (let i = 2; i <= 5; i++) expect(shouldAlertHashFailure(`9.9.9.${i}`, t0 + 1000)).toBe(true);
    expect(shouldAlertHashFailure("9.9.9.6", t0 + 2000)).toBe(false);
    expect(shouldAlertHashFailure("9.9.9.1", t0 + 10 * 60_000 + 1)).toBe(true);
  });
});

describe("POST /webhooks/payu — processing error", () => {
  it("answers 500 and releases the dedupe key, so PayU's retry is processed (not skipped)", async () => {
    const fields = {
      status: "success",
      txnid: "SV0000000009-r1",
      amount: "3099.00",
      productinfo: "Order SV0000000009",
      firstname: "Asha",
      email: "asha@example.com",
      udf1: "SV0000000009",
      mihpayid: "payu_retry_9",
    };
    const body = { ...fields, hash: computePayuResponseHash(fields) };
    const broken = {
      select: () => ({
        from: () => ({ where: () => ({ limit: async () => { throw new Error("db down"); } }) }),
      }),
    } as unknown as DbClient;
    expect((await post(broken, body)).status).toBe(500);

    const counters: Counters = { updates: 0 };
    const order = { ...BASE_ORDER, id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", orderNumber: "SV0000000009" };
    const res = await post(makeDb(order, counters), body);
    expect(res.status).toBe(200);
    expect(counters.updates).toBe(1);
  });
});
