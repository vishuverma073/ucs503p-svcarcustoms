"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertCircle, Loader2, Pencil, Plus, TicketPercent, Trash2, X } from "lucide-react";
import { usePromoCodes } from "@/lib/admin-hooks";
import { adminApi, AdminApiError } from "@/lib/admin-api";
import ConfirmDialog from "@/components/admin/ConfirmDialog";
import type { AdminPromoCode, AdminPromoCodeCreate } from "@svcar/contracts";

function inr(n: number): string {
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function fmtWhen(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** ISO → the value a <input type="datetime-local"> shows (this browser's local time). */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local value → ISO (null when blank). */
function fromLocalInput(v: string): string | null {
  return v ? new Date(v).toISOString() : null;
}

/** Live / Scheduled / Ended / Used up / Off — what a shopper would experience right now. */
function promoState(p: AdminPromoCode, now = Date.now()): { label: string; style: string } {
  if (!p.active) return { label: "Off", style: "bg-gray-200 text-gray-700" };
  if (p.startsAt && now < new Date(p.startsAt).getTime()) return { label: "Scheduled", style: "bg-blue-100 text-blue-800" };
  if (p.endsAt && now > new Date(p.endsAt).getTime()) return { label: "Ended", style: "bg-red-100 text-red-700" };
  if (p.usageLimit != null && p.usedCount >= p.usageLimit) return { label: "Used up", style: "bg-amber-100 text-amber-800" };
  return { label: "Live", style: "bg-green-100 text-green-800" };
}

interface FormState {
  code: string;
  percentOff: string;
  minSubtotal: string;
  maxDiscount: string;
  startsAt: string;
  endsAt: string;
  usageLimit: string;
}

const EMPTY: FormState = {
  code: "",
  percentOff: "",
  minSubtotal: "",
  maxDiscount: "",
  startsAt: "",
  endsAt: "",
  usageLimit: "",
};

function toForm(p: AdminPromoCode): FormState {
  return {
    code: p.code,
    percentOff: String(p.percentOff),
    minSubtotal: p.minSubtotal ? String(p.minSubtotal) : "",
    maxDiscount: p.maxDiscount != null ? String(p.maxDiscount) : "",
    startsAt: toLocalInput(p.startsAt),
    endsAt: toLocalInput(p.endsAt),
    usageLimit: p.usageLimit != null ? String(p.usageLimit) : "",
  };
}

/** Validate the form; returns the request body or an error message. */
function parseForm(f: FormState): { body: AdminPromoCodeCreate } | { error: string } {
  const code = f.code.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) return { error: "Code: 3–32 letters, digits, - or _" };
  const pct = Number(f.percentOff);
  if (!Number.isInteger(pct) || pct < 1 || pct > 90) return { error: "% off must be a whole number from 1 to 90" };
  const min = f.minSubtotal.trim() ? Number(f.minSubtotal) : 0;
  if (!Number.isFinite(min) || min < 0) return { error: "Minimum order must be ₹0 or more" };
  const cap = f.maxDiscount.trim() ? Number(f.maxDiscount) : null;
  if (cap !== null && (!Number.isFinite(cap) || cap <= 0)) return { error: "Max discount must be more than ₹0" };
  const limit = f.usageLimit.trim() ? Number(f.usageLimit) : null;
  if (limit !== null && (!Number.isInteger(limit) || limit < 1)) return { error: "Usage limit must be a whole number, 1 or more" };
  const startsAt = fromLocalInput(f.startsAt);
  const endsAt = fromLocalInput(f.endsAt);
  if (startsAt && endsAt && startsAt >= endsAt) return { error: "Ends must be after starts" };
  return {
    body: { code, percentOff: pct, minSubtotal: min, maxDiscount: cap, startsAt, endsAt, usageLimit: limit },
  };
}

function errorMessage(e: unknown, fallback: string): string {
  return e instanceof AdminApiError && e.message && e.message !== e.code ? e.message : fallback;
}

export default function PromoCodesPage() {
  const { data, isLoading, error, mutate } = usePromoCodes();
  // null = closed; "new" = create; a row = editing that code.
  const [editing, setEditing] = useState<AdminPromoCode | "new" | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AdminPromoCode | null>(null);
  const [deleting, setDeleting] = useState(false);

  const rows = data?.items ?? [];

  function openNew() {
    setForm(EMPTY);
    setFormError("");
    setEditing("new");
  }

  function openEdit(p: AdminPromoCode) {
    setForm(toForm(p));
    setFormError("");
    setEditing(p);
  }

  function set<K extends keyof FormState>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    if (formError) setFormError("");
  }

  async function save() {
    const parsed = parseForm(form);
    if ("error" in parsed) {
      setFormError(parsed.error);
      return;
    }
    setSaving(true);
    try {
      if (editing === "new") {
        await adminApi.createPromoCode(parsed.body);
        toast.success(`${parsed.body.code} created`);
      } else if (editing) {
        // Everything but the code itself (codes can't be renamed). The window
        // ends are sent only when edited: the minute-precision input would
        // otherwise turn a stored 23:59:59 end into 23:59:00 on any save.
        const b = parsed.body;
        await adminApi.updatePromoCode(editing.id, {
          percentOff: b.percentOff,
          minSubtotal: b.minSubtotal,
          maxDiscount: b.maxDiscount,
          ...(form.startsAt !== toLocalInput(editing.startsAt) ? { startsAt: b.startsAt } : {}),
          ...(form.endsAt !== toLocalInput(editing.endsAt) ? { endsAt: b.endsAt } : {}),
          usageLimit: b.usageLimit,
        });
        toast.success(`${editing.code} updated`);
      }
      setEditing(null);
      await mutate();
    } catch (e) {
      setFormError(
        e instanceof AdminApiError && e.status === 409
          ? `${parsed.body.code} already exists`
          : errorMessage(e, "Couldn’t save the code. Please try again."),
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggle(p: AdminPromoCode) {
    setToggling(p.id);
    try {
      await adminApi.updatePromoCode(p.id, { active: !p.active });
      toast.success(`${p.code} ${p.active ? "switched off" : "switched on"}`);
      await mutate();
    } catch (e) {
      toast.error(errorMessage(e, `Couldn’t update ${p.code}`));
    } finally {
      setToggling(null);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await adminApi.deletePromoCode(pendingDelete.id);
      toast.success(`Deleted ${pendingDelete.code}`);
      setPendingDelete(null);
      await mutate();
    } catch (e) {
      toast.error(errorMessage(e, "Couldn’t delete that code"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="max-w-5xl pb-20">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-text-primary">Promo codes</h1>
        <button onClick={openNew} className="btn btn-primary text-sm">
          <Plus size={15} /> New code
        </button>
      </div>
      <p className="mb-4 text-sm text-text-secondary">
        Percentage-off codes shoppers enter at checkout. A code works while it&rsquo;s on, inside its dates, under its
        usage limit and the order reaches its minimum. &ldquo;Used&rdquo; counts paid orders.
      </p>

      {editing !== null && (
        <div className="mb-5 rounded-xl border border-border-light bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold text-text-primary">
              {editing === "new" ? "New promo code" : `Edit ${editing.code}`}
            </h2>
            <button
              type="button"
              onClick={() => setEditing(null)}
              aria-label="Close"
              className="rounded-full p-1.5 text-text-muted hover:bg-surface-dim"
            >
              <X size={16} />
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="input-label" htmlFor="promo-code">Code</label>
              <input
                id="promo-code"
                value={form.code}
                onChange={(e) => set("code", e.target.value.toUpperCase())}
                disabled={editing !== "new"}
                className="input uppercase disabled:opacity-60"
                placeholder="DIWALI10"
                maxLength={32}
              />
            </div>
            <div>
              <label className="input-label" htmlFor="promo-pct">% off</label>
              <input
                id="promo-pct"
                inputMode="numeric"
                value={form.percentOff}
                onChange={(e) => set("percentOff", e.target.value.replace(/\D/g, "").slice(0, 2))}
                className="input"
                placeholder="10"
              />
            </div>
            <div>
              <label className="input-label" htmlFor="promo-min">Minimum order (₹)</label>
              <input
                id="promo-min"
                inputMode="decimal"
                value={form.minSubtotal}
                onChange={(e) => set("minSubtotal", e.target.value)}
                className="input"
                placeholder="7000"
              />
            </div>
            <div>
              <label className="input-label" htmlFor="promo-cap">Max discount (₹, optional)</label>
              <input
                id="promo-cap"
                inputMode="decimal"
                value={form.maxDiscount}
                onChange={(e) => set("maxDiscount", e.target.value)}
                className="input"
                placeholder="No cap"
              />
            </div>
            <div>
              <label className="input-label" htmlFor="promo-starts">Starts (optional)</label>
              <input
                id="promo-starts"
                type="datetime-local"
                value={form.startsAt}
                onChange={(e) => set("startsAt", e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="input-label" htmlFor="promo-ends">Ends (optional)</label>
              <input
                id="promo-ends"
                type="datetime-local"
                value={form.endsAt}
                onChange={(e) => set("endsAt", e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="input-label" htmlFor="promo-limit">Usage limit (optional)</label>
              <input
                id="promo-limit"
                inputMode="numeric"
                value={form.usageLimit}
                onChange={(e) => set("usageLimit", e.target.value.replace(/\D/g, ""))}
                className="input"
                placeholder="Unlimited"
              />
            </div>
            <div className="flex items-end">
              <button onClick={() => void save()} disabled={saving} className="btn btn-primary w-full text-sm disabled:opacity-50">
                {saving ? <Loader2 size={15} className="animate-spin" /> : editing === "new" ? "Create code" : "Save changes"}
              </button>
            </div>
          </div>
          {formError && (
            <p role="alert" className="mt-3 text-sm text-danger">
              {formError}
            </p>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-20 text-text-muted">
          <Loader2 className="animate-spin" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-2 py-20 text-center text-text-secondary">
          <AlertCircle className="text-danger" />
          <p className="text-sm">Couldn&rsquo;t load promo codes.</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-dim">
            <TicketPercent className="text-text-muted" />
          </div>
          <p className="font-medium text-text-secondary">No promo codes yet</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border-light bg-white shadow-sm">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-surface-dim/60 text-left text-xs uppercase tracking-wide text-text-secondary">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Code</th>
                <th className="px-3 py-2.5 font-semibold">% off</th>
                <th className="px-3 py-2.5 font-semibold">Min order</th>
                <th className="px-3 py-2.5 font-semibold">Window</th>
                <th className="px-3 py-2.5 font-semibold">Used / limit</th>
                <th className="px-3 py-2.5 font-semibold">Active</th>
                <th className="px-4 py-2.5" aria-label="Actions" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light">
              {rows.map((p) => {
                const state = promoState(p);
                return (
                  <tr key={p.id} className="hover:bg-surface-dim/40">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-text-primary">{p.code}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${state.style}`}>
                          {state.label}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {p.percentOff}%
                      {p.maxDiscount != null && (
                        <span className="block text-[11px] text-text-muted">max {inr(p.maxDiscount)}</span>
                      )}
                    </td>
                    <td className="px-3 py-3">{p.minSubtotal > 0 ? inr(p.minSubtotal) : "—"}</td>
                    <td className="px-3 py-3 text-xs text-text-secondary">
                      {fmtWhen(p.startsAt)}
                      <span className="block">→ {fmtWhen(p.endsAt)}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="font-semibold">{p.usedCount}</span>
                      <span className="text-text-muted"> / {p.usageLimit ?? "∞"}</span>
                    </td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={p.active}
                        aria-label={`${p.code} ${p.active ? "on" : "off"}`}
                        disabled={toggling === p.id}
                        onClick={() => void toggle(p)}
                        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                          p.active ? "bg-brand-orange" : "bg-gray-300"
                        }`}
                      >
                        <span
                          className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                            p.active ? "translate-x-5" : "translate-x-0.5"
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(p)}
                          aria-label={`Edit ${p.code}`}
                          title="Edit"
                          className="rounded-full p-1.5 text-text-muted hover:bg-surface-dim hover:text-text-primary"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDelete(p)}
                          aria-label={`Delete ${p.code}`}
                          title="Delete"
                          className="rounded-full p-1.5 text-text-muted hover:bg-danger/10 hover:text-danger"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete promo code?"
        message={`${pendingDelete?.code ?? ""} will stop working at checkout straight away. Orders already placed with it keep their discount. To pause it instead, switch it off.`}
        confirmLabel="Delete"
        danger
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
