import Link from "next/link";
import { Info, Wallet } from "lucide-react";
import { COD_ADVANCE_PERCENT } from "@/lib/checkout";

/**
 * COD + returns terms, shown on the product page and in the cart so the
 * "Before you pay" box at checkout repeats what the shopper already knows
 * instead of surprising them at the last step. Wording mirrors /refund.
 */
export default function PurchaseTerms({ className = "" }: { className?: string }) {
  return (
    <ul className={`space-y-1.5 text-[12px] leading-snug text-text-secondary ${className}`}>
      <li className="flex items-start gap-2">
        <Wallet size={14} className="mt-px shrink-0 text-text-muted" strokeWidth={1.8} />
        <span>
          Cash on Delivery available: pay {COD_ADVANCE_PERCENT}% online to confirm, the rest on delivery.
        </span>
      </li>
      <li className="flex items-start gap-2">
        <Info size={14} className="mt-px shrink-0 text-text-muted" strokeWidth={1.8} />
        <span>
          No returns or cancellations once ordered. Items delivered damaged are exchanged if claimed within 4
          days with an unboxing video.{" "}
          <Link href="/refund" className="font-semibold underline">
            Policy
          </Link>
        </span>
      </li>
    </ul>
  );
}
