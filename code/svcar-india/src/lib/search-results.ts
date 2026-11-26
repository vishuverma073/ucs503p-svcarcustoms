import { SEARCH_DEFAULT_LIMIT, SEARCH_MAX_LIMIT, type ProductListItem } from "@svcar/contracts";

/**
 * Pure helpers behind /search: what the page asks the API for, how a list item
 * becomes a result row, and how to tell a short list from a cut one.
 */

/** Page size /search asks for — the API's maximum, so one request covers most queries. */
export const SEARCH_PAGE_SIZE = SEARCH_MAX_LIMIT;

/** What a result card on /search needs from a list item. */
export interface SearchResult {
  id: number;
  name: string;
  slug: string;
  minPrice: number;
  maxBasePrice: number;
  discount: number;
  image: string;
  isBestseller: boolean;
  isNew: boolean;
  /** Only when the endpoint sends it; feeds the card's "From" rule. */
  skuCount?: number;
}

export function toSearchResults(items: ProductListItem[]): SearchResult[] {
  return items.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    minPrice: p.minPrice,
    maxBasePrice: p.maxBasePrice,
    discount: p.bestDiscount,
    image: p.image,
    isBestseller: p.isBestseller,
    isNew: p.isNew,
    ...(p.skuCount !== undefined ? { skuCount: p.skuCount } : {}),
  }));
}

/**
 * Append the next page to what is already shown. The cursor is a rank offset,
 * so a catalogue edit between pages can shift a product across the boundary;
 * a row already on screen is not repeated.
 */
export function appendSearchResults(current: SearchResult[], next: SearchResult[]): SearchResult[] {
  const seen = new Set(current.map((r) => r.id));
  return [...current, ...next.filter((r) => !seen.has(r.id))];
}

/**
 * True when the list looks cut by an API that ignores `limit`: exactly its
 * default page, no next cursor, while more was asked for. The deployed API
 * behaved this way before limit/cursor landed, hiding every result past the
 * 20th; the page then says so instead of presenting the list as complete. On
 * the new API a query with exactly 20 matches trips this too, which only costs
 * a harmless note.
 */
export function isSearchCapped(
  page: { items: unknown[]; nextCursor: number | null },
  requested: number,
): boolean {
  return (
    page.nextCursor == null &&
    requested > SEARCH_DEFAULT_LIMIT &&
    page.items.length === SEARCH_DEFAULT_LIMIT
  );
}
