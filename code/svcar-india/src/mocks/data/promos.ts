import type { AdminPromoCode, PromoRejectReason } from "@svcar/contracts";
import { promoDiscount, rupees } from "@/lib/promo";

/**
 * Mock promo codes — the two Diwali 2026 codes the 0020 migration seeds, plus
 * an ended one so the "Code expired" path is reachable in dev. Mutable: the
 * admin mock handlers create / edit / delete rows here.
 */
const DIWALI_ENDS = "2026-11-30T18:29:59.000Z"; // 30 Nov 23:59:59 IST

let seq = 3;
const promos: AdminPromoCode[] = [
  {
    id: 1,
    code: "DIWALI10",
    percentOff: 10,
    minSubtotal: 7000,
    maxDiscount: null,
    startsAt: "2026-10-20T00:00:00.000Z",
    endsAt: DIWALI_ENDS,
    active: true,
    usageLimit: null,
    usedCount: 4,
    createdAt: "2026-10-20T00:00:00.000Z",
  },
  {
    id: 2,
    code: "DIWALI5",
    percentOff: 5,
    minSubtotal: 3000,
    maxDiscount: null,
    startsAt: "2026-10-20T00:00:00.000Z",
    endsAt: DIWALI_ENDS,
    active: true,
    usageLimit: null,
    usedCount: 9,
    createdAt: "2026-10-20T00:00:00.000Z",
  },
  {
    id: 3,
    code: "MONSOON15",
    percentOff: 15,
    minSubtotal: 5000,
    maxDiscount: 1500,
    startsAt: "2026-07-01T00:00:00.000Z",
    endsAt: "2026-08-31T18:29:59.000Z",
    active: true,
    usageLimit: 100,
    usedCount: 37,
    createdAt: "2026-07-01T00:00:00.000Z",
  },
];

export const listMockPromos = () => promos;
export const findMockPromo = (code: string) => promos.find((p) => p.code === code);
export const findMockPromoById = (id: number) => promos.find((p) => p.id === id);

export function addMockPromo(p: Omit<AdminPromoCode, "id" | "usedCount" | "createdAt">): AdminPromoCode {
  const row: AdminPromoCode = { ...p, id: ++seq, usedCount: 0, createdAt: new Date().toISOString() };
  promos.unshift(row);
  return row;
}

export function removeMockPromo(id: number): boolean {
  const i = promos.findIndex((p) => p.id === id);
  if (i < 0) return false;
  promos.splice(i, 1);
  return true;
}

/** Same checks, order and messages as the API's evaluatePromo. */
export function liveCheck(p: AdminPromoCode, now = Date.now()): { reason: PromoRejectReason; message: string } | null {
  if (!p.active) return { reason: "inactive", message: "This code is no longer active" };
  if (p.startsAt && now < Date.parse(p.startsAt)) return { reason: "not_started", message: "This code isn’t active yet" };
  if (p.endsAt && now > Date.parse(p.endsAt)) return { reason: "expired", message: "Code expired" };
  if (p.usageLimit != null && p.usedCount >= p.usageLimit) {
    return { reason: "used_up", message: "This code has reached its usage limit" };
  }
  return null;
}

export type MockPromoResult =
  | { ok: true; code: string; percentOff: number; discount: number; message: string }
  | { ok: false; code: string; reason: PromoRejectReason; message: string; shortBy?: number };

export function evaluateMockPromo(code: string, subtotal: number): MockPromoResult {
  const p = findMockPromo(code);
  if (!p) return { ok: false, code, reason: "invalid", message: "Invalid code" };
  const notLive = liveCheck(p);
  // Switched-off / scheduled codes answer like unknown ones (as the API does).
  if (notLive && (notLive.reason === "inactive" || notLive.reason === "not_started")) {
    return { ok: false, code, reason: "invalid", message: "Invalid code" };
  }
  if (notLive) return { ok: false, code, ...notLive };
  const short = Math.round(p.minSubtotal * 100) - Math.round(subtotal * 100);
  if (short > 0) {
    return { ok: false, code, reason: "min_subtotal", message: `Add ${rupees(short / 100)} more to use ${code}`, shortBy: short / 100 };
  }
  const discount = promoDiscount(subtotal, p.percentOff, p.maxDiscount);
  return { ok: true, code, percentOff: p.percentOff, discount, message: `${code} applied — you save ${rupees(discount)}` };
}
