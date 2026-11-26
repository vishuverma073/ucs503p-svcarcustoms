/**
 * Single source of truth for the API origin + mock switch.
 * Both the `backend` client and the MSW mocks read from here so the
 * handlers and the fetcher can never drift on the base URL.
 *
 * LAN / mobile dev: set NEXT_PUBLIC_USE_API_PROXY=true so the browser talks to
 * `/svcar-api/*` on the same host (Next.js rewrite → local API). SSR still
 * hits API_PROXY_TARGET directly.
 */
/** Resolve the API origin at call time (required for LAN/mobile proxy mode). */
export function getApiBase(): string {
  // Explicit URL wins — reliable for localhost dev against :8787.
  const direct = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (direct) return direct;

  if (process.env.NEXT_PUBLIC_USE_API_PROXY === "true") {
    if (typeof window !== "undefined") {
      return `${window.location.origin}/svcar-api`;
    }
    return process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8787";
  }

  return "http://localhost:8787";
}

/**
 * Origin for /auth/* calls — deliberately NOT always the API origin.
 *
 * The session survives a page load only through the httpOnly refresh cookie, and
 * a cookie set by a different site is a third-party cookie: Safari and Firefox
 * block those outright, so those customers were signed out on every reload. In
 * the browser these calls go to this origin instead, where next.config rewrites
 * /auth/* to the API — same-origin, so the cookie is first-party everywhere.
 *
 * SSR never needs the cookie, and the MSW handlers are bound to the API base, so
 * both keep talking to the API origin directly.
 */
export function getAuthBase(): string {
  if (USE_MOCKS || typeof window === "undefined") return getApiBase();
  // No NEXT_PUBLIC_API_URL means proxy/localhost mode — getApiBase() is already
  // same-origin (or a local host with no cross-site problem to solve).
  return process.env.NEXT_PUBLIC_API_URL?.trim() ? window.location.origin : getApiBase();
}

/** Static snapshot for MSW handlers; runtime fetches should call getApiBase(). */
export const API_BASE = getApiBase();

/** When true, MSW intercepts requests to API_BASE with mocked responses. */
export const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === "true";

/**
 * Which payment gateway the storefront expects the API to use. This project is
 * LOCKED to PayU (Razorpay is disabled), so this is hardcoded rather than read
 * from env. The real API also tells the client the provider via the create-order
 * response; this constant only drives the MSW mock + the "Secure payment via …"
 * label.
 */
export const PAYMENT_PROVIDER: "razorpay" | "payu" = "payu";

/**
 * Simulate Razorpay payments with the in-app mock modal instead of loading the
 * real checkout.razorpay.com SDK. True whenever API mocks are on, OR explicitly
 * via NEXT_PUBLIC_MOCK_PAYMENTS=true — so the checkout flow is fully testable
 * against the dummy backend (which has no real Razorpay keys). With a real
 * backend + real keys, leave both flags off to use the real SDK.
 */
export const MOCK_PAYMENTS =
  USE_MOCKS || process.env.NEXT_PUBLIC_MOCK_PAYMENTS === "true";
