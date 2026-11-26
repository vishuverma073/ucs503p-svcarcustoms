import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { CreateOrderRequestSchema } from "@svcar/contracts";
import type { DbClient } from "../db/client.js";
import { addresses, cartItems, carts, orders, users } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import type { AppEnv } from "../lib/types.js";
// [Razorpay disabled — PayU-only project] The Razorpay lib + /checkout/verify
// route below are intentionally turned off; PayU confirms payment via its own
// server/browser callback (routes/payments.ts + /webhooks/payu), not a client
// verify call. Re-enable by restoring these and getPaymentProvider().
// import { createRazorpayOrder, getPublicKeyId, verifyPaymentSignature } from "../lib/razorpay.js";
// import { VerifyOrderRequestSchema } from "@svcar/contracts";
import { buildOrderLines, linesSubtotal, placeOrder, repayOrder } from "../lib/place-order.js";
import { settleIfPaidAtPayu } from "../lib/mark-paid.js";
import { promoOrderError, resolveOrderPromo } from "../lib/promo.js";

export function makeCheckoutRouter(db: DbClient) {
  const router = new Hono<AppEnv>();
  router.use("*", requireAuth);

  // POST /checkout/order — validate cart, compute totals, create the PayU payment.
  router.post("/order", async (c) => {
    const userId = c.get("userId")!;
    const parsed = CreateOrderRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json({ error: "Invalid request", issues: parsed.error.flatten() }, 400);
    }
    const body = parsed.data;

    // Order rows require customer name/phone — load the user.
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    // Load the cart with current SKU + product + primary image.
    const [cart] = await db
      .select({ id: carts.id })
      .from(carts)
      .where(eq(carts.userId, userId))
      .limit(1);
    const items = cart
      ? await db.query.cartItems.findMany({
          where: eq(cartItems.cartId, cart.id),
          orderBy: (ci, { asc }) => [asc(ci.id)],
          with: {
            sku: {
              with: {
                product: { with: { images: { orderBy: (img, { asc }) => [asc(img.sortOrder)] } } },
              },
            },
          },
        })
      : [];
    const built = buildOrderLines(items);
    if (!built.ok) return c.json(built.body, built.status);

    // Resolve the shipping address (saved id → verify ownership, else inline).
    let shippingAddress;
    if (body.addressId !== undefined) {
      const [addr] = await db
        .select()
        .from(addresses)
        .where(and(eq(addresses.id, body.addressId), eq(addresses.userId, userId)))
        .limit(1);
      if (!addr) return c.json({ error: "Address not found" }, 400);
      shippingAddress = {
        fullName: addr.fullName ?? undefined,
        phone: addr.phone ?? undefined,
        label: addr.label ?? undefined,
        line1: addr.line1,
        line2: addr.line2 ?? undefined,
        city: addr.city,
        state: addr.state,
        pincode: addr.pincode,
        landmark: addr.landmark ?? undefined,
      };
    } else {
      shippingAddress = body.address!;
    }

    // Re-check the promo code against the cart as priced right now. A code that
    // stopped applying (expired, used up, cart below its minimum) is refused
    // with a reason — never quietly charged at full price.
    const promo = await resolveOrderPromo(db, body.promoCode, linesSubtotal(built.lines));
    if (!promo.ok) return c.json(promoOrderError(promo), 422);

    const response = await placeOrder(db, c, {
      userId,
      customer: {
        // Email sign-up never asks for a name, so fall back to the recipient on
        // the address rather than labelling every order "Customer".
        name: user.name?.trim() || shippingAddress.fullName?.trim() || "Customer",
        // Delivery phone comes from the shipping address (login is email-based, so
        // the user row may have no phone); fall back to any phone on the user.
        phone: shippingAddress.phone ?? user.phone ?? "",
        email: user.email,
      },
      shippingAddress,
      lines: built.lines,
      paymentMethod: body.paymentMethod,
      notes: body.notes,
      promo: promo.promo,
    });
    return c.json(response);
  });

  // [Razorpay disabled — PayU-only project] POST /checkout/verify was the
  // Razorpay modal signature-verification path. PayU confirms payment via its
  // own callbacks instead: POST /payments/payu/return (browser) and
  // POST /webhooks/payu (server-to-server). There is no client-side verify step
  // for PayU, so this route is intentionally removed. (See git history to
  // restore the Razorpay flow.)

  // POST /checkout/order/:orderNumber/pay — re-initiate payment for an existing
  // unpaid order (the customer's earlier attempt failed or was dismissed).
  // Builds a fresh PayU handoff (unique txnid) for the pending order.
  router.post("/order/:orderNumber/pay", async (c) => {
    const userId = c.get("userId")!;
    const orderNumber = c.req.param("orderNumber");

    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.orderNumber, orderNumber))
      .limit(1);
    if (!order || order.userId !== userId) return c.json({ error: "Not Found" }, 404);
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

  return router;
}
