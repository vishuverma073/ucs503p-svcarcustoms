"use client";

import { useEffect, useId } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Phone-first sheet: slides up from the bottom on phones (thumb reach), a
 * centred dialog from `sm` up. Esc / backdrop / ✕ close it; the page behind
 * doesn't scroll while it's open. The footer stays pinned above the keyboard
 * area so the main action is always reachable.
 */
export default function BottomSheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  busy = false,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Blocks closing while a save is in flight. */
  busy?: boolean;
  className?: string;
}) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, busy, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/45" onClick={busy ? undefined : onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "admin-sheet relative flex w-full max-h-[88dvh] flex-col rounded-t-2xl border border-border-light bg-white shadow-xl sm:max-w-lg sm:rounded-2xl",
          className,
        )}
      >
        {/* Grab handle (visual only) */}
        <div className="flex justify-center pt-2 sm:hidden" aria-hidden>
          <span className="h-1 w-10 rounded-full bg-border" />
        </div>
        <div className="flex items-start gap-3 border-b border-border-light px-4 pb-3 pt-2 sm:pt-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-bold text-text-primary">
              {title}
            </h2>
            {subtitle && <div className="mt-0.5 text-xs text-text-secondary">{subtitle}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="-mr-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-text-muted hover:bg-surface-dim disabled:opacity-40"
          >
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3">{children}</div>
        {footer && (
          <div
            className="border-t border-border-light px-4 pt-3"
            style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
