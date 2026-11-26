"use client";

import { MessageCircle } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { trackWhatsapp } from "@/lib/track-whatsapp";

/**
 * Checkout's WhatsApp help — the floating button is hidden on /checkout (it
 * sat over the Pay button and payment cards), so support lives up here.
 */
export default function CheckoutHelpLink() {
  return (
    <a
      href={`https://wa.me/${BRAND.contact.whatsapp}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackWhatsapp("other")}
      className="inline-flex items-center gap-1.5 py-2 -my-2 text-sm font-medium text-text-secondary hover:text-text-primary"
    >
      <MessageCircle size={15} className="text-whatsapp" /> Need help? WhatsApp
    </a>
  );
}
