"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { normalizePromoCode, type ActivePromo } from "@svcar/contracts";
import { backend, BackendAuthError } from "@/lib/backend";
import { bestEligiblePromo, promoCartKey } from "@/lib/promo";
import { useCartStore } from "@/store/cartStore";

/** One cart line as the promo check needs it (the price is only for change detection). */
export interface PromoLine {
    skuId: number;
    qty: number;
    price: number;
}

export interface PromoController {
    /** Codes usable right now (suggestion chips); empty while loading or if the call failed. */
    active: ActivePromo[];
    /** The applied code once the API confirmed it for THIS cart, else undefined. */
    appliedCode: string | undefined;
    /** Rupees off for the current cart (0 until confirmed). */
    discount: number;
    /** A persisted code is being re-checked against the current cart. Pay waits for it. */
    checking: boolean;
    applying: boolean;
    error: string;
    apply: (raw: string) => Promise<void>;
    remove: () => void;
    clearError: () => void;
}

/** Session flag: the shopper removed a code, so don't auto-apply again this session. */
const DISMISS_KEY = "svcar-promo-dismissed";
function promoDismissed(): boolean {
    try {
        return typeof window !== "undefined" && sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {
        return false;
    }
}
function dismissPromo() {
    try {
        sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
        /* private mode — best effort */
    }
}

const toRequestItems = (items: PromoLine[]) => items.map((i) => ({ skuId: i.skuId, qty: i.qty }));

/** Codes for the chips / cart hint — one shared request, quiet on failure. */
export function useActivePromos(): ActivePromo[] {
    const { data } = useSWR("promos/active", () => backend.getActivePromos(), {
        revalidateOnFocus: false,
        shouldRetryOnError: false,
        dedupingInterval: 60_000,
    });
    return data ?? [];
}

/**
 * Checkout promo code state, shared by the signed-in and guest checkouts.
 *
 * The applied code lives in the cart store (persisted, so it survives a
 * refresh); the discount never does. It is always confirmed by the API for the
 * cart as it is now: on Apply, on load, and again whenever a line, quantity or
 * price changes. A code that stops applying (cart dropped below the minimum,
 * expired) is dropped with a toast. Until confirmed the page shows no discount
 * and Pay waits, so the total on the button is the total the order charges.
 */
export function usePromo(items: PromoLine[] | null): PromoController {
    const promo = useCartStore((s) => s.promo);
    const setPromo = useCartStore((s) => s.setPromo);
    const active = useActivePromos();
    const cartKey = useMemo(() => (items ? promoCartKey(items) : ""), [items]);

    // What the API last confirmed: this code, for this exact cart.
    const [confirmed, setConfirmed] = useState<{ code: string; cartKey: string; discount: number } | null>(null);
    const [applying, setApplying] = useState(false);
    const [error, setError] = useState("");

    const hasItems = !!items && items.length > 0;
    const isConfirmed = !!promo && !!confirmed && confirmed.code === promo.code && confirmed.cartKey === cartKey;
    const checking = !!promo && hasItems && !isConfirmed;

    // Re-check a persisted / previously applied code whenever the cart changes.
    useEffect(() => {
        if (!promo || !items || items.length === 0 || isConfirmed) return;
        let live = true;
        const code = promo.code;
        backend
            .applyPromo({ code, items: toRequestItems(items) })
            .then((r) => {
                if (!live) return;
                if (r.ok) {
                    setConfirmed({ code: r.code, cartKey, discount: r.discount });
                } else {
                    setPromo(null);
                    setConfirmed(null);
                    toast.info(`${code} removed — ${r.message}`);
                }
            })
            .catch(() => {
                if (!live) return;
                // Can't confirm it, so don't pretend: drop it rather than charge a
                // total the page didn't show.
                setPromo(null);
                setConfirmed(null);
                toast.error(`Couldn’t check ${code}. Please apply it again.`);
            });
        return () => {
            live = false;
        };
    }, [promo, items, cartKey, isConfirmed, setPromo]);

    // Auto-apply the best eligible live code (on load and whenever the subtotal
    // moves), unless the shopper removed one this session. The API still
    // confirms it (apply-promo) before any discount is shown or charged.
    const subtotal = items ? items.reduce((s, i) => s + i.price * i.qty, 0) : 0;
    const best = bestEligiblePromo(active, subtotal);
    const autoCode = best && (!promo || promo.percentOff < best.percentOff) ? best.code : null;
    const [autoTried, setAutoTried] = useState<string | null>(null);
    useEffect(() => {
        if (!autoCode || !items || items.length === 0 || applying) return;
        const attempt = `${autoCode}|${cartKey}`;
        if (autoTried === attempt || promoDismissed()) return;
        setAutoTried(attempt);
        backend
            .applyPromo({ code: autoCode, items: toRequestItems(items) })
            .then((r) => {
                if (!r.ok || promoDismissed()) return;
                setConfirmed({ code: r.code, cartKey, discount: r.discount });
                setPromo({ code: r.code, percentOff: r.percentOff });
            })
            .catch(() => {
                /* quiet: the shopper can still apply it by hand */
            });
    }, [autoCode, items, cartKey, applying, autoTried, setPromo]);

    async function apply(raw: string) {
        const code = normalizePromoCode(raw);
        if (!code) {
            setError("Enter a promo code");
            return;
        }
        if (!items || items.length === 0) return;
        setApplying(true);
        setError("");
        try {
            const r = await backend.applyPromo({ code, items: toRequestItems(items) });
            if (r.ok) {
                setConfirmed({ code: r.code, cartKey, discount: r.discount });
                setPromo({ code: r.code, percentOff: r.percentOff });
                toast.success(r.message);
            } else {
                setError(r.message);
            }
        } catch (e) {
            setError(
                e instanceof BackendAuthError && e.status === 429
                    ? "Too many tries. Please wait a minute and try again."
                    : "Couldn’t check that code. Please try again.",
            );
        } finally {
            setApplying(false);
        }
    }

    function remove() {
        dismissPromo();
        setPromo(null);
        setConfirmed(null);
        setError("");
    }

    return {
        active,
        appliedCode: isConfirmed ? promo!.code : undefined,
        discount: isConfirmed ? confirmed!.discount : 0,
        checking,
        applying,
        error,
        apply,
        remove,
        clearError: () => setError(""),
    };
}
