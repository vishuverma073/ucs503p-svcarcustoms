import { z } from "zod";
import { TimestampSchema } from "./common.js";

// ─── Promo codes ────────────────────────────────────────────

/**
 * A code as the shopper typed it: trimmed, inner spaces dropped, uppercased
 * ("diwali 10 " → "DIWALI10"). Codes are stored uppercase, so this is the
 * lookup key.
 */
export function normalizePromoCode(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

/** Letters, digits, dash and underscore; 3–32 characters once normalised. */
export const PromoCodeSchema = z
  .string()
  .max(64)
  .transform(normalizePromoCode)
  .pipe(z.string().regex(/^[A-Z0-9_-]{3,32}$/, "Codes are 3–32 letters or digits"));

/** Why a code was turned down. `min_subtotal` comes with `shortBy` (rupees). */
export const PromoRejectReasonSchema = z.enum([
  "invalid",
  "inactive",
  "not_started",
  "expired",
  "used_up",
  "min_subtotal",
]);
export type PromoRejectReason = z.infer<typeof PromoRejectReasonSchema>;

/**
 * POST /cart/apply-promo — public, no login. The cart travels as SKU ids and
 * quantities (like guest checkout); every price is re-read on the server.
 */
export const ApplyPromoRequestSchema = z.object({
  code: z.string().max(64),
  items: z
    .array(z.object({ skuId: z.number().int().positive(), qty: z.number().int().positive().max(99) }))
    .min(1)
    .max(50),
});
export type ApplyPromoRequest = z.infer<typeof ApplyPromoRequestSchema>;

/** Rupees throughout. `total` = subtotal − discount + shipping. */
export const ApplyPromoResponseSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    code: z.string(),
    percentOff: z.number().int(),
    discount: z.number(),
    subtotal: z.number(),
    total: z.number(),
    message: z.string(),
  }),
  z.object({
    ok: z.literal(false),
    code: z.string(),
    reason: PromoRejectReasonSchema,
    message: z.string(),
    subtotal: z.number(),
    /** Rupees still to add, for `min_subtotal`. */
    shortBy: z.number().optional(),
  }),
]);
export type ApplyPromoResponse = z.infer<typeof ApplyPromoResponseSchema>;

/** GET /promos/active — codes a shopper can use right now, for suggestion chips. */
export const ActivePromoSchema = z.object({
  code: z.string(),
  percentOff: z.number().int(),
  minSubtotal: z.number(),
  maxDiscount: z.number().nullable(),
  endsAt: TimestampSchema.nullable(),
});
export type ActivePromo = z.infer<typeof ActivePromoSchema>;

export const ActivePromoListSchema = z.object({ items: z.array(ActivePromoSchema) });
export type ActivePromoList = z.infer<typeof ActivePromoListSchema>;

/**
 * Body of the checkout order calls rejected over the promo code (HTTP 422):
 * the code expired / ran out / the cart dropped below its minimum between
 * applying it and paying. The order is NOT created at full price.
 */
export const PromoOrderErrorSchema = z.object({
  error: z.literal("promo_invalid"),
  reason: PromoRejectReasonSchema,
  message: z.string(),
});
export type PromoOrderError = z.infer<typeof PromoOrderErrorSchema>;

// ─── Admin ───────────────────────────────────────────────────

/** One row of GET /admin/promo-codes. Money in rupees. */
export const AdminPromoCodeSchema = z.object({
  id: z.number().int(),
  code: z.string(),
  percentOff: z.number().int(),
  minSubtotal: z.number(),
  maxDiscount: z.number().nullable(),
  startsAt: TimestampSchema.nullable(),
  endsAt: TimestampSchema.nullable(),
  active: z.boolean(),
  usageLimit: z.number().int().nullable(),
  usedCount: z.number().int(),
  createdAt: TimestampSchema,
});
export type AdminPromoCode = z.infer<typeof AdminPromoCodeSchema>;

export const AdminPromoCodeListSchema = z.object({ items: z.array(AdminPromoCodeSchema) });
export type AdminPromoCodeList = z.infer<typeof AdminPromoCodeListSchema>;

const PromoFieldsSchema = z.object({
  code: PromoCodeSchema,
  percentOff: z.number().int().min(1).max(90),
  minSubtotal: z.number().min(0).max(10_000_000).default(0),
  maxDiscount: z.number().positive().max(10_000_000).nullable().default(null),
  startsAt: z.string().datetime({ offset: true }).nullable().default(null),
  endsAt: z.string().datetime({ offset: true }).nullable().default(null),
  active: z.boolean().default(true),
  usageLimit: z.number().int().positive().nullable().default(null),
});

const windowOk = (d: { startsAt?: string | null; endsAt?: string | null }) =>
  !d.startsAt || !d.endsAt || new Date(d.startsAt).getTime() < new Date(d.endsAt).getTime();
const windowIssue = { message: "Ends must be after starts", path: ["endsAt"] };

/** POST /admin/promo-codes. */
export const AdminPromoCodeCreateSchema = PromoFieldsSchema.refine(windowOk, windowIssue);
export type AdminPromoCodeCreate = z.input<typeof AdminPromoCodeCreateSchema>;

/** PATCH /admin/promo-codes/:id — any subset; the code itself can't be renamed. */
export const AdminPromoCodePatchSchema = PromoFieldsSchema.omit({ code: true })
  .partial()
  .strict()
  .refine(windowOk, windowIssue);
export type AdminPromoCodePatch = z.input<typeof AdminPromoCodePatchSchema>;
