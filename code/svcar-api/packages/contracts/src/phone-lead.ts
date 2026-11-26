import { z } from "zod";
import { IndianMobileSchema } from "./checkout.js";
import { TimestampSchema } from "./common.js";

// ─── Phone leads (storefront popup) ─────────────────────────

/**
 * "+91 98765 43210", "098765-43210", "98765 43210" → "9876543210". Anything that
 * isn't one of those shapes is returned as bare digits, so IndianMobileSchema
 * still rejects it. Same rule as guest checkout's contact matching.
 */
export function toIndianMobile10(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return digits.length > 10 && /^(91|0)/.test(digits) ? digits.slice(-10) : digits;
}

/** A typed mobile, normalised to the bare 10 digits before it's validated. */
export const PhoneLeadPhoneSchema = z.string().max(32).transform(toIndianMobile10).pipe(IndianMobileSchema);

/**
 * POST /phone-leads — public, no login. `consent` must be literally true: the
 * popup only submits after the shopper agrees to be contacted.
 */
export const CreatePhoneLeadRequestSchema = z.object({
  phone: PhoneLeadPhoneSchema,
  pagePath: z.string().trim().max(512).nullish(),
  visitorId: z.string().trim().max(64).nullish(),
  consent: z.literal(true),
});
export type CreatePhoneLeadRequest = z.input<typeof CreatePhoneLeadRequestSchema>;

/** Same answer for a new number and for one already received in the last 24h. */
export const CreatePhoneLeadResponseSchema = z.object({ ok: z.literal(true) });
export type CreatePhoneLeadResponse = z.infer<typeof CreatePhoneLeadResponseSchema>;

export const PhoneLeadSourceSchema = z.enum(["popup", "order"]);
export type PhoneLeadSource = z.infer<typeof PhoneLeadSourceSchema>;

/** One row of GET /admin/phone-leads: everything known about one 10-digit number. */
export const AdminPhoneLeadSchema = z.object({
  phone: z.string(),
  /** Customer name on the latest order with this number (popup leads carry no name). */
  name: z.string().nullable(),
  sources: z.array(PhoneLeadSourceSchema),
  lastActivityAt: TimestampSchema,
  popup: z
    .object({
      count: z.number().int().nonnegative(),
      lastAt: TimestampSchema,
      lastPagePath: z.string().nullable(),
    })
    .nullable(),
  order: z
    .object({
      count: z.number().int().nonnegative(),
      /** uuid, for the Admin → Orders detail link. */
      latestOrderId: z.string(),
      latestOrderNumber: z.string(),
      latestStatus: z.string(),
      latestPaymentStatus: z.string().nullable(),
      /** Rupees. */
      latestTotal: z.number(),
      latestAt: TimestampSchema,
    })
    .nullable(),
});
export type AdminPhoneLead = z.infer<typeof AdminPhoneLeadSchema>;

export const AdminPhoneLeadListSchema = z.object({
  items: z.array(AdminPhoneLeadSchema),
  totals: z.object({
    /** Distinct numbers across both sources. */
    phones: z.number().int().nonnegative(),
    popupPhones: z.number().int().nonnegative(),
    orderPhones: z.number().int().nonnegative(),
    /** Numbers that came in through the popup AND placed an order. */
    bothPhones: z.number().int().nonnegative(),
    popupSubmissions: z.number().int().nonnegative(),
    orders: z.number().int().nonnegative(),
  }),
  /** Max rows returned; `truncated` is true when there were more. */
  limit: z.number().int().positive(),
  truncated: z.boolean(),
});
export type AdminPhoneLeadList = z.infer<typeof AdminPhoneLeadListSchema>;
