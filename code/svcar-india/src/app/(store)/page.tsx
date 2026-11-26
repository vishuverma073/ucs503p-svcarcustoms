import type { Metadata } from "next";
import Link from "next/link";
import { SITE_URL } from "@/lib/site";
import { localBusinessLd } from "@/lib/structured-data";
import { getSafeImageSrc } from "@/lib/utils";
import { deliveryAlwaysFree } from "@/lib/checkout";
import { backend, type HomeBanner, type HomeSectionKey } from "@/lib/backend";
import { resolveCtaHref } from "@/lib/category-shortcuts";
import { resolveHeroImage } from "@/lib/hero-image";
import { SHOP_HREF } from "@/lib/shop-nav";
import SectionHeader from "@/components/store/SectionHeader";
import CategoryCarousel from "@/components/store/CategoryCarousel";
import SafeBannerImage from "@/components/store/SafeBannerImage";
import ProductCarousel from "@/components/store/ProductCarousel";
import ShopByCarChips from "@/components/store/ShopByCarChips";
import HeroCarousel from "@/components/store/HeroCarousel";
import InstagramSection from "@/components/store/InstagramSection";
import CustomerReviews from "@/components/store/CustomerReviews";
import DiwaliSaleBanner from "@/components/store/DiwaliSaleBanner";
import { isDiwaliSaleLive } from "@/lib/diwali-sale";
import { ArrowRight } from "lucide-react";

// The home page is served from the Next data cache, not re-rendered per
// request. Every fetch it makes is tagged ISR (categories / products / home /
// settings), and the admin API busts those tags on write, so admin edits are
// live in seconds without paying a full API round-trip on every visit.
//
// `revalidate` also gives the build a self-heal floor: with mocks the API isn't
// reachable in the build worker, so the first real request re-renders instead of
// pinning a broken shell.
export const revalidate = 3600;

// The root layout sets no canonical (see layout.tsx); the home page owns "/".
export const metadata: Metadata = { alternates: { canonical: "/" } };

// ─── Defaults ────────────────────────────────────────────────────────
// Used when the admin hasn't composed the home page yet (empty config) or a
// banner field is left blank — so the storefront always looks complete.
const DEFAULT_ORDER: HomeSectionKey[] = ["hero", "categories", "bestsellers", "promo", "new"];

const DEFAULT_HERO: HomeBanner = {
    image: "https://placehold.co/1600x900/0C0C0D/E11D2A/png?text=SV+Car+Customs",
    title: "Style. Performance. Quality.",
    subtitle:
        "Body Kits, Lighting, Audio & Custom Interiors. Built for Indian Roads & Enthusiasts.",
    ctaText: "Shop All Products",
    ctaLink: SHOP_HREF,
};

const DEFAULT_PROMO: HomeBanner = {
    image: "https://placehold.co/1600x600/0C0C0D/E11D2A/png?text=SV+Car+Customs",
    title: "Premium Quality, Honest Prices",
    // No percentage here: the admin headline above it carries the sale figure,
    // and a second number would contradict it.
    subtitle: "Discounts across body kits, exhausts, lighting & more.",
    ctaText: "Browse All Products",
    ctaLink: SHOP_HREF,
};

/** Fill blank admin fields with defaults so a half-filled banner still renders. */
function withDefaults(b: HomeBanner, d: HomeBanner): HomeBanner {
    return {
        image: getSafeImageSrc(b.image) ?? d.image,
        title: b.title || d.title,
        subtitle: b.subtitle || d.subtitle,
        ctaText: b.ctaText || d.ctaText,
        // A blank or bare-/search admin link goes to the shop, never to an empty page.
        ctaLink: resolveCtaHref(b.ctaLink, d.ctaLink),
    };
}

/** Bestsellers, shared by the hero (image fallback) and its own section. Same
 *  tagged request, so Next memoises it within one render. */
function fetchBestsellers() {
    return backend.listProducts({ bestseller: true, limit: 12 }).catch(() => null);
}

// ─── Section components ──────────────────────────────────────────────

async function CategoriesSection({ categoryIds }: { categoryIds?: number[] }) {
    // A catalog read failure should degrade to "no section", never crash the
    // whole home page (a thrown error here bubbles up to the error boundary).
    let categories = await backend.getCategories().catch(() => []);
    // If the admin curated a specific set, show those in their chosen order;
    // otherwise show every category (already alphabetical from getCategories).
    if (categoryIds && categoryIds.length > 0) {
        const rank = new Map(categoryIds.map((id, i) => [id, i]));
        categories = categories
            .filter((c) => rank.has(c.id))
            .sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
    }
    if (categories.length === 0) return null;

    return (
        <section id="shop-categories" className="max-w-380 mx-auto px-4 pt-12 pb-16 md:pt-14 scroll-mt-24">
            <SectionHeader
                title="Shop by Category"
                highlight="Category"
                subtitle="Find exactly what you need for your car"
            />

            <CategoryCarousel categories={categories} columns={4} />
        </section>
    );
}

async function BestsellersSection() {
    // Fetch a wider set so the desktop carousel has items to loop through.
    // A failed read degrades to an empty (hidden) section rather than crashing the page.
    const page = await fetchBestsellers();
    const viewAllHref = SHOP_HREF;
    const bestsellers = page?.items ?? [];
    if (bestsellers.length === 0) return null;

    return (
        <section className="max-w-380 mx-auto px-4 py-10">
            <SectionHeader
                title="Our Bestsellers"
                highlight="Bestsellers"
                subtitle="Most loved by our customers"
                viewAllHref={viewAllHref}
                viewAllLabel="All parts"
            />
            <ProductCarousel products={bestsellers} columns={4} />
        </section>
    );
}

async function NewArrivalsSection() {
    // Fetch a wider set so the desktop carousel has items to loop through.
    const page = await backend.listProducts({ new: true, limit: 12 }).catch(() => null);
    const newArrivals = page?.items ?? [];
    if (newArrivals.length === 0) return null;

    return (
        <section className="max-w-380 mx-auto px-4 py-10">
            <SectionHeader
                title="New Arrivals"
                highlight="New"
                subtitle="Latest additions to our collection"
                viewAllHref={SHOP_HREF}
                viewAllLabel="All parts"
            />
            <ProductCarousel products={newArrivals} columns={4} />
        </section>
    );
}

async function FeaturedSection({ productIds }: { productIds: number[] }) {
    if (productIds.length === 0) return null;
    // No public by-IDs endpoint, so pull the catalog and pick the chosen ones,
    // preserving the admin's order.
    const page = await backend.listProducts({ limit: 50 }).catch(() => null);
    const items = page?.items ?? [];
    const rank = new Map(productIds.map((id, i) => [id, i]));
    const featured = items
        .filter((p) => rank.has(p.id))
        .sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
    if (featured.length === 0) return null;

    return (
        <section className="max-w-380 mx-auto px-4 py-10">
            <SectionHeader title="Featured Products" highlight="Featured" subtitle="Hand-picked by our team" viewAllHref={SHOP_HREF} viewAllLabel="All parts" />
            <ProductCarousel products={featured} columns={4} />
        </section>
    );
}

function PromoSection({ promo }: { promo: HomeBanner }) {
    const p = withDefaults(promo, DEFAULT_PROMO);
    return (
        <section className="max-w-380 mx-auto px-4 py-10 animate-fade-in" style={{ animationDelay: "200ms", opacity: 0 }}>
            <div className="relative rounded-none border border-border overflow-hidden h-52 md:h-72 bg-brand-black">
                <SafeBannerImage
                    src={p.image}
                    fallbackSrc={DEFAULT_PROMO.image}
                    alt={p.title}
                    className="object-cover opacity-25"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-brand-black/90 via-brand-black/60 to-transparent" />
                <div className="absolute inset-0 flex flex-col justify-center p-8 md:p-14">
                    <div className="max-w-lg">
                        <h2 className="font-display uppercase text-white text-3xl md:text-5xl font-extrabold mb-3 leading-none tracking-[0.01em]">
                            {p.title}
                        </h2>
                        <p className="text-white/75 text-sm md:text-base mb-6 leading-relaxed">{p.subtitle}</p>
                        <Link href={p.ctaLink || "/"} className="btn btn-primary">
                            {p.ctaText}
                            <ArrowRight size={16} />
                        </Link>
                    </div>
                </div>
            </div>
        </section>
    );
}

// ─── Page ────────────────────────────────────────────────────────────

export default async function HomePage() {
    // Admin-composed layout (order + enabled + banner content). Falls back to the
    // default layout if the admin hasn't configured it yet or the API is down.
    const [home, storeSettings, bestsellerPage] = await Promise.all([
        backend.getHome().catch(() => null),
        backend.getPublicSettings().catch(() => null),
        fetchBestsellers(),
    ]);
    const order = home && home.order.length > 0 ? home.order : DEFAULT_ORDER;
    // Delivery is free on every order. Only an admin-set fee (settings loaded,
    // flat fee > 0) removes the line — there is no "above ₹X" fallback copy.
    const deliveryLine =
        storeSettings && !deliveryAlwaysFree(storeSettings) ? "" : " Free delivery on all orders.";
    const adminHero = home?.hero ?? DEFAULT_HERO;
    // A placeholder / stock hero image is swapped for a real catalogue photo
    // (bestseller) so the first screen's only image is resized by Supabase.
    const hero: HomeBanner = {
        ...adminHero,
        image: resolveHeroImage(
            adminHero.image,
            (bestsellerPage?.items ?? []).map((p) => p.image),
            DEFAULT_HERO.image,
        ),
        ctaLink: resolveCtaHref(adminHero.ctaLink, SHOP_HREF),
    };
    // The data-plate price strip names the pictured product — only when the
    // hero photo really is that bestseller's photo.
    const heroProduct = (bestsellerPage?.items ?? []).find((p) => getSafeImageSrc(p.image) === hero.image);
    const heroFeature = heroProduct
        ? {
              slug: heroProduct.slug,
              name: heroProduct.name,
              minPrice: heroProduct.minPrice,
              maxBasePrice: heroProduct.maxBasePrice,
              discount: heroProduct.bestDiscount,
              skuCount: heroProduct.skuCount,
          }
        : null;
    const promo =
        home?.promo ??
        ({
            ...DEFAULT_PROMO,
            subtitle: `${DEFAULT_PROMO.subtitle}${deliveryLine}`,
        } satisfies HomeBanner);
    const featuredIds = home?.featured ?? [];
    const categoryIds = home?.categories ?? [];
    // Diwali sale: the sale banner replaces the hero until the codes expire
    // (checked at render; ISR re-renders within 10 minutes of the cut-off).
    const diwaliSale = isDiwaliSaleLive();

    // Business + WebSite structured data: helps search engines show the brand
    // knowledge panel and a sitelinks search box. Product-level JSON-LD lives on
    // the PDP. Nodes inside an @graph inherit the graph's @context, and the @id
    // is what the WebSite node's `publisher` points at.
    const businessNode = localBusinessLd();
    delete businessNode["@context"];
    businessNode["@id"] = `${SITE_URL}/#organization`;

    const jsonLd = {
        "@context": "https://schema.org",
        "@graph": [
            // AutoPartsStore is a LocalBusiness subtype, so this one node covers
            // both the brand knowledge panel and local "car accessories in Delhi"
            // results. Values come from brand.config.ts.
            businessNode,
            {
                "@type": "WebSite",
                "@id": `${SITE_URL}/#website`,
                url: SITE_URL,
                name: "SV Car Customs",
                publisher: { "@id": `${SITE_URL}/#organization` },
                potentialAction: {
                    "@type": "SearchAction",
                    target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/search?q={search_term_string}` },
                    "query-input": "required name=search_term_string",
                },
            },
        ],
    };

    return (
        <div>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
            {diwaliSale && <DiwaliSaleBanner shopHref={SHOP_HREF} />}
            {order.map((key) => {
                switch (key) {
                    case "hero":
                        return (
                            <div key="hero">
                                {!diwaliSale && <HeroCarousel
                                        hero={hero}
                                        shopHref={SHOP_HREF}
                                        feature={heroFeature}
                                        freeDelivery={deliveryLine !== ""}
                                    />}
                                <ShopByCarChips variant="bar" />
                            </div>
                        );
                    case "categories":
                        return (
                            <CategoriesSection key="categories" categoryIds={categoryIds} />
                        );
                    case "bestsellers":
                        return (
                            <BestsellersSection key="bestsellers" />
                        );
                    case "new":
                        return (
                            <NewArrivalsSection key="new" />
                        );
                    case "featured":
                        return (
                            <FeaturedSection key="featured" productIds={featuredIds} />
                        );
                    case "promo":
                        return <PromoSection key="promo" promo={promo} />;
                    default:
                        return null;
                }
            })}
            <CustomerReviews />
            <InstagramSection />
        </div>
    );
}
