/**
 * Catalogue slugs that are a second listing of a product already on the site
 * (same part, same photos, a retyped title). Google sees two pages competing
 * for one query and may index the wrong one, so until the owner archives the
 * copies in the admin the storefront treats each as a duplicate of its primary:
 *
 *  - PDP metadata: canonical → the primary URL, `noindex, follow`;
 *  - Product JSON-LD: `url` is the primary's;
 *  - sitemap.xml and feed.xml: the copy is left out.
 *
 * The copy stays reachable (it may be linked from Instagram / old Shopping
 * listings), it just stops being a page of its own in Google's eyes. Remove an
 * entry once the admin has archived or merged that listing.
 *
 * Not in the map: the Fortuner real-carbon / copy-carbon steering pair — two
 * different products that happen to share a description.
 */
export const DUPLICATE_PRODUCT_SLUGS: Readonly<Record<string, string>> = {
  "remus-single-tip-valvetronic-exhaust-fuat": "remus-single-tip-valvetronic-exhaust",
  "sparco-bride-racing-bagpack-for-travelling-and-motorsports":
    "sparco-bride-racing-backpack-travelling-and-racing-bagpack",
  "polo-q2-aftermarket-stylish-tail-lights-in-red-finish":
    "volkswagen-polo-audi-q2-style-led-tail-lights",
};

/** True when `slug` is a known copy of another product page. */
export function isDuplicateProductSlug(slug: string): boolean {
  return Object.prototype.hasOwnProperty.call(DUPLICATE_PRODUCT_SLUGS, slug);
}

/** The slug whose page should rank for `slug`: the primary for a copy, else itself. */
export function primaryProductSlug(slug: string): string {
  return DUPLICATE_PRODUCT_SLUGS[slug] ?? slug;
}
