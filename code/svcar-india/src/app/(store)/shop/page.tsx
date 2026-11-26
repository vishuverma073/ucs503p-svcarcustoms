import type { Metadata } from "next";
import { backend } from "@/lib/backend";
import Breadcrumb from "@/components/store/Breadcrumb";
import SectionHeader from "@/components/store/SectionHeader";
import CategoryProductLoader from "@/components/store/CategoryProductLoader";
import ShopByCarChips from "@/components/store/ShopByCarChips";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbListLd, productItemListLd } from "@/lib/structured-data";

// Same first page as a category: big enough that the whole catalogue's first
// screenful of PDP links is in the server HTML. The public list endpoint caps a
// page at 50; the rest comes through "Load more" exactly as on a category.
const PAGE_SIZE = 48;

// Served from the cache: the list fetch is tagged "products" and purged by the
// admin webhook on every catalogue write; the window is only the self-heal floor.
export const revalidate = 86400;

const title = "All Products — Buy Car Accessories Online | SV Car Customs";
const description =
    "Every body kit, spoiler, exhaust, light and interior upgrade SV Car Customs stocks, on one page. Free delivery on all orders across India, COD available.";

export const metadata: Metadata = {
    title,
    description,
    alternates: { canonical: "/shop" },
    openGraph: { title, description, type: "website", url: "/shop" },
    twitter: { card: "summary_large_image", title, description },
};

/**
 * The page "Shop", "View All" and "Browse all products" land on: every active
 * product on the category grid. One crawlable page that links the whole
 * catalogue, so no PDP depends on a single category page for discovery.
 */
export default async function ShopPage() {
    // Server-fetch the first page so cards + PDP links are in the initial HTML
    // (crawlable with JS off). On failure, hand the loader a fallback flag so it
    // client-fetches instead of showing an empty shop.
    let initialItems: Awaited<ReturnType<typeof backend.listProducts>>["items"] = [];
    let initialCursor: number | null = null;
    let productsServerError = false;
    try {
        const firstPage = await backend.listProducts({ limit: PAGE_SIZE });
        initialItems = firstPage.items;
        initialCursor = firstPage.nextCursor;
    } catch {
        productsServerError = true;
    }

    const breadcrumbItems = [{ label: "Shop" }];

    return (
        <div className="max-w-380 mx-auto px-4 py-8">
            <JsonLd data={breadcrumbListLd([{ label: "Shop", href: "/shop" }])} />
            {initialItems.length > 0 && (
                <JsonLd data={productItemListLd(initialItems.map((p) => ({ slug: p.slug, name: p.name })))} />
            )}
            <Breadcrumb items={breadcrumbItems} className="mb-8" />

            <SectionHeader
                as="h1"
                title="All Products"
                highlight="All"
                subtitle="Everything in the SV Car Customs range — body kits, spoilers, exhausts, lighting and interiors"
            />

            <ShopByCarChips className="mb-2" />

            {/* Product grid — first page server-rendered (crawlable), rest client-paginated */}
            <CategoryProductLoader
                slug={null}
                initialItems={initialItems}
                initialCursor={initialCursor}
                initialTotal={null}
                serverError={productsServerError}
            />
        </div>
    );
}
