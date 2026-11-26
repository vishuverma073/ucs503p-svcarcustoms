import type { Metadata, Viewport } from "next";
import { Inter, Barlow_Condensed } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { SITE_URL } from "@/lib/site";
import { BRAND } from "@/lib/brand";
import { GOOGLE_SITE_VERIFICATION } from "@/lib/analytics-config";
import "./globals.css";
import { MswProvider } from "@/components/MswProvider";
import { TrackingScripts } from "@/components/analytics/TrackingScripts";
import { ThemeSync } from "@/components/ThemeSync";

// next/font requires a statically analysable import, so the family itself is the
// one brand value that isn't generated — change this line (and theme.fontFamily
// in brand.config.ts) together. The CSS variable stays brand-neutral, so the
// --font-sans token in globals.css never moves.
const brandFont = Inter({
  subsets: ["latin"],
  variable: "--font-brand",
  display: "swap",
});

// Design D display face: condensed uppercase headings/labels (storefront).
const displayFont = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-display-face",
  display: "swap",
});

// Explicit mobile viewport: fit the device width and allow pinch-zoom (never
// disable user scaling — that's an accessibility failure).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: BRAND.seo.title,
  description: BRAND.seo.description,
  keywords: [...BRAND.seo.keywords],
  openGraph: {
    title: BRAND.seo.title,
    description: BRAND.seo.description,
    type: "website",
    // og:image is supplied by the file-convention route src/app/opengraph-image.tsx.
  },
  twitter: {
    card: "summary_large_image",
    title: BRAND.seo.title,
    description: BRAND.seo.description,
    // twitter:image falls back to the opengraph-image route.
  },
  metadataBase: new URL(SITE_URL),
  // No site-wide canonical here: a layout-level canonical "/" is inherited by
  // every page that forgets its own (search, login, cart, 404s, previews) and
  // tells Google each of them is a duplicate of the home page. The home page
  // declares "/" itself.
  // Google Search Console meta-tag verification — inert until the token env is set.
  ...(GOOGLE_SITE_VERIFICATION ? { verification: { google: GOOGLE_SITE_VERIFICATION } } : {}),
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${brandFont.variable} ${displayFont.variable}`} data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        {/* Apply the saved (or default) theme before paint so there's no flash.
            Both values are JSON-encoded from the brand config — never interpolate
            anything user-supplied into an inline script. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              `(function(){var K=${JSON.stringify(BRAND.theme.storageKey)},D=${JSON.stringify(
                BRAND.theme.defaultMode === "dark",
              )};try{var t=localStorage.getItem(K);var d=t?t==='dark':D;if(d)document.documentElement.classList.add('dark');}catch(e){if(D)document.documentElement.classList.add('dark');}})();`,
          }}
        />
      </head>
      <body className="min-h-screen bg-surface font-sans antialiased" suppressHydrationWarning>
        <MswProvider>{children}</MswProvider>
        {/* Re-applies the theme after mount / bfcache restore in case a hydration
            recovery re-created <html> and dropped the class the script above set. */}
        <ThemeSync />
        {/* GA4 + Google Ads + Meta Pixel — each inert until its NEXT_PUBLIC_* id is set. */}
        <TrackingScripts />
        {/* No-ops off Vercel; report page views + Core Web Vitals once deployed. */}
        {/* Vercel-only beacons; on other hosts their script URL is a 404. */}
        {process.env.VERCEL && (
          <>
            <Analytics />
            <SpeedInsights />
          </>
        )}
      </body>
    </html>
  );
}
