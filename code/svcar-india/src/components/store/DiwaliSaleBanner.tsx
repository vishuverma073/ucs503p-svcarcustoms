import Link from "next/link";
import DiwaliCodeStrip from "@/components/store/DiwaliCodeStrip";

/**
 * Diwali 2026 sale banner — the first thing on the home page while the sale is
 * live (the page gates it with isDiwaliSaleLive). The offer text is baked into
 * the artwork, so the alt text carries it. Art-directed: a portrait 2:3 poster on
 * phones, the full 1873×840 scene from `sm` up, edge to edge at every width.
 * Each breakpoint reserves its own aspect ratio, so nothing shifts
 * while the image loads; it's the LCP element, so it loads eagerly at high
 * priority (a plain <picture>: next/image can't art-direct, and the custom
 * loader serves local files untouched anyway).
 */
export default function DiwaliSaleBanner({ shopHref }: { shopHref: string }) {
  return (
    <section aria-label="Diwali sale" className="bg-brand-black">
      {/* The banner replaces the hero, which carries the home page's only <h1>. */}
      <h1 className="sr-only">SV Car Customs Diwali Sale: up to 10% off car accessories</h1>
      <Link href={shopHref} className="block w-full focus-visible:outline-2 focus-visible:outline-offset-2">
        <picture className="block w-full aspect-[2/3] sm:aspect-[1873/840] overflow-hidden">
          <source media="(min-width: 640px)" srcSet="/banners/diwali-2026-desktop.webp" width={1873} height={840} />
          <img
            src="/banners/diwali-2026-mobile.webp"
            width={1024}
            height={1536}
            alt="Diwali Sale at SV Car Customs: 10% off on orders above ₹7,000, 5% off on orders above ₹3,000. Shop the sale."
            fetchPriority="high"
            loading="eager"
            decoding="async"
            className="block w-full h-full object-cover"
          />
        </picture>
      </Link>
      <DiwaliCodeStrip />
    </section>
  );
}
