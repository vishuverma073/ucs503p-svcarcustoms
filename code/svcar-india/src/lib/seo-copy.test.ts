import { describe, expect, it } from "vitest";
import {
  DESCRIPTION_MAX,
  TITLE_MAX,
  categoryFactsFrom,
  categoryIntro,
  categorySeoDescription,
  categorySeoTitle,
  cleanProductName,
  clampWords,
  productSeoDescription,
  productHeading,
  productSeoTitle,
  relatedCarCategorySlugs,
  variantTag,
  splitFitmentLabel,
} from "./seo-copy";
import { BRAND } from "./brand";

const virtus = { make: "Volkswagen", model: "Virtus" };
const slavia = { make: "Skoda", model: "Slavia" };
const free = { freeDelivery: true };

describe("cleanProductName", () => {
  it("drops the sub-title, the store prefix and stray punctuation", () => {
    expect(cleanProductName("Svcarcustoms Virtus / Slavia Aftermarket dedicated Aero kit . ( Splitter and diffuser kit)")).toBe(
      "Virtus / Slavia Aftermarket Dedicated Aero Kit (Splitter & Diffuser Kit)",
    );
    expect(cleanProductName("Volkswagen Virtus Headlight Eyelids | Premium Aftermarket ABS Eyelids")).toBe(
      "Volkswagen Virtus Headlight Eyelids",
    );
    expect(cleanProductName("Swift 2018+ sport body kit | Aftermarket swift body kit")).toBe("Swift 2018+ Sport Body Kit");
    expect(cleanProductName("*A5/S5 (2020-up) RS body kit")).toBe("A5 / S5 (2020-up) RS Body Kit");
  });
});

describe("productSeoTitle", () => {
  it("keeps the brand suffix once and never exceeds 60 characters", () => {
    const t = productSeoTitle({
      name: "Volkswagen Virtus Headlight Eyelids | Premium Aftermarket ABS Eyelids",
      fitments: [virtus],
    });
    expect(t).toBe("Volkswagen Virtus Headlight Eyelids | SV Car Customs");
  });

  it("adds the cars a name doesn't already mention", () => {
    expect(productSeoTitle({ name: "Skoda metal paddle shifters", fitments: [{ make: "Skoda", model: "Octavia" }] })).toBe(
      "Skoda Metal Paddle Shifters for Octavia | SV Car Customs",
    );
  });

  it("does not repeat the store name the product name already carries", () => {
    const t = productSeoTitle({
      name: "Svcarcustoms Virtus / Slavia Aftermarket dedicated Aero kit . ( Splitter and diffuser kit)",
      fitments: [virtus, slavia],
    });
    expect(t).toBe("Virtus / Slavia Aero Kit (Splitter & Diffuser Kit)");
    expect(t.match(/sv\s*car\s*customs|svcarcustoms/gi)).toBeNull();
  });

  it("cuts long names on a word, not mid-connector", () => {
    const t = productSeoTitle({ name: "Universal sedan spoiler available with light in between in 100% ABS quality" });
    expect(t.length).toBeLessThanOrEqual(TITLE_MAX);
    expect(t).not.toMatch(/\b(with|in|and|for)$/);
  });
});

describe("variant listings", () => {
  it("gives variants that share a name distinct titles from their sub-title", () => {
    const carbon = productSeoTitle({ name: "Borla Valvetronic Exhaust | Dual Tip (Carbon)" });
    const burnt = productSeoTitle({ name: "Borla Valvetronic Exhaust | Dual Tip (Burnt)" });
    expect(carbon).toBe("Borla Valvetronic Exhaust – Carbon | SV Car Customs");
    expect(burnt).toBe("Borla Valvetronic Exhaust – Burnt | SV Car Customs");
  });

  it("tells the two LC-250 wheels apart by finish and stays within 60 characters", () => {
    const prado = [{ make: "Toyota", model: "Land Cruiser Prado" }];
    const a = productSeoTitle({ name: "Toyota Land Cruiser Prado LC-250 Steering Wheel | Copy Carbon Fiber", fitments: prado });
    const b = productSeoTitle({ name: "Toyota Land Cruiser Prado LC-250 Steering Wheel | Carbon Fiber Finish", fitments: prado });
    expect(a).not.toBe(b);
    expect(a.length).toBeLessThanOrEqual(TITLE_MAX);
    expect(b.length).toBeLessThanOrEqual(TITLE_MAX);
  });

  it("adds no tag the main name already says, or that the sub-title doesn't state", () => {
    expect(variantTag("Toyota Fortuner Real Carbon Fibre Steering Wheel | Real Carbon Fiber Finish")).toBe("");
    expect(variantTag("Volkswagen Virtus Headlight Eyelids | Premium Aftermarket ABS Eyelids")).toBe("");
    expect(variantTag("Polo arm rest")).toBe("");
  });
});

describe("productHeading", () => {
  it("drops the sub-title noise and lists the fitted cars once", () => {
    const h = productHeading({
      name: "Maruti copy carbon fibre steering wheel | Aftermarket steering",
      fitments: [
        { make: "Maruti Suzuki", model: "Swift" },
        { make: "Maruti Suzuki", model: "Fronx" },
        { make: "Maruti Suzuki", model: "Baleno" },
      ],
    });
    expect(h).toBe("Maruti Copy Carbon Fibre Steering Wheel for Swift, Fronx & Baleno");
  });

  it("does not repeat a car the name already names", () => {
    expect(productHeading({ name: "Thar g-wagon style Ac vents", fitments: [{ make: "Mahindra", model: "Thar" }] })).toBe(
      "Thar G-wagon Style AC Vents",
    );
  });
});

describe("productSeoDescription", () => {
  it("leads with price and the store's real delivery terms, within 155 characters", () => {
    const d = productSeoDescription(
      {
        name: "Cardi k4 Ambient lights",
        description: "Turn the cabin into something worth sitting in after dark. More text follows here.",
        price: 5999,
      },
      free,
    );
    expect(d).toBe(
      "Cardi k4 Ambient Lights at ₹5,999. Free delivery across India, COD available. Turn the cabin into something worth sitting in after dark.",
    );
    expect(d.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
  });

  it("doesn't promise free delivery when the admin charges a fee", () => {
    const d = productSeoDescription({ name: "Polo M style mirror caps", price: 2200 }, { freeDelivery: false });
    expect(d).not.toMatch(/free/i);
    expect(d).toContain("₹2,200");
  });

  it("clips a long catalogue description but keeps the offer", () => {
    const d = productSeoDescription({ name: "X", description: "word ".repeat(80), price: 100 }, free);
    expect(d.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
    expect(d).toContain("COD available.");
  });
});

describe("category copy", () => {
  const steering = categoryFactsFrom(
    { slug: "steering-wheels", name: "Steering wheels" },
    {
      items: [
        { slug: "a", minPrice: 27000 },
        { slug: "b", minPrice: 16000 },
        { slug: "c", minPrice: 1999 },
        { slug: "d", minPrice: 12999 },
      ],
      total: 4,
    },
    [
      { slug: "a", fitments: ["Toyota Fortuner"] },
      { slug: "b", fitments: ["Toyota Fortuner"] },
      { slug: "d", fitments: ["Maruti Suzuki Swift", "Volkswagen Polo"] },
      { slug: "zz", fitments: ["Mahindra Thar"] }, // not in this category
    ],
  );

  it("builds facts from the listing and the feed's fitments", () => {
    expect(steering.count).toBe(4);
    expect(steering.minPrice).toBe(1999);
    expect(steering.fitments.map((f) => f.model)).toEqual(["Fortuner", "Fortuner", "Swift", "Polo"]);
  });

  it("writes the intro only from those facts", () => {
    expect(categoryIntro(steering, free)).toBe(
      "4 products — real carbon fibre and copy carbon steering wheels, for Fortuner, Swift & Polo. Prices from ₹1,999. Free delivery across India, COD available.",
    );
  });

  it("keeps titles and descriptions inside Google's limits", () => {
    expect(categorySeoTitle(steering)).toBe(`Carbon Fibre Car Steering Wheels | ${BRAND.name}`);
    const d = categorySeoDescription(steering, free);
    expect(d.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
    expect(d).toContain("From ₹1,999.");
    const generic = categorySeoTitle({ slug: "exhausts", name: "EXHAUSTS" });
    expect(generic).toBe("Exhausts – Buy Online in India | SV Car Customs");
    expect(categorySeoTitle({ slug: "bmw", name: "Bmw" })).toBe("BMW Car Accessories | SV Car Customs");
  });

  it("describes a car category by the models its products fit", () => {
    const bmw = categoryFactsFrom(
      { slug: "bmw", name: "Bmw" },
      { items: [{ slug: "x", minPrice: 6999 }], total: 1 },
      [{ slug: "x", fitments: ["BMW 5 Series"] }],
    );
    expect(categoryIntro(bmw, free)).toBe(
      "1 product for the BMW 5 Series. Prices from ₹6,999. Free delivery across India, COD available.",
    );
  });

  it("links a category to the car categories its products fit", () => {
    expect(relatedCarCategorySlugs(steering.fitments, "steering-wheels")).toEqual(["maruti", "polo"]);
    expect(relatedCarCategorySlugs([virtus, slavia], "virtus-slavia")).toEqual([]);
  });
});

describe("helpers", () => {
  it("splits multi-word makes", () => {
    expect(splitFitmentLabel("Maruti Suzuki Swift")).toEqual({ make: "Maruti Suzuki", model: "Swift" });
    expect(splitFitmentLabel("Toyota Land Cruiser Prado")).toEqual({ make: "Toyota", model: "Land Cruiser Prado" });
  });

  it("clamps on word boundaries", () => {
    expect(clampWords("one two three four", 9)).toBe("one two");
  });
});
