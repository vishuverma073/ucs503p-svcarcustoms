"use client";

import CategoryCard from "./CategoryCard";
import Carousel from "./Carousel";
import InfiniteCarousel from "./InfiniteCarousel";
import type { Category } from "@svcar/contracts";

interface CategoryCarouselProps {
  categories: Category[];
  /** Cards visible at once on desktop (default: 4). */
  columns?: number;
  className?: string;
}

/**
 * Category cards as a mobile swipe carousel / desktop arrow carousel — the same
 * treatment {@link ProductCarousel} gives products. A plain grid of every
 * category turned the home page into a wall of cards once the catalogue grew
 * past a handful; the carousel keeps the section one row tall no matter how many
 * categories exist.
 */
export default function CategoryCarousel({
  categories,
  columns = 4,
  className = "",
}: CategoryCarouselProps) {
  if (categories.length === 0) return null;

  return (
    <div className={className}>
      {/* Mobile: swipe carousel */}
      <div className="md:hidden">
        <Carousel itemWidth="72vw" gap={12} showArrows={false}>
          {categories.map((cat) => (
            <CategoryCard key={cat.id} name={cat.name} slug={cat.slug} image={cat.image} />
          ))}
        </Carousel>
      </div>

      {/* Desktop: arrow-controlled, seamlessly looping carousel */}
      <div className="hidden md:block">
        <InfiniteCarousel perView={columns} gap={16}>
          {categories.map((cat) => (
            <CategoryCard key={cat.id} name={cat.name} slug={cat.slug} image={cat.image} />
          ))}
        </InfiniteCarousel>
      </div>
    </div>
  );
}
