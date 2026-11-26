import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  DUPLICATE_PRODUCT_SLUGS,
  isDuplicateProductSlug,
  primaryProductSlug,
} from "./duplicate-products";

vi.mock("@/lib/backend", () => ({
  backend: {
    getProductBySlug: vi.fn(),
    listProducts: vi.fn(),
    getAllCategories: vi.fn(),
    getProductFeed: vi.fn(),
    getPublicSettings: vi.fn(),
  },
}));
// The page body pulls in the whole PDP client tree; the metadata test only
// needs generateMetadata.
vi.mock("@/app/(store)/product/[slug]/product-details", () => ({
  ProductDetailsFetcher: () => null,
}));

import { backend } from "@/lib/backend";
import { generateMetadata } from "@/app/(store)/product/[slug]/page";
import sitemap from "@/app/sitemap";
import { GET as feed } from "@/app/feed.xml/route";

const DUPLICATE = "polo-q2-aftermarket-stylish-tail-lights-in-red-finish";
const PRIMARY = "volkswagen-polo-audi-q2-style-led-tail-lights";

function listItem(slug: string) {
  return {
    id: slug.length,
    name: slug,
    slug,
    categoryId: 1,
    image: "",
    minPrice: 100,
    maxBasePrice: 100,
    bestDiscount: 0,
    isBestseller: false,
    isNew: false,
    isFeatured: false,
    status: "active" as const,
    tags: [],
    sizes: [],
  };
}

function feedItem(slug: string) {
  return {
    id: slug,
    name: `Polo tail lights ${slug}`,
    slug,
    description: "LED tail lights.",
    images: ["https://cdn.example.com/a.webp"],
    price: 8999,
    availability: "in_stock" as const,
    fitments: [],
  };
}

describe("duplicate-products map", () => {
  it("maps the three known copies to their primary slug", () => {
    expect(primaryProductSlug("remus-single-tip-valvetronic-exhaust-fuat")).toBe(
      "remus-single-tip-valvetronic-exhaust",
    );
    expect(
      primaryProductSlug("sparco-bride-racing-bagpack-for-travelling-and-motorsports"),
    ).toBe("sparco-bride-racing-backpack-travelling-and-racing-bagpack");
    expect(primaryProductSlug(DUPLICATE)).toBe(PRIMARY);
  });

  it("leaves every other slug alone", () => {
    expect(primaryProductSlug(PRIMARY)).toBe(PRIMARY);
    expect(primaryProductSlug("rgb-ambient-light-kit")).toBe("rgb-ambient-light-kit");
    expect(isDuplicateProductSlug(PRIMARY)).toBe(false);
    expect(isDuplicateProductSlug("constructor")).toBe(false);
  });

  it("never chains: a primary is not itself listed as a copy", () => {
    for (const [copy, primary] of Object.entries(DUPLICATE_PRODUCT_SLUGS)) {
      expect(copy).not.toBe(primary);
      expect(isDuplicateProductSlug(primary)).toBe(false);
      expect(copy).toMatch(/^[a-z0-9-]+$/);
      expect(primary).toMatch(/^[a-z0-9-]+$/);
    }
  });
});

describe("product page metadata for a duplicate", () => {
  beforeEach(() => {
    vi.mocked(backend.getProductBySlug).mockReset();
    vi.mocked(backend.getPublicSettings).mockReset().mockResolvedValue(null as never);
  });

  it("points the canonical at the primary and asks for noindex,follow", async () => {
    vi.mocked(backend.getProductBySlug).mockResolvedValue({
      name: "Polo Q2 Tail Lights",
      description: "LED tail lights.",
      fitments: [],
      skus: [{ id: 1, skuCode: "A", price: 12999, dimensionValues: {} }],
    } as never);
    const meta = await generateMetadata({ params: Promise.resolve({ slug: DUPLICATE }) });
    expect(meta.alternates?.canonical).toBe(`/product/${PRIMARY}`);
    expect(meta.robots).toEqual({ index: false, follow: true });
  });

  it("keeps a normal product self-canonical and indexable", async () => {
    vi.mocked(backend.getProductBySlug).mockResolvedValue({
      name: "Polo Q2 Tail Lights",
      description: "LED tail lights.",
      fitments: [],
      skus: [{ id: 1, skuCode: "A", price: 12999, dimensionValues: {} }],
    } as never);
    const meta = await generateMetadata({ params: Promise.resolve({ slug: PRIMARY }) });
    expect(meta.alternates?.canonical).toBe(`/product/${PRIMARY}`);
    expect(meta.robots).toBeUndefined();
    expect(meta.title).toBe("Polo Q2 Tail Lights | SV Car Customs");
    expect(meta.description).toBe(
      "Polo Q2 Tail Lights at ₹12,999. Free delivery across India, COD available. LED tail lights.",
    );
  });
});

describe("sitemap and feed leave duplicates out", () => {
  beforeEach(() => {
    vi.mocked(backend.listProducts).mockReset();
    vi.mocked(backend.getAllCategories).mockReset();
    vi.mocked(backend.getProductFeed).mockReset();
    vi.mocked(backend.getPublicSettings).mockReset();
  });

  it("sitemap lists the primary but not the copy", async () => {
    vi.mocked(backend.listProducts).mockResolvedValue({
      items: [listItem(PRIMARY), listItem(DUPLICATE), listItem("rgb-ambient-light-kit")],
      nextCursor: null,
    } as never);
    vi.mocked(backend.getAllCategories).mockResolvedValue([]);
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls).toContain(`https://www.svcarcustoms.in/product/${PRIMARY}`);
    expect(urls).toContain("https://www.svcarcustoms.in/product/rgb-ambient-light-kit");
    expect(urls).not.toContain(`https://www.svcarcustoms.in/product/${DUPLICATE}`);
  });

  it("feed.xml carries one item for the pair", async () => {
    vi.mocked(backend.getPublicSettings).mockResolvedValue(null as never);
    vi.mocked(backend.getAllCategories).mockResolvedValue([]);
    vi.mocked(backend.getProductFeed).mockResolvedValue({
      items: [feedItem(PRIMARY), feedItem(DUPLICATE)],
      total: 2,
      currency: "INR",
    });
    const body = await (await feed()).text();
    expect(body).toContain(`/product/${PRIMARY}</g:link>`);
    expect(body).not.toContain(`/product/${DUPLICATE}</g:link>`);
    expect(body.match(/<item>/g)).toHaveLength(1);
  });
});
