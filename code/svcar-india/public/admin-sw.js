/*
 * SV Admin service worker — registered by the admin only (scope "/admin"), never
 * by the storefront, and never in mock mode (the MSW worker owns "/" there).
 *
 * It does three things and caches NOTHING:
 *   1. push              → show the "New order" / "New lead" notification and tell
 *                          open admin windows so their lists refresh at once.
 *   2. notificationclick → focus an open admin window (or open one) on the URL
 *                          the notification carries (same-origin /admin paths only).
 *   3. fetch (page loads only) → straight to the network; if the phone is
 *                          offline, a tiny "You're offline" page instead of an
 *                          error screen. API calls and assets are not touched.
 */
"use strict";

const ADMIN_PREFIX = "/admin";
const ICON = "/admin-icons/icon-192.png";
const BADGE = "/admin-icons/badge-96.png";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Lets page loads start the network request while this worker boots.
      if (self.registration.navigationPreload) {
        try {
          await self.registration.navigationPreload.enable();
        } catch (_) {
          /* not supported — plain fetch below */
        }
      }
      await self.clients.claim();
    })(),
  );
});

/** Only same-origin admin paths may be opened from a notification. */
function safeAdminUrl(raw) {
  try {
    const url = new URL(raw || ADMIN_PREFIX, self.location.origin);
    if (url.origin !== self.location.origin) return ADMIN_PREFIX;
    if (url.pathname !== ADMIN_PREFIX && !url.pathname.startsWith(ADMIN_PREFIX + "/")) return ADMIN_PREFIX;
    return url.pathname + url.search + url.hash;
  } catch (_) {
    return ADMIN_PREFIX;
  }
}

function isAdminClient(client) {
  try {
    const path = new URL(client.url).pathname;
    return path === ADMIN_PREFIX || path.startsWith(ADMIN_PREFIX + "/");
  } catch (_) {
    return false;
  }
}

async function adminWindows() {
  const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  return all.filter(isAdminClient);
}

self.addEventListener("push", (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json() || {};
    } catch (_) {
      data = { body: event.data.text() };
    }
  }
  const title = typeof data.title === "string" && data.title ? data.title : "SV Admin";
  const url = safeAdminUrl(data.url);
  const tag = typeof data.tag === "string" && data.tag ? data.tag : undefined;
  const options = {
    body: typeof data.body === "string" ? data.body : "",
    icon: ICON,
    badge: BADGE,
    data: { url, kind: data.kind || null },
    timestamp: typeof data.ts === "number" ? data.ts : Date.now(),
  };
  if (tag) {
    options.tag = tag;
    options.renotify = true; // a repeat of the same tag still buzzes
  }

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, options);
      // Open admin screens refetch right away instead of waiting for their poll.
      for (const client of await adminWindows()) {
        client.postMessage({ type: "admin-push", kind: data.kind || null, url, title, body: options.body, tag: tag || null });
      }
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = safeAdminUrl(event.notification.data && event.notification.data.url);
  const target = new URL(url, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windows = await adminWindows();
      const existing = windows.find((c) => c.focused) || windows[0];
      if (existing) {
        try {
          await existing.focus();
        } catch (_) {
          /* focus not allowed — still navigate below */
        }
        if (existing.url !== target) existing.postMessage({ type: "admin-navigate", url });
        return;
      }
      if (self.clients.openWindow) await self.clients.openWindow(target);
    })(),
  );
});

// The browser rotated or dropped the subscription: ask an open admin screen to
// re-subscribe (only a page has the sign-in token needed to tell the server).
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      for (const client of await adminWindows()) client.postMessage({ type: "admin-push-resubscribe" });
    })(),
  );
});

const OFFLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0C0C0D"><title>Offline · SV Admin</title><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0C0C0D;color:#fff;font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;text-align:center;padding:24px;box-sizing:border-box}h1{font-size:20px;margin:0 0 6px}p{color:rgba(255,255,255,.6);margin:0 0 24px}a{display:inline-block;background:#E11D2A;color:#fff;text-decoration:none;font-weight:600;padding:12px 28px;border-radius:12px}</style></head><body><main><h1>You're offline</h1><p>SV Admin needs a connection to load orders and leads.</p><a href="">Try again</a></main></body></html>`;

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // Full page loads only. Client-side navigations, API calls and assets are
  // left alone (no respondWith), so they never touch this worker.
  if (req.mode !== "navigate" || req.method !== "GET") return;
  event.respondWith(
    (async () => {
      try {
        const preloaded = await event.preloadResponse;
        if (preloaded) return preloaded;
        return await fetch(req);
      } catch (_) {
        return new Response(OFFLINE_HTML, {
          status: 503,
          headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
        });
      }
    })(),
  );
});
