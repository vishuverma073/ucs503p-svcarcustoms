import { eq } from "drizzle-orm";
import {
  normalizePromoCode,
  type ActivePromo,
  type AdminPromoCode,
  type PromoRejectReason,
} from "@svcar/contracts";
import type { DbClient } from "../db/client.js";
import { promoCodes } from "../db/schema.js";

/**
 * Promo codes — the money rule and the eligibility rule, shared by
 * POST /cart/apply-promo (the preview), order creation (the charge) and
 * GET /promos/active (the suggestion chips), so the discount a shopper is shown
 * is exactly the one the order takes off.
 *
 * Mirrored in the storefront's lib/promo.ts (keep the two in step).
 */

export type PromoRow = typeof promoCodes.$inferSelect;

/** What a code a shopper typed looks like once normalised (see normalizePromoCode). */
const CODE_RE = /^[A-Z0-9_-]{3,32}$/;

/** "₹1,200" / "₹1,200.50" — the figure in a "Add ₹X more" message. */
export function rupees(n: number): string {
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

/**
 * The discount, in rupees: `percentOff` % of the subtotal rounded to the
 * nearest rupee (half up), capped at `maxDiscount` and never above the
 * subtotal. Integer paise throughout so the result is exact.
 */
export function promoDiscount(subtotal: number, percentOff: number, maxDiscount?: number | null): number {
  const subtotalPaise = Math.round(subtotal * 100);
  if (subtotalPaise <= 0 || percentOff <= 0) return 0;
  let paise = Math.round((subtotalPaise * percentOff) / 10000) * 100;
  if (maxDiscount != null) paise = Math.min(paise, Math.round(maxDiscount * 100));
  return Math.min(paise, subtotalPaise) / 100;
}

export type PromoEvaluation =
  | { ok: true; code: string; percentOff: number; discount: number; message: string }
  | { ok: false; code: string; reason: PromoRejectReason; message: string; shortBy?: number };

/** Usable right now, whatever the cart: active, inside its window, not used up. */
export function promoLiveCheck(
  promo: Pick<PromoRow, "active" | "startsAt" | "endsAt" | "usageLimit" | "usedCount">,
  now: Date = new Date(),
): { reason: PromoRejectReason; message: string } | null {
  if (!promo.active) return { reason: "inactive", message: "This code is no longer active" };
  if (promo.startsAt && now.getTime() < promo.startsAt.getTime()) {
    return { reason: "not_started", message: "This code isn’t active yet" };
  }
  if (promo.endsAt && now.getTime() > promo.endsAt.getTime()) return { reason: "expired", message: "Code expired" };
  if (promo.usageLimit != null && promo.usedCount >= promo.usageLimit) {
    return { reason: "used_up", message: "This code has reached its usage limit" };
  }
  return null;
}

/**
 * Can `promo` be used on an order whose pre-discount subtotal is `subtotal`?
 * `code` is what the shopper typed (normalised), echoed back on a miss.
 */
export function evaluatePromo(
  code: string,
  promo: PromoRow | null | undefined,
  subtotal: number,
  now: Date = new Date(),
): PromoEvaluation {
  if (!promo) return { ok: false, code, reason: "invalid", message: "Invalid code" };
  const notLive = promoLiveCheck(promo, now);
  // A switched-off or not-yet-started code answers exactly like an unknown one,
  // so this public check can't be used to discover scheduled / private codes.
  if (notLive && (notLive.reason === "inactive" || notLive.reason === "not_started")) {
    return { ok: false, code, reason: "invalid", message: "Invalid code" };
  }
  if (notLive) return { ok: false, code: promo.code, ...notLive };

  const minPaise = Math.round(Number(promo.minSubtotal) * 100);
  const subtotalPaise = Math.round(subtotal * 100);
  if (subtotalPaise < minPaise) {
    const shortBy = (minPaise - subtotalPaise) / 100;
    return {
      ok: false,
      code: promo.code,
      reason: "min_subtotal",
      message: `Add ${rupees(shortBy)} more to use ${promo.code}`,
      shortBy,
    };
  }

  const maxDiscount = promo.maxDiscount === null ? null : Number(promo.maxDiscount);
  const discount = promoDiscount(subtotal, promo.percentOff, maxDiscount);
  return {
    ok: true,
    code: promo.code,
    percentOff: promo.percentOff,
    discount,
    message: `${promo.code} applied — you save ${rupees(discount)}`,
  };
}

/** The row for a code as typed, or null (also for text that can't be a code). */
export async function findPromo(db: DbClient, raw: string): Promise<PromoRow | null> {
  const code = normalizePromoCode(raw);
  if (!CODE_RE.test(code)) return null;
  const [row] = await db.select().from(promoCodes).where(eq(promoCodes.code, code)).limit(1);
  return row ?? null;
}

/** The discount an order placed now gets, or why its code is refused. */
export type OrderPromoResult =
  | { ok: true; promo: { code: string; percentOff: number; discount: number } | null }
  | { ok: false; reason: PromoRejectReason; message: string };

/**
 * Re-validate the code an order is being placed with against the order's own
 * (server-priced) subtotal. No code → no discount. A code that no longer
 * applies is a refusal, never a silent full-price charge.
 */
export async function resolveOrderPromo(
  db: DbClient,
  raw: string | null | undefined,
  subtotal: number,
  now: Date = new Date(),
): Promise<OrderPromoResult> {
  const typed = raw ? normalizePromoCode(raw) : "";
  if (!typed) return { ok: true, promo: null };
  const result = evaluatePromo(typed, await findPromo(db, typed), subtotal, now);
  if (!result.ok) return { ok: false, reason: result.reason, message: result.message };
  return { ok: true, promo: { code: result.code, percentOff: result.percentOff, discount: result.discount } };
}

/** Body of a checkout call refused over its promo code (HTTP 422). */
export function promoOrderError(r: { reason: PromoRejectReason; message: string }) {
  return { error: "promo_invalid" as const, reason: r.reason, message: r.message };
}

/** Public shape for the storefront's suggestion chips. */
export function toActivePromo(row: PromoRow): ActivePromo {
  return {
    code: row.code,
    percentOff: row.percentOff,
    minSubtotal: Number(row.minSubtotal),
    maxDiscount: row.maxDiscount === null ? null : Number(row.maxDiscount),
    endsAt: row.endsAt ? row.endsAt.toISOString() : null,
  };
}

/** Admin list/detail shape. */
export function toAdminPromo(row: PromoRow): AdminPromoCode {
  return {
    id: row.id,
    code: row.code,
    percentOff: row.percentOff,
    minSubtotal: Number(row.minSubtotal),
    maxDiscount: row.maxDiscount === null ? null : Number(row.maxDiscount),
    startsAt: row.startsAt ? row.startsAt.toISOString() : null,
    endsAt: row.endsAt ? row.endsAt.toISOString() : null,
    active: row.active,
    usageLimit: row.usageLimit,
    usedCount: row.usedCount,
    createdAt: row.createdAt.toISOString(),
  };
}
