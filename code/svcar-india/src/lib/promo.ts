import type { ActivePromo } from "@svcar/contracts";

/**
 * Promo-code helpers for the storefront: the discount rule (a mirror of the
 * API's lib/promo.ts — the API stays the authority and re-checks every code
 * when the order is created), the suggestion-chip copy and the cart hint.
 */

/** "₹7,000" / "₹1,200.50". */
export function rupees(n: number): string {
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

/**
 * `percentOff` % of the subtotal, rounded to the nearest rupee (half up),
 * capped at `maxDiscount`, never above the subtotal. Same integer-paise math as
 * the API so a preview matches the charge.
 */
export function promoDiscount(subtotal: number, percentOff: number, maxDiscount?: number | null): number {
  const subtotalPaise = Math.round(subtotal * 100);
  if (subtotalPaise <= 0 || percentOff <= 0) return 0;
  let paise = Math.round((subtotalPaise * percentOff) / 10000) * 100;
  if (maxDiscount != null) paise = Math.min(paise, Math.round(maxDiscount * 100));
  return Math.min(paise, subtotalPaise) / 100;
}

/** Rupees still to add before `promo` applies (0 once it does). */
export function promoShortfall(promo: Pick<ActivePromo, "minSubtotal">, subtotal: number): number {
  const gap = Math.round(promo.minSubtotal * 100) - Math.round(subtotal * 100);
  return gap > 0 ? gap / 100 : 0;
}

/** Chip label: "DIWALI10 – 10% off above ₹7,000" (or "10% off" with no minimum). */
export function promoChipLabel(promo: ActivePromo): string {
  const off = `${promo.percentOff}% off`;
  return promo.minSubtotal > 0 ? `${promo.code} – ${off} above ${rupees(promo.minSubtotal)}` : `${promo.code} – ${off}`;
}

/** The highest-% code the cart already qualifies for (ties: the lower minimum), else null. */
export function bestEligiblePromo(promos: ActivePromo[], subtotal: number): ActivePromo | null {
  if (subtotal <= 0) return null;
  return (
    promos
      .filter((p) => promoShortfall(p, subtotal) === 0)
      .sort((a, b) => b.percentOff - a.percentOff || a.minSubtotal - b.minSubtotal)[0] ?? null
  );
}

export type PromoHint =
  | { kind: "short"; promo: ActivePromo; shortBy: number }
  | { kind: "eligible"; promo: ActivePromo };

/**
 * The one offer worth mentioning for a cart of `subtotal`: the cheapest step up
 * to a bigger % than the cart already qualifies for ("Add ₹3,000 more for 10%
 * off"), else the best code it already qualifies for, else nothing.
 */
export function bestPromoHint(promos: ActivePromo[], subtotal: number): PromoHint | null {
  if (subtotal <= 0) return null;
  const eligible = promos
    .filter((p) => promoShortfall(p, subtotal) === 0)
    .sort((a, b) => b.percentOff - a.percentOff)[0];
  const step = promos
    .filter((p) => p.percentOff > (eligible?.percentOff ?? 0) && promoShortfall(p, subtotal) > 0)
    .sort((a, b) => a.minSubtotal - b.minSubtotal || b.percentOff - a.percentOff)[0];
  if (step) return { kind: "short", promo: step, shortBy: promoShortfall(step, subtotal) };
  return eligible ? { kind: "eligible", promo: eligible } : null;
}

/** "Add ₹1,200 more for 10% off with DIWALI10" / "Use DIWALI10 at checkout for 10% off". */
export function promoHintText(hint: PromoHint): string {
  return hint.kind === "short"
    ? `Add ${rupees(hint.shortBy)} more for ${hint.promo.percentOff}% off with ${hint.promo.code}`
    : `Use ${hint.promo.code} at checkout for ${hint.promo.percentOff}% off`;
}

/**
 * Stable key for "the cart changed" (SKU, qty and the price shown), so an
 * applied code is re-checked whenever any of them moves.
 */
export function promoCartKey(items: { skuId: number; qty: number; price: number }[]): string {
  return items
    .map((i) => `${i.skuId}x${i.qty}@${i.price}`)
    .sort()
    .join(",");
}

/**
 * begin_checkout's coupon + discount from the persisted code (fired on mount,
 * before the API re-confirms it — analytics only, never what's charged).
 */
export function beginCheckoutPromo(
  promo: { code: string; percentOff: number } | null,
  items: { price: number; qty: number }[],
): { coupon?: string; discount?: number } {
  if (!promo) return {};
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  return { coupon: promo.code, discount: promoDiscount(subtotal, promo.percentOff) };
}
