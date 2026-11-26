import { z } from "zod";
import { MoneySchema } from "./common";

/**
 * "Leads" = customers' current (not-yet-checked-out) carts, surfaced to the
 * admin so they can see demand and follow up. Only signed-in customers' carts
 * persist server-side; guest carts appear here only when guest-cart capture is
 * enabled (mocked for now).
 */

/** One line in a lead's cart. */
export const LeadItemSchema = z.object({
  productId: z.number().int(),
  productName: z.string(),
  slug: z.string().optional(),
  image: z.string().nullish().transform((v) => v ?? ""),
  /** Joined variant values, e.g. "Carbon Fibre / 52\"". Empty for no-variant items. */
  variantLabel: z.string().nullish().transform((v) => v ?? ""),
  qty: z.number().int().positive(),
  unitPrice: MoneySchema,
  lineTotal: MoneySchema,
  /** ISO timestamp the item was added — drives "kept X days". */
  addedAt: z.string(),
});
export type LeadItem = z.infer<typeof LeadItemSchema>;

/** A single customer cart. */
export const LeadSchema = z.object({
  id: z.string(),
  customerName: z.string().nullish().transform((v) => v ?? ""),
  customerEmail: z.string().nullish().transform((v) => v ?? ""),
  customerPhone: z.string().nullish().transform((v) => v ?? ""),
  /** True for an anonymous (not-logged-in) cart. */
  isGuest: z.boolean().default(false),
  itemCount: z.number().int().nonnegative(),
  total: MoneySchema,
  /** ISO timestamp of last cart activity — primary sort key (latest first). */
  updatedAt: z.string(),
  /** ISO timestamp of the earliest item still in the cart — drives "longest held". */
  oldestAddedAt: z.string(),
  items: z.array(LeadItemSchema),
});
export type Lead = z.infer<typeof LeadSchema>;

/** GET /admin/leads response: carts + aggregate totals for the dashboard stat. */
export const LeadListSchema = z.object({
  items: z.array(LeadSchema),
  total: z.number().int().nonnegative(),
  totalValue: MoneySchema,
});
export type LeadList = z.infer<typeof LeadListSchema>;

/**
 * A visitor active on the storefront right now, derived from the page-view
 * stream (`analytics_events`) rather than from carts — so signed-out visitors,
 * which are most real traffic, are included and the page they are on is known.
 *
 * Identity and cart contents are deliberately absent: the page-view stream
 * carries no user id, so a visitor cannot be tied to an account or a cart
 * without inventing the link. Carts live on the Leads page instead.
 */
export const LiveVisitorSchema = z.object({
  /** Stable per-browser visitor id (localStorage), not a person. */
  id: z.string(),
  sessionId: z.string(),
  /** Page the visitor is currently viewing, e.g. "/product/gt-wing-pro". */
  currentPath: z.string(),
  /** ISO timestamp of their first page view this visit — drives "on site for X". */
  startedAt: z.string(),
  /** ISO timestamp of their most recent page view. */
  lastSeen: z.string(),
  pageViews: z.number().int().nonnegative(),
  city: z.string().nullish().transform((v) => v ?? ""),
  deviceType: z.string().nullish().transform((v) => v ?? ""),
  channel: z.string().nullish().transform((v) => v ?? ""),
});
export type LiveVisitor = z.infer<typeof LiveVisitorSchema>;

/** GET /admin/live response. */
export const LiveListSchema = z.object({
  items: z.array(LiveVisitorSchema),
  onlineCount: z.number().int().nonnegative(),
});
export type LiveList = z.infer<typeof LiveListSchema>;
