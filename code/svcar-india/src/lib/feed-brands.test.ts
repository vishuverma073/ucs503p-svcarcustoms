import { describe, expect, it } from "vitest";
import { feedBrandFor, structuredDataBrand } from "@/lib/feed-brands";

describe("feedBrandFor", () => {
  it("keeps titles naming an unconfirmed third-party brand out of the feed", () => {
    expect(feedBrandFor("Akrapovic Exhaust Tip | Blue Forged Carbon Dual Tip")).toEqual({
      list: false,
      brand: "Akrapovic",
    });
    expect(feedBrandFor("Remus single tip Valvetronic exhaust").list).toBe(false);
    expect(feedBrandFor("SPARCO BRIDE racing bagpack").list).toBe(false);
    expect(feedBrandFor("Polo otteinger spoiler ( ABS )").brand).toBe("Oettinger");
  });

  it("lists generic aftermarket items with no brand", () => {
    expect(feedBrandFor("Virtus / Slavia window louvers")).toEqual({ list: true, brand: null });
    // "Forged carbon" is a material, not the Forge brand.
    expect(feedBrandFor("Forged carbon fibre dual exhaust tip 1 pcs")).toEqual({ list: true, brand: null });
  });

  it("uses the store's own brand only where the title claims the product", () => {
    expect(feedBrandFor("Svcarcustoms Virtus / Slavia Aftermarket dedicated Aero kit")).toEqual({
      list: true,
      brand: "SV Car Customs",
    });
    expect(structuredDataBrand("Virtus / Slavia window louvers")).toBeNull();
    expect(structuredDataBrand("Momo universal Steering")).toBeNull();
  });
});
