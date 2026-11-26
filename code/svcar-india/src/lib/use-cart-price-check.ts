"use client";

import { useCallback, useEffect, useState } from "react";
import { refreshCartPrices, type CartPriceDiff } from "@/lib/cart-prices";

/**
 * Re-price the cart once when a cart/checkout view opens (and on demand).
 * `checked` flips true when the first check finished (or failed — the Pay
 * path still verifies the amount server-side).
 */
export function useCartPriceCheck(enabled = true) {
  const [diff, setDiff] = useState<CartPriceDiff | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void refreshCartPrices().then((d) => {
      if (!active) return;
      setDiff(d);
      setChecked(true);
    });
    return () => {
      active = false;
    };
  }, [enabled]);

  const recheck = useCallback(async () => {
    const d = await refreshCartPrices();
    // Keep the notice up if a later check finds nothing new to report.
    setDiff((prev) => (d && (d.changes.length > 0 || d.unavailable.length > 0) ? d : (prev ?? d)));
    setChecked(true);
    return d;
  }, []);

  return { diff, checked, recheck };
}
