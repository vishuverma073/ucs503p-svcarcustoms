import Image from "next/image";
import Link from "next/link";
import { Package } from "lucide-react";
import { formatPrice, productImageUrl } from "@/lib/utils";
import { listPrice } from "@/lib/list-price";
import { PRODUCT_GRID_IMAGE_SIZES } from "./product-grid";
import type { Fitment } from "@svcar/contracts";

/** "Virtus · Slavia": the distinct models the product is listed as fitting (max 2, then "+N"). */
export function fitsLabel(fitments: Fitment[] | undefined): string | null {
    const models = [...new Set((fitments ?? []).map((f) => f.model?.trim()).filter(Boolean))] as string[];
    if (models.length === 0) return null;
    const shown = models.slice(0, 2).join(" · ");
    return models.length > 2 ? `${shown} +${models.length - 2}` : shown;
}

interface ProductCardProps {
    slug: string;
    name: string;
    image: string;
    minPrice: number; // lowest selling price across SKUs
    maxBasePrice: number; // highest MRP across SKUs
    discount: number; // best discount %
    isBestseller: boolean;
    isNew: boolean;
    /** SKU count when the endpoint sends it (the public list does not). */
    skuCount?: number;
    /** `sizes` for the image; defaults to the listing grid's columns. */
    imageSizes?: string;
    /** Load the image eagerly (cards in the first screen of a grid). */
    eager?: boolean;
    /** Fitment rows when the list sends them — drives the small "Fits …" label. */
    fitments?: Fitment[];
}

/**
 * One product in a grid or carousel. The whole card is the link; it is built to
 * read at ~160 px wide (two columns on a 360 px phone): square image, a name
 * clamped to two lines (full name in `title` and in the link text), the price on
 * its own line and MRP / discount on the next.
 */
export default function ProductCard({
    slug,
    name,
    image,
    minPrice,
    maxBasePrice,
    discount,
    isBestseller,
    isNew,
    skuCount,
    imageSizes = PRODUCT_GRID_IMAGE_SIZES,
    eager = false,
    fitments,
}: ProductCardProps) {
    const fits = fitsLabel(fitments);
    const imageUrl = productImageUrl(image);
    const price = listPrice({ minPrice, maxBasePrice, discount, skuCount });
    // One badge at most, so it never stacks over the photo.
    const badge = isBestseller
        ? { label: "Bestseller", className: "badge-bestseller" }
        : isNew
            ? { label: "New", className: "badge-new" }
            : null;

    return (
        // `relative` keeps the visually-hidden "MRP" label positioned inside the
        // card; without it that absolute span escapes the carousels' scroll
        // tracks and widens the page on phones.
        <Link href={`/product/${slug}`} className="card group relative flex h-full flex-col">
            {/* Square image well. The soft near-white (#f4f4f5, both themes)
                matches the product photos' studio background; multiply-blending
                the photo onto it makes a white photo background take the well's
                tone, so the photo does not sit as a white box inside a grey one.
                Set via inline style so it always applies (an arbitrary Tailwind
                bg class can miss a dev rebuild). */}
            <div
                className="relative aspect-square overflow-hidden"
                style={{ backgroundColor: "#f4f4f5" }}
            >
                {imageUrl ? (
                    <Image
                        src={imageUrl}
                        alt={name}
                        fill
                        loading={eager ? "eager" : undefined}
                        className="object-contain p-2.5 sm:p-4 lg:p-5 mix-blend-multiply transition-transform duration-500 ease-out group-hover:scale-108"
                        sizes={imageSizes}
                    />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <Package size={40} className="text-text-muted" aria-hidden />
                    </div>
                )}

                {badge && (
                    <span
                        className={`${badge.className} absolute top-0 left-0 inline-flex items-center px-2 py-0.5 font-display text-[11px] font-bold uppercase leading-4 tracking-[0.12em]`}
                    >
                        {badge.label}
                    </span>
                )}
            </div>

            {/* Info */}
            <div className="flex flex-1 flex-col px-3 py-2.5 sm:p-4">
                {fits && (
                    <p className="d-label !text-[10px] text-text-muted truncate mb-0.5">Fits {fits}</p>
                )}
                <h3
                    title={name}
                    className="text-sm font-semibold text-text-primary line-clamp-2 min-h-10 leading-5 break-words"
                >
                    {name}
                </h3>

                <div className="mt-auto pt-1.5" data-price>
                    <p className="flex flex-wrap items-baseline gap-x-1 text-text-primary">
                        {price.isFrom && (
                            <span className="text-xs font-semibold text-text-secondary">From</span>
                        )}
                        <span className="whitespace-nowrap font-display text-xl sm:text-2xl leading-6 sm:leading-7 font-extrabold tracking-[0.01em]">
                            {formatPrice(price.price)}
                        </span>
                    </p>
                    {/* Always rendered (fixed height) so prices line up across a row. */}
                    <p className="flex min-h-5 flex-wrap items-baseline gap-x-1.5 text-xs leading-5">
                        {price.mrp !== null && (
                            <s className="whitespace-nowrap text-text-secondary [.dark_&]:text-text-muted">
                                <span className="sr-only">MRP </span>
                                {formatPrice(price.mrp)}
                            </s>
                        )}
                        {price.discountLabel && (
                            <span className="whitespace-nowrap font-bold text-green-700 [.dark_&]:text-success">
                                {price.discountLabel}
                            </span>
                        )}
                    </p>
                </div>
            </div>
        </Link>
    );
}
