"use client";

import { Suspense, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AdminWelcomeTransition from "@/components/admin/AdminWelcomeTransition";
import { safeAdminReturnTo } from "@/lib/admin-welcome";
import { useAdminAuthStore } from "@/store/adminAuthStore";

function WelcomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = safeAdminReturnTo(searchParams.get("returnTo"));

  const hydrated = useAdminAuthStore((s) => s.hydrated);
  const token = useAdminAuthStore((s) => s.token);
  const admin = useAdminAuthStore((s) => s.admin);

  // The signed-in admin's own name. `name` is "" for an admin who never set one
  // (the contract coerces null → ""), so fall back to the local part of their
  // email before the generic label. This used to be the hard-coded string
  // "Shivam", which greeted every admin — including a brand-new fork — by one
  // person's name.
  const adminName =
    admin?.name?.trim() || admin?.email?.split("@")[0]?.trim() || "Admin";

  useEffect(() => {
    if (!hydrated) return;
    if (!token) {
      router.replace(`/admin/login?returnTo=${encodeURIComponent(returnTo)}`);
    }
  }, [hydrated, token, returnTo, router]);

  const handleComplete = useCallback(() => {
    router.replace(returnTo);
  }, [router, returnTo]);

  if (!hydrated || !token) {
    return <div className="min-h-screen bg-brand-black" aria-hidden />;
  }

  return (
    <AdminWelcomeTransition adminName={adminName} onComplete={handleComplete} />
  );
}

export default function AdminWelcomePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-brand-black" />}>
      <WelcomeContent />
    </Suspense>
  );
}
