"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { CheckCircle2, Loader2, X } from "lucide-react";
import { backend, BackendAuthError } from "@/lib/backend";
import { trackLead } from "@/lib/analytics-events";
import { loadGuestDetails } from "@/lib/guest-orders";
import {
  LEAD_POPUP_DELAY_MS,
  LEAD_POPUP_RETRY_MS,
  decideLeadPopup,
  isLeadPopupRoute,
  loadLeadPopupState,
  markLeadPopupShown,
  markLeadPopupSubmitted,
  normaliseLeadPhone,
} from "@/lib/lead-popup";

const INVALID_PHONE = "Enter a valid 10-digit mobile number.";

/** This device already gave us a number at checkout. */
function hasSavedPhone(): boolean {
  return Boolean((loadGuestDetails().phone ?? "").replace(/\D/g, ""));
}

/** Typing in a field, or a header menu / another dialog is open: don't interrupt. */
function userIsBusy(): boolean {
  const el = document.activeElement;
  if (el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) {
    return true;
  }
  return Boolean(
    document.querySelector('header [aria-expanded="true"], dialog[open], [role="dialog"][aria-modal="true"]'),
  );
}

function readVisitorId(): string | undefined {
  try {
    return window.localStorage.getItem("svcar-vid")?.slice(0, 64) || undefined;
  } catch {
    return undefined;
  }
}

/**
 * "Need help finding the right part?" — asks for a WhatsApp number 30 seconds
 * into a visit, on browsing pages only. When it may appear is decided in
 * lib/lead-popup.ts (unit-tested); this component only gathers the inputs,
 * shows the dialog and posts the number.
 *
 * A native <dialog> opened with showModal(): the page behind is inert (focus
 * can't wander out to it), Escape closes it, and it sits in the top layer.
 * Phones get a bottom sheet that covers the WhatsApp button while open; wider
 * screens get a small card bottom-left, clear of that button (bottom-right).
 */
export default function LeadPopup() {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");

  const landedAt = useRef(0);
  /** Shown already, or ruled out for this visit. */
  const settled = useRef(false);
  const sending = useRef(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const successRef = useRef<HTMLParagraphElement>(null);

  const titleId = useId();
  const descId = useId();
  const inputId = useId();
  const errorId = useId();
  const consentId = useId();

  // 30s after landing, decide; every route change re-arms the check, so a
  // visitor who was on /cart at the 30s mark can still see it back on a PDP.
  useEffect(() => {
    if (!landedAt.current) landedAt.current = Date.now();
    if (settled.current) return;
    let timer = 0;
    const check = () => {
      const decision = decideLeadPopup({
        pathname,
        now: Date.now(),
        landedAt: landedAt.current,
        state: loadLeadPopupState(),
        hasSavedPhone: hasSavedPhone(),
        userBusy: userIsBusy(),
      });
      if (decision === "never") {
        settled.current = true;
      } else if (decision === "show") {
        settled.current = true;
        markLeadPopupShown(Date.now());
        returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setOpen(true);
      } else if (isLeadPopupRoute(pathname)) {
        // Busy (or woke early): look again shortly. On other pages, the next
        // route change re-runs this effect instead.
        const remaining = landedAt.current + LEAD_POPUP_DELAY_MS - Date.now();
        timer = window.setTimeout(check, Math.max(remaining, LEAD_POPUP_RETRY_MS));
      }
    };
    timer = window.setTimeout(check, Math.max(0, landedAt.current + LEAD_POPUP_DELAY_MS - Date.now()));
    return () => window.clearTimeout(timer);
  }, [pathname]);

  // Open as a modal and move focus to the dialog itself, so a screen reader
  // announces its title and text (and a phone keyboard doesn't pop up uninvited).
  useEffect(() => {
    const d = dialogRef.current;
    if (!open || !d) return;
    if (!d.open) d.showModal();
    d.focus();
  }, [open]);

  useEffect(() => {
    if (status === "sent") successRef.current?.focus();
  }, [status]);

  // Left for the cart/checkout etc. while it was open (e.g. iOS swipe-back):
  // it doesn't belong there, so close it.
  useEffect(() => {
    if (open && !isLeadPopupRoute(pathname)) dialogRef.current?.close();
  }, [open, pathname]);

  const close = useCallback(() => {
    dialogRef.current?.close(); // fires "close" → onClosed
  }, []);

  /** Runs for every way of closing: X, Escape, backdrop, Close after success. */
  function onClosed() {
    setOpen(false);
    const el = returnFocus.current;
    returnFocus.current = null;
    if (el && el.isConnected && el !== document.body) el.focus({ preventScroll: true });
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (sending.current || status === "sent") return;
    const ten = normaliseLeadPhone(phone);
    if (!ten) {
      setError(INVALID_PHONE);
      inputRef.current?.focus();
      return;
    }
    sending.current = true;
    setStatus("sending");
    setError("");
    try {
      await backend.submitPhoneLead({ phone: ten, pagePath: pathname.slice(0, 512), visitorId: readVisitorId(), consent: true });
      markLeadPopupSubmitted(Date.now());
      trackLead("popup");
      setStatus("sent");
    } catch (err) {
      setStatus("idle");
      if (err instanceof BackendAuthError && err.status === 400 && err.code === "invalid_phone") {
        setError(INVALID_PHONE);
      } else if (err instanceof BackendAuthError && err.status === 429) {
        setError("Too many tries from this connection. Please wait a few minutes and try again.");
      } else {
        setError("Couldn’t send your number. Please check your connection and try again.");
      }
      inputRef.current?.focus();
    } finally {
      sending.current = false;
    }
  }

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      tabIndex={-1}
      onClose={onClosed}
      // A click whose target is the <dialog> itself landed on the backdrop
      // (the panel inside fills the dialog box completely).
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      style={{ outline: "none" }}
      className="fixed inset-x-0 top-auto bottom-0 m-0 w-full max-w-none max-h-[85dvh] overflow-y-auto border-0 bg-transparent p-0 text-text-primary backdrop:bg-black/40 sm:left-5 sm:right-auto sm:bottom-5 sm:w-[360px] sm:backdrop:bg-black/20 motion-safe:animate-[slide-up_0.3s_cubic-bezier(0.22,1,0.36,1)]"
    >
      <div className="relative rounded-t-2xl border border-border-light bg-surface-card px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-elevated sm:rounded-2xl sm:pb-5">
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-dim hover:text-text-primary"
        >
          <X size={20} aria-hidden="true" />
        </button>

        <h2 id={titleId} className="pr-12 text-lg font-bold leading-snug">
          Need help finding the right part?
        </h2>
        <p id={descId} className="mt-1 text-sm text-text-secondary">
          Share your WhatsApp number and we&rsquo;ll help you check fitment and price.
        </p>

        {status === "sent" ? (
          <div className="mt-4">
            <p
              ref={successRef}
              tabIndex={-1}
              style={{ outline: "none" }}
              className="flex items-center gap-2 rounded-xl border border-success/30 bg-success/10 px-3 py-3 text-sm font-semibold text-text-primary"
            >
              <CheckCircle2 size={18} aria-hidden="true" className="shrink-0 text-success" />
              Thanks! We&rsquo;ll get in touch on WhatsApp.
            </p>
            <button type="button" onClick={close} className="btn btn-ghost mt-3 min-h-11 w-full">
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="mt-4">
            <label htmlFor={inputId} className="mb-1.5 block text-sm font-semibold">
              WhatsApp number
            </label>
            <div
              className={`flex items-stretch overflow-hidden rounded-xl border bg-surface-card ${
                error ? "border-danger" : "border-border focus-within:border-brand-orange"
              }`}
            >
              <span className="flex items-center border-r border-border bg-surface-dim px-3 text-[16px] font-medium text-text-secondary">
                +91
              </span>
              <input
                ref={inputRef}
                id={inputId}
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                placeholder="98765 43210"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  if (error) setError("");
                }}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${errorId} ${consentId}` : consentId}
                className="min-w-0 flex-1 bg-transparent px-3 py-3 text-[16px] text-text-primary placeholder:text-text-muted focus:outline-none"
              />
            </div>
            {error && (
              <p id={errorId} role="alert" className="mt-1.5 text-sm font-medium text-danger">
                {error}
              </p>
            )}
            <p id={consentId} className="mt-2 text-xs leading-relaxed text-text-secondary">
              By submitting, you agree to be contacted by SV Car Customs on WhatsApp or phone.
            </p>
            <button
              type="submit"
              disabled={status === "sending"}
              className="btn btn-primary mt-3 min-h-11 w-full disabled:opacity-70"
            >
              {status === "sending" && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
              Request a call back
            </button>
          </form>
        )}
      </div>
    </dialog>
  );
}
