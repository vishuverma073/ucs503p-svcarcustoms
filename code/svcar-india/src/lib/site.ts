import { BRAND } from "@/lib/brand";

/**
 * Canonical site origin for SEO surfaces (sitemap, robots, canonical URLs, OG
 * images, JSON-LD). SEO surfaces always use the production domain.
 *
 * The value is `domains.storefront` in brand.config.ts at the repo root. Write
 * the host that actually serves: if the apex 308-redirects to `www`, the
 * `www` form belongs there or every canonical URL points at a redirect.
 */
export const SITE_URL: string = BRAND.siteUrl;

/** Absolute URL for a path under the site origin. */
export function absoluteUrl(path = "/"): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Bare hostname, no scheme — for prose that names the site ("By using
 * svcarcustoms.in..."). Legal pages used to hardcode this, and drifted onto a
 * domain we no longer serve.
 */
export const SITE_HOST: string = SITE_URL.replace(/^https?:\/\//, "");
