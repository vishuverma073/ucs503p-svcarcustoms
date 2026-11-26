/**
 * Public payment callbacks (no auth — authenticated by the gateway's hash).
 *
 * PayU's hosted page POSTs the payment result here (the `surl`/`furl` we passed
 * at checkout). We verify the reverse hash, mark the order paid on success, and
 * 303-redirect the browser to the storefront confirmation page either way. This is
 * a browser navigation (not JSON), so the customer always lands somewhere sane.
 * The /webhooks/payu server-to-server callback is the durable backup path.
 */
import { Hono } from "hono";
import type { DbClient } from "../db/client.js";
import type { AppEnv } from "../lib/types.js";
import { isPayuPending, verifyPayuResponse } from "../lib/payu.js";
import { findOrderForPayuTxn, markOrderPaid } from "../lib/mark-paid.js";
import { log } from "../lib/logger.js";
import { alertSlack } from "../lib/alerts.js";
import { brand } from "../config/brand.js";
import { gatewayPaymentAmount } from "../lib/payment-amount.js";

function storefrontBase(): string {
  return brand.storefrontUrl;
}

/**
 * Where the customer lands after PayU. /order-confirmation is deliberately NOT
 * behind the login gate that /orders/:n sits behind: this is a fresh navigation
 * from a third-party site, so the page has to be able to say "your order is
 * placed" (and offer a Track button) before any session is restored.
 */
function confirmationUrl(orderNumber: string, status?: "failed" | "pending"): string {
  if (!orderNumber) return `${storefrontBase()}/orders`;
  const path = `/order-confirmation/${encodeURIComponent(orderNumber)}`;
  return `${storefrontBase()}${path}${status ? `?status=${status}` : ""}`;
}

export function makePaymentsRouter(db: DbClient) {
  const router = new Hono<AppEnv>();

  // POST /payments/payu/return — PayU posts the result (form-encoded) here.
  router.post("/payu/return", async (c) => {
    const form = await c.req.parseBody();
    const params: Record<string, string> = {};
    for (const [k, v] of Object.entries(form)) params[k] = typeof v === "string" ? v : String(v);

    const orderNumber = params.udf1 || params.txnid || "";
    const failureUrl = confirmationUrl(orderNumber, "failed");

    if (!verifyPayuResponse(params)) {
      log("warn", "payu_return_bad_hash", { txnid: params.txnid, request_id: c.get("requestId") });
      return c.redirect(failureUrl, 303);
    }

    const txnid = params.txnid;
    if (!txnid) return c.redirect(failureUrl, 303);

    const order = await findOrderForPayuTxn(db, params);
    if (!order) {
      log("warn", "payu_return_order_not_found", { txnid });
      return c.redirect(failureUrl, 303);
    }

    // Failure / cancellation: leave the order `pending` so the customer can retry.
    // PayU "pending" (common with UPI) can still settle to success — the webhook
    // or the reconcile cron marks it paid then — so that customer is told to
    // wait, not to retry: a second attempt could charge them twice.
    if (params.status !== "success") {
      const pending = isPayuPending(params);
      log("info", "payu_return_not_success", { txnid, status: params.status, unmappedstatus: params.unmappedstatus });
      return c.redirect(confirmationUrl(order.orderNumber, pending ? "pending" : "failed"), 303);
    }

    // Defense-in-depth amount check: the reverse hash already binds `amount`, but
    // verify the paid amount equals the gateway charge before crediting — the
    // mandated PayU backstop, and the only guard left if the salt ever leaks.
    const expectedAmount = gatewayPaymentAmount(
      Number(order.total),
      order.paymentMethod === "cod" ? "cod" : "prepaid",
    );
    if (Number(params.amount).toFixed(2) !== expectedAmount.toFixed(2)) {
      log("warn", "payu_return_amount_mismatch", {
        txnid,
        orderNumber: order.orderNumber,
        paid: params.amount,
        expected: expectedAmount,
      });
      return c.redirect(confirmationUrl(order.orderNumber, "failed"), 303);
    }

    // Idempotent: an already-paid order just redirects to success.
    if (await markOrderPaid(db, order, { mihpayid: params.mihpayid ?? null, advancePaid: expectedAmount })) {
      log("info", "payu_return_order_paid", { orderNumber: order.orderNumber });
    } else if (order.status === "cancelled") {
      // Charged for an order the stale-pending cron already cancelled. Same
      // alert as the webhook path, which may not be configured / may be lost.
      log("warn", "payu_return_paid_cancelled_order", { orderNumber: order.orderNumber, txnid });
      void alertSlack("critical", "Payment for a cancelled order", "PayU returned a successful payment for an order that was cancelled — refund it or restore the order.", { order: order.orderNumber, payu_txnid: txnid }, { throttleKey: `paid-cancelled:${order.orderNumber}` });
    }

    return c.redirect(confirmationUrl(order.orderNumber), 303);
  });

  return router;
}
