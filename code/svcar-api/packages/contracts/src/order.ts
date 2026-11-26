import { z } from "zod";
import { UrlSchema } from "./common.js";
import { ShippingAddressSchema } from "./checkout.js";

/** Order lifecycle states. */
export const OrderStatusSchema = z.enum([
  "pending",
  "paid",
  "confirmed",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
]);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

/** A single line in an order (snapshot taken at checkout time). */
export const OrderLineSchema = z.object({
  productName: z.string(),
  skuCode: z.string(),
  variantLabel: z.string().nullable(),
  imageUrl: UrlSchema.nullable(),
  unitPrice: z.number(),
  qty: z.number().int().positive(),
  lineTotal: z.number(),
});
export type OrderLine = z.infer<typeof OrderLineSchema>;

/** Order summary for the list view (GET /me/orders). */
export const OrderListItemSchema = z.object({
  id: z.string().uuid(),
  orderNumber: z.string(),
  total: z.number(),
  status: OrderStatusSchema,
  itemCount: z.number().int().nonnegative(),
  /** First line-item's image, for the order-history thumbnail ("" if none). */
  firstItemImage: z.string().default(""),
  createdAt: z.string().datetime(),
});
export type OrderListItem = z.infer<typeof OrderListItemSchema>;

/** Full order detail (GET /me/orders/:orderNumber). */
export const OrderDetailSchema = OrderListItemSchema.extend({
  subtotal: z.number(),
  shippingFee: z.number(),
  gstAmount: z.number(),
  shippingAddress: ShippingAddressSchema,
  items: z.array(OrderLineSchema),
  razorpayPaymentId: z.string().nullable(),
  paymentMethod: z.enum(["prepaid", "cod"]),
  paymentStatus: z.enum(["pending", "paid", "partially_paid"]),
  advanceAmount: z.number(),
  advancePaid: z.number(),
  remainingAmount: z.number(),
  /** Promo code the order was placed with (null without one). */
  promoCode: z.string().nullable().default(null),
  /** Rupees the promo code took off the subtotal. total = subtotal − discount + shippingFee. */
  discount: z.number().default(0),
});
export type OrderDetail = z.infer<typeof OrderDetailSchema>;

/** Paginated order list response. */
export const OrderListResponseSchema = z.object({
  items: z.array(OrderListItemSchema),
  nextCursor: z.string().datetime().nullable(),
});
export type OrderListResponse = z.infer<typeof OrderListResponseSchema>;

// ─── Order timeline (Phase 6) ────────────────────────────────

/** Kinds of order timeline event. Superset of OrderStatus plus non-status ones. */
export const OrderEventTypeSchema = z.enum([
  "placed",
  "paid",
  "confirmed",
  "shipped",
  "out_for_delivery",
  "delivered",
  "cancelled",
  "refunded",
  "note",
]);
export type OrderEventType = z.infer<typeof OrderEventTypeSchema>;

export const OrderEventSchema = z.object({
  id: z.number(),
  eventType: OrderEventTypeSchema,
  note: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type OrderEvent = z.infer<typeof OrderEventSchema>;

export const OrderEventListResponseSchema = z.object({
  events: z.array(OrderEventSchema),
});
export type OrderEventListResponse = z.infer<typeof OrderEventListResponseSchema>;

/** POST /guest-checkout/orders/:orderNumber — a guest order with its timeline. */
export const GuestOrderViewSchema = z.object({
  order: OrderDetailSchema,
  events: z.array(OrderEventSchema),
});
export type GuestOrderView = z.infer<typeof GuestOrderViewSchema>;

/** Admin request to append a timeline event (POST /admin/orders/:id/events). */
export const AddOrderEventRequestSchema = z.object({
  eventType: OrderEventTypeSchema,
  note: z.string().max(500).optional(),
});
export type AddOrderEventRequest = z.infer<typeof AddOrderEventRequestSchema>;
