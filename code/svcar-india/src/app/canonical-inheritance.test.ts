import { describe, it, expect, vi } from "vitest";

// The root layout and home page pull in fonts, CSS and client components; the
// test only needs their exported `metadata`.
vi.mock("next/font/google", () => ({
  Inter: () => ({ variable: "--font-brand" }),
  Barlow_Condensed: () => ({ variable: "--font-display" }),
}));
vi.mock("./globals.css", () => ({}));
vi.mock("@vercel/analytics/next", () => ({ Analytics: () => null }));
vi.mock("@vercel/speed-insights/next", () => ({ SpeedInsights: () => null }));
vi.mock("@/components/MswProvider", () => ({ MswProvider: () => null }));
vi.mock("@/components/analytics/TrackingScripts", () => ({ TrackingScripts: () => null }));
vi.mock("@/components/ThemeSync", () => ({ ThemeSync: () => null }));
vi.mock("@/lib/backend", () => ({ backend: {} }));

describe("canonical inheritance", () => {
  it("root layout declares no canonical, so search/404/login pages never point at the home page", async () => {
    const { metadata } = await import("./layout");
    expect(metadata.alternates?.canonical).toBeUndefined();
    // metadataBase must stay, so relative canonicals on pages resolve to the site origin.
    expect(metadata.metadataBase).toBeInstanceOf(URL);
  });

  it("home page declares its own canonical '/'", async () => {
    const { metadata } = await import("./(store)/page");
    expect(metadata.alternates?.canonical).toBe("/");
  });
});
