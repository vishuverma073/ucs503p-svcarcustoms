import { describe, expect, it, vi } from "vitest";

process.env.NODE_ENV = "test";

import { reconcileStaleOrders, type ReconcileDeps, type StaleOrder } from "../src/inngest/functions/reconcile-pending.js";
import type { PayuTxnDetail } from "../src/lib/payu.js";
import { settleIfPaidAtPayu } from "../src/lib/mark-paid.js";
import type { DbClient } from "../src/db/client.js";

const NOW = Date.parse("2026-10-19T12:00:00Z");
const ABANDONED = new Date(NOW - 25 * 60 * 60 * 1000).toISOString(); // past the 24h cutoff
const RECENT = new Date(NOW - 2 * 60 * 60 * 1000).toISOString(); // stale, not abandoned

const PAYU_ORDER: StaleOrder = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  orderNumber: "SV0000000001",
  razorpayOrderId: null,
  payuTxnId: "SV0000000001-r123", // latest retry; the first attempt was "SV0000000001"
  paymentMethod: "prepaid",
  userId: null,
  total: "3099.00",
  createdAt: ABANDONED,
};

/** Records every UPDATE ... SET payload; markOrderPaid's guarded update "wins". */
function makeDb() {
  const updates: Record<string, unknown>[] = [];
  const db = {
    update: () => ({
      set: (values: Record<string, unknown>) => {
        updates.push(values);
        return { where: () => Object.assign(Promise.resolve(), { returning: async () => [{ id: "x" }] }) };
      },
    }),
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
    insert: () => ({ values: async () => {} }),
  } as unknown as DbClient;
  return { db, updates };
}

function deps(details: Record<string, PayuTxnDetail> | Error): ReconcileDeps & {
  verifyPayuPayments: ReturnType<typeof vi.fn>;
  fetchRazorpayOrder: ReturnType<typeof vi.fn>;
} {
  return {
    verifyPayuPayments: vi.fn(async () => {
      if (details instanceof Error) throw details;
      return details;
    }),
    fetchRazorpayOrder: vi.fn(async () => null),
  };
}

describe("reconcile-stale-pending: PayU orders", () => {
  it("marks an abandoned order paid when PayU says its latest attempt succeeded", async () => {
    const { db, updates } = makeDb();
    const d = deps({
      SV0000000001: { status: "failure" },
      "SV0000000001-r123": { status: "success", amt: "3099.00", mihpayid: "mih_1" },
    });
    const res = await reconcileStaleOrders(db, [PAYU_ORDER], NOW, d);

    expect(d.verifyPayuPayments).toHaveBeenCalledWith(["SV0000000001", "SV0000000001-r123"]);
    expect(res).toMatchObject({ reconciled: 1, cancelled: 0 });
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ status: "paid", paymentStatus: "paid", payuPaymentId: "mih_1", advancePaid: "3099" });
  });

  it("finds a success on the first attempt's txnid (the order number) too", async () => {
    const { db, updates } = makeDb();
    const d = deps({
      SV0000000001: { status: "success", amt: "3099.00", mihpayid: "mih_0" },
      "SV0000000001-r123": { status: "Not Found", mihpayid: "Not Found" },
    });
    const res = await reconcileStaleOrders(db, [PAYU_ORDER], NOW, d);
    expect(res).toMatchObject({ reconciled: 1, cancelled: 0 });
    expect(updates[0]).toMatchObject({ status: "paid", payuPaymentId: "mih_0" });
  });

  it("checks a COD order against the 15% advance and records it partially paid", async () => {
    const { db, updates } = makeDb();
    const cod = { ...PAYU_ORDER, paymentMethod: "cod", payuTxnId: "SV0000000001" };
    const d = deps({ SV0000000001: { status: "success", amt: "464.85", mihpayid: "mih_c" } });
    const res = await reconcileStaleOrders(db, [cod], NOW, d);

    expect(d.verifyPayuPayments).toHaveBeenCalledWith(["SV0000000001"]); // no duplicate txnid
    expect(res).toMatchObject({ reconciled: 1, cancelled: 0 });
    expect(updates[0]).toMatchObject({ status: "paid", paymentStatus: "partially_paid", advancePaid: "464.85" });
  });

  it("cancels when PayU has no successful attempt", async () => {
    const { db, updates } = makeDb();
    const d = deps({
      SV0000000001: { status: "Not Found", mihpayid: "Not Found" },
      "SV0000000001-r123": { status: "failure", unmappedstatus: "userCancelled" },
    });
    const res = await reconcileStaleOrders(db, [PAYU_ORDER], NOW, d);
    expect(res).toMatchObject({ reconciled: 0, cancelled: 1 });
    expect(updates).toEqual([expect.objectContaining({ status: "cancelled" })]);
  });

  it("does NOT cancel when the verify call errors (left for the next run)", async () => {
    const { db, updates } = makeDb();
    const d = deps(new Error("PayU verify_payment failed: 503"));
    const res = await reconcileStaleOrders(db, [PAYU_ORDER], NOW, d);
    expect(res).toMatchObject({ reconciled: 0, cancelled: 0, skipped: 1 });
    expect(updates).toHaveLength(0);
  });

  it("does NOT cancel when PayU's answer leaves out one of the txnids", async () => {
    const { db, updates } = makeDb();
    const d = deps({ SV0000000001: { status: "failure" } });
    const res = await reconcileStaleOrders(db, [PAYU_ORDER], NOW, d);
    expect(res).toMatchObject({ cancelled: 0, skipped: 1 });
    expect(updates).toHaveLength(0);
  });

  it("does NOT cancel while a payment is still pending at PayU", async () => {
    const { db, updates } = makeDb();
    const d = deps({
      SV0000000001: { status: "failure" },
      "SV0000000001-r123": { status: "pending", unmappedstatus: "pending" },
    });
    const res = await reconcileStaleOrders(db, [PAYU_ORDER], NOW, d);
    expect(res).toMatchObject({ cancelled: 0, skipped: 1 });
    expect(updates).toHaveLength(0);
  });

  it("neither credits nor cancels when the paid amount doesn't match the gateway charge", async () => {
    const { db, updates } = makeDb();
    const d = deps({
      SV0000000001: { status: "failure" },
      "SV0000000001-r123": { status: "success", amt: "1.00", mihpayid: "mih_x" },
    });
    const res = await reconcileStaleOrders(db, [PAYU_ORDER], NOW, d);
    expect(res).toMatchObject({ reconciled: 0, cancelled: 0, skipped: 1 });
    expect(updates).toHaveLength(0);
  });

  it("leaves an abandoned order alone when a Retry started a PayU attempt in the last 30 min", async () => {
    const { db, updates } = makeDb();
    const d = deps({});
    const fresh = { ...PAYU_ORDER, updatedAt: new Date(NOW - 5 * 60 * 1000).toISOString() };
    const res = await reconcileStaleOrders(db, [fresh], NOW, d);
    expect(d.verifyPayuPayments).not.toHaveBeenCalled();
    expect(res).toMatchObject({ cancelled: 0, skipped: 1 });
    expect(updates).toHaveLength(0);
  });

  it("leaves a PayU order younger than 24h alone (no verify call)", async () => {
    const { db, updates } = makeDb();
    const d = deps({});
    const res = await reconcileStaleOrders(db, [{ ...PAYU_ORDER, createdAt: RECENT }], NOW, d);
    expect(d.verifyPayuPayments).not.toHaveBeenCalled();
    expect(res).toMatchObject({ scanned: 1, reconciled: 0, cancelled: 0, skipped: 0 });
    expect(updates).toHaveLength(0);
  });
});

describe("reconcile-stale-pending: Razorpay orders (unchanged)", () => {
  const RZP_ORDER: StaleOrder = { ...PAYU_ORDER, payuTxnId: null, razorpayOrderId: "order_rzp_1" };

  it("marks paid when Razorpay says paid, without asking PayU", async () => {
    const { db, updates } = makeDb();
    const d = deps({});
    d.fetchRazorpayOrder.mockResolvedValue({ id: "order_rzp_1", amount: 0, currency: "INR", receipt: "", status: "paid" });
    const res = await reconcileStaleOrders(db, [{ ...RZP_ORDER, createdAt: RECENT }], NOW, d);
    expect(d.verifyPayuPayments).not.toHaveBeenCalled();
    expect(res).toMatchObject({ reconciled: 1, cancelled: 0 });
    expect(updates[0]).toMatchObject({ status: "paid" });
  });

  it("cancels an abandoned order with no gateway order, without asking PayU", async () => {
    const { db, updates } = makeDb();
    const d = deps({});
    const res = await reconcileStaleOrders(db, [{ ...RZP_ORDER, razorpayOrderId: null }], NOW, d);
    expect(d.fetchRazorpayOrder).not.toHaveBeenCalled();
    expect(d.verifyPayuPayments).not.toHaveBeenCalled();
    expect(res).toMatchObject({ reconciled: 0, cancelled: 1 });
    expect(updates).toEqual([expect.objectContaining({ status: "cancelled" })]);
  });
});

describe("settleIfPaidAtPayu (before a Retry starts a new attempt)", () => {
  const ORDER = { ...PAYU_ORDER, total: "3099.00", userId: null };

  it("marks the order paid and reports true when an earlier attempt succeeded", async () => {
    const { db, updates } = makeDb();
    const verify = vi.fn(async () => ({
      SV0000000001: { status: "success", amt: "3099.00", mihpayid: "mih_9" },
      "SV0000000001-r123": { status: "Not Found" },
    }));
    expect(await settleIfPaidAtPayu(db, ORDER, verify)).toBe("paid");
    expect(verify).toHaveBeenCalledWith(["SV0000000001", "SV0000000001-r123"]);
    expect(updates[0]).toMatchObject({ status: "paid", payuPaymentId: "mih_9" });
  });

  it("returns null (retry goes ahead) on failure, amount mismatch or a verify error", async () => {
    const { db, updates } = makeDb();
    expect(await settleIfPaidAtPayu(db, ORDER, async () => ({ SV0000000001: { status: "failure" } }))).toBeNull();
    expect(
      await settleIfPaidAtPayu(db, ORDER, async () => ({ SV0000000001: { status: "success", amt: "1.00" } })),
    ).toBeNull();
    expect(
      await settleIfPaidAtPayu(db, ORDER, async () => {
        throw new Error("timeout");
      }),
    ).toBeNull();
    expect(updates).toHaveLength(0);
  });

  it("refuses the retry ('pending') while an earlier attempt is still settling at PayU", async () => {
    const { db, updates } = makeDb();
    expect(
      await settleIfPaidAtPayu(db, ORDER, async () => ({
        SV0000000001: { status: "pending", unmappedstatus: "pending" },
        "SV0000000001-r123": { status: "Not Found" },
      })),
    ).toBe("pending");
    expect(updates).toHaveLength(0);
  });

  it("does not call PayU for an order that never started a payment", async () => {
    const { db } = makeDb();
    const verify = vi.fn();
    expect(await settleIfPaidAtPayu(db, { ...ORDER, payuTxnId: null }, verify)).toBeNull();
    expect(verify).not.toHaveBeenCalled();
  });
});
