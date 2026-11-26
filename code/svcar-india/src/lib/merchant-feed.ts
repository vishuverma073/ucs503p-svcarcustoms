/**
 * Google Merchant Center product feed (RSS 2.0 + the `g:` namespace), as a
 * pure function of the catalogue so it can be tested without a server. The
 * route at /feed.xml only fetches the inputs and serves the string.
 *
 * Spec: https://support.google.com/merchants/answer/7052112
 */
import { BRAND } from "./brand";
import { absoluteUrl } from "./site";
import { shippingRateFor } from "./structured-data";
import { feedBrandFor, feedHoldReason } from "./feed-brands";
import { isDuplicateProductSlug } from "./duplicate-products";
import { categoryDisplayName, joinCars, splitFitmentLabel, tidyName } from "./seo-copy";

export interface FeedItemInput {
  id: string;
  slug: string;
  name: string;
  description: string;
  images: string[];
  /** What a shopper pays today (the sale price where there is one). */
  price: number;
  /** The regular price when `price` is a sale price. */
  listPrice?: number | null;
  categoryId?: number | null;
  availability: "in_stock" | "out_of_stock";
  /** "Make Model" labels. */
  fitments: string[];
}

export interface FeedInput {
  items: FeedItemInput[];
  currency: string;
  settings: { shippingFlatFee: number; shippingFreeAbove: number } | null;
  categories?: Array<{ id: number; name: string; slug: string; parentId: number | null }>;
}

export interface FeedResult {
  xml: string;
  included: string[];
  excluded: Array<{ id: string; name: string; reason: string }>;
}

/** Merchant Center caps the description at 5000 characters… */
const MAX_DESCRIPTION = 5000;
/** …and the title at 150. */
const MAX_TITLE = 150;
/** Up to 10 additional images. */
const MAX_EXTRA_IMAGES = 10;
/** Handling window published on /shipping ("processed within 1–2 business days"). */
const HANDLING_DAYS = { min: 1, max: 2 };

/** XML text escaping. Product names carry &, ", ' and the odd < in "<18mm". */
export function xml(value: string): string {
  return value
    // Characters XML 1.0 forbids outright (control chars pasted from Word etc.).
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function clamp(value: string, max: number): string {
  const v = value.trim();
  return v.length <= max ? v : `${v.slice(0, max - 1).trimEnd()}…`;
}

/** "1234.00 INR" */
export function money(value: number, currency: string): string {
  return `${value.toFixed(2)} ${currency}`;
}

/**
 * Google product taxonomy id from the product name, most specific first.
 * Ids from https://www.google.com/basepages/producttype/taxonomy-with-ids.en-US.txt
 */
const TAXONOMY: [RegExp, number][] = [
  [/\b(?:exhaust|valvetronic)\b/i, 908], // Motor Vehicle Parts > Exhaust
  [/\b(?:air intake|induction kit)\b/i, 2820], // > Engine Parts
  [/\bsteering wheel cover\b|\barm ?rest\b|\bac vents?\b|\bgrab handle|\bhandle grips?\b/i, 8233], // > Interior Fittings
  [/\b(?:steering|paddle shift|gear knob)/i, 8235], // > Controls
  [/\bmirror caps?\b/i, 2642], // > Mirrors
  [/\bwindow (?:louvers?|lowers?)\b/i, 2534], // > Window Parts & Accessories
  [/\bmats?\b/i, 8232], // > Carpet & Upholstery
  [/\b(?:spoiler|splitter|diffuser|skirts?|body kit|aero kit|lip|grill|grille|hood scoop|eyelids?|canards?|door hinge)\b/i, 8227], // > Frame & Body Parts
  [/\b(?:head ?lights?|tail ?(?:lights?|lamps?)|ambient|led|light)\b/i, 3318], // > Lighting
  [/\b(?:utility box|ladder)\b/i, 8237], // Vehicle Storage & Cargo
  [/\bvac+u+m cleaner\b/i, 2895], // Vehicle Cleaning
  [/\btyre inflator\b/i, 8236], // Vehicle Repair & Specialty Tools
  [/\bkey case\b/i, 2495], // Vehicle Decor
];
/** Vehicles & Parts > Vehicle Parts & Accessories */
export const DEFAULT_TAXONOMY = 5613;

export function googleCategoryFor(name: string): number {
  return TAXONOMY.find(([re]) => re.test(name))?.[1] ?? DEFAULT_TAXONOMY;
}

/**
 * The listing title: the catalogue name with its " | " sub-title kept as
 * "–" (it often carries the variant: "Dual Tip (Carbon)"), the store prefix
 * dropped (the brand field says it), and the fitted cars the name doesn't
 * already mention — shoppers search "virtus diffuser".
 */
export function feedTitle(name: string, fitments: string[]): string {
  const base = name
    .replace(/^\s*(?:sv\s*car\s*customs|svcarcustoms)\b[\s:|–—-]*/i, "")
    .split(/\s+\|\s+/)
    .map(tidyName)
    .filter(Boolean)
    .join(" – ")
    // A bare BMW model code on a part for another car reads as a BMW part.
    .replace(/\bM4 Spoiler\b/g, "M4-Style Spoiler")
    .replace(/\bRS Body Kit\b/g, "RS-Style Body Kit");
  const lower = base.toLowerCase();
  const cars = [...new Set(fitments)].filter((f) => !lower.includes(splitFitmentLabel(f).model.toLowerCase()));
  // As many fitted cars as fit in 150 characters, never a cut-off car name.
  for (let n = cars.length; n > 0; n--) {
    const t = `${base} for ${joinCars(cars.slice(0, n))}`;
    if (t.length <= MAX_TITLE) return t;
  }
  return clamp(base, MAX_TITLE);
}

/** Plain text: Merchant Center shows descriptions as text, so tags go. */
function plain(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function productType(
  categoryId: number | null | undefined,
  categories: FeedInput["categories"],
): string | null {
  if (categoryId == null || !categories?.length) return null;
  const byId = new Map(categories.map((c) => [c.id, c] as const));
  const path: string[] = [];
  for (let c = byId.get(categoryId); c && path.length < 5; c = c.parentId == null ? undefined : byId.get(c.parentId)) {
    path.unshift(categoryDisplayName(c.slug, c.name));
  }
  return path.length > 0 ? ["Car Accessories", ...path].join(" > ") : null;
}

export function buildMerchantFeed(input: FeedInput): FeedResult {
  const { currency, settings, categories } = input;
  const included: string[] = [];
  const excluded: FeedResult["excluded"] = [];

  const items = input.items.flatMap((p) => {
    const [primary, ...rest] = p.images;
    const skip = (reason: string) => {
      excluded.push({ id: p.id, name: p.name, reason });
      return [];
    };
    if (!primary) return skip("no image");
    if (!(p.price > 0)) return skip("no price");
    // Merchant Center would see two offers for one part (and a landing page
    // whose canonical points elsewhere); only the primary listing is sent.
    if (isDuplicateProductSlug(p.slug)) return skip("duplicate listing of another product");
    const hold = feedHoldReason(p.name);
    if (hold) return skip(hold);
    const { brand } = feedBrandFor(p.name);

    const title = feedTitle(p.name, p.fitments);
    const description = clamp(plain(p.description) || `${title}.`, MAX_DESCRIPTION);
    const onSale = p.listPrice != null && p.listPrice > p.price;
    const type = productType(p.categoryId, categories);
    const shipping = shippingRateFor(p.price, settings);
    included.push(p.id);

    const lines = [
      `<g:id>${xml(p.id)}</g:id>`,
      `<g:title>${xml(title)}</g:title>`,
      `<g:description>${xml(description)}</g:description>`,
      `<g:link>${xml(absoluteUrl(`/product/${p.slug}`))}</g:link>`,
      `<g:image_link>${xml(primary)}</g:image_link>`,
      ...rest.slice(0, MAX_EXTRA_IMAGES).map((u) => `<g:additional_image_link>${xml(u)}</g:additional_image_link>`),
      `<g:availability>${p.availability}</g:availability>`,
      // On sale: price is the regular price and sale_price what the PDP charges.
      `<g:price>${money(onSale ? (p.listPrice as number) : p.price, xml(currency))}</g:price>`,
      ...(onSale ? [`<g:sale_price>${money(p.price, xml(currency))}</g:sale_price>`] : []),
      `<g:condition>new</g:condition>`,
      ...(brand ? [`<g:brand>${xml(brand)}</g:brand>`] : []),
      // No GTIN/MPN exists for these parts.
      `<g:identifier_exists>no</g:identifier_exists>`,
      `<g:google_product_category>${googleCategoryFor(p.name)}</g:google_product_category>`,
      ...(type ? [`<g:product_type>${xml(type)}</g:product_type>`] : []),
      `<g:shipping>`,
      `  <g:country>IN</g:country>`,
      `  <g:price>${money(shipping, xml(currency))}</g:price>`,
      `</g:shipping>`,
      `<g:min_handling_time>${HANDLING_DAYS.min}</g:min_handling_time>`,
      `<g:max_handling_time>${HANDLING_DAYS.max}</g:max_handling_time>`,
    ];
    return [`    <item>\n${lines.map((l) => `      ${l}`).join("\n")}\n    </item>`];
  });

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${xml(BRAND.name)}</title>
    <link>${xml(absoluteUrl("/"))}</link>
    <description>${xml(BRAND.seo.description)}</description>
${items.join("\n")}
  </channel>
</rss>
`;
  return { xml: body, included, excluded };
}
