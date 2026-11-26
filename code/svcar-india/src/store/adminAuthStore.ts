"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { AdminUser } from "@svcar/contracts";
import { createAdminSessionStorage, isTokenExpired } from "@/lib/admin-session-storage";

/**
 * Admin session store.
 *
 * The bearer token + admin profile are persisted to **sessionStorage** (cleared
 * when the tab closes) — or, when the admin ticks "Keep me signed in on this
 * device" at sign-in, to **localStorage**, so the installed phone app reopens
 * signed in. Same 8h token either way; never a cookie. The token is attached as
 * `Authorization: Bearer <token>` by the admin API client.
 *
 * `hydrated` flips true once persist has rehydrated, so the layout can avoid
 * redirecting to /login on the first paint before the stored session is known.
 */
export const ADMIN_AUTH_STORAGE_KEY = "svcar-admin-auth";

const browserStorage = (kind: "localStorage" | "sessionStorage") => () =>
  typeof window === "undefined" ? null : window[kind];

export const adminSessionStorage = createAdminSessionStorage(
  browserStorage("localStorage"),
  browserStorage("sessionStorage"),
);

interface AdminAuthState {
  token: string | null;
  admin: AdminUser | null;
  hydrated: boolean;
  /** `remember` = keep the session in localStorage ("Keep me signed in"). */
  setSession: (token: string, admin: AdminUser, remember?: boolean) => void;
  clear: () => void;
  setHydrated: () => void;
}

export const useAdminAuthStore = create<AdminAuthState>()(
  persist(
    (set) => ({
      token: null,
      admin: null,
      hydrated: false,
      setSession: (token, admin, remember = false) => {
        adminSessionStorage.setRemember(remember);
        set({ token, admin });
      },
      clear: () => {
        set({ token: null, admin: null });
        // Logout / dead token: wipe it from BOTH stores, whichever held it.
        adminSessionStorage.clearAll(ADMIN_AUTH_STORAGE_KEY);
      },
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: ADMIN_AUTH_STORAGE_KEY,
      storage: createJSONStorage(() => adminSessionStorage.storage),
      partialize: (s) => ({ token: s.token, admin: s.admin }),
      onRehydrateStorage: () => (state) => {
        // An expired 8h token restored from storage is dropped before the shell
        // renders, instead of flashing the dashboard and bouncing on the first 401.
        if (state?.token && isTokenExpired(state.token)) state.clear();
        state?.setHydrated();
      },
    },
  ),
);

/** Read the current token outside React (used by the admin API client). */
export function getAdminToken(): string | null {
  return useAdminAuthStore.getState().token;
}
