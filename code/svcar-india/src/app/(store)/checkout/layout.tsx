import type { Metadata } from "next";

/**
 * Transactional; never a search entry point.
 *
 * The page itself is a Client Component, which cannot export `metadata` — so the
 * directive lives here. robots.txt already discourages crawling, but `noindex`
 * is what actually keeps a leaked URL out of the index.
 */
export const metadata: Metadata = {
  title: "Checkout — SV Car Customs",
  robots: { index: false, follow: false },
};

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
