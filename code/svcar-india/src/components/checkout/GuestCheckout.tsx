"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { GuestOrderRequestSchema, INDIAN_STATES, type GuestOrderRequest } from "@svcar/contracts";
import StoreProductThumb from "@/components/store/StoreProductThumb";
import CheckoutSummary from "@/components/checkout/CheckoutSummary";
import CheckoutPaySection from "@/components/checkout/CheckoutPaySection";
import CheckoutHelpLink from "@/components/checkout/CheckoutHelpLink";
import PaymentOptions from "@/components/checkout/PaymentOptions";
import PromoCodeInput from "@/components/checkout/PromoCodeInput";
import { usePromo } from "@/lib/use-promo";
import { useCartStore } from "@/store/cartStore";
import { useStoreSettings } from "@/lib/use-store-settings";
import { codAdvanceFor, computeTotals } from "@/lib/checkout";
import { formatPrice, toMobile10 } from "@/lib/utils";
import { validateCartStock, type CartStockIssue } from "@/lib/cart-stock";
import { usePincodeAutofill } from "@/lib/use-pincode-autofill";
import { loadGuestDetails, saveGuestDetails, type GuestDetails } from "@/lib/guest-orders";
import { useCartPriceCheck } from "@/lib/use-cart-price-check";
import PriceUpdateNotice from "@/components/store/PriceUpdateNotice";

const EMPTY: GuestDetails = {
  email: "",
  fullName: "",
  phone: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  pincode: "",
  landmark: "",
};

/** Page order of the required fields — the first invalid one gets focus. */
const FIELD_ORDER: (keyof GuestDetails)[] = ["email", "fullName", "phone", "line1", "pincode", "city", "state"];

/**
 * Checkout without an account: contact email + delivery address, then pay.
 * The cart is the local one (a guest has no server cart); the API re-prices
 * every line, so what's shown here is only the preview it was before.
 */
export default function GuestCheckout() {
  const router = useRouter();
  const items = useCartStore((s) => s.items);
  const { data: settings, error: settingsError } = useStoreSettings();

  const [details, setDetails] = useState<GuestDetails>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof GuestDetails, string>>>({});
  const [paymentMethod, setPaymentMethod] = useState<"prepaid" | "cod">("prepaid");
  const [stockIssues, setStockIssues] = useState<CartStockIssue[]>([]);
  const [checkingStock, setCheckingStock] = useState(true);
  // The browser cart remembers the price each line had when it was added; bring
  // every line to today's price before showing a total (and again on Pay).
  const priceCheck = useCartPriceCheck();
  const unavailable = (priceCheck.diff?.unavailable.length ?? 0) > 0;
  // Promo code, re-checked whenever a line, quantity or price changes.
  const promoLines = useMemo(() => items.map((i) => ({ skuId: i.id, qty: i.qty, price: i.price })), [items]);
  const promo = usePromo(promoLines);

  // Prefill from this device's last guest checkout (client-only storage).
  useEffect(() => {
    setDetails((d) => ({ ...d, ...loadGuestDetails() }));
  }, []);

  // Arriving with nothing to buy → back to the cart. Checked once on arrival:
  // later the cart empties because the order was paid, which isn't an error.
  useEffect(() => {
    if (useCartStore.getState().items.length === 0) {
      toast.info("Your cart is empty.");
      router.replace("/cart");
    }
  }, [router]);

  useEffect(() => {
    if (items.length === 0) {
      setStockIssues([]);
      setCheckingStock(false);
      return;
    }
    let active = true;
    setCheckingStock(true);
    validateCartStock(items)
      .then((issues) => {
        if (active) setStockIssues(issues);
      })
      .finally(() => {
        if (active) setCheckingStock(false);
      });
    return () => {
      active = false;
    };
  }, [items]);

  // Fill city/state from the PIN without overwriting what the shopper typed,
  // and drop any "enter the city/state" errors the fill just answered.
  const pincodeHint = usePincodeAutofill(details.pincode, (res) => {
    setDetails((d) => ({
      ...d,
      city: d.city.trim() ? d.city : res.city,
      state: d.state ? d.state : res.state,
    }));
    setErrors((e) => (e.city || e.state ? { ...e, city: undefined, state: undefined } : e));
  });

  function set(key: keyof GuestDetails, value: string) {
    setDetails((d) => ({ ...d, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  }

  /** Validate the form; on success remember the details and return the order. */
  function buildOrder(): GuestOrderRequest | null {
    const { email, ...address } = details;
    const parsed = GuestOrderRequestSchema.safeParse({
      items: items.map((i) => ({ skuId: i.id, qty: i.qty })),
      email,
      address,
      paymentMethod,
      ...(promo.appliedCode ? { promoCode: promo.appliedCode } : {}),
    });
    if (!parsed.success) {
      const next: Partial<Record<keyof GuestDetails, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[issue.path.length - 1]) as keyof GuestDetails;
        if (key in EMPTY && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      const first = FIELD_ORDER.find((k) => next[k]);
      if (first) document.getElementById(`guest-${first}`)?.focus();
      else toast.error("Something in your cart needs a look. Please go back to the cart.");
      return null;
    }
    saveGuestDetails(details);
    return parsed.data;
  }

  if (items.length === 0 || (!settings && !settingsError)) {
    return (
      <div className="flex items-center justify-center py-32 text-text-muted">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  const totals = computeTotals(items, settings, promo.discount);
  const codAdvance = codAdvanceFor(totals.total);
  const err = (k: keyof GuestDetails) =>
    errors[k] && <p className="text-[11px] text-danger mt-1">{errors[k]}</p>;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between gap-4 mb-5">
        <Link
          href="/cart"
          className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-brand-orange"
        >
          <ChevronLeft size={15} /> Back to cart
        </Link>
        <CheckoutHelpLink />
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-6">
        <h1 className="font-display uppercase text-3xl font-extrabold text-text-primary tracking-[0.02em] leading-none">Checkout</h1>
        <Link href="/login?returnTo=/checkout" className="text-xs font-medium text-brand-orange hover:underline">
          Have an account? Sign in
        </Link>
      </div>
      <PriceUpdateNotice diff={priceCheck.diff} className="mb-5" />

      <div className="grid lg:grid-cols-12 gap-8">
        {/* Left: contact + address + items */}
        <div className="lg:col-span-7 space-y-8">
          <section>
            <h2 className="flex items-center gap-2 d-label !text-[15px] text-text-primary mb-3">
              <span className="inline-flex h-6 w-6 items-center justify-center border border-border font-display text-[13px]" aria-hidden>1</span> Contact
            </h2>
            <div className="bg-white border border-border p-4">
              <label className="input-label" htmlFor="guest-email">Email</label>
              <input
                id="guest-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={details.email}
                onChange={(e) => set("email", e.target.value)}
                className="input"
                placeholder="you@example.com"
              />
              {err("email")}
              <p className="text-[11px] text-text-muted mt-1.5">
                Your order confirmation is sent here. No account or password needed.
              </p>
            </div>
          </section>

          <section>
            <h2 className="flex items-center gap-2 d-label !text-[15px] text-text-primary mb-3">
              <span className="inline-flex h-6 w-6 items-center justify-center border border-border font-display text-[13px]" aria-hidden>2</span> Delivery address
            </h2>
            <div className="bg-white border border-border p-4 space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="input-label" htmlFor="guest-fullName">Full name</label>
                  <input
                    id="guest-fullName"
                    autoComplete="name"
                    value={details.fullName}
                    onChange={(e) => set("fullName", e.target.value)}
                    className="input"
                    placeholder="Your full name"
                  />
                  {err("fullName")}
                </div>
                <div>
                  <label className="input-label" htmlFor="guest-phone">Mobile number</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-text-muted pointer-events-none">+91</span>
                    <input
                      id="guest-phone"
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel-national"
                      value={details.phone}
                      onChange={(e) => set("phone", toMobile10(e.target.value))}
                      className="input pl-12!"
                      placeholder="10-digit mobile"
                    />
                  </div>
                  {err("phone")}
                </div>
              </div>

              <div>
                <label className="input-label" htmlFor="guest-line1">Address line 1</label>
                <input
                  id="guest-line1"
                  autoComplete="address-line1"
                  value={details.line1}
                  onChange={(e) => set("line1", e.target.value)}
                  className="input"
                  placeholder="House / flat, building, street"
                />
                {err("line1")}
              </div>

              <div>
                <label className="input-label" htmlFor="guest-line2">Address line 2 (optional)</label>
                <input
                  id="guest-line2"
                  autoComplete="address-line2"
                  value={details.line2}
                  onChange={(e) => set("line2", e.target.value)}
                  className="input"
                  placeholder="Area, colony"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="input-label" htmlFor="guest-pincode">PIN code</label>
                  <input
                    id="guest-pincode"
                    inputMode="numeric"
                    autoComplete="postal-code"
                    value={details.pincode}
                    onChange={(e) => set("pincode", e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="input"
                    placeholder="6 digits"
                  />
                  {err("pincode")}
                  {pincodeHint && <p className="text-[11px] text-text-muted mt-1">{pincodeHint}</p>}
                </div>
                <div>
                  <label className="input-label" htmlFor="guest-city">City</label>
                  <input
                    id="guest-city"
                    autoComplete="address-level2"
                    value={details.city}
                    onChange={(e) => set("city", e.target.value)}
                    className="input"
                    placeholder="City"
                  />
                  {err("city")}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="input-label" htmlFor="guest-state">State</label>
                  <select
                    id="guest-state"
                    autoComplete="address-level1"
                    value={details.state}
                    onChange={(e) => set("state", e.target.value)}
                    className="input"
                  >
                    <option value="">Select state</option>
                    {INDIAN_STATES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  {err("state")}
                </div>
                <div>
                  <label className="input-label" htmlFor="guest-landmark">Landmark (optional)</label>
                  <input
                    id="guest-landmark"
                    value={details.landmark}
                    onChange={(e) => set("landmark", e.target.value)}
                    className="input"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Items recap */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="d-label !text-[15px] text-text-primary">
                Items ({items.reduce((n, i) => n + i.qty, 0)})
              </h2>
              <Link href="/cart" className="text-xs font-medium text-brand-orange hover:underline">
                Edit cart
              </Link>
            </div>
            <div className="bg-white border border-border divide-y divide-border">
              {items.map((item) => (
                <div key={item.cartKey} className="flex gap-3 p-3.5">
                  <div className="w-16 h-16 bg-surface-dim rounded-xl overflow-hidden shrink-0 border border-border-light">
                    <StoreProductThumb
                      src={item.image}
                      alt={item.name}
                      width={64}
                      height={64}
                      className="object-contain w-full h-full p-1.5"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-text-primary line-clamp-2">{item.name}</p>
                    {item.variant && <p className="text-xs text-text-secondary mt-0.5">{item.variant}</p>}
                    <p className="text-xs text-text-muted mt-1">Qty {item.qty}</p>
                  </div>
                  <span className="text-sm font-bold text-text-primary whitespace-nowrap">
                    {formatPrice(item.price * item.qty)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Right: sticky summary */}
        <div className="lg:col-span-5">
          <div className="bg-surface-card border border-border p-5 lg:sticky lg:top-24">
            <h2 className="font-display uppercase text-xl font-extrabold text-text-primary mb-4 tracking-[0.04em]">Order Summary</h2>
            <CheckoutSummary totals={totals} settings={settings} promoCode={promo.appliedCode} />
            <PromoCodeInput promo={promo} subtotal={totals.subtotal} />
            <PaymentOptions
              total={totals.total}
              paymentMethod={paymentMethod}
              onChange={setPaymentMethod}
              stockIssues={stockIssues}
            />
            <div className="mt-5">
              <CheckoutPaySection
                guestOrder={buildOrder}
                amount={paymentMethod === "cod" ? codAdvance : totals.total}
                totalAmount={totals.total}
                paymentMethod={paymentMethod}
                disabled={
                  checkingStock ||
                  stockIssues.length > 0 ||
                  !priceCheck.checked ||
                  unavailable ||
                  promo.checking ||
                  promo.applying
                }
                onPromoRejected={promo.remove}
                refreshPrices={priceCheck.recheck}
                onPriceChanged={priceCheck.recheck}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
