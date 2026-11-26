"use client";

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import useSWR from "swr";
import ProductCard from "@/components/store/ProductCard";
import { PRODUCT_GRID_CLASS } from "@/components/store/product-grid";
import ApiErrorState from "@/components/store/ApiErrorState";
import { backend } from "@/lib/backend";
import { ProductGridSkeleton } from "@/components/store/Skeletons";
import { Search, ChevronRight, SearchX, Package, Car } from "lucide-react";
import { useGarageStore, vehicleLabel } from "@/store/garageStore";
import { SHOP_HREF } from "@/lib/shop-nav";
import {
    SEARCH_PAGE_SIZE,
    appendSearchResults,
    isSearchCapped,
    toSearchResults,
    type SearchResult,
} from "@/lib/search-results";

function SearchPageContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const initialQuery = searchParams.get("q") ?? "";

    const [query, setQuery] = useState(initialQuery);
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);
    // Rank offset of the next page (null = the list is complete), and whether
    // the API cut the list at its own default without saying so.
    const [nextCursor, setNextCursor] = useState<number | null>(null);
    const [capped, setCapped] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [moreError, setMoreError] = useState(false);
    const reqRef = useRef(0);

    const vehicle = useGarageStore((s) => s.vehicle);
    const hydrated = useGarageStore((s) => s.hydrated);
    const [onlyFits, setOnlyFits] = useState(true);
    // [Personalization temporarily disabled] Flip to true to restore the
    // vehicle-fitment feature (garage selector, "fits my car" filter, PDP badge).
    const PERSONALIZATION_ENABLED = false;
    const fitsActive = PERSONALIZATION_ENABLED && hydrated && !!vehicle && onlyFits;

    const { data: categoryShortcuts } = useSWR("search-category-shortcuts", async () => {
        const navbar = await backend.getNavbar().catch(() => []);
        if (navbar.length > 0) {
            return navbar.slice(0, 4).map((c) => ({ slug: c.slug, name: c.name }));
        }
        const all = await backend.getCategories().catch(() => []);
        return all
            .filter((c) => c.parentId == null)
            .slice(0, 4)
            .map((c) => ({ slug: c.slug, name: c.name }));
    });

    // One page of results for `q`. When a garage vehicle is set + the "fits my
    // car" filter is on, use the fitment-aware catalog list (q + make/model/year);
    // otherwise the full-text search. Both page the same way (limit + cursor).
    const fetchPage = useCallback(
        (q: string, cursor?: number) =>
            fitsActive && vehicle
                ? backend.listProducts({
                      q,
                      make: vehicle.make,
                      model: vehicle.model,
                      year: vehicle.year ?? undefined,
                      limit: SEARCH_PAGE_SIZE,
                      cursor,
                  })
                : backend.searchProducts(q, { limit: SEARCH_PAGE_SIZE, cursor }),
        [fitsActive, vehicle],
    );

    const search = useCallback(async (q: string) => {
        const reqId = ++reqRef.current;
        setNextCursor(null);
        setCapped(false);
        setMoreError(false);
        if (!q.trim()) {
            setResults([]);
            setLoading(false);
            setError(false);
            return;
        }

        setLoading(true);
        setError(false);
        try {
            const page = await fetchPage(q);
            if (reqId !== reqRef.current) return;
            setResults(toSearchResults(page.items));
            setNextCursor(page.nextCursor);
            setCapped(isSearchCapped(page, SEARCH_PAGE_SIZE));
        } catch {
            if (reqId === reqRef.current) {
                setError(true);
                setResults([]);
            }
        } finally {
            if (reqId === reqRef.current) setLoading(false);
        }
    }, [fetchPage]);

    const loadMore = useCallback(async () => {
        if (nextCursor == null || loadingMore) return;
        // Same request id as the list on screen: a query typed meanwhile wins.
        const reqId = reqRef.current;
        setLoadingMore(true);
        setMoreError(false);
        try {
            const page = await fetchPage(query, nextCursor);
            if (reqId !== reqRef.current) return;
            setResults((prev) => appendSearchResults(prev, toSearchResults(page.items)));
            setNextCursor(page.nextCursor);
        } catch {
            if (reqId === reqRef.current) setMoreError(true);
        } finally {
            if (reqId === reqRef.current) setLoadingMore(false);
        }
    }, [fetchPage, query, nextCursor, loadingMore]);

    useEffect(() => {
        const q = searchParams.get("q") ?? "";
        setQuery((prev) => (prev === q ? prev : q));
    }, [searchParams]);

    useEffect(() => {
        const timer = setTimeout(() => search(query), 300);
        return () => clearTimeout(timer);
    }, [query, search]);

    useEffect(() => {
        const trimmed = query.trim();
        const current = searchParams.get("q") ?? "";
        if (trimmed === current) return;

        const params = new URLSearchParams(searchParams.toString());
        if (trimmed) params.set("q", trimmed);
        else params.delete("q");
        const qs = params.toString();
        router.replace(qs ? `/search?${qs}` : "/search", { scroll: false });
    }, [query, router, searchParams]);

    return (
        // Results use the full-width listing grid (as /shop); the search box,
        // messages and idle shortcuts keep their narrow column.
        <div className="max-w-380 mx-auto px-4 py-8">
            <h1 className="sr-only">Search products</h1>
            <div className="relative mb-10 max-w-3xl mx-auto">
                <Search size={20} className="absolute left-5 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search products..."
                    className="w-full pl-14 pr-5 py-4 text-base rounded-2xl bg-surface-card border border-border-light shadow-card focus:border-brand-orange focus:shadow-lg transition-all duration-300 outline-none font-medium"
                    autoFocus
                />
                {PERSONALIZATION_ENABLED && hydrated && vehicle && (
                    <label className="mt-3 flex items-center gap-2 text-[13px] font-medium text-text-secondary cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={onlyFits}
                            onChange={(e) => setOnlyFits(e.target.checked)}
                            className="accent-brand-orange w-4 h-4"
                        />
                        <Car size={14} className="text-brand-orange" />
                        Only show parts that fit my {vehicleLabel(vehicle)}
                    </label>
                )}
            </div>

            {loading && (
                <div className="py-4">
                    <ProductGridSkeleton count={6} />
                </div>
            )}

            {!loading && error && query && (
                <div className="max-w-3xl mx-auto">
                    <ApiErrorState
                        title="Search unavailable"
                        message="We couldn't reach the catalog. Check your connection and try again."
                        onRetry={() => search(query)}
                    />
                </div>
            )}

            {!loading && !error && query && results.length === 0 && (
                <div className="empty-state max-w-3xl mx-auto">
                    <div className="empty-state-icon">
                        <SearchX size={28} strokeWidth={1.5} />
                    </div>
                    <p className="text-text-secondary font-medium mb-1">No results found</p>
                    <p className="text-sm text-text-muted">
                        Try searching for &quot;body kit&quot;, &quot;spoiler&quot;, or &quot;exhaust&quot;
                    </p>
                </div>
            )}

            {results.length > 0 && (
                <div>
                    <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-4">
                        {results.length} result{results.length > 1 ? "s" : ""}
                        {nextCursor != null ? " so far" : ""}
                    </p>
                    <div className={PRODUCT_GRID_CLASS}>
                        {results.map((item, index) => (
                            <ProductCard
                                key={item.id}
                                slug={item.slug}
                                name={item.name}
                                image={item.image}
                                minPrice={item.minPrice}
                                maxBasePrice={item.maxBasePrice}
                                discount={item.discount}
                                isBestseller={item.isBestseller}
                                isNew={item.isNew}
                                skuCount={item.skuCount}
                                eager={index < 4}
                            />
                        ))}
                    </div>

                    {nextCursor != null && (
                        <div className="pt-6 text-center">
                            <button
                                type="button"
                                onClick={loadMore}
                                disabled={loadingMore}
                                className="btn btn-secondary inline-flex"
                            >
                                {loadingMore ? "Loading…" : "Show more results"}
                            </button>
                            {moreError && (
                                <p className="mt-3 text-sm text-text-muted" role="alert">
                                    Couldn&apos;t load more results. Please try again.
                                </p>
                            )}
                        </div>
                    )}

                    {capped && (
                        // The API returned its default page and no cursor: the list
                        // is cut, not complete. Say so rather than imply "that's all".
                        <p className="pt-6 text-center text-sm text-text-muted">
                            Showing the first {results.length} results. Try a more specific search to see others.
                        </p>
                    )}
                </div>
            )}

            {!query && (
                <div className="animate-fade-in max-w-3xl mx-auto">
                    <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-text-muted mb-5">
                        Popular Categories
                    </h2>
                    <div className="grid grid-cols-2 gap-3">
                        {(categoryShortcuts ?? []).map((cat) => (
                            <Link
                                key={cat.slug}
                                href={`/category/${cat.slug}`}
                                className="flex items-center gap-3.5 p-4 rounded-2xl bg-surface-card border border-border-light hover:border-border hover:shadow-card transition-all duration-200 group"
                            >
                                <div className="w-10 h-10 rounded-xl bg-brand-orange-light flex items-center justify-center text-brand-orange">
                                    <Package size={18} strokeWidth={1.8} />
                                </div>
                                <div>
                                    <span className="text-sm font-semibold text-text-primary group-hover:text-brand-orange transition-colors">
                                        {cat.name}
                                    </span>
                                </div>
                            </Link>
                        ))}
                    </div>

                    <div className="mt-8">
                        <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-text-muted mb-4">
                            Trending Searches
                        </h2>
                        <div className="flex flex-wrap gap-2">
                            {["Body Kit", "Spoiler", "Ambient Lights", "Exhaust", "Paddle Shifters"].map((term) => (
                                <button
                                    key={term}
                                    type="button"
                                    onClick={() => setQuery(term)}
                                    className="px-4 py-2 text-sm font-medium rounded-full bg-surface-dim text-text-secondary hover:bg-brand-orange-light hover:text-brand-orange transition-all duration-200 cursor-pointer"
                                >
                                    {term}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="mt-8 text-center">
                        <Link href={SHOP_HREF} className="btn btn-secondary inline-flex">
                            Browse All Products
                            <ChevronRight size={16} />
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
}

function SearchFallback() {
    return (
        <div className="max-w-380 mx-auto px-4 py-8">
            <ProductGridSkeleton count={4} />
        </div>
    );
}

export default function SearchPage() {
    return (
        <Suspense fallback={<SearchFallback />}>
            <SearchPageContent />
        </Suspense>
    );
}
