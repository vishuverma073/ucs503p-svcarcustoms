import { describe, expect, it } from "vitest";
import { formatPriceExact } from "./utils";

describe("formatPriceExact", () => {
  it("keeps paise on a fractional COD advance (PayU charges 783.60, not 784)", () => {
    expect(formatPriceExact(783.6)).toBe("₹783.60");
    expect(formatPriceExact(4440.4000000000005)).toBe("₹4,440.40");
  });
  it("shows whole rupees without decimals", () => {
    expect(formatPriceExact(5224)).toBe("₹5,224");
  });
});
