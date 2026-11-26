import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import CustomerReviews, { CUSTOMER_REVIEWS } from "./CustomerReviews";

describe("CustomerReviews", () => {
  it("renders every owner-supplied review with its rating label", () => {
    const html = renderToStaticMarkup(<CustomerReviews />);
    for (const r of CUSTOMER_REVIEWS) {
      expect(html).toContain(r.name);
      expect(html).toContain(`Rated ${r.rating} out of 5`);
    }
  });

  it("renders nothing without reviews and emits no review JSON-LD", () => {
    expect(renderToStaticMarkup(<CustomerReviews reviews={[]} />)).toBe("");
    expect(renderToStaticMarkup(<CustomerReviews />)).not.toContain("application/ld+json");
  });
});
