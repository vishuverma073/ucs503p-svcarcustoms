"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { GA_ID, GOOGLE_ADS_ID, META_PIXEL_ID, HAS_GTAG } from "@/lib/analytics-config";

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    gtag?: (...args: any[]) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fbq?: (...args: any[]) => void;
    /** gtag command queue (created by the inline stub; drained by gtag.js). */
    dataLayer?: unknown[];
    /** Pixel stub alias; `queue` holds commands made before fbevents.js loads. */
    _fbq?: { queue?: unknown[] };
  }
}

/**
 * Loads GA4 + Google Ads (via a single gtag.js) and the Meta Pixel — each only
 * when its NEXT_PUBLIC_* id is present. Mounted once in the root layout. Emits a
 * page_view / PageView on client-side route changes too (the initial load is
 * already counted by gtag config + the pixel snippet, so the first effect run is
 * skipped to avoid double-counting).
 */
export function TrackingScripts() {
  const pathname = usePathname();
  const firstRun = useRef(true);

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (GA_ID && window.gtag) window.gtag("event", "page_view", { page_path: pathname });
    if (META_PIXEL_ID && window.fbq) window.fbq("track", "PageView");
  }, [pathname]);

  // Keep third-party tags off the admin panel: its bearer token lives in
  // sessionStorage, readable by any script on the page. (A tab that started on
  // the storefront and navigated client-side into /admin already has them.)
  if (pathname?.startsWith("/admin")) return null;

  return (
    <>
      {HAS_GTAG && (
        <>
          <Script
            id="gtag-src"
            strategy="afterInteractive"
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID ?? GOOGLE_ADS_ID}`}
          />
          <Script
            id="gtag-init"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: [
                "window.dataLayer=window.dataLayer||[];",
                "function gtag(){dataLayer.push(arguments);}",
                "gtag('js',new Date());",
                GA_ID ? `gtag('config','${GA_ID}');` : "",
                GOOGLE_ADS_ID ? `gtag('config','${GOOGLE_ADS_ID}');` : "",
              ].join(""),
            }}
          />
        </>
      )}

      {META_PIXEL_ID && (
        <>
          <Script
            id="meta-pixel"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html:
                "!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?" +
                "n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;" +
                "n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;" +
                "t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document," +
                "'script','https://connect.facebook.net/en_US/fbevents.js');" +
                `fbq('init','${META_PIXEL_ID}');fbq('track','PageView');`,
            }}
          />
          <noscript>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              height="1"
              width="1"
              style={{ display: "none" }}
              alt=""
              src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
            />
          </noscript>
        </>
      )}
    </>
  );
}
