"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MOCK_PAYMENTS } from "@/lib/api-config";
import { backend } from "@/lib/backend";
import { payRequestFor, placeOrderForPayment } from "@/lib/checkout-pay";
import { PRICES_CHANGED_ERROR, unavailableNotice, type CartPriceDiff } from "@/lib/cart-prices";
import { saveGuestOrderToken } from "@/lib/guest-orders";
import { onBfcacheRestore, submitPayuForm, type PayuHandoff } from "@/lib/payu";
import { useCartStore } from "@/store/cartStore";
import type { GuestOrderRequest } from "@svcar/contracts";

// [Razorpay disabled — PayU-only project] This project uses PayU exclusively.
// The Razorpay modal flow (loadRazorpay + MockRazorpayModal + client-side
// /checkout/verify) has been removed. See git history to restore it if needed.

export interface CheckoutPayOptions {
    /** Signed-in checkout: the saved address to ship to. */
    addressId?: number | null;
    /**
     * Guest checkout: validates the form and returns the order to place, or null
     * (after showing the form's errors and focusing the first invalid field) to stop.
     */
    guestOrder?: () => GuestOrderRequest | null;
    amount: number; // rupees, for the button label
    notes?: string;
    disabled?: boolean;
    paymentMethod: "prepaid" | "cod";
    totalAmount: number;
    /**
     * Guest checkout: re-price the browser cart right before the order is
     * created. Any change (or a line that can't be bought) stops this tap and
     * the page re-renders with the new total.
     */
    refreshPrices?: () => Promise<CartPriceDiff | null>;
    /** The server's order total differed from the page: reload what the page shows. */
    onPriceChanged?: () => void | Promise<unknown>;
    /**
     * Applied promo code for a signed-in order (a guest order puts it in the
     * request built by `guestOrder`). `totalAmount` must already be net of it.
     */
    promoCode?: string;
    /** The API refused the promo code at order time: drop it so the page shows the full total. */
    onPromoRejected?: () => void;
}

/**
 * - `invalid`: the form/address did not validate, nothing was created.
 * - `busy`: a payment is already being started (second tap), ignored.
 * - `failed`: the order could not be created; `error` holds the message.
 * - `handed-off`: the order exists and PayU (or the mock modal) took over.
 */
export type PayOutcome = "invalid" | "busy" | "failed" | "handed-off";

export interface CheckoutPayController {
    pay: () => Promise<PayOutcome>;
    loading: boolean;
    error: string;
    /** Exactly the in-page button's disabled rule. */
    disabled: boolean;
    amount: number;
    totalAmount: number;
    paymentMethod: "prepaid" | "cod";
    payuMock: { handoff: PayuHandoff; orderNumber: string } | null;
    onMockPaid: () => void;
    onMockDismiss: () => void;
}

/**
 * The checkout Pay action (validate → create the order → hand off to PayU),
 * lifted out of PayButton so the in-page button and the phone sticky Pay bar
 * drive ONE instance: one loading state, one error, one mock modal, and a
 * single in-flight guard so two taps (or one on each button) can never create
 * two orders.
 */
export function useCheckoutPay({
    addressId,
    guestOrder,
    amount,
    notes,
    disabled,
    paymentMethod,
    totalAmount,
    refreshPrices,
    onPriceChanged,
    promoCode,
    onPromoRejected,
}: CheckoutPayOptions): CheckoutPayController {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [payuMock, setPayuMock] = useState<{ handoff: PayuHandoff; orderNumber: string } | null>(null);
    const inFlight = useRef(false);
    // A total the shopper has been shown in a "Prices changed — your total is
    // now ₹X" message; paying exactly that on the next tap is fine.
    const acceptedTotal = useRef<number | null>(null);

    // Back from PayU can restore this page from the bfcache with the button still
    // "Processing…" (loading is never reset before the redirect) — unstick it.
    useEffect(
        () =>
            onBfcacheRestore(() => {
                inFlight.current = false;
                setLoading(false);
            }),
        [],
    );

    /** PayU confirms payment via the gateway callback (not a client verify call),
     *  so on success we just clear the cart and route to the confirmation page. */
    function onMockPaid() {
        if (!payuMock) return;
        useCartStore.getState().clearCart();
        setPayuMock(null);
        // Same landing page the real PayU callback 303s to, so the mock exercises
        // the flow the customer actually sees.
        router.push(`/order-confirmation/${payuMock.orderNumber}`);
    }

    function onMockDismiss() {
        setPayuMock(null);
        inFlight.current = false;
        setLoading(false);
    }

    async function pay(): Promise<PayOutcome> {
        if (inFlight.current) return "busy";
        const request = payRequestFor({ guestOrder, addressId });
        if (!request) return "invalid";
        inFlight.current = true;
        setLoading(true);
        setError("");

        const stop = (message: string): PayOutcome => {
            inFlight.current = false;
            setLoading(false);
            setError(message);
            return "failed";
        };

        // Re-price the browser cart first: if anything moved, show the new total
        // instead of creating an order for an amount the page didn't show.
        if (refreshPrices) {
            const diff = await refreshPrices();
            if (diff && diff.unavailable.length > 0) return stop(unavailableNotice(diff) ?? PRICES_CHANGED_ERROR);
            if (diff && diff.changes.length > 0) return stop(PRICES_CHANGED_ERROR);
        }

        const result = await placeOrderForPayment(
            request,
            { notes, paymentMethod, promoCode, expectedTotal: totalAmount, acceptedTotal: acceptedTotal.current },
            {
                createGuestOrder: (order) => backend.createGuestOrder(order),
                createOrder: (payload) => backend.createOrder(payload),
                saveGuestOrderToken,
            },
        );
        if (!result.ok) {
            if (result.promoRejected) onPromoRejected?.();
            if (result.priceChanged) {
                acceptedTotal.current = result.priceChanged.serverTotal;
                await Promise.resolve(onPriceChanged?.()).catch(() => {});
            }
            return stop(result.error);
        }
        acceptedTotal.current = null;

        // PayU: redirect the browser to PayU's hosted page (or the mock page in dev).
        if (MOCK_PAYMENTS) {
            setPayuMock({ handoff: result.payu, orderNumber: result.orderNumber });
            return "handed-off";
        }
        submitPayuForm(result.payu); // full-page navigation away to PayU
        return "handed-off";
    }

    return {
        pay,
        loading,
        error,
        disabled: Boolean(disabled) || loading || (!guestOrder && !addressId),
        amount,
        totalAmount,
        paymentMethod,
        payuMock,
        onMockPaid,
        onMockDismiss,
    };
}
