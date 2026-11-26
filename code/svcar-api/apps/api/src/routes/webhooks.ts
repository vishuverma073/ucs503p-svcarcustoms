import { Hono } from "hono";
import type { DbClient } from "../db/client.js";
import type { AppEnv } from "../lib/types.js";
// [Razorpay disabled — PayU-only project] The /webhooks/razorpay route below is
// turned off; only PayU's webhook is live. Re-enable by restoring this import
// and the route. import { verifyWebhookSignature } from "../lib/razorpay.js";
import { verifyPayuResponse } from "../lib/payu.js";
import { markProcessedOnce, releaseProcessed } from "../lib/idempotency.js";
import { log } from "../lib/logger.js";
import { alertSlack } from "../lib/alerts.js";
import { findOrderForPayuTxn, markOrderPaid } from "../lib/mark-paid.js";
import { gatewayPaymentAmount } from "../lib/payment-amount.js";
import { clientIp } from "../middleware/ip-rate-limit.js";

/**
 * Hash-failure alert limiter: at most one Slack page per source IP per 10 min,
 * and at most HASH_ALERT_MAX_IPS distinct IPs per window — a spoofer (or a bad
 * salt after a key rotation) can't flood #alerts. In-memory; per instance.
 */
const HASH_ALERT_WINDOW_MS = 10 * 60 * 1000;
const HASH_ALERT_MAX_IPS = 5;
const hashAlertLastByIp = new Map<string, number>();

export function shouldAlertHashFailure(ip: string, now = Date.now()): boolean {
  for (const [k, at] of hashAlertLastByIp) if (now - at >= HASH_ALERT_WINDOW_MS) hashAlertLastByIp.delete(k);
  if (hashAlertLastByIp.has(ip)) return false;
  if (hashAlertLastByIp.size >= HASH_ALERT_MAX_IPS) return false;
  hashAlertLastByIp.set(ip, now);
  return true;
}

export function makeWebhooksRouter(db: DbClient) {
  const router = new Hono<AppEnv>();

  // [Razorpay disabled — PayU-only project] The GET /webhooks/razorpay-health
  // and POST /webhooks/razorpay routes are intentionally removed. Only PayU's
  // webhook is live below. Registering a Razorpay webhook is not required for
  // this project. (See git history to restore the Razorpay webhook handler.)

  // POST /webhooks/payu — PayU's server-to-server callback (form-encoded), the
  // durable backup to the browser /payments/payu/return path. Authenticated by
  // the reverse hash; idempotent (an already-paid order is a no-op).
  router.post("/payu", async (c) => {
    const form = await c.req.parseBody();
    const params: Record<string, string> = {};
    for (const [k, v] of Object.entries(form)) params[k] = typeof v === "string" ? v : String(v);

    if (!verifyPayuResponse(params)) {
      const ip = clientIp(c);
      log("warn", "payu_webhook_bad_hash", { txnid: params.txnid, ip, request_id: c.get("requestId") });
      if (shouldAlertHashFailure(ip)) {
        void alertSlack("critical", "PayU webhook hash failure", "A PayU webhook arrived with an invalid hash — possible misconfiguration or spoofing.", { ip }, { throttleKey: `payu-hash-fail:${ip}`, throttleSeconds: HASH_ALERT_WINDOW_MS / 1000 });
      }
      return c.json({ error: "Invalid hash" }, 401);
    }

    const txnid = params.txnid ?? "";
    const eventId = `${txnid}:${params.mihpayid ?? ""}:${params.status ?? ""}`;
    const dedupeKey = `payu:webhook:${eventId}`;
    if (!(await markProcessedOnce(dedupeKey))) {
      log("info", "payu_webhook_duplicate", { txnid });
      return c.json({ ok: true }, 200);
    }

    try {
      if (params.status === "success" && txnid) {
        const order = await findOrderForPayuTxn(db, params);
        if (!order) {
          log("warn", "payu_webhook_order_not_found", { txnid });
        } else {
          const expectedAmount = gatewayPaymentAmount(
            Number(order.total),
            order.paymentMethod === "cod" ? "cod" : "prepaid",
          );
          if (Number(params.amount).toFixed(2) !== expectedAmount.toFixed(2)) {
            // Defense-in-depth: don't credit an order whose paid amount doesn't
            // match the intended gateway charge, even with a valid hash.
            log("warn", "payu_webhook_amount_mismatch", {
              txnid,
              orderNumber: order.orderNumber,
              paid: params.amount,
              expected: expectedAmount,
            });
            void alertSlack("critical", "PayU amount mismatch", "A PayU webhook's paid amount did not match the expected gateway charge — possible tampering.", { payu_txnid: txnid });
          } else if (await markOrderPaid(db, order, { mihpayid: params.mihpayid ?? null, advancePaid: expectedAmount })) {
            log("info", "payu_webhook_order_paid", { orderNumber: order.orderNumber });
          } else if (order.status === "cancelled") {
            // Money arrived for an order the stale-pending cron already cancelled.
            void alertSlack("critical", "Payment for a cancelled order", "PayU confirmed payment for an order that was cancelled — refund it or restore the order.", { order: order.orderNumber, payu_txnid: txnid }, { throttleKey: `paid-cancelled:${order.orderNumber}` });
          }
        }
      } else if (params.status && params.status !== "success") {
        // An ordinary declined / abandoned / still-pending payment: customers
        // retry these all the time, so it is logged, not paged.
        log("info", "payu_webhook_payment_not_success", {
          txnid,
          status: params.status,
          unmappedstatus: params.unmappedstatus,
        });
      }
    } catch (err) {
      // e.g. a DB blip inside markOrderPaid. Release the dedupe key and answer
      // 500 so PayU's retry is processed — swallowing it (200) used to leave a
      // paid order pending until the 24h reconcile.
      log("error", "payu_webhook_processing_error", { txnid, error: (err as Error).message });
      await releaseProcessed(dedupeKey).catch(() => {});
      return c.json({ error: "Processing failed" }, 500);
    }

    return c.json({ ok: true }, 200);
  });

  return router;
}
