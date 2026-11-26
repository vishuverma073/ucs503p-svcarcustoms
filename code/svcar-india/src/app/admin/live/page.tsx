"use client";

import { Loader2, Radio, AlertCircle, Eye, MapPin, Smartphone, Monitor } from "lucide-react";
import { useLive } from "@/lib/admin-hooks";
import type { LiveVisitor } from "@svcar/contracts";

function sinceLabel(iso: string): string {
  const sec = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  return `${Math.round(min / 60)}h ago`;
}

function onSiteLabel(iso: string): string {
  const sec = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  const min = Math.floor(sec / 60);
  if (min < 1) return `${sec}s`;
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

/** A visitor id is a random browser token, not a person — show a short, stable
 *  handle so two rows can be told apart without implying we know who they are. */
function visitorLabel(v: LiveVisitor): string {
  return `Visitor ${v.id.slice(0, 6).toUpperCase()}`;
}

function DeviceIcon({ deviceType }: { deviceType: string }) {
  const Icon = deviceType === "Desktop" ? Monitor : Smartphone;
  return <Icon size={13} className="shrink-0" />;
}

export default function LivePage() {
  const { data, isLoading, error } = useLive();
  const visitors = data?.items ?? [];

  return (
    <div className="max-w-5xl pb-20">
      <div className="mb-1 flex items-center gap-3">
        <h1 className="text-xl font-bold text-text-primary">Live</h1>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500/10 px-2.5 py-1 text-xs font-semibold text-green-600">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
          </span>
          {data ? `${data.onlineCount} online now` : "—"}
        </span>
      </div>
      <p className="mb-5 text-sm text-text-secondary">
        Everyone browsing the store in the last 5 minutes and the page they&rsquo;re on — signed in
        or not. Refreshes every 5 seconds. To see what people are holding in their carts, open{" "}
        <span className="font-medium text-text-primary">Leads</span>.
      </p>

      {isLoading && !data ? (
        <div className="flex justify-center py-20 text-text-muted">
          <Loader2 className="animate-spin" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-2 py-20 text-center text-text-secondary">
          <AlertCircle className="text-danger" />
          <p className="text-sm">Couldn&rsquo;t load live activity.</p>
        </div>
      ) : visitors.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-dim">
            <Radio className="text-text-muted" />
          </div>
          <p className="font-medium text-text-secondary">No one browsing right now</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {visitors.map((v) => (
            <div key={v.id} className="rounded-xl border border-border-light bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                    </span>
                    <span className="truncate font-semibold text-text-primary">
                      {visitorLabel(v)}
                    </span>
                  </div>
                  <p className="mt-1 flex items-center gap-1.5 text-[12px] text-text-secondary">
                    <Eye size={13} className="shrink-0" />
                    <span className="truncate font-mono">{v.currentPath}</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-text-muted">
                    On site {onSiteLabel(v.startedAt)} · {v.pageViews} page
                    {v.pageViews === 1 ? "" : "s"} · active {sinceLabel(v.lastSeen)}
                  </p>
                </div>
                {v.channel && (
                  <span className="shrink-0 rounded-full bg-surface-dim px-2 py-0.5 text-[11px] font-semibold text-text-muted">
                    {v.channel}
                  </span>
                )}
              </div>

              <div className="mt-3 flex items-center gap-3 rounded-lg bg-surface-dim/40 p-2.5 text-[12px] text-text-secondary">
                {v.city && (
                  <span className="flex items-center gap-1.5">
                    <MapPin size={13} className="shrink-0" /> {v.city}
                  </span>
                )}
                {v.deviceType && (
                  <span className="flex items-center gap-1.5">
                    <DeviceIcon deviceType={v.deviceType} /> {v.deviceType}
                  </span>
                )}
                {!v.city && !v.deviceType && <span className="text-text-muted">No device info</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
