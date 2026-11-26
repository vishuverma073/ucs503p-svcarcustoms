"use client";

import Link from "next/link";
import { ArrowRight, Check, ShoppingBag } from "lucide-react";
import { useState } from "react";
import type { AddToCartController } from "@/lib/use-add-to-cart";

/**
 * The inline PDP Add to Cart. State and the add itself come from the page's
 * single useAddToCart instance (shared with the phone sticky buy bar), so an
 * add from either place is the same add, tracked once.
 */
export default function AddToCartButton({ cart }: { cart: AddToCartController }) {
    const { view, stockLabel } = cart;

    // Not mounted yet: the cart lives in browser storage, so render the same
    // disabled button the server did (no hydration mismatch, no layout shift).
    if (view === "loading") {
        return (
            <button className="pdp-atc-btn" disabled>
                <ShoppingBag size={18} strokeWidth={1.8} /> Add to Cart
            </button>
        );
    }

    // The selected options have no SKU — there is nothing valid to add.
    if (view === "unavailable") {
        return (
            <div className="space-y-2">
                <button className="pdp-atc-btn opacity-50 cursor-not-allowed" disabled type="button">
                    Unavailable
                </button>
                <p className="text-xs font-medium text-text-muted">
                    This option isn&apos;t available. Please choose another.
                </p>
            </div>
        );
    }

    if (view === "out_of_stock") {
        return (
            <div className="space-y-2">
                <button className="pdp-atc-btn opacity-50 cursor-not-allowed" disabled type="button">
                    Out of Stock
                </button>
                {stockLabel && <p className="text-xs font-medium text-danger">{stockLabel}</p>}
            </div>
        );
    }

    if (view === "in_cart") {
        return (
            <div className="space-y-2">
                {/* Keyed on the cart quantity: the field restarts from the cart's
                    real value whenever it changes (e.g. clamped to stock). */}
                <QtyRow key={cart.qty} qty={cart.qty} onCommit={cart.setQty} />
                {stockLabel && <p className="text-xs font-medium text-amber-700">{stockLabel}</p>}
                {/* Once it's in the cart, give the shopper the next step right here. */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                    <Link href="/cart" className="btn btn-secondary w-full">
                        View cart
                    </Link>
                    <Link href="/checkout" className="btn btn-primary w-full">
                        Checkout <ArrowRight size={16} />
                    </Link>
                </div>
            </div>
        );
    }

    const justAdded = view === "added";
    return (
        <div className="space-y-2">
            <button
                onClick={cart.add}
                disabled={justAdded}
                className={`pdp-atc-btn ${justAdded ? "success" : ""}`}
                type="button"
            >
                {justAdded ? (
                    <>
                        <Check size={18} strokeWidth={2.5} /> Added
                    </>
                ) : (
                    <>
                        <ShoppingBag size={18} strokeWidth={1.8} /> Add to Cart
                    </>
                )}
            </button>
            {stockLabel && !justAdded && (
                <p className="text-xs font-medium text-amber-700">{stockLabel}</p>
            )}
        </div>
    );
}

function QtyRow({ qty, onCommit }: { qty: number; onCommit: (qty: number) => void }) {
    const [inputValue, setInputValue] = useState(String(qty));

    const handleUpdateQty = () => {
        const parsed = parseInt(inputValue, 10);
        const newQty = isNaN(parsed) || parsed < 1 ? 1 : parsed;
        setInputValue(String(newQty));
        onCommit(newQty);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            handleUpdateQty();
            (e.target as HTMLInputElement).blur();
        }
    };

    return (
        <div className="pdp-qty-row">
            <label className="pdp-qty-label" htmlFor="pdp-qty-input">
                Qty
            </label>
            <input
                id="pdp-qty-input"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value.replace(/[^0-9]/g, ""))}
                onKeyDown={handleKeyDown}
                onBlur={handleUpdateQty}
                className="pdp-qty-input"
            />
            <button onClick={handleUpdateQty} className="pdp-qty-update" type="button">
                Update Cart
            </button>
        </div>
    );
}
