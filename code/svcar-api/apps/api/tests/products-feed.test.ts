import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import type { DbClient } from "../src/db/client.js";

type Row = {
  id: number;
  categoryId?: number | null;
  slug: string;
  name: string;
  description: string | null;
  status: string;
  images: { url: string; sortOrder: number }[];
  skus: { price: string | number; salePrice: string | number | null; stock: number | null }[];
  fitments: { make: string; model: string }[];
};

function row(over: Partial<Row> = {}): Row {
  return {
    id: 1,
    slug: "virtus-diffuser",
    name: "Virtus 4 fin rear diffuser",
    description: "A four-fin rear diffuser in gloss black.",
    status: "active",
    images: [{ url: "https://cdn.example/a.webp", sortOrder: 0 }],
    skus: [{ price: 7499, salePrice: 4199, stock: 5 }],
    fitments: [{ make: "Volkswagen", model: "Virtus" }],
    ...over,
  };
}

function mockDb(rows: Row[]): DbClient {
  return {
    query: { products: { findMany: async () => rows } },
  } as unknown as DbClient;
}

async function feed(rows: Row[]) {
  const res = await createApp({ db: mockDb(rows) }).request("/products/feed");
  return { status: res.status, body: (await res.json()) as { items: any[]; total: number; currency: string } };
}

describe("GET /products/feed", () => {
  it("returns the sale price, not the list price", async () => {
    const { status, body } = await feed([row()]);
    expect(status).toBe(200);
    expect(body.currency).toBe("INR");
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({
      id: "1",
      slug: "virtus-diffuser",
      price: 4199,
      availability: "in_stock",
    });
    expect(body.items[0].fitments).toEqual(["Volkswagen Virtus"]);
  });

  it("sends the regular price of a SKU on sale, and the category", async () => {
    const { body } = await feed([row({ categoryId: 7 })]);
    expect(body.items[0]).toMatchObject({ price: 4199, listPrice: 7499, categoryId: 7 });
    const plain = await feed([row({ skus: [{ price: 999, salePrice: null, stock: 1 }] })]);
    expect(plain.body.items[0]).toMatchObject({ price: 999, listPrice: null, categoryId: null });
  });

  it("picks the cheapest SKU when a product has several", async () => {
    const { body } = await feed([
      row({
        skus: [
          { price: 9000, salePrice: null, stock: 2 },
          { price: 6000, salePrice: 5000, stock: 2 },
          { price: 7000, salePrice: null, stock: 2 },
        ],
      }),
    ]);
    expect(body.items[0].price).toBe(5000);
  });

  it("marks a product out of stock only when every SKU is", async () => {
    const both = await feed([row({ skus: [{ price: 100, salePrice: null, stock: 0 }] })]);
    expect(both.body.items[0].availability).toBe("out_of_stock");

    const one = await feed([
      row({ skus: [{ price: 100, salePrice: null, stock: 0 }, { price: 200, salePrice: null, stock: 3 }] }),
    ]);
    expect(one.body.items[0].availability).toBe("in_stock");
  });

  it("treats a null stock as available", async () => {
    const { body } = await feed([row({ skus: [{ price: 100, salePrice: null, stock: null }] })]);
    expect(body.items[0].availability).toBe("in_stock");
  });

  it("drops products with no image or no priced SKU — Merchant Center rejects both", async () => {
    const { body } = await feed([
      row({ id: 1, images: [] }),
      row({ id: 2, skus: [] }),
      row({ id: 3, skus: [{ price: 0, salePrice: null, stock: 1 }] }),
      row({ id: 4 }),
    ]);
    expect(body.items.map((i) => i.id)).toEqual(["4"]);
    expect(body.total).toBe(1);
  });

  it("caps images at 10", async () => {
    const many = Array.from({ length: 14 }, (_, i) => ({ url: `https://cdn.example/${i}.webp`, sortOrder: i }));
    const { body } = await feed([row({ images: many })]);
    expect(body.items[0].images).toHaveLength(10);
  });
});
