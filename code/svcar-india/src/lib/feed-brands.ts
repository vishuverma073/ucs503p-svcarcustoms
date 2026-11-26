/**
 * Brand handling for the Merchant Center feed.
 *
 * Several product titles name another company's brand (Akrapovic, Borla,
 * Remus…). Merchant Center treats suspected counterfeits as an "egregious"
 * violation and suspends the whole account without warning, and its brand
 * rules say never to submit the store's own name for a product it didn't make.
 * So:
 *  - a title naming a third-party brand stays OUT of the feed until the owner
 *    confirms the item is the genuine article (then add the brand to
 *    GENUINE_BRANDS and it is listed under that brand);
 *  - every other item is generic aftermarket and is listed with no brand.
 */

/** Third-party brands seen in product titles → the brand name Google expects. */
const TITLE_BRANDS: [RegExp, string][] = [
  [/\bakrapovic\b/i, "Akrapovic"],
  [/\bborla\b/i, "Borla"],
  [/\bremus\b/i, "Remus"],
  [/\bforge\b/i, "Forge Motorsport"],
  [/\bmomo\b/i, "MOMO"],
  [/\bsparco\b/i, "Sparco"],
  [/\bbride\b/i, "Bride"],
  [/\b(?:oettinger|otteinger)\b/i, "Oettinger"], // the catalogue spells it "otteinger"
  [/\bcardi\b/i, "Cardi"],
  [/\bwindek\b/i, "Windek"],
];

import { BRAND } from "./brand";

/** A name that opens with the store's own name ("Svcarcustoms Virtus / Slavia …"). */
const OWN_BRAND = /^\s*(?:sv\s*car\s*customs|svcarcustoms)\b/i;

/** Brands the owner has confirmed are sold genuine. Empty until confirmed. */
const GENUINE_BRANDS = new Set<string>([]);

export type FeedBrand =
  | { list: false; brand: string }
  | { list: true; brand: string | null };

/**
 * Whether a product may be listed in the feed, and under which brand (null =
 * omit). The store's own name is used only where the catalogue title already
 * claims the item as the store's own product ("Svcarcustoms … Aero kit").
 */
export function feedBrandFor(name: string): FeedBrand {
  for (const [pattern, brand] of TITLE_BRANDS) {
    if (pattern.test(name)) {
      return GENUINE_BRANDS.has(brand) ? { list: true, brand } : { list: false, brand };
    }
  }
  if (OWN_BRAND.test(name)) return { list: true, brand: BRAND.name };
  return { list: true, brand: null };
}

/**
 * The brand to publish in Product JSON-LD: a confirmed genuine brand, the
 * store's own for its own products, otherwise none. Never the store's name on
 * a part it didn't make — Google reads `brand` as the manufacturer.
 */
export function structuredDataBrand(name: string): string | null {
  const { list, brand } = feedBrandFor(name);
  return list ? brand : null;
}

/**
 * Titles that are not named after a third-party brand but still read, to a
 * Merchant Center reviewer, like a trademark claim on an item we can't prove
 * is genuine:
 *  - replacement logos / badges reproduce a carmaker's emblem (VW, Skoda,
 *    Honda, GT) — Google's counterfeit policy names "logos" explicitly;
 *  - "OEM" / "original" asserts the carmaker made it.
 * They stay off the feed (the pages are unaffected) until the owner confirms
 * they are genuine; then add the slug-free name pattern to CONFIRMED_GENUINE.
 */
const HOLD_RULES: [RegExp, string][] = [
  [/\b(?:logos?|emblems?|badges?)\b/i, "reproduces a carmaker's logo/badge"],
  [/\b(?:oem|original|genuine)\b/i, "claims to be OEM/original"],
];

/** Names (case-insensitive substrings) the owner has confirmed genuine. */
const CONFIRMED_GENUINE: string[] = [];

/** Why an item must stay off the Merchant feed, or null when it may be listed. */
export function feedHoldReason(name: string): string | null {
  const { list, brand } = feedBrandFor(name);
  if (!list) return `names the ${brand} brand (not confirmed genuine)`;
  const lower = name.toLowerCase();
  if (CONFIRMED_GENUINE.some((n) => lower.includes(n.toLowerCase()))) return null;
  for (const [pattern, reason] of HOLD_RULES) if (pattern.test(name)) return reason;
  return null;
}
