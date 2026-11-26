import { describe, expect, it } from "vitest";
import { adminNav, mobileTabs, moreItems } from "./nav-items";

describe("phone bottom nav", () => {
  it("has the four on-the-go tabs in order (+ More)", () => {
    expect(mobileTabs().map((i) => i.label)).toEqual(["Dashboard", "Orders", "Phone leads", "Products"]);
  });

  it("everything else is reachable from More, nothing is lost", () => {
    const rest = moreItems().map((i) => i.href);
    expect(rest).toContain("/admin/settings");
    expect(rest).toContain("/admin/categories");
    expect(rest.length + mobileTabs().length).toBe(adminNav.length);
  });
});
