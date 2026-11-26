import { describe, expect, it } from "vitest";
import { shippingDetailsLd, shippingRateFor } from "./structured-data";
import { BRAND } from "./brand";

describe("shippingRateFor", () => {
  const settings = { shippingFlatFee: 150, shippingFreeAbove: 5000 };

  it("is free at or above the threshold and the flat fee below it", () => {
    expect(shippingRateFor(4999, settings)).toBe(150);
    expect(shippingRateFor(5000, settings)).toBe(0);
    expect(shippingRateFor(57999, settings)).toBe(0);
  });

  it("follows the admin setting, including a zero fee", () => {
    expect(shippingRateFor(999, { shippingFlatFee: 0, shippingFreeAbove: 5000 })).toBe(0);
  });

  it("is free when settings can't be read — the pages then print free delivery too", () => {
    expect(shippingRateFor(1, null)).toBe(0);
    expect(shippingRateFor(BRAND.commerce.shippingFreeAbove, undefined)).toBe(0);
  });

  it("puts the rate into the OfferShippingDetails node", () => {
    const ld = shippingDetailsLd(0) as { shippingRate: { value: number } };
    expect(ld.shippingRate.value).toBe(0);
  });
});
