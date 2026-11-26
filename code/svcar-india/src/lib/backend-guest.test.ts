import { afterEach, describe, expect, it, vi } from "vitest";
import { backend, BackendAuthError } from "@/lib/backend";

/**
 * Guest checkout client: right endpoint, token in the body (never the URL),
 * and the API's paise / wire shapes mapped to the storefront's.
 */

function stubFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const HANDOFF = {
  orderId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  orderNumber: "SV0000000001",
  provider: "payu",
  payu: { paymentUrl: "https://test.payu.in/_payment", params: { txnid: "SV0000000001" } },
  amount: 309900,
  totalAmount: 309900,
  paymentMethod: "prepaid",
  advanceAmount: 309900,
  remainingAmount: 0,
  currency: "INR",
};

const REQUEST = {
  items: [{ skuId: 10, qty: 2 }],
  email: "asha@example.com",
  address: {
    fullName: "Asha Verma",
    phone: "9876543210",
    line1: "12 Mall Road",
    line2: "",
    city: "Patiala",
    state: "Punjab" as const,
    pincode: "147001",
    landmark: "",
  },
  paymentMethod: "prepaid" as const,
};

describe("backend guest checkout", () => {
  it("createGuestOrder posts the cart and returns rupees + the token", async () => {
    const fetchMock = stubFetch(200, { ...HANDOFF, guestToken: "tok_" + "x".repeat(30) });
    const res = await backend.createGuestOrder(REQUEST);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/guest-checkout\/orders$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual(REQUEST);
    expect(res).toMatchObject({ orderNumber: "SV0000000001", amount: 3099, totalAmount: 3099, provider: "payu" });
    expect(res.guestToken).toBe("tok_" + "x".repeat(30));
  });

  it("surfaces a stock conflict with the server's reason", async () => {
    stubFetch(409, { error: "Only 1 left of Lavender Sink", skuId: 10 });
    const err = await backend.createGuestOrder(REQUEST).catch((e) => e);
    expect(err).toBeInstanceOf(BackendAuthError);
    expect(err.status).toBe(409);
    expect(err.code).toBe("Only 1 left of Lavender Sink");
  });

  it("getGuestOrder sends the token in the body and maps the order + timeline", async () => {
    const fetchMock = stubFetch(200, {
      order: {
        id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        orderNumber: "SV0000000001",
        total: 3099,
        status: "paid",
        itemCount: 2,
        createdAt: "2026-10-18T10:00:00.000Z",
        subtotal: 3000,
        shippingFee: 99,
        gstAmount: 458,
        shippingAddress: { ...REQUEST.address },
        items: [
          { productName: "Lavender Sink", skuCode: "LAV-1", variantLabel: null, imageUrl: "/a.png", unitPrice: 1500, qty: 2, lineTotal: 3000 },
        ],
        razorpayPaymentId: null,
        paymentMethod: "prepaid",
        paymentStatus: "paid",
        advanceAmount: 3099,
        advancePaid: 3099,
        remainingAmount: 0,
      },
      events: [{ id: 1, eventType: "placed", note: null, createdAt: "2026-10-18T10:00:00.000Z" }],
    });

    const { order, events } = await backend.getGuestOrder("SV0000000001", { token: "secret-token" });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/guest-checkout\/orders\/SV0000000001$/);
    expect(url).not.toContain("secret-token");
    expect(JSON.parse(String(init.body))).toEqual({ token: "secret-token" });
    expect(order).toMatchObject({ orderNumber: "SV0000000001", status: "paid" });
    expect(order.totals).toEqual({ subtotal: 3000, discount: 0, shippingFee: 99, gstIncluded: 458, total: 3099 });
    expect(order.promoCode).toBeNull();
    expect(order.address.city).toBe("Patiala");
    expect(events).toEqual([{ eventType: "placed", at: "2026-10-18T10:00:00.000Z" }]);
  });

  it("retryGuestPayment hits the pay endpoint with the token", async () => {
    const fetchMock = stubFetch(200, HANDOFF);
    const res = await backend.retryGuestPayment("SV0000000001", { token: "secret-token" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/guest-checkout\/orders\/SV0000000001\/pay$/);
    expect(JSON.parse(String(init.body))).toEqual({ token: "secret-token" });
    expect(res.amount).toBe(3099);
  });

  it("sends the email / mobile from Track order instead of a token", async () => {
    const fetchMock = stubFetch(200, HANDOFF);
    await backend.retryGuestPayment("SV0000000001", { contact: "9876543210" });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ contact: "9876543210" });
  });
});
