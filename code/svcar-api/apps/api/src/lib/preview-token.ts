import crypto from "node:crypto";

/**
 * Signed, expiring tokens for previewing unpublished (draft) products.
 *
 * `?preview=1` used to be an unauthenticated bare flag, which let anyone read
 * the entire unpublished catalogue. A preview link is now an HMAC bound to the
 * specific slug with a short TTL, minted only by the admin API.
 */
const TTL_MS = 30 * 60 * 1000; // 30 minutes — long enough to review, short enough to not leak

function secret(): string {
  const s = process.env.JWT_ADMIN_SECRET;
  if (!s) throw new Error("JWT_ADMIN_SECRET is required to sign preview tokens");
  return s;
}

function hmac(slug: string, exp: number): string {
  return crypto.createHmac("sha256", secret()).update(`${slug}.${exp}`).digest("base64url");
}

/** Mint a preview token for one slug (admin-only callers). */
export function signPreviewToken(slug: string, now = Date.now()): string {
  const exp = now + TTL_MS;
  return `${exp}.${hmac(slug, exp)}`;
}

/** True only for an unexpired token whose signature matches this exact slug. */
export function verifyPreviewToken(slug: string, token: string | undefined | null): boolean {
  if (!token) return false;
  const idx = token.indexOf(".");
  if (idx < 1) return false;
  const exp = Number(token.slice(0, idx));
  const sig = token.slice(idx + 1);
  if (!Number.isFinite(exp) || !sig || Date.now() > exp) return false;
  const expected = hmac(slug, exp);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
