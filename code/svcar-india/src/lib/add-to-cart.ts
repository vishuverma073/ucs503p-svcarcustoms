import { isPurchasable } from "@/lib/stock";
import type { EventItem } from "@/lib/analytics-events";

/**
 * The PDP add-to-cart path, shared by the inline Add to Cart button and the
 * phone sticky buy bar. Pure pieces live here (unit-tested); the React state
 * that drives both buttons is `useAddToCart` in use-add-to-cart.ts.
 */

/** What the PDP passes in for the current selection (one SKU). */
export interface AddToCartProduct {
    /** SKU id — the cart/server merge key. */
    id: number;
    name: string;
    slug: string;
    price: number;
    image: string;
    variant?: string;
    stock?: number | null;
}

/**
 * - `loading`: not mounted yet (cart lives in browser storage) — render the
 *   disabled placeholder so SSR and the first client frame match.
 * - `unavailable`: the product has no SKU for the current selection.
 * - `out_of_stock`: tracked stock is 0.
 * - `added`: brief "Added" confirmation after an add or a qty update.
 * - `in_cart`: this selection is already in the cart → View cart / Checkout.
 * - `add`: ready to add.
 */
export type AddToCartView = "loading" | "unavailable" | "out_of_stock" | "added" | "in_cart" | "add";

/** Same key the cart store builds: "id" or "id-variant". */
export function cartKeyFor(id: number, variant?: string): string {
    return variant ? `${id}-${variant}` : `${id}`;
}

export function addToCartView(s: {
    mounted: boolean;
    available: boolean;
    outOfStock: boolean;
    justAdded: boolean;
    inCart: boolean;
}): AddToCartView {
    if (!s.mounted) return "loading";
    if (!s.available) return "unavailable";
    if (s.outOfStock) return "out_of_stock";
    if (s.justAdded) return "added";
    if (s.inCart) return "in_cart";
    return "add";
}

/**
 * One add: stock guard, then the cart store, then exactly one add_to_cart
 * event. Returns whether the item was handed to the cart.
 */
export function runAddToCart(
    product: AddToCartProduct,
    deps: {
        addItem: (item: AddToCartProduct) => void;
        track: (item: EventItem) => void;
        onOutOfStock: () => void;
    },
): boolean {
    if (!isPurchasable(product.stock)) {
        deps.onOutOfStock();
        return false;
    }
    deps.addItem(product);
    deps.track({ id: String(product.id), name: product.name, price: product.price, qty: 1 });
    return true;
}
