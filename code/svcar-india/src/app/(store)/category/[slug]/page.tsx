import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { backend, isNotFoundError } from "@/lib/backend";
import type { CategoryWithBreadcrumb } from "@svcar/contracts";
import Breadcrumb from "@/components/store/Breadcrumb";
import CategorySidebar from "@/components/store/CategorySidebar";
import SectionHeader from "@/components/store/SectionHeader";
import CategoryProductLoader from "@/components/store/CategoryProductLoader";
import LastVisitedCategoryTracker from "@/components/store/nav/LastVisitedCategoryTracker";
import { SHOP_HREF } from "@/lib/shop-nav";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbListLd, productItemListLd } from "@/lib/structured-data";
import { deliveryAlwaysFree } from "@/lib/checkout";
import { pickCarCategories } from "@/lib/car-categories";
import {
    categoryDisplayName,
    categoryFactsFrom,
    categoryIntro,
    categorySeoDescription,
    categorySeoTitle,
    relatedCarCategorySlugs,
} from "@/lib/seo-copy";

// Big enough that every product in the largest category is in the server HTML.
// At 24, Virtus/Slavia (27 products) left three reachable only through the
// client-side "load more", i.e. with no crawlable link anywhere on the site.
// The public list endpoint caps a page at 50.
const PAGE_SIZE = 48;

// Served from the cache (tagged fetches, purged by the admin webhook); each
// category renders on its first visit and is then cached.
export const revalidate = 86400;

export async function generateStaticParams(): Promise<{ slug: string }[]> {
    return [];
}

interface CategoryPageProps {
    params: Promise<{ slug: string }>;
}

/** Free delivery unless the admin set a fee — the rule the on-page copy uses. */
async function storeTerms() {
    const settings = await backend.getPublicSettings().catch(() => null);
    return { freeDelivery: !settings || deliveryAlwaysFree(settings) };
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
    const { slug } = await params;
    try {
        const [category, firstPage, feed, terms] = await Promise.all([
            backend.getCategoryBySlug(slug),
            backend.listProductsByCategory(slug, { limit: PAGE_SIZE }).catch(() => null),
            backend.getProductFeed().catch(() => null),
            storeTerms(),
        ]);
        // A category with no products is an empty grid — keep it out of the
        // index (and the sitemap) until something is listed in it.
        const isEmpty = firstPage !== null && firstPage.items.length === 0;
        const facts = categoryFactsFrom(category, firstPage, feed?.items);
        const description = category.description?.trim() || categorySeoDescription(facts, terms);
        const title = categorySeoTitle(facts);
        return {
            title,
            description,
            alternates: { canonical: `/category/${slug}` },
            ...(isEmpty ? { robots: { index: false, follow: true } } : {}),
            openGraph: { title, description, type: "website", url: `/category/${slug}` },
            twitter: { card: "summary_large_image", title, description },
        };
    } catch {
        // Never inherit the root layout's canonical "/" on a fetch failure.
        return { title: "Category — SV Car Customs", alternates: { canonical: `/category/${slug}` } };
    }
}

export default async function CategoryPage({ params }: CategoryPageProps) {
    const { slug } = await params;

    let category: CategoryWithBreadcrumb;
    try {
        category = await backend.getCategoryBySlug(slug);
    } catch (err) {
        // Only a real 404; an outage rethrows so ISR keeps the stale page.
        if (isNotFoundError(err)) notFound();
        throw err;
    }

    // Server-fetch the first product page so cards + PDP links are in the initial
    // HTML (crawlable with JS off). On failure, hand the loader a fallback flag so
    // it client-fetches instead of showing an empty category.
    let initialItems: Awaited<ReturnType<typeof backend.listProductsByCategory>>["items"] = [];
    let initialCursor: number | null = null;
    let initialTotal: number | null = null;
    let productsServerError = false;
    try {
        const firstPage = await backend.listProductsByCategory(slug, { limit: PAGE_SIZE });
        initialItems = firstPage.items;
        initialCursor = firstPage.nextCursor;
        initialTotal = firstPage.total ?? null;
    } catch {
        productsServerError = true;
    }

    const breadcrumb = category.breadcrumb; // root → … → self
    const isRootNode = category.parentId === null;
    const parentCategory = isRootNode ? category : breadcrumb[breadcrumb.length - 2];

    // Sibling pills = the parent's children (one extra fetch only for sub-pages), alphabetical.
    const displaySubCategories = [
        ...(isRootNode
            ? category.children
            : (await backend.getCategoryBySlug(parentCategory.slug)).children),
    ].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    const hasSubCategories = displaySubCategories.length > 0;

    // Sidebar + mobile tabs: expandable tree on the active branch.
    const [allCategories, feed, terms] = await Promise.all([
        backend.getAllCategories(),
        // Cached (1h, purged with "products"); only read for fitments.
        backend.getProductFeed().catch(() => null),
        storeTerms(),
    ]);
    const breadcrumbIdSet = new Set(breadcrumb.map((c) => c.id));

    // Short intro from catalogue facts (count, cars, lowest price) — crawlable
    // text that says what the page holds, for queries like "carbon fibre
    // steering wheel" that the bare product grid didn't answer.
    const facts = categoryFactsFrom(
        category,
        productsServerError ? null : { items: initialItems, total: initialTotal },
        feed?.items,
    );
    const intro = initialItems.length > 0 ? categoryIntro(facts, terms) : "";
    // "Shop by car": the car categories this category's products fit.
    const carLinks = (() => {
        const wanted = relatedCarCategorySlugs(facts.fitments, slug);
        const live = new Map(pickCarCategories(allCategories).map((c) => [c.slug, c] as const));
        return wanted.flatMap((s) => {
            const c = live.get(s);
            return c ? [{ slug: c.slug, label: c.label }] : [];
        });
    })();

    const breadcrumbItems = breadcrumb.map((cat, i) => ({
        label: cat.name,
        ...(i < breadcrumb.length - 1 ? { href: `/category/${cat.slug}` } : {}),
    }));

    return (
        <div className="max-w-380 mx-auto px-4 py-8">
            <JsonLd data={breadcrumbListLd(breadcrumbItems)} />
            {initialItems.length > 0 && (
                <JsonLd data={productItemListLd(initialItems.map((p) => ({ slug: p.slug, name: p.name })))} />
            )}
            <LastVisitedCategoryTracker slug={slug} name={category.name} />
            <Breadcrumb items={breadcrumbItems} shopHref={SHOP_HREF} className="mb-8" />

            <div className="flex gap-10">
                {/* Desktop Sidebar */}
                <aside className="hidden lg:block w-56 shrink-0">
                    <div className="sticky top-24">
                        <h3 className="d-label !text-[11px] text-text-muted mb-4">
                            Categories
                        </h3>
                        <CategorySidebar
                            categories={allCategories}
                            currentSlug={slug}
                            breadcrumbIds={breadcrumbIdSet}
                        />
                    </div>
                </aside>

                {/* Main Content */}
                <div className="flex-1 min-w-0">
                    {/* Design D boxed title. */}
                    <div className="mb-5 border border-border bg-surface-card px-4 py-3 md:px-5 md:py-4">
                        <h1 className="font-display text-[32px] md:text-5xl font-extrabold uppercase leading-[0.95] tracking-[0.01em] text-text-primary break-words">
                            {categoryDisplayName(slug, category.name)}
                        </h1>
                        {category.description?.trim() && (
                            <p className="mt-2 text-[14px] leading-relaxed text-text-secondary">{category.description}</p>
                        )}
                    </div>
                    {intro && (
                        <p className="-mt-2 mb-5 max-w-3xl text-[14px] leading-relaxed text-text-secondary">
                            {intro}
                        </p>
                    )}
                    {carLinks.length > 0 && (
                        <nav aria-label="Shop by car" className="mb-6 flex flex-wrap items-center gap-2">
                            <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-text-muted">
                                Shop by car
                            </span>
                            {carLinks.map((c) => (
                                <Link key={c.slug} href={`/category/${c.slug}`} className="subcat-pill">
                                    {c.label}
                                </Link>
                            ))}
                        </nav>
                    )}

                    {/* Mobile Category Tabs */}
                    <div className="lg:hidden flex gap-4 overflow-x-auto scroll-x-hidden border-b border-border-light mb-6">
                        {allCategories
                            .filter((c) => c.parentId === null)
                            .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
                            .map((cat) => (
                            <Link
                                key={cat.id}
                                href={`/category/${cat.slug}`}
                                className={`category-tab ${cat.slug === slug || breadcrumb.some((a) => a.id === cat.id) ? "active" : ""}`}
                            >
                                {cat.name}
                            </Link>
                        ))}
                    </div>

                    {/* Subcategory Pills */}
                    {hasSubCategories && (
                        <div className="flex gap-2 overflow-x-auto scroll-x-hidden pb-4 mb-6">
                            <Link
                                href={`/category/${parentCategory.slug}`}
                                className={`subcat-pill ${category.id === parentCategory.id ? "active" : ""}`}
                            >
                                All
                            </Link>
                            {displaySubCategories.map((sub) => (
                                <Link
                                    key={sub.id}
                                    href={`/category/${sub.slug}`}
                                    className={`subcat-pill ${category.id === sub.id ? "active" : ""}`}
                                >
                                    {sub.name}
                                </Link>
                            ))}
                        </div>
                    )}

                    {/* Product Grid — first page server-rendered (crawlable), rest client-paginated */}
                    <CategoryProductLoader
                        key={slug}
                        slug={slug}
                        initialItems={initialItems}
                        initialCursor={initialCursor}
                        initialTotal={initialTotal}
                        serverError={productsServerError}
                    />
                </div>
            </div>
        </div>
    );
}
