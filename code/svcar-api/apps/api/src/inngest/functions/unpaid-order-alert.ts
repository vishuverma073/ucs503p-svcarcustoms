import { eq } from "drizzle-orm";
import type { InngestFunction } from "inngest";
import { inngest } from "../client.js";
import type { DbClient } from "../../db/client.js";
import { orders } from "../../db/schema.js";
import { buildUnpaidOrderPushPayload, sendToAdmins } from "../../lib/admin-push.js";

export const UNPAID_ALERT_DELAY = "15m";

/**
 * Unpaid-order nudge. placeOrder fires `order.created`; this waits 15 minutes
 * and, if the order is still pending and unpaid, sends the admins ONE push with
 * the customer's name, total, payment method and phone (plus a wa.me link) so
 * the owner can help them finish. One event per order (the event id is derived
 * from the order id) and one function run per event — no DB flag needed.
 */
export function makeUnpaidOrderAlert(db: DbClient): InngestFunction.Like {
  return inngest.createFunction(
    { id: "unpaid-order-alert", triggers: [{ event: "order.created" }] },
    async ({ event, step }) => {
      const orderId = event.data?.orderId as string | undefined;
      if (!orderId) return { skipped: "no-order-id" };

      await step.sleep("wait-for-payment", UNPAID_ALERT_DELAY);

      const order = await step.run("load-order", async () => {
        const row = await db.query.orders.findFirst({
          where: eq(orders.id, orderId),
          columns: {
            id: true,
            orderNumber: true,
            customerName: true,
            customerPhone: true,
            paymentMethod: true,
            total: true,
            status: true,
            paymentStatus: true,
          },
        });
        return row ?? null;
      });
      if (!order) return { skipped: "order-not-found", orderId };
      if (!isStillUnpaid(order)) return { skipped: "paid-or-closed", orderId, status: order.status };

      const summary = await step.run("send-unpaid-push", async () =>
        sendToAdmins(
          db,
          "order",
          buildUnpaidOrderPushPayload({
            id: order.id,
            orderNumber: order.orderNumber,
            customerName: order.customerName,
            customerPhone: order.customerPhone,
            paymentMethod: order.paymentMethod,
            total: Number(order.total),
          }),
        ),
      );
      return { orderId, sent: summary.sent, attempted: summary.attempted };
    },
  );
}

/** Still worth a nudge: never moved past pending and no payment recorded. */
export function isStillUnpaid(order: { status: string; paymentStatus: string }): boolean {
  return order.status === "pending" && order.paymentStatus !== "paid";
}
