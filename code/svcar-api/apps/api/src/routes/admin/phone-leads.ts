import { Hono } from "hono";
import { sql } from "drizzle-orm";
import type { AdminPhoneLead, AdminPhoneLeadList, PhoneLeadSource } from "@svcar/contracts";
import type { DbClient } from "../../db/client.js";
import { makeRequireAdmin } from "../../middleware/auth.js";
import type { AppEnv } from "../../lib/types.js";

/**
 * GET /admin/phone-leads — every phone number the store has, in one list:
 * numbers typed into the storefront popup (phone_leads) and numbers on orders
 * (orders.customer_phone), grouped by the 10-digit mobile so one person who did
 * both shows as one row. Newest activity first.
 *
 * Postgres groups each source per number; the two are merged here (a pure
 * function, unit-tested). Grouping keeps the merge exact, since every number
 * arrives with its full counts and latest details.
 */

/** Rows returned to the admin page. */
export const PHONE_LEADS_LIMIT = 500;
/** Safety cap on each per-source grouped query; far above today's volume. */
export const PHONE_LEADS_SOURCE_CAP = 5000;

/** Grouping key: the last 10 digits, matching the SQL below ("+91 98765 43210" → "9876543210"). */
export function phoneKey(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "").slice(-10);
}

/** SQL twin of phoneKey(). */
const key = (col: string) => sql.raw(`right(regexp_replace(coalesce(${col}, ''), '[^0-9]', '', 'g'), 10)`);

export interface PopupGroupRow {
  phone: string;
  popup_count: number | string;
  last_popup_at: string | Date;
  last_popup_page: string | null;
}

export interface OrderGroupRow {
  phone: string;
  order_count: number | string;
  last_order_at: string | Date;
  name: string | null;
  latest_order_id: string;
  latest_order_number: string;
  latest_status: string;
  latest_payment_status: string | null;
  latest_total: number | string;
}

const iso = (v: string | Date) => (v instanceof Date ? v : new Date(v)).toISOString();

/** Merge the per-source groups into one row per number, newest activity first. */
export function mergePhoneLeads(
  popupRows: PopupGroupRow[],
  orderRows: OrderGroupRow[],
  limit = PHONE_LEADS_LIMIT,
): AdminPhoneLeadList {
  const byPhone = new Map<string, AdminPhoneLead>();
  const row = (phone: string): AdminPhoneLead => {
    let r = byPhone.get(phone);
    if (!r) {
      r = { phone, name: null, sources: [], lastActivityAt: new Date(0).toISOString(), popup: null, order: null };
      byPhone.set(phone, r);
    }
    return r;
  };
  const touch = (r: AdminPhoneLead, source: PhoneLeadSource, at: string) => {
    if (!r.sources.includes(source)) r.sources.push(source);
    if (at > r.lastActivityAt) r.lastActivityAt = at;
  };

  for (const p of popupRows) {
    const phone = phoneKey(p.phone);
    if (!phone) continue;
    const r = row(phone);
    const lastAt = iso(p.last_popup_at);
    // Rows are already one per number; this only matters if two raw spellings
    // of one number reach us, in which case their counts add up.
    const prev = r.popup;
    r.popup = {
      count: (prev?.count ?? 0) + Number(p.popup_count),
      lastAt: prev && prev.lastAt > lastAt ? prev.lastAt : lastAt,
      lastPagePath: prev && prev.lastAt > lastAt ? prev.lastPagePath : (p.last_popup_page ?? null),
    };
    touch(r, "popup", lastAt);
  }

  for (const o of orderRows) {
    const phone = phoneKey(o.phone);
    if (!phone) continue;
    const r = row(phone);
    const latestAt = iso(o.last_order_at);
    const prev = r.order;
    const newer = !prev || latestAt >= prev.latestAt;
    r.order = {
      count: (prev?.count ?? 0) + Number(o.order_count),
      latestOrderId: newer ? String(o.latest_order_id) : prev!.latestOrderId,
      latestOrderNumber: newer ? o.latest_order_number : prev!.latestOrderNumber,
      latestStatus: newer ? o.latest_status : prev!.latestStatus,
      latestPaymentStatus: newer ? (o.latest_payment_status ?? null) : prev!.latestPaymentStatus,
      latestTotal: newer ? Number(o.latest_total) : prev!.latestTotal,
      latestAt: newer ? latestAt : prev!.latestAt,
    };
    if (newer) r.name = o.name?.trim() || r.name;
    touch(r, "order", latestAt);
  }

  const all = [...byPhone.values()]
    .map((r) => ({ ...r, sources: (["popup", "order"] as const).filter((s) => r.sources.includes(s)) }))
    .sort((a, b) => (a.lastActivityAt < b.lastActivityAt ? 1 : a.lastActivityAt > b.lastActivityAt ? -1 : 0));

  return {
    items: all.slice(0, limit),
    totals: {
      phones: all.length,
      popupPhones: all.filter((r) => r.popup).length,
      orderPhones: all.filter((r) => r.order).length,
      bothPhones: all.filter((r) => r.popup && r.order).length,
      popupSubmissions: all.reduce((s, r) => s + (r.popup?.count ?? 0), 0),
      orders: all.reduce((s, r) => s + (r.order?.count ?? 0), 0),
    },
    limit,
    truncated: all.length > limit,
  };
}

export function makeAdminPhoneLeadsRouter(db: DbClient) {
  const router = new Hono<AppEnv>();
  router.use("*", makeRequireAdmin(db));

  router.get("/", async (c) => {
    const exec = async <T>(q: ReturnType<typeof sql>): Promise<T[]> => {
      const r = await db.execute(q);
      return (Array.isArray(r) ? r : ((r as { rows?: T[] }).rows ?? [])) as T[];
    };

    const [popupRows, orderRows] = await Promise.all([
      exec<PopupGroupRow>(sql`
        select ${key("phone")} as phone,
               count(*)::int as popup_count,
               max(created_at) as last_popup_at,
               (array_agg(page_path order by created_at desc))[1] as last_popup_page
        from phone_leads
        group by 1
        order by max(created_at) desc
        limit ${PHONE_LEADS_SOURCE_CAP}`),
      exec<OrderGroupRow>(sql`
        select ${key("customer_phone")} as phone,
               count(*)::int as order_count,
               max(created_at) as last_order_at,
               (array_agg(customer_name order by created_at desc))[1] as name,
               (array_agg(id::text order by created_at desc))[1] as latest_order_id,
               (array_agg(order_number order by created_at desc))[1] as latest_order_number,
               (array_agg(status::text order by created_at desc))[1] as latest_status,
               (array_agg(payment_status order by created_at desc))[1] as latest_payment_status,
               (array_agg(total order by created_at desc))[1] as latest_total
        from orders
        where ${key("customer_phone")} <> ''
        group by 1
        order by max(created_at) desc
        limit ${PHONE_LEADS_SOURCE_CAP}`),
    ]);

    const list = mergePhoneLeads(popupRows, orderRows);
    // A source that hit its cap means older numbers were left out of the merge.
    if (popupRows.length >= PHONE_LEADS_SOURCE_CAP || orderRows.length >= PHONE_LEADS_SOURCE_CAP) {
      list.truncated = true;
    }
    return c.json(list);
  });

  return router;
}
