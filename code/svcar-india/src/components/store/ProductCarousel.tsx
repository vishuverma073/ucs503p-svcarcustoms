"use client";

import ProductCard from "./ProductCard";
import Carousel from "./Carousel";
import InfiniteCarousel from "./InfiniteCarousel";
import type { ProductListItem } from "@svcar/contracts";

// Image `sizes` for the two layouts below: a 72vw swipe card on phones, a
// quarter of the (1520 px max) container on the desktop carousel.
const MOBILE_CARD_SIZES = "72vw";
const DESKTOP_CARD_SIZES = "(min-width: 1520px) 360px, 25vw";

interface ProductCarouselProps {
  products: ProductListItem[];
  columns?: number; // desktop grid columns (default: 4)
  className?: string;
}

/**
 * Renders a list of {@link ProductListItem}s (pricing precomputed by the
 * backend) as a mobile carousel / desktop grid of product cards.
 */
export default function ProductCarousel({
  products,
  columns = 4,
  className = "",
}: ProductCarouselProps) {
  if (products.length === 0) return null;

  return (
    <div className={className}>
      {/* Mobile: swipe carousel */}
      <div className="md:hidden">
        <Carousel itemWidth="72vw" gap={12} showArrows={false}>
          {products.map((product) => (
            <ProductCard
              key={product.id}
              slug={product.slug}
              name={product.name}
              image={product.image}
              minPrice={product.minPrice}
              maxBasePrice={product.maxBasePrice}
              discount={product.bestDiscount}
              isBestseller={product.isBestseller}
              isNew={product.isNew}
              skuCount={product.skuCount}
              fitments={product.fitments}
              imageSizes={MOBILE_CARD_SIZES}
            />
          ))}
        </Carousel>
      </div>

      {/* Desktop: arrow-controlled, seamlessly looping carousel */}
      <div className="hidden md:block">
        <InfiniteCarousel perView={columns} gap={16}>
          {products.map((product) => (
            <ProductCard
              key={product.id}
              slug={product.slug}
              name={product.name}
              image={product.image}
              minPrice={product.minPrice}
              maxBasePrice={product.maxBasePrice}
              discount={product.bestDiscount}
              isBestseller={product.isBestseller}
              isNew={product.isNew}
              skuCount={product.skuCount}
              fitments={product.fitments}
              imageSizes={DESKTOP_CARD_SIZES}
            />
          ))}
        </InfiniteCarousel>
      </div>
    </div>
  );
}
