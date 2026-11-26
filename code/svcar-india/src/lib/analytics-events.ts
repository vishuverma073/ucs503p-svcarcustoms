/**
 * Ecommerce event helpers for GA4 + Meta Pixel (+ Google Ads Purchase
 * conversion). Every call is a safe no-op when the tags aren't loaded, so call
 * sites never need to guard. Prices are in INR (whole rupees).
 */
import { GOOGLE_ADS_ID, GOOGLE_ADS_PURCHASE_LABEL, HAS_GTAG, META_PIXEL_ID } from "./analytics-config";

type Params = Record<string, unknown>;

/**
 * Same thing the inline `function gtag(){dataLayer.push(arguments)}` stub does:
 * push a real `arguments` object so gtag.js replays it once it loads. Must be a
 * plain function (not an arrow) for `arguments` to exist.
 */
function queueGtag(_command: string, _event: string, _params: Params): void {
  // eslint-disable-next-line prefer-rest-params
  (window.dataLayer ??= []).push(arguments);
}

/**
 * gtag.js is loaded `afterInteractive`, so on a direct landing (Instagram →
 * PDP, PayU → confirmation) the mount effects that call these helpers run
 * before `window.gtag` exists and the event used to be dropped. Queue it into
 * `dataLayer` instead — that is exactly where the stub puts commands, and gtag.js
 * drains the queue on load. Still inert when no GA/Ads id is configured.
 */
function gtag(event: string, params: Params): void {
  if (typeof window === "undefined") return;
  if (window.gtag) window.gtag("event", event, params);
  else if (HAS_GTAG) queueGtag("event", event, params);
}
/**
 * The pixel snippet defines `fbq` and `_fbq` (with its `queue`) in the same
 * inline script, so a missing `fbq` with a present `_fbq` is rare — but when the
 * stub's queue is there, use it; otherwise the event is skipped as before.
 */
function fbq(event: string, params: Params): void {
  if (typeof window === "undefined") return;
  if (window.fbq) window.fbq("track", event, params);
  else if (META_PIXEL_ID && window._fbq?.queue) window._fbq.queue.push(["track", event, params]);
}

export interface EventItem {
  id: string;
  name: string;
  price: number;
  qty?: number;
}

/** Product detail view. */
export function trackViewContent(item: EventItem): void {
  gtag("view_item", {
    currency: "INR",
    value: item.price,
    items: [{ item_id: item.id, item_name: item.name, price: item.price }],
  });
  fbq("ViewContent", {
    content_type: "product",
    content_ids: [item.id],
    content_name: item.name,
    value: item.price,
    currency: "INR",
  });
}

/** Item added to cart. */
export function trackAddToCart(item: EventItem): void {
  const qty = item.qty ?? 1;
  gtag("add_to_cart", {
    currency: "INR",
    value: item.price * qty,
    items: [{ item_id: item.id, item_name: item.name, price: item.price, quantity: qty }],
  });
  fbq("AddToCart", {
    content_type: "product",
    content_ids: [item.id],
    content_name: item.name,
    value: item.price * qty,
    currency: "INR",
  });
}

/**
 * Completed purchase — fire once on the order-success screen. `value` is what
 * the order totals after any promo discount; `coupon` is the code used.
 */
export function trackPurchase(order: {
  orderId: string;
  value: number;
  items: EventItem[];
  coupon?: string | null;
}): void {
  gtag("purchase", {
    transaction_id: order.orderId,
    currency: "INR",
    value: order.value,
    ...(order.coupon ? { coupon: order.coupon } : {}),
    items: order.items.map((i) => ({
      item_id: i.id,
      item_name: i.name,
      price: i.price,
      quantity: i.qty ?? 1,
    })),
  });
  fbq("Purchase", {
    content_type: "product",
    content_ids: order.items.map((i) => i.id),
    value: order.value,
    currency: "INR",
  });
  // Google Ads conversion — needs the "AW-XXX/label" send_to. Fires only when
  // both the Ads id and its purchase conversion label are configured.
  if (GOOGLE_ADS_ID && GOOGLE_ADS_PURCHASE_LABEL) {
    gtag("conversion", {
      send_to: `${GOOGLE_ADS_ID}/${GOOGLE_ADS_PURCHASE_LABEL}`,
      value: order.value,
      currency: "INR",
      transaction_id: order.orderId,
    });
  }
}

/**
 * Checkout opened with items in the cart — fire once per checkout visit. With
 * an applied promo code, `value` is net of its `discount` and `coupon` names it.
 */
export function trackBeginCheckout(items: EventItem[], promo: { coupon?: string; discount?: number } = {}): void {
  const value = items.reduce((sum, i) => sum + i.price * (i.qty ?? 1), 0) - (promo.discount ?? 0);
  gtag("begin_checkout", {
    currency: "INR",
    value,
    ...(promo.coupon ? { coupon: promo.coupon } : {}),
    items: items.map((i) => ({ item_id: i.id, item_name: i.name, price: i.price, quantity: i.qty ?? 1 })),
  });
  fbq("InitiateCheckout", {
    content_type: "product",
    content_ids: items.map((i) => i.id),
    num_items: items.reduce((n, i) => n + (i.qty ?? 1), 0),
    value,
    currency: "INR",
  });
}

/** WhatsApp CTA clicked (GA4 custom event + Pixel "Contact"). */
export function trackWhatsappClick(source: string): void {
  gtag("whatsapp_click", { source });
  fbq("Contact", { content_name: source });
}

/**
 * Phone number shared through the storefront lead popup (GA4 recommended
 * `generate_lead` + Pixel standard "Lead"). Fire once, after the API accepted it.
 * No value: a number is not a sale.
 */
export function trackLead(source = "popup"): void {
  gtag("generate_lead", { lead_source: source });
  fbq("Lead", { content_name: source });
}
