import { BRAND } from "@/lib/brand";

/**
 * Store / office location — single source for contact, about and footer.
 *
 * Values come from `contact.address` in brand.config.ts at the repo root; this
 * module just keeps the existing export shape so import sites don't move.
 */
export const STORE_ADDRESS = BRAND.contact.address;

export const STORE_ADDRESS_LINES = BRAND.contact.addressLines;

/** Opens the place in the Google Maps app / website (no API key). */
export const GOOGLE_MAPS_OPEN_URL: string = BRAND.maps.openUrl;

/**
 * Standard Google Maps embed URL (query + output=embed).
 * Use in an iframe — requires CSP frame-src to allow google.com.
 */
export const GOOGLE_MAPS_EMBED_URL: string = BRAND.maps.embedUrl;
