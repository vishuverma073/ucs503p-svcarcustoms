/**
 * Diwali 2026 sale — the home-page banner and its code strip. Date-gated in
 * code: the banner showed until this moment (sale ended early by the owner on
 * 25 Nov), after which the normal hero comes back on its own. The home page
 * re-renders at most every 10 minutes (ISR), so the switch lands within that
 * window. The DIWALI10 / DIWALI5 codes themselves are switched off in admin.
 */
export const DIWALI_SALE_ENDS_AT = "2026-11-25T00:00:00+05:30";
const ENDS_MS = Date.parse(DIWALI_SALE_ENDS_AT);

export function isDiwaliSaleLive(now: number = Date.now()): boolean {
  return now < ENDS_MS;
}

/** The codes the banner advertises (seeded by API migration 0020). */
export const DIWALI_CODES = [
  { code: "DIWALI10", minLabel: "₹7,000+" },
  { code: "DIWALI5", minLabel: "₹3,000+" },
] as const;
