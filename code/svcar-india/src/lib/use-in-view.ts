"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * Whether `ref`'s element intersects the viewport shrunk by `rootMargin`
 * (CSS margin syntax, negative to exclude sticky chrome). `null` until the
 * observer has reported, or when IntersectionObserver is unavailable.
 */
export function useInView(ref: RefObject<Element | null>, rootMargin: string): boolean | null {
    const [inView, setInView] = useState<boolean | null>(null);

    useEffect(() => {
        const el = ref.current;
        if (!el || typeof IntersectionObserver === "undefined") return;
        const observer = new IntersectionObserver(
            (entries) => {
                const latest = entries[entries.length - 1];
                if (latest) setInView(latest.isIntersecting);
            },
            { rootMargin },
        );
        observer.observe(el);
        return () => observer.disconnect();
    }, [ref, rootMargin]);

    return inView;
}
