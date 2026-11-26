"use client";

import Link from "next/link";
import { ChevronRight, IndianRupee, Phone, ShoppingCart, Truck } from "lucide-react";
import type { AdminPhoneLeadList } from "@svcar/contracts";
import { cn } from "@/lib/utils";
import type { AdminOrderItem } from "@/lib/admin-api";
import { useLatestOrders, useOrderStats, usePhoneLeads } from "@/lib/admin-hooks";
import { formatUpdatedAgo } from "@/lib/live-refresh";
import { useLiveTracker, useNow } from "@/lib/use-live-list";
import LiveIndicator from "./LiveIndicator";

const orderIds = (items: AdminOrderItem[]) => items.map((o) => o.id);
const leadIds = (list: AdminPhoneLeadList) => list.items.map((r) => `${r.phone}|${r.lastActivityAt}`);

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  pending: { label: "Unpaid", cls: "bg-amber-100 text-amber-800" },
  paid: { label: "Paid", cls: "bg-blue-100 text-blue-800" },
  confirmed: { label: "Processing", cls: "bg-indigo-100 text-indigo-800" },
  shipped: { label: "Shipped", cls: "bg-purple-100 text-purple-800" },
  delivered: { label: "Delivered", cls: "bg-green-100 text-green-800" },
  cancelled: { label: "Cancelled", cls: "bg-red-100 text-red-700" },
  refunded: { label: "Refunded", cls: "bg-gray-200 text-gray-700" },
};

function inr(n: number) {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

function startOfToday(now: number): number {
  const d = now > 0 ? new Date(now) : new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** "just now" / "4 min ago" within the hour, else "14:05" today, else "21 Oct". */
function shortWhen(iso: string, now: number): string {
  const t = Date.parse(iso);
  if (now > 0 && now - t < 60 * 60 * 1000) return formatUpdatedAgo(now - t);
  const d = new Date(t);
  if (now > 0 && t >= startOfToday(now)) return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function fmtPhone(p: string) {
  return p.length === 10 ? `+91 ${p.slice(0, 5)} ${p.slice(5)}` : p;
}

function Tile({
  icon,
  label,
  value,
  sub,
  href,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  href: string;
  accent: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 rounded-xl border border-border-light bg-white p-3 shadow-sm active:bg-surface-dim sm:gap-3 sm:p-3.5"
    >
      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg sm:h-10 sm:w-10", accent)}>{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase leading-tight tracking-wide text-text-muted sm:text-[11px]">{label}</p>
        <p className="text-xl font-bold leading-tight text-text-primary tabular-nums">{value}</p>
        {sub && <p className="truncate text-[11px] text-text-secondary">{sub}</p>}
      </div>
    </Link>
  );
}

/**
 * Dashboard "right now" block — refreshes every 5s while visible: today's
 * orders and revenue, orders waiting to ship, today's new leads, and the
 * latest orders / leads with new arrivals highlighted.
 */
export default function LiveOverview() {
  const now = useNow();
  const { data: today } = useOrderStats("today");
  const orders = useLiveTracker(orderIds);
  const leads = useLiveTracker(leadIds);
  const { data: latestOrders } = useLatestOrders(orders.onData);
  const { data: phoneLeads } = usePhoneLeads(leads.onData);

  const toShip = (latestOrders ?? []).filter((o) => o.status === "paid" || o.status === "confirmed").length;
  const todayStart = startOfToday(now);
  const leadsToday = (phoneLeads?.items ?? []).filter((r) => r.popup && Date.parse(r.popup.lastAt) >= todayStart).length;
  const updatedAt = Math.max(orders.updatedAt ?? 0, leads.updatedAt ?? 0) || null;

  const recentOrders = (latestOrders ?? []).slice(0, 5);
  const recentLeads = (phoneLeads?.items ?? []).slice(0, 5);

  return (
    <section className="mb-6" aria-labelledby="live-overview-title" data-testid="live-overview">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="live-overview-title" className="text-sm font-bold uppercase tracking-wide text-text-secondary">
          Right now
        </h2>
        <LiveIndicator updatedAt={updatedAt} />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          href="/admin/orders"
          icon={<ShoppingCart size={18} className="text-blue-600" />}
          accent="bg-blue-50"
          label="Orders today"
          value={today ? String(today.totalOrders) : "—"}
          sub={today ? `${today.statusCounts.pending ?? 0} unpaid` : undefined}
        />
        <Tile
          href="/admin/orders"
          icon={<IndianRupee size={18} className="text-green-600" />}
          accent="bg-green-50"
          // Money actually received — unpaid / abandoned orders don't count.
          label="Paid today"
          value={today?.paidRevenue != null ? inr(today.paidRevenue) : "—"}
          sub="received online / COD advance"
        />
        <Tile
          href="/admin/orders"
          icon={<Truck size={18} className="text-indigo-600" />}
          accent="bg-indigo-50"
          label="To ship"
          value={latestOrders ? String(toShip) : "—"}
          sub="last 7 days"
        />
        <Tile
          href="/admin/phone-leads"
          icon={<Phone size={18} className="text-brand-orange" />}
          accent="bg-brand-orange/10"
          label="Leads today"
          value={phoneLeads ? String(leadsToday) : "—"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-border-light bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-border-light px-4 py-3">
            <h3 className="text-sm font-semibold text-text-primary">Latest orders</h3>
            <Link href="/admin/orders" className="inline-flex items-center text-xs font-semibold text-brand-orange">
              All orders <ChevronRight size={14} aria-hidden />
            </Link>
          </div>
          {recentOrders.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-text-muted">
              {latestOrders ? "No orders in the last 7 days yet." : "Loading…"}
            </p>
          ) : (
            <ul className="divide-y divide-border-light">
              {recentOrders.map((o) => {
                const st = STATUS_LABEL[o.status] ?? { label: o.status, cls: "bg-surface-dim text-text-secondary" };
                const fresh = orders.highlighted.has(o.id);
                return (
                  <li key={o.id} className={cn(fresh && "admin-new-row")} data-new={fresh || undefined}>
                    <Link href={`/admin/orders/${o.id}`} className="flex min-h-[56px] items-center gap-3 px-4 py-2.5 active:bg-surface-dim">
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
                          <span className="truncate">{o.orderNumber}</span>
                          {fresh && (
                            <span className="rounded bg-brand-orange px-1.5 py-px text-[9px] font-bold uppercase text-white">New</span>
                          )}
                        </p>
                        <p className="truncate text-xs text-text-secondary">
                          {o.customerName || "Customer"} · {o.paymentMethod === "cod" ? "COD" : "Prepaid"} · {shortWhen(o.createdAt, now)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-bold tabular-nums text-text-primary">{inr(o.total)}</p>
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", st.cls)}>{st.label}</span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="overflow-hidden rounded-xl border border-border-light bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-border-light px-4 py-3">
            <h3 className="text-sm font-semibold text-text-primary">Latest leads</h3>
            <Link href="/admin/phone-leads" className="inline-flex items-center text-xs font-semibold text-brand-orange">
              All leads <ChevronRight size={14} aria-hidden />
            </Link>
          </div>
          {recentLeads.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-text-muted">{phoneLeads ? "No phone leads yet." : "Loading…"}</p>
          ) : (
            <ul className="divide-y divide-border-light">
              {recentLeads.map((r) => {
                const id = `${r.phone}|${r.lastActivityAt}`;
                const fresh = leads.highlighted.has(id);
                return (
                  <li key={r.phone} className={cn("flex min-h-[56px] items-center gap-3 px-4 py-2.5", fresh && "admin-new-row")} data-new={fresh || undefined}>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 text-sm font-semibold tabular-nums text-text-primary">
                        {fmtPhone(r.phone)}
                        {fresh && (
                          <span className="rounded bg-brand-orange px-1.5 py-px text-[9px] font-bold uppercase text-white">New</span>
                        )}
                      </p>
                      <p className="truncate text-xs text-text-secondary">
                        {r.name ? `${r.name} · ` : ""}
                        {r.popup ? `Popup${r.popup.lastPagePath ? ` on ${r.popup.lastPagePath}` : ""}` : "Order"} ·{" "}
                        {shortWhen(r.lastActivityAt, now)}
                      </p>
                    </div>
                    <a
                      href={`tel:+91${r.phone}`}
                      aria-label={`Call ${fmtPhone(r.phone)}`}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-dim text-text-secondary active:bg-border"
                    >
                      <Phone size={16} aria-hidden />
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
