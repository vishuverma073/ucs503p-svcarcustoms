"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Package } from "lucide-react";
import { backend, type CategoryProductPage } from "@/lib/backend";
import ApiErrorState from "@/components/store/ApiErrorState";
import CategoryProductListing from "@/components/store/CategoryProductListing";
import type { CategoryListingProduct } from "@/components/store/CategoryProductListing";
import { ProductGridSkeleton } from "@/components/store/Skeletons";

const PAGE_SIZE = 24;

type RawItem = Awaited<ReturnType<typeof backend.listProductsByCategory>>["items"][number];

export function mapCategoryItem(p: RawItem): CategoryListingProduct {
  return {
    slug: p.slug,
    name: p.name,
    image: p.image,
    minPrice: p.minPrice,
    maxBasePrice: p.maxBasePrice,
    discount: p.bestDiscount,
    isBestseller: p.isBestseller,
    isNew: p.isNew,
    skuCount: p.skuCount,
    sizes: p.sizes ?? [],
  };
}

export interface CategoryProductLoaderProps {
  /** Category to page through, or null for the whole catalogue (/shop). */
  slug: string | null;
  /** First page of products, fetched on the server so they're in the initial
   *  HTML (crawlable with JS off). Empty + serverError=true triggers a client
   *  fetch fallback (e.g. the server-side fetch failed). */
  initialItems: RawItem[];
  initialCursor: number | null;
  initialTotal: number | null;
  serverError?: boolean;
}

export default function CategoryProductLoader({
  slug,
  initialItems,
  initialCursor,
  initialTotal,
  serverError = false,
}: CategoryProductLoaderProps) {
  const [products, setProducts] = useState<CategoryListingProduct[]>(() =>
    initialItems.map(mapCategoryItem),
  );
  const [cursor, setCursor] = useState<number | null>(initialCursor);
  const [total, setTotal] = useState<number | null>(initialTotal);
  const [loading, setLoading] = useState(serverError); // only when we must client-fetch
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(
    async (nextCursor?: number | null, append = false) => {
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(false);
      try {
        // The catalogue list has no `total`; the category list's is optional.
        const page: CategoryProductPage =
          slug === null
            ? await backend.listProducts({ limit: PAGE_SIZE, cursor: nextCursor ?? undefined })
            : await backend.listProductsByCategory(slug, {
                limit: PAGE_SIZE,
                cursor: nextCursor ?? undefined,
              });
        setProducts((prev) =>
          append ? [...prev, ...page.items.map(mapCategoryItem)] : page.items.map(mapCategoryItem),
        );
        setCursor(page.nextCursor);
        if (page.total != null) setTotal(page.total);
      } catch {
        setError(true);
        if (!append) setProducts([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [slug],
  );

  // Client-fetch fallback only when the server-side seed failed.
  useEffect(() => {
    if (serverError) void load(null, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="mt-6 md:mt-8">
        <ProductGridSkeleton count={6} />
      </div>
    );
  }

  if (error) {
    return <ApiErrorState title="Couldn't load products" onRetry={() => load(null, false)} />;
  }

  if (products.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">
          <Package size={28} strokeWidth={1.5} />
        </div>
        <p className="text-text-secondary font-medium mb-1">No products found</p>
        <p className="text-sm text-text-muted mb-6">
          {slug === null ? "Check back soon for new arrivals." : "Check back soon for new arrivals in this category."}
        </p>
        <Link href="/" className="btn btn-primary">
          Back to Home
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-6 md:mt-8">
      {/* One product count: the grid's pill shows the category total. */}
      <CategoryProductListing categorySlug={slug ?? "all"} products={products} total={total} />
      {cursor != null && (
        <div className="mt-8 text-center">
          <button
            type="button"
            onClick={() => load(cursor, true)}
            disabled={loadingMore}
            className="btn btn-secondary text-sm min-w-[10rem] disabled:opacity-50"
          >
            {loadingMore ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Loading…
              </>
            ) : (
              "Load more products"
            )}
          </button>
        </div>
      )}
    </div>
  );
}
