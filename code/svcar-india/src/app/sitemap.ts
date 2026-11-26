import type { MetadataRoute } from "next";
import { backend } from "@/lib/backend";
import type { ProductListItem } from "@svcar/contracts";
import { collectActiveCategorySlugs } from "@/lib/category-tree";
import { isDuplicateProductSlug } from "@/lib/duplicate-products";

// Google selected this as the canonical production origin. Keep sitemap URLs
// independent of deployment/preview environment variables so none point at the
// apex-domain redirect.
const CANONICAL_ORIGIN = "https://www.svcarcustoms.in";

/**
 * Sitemap = static pages + every category (roots + children) + every active
 * product. The backend fetches are wrapped in try/catch: during a mock-mode
 * build the API isn't reachable in build workers, so we degrade to the static
 * pages rather than failing the build. With the real API (or `next dev`) the
 * full sitemap is produced.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // No lastModified: the catalogue API doesn't expose an updated-at, and
  // stamping every URL with the time the sitemap was generated tells Google
  // nothing (it learns to ignore a site's lastmod when it's always "now").
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${CANONICAL_ORIGIN}/`, changeFrequency: "daily", priority: 1.0 },
    { url: `${CANONICAL_ORIGIN}/shop`, changeFrequency: "daily", priority: 0.9 },
    { url: `${CANONICAL_ORIGIN}/about`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${CANONICAL_ORIGIN}/contact`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${CANONICAL_ORIGIN}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${CANONICAL_ORIGIN}/refund`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${CANONICAL_ORIGIN}/terms`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${CANONICAL_ORIGIN}/shipping`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${CANONICAL_ORIGIN}/faq`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${CANONICAL_ORIGIN}/track`, changeFrequency: "yearly", priority: 0.3 },
  ];

  const categoryEntries: MetadataRoute.Sitemap = [];
  const productEntries: MetadataRoute.Sitemap = [];
  // Category ids that hold at least one active product (primary or cross-listed).
  const stocked = new Set<number | string>();
  let productsLoaded = false;

  try {
    // The public endpoint returns active products only. Continue until its
    // cursor is exhausted: a fixed page-count guard can omit catalog URLs.
    const seen = new Set<string>();
    let cursor: number | undefined = undefined;
    do {
      // The catalog API's maximum page size is 50.
      const page = await backend.listProducts({ limit: 50, cursor });
      for (const p of page.items as ProductListItem[]) {
        stocked.add(p.categoryId);
        for (const id of p.categoryIds ?? []) stocked.add(id);
        // Copies of another listing are noindex with a canonical to the
        // primary; listing them here would contradict that.
        if (isDuplicateProductSlug(p.slug)) continue;
        if (!seen.has(p.slug)) {
          seen.add(p.slug);
          productEntries.push({
            url: `${CANONICAL_ORIGIN}/product/${p.slug}`,
            changeFrequency: "weekly",
            priority: 0.8,
          });
        }
      }
      if (page.nextCursor == null) break;
      cursor = page.nextCursor;
    } while (true);
    productsLoaded = true;
  } catch {
    // API unreachable (mock-mode build) — retain the entries gathered above.
  }

  try {
    const allCategories = await backend.getAllCategories();
    // A category page lists its whole subtree, so a parent counts as stocked
    // when any descendant is.
    const parentOf = new Map(allCategories.map((c) => [c.id, c.parentId] as const));
    for (const id of [...stocked]) {
      let parent = parentOf.get(id as never);
      while (parent != null && !stocked.has(parent)) {
        stocked.add(parent);
        parent = parentOf.get(parent as never);
      }
    }
    const bySlug = new Map(allCategories.map((c) => [c.slug, c] as const));
    for (const slug of collectActiveCategorySlugs(allCategories)) {
      // Empty categories are noindex (see category/[slug]/page.tsx) — listing
      // them here would contradict that. If products couldn't be read, keep all.
      const cat = bySlug.get(slug);
      if (productsLoaded && cat && !stocked.has(cat.id)) continue;
      categoryEntries.push({
        url: `${CANONICAL_ORIGIN}/category/${slug}`,
        changeFrequency: "weekly",
        priority: 0.9,
      });
    }
  } catch {
    // Keep the public sitemap available if categories cannot be read.
  }

  return [...staticPages, ...categoryEntries, ...productEntries];
}
