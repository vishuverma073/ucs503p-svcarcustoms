/**
 * The price a product card shows, from the light list-item fields.
 *
 * A list item carries three numbers computed over its SKUs (API `toListItem`):
 * `minPrice` = the lowest selling price (sale price, else MRP), `maxBasePrice`
 * = the highest MRP, and `bestDiscount` = the largest per-SKU discount, rounded
 * to a whole percent. `skuCount` is optional (the public list omits it).
 *
 * The old card printed "From" whenever `minPrice < maxBasePrice`, which is true
 * of every discounted single-SKU product (the MRP is always above the sale
 * price), so 27/27 core cards claimed a price range that does not exist.
 *
 * "From" is now shown only when the numbers prove two different selling
 * prices. With one price (one SKU, or several SKUs at the same price) the
 * cheapest selling price is the highest MRP less the best discount:
 *   minPrice ≈ maxBasePrice × (1 − bestDiscount / 100)
 * give or take the half-percent lost to rounding. A `minPrice` clearly below
 * that means the highest-MRP SKU sells for more than the cheapest one, i.e. a
 * real range. Anything the data cannot settle shows the plain price.
 */

export interface ListPriceInput {
  /** Lowest selling price across SKUs (rupees). */
  minPrice: number;
  /** Highest MRP across SKUs (rupees). */
  maxBasePrice: number;
  /** Best per-SKU discount, whole percent (0 = none). */
  discount: number;
  /** Number of SKUs, when the endpoint sends it. */
  skuCount?: number;
}

export interface ListPrice {
  /** The price printed in bold. */
  price: number;
  /** True only when the product provably sells at more than one price. */
  isFrom: boolean;
  /** MRP to strike through: only when it is the MRP of `price` itself. */
  mrp: number | null;
  /** "17% off" for a single price, "Up to 17% off" for a range, else null. */
  discountLabel: string | null;
}

/** Rounding slack: half a percent of the MRP (discount rounding) + ₹1 (paise). */
function tolerance(maxBasePrice: number): number {
  return maxBasePrice * 0.005 + 1;
}

/** True when the list numbers can only come from two or more different selling prices. */
export function hasMultiplePrices({ minPrice, maxBasePrice, discount, skuCount }: ListPriceInput): boolean {
  if (skuCount !== undefined && skuCount <= 1) return false;
  if (!Number.isFinite(minPrice) || !Number.isFinite(maxBasePrice) || maxBasePrice <= 0) return false;
  const pct = Number.isFinite(discount) ? Math.min(Math.max(discount, 0), 100) : 0;
  const singlePriceFloor = maxBasePrice * (1 - pct / 100) - tolerance(maxBasePrice);
  return minPrice < singlePriceFloor;
}

export function listPrice(input: ListPriceInput): ListPrice {
  const { minPrice, maxBasePrice } = input;
  const discount = Number.isFinite(input.discount) ? Math.max(0, Math.round(input.discount)) : 0;

  if (hasMultiplePrices(input)) {
    // The highest MRP belongs to a dearer SKU, so striking it through next to
    // the lowest price would overstate the saving. Say how much at most.
    return {
      price: minPrice,
      isFrom: true,
      mrp: null,
      discountLabel: discount > 0 ? `Up to ${discount}% off` : null,
    };
  }

  const discounted = discount > 0 && maxBasePrice > minPrice;
  return {
    price: minPrice,
    isFrom: false,
    mrp: discounted ? maxBasePrice : null,
    discountLabel: discounted ? `${discount}% off` : null,
  };
}
