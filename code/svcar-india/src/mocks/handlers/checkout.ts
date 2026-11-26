import { http, HttpResponse } from "msw";
import { API_BASE, PAYMENT_PROVIDER } from "@/lib/api-config";
import {
  AddressInputSchema,
  AddressUpdateSchema,
  CreateOrderRequestSchema,
  GuestOrderRequestSchema,
  VerifyOrderRequestSchema,
  type Address,
  type Order,
  type OrderItem,
  type OrderListItem,
} from "@svcar/contracts";
import { computeTotals } from "@/lib/checkout";
import { mockOrderPromo } from "./promos";
import { settings as mockSettings } from "../data/settings";
import { generateOrderNumber } from "@/lib/utils";
import { MOCK_USER_TOKEN, getCurrentUser, serverCart } from "../data/account";
import { PINCODES } from "../data/pincodes";
import { products } from "../data/products";
import {
  nextAddressId,
  nextOrderId,
  getAddresses,
  setAddresses,
  getOrders,
  addOrder,
  findOrder,
  updateOrder,
  putPending,
  takePending,
} from "../data/orders";

let retrySeq = 0;

const A = API_BASE;

/** Resolve the signed-in mock user, or null. */
function requireUser(request: Request) {
  if (request.headers.get("Authorization") !== `Bearer ${MOCK_USER_TOKEN}`) return null;
  return getCurrentUser();
}
const unauthorized = () => HttpResponse.json({ error: "unauthorized" }, { status: 401 });
const bad = () => HttpResponse.json({ error: "bad_request" }, { status: 400 });

/** Apply default-address bookkeeping: exactly one default when any exist. */
function normalizeDefaults(list: Address[], preferId?: number): Address[] {
  if (list.length === 0) return list;
  const hasPreferred = preferId != null && list.some((a) => a.id === preferId);
  const target = hasPreferred ? preferId : list.some((a) => a.isDefault) ? undefined : list[0].id;
  if (target == null) return list; // an existing default stands
  return list.map((a) => ({ ...a, isDefault: a.id === target }));
}

/** Build a mock PayU handoff whose `surl` points at the MSW return handler. */
function payuMockHandoff(
  txnid: string,
  orderNumber: string,
  totalRupees: number,
  user: { name?: string; email?: string; phone?: string },
  paymentMethod: "prepaid" | "cod" = "prepaid",
  fullOrderTotal = totalRupees,
) {
  const returnUrl = `${A}/payments/payu/return`;
  return {
    paymentUrl: "https://test.payu.in/_payment",
    params: {
      key: "payu_test_mockkey",
      txnid,
      amount: totalRupees.toFixed(2),
      productinfo: paymentMethod === "cod" ? `COD advance for ${orderNumber}` : `Order ${orderNumber}`,
      firstname: user.name || "Customer",
      email: user.email || "",
      phone: user.phone || "",
      surl: returnUrl,
      furl: returnUrl,
      udf1: orderNumber,
      udf2: paymentMethod,
      udf3: fullOrderTotal.toFixed(2),
      hash: `mock_${txnid}`,
    } as Record<string, string>,
  };
}

function toListItem(o: Order): OrderListItem {
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    total: o.totals.total,
    itemCount: o.items.reduce((n, i) => n + i.qty, 0),
    firstItemImage: o.items[0]?.image ?? "",
    createdAt: o.createdAt,
  };
}

// ── Guest checkout (mock) ── Guest orders live under one pseudo-user id; the
// token handed back is what unlocks them, as on the real API.
const GUEST = "guest";
const guestTokens = new Map<string, string>();
/** Guest order → the email it was placed with (for Track order lookups). */
const guestEmails = new Map<string, string>();

/** The real API's order-detail wire shape, from a stored mock order. */
function toBeOrderDetail(order: Order) {
  return {
    id: String(order.id),
    orderNumber: order.orderNumber,
    total: order.totals.total,
    status: order.status === "created" ? "pending" : order.status,
    itemCount: order.items.reduce((n, i) => n + i.qty, 0),
    createdAt: order.createdAt,
    subtotal: order.totals.subtotal,
    shippingFee: order.totals.shippingFee,
    gstAmount: order.totals.gstIncluded,
    promoCode: order.promoCode ?? null,
    discount: order.totals.discount ?? 0,
    shippingAddress: order.address,
    items: order.items.map((i) => ({
      productName: i.name,
      skuCode: String(i.skuId),
      variantLabel: i.variant ?? null,
      imageUrl: i.image,
      unitPrice: i.price,
      qty: i.qty,
      lineTotal: i.price * i.qty,
    })),
    razorpayPaymentId: order.paymentId,
    paymentMethod: order.paymentMethod ?? "prepaid",
    paymentStatus: order.paymentStatus,
    advanceAmount: order.advanceAmount,
    advancePaid: order.advancePaid,
    remainingAmount: order.remainingAmount,
  };
}

/** A guest order, if `token` is the one issued for it. */
/** Last 10 digits of a mobile, so "+91 98765 43210" matches "9876543210". */
const mobile10 = (v: string) => v.replace(/\D/g, "").slice(-10);

/** Mirrors the API: the browser's token, or the order's email / mobile (Track order). */
async function guestOrderFor(request: Request, orderNumber: string): Promise<Order | undefined> {
  const body = (await request.json().catch(() => ({}))) as { token?: string; contact?: string };
  const order = findOrder(GUEST, orderNumber.toUpperCase());
  if (!order) return undefined;
  if (body.token) return guestTokens.get(order.orderNumber) === body.token ? order : undefined;
  const contact = body.contact?.trim().toLowerCase() ?? "";
  if (!contact) return undefined;
  const matches = contact.includes("@")
    ? guestEmails.get(order.orderNumber) === contact
    : mobile10(contact).length === 10 && mobile10(contact) === mobile10(order.address.phone ?? "");
  return matches ? order : undefined;
}

export const checkoutHandlers = [
  // ── Addresses ──
  http.get(`${A}/me/addresses`, ({ request }) => {
    const user = requireUser(request);
    if (!user) return unauthorized();
    return HttpResponse.json(getAddresses(user.id));
  }),

  http.post(`${A}/me/addresses`, async ({ request }) => {
    const user = requireUser(request);
    if (!user) return unauthorized();
    const parsed = AddressInputSchema.safeParse(await request.json());
    if (!parsed.success) return bad();
    const current = getAddresses(user.id);
    const address: Address = { ...parsed.data, id: nextAddressId() };
    // First address is always default; an explicit isDefault wins otherwise.
    const wantsDefault = current.length === 0 || parsed.data.isDefault;
    let next = [...current, address];
    next = normalizeDefaults(next, wantsDefault ? address.id : undefined);
    setAddresses(user.id, next);
    return HttpResponse.json(next.find((a) => a.id === address.id), { status: 201 });
  }),

  http.patch(`${A}/me/addresses/:id`, async ({ request, params }) => {
    const user = requireUser(request);
    if (!user) return unauthorized();
    const parsed = AddressUpdateSchema.safeParse(await request.json());
    if (!parsed.success) return bad();
    const id = Number(params.id);
    const current = getAddresses(user.id);
    if (!current.some((a) => a.id === id)) {
      return HttpResponse.json({ error: "not_found" }, { status: 404 });
    }
    let next = current.map((a) => (a.id === id ? { ...a, ...parsed.data } : a));
    next = normalizeDefaults(next, parsed.data.isDefault ? id : undefined);
    setAddresses(user.id, next);
    return HttpResponse.json(next.find((a) => a.id === id));
  }),

  http.delete(`${A}/me/addresses/:id`, ({ request, params }) => {
    const user = requireUser(request);
    if (!user) return unauthorized();
    const id = Number(params.id);
    let next = getAddresses(user.id).filter((a) => a.id !== id);
    next = normalizeDefaults(next); // promote a new default if we removed it
    setAddresses(user.id, next);
    return HttpResponse.json({ ok: true });
  }),

  // ── Checkout: create a pending order + Razorpay order id ──
  http.post(`${A}/checkout/order`, async ({ request }) => {
    const user = requireUser(request);
    if (!user) return unauthorized();
    const parsed = CreateOrderRequestSchema.safeParse(await request.json());
    if (!parsed.success) return bad();

    const address = getAddresses(user.id).find((a) => a.id === parsed.data.addressId);
    if (!address) return HttpResponse.json({ error: "address_not_found" }, { status: 422 });
    if (serverCart.length === 0) {
      return HttpResponse.json({ error: "cart_empty" }, { status: 422 });
    }

    const items: OrderItem[] = serverCart.map((i) => ({
      skuId: i.skuId,
      name: i.name,
      slug: i.slug,
      image: i.image,
      variant: i.variant,
      qty: i.qty,
      price: i.price,
    }));
    // Same promo re-check as the API: an ineligible code is a 422, not full price.
    const promo = mockOrderPromo(parsed.data.promoCode, computeTotals(items, mockSettings).subtotal);
    if (!promo.ok) return HttpResponse.json(promo.body, { status: 422 });
    const totals = computeTotals(items, mockSettings, promo.discount); // same settings the page shows (like the API)
    const orderNumber = generateOrderNumber();
    const paymentMethod = parsed.data.paymentMethod ?? "prepaid";
    const totalPaise = Math.round(totals.total * 100);
    const advancePaise = paymentMethod === "cod" ? Math.round(totalPaise * 0.15) : totalPaise;
    const remainingPaise = totalPaise - advancePaise;

    const order: Order = {
      id: nextOrderId(),
      orderNumber,
      status: "created",
      items,
      totals,
      address,
      paymentId: null,
      paymentMethod,
      paymentStatus: "pending",
      advanceAmount: advancePaise / 100,
      advancePaid: 0,
      remainingAmount: remainingPaise / 100,
      promoCode: promo.code,
      notes: parsed.data.notes ?? "",
      createdAt: new Date().toISOString(),
    };
    // Persist the order right away (status "created") so a checkout the customer
    // started but didn't pay for still appears in their history and can be
    // retried — mirroring the real backend, which inserts the pending order row
    // at creation. `putPending` maps the gateway id → order for confirmation.
    addOrder(user.id, order);
    const amountPaise = advancePaise;

    if (PAYMENT_PROVIDER === "payu") {
      const txnid = orderNumber;
      putPending(txnid, user.id, order);
      return HttpResponse.json({
        orderNumber,
        provider: "payu",
        payu: payuMockHandoff(txnid, orderNumber, amountPaise / 100, user, paymentMethod, totals.total),
        amount: amountPaise,
        totalAmount: totalPaise,
        paymentMethod,
        advanceAmount: advancePaise,
        remainingAmount: remainingPaise,
        discountAmount: Math.round((totals.discount ?? 0) * 100),
        promoCode: promo.code,
      });
    }

    const razorpayOrderId = `order_${orderNumber}`;
    putPending(razorpayOrderId, user.id, order);
    return HttpResponse.json({
      orderNumber,
      provider: "razorpay",
      razorpayOrderId,
      razorpayKeyId: "rzp_test_mockkey",
      // The real API (and Razorpay) work in paise; the client divides by 100.
      amount: amountPaise,
      totalAmount: totalPaise,
      paymentMethod,
      advanceAmount: advancePaise,
      remainingAmount: remainingPaise,
    });
  }),

  // ── Checkout: verify payment → mark paid, persist order, clear cart ──
  http.post(`${A}/checkout/verify`, async ({ request }) => {
    const user = requireUser(request);
    if (!user) return unauthorized();
    const parsed = VerifyOrderRequestSchema.safeParse(await request.json());
    if (!parsed.success) return bad();

    const pending = takePending(parsed.data.razorpayOrderId);
    if (!pending || pending.userId !== user.id) {
      return HttpResponse.json({ error: "order_not_found" }, { status: 404 });
    }
    const orderNumber = pending.order.orderNumber;
    // Mark the existing order paid in place (it was persisted at creation), or
    // add it if somehow missing. No duplicate row.
    const updated = updateOrder(user.id, orderNumber, {
      status: "paid",
      paymentId: parsed.data.razorpayPaymentId,
      paymentStatus: pending.order.paymentMethod === "cod" ? "partially_paid" : "paid",
      advancePaid: pending.order.advanceAmount,
    });
    if (!updated) {
      addOrder(user.id, { ...pending.order, status: "paid", paymentId: parsed.data.razorpayPaymentId });
    }
    serverCart.length = 0; // order placed → empty the cart
    // The real API responds { ok, orderNumber }; the client routes on that.
    return HttpResponse.json({ ok: true, orderNumber });
  }),

  // ── Retry payment for an existing unpaid order ──
  http.post(`${A}/checkout/order/:orderNumber/pay`, ({ request, params }) => {
    const user = requireUser(request);
    if (!user) return unauthorized();
    const order = findOrder(user.id, String(params.orderNumber));
    if (!order) return HttpResponse.json({ error: "not_found" }, { status: 404 });
    if (order.status !== "created") {
      // Already paid / shipped / cancelled — nothing to retry.
      return HttpResponse.json({ error: "not_payable", status: order.status }, { status: 409 });
    }
    const amountPaise = Math.round(order.advanceAmount * 100);
    const totalPaise = Math.round(order.totals.total * 100);
    if (PAYMENT_PROVIDER === "payu") {
      const txnid = `${order.orderNumber}-r${++retrySeq}`;
      putPending(txnid, user.id, order);
      return HttpResponse.json({
        orderNumber: order.orderNumber,
        provider: "payu",
        payu: payuMockHandoff(txnid, order.orderNumber, amountPaise / 100, user, order.paymentMethod, order.totals.total),
        amount: amountPaise,
        totalAmount: totalPaise,
        paymentMethod: order.paymentMethod,
        advanceAmount: amountPaise,
        remainingAmount: Math.max(0, totalPaise - amountPaise),
      });
    }

    // Fresh Razorpay order id for the re-attempt; park it for verify.
    const razorpayOrderId = `order_${order.orderNumber}_retry${++retrySeq}`;
    putPending(razorpayOrderId, user.id, order);
    return HttpResponse.json({
      orderNumber: order.orderNumber,
      provider: "razorpay",
      razorpayOrderId,
      razorpayKeyId: "rzp_test_mockkey",
      amount: amountPaise,
      totalAmount: totalPaise,
      paymentMethod: order.paymentMethod,
      advanceAmount: amountPaise,
      remainingAmount: Math.max(0, totalPaise - amountPaise),
    });
  }),

  // ── PayU callback (browser form-POST back from the hosted page). Mirrors the
  // real API's /payments/payu/return: confirm the pending order, clear the cart.
  http.post(`${A}/payments/payu/return`, async ({ request }) => {
    const params = new URLSearchParams(await request.text());
    const txnid = params.get("txnid") ?? "";
    const pending = takePending(txnid);
    if (!pending) return HttpResponse.json({ error: "order_not_found" }, { status: 404 });
    const orderNumber = pending.order.orderNumber;
    if (params.get("status") !== "success") {
      return HttpResponse.json({ ok: false, orderNumber });
    }
    const paymentId = params.get("mihpayid");
    const updated = updateOrder(pending.userId, orderNumber, { status: "paid", paymentId });
    if (!updated) {
      addOrder(pending.userId, { ...pending.order, status: "paid", paymentId });
    }
    serverCart.length = 0;
    return HttpResponse.json({ ok: true, orderNumber });
  }),

  // ── Order history (cursor-paginated, newest first) ──
  http.get(`${A}/me/orders`, ({ request }) => {
    const user = requireUser(request);
    if (!user) return unauthorized();
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? 10);
    const cursor = url.searchParams.get("cursor");

    const all = getOrders(user.id); // already newest-first
    const start = cursor ? all.findIndex((o) => o.id === Number(cursor)) + 1 : 0;
    const page = all.slice(start, start + limit);
    const nextCursor = start + limit < all.length ? page[page.length - 1].id : null;
    return HttpResponse.json({ items: page.map(toListItem), nextCursor });
  }),

  http.get(`${A}/me/orders/:orderNumber`, ({ request, params }) => {
    const user = requireUser(request);
    if (!user) return unauthorized();
    const order = findOrder(user.id, String(params.orderNumber));
    return order
      ? HttpResponse.json(order)
      : HttpResponse.json({ error: "not_found" }, { status: 404 });
  }),

  // ── Order tracking timeline ──
  http.get(`${A}/me/orders/:orderNumber/events`, ({ request, params }) => {
    const user = requireUser(request);
    if (!user) return unauthorized();
    const order = findOrder(user.id, String(params.orderNumber));
    if (!order) return HttpResponse.json({ error: "not_found" }, { status: 404 });

    // Derive a timeline from the order's lifecycle, in the real backend's wire
    // shape: { events: [{ eventType, note, createdAt }] }. The client maps the
    // backend `eventType` ("placed", "paid", …) to a storefront status.
    const placedAt = order.createdAt;
    const events: { eventType: string; note: string | null; createdAt: string }[] = [
      { eventType: "placed", note: "We’ve received your order.", createdAt: placedAt },
    ];
    if (["paid", "shipped", "delivered"].includes(order.status)) {
      events.push({
        eventType: "paid",
        note: "Payment confirmed.",
        createdAt: new Date(new Date(placedAt).getTime() + 60_000).toISOString(),
      });
    }
    if (["shipped", "delivered"].includes(order.status)) {
      events.push({ eventType: "shipped", note: "Your order is on its way.", createdAt: placedAt });
    }
    if (order.status === "delivered") {
      events.push({ eventType: "delivered", note: "Delivered.", createdAt: placedAt });
    }
    if (order.status === "cancelled") {
      events.push({ eventType: "cancelled", note: null, createdAt: placedAt });
    }
    return HttpResponse.json({ events });
  }),

  // ── Pincode autofill (public) ──
  http.get(`${A}/pincode/:pincode`, ({ params }) => {
    const pincode = String(params.pincode);
    const hit = PINCODES[pincode];
    return hit
      ? HttpResponse.json({ pincode, ...hit })
      : HttpResponse.json({ error: "not_found" }, { status: 404 });
  }),

  // ── Guest checkout: place an order from the posted cart, no session ──
  http.post(`${A}/guest-checkout/orders`, async ({ request }) => {
    const parsed = GuestOrderRequestSchema.safeParse(await request.json());
    if (!parsed.success) return bad();
    const { email, address, paymentMethod } = parsed.data;

    const items: OrderItem[] = [];
    for (const line of parsed.data.items) {
      const product = products.find((p) => p.skus.some((s) => s.id === line.skuId));
      const sku = product?.skus.find((s) => s.id === line.skuId);
      if (!product || !sku) return HttpResponse.json({ error: `SKU ${line.skuId} is no longer available` }, { status: 400 });
      const variant = Object.values(sku.dimensionValues).join(" / ");
      items.push({
        skuId: sku.id,
        name: product.name,
        slug: product.slug,
        image: product.images[0]?.url ?? "",
        variant: variant || undefined,
        qty: line.qty,
        price: sku.salePrice ?? sku.price,
      });
    }
    const promo = mockOrderPromo(parsed.data.promoCode, computeTotals(items, mockSettings).subtotal);
    if (!promo.ok) return HttpResponse.json(promo.body, { status: 422 });
    const totals = computeTotals(items, mockSettings, promo.discount); // same settings the page shows (like the API)
    const orderNumber = generateOrderNumber();
    const totalPaise = Math.round(totals.total * 100);
    const advancePaise = paymentMethod === "cod" ? Math.round((totalPaise * 15) / 100) : totalPaise;
    const order: Order = {
      id: nextOrderId(),
      orderNumber,
      status: "created",
      items,
      totals,
      address: { ...address, id: 0, label: "Home", isDefault: false },
      paymentId: null,
      paymentMethod,
      paymentStatus: "pending",
      advanceAmount: advancePaise / 100,
      advancePaid: 0,
      remainingAmount: (totalPaise - advancePaise) / 100,
      promoCode: promo.code,
      notes: "",
      createdAt: new Date().toISOString(),
    };
    addOrder(GUEST, order);
    putPending(orderNumber, GUEST, order);
    const guestToken = `mock_${crypto.randomUUID()}`;
    guestTokens.set(orderNumber, guestToken);
    guestEmails.set(orderNumber, email.trim().toLowerCase());
    return HttpResponse.json({
      orderNumber,
      provider: "payu",
      payu: payuMockHandoff(orderNumber, orderNumber, advancePaise / 100, { name: address.fullName, email, phone: address.phone }, paymentMethod, totals.total),
      amount: advancePaise,
      totalAmount: totalPaise,
      paymentMethod,
      advanceAmount: advancePaise,
      remainingAmount: totalPaise - advancePaise,
      discountAmount: Math.round((totals.discount ?? 0) * 100),
      promoCode: promo.code,
      guestToken,
    });
  }),

  http.post(`${A}/guest-checkout/orders/:orderNumber/pay`, async ({ request, params }) => {
    const order = await guestOrderFor(request, String(params.orderNumber));
    if (!order) return HttpResponse.json({ error: "Not Found" }, { status: 404 });
    if (order.status !== "created") return HttpResponse.json({ error: "not_payable" }, { status: 409 });
    const amountPaise = Math.round(order.advanceAmount * 100);
    const totalPaise = Math.round(order.totals.total * 100);
    const txnid = `${order.orderNumber}-r${++retrySeq}`;
    putPending(txnid, GUEST, order);
    return HttpResponse.json({
      orderNumber: order.orderNumber,
      provider: "payu",
      payu: payuMockHandoff(txnid, order.orderNumber, amountPaise / 100, { name: order.address.fullName, phone: order.address.phone }, order.paymentMethod, order.totals.total),
      amount: amountPaise,
      totalAmount: totalPaise,
      paymentMethod: order.paymentMethod,
      advanceAmount: amountPaise,
      remainingAmount: Math.max(0, totalPaise - amountPaise),
    });
  }),

  http.post(`${A}/guest-checkout/orders/:orderNumber`, async ({ request, params }) => {
    const order = await guestOrderFor(request, String(params.orderNumber));
    if (!order) return HttpResponse.json({ error: "Not Found" }, { status: 404 });
    const events = [{ id: 1, eventType: "placed", note: null, createdAt: order.createdAt }];
    if (order.status !== "created") events.push({ id: 2, eventType: "paid", note: null, createdAt: order.createdAt });
    return HttpResponse.json({ order: toBeOrderDetail(order), events });
  }),
];
