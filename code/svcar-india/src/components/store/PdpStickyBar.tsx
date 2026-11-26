"use client";

import Link from "next/link";
import type { RefObject } from "react";
import { ArrowRight, Check, ShoppingBag, MessageCircle } from "lucide-react";
import { trackWhatsapp } from "@/lib/track-whatsapp";
import { formatPrice } from "@/lib/utils";
import type { AddToCartController } from "@/lib/use-add-to-cart";
import { useInView } from "@/lib/use-in-view";
import { useKeyboardOpen } from "@/lib/use-keyboard-open";
import { PDP_BAR_HEIGHT_PX, visibleAreaMargin } from "@/lib/sticky-bars";

/**
 * Phone/tablet (< 1024px) sticky buy bar on the PDP: price on the left, the
 * page's Add to Cart on the right. Shown only while the inline Add to Cart
 * (`targetRef`) is off screen, so the two never appear together; hidden while
 * the on-screen keyboard is open. Uses the page's single useAddToCart
 * controller — same SKU, stock guard, analytics and in-cart state as the
 * inline button.
 */
export default function PdpStickyBar({
    cart,
    price,
    mrp,
    detail,
    targetRef,
}: {
    cart: AddToCartController;
    price: number;
    mrp: number;
    /** One short muted line under the price (variant, COD advance, "In your cart"). */
    detail: string | null;
    targetRef: RefObject<HTMLElement | null>;
}) {
    const inlineInView = useInView(targetRef, visibleAreaMargin(PDP_BAR_HEIGHT_PX));
    const keyboardOpen = useKeyboardOpen();
    const visible = inlineInView === false && !keyboardOpen;

    return (
        <div data-bottom-bar="pdp" className={`sticky-bottom-bar${visible ? " is-visible" : ""}`}>
            <div className="max-w-380 mx-auto px-4 h-[var(--pdp-bar-h)] flex items-center gap-3">
                <div className="min-w-0 flex-1 leading-tight d-edge">
                    <p className="flex items-baseline gap-2 whitespace-nowrap overflow-hidden">
                        <span className="font-display text-[22px] font-extrabold text-text-primary leading-none">
                            {formatPrice(price)}
                        </span>
                        {price < mrp && (
                            <span className="text-[13px] text-text-muted line-through">{formatPrice(mrp)}</span>
                        )}
                    </p>
                    {detail && <p className="text-[12px] text-text-muted truncate mt-0.5">{detail}</p>}
                </div>
                <div className="shrink-0 flex items-center gap-2">
                    <a
                        href="https://wa.me/919205005425"
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => trackWhatsapp("product")}
                        className="flex h-11 w-11 items-center justify-center border border-border text-whatsapp rounded-sm"
                        aria-label="Ask on WhatsApp"
                    >
                        <MessageCircle size={20} aria-hidden />
                    </a>
                    <BarActions cart={cart} />
                </div>
            </div>
        </div>
    );
}

function BarActions({ cart }: { cart: AddToCartController }) {
    switch (cart.view) {
        case "in_cart":
            return (
                <>
                    <Link href="/cart" className="btn btn-secondary">
                        View cart
                    </Link>
                    <Link href="/checkout" className="btn btn-primary">
                        Checkout <ArrowRight size={16} />
                    </Link>
                </>
            );
        case "added":
            return (
                <button className="pdp-atc-btn success" disabled type="button">
                    <Check size={18} strokeWidth={2.5} /> Added
                </button>
            );
        case "out_of_stock":
            return (
                <button className="pdp-atc-btn" disabled type="button">
                    Out of stock
                </button>
            );
        case "unavailable":
            return (
                <button className="pdp-atc-btn" disabled type="button">
                    Unavailable
                </button>
            );
        case "loading":
            return (
                <button className="pdp-atc-btn" disabled type="button">
                    <ShoppingBag size={18} strokeWidth={1.8} /> Add to Cart
                </button>
            );
        default:
            return (
                <button className="pdp-atc-btn" onClick={cart.add} type="button">
                    <ShoppingBag size={18} strokeWidth={1.8} /> Add to Cart
                </button>
            );
    }
}
