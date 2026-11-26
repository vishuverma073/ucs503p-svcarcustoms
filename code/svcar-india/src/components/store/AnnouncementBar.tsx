"use client";

import { useMemo } from "react";
import { useStoreSettings } from "@/lib/use-store-settings";
import type { StoreSettings } from "@/lib/backend";
import { formatPrice } from "@/lib/utils";
import { deliveryAlwaysFree } from "@/lib/checkout";

/**
 * First message is the delivery truth: free on every order (admin flat fee ₹0),
 * with the COD advance next to it. Server HTML, the first client frame and the
 * hydrated bar all say the same thing — a threshold only appears once settings
 * have loaded AND the admin has set a fee; there is no "above ₹X" fallback.
 */
export function buildMessages(settings: StoreSettings | undefined): string[] {
  const alwaysFree = !settings || deliveryAlwaysFree(settings);
  return [
    alwaysFree
      ? "Free delivery on all orders · COD 15% advance"
      : `Free delivery on orders above ${formatPrice(settings.shippingFreeAbove)} · COD 15% advance`,
    "Best car accessories delivered to your doorstep",
    "Body kits · spoilers · ambient lights · exhausts",
    "Pan India delivery",
    "Fitment-checked parts for your car",
    "WhatsApp support for quick assistance",
  ];
}

function TickerTrack({ messages, ariaHidden }: { messages: string[]; ariaHidden?: boolean }) {
  return (
    <div className="flex shrink-0 items-center" aria-hidden={ariaHidden}>
      {messages.map((message, index) => (
        <span key={`${message}-${index}`} className="flex shrink-0 items-center">
          <span className="whitespace-nowrap px-8 md:px-12">{message}</span>
          <span className="text-white/30 select-none" aria-hidden>
            •
          </span>
        </span>
      ))}
    </div>
  );
}

export default function AnnouncementBar() {
  const { data: storeSettings } = useStoreSettings();
  const messages = useMemo(() => buildMessages(storeSettings), [storeSettings]);

  return (
    <div
      className="group/announce bg-brand-black text-white text-[10px] sm:text-[11px] py-2 font-medium tracking-[0.18em] sm:tracking-widest uppercase overflow-hidden border-b border-white/5"
      role="region"
      aria-label="Store announcements"
    >
      {/* Animated ticker — seamless loop via duplicated track */}
      <div className="relative motion-reduce:hidden">
        <div className="flex w-max animate-marquee group-hover/announce:[animation-play-state:paused]">
          <TickerTrack messages={messages} />
          <TickerTrack messages={messages} ariaHidden />
        </div>
      </div>

      {/* Reduced motion: static single-line list */}
      <p className="hidden motion-reduce:block text-center px-4 leading-relaxed">
        {messages.join("  ·  ")}
      </p>

      <span className="sr-only">{messages.join(". ")}</span>
    </div>
  );
}
