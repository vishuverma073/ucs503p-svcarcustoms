import { Hono } from "hono";
import { and, eq, ilike, inArray, lt, ne, or } from "drizzle-orm";
import {
  AdminProductCreateSchema,
  AdminProductDetailSchema,
  AdminProductListSchema,
  AdminProductPatchSchema,
  ProductStatusSchema,
  type AdminProductDetail,
} from "@svcar/contracts";
import { signPreviewToken } from "../../lib/preview-token.js";
import type { DbClient } from "../../db/client.js";
import {
  products,
  productImages,
  dimensions as dimensionsTable,
  dimensionValues as dimensionValuesTable,
  skus as skusTable,
  productFitments,
  productCategories,
} from "../../db/schema.js";
import { makeRequireAdmin } from "../../middleware/auth.js";
import { logAudit } from "../../lib/audit.js";
import { invalidateProductCaches } from "../../lib/cache.js";
import { isForeignKeyViolation, postgresConstraintName } from "../../lib/pg-error.js";
import { slugify } from "../../lib/slug.js";
import { getProductCategoryIdsForTree } from "../../lib/category-products.js";
import type { AppEnv } from "../../lib/types.js";

type Tx = Parameters<Parameters<DbClient["transaction"]>[0]>[0];

/** One SKU as the admin editor sends it. `id` is set for SKUs that already exist. */
export type SkuInput = {
  id?: number;
  skuCode: string;
  price: number;
  salePrice: number | null;
  dimensionValues: Record<string, string>;
  attributes?: Record<string, string>;
  stock?: number | null;
};

type ProductChildren = {
  images?: { url: string; alt?: string; sortOrder: number }[];
  dimensions?: { name: string; sortOrder: number; values: { value: string; label?: string; sortOrder: number }[] }[];
  skus?: SkuInput[];
  fitments?: {
    make: string;
    model: string;
    yearStart?: number | null;
    yearEnd?: number | null;
  }[];
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function encodeCursor(updatedAt: Date, id: number): string {
  return Buffer.from(`${updatedAt.toISOString()}|${id}`).toString("base64url");
}
function decodeCursor(cursor: string): { updatedAt: Date; id: number } | null {
  try {
    const [iso, idStr] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
    const id = Number(idStr);
    if (!iso || !Number.isInteger(id)) return null;
    return { updatedAt: new Date(iso), id };
  } catch {
    return null;
  }
}

async function uniqueSlug(db: DbClient | Tx, base: string, excludeId?: number): Promise<string> {
  let candidate = base;
  for (let i = 0; i < 5; i++) {
    const existing = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.slug, candidate))
      .limit(1);
    if (!existing.length || existing[0]!.id === excludeId) return candidate;
    candidate = `${base}-${Math.random().toString(36).slice(2, 6)}`;
  }
  return `${base}-${Date.now()}`;
}

async function ensureUniqueSkuCode(
  tx: Tx,
  base: string,
  reserved: Set<string> = new Set(),
): Promise<string> {
  const trimmed = base.trim() || "SKU";
  let candidate = trimmed.slice(0, 80);
  for (let n = 0; n < 100; n++) {
    const [row] = await tx
      .select({ id: skusTable.id })
      .from(skusTable)
      .where(eq(skusTable.skuCode, candidate))
      .limit(1);
    if (!row && !reserved.has(candidate)) return candidate;
    const suffix = n === 0 ? "-2" : `-${n + 2}`;
    candidate = `${trimmed.slice(0, Math.max(1, 80 - suffix.length))}${suffix}`;
  }
  return `${trimmed.slice(0, 60)}-${Date.now()}`;
}

function postgresErrorText(err: unknown): string {
  const parts: string[] = [];
  let cur: unknown = err;
  for (let i = 0; i < 5 && cur; i++) {
    if (cur instanceof Error) {
      parts.push(cur.message);
      cur = cur.cause;
    } else if (typeof cur === "string") {
      parts.push(cur);
      break;
    } else {
      break;
    }
  }
  return parts.join(" ");
}

function productWriteError(c: { json: (body: unknown, status?: number) => Response }, err: unknown) {
  const text = postgresErrorText(err);
  if (/numeric field overflow|22003/i.test(text)) {
    return c.json(
      { error: "Invalid price", message: "Price must be at most ₹99,999,999.99" },
      400,
    );
  }
  if (/products_slug_unique|duplicate key.*\bslug\b/i.test(text)) {
    return c.json(
      {
        error: "Slug already in use",
        message:
          "That URL slug is already taken. Choose a different slug, or leave it blank to auto-generate one.",
      },
      409,
    );
  }
  if (/skus_sku_code_unique|duplicate key.*sku_code/i.test(text)) {
    return c.json(
      {
        error: "Duplicate SKU code",
        message: "Each SKU code must be unique across the store",
      },
      400,
    );
  }
  if (/products_category_id_fkey|foreign key.*category/i.test(text)) {
    return c.json({ error: "Invalid category", message: "Choose a valid category" }, 400);
  }
  return null;
}

async function replaceImages(tx: Tx, productId: number, images: NonNullable<ProductChildren["images"]>): Promise<void> {
  await tx.delete(productImages).where(eq(productImages.productId, productId));
  if (images.length) {
    await tx.insert(productImages).values(
      images.map((img) => ({ productId, url: img.url, alt: img.alt ?? null, sortOrder: img.sortOrder })),
    );
  }
}

async function replaceFitments(tx: Tx, productId: number, fitments: NonNullable<ProductChildren["fitments"]>): Promise<void> {
  await tx.delete(productFitments).where(eq(productFitments.productId, productId));
  if (fitments.length) {
    await tx.insert(productFitments).values(
      fitments.map((f) => ({
        productId,
        make: f.make,
        model: f.model,
        yearStart: f.yearStart ?? null,
        yearEnd: f.yearEnd ?? null,
      })),
    );
  }
}

async function replaceDimensions(
  tx: Tx,
  productId: number,
  dims: NonNullable<ProductChildren["dimensions"]>,
): Promise<void> {
  const existingDims = await tx
    .select({ id: dimensionsTable.id })
    .from(dimensionsTable)
    .where(eq(dimensionsTable.productId, productId));
  const dimIds = existingDims.map((d) => d.id);
  if (dimIds.length) {
    await tx.delete(dimensionValuesTable).where(inArray(dimensionValuesTable.dimensionId, dimIds));
  }
  await tx.delete(dimensionsTable).where(eq(dimensionsTable.productId, productId));
  for (const d of dims) {
    const [drow] = await tx
      .insert(dimensionsTable)
      .values({ productId, name: d.name, sortOrder: d.sortOrder })
      .returning({ id: dimensionsTable.id });
    if (d.values.length) {
      await tx.insert(dimensionValuesTable).values(
        d.values.map((v) => ({
          dimensionId: drow!.id,
          value: v.value,
          label: v.label ?? null,
          sortOrder: v.sortOrder,
        })),
      );
    }
  }
}

export interface ExistingSku {
  id: number;
  skuCode: string;
}

export interface SkuSyncPlan {
  /** Existing rows to update in place, in the order the editor sent them. */
  updates: { id: number; currentCode: string; input: SkuInput }[];
  /** SKUs that don't exist yet. */
  inserts: SkuInput[];
  /** Existing rows the admin removed. */
  deleteIds: number[];
}

/**
 * Match the editor's SKUs to the product's stored ones (pure, unit-tested).
 *
 * Pass 1 matches by `id` — only ids that belong to THIS product count, so a
 * client-side temporary id or another product's id can never hijack a row.
 * Pass 2 matches what's left by SKU code (the editor keeps codes stable, and
 * older clients send no ids). Anything unmatched is new; stored rows nobody
 * claimed were removed by the admin.
 */
export function planSkuSync(existing: ExistingSku[], incoming: SkuInput[]): SkuSyncPlan {
  const byId = new Map(existing.map((e) => [e.id, e]));
  const byCode = new Map(existing.map((e) => [e.skuCode.trim(), e]));
  const claimed = new Set<number>();
  const match: (ExistingSku | null)[] = incoming.map(() => null);

  incoming.forEach((s, i) => {
    const row = s.id != null ? byId.get(s.id) : undefined;
    if (row && !claimed.has(row.id)) {
      claimed.add(row.id);
      match[i] = row;
    }
  });
  incoming.forEach((s, i) => {
    if (match[i]) return;
    const row = byCode.get(s.skuCode.trim());
    if (row && !claimed.has(row.id)) {
      claimed.add(row.id);
      match[i] = row;
    }
  });

  const plan: SkuSyncPlan = { updates: [], inserts: [], deleteIds: [] };
  incoming.forEach((s, i) => {
    const row = match[i];
    if (row) plan.updates.push({ id: row.id, currentCode: row.skuCode, input: s });
    else plan.inserts.push(s);
  });
  plan.deleteIds = existing.filter((e) => !claimed.has(e.id)).map((e) => e.id);
  return plan;
}

function skuValues(s: SkuInput) {
  return {
    price: String(s.price),
    salePrice: s.salePrice === null || s.salePrice === undefined ? null : String(s.salePrice),
    dimensionValues: s.dimensionValues,
    attributes: s.attributes ?? null,
    stock: s.stock ?? null,
  };
}

/**
 * Write the product's SKU list IN PLACE. Matched SKUs keep their row (and id),
 * so customers' cart lines (cart_items.sku_id) and guest carts in the browser
 * keep pointing at them when only a price, sale price or stock changes. Only
 * SKUs the admin actually removed are deleted — for those, cart lines go with
 * them (ON DELETE CASCADE) and past orders keep their snapshot with a null
 * sku_id (ON DELETE SET NULL), exactly as before.
 */
async function syncSkus(tx: Tx, productId: number, incoming: SkuInput[]): Promise<void> {
  const existing = await tx
    .select({ id: skusTable.id, skuCode: skusTable.skuCode })
    .from(skusTable)
    .where(eq(skusTable.productId, productId));
  const plan = planSkuSync(existing, incoming);

  // 1. Removed SKUs go first, freeing their codes.
  if (plan.deleteIds.length) {
    await tx.delete(skusTable).where(inArray(skusTable.id, plan.deleteIds));
  }

  // 2. Codes are unique store-wide. Rows keeping their code hold it; rows being
  //    renamed are parked on a placeholder first so a swap (A↔B) between two
  //    of this product's SKUs can't trip the unique index half-way.
  const reserved = new Set<string>();
  const renamed = plan.updates.filter((u) => u.input.skuCode.trim() !== u.currentCode);
  for (const u of plan.updates) if (!renamed.includes(u)) reserved.add(u.currentCode);
  for (const u of renamed) {
    await tx.update(skusTable).set({ skuCode: `~renaming~${u.id}` }).where(eq(skusTable.id, u.id));
  }
  const finalCode = new Map<number, string>();
  for (const u of renamed) {
    const code = await ensureUniqueSkuCode(tx, u.input.skuCode, reserved);
    reserved.add(code);
    finalCode.set(u.id, code);
  }

  // 3. Update matched rows in place.
  for (const u of plan.updates) {
    await tx
      .update(skusTable)
      .set({ skuCode: finalCode.get(u.id) ?? u.currentCode, ...skuValues(u.input), updatedAt: new Date() })
      .where(eq(skusTable.id, u.id));
  }

  // 4. Insert the new ones.
  if (plan.inserts.length) {
    const rows = [];
    for (const s of plan.inserts) {
      const skuCode = await ensureUniqueSkuCode(tx, s.skuCode, reserved);
      reserved.add(skuCode);
      rows.push({ productId, skuCode, ...skuValues(s) });
    }
    await tx.insert(skusTable).values(rows);
  }
}

/** Create: write every nested list of a brand-new product. */
async function writeChildren(tx: Tx, productId: number, body: ProductChildren): Promise<void> {
  if (body.fitments?.length) await replaceFitments(tx, productId, body.fitments);
  if (body.images?.length) await replaceImages(tx, productId, body.images);
  if (body.dimensions?.length) await replaceDimensions(tx, productId, body.dimensions);
  if (body.skus?.length) await syncSkus(tx, productId, body.skus);
}

/**
 * Replace a product's SECONDARY category links. The primary category lives in
 * products.category_id and is never stored here, so we drop it (and duplicates)
 * from the incoming list. Called on create/update whenever categoryIds is sent.
 */
async function replaceCategoryLinks(
  tx: Tx,
  productId: number,
  categoryIds: number[],
  primaryCategoryId: number,
): Promise<void> {
  await tx.delete(productCategories).where(eq(productCategories.productId, productId));
  const extras = [...new Set(categoryIds)].filter((cid) => cid !== primaryCategoryId);
  if (extras.length) {
    await tx.insert(productCategories).values(extras.map((categoryId) => ({ productId, categoryId })));
  }
}

async function getProductDetail(db: DbClient, id: number): Promise<AdminProductDetail | null> {
  const p = await db.query.products.findFirst({
    where: eq(products.id, id),
    with: {
      category: { columns: { name: true } },
      images: { orderBy: (img, { asc }) => [asc(img.sortOrder)] },
      dimensions: {
        orderBy: (d, { asc }) => [asc(d.sortOrder)],
        with: { values: { orderBy: (v, { asc }) => [asc(v.sortOrder)] } },
      },
      skus: { orderBy: (s, { asc }) => [asc(s.id)] },
      fitments: { orderBy: (f, { asc }) => [asc(f.id)] },
      extraCategories: { columns: { categoryId: true } },
    },
  });
  if (!p) return null;

  const detail = {
    id: p.id,
    categoryId: p.categoryId,
    categoryIds: p.extraCategories.map((x) => x.categoryId),
    name: p.name,
    slug: p.slug,
    description: p.description ?? "",
    status: p.status,
    isBestseller: p.isBestseller,
    isNew: p.isNew,
    isFeatured: p.isFeatured,
    categoryPinOrder: p.categoryPinOrder ?? null,
    tags: p.tags,
    specifications: p.specifications ?? undefined,
    includedAccessories: p.includedAccessories ?? undefined,
    fitsAllVehicles: p.fitsAllVehicles,
    fitments: p.fitments?.length
      ? p.fitments.map((f) => ({
          make: f.make,
          model: f.model,
          yearStart: f.yearStart ?? undefined,
          yearEnd: f.yearEnd ?? undefined,
        }))
      : undefined,
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
    categoryName: p.category?.name ?? "",
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
  return AdminProductDetailSchema.parse(detail);
}

export function makeAdminProductsRouter(db: DbClient) {
  const router = new Hono<AppEnv>();
  router.use("*", makeRequireAdmin(db));

  // GET /admin/products/:id/preview-token — mint a short-lived signed token so an
  // admin can view an unpublished product on the storefront. The public product
  // route only honours a valid token for that exact slug, so preview links can't
  // be guessed or shared indefinitely.
  router.get("/:id/preview-token", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.json({ error: "Invalid id" }, 400);
    const [row] = await db
      .select({ slug: products.slug })
      .from(products)
      .where(eq(products.id, id))
      .limit(1);
    if (!row) return c.json({ error: "Not Found" }, 404);
    return c.json({ slug: row.slug, token: signPreviewToken(row.slug) });
  });

  // GET /admin/products — cursor-paginated. Default list excludes archived
  // (active + draft only); pass ?status=archived|active|draft to narrow further.
  router.get("/", async (c) => {
    const q = c.req.query();
    const conditions = [];

    const status = ProductStatusSchema.safeParse(q.status);
    if (status.success) {
      conditions.push(eq(products.status, status.data));
    } else {
      conditions.push(ne(products.status, "archived"));
    }
    // The admin UI sends the flag filter as ?flag=bestseller|new|featured; also
    // accept the explicit ?isBestseller=1 form. Previously only the latter was
    // read, so the UI's flag chips silently returned the unfiltered list.
    if (q.isBestseller === "1" || q.flag === "bestseller") conditions.push(eq(products.isBestseller, true));
    if (q.isNew === "1" || q.flag === "new") conditions.push(eq(products.isNew, true));
    if (q.isFeatured === "1" || q.flag === "featured") conditions.push(eq(products.isFeatured, true));
    if (q.categoryId && Number.isInteger(Number(q.categoryId))) {
      conditions.push(eq(products.categoryId, Number(q.categoryId)));
    }
    if (q.categoryTreeId && Number.isInteger(Number(q.categoryTreeId))) {
      const subtreeIds = await getProductCategoryIdsForTree(db, Number(q.categoryTreeId));
      if (subtreeIds.length === 0) {
        return c.json(AdminProductListSchema.parse({ items: [], nextCursor: null }));
      }
      conditions.push(inArray(products.categoryId, subtreeIds));
    }
    if (q.q) conditions.push(ilike(products.name, `%${q.q}%`));

    if (q.cursor) {
      const cur = decodeCursor(q.cursor);
      if (cur) {
        conditions.push(
          or(
            lt(products.updatedAt, cur.updatedAt),
            and(eq(products.updatedAt, cur.updatedAt), lt(products.id, cur.id)),
          )!,
        );
      }
    }

    const limit = Math.min(Math.max(Number(q.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);

    const rows = await db.query.products.findMany({
      where: conditions.length ? and(...conditions) : undefined,
      orderBy: (p, { desc }) => [desc(p.updatedAt), desc(p.id)],
      limit: limit + 1,
      with: {
        category: { columns: { name: true } },
        skus: { columns: { price: true, salePrice: true } },
        images: { columns: { url: true, sortOrder: true } },
      },
    });

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);

    const items = page.map((p) => {
      const effective = p.skus.map((s) => (s.salePrice !== null ? Number(s.salePrice) : Number(s.price)));
      const bases = p.skus.map((s) => Number(s.price));
      let bestDiscount = 0;
      for (const s of p.skus) {
        if (s.salePrice !== null) {
          const base = Number(s.price);
          if (base > 0) bestDiscount = Math.max(bestDiscount, Math.round((1 - Number(s.salePrice) / base) * 100));
        }
      }
      const primaryImage = [...p.images].sort((a, b) => a.sortOrder - b.sortOrder)[0]?.url ?? null;
      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        status: p.status,
        isBestseller: p.isBestseller,
        isNew: p.isNew,
        isFeatured: p.isFeatured,
        categoryId: p.categoryId,
        categoryName: p.category?.name ?? "",
        primaryImage,
        minPrice: effective.length ? Math.min(...effective) : 0,
        maxBasePrice: bases.length ? Math.max(...bases) : 0,
        bestDiscount,
        skuCount: p.skus.length,
        updatedAt: p.updatedAt.toISOString(),
      };
    });

    const last = page[page.length - 1];
    const nextCursor = hasMore && last ? encodeCursor(last.updatedAt, last.id) : null;

    return c.json(AdminProductListSchema.parse({ items, nextCursor }));
  });

  // GET /admin/products/:id
  router.get("/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.json({ error: "Invalid id" }, 400);
    const detail = await getProductDetail(db, id);
    if (!detail) return c.json({ error: "Not Found" }, 404);
    return c.json(detail);
  });

  // POST /admin/products
  router.post("/", async (c) => {
    const parsed = AdminProductCreateSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Invalid request", issues: parsed.error.flatten() }, 400);
    }
    const body = parsed.data;

    let newId: number;
    try {
      newId = await db.transaction(async (tx) => {
        const slug = body.slug ?? (await uniqueSlug(tx, slugify(body.name)));
        const [prod] = await tx
          .insert(products)
          .values({
            categoryId: body.categoryId,
            name: body.name,
            slug,
            description: body.description,
            status: body.status,
            isBestseller: body.isBestseller,
            isNew: body.isNew,
            isFeatured: body.isFeatured,
            categoryPinOrder: body.categoryPinOrder ?? null,
            tags: body.tags,
            specifications: body.specifications ?? null,
            includedAccessories: body.includedAccessories ?? null,
            fitsAllVehicles: body.fitsAllVehicles ?? true,
          })
          .returning({ id: products.id });
        await writeChildren(tx, prod!.id, body);
        if (body.categoryIds !== undefined) {
          await replaceCategoryLinks(tx, prod!.id, body.categoryIds, body.categoryId);
        }
        return prod!.id;
      });
    } catch (err) {
      const mapped = productWriteError(c, err);
      if (mapped) return mapped;
      throw err;
    }

    const detail = await getProductDetail(db, newId);
    await logAudit(db, {
      actorUserId: c.get("adminUserId") ?? null,
      action: "product.create",
      resourceType: "product",
      resourceId: String(newId),
      changes: { after: detail },
    });
    if (detail) await invalidateProductCaches(detail.slug);
    return c.json(detail, 201);
  });

  // PATCH /admin/products/:id
  router.patch("/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.json({ error: "Invalid id" }, 400);

    const parsed = AdminProductPatchSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Invalid request", issues: parsed.error.flatten() }, 400);
    }
    const body = parsed.data;

    const before = await getProductDetail(db, id);
    if (!before) return c.json({ error: "Not Found" }, 404);

    try {
      await db.transaction(async (tx) => {
        const topLevel: Record<string, unknown> = { updatedAt: new Date() };
        if (body.categoryId !== undefined) topLevel.categoryId = body.categoryId;
        if (body.name !== undefined) topLevel.name = body.name;
        if (body.slug !== undefined) topLevel.slug = body.slug;
        if (body.description !== undefined) topLevel.description = body.description;
        if (body.status !== undefined) topLevel.status = body.status;
        if (body.isBestseller !== undefined) topLevel.isBestseller = body.isBestseller;
        if (body.isNew !== undefined) topLevel.isNew = body.isNew;
        if (body.isFeatured !== undefined) topLevel.isFeatured = body.isFeatured;
        if (body.categoryPinOrder !== undefined) topLevel.categoryPinOrder = body.categoryPinOrder;
        if (body.tags !== undefined) topLevel.tags = body.tags;
        if (body.specifications !== undefined) topLevel.specifications = body.specifications;
        if (body.includedAccessories !== undefined) topLevel.includedAccessories = body.includedAccessories;
        if (body.fitsAllVehicles !== undefined) topLevel.fitsAllVehicles = body.fitsAllVehicles;
        await tx.update(products).set(topLevel).where(eq(products.id, id));

        // Cross-listing: replace secondary categories when provided. The primary
        // is whatever it becomes after this update (new value or the existing one).
        if (body.categoryIds !== undefined) {
          const primary = body.categoryId ?? before.categoryId;
          await replaceCategoryLinks(tx, id, body.categoryIds, primary);
        }

        // Nested lists are written only when sent; anything not sent is left
        // exactly as stored. Images, variant dimensions and fitments are
        // replaced wholesale (nothing points at their rows); SKUs are synced IN
        // PLACE so carts keep pointing at them (see syncSkus).
        if (body.images !== undefined) await replaceImages(tx, id, body.images);
        if (body.dimensions !== undefined) await replaceDimensions(tx, id, body.dimensions);
        if (body.fitments !== undefined) await replaceFitments(tx, id, body.fitments);
        if (body.skus !== undefined) await syncSkus(tx, id, body.skus);
      });
    } catch (err) {
      const mapped = productWriteError(c, err);
      if (mapped) return mapped;
      throw err;
    }

    const after = await getProductDetail(db, id);
    await logAudit(db, {
      actorUserId: c.get("adminUserId") ?? null,
      action: "product.update",
      resourceType: "product",
      resourceId: String(id),
      changes: { before, after },
    });
    // Slug may have changed — clear both old and new.
    await invalidateProductCaches(before.slug);
    if (after && after.slug !== before.slug) await invalidateProductCaches(after.slug);
    return c.json(after);
  });

  // POST /admin/products/:id/archive — hide from storefront (soft delete).
  router.post("/:id/archive", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.json({ error: "Invalid id" }, 400);

    const before = await getProductDetail(db, id);
    if (!before) return c.json({ error: "Not Found" }, 404);

    await db
      .update(products)
      .set({ status: "archived", updatedAt: new Date() })
      .where(eq(products.id, id));

    await logAudit(db, {
      actorUserId: c.get("adminUserId") ?? null,
      action: "product.archive",
      resourceType: "product",
      resourceId: String(id),
      changes: { before, after: { ...before, status: "archived" } },
    });
    await invalidateProductCaches(before.slug);
    return c.json({ success: true, id, status: "archived" });
  });

  // POST /admin/products/:id/restore — return to the storefront as active.
  router.post("/:id/restore", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.json({ error: "Invalid id" }, 400);

    const before = await getProductDetail(db, id);
    if (!before) return c.json({ error: "Not Found" }, 404);

    await db
      .update(products)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(products.id, id));

    const after = await getProductDetail(db, id);
    await logAudit(db, {
      actorUserId: c.get("adminUserId") ?? null,
      action: "product.restore",
      resourceType: "product",
      resourceId: String(id),
      changes: { before, after },
    });
    if (after) await invalidateProductCaches(after.slug);
    return c.json({ success: true, id, status: "active" });
  });

  // DELETE /admin/products/:id — permanent removal from the database.
  router.delete("/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id)) return c.json({ error: "Invalid id" }, 400);

    const before = await getProductDetail(db, id);
    if (!before) return c.json({ error: "Not Found" }, 404);

    try {
      await db.delete(products).where(eq(products.id, id));
    } catch (err) {
      if (isForeignKeyViolation(err)) {
        return c.json(
          {
            error: "Product in use",
            message:
              "This product is still referenced by other records " +
              `(${postgresConstraintName(err) ?? "foreign key"}). Archive it instead to hide it ` +
              "from the storefront while keeping those references intact.",
          },
          409,
        );
      }
      throw err;
    }

    await logAudit(db, {
      actorUserId: c.get("adminUserId") ?? null,
      action: "product.delete",
      resourceType: "product",
      resourceId: String(id),
      changes: { before },
    });
    await invalidateProductCaches(before.slug);
    return c.json({ success: true, id });
  });

  return router;
}
