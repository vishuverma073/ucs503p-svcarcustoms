import { inngest } from "../inngest/client.js";

/**
 * Fire the `order.paid` event, which drives the confirmation email (and future
 * async work). Best-effort: it never throws into the request path, and is
 * skipped under NODE_ENV=test so the suite doesn't reach Inngest's network.
 */
export async function emitOrderPaid(orderId: string): Promise<void> {
  if (process.env.NODE_ENV === "test") return;
  try {
    await inngest.send({ name: "order.paid", data: { orderId } });
  } catch (err) {
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "error",
        msg: "inngest_send_failed",
        event: "order.paid",
        orderId,
        error: (err as Error).message,
      }),
    );
  }
}

/**
 * Fire the `order.created` event right after a pending order is stored. It
 * drives the 15-minute "still unpaid" admin alert. The event id is derived from
 * the order so a duplicate send can't start a second alert. Best-effort, and
 * skipped under NODE_ENV=test like emitOrderPaid.
 */
export async function emitOrderCreated(orderId: string): Promise<void> {
  if (process.env.NODE_ENV === "test") return;
  try {
    await inngest.send({ id: `order.created:${orderId}`, name: "order.created", data: { orderId } });
  } catch (err) {
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "error",
        msg: "inngest_send_failed",
        event: "order.created",
        orderId,
        error: (err as Error).message,
      }),
    );
  }
}
