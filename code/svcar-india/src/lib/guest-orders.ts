/**
 * Guest checkout keeps no account, so the browser that placed an order holds
 * the key to it: the API returns a random token with every guest order, and the
 * confirmation, tracking and retry-payment pages send it back. Kept per order
 * number in localStorage; storage that's blocked just means those pages fall
 * back to their signed-in behaviour.
 */
const KEY = "svcar-guest-orders";
/** Oldest entries are dropped beyond this so the map can't grow forever. */
const MAX_ORDERS = 20;

type TokenMap = Record<string, string>;

function read(): TokenMap {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as TokenMap) : {};
  } catch {
    return {};
  }
}

export function saveGuestOrderToken(orderNumber: string, token: string): void {
  try {
    const entries = Object.entries(read()).filter(([n]) => n !== orderNumber);
    entries.push([orderNumber, token]);
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(entries.slice(-MAX_ORDERS))));
  } catch {
    /* storage blocked — the order is still placed; only guest tracking is lost */
  }
}

export function getGuestOrderToken(orderNumber: string): string | null {
  const token = read()[orderNumber];
  return typeof token === "string" ? token : null;
}

// ── Track order (any device) ─────────────────────────────────────────────────
// On a device without the token, the email or mobile the order was placed with
// unlocks the same view and retry calls. Kept for this tab only.

const TRACKED_KEY = "svcar-tracked-orders";

/** What unlocks a guest order here: its saved token, or the contact entered on /track. */
export type GuestAccess = { token: string } | { contact: string };

export function saveTrackedContact(orderNumber: string, contact: string): void {
  try {
    const map = JSON.parse(sessionStorage.getItem(TRACKED_KEY) || "{}") as Record<string, string>;
    map[orderNumber] = contact;
    sessionStorage.setItem(TRACKED_KEY, JSON.stringify(map));
  } catch {
    /* storage blocked — the order page will send them back to /track */
  }
}

export function getGuestOrderAccess(orderNumber: string): GuestAccess | null {
  const token = getGuestOrderToken(orderNumber);
  if (token) return { token };
  try {
    const contact = (JSON.parse(sessionStorage.getItem(TRACKED_KEY) || "{}") as Record<string, unknown>)[orderNumber];
    return typeof contact === "string" ? { contact } : null;
  } catch {
    return null;
  }
}

// ── Remembered checkout details ──────────────────────────────────────────────
// A guest who comes back (or retries after a failed payment) shouldn't have to
// type their address again. Kept only on this device.

const DETAILS_KEY = "svcar-guest-details";

export interface GuestDetails {
  email: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
  landmark: string;
}

export function loadGuestDetails(): Partial<GuestDetails> {
  try {
    const raw = localStorage.getItem(DETAILS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Partial<GuestDetails>) : {};
  } catch {
    return {};
  }
}

export function saveGuestDetails(details: GuestDetails): void {
  try {
    localStorage.setItem(DETAILS_KEY, JSON.stringify(details));
  } catch {
    /* storage blocked — they'll just type it again next time */
  }
}
