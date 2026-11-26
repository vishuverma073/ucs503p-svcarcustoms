import { describe, expect, it } from "vitest";
import type { Category } from "@svcar/contracts";
import { CAR_CATEGORIES, carCategoryForFitments, pickCarCategories } from "./car-categories";

const cat = (id: number, slug: string, name = slug, status: Category["status"] = "active"): Category => ({
  id,
  parentId: null,
  name,
  slug,
  description: "",
  image: undefined,
  sortOrder: id,
  showInHeader: false,
  status,
});

// A slice of the live taxonomy (slugs as the admin created them).
const live = [
  cat(61, "audi", "Audi"),
  cat(62, "body-kits", "Body kits"),
  cat(66, "maruti", "Maruti"),
  cat(58, "virtus-slavia", "VIRTUS / SLAVIA"),
  cat(72, "bmw", "Bmw"),
  cat(73, "thar", "Thar"),
  cat(74, "polo", "Polo"),
  cat(75, "verna-2023", "Verna 2023"),
  cat(76, "skoda", "Skoda"),
];

describe("pickCarCategories", () => {
  it("keeps the display order and drops cars the catalogue doesn't have", () => {
    expect(pickCarCategories(live).map((c) => c.slug)).toEqual([
      "virtus-slavia", "thar", "polo", "bmw", "audi", "maruti", "skoda", "verna-2023",
    ]);
  });

  it("skips archived categories and ignores part categories", () => {
    const cats = [cat(58, "virtus-slavia", "VIRTUS / SLAVIA", "archived"), cat(74, "polo"), cat(62, "body-kits")];
    expect(pickCarCategories(cats).map((c) => c.slug)).toEqual(["polo"]);
  });

  it("resolves the live category record and a clean label", () => {
    const [virtus] = pickCarCategories(live);
    expect(virtus.category.id).toBe(58);
    expect(virtus.label).toBe("Virtus / Slavia");
  });

  it("maps every listed car to exactly one slug", () => {
    expect(new Set(CAR_CATEGORIES.map((c) => c.slug)).size).toBe(CAR_CATEGORIES.length);
  });
});

describe("carCategoryForFitments", () => {
  it("matches by model, with the matched fitment row for the title", () => {
    const hit = carCategoryForFitments(
      [{ make: "Volkswagen", model: "Virtus", yearStart: 2022 }, { make: "Skoda", model: "Slavia" }],
      live,
    );
    expect(hit?.car.slug).toBe("virtus-slavia");
    expect(hit?.fitment.model).toBe("Virtus");
  });

  it("prefers a model match over a make match even on a later row", () => {
    const hit = carCategoryForFitments(
      [{ make: "Skoda", model: "Kushaq" }, { make: "Skoda", model: "Slavia" }],
      live,
    );
    expect(hit?.car.slug).toBe("virtus-slavia");
    expect(hit?.fitment.model).toBe("Slavia");
  });

  it("falls back to the make category", () => {
    expect(carCategoryForFitments([{ make: "BMW", model: "3 Series" }], live)?.car.slug).toBe("bmw");
    expect(carCategoryForFitments([{ make: "Maruti Suzuki", model: "Swift" }], live)?.car.slug).toBe("maruti");
    expect(carCategoryForFitments([{ make: "Mahindra", model: "Thar Roxx" }], live)?.car.slug).toBe("thar");
  });

  it("is case-insensitive and returns null when nothing matches or the category is missing", () => {
    expect(carCategoryForFitments([{ make: "toyota", model: "HILUX" }], live)).toBeNull();
    expect(carCategoryForFitments([{ make: "Toyota", model: "Fortuner" }], live)).toBeNull();
    expect(carCategoryForFitments([], live)).toBeNull();
    expect(carCategoryForFitments(undefined, live)).toBeNull();
    expect(carCategoryForFitments([{ make: "VOLKSWAGEN", model: "virtus" }], live)?.car.slug).toBe("virtus-slavia");
  });
});
