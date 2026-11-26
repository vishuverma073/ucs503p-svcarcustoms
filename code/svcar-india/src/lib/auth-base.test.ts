import { afterEach, describe, expect, it, vi } from "vitest";
import { getApiBase, getAuthBase } from "./api-config";

/**
 * The session lives in an httpOnly refresh cookie. If /auth/* is called on the
 * API's own host, that cookie is third-party — Safari and Firefox block those,
 * which signed customers out on every page load. So in the browser these calls
 * must stay on the storefront's origin (next.config rewrites /auth/* onward).
 */
describe("getAuthBase", () => {
  const ENV = { ...process.env };

  afterEach(() => {
    process.env.NEXT_PUBLIC_API_URL = ENV.NEXT_PUBLIC_API_URL;
    vi.unstubAllGlobals();
  });

  it("returns the storefront origin in the browser when the API is on another host", () => {
    process.env.NEXT_PUBLIC_API_URL = "https://svcar-api-staging.fly.dev";
    vi.stubGlobal("window", { location: { origin: "https://www.svcarcustoms.in" } });
    expect(getAuthBase()).toBe("https://www.svcarcustoms.in");
  });

  it("falls back to the API base on the server, where no cookie is involved", () => {
    process.env.NEXT_PUBLIC_API_URL = "https://svcar-api-staging.fly.dev";
    expect(getAuthBase()).toBe(getApiBase());
  });

  it("uses the API base in proxy/localhost mode (already same-origin)", () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    vi.stubGlobal("window", { location: { origin: "http://localhost:3000" } });
    expect(getAuthBase()).toBe(getApiBase());
  });
});
