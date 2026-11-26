import { describe, expect, it } from "vitest";
import { buildShipNote, nextOrderAction, phoneDigits, telHref, whatsappHref } from "@/lib/order-actions";

const base = { paymentMethod: "prepaid", paymentStatus: "paid", remainingAmount: 0 };

describe("next step button: Confirm → Ship → Delivered", () => {
  it("walks the fulfilment pipeline", () => {
    expect(nextOrderAction({ ...base, status: "paid" })).toMatchObject({ kind: "confirm", event: "confirmed" });
    expect(nextOrderAction({ ...base, status: "confirmed" })).toMatchObject({ kind: "ship", event: "shipped" });
    expect(nextOrderAction({ ...base, status: "shipped" })).toMatchObject({ kind: "deliver", event: "delivered" });
    expect(nextOrderAction({ ...base, status: "delivered" })).toMatchObject({ kind: "none", label: "Delivered" });
  });

  it("unpaid / cancelled orders get no action button", () => {
    expect(nextOrderAction({ ...base, status: "pending" })).toMatchObject({ kind: "none", label: "Awaiting payment" });
    expect(nextOrderAction({ ...base, status: "cancelled" }).kind).toBe("none");
    expect(nextOrderAction({ ...base, status: "refunded" }).kind).toBe("none");
  });

  it("delivered COD with a balance → collect it", () => {
    expect(
      nextOrderAction({ status: "delivered", paymentMethod: "cod", paymentStatus: "partially_paid", remainingAmount: 7648 }),
    ).toEqual({ kind: "collect-cod", label: "Collected ₹7,648 COD" });
  });
});

describe("ship note", () => {
  it("courier and tracking are optional", () => {
    expect(buildShipNote(" Delhivery ", " 1490 8277 33 ")).toBe("Courier: Delhivery · Tracking: 1490827733");
    expect(buildShipNote("Blue Dart", "")).toBe("Courier: Blue Dart");
    expect(buildShipNote("", "AWB123")).toBe("Tracking: AWB123");
    expect(buildShipNote("  ", "")).toBeUndefined();
  });

  it("never exceeds the API's 500-char note limit", () => {
    expect(buildShipNote("x".repeat(600), "")!.length).toBe(500);
  });
});

describe("customer contact links", () => {
  it("normalises Indian numbers", () => {
    expect(phoneDigits("9876543210")).toBe("919876543210");
    expect(phoneDigits("+91 98765-43210")).toBe("919876543210");
    expect(phoneDigits("09876543210")).toBe("919876543210");
    expect(phoneDigits("123")).toBeNull();
    expect(phoneDigits("")).toBeNull();
  });

  it("tel: and WhatsApp with a ready message", () => {
    expect(telHref("98765 43210")).toBe("tel:+919876543210");
    const wa = whatsappHref("9876543210", { customerName: "Asha Verma", orderNumber: "SV123" })!;
    expect(wa.startsWith("https://wa.me/919876543210?text=")).toBe(true);
    expect(decodeURIComponent(wa.split("text=")[1]!)).toBe("Hi Asha, this is SV Car Customs about your order SV123.");
    expect(whatsappHref("", { orderNumber: "SV1" })).toBeNull();
  });
});
