import { describe, expect, it, vi } from "vitest";
import { addToCartView, cartKeyFor, runAddToCart, type AddToCartProduct } from "@/lib/add-to-cart";

const product: AddToCartProduct = {
  id: 3080,
  name: "Forge induction kit (Red)",
  slug: "forge-induction-kit",
  price: 4999,
  image: "/x.webp",
  variant: "Red",
  stock: 25,
};

function deps() {
  return { addItem: vi.fn(), track: vi.fn(), onOutOfStock: vi.fn() };
}

describe("runAddToCart — the one add path behind both PDP buttons", () => {
  it("adds the SKU and fires add_to_cart exactly once with the SKU id", () => {
    const d = deps();
    expect(runAddToCart(product, d)).toBe(true);
    expect(d.addItem).toHaveBeenCalledTimes(1);
    expect(d.addItem).toHaveBeenCalledWith(product);
    expect(d.track).toHaveBeenCalledTimes(1);
    expect(d.track).toHaveBeenCalledWith({ id: "3080", name: product.name, price: 4999, qty: 1 });
    expect(d.onOutOfStock).not.toHaveBeenCalled();
  });

  it("treats untracked stock (null/undefined) as purchasable", () => {
    for (const stock of [null, undefined]) {
      const d = deps();
      expect(runAddToCart({ ...product, stock }, d)).toBe(true);
      expect(d.track).toHaveBeenCalledTimes(1);
    }
  });

  it("refuses an out-of-stock SKU: no cart change, no event", () => {
    const d = deps();
    expect(runAddToCart({ ...product, stock: 0 }, d)).toBe(false);
    expect(d.addItem).not.toHaveBeenCalled();
    expect(d.track).not.toHaveBeenCalled();
    expect(d.onOutOfStock).toHaveBeenCalledTimes(1);
  });
});

describe("cartKeyFor", () => {
  it("matches the cart store's key format", () => {
    expect(cartKeyFor(12)).toBe("12");
    expect(cartKeyFor(12, "Red")).toBe("12-Red");
    expect(cartKeyFor(12, "")).toBe("12");
  });
});

describe("addToCartView", () => {
  const base = { mounted: true, available: true, outOfStock: false, justAdded: false, inCart: false };

  it("renders the placeholder until mounted, whatever else is true", () => {
    expect(addToCartView({ ...base, mounted: false, inCart: true, outOfStock: true })).toBe("loading");
  });

  it("a selection without a SKU is unavailable (never adds the product id)", () => {
    expect(addToCartView({ ...base, available: false })).toBe("unavailable");
    expect(addToCartView({ ...base, available: false, inCart: true })).toBe("unavailable");
  });

  it("out of stock wins over in-cart", () => {
    expect(addToCartView({ ...base, outOfStock: true, inCart: true })).toBe("out_of_stock");
  });

  it("flashes Added, then shows the in-cart next steps", () => {
    expect(addToCartView({ ...base, justAdded: true, inCart: true })).toBe("added");
    expect(addToCartView({ ...base, inCart: true })).toBe("in_cart");
    expect(addToCartView(base)).toBe("add");
  });
});
