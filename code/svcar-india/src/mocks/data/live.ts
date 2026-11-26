import type { LiveVisitor } from "@svcar/contracts";

/**
 * Mock live-presence snapshot for the MSW demo build.
 *
 * Mirrors the real endpoint, which derives presence from the page-view stream
 * (`analytics_events`): anonymous browser visitors with a current page, a visit
 * duration and coarse geo/device — no customer identity and no cart, because
 * the real data has neither.
 *
 * A fresh set is synthesized on every call so the auto-refreshing /admin/live
 * page visibly changes (people come and go, and move between pages).
 */

const SEC = 1000;
const secondsAgo = (s: number) => new Date(Date.now() - s * SEC).toISOString();

const PATHS = [
  "/",
  "/category/exterior-mods",
  "/category/car-lighting",
  "/product/gt-wing-pro",
  "/product/cat-back-sport-exhaust",
  "/search?q=exhaust",
  "/cart",
  "/checkout",
];

const CITIES = ["New Delhi", "Mumbai", "Bengaluru", "Pune", "Hyderabad", "Jaipur", ""];
const DEVICES = ["Mobile", "Mobile", "Mobile", "Desktop"]; // storefront skews mobile
const CHANNELS = ["Google", "Instagram", "Direct", "Whatsapp", "Facebook"];

const VISITOR_IDS = [
  "a3f19c74e2b8410d9c6f",
  "77b0d41ae95c4f2380aa",
  "c15e8a20fb7d49e6b331",
  "e94a2c6d3018475fa87b",
  "20d7fb51ac6e4839b0c2",
  "8fc3e07b62a94d15ae66",
  "5b1d9e48c70342f6a29d",
];

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!;

/** A fresh "online right now" snapshot — 3–6 visitors with recent page views. */
export function snapshotLive(): LiveVisitor[] {
  const count = 3 + Math.floor(Math.random() * 4);
  const online = [...VISITOR_IDS].sort(() => Math.random() - 0.5).slice(0, count);
  return online.map((id, i) => ({
    id,
    sessionId: `${id.slice(0, 8)}-s${i}`,
    currentPath: pick(PATHS),
    startedAt: secondsAgo(60 + Math.floor(Math.random() * 1500)), // 1–26 min into the visit
    lastSeen: secondsAgo(Math.floor(Math.random() * 40)), // 0–40s ago
    pageViews: 1 + Math.floor(Math.random() * 12),
    city: pick(CITIES),
    deviceType: pick(DEVICES),
    channel: pick(CHANNELS),
  }));
}
