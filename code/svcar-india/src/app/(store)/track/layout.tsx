import type { Metadata } from "next";

/** Client page (no `metadata` export) — the title lives here. */
export const metadata: Metadata = {
  title: "Track Your Order — SV Car Customs",
  description: "Track your SV Car Customs order with your order number and the email or mobile you used. No login needed.",
  alternates: { canonical: "/track" },
};

export default function TrackLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
