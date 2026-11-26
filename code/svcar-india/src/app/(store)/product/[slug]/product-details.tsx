import { notFound } from "next/navigation";
import { backend, isNotFoundError } from "@/lib/backend";
import { USE_MOCKS } from "@/lib/api-config";
import { SHOP_HREF } from "@/lib/shop-nav";
import { carCategoryForFitments } from "@/lib/car-categories";
import type { Product } from "@svcar/contracts";
import ProductPageClient from "@/components/store/ProductPageClient";
import ProductClientLoader from "@/components/store/ProductClientLoader";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbListLd } from "@/lib/structured-data";
import { productJsonLd } from "@/lib/product-jsonld";
import { pickRelated, pickRelatedByCar } from "@/lib/related-products";

const RELATED_COUNT = 4;
/** The public list endpoint caps a page at 50; the largest category is ~30. */
const RELATED_POOL = 48;

/**
 * Product detail body, shared by the public PDP (static, cached) and the admin
 * draft preview (per request). Kept out of page.tsx so the public page carries
 * no searchParams read: reading ?preview there made every PDP render per
 * request in the function region instead of being served from the cache.
 */

export async function ProductDetailsFetcher({ slug, preview }: { slug: string; preview?: string }) {
    let product: Product;
    try {
        product = await backend.getProductBySlug(slug, { preview });
    } catch (err) {
        // Under mocks, admin-created products live only in the browser mock store,
        // not the server (node) one — so re-fetch on the client instead of 404ing.
        // With a real backend this branch never triggers (the product is in the DB).
        if (USE_MOCKS) return <ProductClientLoader slug={slug} />;
        // Only a real 404 is "not found"; an outage/5xx rethrows so ISR keeps
        // serving the last good page instead of caching a 404.
        if (isNotFoundError(err)) notFound();
        throw err;
    }

    const [category, allCategories, settings] = await Promise.all([
        backend.getCategoryById(product.categoryId).catch(() => null),
        backend.getAllCategories().catch(() => []),
        backend.getPublicSettings().catch(() => null),
    ]);
    const shopHref = SHOP_HREF;

    const siblings = category
        ? await backend.getProductsByCategory(category.slug, RELATED_POOL).catch(() => [])
        : [];
    // Small categories can't fill the row on their own; top up from bestsellers.
    const fallback =
        siblings.length > RELATED_COUNT
            ? []
            : ((await backend.listProducts({ bestseller: true, limit: 12 }).catch(() => null))?.items ?? []);
    const relatedProducts = pickRelated(product.id, siblings, fallback, RELATED_COUNT);

    // "More for your <car>": other parts in the car category this product's
    // fitment points at (e.g. a Slavia spoiler → Virtus / Slavia). Server-
    // rendered, so every car category's products get crawlable links from
    // their neighbours' PDPs, not just from the one category page.
    const car = carCategoryForFitments(product.fitments, allCategories);
    const carSiblings =
        car && car.car.slug !== category?.slug
            ? await backend.getProductsByCategory(car.car.slug, RELATED_POOL).catch(() => [])
            : car
              ? siblings
              : [];
    const relatedByCarItems = car ? pickRelatedByCar(product.id, carSiblings, relatedProducts, RELATED_COUNT) : [];
    const relatedByCar =
        car && relatedByCarItems.length > 0
            ? {
                  title: `More for your ${car.fitment.model}`,
                  categoryLabel: car.car.label,
                  href: `/category/${car.car.slug}`,
                  products: relatedByCarItems,
              }
            : undefined;

    const breadcrumbItems = [
        ...(category?.breadcrumb ?? []).map((cat) => ({
            label: cat.name,
            href: `/category/${cat.slug}`,
        })),
        { label: product.name },
    ];

    return (
        <>
            {preview && (
                <div className="bg-brand-orange/10 border-b border-brand-orange/30 px-4 py-2 text-center text-[13px] font-semibold text-brand-orange">
                    Draft preview — status: {product.status}. Not visible to customers until published.
                </div>
            )}
            <JsonLd data={productJsonLd(product, settings)} />
            <JsonLd data={breadcrumbListLd(breadcrumbItems)} />
            <ProductPageClient
                product={product}
                categoryName={category?.name}
                categorySlug={category?.slug}
                breadcrumbItems={breadcrumbItems}
                shopHref={shopHref}
                relatedProducts={relatedProducts}
                relatedByCar={relatedByCar}
            />
        </>
    );
}
