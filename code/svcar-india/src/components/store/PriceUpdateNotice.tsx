"use client";

import { AlertTriangle } from "lucide-react";
import { priceChangeNotice, unavailableNotice, type CartPriceDiff } from "@/lib/cart-prices";

/** Amber notice on /cart and /checkout when a line's price changed or it can't be bought any more. */
export default function PriceUpdateNotice({ diff, className = "" }: { diff: CartPriceDiff | null; className?: string }) {
  const changed = priceChangeNotice(diff);
  const gone = unavailableNotice(diff);
  if (!changed && !gone) return null;
  return (
    <div
      role="status"
      className={`flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-3 text-sm text-amber-900 ${className}`}
      data-testid="price-update-notice"
    >
      <AlertTriangle size={17} className="mt-0.5 shrink-0" aria-hidden />
      <div className="space-y-1">
        {changed && <p>{changed}. Your total below is up to date.</p>}
        {gone && <p>{gone}</p>}
      </div>
    </div>
  );
}
