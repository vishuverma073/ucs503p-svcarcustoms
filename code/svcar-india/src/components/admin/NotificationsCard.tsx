"use client";

import { useState, useSyncExternalStore } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Bell, BellOff, BellRing, Loader2, Send, ShoppingCart, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { USE_MOCKS } from "@/lib/api-config";
import { adminApi, AdminApiError, type PushTestResponse } from "@/lib/admin-api";
import { pushSupported } from "@/lib/admin-pwa";
import {
  currentSubscription,
  derivePushState,
  disablePushOnThisDevice,
  enablePushOnThisDevice,
  readPushPrefs,
  savePushPrefs,
  writePushPrefs,
  type PushPrefs,
  type PushStateView,
} from "@/lib/admin-push-client";
import { useIsIos, useIsStandalone } from "./InstallApp";

// ── Notification permission as an external store ───────────────────────────

const permissionListeners = new Set<() => void>();
function emitPermission() {
  for (const l of permissionListeners) l();
}
function subscribePermission(cb: () => void) {
  permissionListeners.add(cb);
  let status: PermissionStatus | null = null;
  // Picks up a change made in the browser's site settings while the page is open.
  navigator.permissions
    ?.query({ name: "notifications" as PermissionName })
    .then((s) => {
      status = s;
      s.addEventListener("change", emitPermission);
    })
    .catch(() => {});
  return () => {
    permissionListeners.delete(cb);
    status?.removeEventListener("change", emitPermission);
  };
}
function readPermission(): NotificationPermission | null {
  return typeof Notification === "undefined" ? null : Notification.permission;
}

const noopSubscribe = () => () => {};

/** Everything the card (and the dashboard banner) needs to know about push on this device. */
export function usePushStatus() {
  const supported = useSyncExternalStore(noopSubscribe, () => pushSupported(window), () => false);
  const ios = useIsIos();
  const standalone = useIsStandalone();
  const permission = useSyncExternalStore(subscribePermission, readPermission, () => null);
  const server = useSWR(USE_MOCKS || !supported ? null : ["admin/push/public-key"], () => adminApi.getPushPublicKey(), {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });
  const device = useSWR(USE_MOCKS || !supported ? null : ["admin/push/device"], () => currentSubscription(), {
    revalidateOnFocus: true,
    shouldRetryOnError: false,
  });

  // 404 (an API without /admin/push yet) / 503 = push not set up on the server;
  // anything else (offline, 5xx) is "couldn't check", not "keys missing".
  const notSetUp = server.error instanceof AdminApiError && [404, 503].includes(server.error.status);
  const serverEnabled = notSetUp ? false : server.data ? server.data.enabled : null;
  const view: PushStateView = derivePushState({
    mockMode: USE_MOCKS,
    supported,
    ios,
    standalone,
    permission,
    serverEnabled,
    serverUnreachable: Boolean(server.error) && !notSetUp,
    subscribed: device.data === undefined ? null : device.data != null,
  });
  return {
    view,
    publicKey: server.data?.publicKey ?? null,
    retryServer: () => server.mutate(),
    refreshDevice: () => device.mutate(),
  };
}

const PILL: Record<PushStateView["state"], { label: string; cls: string }> = {
  on: { label: "On", cls: "bg-green-100 text-green-800" },
  off: { label: "Off", cls: "bg-surface-dim text-text-secondary" },
  checking: { label: "Checking…", cls: "bg-surface-dim text-text-secondary" },
  denied: { label: "Blocked", cls: "bg-red-100 text-red-700" },
  "server-disabled": { label: "Unavailable", cls: "bg-amber-100 text-amber-800" },
  "server-unreachable": { label: "Offline?", cls: "bg-amber-100 text-amber-800" },
  unsupported: { label: "Not supported", cls: "bg-amber-100 text-amber-800" },
  "ios-install-first": { label: "Install first", cls: "bg-amber-100 text-amber-800" },
  "mock-mode": { label: "Mock mode", cls: "bg-amber-100 text-amber-800" },
};

function Toggle({
  checked,
  onChange,
  disabled,
  icon,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <label
      className={cn(
        "flex min-h-[52px] cursor-pointer items-center gap-3 rounded-xl border border-border-light px-3 py-2",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <span className="text-text-muted">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-text-primary">{label}</span>
        <span className="block text-xs text-text-secondary">{hint}</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-brand-orange",
          checked ? "bg-brand-orange" : "bg-border",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-[22px]" : "translate-x-0.5",
          )}
        />
      </span>
    </label>
  );
}

/**
 * Admin → Settings → "Phone notifications". Per device: enable (asks for
 * permission only on the tap), choose Orders / Leads, send a test, turn off.
 */
export default function NotificationsCard() {
  const { view, publicKey, refreshDevice, retryServer } = usePushStatus();
  const [prefs, setPrefs] = useState<PushPrefs>(() =>
    readPushPrefs(typeof window === "undefined" ? null : window.localStorage),
  );
  const [busy, setBusy] = useState<null | "enable" | "test" | "disable" | "prefs">(null);
  const [lastTest, setLastTest] = useState<PushTestResponse | null>(null);

  async function enable() {
    if (!publicKey) return;
    setBusy("enable");
    try {
      const res = await enablePushOnThisDevice(publicKey, prefs);
      if (res.ok) {
        setPrefs((p) => ({ ...p, enabled: true }));
        toast.success("Notifications are on for this device");
      } else if (res.reason === "denied") {
        toast.error("Notifications are blocked — allow them in the browser's site settings");
      } else if (res.reason === "dismissed") {
        toast("Notifications weren't allowed. Tap Enable to try again.");
      } else {
        toast.error(`Couldn't turn on notifications: ${res.error ?? "unknown error"}`);
      }
    } finally {
      emitPermission();
      await refreshDevice();
      setBusy(null);
    }
  }

  async function disable() {
    setBusy("disable");
    try {
      await disablePushOnThisDevice();
      setPrefs((p) => ({ ...p, enabled: false }));
      setLastTest(null);
      toast.success("Notifications are off for this device");
    } catch {
      toast.error("Couldn't turn notifications off");
    } finally {
      await refreshDevice();
      setBusy(null);
    }
  }

  async function changePref(key: "orders" | "leads", value: boolean) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    // Not subscribed yet: just remember the choice; Enable sends it along.
    if (view.state !== "on" || !publicKey) {
      writePushPrefs(window.localStorage, next);
      return;
    }
    setBusy("prefs");
    try {
      await savePushPrefs(publicKey, next);
      toast.success(`${key === "orders" ? "Order" : "Lead"} alerts ${value ? "on" : "off"} for this device`);
    } catch {
      setPrefs(prefs);
      writePushPrefs(window.localStorage, prefs);
      toast.error("Couldn't save — check your connection");
    } finally {
      setBusy(null);
    }
  }

  async function sendTest() {
    setBusy("test");
    try {
      const res = await adminApi.testPush();
      setLastTest(res);
      if (res.sent > 0) toast.success(`Test sent to ${res.sent} device${res.sent === 1 ? "" : "s"} — check your notifications`);
      else if (res.attempted === 0) toast.error("No devices are registered yet — tap Enable first");
      else toast.error("The push service didn't accept the test. See the details below.");
      if (res.removed > 0) await refreshDevice();
    } catch (err) {
      toast.error(
        err instanceof AdminApiError && err.code === "push_disabled"
          ? "Push is switched off on the server"
          : "Couldn't send the test notification",
      );
    } finally {
      setBusy(null);
    }
  }

  const pill = PILL[view.state];
  const on = view.state === "on";

  return (
    <div className="rounded-xl border border-border-light bg-white p-4 shadow-sm" data-testid="notifications-card" data-state={view.state}>
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
            on ? "bg-green-50 text-green-700" : "bg-brand-orange/10 text-brand-orange",
          )}
        >
          {on ? <BellRing size={20} aria-hidden /> : <Bell size={20} aria-hidden />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-bold text-text-primary">Phone notifications</h2>
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", pill.cls)} data-testid="push-state">
              {pill.label}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-text-secondary">
            An alert the moment an order is paid or someone leaves their number.
          </p>
        </div>
      </div>

      <p
        className={cn(
          "mt-3 rounded-lg px-3 py-2 text-sm",
          on ? "bg-green-50 text-green-800" : view.canEnable ? "bg-surface-dim text-text-secondary" : "bg-amber-50 text-amber-900",
        )}
        data-testid="push-message"
      >
        {view.message}
      </p>

      {view.state === "server-unreachable" && (
        <button
          type="button"
          onClick={() => void retryServer()}
          className="btn btn-secondary mt-3 min-h-[44px] w-full justify-center text-sm"
        >
          Try again
        </button>
      )}

      {view.canEnable && (
        <button
          type="button"
          onClick={() => void enable()}
          disabled={busy != null || !publicKey}
          className="btn btn-primary mt-3 min-h-[48px] w-full justify-center text-sm disabled:opacity-60"
          data-testid="push-enable"
        >
          {busy === "enable" ? <Loader2 size={16} className="animate-spin" /> : <Bell size={16} aria-hidden />}
          Enable notifications
        </button>
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Toggle
          checked={prefs.orders}
          onChange={(v) => void changePref("orders", v)}
          disabled={busy != null}
          icon={<ShoppingCart size={18} />}
          label="New orders"
          hint="When a payment or COD advance comes in"
        />
        <Toggle
          checked={prefs.leads}
          onChange={(v) => void changePref("leads", v)}
          disabled={busy != null}
          icon={<Phone size={18} />}
          label="New leads"
          hint="When a shopper leaves their number"
        />
      </div>

      {(view.canTest || view.canDisable) && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          {view.canTest && (
            <button
              type="button"
              onClick={() => void sendTest()}
              disabled={busy != null}
              className="btn btn-secondary min-h-[44px] flex-1 justify-center text-sm"
              data-testid="push-test"
            >
              {busy === "test" ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} aria-hidden />}
              Send test notification
            </button>
          )}
          {view.canDisable && (
            <button
              type="button"
              onClick={() => void disable()}
              disabled={busy != null}
              className="btn btn-ghost min-h-[44px] justify-center text-sm text-text-secondary"
              data-testid="push-disable"
            >
              <BellOff size={16} aria-hidden /> Turn off on this device
            </button>
          )}
        </div>
      )}

      {lastTest && lastTest.results.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-text-secondary" data-testid="push-test-results">
          {lastTest.results.map((r) => (
            <li key={r.id} className="flex items-center gap-2">
              <span className={cn("h-2 w-2 rounded-full", r.ok ? "bg-green-500" : "bg-red-500")} aria-hidden />
              <span className="truncate">
                {r.endpointHost}: {r.ok ? `delivered to push service (${r.statusCode})` : r.removed ? "expired — removed" : r.error}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
