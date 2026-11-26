"use client";

import { usePathname } from "next/navigation";

export function isCheckoutPath(pathname: string | null): boolean {
  return pathname === "/checkout" || !!pathname?.startsWith("/checkout/");
}

/** Renders children except on checkout (its own focused chrome). */
export default function HideOnCheckout({
  children,
  alsoHideOnHome = false,
}: {
  children: React.ReactNode;
  /** Home renders its own copy of the row below the hero. */
  alsoHideOnHome?: boolean;
}) {
  const pathname = usePathname();
  if (isCheckoutPath(pathname)) return null;
  if (alsoHideOnHome && pathname === "/") return null;
  return <>{children}</>;
}
