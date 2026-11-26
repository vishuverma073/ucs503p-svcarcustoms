"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { useCartStore } from "@/store/cartStore";
import { stockBadgeLabel, isPurchasable } from "@/lib/stock";
import { trackAddToCart } from "@/lib/analytics-events";
import {
    addToCartView,
    cartKeyFor,
    runAddToCart,
    type AddToCartProduct,
    type AddToCartView,
} from "@/lib/add-to-cart";

export type { AddToCartProduct, AddToCartView } from "@/lib/add-to-cart";

export interface AddToCartController {
    view: AddToCartView;
    stockLabel: string | null;
    /** Quantity of this selection in the cart (1 when it isn't in the cart). */
    qty: number;
    /** Add one of the current selection (stock-guarded, tracked once). */
    add: () => void;
    /** Set the cart quantity of the current selection. */
    setQty: (qty: number) => void;
}

const noopSubscribe = () => () => {};

/**
 * False on the server and during hydration, true afterwards — the cart is
 * read from browser storage, so anything cart-dependent renders the same
 * placeholder as the server HTML until then (no hydration mismatch, no CLS).
 */
function useHydrated(): boolean {
    return useSyncExternalStore(
        noopSubscribe,
        () => true,
        () => false,
    );
}

/**
 * Add-to-cart state for the PDP's current selection. Instantiated ONCE in
 * ProductPageClient and handed to both the inline button and the sticky bar,
 * so `addItem` + `trackAddToCart` have a single call site and both buttons
 * always show the same state.
 *
 * `product` is null when the selection has no SKU — nothing can be added then
 * (never fall back to the product id: it is not a SKU id).
 */
export function useAddToCart(product: AddToCartProduct | null): AddToCartController {
    const mounted = useHydrated();
    const [justAdded, setJustAdded] = useState(false);
    const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    useEffect(() => () => clearTimeout(flashTimer.current), []);

    const items = useCartStore((s) => s.items);
    const addItem = useCartStore((s) => s.addItem);
    const updateQty = useCartStore((s) => s.updateQty);

    const cartKey = product ? cartKeyFor(product.id, product.variant) : null;
    const cartItem = cartKey ? items.find((i) => i.cartKey === cartKey) : undefined;
    const outOfStock = product ? !isPurchasable(product.stock) : false;

    const view = addToCartView({
        mounted,
        available: product !== null,
        outOfStock,
        justAdded,
        inCart: !!cartItem,
    });

    function flash(ms: number) {
        clearTimeout(flashTimer.current);
        setJustAdded(true);
        flashTimer.current = setTimeout(() => setJustAdded(false), ms);
    }

    function add() {
        if (!product) return;
        const added = runAddToCart(product, {
            addItem,
            track: trackAddToCart,
            onOutOfStock: () => toast.error("This item is out of stock"),
        });
        if (added) flash(1200);
    }

    function setQty(qty: number) {
        if (!cartKey) return;
        updateQty(cartKey, qty);
        flash(800);
    }

    return {
        view,
        stockLabel: product ? stockBadgeLabel(product.stock) : null,
        qty: cartItem?.qty ?? 1,
        add,
        setQty,
    };
}
