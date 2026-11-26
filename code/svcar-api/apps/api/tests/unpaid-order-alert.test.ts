import { describe, expect, it } from "vitest";

process.env.NODE_ENV = "test";

import { buildUnpaidOrderPushPayload, buildUnpaidOrderWhatsAppUrl } from "../src/lib/admin-push.js";
import { isStillUnpaid } from "../src/inngest/functions/unpaid-order-alert.js";

const ORDER = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  orderNumber: "SV0000000001",
  customerName: "Asha",
  customerPhone: "+91 98765-43210",
  paymentMethod: "prepaid",
  total: 12198,
};

describe("unpaid-order alert", () => {
  it("builds the wa.me link with the 10-digit number and encoded message", () => {
    const url = buildUnpaidOrderWhatsAppUrl(ORDER);
    expect(url.startsWith("https://wa.me/919876543210?text=")).toBe(true);
    const text = decodeURIComponent(url.split("?text=")[1]!);
    expect(text).toBe(
      "Hi Asha, this is SV Car Customs. We saw your order SV0000000001 wasn't completed. Need help finishing it?",
    );
  });

  it("builds the push payload with name, total, method and phone", () => {
    const p = buildUnpaidOrderPushPayload(ORDER);
    expect(p.title).toBe("Unpaid order ₹12,198 · SV0000000001");
    expect(p.body).toBe("Asha · Prepaid · +91 98765 43210");
    expect(p.url).toBe(`/admin/orders/${ORDER.id}`);
    expect(p.tag).toBe(`unpaid-${ORDER.id}`);
    expect(p.waUrl).toContain("wa.me/919876543210");
    expect(buildUnpaidOrderPushPayload({ ...ORDER, paymentMethod: "cod" }).body).toContain("COD");
  });

  it("only alerts for orders still pending and unpaid", () => {
    expect(isStillUnpaid({ status: "pending", paymentStatus: "pending" })).toBe(true);
    expect(isStillUnpaid({ status: "paid", paymentStatus: "paid" })).toBe(false);
    expect(isStillUnpaid({ status: "cancelled", paymentStatus: "pending" })).toBe(false);
    expect(isStillUnpaid({ status: "pending", paymentStatus: "paid" })).toBe(false);
  });
});
