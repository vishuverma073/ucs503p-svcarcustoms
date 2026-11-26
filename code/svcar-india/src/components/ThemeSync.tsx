"use client";

import { useEffect } from "react";
import { BRAND } from "@/lib/brand";

// Browser-chrome colour per mode — mirrors --color-surface in globals.css.
const THEME_COLOR = { light: "#FCFCFC", dark: "#0B0B0C" } as const;

/** The mode the visitor chose (localStorage) or the brand default. */
function resolveDark(): boolean {
  try {
    const stored = localStorage.getItem(BRAND.theme.storageKey);
    if (stored) return stored === "dark";
  } catch {
    /* private mode / storage disabled — fall through to the default */
  }
  return BRAND.theme.defaultMode === "dark";
}

/** Keep <meta name="theme-color"> (browser chrome on phones) in step with the mode. */
export function setThemeColor(dark: boolean): void {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = dark ? THEME_COLOR.dark : THEME_COLOR.light;
}

/** Re-apply the stored/default mode to <html> and the theme-color meta. */
function applyTheme(): void {
  const dark = resolveDark();
  document.documentElement.classList.toggle("dark", dark);
  setThemeColor(dark);
}

/**
 * Safety net behind the pre-paint theme script in layout.tsx. If React ever
 * recovers from a hydration mismatch by re-creating <html> (seen live on `/`,
 * React #418), it re-applies only React-owned attributes and the `dark` class
 * the inline script added is lost — so this re-applies the stored/default mode
 * after mount and on bfcache restores (`pageshow`). Renders nothing and holds no
 * state; ThemeToggle keeps owning user-driven changes.
 */
export function ThemeSync() {
  useEffect(() => {
    applyTheme();
    window.addEventListener("pageshow", applyTheme);
    return () => window.removeEventListener("pageshow", applyTheme);
  }, []);

  return null;
}
