/**
 * Admin phone notifications (Web Push), browser side.
 *
 * The Settings card walks a small state machine ({@link derivePushState}):
 * whether this browser can do push at all, whether the server has VAPID keys,
 * the notification permission, and whether this device is subscribed. Enabling
 * asks for permission only from the button tap, subscribes through the admin
 * service worker with the server's public key, and posts the subscription to
 * POST /admin/push/subscribe. Per-device choices (orders / leads) live here in
 * localStorage and are sent along with every subscribe.
 */
import { adminApi } from "@/lib/admin-api";
import { getAdminServiceWorker } from "@/lib/admin-pwa";

export type PushUiState =
  | "checking"
  | "mock-mode"
  | "ios-install-first"
  | "unsupported"
  | "server-disabled"
  | "server-unreachable"
  | "denied"
  | "off"
  | "on";

export interface PushStateInput {
  mockMode: boolean;
  /** serviceWorker + PushManager + Notification exist. */
  supported: boolean;
  ios: boolean;
  standalone: boolean;
  /** null while unknown. */
  permission: NotificationPermission | null;
  /** From GET /admin/push/public-key; null while loading. */
  serverEnabled: boolean | null;
  /** The key request failed for a network / server reason (not "push not set up"). */
  serverUnreachable?: boolean;
  /** This device has a push subscription; null while loading. */
  subscribed: boolean | null;
}

export interface PushStateView {
  state: PushUiState;
  /** One line for the card. */
  message: string;
  canEnable: boolean;
  canTest: boolean;
  canDisable: boolean;
}

export function derivePushState(i: PushStateInput): PushStateView {
  const view = (state: PushUiState, message: string, flags: Partial<PushStateView> = {}): PushStateView => ({
    state,
    message,
    canEnable: false,
    canTest: false,
    canDisable: false,
    ...flags,
  });

  if (i.mockMode) {
    return view(
      "mock-mode",
      "Mock mode: phone notifications need the live admin (the mock service worker owns /admin here).",
    );
  }
  // iPhone/iPad only allow push for apps added to the Home Screen (iOS 16.4+),
  // and Safari tabs don't even expose PushManager — so check this first.
  if (i.ios && !i.standalone) {
    return view(
      "ios-install-first",
      "On iPhone, first add SV Admin to your Home Screen (Share → Add to Home Screen), open it from there, then tap Enable here.",
    );
  }
  if (!i.supported) {
    return view("unsupported", "This browser can't show push notifications. Use Chrome on Android or the iPhone Home Screen app.");
  }
  if (i.serverUnreachable) {
    return view("server-unreachable", "Couldn't reach the server to check notifications — check your connection and try again.");
  }
  if (i.serverEnabled === null || i.subscribed === null || i.permission === null) {
    return view("checking", "Checking this device…");
  }
  if (!i.serverEnabled) {
    return view("server-disabled", "Push is switched off on the server (VAPID keys not set). Ask the developer to add them.");
  }
  if (i.permission === "denied") {
    return view(
      "denied",
      "Notifications are blocked for this site. Allow them in the browser's site settings (lock icon → Notifications), then come back.",
    );
  }
  if (i.subscribed && i.permission === "granted") {
    return view("on", "On for this device. You'll get an alert for every paid order and new lead you've ticked below.", {
      canTest: true,
      canDisable: true,
    });
  }
  return view("off", "Off on this device. Tap Enable — your phone will ask to allow notifications.", { canEnable: true });
}

// ── Per-device preferences ─────────────────────────────────────────────────

export interface PushPrefs {
  orders: boolean;
  leads: boolean;
  /** The admin turned notifications on here (and hasn't turned them off). */
  enabled: boolean;
}

export const PUSH_PREFS_KEY = "svcar-admin-push-prefs";
export const DEFAULT_PUSH_PREFS: PushPrefs = { orders: true, leads: true, enabled: false };

export function readPushPrefs(storage: Pick<Storage, "getItem"> | null | undefined): PushPrefs {
  try {
    const raw = storage?.getItem(PUSH_PREFS_KEY);
    if (!raw) return { ...DEFAULT_PUSH_PREFS };
    const p = JSON.parse(raw) as Partial<PushPrefs>;
    return {
      orders: p.orders !== false,
      leads: p.leads !== false,
      enabled: p.enabled === true,
    };
  } catch {
    return { ...DEFAULT_PUSH_PREFS };
  }
}

export function writePushPrefs(storage: Pick<Storage, "setItem"> | null | undefined, prefs: PushPrefs): void {
  try {
    storage?.setItem(PUSH_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* private mode — prefs just won't stick */
  }
}

const localStore = () => (typeof window === "undefined" ? null : window.localStorage);

// ── Keys ───────────────────────────────────────────────────────────────────

/** VAPID public key (base64url) → the bytes PushManager.subscribe wants. */
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Was this subscription made with this server key? (False after a VAPID key change.) */
export function sameServerKey(current: ArrayBuffer | null | undefined, expected: Uint8Array): boolean {
  if (!current) return false;
  const a = new Uint8Array(current);
  if (a.length !== expected.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== expected[i]) return false;
  return true;
}

// ── Browser actions ────────────────────────────────────────────────────────

async function activeRegistration(): Promise<ServiceWorkerRegistration> {
  const reg = await getAdminServiceWorker();
  if (!reg) throw new Error("The admin service worker isn't available on this device.");
  if (reg.active) return reg;
  const worker = reg.installing ?? reg.waiting;
  if (worker) {
    await new Promise<void>((resolve) => {
      const done = () => worker.state === "activated" && resolve();
      worker.addEventListener("statechange", done);
      done();
      setTimeout(resolve, 10_000);
    });
  }
  return reg;
}

/** This device's current push subscription for the admin worker (null if none / unavailable). */
export async function currentSubscription(): Promise<PushSubscription | null> {
  try {
    const reg = await getAdminServiceWorker();
    return (await reg?.pushManager.getSubscription()) ?? null;
  } catch {
    return null;
  }
}

/** Subscribe (re-subscribing if the server key changed) and register the device with the API. */
async function subscribeAndRegister(publicKey: string, prefs: PushPrefs): Promise<PushSubscription> {
  const reg = await activeRegistration();
  const key = urlBase64ToUint8Array(publicKey);
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameServerKey(sub.options.applicationServerKey, key)) {
    await sub.unsubscribe().catch(() => false);
    sub = null;
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  await adminApi.subscribePush(sub.toJSON(), { notifyOrders: prefs.orders, notifyLeads: prefs.leads });
  return sub;
}

export type EnableResult =
  | { ok: true; subscription: PushSubscription }
  | { ok: false; reason: "denied" | "dismissed" | "error"; error?: string };

/**
 * The "Enable notifications" tap. Must be called straight from the click
 * handler: the permission prompt is the first thing it does (iPhone refuses a
 * prompt that isn't tied to a tap).
 */
export async function enablePushOnThisDevice(publicKey: string, prefs: PushPrefs): Promise<EnableResult> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: permission === "denied" ? "denied" : "dismissed" };
  try {
    const next = { ...prefs, enabled: true };
    const subscription = await subscribeAndRegister(publicKey, next);
    writePushPrefs(localStore(), next);
    return { ok: true, subscription };
  } catch (err) {
    return { ok: false, reason: "error", error: err instanceof Error ? err.message : String(err) };
  }
}

/** Turn it off here: drop the browser subscription and forget it on the server. */
export async function disablePushOnThisDevice(): Promise<void> {
  const sub = await currentSubscription();
  writePushPrefs(localStore(), { ...readPushPrefs(localStore()), enabled: false });
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => false);
  await adminApi.unsubscribePush(endpoint).catch(() => undefined);
}

/** Save the Orders / Leads toggles for this device (re-posts the subscription). */
export async function savePushPrefs(publicKey: string, prefs: PushPrefs): Promise<void> {
  writePushPrefs(localStore(), prefs);
  if (prefs.enabled) await subscribeAndRegister(publicKey, prefs);
}

/**
 * Quiet re-sync on every admin load: if this device turned notifications on,
 * permission is still granted and the server has keys, make sure the browser
 * subscription exists (re-creating it after a key change or a dropped
 * subscription) and that the server has it. Never prompts, never throws.
 */
export async function syncPushSubscription(): Promise<"synced" | "skipped"> {
  try {
    if (typeof window === "undefined" || !("Notification" in window) || !("PushManager" in window)) return "skipped";
    const prefs = readPushPrefs(localStore());
    if (!prefs.enabled || Notification.permission !== "granted") return "skipped";
    const server = await adminApi.getPushPublicKey();
    if (!server.enabled || !server.publicKey) return "skipped";
    await subscribeAndRegister(server.publicKey, prefs);
    return "synced";
  } catch {
    return "skipped";
  }
}

export interface LogoutPushDeps {
  getSubscription: () => Promise<Pick<PushSubscription, "endpoint" | "unsubscribe"> | null>;
  unsubscribeOnServer: (endpoint: string, token: string) => Promise<unknown>;
  storage: Pick<Storage, "getItem" | "setItem"> | null;
}

const defaultLogoutDeps = (): LogoutPushDeps => ({
  getSubscription: currentSubscription,
  unsubscribeOnServer: (endpoint, token) => adminApi.unsubscribePush(endpoint, token),
  storage: localStore(),
});

/**
 * Signing out stops alerts on this device: tell the server to forget the
 * endpoint (with the session being ended), then drop the browser subscription.
 * Best-effort and fire-and-forget — logout never waits on it or fails by it.
 * Signing in again and tapping Enable turns them back on.
 */
export async function stopPushOnLogout(token: string | null, deps: LogoutPushDeps = defaultLogoutDeps()): Promise<void> {
  try {
    const sub = await deps.getSubscription();
    if (!sub) return;
    writePushPrefs(deps.storage, { ...readPushPrefs(deps.storage), enabled: false });
    if (token) await deps.unsubscribeOnServer(sub.endpoint, token).catch(() => undefined);
    await sub.unsubscribe().catch(() => false);
  } catch {
    /* never block or break logout */
  }
}
