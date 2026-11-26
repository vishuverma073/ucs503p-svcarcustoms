import { describe, it, expect } from "vitest";
import type { ProductListItem } from "@svcar/contracts";
import {
  SEARCH_PAGE_SIZE,
  appendSearchResults,
  isSearchCapped,
  toSearchResults,
} from "./search-results";

function item(id: number, overrides: Partial<ProductListItem> = {}): ProductListItem {
  return {
    id,
    name: `Product ${id}`,
    slug: `product-${id}`,
    categoryId: 1,
    image: `/p${id}.webp`,
    minPrice: 1000,
    maxBasePrice: 1500,
    bestDiscount: 33,
    isBestseller: false,
    isNew: false,
    isFeatured: false,
    status: "active",
    tags: [],
    sizes: [],
    ...overrides,
  };
}

describe("search-results", () => {
  it("asks for the API's largest page", () => {
    expect(SEARCH_PAGE_SIZE).toBe(50);
  });

  it("maps a list item to the fields a result card shows", () => {
    expect(toSearchResults([item(7, { image: "", isBestseller: true })])).toEqual([
      {
        id: 7,
        name: "Product 7",
        slug: "product-7",
        minPrice: 1000,
        maxBasePrice: 1500,
        discount: 33,
        image: "",
        isBestseller: true,
        isNew: false,
      },
    ]);
  });

  it("passes skuCount through only when the API sends it", () => {
    expect(toSearchResults([item(8, { skuCount: 3 })])[0]?.skuCount).toBe(3);
    expect(toSearchResults([item(9)])[0]).not.toHaveProperty("skuCount");
  });

  it("appends the next page without repeating a row already shown", () => {
    const first = toSearchResults([item(1), item(2)]);
    const next = toSearchResults([item(2), item(3)]);
    expect(appendSearchResults(first, next).map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it("flags a 20-row list with no cursor as capped when more was requested", () => {
    const twenty = Array.from({ length: 20 }, (_, i) => item(i + 1));
    expect(isSearchCapped({ items: twenty, nextCursor: null }, SEARCH_PAGE_SIZE)).toBe(true);
  });

  it("does not flag a list the API paginates or one shorter than the cap", () => {
    const twenty = Array.from({ length: 20 }, (_, i) => item(i + 1));
    expect(isSearchCapped({ items: twenty, nextCursor: 20 }, SEARCH_PAGE_SIZE)).toBe(false);
    expect(isSearchCapped({ items: twenty.slice(0, 5), nextCursor: null }, SEARCH_PAGE_SIZE)).toBe(false);
    expect(isSearchCapped({ items: twenty, nextCursor: null }, 20)).toBe(false);
  });
});
