import crypto from "node:crypto";
import { Hono } from "hono";
import { eq, inArray } from "drizzle-orm";
import {
  CreateGuestOrderRequestSchema,
  CreateGuestOrderResponseSchema,
  GuestOrderAccessSchema,
  GuestOrderViewSchema,
  type GuestOrderAccess,
} from "@svcar/contracts";
import type { DbClient } from "../db/client.js";
import { orders, skus } from "../db/schema.js";
import { ipRateLimit } from "../middleware/ip-rate-limit.js";
import { buildOrderLines, linesSubtotal, mergeLines, placeOrder, repayOrder } from "../lib/place-order.js";
import { settleIfPaidAtPayu } from "../lib/mark-paid.js";
import { promoOrderError, resolveOrderPromo } from "../lib/promo.js";
import { loadOrderEvents, toOrderDetail } from "../lib/order-detail.js";
import type { AppEnv } from "../lib/types.js";

/**
 * Guest checkout: place, pay for and view an order without an account.
 *
 * Asking shoppers to sign in before paying lost most of them at the login page,
 * so ordering no longer needs one. A guest order has no user; instead the
 * browser that placed it gets a random token, and that token (sent in the JSON
 * body, never the URL, so it stays out of logs) is what unlocks the order's
 * retry-payment and tracking calls. Only the token's SHA-256 is stored. From
 * any other device, the email or mobile the order was placed with unlocks the
 * same calls (the storefront's Track order page), so tracking never needs a login.
 *
 * Mounted at /guest-checkout, outside /checkout, whose router requires auth.
 */

export function hashGuestToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Constant-time check of a presented token against the stored hash. */
function tokenMatches(token: string, storedHash: string | null): boolean {
  if (!storedHash) return false;
  const presented = Buffer.from(hashGuestToken(token), "hex");
  const stored = Buffer.from(storedHash, "hex");
  return presented.length === stored.length && crypto.timingSafeEqual(presented, stored);
}

/** A 10-digit mobile from "+91 98765 43210", "098765 43210" etc.; null if it isn't one. */
function mobile10(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  const ten = digits.length > 10 && /^(91|0)/.test(digits) ? digits.slice(-10) : digits;
  return /^[6-9]\d{9}$/.test(ten) ? ten : null;
}

/** Does the email or mobile the shopper typed match the one the order was placed with? */
export function contactMatches(
  contact: string,
  order: { customerEmail: string | null; customerPhone: string },
): boolean {
  const value = contact.trim().toLowerCase();
  if (value.includes("@")) return !!order.customerEmail && order.customerEmail.toLowerCase() === value;
  const phone = mobile10(value);
  return phone !== null && mobile10(order.customerPhone) === phone;
}

/**
 * Whether a guest pay/view request may see this order: the browser's token, or
 * the order's own email / mobile (Track order page). Orders a guest later
 * claimed by signing in still answer to both, so links keep working.
 */
function canAccess(
  access: GuestOrderAccess,
  order: { guestTokenHash: string | null; customerEmail: string | null; customerPhone: string },
): boolean {
  return "token" in access ? tokenMatches(access.token, order.guestTokenHash) : contactMatches(access.contact, order);
}

export function makeGuestCheckoutRouter(db: DbClient) {
  const router = new Hono<AppEnv>();

  // POST /guest-checkout/orders — place an order and start its PayU payment.
  // Unauthenticated and it writes rows, so it gets a tight per-IP budget.
  router.post("/orders", ipRateLimit("guest-order", 10, 600), async (c) => {
    const parsed = CreateGuestOrderRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Invalid request", issues: parsed.error.flatten() }, 400);
    }
    const body = parsed.data;

    // The cart comes from the browser, but only ids and quantities are used:
    // every SKU, price and stock level is read here.
    const wanted = mergeLines(body.items);
    const rows = await db.query.skus.findMany({
      where: inArray(
        skus.id,
        wanted.map((w) => w.skuId),
      ),
      with: {
        product: { with: { images: { orderBy: (img, { asc }) => [asc(img.sortOrder)] } } },
      },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const built = buildOrderLines(wanted.map((w) => ({ ...w, sku: byId.get(w.skuId) })));
    if (!built.ok) return c.json(built.body, built.status);

    // Same promo re-check as signed-in checkout: refuse, don't charge full price.
    const promo = await resolveOrderPromo(db, body.promoCode, linesSubtotal(built.lines));
    if (!promo.ok) return c.json(promoOrderError(promo), 422);

    const token = crypto.randomBytes(24).toString("base64url");
    const response = await placeOrder(db, c, {
      userId: null,
      guestTokenHash: hashGuestToken(token),
      customer: { name: body.address.fullName, phone: body.address.phone, email: body.email },
      shippingAddress: body.address,
      lines: built.lines,
      paymentMethod: body.paymentMethod,
      notes: body.notes,
      promo: promo.promo,
    });
    return c.json(CreateGuestOrderResponseSchema.parse({ ...response, guestToken: token }));
  });

  // POST /guest-checkout/orders/:orderNumber/pay — retry payment for an unpaid
  // order. Wrong credentials are a 404, exactly like an unknown order.
  router.post("/orders/:orderNumber/pay", ipRateLimit("guest-pay", 20, 600), async (c) => {
    const access = GuestOrderAccessSchema.safeParse(await c.req.json().catch(() => null));
    if (!access.success) return c.json({ error: "Not Found" }, 404);

    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.orderNumber, c.req.param("orderNumber").trim().toUpperCase()))
      .limit(1);
    if (!order || !canAccess(access.data, order)) {
      return c.json({ error: "Not Found" }, 404);
    }
    if (order.status !== "pending") {
      // Already paid / shipped / cancelled — nothing to retry.
      return c.json({ error: "Order is not awaiting payment", status: order.status }, 409);
    }
    // An earlier attempt may have been charged with its callbacks lost: settle
    // it instead of starting a second charge.
    // A still-pending attempt (UPI settling) can yet succeed: don't charge again.
    const settled = await settleIfPaidAtPayu(db, order);
    if (settled) {
      return c.json({ error: "Order is not awaiting payment", status: settled }, 409);
    }
    return c.json(await repayOrder(db, c, order));
  });

  // POST /guest-checkout/orders/:orderNumber — the order and its timeline, for
  // the confirmation, tracking and Track order pages. POST so the token or
  // contact travels in the body, not the URL.
  router.post("/orders/:orderNumber", ipRateLimit("guest-view", 60, 60), async (c) => {
    const access = GuestOrderAccessSchema.safeParse(await c.req.json().catch(() => null));
    if (!access.success) return c.json({ error: "Not Found" }, 404);

    const order = await db.query.orders.findFirst({
      where: eq(orders.orderNumber, c.req.param("orderNumber").trim().toUpperCase()),
      with: { items: { orderBy: (oi, { asc }) => [asc(oi.id)] } },
    });
    if (!order || !canAccess(access.data, order)) {
      return c.json({ error: "Not Found" }, 404);
    }
    return c.json(
      GuestOrderViewSchema.parse({ order: toOrderDetail(order), events: await loadOrderEvents(db, order.id) }),
    );
  });

  return router;
}
