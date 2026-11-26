"use client";

import { useState } from "react";
import Link from "next/link";
import { BellRing, X } from "lucide-react";
import { useInstallState } from "./InstallApp";
import { usePushStatus } from "./NotificationsCard";

const DISMISS_KEY = "svcar-admin-phone-banner-dismissed";

function readDismissed(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Dashboard nudge: "get order alerts on this phone". Shown only while this
 * device could still install the app or turn on notifications; dismissible.
 */
export default function PhoneAppBanner() {
  const install = useInstallState();
  const { view } = usePushStatus();
  const [dismissed, setDismissed] = useState(readDismissed);

  const canInstall = install === "prompt" || install === "ios";
  const canEnable = view.state === "off" || view.state === "ios-install-first";
  if (dismissed || (!canInstall && !canEnable)) return null;

  const text =
    view.state === "ios-install-first"
      ? "Add SV Admin to your Home Screen to get an alert for every new order and lead."
      : canEnable
        ? "Turn on notifications to get an alert the moment an order is paid or a lead comes in."
        : "Install SV Admin on this phone — one tap from your home screen.";

  return (
    <div
      className="mb-5 flex items-start gap-3 rounded-xl border border-brand-orange/30 bg-brand-orange/5 p-3.5"
      data-testid="phone-app-banner"
    >
      <BellRing size={20} className="mt-0.5 shrink-0 text-brand-orange" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-text-primary">{text}</p>
        <Link href="/admin/settings#phone-app" className="mt-2 inline-flex min-h-[36px] items-center text-sm font-semibold text-brand-orange">
          Set up this phone →
        </Link>
      </div>
      <button
        type="button"
        onClick={() => {
          setDismissed(true);
          try {
            window.localStorage.setItem(DISMISS_KEY, "1");
          } catch {
            /* ignore */
          }
        }}
        aria-label="Dismiss"
        className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-muted hover:bg-surface-dim"
      >
        <X size={16} />
      </button>
    </div>
  );
}
