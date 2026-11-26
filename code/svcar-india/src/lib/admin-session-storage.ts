/**
 * Where the admin session (8h bearer token + profile) is kept in the browser.
 *
 * Default: sessionStorage — gone when the tab (or the installed app) closes,
 * which was the only behaviour before. "Keep me signed in on this device" puts
 * the SAME token in localStorage instead, so the phone app reopens signed in
 * until the token's own 8h expiry. The server, the token and its lifetime are
 * unchanged; logout (or a 401) clears both stores.
 */
import type { StateStorage } from "zustand/middleware";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

type StorageGetter = () => StorageLike | null | undefined;

/** Runs a storage call, swallowing SecurityError (private mode, blocked storage). */
function attempt<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export interface AdminSessionStorage {
  /** zustand `persist` storage: reads local first, writes to the chosen store only. */
  storage: StateStorage;
  /** Choose before the session is written (at sign-in). */
  setRemember(remember: boolean): void;
  /** True when the session lives in localStorage ("keep me signed in"). */
  isRemembered(): boolean;
  /** Remove the session from BOTH stores (logout, expired/invalid token). */
  clearAll(key: string): void;
}

export function createAdminSessionStorage(local: StorageGetter, session: StorageGetter): AdminSessionStorage {
  // null until we know: a stored session tells us on read, sign-in tells us on write.
  let remember: boolean | null = null;

  const removeBoth = (key: string) => {
    attempt(() => local()?.removeItem(key), undefined);
    attempt(() => session()?.removeItem(key), undefined);
  };

  const storage: StateStorage = {
    getItem(key) {
      const fromLocal = attempt(() => local()?.getItem(key) ?? null, null);
      if (fromLocal != null) {
        remember = true;
        return fromLocal;
      }
      const fromSession = attempt(() => session()?.getItem(key) ?? null, null);
      if (fromSession != null && remember === null) remember = false;
      return fromSession;
    },
    setItem(key, value) {
      if (remember) {
        attempt(() => local()?.setItem(key, value), undefined);
        attempt(() => session()?.removeItem(key), undefined);
      } else {
        attempt(() => session()?.setItem(key, value), undefined);
        attempt(() => local()?.removeItem(key), undefined);
      }
    },
    removeItem: removeBoth,
  };

  return {
    storage,
    setRemember(value) {
      remember = value;
    },
    isRemembered() {
      return remember === true;
    },
    clearAll(key) {
      removeBoth(key);
      remember = null;
    },
  };
}

/** `exp` (seconds) of a JWT, or null when the token isn't a decodable JWT. */
export function jwtExpiry(token: string): number | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json?.exp === "number" ? json.exp : null;
  } catch {
    return null;
  }
}

/** True only for a JWT whose `exp` has passed (opaque tokens are left to the server). */
export function isTokenExpired(token: string, nowMs: number = Date.now()): boolean {
  const exp = jwtExpiry(token);
  return exp != null && exp * 1000 <= nowMs;
}
