import { BackendAuthError } from "@/lib/backend";
import type { PayuHandoff } from "@/lib/payu";
import type { CreateOrderRequest, CreateOrderResponse, GuestOrderRequest } from "@svcar/contracts";

/**
 * The non-React half of the checkout Pay action (see use-checkout-pay.ts):
 * decide whether there is anything to pay for, then create the order and
 * pick out the PayU hand-off. Pure apart from the injected backend calls, so
 * the guest/signed-in branches and error copy are unit-tested.
 */

export type PayRequest =
    | { kind: "guest"; order: GuestOrderRequest }
    | { kind: "account"; addressId: number };

/**
 * Guest checkout runs the form validator (which shows the field errors and
 * focuses the first invalid field) and pays only if it returns an order;
 * signed-in checkout needs a selected saved address. Null → nothing is created.
 */
export function payRequestFor(opts: {
    guestOrder?: () => GuestOrderRequest | null;
    addressId?: number | null;
}): PayRequest | null {
    if (opts.guestOrder) {
        const order = opts.guestOrder();
        return order ? { kind: "guest", order } : null;
    }
    return opts.addressId ? { kind: "account", addressId: opts.addressId } : null;
}

export const START_CHECKOUT_ERROR = "Couldn’t start checkout. Please try again.";

export interface PlaceOrderDeps {
    createGuestOrder: (order: GuestOrderRequest) => Promise<CreateOrderResponse & { guestToken: string }>;
    createOrder: (payload: CreateOrderRequest) => Promise<CreateOrderResponse>;
    saveGuestOrderToken: (orderNumber: string, token: string) => void;
}

export type PlaceOrderResult =
    | { ok: true; orderNumber: string; payu: PayuHandoff }
    | {
          ok: false;
          error: string;
          priceChanged?: { serverTotal: number; orderNumber: string };
          /** The API refused the applied promo code; nothing was created. */
          promoRejected?: true;
      };

const paise = (n: number) => Math.round(n * 100);

/** "Prices changed — your total is now ₹6,598. Please review it and tap Pay again." */
export function priceChangedMessage(serverTotal: number): string {
    return `Prices changed — your total is now ₹${serverTotal.toLocaleString("en-IN", {
        maximumFractionDigits: 2,
    })}. Please review it and tap Pay again.`;
}

/** "Code expired — DIWALI10 was removed. Please review your total and tap Pay again." */
export function promoRejectedMessage(reason: string | undefined, code: string | undefined): string {
    const why = reason?.trim() || "This promo code no longer applies";
    return `${why}${code ? ` — ${code} was removed` : ""}. Please review your total and tap Pay again.`;
}

/**
 * Final guard before PayU: the order the server just created must total what
 * the page showed (`expectedTotal`) — or the amount the shopper was already
 * told about in a previous "Prices changed" message (`acceptedTotal`).
 * Otherwise nothing is handed to PayU.
 */
export function totalMatches(serverTotal: number, expectedTotal: number, acceptedTotal?: number | null): boolean {
    return paise(serverTotal) === paise(expectedTotal) || (acceptedTotal != null && paise(serverTotal) === paise(acceptedTotal));
}

/** Create the order (one request) and return PayU's hand-off, or the message to show. */
export async function placeOrderForPayment(
    request: PayRequest,
    extra: {
        notes?: string;
        paymentMethod: "prepaid" | "cod";
        /** Applied promo code (signed-in orders; a guest order carries it in `request.order`). */
        promoCode?: string;
        /** The total the page showed. When set, a different server total stops the hand-off. */
        expectedTotal?: number;
        acceptedTotal?: number | null;
    },
    deps: PlaceOrderDeps,
): Promise<PlaceOrderResult> {
    let res: CreateOrderResponse;
    try {
        if (request.kind === "guest") {
            const placed = await deps.createGuestOrder(request.order);
            // The token is the guest's only key to this order (retry, tracking).
            deps.saveGuestOrderToken(placed.orderNumber, placed.guestToken);
            res = placed;
        } else {
            res = await deps.createOrder({
                addressId: request.addressId,
                notes: extra.notes,
                paymentMethod: extra.paymentMethod,
                ...(extra.promoCode ? { promoCode: extra.promoCode } : {}),
            });
        }
    } catch (e) {
        // The code stopped applying between Apply and Pay (expired, used up, cart
        // below its minimum). Nothing was created; the page drops the code and
        // shows the full total before the shopper pays.
        if (e instanceof BackendAuthError && e.status === 422 && e.code === "promo_invalid") {
            const code = request.kind === "guest" ? request.order.promoCode : extra.promoCode;
            return { ok: false, error: promoRejectedMessage(e.detail, code), promoRejected: true };
        }
        // A stock conflict comes back with a readable reason ("Only 2 left of …").
        return {
            ok: false,
            error:
                request.kind === "guest" && e instanceof BackendAuthError && e.status === 409
                    ? `${e.code}. Please update your cart.`
                    : START_CHECKOUT_ERROR,
        };
    }
    if (res.provider !== "payu" || !res.payu) return { ok: false, error: START_CHECKOUT_ERROR };
    if (extra.expectedTotal != null && !totalMatches(res.totalAmount, extra.expectedTotal, extra.acceptedTotal)) {
        // The shopper would pay a different amount than the page shows: stop.
        // (The unpaid order just created simply expires like any abandoned one.)
        return {
            ok: false,
            error: priceChangedMessage(res.totalAmount),
            priceChanged: { serverTotal: res.totalAmount, orderNumber: res.orderNumber },
        };
    }
    return { ok: true, orderNumber: res.orderNumber, payu: res.payu };
}
