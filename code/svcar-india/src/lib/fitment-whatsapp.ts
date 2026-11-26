/** Store WhatsApp number (same as the floating WhatsApp button). */
export const STORE_WHATSAPP = "919205005425";

/** wa.me link asking whether a product (and the chosen variant) fits the shopper's car. */
export function fitmentWhatsAppUrl(p: { productName: string; variantLabel?: string | null; url: string }): string {
  const lines = [
    `Hi, will this fit my car? (please share make/model/year)`,
    `Product: ${p.productName}`,
    ...(p.variantLabel ? [`Variant: ${p.variantLabel}`] : []),
    p.url,
  ];
  return `https://wa.me/${STORE_WHATSAPP}?text=${encodeURIComponent(lines.join("\n"))}`;
}
