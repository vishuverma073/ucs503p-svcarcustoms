"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { getAdminToken, useAdminAuthStore } from "@/store/adminAuthStore";
import { stopPushOnLogout } from "@/lib/admin-push-client";
import { adminApi } from "@/lib/admin-api";
import { backend } from "@/lib/backend";
import Sidebar from "./Sidebar";
import BottomNav from "./BottomNav";
import TopBar from "./TopBar";

/**
 * Authenticated admin chrome: desktop sidebar + mobile bottom nav + top bar.
 * Redirects to /login (preserving returnTo) once the store has hydrated and
 * there is no token — replacing the legacy `admin-session` cookie gate.
 */
export default function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const hydrated = useAdminAuthStore((s) => s.hydrated);
  const token = useAdminAuthStore((s) => s.token);

  useEffect(() => {
    if (hydrated && !token) {
      // Keep the query too, so a notification deep link (or a filtered list)
      // lands back on exactly that page after signing in.
      const returnTo = encodeURIComponent(pathname + window.location.search);
      router.replace(`/admin/login?returnTo=${returnTo}`);
    }
  }, [hydrated, token, pathname, router]);

  async function handleLogout() {
    // Stop phone alerts on this device (best-effort, not awaited): uses the
    // token being signed out, so it can run after the session is cleared.
    void stopPushOnLogout(getAdminToken());
    adminApi.logout(); // clear the admin session
    // Also end the customer session you signed in with to reach admin, so you
    // land on the storefront fully signed out (cleaner + more secure).
    await backend.logout().catch(() => {});
    toast.success("Signed out");
    router.replace("/");
  }

  // Hold the first paint until we know whether a session exists.
  if (!hydrated || !token) {
    return <div className="min-h-screen bg-brand-black" aria-hidden />;
  }

  return (
    <div className="min-h-screen bg-surface-dim">
      <Sidebar onLogout={handleLogout} />
      <div className="lg:pl-60 flex flex-col min-h-screen">
        <TopBar onLogout={handleLogout} />
        <main className="flex-1 p-4 lg:p-6 pb-24 lg:pb-6 overflow-x-hidden">{children}</main>
      </div>
      <BottomNav onLogout={handleLogout} />
    </div>
  );
}
