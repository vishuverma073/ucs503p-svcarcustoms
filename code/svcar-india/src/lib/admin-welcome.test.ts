import { describe, expect, it } from "vitest";
import type { AdminUser } from "@svcar/contracts";
import { displayAdminName, safeAdminReturnTo } from "@/lib/admin-welcome";

describe("safeAdminReturnTo", () => {
  it("allows admin dashboard paths", () => {
    expect(safeAdminReturnTo("/admin/products")).toBe("/admin/products");
  });

  it("blocks login and welcome loops", () => {
    expect(safeAdminReturnTo("/admin/login")).toBe("/admin");
    expect(safeAdminReturnTo("/admin/welcome")).toBe("/admin");
  });

  it("blocks external redirects", () => {
    expect(safeAdminReturnTo("https://evil.test")).toBe("/admin");
    expect(safeAdminReturnTo("/account")).toBe("/admin");
  });

  it("keeps a notification deep link (same-site admin path, query and hash)", () => {
    expect(safeAdminReturnTo("/admin/orders/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).toBe(
      "/admin/orders/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
    expect(safeAdminReturnTo("/admin/phone-leads?q=98765#top")).toBe("/admin/phone-leads?q=98765#top");
    expect(safeAdminReturnTo("/admin")).toBe("/admin");
  });

  it("blocks look-alike and protocol-relative tricks", () => {
    for (const bad of [
      "/administrator",
      "/admin.evil.test",
      "//evil.test/admin",
      "/admin//evil.test",
      "/admin\\evil.test",
      "/admin/../account",
      "/admin/%2e%2e/account",
      "javascript:alert(1)",
      "/admin/login?returnTo=/admin",
    ]) {
      expect(safeAdminReturnTo(bad), bad).toBe("/admin");
    }
  });
});

describe("displayAdminName", () => {
  it("uses profile name when set", () => {
    const admin: AdminUser = { id: "1", email: "a@b.com", name: "Ketan (Admin)" };
    expect(displayAdminName(admin)).toBe("Ketan (Admin)");
  });

  it("falls back to email local part", () => {
    const admin: AdminUser = { id: "1", email: "admin@test.local", name: "" };
    expect(displayAdminName(admin)).toBe("Admin");
  });

  it("handles missing admin", () => {
    expect(displayAdminName(null)).toBe("Admin");
  });
});
