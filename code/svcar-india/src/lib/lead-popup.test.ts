import { describe, expect, it } from "vitest";
import {
  LEAD_POPUP_COOLDOWN_MS,
  LEAD_POPUP_DELAY_MS,
  decideLeadPopup,
  isLeadPopupRoute,
  normaliseLeadPhone,
  parseLeadPopupState,
  shouldShowLeadPopup,
  type LeadPopupInput,
} from "@/lib/lead-popup";

const LANDED = 1_760_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

/** A visitor on the home page, 30s in, never seen the popup, nothing saved. */
function input(over: Partial<LeadPopupInput> = {}): LeadPopupInput {
  return {
    pathname: "/",
    now: LANDED + LEAD_POPUP_DELAY_MS,
    landedAt: LANDED,
    state: {},
    hasSavedPhone: false,
    ...over,
  };
}

describe("isLeadPopupRoute", () => {
  it.each(["/", "/shop", "/shop/", "/category/lighting", "/category/body-kits/", "/product/led-tail-lamp"])(
    "allows %s",
    (p) => expect(isLeadPopupRoute(p)).toBe(true),
  );

  it.each([
    "/cart",
    "/checkout",
    "/checkout/guest",
    "/track",
    "/login",
    "/account",
    "/account/addresses",
    "/orders",
    "/orders/SV123",
    "/order-confirmation/SV123",
    "/admin",
    "/admin/phone-leads",
    "/search",
    "/faq",
    "/category",
    "/category/",
    "/product",
    "/products/x",
    "/shopping",
  ])("blocks %s", (p) => expect(isLeadPopupRoute(p)).toBe(false));
});

describe("decideLeadPopup", () => {
  it("shows at exactly 30s on an allowed page for a first-time visitor", () => {
    expect(decideLeadPopup(input())).toBe("show");
    expect(shouldShowLeadPopup(input({ pathname: "/product/led-tail-lamp" }))).toBe(true);
  });

  it("waits before 30s", () => {
    expect(decideLeadPopup(input({ now: LANDED + LEAD_POPUP_DELAY_MS - 1 }))).toBe("later");
    expect(decideLeadPopup(input({ now: LANDED }))).toBe("later");
  });

  it("the shipped delay is 30 seconds", () => {
    expect(LEAD_POPUP_DELAY_MS).toBe(30_000);
  });

  it("waits on cart/checkout/etc. (may show later on an allowed page)", () => {
    for (const pathname of ["/cart", "/checkout", "/track", "/login", "/order-confirmation/SV1", "/admin"]) {
      expect(decideLeadPopup(input({ pathname, now: LANDED + 10 * 60_000 }))).toBe("later");
    }
  });

  it("waits while the shopper is typing or has a menu open", () => {
    expect(decideLeadPopup(input({ userBusy: true }))).toBe("later");
  });

  it("at most once per 7 days per device", () => {
    const now = LANDED + LEAD_POPUP_DELAY_MS;
    expect(LEAD_POPUP_COOLDOWN_MS).toBe(7 * DAY);
    expect(decideLeadPopup(input({ now, state: { lastShownAt: now - 1000 } }))).toBe("never");
    expect(decideLeadPopup(input({ now, state: { lastShownAt: now - 7 * DAY + 1 } }))).toBe("never");
    expect(decideLeadPopup(input({ now, state: { lastShownAt: now - 7 * DAY } }))).toBe("show");
    expect(decideLeadPopup(input({ now, state: { lastShownAt: now - 30 * DAY } }))).toBe("show");
  });

  it("a lastShownAt in the future (clock moved back) counts as recent", () => {
    const now = LANDED + LEAD_POPUP_DELAY_MS;
    expect(decideLeadPopup(input({ now, state: { lastShownAt: now + DAY } }))).toBe("never");
  });

  it("never again once a number was submitted, even months later", () => {
    const now = LANDED + LEAD_POPUP_DELAY_MS;
    expect(decideLeadPopup(input({ now, state: { submittedAt: now - 365 * DAY, lastShownAt: now - 365 * DAY } }))).toBe(
      "never",
    );
  });

  it("never when saved guest details already include a phone", () => {
    expect(decideLeadPopup(input({ hasSavedPhone: true }))).toBe("never");
  });

  it("never when localStorage is unavailable (the 7-day rule couldn't be kept)", () => {
    expect(decideLeadPopup(input({ state: null }))).toBe("never");
  });

  it("honours a custom delay", () => {
    expect(decideLeadPopup(input({ delayMs: 5_000, now: LANDED + 5_000 }))).toBe("show");
  });
});

describe("parseLeadPopupState", () => {
  it("reads stored timestamps and ignores junk", () => {
    expect(parseLeadPopupState(null)).toEqual({});
    expect(parseLeadPopupState("not json")).toEqual({});
    expect(parseLeadPopupState("[]")).toEqual({});
    expect(parseLeadPopupState('{"lastShownAt":"yesterday"}')).toEqual({});
    expect(parseLeadPopupState('{"lastShownAt":5,"submittedAt":6,"x":1}')).toEqual({ lastShownAt: 5, submittedAt: 6 });
  });
});

describe("normaliseLeadPhone", () => {
  it.each([
    ["9876543210", "9876543210"],
    ["98765 43210", "9876543210"],
    ["+91 98765 43210", "9876543210"],
    ["+91-98765-43210", "9876543210"],
    ["919876543210", "9876543210"],
    ["09876543210", "9876543210"],
    ["6000000000", "6000000000"],
  ])("%s → %s", (typed, want) => expect(normaliseLeadPhone(typed)).toBe(want));

  it.each(["", "12345", "5876543210", "987654321", "98765432101", "+1 415 555 0100", "abcdefghij"])(
    "rejects %s",
    (typed) => expect(normaliseLeadPhone(typed)).toBeNull(),
  );
});
