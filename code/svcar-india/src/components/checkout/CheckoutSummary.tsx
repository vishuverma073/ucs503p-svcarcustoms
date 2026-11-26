"use client";

import { formatPrice } from "@/lib/utils";
import { amountToFreeShipping, type PricingSettings } from "@/lib/checkout";
import type { OrderTotals } from "@svcar/contracts";

/** Read-only GST-inclusive money breakdown (subtotal · promo · shipping · GST note · total). */
export default function CheckoutSummary({
  totals,
  settings,
  promoCode,
}: {
  totals: OrderTotals;
  settings?: PricingSettings;
  /** Code behind totals.discount, for the "Promo (DIWALI10)" label. */
  promoCode?: string | null;
}) {
  const discount = totals.discount ?? 0;
  const toFree = amountToFreeShipping(totals.subtotal, settings);
  const gstPct = settings?.gstRate ?? 18;

  return (
    <div className="space-y-2.5 text-sm">
      <div className="flex justify-between">
        <span className="text-text-secondary">Subtotal</span>
        <span className="font-semibold">{formatPrice(totals.subtotal)}</span>
      </div>
      {discount > 0 && (
        <div className="flex justify-between text-success">
          <span>Promo{promoCode ? ` (${promoCode})` : ""}</span>
          <span className="font-semibold">−{formatPrice(discount)}</span>
        </div>
      )}
      <div className="flex justify-between">
        <span className="text-text-secondary">Delivery</span>
        <span className={`font-semibold ${totals.shippingFee === 0 ? "text-success" : ""}`}>
          {totals.shippingFee === 0 ? "Free" : formatPrice(totals.shippingFee)}
        </span>
      </div>
      <div className="flex justify-between text-[12px] text-text-muted">
        <span>Incl. GST ({gstPct}%)</span>
        <span>{formatPrice(totals.gstIncluded)}</span>
      </div>
      <div className="border-t border-border pt-2.5 mt-2.5 flex justify-between items-baseline d-edge">
        <span className="d-label !text-[14px]">Total</span>
        <span className="font-display font-extrabold text-2xl text-text-primary">{formatPrice(totals.total)}</span>
      </div>

      {/* Delivery is free on every order; the nudge exists only for an admin-set fee,
          so it waits for settings instead of assuming a threshold. */}
      {settings && toFree > 0 && (
        <p className="text-xs text-text-muted mt-1 bg-brand-orange-light px-3 py-2 rounded-lg">
          💡 Add {formatPrice(toFree)} more for{" "}
          <span className="font-semibold text-brand-orange">free delivery</span>!
        </p>
      )}
    </div>
  );
}
