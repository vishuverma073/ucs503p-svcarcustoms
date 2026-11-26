import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { backend } from "@/lib/backend";
import { ProductDetailsFetcher } from "../product-details";

/**
 * Admin draft preview: /product/<slug>/preview?token=<signed token>.
 *
 * The token is minted by the admin API (GET /admin/products/:id/preview-token),
 * is slug-bound and short-lived, and is the only way to read an unpublished
 * product. This route renders per request and is never indexed; the public PDP
 * next door stays static and cached.
 */
export const dynamic = "force-dynamic";

interface PreviewPageProps {
    params: Promise<{ slug: string }>;
    searchParams: Promise<{ token?: string }>;
}

export async function generateMetadata({ params, searchParams }: PreviewPageProps): Promise<Metadata> {
    const { slug } = await params;
    const token = (await searchParams).token;
    const robots = { index: false, follow: false };
    if (!token) return { title: "Preview", robots };
    try {
        const product = await backend.getProductBySlug(slug, { preview: token });
        return { title: `Preview · ${product.name}`, robots };
    } catch {
        return { title: "Preview", robots };
    }
}

export default async function ProductPreviewPage({ params, searchParams }: PreviewPageProps) {
    const { slug } = await params;
    const token = (await searchParams).token;
    if (!token) notFound();
    return <ProductDetailsFetcher slug={slug} preview={token} />;
}
