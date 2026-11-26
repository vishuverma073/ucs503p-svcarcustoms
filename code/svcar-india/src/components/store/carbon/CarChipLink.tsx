"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** One "By car" chip; filled light while its category page is open. */
export default function CarChipLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href;
  return (
    <Link href={href} className={`subcat-pill ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}>
      {label}
    </Link>
  );
}
