import { describe, expect, it } from "vitest";
import { isDiwaliSaleLive } from "@/lib/diwali-sale";

describe("Diwali sale banner window", () => {
  it("is live during the sale, up to the last second of 24 Nov IST", () => {
    expect(isDiwaliSaleLive(Date.parse("2026-10-27T10:00:00+05:30"))).toBe(true);
    expect(isDiwaliSaleLive(Date.parse("2026-11-24T23:59:59+05:30"))).toBe(true);
  });

  it("switches off at midnight IST, 25 Nov", () => {
    expect(isDiwaliSaleLive(Date.parse("2026-11-25T00:00:00+05:30"))).toBe(false);
    expect(isDiwaliSaleLive(Date.parse("2026-11-24T18:30:00Z"))).toBe(false); // same instant in UTC
    expect(isDiwaliSaleLive(Date.parse("2026-12-01T00:00:00+05:30"))).toBe(false);
  });
});
