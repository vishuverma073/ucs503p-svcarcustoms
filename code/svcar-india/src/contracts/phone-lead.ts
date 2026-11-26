import { z } from "zod";

/**
 * Phone leads — the storefront "Need help finding the right part?" popup
 * (POST /phone-leads) and the merged Admin → Phone leads list
 * (GET /admin/phone-leads). Mirrors svcar-api packages/contracts/src/phone-lead.ts.
 */

/** Public POST /phone-leads body. The client sends the bare 10-digit mobile. */
export const PhoneLeadRequestSchema = z.object({
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number"),
  pagePath: z.string().max(512).optional(),
  visitorId: z.string().max(64).optional(),
  consent: z.literal(true),
});
export type PhoneLeadRequest = z.infer<typeof PhoneLeadRequestSchema>;

/** Same answer whether the number is new or was already received today. */
export const PhoneLeadResponseSchema = z.object({ ok: z.literal(true) });
export type PhoneLeadResponse = z.infer<typeof PhoneLeadResponseSchema>;

export const PhoneLeadSourceSchema = z.enum(["popup", "order"]);
export type PhoneLeadSource = z.infer<typeof PhoneLeadSourceSchema>;

/** One number, with what came in through the popup and through orders. */
export const AdminPhoneLeadSchema = z.object({
  phone: z.string(),
  /** From the latest order with this number; popup leads carry no name. */
  name: z.string().nullish().transform((v) => v ?? ""),
  sources: z.array(PhoneLeadSourceSchema),
  lastActivityAt: z.string(),
  popup: z
    .object({
      count: z.number(),
      lastAt: z.string(),
      lastPagePath: z.string().nullish().transform((v) => v ?? ""),
    })
    .nullable(),
  order: z
    .object({
      count: z.number(),
      /** uuid — links to /admin/orders/[id]. */
      latestOrderId: z.string(),
      latestOrderNumber: z.string(),
      latestStatus: z.string(),
      latestPaymentStatus: z.string().nullish().transform((v) => v ?? ""),
      /** Rupees. */
      latestTotal: z.number(),
      latestAt: z.string(),
    })
    .nullable(),
});
export type AdminPhoneLead = z.infer<typeof AdminPhoneLeadSchema>;

/** GET /admin/phone-leads response. */
export const AdminPhoneLeadListSchema = z.object({
  items: z.array(AdminPhoneLeadSchema),
  totals: z.object({
    phones: z.number(),
    popupPhones: z.number(),
    orderPhones: z.number(),
    bothPhones: z.number(),
    popupSubmissions: z.number(),
    orders: z.number(),
  }),
  limit: z.number(),
  truncated: z.boolean(),
});
export type AdminPhoneLeadList = z.infer<typeof AdminPhoneLeadListSchema>;
