"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, MessageCircle, PackageSearch } from "lucide-react";
import { backend, BackendAuthError } from "@/lib/backend";
import { saveTrackedContact } from "@/lib/guest-orders";

/**
 * Track order: order number + the email or mobile used at checkout opens the
 * order page (status, timeline, retry payment) on any device, with no login.
 * The order/SMS/email "Track your order" links land here with ?order= filled.
 */
function TrackForm() {
  const router = useRouter();
  const search = useSearchParams();
  const [orderNumber, setOrderNumber] = useState((search.get("order") ?? "").toUpperCase());
  const [contact, setContact] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = orderNumber.trim().toUpperCase();
    const c = contact.trim();
    if (!n || !c) {
      setError("Enter your order number and the email or mobile you ordered with.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await backend.getGuestOrder(n, { contact: c });
      saveTrackedContact(n, c);
      router.push(`/orders/${encodeURIComponent(n)}`);
    } catch (err) {
      setLoading(false);
      if (err instanceof BackendAuthError && err.status === 429) {
        setError("Too many tries. Please wait a minute and try again.");
      } else if (err instanceof BackendAuthError && err.status === 404) {
        setError("We couldn’t find an order with that number and email / mobile. Please check both.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div>
        <label className="input-label" htmlFor="track-order">
          Order number
        </label>
        <input
          id="track-order"
          className="input uppercase"
          placeholder="e.g. SV4YN0M0QGYK"
          autoComplete="off"
          autoCapitalize="characters"
          value={orderNumber}
          onChange={(e) => setOrderNumber(e.target.value)}
        />
      </div>
      <div>
        <label className="input-label" htmlFor="track-contact">
          Email or mobile number
        </label>
        <input
          id="track-contact"
          className="input"
          placeholder="The one you used at checkout"
          autoComplete="email"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button type="submit" disabled={loading} className="btn btn-primary w-full py-3.5">
        {loading ? <Loader2 size={18} className="animate-spin" /> : "Track order"}
      </button>
    </form>
  );
}

export default function TrackOrderPage() {
  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <div className="w-14 h-14 rounded-2xl bg-surface-dim flex items-center justify-center mb-5">
        <PackageSearch className="text-brand-orange" />
      </div>
      <h1 className="text-2xl font-extrabold text-text-primary tracking-tight mb-1">Track your order</h1>
      <p className="text-sm text-text-secondary mb-6">
        No login needed. Your order number is in your order confirmation.
      </p>
      <Suspense fallback={<Loader2 className="animate-spin text-text-muted" />}>
        <TrackForm />
      </Suspense>
      <div className="mt-8 space-y-2 text-sm text-text-secondary">
        <p>
          Have an account?{" "}
          <Link href="/login?returnTo=/orders" className="font-semibold text-brand-orange hover:underline">
            Sign in
          </Link>{" "}
          to see all your orders.
        </p>
        <Link
          href="https://wa.me/919205005425"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 font-semibold text-whatsapp hover:underline"
        >
          <MessageCircle size={15} /> Can’t find your order number? Chat with us
        </Link>
      </div>
    </div>
  );
}
