/**
 * The amount submitted to PayU. Keep this separate from the order value: COD
 * orders collect a fixed 15% advance online and the rest on delivery.
 */
export function gatewayPaymentAmount(total: number, paymentMethod: "prepaid" | "cod"): number {
  const totalPaise = Math.round(total * 100);
  const paymentPaise = paymentMethod === "cod" ? Math.round((totalPaise * 15) / 100) : totalPaise;
  return paymentPaise / 100;
}
