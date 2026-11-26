/**
 * public/admin-sw.js run in a sandbox with a fake ServiceWorkerGlobalScope, to
 * pin down what the real worker does on push / notificationclick / fetch.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

const SOURCE = readFileSync(path.join(process.cwd(), "public/admin-sw.js"), "utf8");
const ORIGIN = "https://www.svcarcustoms.in";

interface FakeClient {
  url: string;
  focused?: boolean;
  focus: ReturnType<typeof vi.fn>;
  postMessage: ReturnType<typeof vi.fn>;
}

function client(pathname: string, focused = false): FakeClient {
  return { url: `${ORIGIN}${pathname}`, focused, focus: vi.fn(async () => {}), postMessage: vi.fn() };
}

function loadWorker(windows: FakeClient[] = []) {
  const listeners: Record<string, (e: unknown) => void> = {};
  const showNotification = vi.fn(async () => {});
  const openWindow = vi.fn(async () => null);
  const self = {
    location: { origin: ORIGIN },
    registration: { showNotification, navigationPreload: { enable: vi.fn(async () => {}) } },
    clients: { matchAll: vi.fn(async () => windows), openWindow, claim: vi.fn(async () => {}) },
    skipWaiting: vi.fn(),
    addEventListener: (type: string, fn: (e: unknown) => void) => {
      listeners[type] = fn;
    },
  };
  const fetchImpl = vi.fn(async () => new Response("ok"));
  vm.runInNewContext(SOURCE, { self, URL, Response, fetch: fetchImpl, console });

  async function fire(type: string, event: Record<string, unknown>) {
    const pending: Promise<unknown>[] = [];
    listeners[type]!({
      ...event,
      waitUntil: (p: Promise<unknown>) => pending.push(p),
      respondWith: (p: Promise<unknown>) => pending.push(p),
    });
    return Promise.all(pending);
  }
  return { listeners, fire, showNotification, openWindow, fetchImpl, self };
}

const pushEvent = (data: unknown) => ({
  data: { json: () => data, text: () => JSON.stringify(data) },
});

describe("admin-sw.js push", () => {
  it("shows the notification with the payload, icon/badge, tag + renotify and the target URL", async () => {
    const admin = client("/admin/orders");
    const store = client("/product/x");
    const w = loadWorker([admin, store]);
    await w.fire(
      "push",
      pushEvent({ title: "New order ₹12,198 · SV1", body: "Asha · Prepaid · Spoiler", url: "/admin/orders/abc", tag: "order-abc", kind: "order", ts: 5 }),
    );
    expect(w.showNotification).toHaveBeenCalledWith("New order ₹12,198 · SV1", {
      body: "Asha · Prepaid · Spoiler",
      icon: "/admin-icons/icon-192.png",
      badge: "/admin-icons/badge-96.png",
      data: { url: "/admin/orders/abc", kind: "order" },
      timestamp: 5,
      tag: "order-abc",
      renotify: true,
    });
    // Open admin screens are told to refresh; storefront tabs are not.
    expect(admin.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "admin-push", kind: "order" }));
    expect(store.postMessage).not.toHaveBeenCalled();
  });

  it("never carries an off-site or storefront URL into a notification", async () => {
    const w = loadWorker();
    for (const url of ["https://evil.example/admin", "//evil.example/admin", "/checkout", "javascript:alert(1)"]) {
      await w.fire("push", pushEvent({ title: "x", url }));
    }
    for (const call of w.showNotification.mock.calls as unknown as [string, { data: { url: string } }][]) {
      expect(call[1].data.url).toBe("/admin");
    }
  });

  it("a non-JSON payload still shows a notification", async () => {
    const w = loadWorker();
    await w.fire("push", { data: { json: () => { throw new Error("bad"); }, text: () => "hello" } });
    expect(w.showNotification).toHaveBeenCalledWith("SV Admin", expect.objectContaining({ body: "hello" }));
  });
});

describe("admin-sw.js notificationclick", () => {
  const clickEvent = (url: string) => ({ notification: { close: vi.fn(), data: { url } } });

  it("focuses an open admin window and asks it to open the target page", async () => {
    const other = client("/admin");
    const focused = client("/admin/products", true);
    const w = loadWorker([client("/"), other, focused]);
    const evt = clickEvent("/admin/orders/abc");
    await w.fire("notificationclick", evt);
    expect(evt.notification.close).toHaveBeenCalled();
    expect(focused.focus).toHaveBeenCalled();
    expect(focused.postMessage).toHaveBeenCalledWith({ type: "admin-navigate", url: "/admin/orders/abc" });
    expect(w.openWindow).not.toHaveBeenCalled();
  });

  it("opens a new window on the target when no admin window is open", async () => {
    const w = loadWorker([client("/product/x")]);
    await w.fire("notificationclick", clickEvent("/admin/phone-leads"));
    expect(w.openWindow).toHaveBeenCalledWith(`${ORIGIN}/admin/phone-leads`);
  });
});

describe("admin-sw.js fetch (network only)", () => {
  it("ignores everything except full page loads", async () => {
    const w = loadWorker();
    const respondWith = vi.fn();
    for (const req of [
      { mode: "cors", method: "GET", url: `${ORIGIN}/svcar-api/admin/orders` },
      { mode: "no-cors", method: "GET", url: `${ORIGIN}/_next/static/x.js` },
      { mode: "navigate", method: "POST", url: `${ORIGIN}/admin` },
    ]) {
      w.listeners.fetch!({ request: req, respondWith });
    }
    expect(respondWith).not.toHaveBeenCalled();
  });

  it("page loads go to the network; offline → the small offline page (503), nothing cached", async () => {
    const w = loadWorker();
    const [online] = (await w.fire("fetch", { request: { mode: "navigate", method: "GET" }, preloadResponse: Promise.resolve(undefined) })) as Response[];
    expect(await online!.text()).toBe("ok");
    w.fetchImpl.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const [offline] = (await w.fire("fetch", { request: { mode: "navigate", method: "GET" }, preloadResponse: Promise.resolve(undefined) })) as Response[];
    expect(offline!.status).toBe(503);
    expect(await offline!.text()).toContain("You're offline");
    expect(SOURCE).not.toMatch(/caches\.open|cache\.put/);
  });
});
