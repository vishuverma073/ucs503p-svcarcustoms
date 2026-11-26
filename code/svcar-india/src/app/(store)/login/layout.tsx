import type { Metadata } from "next";

/**
 * Auth screen; indexing it only creates a thin duplicate.
 *
 * The page itself is a Client Component, which cannot export `metadata` — so the
 * directive lives here. robots.txt already discourages crawling, but `noindex`
 * is what actually keeps a leaked URL out of the index.
 */
export const metadata: Metadata = {
  title: "Sign In — SV Car Customs",
  robots: { index: false, follow: false },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
