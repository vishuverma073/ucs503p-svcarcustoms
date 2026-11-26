/**
 * "Live" admin screens (dashboard, orders, phone leads): poll every 5 seconds
 * while the page is visible, show when the data last arrived, and flag rows
 * that weren't there on the previous load.
 */
import type { SWRConfiguration } from "swr";

export const LIVE_REFRESH_MS = 5_000;

/**
 * SWR options for a live list. Deduping must stay BELOW the poll interval —
 * the panel's default 30s dedupe would silently swallow every 5s refresh.
 */
export const liveSWRConfig = {
  refreshInterval: LIVE_REFRESH_MS,
  refreshWhenHidden: false, // phone locked / app in background → no polling
  refreshWhenOffline: false,
  revalidateOnFocus: true, // back to the app → fresh at once, not in ≤5s
  dedupingInterval: 2_000,
  keepPreviousData: true,
  shouldRetryOnError: false,
} as const satisfies SWRConfiguration;

/**
 * Ids in `current` that were not in `seen`. The first load (`seen` null) marks
 * nothing new — everything is "new" only relative to what was already shown.
 */
export function diffNewIds(seen: ReadonlySet<string> | null, current: readonly string[]): string[] {
  if (!seen) return [];
  return current.filter((id) => !seen.has(id));
}

export interface LiveBaseline {
  /** Ids already shown for `key` (null = nothing loaded yet for this key). */
  seen: ReadonlySet<string> | null;
  key: string | null;
}

/**
 * One live response arrived: which ids are new, and the baseline to keep.
 * A different `key` (filter/search changed) starts over, so switching filters
 * never flags a whole list as new.
 */
export function trackLiveResponse(
  prev: LiveBaseline,
  ids: readonly string[],
  key?: string,
): { fresh: string[]; next: LiveBaseline } {
  const sameKey = key === undefined || key === prev.key;
  const seen = sameKey ? prev.seen : null;
  const fresh = diffNewIds(seen, ids);
  return {
    fresh,
    next: { seen: new Set([...(seen ?? []), ...ids]), key: key ?? prev.key },
  };
}

/** "just now" / "12s ago" / "3 min ago" / "2 h ago" for the live indicator. */
export function formatUpdatedAgo(ageMs: number): string {
  const s = Math.max(0, Math.round(ageMs / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  return `${Math.round(m / 60)} h ago`;
}

/** How long a new row stays highlighted. */
export const NEW_ROW_HIGHLIGHT_MS = 8_000;

/** SWR keys a new order / lead makes stale (dashboard, orders list + stats, phone leads). */
export function isLiveAdminKey(key: unknown): boolean {
  const head = Array.isArray(key) ? key[0] : key;
  if (typeof head !== "string") return false;
  return /admin\/(orders|phone-leads)/.test(head);
}
