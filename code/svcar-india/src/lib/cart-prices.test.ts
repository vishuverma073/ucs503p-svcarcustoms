import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { server } from "@/mocks/node";
import { products } from "@/mocks/data/products";
import { useCartStore, type CartItem } from "@/store/cartStore";
import {
  diffCartPrices,
  priceChangeNotice,
  refreshCartPrices,
  unavailableNotice,
} from "@/lib/cart-prices";

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterAll(() => server.close());

const line = (over: Partial<CartItem> & { id: number; price: number }): CartItem => ({
  cartKey: `${over.id}`,
  name: "Virtus M4 Spoiler (Gloss Black)",
  slug: "virtus-m4-spoiler",
  image: "",
  qty: 1,
  ...over,
});

describe("diffCartPrices", () => {
  it("flags a changed unit price (sale ?? price), keeps unchanged lines quiet", () => {
    const diff = diffCartPrices(
      [line({ id: 7, price: 4799 }), line({ id: 8, cartKey: "8", name: "LED DRL", price: 3999 })],
      {
        items: [
          { skuId: 7, price: 6999, salePrice: 6499, unitPrice: 6499, stock: 3, available: true },
          { skuId: 8, price: 3999, salePrice: null, unitPrice: 3999, stock: null, available: true },
        ],
        missing: [],
      },
    );
    expect(diff.changes).toEqual([{ cartKey: "7", name: "Virtus M4 Spoiler (Gloss Black)", from: 4799, to: 6499 }]);
    expect(diff.updates).toEqual([
      { cartKey: "7", price: 6499, stock: 3 },
      { cartKey: "8", price: 3999, stock: null },
    ]);
    expect(priceChangeNotice(diff)).toBe("Prices updated: Virtus M4 Spoiler (Gloss Black) is now ₹6,499");
  });

  it("paise-level comparison (no float noise) and price drops are reported too", () => {
    const diff = diffCartPrices([line({ id: 1, price: 16.99 }), line({ id: 2, cartKey: "2", name: "B", price: 900 })], {
      items: [
        { skuId: 1, price: 16.99, salePrice: null, unitPrice: 16.99, stock: null, available: true },
        { skuId: 2, price: 1000, salePrice: 850, unitPrice: 850, stock: null, available: true },
      ],
      missing: [],
    });
    expect(diff.changes.map((c) => [c.name, c.to])).toEqual([["B", 850]]);
  });

  it("a SKU that's gone or no longer on sale is unavailable (not silently re-priced)", () => {
    const diff = diffCartPrices([line({ id: 9, price: 100 }), line({ id: 10, cartKey: "10", name: "Gone", price: 5 })], {
      items: [{ skuId: 9, price: 100, salePrice: null, unitPrice: 100, stock: 1, available: false }],
      missing: [10],
    });
    expect(diff.unavailable.map((u) => u.cartKey)).toEqual(["9", "10"]);
    expect(diff.updates).toEqual([]);
    expect(unavailableNotice(diff)).toMatch(/no longer available — remove them to continue/);
    expect(priceChangeNotice(diff)).toBeNull();
  });
});

describe("refreshCartPrices (mock API) + cartStore.applyPriceUpdates", () => {
  const product = products[0]!;
  const sku = product.skus[0]!;
  const today = sku.salePrice ?? sku.price;

  beforeEach(() => useCartStore.setState({ items: [] }));

  it("rewrites the stored line to today's price; the persisted shape stays the same", async () => {
    useCartStore.setState({ items: [line({ id: sku.id, price: today - 500, stock: 25 })] });
    const before = Object.keys(useCartStore.getState().items[0]!).sort();
    const diff = await refreshCartPrices();
    expect(diff?.changes).toEqual([expect.objectContaining({ from: today - 500, to: today })]);
    const after = useCartStore.getState().items[0]!;
    expect(after.price).toBe(today);
    expect(after.stock).toBe(sku.stock ?? null);
    expect(after.id).toBe(sku.id); // same SKU, same cart key
    expect(Object.keys(after).sort()).toEqual(before);
  });

  it("nothing changed → no update, no notice", async () => {
    useCartStore.setState({ items: [line({ id: sku.id, price: today, stock: sku.stock ?? null })] });
    const items = useCartStore.getState().items;
    const diff = await refreshCartPrices();
    expect(diff?.changes).toEqual([]);
    expect(useCartStore.getState().items).toBe(items); // untouched (no re-render, no write)
  });

  it("overlapping checks share one request and both report the change", async () => {
    useCartStore.setState({ items: [line({ id: sku.id, price: today - 1, stock: 25 })] });
    const [a, b] = await Promise.all([refreshCartPrices(), refreshCartPrices()]);
    expect(a).toBe(b);
    expect(a?.changes).toHaveLength(1);
    expect(useCartStore.getState().items[0]!.price).toBe(today);
  });

  it("network failure → null (the Pay path's server-side total check still applies)", async () => {
    server.close();
    try {
      useCartStore.setState({ items: [line({ id: 999999, price: 1 })] });
      const origFetch = globalThis.fetch;
      globalThis.fetch = (async () => {
        throw new TypeError("Failed to fetch");
      }) as typeof fetch;
      try {
        expect(await refreshCartPrices()).toBeNull();
      } finally {
        globalThis.fetch = origFetch;
      }
    } finally {
      server.listen({ onUnhandledRequest: "bypass" });
    }
  });
});
