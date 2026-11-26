"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, MoreHorizontal, Store } from "lucide-react";
import { cn } from "@/lib/utils";
import { isNavActive, mobileTabs, moreItems } from "./nav-items";
import BottomSheet from "./BottomSheet";
import { InstallAppButton } from "./InstallApp";

/**
 * Phone bottom tab bar (hidden ≥ lg): the four screens used on the go —
 * Dashboard, Orders, Phone leads, Products — plus "More" for everything else.
 * Every tab is a ≥56px touch target and the bar respects the iOS safe area.
 */
export default function BottomNav({ onLogout }: { onLogout: () => void }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const tabs = mobileTabs();
  const rest = moreItems();
  const moreActive = rest.some((i) => isNavActive(i.href, pathname));

  return (
    <>
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 grid grid-cols-5 bg-brand-black border-t border-white/10"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Admin"
      >
        {tabs.map((item) => {
          const Icon = item.icon;
          const active = isNavActive(item.href, pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-col items-center justify-center gap-1 px-1 py-2 min-h-[56px] text-[10px] font-medium transition-colors",
                active ? "text-brand-orange" : "text-white/55",
              )}
            >
              <Icon size={20} strokeWidth={active ? 2.4 : 2} aria-hidden />
              <span className="truncate max-w-full">{item.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          className={cn(
            "flex flex-col items-center justify-center gap-1 px-1 py-2 min-h-[56px] text-[10px] font-medium transition-colors",
            moreActive || moreOpen ? "text-brand-orange" : "text-white/55",
          )}
        >
          <MoreHorizontal size={20} strokeWidth={moreActive ? 2.4 : 2} aria-hidden />
          More
        </button>
      </nav>

      <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <div className="grid grid-cols-3 gap-2 pb-1">
          {rest.map((item) => {
            const Icon = item.icon;
            const active = isNavActive(item.href, pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMoreOpen(false)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-3 text-center text-xs font-semibold",
                  active
                    ? "border-brand-orange bg-brand-orange/5 text-brand-orange"
                    : "border-border-light text-text-primary active:bg-surface-dim",
                )}
              >
                <Icon size={20} aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border-light pt-3">
          <InstallAppButton onDone={() => setMoreOpen(false)} />
          <Link
            href="/"
            onClick={() => setMoreOpen(false)}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3 text-sm text-text-secondary hover:bg-surface-dim"
          >
            <Store size={16} aria-hidden /> View store
          </Link>
          <button
            type="button"
            onClick={() => {
              setMoreOpen(false);
              onLogout();
            }}
            className="ml-auto inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3 text-sm text-danger hover:bg-red-50"
          >
            <LogOut size={16} aria-hidden /> Log out
          </button>
        </div>
      </BottomSheet>
    </>
  );
}
