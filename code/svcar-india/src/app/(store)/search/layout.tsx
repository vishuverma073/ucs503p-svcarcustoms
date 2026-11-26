import type { Metadata } from "next";

/**
 * Query-string result pages are the classic thin/duplicate-content trap.
 *
 * The page itself is a Client Component, which cannot export `metadata` — so the
 * directive lives here. robots.txt already discourages crawling, but `noindex`
 * is what actually keeps a leaked URL out of the index.
 */
export const metadata: Metadata = {
  title: "Search — SV Car Customs",
  robots: { index: false, follow: false },
};

export default function SearchLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
