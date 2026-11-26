"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DIWALI_CODES } from "@/lib/diwali-sale";

/** "Use code DIWALI10 (₹7,000+) or DIWALI5 (₹3,000+) at checkout" — tap a code to copy it. */
export default function DiwaliCodeStrip() {
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      toast.success(`${code} copied — paste it at checkout`);
      window.setTimeout(() => setCopied((c) => (c === code ? null : c)), 2000);
    } catch {
      toast.error(`Couldn’t copy. The code is ${code}.`);
    }
  }

  return (
    <p className="max-w-380 mx-auto px-4 py-2.5 text-center text-[13px] leading-relaxed text-white/85">
      Use code{" "}
      {DIWALI_CODES.map(({ code, minLabel }, i) => (
        <span key={code}>
          {i > 0 && " or "}
          <button
            type="button"
            onClick={() => void copy(code)}
            aria-label={`Copy code ${code}`}
            className="inline-flex items-center gap-1 rounded-md border border-dashed border-amber-300/70 px-1.5 py-0.5 font-mono font-bold text-amber-300 hover:bg-white/10"
          >
            {code}
            {copied === code ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
          </button>{" "}
          ({minLabel})
        </span>
      ))}{" "}
      at checkout
    </p>
  );
}
