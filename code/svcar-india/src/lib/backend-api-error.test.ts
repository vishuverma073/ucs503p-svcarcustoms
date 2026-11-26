import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, backend, isNotFoundError } from "@/lib/backend";

afterEach(() => vi.unstubAllGlobals());

function stubStatus(status: number) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status, statusText: status === 404 ? "Not Found" : "Error" })),
  );
}

describe("apiFetch errors carry the HTTP status", () => {
  it("throws ApiError with status 404 for a missing product", async () => {
    stubStatus(404);
    const err = await backend.getProductBySlug("nope").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(404);
    expect(isNotFoundError(err)).toBe(true);
  });

  it("a 5xx is an ApiError but not a not-found", async () => {
    stubStatus(503);
    const err = await backend.getCategoryBySlug("x").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(503);
    expect(isNotFoundError(err)).toBe(false);
  });

  it("network failures are not treated as not-found", () => {
    expect(isNotFoundError(new TypeError("fetch failed"))).toBe(false);
  });
});
