import { describe, expect, it } from "vitest";
import { pickRelated, pickRelatedByCar } from "./related-products";

const p = (id: number) => ({ id });
const ids = (xs: { id: number }[]) => xs.map((x) => x.id);

describe("pickRelated", () => {
  const cat = [1, 2, 3, 4, 5, 6, 7].map(p);

  it("takes the products after this one, wrapping round the category", () => {
    expect(ids(pickRelated(2, cat, [], 4))).toEqual([3, 4, 5, 6]);
    expect(ids(pickRelated(6, cat, [], 4))).toEqual([7, 1, 2, 3]);
  });

  it("links every product in the category from exactly `count` siblings", () => {
    const inbound = new Map<number, number>();
    for (const x of cat) for (const r of pickRelated(x.id, cat, [], 4)) inbound.set(r.id, (inbound.get(r.id) ?? 0) + 1);
    expect([...inbound.values()]).toEqual(cat.map(() => 4));
  });

  it("tops up a small category from the fallback, without duplicates or itself", () => {
    expect(ids(pickRelated(1, [p(1), p(2)], [p(2), p(1), p(9), p(8), p(7)], 4))).toEqual([2, 9, 8, 7]);
  });

  it("still works when the product isn't in the sibling list", () => {
    expect(ids(pickRelated(99, cat, [], 3))).toEqual([1, 2, 3]);
  });
});

describe("pickRelatedByCar", () => {
  const car = [1, 2, 3, 4, 5, 6, 7, 8].map(p);

  it("skips the product and whatever the related row already shows", () => {
    expect(ids(pickRelatedByCar(2, car, [p(3), p(4)], 4))).toEqual([5, 6, 7, 8]);
  });

  it("wraps round the car category like pickRelated", () => {
    expect(ids(pickRelatedByCar(7, car, [p(8)], 4))).toEqual([1, 2, 3, 4]);
  });

  it("returns fewer than count rather than padding from elsewhere", () => {
    expect(ids(pickRelatedByCar(1, [p(1), p(2), p(3)], [p(2)], 4))).toEqual([3]);
    expect(ids(pickRelatedByCar(1, [p(1)], [], 4))).toEqual([]);
  });
});
