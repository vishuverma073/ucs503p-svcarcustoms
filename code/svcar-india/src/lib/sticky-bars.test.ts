import { describe, expect, it } from "vitest";
import {
  CHECKOUT_BAR_HEIGHT_PX,
  PDP_BAR_HEIGHT_PX,
  STICKY_HEADER_PX,
  checkoutBarAmount,
  isKeyboardOpen,
  isTextField,
  pdpBarDetail,
  visibleAreaMargin,
} from "@/lib/sticky-bars";
import { codAdvanceFor } from "@/lib/checkout";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("isKeyboardOpen", () => {
  const closed = { innerHeight: 844, viewportHeight: 844, viewportScale: 1, baselineHeight: 844, textFieldFocused: false };

  it("is closed with a full visual viewport", () => {
    expect(isKeyboardOpen(closed)).toBe(false);
    expect(isKeyboardOpen({ ...closed, textFieldFocused: true })).toBe(false);
  });

  it("detects the keyboard from a shrunken visual viewport (iOS Safari, Chrome resizes-visual)", () => {
    expect(isKeyboardOpen({ ...closed, viewportHeight: 500, textFieldFocused: true })).toBe(true);
  });

  it("ignores small shrinks such as the URL bar", () => {
    expect(isKeyboardOpen({ ...closed, viewportHeight: 844 - 60 })).toBe(false);
  });

  it("does not mistake a pinch-zoom for a keyboard", () => {
    expect(isKeyboardOpen({ ...closed, viewportHeight: 422, viewportScale: 2 })).toBe(false);
  });

  it("detects a resized WebView (adjustResize) only while a text field has focus", () => {
    const resized = { ...closed, innerHeight: 480, viewportHeight: 480 };
    expect(isKeyboardOpen({ ...resized, textFieldFocused: true })).toBe(true);
    expect(isKeyboardOpen({ ...resized, textFieldFocused: false })).toBe(false);
  });
});

describe("isTextField", () => {
  it("counts text-like inputs and textareas, not buttons/checkboxes/selects", () => {
    expect(isTextField({ tagName: "INPUT", type: "email" })).toBe(true);
    expect(isTextField({ tagName: "INPUT", type: "tel" })).toBe(true);
    expect(isTextField({ tagName: "INPUT" })).toBe(true);
    expect(isTextField({ tagName: "TEXTAREA" })).toBe(true);
    expect(isTextField({ tagName: "DIV", isContentEditable: true })).toBe(true);
    expect(isTextField({ tagName: "INPUT", type: "checkbox" })).toBe(false);
    expect(isTextField({ tagName: "BUTTON" })).toBe(false);
    expect(isTextField({ tagName: "SELECT" })).toBe(false);
    expect(isTextField(null)).toBe(false);
  });
});

describe("checkoutBarAmount", () => {
  it("prepaid charges the full total", () => {
    expect(checkoutBarAmount(4298, "prepaid")).toEqual({ label: "Total", amount: 4298 });
  });

  it("COD charges the 15% advance, exactly as the API rounds it", () => {
    expect(checkoutBarAmount(4298, "cod")).toEqual({ label: "Pay 15% now", amount: codAdvanceFor(4298) });
    expect(checkoutBarAmount(3099, "cod").amount).toBe(464.85);
  });
});

describe("pdpBarDetail", () => {
  it("shows the COD advance for a product without options", () => {
    expect(pdpBarDetail({ view: "add", price: 4300 })).toBe("₹645 now with COD (15%)");
  });

  it("shows the chosen option instead when the product has options", () => {
    expect(pdpBarDetail({ view: "add", price: 4300, variantLabel: "Colour: Red" })).toBe("Colour: Red");
  });

  it("says it is in the cart once added", () => {
    expect(pdpBarDetail({ view: "in_cart", price: 4300 })).toBe("In your cart");
    expect(pdpBarDetail({ view: "in_cart", price: 4300, variantLabel: "Colour: Red" })).toBe(
      "In your cart · Colour: Red",
    );
  });

  it("drops the COD line when nothing can be bought", () => {
    expect(pdpBarDetail({ view: "out_of_stock", price: 4300 })).toBeNull();
    expect(pdpBarDetail({ view: "unavailable", price: 4300, variantLabel: "Colour: Blue" })).toBe("Colour: Blue");
    expect(pdpBarDetail({ view: "add", price: 0 })).toBeNull();
  });
});

describe("bar geometry", () => {
  it("excludes the sticky header and the bar from the visible area", () => {
    expect(visibleAreaMargin(68)).toBe(`-${STICKY_HEADER_PX}px 0px -68px 0px`);
  });

  it("keeps the TS heights in sync with the CSS reserve", () => {
    const css = readFileSync(join(__dirname, "../app/globals.css"), "utf8");
    expect(css).toContain(`--pdp-bar-h: ${PDP_BAR_HEIGHT_PX}px;`);
    expect(css).toContain(`--checkout-bar-h: ${CHECKOUT_BAR_HEIGHT_PX}px;`);
  });
});
