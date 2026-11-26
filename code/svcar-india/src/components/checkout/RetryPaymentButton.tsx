"use client";

import { useEffect, useState } from "react";
import { Loader2, RefreshCw, MessageCircle } from "lucide-react";
import Link from "next/link";
import { MOCK_PAYMENTS } from "@/lib/api-config";
import { backend, BackendAuthError } from "@/lib/backend";
import { formatPriceExact } from "@/lib/utils";
import { onBfcacheRestore, submitPayuForm, type PayuHandoff } from "@/lib/payu";
import type { GuestAccess } from "@/lib/guest-orders";
import MockPayuModal from "./MockPayuModal";

// [Razorpay disabled — PayU-only project] Retry payment uses PayU exclusively.
// The Razorpay modal flow has been removed; see git history to restore it.

const WHATSAPP_HELP =
  "https://wa.me/919205005425?text=" +
  encodeURIComponent("Hi, I had trouble paying for my order on the SV Car Customs website.");

/**
 * Re-initiate payment for an existing unpaid order (the previous attempt failed
 * or was dismissed). Builds a fresh PayU handoff; on success `onPaid` refreshes
 * the view. PayU confirms via its own callback, so there's no client verify step.
 */
export default function RetryPaymentButton({
  orderNumber,
  amount,
  onPaid,
  guestAccess,
}: {
  orderNumber: string;
  amount: number;
  onPaid: () => void;
  /** Set for a guest order (token or contact): authorises the retry instead of a session. */
  guestAccess?: GuestAccess | null;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [payuHandoff, setPayuHandoff] = useState<PayuHandoff | null>(null);

  // Back from PayU can restore this page from the bfcache still "Processing…".
  useEffect(() => onBfcacheRestore(() => setLoading(false)), []);

  function handlePayuPaid() {
    setPayuHandoff(null);
    onPaid();
  }

  async function retry() {
    setLoading(true);
    setError("");
    setNotice("");
    let res;
    try {
      res = guestAccess
        ? await backend.retryGuestPayment(orderNumber, guestAccess)
        : await backend.retryPayment(orderNumber);
    } catch (e) {
      setLoading(false);
      if (e instanceof BackendAuthError && e.status === 409) {
        // The API refused a second charge: an earlier attempt went through
        // (the refresh then shows the order paid and hides this button), or is
        // still being confirmed at PayU (UPI) — then say so instead of erroring.
        setNotice("Your earlier payment is still being confirmed. Please don’t pay again — this order updates automatically once it goes through.");
        onPaid();
        return;
      }
      setError("Couldn’t start the payment. Please try again.");
      return;
    }

    if (res.provider !== "payu" || !res.payu) {
      setLoading(false);
      setError("Couldn’t start the payment. Please try again.");
      return;
    }
    if (MOCK_PAYMENTS) {
      setPayuHandoff(res.payu);
      return;
    }
    submitPayuForm(res.payu);
  }

  return (
    <>
      <button
        onClick={retry}
        disabled={loading}
        className="btn btn-primary w-full py-3 text-sm disabled:opacity-50"
      >
        {loading ? (
          <><Loader2 size={16} className="animate-spin" /> Processing…</>
        ) : (
          <><RefreshCw size={15} /> Retry payment · {formatPriceExact(amount)}</>
        )}
      </button>
      {notice && !error && (
        <p className="mt-2 text-sm text-amber-900 bg-amber-50 rounded-xl px-3 py-2.5">{notice}</p>
      )}
      {error && (
        <div className="mt-2 text-sm text-danger bg-red-50 rounded-xl px-3 py-2.5">
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
          handoff={payuHandoff}
          onSuccess={handlePayuPaid}
          onDismiss={() => {
            setPayuHandoff(null);
            setLoading(false);
          }}
        />
      )}
    </>
  );
}
