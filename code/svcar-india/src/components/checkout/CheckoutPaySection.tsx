"use client";

import { useRef } from "react";
import PayButton from "@/components/checkout/PayButton";
import CheckoutPayBar from "@/components/checkout/CheckoutPayBar";
import { useCheckoutPay, type CheckoutPayOptions } from "@/lib/use-checkout-pay";

/**
 * The in-page Pay button plus, on phones/tablets, the sticky Pay bar — both
 * driven by ONE useCheckoutPay instance (same validation, loading/disabled
 * state, stock blocking and order creation). Takes exactly PayButton's former
 * props, so the guest and signed-in checkouts swap it in one for one.
 */
export default function CheckoutPaySection(props: CheckoutPayOptions) {
  const controller = useCheckoutPay(props);
  const inlineRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <div ref={inlineRef}>
        <PayButton controller={controller} />
      </div>
      <CheckoutPayBar controller={controller} inlineRef={inlineRef} />
    </>
  );
}
