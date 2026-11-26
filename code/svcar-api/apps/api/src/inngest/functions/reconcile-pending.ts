import { and, asc, eq, isNull, lt, or } from "drizzle-orm";
import type { InngestFunction } from "inngest";
import { inngest } from "../client.js";
import type { DbClient } from "../../db/client.js";
import { orders } from "../../db/schema.js";
import { fetchRazorpayOrder } from "../../lib/razorpay.js";
import { verifyPayuPayments, type PayuTxnDetail } from "../../lib/payu.js";
import { emitOrderPaid } from "../../lib/events.js";
import { markOrderPaid } from "../../lib/mark-paid.js";
import { queueOrderPaidPush } from "../../lib/admin-push.js";
import { gatewayPaymentAmount } from "../../lib/payment-amount.js";
import { log } from "../../lib/logger.js";
import { alertSlack } from "../../lib/alerts.js";

const STALE_AFTER_MS = 30 * 60 * 1000; // reconcile pending orders older than 30 min
const ABANDON_AFTER_MS = 24 * 60 * 60 * 1000; // cancel still-unpaid orders after 24h

/** A stale pending order as the find step returns it (dates arrive as strings). */
export interface StaleOrder {
  id: string;
  orderNumber: string;
  razorpayOrderId: string | null;
  payuTxnId: string | null;
  paymentMethod: string;
  userId: string | null;
  total: string;
  createdAt: string | Date;
  /** Bumped when a Retry starts a new PayU attempt; absent in older callers. */
  updatedAt?: string | Date | null;
}

/** Gateway lookups, injectable so tests never reach Razorpay or PayU. */
export interface ReconcileDeps {
  fetchRazorpayOrder: typeof fetchRazorpayOrder;
  verifyPayuPayments: (txnids: string[]) => Promise<Record<string, PayuTxnDetail>>;
}

const defaultDeps: ReconcileDeps = { fetchRazorpayOrder, verifyPayuPayments };

/**
 * Stale-pending reconciliation (per agent-council review, 2026-05-28).
 *
 * Customers who close the tab after creating an order but before the
 * verify/webhook can leave rows stuck in `pending`. Every 15 minutes this asks
 * Razorpay for the truth: if the payment captured, mark paid (and fire
 * order.paid so the email still goes out); if it's been abandoned for 24h,
 * cancel it. In Razorpay stub mode this is a safe no-op (status reads "created").
 * PayU orders are checked with PayU's Verify Payment API before they're cancelled.
 */
export function makeReconcilePending(db: DbClient, deps: ReconcileDeps = defaultDeps): InngestFunction.Like {
  return inngest.createFunction(
    { id: "reconcile-stale-pending", triggers: [{ cron: "*/15 * * * *" }] },
    async ({ step }) => {
      const now = Date.now();
      const staleCutoff = new Date(now - STALE_AFTER_MS);
      // PayU orders are only acted on once abandoned (see reconcileStaleOrders),
      // so leave younger ones out of the batch instead of letting them use up slots.
      const abandonCutoff = new Date(now - ABANDON_AFTER_MS);

      const stale = await step.run("find-stale-pending", async () =>
        db
          .select({
            id: orders.id,
            orderNumber: orders.orderNumber,
            razorpayOrderId: orders.razorpayOrderId,
            payuTxnId: orders.payuTxnId,
            paymentMethod: orders.paymentMethod,
            userId: orders.userId,
            total: orders.total,
            createdAt: orders.createdAt,
            updatedAt: orders.updatedAt,
          })
          .from(orders)
          .where(
            and(
              eq(orders.status, "pending"),
              lt(orders.createdAt, staleCutoff),
              or(isNull(orders.payuTxnId), lt(orders.createdAt, abandonCutoff)),
            ),
          )
          .orderBy(asc(orders.createdAt))
          .limit(300),
      );

      return reconcileStaleOrders(db, stale, now, deps);
    },
  );
}

/** One reconciliation pass over the stale pending orders. */
export async function reconcileStaleOrders(
  db: DbClient,
  stale: StaleOrder[],
  now: number,
  deps: ReconcileDeps = defaultDeps,
) {
  const abandonCutoff = new Date(now - ABANDON_AFTER_MS);

  let reconciled = 0;
  let cancelled = 0;
  let skipped = 0;
  for (const o of stale) {
    const abandoned = new Date(o.createdAt).getTime() < abandonCutoff.getTime();
    if (o.payuTxnId) {
      if (!abandoned) continue;
      // A Retry in the last 30 min means the customer may be on PayU's page
      // right now with a txnid PayU doesn't know yet ("Not Found"): cancelling
      // would turn their payment into money for a cancelled order.
      if (o.updatedAt && new Date(o.updatedAt).getTime() > now - STALE_AFTER_MS) {
        skipped++;
        continue;
      }
      const outcome = await reconcileAbandonedPayuOrder(db, o, o.payuTxnId, deps);
      if (outcome === "paid") reconciled++;
      else if (outcome === "cancelled") cancelled++;
      else skipped++;
      continue;
    }

    const rzp = o.razorpayOrderId ? await deps.fetchRazorpayOrder(o.razorpayOrderId) : null;
    if (rzp?.status === "paid") {
      await db.update(orders).set({ status: "paid", updatedAt: new Date() }).where(eq(orders.id, o.id));
      await emitOrderPaid(o.id);
      queueOrderPaidPush(db, o.id);
      reconciled++;
    } else if (abandoned) {
      await db.update(orders).set({ status: "cancelled", updatedAt: new Date() }).where(eq(orders.id, o.id));
      cancelled++;
    }
  }

  return { scanned: stale.length, reconciled, cancelled, skipped };
}

/**
 * Ask PayU whether an abandoned order was paid after all (a lost callback and
 * webhook) before cancelling it. Every Pay click makes a fresh txnid and the row
 * keeps only the latest; the first attempt's txnid is the order number, so both
 * are checked. (A txnid from an in-between retry isn't stored anywhere — its
 * success still arrives through the webhook.) If PayU can't be asked, or a
 * payment is still pending there, the order is left for the next run.
 */
async function reconcileAbandonedPayuOrder(
  db: DbClient,
  o: StaleOrder,
  latestTxnId: string,
  deps: ReconcileDeps,
): Promise<"paid" | "cancelled" | "skipped"> {
  const txnids = [...new Set([o.orderNumber, latestTxnId])];
  let details: Record<string, PayuTxnDetail>;
  try {
    details = await deps.verifyPayuPayments(txnids);
  } catch (err) {
    log("warn", "reconcile_payu_verify_failed", { orderNumber: o.orderNumber, error: (err as Error).message });
    return "skipped";
  }
  const results: [txnid: string, detail: PayuTxnDetail][] = [];
  for (const t of txnids) {
    const detail = details[t];
    if (!detail) {
      log("warn", "reconcile_payu_verify_incomplete", { orderNumber: o.orderNumber, txnid: t });
      return "skipped";
    }
    results.push([t, detail]);
  }
  const hasStatus = (status: string) => ([, d]: [string, PayuTxnDetail]) => (d.status ?? "").toLowerCase() === status;

  const success = results.find(hasStatus("success"));
  if (success) {
    const [paidTxn, detail] = success;
    // Same amount backstop as the PayU return/webhook paths.
    const expectedAmount = gatewayPaymentAmount(Number(o.total), o.paymentMethod === "cod" ? "cod" : "prepaid");
    const paid = detail.amt ?? detail.transaction_amount;
    if (Number(paid).toFixed(2) !== expectedAmount.toFixed(2)) {
      log("warn", "reconcile_payu_amount_mismatch", {
        txnid: paidTxn,
        orderNumber: o.orderNumber,
        paid,
        expected: expectedAmount,
      });
      void alertSlack("critical", "PayU amount mismatch", "PayU verify_payment reports a paid amount that doesn't match the expected gateway charge — the order was left pending for review.", { order: o.orderNumber, payu_txnid: paidTxn });
      return "skipped";
    }
    if (!(await markOrderPaid(db, o, { mihpayid: detail.mihpayid ?? null, advancePaid: expectedAmount }))) {
      return "skipped"; // the webhook got there first
    }
    log("info", "reconcile_payu_order_paid", { orderNumber: o.orderNumber, txnid: paidTxn });
    return "paid";
  }

  if (results.some(hasStatus("pending"))) {
    log("info", "reconcile_payu_still_pending", { orderNumber: o.orderNumber });
    return "skipped";
  }

  await db
    .update(orders)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(orders.id, o.id), eq(orders.status, "pending")));
  return "cancelled";
}
