import { describe, it, expect, beforeAll } from "vitest";
import { signPreviewToken, verifyPreviewToken } from "../src/lib/preview-token.js";

beforeAll(() => {
  process.env.JWT_ADMIN_SECRET = "test-admin-secret-for-preview-tokens";
});

describe("preview tokens", () => {
  it("accepts a freshly minted token for its own slug", () => {
    const slug = "gt-steering-trim";
    expect(verifyPreviewToken(slug, signPreviewToken(slug))).toBe(true);
  });

  it("is slug-bound — a token for one product cannot preview another", () => {
    const token = signPreviewToken("product-a");
    expect(verifyPreviewToken("product-b", token)).toBe(false);
  });

  it("rejects the legacy bare flag (this was the vulnerability)", () => {
    expect(verifyPreviewToken("any-slug", "1")).toBe(false);
    expect(verifyPreviewToken("any-slug", "0")).toBe(false);
    expect(verifyPreviewToken("any-slug", "true")).toBe(false);
  });

  it("rejects missing/garbage tokens", () => {
    expect(verifyPreviewToken("s", undefined)).toBe(false);
    expect(verifyPreviewToken("s", null)).toBe(false);
    expect(verifyPreviewToken("s", "")).toBe(false);
    expect(verifyPreviewToken("s", "garbage")).toBe(false);
    expect(verifyPreviewToken("s", ".")).toBe(false);
  });

  it("rejects an expired token", () => {
    // Mint one that expired an hour ago.
    const expired = signPreviewToken("slug", Date.now() - 2 * 60 * 60 * 1000);
    expect(verifyPreviewToken("slug", expired)).toBe(false);
  });

  it("rejects a tampered expiry (signature covers exp)", () => {
    const token = signPreviewToken("slug");
    const sig = token.slice(token.indexOf(".") + 1);
    expect(verifyPreviewToken("slug", `${Date.now() + 10_000_000}.${sig}`)).toBe(false);
  });

  it("rejects a tampered signature", () => {
    const token = signPreviewToken("slug");
    const exp = token.slice(0, token.indexOf("."));
    expect(verifyPreviewToken("slug", `${exp}.deadbeefdeadbeef`)).toBe(false);
  });
});
