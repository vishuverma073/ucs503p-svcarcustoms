import { describe, expect, it } from "vitest";

process.env.JWT_ADMIN_SECRET = "test-admin-secret-at-least-32-chars-long!!";
process.env.LOG_LEVEL = "debug";

import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { createApp } from "../src/app.js";
import { signAdminAccess } from "../src/lib/jwt.js";
import { planSkuSync, type SkuInput } from "../src/routes/admin/products.js";
import { auditLog, products, skus as skusTable, users } from "../src/db/schema.js";
import type { DbClient } from "../src/db/client.js";

const ADMIN_ID = "fb354b9c-6c05-4379-8f2c-4c59962d4761";
const PRODUCT_ID = 7;
const dialect = new PgDialect();

// ─── planSkuSync (pure) ──────────────────────────────────────

const sku = (over: Partial<SkuInput> & { skuCode: string }): SkuInput => ({
  price: 100,
  salePrice: null,
  dimensionValues: {},
  ...over,
});

describe("planSkuSync", () => {
  const existing = [
    { id: 11, skuCode: "VM4-GB" },
    { id: 12, skuCode: "VM4-CF" },
  ];

  it("matches by id first, then by code; nothing removed → nothing deleted", () => {
    const plan = planSkuSync(existing, [sku({ id: 11, skuCode: "VM4-GB" }), sku({ skuCode: "VM4-CF" })]);
    expect(plan.updates.map((u) => u.id)).toEqual([11, 12]);
    expect(plan.inserts).toEqual([]);
    expect(plan.deleteIds).toEqual([]);
  });

  it("an id-matched SKU keeps its row even when its code changes; the old code isn't re-matched", () => {
    const plan = planSkuSync(existing, [sku({ id: 11, skuCode: "VM4-CF" }), sku({ skuCode: "VM4-GB" })]);
    expect(plan.updates).toEqual([{ id: 11, currentCode: "VM4-GB", input: expect.objectContaining({ skuCode: "VM4-CF" }) }]);
    // "VM4-GB" without an id: row 11 is already claimed → a new SKU; row 12 was dropped.
    expect(plan.inserts.map((s) => s.skuCode)).toEqual(["VM4-GB"]);
    expect(plan.deleteIds).toEqual([12]);
  });

  it("ids that don't belong to this product (temp ids, other products) never hijack a row", () => {
    const plan = planSkuSync(existing, [sku({ id: 1_000_001, skuCode: "NEW-1" }), sku({ id: 999, skuCode: "VM4-GB" })]);
    expect(plan.updates.map((u) => u.id)).toEqual([11]);
    expect(plan.inserts.map((s) => s.skuCode)).toEqual(["NEW-1"]);
    expect(plan.deleteIds).toEqual([12]);
  });
});

// ─── PATCH /admin/products/:id against a stateful fake database ───

interface SkuRow {
  id: number;
  productId: number;
  skuCode: string;
  price: string;
  salePrice: string | null;
  dimensionValues: Record<string, string>;
  attributes: Record<string, string> | null;
  stock: number | null;
  createdAt: Date;
  updatedAt: Date;
}

interface State {
  skus: SkuRow[];
  /** cart_items.sku_id → ON DELETE CASCADE */
  cartItems: { cartId: string; skuId: number }[];
  /** order_items.sku_id → ON DELETE SET NULL */
  orderItems: { orderNumber: string; skuId: number | null }[];
  nextSkuId: number;
  ops: string[];
  audits: unknown[];
  productUpdates: Record<string, unknown>[];
}

function seed(): State {
  const now = new Date("2026-10-20T10:00:00Z");
  const row = (id: number, productId: number, skuCode: string, price: string, extra: Partial<SkuRow> = {}): SkuRow => ({
    id,
    productId,
    skuCode,
    price,
    salePrice: null,
    dimensionValues: {},
    attributes: null,
    stock: 25,
    createdAt: now,
    updatedAt: now,
    ...extra,
  });
  return {
    skus: [
      row(101, PRODUCT_ID, "VM4-GB", "4999.00", { salePrice: "4299.00", dimensionValues: { Finish: "Gloss Black" }, attributes: { Material: "ABS" } }),
      row(102, PRODUCT_ID, "VM4-CF", "6999.00", { dimensionValues: { Finish: "Carbon" } }),
      row(103, PRODUCT_ID, "VM4-MB", "5499.00", { dimensionValues: { Finish: "Matte Black" } }),
      // Another product's SKU — must never be touched.
      row(201, 8, "OTHER-1", "999.00"),
    ],
    cartItems: [
      { cartId: "cart-a", skuId: 101 },
      { cartId: "cart-b", skuId: 102 },
      { cartId: "cart-b", skuId: 103 },
    ],
    orderItems: [{ orderNumber: "SV1", skuId: 103 }],
    nextSkuId: 500,
    ops: [],
    audits: [],
    productUpdates: [],
  };
}

const UNIQUE_VIOLATION = 'duplicate key value violates unique constraint "skus_sku_code_unique"';

function makeDb(state: State): DbClient {
  const assertUniqueCodes = () => {
    const codes = state.skus.map((s) => s.skuCode);
    if (new Set(codes).size !== codes.length) throw new Error(UNIQUE_VIOLATION);
  };
  const render = (cond: SQL) => dialect.sqlToQuery(cond);
  const rowsFor = (cond: SQL): SkuRow[] => {
    const { sql, params } = render(cond);
    if (/"skus"\."product_id" = \$1/.test(sql)) return state.skus.filter((s) => s.productId === params[0]);
    if (/"skus"\."sku_code" = \$1/.test(sql)) return state.skus.filter((s) => s.skuCode === params[0]);
    if (/"skus"\."id" = \$1/.test(sql)) return state.skus.filter((s) => s.id === params[0]);
    throw new Error(`unexpected skus condition: ${sql}`);
  };
  const pick = (row: SkuRow, fields?: Record<string, unknown>) =>
    fields ? Object.fromEntries(Object.keys(fields).map((k) => [k, (row as unknown as Record<string, unknown>)[k]])) : row;
  const thenableRows = <T>(rows: T[]) => Object.assign(Promise.resolve(rows), { limit: async (n: number) => rows.slice(0, n) });

  const api = {
    select: (fields?: Record<string, unknown>) => ({
      from: (table: unknown) => ({
        where: (cond: SQL) => {
          if (table === users) {
            return thenableRows([{ id: ADMIN_ID, email: "a@b.com", name: "A", isAdmin: true }]);
          }
          if (table === skusTable) {
            const rows = rowsFor(cond).map((r) => pick(r, fields));
            state.ops.push(`select skus ${render(cond).sql.includes("sku_code") ? "by code" : "by product"}`);
            return thenableRows(rows);
          }
          throw new Error("unexpected select table");
        },
      }),
    }),
    update: (table: unknown) => ({
      set: (vals: Record<string, unknown>) => ({
        where: async (cond: SQL) => {
          if (table === products) {
            state.productUpdates.push(vals);
            return;
          }
          if (table !== skusTable) throw new Error("unexpected update table");
          for (const row of rowsFor(cond)) {
            Object.assign(row, vals);
            state.ops.push(`update sku ${row.id}${"price" in vals ? "" : " (code only)"}`);
          }
          assertUniqueCodes();
        },
      }),
    }),
    delete: (table: unknown) => ({
      where: async (cond: SQL) => {
        if (table !== skusTable) throw new Error("unexpected delete table");
        const { sql, params } = render(cond);
        if (!/"skus"\."id" in \(/.test(sql)) throw new Error(`unexpected delete: ${sql}`);
        const ids = new Set(params as number[]);
        state.skus = state.skus.filter((s) => !ids.has(s.id));
        state.cartItems = state.cartItems.filter((c) => !ids.has(c.skuId)); // ON DELETE CASCADE
        for (const o of state.orderItems) if (o.skuId != null && ids.has(o.skuId)) o.skuId = null; // SET NULL
        state.ops.push(`delete skus ${[...ids].join(",")}`);
      },
    }),
    insert: (table: unknown) => ({
      values: async (vals: Record<string, unknown> | Record<string, unknown>[]) => {
        if (table === auditLog) {
          state.audits.push(vals);
          return;
        }
        if (table !== skusTable) throw new Error("unexpected insert table");
        for (const v of Array.isArray(vals) ? vals : [vals]) {
          const now = new Date();
          const row = { id: state.nextSkuId++, createdAt: now, updatedAt: now, ...v } as SkuRow;
          state.skus.push(row);
          state.ops.push(`insert sku ${row.id}`);
        }
        assertUniqueCodes();
      },
    }),
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(api),
    query: {
      products: {
        findFirst: async () => ({
          id: PRODUCT_ID,
          categoryId: 3,
          name: "Virtus M4 spoiler",
          slug: "virtus-m4-spoiler",
          description: "",
          status: "active",
          isBestseller: false,
          isNew: false,
          isFeatured: false,
          categoryPinOrder: null,
          tags: [],
          specifications: null,
          includedAccessories: null,
          fitsAllVehicles: true,
          category: { name: "Spoilers" },
          images: [{ url: "https://x.supabase.co/storage/v1/object/public/p/1.webp", alt: null, sortOrder: 0 }],
          dimensions: [],
          skus: state.skus.filter((s) => s.productId === PRODUCT_ID).sort((a, b) => a.id - b.id),
          fitments: [],
          extraCategories: [],
          createdAt: new Date("2026-10-01T00:00:00Z"),
          updatedAt: new Date("2026-10-20T10:00:00Z"),
        }),
      },
    },
  };
  return api as unknown as DbClient;
}

async function patch(state: State, body: unknown) {
  const token = await signAdminAccess({ sub: ADMIN_ID });
  return createApp({ db: makeDb(state) }).request(`/admin/products/${PRODUCT_ID}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** The SKU list exactly as the editor / quick edit send it back (with ids). */
function editorSkus(state: State) {
  return state.skus
    .filter((s) => s.productId === PRODUCT_ID)
    .map((s) => ({
      id: s.id,
      skuCode: s.skuCode,
      price: Number(s.price),
      salePrice: s.salePrice == null ? null : Number(s.salePrice),
      dimensionValues: s.dimensionValues,
      ...(s.attributes ? { attributes: s.attributes } : {}),
      stock: s.stock,
    }));
}

const ids = (state: State) => state.skus.filter((s) => s.productId === PRODUCT_ID).map((s) => s.id).sort();

describe("PATCH /admin/products/:id keeps SKU rows (and carts) in place", () => {
  it("(1) price / sale / stock-only change keeps every SKU id, so carts keep their items", async () => {
    const state = seed();
    const body = editorSkus(state);
    body[0] = { ...body[0]!, price: 5199, salePrice: 4799, stock: 3 };
    body[2] = { ...body[2]!, stock: 0 };
    const res = await patch(state, { skus: body });

    expect(res.status).toBe(200);
    expect(ids(state)).toEqual([101, 102, 103]);
    const gb = state.skus.find((s) => s.id === 101)!;
    expect(gb).toMatchObject({ skuCode: "VM4-GB", price: "5199", salePrice: "4799", stock: 3, attributes: { Material: "ABS" } });
    expect(state.skus.find((s) => s.id === 103)!.stock).toBe(0);
    expect(state.cartItems).toHaveLength(3);
    expect(state.ops.some((o) => o.startsWith("delete") || o.startsWith("insert"))).toBe(false);
    // Response shape unchanged: the full admin product detail, same SKU ids.
    const json = await res.json();
    expect(json.skus.map((s: { id: number }) => s.id)).toEqual([101, 102, 103]);
    expect(json.skus[0]).toMatchObject({ skuCode: "VM4-GB", price: 5199, salePrice: 4799, stock: 3 });
    expect(json).toMatchObject({ id: PRODUCT_ID, slug: "virtus-m4-spoiler", categoryName: "Spoilers" });
    // Audit entry still written.
    expect(state.audits).toEqual([expect.objectContaining({ action: "product.update", resourceType: "product", resourceId: String(PRODUCT_ID) })]);
  });

  it("(1b) older clients that send no ids still keep the rows (matched by SKU code)", async () => {
    const state = seed();
    const body = editorSkus(state).map(({ id: _id, ...rest }) => ({ ...rest, price: rest.price + 1 }));
    expect((await patch(state, { skus: body })).status).toBe(200);
    expect(ids(state)).toEqual([101, 102, 103]);
    expect(state.cartItems).toHaveLength(3);
  });

  it("(2) adding a SKU keeps the old ids and inserts exactly one", async () => {
    const state = seed();
    const body = [...editorSkus(state), { id: 1_000_007, skuCode: "VM4-RD", price: 5299, salePrice: null, dimensionValues: { Finish: "Red" }, stock: 5 }];
    expect((await patch(state, { skus: body })).status).toBe(200);
    expect(ids(state)).toEqual([101, 102, 103, 500]);
    expect(state.skus.find((s) => s.id === 500)).toMatchObject({ productId: PRODUCT_ID, skuCode: "VM4-RD", price: "5299", stock: 5 });
    expect(state.ops.filter((o) => o.startsWith("insert"))).toEqual(["insert sku 500"]);
    expect(state.cartItems).toHaveLength(3);
  });

  it("(3) removing a SKU deletes only that one (its cart lines go, its order lines keep a null sku)", async () => {
    const state = seed();
    const body = editorSkus(state).filter((s) => s.id !== 103);
    expect((await patch(state, { skus: body })).status).toBe(200);
    expect(ids(state)).toEqual([101, 102]);
    expect(state.ops.filter((o) => o.startsWith("delete"))).toEqual(["delete skus 103"]);
    expect(state.cartItems).toEqual([
      { cartId: "cart-a", skuId: 101 },
      { cartId: "cart-b", skuId: 102 },
    ]);
    expect(state.orderItems).toEqual([{ orderNumber: "SV1", skuId: null }]);
    expect(state.skus.find((s) => s.id === 201)).toBeDefined(); // other product untouched
  });

  it("(4) changing the SKU code of an id-matched SKU updates that row in place", async () => {
    const state = seed();
    const body = editorSkus(state);
    body[1] = { ...body[1]!, skuCode: "VM4-CARBON" };
    expect((await patch(state, { skus: body })).status).toBe(200);
    expect(ids(state)).toEqual([101, 102, 103]);
    expect(state.skus.find((s) => s.id === 102)!.skuCode).toBe("VM4-CARBON");
    expect(state.cartItems).toHaveLength(3);
  });

  it("swapping two SKU codes doesn't trip the store-wide unique index and keeps both rows", async () => {
    const state = seed();
    const body = editorSkus(state);
    body[0] = { ...body[0]!, skuCode: "VM4-CF" };
    body[1] = { ...body[1]!, skuCode: "VM4-GB" };
    expect((await patch(state, { skus: body })).status).toBe(200);
    expect(state.skus.find((s) => s.id === 101)!.skuCode).toBe("VM4-CF");
    expect(state.skus.find((s) => s.id === 102)!.skuCode).toBe("VM4-GB");
    expect(ids(state)).toEqual([101, 102, 103]);
  });

  it("a new SKU whose code is taken by another product gets a unique suffix (as before)", async () => {
    const state = seed();
    const body = [...editorSkus(state), { skuCode: "OTHER-1", price: 10, salePrice: null, dimensionValues: {} }];
    expect((await patch(state, { skus: body })).status).toBe(200);
    expect(state.skus.find((s) => s.id === 500)!.skuCode).toBe("OTHER-1-2");
    expect(state.skus.find((s) => s.id === 201)!.skuCode).toBe("OTHER-1");
  });

  it("a PATCH without `skus` (e.g. name only) doesn't touch SKU rows at all", async () => {
    const state = seed();
    expect((await patch(state, { name: "Virtus M4 spoiler (ABS)" })).status).toBe(200);
    expect(state.ops).toEqual([]);
    expect(state.productUpdates[0]).toMatchObject({ name: "Virtus M4 spoiler (ABS)" });
  });

  it("400 for an invalid SKU id", async () => {
    const state = seed();
    const body = editorSkus(state);
    body[0] = { ...body[0]!, id: -1 };
    expect((await patch(state, { skus: body })).status).toBe(400);
    expect(state.ops).toEqual([]);
  });
});
