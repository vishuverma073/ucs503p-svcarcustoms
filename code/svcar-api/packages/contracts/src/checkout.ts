import { z } from "zod";

/** A shipping address, either supplied inline at checkout or from a saved one. */
export const ShippingAddressSchema = z.object({
  // Recipient details, snapshotted from the saved address so the order's
  // shipping address renders fully on the confirmation/history pages.
  fullName: z.string().max(60).optional(),
  phone: z.string().max(20).optional(),
  label: z.string().max(20).optional(),
  line1: z.string().min(1).max(120),
  line2: z.string().max(120).optional(),
  city: z.string().min(1).max(50),
  state: z.string().min(1).max(50),
  pincode: z.string().regex(/^\d{6}$/, "must be a 6-digit pincode"),
  landmark: z.string().max(100).optional(),
});
export type ShippingAddress = z.infer<typeof ShippingAddressSchema>;

/**
 * POST /checkout/order request. Must carry either a saved `addressId` or an
 * inline `address` (enforced by the refine below).
 */
export const CreateOrderRequestSchema = z
  .object({
    addressId: z.number().int().positive().optional(),
    address: ShippingAddressSchema.optional(),
    notes: z.string().max(500).optional(),
    paymentMethod: z.enum(["prepaid", "cod"]).default("prepaid"),
    /** Optional promo code; re-validated against the cart when the order is created. */
    promoCode: z.string().max(64).optional(),
  })
  .refine((d) => d.addressId !== undefined || d.address !== undefined, {
    message: "Provide either addressId or an inline address",
    path: ["address"],
  });
export type CreateOrderRequest = z.infer<typeof CreateOrderRequestSchema>;

/** PayU hosted-checkout handoff: the URL + hidden form fields the browser POSTs. */
export const PayuHandoffSchema = z.object({
  paymentUrl: z.string().url(),
  params: z.record(z.string(), z.string()),
});
export type PayuHandoff = z.infer<typeof PayuHandoffSchema>;

/**
 * POST /checkout/order response — the payment handoff for the active gateway.
 * `provider` discriminates: Razorpay populates `razorpayOrderId`/`razorpayKeyId`
 * (the frontend opens its modal); PayU populates `payu` (the frontend POSTs the
 * form to PayU's hosted page). `amount` (paise) + `currency` are always present.
 */
export const CreateOrderResponseSchema = z.object({
  orderId: z.string().uuid(),
  orderNumber: z.string(),
  provider: z.enum(["razorpay", "payu"]).default("razorpay"),
  razorpayOrderId: z.string().optional(),
  razorpayKeyId: z.string().optional(),
  payu: PayuHandoffSchema.optional(),
  amount: z.number(), // paise
  totalAmount: z.number(), // paise; authoritative full order value
  paymentMethod: z.enum(["prepaid", "cod"]),
  advanceAmount: z.number(), // paise charged by the gateway (15% for COD)
  remainingAmount: z.number(), // paise payable on delivery (0 for prepaid)
  /** Paise taken off by the promo code (0 without one). */
  discountAmount: z.number().default(0),
  promoCode: z.string().nullable().default(null),
  currency: z.literal("INR"),
});
export type CreateOrderResponse = z.infer<typeof CreateOrderResponseSchema>;

// ─── Guest checkout ──────────────────────────────────────────

/** A 10-digit Indian mobile (starts 6–9); the client strips any +91 / 0 prefix. */
export const IndianMobileSchema = z.string().regex(/^[6-9]\d{9}$/, "must be a 10-digit Indian mobile number");

/** Guest shipping address: the recipient's name and mobile are required. */
export const GuestShippingAddressSchema = ShippingAddressSchema.extend({
  fullName: z.string().trim().min(2).max(60),
  phone: IndianMobileSchema,
});
export type GuestShippingAddress = z.infer<typeof GuestShippingAddressSchema>;

/**
 * POST /guest-checkout/orders — place an order without an account. The cart
 * travels in the request (a guest has no server cart); only SKU ids and
 * quantities are taken from it, every price is re-read from the database.
 */
export const CreateGuestOrderRequestSchema = z.object({
  items: z
    .array(z.object({ skuId: z.number().int().positive(), qty: z.number().int().positive().max(99) }))
    .min(1)
    .max(50),
  email: z.string().trim().toLowerCase().email().max(254),
  address: GuestShippingAddressSchema,
  notes: z.string().max(500).optional(),
  paymentMethod: z.enum(["prepaid", "cod"]).default("prepaid"),
  /** Optional promo code; re-validated against the cart when the order is created. */
  promoCode: z.string().max(64).optional(),
});
export type CreateGuestOrderRequest = z.infer<typeof CreateGuestOrderRequestSchema>;

/** The payment handoff plus the token that unlocks this order for its buyer. */
export const CreateGuestOrderResponseSchema = CreateOrderResponseSchema.extend({
  guestToken: z.string().min(20),
});
export type CreateGuestOrderResponse = z.infer<typeof CreateGuestOrderResponseSchema>;

/**
 * Body of the guest pay/view calls: either the token returned when the order
 * was placed (same browser), or the email / mobile the order was placed with
 * (the "Track order" page, from any device).
 */
export const GuestOrderAccessSchema = z.union([
  z.object({ token: z.string().min(20).max(200) }),
  z.object({ contact: z.string().trim().min(5).max(254) }),
]);
export type GuestOrderAccess = z.infer<typeof GuestOrderAccessSchema>;

/** POST /checkout/verify request — the three fields Razorpay's modal returns. */
export const VerifyOrderRequestSchema = z.object({
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});
export type VerifyOrderRequest = z.infer<typeof VerifyOrderRequestSchema>;

export const VerifyOrderResponseSchema = z.object({
  ok: z.literal(true),
  orderNumber: z.string(),
});
export type VerifyOrderResponse = z.infer<typeof VerifyOrderResponseSchema>;
