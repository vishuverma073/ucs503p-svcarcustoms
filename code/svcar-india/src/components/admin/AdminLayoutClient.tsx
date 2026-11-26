"use client";

import { usePathname } from "next/navigation";
import { Toaster } from "sonner";
import AdminAuthProvider from "@/components/admin/AdminAuthProvider";
import AdminShell from "@/components/admin/AdminShell";
import AdminPwa from "@/components/admin/AdminPwa";

/**
 * Client half of the admin layout. The legacy `admin-session` cookie gate is
 * gone — auth lives in {@link useAdminAuthStore} (bearer token in session or
 * local storage), enforced by {@link AdminShell}. /admin/login and
 * /admin/welcome render bare (no chrome); every other admin route is wrapped in
 * the authenticated shell.
 */
export default function AdminLayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isBareRoute = pathname === "/admin/login" || pathname === "/admin/welcome";

  return (
    <AdminAuthProvider>
      <AdminPwa />
      {isBareRoute ? children : <AdminShell>{children}</AdminShell>}
      <Toaster position="top-center" richColors closeButton />
    </AdminAuthProvider>
  );
}
