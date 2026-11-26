"use client";

import Image from "next/image";
import Link from "next/link";
import { getFitmentTerms } from "@/lib/product-fitments";
import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { formatPrice, productImageUrl } from "@/lib/utils";
import { useStoreSettings } from "@/lib/use-store-settings";
import { deliveryAlwaysFree, codAdvanceFor, COD_ADVANCE_PERCENT } from "@/lib/checkout";
import AddToCartButton from "@/components/store/AddToCartButton";
import PdpStickyBar from "@/components/store/PdpStickyBar";
import { useAddToCart } from "@/lib/use-add-to-cart";
import { pdpBarDetail } from "@/lib/sticky-bars";
import PurchaseTerms from "@/components/store/PurchaseTerms";
import ProductCard from "@/components/store/ProductCard";
import ProductCarousel from "@/components/store/ProductCarousel";
import ProductFitment from "@/components/store/ProductFitment";
import SectionHeader from "@/components/store/SectionHeader";
import { Truck, Package, MessageCircle, ChevronRight, ChevronLeft, Home, ArrowRight } from "lucide-react";
import type { Product, ProductListItem } from "@svcar/contracts";
import { getSKUBySelections, getAvailableValues, getMinPrice, getMaxBasePrice, getBestDiscount } from "@/lib/sku-helpers";
import { trackWhatsapp } from "@/lib/track-whatsapp";
import { trackViewContent } from "@/lib/analytics-events";
import { productHeading } from "@/lib/seo-copy";

export interface RelatedByCar {
    /** "More for your Virtus" — from the fitment row that matched, not the category name. */
    title: string;
    /** Chip label of the car category ("Virtus / Slavia"). */
    categoryLabel: string;
    /** The car category page. */
    href: string;
    products: ProductListItem[];
}

interface ProductPageClientProps {
    product: Product;
    categoryName?: string;
    categorySlug?: string;
    breadcrumbItems: { label: string; href?: string }[];
    shopHref?: string;
    relatedProducts: ProductListItem[];
    /** Other parts for the same car (server-picked); omitted when none match. */
    relatedByCar?: RelatedByCar;
}

export default function ProductPageClient({
    product,
    breadcrumbItems,
    shopHref,
    relatedProducts,
    relatedByCar,
}: ProductPageClientProps) {
    // ─── Image Gallery ─────────────────────────────────
    // Guard against a product with zero images (e.g. one created in admin
    // without uploads): next/image throws on an undefined `src`, so fall back
    // to a placeholder rather than crashing the whole PDP.
    const PLACEHOLDER_IMG = "https://placehold.co/600x600/F5F5F4/A8A29E/png?text=No+Image";
    const galleryImages = useMemo<{ url: string; alt?: string }[]>(() => {
        const images = product.images.flatMap((image) => {
            const url = productImageUrl(image.url);
            return url ? [{ url, alt: image.alt?.trim() || undefined }] : [];
        });
        return images.length > 0 ? images : [{ url: PLACEHOLDER_IMG }];
    }, [product.images]);
    const [activeImg, setActiveImg] = useState(0);
    const scrollRef = useRef<HTMLDivElement>(null);
    const totalImages = galleryImages.length;

    const { data: storeSettings } = useStoreSettings();
    // Delivery is free on every order (admin flat fee ₹0). The server HTML and
    // the first client frame say so too: a threshold line appears only once
    // settings have loaded AND the admin has set a fee, never as a fallback.
    const deliveryFreeForAll = !storeSettings || deliveryAlwaysFree(storeSettings);
    const freeDeliveryAbove = storeSettings?.shippingFreeAbove ?? 0;
    // Internal bookkeeping tags (e.g. "dotpe-import") stay in the data, not on the page.
    const visibleTags = product.tags.filter((tag) => !/-import$/i.test(tag));
    const materialSpec = product.specifications?.find((s) => /^material$/i.test(s.name.trim()))?.value ?? null;

    const goToImage = useCallback((idx: number) => {
        const clamped = Math.max(0, Math.min(idx, totalImages - 1));
        setActiveImg(clamped);
        // Scroll mobile carousel to that image
        if (scrollRef.current) {
            const child = scrollRef.current.children[clamped] as HTMLElement;
            if (child) {
                scrollRef.current.scrollTo({ left: child.offsetLeft, behavior: "smooth" });
            }
        }
    }, [totalImages]);

    // Sync active dot when user swipes on mobile
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        let timer: NodeJS.Timeout;
        const onScroll = () => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                const scrollLeft = el.scrollLeft;
                const width = el.clientWidth;
                const idx = Math.round(scrollLeft / width);
                setActiveImg(idx);
            }, 80);
        };
        el.addEventListener("scroll", onScroll, { passive: true });
        return () => el.removeEventListener("scroll", onScroll);
    }, []);

    // GA4/Meta ViewContent — once per product view. No-op until tracking ids set.
    useEffect(() => {
        trackViewContent({ id: String(product.id), name: product.name, price: getMinPrice(product) });
    }, [product.id, product.name, product]);

    // ─── Dimension Selections ──────────────────────────
    const [selections, setSelections] = useState<Record<string, string>>(() => {
        const initial: Record<string, string> = {};
        for (const dim of product.dimensions.sort((a, b) => a.sortOrder - b.sortOrder)) {
            if (dim.values.length > 0) {
                initial[dim.name] = dim.values[0].value;
            }
        }
        return initial;
    });

    const fitmentTerms = useMemo(() => getFitmentTerms(product.fitments), [product.fitments]);
    const currentSKU = useMemo(
        () => getSKUBySelections(product, selections),
        [product, selections]
    );

    const displayPrice = currentSKU
        ? (currentSKU.salePrice ?? currentSKU.price)
        : getMinPrice(product);

    const mrpPrice = currentSKU
        ? currentSKU.price
        : getMaxBasePrice(product);

    const discount = currentSKU
        ? (currentSKU.salePrice !== null && currentSKU.salePrice < currentSKU.price
            ? Math.round(((currentSKU.price - currentSKU.salePrice) / currentSKU.price) * 100)
            : 0)
        : getBestDiscount(product);

    const handleDimensionSelect = (dimName: string, value: string) => {
        setSelections((prev) => ({ ...prev, [dimName]: value }));
    };

    const sortedDimensions = useMemo(
        () => [...product.dimensions].sort((a, b) => a.sortOrder - b.sortOrder),
        [product.dimensions]
    );

    // ─── Add to Cart (one instance for the inline button AND the sticky bar) ──
    // Only a real SKU can be added: a selection with no SKU (or a product with
    // no SKUs) is "unavailable" on both buttons — the product id is not a SKU id.
    const cart = useAddToCart(
        currentSKU
            ? {
                  id: currentSKU.id,
                  name: product.name + (Object.values(selections).length > 0
                      ? ` (${Object.values(selections).join(" / ")})`
                      : ""),
                  slug: product.slug,
                  price: displayPrice,
                  image: galleryImages[0]?.url ?? PLACEHOLDER_IMG,
                  variant: Object.values(selections).join(" / ") || undefined,
                  stock: currentSKU.stock,
              }
            : null,
    );
    const atcRef = useRef<HTMLDivElement>(null);
    const barVariantLabel =
        sortedDimensions
            .filter((dim) => selections[dim.name])
            .map((dim) => `${dim.name}: ${selections[dim.name]}`)
            .join(" · ") || null;

    return (
        <>
            {/* ─── Breadcrumb ────────────────────────────── */}
            <div className="max-w-380 mx-auto px-4 pt-4 pb-2">
                <nav className="flex items-center gap-1.5 d-label !text-[11px] text-text-muted overflow-hidden" aria-label="Breadcrumb">
                    <Link href="/" className="hover:text-text-primary transition-colors" aria-label="Home"><Home size={13} /></Link>
                    {shopHref && (
                        <span className="flex items-center gap-1.5">
                            <ChevronRight size={10} className="opacity-40" />
                            <Link href={shopHref} className="hover:text-text-primary transition-colors">Shop</Link>
                        </span>
                    )}
                    {breadcrumbItems.map((item, i) => (
                        <span key={i} className="flex items-center gap-1.5">
                            <ChevronRight size={10} className="opacity-40" />
                            {i === breadcrumbItems.length - 1 || !item.href ? (
                                <span className="text-text-secondary font-medium truncate max-w-[180px]">{item.label}</span>
                            ) : (
                                <Link href={item.href} className="hover:text-text-primary transition-colors">{item.label}</Link>
                            )}
                        </span>
                    ))}
                </nav>
            </div>

            {/* ─── Product Section ────────────────────────── */}
            <section className="max-w-380 mx-auto px-4 pb-16">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">

                    {/* ─── Gallery Column (7 cols) ───────── */}
                    <div className="lg:col-span-7">

                        {/* ── MOBILE: Horizontal swipe carousel ── */}
                        <div className="lg:hidden d-frame">
                            <div className="pdp-mobile-carousel" ref={scrollRef}>
                                {galleryImages.map((img, i) => (
                                    <div key={i} className="pdp-mobile-slide">
                                        <Image
                                            src={img.url}
                                            alt={img.alt || `${product.name} - Image ${i + 1}`}
                                            fill
                                            className="object-contain p-4"
                                            priority={i === 0}
                                            sizes="100vw"
                                            quality={90}
                                        />
                                    </div>
                                ))}
                            </div>
                            <p className="flex justify-between gap-3 px-1 pt-2 d-label !text-[10px] text-text-muted">
                                <span className="truncate">{product.name}</span>
                                <span className="shrink-0">{activeImg + 1} / {totalImages}</span>
                            </p>
                            {/* Dot indicators */}
                            {totalImages > 1 && (
                                <div className="flex justify-center gap-1.5 mt-2">
                                    {galleryImages.map((_, i) => (
                                        <button
                                            key={i}
                                            onClick={() => goToImage(i)}
                                            className={`pdp-dot ${i === activeImg ? "active" : ""}`}
                                            aria-label={`Go to image ${i + 1}`}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* ── DESKTOP: Vertical thumbs + main image ── */}
                        <div className="hidden lg:flex gap-4 d-frame">
                            {/* Vertical thumbnail strip */}
                            {totalImages > 1 && (
                                <div className="pdp-thumb-col">
                                    {galleryImages.map((img, i) => (
                                        <button
                                            key={i}
                                            onClick={() => setActiveImg(i)}
                                            className={`pdp-thumb-v ${i === activeImg ? "active" : ""}`}
                                            aria-label={`Show image ${i + 1} of ${totalImages}`}
                                            aria-pressed={i === activeImg}
                                        >
                                            <Image
                                                src={img.url}
                                                alt={img.alt || `${product.name} - Image ${i + 1}`}
                                                width={72}
                                                height={72}
                                                className="object-contain p-1.5 w-full h-full"
                                            />
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* Main image */}
                            <div className="pdp-hero-img flex-1 relative">
                                <Image
                                    src={galleryImages[activeImg].url}
                                    alt={galleryImages[activeImg].alt || product.name}
                                    fill
                                    className="object-contain p-6 transition-opacity duration-300"
                                    priority
                                    sizes="58vw"
                                    quality={90}
                                    key={activeImg}
                                />
                                {/* Badges */}
                                {(product.isBestseller || product.isNew) && (
                                    <div className="absolute top-5 left-5 flex gap-1.5 z-10">
                                        {product.isBestseller && <span className="badge badge-bestseller">Bestseller</span>}
                                        {product.isNew && <span className="badge badge-new">New</span>}
                                    </div>
                                )}
                                {discount > 0 && (
                                    <div className="absolute top-5 right-5 z-10">
                                        <span className="pdp-discount-tag">-{discount}%</span>
                                    </div>
                                )}
                                {/* Prev / Next arrows */}
                                {totalImages > 1 && (
                                    <>
                                        <button
                                            onClick={() => goToImage(activeImg - 1)}
                                            disabled={activeImg === 0}
                                            className="pdp-arrow pdp-arrow-prev"
                                            aria-label="Previous image"
                                        >
                                            <ChevronLeft size={18} />
                                        </button>
                                        <button
                                            onClick={() => goToImage(activeImg + 1)}
                                            disabled={activeImg === totalImages - 1}
                                            className="pdp-arrow pdp-arrow-next"
                                            aria-label="Next image"
                                        >
                                            <ChevronRight size={18} />
                                        </button>
                                    </>
                                )}
                                {/* Image counter */}
                                {totalImages > 1 && (
                                    <span className="absolute bottom-4 right-4 d-label !text-[11px] text-zinc-700 bg-white/85 px-2.5 py-1">
                                        {activeImg + 1} / {totalImages}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* ─── Info Column (5 cols) ──────────── */}
                    <div className="lg:col-span-5 flex flex-col">

                        {/* Title */}
                        <h1 className="font-display uppercase text-[28px] md:text-[38px] font-extrabold text-text-primary leading-[1.02] tracking-[0.01em]">
                            {productHeading(product)}
                        </h1>

                        {/* Price */}
                        <div className="mt-4 d-edge flex items-end gap-2.5 flex-wrap">
                            <span className="font-display text-[40px] md:text-[48px] font-extrabold text-text-primary leading-none tracking-[0.01em]">
                                {formatPrice(displayPrice)}
                            </span>
                            {displayPrice < mrpPrice && (
                                <span className="text-[15px] text-text-muted line-through leading-none mb-1">
                                    {formatPrice(mrpPrice)}
                                </span>
                            )}
                            {discount > 0 && (
                                <span className="text-[13px] font-bold text-success leading-none mb-1">
                                    {discount}% off
                                </span>
                            )}
                        </div>
                        <p className="text-[11px] text-text-muted mt-1">Inclusive of all taxes</p>

                        {/* Design D key-facts table — only rows the data has. */}
                        <table className="d-spec mt-5 w-full border border-border text-left text-[13px]">
                            <tbody className="divide-y divide-border">
                                {currentSKU && (
                                    <tr>
                                        <th scope="row" className="w-28 px-3 py-2">SKU</th>
                                        <td className="px-3 py-2 text-text-primary">{currentSKU.skuCode}</td>
                                    </tr>
                                )}
                                {fitmentTerms.length > 0 && (
                                    <tr>
                                        <th scope="row" className="w-28 px-3 py-2">Fits</th>
                                        <td className="px-3 py-2 text-text-primary">{fitmentTerms.join(" · ")}</td>
                                    </tr>
                                )}
                                {materialSpec && (
                                    <tr>
                                        <th scope="row" className="w-28 px-3 py-2">Material</th>
                                        <td className="px-3 py-2 text-text-primary">{materialSpec}</td>
                                    </tr>
                                )}
                                <tr>
                                    <th scope="row" className="w-28 px-3 py-2">Ships in</th>
                                    <td className="px-3 py-2 text-text-primary">2-4 days · Pan India</td>
                                </tr>
                                {displayPrice > 0 && (
                                    <tr>
                                        <th scope="row" className="w-28 px-3 py-2 border-l-[3px] border-l-brand-orange">COD</th>
                                        <td className="px-3 py-2 text-text-primary">
                                            {formatPrice(codAdvanceFor(displayPrice))} now ({COD_ADVANCE_PERCENT}%), rest on delivery
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>

                        <ProductFitment product={product} variantLabel={barVariantLabel} />

                        {/* Variant Dimension Selectors */}
                        {sortedDimensions.map((dim) => {
                            const available = getAvailableValues(product, dim.name, selections);
                            const selectedValue = selections[dim.name];

                            return (
                                <div key={dim.id} className="mt-6">
                                    <p className="text-[13px] font-medium text-text-secondary mb-2.5">
                                        <span className="text-text-muted">{dim.name}:</span>{" "}
                                        <span className="text-text-primary font-semibold">{selectedValue}</span>
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                        {dim.values
                                            .sort((a, b) => a.sortOrder - b.sortOrder)
                                            .map((val) => {
                                                const isAvailable = available.includes(val.value);
                                                const isSelected = selectedValue === val.value;
                                                return (
                                                    <button
                                                        key={val.id}
                                                        onClick={() => handleDimensionSelect(dim.name, val.value)}
                                                        disabled={!isAvailable}
                                                        className={`pdp-variant ${isSelected ? "active" : ""} ${!isAvailable ? "opacity-40 cursor-not-allowed" : ""}`}
                                                    >
                                                        {val.label || val.value}
                                                    </button>
                                                );
                                            })}
                                    </div>
                                </div>
                            );
                        })}

                        {/* Add to Cart */}
                        <div className="mt-6">
                            {/* Observed by the sticky bar: it shows only while this is off screen. */}
                            <div ref={atcRef}>
                                <AddToCartButton cart={cart} />
                            </div>
                            <PurchaseTerms className="mt-4" />
                        </div>

                        {/* Description */}
                        <div className="mt-8">
                            <h3 className="d-label !text-[14px] text-text-primary mb-3">About this product</h3>
                            <p className="text-[14px] leading-relaxed text-text-secondary whitespace-pre-line">
                                {product.description}
                            </p>
                        </div>

                        {/* Specifications */}
                        {((product.specifications && product.specifications.length > 0) || (currentSKU?.attributes && Object.keys(currentSKU.attributes).length > 0)) && (
                            <div className="mt-8">
                                <h3 className="d-label !text-[14px] text-text-primary mb-4">Specifications</h3>
                                <div className="border border-border overflow-hidden bg-white">
                                    <table className="d-spec w-full text-left text-[13px]">
                                        <tbody className="divide-y divide-border">
                                            {/* SKU-specific attributes first (e.g. Bowl Size) */}
                                            {currentSKU?.attributes && Object.entries(currentSKU.attributes).map(([key, value]) => (
                                                <tr key={key} className="bg-brand-orange/5">
                                                    <th className="py-2.5 px-4 font-medium text-brand-orange w-1/3 bg-brand-orange/5">{key}</th>
                                                    <td className="py-2.5 px-4 font-semibold text-text-primary">{value}</td>
                                                </tr>
                                            ))}
                                            {/* General product specifications */}
                                            {product.specifications?.map((spec) => (
                                                <tr key={spec.name}>
                                                    <th className="py-2.5 px-4 font-medium text-text-secondary w-1/3 bg-surface-dim/30">{spec.name}</th>
                                                    <td className="py-2.5 px-4 text-text-primary">{spec.value}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Included Accessories */}
                        {product.includedAccessories && product.includedAccessories.length > 0 && (
                            <div className="mt-8">
                                <h3 className="d-label !text-[14px] text-text-primary mb-3">What&apos;s in the box</h3>
                                <ul className="flex flex-col gap-2">
                                    {product.includedAccessories.map((item, i) => (
                                        <li key={i} className="flex items-start gap-2.5 text-[13px] text-text-secondary">
                                            <div className="mt-[6px] w-1.5 h-1.5 rounded-full bg-brand-orange shrink-0" />
                                            {item}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Feature tags — inline, subtle */}
                        {visibleTags.length > 0 && (
                            <div className="mt-5 flex flex-wrap gap-1.5">
                                {visibleTags.map((tag) => (
                                    <span key={tag} className="pdp-tag">
                                        {tag.replace(/([A-Z])/g, ' $1').trim()}
                                    </span>
                                ))}
                            </div>
                        )}

                        {/* Promises bar */}
                        <div className="mt-8 pt-6 border-t border-border">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="flex items-center gap-2.5">
                                    <Truck size={16} className="text-text-muted shrink-0" strokeWidth={1.5} />
                                    <span className="text-[12px] text-text-secondary leading-tight">
                                        Free delivery
                                        <br />
                                        <span className="text-text-muted">
                                            {deliveryFreeForAll
                                                ? "On all orders"
                                                : `Orders ${formatPrice(freeDeliveryAbove)}+`}
                                        </span>
                                    </span>
                                </div>
                                <div className="flex items-center gap-2.5">
                                    <Package size={16} className="text-text-muted shrink-0" strokeWidth={1.5} />
                                    <span className="text-[12px] text-text-secondary leading-tight">Ships in 2-4 days<br /><span className="text-text-muted">Pan India</span></span>
                                </div>
                            </div>
                        </div>

                        {/* WhatsApp CTA */}
                        <Link
                            href="https://wa.me/919205005425"
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => trackWhatsapp("product", { productId: product.id, productName: product.name })}
                            className="mt-4 flex items-center gap-2 text-[13px] text-whatsapp font-medium hover:underline transition-colors"
                        >
                            <MessageCircle size={15} strokeWidth={1.8} />
                            Need help? Chat with us on WhatsApp
                        </Link>
                    </div>
                </div>
            </section>

            {/* ─── Related by car ────────────────────────── */}
            {relatedByCar && relatedByCar.products.length > 0 && (
                <section className="max-w-380 mx-auto px-4 py-12 border-t border-border-light">
                    <SectionHeader
                        title={relatedByCar.title}
                        subtitle={`More ${relatedByCar.categoryLabel} parts from our collection`}
                        viewAllHref={relatedByCar.href}
                        viewAllLabel={`All ${relatedByCar.categoryLabel} parts`}
                    />
                    {/* Plain grid, not the carousel: a small server-rendered row whose
                        links are in the HTML once (no duplicated slides). */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                        {relatedByCar.products.map((p) => (
                            <ProductCard
                                key={p.id}
                                slug={p.slug}
                                name={p.name}
                                image={p.image}
                                minPrice={p.minPrice}
                                maxBasePrice={p.maxBasePrice}
                                discount={p.bestDiscount}
                                isBestseller={p.isBestseller}
                                isNew={p.isNew}
                                skuCount={p.skuCount}
                                fitments={p.fitments}
                                imageSizes="(max-width: 1023px) calc(50vw - 24px), (min-width: 1520px) 360px, 25vw"
                            />
                        ))}
                    </div>
                    <Link
                        href={relatedByCar.href}
                        className="md:hidden flex items-center justify-center gap-1.5 text-sm font-semibold text-brand-orange hover:text-brand-orange-dark transition-colors mt-6"
                    >
                        All {relatedByCar.categoryLabel} parts <ArrowRight size={16} />
                    </Link>
                </section>
            )}

            {/* ─── Related ───────────────────────────────── */}
            {relatedProducts.length > 0 && (
                <section className="max-w-380 mx-auto px-4 py-12 border-t border-border-light">
                    <SectionHeader title="You May Also Like" highlight="Also" subtitle="Similar products from our collection" />
                    <ProductCarousel products={relatedProducts} columns={4} />
                </section>
            )}

            {/* ─── Phone/tablet sticky buy bar (< 1024px) ── */}
            <PdpStickyBar
                cart={cart}
                price={displayPrice}
                mrp={mrpPrice}
                detail={pdpBarDetail({ view: cart.view, price: displayPrice, variantLabel: barVariantLabel })}
                targetRef={atcRef}
            />
        </>
    );
}
