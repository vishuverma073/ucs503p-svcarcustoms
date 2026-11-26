/**
 * Products → quick edit (phone bottom sheet): change each SKU's price, sale
 * price and stock without opening the full editor.
 *
 * The full editor PATCHes the whole product. Quick edit sends ONLY `skus` —
 * PATCH /admin/products/:id keeps every field that isn't sent (name, images,
 * variants, fitments, categories…) exactly as stored — and each SKU goes back
 * complete (id, code, variant values, attributes), with just the three numbers
 * changed. The id makes the API update the same SKU row in place, so carts
 * holding it are untouched. Nothing outside those numbers can be lost.
 */
import { MAX_MONEY_RUPEES, type AdminProductUpdate, type Product } from "@svcar/contracts";

/** What the three inputs hold for one SKU (raw text, as typed). */
export interface SkuDraft {
  price: string;
  salePrice: string;
  stock: string;
}

export type SkuDraftErrors = Partial<Record<keyof SkuDraft, string>>;

export function draftsFromProduct(product: Pick<Product, "skus">): SkuDraft[] {
  return product.skus.map((s) => ({
    price: String(s.price),
    salePrice: s.salePrice == null ? "" : String(s.salePrice),
    stock: s.stock == null ? "" : String(s.stock),
  }));
}

/** "₹ 1,299.50" → 1299.5; "" → null; junk → NaN. */
export function parseMoney(raw: string): number | null {
  const cleaned = raw.replace(/[₹,\s]/g, "");
  if (cleaned === "") return null;
  if (!/^\d*\.?\d*$/.test(cleaned) || cleaned === ".") return Number.NaN;
  return Number(cleaned);
}

/** "12" → 12; "" → null (untracked); anything else → NaN. */
export function parseStock(raw: string): number | null {
  const cleaned = raw.replace(/[,\s]/g, "");
  if (cleaned === "") return null;
  if (!/^\d+$/.test(cleaned)) return Number.NaN;
  return Number(cleaned);
}

/**
 * At most two decimals, checked on the TEXT the admin typed — a float check
 * (n * 100 is a whole number) wrongly rejects ₹16.99 / ₹8.70 / ₹549.95,
 * because 16.99 * 100 = 1698.9999999999998.
 */
export function hasAtMostTwoDecimals(raw: string): boolean {
  return /^\d+(\.\d{1,2})?$/.test(raw.replace(/[₹,\s]/g, ""));
}

export function validateSkuDraft(d: SkuDraft): SkuDraftErrors {
  const errors: SkuDraftErrors = {};
  const price = parseMoney(d.price);
  const sale = parseMoney(d.salePrice);
  const stock = parseStock(d.stock);

  if (price === null) errors.price = "Price is required";
  else if (Number.isNaN(price)) errors.price = "Enter a number";
  else if (price <= 0) errors.price = "Price must be more than ₹0";
  else if (price > MAX_MONEY_RUPEES) errors.price = "Price is too large";
  else if (!hasAtMostTwoDecimals(d.price)) errors.price = "At most 2 decimals";

  if (sale !== null) {
    if (Number.isNaN(sale)) errors.salePrice = "Enter a number";
    else if (sale < 0) errors.salePrice = "Can't be negative";
    else if (!hasAtMostTwoDecimals(d.salePrice)) errors.salePrice = "At most 2 decimals";
    else if (price !== null && !Number.isNaN(price) && sale > price) errors.salePrice = "Sale price must be ≤ price";
  }

  if (stock !== null && (Number.isNaN(stock) || stock < 0)) errors.stock = "Whole number, 0 or more";

  return errors;
}

export function validateDrafts(drafts: SkuDraft[]): { ok: boolean; errors: SkuDraftErrors[] } {
  const errors = drafts.map(validateSkuDraft);
  return { ok: errors.every((e) => Object.keys(e).length === 0), errors };
}

/** True when any number differs from what's stored. */
export function draftsChanged(product: Pick<Product, "skus">, drafts: SkuDraft[]): boolean {
  return product.skus.some((s, i) => {
    const d = drafts[i];
    if (!d) return false;
    return (
      parseMoney(d.price) !== s.price ||
      parseMoney(d.salePrice) !== (s.salePrice ?? null) ||
      parseStock(d.stock) !== (s.stock ?? null)
    );
  });
}

/**
 * The PATCH body: `{ skus }` only, every SKU complete, numbers from the drafts.
 * Throws if the drafts don't validate (call validateDrafts first).
 */
export function buildQuickEditPatch(product: Pick<Product, "skus">, drafts: SkuDraft[]): AdminProductUpdate {
  if (drafts.length !== product.skus.length) throw new Error("SKU list changed — reload and try again");
  const { ok } = validateDrafts(drafts);
  if (!ok) throw new Error("Fix the highlighted fields first");
  return {
    skus: product.skus.map((s, i) => {
      const d = drafts[i]!;
      return {
        // Same row, updated in place — carts holding this SKU keep it.
        id: s.id,
        skuCode: s.skuCode,
        price: parseMoney(d.price) as number,
        salePrice: parseMoney(d.salePrice),
        dimensionValues: s.dimensionValues,
        ...(s.attributes ? { attributes: s.attributes } : {}),
        stock: parseStock(d.stock),
      };
    }),
  };
}

/** Row title for a SKU: its variant values ("Red / Large"), else the SKU code. */
export function skuLabel(sku: Pick<Product["skus"][number], "skuCode" | "dimensionValues">): string {
  const values = Object.values(sku.dimensionValues ?? {}).filter(Boolean);
  return values.length ? values.join(" / ") : sku.skuCode;
}

/** List-card numbers from a product's SKUs (same rules as GET /admin/products). */
export function listPricing(skus: Pick<Product["skus"][number], "price" | "salePrice">[]): {
  minPrice: number;
  maxBasePrice: number;
  bestDiscount: number;
} {
  const effective = skus.map((s) => (s.salePrice != null ? s.salePrice : s.price));
  const bases = skus.map((s) => s.price);
  let bestDiscount = 0;
  for (const s of skus) {
    if (s.salePrice != null && s.price > 0) {
      bestDiscount = Math.max(bestDiscount, Math.round((1 - s.salePrice / s.price) * 100));
    }
  }
  return {
    minPrice: effective.length ? Math.min(...effective) : 0,
    maxBasePrice: bases.length ? Math.max(...bases) : 0,
    bestDiscount,
  };
}
