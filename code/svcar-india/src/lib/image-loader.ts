/**
 * next/image loader that resizes through Supabase Storage instead of Vercel.
 *
 * Vercel's optimizer started answering every uncached transform with
 * `402 OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED` once the plan's quota ran out,
 * which broke product photography site-wide. Supabase serves the same objects
 * and will resize them itself: swapping `/object/public/` for
 * `/render/image/public/` and passing `width`/`quality` returns a correctly
 * sized image, in WebP when the browser's Accept header asks for it.
 *
 * Anything that isn't a Supabase public object — the bundled logo under
 * /uploads, or a placeholder host — is returned untouched and served as-is.
 * Those are small and few; the catalog is what needed resizing.
 */

/**
 * Widest render we ask Supabase for. next/image would otherwise request the
 * largest device size (3840) for any `sizes="100vw"` image, and re-encoding the
 * 3024px originals that big produced files *heavier* than the source (418 KB
 * against 257 KB). 1600 covers a desktop gallery at 2x and lands around 130 KB.
 */
const MAX_WIDTH = 1600;

const PUBLIC_OBJECT_PATH = "/storage/v1/object/public/";
const RENDER_PATH = "/storage/v1/render/image/public/";

export interface ImageLoaderArgs {
  src: string;
  width: number;
  quality?: number;
}

export default function supabaseImageLoader({ src, width, quality }: ImageLoaderArgs): string {
  if (!src.includes(PUBLIC_OBJECT_PATH)) return src;

  let url: URL;
  try {
    url = new URL(src);
  } catch {
    // Relative or malformed — nothing to rewrite.
    return src;
  }
  if (!url.hostname.endsWith(".supabase.co")) return src;

  url.pathname = url.pathname.replace(PUBLIC_OBJECT_PATH, RENDER_PATH);
  url.searchParams.set("width", String(Math.min(width, MAX_WIDTH)));
  url.searchParams.set("quality", String(quality ?? 75));
  // Without this the renderer stretches the image to width x original-height —
  // a 3024x3024 photo asked for at 256 comes back 256x3024. `contain` scales it
  // proportionally instead.
  url.searchParams.set("resize", "contain");
  return url.toString();
}
