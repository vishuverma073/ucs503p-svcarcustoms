/**
 * Phone order actions: the one "next step" button for an order, the shipping
 * note, and the customer's Call / WhatsApp links.
 */

export type NextOrderAction =
  | { kind: "confirm"; event: "confirmed"; label: string }
  | { kind: "ship"; event: "shipped"; label: string }
  | { kind: "deliver"; event: "delivered"; label: string }
  | { kind: "collect-cod"; label: string }
  | { kind: "none"; label: string };

export interface OrderForActions {
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  remainingAmount: number;
}

function inr(n: number): string {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

/** Confirm → Ship → Delivered (→ collect the COD balance). */
export function nextOrderAction(o: OrderForActions): NextOrderAction {
  switch (o.status) {
    case "paid":
      return { kind: "confirm", event: "confirmed", label: "Confirm order" };
    case "confirmed":
      return { kind: "ship", event: "shipped", label: "Ship…" };
    case "shipped":
      return { kind: "deliver", event: "delivered", label: "Mark delivered" };
    case "delivered":
      if (o.paymentMethod === "cod" && o.paymentStatus === "partially_paid") {
        return { kind: "collect-cod", label: `Collected ${inr(o.remainingAmount)} COD` };
      }
      return { kind: "none", label: "Delivered" };
    case "pending":
      return { kind: "none", label: "Awaiting payment" };
    case "cancelled":
      return { kind: "none", label: "Cancelled" };
    case "refunded":
      return { kind: "none", label: "Refunded" };
    default:
      return { kind: "none", label: o.status };
  }
}

/** Timeline note for the "shipped" step: "Courier: Delhivery · Tracking: 1234". Empty → undefined. */
export function buildShipNote(courier: string, tracking: string): string | undefined {
  const parts: string[] = [];
  const c = courier.trim().replace(/\s+/g, " ");
  const t = tracking.trim().replace(/\s+/g, "");
  if (c) parts.push(`Courier: ${c}`);
  if (t) parts.push(`Tracking: ${t}`);
  const note = parts.join(" · ");
  return note ? note.slice(0, 500) : undefined;
}

/** Indian mobile → "919876543210" for wa.me / "+919876543210" for tel:. Null when unusable. */
export function phoneDigits(raw: string | null | undefined): string | null {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length === 10) return `91${d}`;
  if (d.length === 12 && d.startsWith("91")) return d;
  if (d.length === 11 && d.startsWith("0")) return `91${d.slice(1)}`;
  return d.length >= 10 ? d : null;
}

export function telHref(raw: string | null | undefined): string | null {
  const d = phoneDigits(raw);
  return d ? `tel:+${d}` : null;
}

export function whatsappHref(
  raw: string | null | undefined,
  ctx: { customerName?: string | null; orderNumber: string },
): string | null {
  const d = phoneDigits(raw);
  if (!d) return null;
  const first = (ctx.customerName ?? "").trim().split(/\s+/)[0];
  const text = `Hi${first ? ` ${first}` : ""}, this is SV Car Customs about your order ${ctx.orderNumber}.`;
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
}

/** Couriers offered as suggestions in the Ship sheet (free text is fine too). */
export const COURIER_SUGGESTIONS = [
  "Delhivery",
  "Blue Dart",
  "DTDC",
  "Ekart",
  "Xpressbees",
  "Shiprocket",
  "India Post",
] as const;
