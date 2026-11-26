import webpush, { type WebPushError } from "web-push";
import { and, asc, eq } from "drizzle-orm";
import type { DbClient } from "../db/client.js";
import { adminPushSubscriptions, orders, users } from "../db/schema.js";
import { markProcessedOnce } from "./idempotency.js";
import { log } from "./logger.js";

/**
 * Admin Web Push — "new order" / "new lead" alerts on the admin's phone.
 *
 * Every admin device that taps "Enable notifications" in Admin → Settings is a
 * row in admin_push_subscriptions (migration 0019). When an order becomes paid
 * (lib/mark-paid.ts) or a new phone lead is stored (routes/phone-leads.ts) the
 * matching rows get an encrypted Web Push message via the browser's push
 * service; the admin service worker (svcar-india/public/admin-sw.js) shows it.
 *
 * Push is optional. Without valid VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY /
 * VAPID_SUBJECT it is disabled: the /admin/push endpoints say so, and the
 * triggers return before touching the database. Nothing here ever throws into
 * the payment or lead path — failures are logged.
 */

export type PushKind = "order" | "lead";

/** What the admin service worker receives (JSON) and shows. */
export interface AdminPushPayload {
  title: string;
  body: string;
  /** Same-origin admin path opened when the notification is tapped. */
  url: string;
  /** Notifications with the same tag replace each other on the device. */
  tag: string;
  kind: PushKind | "test";
  /**
   * Optional off-site link (wa.me) for the unpaid-order alert. The admin service
   * worker only opens same-origin /admin URLs, so this rides along for clients
   * that want it; the phone number is also in the body.
   */
  waUrl?: string;
}

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

type SubscriptionRow = Pick<
  typeof adminPushSubscriptions.$inferSelect,
  "id" | "endpoint" | "p256dh" | "auth"
>;

export interface PushSendResult {
  id: number;
  /** Host of the push service (fcm.googleapis.com, web.push.apple.com, …). */
  endpointHost: string;
  ok: boolean;
  /** HTTP status from the push service, null when the request never completed. */
  statusCode: number | null;
  /** True when the push service said the subscription is gone (404/410) and the row was deleted. */
  removed: boolean;
  error?: string;
}

export interface PushSendSummary {
  enabled: boolean;
  attempted: number;
  sent: number;
  removed: number;
  failed: number;
  results: PushSendResult[];
}

/** Per-request socket timeout handed to web-push, and a hard cap per send. */
export const PUSH_SEND_TIMEOUT_MS = 5_000;
const PUSH_HARD_TIMEOUT_MS = 8_000;
/** Order/lead alerts stay queued at the push service for a day if the phone is offline. */
const ALERT_TTL_SECONDS = 24 * 60 * 60;
export const TEST_PUSH_TTL_SECONDS = 5 * 60;
/** Once-per-order guard window (on top of markOrderPaid's pending→paid guard). */
const ORDER_ONCE_TTL_SECONDS = 7 * 24 * 60 * 60;

// ─── Config ──────────────────────────────────────────────────

let cachedConfig: { key: string; value: VapidConfig | null } | null = null;

/**
 * VAPID settings from the environment, validated once per distinct value.
 * Returns null (push disabled) when any is missing or malformed — logged once,
 * never thrown, so a bad secret can't take the API down.
 */
export function getVapidConfig(env: NodeJS.ProcessEnv = process.env): VapidConfig | null {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim() ?? "";
  const privateKey = env.VAPID_PRIVATE_KEY?.trim() ?? "";
  const subject = env.VAPID_SUBJECT?.trim() ?? "";
  const key = `${publicKey}|${privateKey}|${subject}`;
  if (cachedConfig && cachedConfig.key === key) return cachedConfig.value;

  let value: VapidConfig | null = null;
  if (publicKey && privateKey && subject) {
    try {
      // Validates the subject (mailto:/https:) and both key lengths; throws on bad input.
      webpush.getVapidHeaders("https://fcm.googleapis.com", subject, publicKey, privateKey, "aes128gcm");
      value = { publicKey, privateKey, subject };
    } catch (err) {
      log("error", "admin_push_bad_vapid_config", { error: (err as Error).message });
    }
  }
  cachedConfig = { key, value };
  return value;
}

export function isPushEnabled(): boolean {
  return getVapidConfig() !== null;
}

// ─── Payloads ────────────────────────────────────────────────

/** ₹12,198 / ₹1,829.70 (Indian digit grouping; paise shown only when present). */
export function formatInr(amount: number): string {
  const paise = Math.round(amount * 100) % 100 !== 0;
  return `₹${amount.toLocaleString("en-IN", {
    minimumFractionDigits: paise ? 2 : 0,
    maximumFractionDigits: paise ? 2 : 0,
  })}`;
}

/** "9876543210" / "+91 98765-43210" → "+91 98765 43210". */
export function formatIndianMobile(phone: string): string {
  const digits = phone.replace(/\D/g, "").slice(-10);
  return digits.length === 10 ? `+91 ${digits.slice(0, 5)} ${digits.slice(5)}` : phone;
}

function clip(text: string, max: number): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

export interface OrderForPush {
  id: string;
  orderNumber: string;
  customerName: string | null;
  paymentMethod: string;
  total: number;
  advancePaid: number;
  items: { productName: string }[];
}

/**
 * Title "New order ₹12,198 · SV123"; body "Asha · Prepaid · Virtus spoiler + 1 more"
 * (COD orders: "COD advance ₹1,830 paid").
 */
export function buildOrderPushPayload(order: OrderForPush): AdminPushPayload {
  const payment =
    order.paymentMethod === "cod" ? `COD advance ${formatInr(order.advancePaid)} paid` : "Prepaid";
  const first = order.items[0]?.productName?.trim();
  const more = order.items.length > 1 ? ` + ${order.items.length - 1} more` : "";
  const parts = [clip(order.customerName || "Customer", 40), payment];
  if (first) parts.push(`${clip(first, 60)}${more}`);
  return {
    title: `New order ${formatInr(order.total)} · ${order.orderNumber}`,
    body: parts.join(" · "),
    url: `/admin/orders/${order.id}`,
    tag: `order-${order.id}`,
    kind: "order",
  };
}

/**
 * Title "New lead: +91 98765 43210"; body "From /product/…". The tag (which is
 * also logged) uses the phone_leads row id — never the number itself.
 */
export function buildLeadPushPayload(lead: { id: number | string; phone: string; pagePath: string | null }): AdminPushPayload {
  return {
    title: `New lead: ${formatIndianMobile(lead.phone)}`,
    body: `From ${clip(lead.pagePath || "/", 80)}`,
    url: "/admin/phone-leads",
    tag: `lead-${lead.id}`,
    kind: "lead",
  };
}

export interface UnpaidOrderForPush {
  id: string;
  orderNumber: string;
  customerName: string | null;
  customerPhone: string;
  paymentMethod: string;
  total: number;
}

/** wa.me chat link to nudge the customer about their unfinished order. */
export function buildUnpaidOrderWhatsAppUrl(order: Pick<UnpaidOrderForPush, "orderNumber" | "customerName" | "customerPhone">): string {
  const digits = order.customerPhone.replace(/\D/g, "").slice(-10);
  const name = (order.customerName || "there").trim();
  const text = `Hi ${name}, this is SV Car Customs. We saw your order ${order.orderNumber} wasn't completed. Need help finishing it?`;
  return `https://wa.me/91${digits}?text=${encodeURIComponent(text)}`;
}

/**
 * Title "Unpaid order ₹12,198 · SV123"; body "Asha · Prepaid · +91 98765 43210".
 * Tapping opens the admin order page (the service worker only allows /admin URLs).
 */
export function buildUnpaidOrderPushPayload(order: UnpaidOrderForPush): AdminPushPayload {
  const payment = order.paymentMethod === "cod" ? "COD" : "Prepaid";
  return {
    title: `Unpaid order ${formatInr(order.total)} · ${order.orderNumber}`,
    body: [clip(order.customerName || "Customer", 40), payment, formatIndianMobile(order.customerPhone)].join(" · "),
    url: `/admin/orders/${order.id}`,
    tag: `unpaid-${order.id}`,
    kind: "order",
    waUrl: buildUnpaidOrderWhatsAppUrl(order),
  };
}

export function buildTestPushPayload(): AdminPushPayload {
  return {
    title: "SV Admin notifications are on",
    body: "New orders and leads will show up here.",
    url: "/admin/settings",
    tag: "admin-push-test",
    kind: "test",
  };
}

// ─── Sending ─────────────────────────────────────────────────

function endpointHost(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return "invalid";
  }
}

function describeError(err: unknown): string {
  const e = err as Partial<WebPushError> & { message?: string };
  const body = typeof e.body === "string" ? e.body.trim().slice(0, 200) : "";
  const base = e.statusCode ? `HTTP ${e.statusCode}` : e.message || String(err);
  return body ? `${base}: ${body}` : base;
}

function withHardTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`push timed out after ${ms}ms`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

async function bestEffort(what: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    log("warn", "admin_push_bookkeeping_failed", { what, error: (err as Error).message });
  }
}

async function sendOne(
  db: DbClient,
  sub: SubscriptionRow,
  body: string,
  cfg: VapidConfig,
  ttl: number,
): Promise<PushSendResult> {
  const host = endpointHost(sub.endpoint);
  const attempt = () =>
    withHardTimeout(
      webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, body, {
        vapidDetails: cfg,
        TTL: ttl,
        // "high" = deliver now even if the phone is dozing (Android/FCM honour it).
        urgency: "high",
        timeout: PUSH_SEND_TIMEOUT_MS,
      }),
      PUSH_HARD_TIMEOUT_MS,
    );
  try {
    let res;
    try {
      res = await attempt();
    } catch (first) {
      // One more try for a transient failure (timeout / network / 5xx / 429):
      // an order alert is worth a second attempt; a 4xx answer is final.
      if (!isRetryablePushError(first)) throw first;
      await new Promise((r) => setTimeout(r, PUSH_RETRY_DELAY_MS));
      res = await attempt();
    }
    await bestEffort("mark_success", () =>
      db
        .update(adminPushSubscriptions)
        .set({ lastSuccessAt: new Date(), lastError: null })
        .where(eq(adminPushSubscriptions.id, sub.id)),
    );
    return { id: sub.id, endpointHost: host, ok: true, statusCode: res.statusCode ?? null, removed: false };
  } catch (err) {
    const statusCode = (err as Partial<WebPushError>).statusCode ?? null;
    if (statusCode === 404 || statusCode === 410) {
      // The browser dropped this subscription (app uninstalled, permission
      // revoked, site data cleared). It will never work again.
      await bestEffort("delete_gone", () =>
        db.delete(adminPushSubscriptions).where(eq(adminPushSubscriptions.id, sub.id)),
      );
      return { id: sub.id, endpointHost: host, ok: false, statusCode, removed: true, error: "gone" };
    }
    const error = describeError(err);
    await bestEffort("mark_error", () =>
      db
        .update(adminPushSubscriptions)
        .set({ lastError: error.slice(0, 500) })
        .where(eq(adminPushSubscriptions.id, sub.id)),
    );
    return { id: sub.id, endpointHost: host, ok: false, statusCode, removed: false, error };
  }
}

/** Delay before the single retry of a transient push failure. */
export const PUSH_RETRY_DELAY_MS = 1_500;

/** Timeouts, network errors, 5xx and 429 are worth one retry; other answers are final. */
export function isRetryablePushError(err: unknown): boolean {
  const status = (err as Partial<WebPushError>).statusCode;
  if (status == null) return true;
  return status === 429 || status >= 500;
}

function summarize(results: PushSendResult[]): PushSendSummary {
  return {
    enabled: true,
    attempted: results.length,
    sent: results.filter((r) => r.ok).length,
    removed: results.filter((r) => r.removed).length,
    failed: results.filter((r) => !r.ok && !r.removed).length,
    results,
  };
}

const DISABLED: PushSendSummary = { enabled: false, attempted: 0, sent: 0, removed: 0, failed: 0, results: [] };

/** Send one payload to the given subscriptions in parallel. Never throws. */
export async function sendToSubscriptions(
  db: DbClient,
  subs: SubscriptionRow[],
  payload: AdminPushPayload,
  opts: { ttl?: number } = {},
): Promise<PushSendSummary> {
  const cfg = getVapidConfig();
  if (!cfg) return DISABLED;
  const body = JSON.stringify({ ...payload, ts: Date.now() });
  const results = await Promise.all(subs.map((s) => sendOne(db, s, body, cfg, opts.ttl ?? ALERT_TTL_SECONDS)));
  return summarize(results);
}

/**
 * Send to every admin device that opted into `kind`. Only subscriptions whose
 * user is still an admin are used — a demoted account stops getting customer
 * names and numbers immediately. Never throws (logs instead).
 */
export async function sendToAdmins(
  db: DbClient,
  kind: PushKind,
  payload: AdminPushPayload,
): Promise<PushSendSummary> {
  if (!getVapidConfig()) return DISABLED;
  try {
    const optIn = kind === "order" ? adminPushSubscriptions.notifyOrders : adminPushSubscriptions.notifyLeads;
    const subs = await db
      .select({
        id: adminPushSubscriptions.id,
        endpoint: adminPushSubscriptions.endpoint,
        p256dh: adminPushSubscriptions.p256dh,
        auth: adminPushSubscriptions.auth,
      })
      .from(adminPushSubscriptions)
      .innerJoin(users, eq(users.id, adminPushSubscriptions.adminUserId))
      .where(and(eq(optIn, true), eq(users.isAdmin, true)));
    const summary = await sendToSubscriptions(db, subs, payload);
    log(summary.failed > 0 ? "warn" : "info", "admin_push_sent", {
      kind,
      tag: payload.tag,
      attempted: summary.attempted,
      sent: summary.sent,
      removed: summary.removed,
      failed: summary.failed,
    });
    return summary;
  } catch (err) {
    log("error", "admin_push_failed", { kind, tag: payload.tag, error: (err as Error).message });
    return { ...DISABLED, enabled: true };
  }
}

// ─── Triggers (fire-and-forget) ──────────────────────────────

const inflight = new Set<Promise<unknown>>();

function track(p: Promise<unknown>): void {
  inflight.add(p);
  void p.finally(() => inflight.delete(p));
}

/** Wait for queued pushes (tests, graceful shutdown). */
export async function flushAdminPushes(): Promise<void> {
  while (inflight.size > 0) await Promise.allSettled([...inflight]);
}

/**
 * Alert the admins about a newly paid order — at most once per order. The
 * pending→paid UPDATE in markOrderPaid already lets only one of the PayU
 * return / webhook / reconcile paths through; the key below also covers
 * any other caller (and Upstash makes it hold across machines).
 */
export async function notifyOrderPaid(db: DbClient, orderId: string): Promise<PushSendSummary | null> {
  try {
    if (!getVapidConfig()) return null;
    let first = true;
    try {
      first = await markProcessedOnce(`admin-push:order-paid:${orderId}`, ORDER_ONCE_TTL_SECONDS);
    } catch (err) {
      // Better a rare duplicate than a missed order alert.
      log("warn", "admin_push_once_guard_failed", { orderId, error: (err as Error).message });
    }
    if (!first) {
      log("info", "admin_push_order_duplicate_skipped", { orderId });
      return null;
    }
    const order = await db.query.orders.findFirst({
      where: eq(orders.id, orderId),
      columns: {
        id: true,
        orderNumber: true,
        customerName: true,
        paymentMethod: true,
        total: true,
        advancePaid: true,
      },
      with: { items: { columns: { productName: true }, orderBy: (oi) => [asc(oi.id)] } },
    });
    if (!order) {
      log("warn", "admin_push_order_not_found", { orderId });
      return null;
    }
    return await sendToAdmins(
      db,
      "order",
      buildOrderPushPayload({
        id: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        paymentMethod: order.paymentMethod,
        total: Number(order.total),
        advancePaid: Number(order.advancePaid),
        items: order.items,
      }),
    );
  } catch (err) {
    log("error", "admin_push_order_failed", { orderId, error: (err as Error).message });
    return null;
  }
}

/** Fire-and-forget wrapper: returns immediately, so payment handling never waits. */
export function queueOrderPaidPush(db: DbClient, orderId: string): void {
  track(notifyOrderPaid(db, orderId));
}

/** Alert the admins about a newly stored phone lead. Never throws. */
export async function notifyNewLead(
  db: DbClient,
  lead: { id: number | string; phone: string; pagePath: string | null },
): Promise<PushSendSummary | null> {
  try {
    if (!getVapidConfig()) return null;
    return await sendToAdmins(db, "lead", buildLeadPushPayload(lead));
  } catch (err) {
    log("error", "admin_push_lead_failed", { error: (err as Error).message });
    return null;
  }
}

/** Fire-and-forget wrapper used right after the phone_leads insert. */
export function queueLeadPush(db: DbClient, lead: { id: number | string; phone: string; pagePath: string | null }): void {
  track(notifyNewLead(db, lead));
}
