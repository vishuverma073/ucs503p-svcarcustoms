import { describe, expect, it } from "vitest";
import type { Product } from "@svcar/contracts";
import { productJsonLd } from "./product-jsonld";

function product(over: Partial<Product>): Product {
  return {
    id: 1,
    categoryId: 1,
    name: "Virtus / Slavia window louvers",
    slug: "virtus-slavia-window-louvers",
    description: "Window louvers.",
    status: "active",
    isBestseller: false,
    isNew: false,
    tags: [],
    images: [{ url: "https://cdn.example/a.webp", sortOrder: 0 }],
    dimensions: [],
    skus: [{ id: 9, skuCode: "DTP-1", price: 2999, salePrice: 1999, dimensionValues: {}, stock: 4 }],
    fitsAllVehicles: false,
    fitments: [{ make: "Volkswagen", model: "Virtus" }],
    ...over,
  } as Product;
}

const free = { shippingFlatFee: 0, shippingFreeAbove: 5000 };

// JSON-LD is a loose bag of nested records; tests read it as such.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = Record<string, any>;

describe("productJsonLd", () => {
  it("has the fields Google's merchant listings require", () => {
    const ld = productJsonLd(product({}), free) as Loose;
    expect(ld["@type"]).toBe("Product");
    expect(ld.name).toBeTruthy();
    expect(ld.image).toEqual(["https://cdn.example/a.webp"]);
    expect(ld.description).toBe("Window louvers.");
    expect(ld.sku).toBe("DTP-1");
    expect(Array.isArray(ld.offers)).toBe(true);
    const offer = ld.offers[0];
    expect(offer).toMatchObject({
      "@type": "Offer",
      price: 1999,
      priceCurrency: "INR",
      availability: "https://schema.org/InStock",
      url: "https://www.svcarcustoms.in/product/virtus-slavia-window-louvers",
      priceSpecification: { priceType: "https://schema.org/StrikethroughPrice", price: 2999 },
    });
    expect(offer.shippingDetails.shippingRate).toEqual({ "@type": "MonetaryAmount", value: 0, currency: "INR" });
    expect(offer.shippingDetails.shippingDestination.addressCountry).toBe("IN");
    expect(offer.hasMerchantReturnPolicy).toMatchObject({
      returnPolicyCategory: "https://schema.org/MerchantReturnNotPermitted",
      applicableCountry: "IN",
      merchantReturnLink: "https://www.svcarcustoms.in/refund",
    });
  });

  it("names no brand for generic aftermarket parts, nor a third-party one", () => {
    expect(productJsonLd(product({}), free)).not.toHaveProperty("brand");
    expect(productJsonLd(product({ name: "Akrapovic Exhaust Tip" }), free)).not.toHaveProperty("brand");
  });

  it("uses the store's brand only where the catalogue names it the maker", () => {
    const ld = productJsonLd(product({ name: "Svcarcustoms Virtus / Slavia Aero kit" }), free) as Loose;
    expect(ld.brand).toEqual({ "@type": "Brand", name: "SV Car Customs" });
  });

  it("falls back to a description and one offer per SKU", () => {
    const ld = productJsonLd(
      product({
        description: "",
        skus: [
          { id: 1, skuCode: "A", price: 100, dimensionValues: {}, stock: 0 },
          { id: 2, skuCode: "B", price: 100, dimensionValues: {}, stock: null },
        ] as Product["skus"],
      }),
      null,
    ) as Loose;
    expect(ld.description).toMatch(/^Virtus \/ Slavia window louvers for Volkswagen Virtus/);
    expect(ld).not.toHaveProperty("sku");
    expect(ld.offers.map((o: Loose) => o.availability)).toEqual([
      "https://schema.org/OutOfStock",
      "https://schema.org/InStock",
    ]);
    expect(ld.offers[0]).not.toHaveProperty("priceSpecification");
  });
});
