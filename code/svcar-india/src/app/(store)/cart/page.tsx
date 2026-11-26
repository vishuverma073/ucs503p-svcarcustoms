"use client";

import { useState, useEffect, useMemo } from "react";
import { codAdvanceFor, COD_ADVANCE_PERCENT } from "@/lib/checkout";
import Link from "next/link";
import { MessageCircle, X } from "lucide-react";
import { formatPrice, generateWhatsAppUrl } from "@/lib/utils";
import StoreProductThumb from "@/components/store/StoreProductThumb";
import PurchaseTerms from "@/components/store/PurchaseTerms";
import { trackWhatsapp } from "@/lib/track-whatsapp";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import { shippingFeeFor, amountToFreeShipping } from "@/lib/checkout";
import { Minus, Plus, Trash2, ShoppingBag, ArrowRight, ArrowLeft, Tag } from "lucide-react";
import { useCartStore } from "@/store/cartStore";
import { useStoreSettings } from "@/lib/use-store-settings";
import { useCartPriceCheck } from "@/lib/use-cart-price-check";
import PriceUpdateNotice from "@/components/store/PriceUpdateNotice";
import { usePromo } from "@/lib/use-promo";
import { bestPromoHint, promoHintText } from "@/lib/promo";

const PHONE = "9205005425";

export default function CartPage() {
    const [mounted, setMounted] = useState(false);
    const [confirmEmpty, setConfirmEmpty] = useState(false);

    const items = useCartStore((s) => s.items);
    const removeItem = useCartStore((s) => s.removeItem);
    const updateQty = useCartStore((s) => s.updateQty);
    const emptyCart = useCartStore((s) => s.emptyCart);
    const { data: settings } = useStoreSettings();
    // Bring every line to today's price (a line keeps the price it was added at).
    const priceCheck = useCartPriceCheck();
    // Live promo codes, for the "Add ₹X more for 10% off" hint.
    // Best eligible code is auto-applied (server-confirmed) so the total shown is real.
    const promoLines = useMemo(() => items.map((i) => ({ skuId: i.id, qty: i.qty, price: i.price })), [items]);
    const promo = usePromo(promoLines);
    const activePromos = promo.active;

    useEffect(() => {
        setMounted(true);
    }, []);

    const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);
    const shipping = shippingFeeFor(total, settings);
    const discount = promo.discount;
    const grandTotal = total - discount + shipping;
    const toFreeShipping = amountToFreeShipping(total, settings);
    const rawHint = bestPromoHint(activePromos, total);
    // Don't tell them to "use" the code that's already applied.
    const promoHint = rawHint?.kind === "eligible" && rawHint.promo.code === promo.appliedCode ? null : rawHint;

    const whatsAppUrl = generateWhatsAppUrl(
        PHONE,
        items.map((item) => ({
            name: item.name,
            qty: item.qty,
            price: item.price * item.qty,
        })),
        grandTotal
    );

    // SSR placeholder
    if (!mounted) {
        return (
            <div className="max-w-2xl mx-auto px-4 py-20 text-center">
                <div className="w-20 h-20 rounded-2xl bg-surface-dim flex items-center justify-center mx-auto mb-6">
                    <ShoppingBag size={36} className="text-text-muted" strokeWidth={1.5} />
                </div>
                <p className="text-text-secondary text-sm">Loading your cart...</p>
            </div>
        );
    }

    if (items.length === 0) {
        return (
            <div className="max-w-2xl mx-auto px-4 py-20 text-center animate-fade-in">
                <div className="w-20 h-20 rounded-2xl bg-surface-dim flex items-center justify-center mx-auto mb-6">
                    <ShoppingBag size={36} className="text-text-muted" strokeWidth={1.5} />
                </div>
                <h1 className="text-2xl font-extrabold text-text-primary mb-2 tracking-tight">
                    Your cart is empty
                </h1>
                <p className="text-text-secondary mb-8 text-sm">
                    Browse our collection and add some products.
                </p>
                <Link href="/" className="btn btn-primary">
                    Continue Shopping
                    <ArrowRight size={16} />
                </Link>
            </div>
        );
    }

    return (
        <>
        <div className="max-w-3xl mx-auto px-4 py-8 animate-fade-in">
            <div className="flex items-center justify-between mb-6">
                <h1 className="font-display uppercase text-3xl font-extrabold text-text-primary tracking-[0.02em] leading-none">
                    Your Cart
                    <span className="d-label !text-[12px] text-text-muted ml-2 align-middle">
                        ({items.length} {items.length === 1 ? "item" : "items"})
                    </span>
                </h1>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setConfirmEmpty(true)}
                        aria-label="Empty cart"
                        className="flex items-center gap-1.5 text-sm font-medium text-text-muted hover:text-danger transition-colors"
                    >
                        <Trash2 size={14} />
                        <span className="hidden sm:inline">Empty cart</span>
                    </button>
                    <Link
                        href="/"
                        className="flex items-center gap-1.5 text-sm font-medium text-text-secondary hover:text-brand-orange transition-colors"
                    >
                        <ArrowLeft size={14} />
                        <span className="hidden sm:inline">Continue Shopping</span>
                        <span className="sm:hidden">Shop</span>
                    </Link>
                </div>
            </div>

            <PriceUpdateNotice diff={priceCheck.diff} className="mb-4" />

            <div className="mb-6 border border-border divide-y divide-border">
                {items.map((item) => (
                    <div
                        key={item.cartKey}
                        className="flex gap-3 p-3 sm:p-4 bg-surface-card"
                    >
                        <Link
                            href={`/product/${item.slug}`}
                            className="w-18 h-18 sm:w-20 sm:h-20 bg-[#f4f4f5] overflow-hidden shrink-0 border border-border"
                        >
                            <StoreProductThumb
                                src={item.image}
                                alt={item.name}
                                width={80}
                                height={80}
                                className="object-contain w-full h-full p-2"
                            />
                        </Link>
                        <div className="flex-1 min-w-0">
                            <Link
                                href={`/product/${item.slug}`}
                                className="text-sm font-semibold text-text-primary line-clamp-2 hover:text-brand-orange transition-colors"
                            >
                                {item.name}
                            </Link>
                            {item.variant && (
                                <p className="text-xs text-text-secondary mt-0.5">
                                    {item.variant}
                                </p>
                            )}
                            <p className="font-display text-lg font-bold text-text-primary mt-1 leading-none">
                                {formatPrice(item.price)}
                            </p>
                            <div className="flex items-center gap-3 mt-2">
                                <div className="flex items-center border border-border rounded-sm overflow-hidden">
                                    <button
                                        onClick={() => updateQty(item.cartKey, item.qty - 1)}
                                        aria-label="Decrease quantity"
                                        className="px-2.5 py-1.5 text-text-secondary hover:bg-surface-dim transition-colors active:bg-surface-dim"
                                    >
                                        <Minus size={14} />
                                    </button>
                                    <span className="px-3 py-1.5 text-sm font-bold border-x border-border min-w-[36px] text-center">
                                        {item.qty}
                                    </span>
                                    <button
                                        onClick={() => updateQty(item.cartKey, item.qty + 1)}
                                        aria-label="Increase quantity"
                                        className="px-2.5 py-1.5 text-text-secondary hover:bg-surface-dim transition-colors active:bg-surface-dim"
                                    >
                                        <Plus size={14} />
                                    </button>
                                </div>
                                <button
                                    onClick={() => removeItem(item.cartKey)}
                                    aria-label={`Remove ${item.name} from cart`}
                                    className="text-text-muted hover:text-danger transition-colors p-1"
                                >
                                    <Trash2 size={15} />
                                </button>
                                <span className="ml-auto text-sm font-bold text-text-primary">
                                    {formatPrice(item.price * item.qty)}
                                </span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Order Summary */}
            <div className="bg-surface-card p-5 sm:p-6 mb-6 border border-border">
                <h2 className="font-display uppercase text-xl font-extrabold text-text-primary mb-4 tracking-[0.04em]">
                    Order Summary
                </h2>
                <div className="space-y-2.5 text-sm">
                    <div className="flex justify-between">
                        <span className="text-text-secondary">Subtotal</span>
                        <span className="font-semibold">{formatPrice(total)}</span>
                    </div>
                    {promo.appliedCode && discount > 0 && (
                        <div className="flex items-center justify-between gap-3 rounded-xl border border-success/30 bg-success/10 px-3 py-2">
                            <span className="min-w-0 text-text-primary">
                                <span className="font-bold text-success">{promo.appliedCode}</span> applied — you save{" "}
                                <span className="font-bold">{formatPrice(discount)}</span>
                            </span>
                            <button
                                type="button"
                                onClick={promo.remove}
                                aria-label={`Remove promo code ${promo.appliedCode}`}
                                className="shrink-0 rounded-full p-1.5 text-text-secondary hover:bg-success/15 hover:text-text-primary"
                            >
                                <X size={16} />
                            </button>
                        </div>
                    )}
                    <div className="flex justify-between">
                        <span className="text-text-secondary">Delivery</span>
                        <span className={`font-semibold ${shipping === 0 ? "text-success" : ""}`}>
                            {shipping === 0 ? "Free" : formatPrice(shipping)}
                        </span>
                    </div>
                    <div className="border-t border-border pt-2.5 mt-2.5 flex items-baseline justify-between d-edge">
                        <span className="d-label !text-[14px]">Total</span>
                        <span className="font-display font-extrabold text-2xl text-text-primary">
                            {formatPrice(grandTotal)}
                        </span>
                    </div>
                    {/* COD split — display only; checkout computes the real charge. */}
                    {grandTotal > 0 && (
                        <div className="border-t border-border pt-2.5 space-y-1 text-[13px]">
                            <p className="d-label !text-[11px] text-text-muted">If you choose COD</p>
                            <div className="flex justify-between">
                                <span className="text-text-secondary">Pay online now ({COD_ADVANCE_PERCENT}%)</span>
                                <span className="font-semibold">{formatPrice(codAdvanceFor(grandTotal))}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-text-secondary">Pay at your door</span>
                                <span className="font-semibold">{formatPrice(grandTotal - codAdvanceFor(grandTotal))}</span>
                            </div>
                        </div>
                    )}
                </div>
                {/* Delivery is free on every order; the nudge exists only for an admin-set fee,
                    so it waits for settings instead of assuming a threshold. */}
                {settings && toFreeShipping > 0 && (
                    <p className="text-xs text-text-muted mt-3 bg-brand-orange-light px-3 py-2 rounded-lg">
                        💡 Add {formatPrice(toFreeShipping)} more for <span className="font-semibold text-brand-orange">free delivery</span>!
                    </p>
                )}
                {promoHint && (
                    <p className="flex items-start gap-1.5 text-xs text-text-secondary mt-3 bg-brand-orange-light px-3 py-2 rounded-lg">
                        <Tag size={13} className="mt-px shrink-0 text-brand-orange" aria-hidden />
                        <span>{promoHintText(promoHint)}</span>
                    </p>
                )}
            </div>

            <PurchaseTerms className="mb-4 px-1" />

            {/* Primary CTA — checkout (no sign-in needed; guests check out directly) */}
            <Link
                href="/checkout"
                className="btn btn-primary w-full py-4 text-[16px]"
            >
                Proceed to checkout
                <ArrowRight size={17} />
            </Link>

            {/* Secondary CTA — WhatsApp fallback */}
            <Link
                href={whatsAppUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackWhatsapp("cart")}
                className="btn btn-ghost w-full py-3 mt-3 text-sm font-semibold text-whatsapp border border-border hover:bg-surface-dim"
            >
                <MessageCircle size={17} />
                Order on WhatsApp instead
            </Link>

            <p className="text-center text-xs text-text-muted mt-4">
                Secure checkout · or send your order to us on WhatsApp for confirmation.
            </p>

            <ConfirmDialog
                open={confirmEmpty}
                title="Empty your cart?"
                message="Remove all items from your cart? This cannot be undone."
                confirmLabel="Empty cart"
                danger
                onCancel={() => setConfirmEmpty(false)}
                onConfirm={() => {
                    emptyCart();
                    setConfirmEmpty(false);
                }}
            />
        </div>
        {/* Mobile sticky checkout bar (same pattern as the PDP / checkout bars).
            Outside the animated wrapper: its transform would trap position:fixed. */}
        <div data-bottom-bar="cart" className="sticky-bottom-bar is-visible">
            <div className="max-w-3xl mx-auto px-4 h-[var(--pdp-bar-h)] flex items-center gap-3">
                <div className="min-w-0 flex-1 leading-tight d-edge">
                    <p className="text-[12px] text-text-muted truncate">
                        Total{discount > 0 && promo.appliedCode ? ` · ${promo.appliedCode} saves ${formatPrice(discount)}` : ""}
                    </p>
                    <p className="font-display text-[22px] font-extrabold text-text-primary leading-none truncate">
                        {formatPrice(grandTotal)}
                    </p>
                </div>
                <Link href="/checkout" className="btn btn-primary shrink-0 min-w-[148px] text-[15px]">
                    Checkout <ArrowRight size={16} />
                </Link>
            </div>
        </div>

        </>
    );
}