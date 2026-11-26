import type { Metadata } from "next";

/**
 * A per-visitor cart has no stable public content.
 *
 * The page itself is a Client Component, which cannot export `metadata` — so the
 * directive lives here. robots.txt already discourages crawling, but `noindex`
 * is what actually keeps a leaked URL out of the index.
 */
export const metadata: Metadata = {
  title: "Your Cart — SV Car Customs",
  robots: { index: false, follow: false },
};

export default function CartLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
