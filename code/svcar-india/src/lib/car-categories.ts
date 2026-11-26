import type { Category, Fitment } from "@svcar/contracts";

/**
 * The car-model categories in the live catalogue, in the order the storefront
 * shows them (biggest range first). The public category list carries no
 * product counts and the taxonomy is admin-editable, so this is a display map
 * keyed by slug: a category that doesn't exist (or is archived) is skipped, and
 * a new car category the admin adds simply isn't in the row until listed here.
 *
 * `makes` / `models` are the fitment strings (lower-cased) that put a product
 * in that car's category for the PDP "More for your <car>" row.
 */
export interface CarCategory {
  slug: string;
  /** Chip label — the admin names are inconsistent ("VIRTUS / SLAVIA", "Bmw"). */
  label: string;
  makes?: string[];
  models?: string[];
}

export const CAR_CATEGORIES: readonly CarCategory[] = [
  { slug: "virtus-slavia", label: "Virtus / Slavia", models: ["virtus", "slavia"] },
  { slug: "thar", label: "Thar", models: ["thar", "thar roxx"] },
  { slug: "polo", label: "Polo", models: ["polo"] },
  { slug: "bmw", label: "BMW", makes: ["bmw"] },
  { slug: "audi", label: "Audi", makes: ["audi"] },
  { slug: "honda", label: "Honda", makes: ["honda"] },
  { slug: "hilux", label: "Hilux", models: ["hilux"] },
  { slug: "maruti", label: "Maruti", makes: ["maruti suzuki", "maruti"] },
  { slug: "skoda", label: "Skoda", makes: ["skoda", "škoda"] },
  { slug: "verna-2023", label: "Verna", models: ["verna"] },
];

export interface ResolvedCarCategory extends CarCategory {
  /** The live category record (id, admin name) the slug resolved to. */
  category: Category;
}

const norm = (s: string) => s.trim().toLowerCase();

/** Car categories that exist in `categories`, in display order. */
export function pickCarCategories(categories: Category[]): ResolvedCarCategory[] {
  const bySlug = new Map(
    categories.filter((c) => c.status !== "archived").map((c) => [c.slug, c] as const),
  );
  return CAR_CATEGORIES.flatMap((car) => {
    const category = bySlug.get(car.slug);
    return category ? [{ ...car, category }] : [];
  });
}

/**
 * The car category a product's fitment list belongs to, plus the fitment row
 * that matched (so the PDP can say "More for your Virtus", not the category's
 * "Virtus / Slavia"). Model matches win over make matches — a Slavia part goes
 * to Virtus / Slavia, not Skoda — and earlier fitment rows win over later ones.
 */
export function carCategoryForFitments(
  fitments: Fitment[] | undefined,
  categories: Category[],
): { car: ResolvedCarCategory; fitment: Fitment } | null {
  const rows = fitments ?? [];
  if (rows.length === 0) return null;
  const cars = pickCarCategories(categories);

  for (const fitment of rows) {
    const model = norm(fitment.model);
    const car = cars.find((c) => c.models?.includes(model));
    if (car) return { car, fitment };
  }
  for (const fitment of rows) {
    const make = norm(fitment.make);
    const car = cars.find((c) => c.makes?.includes(make));
    if (car) return { car, fitment };
  }
  return null;
}
