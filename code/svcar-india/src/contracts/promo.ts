import { z } from "zod";

/**
 * Promo codes — checkout "Apply" (POST /cart/apply-promo), the suggestion chips
 * (GET /promos/active) and Admin → Promo codes (/admin/promo-codes). Money in
 * rupees. Mirrors svcar-api packages/contracts/src/promo.ts.
 */

/** "diwali 10 " → "DIWALI10" (codes are stored uppercase). */
export function normalizePromoCode(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

export const PromoRejectReasonSchema = z.enum([
  "invalid",
  "inactive",
  "not_started",
  "expired",
  "used_up",
  "min_subtotal",
]);
export type PromoRejectReason = z.infer<typeof PromoRejectReasonSchema>;

/** The cart travels as SKU ids + quantities; the API prices it. */
export const ApplyPromoRequestSchema = z.object({
  code: z.string().max(64),
  items: z.array(z.object({ skuId: z.number().int().positive(), qty: z.number().int().positive().max(99) })).min(1).max(50),
});
export type ApplyPromoRequest = z.infer<typeof ApplyPromoRequestSchema>;

export const ApplyPromoResponseSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    code: z.string(),
    percentOff: z.number(),
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
    shortBy: z.number().optional(),
  }),
]);
export type ApplyPromoResponse = z.infer<typeof ApplyPromoResponseSchema>;

export const ActivePromoSchema = z.object({
  code: z.string(),
  percentOff: z.number(),
  minSubtotal: z.number(),
  maxDiscount: z.number().nullable(),
  endsAt: z.string().nullable(),
});
export type ActivePromo = z.infer<typeof ActivePromoSchema>;

export const ActivePromoListSchema = z.object({ items: z.array(ActivePromoSchema) });
export type ActivePromoList = z.infer<typeof ActivePromoListSchema>;

// ── Admin ──

export const AdminPromoCodeSchema = z.object({
  id: z.number(),
  code: z.string(),
  percentOff: z.number(),
  minSubtotal: z.number(),
  maxDiscount: z.number().nullable(),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  active: z.boolean(),
  usageLimit: z.number().nullable(),
  usedCount: z.number(),
  createdAt: z.string(),
});
export type AdminPromoCode = z.infer<typeof AdminPromoCodeSchema>;

export const AdminPromoCodeListSchema = z.object({ items: z.array(AdminPromoCodeSchema) });
export type AdminPromoCodeList = z.infer<typeof AdminPromoCodeListSchema>;

/** POST /admin/promo-codes body (the API uppercases the code). Dates are ISO with offset. */
export interface AdminPromoCodeCreate {
  code: string;
  percentOff: number;
  minSubtotal?: number;
  maxDiscount?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
  active?: boolean;
  usageLimit?: number | null;
}

/** PATCH /admin/promo-codes/:id — any subset; the code itself can't change. */
export type AdminPromoCodePatch = Partial<Omit<AdminPromoCodeCreate, "code">>;
