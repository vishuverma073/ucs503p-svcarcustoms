import { describe, expect, it } from "vitest";
import {
  beginCheckoutPromo,
  bestPromoHint,
  bestEligiblePromo,
  promoCartKey,
  promoChipLabel,
  promoDiscount,
  promoHintText,
  promoShortfall,
} from "@/lib/promo";
import type { ActivePromo } from "@svcar/contracts";

const D10: ActivePromo = { code: "DIWALI10", percentOff: 10, minSubtotal: 7000, maxDiscount: null, endsAt: null };
const D5: ActivePromo = { code: "DIWALI5", percentOff: 5, minSubtotal: 3000, maxDiscount: null, endsAt: null };

describe("promoDiscount (mirrors the API)", () => {
  it("takes the percentage, rounded to the rupee half up", () => {
    expect(promoDiscount(7000, 10)).toBe(700);
    expect(promoDiscount(7499.5, 10)).toBe(750);
    expect(promoDiscount(3010, 5)).toBe(151);
    expect(promoDiscount(3009, 5)).toBe(150);
  });

  it("caps at maxDiscount and never exceeds the subtotal", () => {
    expect(promoDiscount(20000, 10, 1500)).toBe(1500);
    expect(promoDiscount(5, 90)).toBe(5);
    expect(promoDiscount(0, 10)).toBe(0);
  });
});

describe("eligibility helpers", () => {
  it("reports the shortfall to a code's minimum", () => {
    expect(promoShortfall(D10, 5800)).toBe(1200);
    expect(promoShortfall(D10, 7000)).toBe(0);
    expect(promoShortfall(D10, 6999.5)).toBe(0.5);
  });

  it("labels chips with the % and the minimum", () => {
    expect(promoChipLabel(D10)).toBe("DIWALI10 – 10% off above ₹7,000");
    expect(promoChipLabel({ ...D10, minSubtotal: 0 })).toBe("DIWALI10 – 10% off");
  });
});

describe("bestPromoHint (cart page)", () => {
  const promos = [D5, D10];

  it("nudges toward the cheapest step up", () => {
    const below = bestPromoHint(promos, 2000);
    expect(below).toEqual({ kind: "short", promo: D5, shortBy: 1000 });
    expect(promoHintText(below!)).toBe("Add ₹1,000 more for 5% off with DIWALI5");
  });

  it("past the 5% tier, points at the 10% one", () => {
    expect(promoHintText(bestPromoHint(promos, 5800)!)).toBe("Add ₹1,200 more for 10% off with DIWALI10");
  });

  it("once the best code applies, says to use it", () => {
    expect(promoHintText(bestPromoHint(promos, 9000)!)).toBe("Use DIWALI10 at checkout for 10% off");
  });

  it("nothing to say for an empty cart or no codes", () => {
    expect(bestPromoHint(promos, 0)).toBeNull();
    expect(bestPromoHint([], 9000)).toBeNull();
  });
});

describe("promoCartKey", () => {
  it("changes when a qty or price changes, not when lines reorder", () => {
    const a = promoCartKey([{ skuId: 1, qty: 1, price: 100 }, { skuId: 2, qty: 2, price: 50 }]);
    expect(promoCartKey([{ skuId: 2, qty: 2, price: 50 }, { skuId: 1, qty: 1, price: 100 }])).toBe(a);
    expect(promoCartKey([{ skuId: 1, qty: 2, price: 100 }, { skuId: 2, qty: 2, price: 50 }])).not.toBe(a);
    expect(promoCartKey([{ skuId: 1, qty: 1, price: 90 }, { skuId: 2, qty: 2, price: 50 }])).not.toBe(a);
  });
});

describe("beginCheckoutPromo (analytics)", () => {
  it("passes the coupon and its discount", () => {
    expect(beginCheckoutPromo({ code: "DIWALI10", percentOff: 10 }, [{ price: 4000, qty: 2 }])).toEqual({
      coupon: "DIWALI10",
      discount: 800,
    });
    expect(beginCheckoutPromo(null, [{ price: 4000, qty: 2 }])).toEqual({});
  });
});

describe("bestEligiblePromo", () => {
  const promos = [
    { code: "DIWALI5", percentOff: 5, minSubtotal: 3000 },
    { code: "DIWALI10", percentOff: 10, minSubtotal: 7000 },
  ] as unknown as Parameters<typeof bestEligiblePromo>[0];
  it("picks the highest % the cart qualifies for", () => {
    expect(bestEligiblePromo(promos, 2999)).toBeNull();
    expect(bestEligiblePromo(promos, 3000)?.code).toBe("DIWALI5");
    expect(bestEligiblePromo(promos, 7000)?.code).toBe("DIWALI10");
  });
});
