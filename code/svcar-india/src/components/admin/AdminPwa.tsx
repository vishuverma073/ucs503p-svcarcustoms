"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { mutate } from "swr";
import { captureInstallPrompt, registerAdminServiceWorker } from "@/lib/admin-pwa";
import { syncPushSubscription } from "@/lib/admin-push-client";
import { safeAdminReturnTo } from "@/lib/admin-welcome";
import { isLiveAdminKey } from "@/lib/live-refresh";
import { useAdminAuthStore } from "@/store/adminAuthStore";

interface SwMessage {
  type?: string;
  url?: string;
}

/**
 * Admin-only PWA wiring, mounted once in the admin layout (never on the
 * storefront): registers /admin-sw.js (live mode only), listens for the
 * install prompt, re-syncs this device's push subscription after sign-in,
 * and reacts to the worker:
 *  - "admin-push"     → refetch orders/leads now (the alert just arrived)
 *  - "admin-navigate" → open the page a tapped notification points at
 */
export default function AdminPwa() {
  const router = useRouter();
  const token = useAdminAuthStore((s) => s.token);

  useEffect(() => {
    captureInstallPrompt();
    void registerAdminServiceWorker();
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent<SwMessage>) => {
      const msg = event.data;
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "admin-push") {
        void mutate((key) => isLiveAdminKey(key));
      } else if (msg.type === "admin-navigate" && typeof msg.url === "string") {
        router.push(safeAdminReturnTo(msg.url));
      } else if (msg.type === "admin-push-resubscribe") {
        void syncPushSubscription();
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [router]);

  // Signed in on this device → quietly make sure its subscription is current.
  useEffect(() => {
    if (token) void syncPushSubscription();
  }, [token]);

  return null;
}
