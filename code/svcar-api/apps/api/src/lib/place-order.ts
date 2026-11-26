import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { CreateOrderResponseSchema, type CreateOrderResponse, type ShippingAddress } from "@svcar/contracts";
import type { DbClient } from "../db/client.js";
import { orderItems, orders, settings } from "../db/schema.js";
import { calculatePricing, type PricingConfig } from "./pricing.js";
import { orderNumberFromId } from "./order-number.js";
import { buildPayuRequest } from "./payu.js";
import { getPaymentProvider } from "./payments.js";
import { log } from "./logger.js";
import { logOrderEvent } from "./order-events.js";
import { backupOrder } from "./order-backup.js";
import { gatewayPaymentAmount } from "./payment-amount.js";
import { emitOrderCreated } from "./events.js";
import type { AppEnv } from "./types.js";

/**
 * Order placement shared by the signed-in checkout (/checkout) and guest
 * checkout (/guest-checkout): the two differ only in where the cart lines and
 * the customer's details come from.
 */

/**
 * Public base URL PayU should POST its result back to. Prefer an explicit
 * API_PUBLIC_URL (set this when behind a proxy/tunnel so PayU can reach us);
 * otherwise derive it from the incoming request origin.
 */
function payuCallbackBase(c: Context<AppEnv>): string {
  const explicit = process.env.API_PUBLIC_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  return new URL(c.req.url).origin;
}

/**
 * Build the PayU hosted-checkout handoff for an order and record its txnid on the
 * row. `attempt` makes the txnid unique across retries (PayU rejects duplicates).
 */
async function initPayuPayment(
  db: DbClient,
  c: Context<AppEnv>,
  order: {
    id: string;
    orderNumber: string;
    paymentAmount: number;
    totalAmount: number;
    paymentMethod: "prepaid" | "cod";
    customerName: string | null;
    customerEmail: string | null;
    customerPhone: string;
  },
  attempt = 0,
) {
  const txnid = attempt > 0 ? `${order.orderNumber}-r${attempt}` : order.orderNumber;
  const base = payuCallbackBase(c);
  const handoff = buildPayuRequest({
    txnid,
    amount: order.paymentAmount.toFixed(2),
    productinfo: order.paymentMethod === "cod" ? `COD advance for ${order.orderNumber}` : `Order ${order.orderNumber}`,
    firstname: order.customerName || "Customer",
    email: order.customerEmail || "",
    phone: order.customerPhone || "",
    surl: `${base}/payments/payu/return`,
    furl: `${base}/payments/payu/return`,
    udf1: order.orderNumber,
    udf2: order.paymentMethod,
    udf3: order.totalAmount.toFixed(2),
  });
  await db
    .update(orders)
    .set({ paymentProvider: "payu", payuTxnId: txnid, updatedAt: new Date() })
    .where(eq(orders.id, order.id));
  return handoff;
}

/** A cart line with its SKU loaded (sku → product → images), or no SKU if it's gone. */
export interface LineSource {
  skuId: number;
  qty: number;
  sku:
    | {
        skuCode: string;
        price: string;
        salePrice: string | null;
        dimensionValues: Record<string, string> | null;
        stock: number | null;
        product: { name: string; status: string; images: { url: string }[] };
      }
    | null
    | undefined;
}

/** One order line, priced from the database at the moment of ordering. */
export interface OrderLine {
  skuId: number;
  productName: string;
  skuCode: string;
  variantLabel: string | null;
  imageUrl: string | null;
  unitPrice: number;
  qty: number;
}

export type OrderLinesResult =
  | { ok: true; lines: OrderLine[] }
  | { ok: false; status: 400 | 409; body: { error: string; skuId?: number } };

/** Sum duplicate lines so one SKU is priced and stock-checked once. */
export function mergeLines(items: { skuId: number; qty: number }[]): { skuId: number; qty: number }[] {
  const qty = new Map<number, number>();
  for (const it of items) qty.set(it.skuId, (qty.get(it.skuId) ?? 0) + it.qty);
  return [...qty].map(([skuId, q]) => ({ skuId, qty: Math.min(q, 99) }));
}

/** Validate cart lines against the database and price them at current prices. */
export function buildOrderLines(items: LineSource[]): OrderLinesResult {
  if (items.length === 0) return { ok: false, status: 400, body: { error: "Cart is empty" } };

  // Re-validate against the DB: fail fast if a SKU vanished (don't drop it).
  const gone = items.find((ci) => !ci.sku || ci.sku.product.status !== "active");
  if (gone) return { ok: false, status: 400, body: { error: `SKU ${gone.skuId} is no longer available` } };
  // Same rule the storefront applies (null = untracked, otherwise need >= qty),
  // enforced here so it can't be skipped by calling the API directly.
  const short = items.find((ci) => ci.sku!.stock !== null && ci.sku!.stock < ci.qty);
  if (short) {
    return {
      ok: false,
      status: 409,
      body: { error: `Only ${short.sku!.stock} left of ${short.sku!.product.name}`, skuId: short.skuId },
    };
  }

  // Build lines at *current* prices (never trust the cart's reported price).
  const lines = items.map((ci) => {
    const sku = ci.sku!;
    const product = sku.product;
    const unitPrice = Number(sku.salePrice ?? sku.price);
    const dv = sku.dimensionValues ?? {};
    const variantLabel = Object.keys(dv).length ? Object.values(dv).join(" / ") : null;
    return {
      skuId: ci.skuId,
      productName: product.name,
      skuCode: sku.skuCode,
      variantLabel,
      imageUrl: product.images[0]?.url ?? null,
      unitPrice,
      qty: ci.qty,
    };
  });
  return { ok: true, lines };
}

/**
 * Pricing knobs from the admin Settings (free-shipping threshold, flat fee, GST
 * rate) so checkout charges what the admin configured; undefined falls back to
 * the pricing.ts defaults.
 */
export async function loadPricingConfig(db: DbClient): Promise<PricingConfig | undefined> {
  const [settingsRow] = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
  return settingsRow
    ? {
        freeShippingThreshold: Number(settingsRow.shippingFreeAbove),
        flatShippingFee: Number(settingsRow.shippingFlatFee),
        gstRate: Number(settingsRow.gstRate) / 100, // stored as a percentage
      }
    : undefined;
}

/** Pre-discount subtotal (₹) of priced lines — what a promo code is checked against. */
export function linesSubtotal(lines: { unitPrice: number; qty: number }[]): number {
  return calculatePricing(lines).subtotal;
}

/**
 * Persist a pending order for `lines`, start its PayU payment and return the
 * handoff. `userId` is null for a guest order, which is reached instead through
 * the token whose hash is `guestTokenHash`.
 */
export async function placeOrder(
  db: DbClient,
  c: Context<AppEnv>,
  input: {
    userId: string | null;
    guestTokenHash?: string | null;
    customer: { name: string; phone: string; email: string | null };
    shippingAddress: ShippingAddress;
    lines: OrderLine[];
    paymentMethod: "prepaid" | "cod";
    notes?: string;
    /**
     * The promo code, already re-validated against these lines by
     * resolveOrderPromo (lib/promo.ts). Null/absent → no discount.
     */
    promo?: { code: string; discount: number } | null;
  },
): Promise<CreateOrderResponse> {
  const { userId, customer, shippingAddress, lines, notes } = input;
  const promo = input.promo ?? null;

  const pricing = calculatePricing(
    lines.map((l) => ({ unitPrice: l.unitPrice, qty: l.qty })),
    await loadPricingConfig(db),
    promo?.discount ?? 0,
  );
  // Work in integer paise to guarantee advance + COD balance === total.
  // The request only chooses a method; all amounts are derived here. `total`
  // is already net of the promo discount, so the PayU charge and the COD
  // advance are both taken from the discounted figure — and the PayU return /
  // webhook amount checks (gatewayPaymentAmount(order.total)) agree with it.
  const totalPaise = Math.round(pricing.total * 100);
  const isCod = input.paymentMethod === "cod";
  const advancePaise = Math.round(gatewayPaymentAmount(totalPaise / 100, isCod ? "cod" : "prepaid") * 100);
  const remainingPaise = totalPaise - advancePaise;

  // Order number is hashed from the row UUID — atomic, no sequence, no volume leak.
  const orderId = crypto.randomUUID();
  const orderNumber = orderNumberFromId(orderId);

  // Persist order + items atomically.
  await db.transaction(async (tx) => {
    await tx.insert(orders).values({
      id: orderId,
      orderNumber,
      userId,
      guestTokenHash: input.guestTokenHash ?? null,
      customerName: customer.name,
      customerPhone: customer.phone,
      customerEmail: customer.email,
      shippingAddress,
      subtotal: String(pricing.subtotal),
      shippingFee: String(pricing.shippingFee),
      gstAmount: String(pricing.gstAmount),
      total: String(pricing.total),
      promoCode: promo && pricing.discount > 0 ? promo.code : null,
      discount: String(pricing.discount),
      paymentMethod: isCod ? "cod" : "prepaid",
      paymentStatus: "pending",
      advanceAmount: String(advancePaise / 100),
      advancePaid: "0",
      remainingAmount: String(remainingPaise / 100),
      status: "pending",
      notes,
    });
    await tx.insert(orderItems).values(
      lines.map((l) => ({
        orderId,
        skuId: l.skuId,
        productName: l.productName,
        skuCode: l.skuCode,
        variantLabel: l.variantLabel,
        imageUrl: l.imageUrl,
        unitPrice: String(l.unitPrice),
        qty: l.qty,
        lineTotal: String(l.unitPrice * l.qty),
      })),
    );
  });

  const provider = getPaymentProvider(); // locked to "payu"

  // Initialise the PayU payment outside the tx. If it fails our order stays
  // `pending` and the reconciliation cron cleans it up later.
  const payuHandoff = await initPayuPayment(db, c, {
    id: orderId,
    orderNumber,
    paymentAmount: advancePaise / 100,
    totalAmount: totalPaise / 100,
    paymentMethod: isCod ? "cod" : "prepaid",
    customerName: customer.name,
    customerEmail: customer.email,
    customerPhone: customer.phone,
  });
  await logOrderEvent(db, { orderId, eventType: "placed" });

  // Durable backup of the order the moment it's placed (best-effort; never
  // blocks checkout). A second snapshot is written when it's paid.
  await backupOrder(db, "created", {
    orderId,
    orderNumber,
    userId,
    customer,
    shippingAddress,
    totals: {
      subtotal: pricing.subtotal,
      discount: pricing.discount,
      shippingFee: pricing.shippingFee,
      gstAmount: pricing.gstAmount,
      total: pricing.total,
    },
    promoCode: promo?.code ?? null,
    items: lines.map((l) => ({
      skuId: l.skuId,
      productName: l.productName,
      skuCode: l.skuCode,
      variantLabel: l.variantLabel,
      qty: l.qty,
      unitPrice: l.unitPrice,
      lineTotal: l.unitPrice * l.qty,
    })),
    status: "pending",
    notes,
    razorpayOrderId: null,
    capturedAt: new Date().toISOString(),
  });

  log("info", "checkout.order_created", {
    order_id: orderId,
    order_number: orderNumber,
    total: pricing.total,
    promo_code: promo?.code ?? null,
    discount: pricing.discount,
    guest: userId === null,
    request_id: c.get("requestId"),
  });

  await emitOrderCreated(orderId);

  // Cart is intentionally NOT cleared here — only on payment confirmation.
  return CreateOrderResponseSchema.parse({
    orderId,
    orderNumber,
    provider,
    amount: advancePaise,
    totalAmount: totalPaise,
    paymentMethod: isCod ? "cod" : "prepaid",
    advanceAmount: advancePaise,
    remainingAmount: remainingPaise,
    discountAmount: Math.round(pricing.discount * 100),
    promoCode: promo && pricing.discount > 0 ? promo.code : null,
    currency: "INR",
    payu: payuHandoff,
  });
}

/**
 * Start a fresh PayU attempt for an existing unpaid order (the customer's
 * earlier attempt failed or was dismissed). The caller has already checked the
 * order belongs to the requester and is still pending.
 */
export async function repayOrder(
  db: DbClient,
  c: Context<AppEnv>,
  order: typeof orders.$inferSelect,
): Promise<CreateOrderResponse> {
  const provider = getPaymentProvider(); // locked to "payu"
  const totalPaise = Math.round(Number(order.total) * 100);
  const isCod = order.paymentMethod === "cod";
  // Never trust a stored advance as the gateway amount. This also keeps a
  // legacy/malformed COD row from falling back to a 100% PayU charge.
  const amountPaise = Math.round(gatewayPaymentAmount(totalPaise / 100, isCod ? "cod" : "prepaid") * 100);

  // A fresh, unique txnid for the re-attempt (PayU rejects duplicates). Epoch
  // milliseconds mod 1e9 (wraps every ~11.5 days): two retries in the same
  // second no longer collide, and it is never 0, which would reuse the first
  // attempt's txnid (the bare order number). 12-char order no. + "-r" + ≤9
  // digits stays within PayU's 25-char txnid limit.
  const attempt = (Date.now() % 1_000_000_000) || 1;
  const payuHandoff = await initPayuPayment(
    db,
    c,
    {
      id: order.id,
      orderNumber: order.orderNumber,
      paymentAmount: amountPaise / 100,
      totalAmount: totalPaise / 100,
      paymentMethod: isCod ? "cod" : "prepaid",
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      customerPhone: order.customerPhone,
    },
    attempt,
  );
  return CreateOrderResponseSchema.parse({
    orderId: order.id,
    orderNumber: order.orderNumber,
    provider,
    payu: payuHandoff,
    amount: amountPaise,
    totalAmount: totalPaise,
    paymentMethod: isCod ? "cod" : "prepaid",
    advanceAmount: amountPaise,
    remainingAmount: Math.max(0, totalPaise - amountPaise),
    // The discount was fixed when the order was placed; a retry pays the same
    // discounted total (order.total) even if the code has since expired.
    discountAmount: Math.round(Number(order.discount ?? 0) * 100),
    promoCode: order.promoCode ?? null,
    currency: "INR",
  });
}
