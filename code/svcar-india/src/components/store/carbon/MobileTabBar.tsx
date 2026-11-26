"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};
import { Home, LayoutGrid, Search, ShoppingBag, MessageCircle } from "lucide-react";
import { useCartStore } from "@/store/cartStore";
import { SHOP_HREF } from "@/lib/shop-nav";
import { trackWhatsapp } from "@/lib/track-whatsapp";
import { isCheckoutPath } from "./HideOnCheckout";

/**
 * Design D phone tab bar (< 768px): Home, Shop, Search, Cart, WhatsApp.
 * Hidden on checkout. The PDP/cart sticky bars stack above it (globals.css,
 * --tabbar-h), and it replaces the floating WhatsApp button on phones.
 */
export default function MobileTabBar() {
  const pathname = usePathname();
  const items = useCartStore((s) => s.items);
  // false during SSR/hydration, true after: the persisted cart count never mismatches.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  if (isCheckoutPath(pathname)) return null;
  const count = mounted ? items.reduce((n, i) => n + i.qty, 0) : 0;

  const tab = "flex flex-1 flex-col items-center justify-center gap-0.5 d-label !text-[10px] !tracking-[0.1em]";
  const on = (active: boolean) => (active ? "text-text-primary" : "text-text-muted");
  const shopActive = pathname === "/shop" || !!pathname?.startsWith("/category/");

  return (
    <nav data-tabbar className="d-tabbar md:hidden" aria-label="Quick navigation">
      <div className="flex h-14">
        <Link href="/" className={`${tab} ${on(pathname === "/")}`} aria-current={pathname === "/" ? "page" : undefined}>
          <Home size={20} aria-hidden /> Home
        </Link>
        <Link href={SHOP_HREF} className={`${tab} ${on(shopActive)}`}>
          <LayoutGrid size={20} aria-hidden /> Shop
        </Link>
        <Link href="/search" className={`${tab} ${on(pathname === "/search")}`}>
          <Search size={20} aria-hidden /> Search
        </Link>
        <Link href="/cart" className={`${tab} ${on(pathname === "/cart")} relative`} aria-label={`Cart${count ? `, ${count} items` : ""}`}>
          <span className="relative">
            <ShoppingBag size={20} aria-hidden />
            {count > 0 && (
              <span className="absolute -top-1.5 -right-2.5 min-w-4 h-4 px-1 flex items-center justify-center bg-brand-orange text-white text-[10px] font-bold leading-none">
                {count > 99 ? "99+" : count}
              </span>
            )}
          </span>
          Cart
        </Link>
        <Link
          href="https://wa.me/919205005425"
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackWhatsapp("other")}
          className={`${tab} text-whatsapp`}
        >
          <MessageCircle size={20} aria-hidden /> WhatsApp
        </Link>
      </div>
    </nav>
  );
}
