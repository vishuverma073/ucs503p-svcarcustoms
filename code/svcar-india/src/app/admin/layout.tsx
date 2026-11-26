import type { Metadata, Viewport } from "next";
import AdminLayoutClient from "@/components/admin/AdminLayoutClient";

/** Admin chrome colour (--color-brand-black) — status bar / app splash. */
const ADMIN_BLACK = "#0C0C0D";

/**
 * Admin root layout. Only admin pages get the "SV Admin" web app manifest and
 * iPhone home-screen tags, so the storefront never becomes installable as the
 * admin app. The admin service worker is registered from here too (AdminPwa).
 */
export const metadata: Metadata = {
  title: { default: "SV Admin", template: "%s · SV Admin" },
  manifest: "/admin.webmanifest",
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "SV Admin", statusBarStyle: "black" },
  // Setting `icons` here replaces the root favicon for admin pages, so both are listed.
  icons: {
    icon: [{ url: "/admin-icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/admin-icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  // Next emits the newer `mobile-web-app-capable`; older iOS versions only read this one.
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  themeColor: ADMIN_BLACK,
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminLayoutClient>{children}</AdminLayoutClient>;
}
