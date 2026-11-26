import { Hono } from "hono";
import { and, eq, gt, inArray, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import {
  ProductListItemSchema,
  ProductSchema,
  type Fitment,
  type Product,
  type ProductListItem,
  type ProductStructuredData,
} from "@svcar/contracts";
import type { DbClient } from "../db/client.js";
// Aliased: `brand` is also a JSON-LD key in buildStructuredData below.
import { brand as brandConfig } from "../config/brand.js";
import { products, categories, productCategories } from "../db/schema.js";
import { verifyPreviewToken } from "../lib/preview-token.js";
import type { AppEnv } from "../lib/types.js";

/**
 * Product ids cross-listed into any of `categoryIds` via the product_categories
 * join table (secondary categories). Used to widen category browse so a product
 * shows under its extra categories, not just its primary one.
 *
 * Built with the query builder rather than raw `= ANY(${ids})`: postgres-js sends
 * a JS array as a single parameter with no type OID, so Postgres cannot infer the
 * operand type and the statement fails — which took every category page to a 500.
 * `inArray` binds one scalar per id instead, which the driver types correctly.
 */
async function crossListedProductIds(db: DbClient, categoryIds: number[]): Promise<number[]> {
  if (!categoryIds.length) return [];
  const rows = await db
    .selectDistinct({ id: productCategories.productId })
    .from(productCategories)
    .where(inArray(productCategories.categoryId, categoryIds));
  return rows.map((r) => Number(r.id)).filter((n) => Number.isInteger(n));
}
import { bestsellerProductIds } from "../lib/bestsellers.js";
import { cached } from "../lib/cache.js";
import { extractProductSizes } from "../lib/product-sizes.js";

const PRODUCT_TTL = 300; // 5 min

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

type SkuPrice = { price: string; salePrice: string | null; dimensionValues?: Record<string, string> | null };
type ImageRef = { url: string; sortOrder: number };
type DimRef = { name: string; values: { value: string; sortOrder: number }[] };

/** Compute the light list-item shape (price range + best discount + primary image). */
export function toListItem(
  p: {
    id: number;
    categoryId: number;
    name: string;
    slug: string;
    status: "active" | "draft" | "archived";
    isBestseller: boolean;
    isNew: boolean;
    tags: string[];
  },
  skus: SkuPrice[],
  images: ImageRef[],
  dimensions: DimRef[] = [],
): ProductListItem {
  const effective = skus.map((s) => (s.salePrice !== null ? Number(s.salePrice) : Number(s.price)));
  const bases = skus.map((s) => Number(s.price));
  let bestDiscount = 0;
  for (const s of skus) {
    if (s.salePrice !== null) {
      const base = Number(s.price);
      if (base > 0) bestDiscount = Math.max(bestDiscount, Math.round((1 - Number(s.salePrice) / base) * 100));
    }
  }
  const primaryImage = [...images].sort((a, b) => a.sortOrder - b.sortOrder)[0]?.url ?? null;
  return {
    id: p.id,
    categoryId: p.categoryId,
    name: p.name,
    slug: p.slug,
    status: p.status,
    isBestseller: p.isBestseller,
    isNew: p.isNew,
    tags: p.tags,
    image: primaryImage,
    minPrice: effective.length ? Math.min(...effective) : 0,
    maxBasePrice: bases.length ? Math.max(...bases) : 0,
    bestDiscount,
    sizes: extractProductSizes(skus, dimensions),
  };
}

/** Pre-compute schema.org/Product JSON-LD so the FE can render it as-is. */
function buildStructuredData(p: Product): ProductStructuredData {
  const effective = p.skus.map((s) => s.salePrice ?? s.price);
  const minPrice = effective.length ? Math.min(...effective) : 0;
  const inStock = p.skus.some((s) => s.stock === undefined || s.stock === null || s.stock > 0);
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    image: p.images.map((i) => i.url),
    description: p.description,
    brand: { "@type": "Brand", name: brandConfig.name },
    sku: p.skus[0]?.skuCode ?? p.slug,
    offers: {
      "@type": "Offer",
      price: minPrice,
      priceCurrency: "INR",
      availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    },
  };
}

const ListQuerySchema = z.object({
  category: z.string().min(1).optional(),
  bestseller: z.string().optional(),
  new: z.string().optional(),
  // Vehicle-fitment filter (Make → Model → Year). When `make`+`model` are given,
  // narrow to products that fit: universal parts always qualify; otherwise a
  // product_fitments row must match make+model (and, when `year` is given and the
  // row declares a range, the year must fall within [year_start, year_end]).
  make: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  year: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  cursor: z.coerce.number().int().positive().optional(),
});

/**
 * Build the SQL condition narrowing the product list to those fitting a vehicle.
 * Returns undefined when no vehicle filter is requested (make/model absent), so
 * the caller can skip it. Year matching only applies to rows that declare a
 * range; a fitment with NULL start/end matches any selected year.
 */
function fitmentCondition(
  make: string | undefined,
  model: string | undefined,
  year: number | undefined,
): SQL | undefined {
  if (!make || !model) return undefined;
  const yearClause =
    year !== undefined
      ? sql`AND (pf.year_start IS NULL OR pf.year_start <= ${year}) AND (pf.year_end IS NULL OR pf.year_end >= ${year})`
      : sql``;
  return sql`(${products.fitsAllVehicles} = true OR EXISTS (
    SELECT 1 FROM product_fitments pf
    WHERE pf.product_id = ${products.id}
      AND pf.make = ${make}
      AND pf.model = ${model}
      ${yearClause}
  ))`;
}

export function makeProductsRouter(db: DbClient) {
  const router = new Hono<AppEnv>();

  // GET /products — active products, filterable, id-cursor paginated.
  router.get("/", async (c) => {
    const parsed = ListQuerySchema.safeParse(c.req.query());
    if (!parsed.success) {
      return c.json({ error: "Invalid query", issues: parsed.error.flatten() }, 400);
    }
    const q = parsed.data;

    const conditions = [eq(products.status, "active")];

    // Resolve category slug → id (direct category only; tree expansion is /by-category).
    let categoryId: number | undefined;
    if (q.category) {
      const rows = await db.execute<{ id: number }>(
        sql`SELECT id FROM categories WHERE slug = ${q.category} LIMIT 1`,
      );
      const row = (rows as unknown as { id: number }[])[0];
      if (!row) return c.json({ items: [], nextCursor: null });
      categoryId = Number(row.id);
    }
    if (categoryId !== undefined) {
      // Primary category OR cross-listed via product_categories.
      const crossIds = await crossListedProductIds(db, [categoryId]);
      conditions.push(
        crossIds.length
          ? (or(eq(products.categoryId, categoryId), inArray(products.id, crossIds)) as SQL)
          : eq(products.categoryId, categoryId),
      );
    }
    // Bestsellers are ranked, not just filtered: `bestsellerProductIds` returns
    // admin pins followed by whatever is actually selling, best first. findMany
    // can't order by a list, so the rows get re-sorted into that order below.
    let bestsellerOrder: number[] | null = null;
    if (q.bestseller === "1") {
      bestsellerOrder = await bestsellerProductIds(db, q.limit);
      if (bestsellerOrder.length === 0) return c.json({ items: [], nextCursor: null });
      conditions.push(inArray(products.id, bestsellerOrder));
    }
    if (q.new === "1") conditions.push(eq(products.isNew, true));
    const fit = fitmentCondition(q.make, q.model, q.year);
    if (fit) conditions.push(fit);
    if (q.cursor !== undefined) conditions.push(gt(products.id, q.cursor));

    const rows = await db.query.products.findMany({
      where: and(...conditions),
      orderBy: (p, { asc }) => [asc(p.id)],
      limit: q.limit + 1,
      with: {
        skus: { columns: { price: true, salePrice: true, dimensionValues: true } },
        images: { columns: { url: true, sortOrder: true } },
        dimensions: {
          columns: { name: true, sortOrder: true },
          with: { values: { columns: { value: true, sortOrder: true } } },
        },
      },
    });

    if (bestsellerOrder) {
      const rank = new Map(bestsellerOrder.map((id, i) => [id, i]));
      rows.sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity));
    }

    const hasMore = rows.length > q.limit;
    const page = rows.slice(0, q.limit);
    const items = page.map((p) => toListItem(p, p.skus, p.images, p.dimensions));
    const nextCursor = hasMore && page.length ? page[page.length - 1]!.id : null;

    return c.json(
      z
        .object({ items: z.array(ProductListItemSchema), nextCursor: z.number().nullable() })
        .parse({ items, nextCursor }),
    );
  });

  // GET /products/by-category/:slug — active products in the category's whole subtree.
  // (Defined before /:slug; an unknown slug yields an empty list.)
  router.get("/by-category/:slug", async (c) => {
    const slug = c.req.param("slug");
    const q = ListQuerySchema.parse(Object.fromEntries(new URL(c.req.url).searchParams));

    const [root] = await db
      .select({ id: categories.id, status: categories.status })
      .from(categories)
      .where(eq(categories.slug, slug))
      .limit(1);
    if (!root || root.status === "archived") {
      return c.json({ items: [], nextCursor: null, total: 0 });
    }

    const treeRows = await db.execute<{ id: number }>(sql`
      WITH RECURSIVE category_tree AS (
        SELECT id FROM categories WHERE slug = ${slug}
        UNION ALL
        SELECT c.id FROM categories c JOIN category_tree ct ON c.parent_id = ct.id
      )
      SELECT id FROM category_tree
    `);
    const ids = (treeRows as unknown as { id: number }[]).map((r) => Number(r.id));
    if (ids.length === 0) return c.json({ items: [], nextCursor: null, total: 0 });

    const fit = fitmentCondition(q.make, q.model, q.year);
    // Products whose PRIMARY category is in the subtree, OR cross-listed into it.
    const crossIds = await crossListedProductIds(db, ids);
    const inCategory = crossIds.length
      ? (or(inArray(products.categoryId, ids), inArray(products.id, crossIds)) as SQL)
      : inArray(products.categoryId, ids);
    const baseWhere = and(
      eq(products.status, "active"),
      inCategory,
      ...(fit ? [fit] : []),
    );
    const where =
      q.cursor !== undefined ? and(baseWhere, gt(products.id, q.cursor)) : baseWhere;

    const rows = await db.query.products.findMany({
      where,
      orderBy: (p, { asc }) => [asc(p.id)],
      limit: q.limit + 1,
      with: {
        skus: { columns: { price: true, salePrice: true, dimensionValues: true } },
        images: { columns: { url: true, sortOrder: true } },
        dimensions: {
          columns: { name: true, sortOrder: true },
          with: { values: { columns: { value: true, sortOrder: true } } },
        },
      },
    });

    const hasMore = rows.length > q.limit;
    const page = rows.slice(0, q.limit);
    const items = page.map((p) => toListItem(p, p.skus, p.images, p.dimensions));
    const nextCursor = hasMore && page.length ? page[page.length - 1]!.id : null;

    let total: number | undefined;
    if (q.cursor === undefined) {
      const [countRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(products)
        .where(baseWhere);
      total = Number(countRow?.count ?? 0);
    }

    return c.json(
      z
        .object({
          items: z.array(ProductListItemSchema),
          nextCursor: z.number().nullable(),
          total: z.number().int().nonnegative().optional(),
        })
        .parse({ items, nextCursor, total }),
    );
  });

  // GET /products/:slug — full active product detail.
  /**
   * GET /products/feed — every active product with the fields a Google Merchant
   * Center listing needs, in one response. The storefront renders /feed.xml from
   * this; fetching 120+ products one detail call at a time would time out.
   *
   * Deliberately not paginated: Merchant Center wants the whole catalogue in a
   * single fetch, and the catalogue is small enough to serve in one go.
   */
  router.get("/feed", async (c) => {
    const rows = await db.query.products.findMany({
      where: eq(products.status, "active"),
      with: {
        images: { orderBy: (img, { asc }) => [asc(img.sortOrder)] },
        skus: { orderBy: (sk, { asc }) => [asc(sk.id)] },
        fitments: { orderBy: (f, { asc }) => [asc(f.id)] },
      },
    });

    const items = rows
      .map((p) => {
        // Cheapest live SKU drives the advertised price, matching the "From ₹x"
        // the product card shows. A product with no SKU has nothing to list.
        const priced = p.skus
          .map((sk) => ({ price: Number(sk.salePrice ?? sk.price), list: Number(sk.price), stock: sk.stock }))
          .filter((sk) => Number.isFinite(sk.price) && sk.price > 0)
          .sort((a, b) => a.price - b.price);
        if (priced.length === 0) return null;
        const cheapest = priced[0]!;
        const inStock = p.skus.some((sk) => sk.stock === null || sk.stock === undefined || sk.stock > 0);

        return {
          id: String(p.id),
          slug: p.slug,
          name: p.name.trim(),
          description: (p.description ?? "").trim(),
          images: p.images.map((i) => i.url).slice(0, 10),
          price: cheapest.price,
          // That SKU's regular price when it is on sale, so the feed can send
          // price + sale_price (the struck-through MRP the PDP shows).
          listPrice: Number.isFinite(cheapest.list) && cheapest.list > cheapest.price ? cheapest.list : null,
          categoryId: p.categoryId ?? null,
          availability: inStock ? ("in_stock" as const) : ("out_of_stock" as const),
          fitments: (p.fitments ?? []).map((f) => `${f.make} ${f.model}`),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null && x.images.length > 0);

    // INR throughout, same as the structured data above and checkout.
    return c.json({ items, total: items.length, currency: "INR" });
  });

  router.get("/:slug", async (c) => {
    const slug = c.req.param("slug");
    // Admin preview (?preview=<signed token>): return the product regardless of
    // status so drafts can be reviewed before publishing. The token is an HMAC
    // bound to this slug with a short TTL, minted only by the admin API — a bare
    // ?preview=1 is NOT honoured (that previously exposed the whole unpublished
    // catalogue). Bypasses the cache so a draft is never stored under the public
    // product:<slug> key.
    const preview = verifyPreviewToken(slug, c.req.query("preview"));
    const loadProduct = async () => {
      const p = await db.query.products.findFirst({
        where: preview
          ? eq(products.slug, slug)
          : and(eq(products.slug, slug), eq(products.status, "active")),
        with: {
          images: { orderBy: (img, { asc }) => [asc(img.sortOrder)] },
          dimensions: {
            orderBy: (d, { asc }) => [asc(d.sortOrder)],
            with: { values: { orderBy: (v, { asc }) => [asc(v.sortOrder)] } },
          },
          skus: { orderBy: (s, { asc }) => [asc(s.id)] },
          fitments: { orderBy: (f, { asc }) => [asc(f.id)] },
        },
      });
      if (!p) return null;

      const fitments: Fitment[] = (p.fitments ?? []).map((f) => ({
        make: f.make,
        model: f.model,
        yearStart: f.yearStart ?? undefined,
        yearEnd: f.yearEnd ?? undefined,
      }));

      const detail: Product = {
      id: p.id,
      categoryId: p.categoryId,
      name: p.name,
      slug: p.slug,
      description: p.description ?? "",
      status: p.status,
      isBestseller: p.isBestseller,
      isNew: p.isNew,
      tags: p.tags,
      specifications: p.specifications ?? undefined,
      includedAccessories: p.includedAccessories ?? undefined,
      fitsAllVehicles: p.fitsAllVehicles,
      fitments: fitments.length ? fitments : undefined,
      images: p.images.map((i) => ({ url: i.url, alt: i.alt ?? undefined, sortOrder: i.sortOrder })),
      dimensions: p.dimensions.map((d) => ({
        id: d.id,
        name: d.name,
        sortOrder: d.sortOrder,
        values: d.values.map((v) => ({
          id: v.id,
          value: v.value,
          label: v.label ?? undefined,
          sortOrder: v.sortOrder,
        })),
      })),
      skus: p.skus.map((s) => ({
        id: s.id,
        skuCode: s.skuCode,
        price: Number(s.price),
        salePrice: s.salePrice === null ? null : Number(s.salePrice),
        dimensionValues: s.dimensionValues,
        attributes: s.attributes ?? undefined,
        stock: s.stock ?? undefined,
      })),
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      };
      return ProductSchema.parse({ ...detail, structuredData: buildStructuredData(detail) });
    };

    const { value, hit } = preview
      ? { value: await loadProduct(), hit: false }
      : await cached<Product | null>(`product:${slug}`, PRODUCT_TTL, loadProduct);

    if (!value) return c.json({ error: "Not Found" }, 404);
    c.header("x-cache", hit ? "HIT" : "MISS");
    return c.json(value);
  });

  return router;
}
