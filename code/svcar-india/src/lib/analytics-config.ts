/**
 * Third-party marketing analytics IDs, read from NEXT_PUBLIC_* env (inlined at
 * build time). Every integration stays completely inert until its ID is set, so
 * this can ship to production now and light up the moment you paste the IDs into
 * Vercel — no code change needed. Mirrors the guarded-config pattern in
 * src/lib/social-links.ts.
 */
function clean(v: string | undefined): string | undefined {
  const t = v?.trim();
  return t ? t : undefined;
}

/** GA4 measurement id, e.g. "G-XXXXXXX". */
export const GA_ID = clean(process.env.NEXT_PUBLIC_GA_ID);

/** Google Ads tag id, e.g. "AW-XXXXXXXXX" (shares gtag.js with GA4). */
export const GOOGLE_ADS_ID = clean(process.env.NEXT_PUBLIC_GOOGLE_ADS_ID);

/** Google Ads Purchase conversion label — the "AW-XXX/labelHere" tail. Optional. */
export const GOOGLE_ADS_PURCHASE_LABEL = clean(process.env.NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_LABEL);

/** Meta (Facebook/Instagram) Pixel id — a numeric string. */
export const META_PIXEL_ID = clean(process.env.NEXT_PUBLIC_META_PIXEL_ID);

/** Google Search Console meta-tag verification token. */
export const GOOGLE_SITE_VERIFICATION = clean(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION);

/** True when any gtag-based tag (GA4 or Google Ads) is configured. */
export const HAS_GTAG = Boolean(GA_ID || GOOGLE_ADS_ID);
