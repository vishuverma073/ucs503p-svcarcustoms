"use client";

/**
 * Post-payment landing page. PayU POSTs its result to the API, which 303s the
 * browser here.
 *
 * This page must NOT gate on the session. It is entered as a fresh cross-site
 * navigation, so the in-memory access token is gone and the silent refresh is
 * still in flight when it first paints — /orders/:n would bounce the customer
 * to /login at exactly the moment they need to see "your order is placed".
 * Everything above the fold is rendered from the URL alone; the order summary
 * fills in afterwards, and only if the session comes back.
 *
 * ?status=pending means PayU hasn't settled the payment yet (common with UPI).
 * It may still succeed, so the customer is told not to pay again while the page
 * polls the order and switches to the success view once it's paid.
 */

import { Suspense, use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Clock, Loader2, MessageCircle, Package, XCircle } from "lucide-react";
import { backend } from "@/lib/backend";
import { useAuthStore, type AuthStatus } from "@/store/authStore";
import { useCartStore } from "@/store/cartStore";
import { formatPrice, formatPriceExact } from "@/lib/utils";
import { trackPurchase } from "@/lib/analytics-events";
import { getGuestOrderAccess } from "@/lib/guest-orders";
import type { Order } from "@svcar/contracts";

/** How often, and for how long, a pending payment's order is re-checked. */
const POLL_EVERY_MS = 5000;
const POLL_FOR_MS = 5 * 60 * 1000;

function whatsappHelp(orderNumber: string, payment: "failed" | "pending" | null): string {
  const text =
    payment === "failed"
      ? `Hi, my payment for order ${orderNumber} didn't go through. Can you help?`
      : payment === "pending"
        ? `Hi, my payment for order ${orderNumber} is still being confirmed. Can you help?`
        : `Hi, I need help with my SV Car Customs order ${orderNumber}.`;
  return `https://wa.me/919205005425?text=${encodeURIComponent(text)}`;
}

/**
 * The order, through the restored session or (for a guest order) this browser's
 * token / the contact entered on Track order. Null while the session is still
 * restoring, or when a guest has no access to it here.
 */
function fetchOrder(orderNumber: string, authStatus: AuthStatus): Promise<Order> | null {
  if (authStatus === "authenticated") return backend.getOrder(orderNumber);
  if (authStatus !== "unauthenticated") return null;
  const access = getGuestOrderAccess(orderNumber);
  return access ? backend.getGuestOrder(orderNumber, access).then((r) => r.order) : null;
}

const isPaid = (o: Order) => ["paid", "shipped", "delivered"].includes(o.status);

function OrderConfirmation({ orderNumber }: { orderNumber: string }) {
  const router = useRouter();
  const statusParam = useSearchParams().get("status");
  const failed = statusParam === "failed";
  const pending = statusParam === "pending";
  const authStatus = useAuthStore((s) => s.status);
  const [order, setOrder] = useState<Order | null>(null);
  // A shopper with neither a session nor this order's guest token can't load it.
  const [summaryUnavailable, setSummaryUnavailable] = useState(false);
  // Pending payment: still checking, gave up after POLL_FOR_MS, or can't check
  // from this browser at all (no session, no guest token).
  const [poll, setPoll] = useState<"checking" | "timed-out" | "unavailable">("checking");
  const [pollRound, setPollRound] = useState(0);

  // With no ?status, the page trusts the redirect ("paid") until the order
  // loads, then shows its REAL state — e.g. an old link or a direct visit to an
  // order that is still unpaid, or was cancelled, must not say "payment received".
  const loadedState: "paid" | "unpaid" | "cancelled" | null = order
    ? isPaid(order)
      ? "paid"
      : order.status === "cancelled" || order.status === "failed"
        ? "cancelled"
        : "unpaid"
    : null;

  // Payment went through → the server already emptied the cart; drop the local
  // copy too so the badge doesn't still show the items they just bought. Wait
  // for the order to confirm it's paid when it can be loaded.
  useEffect(() => {
    if (failed || pending) return;
    if (loadedState === "paid" || summaryUnavailable) useCartStore.getState().clearCart();
  }, [failed, pending, loadedState, summaryUnavailable]);

  // Summary is a bonus, not a requirement: it needs a restored session (or, for
  // a guest order, the token this browser was given), so it arrives a beat
  // after the page paints and stays silent if it never does.
  useEffect(() => {
    if (failed || pending) return;
    let active = true;
    const request = fetchOrder(orderNumber, authStatus);
    if (request) {
      request
        .then((o) => active && setOrder(o))
        .catch(() => active && authStatus === "unauthenticated" && setSummaryUnavailable(true));
    } else if (authStatus === "unauthenticated") {
      setSummaryUnavailable(true);
    }
    return () => {
      active = false;
    };
  }, [failed, pending, authStatus, orderNumber]);

  // Pending payment: re-check the order until PayU's webhook (or the reconcile
  // job) marks it paid, then drop ?status=pending to show the success view.
  useEffect(() => {
    if (!pending) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = Date.now() + POLL_FOR_MS;
    async function check() {
      const request = fetchOrder(orderNumber, authStatus);
      if (!request) {
        // Still restoring the session → this effect re-runs once it settles.
        if (authStatus === "unauthenticated") setPoll("unavailable");
        return;
      }
      const o = await request.catch(() => null); // a failed check just waits for the next
      if (!active) return;
      if (o && isPaid(o)) router.replace(`/order-confirmation/${encodeURIComponent(orderNumber)}`, { scroll: false });
      else if (Date.now() < deadline) timer = setTimeout(check, POLL_EVERY_MS);
      else setPoll("timed-out");
    }
    void check();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [pending, authStatus, orderNumber, router, pollRound]);

  // GA4/Meta/Ads purchase conversion. Same localStorage key the order detail
  // page uses, so whichever the customer reaches first counts it exactly once.
  useEffect(() => {
    if (!order || !isPaid(order)) return;
    const key = `svcar-purchase-${order.orderNumber}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, "1");
    } catch {
      /* storage blocked — still fire; transaction_id dedupes downstream */
    }
    trackPurchase({
      orderId: order.orderNumber,
      value: order.totals.total,
      coupon: order.promoCode,
      items: order.items.map((it) => ({
        id: it.skuId != null ? String(it.skuId) : it.slug,
        name: it.name,
        price: it.price,
        qty: it.qty,
      })),
    });
  }, [order]);

  if (pending) {
    return (
      <div className="max-w-lg mx-auto px-4 py-14 text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-5">
          <Clock className="text-amber-500" size={30} />
        </div>
        <h1 className="text-2xl font-extrabold text-text-primary tracking-tight">Payment is being confirmed</h1>
        <p className="text-sm text-text-secondary mt-2 leading-relaxed">
          Your payment for order <span className="font-semibold text-text-primary">{orderNumber}</span> hasn’t been
          confirmed yet. This can take a few minutes.{" "}
          <span className="font-semibold text-text-primary">Please don’t pay again</span> — you could be charged twice.
        </p>

        <div className="mt-6 rounded-2xl border border-border-light bg-white shadow-card p-4 text-sm text-text-secondary">
          {poll === "checking" ? (
            <p className="flex items-center justify-center gap-2">
              <Loader2 size={15} className="animate-spin" /> Checking — this page updates automatically.
            </p>
          ) : poll === "timed-out" ? (
            <>
              <p>This is taking longer than usual. Once the payment goes through, your order is confirmed automatically.</p>
              <button
                onClick={() => {
                  setPoll("checking");
                  setPollRound((n) => n + 1);
                }}
                className="btn btn-secondary w-full py-2.5 mt-3"
              >
                Check again
              </button>
            </>
          ) : (
            <p>Once the payment goes through, your order is confirmed automatically.</p>
          )}
        </div>

        <div className="flex flex-col gap-2.5 mt-6">
          <Link href="/" className="btn btn-secondary w-full py-3">
            Continue shopping
          </Link>
        </div>

        <Link
          href={whatsappHelp(orderNumber, "pending")}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-flex items-center gap-1.5 text-sm text-whatsapp font-medium hover:underline"
        >
          <MessageCircle size={15} /> Questions? Chat with us on WhatsApp
        </Link>
      </div>
    );
  }

  if (failed) {
    return (
      <div className="max-w-lg mx-auto px-4 py-14 text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-5">
          <XCircle className="text-danger" size={30} />
        </div>
        <h1 className="text-2xl font-extrabold text-text-primary tracking-tight">Payment didn’t go through</h1>
        <p className="text-sm text-text-secondary mt-2 leading-relaxed">
          Your order <span className="font-semibold text-text-primary">{orderNumber}</span> is saved, so you can retry
          the payment. If any amount was debited, contact us on WhatsApp with your order number.
        </p>

        <div className="flex flex-col gap-2.5 mt-7">
          <Link href={`/orders/${orderNumber}`} className="btn btn-primary w-full py-3">
            Retry payment
          </Link>
          <Link href="/cart" className="btn btn-secondary w-full py-3">
            Back to cart
          </Link>
        </div>

        <Link
          href={whatsappHelp(orderNumber, "failed")}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-flex items-center gap-1.5 text-sm text-whatsapp font-medium hover:underline"
        >
          <MessageCircle size={15} /> Chat with us on WhatsApp
        </Link>
      </div>
    );
  }

  if (loadedState === "unpaid" || loadedState === "cancelled") {
    const cancelledOrder = loadedState === "cancelled";
    return (
      <div className="max-w-lg mx-auto px-4 py-14 text-center">
        <div
          className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5 ${cancelledOrder ? "bg-red-50" : "bg-amber-50"}`}
        >
          {cancelledOrder ? <XCircle className="text-danger" size={30} /> : <Clock className="text-amber-500" size={30} />}
        </div>
        <h1 className="text-2xl font-extrabold text-text-primary tracking-tight">
          {cancelledOrder ? "This order was cancelled" : "Payment not received yet"}
        </h1>
        <p className="text-sm text-text-secondary mt-2 leading-relaxed">
          {cancelledOrder ? (
            <>
              Order <span className="font-semibold text-text-primary">{orderNumber}</span> was cancelled without a
              confirmed payment. If any amount was debited, chat with us on WhatsApp with your order number and we’ll
              sort it out.
            </>
          ) : (
            <>
              We haven’t received the payment for order{" "}
              <span className="font-semibold text-text-primary">{orderNumber}</span> yet. If you just paid, it can take
              a few minutes to confirm — check your order before paying again.
            </>
          )}
        </p>

        <div className="flex flex-col gap-2.5 mt-7">
          <Link href={`/orders/${orderNumber}`} className="btn btn-primary w-full py-3">
            {cancelledOrder ? "View order" : "View order & payment"}
          </Link>
          <Link href="/" className="btn btn-secondary w-full py-3">
            Continue shopping
          </Link>
        </div>

        <Link
          href={whatsappHelp(orderNumber, cancelledOrder ? null : "pending")}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-flex items-center gap-1.5 text-sm text-whatsapp font-medium hover:underline"
        >
          <MessageCircle size={15} /> Chat with us on WhatsApp
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-14 text-center">
      <div className="w-16 h-16 rounded-2xl bg-success/10 flex items-center justify-center mx-auto mb-5 animate-fade-in">
        <CheckCircle2 className="text-success" size={32} />
      </div>

      <h1 className="text-2xl font-extrabold text-text-primary tracking-tight">Order confirmed!</h1>
      <p className="text-sm text-text-secondary mt-2 leading-relaxed">
        Thank you — your payment was received. A confirmation email is on its way, and we’ll update you as soon as your order ships.
      </p>

      <div className="mt-6 rounded-2xl border border-border-light bg-white shadow-card p-4 text-left">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-bold uppercase tracking-wide text-text-secondary">Order number</span>
          <span className="font-mono text-sm font-bold text-text-primary">{orderNumber}</span>
        </div>

        {order ? (
          <div className="mt-3 pt-3 border-t border-border-light space-y-1.5">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-text-secondary">
                {order.items.length} item{order.items.length === 1 ? "" : "s"}
              </span>
              <span className="font-bold text-text-primary">{formatPrice(order.totals.total)}</span>
            </div>
            {(order.totals.discount ?? 0) > 0 && (
              <div className="flex items-center justify-between gap-3 text-xs text-success">
                <span>Promo{order.promoCode ? ` (${order.promoCode})` : ""} saved you</span>
                <span className="font-semibold">−{formatPrice(order.totals.discount ?? 0)}</span>
              </div>
            )}
            <p className="text-xs text-text-muted">
              Delivering to {order.address.city}, {order.address.state} {order.address.pincode}
            </p>
            {order.paymentMethod === "cod" && <div className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900 space-y-1"><p className="font-bold">COD payment split</p><p>Total order value: {formatPrice(order.totals.total)}</p><p>Paid online: {formatPriceExact(order.advancePaid)}</p><p>Pay on delivery: {formatPriceExact(order.remainingAmount)}</p></div>}
          </div>
        ) : summaryUnavailable ? null : (
          <div className="mt-3 pt-3 border-t border-border-light flex items-center gap-2 text-xs text-text-muted">
            <Loader2 size={13} className="animate-spin" /> Loading your order details…
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2.5 mt-6">
        <Link href={`/orders/${orderNumber}`} className="btn btn-primary w-full py-3">
          <Package size={17} /> Track your order
        </Link>
        <Link href="/" className="btn btn-secondary w-full py-3">
          Continue shopping
        </Link>
      </div>

      <Link
        href={whatsappHelp(orderNumber, null)}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-6 inline-flex items-center gap-1.5 text-sm text-whatsapp font-medium hover:underline"
      >
        <MessageCircle size={15} /> Need help? Chat with us
      </Link>
    </div>
  );
}

export default function OrderConfirmationPage({ params }: { params: Promise<{ orderNumber: string }> }) {
  const { orderNumber } = use(params);
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-32 text-text-muted">
          <Loader2 className="animate-spin" />
        </div>
      }
    >
      <OrderConfirmation orderNumber={decodeURIComponent(orderNumber)} />
    </Suspense>
  );
}
