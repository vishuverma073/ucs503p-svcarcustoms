import { describe, expect, it } from "vitest";
import { evaluatePromo, promoDiscount, promoLiveCheck, rupees, type PromoRow } from "../src/lib/promo.js";
import { calculatePricing } from "../src/lib/pricing.js";
import { gatewayPaymentAmount } from "../src/lib/payment-amount.js";
import { normalizePromoCode, AdminPromoCodeCreateSchema, AdminPromoCodePatchSchema } from "@svcar/contracts";

const NOW = new Date("2026-10-27T12:00:00+05:30");

function promo(over: Partial<PromoRow> = {}): PromoRow {
  return {
    id: 1,
    code: "DIWALI10",
    percentOff: 10,
    minSubtotal: "7000.00",
    maxDiscount: null,
    startsAt: new Date("2026-10-20T00:00:00+05:30"),
    endsAt: new Date("2026-11-08T23:59:59+05:30"),
    active: true,
    usageLimit: null,
    usedCount: 0,
    createdAt: new Date("2026-10-20T00:00:00Z"),
    ...over,
  };
}

const FREE = { freeShippingThreshold: 0, flatShippingFee: 0, gstRate: 0.18 };

describe("promoDiscount", () => {
  it("takes percentOff of the subtotal", () => {
    expect(promoDiscount(7000, 10, null)).toBe(700);
    expect(promoDiscount(3000, 5, null)).toBe(150);
  });

  it("rounds to the nearest rupee, half up", () => {
    expect(promoDiscount(7499.5, 10, null)).toBe(750); // 749.95
    expect(promoDiscount(7004, 10, null)).toBe(700); // 700.40
    expect(promoDiscount(3010, 5, null)).toBe(151); // 150.50 → 151
    expect(promoDiscount(3009, 5, null)).toBe(150); // 150.45
  });

  it("caps at maxDiscount", () => {
    expect(promoDiscount(20000, 10, 1500)).toBe(1500);
    expect(promoDiscount(9000, 10, 1500)).toBe(900);
    expect(promoDiscount(20000, 10, 999.5)).toBe(999.5);
  });

  it("is never negative and never more than the subtotal", () => {
    expect(promoDiscount(0, 10, null)).toBe(0);
    expect(promoDiscount(5, 90, null)).toBe(5); // 4.5 → 5 rounds up to the whole subtotal, not past it
  });
});

describe("evaluatePromo", () => {
  it("applies an eligible code", () => {
    expect(evaluatePromo("DIWALI10", promo(), 8000, NOW)).toEqual({
      ok: true,
      code: "DIWALI10",
      percentOff: 10,
      discount: 800,
      message: "DIWALI10 applied — you save ₹800",
    });
  });

  it("applies at exactly the minimum", () => {
    expect(evaluatePromo("DIWALI10", promo(), 7000, NOW)).toMatchObject({ ok: true, discount: 700 });
  });

  it("says how much more to add below the minimum", () => {
    expect(evaluatePromo("DIWALI10", promo(), 5800, NOW)).toEqual({
      ok: false,
      code: "DIWALI10",
      reason: "min_subtotal",
      message: "Add ₹1,200 more to use DIWALI10",
      shortBy: 1200,
    });
    expect(evaluatePromo("DIWALI10", promo(), 6999.5, NOW)).toMatchObject({ shortBy: 0.5 });
  });

  it("refuses unknown, inactive, not-yet-started, expired and used-up codes", () => {
    expect(evaluatePromo("NOPE", null, 9000, NOW)).toMatchObject({ ok: false, reason: "invalid", message: "Invalid code" });
    // Switched-off and scheduled codes look exactly like unknown ones (no discovery).
    expect(evaluatePromo("DIWALI10", promo({ active: false }), 9000, NOW)).toEqual({
      ok: false,
      code: "DIWALI10",
      reason: "invalid",
      message: "Invalid code",
    });
    expect(
      evaluatePromo("DIWALI10", promo({ startsAt: new Date("2026-10-28T00:00:00Z") }), 9000, NOW),
    ).toEqual({ ok: false, code: "DIWALI10", reason: "invalid", message: "Invalid code" });
    expect(
      evaluatePromo("DIWALI10", promo(), 9000, new Date("2026-11-09T00:00:00+05:30")),
    ).toMatchObject({ reason: "expired", message: "Code expired" });
    expect(evaluatePromo("DIWALI10", promo({ usageLimit: 5, usedCount: 5 }), 9000, NOW)).toMatchObject({
      reason: "used_up",
    });
  });

  it("still applies on the last second of the window and with uses left", () => {
    expect(evaluatePromo("DIWALI10", promo(), 9000, new Date("2026-11-08T23:59:59+05:30")).ok).toBe(true);
    expect(evaluatePromo("DIWALI10", promo({ usageLimit: 5, usedCount: 4 }), 9000, NOW).ok).toBe(true);
  });

  it("treats open-ended windows as always on", () => {
    expect(promoLiveCheck(promo({ startsAt: null, endsAt: null }), NOW)).toBeNull();
  });

  it("applies maxDiscount", () => {
    expect(evaluatePromo("DIWALI10", promo({ maxDiscount: "500.00" }), 9000, NOW)).toMatchObject({ discount: 500 });
  });
});

describe("pricing with a promo discount", () => {
  it("total = subtotal − discount + shipping; GST is the part inside the net amount", () => {
    const r = calculatePricing([{ unitPrice: 4000, qty: 2 }], FREE, 800);
    expect(r).toMatchObject({ subtotal: 8000, discount: 800, shippingFee: 0, total: 7200 });
    expect(r.gstAmount).toBeCloseTo(7200 - 7200 / 1.18, 2);
  });

  it("keeps shipping on the pre-discount subtotal", () => {
    const r = calculatePricing([{ unitPrice: 5000, qty: 1 }], { freeShippingThreshold: 5000, flatShippingFee: 99, gstRate: 0.18 }, 250);
    expect(r).toMatchObject({ shippingFee: 0, total: 4750 });
  });

  it("never takes off more than the subtotal", () => {
    expect(calculatePricing([{ unitPrice: 100, qty: 1 }], FREE, 500)).toMatchObject({ discount: 100, total: 0 });
  });

  it("COD advance and the PayU charge come from the discounted total", () => {
    const r = calculatePricing([{ unitPrice: 7999, qty: 1 }], FREE, promoDiscount(7999, 10, null));
    expect(r.total).toBe(7199); // 7999 − 800
    expect(gatewayPaymentAmount(r.total, "prepaid")).toBe(7199);
    expect(gatewayPaymentAmount(r.total, "cod")).toBe(1079.85); // 15% of 7199
  });
});

describe("promo contracts", () => {
  it("normalises typed codes", () => {
    expect(normalizePromoCode(" diwali 10 ")).toBe("DIWALI10");
    expect(rupees(1200)).toBe("₹1,200");
  });

  it("admin create uppercases the code and checks the window", () => {
    expect(AdminPromoCodeCreateSchema.parse({ code: "diwali5", percentOff: 5 })).toMatchObject({
      code: "DIWALI5",
      minSubtotal: 0,
      maxDiscount: null,
      active: true,
      usageLimit: null,
    });
    expect(AdminPromoCodeCreateSchema.safeParse({ code: "X1", percentOff: 5 }).success).toBe(false);
    expect(AdminPromoCodeCreateSchema.safeParse({ code: "OK10", percentOff: 91 }).success).toBe(false);
    expect(
      AdminPromoCodeCreateSchema.safeParse({
        code: "OK10",
        percentOff: 10,
        startsAt: "2026-11-09T00:00:00+05:30",
        endsAt: "2026-11-01T00:00:00+05:30",
      }).success,
    ).toBe(false);
  });

  it("admin patch takes a subset and leaves the rest alone", () => {
    expect(AdminPromoCodePatchSchema.parse({ active: false })).toEqual({ active: false });
    expect(AdminPromoCodePatchSchema.safeParse({ code: "NEW" }).success).toBe(false);
  });
});
