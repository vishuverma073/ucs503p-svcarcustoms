import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { __clearMemCache } from "../src/lib/cache.js";
import type { DbClient } from "../src/db/client.js";

// Cached routes share a process-global store; reset it so cases don't leak.
beforeEach(() => __clearMemCache());

const listRow = {
  id: 1,
  categoryId: 1,
  name: "Lavender Single Bowl",
  slug: "lavender-single-bowl",
  status: "active" as const,
  isBestseller: true,
  isNew: false,
  tags: ["Imported"],
  skus: [
    { price: "3060", salePrice: "2100", dimensionValues: { Size: "18×16" } },
    { price: "4200", salePrice: null, dimensionValues: { Size: "24×20" } },
  ],
  dimensions: [
    {
      name: "Size",
      sortOrder: 0,
      values: [
        { value: "18×16", sortOrder: 0 },
        { value: "24×20", sortOrder: 1 },
      ],
    },
  ],
  images: [{ url: "/a.png", sortOrder: 0 }],
};

const detailRow = {
  ...listRow,
  description: "Premium sink",
  specifications: null,
  includedAccessories: null,
  images: [{ url: "/a.png", alt: null, sortOrder: 0 }],
  dimensions: [
    { id: 1, name: "Size", sortOrder: 0, values: [{ id: 1, value: "18x16", label: null, sortOrder: 0 }] },
  ],
  skus: [
    {
      id: 1,
      skuCode: "LAV-1",
      price: "3060",
      salePrice: "2100",
      dimensionValues: { Size: "18x16" },
      attributes: null,
      stock: null,
    },
  ],
  createdAt: new Date(),
  updatedAt: new Date(),
};

function mockDb(
  opts: {
    findMany?: unknown[];
    findFirst?: unknown;
    /** Ids from the recursive category-tree query (db.execute). */
    execIds?: number[];
    /** Successive db.execute results, consumed in order (pins, then sales rank). */
    execSequence?: unknown[][];
    /** Product ids cross-listed via product_categories (db.selectDistinct). */
    crossIds?: number[];
    /** Category row returned by the slug lookup; omit for default active root. */
    categoryRoot?: { id: number; status: "active" | "archived" } | null;
  } = {},
): DbClient {
  const categoryRoot =
    opts.categoryRoot === undefined ? { id: 1, status: "active" as const } : opts.categoryRoot;
  return {
    select: () => ({
      from: () => ({
        where: () => {
          const count = opts.findMany?.length ?? 0;
          return {
            limit: async () => (categoryRoot ? [categoryRoot] : []),
            then(onFulfilled: (v: { count: number }[]) => unknown) {
              return Promise.resolve([{ count }]).then(onFulfilled);
            },
          };
        },
      }),
    }),
    selectDistinct: () => ({
      from: () => ({
        where: async () => (opts.crossIds ?? []).map((id) => ({ id })),
      }),
    }),
    query: {
      products: {
        findMany: async () => opts.findMany ?? [],
        findFirst: async () => opts.findFirst,
      },
    },
    execute: async () =>
      opts.execSequence ? (opts.execSequence.shift() ?? []) : (opts.execIds ?? []).map((id) => ({ id })),
  } as unknown as DbClient;
}

describe("GET /products", () => {
  it("400 for an out-of-range limit", async () => {
    const res = await createApp({ db: mockDb() }).request("/products?limit=999");
    expect(res.status).toBe(400);
  });

  it("returns list items with computed price range + best discount", async () => {
    const res = await createApp({ db: mockDb({ findMany: [listRow] }) }).request("/products");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: any[]; nextCursor: number | null };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      minPrice: 2100, // min(sale 2100, base 4200)
      maxBasePrice: 4200,
      bestDiscount: 31, // (1 - 2100/3060) * 100 ≈ 31
      image: "/a.png",
      sizes: ["18×16", "24×20"],
    });
    expect(body.nextCursor).toBeNull();
  });

  it("orders the bestseller rail by sales rank rather than by id", async () => {
    const db = mockDb({
      // findMany hands rows back in id order; the rail must not.
      findMany: [
        { ...listRow, id: 1, slug: "a", name: "A" },
        { ...listRow, id: 2, slug: "b", name: "B" },
      ],
      execSequence: [
        [], // nothing pinned
        [
          { id: 2, units: 9, score: 9 },
          { id: 1, units: 1, score: 1 },
        ],
      ],
    });
    const res = await createApp({ db }).request("/products?bestseller=1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { id: number }[] };
    expect(body.items.map((i) => i.id)).toEqual([2, 1]);
  });

  it("returns an empty bestseller rail when nothing is pinned and nothing has sold", async () => {
    const db = mockDb({ findMany: [listRow], execSequence: [[], []] });
    const res = await createApp({ db }).request("/products?bestseller=1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[]; nextCursor: number | null };
    expect(body).toEqual({ items: [], nextCursor: null });
  });
});

describe("GET /products/:slug", () => {
  it("returns the full product detail", async () => {
    const res = await createApp({ db: mockDb({ findFirst: detailRow }) }).request(
      "/products/lavender-single-bowl",
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      slug: string;
      skus: unknown[];
      dimensions: unknown[];
      structuredData: { "@type": string; offers: { priceCurrency: string; price: number } };
    };
    expect(body.slug).toBe("lavender-single-bowl");
    expect(body.skus).toHaveLength(1);
    expect(body.dimensions).toHaveLength(1);
    // Phase 6: schema.org JSON-LD precomputed for the FE.
    expect(body.structuredData["@type"]).toBe("Product");
    expect(body.structuredData.offers).toMatchObject({ priceCurrency: "INR", price: 2100 });
  });

  it("404 for an unknown / non-active slug", async () => {
    const res = await createApp({ db: mockDb({ findFirst: undefined }) }).request("/products/nope");
    expect(res.status).toBe(404);
  });
});

describe("GET /products/by-category/:slug", () => {
  it("returns products from the resolved category subtree", async () => {
    const res = await createApp({
      db: mockDb({ execIds: [1, 5], crossIds: [7], findMany: [listRow] }),
    }).request("/products/by-category/kitchen-sinks");
    expect(res.status).toBe(200);
    expect((await res.json()).items).toHaveLength(1);
  });

  // Both branches of the cross-listing widen must resolve. The live outage was a
  // 500 from this lookup on every category; a fake db can't reproduce the driver
  // fault behind it, so this only pins that both paths stay reachable.
  it("returns 200 whether or not the category has cross-listed products", async () => {
    for (const crossIds of [[], [7, 9]]) {
      const res = await createApp({
        db: mockDb({ execIds: [1, 5], crossIds, findMany: [listRow] }),
      }).request("/products/by-category/kitchen-sinks");
      expect(res.status).toBe(200);
    }
  });

  it("resolves ?category= without error when the category has cross-listed products", async () => {
    const res = await createApp({
      db: mockDb({ execIds: [1], crossIds: [7], findMany: [listRow] }),
    }).request("/products?category=kitchen-sinks");
    expect(res.status).toBe(200);
  });

  it("returns [] for an unknown category slug", async () => {
    const res = await createApp({ db: mockDb({ categoryRoot: null }) }).request(
      "/products/by-category/nope",
    );
    expect(res.status).toBe(200);
    expect((await res.json()).items).toEqual([]);
  });
});
