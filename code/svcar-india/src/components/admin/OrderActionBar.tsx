"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, MessageCircle, PhoneCall, Truck, PackageCheck, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { adminApi, type AdminOrderDetail } from "@/lib/admin-api";
import {
  buildShipNote,
  COURIER_SUGGESTIONS,
  nextOrderAction,
  telHref,
  whatsappHref,
} from "@/lib/order-actions";
import BottomSheet from "./BottomSheet";

/**
 * Sticky bottom action area on the order page (thumb reach on phones):
 * Call · WhatsApp · the one next step (Confirm → Ship → Delivered → collect COD).
 * Uses the same POST /admin/orders/:id/events as the fulfilment card above.
 */
export default function OrderActionBar({
  order,
  onChanged,
}: {
  order: AdminOrderDetail;
  onChanged: () => void | Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false);
  const [shipOpen, setShipOpen] = useState(false);
  const [courier, setCourier] = useState("");
  const [tracking, setTracking] = useState("");

  const action = nextOrderAction(order);
  const address = order.shippingAddress as Record<string, unknown>;
  const phone = order.customerPhone || (typeof address.phone === "string" ? address.phone : "");
  const tel = telHref(phone);
  const wa = whatsappHref(phone, { customerName: order.customerName, orderNumber: order.orderNumber });

  async function post(event: "confirmed" | "shipped" | "delivered", note?: string) {
    setBusy(true);
    try {
      await adminApi.addOrderEvent(order.id, event, note ? { note } : {});
      toast.success(
        event === "confirmed" ? "Order confirmed" : event === "shipped" ? "Marked as shipped" : "Marked as delivered",
      );
      await onChanged();
      return true;
    } catch {
      toast.error("Couldn’t update the order — try again");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function collect() {
    setBusy(true);
    try {
      await adminApi.collectCod(order.id);
      toast.success("COD balance marked as collected");
      await onChanged();
    } catch {
      toast.error("Couldn’t record COD collection");
    } finally {
      setBusy(false);
    }
  }

  function onPrimary() {
    if (busy) return;
    if (action.kind === "confirm") void post("confirmed");
    else if (action.kind === "ship") setShipOpen(true);
    else if (action.kind === "deliver") void post("delivered");
    else if (action.kind === "collect-cod") void collect();
  }

  const PrimaryIcon =
    action.kind === "confirm" ? Check : action.kind === "ship" ? Truck : action.kind === "deliver" ? PackageCheck : Wallet;

  return (
    <>
      <div
        className="fixed inset-x-0 z-30 border-t border-border-light bg-white px-3 py-2.5 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] bottom-[calc(56px_+_env(safe-area-inset-bottom))] lg:bottom-0 lg:left-60"
        data-testid="order-action-bar"
      >
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          {tel && (
            <a
              href={tel}
              aria-label={`Call ${order.customerName || "customer"}`}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border text-text-primary active:bg-surface-dim sm:w-auto sm:gap-1.5 sm:px-3 sm:text-sm sm:font-semibold"
            >
              <PhoneCall size={18} aria-hidden />
              <span className="hidden sm:inline">Call</span>
            </a>
          )}
          {wa && (
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`WhatsApp ${order.customerName || "customer"}`}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-whatsapp/10 text-whatsapp active:bg-whatsapp/20 sm:w-auto sm:gap-1.5 sm:px-3 sm:text-sm sm:font-semibold"
            >
              <MessageCircle size={18} aria-hidden />
              <span className="hidden sm:inline">WhatsApp</span>
            </a>
          )}
          {action.kind === "none" ? (
            <span
              className="flex h-12 flex-1 items-center justify-center rounded-xl bg-surface-dim px-3 text-sm font-semibold text-text-secondary"
              data-testid="order-next-action"
            >
              {order.status === "delivered" && <Check size={16} className="mr-1.5 text-green-600" aria-hidden />}
              {action.label}
            </span>
          ) : (
            <button
              type="button"
              onClick={onPrimary}
              disabled={busy}
              className={cn(
                "btn btn-primary h-12 flex-1 justify-center text-sm disabled:opacity-60",
                action.kind === "collect-cod" && "bg-green-600 hover:bg-green-700",
              )}
              data-testid="order-next-action"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <PrimaryIcon size={16} aria-hidden />}
              {action.label}
            </button>
          )}
        </div>
      </div>

      <BottomSheet
        open={shipOpen}
        onClose={() => setShipOpen(false)}
        busy={busy}
        title={`Ship ${order.orderNumber}`}
        subtitle="Courier and tracking number are optional — they're added to the order timeline."
        footer={
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              if (await post("shipped", buildShipNote(courier, tracking))) {
                setShipOpen(false);
                setCourier("");
                setTracking("");
              }
            }}
            className="btn btn-primary h-12 w-full justify-center text-sm disabled:opacity-60"
            data-testid="ship-confirm"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Truck size={16} aria-hidden />}
            Mark as shipped
          </button>
        }
      >
        <div className="space-y-3 pb-1">
          <div>
            <label htmlFor="ship-courier" className="input-label">
              Courier <span className="font-normal text-text-muted">(optional)</span>
            </label>
            <input
              id="ship-courier"
              list="ship-courier-options"
              value={courier}
              onChange={(e) => setCourier(e.target.value)}
              placeholder="e.g. Delhivery"
              autoComplete="off"
              className="input text-base"
              maxLength={60}
            />
            <datalist id="ship-courier-options">
              {COURIER_SUGGESTIONS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {COURIER_SUGGESTIONS.slice(0, 4).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCourier(c)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-semibold",
                    courier === c ? "border-brand-orange bg-brand-orange/5 text-brand-orange" : "border-border text-text-secondary",
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="ship-tracking" className="input-label">
              Tracking / AWB number <span className="font-normal text-text-muted">(optional)</span>
            </label>
            <input
              id="ship-tracking"
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
              placeholder="e.g. 1234567890123"
              autoComplete="off"
              autoCapitalize="characters"
              className="input text-base"
              maxLength={60}
            />
          </div>
        </div>
      </BottomSheet>
    </>
  );
}
