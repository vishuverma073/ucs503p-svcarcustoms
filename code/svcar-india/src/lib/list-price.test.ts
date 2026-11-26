import { describe, it, expect } from "vitest";
import { hasMultiplePrices, listPrice } from "./list-price";

/**
 * List-item numbers as svcar-api `toListItem` computes them from SKUs:
 * minPrice = min(salePrice ?? price), maxBasePrice = max(price),
 * bestDiscount = max(round((1 - salePrice / price) * 100)).
 */
function fromSkus(skus: { price: number; salePrice: number | null }[], withCount = false) {
  const effective = skus.map((s) => s.salePrice ?? s.price);
  let discount = 0;
  for (const s of skus) {
    if (s.salePrice !== null && s.price > 0) {
      discount = Math.max(discount, Math.round((1 - s.salePrice / s.price) * 100));
    }
  }
  return {
    minPrice: Math.min(...effective),
    maxBasePrice: Math.max(...skus.map((s) => s.price)),
    discount,
    ...(withCount ? { skuCount: skus.length } : {}),
  };
}

describe("listPrice", () => {
  it("1 SKU with a discount: plain price, MRP struck, % off — no 'From' (live Virtus/Slavia shape)", () => {
    // e.g. ₹14,999 against ₹17,999 MRP; the public list sends no skuCount.
    const p = listPrice(fromSkus([{ price: 17999, salePrice: 14999 }]));
    expect(p).toEqual({ price: 14999, isFrom: false, mrp: 17999, discountLabel: "17% off" });
  });

  it("1 SKU without a discount: plain price, nothing struck", () => {
    expect(listPrice(fromSkus([{ price: 2499, salePrice: null }]))).toEqual({
      price: 2499,
      isFrom: false,
      mrp: null,
      discountLabel: null,
    });
  });

  it("several SKUs at an identical sale price: no 'From'", () => {
    // The live Colour-variant products: same price on every colour.
    const p = listPrice(
      fromSkus([
        { price: 3999, salePrice: 2999 },
        { price: 3999, salePrice: 2999 },
        { price: 3999, salePrice: 2999 },
      ]),
    );
    expect(p.isFrom).toBe(false);
    expect(p.mrp).toBe(3999);
    expect(p.discountLabel).toBe("25% off");
  });

  it("same sale price but different MRPs: still one selling price, no 'From'", () => {
    const p = listPrice(
      fromSkus([
        { price: 1000, salePrice: 800 },
        { price: 1200, salePrice: 800 },
      ]),
    );
    expect(p.isFrom).toBe(false);
    expect(p.price).toBe(800);
  });

  it("2 SKUs with differing sale prices: 'From' the lowest, no misleading strike, 'Up to' discount", () => {
    const p = listPrice(
      fromSkus([
        { price: 4200, salePrice: 3570 },
        { price: 4956, salePrice: 4213 },
      ]),
    );
    expect(p).toEqual({ price: 3570, isFrom: true, mrp: null, discountLabel: "Up to 15% off" });
  });

  it("2 SKUs with differing prices and no discount: 'From', no discount text", () => {
    expect(
      listPrice(
        fromSkus([
          { price: 1500, salePrice: null },
          { price: 2200, salePrice: null },
        ]),
      ),
    ).toEqual({ price: 1500, isFrom: true, mrp: null, discountLabel: null });
  });

  it("flips to 'From' automatically once one SKU's sale price diverges", () => {
    const same = [
      { price: 5000, salePrice: 4000 },
      { price: 5000, salePrice: 4000 },
    ];
    expect(listPrice(fromSkus(same)).isFrom).toBe(false);
    const diverged = [
      { price: 5000, salePrice: 4000 },
      { price: 5000, salePrice: 4500 },
      { price: 6000, salePrice: 5400 },
    ];
    expect(listPrice(fromSkus(diverged)).isFrom).toBe(true);
  });

  it("an explicit skuCount of 1 never says 'From'", () => {
    // Inconsistent numbers, but one SKU cannot have two prices.
    expect(listPrice({ minPrice: 500, maxBasePrice: 2000, discount: 10, skuCount: 1 }).isFrom).toBe(false);
    expect(listPrice(fromSkus([{ price: 17999, salePrice: 14999 }], true)).isFrom).toBe(false);
  });

  it("uses skuCount > 1 only together with a real price gap", () => {
    expect(
      listPrice(
        fromSkus(
          [
            { price: 999, salePrice: 799 },
            { price: 999, salePrice: 799 },
          ],
          true,
        ),
      ).isFrom,
    ).toBe(false);
    expect(
      listPrice(
        fromSkus(
          [
            { price: 999, salePrice: 799 },
            { price: 1299, salePrice: 1099 },
          ],
          true,
        ),
      ).isFrom,
    ).toBe(true);
  });

  it("absorbs whole-percent rounding of the discount (no false 'From')", () => {
    // 1 - 1349/1999 = 32.52 % → rounded to 33 %; 1999 × 0.67 = 1339.33 < 1349.
    expect(hasMultiplePrices(fromSkus([{ price: 1999, salePrice: 1349 }]))).toBe(false);
    // 1 - 1350/1999 = 32.47 % → rounded to 32 %; 1999 × 0.68 = 1359.32 > 1350.
    expect(hasMultiplePrices(fromSkus([{ price: 1999, salePrice: 1350 }]))).toBe(false);
    // A sliver of a discount that rounds to 0 %.
    expect(hasMultiplePrices(fromSkus([{ price: 100000, salePrice: 99600 }]))).toBe(false);
  });

  it("a sale price above MRP is one price, not a range", () => {
    const p = listPrice(fromSkus([{ price: 1000, salePrice: 1100 }]));
    expect(p).toEqual({ price: 1100, isFrom: false, mrp: null, discountLabel: null });
  });

  it("degenerate data shows the plain price", () => {
    expect(listPrice({ minPrice: 0, maxBasePrice: 0, discount: 0 })).toEqual({
      price: 0,
      isFrom: false,
      mrp: null,
      discountLabel: null,
    });
    expect(hasMultiplePrices({ minPrice: 100, maxBasePrice: Number.NaN, discount: 0 })).toBe(false);
  });

  it("never strikes an MRP that is not above the price", () => {
    // bestDiscount reported but MRP equals the selling price: no strike, no label.
    expect(listPrice({ minPrice: 1000, maxBasePrice: 1000, discount: 5 })).toEqual({
      price: 1000,
      isFrom: false,
      mrp: null,
      discountLabel: null,
    });
  });

  it("matches the mock catalogue's multi-SKU shape (prices step up per variant)", () => {
    // src/mocks/data/products.ts: price = base + i × round(base × 0.18), sale = 0.85.
    const base = 4200;
    const skus = [0, 1, 2].map((i) => {
      const price = base + i * Math.round(base * 0.18);
      return { price, salePrice: Math.round(price * 0.85) };
    });
    const p = listPrice(fromSkus(skus, true));
    expect(p.isFrom).toBe(true);
    expect(p.price).toBe(3570);
    expect(p.discountLabel).toBe("Up to 15% off");
  });
});
