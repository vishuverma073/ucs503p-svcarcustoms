import type { Product } from "@svcar/contracts";
import { absoluteUrl } from "./site";
import { BRAND } from "./brand";
import { getFitmentTerms } from "./product-fitments";
import { primaryProductSlug } from "./duplicate-products";
import { structuredDataBrand } from "./feed-brands";
import { merchantReturnPolicyLd, shippingDetailsLd, shippingRateFor } from "./structured-data";

export type ShippingSettings = { shippingFlatFee: number; shippingFreeAbove: number };

/** Schema.org Product structured data for rich results. */
export function productJsonLd(product: Product, settings: ShippingSettings | null) {
    // Vehicles the part fits — surfaced both as readable text and as the
    // `isAccessoryOrSparePartFor` relation Google reads for automotive parts.
    const fitmentTerms = getFitmentTerms(product.fitments);
    const returnPolicy = merchantReturnPolicyLd();
    // A duplicate listing describes the same entity as its primary, so the
    // JSON-LD names the primary's URL — matching the page's canonical.
    const productUrl = absoluteUrl(`/product/${primaryProductSlug(product.slug)}`);

    // Google reads `brand` as the manufacturer: only a confirmed genuine brand
    // or the store's own product carries one (lib/feed-brands.ts), never the
    // store's name on a part it didn't make.
    const brand = structuredDataBrand(product.name);
    const description =
        product.description?.trim() ||
        `${product.name}${fitmentTerms.length > 0 ? ` for ${fitmentTerms.join(", ")}` : ""}.`;

    return {
        "@context": "https://schema.org",
        "@type": "Product",
        "@id": `${productUrl}#product`,
        name: product.name,
        description,
        image: product.images.map((image) => image.url),
        url: productUrl,
        // One SKU = one sellable item, so its code is the product's; with
        // variants each Offer carries its own.
        ...(product.skus.length === 1 ? { sku: product.skus[0].skuCode } : {}),
        ...(brand ? { brand: { "@type": "Brand", name: brand } } : {}),
        ...(fitmentTerms.length > 0
            ? {
                  isAccessoryOrSparePartFor: fitmentTerms.map((term) => ({
                      "@type": "Product",
                      name: term,
                  })),
              }
            : {}),
        // A plain list of Offers, one per SKU. Google's merchant listings (the
        // Shopping-tab / price rich result) read `Offer`, not `AggregateOffer`;
        // the variants here share a price anyway, so a range added nothing.
        offers: product.skus.map((sku) => skuOffer(product, sku, returnPolicy, settings)),
    };
}

/** One schema.org Offer for a single SKU, with the store's shipping + return terms. */
function skuOffer(
    product: Product,
    sku: Product["skus"][number],
    returnPolicy: Record<string, unknown>,
    settings: ShippingSettings | null,
) {
    return {
        "@type": "Offer",
        url: absoluteUrl(`/product/${primaryProductSlug(product.slug)}`),
        priceCurrency: BRAND.commerce.currency,
        price: sku.salePrice ?? sku.price,
        // The struck-through price the PDP prints next to a sale price.
        ...(sku.salePrice != null && Number(sku.salePrice) < Number(sku.price)
            ? {
                  priceSpecification: {
                      "@type": "UnitPriceSpecification",
                      priceType: "https://schema.org/StrikethroughPrice",
                      price: sku.price,
                      priceCurrency: BRAND.commerce.currency,
                  },
              }
            : {}),
        sku: sku.skuCode,
        itemCondition: "https://schema.org/NewCondition",
        availability:
            sku.stock === undefined || sku.stock === null || sku.stock > 0
                ? "https://schema.org/InStock"
                : "https://schema.org/OutOfStock",
        seller: { "@type": "Organization", name: BRAND.name },
        hasMerchantReturnPolicy: returnPolicy,
        // What checkout would charge for this item on its own (admin settings).
        shippingDetails: shippingDetailsLd(shippingRateFor(Number(sku.salePrice ?? sku.price), settings)),
    };
}

