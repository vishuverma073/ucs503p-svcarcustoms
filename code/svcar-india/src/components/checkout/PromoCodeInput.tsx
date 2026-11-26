"use client";

import { useState } from "react";
import { Loader2, Tag, X } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { promoChipLabel, promoShortfall, rupees } from "@/lib/promo";
import type { PromoController } from "@/lib/use-promo";

/**
 * Checkout promo code box (signed-in and guest): type a code + Apply, or tap a
 * suggestion chip; once applied, a pill with the saving and a × to remove it.
 * Chips the cart doesn't reach yet say how much more to add.
 */
export default function PromoCodeInput({ promo, subtotal }: { promo: PromoController; subtotal: number }) {
    const [value, setValue] = useState("");
    const applied = promo.appliedCode;
    const busy = promo.applying || promo.checking;
    const chips = promo.active.filter((p) => p.code !== applied);

    async function submit(code = value) {
        await promo.apply(code);
    }

    return (
        <div className="mt-5 border-t border-border-light pt-4">
            <h3 className="flex items-center gap-2 text-sm font-bold text-text-primary mb-3">
                <Tag size={15} className="text-brand-orange" /> Promo code
            </h3>

            {applied ? (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-success/30 bg-success/10 px-3 py-2.5 text-sm">
                    <span className="min-w-0 text-text-primary">
                        <span className="font-bold text-success">{applied}</span> applied — you save{" "}
                        <span className="font-bold">{formatPrice(promo.discount)}</span>
                    </span>
                    <button
                        type="button"
                        onClick={() => {
                            promo.remove();
                            setValue("");
                        }}
                        aria-label={`Remove promo code ${applied}`}
                        className="shrink-0 rounded-full p-1.5 text-text-secondary hover:bg-success/15 hover:text-text-primary"
                    >
                        <X size={16} />
                    </button>
                </div>
            ) : (
                <div className="flex gap-2">
                    <label htmlFor="promo-code" className="sr-only">
                        Promo code
                    </label>
                    <input
                        id="promo-code"
                        value={value}
                        onChange={(e) => {
                            setValue(e.target.value.toUpperCase());
                            if (promo.error) promo.clearError();
                        }}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                void submit();
                            }
                        }}
                        autoComplete="off"
                        autoCapitalize="characters"
                        spellCheck={false}
                        maxLength={32}
                        placeholder="Enter code"
                        aria-invalid={promo.error ? true : undefined}
                        aria-describedby={promo.error ? "promo-code-error" : undefined}
                        className="input flex-1 uppercase"
                    />
                    <button
                        type="button"
                        onClick={() => void submit()}
                        disabled={busy || !value.trim()}
                        className="btn btn-secondary shrink-0 px-4 disabled:opacity-50"
                    >
                        {promo.applying ? <Loader2 size={16} className="animate-spin" /> : "Apply"}
                    </button>
                </div>
            )}

            {promo.checking && (
                <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-text-muted">
                    <Loader2 size={12} className="animate-spin" /> Checking your promo code…
                </p>
            )}
            {promo.error && (
                <p id="promo-code-error" role="alert" className="mt-1.5 text-[11px] text-danger">
                    {promo.error}
                </p>
            )}

            {chips.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                    {chips.map((p) => {
                        const short = promoShortfall(p, subtotal);
                        return (
                            <button
                                key={p.code}
                                type="button"
                                disabled={busy}
                                onClick={() => {
                                    setValue(p.code);
                                    void submit(p.code);
                                }}
                                className={`rounded-full border px-3 py-1.5 text-left text-xs transition-colors disabled:opacity-50 ${
                                    short > 0
                                        ? "border-border-light text-text-secondary hover:bg-surface-dim"
                                        : "border-brand-orange/40 bg-brand-orange/5 font-semibold text-brand-orange hover:bg-brand-orange/10"
                                }`}
                            >
                                {promoChipLabel(p)}
                                {short > 0 && <span className="text-text-muted"> · add {rupees(short)} more</span>}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
