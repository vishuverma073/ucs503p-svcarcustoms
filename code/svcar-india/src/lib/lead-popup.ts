/**
 * When the "Need help finding the right part?" phone popup may appear.
 *
 * The decision is a pure function of the route, the clock and what this device
 * has stored, so it is unit-tested without a browser (lead-popup.test.ts). The
 * component (components/store/LeadPopup.tsx) only gathers those inputs.
 *
 * Rules:
 *  - only while browsing: /, /shop, /category/*, /product/* — never in the
 *    cart → checkout → confirmation flow, tracking, login, account or admin;
 *  - not before 30 seconds after landing;
 *  - at most once per 7 days per device, and never again once a number was sent;
 *  - never when this device already saved checkout details with a phone (we
 *    already have the number);
 *  - never when localStorage is unavailable, since then the 7-day rule can't be
 *    kept and the popup would come back on every visit;
 *  - not while the shopper is typing or has a menu/dialog open (try again later).
 */

export const LEAD_POPUP_DELAY_MS = 30_000;
export const LEAD_POPUP_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
/** How long to wait before asking again when the shopper was busy. */
export const LEAD_POPUP_RETRY_MS = 5_000;
export const LEAD_POPUP_STORAGE_KEY = "svcar-lead-popup";

/** What this device remembers about the popup (epoch ms). */
export interface LeadPopupState {
  lastShownAt?: number;
  submittedAt?: number;
}

/** Routes where the popup may appear (trailing slash tolerated). */
export function isLeadPopupRoute(pathname: string): boolean {
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return p === "/" || p === "/shop" || /^\/category\/[^/]+/.test(p) || /^\/product\/[^/]+/.test(p);
}

export interface LeadPopupInput {
  pathname: string;
  now: number;
  /** When this visit started (first storefront render). */
  landedAt: number;
  /** Stored state; null when localStorage can't be read. */
  state: LeadPopupState | null;
  /** Saved guest checkout details include a phone. */
  hasSavedPhone: boolean;
  /** Typing in a field, or a menu/dialog is open. */
  userBusy?: boolean;
  delayMs?: number;
}

export type LeadPopupDecision =
  /** Open it now. */
  | "show"
  /** Not yet — too early, wrong page, or the shopper is busy. Ask again later. */
  | "later"
  /** Not on this device for now (cooldown, already sent, number known, no storage). */
  | "never";

export function decideLeadPopup(i: LeadPopupInput): LeadPopupDecision {
  if (i.hasSavedPhone || !i.state || i.state.submittedAt) return "never";
  // A lastShownAt in the future (clock changed) also counts as recent.
  if (i.state.lastShownAt !== undefined && i.now - i.state.lastShownAt < LEAD_POPUP_COOLDOWN_MS) return "never";
  if (!isLeadPopupRoute(i.pathname)) return "later";
  if (i.now - i.landedAt < (i.delayMs ?? LEAD_POPUP_DELAY_MS)) return "later";
  if (i.userBusy) return "later";
  return "show";
}

export function shouldShowLeadPopup(i: LeadPopupInput): boolean {
  return decideLeadPopup(i) === "show";
}

/** Parse the stored value; anything malformed reads as "never shown". */
export function parseLeadPopupState(raw: string | null): LeadPopupState {
  if (!raw) return {};
  try {
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== "object") return {};
    const o = v as Record<string, unknown>;
    const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : undefined);
    const out: LeadPopupState = {};
    const shown = num(o.lastShownAt);
    const sent = num(o.submittedAt);
    if (shown !== undefined) out.lastShownAt = shown;
    if (sent !== undefined) out.submittedAt = sent;
    return out;
  } catch {
    return {};
  }
}

/** Stored state, or null when localStorage is blocked/unavailable. */
export function loadLeadPopupState(): LeadPopupState | null {
  try {
    return parseLeadPopupState(window.localStorage.getItem(LEAD_POPUP_STORAGE_KEY));
  } catch {
    return null;
  }
}

function saveLeadPopupState(patch: LeadPopupState): void {
  try {
    const next = { ...parseLeadPopupState(window.localStorage.getItem(LEAD_POPUP_STORAGE_KEY)), ...patch };
    window.localStorage.setItem(LEAD_POPUP_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage blocked — loadLeadPopupState() returns null then, so it won't show again */
  }
}

export function markLeadPopupShown(now: number): void {
  saveLeadPopupState({ lastShownAt: now });
}

export function markLeadPopupSubmitted(now: number): void {
  saveLeadPopupState({ submittedAt: now });
}

/**
 * The 10-digit mobile from what was typed: "+91 98765 43210", "098765-43210",
 * "9876543210" → "9876543210"; null if it isn't a valid Indian mobile. Same
 * rule as the API (packages/contracts toIndianMobile10). Stricter than
 * toMobile10() in utils on purpose: an extra digit is an error here, not
 * silently cut off, because a wrong number is a lost lead.
 */
export function normaliseLeadPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  const ten = digits.length > 10 && /^(91|0)/.test(digits) ? digits.slice(-10) : digits;
  return /^[6-9]\d{9}$/.test(ten) ? ten : null;
}
