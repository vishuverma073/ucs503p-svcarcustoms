import { and, eq, sql } from "drizzle-orm";
import type { DbClient } from "../db/client.js";
import { cartItems, carts, orders, promoCodes } from "../db/schema.js";
import { emitOrderPaid } from "./events.js";
import { queueOrderPaidPush } from "./admin-push.js";
import { logOrderEvent } from "./order-events.js";
import { log } from "./logger.js";
import { isPayuPending, verifyPayuPayments, type PayuTxnDetail } from "./payu.js";
import { gatewayPaymentAmount } from "./payment-amount.js";

type OrderRow = typeof orders.$inferSelect;

/**
 * The order a PayU callback is about, from its hash-verified fields.
 *
 * Looked up by order number (udf1), not by `orders.payu_txn_id`: every retry
 * overwrites that column with a fresh txnid, so a success arriving late for an
 * EARLIER attempt used to find no order — the customer was charged and the
 * order sat pending until the cron cancelled it. The txnid must still belong to
 * the order: the first attempt uses the order number, retries add `-r<n>`.
 */
export async function findOrderForPayuTxn(
  db: DbClient,
  params: Record<string, string>,
): Promise<OrderRow | null> {
  const txnid = params.txnid ?? "";
  const orderNumber = params.udf1 || txnid.replace(/-r\d+$/, "");
  if (!orderNumber || !txnid) return null;
  if (txnid !== orderNumber && !txnid.startsWith(`${orderNumber}-r`)) return null;
  const [order] = await db.select().from(orders).where(eq(orders.orderNumber, orderNumber)).limit(1);
  return order ?? null;
}

/**
 * Move a pending order to paid exactly once.
 *
 * The browser return and the server webhook can arrive together; the
 * `status = 'pending'` guard on the UPDATE means only one of them wins, so the
 * confirmation email/SMS and the admin phone alert go out once. Returns false
 * when the order was already past pending.
 */
export async function markOrderPaid(
  db: DbClient,
  order: Pick<OrderRow, "id" | "paymentMethod" | "userId">,
  payment: { mihpayid: string | null; advancePaid: number },
): Promise<boolean> {
  const [won] = await db
    .update(orders)
    .set({
      payuPaymentId: payment.mihpayid,
      status: "paid",
      paymentStatus: order.paymentMethod === "cod" ? "partially_paid" : "paid",
      advancePaid: String(payment.advancePaid),
      updatedAt: new Date(),
    })
    .where(and(eq(orders.id, order.id), eq(orders.status, "pending")))
    .returning({ id: orders.id, promoCode: orders.promoCode });
  if (!won) return false;

  // Count the promo use here, on the single pending→paid transition: a PayU
  // retry, a duplicate webhook or the browser return racing the webhook can't
  // count it twice, and abandoned (never paid) orders don't use the code up.
  // One atomic `used_count + 1`. Best-effort: the payment is already recorded,
  // so a failed counter update is logged, not thrown.
  if (won.promoCode) {
    try {
      await db
        .update(promoCodes)
        .set({ usedCount: sql`${promoCodes.usedCount} + 1` })
        .where(eq(promoCodes.code, won.promoCode));
    } catch (err) {
      log("error", "promo.used_count_failed", {
        order_id: order.id,
        promo_code: won.promoCode,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Phone alert for the admins. Fire-and-forget: returns at once, never throws,
  // and only this single winner of the pending→paid race gets here, so the
  // PayU return + webhook pair can't send it twice.
  queueOrderPaidPush(db, order.id);

  // Stock is deliberately NOT decremented here yet: the catalogue imports set a
  // placeholder stock of 25 on every SKU, so decrementing would mark popular
  // items sold out after 25 orders. Add it once real stock counts are entered.

  if (order.userId) {
    const [cart] = await db.select({ id: carts.id }).from(carts).where(eq(carts.userId, order.userId)).limit(1);
    if (cart) await db.delete(cartItems).where(eq(cartItems.cartId, cart.id));
  }

  await logOrderEvent(db, { orderId: order.id, eventType: "paid" });
  await emitOrderPaid(order.id);
  return true;
}

/**
 * Before a retry starts a NEW PayU attempt, ask PayU whether an earlier one
 * (the first attempt = order number, or the latest retry) already succeeded —
 * a lost return + webhook leaves the order `pending` although the customer was
 * charged, and a retry would charge them twice. On a success with the expected
 * amount the order is marked paid here and "paid" is returned; an attempt PayU
 * still reports as pending (UPI settling) returns "pending" — it can still
 * succeed, so a second charge must not start. Either way the caller refuses the
 * retry. Fails OPEN (null): if PayU can't be asked, the retry goes ahead.
 */
export async function settleIfPaidAtPayu(
  db: DbClient,
  order: Pick<OrderRow, "id" | "orderNumber" | "payuTxnId" | "paymentMethod" | "userId" | "total">,
  verify: (txnids: string[]) => Promise<Record<string, PayuTxnDetail>> = verifyPayuPayments,
): Promise<"paid" | "pending" | null> {
  if (!order.payuTxnId) return null;
  const txnids = [...new Set([order.orderNumber, order.payuTxnId])];
  let details: Record<string, PayuTxnDetail>;
  try {
    details = await verify(txnids);
  } catch (err) {
    log("warn", "repay_payu_verify_failed", { orderNumber: order.orderNumber, error: (err as Error).message });
    return null;
  }
  const expected = gatewayPaymentAmount(Number(order.total), order.paymentMethod === "cod" ? "cod" : "prepaid");
  let pending = false;
  for (const t of txnids) {
    const d = details?.[t];
    if (!d) continue;
    const status = (d.status ?? "").toLowerCase();
    if (status !== "success") {
      if (isPayuPending({ status, unmappedstatus: d.unmappedstatus ?? "" })) pending = true;
      continue;
    }
    const paid = d.amt ?? d.transaction_amount;
    if (Number(paid).toFixed(2) !== expected.toFixed(2)) {
      log("warn", "repay_payu_amount_mismatch", { orderNumber: order.orderNumber, txnid: t, paid, expected });
      continue;
    }
    await markOrderPaid(db, order, { mihpayid: d.mihpayid ?? null, advancePaid: expected });
    log("info", "repay_found_paid_at_payu", { orderNumber: order.orderNumber, txnid: t });
    return "paid";
  }
  if (pending) {
    log("info", "repay_blocked_payu_pending", { orderNumber: order.orderNumber });
    return "pending";
  }
  return null;
}
