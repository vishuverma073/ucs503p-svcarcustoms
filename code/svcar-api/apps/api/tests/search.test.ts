import { describe, expect, it } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { createApp } from "../src/app.js";
import type { DbClient } from "../src/db/client.js";

const productRow = {
  id: 1,
  categoryId: 1,
  name: "Lavender Single Bowl",
  slug: "lavender-single-bowl",
  status: "active" as const,
  isBestseller: true,
  isNew: false,
  tags: ["Imported"],
  skus: [{ price: "3060", salePrice: "2100" }],
  images: [{ url: "/a.png", sortOrder: 0 }],
};

/** A row per id so a ranked page can be looked up. */
function rowsFor(ids: number[]) {
  return ids.map((id) => ({ ...productRow, id, slug: `product-${id}` }));
}

type SearchBody = { items: { slug: string; minPrice: number }[]; nextCursor: number | null };

/**
 * The FTS query is raw SQL, so the mock records what it was asked for. The last
 * two bound params are LIMIT (page + 1) and OFFSET (cursor).
 */
function mockDb(opts: { rankedIds?: number[]; findMany?: unknown[] } = {}) {
  const queries: { sql: string; params: unknown[] }[] = [];
  const db = {
    execute: async (query: SQL) => {
      queries.push(new PgDialect().sqlToQuery(query));
      return (opts.rankedIds ?? []).map((id) => ({ id }));
    },
    query: { products: { findMany: async () => opts.findMany ?? [] } },
  } as unknown as DbClient;
  return { db, queries };
}

describe("GET /search", () => {
  it("returns empty items for a missing query", async () => {
    const { db, queries } = mockDb();
    const res = await createApp({ db }).request("/search");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [], nextCursor: null });
    expect(queries).toHaveLength(0);
  });

  it("returns ranked matches as list items", async () => {
    const { db } = mockDb({ rankedIds: [1], findMany: [productRow] });
    const res = await createApp({ db }).request("/search?q=sink");
    expect(res.status).toBe(200);
    const body = (await res.json()) as SearchBody;
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ slug: "lavender-single-bowl", minPrice: 2100 });
    expect(body.nextCursor).toBeNull();
  });

  it("returns [] when nothing matches", async () => {
    const { db } = mockDb({ rankedIds: [] });
    const res = await createApp({ db }).request("/search?q=zzzzz");
    expect(res.status).toBe(200);
    expect((await res.json()).items).toEqual([]);
  });

  it("asks the database for the default page (20) plus one, from offset 0", async () => {
    const { db, queries } = mockDb({ rankedIds: [1], findMany: [productRow] });
    await createApp({ db }).request("/search?q=sink");
    expect(queries).toHaveLength(1);
    expect(queries[0]!.sql).toMatch(/LIMIT \$\d+ OFFSET \$\d+/);
    expect(queries[0]!.params.slice(-2)).toEqual([21, 0]);
  });

  it("honours limit and cursor, clamping limit to 50", async () => {
    const { db, queries } = mockDb({ rankedIds: [1], findMany: [productRow] });
    const app = createApp({ db });
    await app.request("/search?q=sink&limit=10&cursor=20");
    await app.request("/search?q=sink&limit=500");
    await app.request("/search?q=sink&limit=0");
    await app.request("/search?q=sink&limit=abc&cursor=-4");
    expect(queries.map((q) => q.params.slice(-2))).toEqual([
      [11, 20],
      [51, 0],
      [2, 0],
      [21, 0],
    ]);
  });

  it("returns nextCursor (rank offset) when a further page exists", async () => {
    const { db } = mockDb({ rankedIds: [3, 1, 2], findMany: rowsFor([1, 2, 3]) });
    const res = await createApp({ db }).request("/search?q=sink&limit=2");
    const body = (await res.json()) as SearchBody;
    expect(body.items.map((p) => p.slug)).toEqual(["product-3", "product-1"]);
    expect(body.nextCursor).toBe(2);
  });

  it("advances nextCursor from the cursor it was given", async () => {
    const { db } = mockDb({ rankedIds: [7, 8, 9], findMany: rowsFor([7, 8, 9]) });
    const res = await createApp({ db }).request("/search?q=sink&limit=2&cursor=2");
    const body = (await res.json()) as SearchBody;
    expect(body.items).toHaveLength(2);
    expect(body.nextCursor).toBe(4);
  });

  it("ends with a null cursor when the page is the last", async () => {
    const { db } = mockDb({ rankedIds: [1, 2], findMany: rowsFor([1, 2]) });
    const res = await createApp({ db }).request("/search?q=sink&limit=2");
    const body = (await res.json()) as SearchBody;
    expect(body.items).toHaveLength(2);
    expect(body.nextCursor).toBeNull();
  });
});
