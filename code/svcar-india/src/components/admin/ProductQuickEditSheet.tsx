"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { toast } from "sonner";
import { ExternalLink, Loader2, Save } from "lucide-react";
import type { Product } from "@svcar/contracts";
import { cn } from "@/lib/utils";
import { adminApi, AdminApiError } from "@/lib/admin-api";
import {
  buildQuickEditPatch,
  draftsChanged,
  draftsFromProduct,
  skuLabel,
  validateDrafts,
  type SkuDraft,
  type SkuDraftErrors,
} from "@/lib/quick-edit";
import BottomSheet from "./BottomSheet";

function Field({
  id,
  label,
  value,
  onChange,
  error,
  prefix,
  inputMode,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  prefix?: string;
  inputMode: "decimal" | "numeric";
  placeholder?: string;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-text-muted">
        {label}
      </label>
      <div className="relative">
        {prefix && (
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-text-muted">
            {prefix}
          </span>
        )}
        <input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode={inputMode}
          pattern={inputMode === "numeric" ? "[0-9]*" : undefined}
          enterKeyHint="next"
          autoComplete="off"
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err` : undefined}
          // 16px text: iPhone zooms the page into any smaller input on focus.
          className={cn(
            "h-11 w-full rounded-lg border bg-white px-2.5 text-base tabular-nums text-text-primary outline-none focus:border-brand-orange focus:ring-2 focus:ring-brand-orange/20",
            prefix && "pl-6",
            error ? "border-danger" : "border-border",
          )}
        />
      </div>
      {error && (
        <p id={`${id}-err`} className="mt-1 text-[11px] font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function QuickEditForm({
  product,
  onSaved,
  onBusy,
}: {
  product: Product;
  onSaved: (p: Product) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [drafts, setDrafts] = useState<SkuDraft[]>(() => draftsFromProduct(product));
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);

  const { ok, errors } = validateDrafts(drafts);
  const changed = draftsChanged(product, drafts);

  function update(i: number, key: keyof SkuDraft, value: string) {
    setDrafts((prev) => prev.map((d, j) => (j === i ? { ...d, [key]: value } : d)));
  }

  async function save() {
    setShowErrors(true);
    if (!ok) {
      toast.error("Fix the highlighted fields first");
      return;
    }
    if (!changed) return;
    setSaving(true);
    onBusy(true);
    try {
      const updated = await adminApi.updateProduct(product.id, buildQuickEditPatch(product, drafts));
      toast.success(`Saved · ${product.name}`);
      onSaved(updated);
    } catch (err) {
      toast.error(err instanceof AdminApiError ? err.message : "Save failed — check your connection");
    } finally {
      setSaving(false);
      onBusy(false);
    }
  }

  const visibleErrors: SkuDraftErrors[] = showErrors ? errors : drafts.map(() => ({}));

  return (
    <form
      // Our own messages, not the browser's: the stock field's numeric-keypad
      // `pattern` would otherwise block submit silently on "-3".
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="flex flex-col"
      data-testid="quick-edit-form"
    >
      <ul className="divide-y divide-border-light">
        {product.skus.map((sku, i) => {
          const d = drafts[i]!;
          const err = visibleErrors[i] ?? {};
          return (
            <li key={sku.id} className="py-3 first:pt-1">
              <p className="mb-2 flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-semibold text-text-primary">{skuLabel(sku)}</span>
                <span className="shrink-0 font-mono text-[11px] text-text-muted">{sku.skuCode}</span>
              </p>
              <div className="grid grid-cols-3 gap-2">
                <Field
                  id={`qe-${sku.id}-price`}
                  label="Price"
                  prefix="₹"
                  inputMode="decimal"
                  value={d.price}
                  onChange={(v) => update(i, "price", v)}
                  error={err.price}
                />
                <Field
                  id={`qe-${sku.id}-sale`}
                  label="Sale price"
                  prefix="₹"
                  inputMode="decimal"
                  placeholder="—"
                  value={d.salePrice}
                  onChange={(v) => update(i, "salePrice", v)}
                  error={err.salePrice}
                />
                <Field
                  id={`qe-${sku.id}-stock`}
                  label="Stock"
                  inputMode="numeric"
                  placeholder="—"
                  value={d.stock}
                  onChange={(v) => update(i, "stock", v)}
                  error={err.stock}
                />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-1 text-[11px] text-text-muted">
        Leave Sale price empty for no sale. Leave Stock empty if you don&rsquo;t track it.
      </p>
      {/* Pinned save, also reachable with the keyboard's Go/Enter. */}
      <div
        className="sticky bottom-0 -mx-4 mt-3 border-t border-border-light bg-white px-4 pt-3"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <button
          type="submit"
          disabled={saving || !changed}
          className="btn btn-primary h-12 w-full justify-center text-sm disabled:opacity-50"
          data-testid="quick-edit-save"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} aria-hidden />}
          {changed ? "Save changes" : "No changes"}
        </button>
      </div>
    </form>
  );
}

/**
 * Bottom sheet: one product's SKUs with Price / Sale price / Stock inputs
 * (numeric keypad on phones). Saves through PATCH /admin/products/:id.
 */
export default function ProductQuickEditSheet({
  productId,
  productName,
  onClose,
  onSaved,
}: {
  productId: number | null;
  productName: string;
  onClose: () => void;
  onSaved: (p: Product) => void;
}) {
  const [busy, setBusy] = useState(false);
  const { data: product, error, isLoading, mutate } = useSWR(
    productId != null ? ["admin/products", productId, "quick-edit"] : null,
    () => adminApi.getProduct(productId as number),
    { revalidateOnFocus: false, shouldRetryOnError: false, dedupingInterval: 0 },
  );

  return (
    <BottomSheet
      open={productId != null}
      onClose={onClose}
      busy={busy}
      title={productName || "Quick edit"}
      subtitle={
        productId != null && (
          <Link
            href={`/admin/products/${productId}/edit`}
            className="inline-flex items-center gap-1 font-semibold text-brand-orange"
            onClick={onClose}
          >
            Open full editor <ExternalLink size={12} aria-hidden />
          </Link>
        )
      }
    >
      {isLoading || (!product && !error) ? (
        <div className="flex justify-center py-10 text-text-muted">
          <Loader2 className="animate-spin" />
        </div>
      ) : error || !product ? (
        <p className="py-10 text-center text-sm text-danger">Couldn&rsquo;t load this product.</p>
      ) : (
        // Keyed by product + its stored numbers, so reopening (or fresher data)
        // always starts from what's saved.
        <QuickEditForm
          key={`${product.id}:${product.skus.map((s) => `${s.id}-${s.price}-${s.salePrice}-${s.stock}`).join(",")}`}
          product={product}
          onSaved={(updated) => {
            void mutate(updated, { revalidate: false });
            onSaved(updated);
          }}
          onBusy={setBusy}
        />
      )}
    </BottomSheet>
  );
}
