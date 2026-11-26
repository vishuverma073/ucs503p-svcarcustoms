import { describe, expect, it, vi } from "vitest";
import {
  ADMIN_SW_SCOPE,
  captureInstallPrompt,
  hasInstallPrompt,
  installUiState,
  isIosDevice,
  isStandaloneDisplay,
  promptInstall,
  subscribeInstallPrompt,
} from "@/lib/admin-pwa";

describe("install control visibility", () => {
  it("hidden when already running as the installed app", () => {
    expect(installUiState({ standalone: true, ios: false, hasPrompt: true })).toBe("hidden");
    expect(installUiState({ standalone: true, ios: true, hasPrompt: false })).toBe("hidden");
  });

  it("Android/desktop Chrome with an install prompt → Install button", () => {
    expect(installUiState({ standalone: false, ios: false, hasPrompt: true })).toBe("prompt");
  });

  it("iPhone/iPad Safari → Share → Add to Home Screen instructions", () => {
    expect(installUiState({ standalone: false, ios: true, hasPrompt: false })).toBe("ios");
  });

  it("no prompt and not iOS (already installed / unsupported browser) → stays out of the way", () => {
    expect(installUiState({ standalone: false, ios: false, hasPrompt: false })).toBe("unavailable");
  });
});

describe("device checks", () => {
  it("detects iPhone, iPad (incl. iPadOS desktop UA) and not Android/Mac", () => {
    expect(isIosDevice({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)" })).toBe(true);
    expect(isIosDevice({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", platform: "MacIntel", maxTouchPoints: 5 })).toBe(true);
    expect(isIosDevice({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", platform: "MacIntel", maxTouchPoints: 0 })).toBe(false);
    expect(isIosDevice({ userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/130" })).toBe(false);
  });

  it("standalone via display-mode media query or iOS navigator.standalone", () => {
    const win = (matches: boolean, standalone?: boolean) =>
      ({ matchMedia: () => ({ matches }), navigator: { standalone } }) as unknown as Window;
    expect(isStandaloneDisplay(win(true))).toBe(true);
    expect(isStandaloneDisplay(win(false, true))).toBe(true);
    expect(isStandaloneDisplay(win(false))).toBe(false);
    expect(isStandaloneDisplay(undefined)).toBe(false);
  });

  it("worker scope is /admin (covers /admin itself, never the storefront)", () => {
    expect(ADMIN_SW_SCOPE).toBe("/admin");
  });
});

describe("beforeinstallprompt capture", () => {
  it("keeps the prompt, notifies listeners, and a prompt can only be used once", async () => {
    const target = new EventTarget();
    captureInstallPrompt(target as unknown as Window);
    const listener = vi.fn();
    const unsubscribe = subscribeInstallPrompt(listener);
    expect(hasInstallPrompt()).toBe(false);

    const evt = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt: vi.fn(async () => {}),
      userChoice: Promise.resolve({ outcome: "accepted" as const }),
    });
    target.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(true); // our button instead of Chrome's mini-infobar
    expect(hasInstallPrompt()).toBe(true);
    expect(listener).toHaveBeenCalled();

    await expect(promptInstall()).resolves.toBe("accepted");
    expect(evt.prompt).toHaveBeenCalledTimes(1);
    expect(hasInstallPrompt()).toBe(false);
    await expect(promptInstall()).resolves.toBe("unavailable");
    unsubscribe();
  });
});
