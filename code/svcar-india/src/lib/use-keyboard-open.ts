"use client";

import { useSyncExternalStore } from "react";
import { isKeyboardOpen, isTextField } from "@/lib/sticky-bars";

/** Tallest innerHeight seen at the current width (reset on rotation/resize). */
let baseline = { width: -1, height: 0 };

function snapshot(): boolean {
    const vv = window.visualViewport;
    if (!vv) return false;
    const { innerWidth, innerHeight } = window;
    if (innerWidth !== baseline.width) baseline = { width: innerWidth, height: innerHeight };
    else if (innerHeight > baseline.height) baseline = { width: innerWidth, height: innerHeight };
    return isKeyboardOpen({
        innerHeight,
        viewportHeight: vv.height,
        viewportScale: vv.scale,
        baselineHeight: baseline.height,
        textFieldFocused: isTextField(document.activeElement as HTMLInputElement | null),
    });
}

function subscribe(onChange: () => void): () => void {
    const vv = window.visualViewport;
    // Moving between fields fires focusout before focusin; read after both so
    // the bar does not flash in between.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deferred = () => {
        clearTimeout(timer);
        timer = setTimeout(onChange, 60);
    };
    vv?.addEventListener("resize", onChange);
    window.addEventListener("resize", onChange);
    document.addEventListener("focusin", onChange);
    document.addEventListener("focusout", deferred);
    return () => {
        clearTimeout(timer);
        vv?.removeEventListener("resize", onChange);
        window.removeEventListener("resize", onChange);
        document.removeEventListener("focusin", onChange);
        document.removeEventListener("focusout", deferred);
    };
}

/**
 * True while the on-screen keyboard is open (see `isKeyboardOpen`). Sticky
 * bottom bars hide then, so they never sit over the field being typed in;
 * merely focusing a field with no keyboard (desktop, hardware keyboard) keeps
 * them.
 */
export function useKeyboardOpen(): boolean {
    return useSyncExternalStore(subscribe, snapshot, () => false);
}
