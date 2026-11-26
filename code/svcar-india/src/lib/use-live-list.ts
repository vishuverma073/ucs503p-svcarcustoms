"use client";

import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { NEW_ROW_HIGHLIGHT_MS, trackLiveResponse, type LiveBaseline } from "@/lib/live-refresh";

/**
 * Tracks a live list between refreshes: when it last loaded and which rows are
 * new since the previous load. Feed `onData` from SWR's `onSuccess` (a callback,
 * not an effect), so the diff runs exactly once per arrived response.
 * `getIds` must be stable (define it at module level).
 */
export function useLiveTracker<T>(getIds: (data: T) => string[]) {
  const baseline = useRef<LiveBaseline>({ seen: null, key: null });
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const [highlighted, setHighlighted] = useState<ReadonlySet<string>>(() => new Set());
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  /** `key` = SWR's key for this response; a new key (filter/search change) starts a fresh baseline. */
  const onData = useCallback(
    (data: T, key?: string) => {
      const { fresh, next } = trackLiveResponse(baseline.current, getIds(data), key);
      baseline.current = next;
      setUpdatedAt(Date.now());
      if (fresh.length === 0) return;
      setHighlighted((prev) => new Set([...prev, ...fresh]));
      for (const id of fresh) {
        clearTimeout(timers.current.get(id));
        timers.current.set(
          id,
          setTimeout(() => {
            timers.current.delete(id);
            setHighlighted((prev) => {
              const nextSet = new Set(prev);
              nextSet.delete(id);
              return nextSet;
            });
          }, NEW_ROW_HIGHLIGHT_MS),
        );
      }
    },
    [getIds],
  );

  return { onData, highlighted, updatedAt };
}

// A shared 5s clock so every "updated …" label ticks without its own timer.
let now = 0;
const clockListeners = new Set<() => void>();
let clockTimer: ReturnType<typeof setInterval> | null = null;

function subscribeClock(cb: () => void) {
  clockListeners.add(cb);
  if (!clockTimer) {
    now = Date.now();
    clockTimer = setInterval(() => {
      now = Date.now();
      for (const l of clockListeners) l();
    }, 5_000);
  }
  return () => {
    clockListeners.delete(cb);
    if (clockListeners.size === 0 && clockTimer) {
      clearInterval(clockTimer);
      clockTimer = null;
    }
  };
}

/** Wall clock that re-renders every 5s (0 on the server). */
export function useNow(): number {
  return useSyncExternalStore(
    subscribeClock,
    () => now,
    () => 0,
  );
}
