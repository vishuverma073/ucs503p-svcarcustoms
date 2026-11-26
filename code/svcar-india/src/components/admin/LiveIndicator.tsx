"use client";

import { cn } from "@/lib/utils";
import { formatUpdatedAgo } from "@/lib/live-refresh";
import { useNow } from "@/lib/use-live-list";

/**
 * Small "● Live · updated just now" label for screens that poll every 5s.
 * The dot pulses while fresh; it greys out when the data is getting old
 * (e.g. the phone was offline), so a stale screen never looks live.
 */
export default function LiveIndicator({
  updatedAt,
  className,
}: {
  updatedAt: number | null;
  className?: string;
}) {
  const now = useNow();
  const age = updatedAt != null && now > 0 ? now - updatedAt : null;
  const stale = age != null && age > 30_000;
  const label = updatedAt == null ? "Live" : `Updated ${formatUpdatedAgo(age ?? 0)}`;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
        stale ? "bg-surface-dim text-text-muted" : "bg-green-50 text-green-700",
        className,
      )}
      aria-live="off"
      data-testid="live-indicator"
    >
      <span className="relative flex h-2 w-2" aria-hidden>
        {!stale && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-60" />}
        <span className={cn("relative inline-flex h-2 w-2 rounded-full", stale ? "bg-text-muted" : "bg-green-500")} />
      </span>
      {label}
    </span>
  );
}
