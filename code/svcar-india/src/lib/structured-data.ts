/**
 * schema.org structured-data builders. Absolute URLs via `absoluteUrl` so the
 * JSON-LD is valid regardless of the rendering origin.
 */
import { absoluteUrl, SITE_URL } from "./site";
import { BRAND } from "./brand";

export interface Crumb {
  label: string;
  /** Path (e.g. "/category/spoilers"); omitted for the current/last crumb. */
  href?: string;
}

/** BreadcrumbList — the breadcrumb trail shown as a Google rich result. */
export function breadcrumbListLd(items: Crumb[]): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.label,
      ...(it.href ? { item: absoluteUrl(it.href) } : {}),
    })),
  };
}

/** ItemList of product links — lets crawlers discover a category's products. */
export function productItemListLd(products: Array<{ slug: string; name: string }>): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: products.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: absoluteUrl(`/product/${p.slug}`),
      name: p.name,
    })),
  };
}

/**
 * AutoPartsStore (a schema.org LocalBusiness subtype) — the entity Google uses
 * for the brand knowledge panel and local "car accessories near me" results.
 * Every value comes from brand.config.ts, so a fork re-skins it automatically.
 */
export function localBusinessLd(): Record<string, unknown> {
  const a = BRAND.contact.address;
  const socials = BRAND.social.map((s) => s.href);
  return {
    "@context": "https://schema.org",
    "@type": "AutoPartsStore",
    "@id": `${SITE_URL}/#localbusiness`,
    name: BRAND.name,
    legalName: BRAND.legalName,
    description: BRAND.seo.description,
    url: SITE_URL,
    logo: absoluteUrl("/uploads/logo/logo-v2.webp"),
    image: absoluteUrl("/uploads/logo/logo-v2.webp"),
    email: BRAND.contact.email,
    telephone: BRAND.contact.phone,
    priceRange: "₹₹",
    currenciesAccepted: BRAND.commerce.currency,
    paymentAccepted: "UPI, Credit Card, Debit Card, Net Banking, Cash on Delivery",
    address: {
      "@type": "PostalAddress",
      streetAddress: [a.line1, a.landmark].filter(Boolean).join(", "),
      addressLocality: a.city,
      addressRegion: a.state,
      postalCode: a.pincode,
      addressCountry: "IN",
    },
    areaServed: { "@type": "Country", name: "India" },
    hasMap: BRAND.maps.openUrl,
    hasMerchantReturnPolicy: merchantReturnPolicyLd(),
    ...(socials.length > 0 ? { sameAs: socials } : {}),
  };
}

/** FAQPage — makes the /faq answers eligible for expandable rich results. */
export function faqPageLd(items: ReadonlyArray<{ readonly q: string; readonly a: string }>): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };
}

/**
 * The store's return terms, as schema.org expects them on an Offer. Per /refund
 * we accept no returns and give no refunds; the only remedy is an exchange of
 * an item delivered damaged (claimed within 4 days, with an unboxing video).
 * That is a damaged-goods replacement, not a return a shopper can choose, so
 * the honest category is `MerchantReturnNotPermitted` — a 4-day "return
 * window" would have Google advertise returns we don't take. The link points
 * Google (and shoppers) at the exchange terms. Keep this in sync with /refund.
 */
export function merchantReturnPolicyLd(): Record<string, unknown> {
  return {
    "@type": "MerchantReturnPolicy",
    applicableCountry: "IN",
    returnPolicyCountry: "IN",
    returnPolicyCategory: "https://schema.org/MerchantReturnNotPermitted",
    merchantReturnLink: absoluteUrl("/refund"),
  };
}

/**
 * What checkout charges to ship one item at `price`: free at or above the
 * threshold, the flat fee below it. Mirrors calculatePricing() in the API.
 *
 * `settings` is the live admin configuration (GET /settings) — the values
 * checkout actually uses, because the admin can change the fee without a
 * deploy and Google compares the advertised shipping against what the site
 * charges. When settings can't be read the pages print "Free delivery on all
 * orders" (home, announcement bar, PDP), so the structured data says the same
 * — 0 — rather than the brand.config fee no page shows.
 */
export function shippingRateFor(
  price: number,
  settings: { shippingFlatFee: number; shippingFreeAbove: number } | null | undefined,
): number {
  if (!settings) return 0;
  return price >= settings.shippingFreeAbove ? 0 : settings.shippingFlatFee;
}

/** Delivery terms for an Offer. Pass the rate from shippingRateFor(). */
export function shippingDetailsLd(rate: number): Record<string, unknown> {
  return {
    "@type": "OfferShippingDetails",
    shippingRate: {
      "@type": "MonetaryAmount",
      value: rate,
      currency: BRAND.commerce.currency,
    },
    shippingDestination: { "@type": "DefinedRegion", addressCountry: "IN" },
    // Only the handling window is published on /shipping. Transit time is
    // courier-dependent and we don't quote one, so it's left out rather than
    // guessed — a delivery estimate Google can't match on-page is a penalty.
    deliveryTime: {
      "@type": "ShippingDeliveryTime",
      handlingTime: { "@type": "QuantitativeValue", minValue: 1, maxValue: 2, unitCode: "DAY" },
    },
  };
}
