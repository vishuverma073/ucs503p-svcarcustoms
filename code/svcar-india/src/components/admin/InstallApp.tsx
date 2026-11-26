"use client";

import { useState, useSyncExternalStore } from "react";
import { Download, PlusSquare, Share, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  hasInstallPrompt,
  installUiState,
  isIosDevice,
  isStandaloneDisplay,
  promptInstall,
  subscribeInstallPrompt,
  type InstallUiState,
} from "@/lib/admin-pwa";
import BottomSheet from "./BottomSheet";

const noopSubscribe = () => () => {};

function subscribeDisplayMode(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  const mq = window.matchMedia("(display-mode: standalone)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

export function useIsStandalone(): boolean {
  return useSyncExternalStore(
    subscribeDisplayMode,
    () => isStandaloneDisplay(window),
    () => false,
  );
}

export function useIsIos(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => isIosDevice(navigator),
    () => false,
  );
}

/** Which "Install app" UI this device should see (see installUiState). */
export function useInstallState(): InstallUiState {
  const hasPrompt = useSyncExternalStore(subscribeInstallPrompt, hasInstallPrompt, () => false);
  const standalone = useIsStandalone();
  const ios = useIsIos();
  return installUiState({ standalone, ios, hasPrompt });
}

async function runInstall() {
  const outcome = await promptInstall();
  if (outcome === "accepted") toast.success("SV Admin is being added to your home screen");
}

/** iPhone / iPad: Safari has no install button, so spell out the two taps. */
export function IosInstallSteps({ className }: { className?: string }) {
  return (
    <ol className={cn("space-y-3 text-sm text-text-primary", className)}>
      <li className="flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-dim text-xs font-bold">1</span>
        <span>
          Tap <Share size={16} className="mx-0.5 inline align-[-3px] text-blue-600" aria-label="Share" />{" "}
          <b>Share</b> in Safari&rsquo;s toolbar.
        </span>
      </li>
      <li className="flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-dim text-xs font-bold">2</span>
        <span>
          Scroll down and tap <PlusSquare size={16} className="mx-0.5 inline align-[-3px]" aria-hidden />{" "}
          <b>Add to Home Screen</b>, then <b>Add</b>.
        </span>
      </li>
      <li className="flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-dim text-xs font-bold">3</span>
        <span>
          Open <b>SV Admin</b> from your Home Screen and turn on notifications in Settings.
        </span>
      </li>
    </ol>
  );
}

/**
 * Compact "Install app" control (top bar / More menu). Renders nothing when the
 * app is already installed here or the browser can't install it.
 */
export function InstallAppButton({ className, onDone }: { className?: string; onDone?: () => void }) {
  const state = useInstallState();
  const [iosOpen, setIosOpen] = useState(false);
  if (state !== "prompt" && state !== "ios") return null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (state === "prompt") void runInstall().finally(() => onDone?.());
          else setIosOpen(true);
        }}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-brand-orange/40 bg-brand-orange/5 px-3 py-1.5 text-xs font-semibold text-brand-orange",
          className,
        )}
        data-testid="install-app-button"
      >
        <Download size={14} aria-hidden /> Install app
      </button>
      <BottomSheet
        open={iosOpen}
        onClose={() => {
          setIosOpen(false);
          onDone?.();
        }}
        title="Add SV Admin to your Home Screen"
        subtitle="It opens like an app and can show order alerts."
      >
        <IosInstallSteps className="py-1" />
      </BottomSheet>
    </>
  );
}

/** Settings card. Hidden entirely when already running as the installed app. */
export function InstallAppCard() {
  const state = useInstallState();
  if (state === "hidden") return null;

  return (
    <div className="rounded-xl border border-border-light bg-white p-4 shadow-sm" data-testid="install-app-card">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-black text-white">
          <Smartphone size={20} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-text-primary">Install the SV Admin app</h2>
          <p className="mt-0.5 text-sm text-text-secondary">
            One tap from your home screen, full screen, and it stays signed in if you tick &ldquo;Keep me signed
            in&rdquo;.
          </p>
        </div>
      </div>
      {state === "prompt" && (
        <button
          type="button"
          onClick={() => void runInstall()}
          className="btn btn-primary mt-4 min-h-[44px] w-full justify-center text-sm sm:w-auto"
          data-testid="install-app-cta"
        >
          <Download size={16} aria-hidden /> Install app
        </button>
      )}
      {state === "ios" && <IosInstallSteps className="mt-4" />}
      {state === "unavailable" && (
        <p className="mt-3 rounded-lg bg-surface-dim px-3 py-2 text-xs text-text-secondary">
          Install from your phone: Android Chrome menu <b>⋮ → Install app</b> (or <b>Add to Home screen</b>), or
          iPhone Safari <b>Share → Add to Home Screen</b>. Already installed? Open SV Admin from the home screen.
        </p>
      )}
    </div>
  );
}
