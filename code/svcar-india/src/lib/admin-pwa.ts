/**
 * Admin PWA plumbing: the admin-only service worker, the "Install app" prompt,
 * and the small browser checks both need. The storefront never imports this.
 *
 * The worker (public/admin-sw.js) is registered with scope "/admin" so it can
 * only ever control admin pages. It is NOT registered in mock mode: the MSW
 * worker (scope "/") serves the mocked API there, and a more specific "/admin"
 * worker would take admin pages away from it.
 */
import { USE_MOCKS } from "@/lib/api-config";

export const ADMIN_SW_URL = "/admin-sw.js";
/** Matches the manifest scope. "/admin" (no trailing slash) so the dashboard itself is inside it. */
export const ADMIN_SW_SCOPE = "/admin";

// ── Browser checks ──────────────────────────────────────────────────────────

/** Running as the installed app (Android/desktop standalone window, iPhone home-screen app). */
export function isStandaloneDisplay(win: Pick<Window, "matchMedia" | "navigator"> | undefined): boolean {
  if (!win) return false;
  const iosStandalone = (win.navigator as Navigator & { standalone?: boolean }).standalone === true;
  let media = false;
  try {
    media = win.matchMedia("(display-mode: standalone)").matches || win.matchMedia("(display-mode: fullscreen)").matches;
  } catch {
    media = false;
  }
  return iosStandalone || media;
}

/** iPhone / iPad (iPadOS reports itself as a Mac with touch). */
export function isIosDevice(nav: { userAgent: string; platform?: string; maxTouchPoints?: number } | undefined): boolean {
  if (!nav) return false;
  if (/iPhone|iPad|iPod/i.test(nav.userAgent)) return true;
  return nav.platform === "MacIntel" && (nav.maxTouchPoints ?? 0) > 1;
}

export function pushSupported(win: Window | undefined): boolean {
  return Boolean(win && "serviceWorker" in win.navigator && "PushManager" in win && "Notification" in win);
}

// ── Install prompt ──────────────────────────────────────────────────────────

/** Chrome's `beforeinstallprompt` event (not in lib.dom). */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform?: string }>;
}

export type InstallUiState = "hidden" | "prompt" | "ios" | "unavailable";

/**
 * What the "Install app" control should show:
 * - hidden      — already running as the installed app
 * - prompt      — Android/desktop Chrome/Edge offered an install prompt
 * - ios         — iPhone/iPad Safari: show "Share → Add to Home Screen"
 * - unavailable — no prompt (already installed in this browser, or a browser
 *                 that can't install); the control stays out of the way
 */
export function installUiState(input: { standalone: boolean; ios: boolean; hasPrompt: boolean }): InstallUiState {
  if (input.standalone) return "hidden";
  if (input.hasPrompt) return "prompt";
  if (input.ios) return "ios";
  return "unavailable";
}

type Listener = () => void;
let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<Listener>();
let captureStarted = false;

function emit() {
  for (const l of listeners) l();
}

/**
 * Start listening for Chrome's install prompt (idempotent). Called from the
 * admin layout's first effect: Chrome only offers the prompt after the page has
 * loaded and the user has engaged with it, so this is always in time.
 */
export function captureInstallPrompt(win: Window | undefined = typeof window === "undefined" ? undefined : window) {
  if (!win || captureStarted) return;
  captureStarted = true;
  win.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // we show our own "Install app" button instead of Chrome's mini-infobar
    deferredPrompt = e as BeforeInstallPromptEvent;
    emit();
  });
  win.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    installed = true;
    emit();
  });
}

export function subscribeInstallPrompt(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function hasInstallPrompt(): boolean {
  return deferredPrompt != null && !installed;
}

/** Show Chrome's install dialog. Resolves to the user's choice ("unavailable" without a prompt). */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const evt = deferredPrompt;
  if (!evt) return "unavailable";
  // A prompt event can be used once.
  deferredPrompt = null;
  emit();
  await evt.prompt();
  const choice = await evt.userChoice;
  if (choice.outcome === "accepted") installed = true;
  emit();
  return choice.outcome;
}

// ── Service worker ─────────────────────────────────────────────────────────

function isAdminWorker(reg: ServiceWorkerRegistration): boolean {
  const url = reg.active?.scriptURL || reg.waiting?.scriptURL || reg.installing?.scriptURL || "";
  return url.endsWith(ADMIN_SW_URL);
}

/**
 * Register the admin worker (live mode). In mock mode, instead remove any admin
 * worker left over from a live run on the same origin, so MSW keeps /admin.
 */
export async function registerAdminServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  if (USE_MOCKS) {
    const regs = await navigator.serviceWorker.getRegistrations().catch(() => [] as ServiceWorkerRegistration[]);
    await Promise.all(regs.filter(isAdminWorker).map((r) => r.unregister().catch(() => false)));
    return null;
  }
  try {
    return await navigator.serviceWorker.register(ADMIN_SW_URL, { scope: ADMIN_SW_SCOPE, updateViaCache: "none" });
  } catch (err) {
    console.warn("[admin-sw] registration failed", err);
    return null;
  }
}

/** The admin worker's registration (registering it if needed); null in mock mode / unsupported. */
export async function getAdminServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (USE_MOCKS || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  const existing = await navigator.serviceWorker.getRegistration(ADMIN_SW_SCOPE).catch(() => undefined);
  if (existing && isAdminWorker(existing)) return existing;
  return registerAdminServiceWorker();
}
