import { z } from "zod";
import { IdSchema, MoneySchema } from "./common";
import { FitmentSchema } from "./vehicle";

/** Product lifecycle status. */
export const ProductStatusSchema = z.enum(["active", "draft", "archived"]);
export type ProductStatus = z.infer<typeof ProductStatusSchema>;

/** One selectable value on a variant axis, e.g. "24×18" on the "Size" dimension. */
export const DimensionValueSchema = z.object({
  id: IdSchema,
  value: z.string().min(1),
  label: z.string().optional(),
  sortOrder: z.number().int().default(0),
});
export type DimensionValue = z.infer<typeof DimensionValueSchema>;

/** A named variant axis on a product, e.g. "Size" / "Weight" / "Color". */
export const VariantDimensionSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  sortOrder: z.number().int().default(0),
  values: z.array(DimensionValueSchema),
});
export type VariantDimension = z.infer<typeof VariantDimensionSchema>;

/** A purchasable unit: a product × a specific combination of dimension values. */
export const ProductSKUSchema = z.object({
  id: IdSchema,
  skuCode: z.string().min(1),
  price: MoneySchema,
  salePrice: MoneySchema.nullable(),
  /** e.g. { "Size": "24×18", "Weight": "Heavy" } */
  dimensionValues: z.record(z.string(), z.string()),
  /** Free-form per-SKU details, e.g. { "Bowl Size": "22×16", "mm": "610×510" } */
  attributes: z.record(z.string(), z.string()).optional(),
  stock: z.number().int().nullable().optional(),
});
export type ProductSKU = z.infer<typeof ProductSKUSchema>;

export const SpecificationSchema = z.object({
  name: z.string(),
  value: z.string(),
});
export type Specification = z.infer<typeof SpecificationSchema>;

export const ProductImageSchema = z.object({
  url: z.string().min(1),
  alt: z.string().optional(),
  sortOrder: z.number().int().optional(),
});
export type ProductImage = z.infer<typeof ProductImageSchema>;

/** Full product detail — what the PDP and admin editor consume. */
export const ProductSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().default(""),
  categoryId: IdSchema,
  /** Additional categories this product is cross-listed under (besides categoryId).
   *  Lets one product appear in several categories, e.g. Spoilers + VW Parts. */
  categoryIds: z.array(IdSchema).optional(),
  isBestseller: z.boolean().default(false),
  isNew: z.boolean().default(false),
  isFeatured: z.boolean().default(false),
  status: ProductStatusSchema.default("draft"),
  tags: z.array(z.string()).default([]),
  // Accept legacy bare URL strings from mocks while retaining stored image alt text
  // from API image objects for the PDP and structured data.
  images: z
    .array(
      z.union([
        z.string(),
        ProductImageSchema,
      ]),
    )
    .transform((arr) =>
      arr
        .map((img, sortOrder) =>
          typeof img === "string" ? { url: img, sortOrder } : img,
        )
        .map((image) => ({ ...image, url: image.url.trim() }))
        .filter((image) => Boolean(image.url)),
    ),
  dimensions: z.array(VariantDimensionSchema).default([]),
  skus: z.array(ProductSKUSchema),
  specifications: z.array(SpecificationSchema).optional(),
  includedAccessories: z.array(z.string()).optional(),
  /** Vehicle fitment. Universal accessories set this true and omit `fitments`.
   *  Optional on the wire; consumers treat a missing value as universal. */
  fitsAllVehicles: z.boolean().optional(),
  /** Compatible vehicles when not universal. */
  fitments: z.array(FitmentSchema).optional(),
});
export type Product = z.infer<typeof ProductSchema>;

/**
 * Lightweight product shape for grids/carousels/search. Pricing is
 * pre-computed server-side so the client never recomputes from SKUs.
 */
export const ProductListItemSchema = z.object({
  id: IdSchema,
  name: z.string(),
  slug: z.string(),
  categoryId: IdSchema,
  /** Extra categories this product is cross-listed under (besides categoryId). */
  categoryIds: z.array(IdSchema).optional(),
  // Real API returns null when there is no primary image; normalize to "" so
  // grids still render and thumbnail helpers can show a placeholder.
  image: z
    .string()
    .nullish()
    .transform((v) => v?.trim() ?? ""),
  minPrice: MoneySchema,
  maxBasePrice: MoneySchema,
  bestDiscount: z.number().int().min(0).max(100),
  isBestseller: z.boolean(),
  isNew: z.boolean(),
  isFeatured: z.boolean().default(false),
  status: ProductStatusSchema,
  // Optional: the public /products list omits skuCount (only /admin/products
  // returns it, where the admin UI shows "N SKUs"). Keeping it required broke
  // every storefront grid (bestsellers/new arrivals/category) against the real API.
  skuCount: z.number().int().nonnegative().optional(),
  tags: z.array(z.string()).default([]),
  /** Size values from variant dimensions (Size / Overall Size) for category filters. */
  sizes: z.array(z.string()).default([]),
  /** Fitment summary for the "fits my car" client filter on grids. */
  fitsAllVehicles: z.boolean().optional(),
  fitments: z.array(FitmentSchema).optional(),
});
export type ProductListItem = z.infer<typeof ProductListItemSchema>;

// ─── Admin product write payloads (server assigns ids) ─────────────────────

export const ProductImageInputSchema = z.object({
  url: z.string().min(1),
  alt: z.string().optional(),
  sortOrder: z.number().int().default(0),
});

export const DimensionValueInputSchema = z.object({
  value: z.string().min(1),
  label: z.string().optional(),
  sortOrder: z.number().int().default(0),
});

export const DimensionInputSchema = z.object({
  name: z.string().min(1),
  sortOrder: z.number().int().default(0),
  values: z.array(DimensionValueInputSchema).default([]),
});

export const SkuInputSchema = z.object({
  /** Existing SKU's id (edit): the API then updates that row in place, so
   *  carts holding it keep working. Omit for new SKUs. */
  id: IdSchema.optional(),
  skuCode: z.string().min(1),
  price: MoneySchema,
  salePrice: MoneySchema.nullable().default(null),
  dimensionValues: z.record(z.string(), z.string()).default({}),
  attributes: z.record(z.string(), z.string()).optional(),
  stock: z.number().int().nullable().optional(),
});

/** Admin create payload — product, SKU, and dimension ids are server-assigned. */
export const AdminProductCreateSchema = z.object({
  categoryId: IdSchema,
  /** Additional categories to cross-list this product under (besides categoryId). */
  categoryIds: z.array(IdSchema).optional(),
  name: z.string().min(1),
  slug: z.string().optional(),
  description: z.string().default(""),
  status: ProductStatusSchema.default("draft"),
  isBestseller: z.boolean().default(false),
  isNew: z.boolean().default(false),
  isFeatured: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
  specifications: z.array(SpecificationSchema).optional(),
  includedAccessories: z.array(z.string()).optional(),
  images: z
    .array(z.union([z.string(), ProductImageInputSchema]))
    .default([]),
  dimensions: z.array(DimensionInputSchema).default([]),
  skus: z.array(SkuInputSchema).default([]),
  fitsAllVehicles: z.boolean().optional(),
  fitments: z.array(FitmentSchema).optional(),
});
export type AdminProductCreate = z.infer<typeof AdminProductCreateSchema>;

export const AdminProductUpdateSchema = AdminProductCreateSchema.partial();
export type AdminProductUpdate = z.infer<typeof AdminProductUpdateSchema>;

// ─── Search (GET /search) ───────────────────────────────────────────────────

/** Page size GET /search serves when `limit` is absent — and the only size the first build served. */
export const SEARCH_DEFAULT_LIMIT = 20;
/** Largest page GET /search returns; a bigger `limit` is clamped, not rejected. */
export const SEARCH_MAX_LIMIT = 50;

/**
 * GET /search query. Results are ranked by relevance, so `cursor` is the rank
 * offset of the next page (the `nextCursor` of the previous response) rather
 * than a product id as on GET /products. Out-of-range values fall back instead
 * of failing: the storefront search box must keep working on any input.
 */
export const SearchQuerySchema = z.object({
  q: z.string().optional(),
  limit: z.coerce
    .number()
    .int()
    .catch(SEARCH_DEFAULT_LIMIT)
    .transform((n) => Math.min(Math.max(n, 1), SEARCH_MAX_LIMIT)),
  cursor: z.coerce.number().int().nonnegative().catch(0),
});
export type SearchQuery = z.infer<typeof SearchQuerySchema>;

/** GET /search response: one page of ranked list items; `nextCursor` null = no more. */
export const SearchPageSchema = z.object({
  items: z.array(ProductListItemSchema),
  nextCursor: z.number().int().nonnegative().nullable(),
});
export type SearchPage = z.infer<typeof SearchPageSchema>;
