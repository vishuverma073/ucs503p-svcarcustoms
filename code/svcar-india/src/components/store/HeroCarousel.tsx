import Link from "next/link";
import { ArrowRight } from "lucide-react";
import SafeBannerImage from "@/components/store/SafeBannerImage";
import type { HomeBanner } from "@/lib/backend";
import { formatPrice } from "@/lib/utils";
import { listPrice } from "@/lib/list-price";
import { COD_ADVANCE_PERCENT } from "@/lib/checkout";

const FALLBACK_IMAGE =
  "https://placehold.co/1600x900/0C0C0D/E11D2A/png?text=SV+Car+Customs";

/** The catalogue product whose photo the hero shows (drives caption + price strip). */
export interface HeroFeature {
  slug: string;
  name: string;
  minPrice: number;
  maxBasePrice: number;
  discount: number;
  skuCount?: number;
}

/**
 * Design D "data plate" hero. A framed product photo (the page resolves it to
 * a catalogue photo when the admin value is a placeholder — see
 * resolveHeroImage) with a caption, the big condensed headline, a light price
 * strip for the pictured product (only when the photo IS that product), and
 * three plain-fact cells: delivery / COD / exchange. Copy only states the
 * site's published terms.
 */
export default function HeroCarousel({
  hero,
  shopHref,
  feature,
  freeDelivery = true,
}: {
  hero: HomeBanner;
  shopHref: string;
  feature?: HeroFeature | null;
  /** False only when the admin has set a delivery fee. */
  freeDelivery?: boolean;
}) {
  const image = hero.image || FALLBACK_IMAGE;
  const subtitle =
    hero.subtitle || "Your trusted destination for premium car accessories & customization.";
  const ctaText = hero.ctaText || "Shop All Products";
  const ctaLink = hero.ctaLink || shopHref;
  const price = feature ? listPrice(feature) : null;

  const cells = [
    { k: "Delivery", v: freeDelivery ? "Free on all orders" : "Pan India", s: "Ships in 2-4 days" },
    { k: "COD", v: `${COD_ADVANCE_PERCENT}% online`, s: "Rest paid at your door" },
    { k: "Exchange", v: "Damage only · 4 days", s: "With unboxing video · no returns" },
  ];

  return (
    <section className="border-b border-border bg-surface" aria-label="Featured">
      <div className="max-w-380 mx-auto px-4 py-6 md:py-10 grid grid-cols-1 gap-6 md:grid-cols-12 md:gap-10 items-center">
        {/* Framed photo + caption */}
        <figure className="d-frame min-w-0 md:col-span-6 md:order-2">
          <div className="relative aspect-[4/3] overflow-hidden bg-[#f4f4f5]">
            <SafeBannerImage
              src={image}
              fallbackSrc={FALLBACK_IMAGE}
              alt={feature?.name ?? hero.title ?? "SV Car Customs"}
              className="object-contain"
              priority
              quality={75}
            />
          </div>
          <figcaption className="flex items-center justify-between gap-3 px-1 pt-2 d-label !text-[11px] text-text-muted">
            <span className="truncate">{feature ? feature.name : "SV Car Customs · Delhi"}</span>
            <span className="shrink-0">Real product photo</span>
          </figcaption>
        </figure>

        <div className="min-w-0 md:col-span-6 md:order-1">
          <p className="d-label text-brand-orange">SV Car Customs</p>
          <h1 className="font-display mt-1 text-[40px] sm:text-6xl break-words lg:text-7xl font-extrabold uppercase leading-[0.92] tracking-[0.01em] text-text-primary">
            {hero.title || "Style. Performance. Quality."}
          </h1>
          <p className="mt-3 max-w-xl text-[15px] md:text-base text-text-secondary">{subtitle}</p>

          {feature && price && (
            <Link
              href={`/product/${feature.slug}`}
              className="d-strip mt-5 flex items-center gap-3 px-4 py-3 group"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold">{feature.name}</span>
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-display text-2xl font-extrabold leading-none">
                    {price.isFrom ? "From " : ""}
                    {formatPrice(price.price)}
                  </span>
                  {price.mrp !== null && (
                    <s className="text-[13px] text-zinc-600">
                      <span className="sr-only">MRP </span>
                      {formatPrice(price.mrp)}
                    </s>
                  )}
                  {price.discountLabel && (
                    <span className="text-[13px] font-bold text-green-800">{price.discountLabel}</span>
                  )}
                </span>
              </span>
              <span className="shrink-0 inline-flex items-center gap-1 font-display text-sm font-bold uppercase tracking-[0.1em] group-hover:underline">
                View part <ArrowRight size={15} aria-hidden />
              </span>
            </Link>
          )}

          <div className="mt-5">
            <Link href={ctaLink} className="btn btn-primary px-6 py-3">
              {ctaText}
              <ArrowRight size={17} aria-hidden />
            </Link>
          </div>
        </div>
      </div>

      {/* Delivery / COD / Exchange */}
      <div className="border-t border-border">
        <dl className="max-w-380 mx-auto grid grid-cols-3 divide-x divide-border">
          {cells.map((c) => (
            <div key={c.k} className="px-3 py-3 md:px-4 md:py-4">
              <dt className="d-label !text-[11px] text-text-muted">{c.k}</dt>
              <dd className="mt-0.5 font-display text-[15px] md:text-lg font-bold uppercase leading-tight text-text-primary">
                {c.v}
              </dd>
              <dd className="text-[11px] md:text-xs text-text-secondary leading-snug">{c.s}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
