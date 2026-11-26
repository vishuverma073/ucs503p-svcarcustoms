/**
 * Mock-mode Admin → Orders: a few seeded orders (two share ids with the Phone
 * leads seeds so those links open), plus every order placed through the mock
 * checkout in this tab. Status changes, timeline events and orders added with
 * the mock-only "simulate" endpoint are kept in localStorage, so they survive a
 * full page load (the MSW worker's memory doesn't). All names/numbers are made up.
 */
import { allOrders } from "./orders";
import { products } from "./products";

const HOUR = 60 * 60 * 1000;
const STORE_KEY = "svcar-mock-admin-orders";

export interface MockAdminOrderItem {
  productName: string;
  skuCode: string;
  variantLabel: string | null;
  imageUrl: string | null;
  unitPrice: number;
  qty: number;
  lineTotal: number;
}

export interface MockAdminEvent {
  id: number;
  eventType: string;
  note: string | null;
  createdAt: string;
}

export interface MockAdminOrder {
  id: string;
  orderNumber: string;
  status: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  shippingAddress: Record<string, unknown>;
  subtotal: number;
  shippingFee: number;
  gstAmount: number;
  total: number;
  paymentMethod: "prepaid" | "cod";
  paymentStatus: string;
  advanceAmount: number;
  advancePaid: number;
  remainingAmount: number;
  razorpayPaymentId: string | null;
  createdAt: string;
  items: MockAdminOrderItem[];
  events: MockAdminEvent[];
}

let eventSeq = 70_000;

function line(productIndex: number, qty = 1): MockAdminOrderItem {
  const p = products[productIndex % products.length]!;
  const sku = p.skus[0]!;
  const unit = sku.salePrice ?? sku.price;
  return {
    productName: p.name,
    skuCode: sku.skuCode,
    variantLabel: Object.values(sku.dimensionValues).join(" / ") || null,
    imageUrl: p.images[0]?.url ?? null,
    unitPrice: unit,
    qty,
    lineTotal: unit * qty,
  };
}

function build(input: {
  id: string;
  orderNumber: string;
  status: string;
  name: string;
  phone: string;
  city: string;
  hoursAgo: number;
  method: "prepaid" | "cod";
  items: MockAdminOrderItem[];
}): MockAdminOrder {
  const subtotal = input.items.reduce((s, it) => s + it.lineTotal, 0);
  const total = subtotal;
  const paid = input.status !== "pending" && input.status !== "cancelled";
  const advanceAmount = input.method === "cod" ? Math.round(total * 0.15) : 0;
  const createdAt = new Date(Date.now() - input.hoursAgo * HOUR).toISOString();
  const events: MockAdminEvent[] = [{ id: ++eventSeq, eventType: "placed", note: null, createdAt }];
  if (paid) {
    events.push({ id: ++eventSeq, eventType: "paid", note: null, createdAt: new Date(Date.parse(createdAt) + 60_000).toISOString() });
  }
  for (const step of ["confirmed", "shipped", "delivered"]) {
    const rank = ["confirmed", "shipped", "delivered"].indexOf(step);
    const current = ["confirmed", "shipped", "delivered"].indexOf(input.status);
    if (current >= rank) {
      events.push({
        id: ++eventSeq,
        eventType: step,
        note: step === "shipped" ? "Courier: Delhivery · Tracking: 1490827733" : null,
        createdAt: new Date(Date.parse(createdAt) + (rank + 2) * HOUR).toISOString(),
      });
    }
  }
  return {
    id: input.id,
    orderNumber: input.orderNumber,
    status: input.status,
    customerName: input.name,
    customerPhone: input.phone,
    customerEmail: `${input.name.split(" ")[0]!.toLowerCase()}@example.com`,
    shippingAddress: {
      fullName: input.name,
      phone: input.phone,
      line1: "12, MG Road",
      line2: "Near City Mall",
      city: input.city,
      state: "Delhi",
      pincode: "110061",
    },
    subtotal,
    shippingFee: 0,
    gstAmount: Math.round(subtotal - subtotal / 1.28),
    total,
    paymentMethod: input.method,
    paymentStatus: !paid ? "pending" : input.method === "cod" ? "partially_paid" : "paid",
    advanceAmount,
    advancePaid: !paid ? 0 : input.method === "cod" ? advanceAmount : total,
    remainingAmount: paid && input.method === "cod" ? total - advanceAmount : 0,
    razorpayPaymentId: paid ? `mockpay_${input.orderNumber}` : null,
    createdAt,
    items: input.items,
    events,
  };
}

function seeds(): MockAdminOrder[] {
  return [
    build({
      id: "00000000-0000-4000-8000-000000000003",
      orderNumber: "SVMOCK0003",
      status: "paid",
      name: "Rahul Mehta",
      phone: "9810000004",
      city: "Gurugram",
      hoursAgo: 1.5,
      method: "prepaid",
      items: [line(0), line(3)],
    }),
    build({
      id: "00000000-0000-4000-8000-000000000004",
      orderNumber: "SVMOCK0004",
      status: "confirmed",
      name: "Priya Nair",
      phone: "+91 98100 00005",
      city: "Noida",
      hoursAgo: 6,
      method: "cod",
      items: [line(5, 2)],
    }),
    // Same ids as the Phone leads seeds (src/mocks/data/phone-leads.ts).
    build({
      id: "00000000-0000-4000-8000-000000000001",
      orderNumber: "SVMOCK0001",
      status: "pending",
      name: "Mock Buyer (popup + order)",
      phone: "+91 98100 00002",
      city: "Delhi",
      hoursAgo: 20,
      method: "prepaid",
      items: [line(7)],
    }),
    build({
      id: "00000000-0000-4000-8000-000000000002",
      orderNumber: "SVMOCK0002",
      status: "shipped",
      name: "Mock Buyer (order only)",
      phone: "9810000003",
      city: "Delhi",
      hoursAgo: 72,
      method: "prepaid",
      items: [line(2), line(9)],
    }),
  ];
}

interface Persisted {
  /** Orders added through POST /admin/__mock/orders. */
  added: MockAdminOrder[];
  /** Status / payment / timeline changes, by order id. */
  patches: Record<string, Partial<MockAdminOrder>>;
  deleted: string[];
}

function readStore(): Persisted {
  const empty: Persisted = { added: [], patches: {}, deleted: [] };
  try {
    if (typeof window === "undefined") return memory;
    const raw = window.localStorage.getItem(STORE_KEY);
    return raw ? { ...empty, ...(JSON.parse(raw) as Persisted) } : empty;
  } catch {
    return memory;
  }
}

// Node (vitest) has no localStorage: keep state in memory there.
const memory: Persisted = { added: [], patches: {}, deleted: [] };

function writeStore(p: Persisted) {
  try {
    if (typeof window === "undefined") {
      Object.assign(memory, p);
      return;
    }
    window.localStorage.setItem(STORE_KEY, JSON.stringify(p));
  } catch {
    Object.assign(memory, p);
  }
}

const STOREFRONT_STATUS: Record<string, string> = {
  created: "pending",
  failed: "pending",
  paid: "paid",
  shipped: "shipped",
  delivered: "delivered",
  cancelled: "cancelled",
};

/** Orders placed through the mock checkout (storefront shape → admin shape). */
function checkoutOrders(): MockAdminOrder[] {
  return allOrders().map((o) => {
    const method = o.paymentMethod === "cod" ? "cod" : "prepaid";
    return {
      id: `00000000-0000-4000-9000-${String(o.id).padStart(12, "0")}`,
      orderNumber: o.orderNumber,
      status: STOREFRONT_STATUS[o.status] ?? o.status,
      customerName: o.address.fullName,
      customerPhone: o.address.phone,
      customerEmail: "",
      shippingAddress: { ...o.address },
      subtotal: o.totals.subtotal,
      shippingFee: o.totals.shippingFee,
      gstAmount: o.totals.gstIncluded,
      total: o.totals.total,
      paymentMethod: method,
      paymentStatus: o.paymentStatus,
      advanceAmount: o.advanceAmount,
      advancePaid: o.advancePaid,
      remainingAmount: o.remainingAmount,
      razorpayPaymentId: o.paymentId,
      createdAt: o.createdAt,
      items: o.items.map((it) => ({
        productName: it.name,
        skuCode: String(it.skuId),
        variantLabel: it.variant ?? null,
        imageUrl: it.image || null,
        unitPrice: it.price,
        qty: it.qty,
        lineTotal: it.price * it.qty,
      })),
      events: [{ id: ++eventSeq, eventType: "placed", note: null, createdAt: o.createdAt }],
    };
  });
}

const seeded = seeds();

/** Every mock admin order, newest first, with saved changes applied. */
export function listMockAdminOrders(): MockAdminOrder[] {
  const store = readStore();
  const all = [...store.added, ...seeded, ...checkoutOrders()]
    .filter((o) => !store.deleted.includes(o.id))
    .map((o) => ({ ...o, ...(store.patches[o.id] ?? {}) }));
  return all.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function findMockAdminOrder(id: string): MockAdminOrder | undefined {
  return listMockAdminOrders().find((o) => o.id === id);
}

export function patchMockAdminOrder(id: string, patch: Partial<MockAdminOrder>): MockAdminOrder | undefined {
  const current = findMockAdminOrder(id);
  if (!current) return undefined;
  const store = readStore();
  store.patches[id] = { ...(store.patches[id] ?? {}), ...patch };
  writeStore(store);
  return { ...current, ...patch };
}

export function nextMockEventId(): number {
  return ++eventSeq + Math.floor(Math.random() * 1000);
}

export function deleteMockAdminOrder(id: string): void {
  const store = readStore();
  store.deleted = [...new Set([...store.deleted, id])];
  writeStore(store);
}

let simulatedSeq = 0;

/** Mock-only: a brand-new paid order "just now" (lets the live list + highlight be tried). */
export function addSimulatedOrder(opts: { method?: "prepaid" | "cod" } = {}): MockAdminOrder {
  simulatedSeq += 1;
  const stamp = Date.now().toString(36).toUpperCase().slice(-5);
  const n = `${stamp}${simulatedSeq}`;
  const order = build({
    id: `00000000-0000-4000-a000-${Date.now().toString(16).padStart(12, "0").slice(-12)}`,
    orderNumber: `SVSIM${n}`,
    status: "paid",
    name: "Simulated Buyer",
    phone: `98${String(Date.now()).slice(-8)}`,
    city: "Delhi",
    hoursAgo: 0,
    method: opts.method ?? "prepaid",
    items: [line(simulatedSeq + 1), line(simulatedSeq + 4)],
  });
  const store = readStore();
  store.added = [order, ...store.added];
  writeStore(store);
  return order;
}

/** Test helper: forget all saved changes. */
export function __resetMockAdminOrders() {
  writeStore({ added: [], patches: {}, deleted: [] });
}
