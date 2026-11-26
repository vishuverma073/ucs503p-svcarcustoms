"use client";

import type { MouseEvent, RefObject } from "react";
import { Loader2 } from "lucide-react";
import { formatPriceExact } from "@/lib/utils";
import type { CheckoutPayController } from "@/lib/use-checkout-pay";
import { useInView } from "@/lib/use-in-view";
import { useKeyboardOpen } from "@/lib/use-keyboard-open";
import { CHECKOUT_BAR_HEIGHT_PX, checkoutBarAmount, visibleAreaMargin } from "@/lib/sticky-bars";

/** id of the "Before you pay" notice in PaymentOptions. */
export const BEFORE_YOU_PAY_ID = "before-you-pay";

/**
 * Phone/tablet (< 1024px) sticky Pay bar on /checkout: the amount PayU will
 * charge now and a Pay button that calls the SAME controller as the in-page
 * button. Hidden while the on-screen keyboard is open (never over a field) and
 * while the in-page Pay button itself is on screen (no duplicate CTA). It
 * carries the no-cancellation/no-refund line because the full notice sits
 * far above on a phone.
 */
export default function CheckoutPayBar({
  controller,
  inlineRef,
}: {
  controller: CheckoutPayController;
  inlineRef: RefObject<HTMLElement | null>;
}) {
  const keyboardOpen = useKeyboardOpen();
  const inlineInView = useInView(inlineRef, visibleAreaMargin(CHECKOUT_BAR_HEIGHT_PX));
  const visible = !keyboardOpen && inlineInView !== true;
  const { label, amount } = checkoutBarAmount(controller.totalAmount, controller.paymentMethod);

  async function onPay() {
    const outcome = await controller.pay();
    // The error message (and its WhatsApp help link) renders under the in-page
    // button; bring it on screen. Invalid forms already moved focus to the field.
    if (outcome === "failed") inlineRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function showNotice(e: MouseEvent<HTMLAnchorElement>) {
    const notice = document.getElementById(BEFORE_YOU_PAY_ID);
    if (!notice) return;
    e.preventDefault();
    notice.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  return (
    <div data-bottom-bar="checkout" className={`sticky-bottom-bar${visible ? " is-visible" : ""}`}>
      <div className="max-w-5xl mx-auto px-4 h-[var(--checkout-bar-h)] flex flex-col justify-center gap-1">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1 leading-tight d-edge">
            <p className="text-[12px] text-text-muted truncate">{label}</p>
            <p className="font-display text-[22px] font-extrabold text-text-primary leading-none truncate">
              {formatPriceExact(amount)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void onPay()}
            disabled={controller.disabled}
            className="btn btn-primary shrink-0 min-w-[148px] text-[15px] disabled:opacity-50"
          >
            {controller.loading ? (
              <><Loader2 size={18} className="animate-spin" /> Processing…</>
            ) : (
              controller.paymentMethod === "cod" ? `Pay ${formatPriceExact(amount)} advance` : "Pay now"
            )}
          </button>
        </div>
        <p className="text-[12px] leading-snug text-text-secondary truncate">
          No cancellations or refunds ·{" "}
          <a href={`#${BEFORE_YOU_PAY_ID}`} onClick={showNotice} className="font-semibold underline">
            Policy
          </a>
        </p>
      </div>
    </div>
  );
}
