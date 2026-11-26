import type { OrderTotals } from "@svcar/contracts";

/**
 * Order-money rules — the single source of truth shared by the cart page, the
 * checkout summary, and the mock checkout handler so the number the customer
 * sees can never drift from what the "server" charges.
 *
 * Catalog prices are GST-INCLUSIVE (the storefront states "inclusive of all
 * taxes"). So GST is the tax already baked into the subtotal — surfaced for the
 * invoice breakdown, never added on top. `total = subtotal − discount + shippingFee`,
 * where `discount` is an applied promo code's (see lib/promo.ts), else 0.
 */
export const FREE_SHIPPING_THRESHOLD = 5000; // ₹ — fallback free-delivery threshold
export const FLAT_SHIPPING_FEE = 99; // ₹ — fallback flat fee below the threshold
export const GST_RATE = 0.18; // 18% GST, already inside the price (fallback)
/** Cash on Delivery: share of the total paid online to confirm; the rest on delivery. */
export const COD_ADVANCE_PERCENT = 15;

/**
 * Live pricing knobs from the admin Settings (via the public /settings API).
 * `gstRate` here is a PERCENTAGE (e.g. 18), matching the settings field. All
 * functions fall back to the constants above when settings aren't loaded yet.
 */
export interface PricingSettings {
  shippingFreeAbove: number;
  shippingFlatFee: number;
  gstRate: number; // percentage
}

function freeAbove(s?: PricingSettings) {
  return s?.shippingFreeAbove ?? FREE_SHIPPING_THRESHOLD;
}
function flatFee(s?: PricingSettings) {
  return s?.shippingFlatFee ?? FLAT_SHIPPING_FEE;
}
function gstFraction(s?: PricingSettings) {
  return s?.gstRate != null ? s.gstRate / 100 : GST_RATE;
}

export interface PricedLine {
  price: number;
  qty: number;
}

export function computeSubtotal(lines: PricedLine[]): number {
  return lines.reduce((sum, l) => sum + l.price * l.qty, 0);
}

export function shippingFeeFor(subtotal: number, s?: PricingSettings): number {
  return subtotal >= freeAbove(s) || subtotal === 0 ? 0 : flatFee(s);
}

/** Tax portion already contained in a GST-inclusive amount. */
export function gstIncludedIn(amount: number, s?: PricingSettings): number {
  const rate = gstFraction(s);
  return Math.round(amount - amount / (1 + rate));
}

/**
 * Full GST-inclusive breakdown for a set of priced lines. `discount` (₹) is the
 * promo discount the API confirmed for this cart; it comes off the subtotal
 * (never below 0), while delivery still keys off the pre-discount subtotal —
 * the same rule as the API's calculatePricing. Summed in paise so the total is
 * the exact figure the order charges.
 */
export function computeTotals(lines: PricedLine[], s?: PricingSettings, discount = 0): OrderTotals {
  const subtotal = computeSubtotal(lines);
  const shippingFee = shippingFeeFor(subtotal, s);
  const subtotalPaise = Math.round(subtotal * 100);
  const discountPaise = Math.min(Math.max(0, Math.round(discount * 100)), subtotalPaise);
  const net = (subtotalPaise - discountPaise) / 100;
  return {
    subtotal,
    discount: discountPaise / 100,
    shippingFee,
    gstIncluded: gstIncludedIn(net, s),
    total: (subtotalPaise - discountPaise + Math.round(shippingFee * 100)) / 100,
  };
}

/**
 * True when the admin flat fee is ₹0, i.e. delivery is free on every order and
 * the "free above ₹X" threshold means nothing. Only true once settings load.
 */
export function deliveryAlwaysFree(s?: Pick<PricingSettings, "shippingFlatFee"> | null): boolean {
  return s?.shippingFlatFee === 0;
}

/** Amount short of free shipping, or 0 once the threshold is met (or delivery is always free). */
export function amountToFreeShipping(subtotal: number, s?: PricingSettings): number {
  if (deliveryAlwaysFree(s)) return 0;
  return subtotal >= freeAbove(s) ? 0 : freeAbove(s) - subtotal;
}

/** COD amount paid online now, rounded in paise exactly as the API charges it. */
export function codAdvanceFor(total: number): number {
  return Math.round((Math.round(total * 100) * COD_ADVANCE_PERCENT) / 100) / 100;
}

/** What PayU charges for an order: the COD advance, or the full total when prepaid. */
export function onlinePaymentFor(total: number, paymentMethod?: "prepaid" | "cod"): number {
  return paymentMethod === "cod" ? codAdvanceFor(total) : total;
}
