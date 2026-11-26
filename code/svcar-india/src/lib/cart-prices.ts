/**
 * Keep the cart's prices honest.
 *
 * A cart line remembers the price it had when it was added (the guest cart
 * lives in the browser). Admins edit prices; SKU ids survive those edits, so
 * an old line would still point at a valid SKU — and the order would charge
 * today's price while the page showed yesterday's. /cart and /checkout (and the
 * Pay tap) re-read every line through POST /cart/price-check and update the
 * stored line, telling the shopper what changed.
 */
import { backend, type CartPriceCheck } from "@/lib/backend";
import { formatPrice } from "@/lib/utils";
import { useCartStore, type CartItem } from "@/store/cartStore";

type Line = Pick<CartItem, "cartKey" | "id" | "name" | "variant" | "price" | "stock">;

export interface CartPriceChange {
  cartKey: string;
  name: string;
  from: number;
  to: number;
}

export interface CartPriceDiff {
  /** Lines whose unit price is different now. */
  changes: CartPriceChange[];
  /** Lines whose SKU is gone or whose product is no longer on sale. */
  unavailable: { cartKey: string; name: string }[];
  /** Current numbers for every line that can still be bought. */
  updates: { cartKey: string; price: number; stock: number | null }[];
}

const paise = (n: number) => Math.round(n * 100);

/** Compare stored lines with the server's current prices (pure). */
export function diffCartPrices(items: Line[], check: CartPriceCheck): CartPriceDiff {
  const bySku = new Map(check.items.map((i) => [i.skuId, i]));
  const diff: CartPriceDiff = { changes: [], unavailable: [], updates: [] };
  for (const line of items) {
    const now = bySku.get(line.id);
    if (!now || !now.available) {
      diff.unavailable.push({ cartKey: line.cartKey, name: line.name });
      continue;
    }
    if (paise(now.unitPrice) !== paise(line.price)) {
      diff.changes.push({ cartKey: line.cartKey, name: line.name, from: line.price, to: now.unitPrice });
    }
    diff.updates.push({ cartKey: line.cartKey, price: now.unitPrice, stock: now.stock });
  }
  return diff;
}

/** "Prices updated: Virtus M4 Spoiler (Gloss Black) is now ₹6,499" — or null when nothing changed. */
export function priceChangeNotice(diff: Pick<CartPriceDiff, "changes"> | null): string | null {
  if (!diff || diff.changes.length === 0) return null;
  return `Prices updated: ${diff.changes.map((c) => `${c.name} is now ${formatPrice(c.to)}`).join("; ")}`;
}

/** "X is no longer available — remove it to continue." — or null. */
export function unavailableNotice(diff: Pick<CartPriceDiff, "unavailable"> | null): string | null {
  if (!diff || diff.unavailable.length === 0) return null;
  const names = diff.unavailable.map((u) => u.name).join(", ");
  return `${names} ${diff.unavailable.length === 1 ? "is" : "are"} no longer available — remove ${diff.unavailable.length === 1 ? "it" : "them"} to continue.`;
}

export const PRICES_CHANGED_ERROR = "Prices changed — please review your total and tap Pay again.";

const CHUNK = 50; // the endpoint's per-request cap

let inFlight: Promise<CartPriceDiff | null> | null = null;

/**
 * Re-read every cart line's price and stock and write them into the cart.
 * Returns what changed, or null if the check couldn't run (offline etc.) —
 * the Pay path's final server-side amount check still protects that case.
 * Overlapping calls (two views mounting, React dev double effects) share one
 * request, so every caller sees the same "what changed" answer.
 */
export function refreshCartPrices(): Promise<CartPriceDiff | null> {
  if (!inFlight) {
    inFlight = runPriceCheck().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

async function runPriceCheck(): Promise<CartPriceDiff | null> {
  // What the shopper is looking at right now — changes are reported against it.
  const shown = useCartStore.getState().items;
  if (shown.length === 0) return { changes: [], unavailable: [], updates: [] };
  const ids = [...new Set(shown.map((i) => i.id))];
  try {
    const parts = await Promise.all(
      Array.from({ length: Math.ceil(ids.length / CHUNK) }, (_, n) =>
        backend.checkCartPrices(ids.slice(n * CHUNK, (n + 1) * CHUNK)),
      ),
    );
    const check: CartPriceCheck = { items: parts.flatMap((p) => p.items), missing: parts.flatMap((p) => p.missing) };
    const diff = diffCartPrices(shown, check);
    // Lines added/removed meanwhile are matched by cartKey, so only existing lines change.
    useCartStore.getState().applyPriceUpdates(diff.updates);
    return diff;
  } catch {
    return null;
  }
}
