import { codAdvanceFor, COD_ADVANCE_PERCENT } from "@/lib/checkout";
import { formatPrice } from "@/lib/utils";
import type { AddToCartView } from "@/lib/add-to-cart";

/**
 * Phone/tablet sticky bottom bars (PDP buy bar, checkout Pay bar).
 *
 * The heights are constants because the page reserves exactly this much space
 * at its end while a bar exists (globals.css, `--pdp-bar-h` /
 * `--checkout-bar-h` — keep them in sync). The bars only ever slide with a
 * transform, so showing/hiding never changes the document height.
 */
export const PDP_BAR_HEIGHT_PX = 68;
export const CHECKOUT_BAR_HEIGHT_PX = 84;
/** The sticky site header; something under it is not "in view". */
export const STICKY_HEADER_PX = 64;

/** IntersectionObserver margin: the viewport minus the header and the bar. */
export function visibleAreaMargin(barHeightPx: number): string {
    return `-${STICKY_HEADER_PX}px 0px -${barHeightPx}px 0px`;
}

/** Below this much lost height it is browser chrome (URL bar), not a keyboard. */
export const KEYBOARD_MIN_SHRINK_PX = 150;

/**
 * Is the on-screen keyboard open?
 *
 * - iOS Safari and Chrome ≥108 (`interactive-widget=resizes-visual`, the
 *   default) keep the layout viewport and shrink the *visual* viewport, so the
 *   keyboard shows up as innerHeight − visualViewport.height (scaled, so a
 *   pinch-zoom is not mistaken for a keyboard).
 * - Android WebViews that resize the whole view (in-app browsers with
 *   adjustResize) shrink innerHeight itself; that only counts while a text
 *   field has focus, so rotating or resizing a window never hides a bar.
 */
export function isKeyboardOpen(m: {
    innerHeight: number;
    viewportHeight: number;
    viewportScale: number;
    /** Tallest innerHeight seen at the current width. */
    baselineHeight: number;
    textFieldFocused: boolean;
}): boolean {
    const visualShrink = m.innerHeight - m.viewportHeight * (m.viewportScale || 1);
    if (visualShrink > KEYBOARD_MIN_SHRINK_PX) return true;
    const layoutShrink = m.baselineHeight - m.innerHeight;
    return m.textFieldFocused && layoutShrink > KEYBOARD_MIN_SHRINK_PX;
}

const NON_TEXT_INPUTS = new Set([
    "button",
    "checkbox",
    "color",
    "file",
    "hidden",
    "image",
    "radio",
    "range",
    "reset",
    "submit",
]);

/** Elements that raise the on-screen keyboard when focused. */
export function isTextField(el: { tagName?: string; type?: string; isContentEditable?: boolean } | null): boolean {
    if (!el?.tagName) return false;
    const tag = el.tagName.toUpperCase();
    if (tag === "TEXTAREA") return true;
    if (tag === "INPUT") return !NON_TEXT_INPUTS.has((el.type ?? "text").toLowerCase());
    return el.isContentEditable === true;
}

/** Checkout bar: what PayU charges now, and how it is labelled. */
export function checkoutBarAmount(
    total: number,
    paymentMethod: "prepaid" | "cod",
): { label: string; amount: number } {
    return paymentMethod === "cod"
        ? { label: `Pay ${COD_ADVANCE_PERCENT}% now`, amount: codAdvanceFor(total) }
        : { label: "Total", amount: total };
}

/**
 * PDP bar second line: the chosen variant when the product has options (so a
 * shopper who never scrolled to the selector sees what will be added),
 * otherwise the COD advance; "In your cart" once this selection is added.
 */
export function pdpBarDetail(s: {
    view: AddToCartView;
    price: number;
    variantLabel?: string | null;
}): string | null {
    if (s.view === "unavailable" || s.view === "out_of_stock") return s.variantLabel || null;
    if (s.view === "in_cart") return s.variantLabel ? `In your cart · ${s.variantLabel}` : "In your cart";
    if (s.variantLabel) return s.variantLabel;
    if (s.price <= 0) return null;
    return `${formatPrice(codAdvanceFor(s.price))} now with COD (${COD_ADVANCE_PERCENT}%)`;
}
