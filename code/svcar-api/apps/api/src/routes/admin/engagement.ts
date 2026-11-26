import { Hono } from "hono";
import { desc, eq, gte, sql } from "drizzle-orm";
import type { DbClient } from "../../db/client.js";
import { carts, subscribers, whatsappLeads } from "../../db/schema.js";
import { makeRequireAdmin } from "../../middleware/auth.js";
import { logAudit } from "../../lib/audit.js";
import type { AppEnv } from "../../lib/types.js";

/** Subscriber ids are uuids; reject anything else before it reaches the query. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Admin engagement endpoints: Leads (customer carts), Live (recently-active
 * shoppers) and Subscribers (newsletter). Leads/Live read real signed-in
 * customer carts; true realtime presence (heartbeat/WebSocket) isn't wired yet,
 * so "Live" approximates presence with carts touched in the last few minutes.
 */

async function fetchActiveCarts(db: DbClient, sinceMs?: number) {
  const rows = await db.query.carts.findMany({
    where: sinceMs ? gte(carts.updatedAt, new Date(Date.now() - sinceMs)) : undefined,
    with: {
      user: true,
      items: {
        orderBy: (ci, { asc }) => [asc(ci.addedAt)],
        with: {
          sku: {
            with: {
              product: {
                with: { images: { orderBy: (img, { asc }) => [asc(img.sortOrder)] } },
              },
            },
          },
        },
      },
    },
    orderBy: (c, { desc: d }) => [d(c.updatedAt)],
  });
  return rows.filter((c) => c.items.length > 0);
}

type ActiveCart = Awaited<ReturnType<typeof fetchActiveCarts>>[number];

function toLead(cart: ActiveCart) {
  const items = cart.items.map((ci) => {
    const sku = ci.sku;
    const product = sku.product;
    const unitPrice = Number(sku.salePrice ?? sku.price);
    const dv = sku.dimensionValues ?? {};
    const variantLabel = Object.keys(dv).length ? Object.values(dv).join(" / ") : "";
    return {
      productId: product.id,
      productName: product.name,
      slug: product.slug,
      image: product.images[0]?.url ?? "",
      variantLabel,
      qty: ci.qty,
      unitPrice,
      lineTotal: unitPrice * ci.qty,
      addedAt: ci.addedAt.toISOString(),
    };
  });
  const total = items.reduce((s, i) => s + i.lineTotal, 0);
  const itemCount = items.reduce((s, i) => s + i.qty, 0);
  const oldestAddedAt = items.reduce(
    (min, i) => (i.addedAt < min ? i.addedAt : min),
    cart.updatedAt.toISOString(),
  );
  return {
    id: cart.id,
    customerName: cart.user?.name ?? "",
    customerEmail: cart.user?.email ?? "",
    customerPhone: cart.user?.phone ?? "",
    isGuest: false,
    itemCount,
    total,
    updatedAt: cart.updatedAt.toISOString(),
    oldestAddedAt,
    items,
  };
}

/** GET /admin/leads — every signed-in customer's current cart. */
export function makeAdminLeadsRouter(db: DbClient) {
  const router = new Hono<AppEnv>();
  router.use("*", makeRequireAdmin(db));
  router.get("/", async (c) => {
    const list = (await fetchActiveCarts(db)).map(toLead);
    return c.json({
      items: list,
      total: list.length,
      totalValue: list.reduce((s, l) => s + l.total, 0),
    });
  });

  /** DELETE /admin/leads/:id — drop one cart from the Leads list.
   *
   *  This empties a real customer's cart (cart_items cascade from the row), so
   *  it is audited. It exists so the owner can clear their own test/demo carts
   *  out of the list rather than reading around them.
   */
  router.delete("/:id", async (c) => {
    const id = c.req.param("id");
    if (!UUID_RE.test(id)) return c.json({ error: "Invalid id" }, 400);

    const [deleted] = await db.delete(carts).where(eq(carts.id, id)).returning({
      id: carts.id,
      userId: carts.userId,
    });
    if (!deleted) return c.json({ error: "Not Found" }, 404);

    await logAudit(db, {
      actorUserId: c.get("adminUserId") ?? null,
      action: "lead.delete",
      resourceType: "cart",
      resourceId: id,
      changes: { before: { userId: deleted.userId } },
    });
    return c.body(null, 204);
  });

  return router;
}

/**
 * GET /admin/live — who is on the storefront right now.
 *
 * This reads `analytics_events`, the page-view stream the storefront's
 * AnalyticsTracker writes on every route change. That is actual presence: it
 * includes signed-out visitors (the overwhelming majority of real traffic) and
 * it knows which page each one is looking at.
 *
 * It previously derived "live" from the `carts` table instead. Because a cart
 * row only exists for a SIGNED-IN user, and the query further required the cart
 * to be non-empty, the page could only ever show someone who had logged in AND
 * added an item within the window — so it read "No one browsing right now"
 * almost permanently. `currentPath` and `isGuest` were hard-coded to "" and
 * false, which is why the "what page they're on" line was always blank.
 *
 * Cart contents deliberately do NOT appear here any more: `analytics_events`
 * carries no user id, so a visitor cannot be correlated to a cart without
 * inventing a link. Carts have their own page (/admin/leads), which shows them
 * accurately.
 */
const ONLINE_WINDOW = "5 minutes";
const SESSION_WINDOW = "6 hours";

export function makeAdminLiveRouter(db: DbClient) {
  const router = new Hono<AppEnv>();
  router.use("*", makeRequireAdmin(db));
  router.get("/", async (c) => {
    // `distinct on (visitor_id) … order by created_at desc` picks each visitor's
    // most recent page view — that is the page they are on now. The second CTE
    // looks further back so "on site for X" reflects the whole visit, not just
    // the online window.
    const raw = await db.execute(sql`
      with current_page as (
        select distinct on (visitor_id)
               visitor_id, session_id, path, created_at, city, device_type, channel
        from analytics_events
        where created_at >= now() - interval '${sql.raw(ONLINE_WINDOW)}'
        order by visitor_id, created_at desc
      ),
      visit as (
        select visitor_id, min(created_at) as started_at, count(*)::int as page_views
        from analytics_events
        where created_at >= now() - interval '${sql.raw(SESSION_WINDOW)}'
        group by visitor_id
      )
      select c.visitor_id, c.session_id, c.path, c.created_at, c.city,
             c.device_type, c.channel, v.started_at, v.page_views
      from current_page c
      join visit v on v.visitor_id = c.visitor_id
      order by c.created_at desc
      limit 200`);

    const rows = (Array.isArray(raw) ? raw : (raw as { rows?: unknown[] }).rows ?? []) as {
      visitor_id: string;
      session_id: string;
      path: string;
      created_at: string | Date;
      city: string | null;
      device_type: string | null;
      channel: string | null;
      started_at: string | Date;
      page_views: number;
    }[];

    const iso = (v: string | Date) => (v instanceof Date ? v : new Date(v)).toISOString();

    const items = rows.map((r) => ({
      id: r.visitor_id,
      sessionId: r.session_id,
      currentPath: r.path,
      startedAt: iso(r.started_at),
      lastSeen: iso(r.created_at),
      pageViews: Number(r.page_views),
      city: r.city ?? "",
      deviceType: r.device_type ?? "",
      channel: r.channel ?? "",
    }));

    return c.json({ items, onlineCount: items.length });
  });
  return router;
}

/** GET /admin/whatsapp-leads — WhatsApp CTA intent clicks, newest first. */
export function makeAdminWhatsappLeadsRouter(db: DbClient) {
  const router = new Hono<AppEnv>();
  router.use("*", makeRequireAdmin(db));
  router.get("/", async (c) => {
    const rows = await db
      .select()
      .from(whatsappLeads)
      .orderBy(desc(whatsappLeads.createdAt))
      .limit(200);
    const [{ count } = { count: 0 }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(whatsappLeads);
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const items = rows.map((r) => ({
      id: r.id,
      path: r.path,
      source: r.source,
      productId: r.productId ?? null,
      productName: r.productName ?? "",
      city: r.city ?? "",
      country: r.country ?? "",
      createdAt: r.createdAt.toISOString(),
    }));
    return c.json({
      items,
      total: Number(count),
      todayCount: items.filter((i) => new Date(i.createdAt) >= dayAgo).length,
    });
  });

  /** DELETE /admin/whatsapp-leads/:id — drop a single CTA click.
   *  These are raw intent events, so the owner clears out their own test
   *  clicks and obvious noise rather than reading around them. */
  router.delete("/:id", async (c) => {
    const id = c.req.param("id");
    if (!UUID_RE.test(id)) return c.json({ error: "Invalid id" }, 400);

    const [deleted] = await db
      .delete(whatsappLeads)
      .where(eq(whatsappLeads.id, id))
      .returning({ id: whatsappLeads.id });
    if (!deleted) return c.json({ error: "Not Found" }, 404);
    await logAudit(db, {
      actorUserId: c.get("adminUserId") ?? null,
      action: "whatsapp_lead.delete",
      resourceType: "whatsapp_lead",
      resourceId: id,
    });
    return c.body(null, 204);
  });

  return router;
}

/** GET /admin/subscribers — newsletter signups. */
export function makeAdminSubscribersRouter(db: DbClient) {
  const router = new Hono<AppEnv>();
  router.use("*", makeRequireAdmin(db));
  router.get("/", async (c) => {
    const rows = await db.select().from(subscribers).orderBy(desc(subscribers.subscribedAt));
    const items = rows.map((s) => ({
      id: s.id,
      email: s.email,
      name: s.name ?? "",
      phone: s.phone ?? "",
      source: s.source,
      status: s.status === "unsubscribed" ? "unsubscribed" : "active",
      subscribedAt: s.subscribedAt.toISOString(),
    }));
    return c.json({
      items,
      total: items.length,
      activeCount: items.filter((s) => s.status === "active").length,
    });
  });

  /** DELETE /admin/subscribers/:id — remove a sign-up outright.
   *  Unsubscribing keeps the row so a later re-subscribe is auditable; this is
   *  for rows the owner wants gone entirely (test entries, spam sign-ups). */
  router.delete("/:id", async (c) => {
    const id = c.req.param("id");
    if (!UUID_RE.test(id)) return c.json({ error: "Invalid id" }, 400);

    const [deleted] = await db.delete(subscribers).where(eq(subscribers.id, id)).returning({
      id: subscribers.id,
      email: subscribers.email,
    });
    if (!deleted) return c.json({ error: "Not Found" }, 404);
    await logAudit(db, {
      actorUserId: c.get("adminUserId") ?? null,
      action: "subscriber.delete",
      resourceType: "subscriber",
      resourceId: id,
      changes: { before: { email: deleted.email } },
    });
    return c.body(null, 204);
  });

  return router;
}
