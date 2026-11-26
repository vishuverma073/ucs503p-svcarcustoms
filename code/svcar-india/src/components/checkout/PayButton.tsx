"use client";

import Link from "next/link";
import { Loader2, MessageCircle, ShieldCheck } from "lucide-react";
import { MOCK_PAYMENTS } from "@/lib/api-config";
import { formatPrice, formatPriceExact } from "@/lib/utils";
import type { CheckoutPayController } from "@/lib/use-checkout-pay";
import MockPayuModal from "./MockPayuModal";

// The Pay action itself (guest validation / signed-in address, order creation,
// PayU hand-off, bfcache reset, mock modal callbacks) lives in useCheckoutPay so
// the phone sticky Pay bar can drive the same instance — see CheckoutPaySection.

const WHATSAPP_HELP = "https://wa.me/919205005425?text=" +
  encodeURIComponent("Hi, I had trouble paying for my order on the SV Car Customs website.");

export default function PayButton({ controller }: { controller: CheckoutPayController }) {
  const { loading, error, disabled, paymentMethod, amount, totalAmount, payuMock } = controller;

  return (
    <>
      <button
        onClick={() => void controller.pay()}
        disabled={disabled}
        className="btn btn-primary w-full py-3.5 text-[15px] disabled:opacity-50"
      >
        {loading ? (
          <><Loader2 size={18} className="animate-spin" /> Processing…</>
        ) : (
          <>{paymentMethod === "cod" ? `Pay ${formatPriceExact(amount)} advance` : `Pay ${formatPrice(totalAmount)}`}</>
        )}
      </button>

      <p className="flex items-center justify-center gap-1.5 text-[11px] text-text-muted mt-2">
        <ShieldCheck size={13} /> Secure payment via PayU
      </p>

      {error && (
        <div className="mt-3 text-sm text-danger bg-red-50 rounded-xl px-3 py-2.5">
          <p>{error}</p>
          <Link
            href={WHATSAPP_HELP}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1.5 inline-flex items-center gap-1.5 text-whatsapp font-medium hover:underline"
          >
            <MessageCircle size={14} /> Chat with us on WhatsApp
          </Link>
        </div>
      )}

      {MOCK_PAYMENTS && (
        <MockPayuModal
          handoff={payuMock?.handoff ?? null}
          onSuccess={controller.onMockPaid}
          onDismiss={controller.onMockDismiss}
        />
      )}
    </>
  );
}
