import { describe, expect, it } from "vitest";
import type { Product } from "@svcar/contracts";
import {
  buildQuickEditPatch,
  draftsChanged,
  draftsFromProduct,
  listPricing,
  parseMoney,
  parseStock,
  skuLabel,
  validateDrafts,
  validateSkuDraft,
} from "@/lib/quick-edit";

const PRODUCT = {
  id: 7,
  name: "Virtus M4 spoiler",
  skus: [
    { id: 1, skuCode: "VM4-GB", price: 4999, salePrice: 4299, dimensionValues: { Finish: "Gloss Black" }, attributes: { Material: "ABS" }, stock: 12 },
    { id: 2, skuCode: "VM4-CF", price: 6999, salePrice: null, dimensionValues: { Finish: "Carbon" }, stock: null },
  ],
} as unknown as Product;

describe("parsing what was typed", () => {
  it("money: ₹, commas and spaces are fine; empty means none", () => {
    expect(parseMoney("₹ 1,299.50")).toBe(1299.5);
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("12a")).toBeNaN();
    expect(parseMoney("-5")).toBeNaN();
  });

  it("stock: whole numbers only; empty = not tracked", () => {
    expect(parseStock("25")).toBe(25);
    expect(parseStock("")).toBeNull();
    expect(parseStock("2.5")).toBeNaN();
    expect(parseStock("-1")).toBeNaN();
  });
});

describe("validation", () => {
  it("accepts valid rows", () => {
    expect(validateSkuDraft({ price: "4999", salePrice: "4299", stock: "3" })).toEqual({});
    expect(validateSkuDraft({ price: "4999", salePrice: "", stock: "" })).toEqual({});
    expect(validateSkuDraft({ price: "4999", salePrice: "4999", stock: "0" })).toEqual({});
  });

  it("accepts real 2-decimal prices (₹16.99, ₹8.70, ₹549.95) — no float false alarms", () => {
    for (const [price, sale] of [
      ["16.99", "15.49"],
      ["8.70", "8.7"],
      ["549.95", "499.99"],
      ["1,299.50", "1,199.05"],
      ["0.29", "0.07"],
    ]) {
      expect(validateSkuDraft({ price: price!, salePrice: sale!, stock: "" }), `${price}/${sale}`).toEqual({});
    }
    expect(validateSkuDraft({ price: "16.999", salePrice: "", stock: "" }).price).toBe("At most 2 decimals");
    expect(validateSkuDraft({ price: "100", salePrice: "9.995", stock: "" }).salePrice).toBe("At most 2 decimals");
    expect(validateSkuDraft({ price: "100.", salePrice: "", stock: "" }).price).toBe("At most 2 decimals");
  });

  it("sale price must be ≤ price", () => {
    expect(validateSkuDraft({ price: "4000", salePrice: "4500", stock: "" }).salePrice).toBe("Sale price must be ≤ price");
  });

  it("stock must be a non-negative whole number", () => {
    expect(validateSkuDraft({ price: "10", salePrice: "", stock: "-2" }).stock).toBeDefined();
    expect(validateSkuDraft({ price: "10", salePrice: "", stock: "1.5" }).stock).toBeDefined();
  });

  it("price is required, positive, ≤ 2 decimals", () => {
    expect(validateSkuDraft({ price: "", salePrice: "", stock: "" }).price).toBe("Price is required");
    expect(validateSkuDraft({ price: "0", salePrice: "", stock: "" }).price).toBeDefined();
    expect(validateSkuDraft({ price: "abc", salePrice: "", stock: "" }).price).toBe("Enter a number");
    expect(validateSkuDraft({ price: "10.555", salePrice: "", stock: "" }).price).toBe("At most 2 decimals");
  });

  it("validateDrafts reports per row", () => {
    const r = validateDrafts([
      { price: "10", salePrice: "", stock: "" },
      { price: "10", salePrice: "20", stock: "x" },
    ]);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toEqual({});
    expect(Object.keys(r.errors[1]!).sort()).toEqual(["salePrice", "stock"]);
  });
});

describe("PATCH body", () => {
  it("starts from the stored numbers and detects changes", () => {
    const drafts = draftsFromProduct(PRODUCT);
    expect(drafts).toEqual([
      { price: "4999", salePrice: "4299", stock: "12" },
      { price: "6999", salePrice: "", stock: "" },
    ]);
    expect(draftsChanged(PRODUCT, drafts)).toBe(false);
    expect(draftsChanged(PRODUCT, [drafts[0]!, { ...drafts[1]!, stock: "4" }])).toBe(true);
  });

  it("sends ONLY skus, each complete (id, code, variant values, attributes kept) with the new numbers", () => {
    const drafts = draftsFromProduct(PRODUCT);
    drafts[0] = { price: "5,199", salePrice: "", stock: "0" };
    drafts[1] = { price: "6999", salePrice: "6499", stock: "8" };
    const patch = buildQuickEditPatch(PRODUCT, drafts);
    expect(Object.keys(patch)).toEqual(["skus"]);
    expect(patch.skus).toEqual([
      { id: 1, skuCode: "VM4-GB", price: 5199, salePrice: null, dimensionValues: { Finish: "Gloss Black" }, attributes: { Material: "ABS" }, stock: 0 },
      { id: 2, skuCode: "VM4-CF", price: 6999, salePrice: 6499, dimensionValues: { Finish: "Carbon" }, stock: 8 },
    ]);
  });

  it("refuses invalid drafts or a changed SKU list", () => {
    const drafts = draftsFromProduct(PRODUCT);
    expect(() => buildQuickEditPatch(PRODUCT, [{ ...drafts[0]!, salePrice: "99999" }, drafts[1]!])).toThrow();
    expect(() => buildQuickEditPatch(PRODUCT, [drafts[0]!])).toThrow();
  });

  it("list card numbers follow the API's rules", () => {
    expect(listPricing([{ price: 4999, salePrice: 4299 }, { price: 6999, salePrice: null }])).toEqual({
      minPrice: 4299,
      maxBasePrice: 6999,
      bestDiscount: 14,
    });
  });

  it("row label: variant values, else the SKU code", () => {
    expect(skuLabel(PRODUCT.skus[0]!)).toBe("Gloss Black");
    expect(skuLabel({ skuCode: "PLAIN-1", dimensionValues: {} })).toBe("PLAIN-1");
  });
});
