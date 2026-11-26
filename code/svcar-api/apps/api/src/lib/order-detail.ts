import { asc, eq } from "drizzle-orm";
import { OrderDetailSchema, OrderEventSchema, type OrderDetail, type OrderEvent } from "@svcar/contracts";
import type { DbClient } from "../db/client.js";
import { orderEvents, orderItems, orders } from "../db/schema.js";

/**
 * The customer-facing view of an order, shared by the signed-in order pages
 * (/me/orders) and guest checkout (/guest-checkout), so both show the same thing.
 */

type OrderWithItems = typeof orders.$inferSelect & { items: (typeof orderItems.$inferSelect)[] };

/** Full order detail as the storefront's order page reads it. */
export function toOrderDetail(order: OrderWithItems): OrderDetail {
  return OrderDetailSchema.parse({
    id: order.id,
    orderNumber: order.orderNumber,
    total: Number(order.total),
    status: order.status,
    itemCount: order.items.reduce((s, it) => s + it.qty, 0),
    createdAt: order.createdAt.toISOString(),
    subtotal: Number(order.subtotal),
    shippingFee: Number(order.shippingFee),
    gstAmount: Number(order.gstAmount),
    shippingAddress: order.shippingAddress,
    items: order.items.map((it) => ({
      productName: it.productName,
      skuCode: it.skuCode,
      variantLabel: it.variantLabel,
      imageUrl: it.imageUrl,
      unitPrice: Number(it.unitPrice),
      qty: it.qty,
      lineTotal: Number(it.lineTotal),
    })),
    razorpayPaymentId: order.razorpayPaymentId,
    paymentMethod: order.paymentMethod === "cod" ? "cod" : "prepaid",
    paymentStatus: order.paymentStatus === "partially_paid" ? "partially_paid" : order.paymentStatus === "paid" ? "paid" : "pending",
    advanceAmount: Number(order.advanceAmount),
    advancePaid: Number(order.advancePaid),
    remainingAmount: Number(order.remainingAmount),
    promoCode: order.promoCode ?? null,
    discount: Number(order.discount ?? 0),
  });
}

/** An order's tracking timeline, oldest first. */
export async function loadOrderEvents(db: DbClient, orderId: string): Promise<OrderEvent[]> {
  const events = await db
    .select({
      id: orderEvents.id,
      eventType: orderEvents.eventType,
      note: orderEvents.note,
      createdAt: orderEvents.createdAt,
    })
    .from(orderEvents)
    .where(eq(orderEvents.orderId, orderId))
    .orderBy(asc(orderEvents.createdAt));
  return events.map((e) =>
    OrderEventSchema.parse({
      id: e.id,
      eventType: e.eventType,
      note: e.note,
      createdAt: e.createdAt.toISOString(),
    }),
  );
}
