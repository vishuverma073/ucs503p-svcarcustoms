import { describe, expect, it } from "vitest";
import {
  diffNewIds,
  isLiveAdminKey,
  formatUpdatedAgo,
  LIVE_REFRESH_MS,
  liveSWRConfig,
  trackLiveResponse,
  type LiveBaseline,
} from "@/lib/live-refresh";

describe("live refresh config", () => {
  it("polls every 5s, only while visible/online", () => {
    expect(LIVE_REFRESH_MS).toBe(5000);
    expect(liveSWRConfig.refreshInterval).toBe(5000);
    expect(liveSWRConfig.refreshWhenHidden).toBe(false);
    expect(liveSWRConfig.refreshWhenOffline).toBe(false);
  });

  it("dedupe window is shorter than the poll (otherwise SWR swallows the refreshes)", () => {
    expect(liveSWRConfig.dedupingInterval).toBeLessThan(liveSWRConfig.refreshInterval);
  });
});

describe("new-row tracking", () => {
  const start: LiveBaseline = { seen: null, key: null };

  it("first load marks nothing; a later arrival is new exactly once", () => {
    const a = trackLiveResponse(start, ["o1", "o2"], "k");
    expect(a.fresh).toEqual([]);
    const b = trackLiveResponse(a.next, ["o3", "o1", "o2"], "k");
    expect(b.fresh).toEqual(["o3"]);
    const c = trackLiveResponse(b.next, ["o3", "o1", "o2"], "k");
    expect(c.fresh).toEqual([]);
  });

  it("changing the filter (SWR key) starts a new baseline instead of flagging everything", () => {
    const a = trackLiveResponse(start, ["o1"], "all");
    const b = trackLiveResponse(a.next, ["p1", "p2"], "paid");
    expect(b.fresh).toEqual([]);
    const c = trackLiveResponse(b.next, ["p3", "p1", "p2"], "paid");
    expect(c.fresh).toEqual(["p3"]);
  });

  it("diffNewIds", () => {
    expect(diffNewIds(null, ["a"])).toEqual([]);
    expect(diffNewIds(new Set(["a"]), ["b", "a"])).toEqual(["b"]);
  });

  it("'updated just now' label", () => {
    expect(formatUpdatedAgo(0)).toBe("just now");
    expect(formatUpdatedAgo(4_000)).toBe("just now");
    expect(formatUpdatedAgo(12_000)).toBe("12s ago");
    expect(formatUpdatedAgo(3 * 60_000)).toBe("3 min ago");
    expect(formatUpdatedAgo(2 * 3_600_000)).toBe("2 h ago");
    expect(formatUpdatedAgo(-500)).toBe("just now");
  });

  it("a push message refreshes only the order / lead caches", () => {
    expect(isLiveAdminKey(["admin/orders/stats", "today"])).toBe(true);
    expect(isLiveAdminKey(["admin/phone-leads"])).toBe(true);
    expect(isLiveAdminKey("$inf$@\"admin/orders\",\"\",\"\",\"12m\",null,")).toBe(true);
    expect(isLiveAdminKey(["admin/products", ""])).toBe(false);
    expect(isLiveAdminKey(undefined)).toBe(false);
  });
});
