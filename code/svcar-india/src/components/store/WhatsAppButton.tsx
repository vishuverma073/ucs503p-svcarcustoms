"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { trackWhatsapp } from "@/lib/track-whatsapp";

/** Routes that carry their own WhatsApp help instead of the floating button. */
function hidesFab(pathname: string | null): boolean {
    // Checkout (owner decision): the FAB sat over the Pay button and the
    // payment cards; the page shows a "Need help? WhatsApp" link instead.
    // Cart: its sticky checkout bar + "Order on WhatsApp" button cover this.
    return pathname === "/checkout" || !!pathname?.startsWith("/checkout/") || pathname === "/cart";
}

export default function WhatsAppButton() {
    const pathname = usePathname();
    if (hidesFab(pathname)) return null;

    return (
        <Link
            href="https://wa.me/919205005425"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackWhatsapp("floating")}
            // `wa-fab` sets `bottom` from --bottom-bar-reserve (globals.css), so
            // it always floats above a sticky bottom bar, never over it.
            className="wa-fab fixed right-5 z-50 group"
            aria-label="Chat on WhatsApp"
        >
            {/* Tooltip */}
            <span className="absolute right-full mr-3 top-1/2 -translate-y-1/2 bg-brand-black text-white text-xs font-medium py-1.5 px-3 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none shadow-lg">
                Chat with us
            </span>

            {/* Button */}
            <span className="flex items-center justify-center w-14 h-14 bg-whatsapp rounded-2xl shadow-lg transition-all duration-300 group-hover:shadow-xl group-hover:scale-110 group-hover:rounded-xl">
                <MessageCircle size={26} fill="white" stroke="white" />
            </span>
        </Link>
    );
}
