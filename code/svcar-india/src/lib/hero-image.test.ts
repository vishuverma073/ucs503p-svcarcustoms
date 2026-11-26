import { describe, expect, it } from "vitest";
import { isResizableImage, resolveHeroImage } from "./hero-image";

const supa = (name: string) =>
  `https://pohuxxnieyftxqriuloo.supabase.co/storage/v1/object/public/products/${name}.jpg`;
const PLACEHOLDER = "https://placehold.co/1600x900/0C0C0D/E11D2A/png?text=SV+Car+Customs";
const PEXELS = "https://images.pexels.com/photos/15085608/pexels-photo-15085608.jpeg?w=1600";

describe("isResizableImage", () => {
  it("accepts only Supabase public objects", () => {
    expect(isResizableImage(supa("splitter"))).toBe(true);
    expect(isResizableImage(PEXELS)).toBe(false);
    expect(isResizableImage(PLACEHOLDER)).toBe(false);
    expect(isResizableImage("https://evil.example/storage/v1/object/public/x.jpg")).toBe(false);
    expect(isResizableImage("/uploads/logo/logo-v2.webp")).toBe(false);
    expect(isResizableImage("")).toBe(false);
    expect(isResizableImage(null)).toBe(false);
  });
});

describe("resolveHeroImage", () => {
  it("keeps an uploaded admin banner", () => {
    expect(resolveHeroImage(supa("banner"), [supa("splitter")], PLACEHOLDER)).toBe(supa("banner"));
  });

  it("swaps a placeholder or stock admin image for the first real product photo", () => {
    expect(resolveHeroImage(PLACEHOLDER, [null, PEXELS, supa("splitter"), supa("wing")], PLACEHOLDER)).toBe(
      supa("splitter"),
    );
    expect(resolveHeroImage(PEXELS, [supa("splitter")], PLACEHOLDER)).toBe(supa("splitter"));
    expect(resolveHeroImage("", [supa("splitter")], PLACEHOLDER)).toBe(supa("splitter"));
  });

  it("falls back to the admin value, then the first candidate, then the placeholder", () => {
    expect(resolveHeroImage(PEXELS, [], PLACEHOLDER)).toBe(PEXELS);
    expect(resolveHeroImage("", ["https://placehold.co/800x800/png?text=Mock"], PLACEHOLDER)).toBe(
      "https://placehold.co/800x800/png?text=Mock",
    );
    expect(resolveHeroImage("not a url", [], PLACEHOLDER)).toBe(PLACEHOLDER);
  });
});
