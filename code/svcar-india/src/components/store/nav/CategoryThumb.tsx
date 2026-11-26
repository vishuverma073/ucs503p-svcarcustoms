"use client";

import { useState } from "react";
import Image from "next/image";
import { FolderOpen } from "lucide-react";
import { getSafeImageSrc } from "@/lib/utils";

/**
 * Category photo for the Shop menus: the category's own image from the API,
 * lazy-loaded at a small `sizes`; a neutral placeholder tile when there is no
 * image or it fails to load (never a broken image).
 */
export default function CategoryThumb({
  src,
  sizes,
  className = "object-cover",
}: {
  src: string | null | undefined;
  sizes: string;
  className?: string;
}) {
  const safe = getSafeImageSrc(src);
  const [failed, setFailed] = useState(false);
  if (!safe || failed) {
    return (
      <span className="absolute inset-0 flex items-center justify-center bg-[#26272B]" aria-hidden>
        <FolderOpen size={22} className="text-white/35" strokeWidth={1.5} />
      </span>
    );
  }
  return (
    <Image
      src={safe}
      alt=""
      fill
      loading="lazy"
      sizes={sizes}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
