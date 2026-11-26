import { describe, expect, it } from "vitest";
import {
  HALF_LIFE_DAYS,
  WINDOW_DAYS,
  bestsellerProductIds,
  mergeBestsellerIds,
  salesRank,
} from "../src/lib/bestsellers.js";

// Regression guard: pins first, 90-day window, 14-day half-life is a deliberate
// product decision. Changing it must be an explicit, reviewed edit here too.
describe("bestsellers tuning constants", () => {
  it("keeps a 14-day half-life and a 90-day window", () => {
    expect(HALF_LIFE_DAYS).toBe(14);
    expect(WINDOW_DAYS).toBe(90);
  });

  it("keeps pins (in their given order) ahead of the ranking", () => {
    expect(mergeBestsellerIds([9, 3], [1, 3, 2], 4)).toEqual([9, 3, 1, 2]);
  });
});
import type { DbClient } from "../src/db/client.js";

/** db.execute stub that returns each result set in turn (pins, then sales). */
function dbReturning(...results: unknown[][]): { db: DbClient; calls: () => number } {
  const queue = [...results];
  let calls = 0;
  const db = {
    execute: async () => {
      calls += 1;
      return queue.shift() ?? [];
    },
  } as unknown as DbClient;
  return { db, calls: () => calls };
}

describe("mergeBestsellerIds", () => {
  it("puts admin pins ahead of the sales ranking", () => {
    expect(mergeBestsellerIds([7, 8], [1, 2, 3], 10)).toEqual([7, 8, 1, 2, 3]);
  });

  it("lists a pinned product once even when it also ranks", () => {
    expect(mergeBestsellerIds([2], [1, 2, 3], 10)).toEqual([2, 1, 3]);
  });

  it("caps at the limit", () => {
    expect(mergeBestsellerIds([9], [1, 2, 3], 2)).toEqual([9, 1]);
  });

  it("returns the ranking alone when nothing is pinned", () => {
    expect(mergeBestsellerIds([], [4, 5], 10)).toEqual([4, 5]);
  });

  it("is empty when nothing is pinned and nothing has sold", () => {
    expect(mergeBestsellerIds([], [], 10)).toEqual([]);
  });
});

describe("salesRank", () => {
  it("coerces the aggregate columns the driver returns as strings", async () => {
    const { db } = dbReturning([{ id: "12", units: "5", score: "3.5" }]);
    expect(await salesRank(db, 10)).toEqual([{ id: 12, units: 5, score: 3.5 }]);
  });

  it("drops rows without a usable product id", async () => {
    const { db } = dbReturning([
      { id: null, units: 1, score: 1 },
      { id: 3, units: 1, score: 1 },
    ]);
    expect(await salesRank(db, 10)).toEqual([{ id: 3, units: 1, score: 1 }]);
  });
});

describe("bestsellerProductIds", () => {
  it("merges pins with what is selling", async () => {
    const { db } = dbReturning([{ id: 5 }], [{ id: 1, units: 3, score: 2 }, { id: 5, units: 1, score: 1 }]);
    expect(await bestsellerProductIds(db, 10)).toEqual([5, 1]);
  });

  it("skips the sales query once pins already fill the rail", async () => {
    const { db, calls } = dbReturning([{ id: 1 }, { id: 2 }]);
    expect(await bestsellerProductIds(db, 2)).toEqual([1, 2]);
    expect(calls()).toBe(1);
  });

  it("is empty when nothing is pinned and nothing has sold", async () => {
    const { db } = dbReturning([], []);
    expect(await bestsellerProductIds(db, 10)).toEqual([]);
  });
});
