import { describe, expect, it, vi } from "vitest";
import { BackendAuthError } from "@/lib/backend";
import {
    payRequestFor,
    placeOrderForPayment,
    priceChangedMessage,
    START_CHECKOUT_ERROR,
    totalMatches,
} from "@/lib/checkout-pay";
import type { GuestOrderRequest } from "@svcar/contracts";

const guestOrder = { email: "a@b.in", paymentMethod: "prepaid" } as unknown as GuestOrderRequest;
const payu = { paymentUrl: "https://test.payu.in/_payment", params: { txnid: "t1" } };
const created = {
  orderNumber: "SV1001",
  provider: "payu" as const,
  payu,
  amount: 4298,
  totalAmount: 4298,
  paymentMethod: "prepaid" as const,
  advanceAmount: 0,
  remainingAmount: 0,
};

function deps() {
  return {
    createGuestOrder: vi.fn(async () => ({ ...created, guestToken: "tok" })),
    createOrder: vi.fn(async () => created),
    saveGuestOrderToken: vi.fn(),
  };
}

describe("payRequestFor", () => {
  it("guest: runs the validator and stops when it returns null", () => {
    const validator = vi.fn(() => null);
    expect(payRequestFor({ guestOrder: validator })).toBeNull();
    expect(validator).toHaveBeenCalledTimes(1);
  });

  it("guest: pays for the validated order", () => {
    expect(payRequestFor({ guestOrder: () => guestOrder })).toEqual({ kind: "guest", order: guestOrder });
  });

  it("signed-in: needs a selected address", () => {
    expect(payRequestFor({ addressId: null })).toBeNull();
    expect(payRequestFor({})).toBeNull();
    expect(payRequestFor({ addressId: 7 })).toEqual({ kind: "account", addressId: 7 });
  });
});

describe("placeOrderForPayment", () => {
  it("guest: creates one guest order, keeps its token, returns the PayU hand-off", async () => {
    const d = deps();
    const res = await placeOrderForPayment({ kind: "guest", order: guestOrder }, { paymentMethod: "prepaid" }, d);
    expect(res).toEqual({ ok: true, orderNumber: "SV1001", payu });
    expect(d.createGuestOrder).toHaveBeenCalledTimes(1);
    expect(d.createOrder).not.toHaveBeenCalled();
    expect(d.saveGuestOrderToken).toHaveBeenCalledWith("SV1001", "tok");
  });

  it("signed-in: creates one order for the address with the payment method", async () => {
    const d = deps();
    await placeOrderForPayment({ kind: "account", addressId: 7 }, { paymentMethod: "cod", notes: "n" }, d);
    expect(d.createOrder).toHaveBeenCalledTimes(1);
    expect(d.createOrder).toHaveBeenCalledWith({ addressId: 7, notes: "n", paymentMethod: "cod" });
    expect(d.createGuestOrder).not.toHaveBeenCalled();
  });

  it("guest stock conflict (409) shows the API's reason", async () => {
    const d = deps();
    d.createGuestOrder.mockRejectedValueOnce(new BackendAuthError(409, "Only 2 left of Forge kit"));
    const res = await placeOrderForPayment({ kind: "guest", order: guestOrder }, { paymentMethod: "prepaid" }, d);
    expect(res).toEqual({ ok: false, error: "Only 2 left of Forge kit. Please update your cart." });
  });

  it("other failures show the generic message", async () => {
    const d = deps();
    d.createOrder.mockRejectedValueOnce(new BackendAuthError(409, "conflict"));
    const res = await placeOrderForPayment({ kind: "account", addressId: 7 }, { paymentMethod: "prepaid" }, d);
    expect(res).toEqual({ ok: false, error: START_CHECKOUT_ERROR });
  });

  it("a non-PayU response is an error, not a hand-off", async () => {
    const d = deps();
    d.createOrder.mockResolvedValueOnce({ ...created, provider: "razorpay" as never, payu: undefined as never });
    const res = await placeOrderForPayment({ kind: "account", addressId: 7 }, { paymentMethod: "prepaid" }, d);
    expect(res).toEqual({ ok: false, error: START_CHECKOUT_ERROR });
  });
});

describe("shown amount == charged amount guard", () => {
  it("hands off to PayU only when the server's total equals what the page showed", async () => {
    const d = deps();
    const ok = await placeOrderForPayment(
      { kind: "guest", order: guestOrder },
      { paymentMethod: "prepaid", expectedTotal: 4298 },
      d,
    );
    expect(ok).toEqual({ ok: true, orderNumber: "SV1001", payu });
  });

  it("a different server total → no PayU hand-off, the new total in the message", async () => {
    const d = deps();
    d.createGuestOrder.mockResolvedValueOnce({ ...created, amount: 6598, totalAmount: 6598, guestToken: "tok" });
    const res = await placeOrderForPayment(
      { kind: "guest", order: guestOrder },
      { paymentMethod: "prepaid", expectedTotal: 4898 },
      d,
    );
    expect(res).toEqual({
      ok: false,
      error: "Prices changed — your total is now ₹6,598. Please review it and tap Pay again.",
      priceChanged: { serverTotal: 6598, orderNumber: "SV1001" },
    });
    expect(res.ok).toBe(false);
  });

  it("the next tap accepts exactly the total the shopper was just told about", async () => {
    const d = deps();
    d.createGuestOrder.mockResolvedValue({ ...created, amount: 6598, totalAmount: 6598, guestToken: "tok" });
    const res = await placeOrderForPayment(
      { kind: "guest", order: guestOrder },
      { paymentMethod: "prepaid", expectedTotal: 6597.99, acceptedTotal: 6598 },
      d,
    );
    expect(res.ok).toBe(true);
  });

  it("signed-in orders are checked the same way", async () => {
    const d = deps();
    d.createOrder.mockResolvedValueOnce({ ...created, totalAmount: 5000 });
    const res = await placeOrderForPayment({ kind: "account", addressId: 7 }, { paymentMethod: "cod", expectedTotal: 4298 }, d);
    expect(res.ok).toBe(false);
  });

  it("paise-exact comparison and message formatting", () => {
    expect(totalMatches(16.99, 16.99)).toBe(true);
    expect(totalMatches(0.1 + 0.2, 0.3)).toBe(true);
    expect(totalMatches(4898, 4898.01)).toBe(false);
    expect(totalMatches(4898.01, 1, 4898.01)).toBe(true);
    expect(priceChangedMessage(122000)).toContain("₹1,22,000");
  });
});

describe("placeOrderForPayment with a promo code", () => {
  it("signed-in: sends the applied code with the order", async () => {
    const d = deps();
    await placeOrderForPayment({ kind: "account", addressId: 7 }, { paymentMethod: "cod", promoCode: "DIWALI10" }, d);
    expect(d.createOrder).toHaveBeenCalledWith({ addressId: 7, notes: undefined, paymentMethod: "cod", promoCode: "DIWALI10" });
  });

  it("signed-in: no code → no promoCode field", async () => {
    const d = deps();
    await placeOrderForPayment({ kind: "account", addressId: 7 }, { paymentMethod: "prepaid" }, d);
    expect(d.createOrder).toHaveBeenCalledWith({ addressId: 7, notes: undefined, paymentMethod: "prepaid" });
  });

  it("a refused code (422 promo_invalid) stops before PayU and says why", async () => {
    const d = deps();
    d.createGuestOrder.mockRejectedValueOnce(new BackendAuthError(422, "promo_invalid", "Code expired"));
    const res = await placeOrderForPayment(
      { kind: "guest", order: { ...guestOrder, promoCode: "DIWALI10" } },
      { paymentMethod: "prepaid" },
      d,
    );
    expect(res).toEqual({
      ok: false,
      error: "Code expired — DIWALI10 was removed. Please review your total and tap Pay again.",
      promoRejected: true,
    });
    expect(d.saveGuestOrderToken).not.toHaveBeenCalled();
  });

  it("the discounted server total must still match the page", async () => {
    const d = deps();
    d.createOrder.mockResolvedValueOnce({ ...created, totalAmount: 7200, discountAmount: 800, promoCode: "DIWALI10" } as never);
    const ok = await placeOrderForPayment(
      { kind: "account", addressId: 7 },
      { paymentMethod: "prepaid", promoCode: "DIWALI10", expectedTotal: 7200 },
      d,
    );
    expect(ok.ok).toBe(true);
  });
});
