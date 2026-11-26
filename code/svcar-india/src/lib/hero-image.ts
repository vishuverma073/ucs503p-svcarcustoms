import { getSafeImageSrc } from "@/lib/utils";

const SUPABASE_OBJECT_PATH = "/storage/v1/object/public/";

/**
 * True for an image the custom loader can resize (a Supabase Storage public
 * object, see image-loader.ts). Anything else — placehold.co, a stock-photo
 * host — is served at its original size, which is how a 1600 px hero JPEG
 * became 727 KB on the first view of `/`.
 */
export function isResizableImage(url: string | null | undefined): boolean {
  const src = getSafeImageSrc(url);
  if (!src || !src.includes(SUPABASE_OBJECT_PATH)) return false;
  try {
    return new URL(src).hostname.endsWith(".supabase.co");
  } catch {
    return false;
  }
}

/**
 * Hero image to render: the admin's own photo when it is a catalogue upload,
 * otherwise the first real product photo from `candidates` (bestsellers), and
 * only then the placeholder. Keeps a stock/placeholder admin value from
 * costing the first screen its weight while the owner has no banner uploaded.
 */
export function resolveHeroImage(
  adminImage: string | null | undefined,
  candidates: Array<string | null | undefined>,
  placeholder: string,
): string {
  if (isResizableImage(adminImage)) return getSafeImageSrc(adminImage) as string;
  for (const candidate of candidates) {
    if (isResizableImage(candidate)) return getSafeImageSrc(candidate) as string;
  }
  return getSafeImageSrc(adminImage) ?? getSafeImageSrc(candidates[0]) ?? placeholder;
}
