import type { Metadata } from "next";
import { backend } from "@/lib/backend";
import { deliveryAlwaysFree } from "@/lib/checkout";
import { productSeoDescription, productSeoTitle } from "@/lib/seo-copy";
import { isDuplicateProductSlug, primaryProductSlug } from "@/lib/duplicate-products";
import { ProductDetailsFetcher } from "./product-details";

// Served from the cache, not rendered per request. Every fetch on this page is
// tagged (products · product-<slug> · categories · settings) and the admin API
// posts those tags to /api/revalidate after each write, so an edit is live on
// the next request. 600s is only the self-heal floor if that webhook is down.
//
// generateStaticParams returning [] means "render each product on its first
// visit, then cache it" — no build-time fetch of the whole catalogue.
export const revalidate = 86400;

export async function generateStaticParams(): Promise<{ slug: string }[]> {
    return [];
}

interface ProductPageProps {
    params: Promise<{ slug: string }>;
}

/** Per-product SEO metadata (title, description, canonical, OG). */
export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
    const { slug } = await params;
    try {
        const [product, settings] = await Promise.all([
            backend.getProductBySlug(slug),
            backend.getPublicSettings().catch(() => null),
        ]);
        const prices = product.skus.map((sku) => Number(sku.salePrice ?? sku.price)).filter((n) => n > 0);
        // Same rule as the on-page delivery copy: free unless the admin set a fee.
        const terms = { freeDelivery: !settings || deliveryAlwaysFree(settings) };
        const title = productSeoTitle(product);
        const description = productSeoDescription(
            { ...product, price: prices.length > 0 ? Math.min(...prices) : null },
            terms,
        );
        // A known copy of another listing points its canonical at the primary
        // and asks not to be indexed itself (see lib/duplicate-products.ts).
        const duplicate = isDuplicateProductSlug(slug);
        return {
            title,
            description,
            alternates: { canonical: `/product/${primaryProductSlug(slug)}` },
            ...(duplicate ? { robots: { index: false, follow: true } } : {}),
            // OG image is supplied by the colocated opengraph-image route.
            openGraph: { title, description, type: "website" },
        };
    } catch {
        // Never inherit the root layout's canonical "/" on a fetch failure.
        return { title: "Product — SV Car Customs", alternates: { canonical: `/product/${primaryProductSlug(slug)}` } };
    }
}

export default async function ProductPage({ params }: ProductPageProps) {
    const { slug } = await params;

    // Rendered inline rather than behind <Suspense>. Streaming a fallback means
    // React ships the real markup in a hidden <div> and swaps it in with an
    // inline $RC() script — so with JavaScript off (and for any crawler that
    // doesn't run it) the page is a skeleton forever. The PDP is the page that
    // most needs to be readable as plain HTML, so it waits for its data.
    //
    // Admin draft previews live at ./preview (per request, noindex) so that
    // reading ?preview here doesn't force every public PDP to render per request.
    return <ProductDetailsFetcher slug={slug} />;
}
