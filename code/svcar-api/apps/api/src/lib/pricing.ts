/**
 * Order pricing (Phase 4) — GST + shipping math.
 *
 * Deterministic and explained line by line (customers see this breakdown in the
 * order summary and confirmation email). All intermediate math is done in PAISE
 * (integers) to avoid floating-point drift, then converted back to rupees.
 */

export interface CartLine {
  unitPrice: number; // rupees
  qty: number;
}

export interface PricingResult {
  subtotal: number; // sum of unitPrice * qty (before any promo discount)
  discount: number; // promo discount taken off the subtotal (0 without a code)
  shippingFee: number; // flat fee below threshold, else 0
  gstRate: number; // e.g. 0.18
  gstAmount: number; // GST contained in (subtotal − discount); prices are GST-inclusive
  total: number; // subtotal − discount + shipping
}

/**
 * Standard GST rate for sanitaryware (HSN 7324 / 8481 / 3922). 18%.
 * [TODO confirm with Ketan / CA before go-live.] Kept as a single constant so
 * it's trivial to change (or later read from the `settings` row).
 */
export const GST_RATE = 0.18;

/** Flat shipping fee (₹) applied when the subtotal is below the free threshold. */
export const SHIPPING_FLAT_FEE = 99;

/** Order subtotals at or above this (₹) ship free. */
export const FREE_SHIPPING_THRESHOLD = 5000;

/** Round half-up to the nearest paise (Math.round rounds .5 toward +∞). */
function roundHalfUp(paise: number): number {
  return Math.round(paise);
}

/** Pricing knobs — sourced from the admin Settings (with these as fallbacks). */
export interface PricingConfig {
  freeShippingThreshold: number; // ₹ — subtotal at/above which shipping is free
  flatShippingFee: number; // ₹ — flat fee below the threshold
  gstRate: number; // fraction, e.g. 0.18
}

const DEFAULT_PRICING: PricingConfig = {
  freeShippingThreshold: FREE_SHIPPING_THRESHOLD,
  flatShippingFee: SHIPPING_FLAT_FEE,
  gstRate: GST_RATE,
};

/**
 * `discount` (₹, already worked out by lib/promo.ts) comes off the subtotal.
 * Shipping still keys off the pre-discount subtotal — the same subtotal the
 * shopper saw against the free-delivery threshold.
 */
export function calculatePricing(
  lines: CartLine[],
  config: PricingConfig = DEFAULT_PRICING,
  discount = 0,
): PricingResult {
  // Subtotal in paise. Round each unit price to paise before multiplying so a
  // price like 999.50 can't accumulate binary-float error across quantities.
  const subtotalPaise = lines.reduce((sum, l) => sum + Math.round(l.unitPrice * 100) * l.qty, 0);

  const shippingPaise =
    subtotalPaise === 0 || subtotalPaise >= config.freeShippingThreshold * 100
      ? 0
      : config.flatShippingFee * 100;

  // Never more than the subtotal: an order can't go negative.
  const discountPaise = Math.min(Math.max(0, Math.round(discount * 100)), subtotalPaise);
  const netPaise = subtotalPaise - discountPaise;

  // Catalog prices are GST-INCLUSIVE: the tax is already inside the subtotal, so
  // it's surfaced for the invoice breakdown but NEVER added on top. The portion
  // of the (discounted) amount that is GST = net − net / (1 + rate).
  const gstPaise = roundHalfUp(netPaise - netPaise / (1 + config.gstRate));
  const totalPaise = netPaise + shippingPaise; // gst already inside the net amount

  return {
    subtotal: subtotalPaise / 100,
    discount: discountPaise / 100,
    shippingFee: shippingPaise / 100,
    gstRate: config.gstRate,
    gstAmount: gstPaise / 100,
    total: totalPaise / 100,
  };
}
