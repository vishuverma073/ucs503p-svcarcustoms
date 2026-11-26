"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertCircle, Copy, Download, Loader2, MessageCircle, Phone, PhoneCall, Search } from "lucide-react";
import { usePhoneLeads } from "@/lib/admin-hooks";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useLiveTracker } from "@/lib/use-live-list";
import LiveIndicator from "@/components/admin/LiveIndicator";
import type { AdminPhoneLead, AdminPhoneLeadList } from "@svcar/contracts";

/** A number counts as new when it first appears or has fresh activity (popup again, new order). */
const leadRowId = (r: AdminPhoneLead) => `${r.phone}|${r.lastActivityAt}`;
const leadIds = (list: AdminPhoneLeadList) => list.items.map(leadRowId);

// Same wording as Admin → Orders.
const STATUS_LABEL: Record<string, string> = {
  pending: "Pending payment",
  paid: "Payment confirmed",
  confirmed: "Processing",
  shipped: "Shipped",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
};
const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  paid: "bg-blue-100 text-blue-800",
  confirmed: "bg-indigo-100 text-indigo-800",
  shipped: "bg-purple-100 text-purple-800",
  delivered: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-700",
  refunded: "bg-gray-200 text-gray-700",
};

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "9876543210" → "98765 43210". */
function fmtPhone(p: string): string {
  return p.length === 10 ? `${p.slice(0, 5)} ${p.slice(5)}` : p;
}

function inr(n: number): string {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

/** CSV cell: quoted, and text that a spreadsheet would run as a formula is defused. */
function csvCell(v: string | number | null | undefined): string {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

function toCsv(rows: AdminPhoneLead[]): string {
  const header = [
    "phone",
    "name",
    "sources",
    "popup_count",
    "last_popup_at",
    "last_popup_page",
    "order_count",
    "latest_order_number",
    "latest_order_status",
    "latest_payment_status",
    "latest_order_total_inr",
    "latest_order_at",
    "last_activity_at",
  ];
  const lines = rows.map((r) =>
    [
      r.phone,
      r.name,
      r.sources.join("+"),
      r.popup?.count ?? 0,
      r.popup?.lastAt ?? "",
      r.popup?.lastPagePath ?? "",
      r.order?.count ?? 0,
      r.order?.latestOrderNumber ?? "",
      r.order?.latestStatus ?? "",
      r.order?.latestPaymentStatus ?? "",
      r.order?.latestTotal ?? "",
      r.order?.latestAt ?? "",
      r.lastActivityAt,
    ]
      .map(csvCell)
      .join(","),
  );
  return [header.join(","), ...lines].join("\r\n");
}

function SourceTags({ sources }: { sources: AdminPhoneLead["sources"] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {sources.map((s) => (
        <span
          key={s}
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            s === "popup" ? "bg-brand-orange text-white" : "bg-blue-600 text-white"
          }`}
        >
          {s === "popup" ? "Popup" : "Order"}
        </span>
      ))}
    </span>
  );
}

function PhoneCell({ phone }: { phone: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(phone);
      toast.success(`Copied ${fmtPhone(phone)}`);
    } catch {
      toast.error("Couldn’t copy to clipboard");
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={copy}
        title="Copy number"
        aria-label={`Copy ${fmtPhone(phone)}`}
        className="inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1 font-semibold tabular-nums text-text-primary hover:bg-surface-dim"
      >
        {fmtPhone(phone)}
        <Copy size={13} className="text-text-muted" aria-hidden="true" />
      </button>
      <a
        href={`https://wa.me/91${phone}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`WhatsApp ${fmtPhone(phone)}`}
        className="inline-flex items-center gap-1 rounded-full bg-whatsapp/10 px-2.5 py-1 text-[11px] font-semibold text-whatsapp hover:bg-whatsapp/20"
      >
        <MessageCircle size={13} aria-hidden="true" /> WhatsApp
      </a>
      <a
        href={`tel:+91${phone}`}
        aria-label={`Call ${fmtPhone(phone)}`}
        className="inline-flex items-center gap-1 rounded-full bg-surface-dim px-2.5 py-1 text-[11px] font-semibold text-text-secondary hover:bg-border"
      >
        <PhoneCall size={13} aria-hidden="true" /> Call
      </a>
    </div>
  );
}

function PopupInfo({ popup }: { popup: AdminPhoneLead["popup"] }) {
  if (!popup) return <span className="text-text-muted">—</span>;
  return (
    <div className="min-w-0">
      <p className="text-text-primary">
        {popup.count > 1 ? `${popup.count} times · ` : ""}
        {fmtWhen(popup.lastAt)}
      </p>
      {popup.lastPagePath && (
        <p className="truncate text-xs text-text-secondary" title={popup.lastPagePath}>
          on {popup.lastPagePath}
        </p>
      )}
    </div>
  );
}

function OrderInfo({ order }: { order: AdminPhoneLead["order"] }) {
  if (!order) return <span className="text-text-muted">—</span>;
  return (
    <div className="min-w-0">
      <p className="flex flex-wrap items-center gap-1.5">
        <Link href={`/admin/orders/${order.latestOrderId}`} className="font-semibold text-brand-orange hover:underline">
          {order.latestOrderNumber}
        </Link>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            STATUS_STYLE[order.latestStatus] ?? "bg-surface-dim text-text-secondary"
          }`}
        >
          {STATUS_LABEL[order.latestStatus] ?? order.latestStatus}
        </span>
        <span className="font-semibold text-text-primary">{inr(order.latestTotal)}</span>
      </p>
      <p className="text-xs text-text-secondary">
        {order.count > 1 ? `${order.count} orders · latest ` : ""}
        {fmtWhen(order.latestAt)}
      </p>
    </div>
  );
}

export default function PhoneLeadsPage() {
  const live = useLiveTracker(leadIds);
  const { data, isLoading, error } = usePhoneLeads(live.onData);
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search, 250);

  const all = useMemo(() => data?.items ?? [], [data]);
  const rows = useMemo(() => {
    const q = debounced.trim().toLowerCase();
    if (!q) return all;
    const digits = q.replace(/\D/g, "");
    return all.filter(
      (r) =>
        (digits.length > 0 && r.phone.includes(digits)) ||
        r.name.toLowerCase().includes(q) ||
        (r.order?.latestOrderNumber.toLowerCase().includes(q) ?? false),
    );
  }, [all, debounced]);

  async function copyNumbers() {
    if (rows.length === 0) return;
    try {
      await navigator.clipboard.writeText(rows.map((r) => `+91${r.phone}`).join("\n"));
      toast.success(`Copied ${rows.length} number${rows.length === 1 ? "" : "s"}`);
    } catch {
      toast.error("Couldn’t copy to clipboard");
    }
  }

  function downloadCsv() {
    if (rows.length === 0) return;
    const blob = new Blob([`﻿${toCsv(rows)}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `phone-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="max-w-6xl pb-20">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-xl font-bold text-text-primary">
          Phone leads <LiveIndicator updatedAt={live.updatedAt} />
        </h1>
        {data && (
          <span className="text-sm text-text-secondary">
            {data.totals.phones} numbers · {data.totals.popupPhones} from popup · {data.totals.orderPhones} from
            orders
          </span>
        )}
      </div>
      <p className="mb-4 text-sm text-text-secondary">
        Every number the store has: shared through the &ldquo;Need help finding the right part?&rdquo; popup, or
        given on an order. One row per number, newest activity first.
      </p>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            size={18}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
            aria-hidden="true"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by number, name or order…"
            aria-label="Search phone leads"
            className="input pl-10!"
            type="search"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={copyNumbers}
            disabled={rows.length === 0}
            className="btn btn-primary text-sm disabled:opacity-50"
          >
            <Copy size={15} aria-hidden="true" /> Copy numbers
          </button>
          <button
            type="button"
            onClick={downloadCsv}
            disabled={rows.length === 0}
            className="btn btn-secondary text-sm disabled:opacity-50"
          >
            <Download size={15} aria-hidden="true" /> CSV
          </button>
        </div>
      </div>

      {data?.truncated && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Showing the {data.limit} most recent numbers of {data.totals.phones}.
        </p>
      )}

      {isLoading ? (
        <div className="flex justify-center py-20 text-text-muted">
          <Loader2 className="animate-spin" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-2 py-20 text-center text-text-secondary">
          <AlertCircle className="text-danger" />
          <p className="text-sm">Couldn&rsquo;t load phone leads.</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-dim">
            <Phone className="text-text-muted" />
          </div>
          <p className="font-medium text-text-secondary">
            {all.length === 0 ? "No phone numbers yet" : "No numbers match that search"}
          </p>
        </div>
      ) : (
        <>
          {/* Phones: one card per number. */}
          <ul className="divide-y divide-border-light overflow-hidden rounded-xl border border-border-light bg-white shadow-sm md:hidden">
            {rows.map((r) => (
              <li
                key={r.phone}
                className={`space-y-2 p-4 ${live.highlighted.has(leadRowId(r)) ? "admin-new-row" : ""}`}
                data-new={live.highlighted.has(leadRowId(r)) || undefined}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    {live.highlighted.has(leadRowId(r)) && (
                      <span className="mb-1 ml-1.5 inline-block rounded bg-brand-orange px-1.5 py-px text-[9px] font-bold uppercase text-white">
                        New
                      </span>
                    )}
                    <PhoneCell phone={r.phone} />
                    <p className="mt-0.5 truncate px-1.5 text-sm text-text-secondary">{r.name || "—"}</p>
                  </div>
                  <SourceTags sources={r.sources} />
                </div>
                {r.popup && (
                  <div className="px-1.5 text-sm">
                    <p className="text-[11px] font-semibold uppercase text-text-muted">Popup</p>
                    <PopupInfo popup={r.popup} />
                  </div>
                )}
                {r.order && (
                  <div className="px-1.5 text-sm">
                    <p className="text-[11px] font-semibold uppercase text-text-muted">Latest order</p>
                    <OrderInfo order={r.order} />
                  </div>
                )}
              </li>
            ))}
          </ul>

          {/* Wider screens: a table. */}
          <div className="hidden overflow-x-auto rounded-xl border border-border-light bg-white shadow-sm md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border-light bg-surface-dim/60 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                <tr>
                  <th scope="col" className="px-4 py-2.5">Phone</th>
                  <th scope="col" className="px-4 py-2.5">Name</th>
                  <th scope="col" className="px-4 py-2.5">Source</th>
                  <th scope="col" className="px-4 py-2.5">Popup</th>
                  <th scope="col" className="px-4 py-2.5">Latest order</th>
                  <th scope="col" className="px-4 py-2.5">Last activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {rows.map((r) => (
                  <tr
                    key={r.phone}
                    className={`align-top hover:bg-surface-dim/40 ${live.highlighted.has(leadRowId(r)) ? "admin-new-row" : ""}`}
                    data-new={live.highlighted.has(leadRowId(r)) || undefined}
                  >
                    <td className="px-3 py-3">
                      <PhoneCell phone={r.phone} />
                    </td>
                    <td className="max-w-[180px] truncate px-4 py-3 text-text-primary">{r.name || "—"}</td>
                    <td className="px-4 py-3">
                      <SourceTags sources={r.sources} />
                    </td>
                    <td className="max-w-[220px] px-4 py-3">
                      <PopupInfo popup={r.popup} />
                    </td>
                    <td className="px-4 py-3">
                      <OrderInfo order={r.order} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-text-secondary">{fmtWhen(r.lastActivityAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
