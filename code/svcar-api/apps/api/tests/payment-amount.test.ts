import { describe, expect, it } from "vitest";
import { gatewayPaymentAmount } from "../src/lib/payment-amount.js";

describe("gatewayPaymentAmount", () => {
  it("sends exactly 15% of a COD order to the payment gateway", () => {
    expect(gatewayPaymentAmount(10_000, "cod")).toBe(1_500);
  });

  it("keeps prepaid payments at 100%", () => {
    expect(gatewayPaymentAmount(10_000, "prepaid")).toBe(10_000);
  });
});
