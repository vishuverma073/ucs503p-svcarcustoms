import { describe, expect, it, vi } from "vitest";
import { buildMerchantFeed, feedTitle, googleCategoryFor, type FeedItemInput } from "./merchant-feed";

function item(over: Partial<FeedItemInput> = {}): FeedItemInput {
  return {
    id: "1788",
    slug: "virtus-slavia-4-fin-rear-diffuser",
    name: "Virtus/ Slavia 4 fin rear diffuser",
    description: "A four-fin rear diffuser & more <b>gloss</b> black.",
    images: ["https://cdn.example/a.webp", "https://cdn.example/b.webp"],
    price: 4399,
    listPrice: 6999,
    categoryId: 70,
    availability: "in_stock",
    fitments: ["Volkswagen Virtus", "Skoda Slavia"],
    ...over,
  };
}

const categories = [{ id: 70, name: "VIRTUS / SLAVIA", slug: "virtus-slavia", parentId: null }];
const free = { shippingFlatFee: 0, shippingFreeAbove: 5000 };

/**
 * Well-formedness without an XML dependency: every tag opens and closes in
 * order, and no raw "&" or "<" survives in text.
 */
function assertWellFormed(xml: string) {
  const body = xml.replace(/^<\?xml[^>]*\?>\s*/, "");
  const stack: string[] = [];
  for (const m of body.matchAll(/<(\/?)([A-Za-z_][\w:.-]*)([^>]*?)(\/?)>/g)) {
    const [, close, name, , selfClose] = m;
    if (selfClose) continue;
    if (close) expect(stack.pop()).toBe(name);
    else stack.push(name);
  }
  expect(stack).toEqual([]);
  const text = body.replace(/<[^>]+>/g, "");
  expect(text).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;)/);
  expect(text).not.toMatch(/</);
}

function field(xml: string, tag: string): string[] {
  return [...xml.matchAll(new RegExp(`<g:${tag}>([^<]*)</g:${tag}>`, "g"))].map((m) => m[1]);
}

describe("buildMerchantFeed", () => {
  it("emits every required attribute in Merchant Center's format", () => {
    const { xml, included } = buildMerchantFeed({ items: [item()], currency: "INR", settings: free, categories });
    assertWellFormed(xml);
    expect(included).toEqual(["1788"]);
    expect(xml).toContain('<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">');
    expect(field(xml, "id")).toEqual(["1788"]);
    expect(field(xml, "title")).toEqual(["Virtus / Slavia 4 Fin Rear Diffuser"]);
    expect(field(xml, "link")).toEqual(["https://www.svcarcustoms.in/product/virtus-slavia-4-fin-rear-diffuser"]);
    expect(field(xml, "image_link")).toEqual(["https://cdn.example/a.webp"]);
    expect(field(xml, "additional_image_link")).toEqual(["https://cdn.example/b.webp"]);
    expect(field(xml, "availability")).toEqual(["in_stock"]);
    expect(field(xml, "price")).toEqual(["6999.00 INR", "0.00 INR"]); // item price, shipping price
    expect(field(xml, "sale_price")).toEqual(["4399.00 INR"]);
    expect(field(xml, "condition")).toEqual(["new"]);
    expect(field(xml, "identifier_exists")).toEqual(["no"]);
    expect(field(xml, "brand")).toEqual([]);
    expect(field(xml, "google_product_category")).toEqual(["8227"]);
    expect(field(xml, "product_type")).toEqual(["Car Accessories &gt; Virtus / Slavia"]);
    expect(field(xml, "country")).toEqual(["IN"]);
    expect(field(xml, "min_handling_time")).toEqual(["1"]);
    expect(field(xml, "max_handling_time")).toEqual(["2"]);
    // Description is plain, escaped text.
    expect(field(xml, "description")).toEqual(["A four-fin rear diffuser &amp; more gloss black."]);
  });

  it("sends a single price when nothing is on sale, and works with the older API shape", () => {
    const { xml } = buildMerchantFeed({
      items: [item({ listPrice: undefined, categoryId: undefined })],
      currency: "INR",
      settings: null,
    });
    assertWellFormed(xml);
    expect(field(xml, "price")[0]).toBe("4399.00 INR");
    expect(field(xml, "sale_price")).toEqual([]);
    expect(field(xml, "product_type")).toEqual([]);
    // Settings unreadable → free, matching the on-page copy.
    expect(field(xml, "price")[1]).toBe("0.00 INR");
  });

  it("charges the admin's flat fee below the free-delivery threshold", () => {
    const { xml } = buildMerchantFeed({
      items: [item()],
      currency: "INR",
      settings: { shippingFlatFee: 150, shippingFreeAbove: 5000 },
    });
    expect(field(xml, "price")[1]).toBe("150.00 INR");
  });

  it("escapes names and strips characters XML forbids", () => {
    const { xml } = buildMerchantFeed({
      items: [item({ name: `Tip <18mm "R" & 'S'\u0007`, fitments: [] })],
      currency: "INR",
      settings: free,
    });
    assertWellFormed(xml);
    expect(field(xml, "title")[0]).toBe("Tip &lt;18mm &quot;R&quot; &amp; &apos;S&apos;");
  });

  it("leaves out counterfeit-risk titles, duplicates and imageless items, saying why", () => {
    const { included, excluded } = buildMerchantFeed({
      items: [
        item({ id: "a", name: "Akrapovic Exhaust Tip | Blue Forged Carbon Dual Tip" }),
        item({ id: "b", name: "Polo glossy black replacement logos" }),
        item({ id: "c", name: "Virtus/slavia oem gt spoiler" }),
        item({ id: "d", slug: "polo-q2-aftermarket-stylish-tail-lights-in-red-finish" }),
        item({ id: "e", images: [] }),
        item({ id: "f", name: "Forged carbon fibre dual exhaust tip 1 pcs" }),
      ],
      currency: "INR",
      settings: free,
    });
    expect(included).toEqual(["f"]);
    expect(Object.fromEntries(excluded.map((e) => [e.id, e.reason]))).toEqual({
      a: "names the Akrapovic brand (not confirmed genuine)",
      b: "reproduces a carmaker's logo/badge",
      c: "claims to be OEM/original",
      d: "duplicate listing of another product",
      e: "no image",
    });
  });

  it("lists the store's own product under its brand", () => {
    const { xml } = buildMerchantFeed({
      items: [item({ name: "Svcarcustoms Virtus / Slavia Aftermarket dedicated Aero kit . ( Splitter and diffuser kit)" })],
      currency: "INR",
      settings: free,
    });
    expect(field(xml, "brand")).toEqual(["SV Car Customs"]);
    expect(field(xml, "title")[0]).toBe("Virtus / Slavia Aftermarket Dedicated Aero Kit (Splitter &amp; Diffuser Kit)");
  });
});

describe("feedTitle", () => {
  it("keeps the variant sub-title and adds unmentioned cars", () => {
    expect(feedTitle("Remus Valvetronic Exhaust | Dual Tip (Carbon)", [])).toBe("Remus Valvetronic Exhaust – Dual Tip (Carbon)");
    expect(feedTitle("Skoda metal paddle shifters", ["Skoda Octavia", "Skoda Kodiaq"])).toBe(
      "Skoda Metal Paddle Shifters for Skoda Octavia & Skoda Kodiaq",
    );
  });

  it("marks a BMW model-code shape as a style, not a BMW part", () => {
    expect(feedTitle("Virtus m4 spoiler Abs", ["Volkswagen Virtus"])).toBe("Virtus M4-Style Spoiler ABS");
  });

  it("stays within 150 characters without cutting a car name", () => {
    const t = feedTitle("Maruti copy carbon fibre steering wheel | Aftermarket steering", [
      "Maruti Suzuki Swift",
      "Maruti Suzuki Fronx",
      "Maruti Suzuki Baleno",
      "Maruti Suzuki Brezza",
      "Maruti Suzuki Ertiga",
    ]);
    expect(t.length).toBeLessThanOrEqual(150);
    expect(t).toMatch(/Maruti Suzuki \w+$/);
  });
});

describe("googleCategoryFor", () => {
  it("maps names to the most specific taxonomy id", () => {
    expect(googleCategoryFor("Remus single tip Valvetronic exhaust")).toBe(908);
    expect(googleCategoryFor("Polo copy carbon fibre steering wheel")).toBe(8235);
    expect(googleCategoryFor("Carbon fibre steering wheel cover with alcantara")).toBe(8233);
    expect(googleCategoryFor("Thar / Thar roxx tail lamps")).toBe(3318);
    expect(googleCategoryFor("Universal Valvetronic Control Module | Aftermarket Vacuum Pump Kit")).toBe(908);
    expect(googleCategoryFor("Something else")).toBe(5613);
  });
});

describe("GET /feed.xml", () => {
  it("answers 503 (retry) rather than an empty feed when the API is down", async () => {
    vi.resetModules();
    vi.doMock("@/lib/backend", () => ({
      backend: {
        getPublicSettings: vi.fn().mockResolvedValue(null),
        getAllCategories: vi.fn().mockResolvedValue([]),
        getProductFeed: vi.fn().mockRejectedValue(new Error("down")),
      },
    }));
    const { GET } = await import("@/app/feed.xml/route");
    const res = await GET();
    expect(res.status).toBe(503);
    vi.doUnmock("@/lib/backend");
  });

  it("serves XML built from the API feed", async () => {
    vi.resetModules();
    vi.doMock("@/lib/backend", () => ({
      backend: {
        getPublicSettings: vi.fn().mockResolvedValue({ shippingFlatFee: 0, shippingFreeAbove: 5000 }),
        getAllCategories: vi.fn().mockResolvedValue(categories),
        getProductFeed: vi.fn().mockResolvedValue({ items: [item()], total: 1, currency: "INR" }),
      },
    }));
    const { GET } = await import("@/app/feed.xml/route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/xml; charset=utf-8");
    const xml = await res.text();
    assertWellFormed(xml);
    expect(field(xml, "id")).toEqual(["1788"]);
    vi.doUnmock("@/lib/backend");
  });
});
