import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Pretend GA4 + the Pixel are configured so the helpers are live.
vi.mock("@/lib/analytics-config", () => ({
  GA_ID: "G-TEST",
  GOOGLE_ADS_ID: undefined,
  GOOGLE_ADS_PURCHASE_LABEL: undefined,
  META_PIXEL_ID: "123",
  HAS_GTAG: true,
}));

import { trackLead, trackViewContent } from "@/lib/analytics-events";

type FakeWindow = {
  gtag?: (...args: unknown[]) => void;
  fbq?: (...args: unknown[]) => void;
  dataLayer?: unknown[];
  _fbq?: { queue?: unknown[] };
};

const ITEM = { id: "sku-1", name: "RGB Ambient Light Kit", price: 4299 };

/** The test environment is node — install a minimal window per test. */
function installWindow(w: FakeWindow): FakeWindow {
  vi.stubGlobal("window", w);
  return w;
}

describe("gtag helper on a direct landing (gtag.js not loaded yet)", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it("queues the command into window.dataLayer exactly like the inline stub", () => {
    const w = installWindow({ dataLayer: [] });

    trackViewContent(ITEM);

    expect(w.dataLayer).toHaveLength(1);
    const queued = w.dataLayer![0] as ArrayLike<unknown>;
    // A real `arguments` object (what gtag.js replays), not a plain array.
    expect(Object.prototype.toString.call(queued)).toBe("[object Arguments]");
    expect(Array.from(queued)).toEqual([
      "event",
      "view_item",
      {
        currency: "INR",
        value: 4299,
        items: [{ item_id: "sku-1", item_name: ITEM.name, price: 4299 }],
      },
    ]);
  });

  it("creates dataLayer when the stub has not run yet", () => {
    const w = installWindow({});

    trackViewContent(ITEM);

    expect(w.dataLayer).toHaveLength(1);
  });

  it("calls window.gtag directly once gtag.js is loaded", () => {
    const gtag = vi.fn();
    const w = installWindow({ gtag, dataLayer: [] });

    trackViewContent(ITEM);

    expect(gtag).toHaveBeenCalledWith("event", "view_item", expect.objectContaining({ value: 4299 }));
    expect(w.dataLayer).toHaveLength(0);
  });
});

describe("fbq helper before fbevents.js loads", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("pushes into the pixel stub queue when only _fbq is present", () => {
    const w = installWindow({ _fbq: { queue: [] } });

    trackViewContent(ITEM);

    expect(w._fbq!.queue).toEqual([
      ["track", "ViewContent", expect.objectContaining({ content_ids: ["sku-1"], value: 4299 })],
    ]);
  });

  it("skips silently when neither fbq nor _fbq exists", () => {
    const w = installWindow({});

    expect(() => trackViewContent(ITEM)).not.toThrow();
    expect(w._fbq).toBeUndefined();
  });
});

describe("trackLead (phone popup)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends GA4 generate_lead and Pixel Lead", () => {
    const gtag = vi.fn();
    const fbq = vi.fn();
    installWindow({ gtag, fbq, dataLayer: [] });

    trackLead();

    expect(gtag).toHaveBeenCalledWith("event", "generate_lead", { lead_source: "popup" });
    expect(fbq).toHaveBeenCalledWith("track", "Lead", { content_name: "popup" });
  });

  it("queues generate_lead into dataLayer before gtag.js loads", () => {
    const w = installWindow({ dataLayer: [] });

    trackLead();

    expect(Array.from(w.dataLayer![0] as ArrayLike<unknown>)).toEqual([
      "event",
      "generate_lead",
      { lead_source: "popup" },
    ]);
  });
});
