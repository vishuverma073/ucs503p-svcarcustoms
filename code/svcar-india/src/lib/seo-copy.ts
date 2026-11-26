/**
 * Search-result copy (<title>, meta description, category intros) built from
 * catalogue data only. Nothing here may add a product fact the catalogue does
 * not hold — no materials, warranty, origin or ratings. The only store-level
 * claims are the ones the site itself publishes on /shipping and /refund:
 * delivery is free on every order (while the admin fee is 0) and Cash on
 * Delivery is available with a 15% advance.
 *
 * Google cuts titles at ~60 characters and descriptions at ~155 on mobile
 * (83% of the traffic), so every builder here stays inside those limits.
 */
import type { Fitment } from "@svcar/contracts";
import { BRAND } from "./brand";
import { CAR_CATEGORIES, type CarCategory } from "./car-categories";

export const TITLE_MAX = 60;
export const DESCRIPTION_MAX = 155;
const SUFFIX = ` | ${BRAND.name}`;

/** "₹14,999" — Indian digit grouping, no decimals. */
export function inr(value: number): string {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

/** Cut `text` to `max` characters on a word boundary, without dangling punctuation. */
export function clampWords(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1);
  const space = cut.lastIndexOf(" ");
  let head = (space > max * 0.5 ? cut.slice(0, space) : t.slice(0, max)).trimEnd();
  // Never end on a connector ("…Spoiler with", "…Lights in") or a dangling symbol.
  for (let prev = ""; prev !== head; ) {
    prev = head;
    head = head.replace(/(?:[\s,;:|/&(–—-]|\s\+)+$/u, "");
    const words = head.split(" ");
    if (words.length > 1 && SMALL.has(words[words.length - 1].toLowerCase())) head = words.slice(0, -1).join(" ");
  }
  return head;
}

// ─── Product names ───────────────────────────────────────────────────

/** Tokens the catalogue writes in any case that read better in capitals. */
const UPPER = new Set([
  "abs", "led", "gt", "rs", "gti", "bmw", "vw", "ac", "lci", "m4", "f1", "f90", "g20", "s5", "a5", "q2",
  "lc-250", "gr", "rgb", "tsi", "jdm", "suv", "drl", "4x4", "oem", "psi", "3d",
]);
/** Words left lower-case inside a title. */
const SMALL = new Set(["and", "or", "for", "with", "of", "in", "on", "the", "to", "a", "an", "only"]);

function tidyCase(word: string, first: boolean): string {
  const lower = word.toLowerCase();
  const bare = lower.replace(/^[^a-z0-9]+|[^a-z0-9-]+$/g, "");
  if (UPPER.has(bare)) return word.replace(new RegExp(bare.replace(/[-]/g, "\\-"), "i"), bare.toUpperCase());
  if (!first && SMALL.has(lower)) return lower;
  // Only all-lower words are capitalised; "i20", "LC-250" and "Q2" keep their form.
  if (/^[a-z][a-z'’-]*[,;:)]*$/.test(word)) return word[0].toUpperCase() + word.slice(1);
  return word;
}

/** Store-name prefixes the admin sometimes types into a product name. */
const OWN_BRAND = /^\s*(?:sv\s*car\s*customs|svcarcustoms)\b[\s:|–—-]*/i;

/** True when the catalogue name itself says the item is the store's own. */
export function isOwnBrandName(name: string): boolean {
  return OWN_BRAND.test(name);
}

/**
 * The name as a shopper would type it: the part before the first " | " (the
 * rest is a sub-title the admin appends), the store prefix removed, stray
 * spacing and punctuation fixed, and the casing evened out.
 */
export function cleanProductName(name: string): string {
  const head = name.split(/\s+\|\s+/)[0] ?? name;
  return tidyName(head.replace(OWN_BRAND, ""));
}

/** Spacing, punctuation and casing fixes for one catalogue name segment. */
export function tidyName(text: string): string {
  const s = text
    .replace(/^[\s*]+/, "")
    .replace(/\s*\.\s*(?=\(|$)/g, " ") // "Aero kit . ( Splitter" / trailing "."
    .replace(/\s*\.\s+/g, " ") // "Diffuser . 2018+ models", "Tail Lights. For 2016+"
    .replace(/\s+\+\s*|\s*\+\s+/g, " + ") // "splitter+  side skirts"
    .replace(/(\d)\s*\+/g, "$1+") // …but years stay "2018+"
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/\s+and\s+/gi, " & ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s*\/\s*/g, " / ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/[\s.]+$/, "");
  return s
    .split(" ")
    .map((w, i) => tidyCase(w, i === 0))
    .join(" ");
}

// ─── Fitment ─────────────────────────────────────────────────────────

/** Makes that are more than one word, so "Maruti Suzuki Swift" splits right. */
const MULTI_WORD_MAKES = ["maruti suzuki", "land rover", "mercedes benz", "aston martin"];

/** Split a "Make Model" fitment label (the feed's shape) into its parts. */
export function splitFitmentLabel(label: string): Fitment {
  const t = label.trim().replace(/\s+/g, " ");
  const lower = t.toLowerCase();
  const multi = MULTI_WORD_MAKES.find((m) => lower.startsWith(`${m} `));
  const cut = multi ? multi.length : t.indexOf(" ");
  if (cut <= 0) return { make: t, model: t };
  return { make: t.slice(0, cut), model: t.slice(cut + 1) };
}

/**
 * The short car name used in copy: the model ("Virtus", "Fortuner"), with the
 * make kept where the model alone says little ("BMW 3 Series", "Audi S5").
 */
export function shortCarName(f: Fitment): string {
  const model = f.model.trim();
  return /^\d/.test(model) || model.length <= 2 ? `${f.make.trim()} ${model}` : model;
}

/** Unique short car names, in fitment order, skipping any `exclude` already names. */
export function carNames(fitments: Fitment[] | undefined, exclude = ""): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const hay = exclude.toLowerCase();
  for (const f of fitments ?? []) {
    const name = shortCarName(f);
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (hay && hay.includes(f.model.trim().toLowerCase())) continue;
    out.push(name);
  }
  return out;
}

/** "Virtus", "Virtus & Slavia", "Fortuner, Hilux & Land Cruiser". */
export function joinCars(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

// ─── Product title / description ─────────────────────────────────────

export interface ProductSeoInput {
  name: string;
  description?: string | null;
  fitments?: Fitment[];
  /** Lowest price a shopper pays today (sale price where there is one). */
  price: number | null;
}

/** Filler the title can lose before it loses anything a shopper searches for. */
const FILLER = /\b(?:dedicated|aftermarket|premium|imported|stylish|quality)\b\s*/gi;

/**
 * "{Name} for {Car} | SV Car Customs", ≤60 characters. When it doesn't fit,
 * filler words go first, then a trailing "(…)", then the extra cars, and the
 * name is only cut as a last resort — the brand suffix stays, because brand
 * searches are the ones that convert.
 */
export function productSeoTitle(p: Pick<ProductSeoInput, "name" | "fitments">): string {
  const core = cleanProductName(p.name);
  const cars = carNames(p.fitments, core);
  // Variants listed as separate products ("Borla … | Dual Tip (Carbon)" and
  // "… (Burnt)") would otherwise share one title; their finish goes first.
  const tag = variantTag(p.name);
  if (tag) {
    const tagged = [...(cars.length > 0 ? [`${core} – ${tag} for ${joinCars(cars)}`] : []), `${core} – ${tag}`];
    for (const t of tagged) {
      if (`${t}${SUFFIX}`.length <= TITLE_MAX) return `${t}${SUFFIX}`;
    }
    // Still too long: the make is the cheapest word to lose ("Toyota Land
    // Cruiser…" → "Land Cruiser…"), the variant itself the most expensive.
    const makes = [...new Set((p.fitments ?? []).map((f) => f.make.trim()).filter(Boolean))];
    const noMake = makes.reduce((s, m) => s.replace(new RegExp(`^${m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+`, "i"), ""), core);
    for (const t of [`${core} – ${tag}`, `${noMake} – ${tag}`]) {
      if (t.length <= TITLE_MAX) return t;
    }
  }
  const stripped = core
    .replace(FILLER, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s+\)/g, ")")
    .replace(/\s{2,}/g, " ")
    .trim();
  const noParen = stripped.replace(/\s*\([^)]*\)\s*$/, "").trim();
  const withCars = (v: string) => [
    ...(cars.length > 0 ? [`${v} for ${joinCars(cars)}`] : []),
    ...(cars.length > 1 ? [`${v} for ${cars[0]}`] : []),
    v,
  ];
  const branded = [...withCars(core), ...withCars(stripped)].map((t) => `${t}${SUFFIX}`);
  // Google prints the site name above every result, so a full product name
  // without the suffix beats a cut one with it.
  const bare = [...withCars(core), ...withCars(stripped)];
  const last = [...withCars(noParen).map((t) => `${t}${SUFFIX}`), ...withCars(noParen)];
  for (const t of [...branded, ...bare, ...last]) {
    if (t.length <= TITLE_MAX) return t;
  }
  return clampWords(noParen || core, TITLE_MAX);
}

/** Finish words the catalogue uses to tell otherwise identical listings apart. */
const FINISH =
  /\b(?:(?:copy|real|forged)\s+)?carbon\s+fib(?:re|er)\b|\bforged\s+carbon\b|\bburnt\b|\bglossy\s+black\b|\bmatte\s+black\b/i;

const norm = (s: string) => s.toLowerCase().replace(/fiber/g, "fibre").replace(/\s+/g, " ");

/**
 * The variant a name's sub-title states ("… | Dual Tip (Carbon)" → "Carbon",
 * "… | Copy Carbon Fiber" → "Copy Carbon Fiber"), or "" when it states none or
 * the main name already says it. Only ever text the catalogue name holds.
 */
export function variantTag(name: string): string {
  const parts = name.split(/\s+\|\s+/);
  if (parts.length < 2) return "";
  const sub = parts.slice(1).join(" ");
  const paren = sub.match(/\(([^)]{2,30})\)/)?.[1];
  const raw = paren ?? sub.match(FINISH)?.[0] ?? "";
  if (!raw) return "";
  const tag = tidyName(raw);
  return norm(cleanProductName(name)).includes(norm(tag)) ? "" : tag;
}

/**
 * The on-page <h1>: the cleaned name, its variant, and the cars it fits that
 * the name doesn't already mention — "Borla Valvetronic Exhaust – Carbon",
 * "Maruti Copy Carbon Fibre Steering Wheel for Swift, Fronx & Baleno". Uses
 * the same tidy name as the <title>, so the two agree.
 */
export function productHeading(p: Pick<ProductSeoInput, "name" | "fitments">): string {
  const core = cleanProductName(p.name);
  const tag = variantTag(p.name);
  const cars = carNames(p.fitments, core);
  return `${core}${tag ? ` – ${tag}` : ""}${cars.length > 0 ? ` for ${joinCars(cars)}` : ""}`;
}

/** First sentence-ish chunk of the catalogue description, cleaned for a snippet. */
function lead(description: string | null | undefined): string {
  const text = (description ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/[•▪●]\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  const m = text.match(/^.*?[.!?](?=\s|$)/);
  return (m ? m[0] : text).trim();
}

export interface StoreTerms {
  /** True when checkout charges no delivery fee on any order. */
  freeDelivery: boolean;
}

/** The store-wide offer line, only with what /shipping actually promises. */
export function offerLine(terms: StoreTerms): string {
  return terms.freeDelivery ? "Free delivery across India, COD available." : "Pan-India delivery, COD available.";
}

/**
 * "{Name} for {Car} at ₹X. Free delivery across India, COD available. {lead}"
 * — price and offer first, so they survive Google's cut on mobile.
 */
export function productSeoDescription(p: ProductSeoInput, terms: StoreTerms): string {
  const core = cleanProductName(p.name);
  const cars = carNames(p.fitments, core);
  const subject = cars.length > 0 ? `${core} for ${joinCars(cars)}` : core;
  const priced = p.price != null && p.price > 0 ? `${subject} at ${inr(p.price)}.` : `${subject}.`;
  const head = `${priced} ${offerLine(terms)}`;
  const rest = lead(p.description);
  const full = rest ? `${head} ${rest}` : head;
  if (full.length <= DESCRIPTION_MAX) return full;
  if (head.length <= DESCRIPTION_MAX) {
    const room = DESCRIPTION_MAX - head.length - 1;
    // A clipped lead shorter than a few words reads as noise — drop it instead.
    if (rest && room >= 40) return `${head} ${clampWords(rest, room - 1)}…`;
    return head;
  }
  return clampWords(head, DESCRIPTION_MAX);
}

// ─── Categories ──────────────────────────────────────────────────────

/** Admin category names are inconsistent ("VIRTUS / SLAVIA", "Bmw", "EXHAUSTS"). */
export function categoryDisplayName(slug: string, name: string): string {
  const car = CAR_CATEGORIES.find((c) => c.slug === slug);
  if (car) return car.label;
  return name
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => tidyCase(w, i === 0))
    .join(" ");
}

/**
 * What a category holds, in a few words, for the categories Search Console
 * shows impressions for. Each phrase only names product types that are listed
 * in that category today — update it when the range changes. Every other
 * category is described from its data alone.
 */
const CATEGORY_RANGE: Record<string, { title?: string; range: string }> = {
  "steering-wheels": {
    title: "Carbon Fibre Car Steering Wheels",
    range: "real carbon fibre and copy carbon steering wheels",
  },
  polo: {
    title: "VW Polo Car Accessories Online in India",
    range:
      "Volkswagen Polo accessories: Audi Q2-style LED tail lights, a GTI-style front splitter, headlight eyelids, M-style mirror caps, window louvers, gloss black logos and an arm rest",
  },
  "virtus-slavia": {
    title: "Virtus & Slavia Body Kits & Accessories",
    range:
      "body kits and styling parts for the VW Virtus and Skoda Slavia: front splitters, side skirts, rear diffusers, spoilers, headlight eyelids, window louvers, mirror caps and paddle shifters",
  },
  "body-kits": { title: "Car Body Kits Online in India", range: "complete car body kits" },
  thar: {
    title: "Mahindra Thar Accessories Online",
    range:
      "Mahindra Thar accessories: G-Wagon-style AC vents, a 7-slot grille, tail lamps, an LED tail-light spoiler, door hinges, grab handles and a utility box with side ladder",
  },
  universal: {
    title: "Universal Car Accessories",
    range:
      "universal-fit car accessories: splitters, spoilers, a rear diffuser, ambient and LED lights, car mats, a steering wheel cover and handle grips",
  },
  "exhaust-tips": { title: "Carbon Fibre Car Exhaust Tips", range: "carbon fibre and forged carbon dual exhaust tips" },
  spoilers: { title: "Car Spoilers Online in India", range: "ABS spoilers, universal and car-specific" },
  "paddle-shifters": { title: "Paddle Shifters & Extenders", range: "metal and ABS paddle shifters and extenders" },
};

export interface CategoryFacts {
  slug: string;
  name: string;
  /** Products in the category (subtree), or null when unknown. */
  count: number | null;
  /** Lowest price in the category today. */
  minPrice: number | null;
  /** Fitments of the category's products (any order; repeats count as weight). */
  fitments: Fitment[];
}

/** Car names across a category's products, most frequent first. */
export function categoryCars(fitments: Fitment[]): string[] {
  const counts = new Map<string, { name: string; n: number; first: number }>();
  fitments.forEach((f, i) => {
    const name = shortCarName(f);
    const key = name.toLowerCase();
    const cur = counts.get(key);
    if (cur) cur.n += 1;
    else counts.set(key, { name, n: 1, first: i });
  });
  return [...counts.values()].sort((a, b) => b.n - a.n || a.first - b.first).map((c) => c.name);
}

function carCategory(slug: string): CarCategory | undefined {
  return CAR_CATEGORIES.find((c) => c.slug === slug);
}

/** "Fortuner, Polo & Thar and more" — `max` names, then "and more" if any were left out. */
function carList(cars: string[], max: number): string {
  const shown = cars.slice(0, max);
  return `${joinCars(shown)}${cars.length > shown.length ? " and more" : ""}`;
}

export function categorySeoTitle(f: Pick<CategoryFacts, "slug" | "name">): string {
  const display = categoryDisplayName(f.slug, f.name);
  const head =
    CATEGORY_RANGE[f.slug]?.title ??
    (carCategory(f.slug) ? `${display} Car Accessories` : `${display} – Buy Online in India`);
  const fits = `${head}${SUFFIX}`;
  if (fits.length <= TITLE_MAX) return fits;
  return `${clampWords(head, TITLE_MAX - SUFFIX.length)}${SUFFIX}`;
}

/**
 * The 2–3 sentence intro shown under the category heading, e.g. "11 products —
 * real carbon fibre and copy carbon steering wheels, for Fortuner, Polo… and
 * more. Prices from ₹1,999. Free delivery across India, COD available."
 */
export function categoryIntro(f: CategoryFacts, terms: StoreTerms): string {
  const display = categoryDisplayName(f.slug, f.name);
  const range = CATEGORY_RANGE[f.slug]?.range;
  const cars = categoryCars(f.fitments);
  const count = f.count != null && f.count > 0 ? f.count : null;
  const products = count ? `${count} ${count === 1 ? "product" : "products"}` : "";

  let first: string;
  if (range) {
    // The hand-written range of a car category already names the car.
    const forCars = carCategory(f.slug) || cars.length === 0 ? "" : `, for ${carList(cars, 6)}`;
    first = `${products ? `${products} — ` : ""}${range}${forCars}`;
  } else if (carCategory(f.slug)) {
    const forCars = cars.length > 0 ? `the ${carList(cars, 6)}` : `your ${display}`;
    first = `${products || "Accessories"} for ${forCars}`;
  } else {
    first = `${products ? `${products} in ${display}` : display}${cars.length > 0 ? `, for ${carList(cars, 6)}` : ""}`;
  }
  const sentences = [`${first[0].toUpperCase()}${first.slice(1)}.`];
  if (f.minPrice != null && f.minPrice > 0) sentences.push(`Prices from ${inr(f.minPrice)}.`);
  sentences.push(offerLine(terms));
  return sentences.join(" ");
}

export function categorySeoDescription(f: CategoryFacts, terms: StoreTerms): string {
  const display = categoryDisplayName(f.slug, f.name);
  const car = carCategory(f.slug);
  const cars = categoryCars(f.fitments);
  const range = CATEGORY_RANGE[f.slug]?.range;
  const what = range ?? (car ? `${display} car accessories` : display);
  const price = f.minPrice != null && f.minPrice > 0 ? ` From ${inr(f.minPrice)}.` : "";
  const tail = `${price} ${offerLine(terms)}`;
  // A car category's range already names the car; for the rest, as many fitted
  // cars as fit — a full short list reads better than a long one cut off.
  const names = range && car ? [] : cars.filter((n) => !what.toLowerCase().includes(n.toLowerCase()));
  for (let n = Math.min(names.length, 5); n >= 0; n--) {
    const lead = `Shop ${what}${n > 0 ? ` for ${joinCars(names.slice(0, n))}` : ""}.`;
    if (lead.length + tail.length <= DESCRIPTION_MAX) return `${lead}${tail}`;
  }
  return `${clampWords(`Shop ${what}`, DESCRIPTION_MAX - tail.length - 1)}…${tail}`;
}

/**
 * The car categories a category's products fit, for the "Shop by car" links on
 * a category page (e.g. Steering wheels → Polo, Thar, Hilux, Maruti). Model
 * matches win over make matches, as on the PDP.
 */
export function relatedCarCategorySlugs(fitments: Fitment[], selfSlug: string): string[] {
  const out: string[] = [];
  const norm = (s: string) => s.trim().toLowerCase();
  for (const f of fitments) {
    const car =
      CAR_CATEGORIES.find((c) => c.models?.includes(norm(f.model))) ??
      CAR_CATEGORIES.find((c) => c.makes?.includes(norm(f.make)));
    if (car && car.slug !== selfSlug && !out.includes(car.slug)) out.push(car.slug);
  }
  return out;
}

/**
 * A category's facts from what the page already fetched: its first product
 * page (prices, slugs) and the cached Merchant feed (fitments by slug — the
 * listing endpoint doesn't carry them). Either may be missing; the copy then
 * just says less.
 */
export function categoryFactsFrom(
  category: { slug: string; name: string },
  page: { items: Array<{ slug: string; minPrice: number }>; total?: number | null } | null,
  feedItems: Array<{ slug: string; fitments: string[] }> | null | undefined,
): CategoryFacts {
  const items = page?.items ?? [];
  const bySlug = new Map((feedItems ?? []).map((p) => [p.slug, p.fitments] as const));
  const prices = items.map((p) => Number(p.minPrice)).filter((n) => Number.isFinite(n) && n > 0);
  return {
    slug: category.slug,
    name: category.name,
    count: page ? (page.total ?? items.length) : null,
    minPrice: prices.length > 0 ? Math.min(...prices) : null,
    fitments: items.flatMap((p) => (bySlug.get(p.slug) ?? []).map(splitFitmentLabel)),
  };
}
