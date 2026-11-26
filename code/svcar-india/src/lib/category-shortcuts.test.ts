import { describe, it, expect, vi, beforeEach } from "vitest";
import { getCategoryShortcuts, resolveCtaHref } from "./category-shortcuts";

vi.mock("@/lib/backend", () => ({
  backend: {
    getShopNav: vi.fn(),
    getCategories: vi.fn(),
  },
}));

import { backend } from "@/lib/backend";

describe("category-shortcuts", () => {
  beforeEach(() => {
    vi.mocked(backend.getShopNav).mockReset();
    vi.mocked(backend.getCategories).mockReset();
  });

  it("prefers shop nav roots in order", async () => {
    vi.mocked(backend.getShopNav).mockResolvedValue({
      tree: [
        { id: 2, slug: "bathroom-accessories", name: "Bathroom", parentId: null, children: [] },
        { id: 1, slug: "kitchen-sinks", name: "Kitchen Sinks", parentId: null, children: [] },
      ],
      featuredIds: [],
      flatCount: 2,
      usedFallback: false,
    } as never);

    await expect(getCategoryShortcuts(2)).resolves.toEqual([
      { slug: "bathroom-accessories", name: "Bathroom" },
      { slug: "kitchen-sinks", name: "Kitchen Sinks" },
    ]);
  });

  it("falls back to root categories when the nav tree is empty", async () => {
    vi.mocked(backend.getShopNav).mockResolvedValue({
      tree: [],
      featuredIds: [],
      flatCount: 0,
      usedFallback: false,
    });
    vi.mocked(backend.getCategories).mockResolvedValue([
      { id: 1, slug: "polo", name: "Polo", parentId: null } as never,
      { id: 2, slug: "polo-grilles", name: "Grilles", parentId: 1 } as never,
    ]);

    await expect(getCategoryShortcuts(4)).resolves.toEqual([{ slug: "polo", name: "Polo" }]);
  });
});

describe("resolveCtaHref", () => {
  it("sends blank and bare-search links to the shop page", () => {
    expect(resolveCtaHref("")).toBe("/shop");
    expect(resolveCtaHref(undefined)).toBe("/shop");
    expect(resolveCtaHref("  ")).toBe("/shop");
    expect(resolveCtaHref("/search")).toBe("/shop");
    expect(resolveCtaHref("/search/")).toBe("/shop");
    expect(resolveCtaHref("/search?")).toBe("/shop");
    expect(resolveCtaHref("/search?q=")).toBe("/shop");
  });

  it("keeps admin links that lead somewhere", () => {
    expect(resolveCtaHref("/category/virtus-slavia")).toBe("/category/virtus-slavia");
    expect(resolveCtaHref("/search?q=spoiler")).toBe("/search?q=spoiler");
    expect(resolveCtaHref("https://instagram.com/svcarcustoms")).toBe("https://instagram.com/svcarcustoms");
  });

  it("uses the given fallback", () => {
    expect(resolveCtaHref("/search", "/category/thar")).toBe("/category/thar");
  });
});
