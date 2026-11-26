import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { backend } from "@/lib/backend";
import { pickCarCategories } from "@/lib/car-categories";
import { SHOP_HREF } from "@/lib/shop-nav";
import CarChipLink from "./carbon/CarChipLink";

/**
 * "Shop by car" chip row: the car-model categories that currently hold at
 * least one product, as plain server-rendered links (crawlable), plus an
 * all-products link. Rendered under the home hero and on /shop so a visitor
 * who knows their car reaches its page in one tap. Every fetch is tagged ISR
 * (categories / products), the same as the sections around it; a read failure
 * degrades to "no row", never to a broken page.
 */
export default async function ShopByCarChips({
  className = "",
  currentSlug,
  variant = "block",
}: {
  /** Outer layout (container width / padding) — the row itself is unstyled. */
  className?: string;
  /** Marks the chip for the page being viewed (the category page is not used here yet). */
  currentSlug?: string;
  /** "bar": the compact Design D strip under the header (active chip from the URL). */
  variant?: "block" | "bar";
}) {
  const categories = await backend.getCategories().catch(() => []);
  const cars = pickCarCategories(categories);
  if (cars.length === 0) return null;

  // No product counts on the public category list, so ask each car category
  // for its first product — an empty one would be a dead chip (F-11 again).
  const stocked = await Promise.all(
    cars.map((car) =>
      backend
        .listProductsByCategory(car.slug, { limit: 1 })
        .then((page) => page.items.length > 0)
        .catch(() => false),
    ),
  );
  const shown = cars.filter((_, i) => stocked[i]);
  if (shown.length === 0) return null;

  if (variant === "bar") {
    return (
      <nav className={`border-b border-border bg-surface ${className}`} aria-label="Shop by car">
        <div className="max-w-400 mx-auto px-4 flex items-center gap-3 h-11">
          <span className="d-label text-text-muted shrink-0">By car</span>
          <div className="flex gap-1.5 overflow-x-auto scroll-x-hidden py-1">
            {shown.map((car) => (
              <CarChipLink key={car.slug} href={`/category/${car.slug}`} label={car.label} />
            ))}
          </div>
        </div>
      </nav>
    );
  }

  return (
    <nav className={className} aria-label="Shop by car">
      <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-text-muted mb-3">Shop by car</p>
      <div className="flex gap-2 overflow-x-auto scroll-x-hidden pb-2 -mx-1 px-1">
        {shown.map((car) => (
          <Link
            key={car.slug}
            href={`/category/${car.slug}`}
            className={`subcat-pill ${car.slug === currentSlug ? "active" : ""}`}
            aria-current={car.slug === currentSlug ? "page" : undefined}
          >
            {car.label}
          </Link>
        ))}
        <Link href={SHOP_HREF} className="subcat-pill inline-flex items-center gap-1.5">
          All products <ArrowRight size={14} />
        </Link>
      </div>
    </nav>
  );
}
