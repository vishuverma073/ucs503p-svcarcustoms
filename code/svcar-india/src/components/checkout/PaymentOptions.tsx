"use client";

import Link from "next/link";
import { AlertCircle, CreditCard, Truck } from "lucide-react";
import { formatPrice, formatPriceExact } from "@/lib/utils";
import { codAdvanceFor, COD_ADVANCE_PERCENT } from "@/lib/checkout";
import type { CartStockIssue } from "@/lib/cart-stock";

/**
 * Payment method choice, any stock problems, and the no-cancellation notice —
 * the part of the order summary shared by signed-in and guest checkout.
 */
export default function PaymentOptions({
  total,
  paymentMethod,
  onChange,
  stockIssues,
}: {
  total: number;
  paymentMethod: "prepaid" | "cod";
  onChange: (method: "prepaid" | "cod") => void;
  stockIssues: CartStockIssue[];
}) {
  const codAdvance = codAdvanceFor(total);
  const codRemaining = (Math.round(total * 100) - Math.round(codAdvance * 100)) / 100;

  return (
    <>
      <div className="mt-5 border-t border-border-light pt-4">
        <h3 className="text-sm font-bold text-text-primary mb-3">Payment method</h3>
        <div className="space-y-2">
          <button type="button" onClick={() => onChange("prepaid")} className={`w-full text-left rounded-xl border p-3 transition-colors ${paymentMethod === "prepaid" ? "border-brand-orange bg-brand-orange/5" : "border-border-light hover:bg-surface-dim"}`}>
            <span className="flex items-center gap-2 text-sm font-semibold text-text-primary"><CreditCard size={16} className="text-brand-orange" /> Pay online</span>
            <span className="block text-xs text-text-muted mt-1">Pay the full {formatPrice(total)} securely via PayU.</span>
          </button>
          <button type="button" onClick={() => onChange("cod")} className={`w-full text-left rounded-xl border p-3 transition-colors ${paymentMethod === "cod" ? "border-brand-orange bg-brand-orange/5" : "border-border-light hover:bg-surface-dim"}`}>
            <span className="flex items-center gap-2 text-sm font-semibold text-text-primary"><Truck size={16} className="text-brand-orange" /> Cash on Delivery</span>
            <span className="block text-xs font-semibold text-text-primary mt-1">Pay {formatPriceExact(codAdvance)} advance online, {formatPriceExact(codRemaining)} in cash on delivery</span>
            <span className="block text-xs text-text-muted mt-0.5">{COD_ADVANCE_PERCENT}% advance confirms the order; the remaining {100 - COD_ADVANCE_PERCENT}% is payable on delivery.</span>
            {paymentMethod === "cod" && <span className="mt-2 grid grid-cols-3 gap-1 text-xs"><span>Total<br /><b>{formatPrice(total)}</b></span><span>Pay now<br /><b className="text-brand-orange">{formatPriceExact(codAdvance)}</b></span><span>On delivery<br /><b>{formatPriceExact(codRemaining)}</b></span></span>}
          </button>
        </div>
      </div>
      {stockIssues.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold flex items-center gap-2 mb-2">
            <AlertCircle size={16} /> Stock issue
          </p>
          <ul className="space-y-1 text-xs">
            {stockIssues.map((issue) => (
              <li key={issue.cartKey}>
                {issue.name}:{" "}
                {issue.reason === "out_of_stock"
                  ? "out of stock"
                  : `only ${issue.available} available (you have ${issue.requested})`}
              </li>
            ))}
          </ul>
          <Link href="/cart" className="inline-block mt-2 text-xs font-semibold text-brand-orange hover:underline">
            Update cart
          </Link>
        </div>
      )}
      {/* Orders can't be cancelled and nothing is refundable — the customer
          has to be told that before they pay, not on the policy page after. */}
      <div id="before-you-pay" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
        <p className="font-semibold flex items-center gap-2 mb-1">
          <AlertCircle size={14} /> Before you pay
        </p>
        <p>
          Orders cannot be cancelled once placed, and we do not issue refunds
          {paymentMethod === "cod" ? " — including the advance paid now" : ""}. A
          product delivered damaged can be exchanged if you claim within 4 days with a
          complete unboxing video. Please confirm fitment for your car before ordering.{" "}
          <Link href="/refund" className="font-semibold underline">
            Read the full policy
          </Link>
          .
        </p>
      </div>
    </>
  );
}
