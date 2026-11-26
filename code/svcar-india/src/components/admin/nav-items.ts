import {
  LayoutDashboard,
  Package,
  FolderTree,
  LayoutTemplate,
  Settings,
  ShoppingCart,
  Archive,
  ScrollText,
  Users,
  Radio,
  Mail,
  BarChart3,
  Phone,
  TicketPercent,
  type LucideIcon,
} from "lucide-react";

export interface AdminNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /**
   * Show as a tab in the phone bottom nav (4 tabs + "More"). Everything else is
   * one tap away in the More sheet.
   */
  mobile: boolean;
  /** Tab position in the bottom nav (lower = further left). */
  mobileOrder?: number;
}

/** Single source of truth for admin navigation (sidebar + bottom nav). */
export const adminNav: AdminNavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, mobile: true, mobileOrder: 0 },
  { href: "/admin/products", label: "Products", icon: Package, mobile: true, mobileOrder: 3 },
  { href: "/admin/products/archived", label: "Archive", icon: Archive, mobile: false },
  { href: "/admin/categories", label: "Categories", icon: FolderTree, mobile: false },
  // Home composer — drives the storefront homepage (order, enabled sections,
  // hero/promo content, featured products, category showcase).
  { href: "/admin/home", label: "Home", icon: LayoutTemplate, mobile: false },
  { href: "/admin/orders", label: "Orders", icon: ShoppingCart, mobile: true, mobileOrder: 1 },
  // Leads — customer carts (what people are holding, newest first).
  { href: "/admin/leads", label: "Leads", icon: Users, mobile: false },
  // Live — shoppers active on the site right now + their carts.
  { href: "/admin/live", label: "Live", icon: Radio, mobile: false },
  // Phone leads — popup numbers + order phones, one row per number.
  { href: "/admin/phone-leads", label: "Phone leads", icon: Phone, mobile: true, mobileOrder: 2 },
  // Promo codes — checkout discount codes (% off above a minimum, date window, usage).
  { href: "/admin/promo-codes", label: "Promo codes", icon: TicketPercent, mobile: false },
  // Subscribers — newsletter sign-ups.
  { href: "/admin/subscribers", label: "Subscribers", icon: Mail, mobile: false },
  // Store Analytics — visitors, devices, acquisition, traffic trend.
  { href: "/admin/analytics", label: "Store Analytics", icon: BarChart3, mobile: false },
  { href: "/admin/audit", label: "Audit", icon: ScrollText, mobile: false },
  // Settings — store settings + this phone's app install & notifications.
  { href: "/admin/settings", label: "Settings", icon: Settings, mobile: false },
];

/** The phone bottom-nav tabs, in tab order (Dashboard, Orders, Phone leads, Products). */
export function mobileTabs(items: AdminNavItem[] = adminNav): AdminNavItem[] {
  return items.filter((i) => i.mobile).sort((a, b) => (a.mobileOrder ?? 99) - (b.mobileOrder ?? 99));
}

/** Everything that lives behind the bottom nav's "More" button. */
export function moreItems(items: AdminNavItem[] = adminNav): AdminNavItem[] {
  return items.filter((i) => !i.mobile);
}

/**
 * Active when the path matches exactly, or is a sub-route of a non-root item
 * (so /admin/products/3/edit highlights "Products" but everything doesn't
 * highlight "Dashboard").
 */
export function isNavActive(href: string, pathname: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  if (href === "/admin/products/archived") {
    return pathname === "/admin/products/archived";
  }
  if (href === "/admin/products") {
    return (
      pathname === "/admin/products" ||
      (pathname.startsWith("/admin/products/") && !pathname.startsWith("/admin/products/archived"))
    );
  }
  if (href === "/admin/audit") {
    return pathname === "/admin/audit" || pathname.startsWith("/admin/audit/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
