import { backend } from "@/lib/backend";
import { SHOP_HREF } from "@/lib/shop-nav";

export type CategoryShortcut = { slug: string; name: string };

/**
 * Root categories for shortcuts (404, search idle, browse-all links).
 * Uses full shop nav tree when available.
 */
export async function getCategoryShortcuts(limit = 4): Promise<CategoryShortcut[]> {
  const shopNav = await backend.getShopNav().catch(() => null);
  if (shopNav && shopNav.tree.length > 0) {
    return shopNav.tree.slice(0, limit).map((c) => ({ slug: c.slug, name: c.name }));
  }

  const all = await backend.getCategories().catch(() => []);
  return all
    .filter((c) => c.parentId == null)
    .slice(0, limit)
    .map((c) => ({ slug: c.slug, name: c.name }));
}

/**
 * Admin-composed CTA links (hero, promo) stay editable, but a blank link or a
 * bare /search (the old default, which opens an empty search box) lands on the
 * all-products page instead. A real search with a query is left alone.
 */
export function resolveCtaHref(href: string | null | undefined, fallback = SHOP_HREF): string {
  const trimmed = href?.trim() ?? "";
  if (!trimmed) return fallback;
  if (/^\/search\/?(\?(q=)?)?$/.test(trimmed)) return fallback;
  return trimmed;
}
