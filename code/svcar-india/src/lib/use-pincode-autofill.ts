"use client";

import { useEffect, useRef, useState } from "react";
import type { PincodeLookup } from "@svcar/contracts";
import { backend } from "@/lib/backend";

/**
 * Pincode → city/state autofill (debounced). Calls `onFound` with the lookup so
 * the caller can fill only the fields the user hasn't typed. Returns a
 * non-blocking hint when the PIN isn't recognised; other errors are silent.
 */
export function usePincodeAutofill(pincode: string, onFound: (found: PincodeLookup) => void): string {
  const [hint, setHint] = useState("");
  const onFoundRef = useRef(onFound);
  useEffect(() => {
    onFoundRef.current = onFound;
  });

  useEffect(() => {
    if (pincode.length !== 6) {
      setHint("");
      return;
    }
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const res = await backend.lookupPincode(pincode);
        if (!active) return;
        setHint("");
        onFoundRef.current(res);
      } catch (err) {
        if (active && err instanceof Error && err.message.includes("404")) {
          setHint("PIN not recognized — please enter city/state manually.");
        }
      }
    }, 400);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [pincode]);

  return hint;
}
